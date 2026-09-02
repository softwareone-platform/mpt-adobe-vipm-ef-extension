"""Scheduled synchronization of the open Adobe flexible discount catalogue.

The schedule walks the platform's catalog authorizations of the extension's
products (each one maps to an Adobe credential set in the authorizations
file), derives the storefront country from the authorization owner's address,
and mirrors the open ``GET /v3/flex-discounts`` listing of every market
segment into the Airtable discount store. Open rows are keyed by
``(code, market_segment)`` and owned by this sync (``source = "API"``); the
enrichment fields stay untouched for operations to curate.
"""

import asyncio
import datetime as dt
import logging
from dataclasses import dataclass
from typing import Any, cast

from mpt_api_client import RQLQuery
from mpt_extension_sdk.errors.pipeline import FailError
from mpt_extension_sdk.pipeline import ScheduleContext
from requests import HTTPError

from adobe.client import AdobeClient, get_adobe_client
from adobe.errors import AdobeError, AuthorizationNotFoundError
from mpt_adobe_vipm_ef.services.discount_mapping import (
    build_open_code_fields,
    build_open_update_fields,
    build_value_fields,
    is_closed,
    open_discount_values,
)
from mpt_adobe_vipm_ef.services.discounts import DiscountStore
from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)

# Adobe publishes the open catalogue per market segment; GOV_LGA has no
# open discounts, so the sync only walks the three public segments.
OPEN_SYNC_MARKET_SEGMENTS = ("COM", "EDU", "GOV")

_FULL_PROGRESS = 100


@dataclass(frozen=True)
class SyncTarget:
    """One platform authorization and storefront country to synchronize."""

    authorization_id: str
    country: str


async def sync_open_discounts(ctx: ScheduleContext) -> None:  # noqa: WPS210
    """Mirror the open Adobe flex-discount catalogue into the Airtable store.

    A failing (authorization, segment) pair is logged and skipped so the rest
    of the catalogue still synchronizes; the task fails at the end when any
    pair could not be synchronized.
    """
    settings = cast(ExtensionSettings, ctx.ext_settings)
    store = DiscountStore.from_settings(settings)
    targets = await _collect_sync_targets(ctx, settings)
    if not targets:
        ctx.logger.warning("Open discount sync found no synchronizable authorizations")
        return
    failed_pairs = await _sync_targets(ctx, store, get_adobe_client(), targets)
    if failed_pairs:
        failed_summary = ", ".join(failed_pairs)
        failed_count = len(failed_pairs)
        raise FailError(
            f"Open discount sync failed for {failed_count} "
            f"authorization/segment pairs: {failed_summary}"
        )


async def _sync_targets(  # noqa: WPS210
    ctx: ScheduleContext,
    store: DiscountStore,
    adobe_client: AdobeClient,
    targets: list[SyncTarget],
) -> list[str]:
    """Synchronize every (target, segment) pair, returning the failed ones."""
    pairs = [(target, segment) for target in targets for segment in OPEN_SYNC_MARKET_SEGMENTS]
    failed_pairs = []
    for position, (target, segment) in enumerate(pairs, start=1):
        try:
            # Pairs are synchronized sequentially on purpose: one Adobe/Airtable
            # worker thread at a time keeps the sync inside both rate limits.
            synced = await asyncio.to_thread(  # noqa: WPS476
                _sync_target_segment, store, adobe_client, target, segment
            )
        except (AdobeError, HTTPError) as error:
            failed_pairs.append(f"{target.authorization_id}/{segment}")
            ctx.logger.warning(
                "Open discount sync failed for authorization %s segment %s country %s: %s",
                target.authorization_id,
                segment,
                target.country,
                error,
            )
        else:
            ctx.logger.info(
                "Synchronized %s open discounts for authorization %s segment %s country %s",
                synced,
                target.authorization_id,
                segment,
                target.country,
            )
        await ctx.task.progress(position / len(pairs) * _FULL_PROGRESS)  # noqa: WPS476
    return failed_pairs


