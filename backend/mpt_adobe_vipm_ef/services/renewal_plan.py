import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any, cast

from mpt_extension_sdk.api import ErrorDetail, UpstreamServiceError, ValidationError
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.models import Agreement, Subscription

from mpt_adobe_vipm_ef.constants import EARLY_RENEWAL_NO_CHANGE_ITEM
from mpt_adobe_vipm_ef.models.renewal import (
    NetNewItemSelection,
    RenewalOrderRequest,
    RenewalPath,
    RenewalPayload,
    RenewalPlanRequest,
    RenewalSubscriptionSelection,
)
from mpt_adobe_vipm_ef.services.items import get_partial_sku, resolve_items_by_sku
from mpt_adobe_vipm_ef.services.sku_mapping import load_full_skus

logger = logging.getLogger(__name__)

Line = dict[str, Any]

_FIRST_LINE_NUMBER = 1
_NO_CHANGE_ITEM_QUANTITY = 1


@dataclass(frozen=True)
class PlanSubscription:
    """A requested subscription selection resolved against its MPT subscription.

    ``renewed_quantity`` is the quantity previous early-renewal orders already
    renewed, read from the customer's live Adobe subscriptions
    (``renewedQuantity``). It is only stamped on the early-renewal ("Renew
    now") path, where it is the baseline ``renewal_delta`` subtracts from; at
    the anniversary it stays at zero so every quantity keeps its plain total
    reading.
    """

    selection: RenewalSubscriptionSelection
    line_id: str
    current_quantity: int
    adobe_subscription_id: str
    offer_id: str
    subscription: Subscription
    renewed_quantity: int = 0


def renewal_delta(plan: PlanSubscription) -> int:
    """The quantity this order still has to renew for the subscription.

    The wizard always sends the total quantity the customer wants renewed, but
    on the early-renewal path part of it may already be renewed by a previous
    RENEWAL order — Adobe reports that part as ``renewedQuantity`` and it must
    not be ordered again. The delta is what the order actually executes: it is
    what the PREVIEW_RENEWAL quotes and what the ``renewalPayload`` snapshot
    carries, so fulfilment never re-renews seats. Zero means the subscription
    needs no action and is kept as it stands in Adobe; at the anniversary
    ``renewed_quantity`` is never stamped, so the delta is the plain total.
    """
    return plan.selection.renewal_quantity - plan.renewed_quantity


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
    request: RenewalPlanRequest,
    plan_subscriptions: list[PlanSubscription],
    net_new_lines: list[NetNewLine],
) -> None:
    """Reject an at-anniversary plan that would create neither order type.

    At the anniversary the order *is* the plan, so it has to carry something:
    the platform accepts a Change order only when at least one line's quantity
    actually moves (a renewing subscription's renewal quantity differs from
    its current quantity) or a net-new product is added, and a Configuration
    order only when at least one subscription's renew decision differs from
    its standing AutoRenew preference. A plan with none of these is a pure
    no-op the wizard should never have let through.

    An early renewal ("Renew now") is never a no-op: renewing before the
    anniversary is itself the change the customer asked for, and fulfilment
    executes it from the ``renewalPayload`` snapshot the order carries — so a
    plan that repeats the current quantities and AutoRenew decisions is
    accepted and submitted as a Change order carrying the platform's
    placeholder item (see ``resolve_no_change_line``).
    """
    if request.renewal_path is RenewalPath.NOW:
        return
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


def require_no_renewed_seat_reduction(plan_subscriptions: list[PlanSubscription]) -> None:
    """Reject an early-renewal plan that keeps renewing but asks below the renewed seats.

    An Adobe RENEWAL order can only renew further seats, and a partial return
    of a previous early renewal is not supported — so on the "Renew now" path
    a renewing subscription cannot ask for a total below what previous orders
    already renewed. Removing the subscription from the renewal entirely is
    allowed instead: the removal rides the ``renewalPayload`` (``renew`` off
    with its ``renewedQuantity``) and fulfilment executes it as a RETURN of
    the renewed seats. Only bites where ``renewed_quantity`` was stamped,
    which is the now path alone.
    """
    for plan in plan_subscriptions:
        if plan.selection.renew and renewal_delta(plan) < 0:
            subscription_id = plan.selection.id
            renewed_quantity = plan.renewed_quantity
            raise ValidationError(
                detail=(
                    f"Subscription {subscription_id} cannot renew fewer seats than "
                    f"the {renewed_quantity} already early-renewed."
                ),
            )


def has_renewed_removal(plan_subscriptions: list[PlanSubscription]) -> bool:
    """Whether the plan removes a subscription a previous early renewal covered.

    Such a removal — the customer taking back an early renewal placed by
    mistake — is a real action with nothing to quote: the RENEWAL order
    carries no line for it and fulfilment executes it as a RETURN of the
    renewed seats. A plan whose quotable content is empty therefore still
    previews (as an empty quote) and still submits when it carries one. Only
    meaningful where ``renewed_quantity`` was stamped, the now path alone.
    """
    return any(
        not plan.selection.renew and plan.renewed_quantity > 0 for plan in plan_subscriptions
    )


