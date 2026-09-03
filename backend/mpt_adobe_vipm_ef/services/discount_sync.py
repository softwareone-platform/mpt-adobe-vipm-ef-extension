"""Scheduled synchronization of the open Adobe flexible discount catalogue.

The schedule walks the platform's catalog authorizations of the extension's
products (each one maps to an Adobe credential set in the authorizations
file), derives the storefront country from the authorization owner's address,
resolves the Adobe region that country belongs to, and mirrors the open
``GET /v3/flex-discounts`` listing of every market segment of every country of
that region into the Airtable discount store. Regions already walked are
remembered for the run so they are never synchronized twice. Open rows are keyed by
``(code, market_segment)`` and owned by this sync (``source = "API"``); the
enrichment fields stay untouched for operations to curate.

Every run closes with an expiry review of the stored open rows: a code whose
usable window has passed is retired (``retired_at`` stamped with the run time),
and conversely a row Adobe reports as usable again is un-retired while it is
upserted. Closed (``Ops/Vendor``) rows are never touched: their retirement is
the discount management API's soft delete.
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
    is_expired,
    open_discount_values,
    record_code,
)
from mpt_adobe_vipm_ef.services.discounts import DiscountStore
from mpt_adobe_vipm_ef.services.regions import region_countries, region_of_country
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
    region: str | None = None


async def sync_open_discounts(ctx: ScheduleContext) -> None:  # noqa: WPS210
    """Mirror the open Adobe flex-discount catalogue into the Airtable store.

    A failing (authorization, country, segment) pair is logged and skipped so the rest
    of the catalogue still synchronizes; the task fails at the end when any
    pair could not be synchronized. The mirroring is followed by the expiry
    review of the stored open rows, which runs whatever the mirroring outcome.
    """
    settings = cast(ExtensionSettings, ctx.ext_settings)
    store = DiscountStore.from_settings(settings)
    targets = await _collect_sync_targets(ctx, settings)
    failed_pairs: list[str] = []
    if targets:
        failed_pairs = await _sync_targets(ctx, store, get_adobe_client(), targets)
    else:
        ctx.logger.warning("Open discount sync found no synchronizable authorizations")
    # The expiry review runs last so it reads the dates this run just refreshed,
    # and runs even without targets: retiring stale rows needs no Adobe call.
    retire_error = await _retire_expired_open_codes(ctx, store)
    if failed_pairs:
        failed_summary = ", ".join(failed_pairs)
        failed_count = len(failed_pairs)
        raise FailError(
            f"Open discount sync failed for {failed_count} "
            f"authorization/country/segment pairs: {failed_summary}"
        )
    if retire_error is not None:
        raise FailError(f"Open discount sync could not retire the expired codes: {retire_error}")


async def _retire_expired_open_codes(
    ctx: ScheduleContext, store: DiscountStore
) -> HTTPError | None:
    """Retire the stored open codes whose usable window has passed.

    Reviews every non-retired open row, not only the ones Adobe reported this
    run: a code Adobe has dropped from the open catalogue must be retired too.
    Returns the Airtable error that stopped the review, or None on success.
    """
    now = dt.datetime.now(tz=dt.UTC)
    try:
        retired_codes = await asyncio.to_thread(_retire_expired_records, store, now)
    except HTTPError as error:
        ctx.logger.warning("Open discount expiry review failed: %s", error)
        return error
    ctx.logger.info(
        "Retired %s expired open discount codes: %s",
        len(retired_codes),
        ", ".join(retired_codes) or "none",
    )
    return None


def _retire_expired_records(store: DiscountStore, now: dt.datetime) -> list[str]:
    """Stamp ``now`` on the open rows out of their window, returning their codes."""
    expired = [record for record in store.list_open_codes() if is_expired(record["fields"], now)]
    store.retire_codes([record["id"] for record in expired], now.isoformat())
    return [record_code(record) for record in expired]


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
            failed_pairs.append(f"{target.authorization_id}/{target.country}/{segment}")
            ctx.logger.warning(
                "Open discount sync failed for authorization %s segment %s country %s: %s",
                target.authorization_id,
                segment,
                target.country,
                error,
            )
        else:
            ctx.logger.info(
                "Synchronized %s open discounts for authorization %s segment %s "
                "country %s region %s",
                synced,
                target.authorization_id,
                segment,
                target.country,
                target.region,
            )
        await ctx.task.progress(position / len(pairs) * _FULL_PROGRESS)  # noqa: WPS476
    return failed_pairs


async def _collect_sync_targets(
    ctx: ScheduleContext, settings: ExtensionSettings
) -> list[SyncTarget]:
    """List the (authorization, country) pairs the sync can serve.

    Authorizations without Adobe credentials in the authorizations file or
    without an owner country are skipped. The owner country only selects the
    Adobe region: the region's whole country list is synchronized with that
    authorization's credentials, and the regions already expanded during the
    run are remembered so a second authorization of the same region is skipped.
    """
    targets: list[SyncTarget] = []
    synced_regions: set[str] = set()
    async for authorization in _authorizations_query(ctx, settings).iterate():
        owner_target = _build_sync_target(ctx, settings, authorization)
        if owner_target is None:
            continue
        targets.extend(_region_targets(ctx, owner_target, synced_regions))
    return targets


def _region_targets(
    ctx: ScheduleContext, owner_target: SyncTarget, synced_regions: set[str]
) -> list[SyncTarget]:
    """Expand an authorization into one target per country of its Adobe region.

    ``synced_regions`` accumulates the regions expanded so far in the run: an
    authorization whose region is already there yields no target at all.
    """
    region = region_of_country(owner_target.country)
    if region is None:
        ctx.logger.warning(
            "Authorization %s country %s belongs to no Adobe region: "
            "synchronizing that country only",
            owner_target.authorization_id,
            owner_target.country,
        )
        return [owner_target]
    if region in synced_regions:
        ctx.logger.info(
            "Skipping authorization %s: its region %s is already synchronized",
            owner_target.authorization_id,
            region,
        )
        return []
    synced_regions.add(region)
    return [
        SyncTarget(authorization_id=owner_target.authorization_id, country=country, region=region)
        for country in region_countries(region)
    ]


def _authorizations_query(ctx: ScheduleContext, settings: ExtensionSettings) -> Any:
    """Build the catalog authorizations query of the extension's products."""
    product_filter = RQLQuery().n("product.id").in_(list(settings.product_ids))
    catalog = ctx.mpt_api_service.client.catalog
    return catalog.authorizations.filter(product_filter).select("owner")


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
        store.update_code(existing["id"], build_open_update_fields(discount, now, existing))
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