async def _collect_sync_targets(
    ctx: ScheduleContext, settings: ExtensionSettings
) -> list[SyncTarget]:
    """List the platform authorizations the sync can serve, one per country.

    Authorizations without Adobe credentials in the authorizations file or
    without an owner country are skipped; authorizations sharing the same
    Adobe credential set and country are deduplicated.
    """
    targets: list[SyncTarget] = []
    seen_credentials = set()
    async for authorization in _authorizations_query(ctx, settings).iterate():
        target = _build_sync_target(ctx, settings, authorization)
        if target is None:
            continue
        credentials_key = _credentials_key(settings, target)
        if credentials_key in seen_credentials:
            continue
        seen_credentials.add(credentials_key)
        targets.append(target)
    return targets


def _authorizations_query(ctx: ScheduleContext, settings: ExtensionSettings) -> Any:
    """Build the catalog authorizations query of the extension's products."""
    product_filter = RQLQuery().n("product.id").in_(list(settings.product_ids))
    catalog = ctx.mpt_api_service.client.catalog
    return catalog.authorizations.filter(product_filter).select("owner")


def _credentials_key(settings: ExtensionSettings, target: SyncTarget) -> tuple[str, str]:
    """Key a target by its Adobe credential set and country for deduplication."""
    adobe_authorization = settings.get_authorization(target.authorization_id)
    return (adobe_authorization.client_id, target.country)


def _build_sync_target(
    ctx: ScheduleContext, settings: ExtensionSettings, authorization: Any
) -> SyncTarget | None:
    """Build the sync target of a platform authorization, or None to skip it."""
    country = _owner_country(authorization)
    if not country:
        ctx.logger.warning(
            "Skipping authorization %s: its owner has no address country", authorization.id
        )
        return None
    try:
        settings.get_authorization(authorization.id)
    except AuthorizationNotFoundError:
        ctx.logger.warning(
            "Skipping authorization %s: no Adobe credentials configured", authorization.id
        )
        return None
    return SyncTarget(authorization_id=authorization.id, country=country)


def _owner_country(authorization: Any) -> str | None:
    """Read the owner's address country of a platform authorization."""
    address = getattr(getattr(authorization, "owner", None), "address", None)
    country = getattr(address, "country", None)
    return country if isinstance(country, str) and country else None


def _sync_target_segment(
    store: DiscountStore, adobe_client: AdobeClient, target: SyncTarget, market_segment: str
) -> int:
    """Fetch one segment's open discounts and upsert them, returning the count."""
    discounts = adobe_client.discount.list_flex_discounts(
        target.authorization_id, market_segment, target.country
    )
    synced = 0
    for discount in discounts:
        if _upsert_open_discount(store, discount, market_segment):
            synced += 1
    return synced


def _upsert_open_discount(
    store: DiscountStore, discount: dict[str, Any], market_segment: str
) -> bool:
    """Upsert one open discount row and its per-country values."""
    code = str(discount.get("code") or "")
    if not code:
        logger.warning("Skipping an Adobe flex discount without code: %s", discount.get("id"))
        return False
    now = dt.datetime.now(tz=dt.UTC)
    existing = store.find_code(code, market_segment)
    if existing is None:
        store.create_code(build_open_code_fields(discount, market_segment, now))
    elif is_closed(existing):
        logger.warning(
            "Skipping Adobe flex discount %s: a closed code %s already exists in segment %s",
            discount.get("id"),
            code,
            market_segment,
        )
        return False
    else:
        store.update_code(existing["id"], build_open_update_fields(discount, now))
    for entry in open_discount_values(discount):
        store.replace_country_value(
            code,
            market_segment,
            entry["country"],
            build_value_fields(
                code, market_segment, entry["country"], entry["currency"], entry["value"]
            ),
        )
    return True
