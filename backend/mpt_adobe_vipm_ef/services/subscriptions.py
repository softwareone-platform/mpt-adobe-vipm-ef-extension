import logging
from typing import Any

from mpt_api_client import RQLQuery
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api import UpstreamServiceError
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.services.items import get_partial_sku
from mpt_adobe_vipm_ef.services.switch_order import ExistingTargetLine

logger = logging.getLogger(__name__)

# Subscriptions whose lines can absorb a switch: live ones, including those with
# an in-flight change order (the platform still tops up their agreement line).
_TARGETABLE_STATUSES = ("Active", "Updating")


def _subscriptions_query(ctx: APIContext, agreement_id: str) -> Any:
    """Build the query for the agreement's live subscriptions, lines included."""
    targetable_statuses: list[Any] = list(_TARGETABLE_STATUSES)
    agreement_filter = RQLQuery().n("agreement.id").eq(agreement_id)
    status_filter = RQLQuery().n("status").in_(targetable_statuses)
    subscriptions = ctx.mpt_api_service.client.commerce.subscriptions
    return subscriptions.filter(agreement_filter & status_filter).select("lines", "audit")


async def fetch_agreement_subscriptions_by_sku(
    ctx: APIContext, agreement_id: str, source_vendor_subscription_id: str
) -> dict[str, dict[str, Any]]:
    """Map each vendor SKU held on the agreement to the subscription holding it.

    Returns ``{vendor_sku: {"id", "name", "status", "quantity", "lineId",
    "commitmentDate", "terms", "audit"}}`` built from the lines of the
    agreement's live subscriptions, excluding the switch source subscription
    itself (identified by its Adobe/vendor id). The renewal date, terms and
    audit trail are what the wizard subscription info card shows.

    This query is the authoritative SKU lookup for the switch flows: the
    agreement payload's own lines do not carry the item vendor SKU, so both the
    wizard display and the change order build resolve existing lines from here.
    Raises :class:`MPTError` on API failure — callers decide whether to degrade.
    """
    query = _subscriptions_query(ctx, agreement_id)
    subscriptions_by_sku: dict[str, dict[str, Any]] = {}
    async for subscription in query.iterate():
        if _vendor_id(subscription) == source_vendor_subscription_id:
            continue
        _collect_lines(subscriptions_by_sku, subscription)
    return subscriptions_by_sku


async def resolve_agreement_subscriptions_by_sku(
    ctx: APIContext, agreement_id: str, source_vendor_subscription_id: str
) -> dict[str, dict[str, Any]]:
    """Degrading variant of :func:`fetch_agreement_subscriptions_by_sku`.

    An API failure yields an empty map so display flows can degrade gracefully:
    unmatched targets simply render as new subscriptions.
    """
    try:
        return await fetch_agreement_subscriptions_by_sku(
            ctx, agreement_id, source_vendor_subscription_id
        )
    except MPTError:
        logger.exception("Failed to resolve the agreement subscriptions by SKU")
        return {}


async def find_existing_target_line(
    ctx: APIContext, agreement_id: str, adobe_subscription_id: str, target_offer_id: str
) -> ExistingTargetLine | None:
    """Find the agreement line already holding the target offer's SKU, if any.

    Resolved from the agreement's live subscriptions — the same lookup the
    wizard uses to show the target as an existing subscription — because the
    agreement payload's own lines do not carry the item vendor SKU. Each SKU
    has at most one live subscription; when a line exists the change order tops
    it up instead of creating a duplicate subscription for the SKU (which the
    switch fulfillment rejects). For the same reason a failed or incomplete
    lookup fails the submission instead of silently ordering a new line.
    """
    try:
        subscriptions_by_sku = await fetch_agreement_subscriptions_by_sku(
            ctx, agreement_id, adobe_subscription_id
        )
    except MPTError as error:
        logger.warning(
            "Failed to resolve the agreement %s subscriptions for the switch: %s",
            agreement_id,
            error,
        )
        raise UpstreamServiceError(detail="MPT service request failed")
    existing = subscriptions_by_sku.get(get_partial_sku(target_offer_id))
    if existing is None:
        return None
    line_id = existing.get("lineId")
    quantity = existing.get("quantity")
    if not line_id or quantity is None:
        logger.warning(
            "Existing subscription %s for offer %s has no usable line data",
            existing.get("id"),
            target_offer_id,
        )
        raise UpstreamServiceError(detail="MPT service request failed")
    return ExistingTargetLine(id=line_id, quantity=quantity)


def _vendor_id(subscription: Any) -> str | None:
    return getattr(getattr(subscription, "external_ids", None), "vendor", None)


def _collect_lines(subscriptions_by_sku: dict[str, dict[str, Any]], subscription: Any) -> None:
    for line in getattr(subscription, "lines", None) or []:
        product_item = getattr(line, "item", None)
        sku = getattr(getattr(product_item, "external_ids", None), "vendor", None)
        if sku:
            subscriptions_by_sku[sku] = {
                "id": subscription.id,
                "name": getattr(subscription, "name", None),
                "status": getattr(subscription, "status", None),
                "quantity": getattr(line, "quantity", None),
                "lineId": getattr(line, "id", None),
                "commitmentDate": getattr(subscription, "commitment_date", None),
                "terms": getattr(subscription, "terms", None),
                "audit": getattr(subscription, "audit", None),
            }
