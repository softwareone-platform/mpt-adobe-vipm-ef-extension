import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any, cast

from mpt_extension_sdk.api import ErrorDetail, ValidationError
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.models import Agreement, Subscription

from mpt_adobe_vipm_ef.models.renewal import (
    NetNewItemSelection,
    RenewalOrderRequest,
    RenewalPayload,
    RenewalPlanRequest,
    RenewalSubscriptionSelection,
)
from mpt_adobe_vipm_ef.services.items import get_partial_sku, resolve_items_by_sku
from mpt_adobe_vipm_ef.services.sku_mapping import load_full_skus

logger = logging.getLogger(__name__)

Line = dict[str, Any]

_FIRST_LINE_NUMBER = 1


@dataclass(frozen=True)
class PlanSubscription:
    """A requested subscription selection resolved against its MPT subscription."""

    selection: RenewalSubscriptionSelection
    line_id: str
    current_quantity: int
    adobe_subscription_id: str
    offer_id: str
    subscription: Subscription


@dataclass(frozen=True)
class NetNewLine:
    """A requested net-new product resolved to its MPT catalog item."""

    selection: NetNewItemSelection
    item_id: str
    offer_id: str


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


def require_renewal_changes(
    plan_subscriptions: list[PlanSubscription], net_new_lines: list[NetNewLine]
) -> None:
    """Reject a plan that would create neither a Change nor a Configuration order.

    The platform accepts a Change order only when at least one line's quantity
    actually moves (a renewing subscription's renewal quantity differs from
    its current quantity) or a net-new product is added, and a Configuration
    order only when at least one subscription's renew decision differs from
    its standing AutoRenew preference. A plan with none of these is a pure
    no-op the wizard should never have let through.
    """
    has_quantity_change = any(
        plan.selection.renew and plan.selection.renewal_quantity != plan.current_quantity
        for plan in plan_subscriptions
    )
    has_autorenew_change = any(
        plan.selection.renew != bool(plan.subscription.auto_renew) for plan in plan_subscriptions
    )
    if not (has_quantity_change or has_autorenew_change or net_new_lines):
        raise ValidationError(
            detail="The renewal plan has no changes to submit.",
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


async def resolve_net_new_offer_ids(
    ctx: APIContext,
    net_new_lines: list[NetNewLine],
    resolve_market_segment: Callable[[], str],
) -> list[NetNewLine]:
    """Override each net-new line's offer id with the full Adobe SKU, before it is ordered.

    The wizard only ever holds the partial (10-char) vendor SKU on
    ``selection.offer_id``, and a net-new product has no Adobe subscription to
    read the full offer id from (unlike a renewing one), so the Airtable ``SKU
    Mapping`` master data is the only source. Fulfilment needs
    the full offer id to create the scheduled subscription, so an offer
    without a mapping row cannot be ordered and fails the plan. The market
    segment is resolved lazily: it is only needed for the SKU lookup, so a
    plan without net-new lines never requires it.
    """
    if not net_new_lines:
        return net_new_lines
    partial_skus = sorted({
        get_partial_sku(net_new.selection.offer_id) for net_new in net_new_lines
    })
    full_skus = await load_full_skus(ctx, partial_skus, resolve_market_segment())
    return [_resolve_net_new_offer_id(net_new, full_skus) for net_new in net_new_lines]


def build_preview_renewal_line_items(
    plan_subscriptions: list[PlanSubscription], flex_discount_codes: list[str]
) -> list[Line]:
    """Build the Adobe PREVIEW_RENEWAL line items for the renewing subscriptions.

    Only renewing subscriptions can be previewed: a lapsing one has nothing to
    price and a net-new product has no Adobe subscription until fulfilment
    creates it. The selected flexible discount codes ride on every line so
    Adobe validates their eligibility per subscription. ``plan.offer_id``
    must already carry the full Adobe offer id (resolved from the customer's
    live subscriptions) or Adobe rejects the line.
    """
    line_items = []
    renewing = (plan for plan in plan_subscriptions if plan.selection.renew)
    for line_number, plan in enumerate(renewing, start=_FIRST_LINE_NUMBER):
        line_item: Line = {
            "extLineItemNumber": line_number,
            "offerId": plan.offer_id,
            "subscriptionId": plan.adobe_subscription_id,
            "quantity": plan.selection.renewal_quantity,
        }
        if flex_discount_codes:
            line_item["flexDiscountCodes"] = list(flex_discount_codes)
        line_items.append(line_item)
    return line_items


def build_renewal_payload(
    plan_subscriptions: list[PlanSubscription],
    net_new_lines: list[NetNewLine],
    request: RenewalOrderRequest,
    currency_code: str,
) -> RenewalPayload:
    """Build the ``renewalPayload`` DataObject snapshot from the customer's plan.

    Every selected subscription is recorded with its Adobe id, offer id, renew
    decision and renewal quantity; the selected flexible discount codes ride on
    each renewing entry, matching Adobe's auto-renewal preference object. The
    net-new products carry their full offer ids (resolved from the Airtable
    SKU mapping, see ``resolve_net_new_offer_ids``) so fulfilment can create
    the scheduled subscriptions without re-resolving them.
    """
    return RenewalPayload.from_payload({
        "recommendationTrackerId": request.recommendation_tracker_id,
        "currencyCode": currency_code,
        "subscriptions": [
            {
                "subscriptionId": plan.adobe_subscription_id,
                "offerId": plan.offer_id,
                "renew": plan.selection.renew,
                "renewalQuantity": plan.selection.renewal_quantity,
                "flexDiscountCodes": (
                    list(request.flex_discount_codes) if plan.selection.renew else []
                ),
            }
            for plan in plan_subscriptions
        ],
        "netNewItems": [
            {
                "offerId": net_new.offer_id,
                "quantity": net_new.selection.quantity,
            }
            for net_new in net_new_lines
        ],
    })


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
    return NetNewLine(
        selection=selection,
        item_id=cast(str, product_item["id"]),
        offer_id=selection.offer_id,
    )


def _resolve_net_new_offer_id(net_new: NetNewLine, full_skus: dict[str, str]) -> NetNewLine:
    offer_id = net_new.selection.offer_id
    full_sku = full_skus.get(get_partial_sku(offer_id))
    if not full_sku:
        logger.warning("Net-new offer %s has no full SKU mapping", offer_id)
        raise ValidationError(
            detail="A net-new offer has no full Adobe SKU mapping.",
            errors=[
                ErrorDetail(
                    pointer="#/netNewItems",
                    detail=f"Offer {offer_id} has no full Adobe SKU mapping.",
                ),
            ],
        )
    return replace(net_new, offer_id=full_sku)