async def resolve_no_change_line(ctx: APIContext, agreement: Agreement) -> Line:
    """Resolve the platform's early-renewal placeholder item into the order's only line.

    An early renewal ("Renew now") that repeats the current quantities and
    AutoRenew decisions produces neither order type on its own: the platform
    rejects a Change order whose lines carry no quantity delta and a
    Configuration order whose subscriptions keep their AutoRenew value. The
    plan still has to become an order — renewing before the anniversary is
    itself the change — so it is submitted as a Change order whose single line
    is the ``adobe-early-renewal-no-change`` catalog item; the line only
    exists to satisfy the platform, and fulfilment executes the plan from the
    ``renewalPayload`` snapshot the order carries.
    """
    product_items = await resolve_items_by_sku(
        ctx, agreement.product.id, [EARLY_RENEWAL_NO_CHANGE_ITEM]
    )
    product_item = product_items.get(EARLY_RENEWAL_NO_CHANGE_ITEM)
    if product_item is None or not product_item.get("id"):
        logger.warning(
            "Early-renewal placeholder item %s not found on product %s",
            EARLY_RENEWAL_NO_CHANGE_ITEM,
            agreement.product.id,
        )
        raise UpstreamServiceError(
            detail="The early-renewal placeholder item is not available in the product catalog.",
        )
    return {"item": {"id": product_item["id"]}, "quantity": _NO_CHANGE_ITEM_QUANTITY}


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
    plan_subscriptions: list[PlanSubscription],
    flex_discount_codes: list[str],
    net_new_lines: list[NetNewLine] | None = None,
) -> list[Line]:
    """Build the Adobe PREVIEW_RENEWAL line items for the plan.

    A lapsing subscription has nothing to price, so only renewing ones carry a
    line — and each line quotes its ``renewal_delta``, the quantity this order
    still has to renew, so on the early-renewal path a previous RENEWAL
    order's seats are never quoted (or charged) again; a subscription whose
    delta is zero is already fully covered and drops out of the quote
    entirely. The selected flexible discount codes ride on every line so Adobe
    validates their eligibility per line. ``plan.offer_id`` must already carry
    the full Adobe offer id (resolved from the customer's live subscriptions)
    or Adobe rejects the line.

    ``net_new_lines`` are the early-renewal additions, which ride the RENEWAL
    order itself as an offer id with no subscription id — Adobe only sees (and
    only rejects) the forbidden renew-and-add basket when the preview carries
    them. They are left out at the anniversary, where a net-new product has no
    Adobe subscription until fulfilment creates it.
    """
    renewing = (
        plan for plan in plan_subscriptions if plan.selection.renew and renewal_delta(plan) > 0
    )
    line_items = [
        _preview_subscription_line(plan, line_number, flex_discount_codes)
        for line_number, plan in enumerate(renewing, start=_FIRST_LINE_NUMBER)
    ]
    return line_items + _preview_net_new_lines(
        net_new_lines or [], len(line_items) + _FIRST_LINE_NUMBER, flex_discount_codes
    )


def _preview_subscription_line(
    plan: PlanSubscription, line_number: int, flex_discount_codes: list[str]
) -> Line:
    line_item: Line = {
        "extLineItemNumber": line_number,
        "offerId": plan.offer_id,
        "subscriptionId": plan.adobe_subscription_id,
        "quantity": renewal_delta(plan),
    }
    if flex_discount_codes:
        line_item["flexDiscountCodes"] = list(flex_discount_codes)
    return line_item


def _preview_net_new_lines(
    net_new_lines: list[NetNewLine], first_line_number: int, flex_discount_codes: list[str]
) -> list[Line]:
    """Build the lines for the products the customer does not hold yet.

    Adobe identifies each by offer id alone: there is no subscription to renew,
    so ``subscriptionId`` is omitted (optional for a new offer). They number
    after the renewing lines of the same preview.
    """
    return [
        {
            "extLineItemNumber": line_number,
            "offerId": net_new.offer_id,
            "quantity": net_new.selection.quantity,
            **({"flexDiscountCodes": list(flex_discount_codes)} if flex_discount_codes else {}),
        }
        for line_number, net_new in enumerate(net_new_lines, start=first_line_number)
    ]


def build_renewal_payload(
    plan_subscriptions: list[PlanSubscription],
    net_new_lines: list[NetNewLine],
    request: RenewalOrderRequest,
    currency_code: str,
) -> RenewalPayload:
    """Build the ``renewalPayload`` DataObject snapshot from the customer's plan.

    The renewal path the customer picked on the wizard's first step is recorded
    first: it is what tells fulfilment which flow to execute — apply the plan
    as auto-renewal preferences at the coterm date, or place the early RENEWAL
    order now — since the resulting Marketplace order looks the same either
    way. Every selected subscription is recorded with its Adobe id, offer id,
    renew decision and its ``renewal_delta`` as the quantity: on the now path
    that is what the RENEWAL order still has to renew after previous orders
    (zero flags an already-covered subscription fulfilment keeps active
    without re-renewing it), and at the anniversary — where nothing is ever
    already renewed — it is the plain total Adobe's auto-renewal preference
    takes. Each entry also carries the ``renewedQuantity`` observed when the
    order was placed: a removed subscription (``renew`` off) with renewed
    seats is how the customer takes back an early renewal placed by mistake,
    and that baseline is what tells fulfilment to execute the removal as a
    RETURN order — and how large it is — rather than as a plain lapse.
    The selected flexible discount codes ride on each renewing entry,
    matching Adobe's auto-renewal preference object. The net-new products
    carry their full offer ids (resolved from the Airtable SKU mapping, see
    ``resolve_net_new_offer_ids``) so fulfilment can create the scheduled
    subscriptions without re-resolving them.
    """
    return RenewalPayload.from_payload({
        "renewalPath": request.renewal_path.value,
        "recommendationTrackerId": request.recommendation_tracker_id,
        "currencyCode": currency_code,
        "subscriptions": [
            {
                "subscriptionId": plan.adobe_subscription_id,
                "offerId": plan.offer_id,
                "renew": plan.selection.renew,
                "renewalQuantity": max(renewal_delta(plan), 0),
                "renewedQuantity": plan.renewed_quantity,
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
