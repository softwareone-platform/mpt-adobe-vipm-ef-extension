import logging
from typing import Any, NamedTuple, cast

from mpt_extension_sdk.api import ErrorDetail, ValidationError
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.models import Agreement

from mpt_adobe_vipm_ef.models.renewal import (
    NetNewItemSelection,
    RenewalOrderRequest,
    RenewalPlanRequest,
    RenewalSubscriptionSelection,
)
from mpt_adobe_vipm_ef.services.items import get_partial_sku, resolve_items_by_sku

logger = logging.getLogger(__name__)

Line = dict[str, Any]

_FIRST_LINE_NUMBER = 1


class PlanSubscription(NamedTuple):
    """A requested subscription selection resolved against its MPT subscription."""

    selection: RenewalSubscriptionSelection
    line_id: str
    current_quantity: int
    adobe_subscription_id: str


class NetNewLine(NamedTuple):
    """A requested net-new product resolved to its MPT catalog item."""

    selection: NetNewItemSelection
    item_id: str


def require_renewal_selections(request: RenewalPlanRequest) -> None:
    """Reject a plan the fulfilment engine could do nothing with.

    The plan must act on at least one subscription or add at least one net-new
    product. Per-selection coherence (renewal quantities, duplicates) is
    enforced by the request schema itself.
    """
    if not request.subscriptions and not request.net_new_items:
        raise ValidationError(
            detail="The renewal plan must include at least one subscription or net-new product.",
        )


async def resolve_net_new_lines(
    ctx: APIContext, agreement: Agreement, selections: list[NetNewItemSelection]
) -> list[NetNewLine]:
    """Resolve each net-new offer to its catalog item for the order lines."""
    if not selections:
        return []
    partial_skus = [get_partial_sku(selection.offer_id) for selection in selections]
    product_items = await resolve_items_by_sku(ctx, agreement.product.id, partial_skus)
    return [_build_net_new_line(selection, product_items) for selection in selections]


def build_preview_renewal_line_items(
    plan_subscriptions: list[PlanSubscription], flex_discount_codes: list[str]
) -> list[Line]:
    """Build the Adobe PREVIEW_RENEWAL line items for the renewing subscriptions.

    Only renewing subscriptions can be previewed: a lapsing one has nothing to
    price and a net-new product has no Adobe subscription until fulfilment
    creates it. The selected flexible discount codes ride on every line so
    Adobe validates their eligibility per subscription.
    """
    line_items = []
    renewing = (plan for plan in plan_subscriptions if plan.selection.renew)
    for line_number, plan in enumerate(renewing, start=_FIRST_LINE_NUMBER):
        line_item: Line = {
            "extLineItemNumber": line_number,
            "offerId": plan.selection.offer_id,
            "subscriptionId": plan.adobe_subscription_id,
            "quantity": plan.selection.renewal_quantity,
        }
        if flex_discount_codes:
            line_item["flexDiscountCodes"] = list(flex_discount_codes)
        line_items.append(line_item)
    return line_items


def build_flexible_discounts_value(
    plan_subscriptions: list[PlanSubscription], request: RenewalOrderRequest
) -> Line | None:
    """Build the value of the order's ``flexibleDiscounts`` fulfillment parameter.

    Records which flexible discount code applies to which renewing subscription
    (one entry per subscription and code, numbered like the PREVIEW_RENEWAL
    line items) plus the recommendation tracker id, replayed to Adobe when the
    net-new subscriptions are created at fulfilment. Returns ``None`` when
    there is nothing to record so the parameter is left untouched.
    """
    entries: list[Line] = []
    renewing = (plan for plan in plan_subscriptions if plan.selection.renew)
    for line_number, plan in enumerate(renewing, start=_FIRST_LINE_NUMBER):
        entries.extend(
            {
                "extLineItemNumber": line_number,
                "baseOfferId": plan.selection.offer_id,
                "subscriptionId": plan.adobe_subscription_id,
                "flexDiscountCode": code,
            }
            for code in request.flex_discount_codes
        )
    if not entries and not request.recommendation_tracker_id:
        return None
    return {
        "recommendationTrackerId": request.recommendation_tracker_id,
        "lineItems": entries,
    }


def _build_net_new_line(
    selection: NetNewItemSelection, product_items: dict[str, dict[str, Any]]
) -> NetNewLine:
    product_item = product_items.get(get_partial_sku(selection.offer_id))
    if product_item is None or not product_item.get("id"):
        logger.warning("Net-new offer %s has no catalog item", selection.offer_id)
        raise ValidationError(
            detail="A net-new offer is not available in the product catalog.",
            errors=[
                ErrorDetail(
                    pointer="#/netNewItems",
                    detail=f"Unknown offer {selection.offer_id}.",
                ),
            ],
        )
    return NetNewLine(selection=selection, item_id=cast(str, product_item["id"]))
