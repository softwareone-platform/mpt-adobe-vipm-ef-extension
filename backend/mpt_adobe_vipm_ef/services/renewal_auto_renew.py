"""Per-SKU auto-renewal support gate for the at-anniversary renewal plan.

The at-anniversary path works entirely through Adobe's auto-renewal
preferences, so a SKU that cannot auto-renew cannot take that path at all: it
is routed out of the plan rather than carried with its Renew toggle off. The
hand-curated ``auto_renew_supported`` column of the Airtable SKU mapping is the
only source of that flag — it cannot be derived from Adobe data — so the wizard
reads it to route the customer and the renewal endpoints re-check it, keeping an
unsupported SKU out of any order.
"""

import asyncio
import logging
from collections.abc import Callable
from typing import cast

from mpt_extension_sdk.api import (
    APIContext,
    ErrorDetail,
    UpstreamServiceError,
    ValidationError,
)
from requests import RequestException

from mpt_adobe_vipm_ef.models.renewal import NetNewItemSelection
from mpt_adobe_vipm_ef.services.items import get_partial_sku
from mpt_adobe_vipm_ef.services.renewal_plan import PlanSubscription
from mpt_adobe_vipm_ef.services.sku_mapping import SkuMappingStore
from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)


async def load_auto_renew_support(
    ctx: APIContext, partial_skus: list[str], market_segment: str
) -> dict[str, bool]:
    """Load each SKU's auto-renewal support from Airtable, mapping failures to 502.

    A SKU absent from the result has no mapping row and counts as unsupported
    at the call site: the flag is hand-curated, so an unmapped SKU is
    unverified rather than permitted.
    """
    store = SkuMappingStore.from_settings(cast(ExtensionSettings, ctx.ext_settings))
    try:
        return await asyncio.to_thread(
            store.list_auto_renew_supported, partial_skus, market_segment
        )
    except RequestException as error:
        logger.warning("SKU mapping store request failed: %s", error)
        raise UpstreamServiceError(detail="SKU mapping data store request failed")


async def check_renewal_plan_auto_renew_support(
    ctx: APIContext,
    resolve_market_segment: Callable[[], str],
    plan_subscriptions: list[PlanSubscription],
    net_new_items: list[NetNewItemSelection],
) -> None:
    """Reject a plan carrying a SKU that cannot renew at the anniversary.

    Only the SKUs the plan schedules for the anniversary are checked: the
    renewing subscriptions and the net-new additions. A lapsing subscription
    needs no auto-renewal, and a plan that schedules nothing skips the lookup
    altogether, which is why the market segment is resolved lazily. The net-new
    additions are taken as requested rather than as resolved catalog lines, so
    every route can run this before it resolves anything.
    """
    renewing_skus = {
        get_partial_sku(plan.selection.offer_id)
        for plan in plan_subscriptions
        if plan.selection.renew
    }
    net_new_skus = {get_partial_sku(net_new.offer_id) for net_new in net_new_items}
    scheduled_skus = renewing_skus | net_new_skus
    if not scheduled_skus:
        return
    support = await load_auto_renew_support(ctx, sorted(scheduled_skus), resolve_market_segment())
    _require_auto_renew_support(support, renewing_skus, net_new_skus)


def _require_auto_renew_support(
    support: dict[str, bool], renewing_skus: set[str], net_new_skus: set[str]
) -> None:
    """Raise :class:`ValidationError` carrying one error per unsupported SKU."""
    unsupported_renewing = _unsupported(renewing_skus, support)
    unsupported_net_new = _unsupported(net_new_skus, support)
    if not (unsupported_renewing or unsupported_net_new):
        return
    logger.warning(
        "Renewal plan carries SKUs without auto-renewal support: renewing=%s net-new=%s",
        unsupported_renewing,
        unsupported_net_new,
    )
    raise ValidationError(
        detail=(
            "The renewal plan includes products that cannot renew at the anniversary date. "
            "Remove them from the plan to continue."
        ),
        errors=[
            *_unsupported_errors("#/subscriptions", unsupported_renewing),
            *_unsupported_errors("#/netNewItems", unsupported_net_new),
        ],
    )


def _unsupported(skus: set[str], support: dict[str, bool]) -> list[str]:
    return sorted(sku for sku in skus if not support.get(sku))


def _unsupported_errors(pointer: str, skus: list[str]) -> list[ErrorDetail]:
    return [
        ErrorDetail(
            pointer=pointer,
            detail=f"Product {sku} does not support renewal at the anniversary date.",
        )
        for sku in skus
    ]
