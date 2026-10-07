import asyncio
import logging
import re
from collections.abc import Collection
from dataclasses import dataclass, replace
from http import HTTPStatus
from typing import Any, cast

from mpt_api_client.exceptions import MPTHttpError
from mpt_extension_sdk.api import (
    APIContext,
    APIResponse,
    ErrorDetail,
    ForbiddenError,
    NotFoundError,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.models import Agreement, Subscription
from mpt_extension_sdk.routing import APIRouter

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.constants import (
    FLEX_DISCOUNT_BARE_REASON_PATTERN,
    FLEX_DISCOUNT_ERROR_CODES,
    FLEX_DISCOUNT_LINE_PATTERN,
    FLEX_DISCOUNT_REASON_PATTERN,
    FLEX_DISCOUNT_SUCCESS_RESULT,
    NO_AUTO_RENEWAL_ERROR_CODE,
    SCHEDULED_CREATION_WINDOW_CLOSES_DAYS,
    SCHEDULED_CREATION_WINDOW_OPENS_DAYS,
)
from mpt_adobe_vipm_ef.context import adobe_client
from mpt_adobe_vipm_ef.models.renewal import (
    NetNewItemSelection,
    RenewalOrderRequest,
    RenewalPath,
    RenewalPayload,
    RenewalPlanRequest,
    RenewalPreviewRequest,
    RenewalSubscriptionSelection,
    SkuAutoRenewSupportRequest,
)
from mpt_adobe_vipm_ef.routers.api.customer import (
    get_authorization_id,
    load_agreement,
    require_customer_id,
    validate_agreement_access,
)
from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs
from mpt_adobe_vipm_ef.routers.api.discount_scope import resolve_market_segment
from mpt_adobe_vipm_ef.services.clients import build_caller_client
from mpt_adobe_vipm_ef.services.inherited_discounts import (
    InheritedDiscount,
    build_inherited_discounts,
    serialize_inherited_discounts,
)
from mpt_adobe_vipm_ef.services.items import get_partial_sku
from mpt_adobe_vipm_ef.services.renewal import require_scheduled_creation_window
from mpt_adobe_vipm_ef.services.renewal_auto_renew import (
    check_renewal_plan_auto_renew_support,
    load_auto_renew_support,
)
from mpt_adobe_vipm_ef.services.renewal_order import (
    build_configuration_order_subscriptions,
    build_renewal_order_lines,
    create_renewal_change_order,
    create_renewal_configuration_order,
)
from mpt_adobe_vipm_ef.services.renewal_path import (
    has_active_subscriptions,
    read_renewal_window,
    require_unlocked_path,
    resolve_anniversary_date,
    resolve_locked_path,
    resolve_window_date,
)
from mpt_adobe_vipm_ef.services.renewal_plan import (  # noqa: WPS235
    Line,
    NetNewLine,
    PlanSubscription,
    build_preview_renewal_line_items,
    build_renewal_payload,
    has_renewed_removal,
    require_discount_code_change,
    require_no_renewed_seat_reduction,
    require_renewal_changes,
    require_renewal_selections,
    resolve_net_new_lines,
    resolve_net_new_offer_ids,
    resolve_no_change_line,
)
from mpt_adobe_vipm_ef.services.renewal_state import (
    build_now_path_eligibility,
    build_renewal_states,
    load_lifecycle,
)
from mpt_adobe_vipm_ef.services.renewal_three_yc import (
    check_renewal_plan_three_yc_floor,
    has_three_yc_in_force,
)
from mpt_adobe_vipm_ef.services.switch_order import (
    mpt_order_error_detail,
    require_active_agreement,
)

logger = logging.getLogger(__name__)

renewal_router = APIRouter(prefix="/agreements")

_ADOBE_REQUEST_FAILED_DETAIL = "Adobe service request failed"
_REJECTED_DISCOUNTS_DETAIL = "Adobe rejected one or more discount codes"


@dataclass(frozen=True)
class _RejectedCode:
    """One discount code Adobe refused, and the request line it was sent on.

    The code is what the next quote has to drop; the reason is what the wizard
    turns into copy, so both travel together until the response is built. The
    line is the request's ``extLineItemNumber``, the one key Adobe echoes
    reliably: its answer can change the offer id (the level suffix) and leave
    the subscription id empty. An empty code is a refusal Adobe named on a line
    that sent none.
    """

    line_number: int
    code: str
    reason: str


class _UnidentifiedRefusalError(Exception):
    """Adobe refused a code without naming a line the plan holds."""


@renewal_router.post(
    path="/{agreement_id}/renewal-order/auto-renew-support",
    name="agreements-renewal-order-auto-renew-support",
    body_validator=SkuAutoRenewSupportRequest,
)
@validate_agreement_access
@log_inputs
async def get_renewal_auto_renew_support(
    agreement_id: str, ctx: APIContext, body: SkuAutoRenewSupportRequest
) -> APIResponse:
    """Report which of the given SKUs can renew at the anniversary date.

    Auto-renewal support is the at-anniversary path's routing input, so the
    wizard reads it before it offers anything: a subscription whose SKU has no
    support is left out of the renewal plan rather than shown with its Renew
    toggle off. Keyed by partial SKU; an unmapped SKU comes back
    unsupported. The market segment behind the lookup is resolved from the
    agreement server-side.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    partial_skus = sorted({get_partial_sku(sku) for sku in body.skus if sku})
    if not partial_skus:
        return APIResponse.ok(payload={"skus": {}})
    support = await load_auto_renew_support(
        ctx, partial_skus, resolve_market_segment(ctx, agreement)
    )
    return APIResponse.ok(
        payload={"skus": {sku: support.get(sku, False) for sku in partial_skus}},
    )


@renewal_router.get(
    path="/{agreement_id}/renewal-order/renewal-state",
    name="agreements-renewal-order-renewal-state",
)
@validate_agreement_access
@log_inputs
async def get_renewal_state(agreement_id: str, ctx: APIContext) -> APIResponse:
    """Report how much of each subscription has already been early-renewed.

    The early-renewal path branches per line on this state — the renewal-state
    label, the remainder control on a partially-renewed line and whether an
    increase control is offered — so the wizard reads it before it renders.
    Keyed by Adobe subscription id, which the wizard holds as the
    subscription's vendor external id. State drives what is displayed only: the
    customer may still assemble any basket, and its validity is settled by the
    preview.

    Each entry also carries ``earlyRenewable``, false for a SKU Adobe will not
    early-renew — end of sale always, end of life unless the customer holds a
    three-year commitment — which the wizard omits rather than shows.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    subscriptions = await _load_adobe_subscriptions(ctx, agreement_id)
    customer = await _load_adobe_customer(ctx, agreement_id)
    lifecycle = await load_lifecycle(
        ctx, _held_partial_skus(subscriptions), resolve_market_segment(ctx, agreement)
    )
    states = build_renewal_states(
        subscriptions, lifecycle, is_three_yc=has_three_yc_in_force(customer)
    )
    return APIResponse.ok(payload={"subscriptions": states})


@renewal_router.get(
    path="/{agreement_id}/renewal-order/path-state",
    name="agreements-renewal-order-path-state",
)
@validate_agreement_access
@log_inputs
async def get_renewal_path_state(agreement_id: str, ctx: APIContext) -> APIResponse:  # noqa: WPS210
    """Report whether a renewal can be planned today and which path is established.

    The wizard's first step reads this before it offers a path: outside the
    window — or with no active subscription to renew — there is nothing to plan,
    and the step says so instead of walking the customer into an Adobe
    rejection. ``lockedPath`` is set once a renewal is in place — ``now`` once an
    early renewal has rolled the anniversary forward, ``anniversary`` once
    deferred renewal preferences are staged — which fixes the path and makes the
    step read-only.

    A non-Active agreement is rejected here too, so the wizard never opens
    while an order is still processing (the agreement sits in Updating): a
    renewal planned then would read Adobe's renewed quantities before the
    in-flight order lands on them and double-count what is left to renew.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)
    customer = await _load_adobe_customer(ctx, agreement_id)
    subscriptions = await _load_adobe_subscriptions(ctx, agreement_id)
    non_renewable_skus = await _load_non_renewable_skus(ctx, agreement, subscriptions)
    coterm_date = str(customer.get("cotermDate") or "")
    anniversary_date = resolve_anniversary_date(coterm_date, subscriptions, non_renewable_skus)
    locked_path = resolve_locked_path(coterm_date, subscriptions, non_renewable_skus)
    window_date = resolve_window_date(coterm_date, subscriptions, non_renewable_skus)
    return APIResponse.ok(
        payload={
            "anniversaryDate": anniversary_date,
            "window": read_renewal_window(window_date),
            "windowOpensDays": SCHEDULED_CREATION_WINDOW_OPENS_DAYS,
            "windowClosesDays": SCHEDULED_CREATION_WINDOW_CLOSES_DAYS,
            "hasActiveSubscriptions": has_active_subscriptions(subscriptions),
            "lockedPath": locked_path.value if locked_path else None,
        },
    )


@renewal_router.get(
    path="/{agreement_id}/renewal-order/inherited-discounts",
    name="agreements-renewal-order-inherited-discounts",
)
@validate_agreement_access
@log_inputs
async def get_inherited_discounts(agreement_id: str, ctx: APIContext) -> APIResponse:
    """Report the reusable discounts the customer already holds, per renewing line.

    The discount codes step reads this to surface the customer's *inherited*
    discounts: the reusables Adobe auto-applies to each renewing subscription at
    the anniversary, sourced from an automated ``PREVIEW_RENEWAL`` (Adobe owns
    the precedence between several held reusables and the extended lock window)
    and enriched from the customer's held-reusable catalogue for display. A code
    Adobe returns as no longer eligible is flagged (``eligible`` false) so the
    step can warn rather than silently drop it. An empty list means the customer
    holds no auto-applied reusables (or has no auto-renewing subscriptions). If
    the Adobe lookup fails, the route returns an error.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)
    currency_code = agreement.authorization.currency or ""
    inherited = await _load_inherited_discounts(ctx, agreement_id, currency_code)
    return APIResponse.ok(
        payload={"inheritedDiscounts": serialize_inherited_discounts(inherited)},
    )


@renewal_router.post(
    path="/{agreement_id}/renewal-order/3yc-check",
    name="agreements-renewal-order-3yc-check",
    body_validator=RenewalPlanRequest,
)
@validate_agreement_access
@log_inputs
async def check_renewal_order_three_yc(  # noqa: WPS217
    agreement_id: str, ctx: APIContext, body: RenewalPlanRequest
) -> APIResponse:
    """Pre-check the renewal plan against the customer's 3YC minimum quantities.

    The wizard calls this while the customer selects the plan's items, before
    the discount codes step: a decrease or a disabled renewal that would place
    a committed customer below the three-year commitment floors fails here
    with a wizard-friendly message instead of a rejected order, as does a
    product whose SKU cannot renew at the anniversary at all. Returns the 3YC
    check summary (the totals compared and the floors) when the plan holds.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)
    require_renewal_selections(body)

    plan_subscriptions = await _load_plan_subscriptions(ctx, agreement, body.subscriptions)
    net_new_lines = await resolve_net_new_lines(ctx, agreement, body.net_new_items)
    await _check_auto_renew_support(
        ctx, agreement, plan_subscriptions, body.net_new_items, body.renewal_path
    )
    customer = await _load_adobe_customer(ctx, agreement_id)
    summary = await _check_three_yc_floor(
        ctx, agreement, customer, plan_subscriptions, net_new_lines
    )
    return APIResponse.ok(payload=summary)


@renewal_router.post(
    path="/{agreement_id}/renewal-order/preview",
    name="agreements-renewal-order-preview",
    body_validator=RenewalPreviewRequest,
)
@validate_agreement_access
@log_inputs
async def preview_renewal_plan(  # noqa: WPS210, WPS217
    agreement_id: str, ctx: APIContext, body: RenewalPreviewRequest
) -> APIResponse:
    """Quote the renewal plan through an Adobe ``PREVIEW_RENEWAL`` order.

    The at-anniversary wizard calls this on the discount codes step: each
    renewing line rides the flexible discount codes the customer applied to
    it, so Adobe validates each code against its own line and returns the
    renewal pricing the wizard shows as the estimate. Net-new products have no Adobe subscription to
    preview yet on that path and are priced only at fulfilment.

    The early-renewal ("Renew now") wizard calls it on every step that shapes
    the basket — the renew decisions, the items and the discount codes —
    because the RENEWAL order is placed now, which makes Adobe the authority on
    whether the basket is valid. Quoting it from the renewal step already
    rejects a subscription Adobe will not renew at all, before the customer
    edits a quantity: the preview carries the additions too, so a mixed renew-and-add
    basket (which Adobe forbids in one order) is rejected in the wizard instead
    of at fulfilment. A SKU that cannot renew at the anniversary is rejected
    here too, so no route quotes a plan the submit route would refuse.

    Because there can be several renewal orders on that path, each line quotes
    only its remaining delta — the wizard's total minus what previous RENEWAL
    orders already renewed — and an already-covered line drops out of the
    quote entirely, so a repeat renewal never re-prices renewed seats.
    Removing a renewed subscription from the renewal is a valid plan with
    nothing to quote (fulfilment executes it as a RETURN of the renewed
    seats), so when removals are all the quotable plan holds, the preview
    succeeds with an empty quote. A plan that keeps renewing but asks for
    fewer seats than already renewed is rejected instead: a partial return is
    not supported.

    Returns the Adobe quote under ``preview`` alongside ``eligibility``, the
    per-subscription now-path eligibility read from the quote's line statuses —
    the only place Adobe reports it.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)

    plan_subscriptions = await _load_plan_subscriptions(ctx, agreement, body.subscriptions)
    await _check_auto_renew_support(
        ctx, agreement, plan_subscriptions, body.net_new_items, body.renewal_path
    )
    plan_subscriptions = await _resolve_adobe_plan_data(
        ctx, agreement_id, plan_subscriptions, body.renewal_path
    )
    net_new_lines = await _resolve_preview_net_new_lines(ctx, agreement, body)
    line_items = build_preview_renewal_line_items(plan_subscriptions, net_new_lines)
    if not line_items:
        if has_renewed_removal(plan_subscriptions):
            # Nothing to quote, but the plan still acts: it takes back a
            # renewed subscription, which fulfilment executes as a RETURN.
            return APIResponse.ok(payload={"preview": None, "eligibility": {}})
        raise ValidationError(
            detail="The renewal plan has no renewing subscriptions to preview.",
        )
    currency_code = agreement.authorization.currency or ""
    rows = _line_rows(line_items, net_new_lines)
    preview = await _preview_renewal(ctx, agreement_id, currency_code, line_items, rows)
    return APIResponse.ok(
        payload={
            "preview": preview,
            "eligibility": build_now_path_eligibility(preview or {}),
        },
    )


@renewal_router.post(
    path="/{agreement_id}/renewal-order",
    name="agreements-renewal-order",
    body_validator=RenewalOrderRequest,
)
@validate_agreement_access
@log_inputs
async def create_renewal_order(  # noqa: WPS210, WPS217
    agreement_id: str, ctx: APIContext, body: RenewalOrderRequest
) -> APIResponse:
    """Submit an at-anniversary renewal plan as a Change or Configuration order.

    Validates the customer's plan and re-checks the 3YC commitment floors,
    then dispatches on what actually changed: any subscription whose renewal
    quantity differs from its current quantity, or any net-new product, is
    submitted as a Change order (directly in Processing status) carrying only
    the changed lines plus the plan snapshot — the renewal path the customer
    picked, renew decisions, quantities, discount codes and the recommendation
    tracker id — on the hidden ``renewalPayload`` order parameter, which is
    what tells fulfillment whether to renew at the anniversary or now.
    Otherwise it is submitted as a Configuration order carrying only the
    AutoRenew-changed subscriptions (the platform rejects a subscription whose
    AutoRenew value does not change) plus the same plan snapshot on that
    context's own ``renewalPayload`` parameter, on either path: the order's
    subscriptions set only the AutoRenew flags, so the discount codes and the
    early path's decision to renew now reach fulfilment through the snapshot
    alone. At the anniversary a plan with no real change is rejected upfront;
    a discount code the subscription does not already hold counts as a change,
    and renewing now is always one. A plan whose only change is a code, or an
    early renewal that repeats the current quantities and AutoRenew decisions,
    produces neither order type on its own, so it becomes a Change order
    carrying the platform's ``adobe-early-renewal-no-change`` placeholder item
    as its single line, with fulfillment executing the plan from the snapshot
    alone.

    Because the early path can be ordered more than once, its snapshot
    quantities are deltas against Adobe's live ``renewedQuantity`` — what this
    order still has to renew, zero keeping an already-covered subscription
    untouched. Removing a renewed subscription from the renewal is snapshotted
    as ``renew`` off with the observed ``renewedQuantity``, which fulfilment
    executes as a RETURN of those seats (the customer taking back an early
    renewal placed by mistake); a plan that keeps renewing but asks for fewer
    seats than already renewed is rejected, since a partial return is not
    supported.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)
    require_renewal_selections(body)

    plan_subscriptions = await _load_plan_subscriptions(ctx, agreement, body.subscriptions)
    net_new_lines = await resolve_net_new_lines(ctx, agreement, body.net_new_items)
    require_renewal_changes(body, plan_subscriptions, net_new_lines)
    await _check_auto_renew_support(
        ctx, agreement, plan_subscriptions, body.net_new_items, body.renewal_path
    )

    customer = await _load_adobe_customer(ctx, agreement_id)
    await _check_three_yc_floor(ctx, agreement, customer, plan_subscriptions, net_new_lines)
    coterm_date = str(customer.get("cotermDate") or "")
    plan_subscriptions = await _resolve_submission_plan(
        ctx, agreement, plan_subscriptions, body.renewal_path, coterm_date
    )
    require_discount_code_change(body, plan_subscriptions, net_new_lines)

    lines = build_renewal_order_lines(plan_subscriptions, net_new_lines)
    if lines:
        currency_code = agreement.authorization.currency or ""
        net_new_lines = await resolve_net_new_offer_ids(
            ctx, net_new_lines, lambda: resolve_market_segment(ctx, agreement)
        )
        renewal_payload = build_renewal_payload(
            plan_subscriptions, net_new_lines, body, currency_code
        )
        order = await _create_change_order(ctx, agreement_id, lines, renewal_payload, body)
    else:
        configuration_subscriptions = build_configuration_order_subscriptions(plan_subscriptions)
        renewal_payload = _configuration_renewal_payload(agreement, plan_subscriptions, body)
        if configuration_subscriptions:
            order = await _create_configuration_order(
                ctx, agreement_id, configuration_subscriptions, body, renewal_payload
            )
        else:
            # An unchanged early renewal, or an at-anniversary plan whose only
            # change is a discount code: neither order type stands on its own,
            # so the Change order rides on the catalog's placeholder item and
            # fulfilment executes the plan from the renewalPayload snapshot.
            no_change_line = await resolve_no_change_line(ctx, agreement)
            order = await _create_change_order(
                ctx, agreement_id, [no_change_line], renewal_payload, body
            )
    return APIResponse.created(payload=order)


def _require_client_account(ctx: APIContext) -> None:
    if not ctx.auth.account.is_client():
        raise ForbiddenError(
            detail="The at-anniversary renewal is available to client accounts only.",
        )


async def _check_auto_renew_support(
    ctx: APIContext,
    agreement: Agreement,
    plan_subscriptions: list[PlanSubscription],
    net_new_items: list[NetNewItemSelection],
    renewal_path: RenewalPath,
) -> None:
    """Gate the plan on per-SKU auto-renewal support, which only the anniversary path needs.

    The at-anniversary path renews through Adobe's auto-renewal preferences, so
    a SKU that cannot auto-renew cannot take it. An early renewal places an
    explicit RENEWAL order instead and never touches those preferences, so the
    same SKU is orderable and the gate does not apply.
    """
    if renewal_path is RenewalPath.NOW:
        return
    await check_renewal_plan_auto_renew_support(
        ctx,
        lambda: resolve_market_segment(ctx, agreement),
        plan_subscriptions,
        net_new_items,
    )


async def _check_three_yc_floor(
    ctx: APIContext,
    agreement: Agreement,
    customer: dict[str, object],
    plan_subscriptions: list[PlanSubscription],
    net_new_lines: list[NetNewLine],
) -> dict[str, object]:
    return await check_renewal_plan_three_yc_floor(
        ctx,
        customer,
        lambda: resolve_market_segment(ctx, agreement),
        plan_subscriptions,
        net_new_lines,
    )


async def _resolve_preview_net_new_lines(
    ctx: APIContext, agreement: Agreement, body: RenewalPreviewRequest
) -> list[NetNewLine]:
    """Resolve the net-new products the early-renewal preview has to carry.

    Early renewal rides its additions on the RENEWAL order itself (an offer id
    with no subscription id), so they belong in the quote: only a preview that
    carries them can reject the renew-and-add basket Adobe forbids in a single
    order. The full Adobe offer id comes from the Airtable SKU mapping, the
    only source for a product with no Adobe subscription to read it from. At
    the anniversary the additions are scheduled subscriptions created at
    fulfilment, so nothing about them is previewable.
    """
    if body.renewal_path is not RenewalPath.NOW or not body.net_new_items:
        return []
    net_new_lines = await resolve_net_new_lines(ctx, agreement, body.net_new_items)
    return await resolve_net_new_offer_ids(
        ctx, net_new_lines, lambda: resolve_market_segment(ctx, agreement)
    )


async def _load_plan_subscriptions(
    ctx: APIContext, agreement: Agreement, selections: list[RenewalSubscriptionSelection]
) -> list[PlanSubscription]:
    """Resolve each selected subscription against MPT into the plan entries.

    Ensures every subscription belongs to the agreement and carries what the
    renewal needs: at least one line and the Adobe (vendor) subscription id.
    """
    agreement_subscription_ids = {subscription.id for subscription in agreement.subscriptions}
    plan_loads = [
        _load_plan_subscription(ctx, agreement_subscription_ids, selection)
        for selection in selections
    ]
    return list(await asyncio.gather(*plan_loads))


async def _load_plan_subscription(
    ctx: APIContext,
    agreement_subscription_ids: set[str],
    selection: RenewalSubscriptionSelection,
) -> PlanSubscription:
    if selection.id not in agreement_subscription_ids:
        logger.warning("Subscription %s does not belong to the agreement", selection.id)
        raise NotFoundError(detail="Subscription not found on the agreement.")
    try:
        subscription = await ctx.mpt_api_service.subscriptions.get_by_id(selection.id)
    except MPTHttpError as error:
        if error.status_code == HTTPStatus.NOT_FOUND:
            logger.warning("Subscription %s not found: %s", selection.id, error)
            raise NotFoundError(detail="Subscription not found.")
        logger.warning(
            "MPT API error while loading subscription %s: status=%s %s",
            selection.id,
            error.status_code,
            error,
        )
        raise UpstreamServiceError(detail="MPT service request failed")
    return _build_plan_subscription(selection, subscription)


def _build_plan_subscription(
    selection: RenewalSubscriptionSelection, subscription: Subscription
) -> PlanSubscription:
    if not subscription.lines:
        logger.warning("Subscription %s has no lines", selection.id)
        raise ValidationError(detail=f"Subscription {selection.id} has no lines.")
    adobe_subscription_id = subscription.external_ids.vendor
    if not adobe_subscription_id:
        logger.warning("Subscription %s is missing the Adobe subscription id", selection.id)
        raise ValidationError(
            detail=f"Subscription {selection.id} is missing the Adobe subscription identifier.",
        )
    line = subscription.lines[0]
    return PlanSubscription(
        selection=selection,
        line_id=line.id,
        current_quantity=line.quantity,
        adobe_subscription_id=adobe_subscription_id,
        offer_id=selection.offer_id,
        subscription=subscription,
    )


async def _load_adobe_customer(ctx: APIContext, agreement_id: str) -> dict[str, object]:
    """Load the Adobe customer behind the agreement.

    The renewal endpoints read the customer's 3YC benefit (for the commitment
    floor pre-check) and its coterm date (for the renewal window),
    failing with wizard-friendly messages instead of a Failed order.
    """
    authorization_id = await get_authorization_id(ctx, agreement_id)
    customer_id = await require_customer_id(ctx, agreement_id)
    try:
        return await asyncio.to_thread(
            adobe_client(ctx).customer.get_customer,
            authorization_id,
            customer_id,
        )
    except AdobeAPIError as error:
        logger.warning("Adobe API error loading customer %s: %s", customer_id, error)
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeHttpError as error:
        logger.warning(
            "Adobe HTTP error loading customer %s: status=%s body=%r",
            customer_id,
            error.status_code if hasattr(error, "status_code") else "?",
            error.response_content,
        )
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeError as error:
        logger.warning("Adobe configuration error loading customer %s: %s", customer_id, error)
        raise ValidationError(detail=str(error))


async def _resolve_submission_plan(
    ctx: APIContext,
    agreement: Agreement,
    plan_subscriptions: list[PlanSubscription],
    renewal_path: RenewalPath,
    coterm_date: str,
) -> list[PlanSubscription]:
    """Check the path lock and stamp the plan for submission, off one Adobe load.

    The same subscriptions load serves the path lock, the renewal window, the full offer ids, the
    discount codes each subscription already holds (which tell a code-only
    plan apart from a no-op) and — on the early path — the renewed quantities
    behind the snapshot's deltas, with the plan rejected right here if it asks
    to take renewed seats back.
    """
    adobe_subscriptions = await _load_adobe_subscriptions(ctx, agreement.id)
    non_renewable_skus = await _load_non_renewable_skus(ctx, agreement, adobe_subscriptions)
    require_unlocked_path(renewal_path, coterm_date, adobe_subscriptions, non_renewable_skus)
    require_scheduled_creation_window(
        resolve_window_date(coterm_date, adobe_subscriptions, non_renewable_skus)
    )
    plan_subscriptions = _resolve_renewal_offer_ids(plan_subscriptions, adobe_subscriptions)
    plan_subscriptions = _resolve_current_discount_codes(plan_subscriptions, adobe_subscriptions)
    if renewal_path is RenewalPath.NOW:
        plan_subscriptions = _resolve_renewed_quantities(plan_subscriptions, adobe_subscriptions)
        require_no_renewed_seat_reduction(plan_subscriptions)
    return plan_subscriptions


async def _resolve_adobe_plan_data(
    ctx: APIContext,
    agreement_id: str,
    plan_subscriptions: list[PlanSubscription],
    renewal_path: RenewalPath,
) -> list[PlanSubscription]:
    """Stamp the plan with the customer's live Adobe subscription data it needs.

    Renewing lines take Adobe's full offer id (see
    ``_resolve_renewal_offer_ids``) and, on the early-renewal path, every plan
    row takes the quantity previous RENEWAL orders already renewed — the
    baseline behind each quoted delta, and what marks a switched-off row as
    the removal of a renewed subscription — with the plan rejected right here
    if it keeps renewing but asks for fewer seats than already renewed. At the
    anniversary only renewing lines need anything (the offer id), so a
    lapse-only or net-new-only plan skips the Adobe call there.
    """
    if renewal_path is RenewalPath.NOW:
        needs_adobe_data = bool(plan_subscriptions)
    else:
        needs_adobe_data = any(plan.selection.renew for plan in plan_subscriptions)
    if not needs_adobe_data:
        return plan_subscriptions
    adobe_subscriptions = await _load_adobe_subscriptions(ctx, agreement_id)
    plan_subscriptions = _resolve_renewal_offer_ids(plan_subscriptions, adobe_subscriptions)
    if renewal_path is RenewalPath.NOW:
        plan_subscriptions = _resolve_renewed_quantities(plan_subscriptions, adobe_subscriptions)
        require_no_renewed_seat_reduction(plan_subscriptions)
    return plan_subscriptions


def _resolve_renewal_offer_ids(
    plan_subscriptions: list[PlanSubscription], adobe_subscriptions: dict[str, object]
) -> list[PlanSubscription]:
    """Override each line's offer id with Adobe's own, before it is previewed or ordered.

    MPT's subscription and catalog data only ever carries the partial
    (10-char) vendor SKU on ``selection.offer_id``; Adobe's PREVIEW_RENEWAL
    (and the order it gates) needs the full offer id, which only the
    customer's live Adobe subscriptions
    (``GET /v3/customers/{customer_id}/subscriptions``) have.
    """
    offer_ids_by_subscription = {
        str(subscription_item["subscriptionId"]): str(subscription_item["offerId"])
        for subscription_item in _adobe_subscription_items(adobe_subscriptions)
        if subscription_item.get("subscriptionId") and subscription_item.get("offerId")
    }
    return [
        replace(
            plan,
            offer_id=offer_ids_by_subscription.get(plan.adobe_subscription_id) or plan.offer_id,
        )
        for plan in plan_subscriptions
    ]


def _resolve_renewed_quantities(
    plan_subscriptions: list[PlanSubscription], adobe_subscriptions: dict[str, object]
) -> list[PlanSubscription]:
    """Stamp each plan entry with the quantity previous early renewals already renewed.

    Adobe's ``renewedQuantity`` is the cumulative quantity earlier RENEWAL
    orders already renewed, and the early path can be ordered more than once —
    so it is the baseline ``renewal_delta`` subtracts from wherever a quantity
    reaches Adobe (the preview lines and the ``renewalPayload`` snapshot).
    Adobe only returns it inside the pre-anniversary window, so an absent
    value reads as nothing renewed yet. Never called at the anniversary, where
    quantities keep their plain total reading.
    """
    renewed_by_subscription = {
        subscription_item["subscriptionId"]: int(subscription_item.get("renewedQuantity") or 0)
        for subscription_item in _adobe_subscription_items(adobe_subscriptions)
        if subscription_item.get("subscriptionId")
    }
    return [
        replace(
            plan,
            renewed_quantity=renewed_by_subscription.get(plan.adobe_subscription_id, 0),
        )
        for plan in plan_subscriptions
    ]


def _resolve_current_discount_codes(
    plan_subscriptions: list[PlanSubscription], adobe_subscriptions: dict[str, object]
) -> list[PlanSubscription]:
    """Stamp each plan entry with the discount codes its Adobe subscription already holds.

    The codes are read from ``autoRenewal.flexDiscountCodes``, the ones Adobe
    applies at the next renewal, so the submission can tell a plan whose only
    change is a code from one that repeats what is already in place. A
    renewing subscription that requests codes but is missing from Adobe is
    rejected: with nothing to compare against, any code would read as new.
    """
    codes_by_subscription = {
        str(subscription_item["subscriptionId"]): _renewal_discount_codes(subscription_item)
        for subscription_item in _adobe_subscription_items(adobe_subscriptions)
        if subscription_item.get("subscriptionId")
    }
    _require_adobe_subscriptions_for_codes(plan_subscriptions, codes_by_subscription.keys())
    return [
        replace(
            plan,
            current_flex_discount_codes=codes_by_subscription.get(plan.adobe_subscription_id, ()),
        )
        for plan in plan_subscriptions
    ]


def _require_adobe_subscriptions_for_codes(
    plan_subscriptions: list[PlanSubscription], adobe_subscription_ids: Collection[str]
) -> None:
    for plan_subscription in plan_subscriptions:
        selection = plan_subscription.selection
        requests_codes = selection.renew and selection.flex_discount_codes
        if requests_codes and plan_subscription.adobe_subscription_id not in adobe_subscription_ids:
            logger.warning("Subscription %s is missing from the Adobe subscriptions", selection.id)
            raise ValidationError(detail=f"Subscription {selection.id} was not found in Adobe.")


def _renewal_discount_codes(subscription_item: dict[str, Any]) -> tuple[str, ...]:
    auto_renewal = subscription_item.get("autoRenewal") or {}
    return tuple(str(code) for code in auto_renewal.get("flexDiscountCodes") or ())


def _adobe_subscription_items(adobe_subscriptions: dict[str, object]) -> list[dict[str, Any]]:
    raw_items = adobe_subscriptions.get("items") or []
    return cast(list[dict[str, Any]], raw_items)


def _held_partial_skus(subscriptions: dict[str, object]) -> list[str]:
    """List the partial SKUs of the customer's Adobe subscriptions, for the SKU lookups."""
    raw_items = subscriptions.get("items") or []
    subscription_items = cast(list[dict[str, str]], raw_items)
    return sorted({
        get_partial_sku(subscription_item["offerId"])
        for subscription_item in subscription_items
        if subscription_item.get("offerId")
    })


async def _load_non_renewable_skus(
    ctx: APIContext, agreement: Agreement, subscriptions: dict[str, object]
) -> frozenset[str]:
    """The customer's products that can't auto-renew, such as credit packs."""
    partial_skus = _held_partial_skus(subscriptions)
    support = await load_auto_renew_support(
        ctx, partial_skus, resolve_market_segment(ctx, agreement)
    )
    return frozenset(sku for sku in partial_skus if not support.get(sku))


async def _load_adobe_subscriptions(ctx: APIContext, agreement_id: str) -> dict[str, object]:
    """Load the customer's Adobe subscriptions behind the agreement."""
    authorization_id = await get_authorization_id(ctx, agreement_id)
    customer_id = await require_customer_id(ctx, agreement_id)
    try:
        subscriptions = await asyncio.to_thread(
            adobe_client(ctx).subscription.get_subscriptions,
            authorization_id,
            customer_id,
        )
    except AdobeAPIError as error:
        logger.warning("Adobe API error loading subscriptions for %s: %s", customer_id, error)
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeHttpError as error:
        logger.warning(
            "Adobe HTTP error loading subscriptions for %s: status=%s body=%r",
            customer_id,
            error.status_code if hasattr(error, "status_code") else "?",
            error.response_content,
        )
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeError as error:
        logger.warning(
            "Adobe configuration error loading subscriptions for %s: %s", customer_id, error
        )
        raise ValidationError(detail=str(error))
    return subscriptions


async def _load_inherited_discounts(
    ctx: APIContext, agreement_id: str, currency_code: str
) -> dict[str, list[InheritedDiscount]]:
    """Load the reusables Adobe auto-applies to the customer's renewing lines.

    An automated ``PREVIEW_RENEWAL`` (no line items) returns, per renewing line,
    the flexible discounts Adobe would auto-apply and whether each still
    qualifies; the customer's held-reusable catalogue enriches them for display.
    If no subscription is set to auto-renew, Adobe returns an error, which
    means no held discounts. Any other Adobe error is raised.
    """
    authorization_id = await get_authorization_id(ctx, agreement_id)
    customer_id = await require_customer_id(ctx, agreement_id)
    try:
        return await _fetch_inherited_discounts(ctx, authorization_id, customer_id, currency_code)
    except AdobeAPIError as error:
        if error.code == NO_AUTO_RENEWAL_ERROR_CODE:
            return {}
        logger.warning("Could not load inherited discounts for %s: %s", agreement_id, error)
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeError as error:
        logger.warning("Could not load inherited discounts for %s: %s", agreement_id, error)
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)


async def _fetch_inherited_discounts(
    ctx: APIContext, authorization_id: str, customer_id: str, currency_code: str
) -> dict[str, list[InheritedDiscount]]:
    """Read the automated renewal preview and the held catalogue, then map them together.

    The two reads are independent Adobe calls, so they are started together and
    awaited as one to add no more than a single round-trip of latency.
    """
    automated_preview, held_catalogue = await asyncio.gather(
        asyncio.to_thread(
            adobe_client(ctx).order.preview_automated_renewal_order,
            authorization_id,
            customer_id,
            currency_code,
        ),
        asyncio.to_thread(
            adobe_client(ctx).discount.get_flex_discounts,
            authorization_id,
            customer_id,
        ),
    )
    return build_inherited_discounts(automated_preview, held_catalogue)


async def _preview_renewal(
    ctx: APIContext,
    agreement_id: str,
    currency_code: str,
    line_items: list[Line],
    rows: dict[int, str],
) -> dict[str, object] | None:
    """Quote the renewing lines through an Adobe PREVIEW_RENEWAL order.

    The preview carries the customer's selections — renewal quantities and the
    flexible discount codes chosen in the wizard — so Adobe validates them
    before any order exists, and returns the renewal pricing. A plan with
    nothing renewing (only lapses or net-new additions) has nothing Adobe can
    preview and skips the quote.

    Each refusal points at its wizard row (``rows``, by line number) and names
    the refused code, as ``<row>/flexDiscountCodes/<code>``, so the wizard can
    show the product and the code even for a row Adobe answered under another
    offer id.
    """
    if not line_items:
        logger.info("Renewal plan for agreement %s has no renewing lines to preview", agreement_id)
        return None
    authorization_id = await get_authorization_id(ctx, agreement_id)
    customer_id = await require_customer_id(ctx, agreement_id)
    preview, rejections = await _quote_until_accepted(
        ctx, authorization_id, customer_id, currency_code, line_items
    )
    if rejections:
        raise ValidationError(
            detail=_REJECTED_DISCOUNTS_DETAIL,
            errors=[
                ErrorDetail(pointer=_rejection_pointer(rows, rejection), detail=rejection.reason)
                for rejection in rejections
            ],
        )
    return preview


async def _quote_until_accepted(
    ctx: APIContext,
    authorization_id: str,
    customer_id: str,
    currency_code: str,
    line_items: list[Line],
) -> tuple[dict[str, Any] | None, list[_RejectedCode]]:
    """Quote the plan repeatedly until no line carries a refused discount code.

    Adobe reports one refused code at a time — a whole-request rejection names
    a single line, and a successful quote can still mark a line's code as
    failed — so a plan with several bad codes would otherwise take one wizard
    round-trip per code to uncover. Dropping the refused code and quoting again
    walks the whole plan in one request, so the customer is told about every
    rejected code at once instead of fixing them one by one. Every pass either
    drops a code or stops, so the walk is bounded by the codes submitted.

    Each refusal is recorded before the walk decides whether it can go on: a
    refusal that drops nothing (Adobe named a line that sent no code) ends the
    walk, and is reported with everything found before it rather than lost.
    """
    quoted = [dict(line) for line in line_items]
    rejections: list[_RejectedCode] = []
    while True:
        try:
            refused, preview = await _quote_once(
                ctx, authorization_id, customer_id, currency_code, quoted
            )
        except _UnidentifiedRefusalError as unnamed:
            # A refusal naming no line has no row to sit against. It fails the
            # plan on its own, but not at the cost of the rows already found.
            if rejections:
                return None, rejections
            raise ValidationError(detail=str(unnamed))
        fresh = _new_refusals(refused, rejections)
        rejections.extend(fresh)
        if not refused:
            return preview, rejections
        if not _strip_rejected_codes(quoted, fresh):
            return None, rejections


def _new_refusals(
    refused: list[_RejectedCode], recorded: list[_RejectedCode]
) -> list[_RejectedCode]:
    """Leave out a codeless refusal on a line already reported.

    Once a line's code is dropped, Adobe can refuse the same line again with
    nothing left on it to drop; that is the refusal already reported, not a new
    one.
    """
    reported_lines = {rejection.line_number for rejection in recorded}
    return [
        rejection
        for rejection in refused
        if rejection.code or rejection.line_number not in reported_lines
    ]


async def _quote_once(
    ctx: APIContext,
    authorization_id: str,
    customer_id: str,
    currency_code: str,
    line_items: list[Line],
) -> tuple[list[_RejectedCode], dict[str, Any] | None]:
    """Quote once, answering with the codes Adobe refused and the quote itself.

    A refused code reaches us two ways — as a whole-request rejection naming
    one line, or marked on a line of an otherwise successful quote — and both
    are answered the same way so the caller can drop the code and quote again.
    """
    try:
        preview = await _request_preview(
            ctx, authorization_id, customer_id, currency_code, line_items
        )
    except AdobeAPIError as error:
        if error.code not in FLEX_DISCOUNT_ERROR_CODES:
            logger.warning("Adobe rejected the renewal preview: %s", error)
            raise UpstreamServiceError(detail=str(error))
        logger.warning("Adobe rejected a flexible discount code: %s", error)
        return [_rejected_line_detail(error, line_items)], None
    return _refused_discounts(preview, line_items), preview


async def _request_preview(
    ctx: APIContext,
    authorization_id: str,
    customer_id: str,
    currency_code: str,
    line_items: list[Line],
) -> dict[str, Any]:
    """Call Adobe's PREVIEW_RENEWAL, mapping transport failures to API errors."""
    try:
        return await asyncio.to_thread(
            adobe_client(ctx).order.preview_renewal_order,
            authorization_id,
            customer_id,
            currency_code,
            line_items,
        )
    except AdobeAPIError:
        raise
    except AdobeHttpError as error:
        logger.warning(
            "Adobe HTTP error on renewal preview: status=%s body=%r",
            error.status_code if hasattr(error, "status_code") else "?",
            error.response_content,
        )
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeError as error:
        logger.warning("Adobe configuration error on renewal preview: %s", error)
        raise ValidationError(detail=str(error))


def _refused_discounts(preview: dict[str, Any], line_items: list[Line]) -> list[_RejectedCode]:
    """Collect the selected codes a successful quote did not confirm.

    Adobe answers the preview successfully even when it refused a code, marking
    the outcome per line instead of failing the call, so the quote it returns is
    priced without that discount and would otherwise read as if the code had
    applied. A code the customer selected counts as applied only when its line
    reports it with result ``SUCCESS``; a missing result, or no entry at all,
    is not a confirmation.

    Each answered line is matched to the line we sent by ``extLineItemNumber``.
    A discount Adobe reports on a line that did not send it (a reusable code
    the customer already holds) is not the customer's choice: it is logged and
    never blocks the plan.
    """
    requested = {line["extLineItemNumber"]: line for line in line_items}
    answered = {
        _match_request_line(requested, answered_line)["extLineItemNumber"]: answered_line
        for answered_line in preview.get("lineItems") or []
    }
    return [
        rejection
        for line_number, request_line in requested.items()
        for rejection in _unconfirmed_codes(request_line, answered.get(line_number) or {})
    ]


def _match_request_line(requested: dict[int, Line], answered_line: Line) -> Line:
    """Find the request line an answered line belongs to, or fail the preview.

    The number is the key; the subscription id is only checked when Adobe
    echoes one, because it leaves it empty on some previews. The offer id is
    never compared: Adobe changes it legitimately (the level suffix).
    """
    line_number = answered_line.get("extLineItemNumber")
    request_line = requested.get(cast(int, line_number))
    if request_line is None:
        logger.warning("Adobe answered renewal preview line %s, which was not sent", line_number)
        raise UpstreamServiceError(
            detail=f"Adobe answered the renewal preview with line {line_number}, "
            "which the request did not send.",
        )
    answered_subscription = answered_line.get("subscriptionId") or ""
    sent_subscription = request_line.get("subscriptionId") or ""
    if answered_subscription and answered_subscription != sent_subscription:
        logger.warning(
            "Adobe answered renewal preview line %s for subscription %s, sent for %r",
            line_number,
            answered_subscription,
            sent_subscription,
        )
        raise UpstreamServiceError(
            detail=f"Adobe answered renewal preview line {line_number} for another "
            "subscription than the one the request sent.",
        )
    return request_line


def _unconfirmed_codes(request_line: Line, answered_line: Line) -> list[_RejectedCode]:
    """Read which of a line's selected codes its answer did not confirm."""
    outcomes = {
        discount.get("code"): discount.get("result")
        for discount in answered_line.get("flexDiscounts") or []
    }
    selected = request_line.get("flexDiscountCodes") or []
    _log_unselected_refusals(outcomes, selected)
    refused = []
    for code in selected:
        outcome = str(outcomes.get(code) or "")
        if outcome != FLEX_DISCOUNT_SUCCESS_RESULT:
            logger.warning(
                "Adobe did not confirm discount %s (%r) on a preview line", code, outcome
            )
            refused.append(
                _RejectedCode(
                    line_number=request_line["extLineItemNumber"], code=code, reason=outcome
                )
            )
    return refused


def _log_unselected_refusals(outcomes: dict[Any, Any], selected: list[str]) -> None:
    """Log the discounts Adobe did not apply that the line never sent."""
    unselected = {
        code: outcome
        for code, outcome in outcomes.items()
        if code not in selected and outcome != FLEX_DISCOUNT_SUCCESS_RESULT
    }
    if unselected:
        logger.info("Adobe did not apply unselected discount(s) %s on a preview line", unselected)


def _rejected_line_detail(error: AdobeAPIError, line_items: list[Line]) -> _RejectedCode:
    """Name the line Adobe refused a code on, from its ``additionalDetails``.

    Adobe fails the entire preview when a line carries a code the customer
    cannot use, naming the offending line in ``additionalDetails`` rather than
    in the message. Reporting it against that line is what lets the wizard say
    which subscription the code was refused for, instead of failing the plan
    with one message that names nothing. The reason is Adobe's own error code
    unless the payload names the criterion that failed.

    A refusal whose line cannot be identified has no row to sit against, so it
    fails the plan carrying Adobe's own message rather than reaching the wizard
    as a rejection naming no code and no subscription.
    """
    rejected_line = _find_line(line_items, _parse_rejected_line_number(error.details))
    if not rejected_line:
        logger.warning("Adobe refused a discount code without naming a line: %s", error)
        raise _UnidentifiedRefusalError(str(error))
    codes = rejected_line.get("flexDiscountCodes") or [""]
    return _RejectedCode(
        line_number=rejected_line["extLineItemNumber"],
        code=str(codes[0]),
        reason=_rejection_reason(error),
    )


def _rejection_reason(error: AdobeAPIError) -> str:
    """Read the criterion Adobe named for a refusal, or fall back to its code.

    Adobe names the criterion after ``Reason:`` in the same detail that names
    the line, and only for the refusals that have one — a line carrying two
    codes is reported without a reason at all. The error code is the fallback,
    so every refusal still resolves to copy of ours.
    """
    for detail in error.details:
        matched = re.search(FLEX_DISCOUNT_REASON_PATTERN, str(detail))
        if matched:
            return matched.group(1).strip()
    if re.fullmatch(FLEX_DISCOUNT_BARE_REASON_PATTERN, error.message or ""):
        return error.message
    return str(error.code)


def _strip_rejected_codes(line_items: list[Line], refused: list[_RejectedCode]) -> bool:
    """Drop each refused code from the line Adobe refused it on.

    Answers whether any line actually lost one: a refusal that leaves the plan
    as it was would be quoted to the same answer, so the caller stops instead.
    """
    rejected_by_line = _rejected_codes_by_line(refused)
    stripped = False
    for line in line_items:
        held = line.get("flexDiscountCodes") or []
        codes = [
            code
            for code in held
            if code not in rejected_by_line.get(line["extLineItemNumber"], set())
        ]
        stripped = stripped or len(codes) != len(held)
        if codes:
            line["flexDiscountCodes"] = codes
        else:
            line.pop("flexDiscountCodes", None)
    return stripped


def _rejected_codes_by_line(refused: list[_RejectedCode]) -> dict[int, set[str]]:
    """Group the refused codes by the line Adobe named, so only that line loses one.

    Two rows can carry the same code and qualify differently, so dropping it
    everywhere would hide the second row's refusal until the next submission.
    """
    by_line: dict[int, set[str]] = {}
    for rejection in refused:
        by_line.setdefault(rejection.line_number, set()).add(rejection.code)
    return by_line


def _line_rows(line_items: list[Line], net_new_lines: list[NetNewLine]) -> dict[int, str]:
    """Name the wizard row behind each request line, by line number.

    A renewing row is known by its Adobe subscription id; a new-product row by
    the identifier the wizard sent for it (the partial SKU), never the full
    Adobe offer id the line carries. New-product lines follow the renewing
    ones, in plan order.
    """
    net_new_rows = iter([net_new.selection.offer_id for net_new in net_new_lines])
    return {
        line["extLineItemNumber"]: str(line.get("subscriptionId") or next(net_new_rows, ""))
        for line in line_items
    }


def _rejection_pointer(rows: dict[int, str], rejection: _RejectedCode) -> str:
    """Point a refusal at its wizard row and, when there is one, its code."""
    row = rows.get(rejection.line_number, "")
    return f"{row}/flexDiscountCodes/{rejection.code}" if rejection.code else row


def _parse_rejected_line_number(details: list[Any]) -> int | None:
    """Read the line number out of Adobe's ``"Line Item: 2"`` detail."""
    for detail in details:
        matched = re.search(FLEX_DISCOUNT_LINE_PATTERN, str(detail))
        if matched:
            return int(matched.group(1))
    return None


def _find_line(line_items: list[Line], line_number: int | None) -> Line:
    """Find the previewed line Adobe rejected, or an empty one when unnamed."""
    return next(
        (line for line in line_items if line["extLineItemNumber"] == line_number),
        {},
    )


async def _create_change_order(
    ctx: APIContext,
    agreement_id: str,
    lines: list[Line],
    renewal_payload: RenewalPayload,
    body: RenewalOrderRequest,
) -> dict[str, object]:
    """Create and process the change order acting as the caller (client actor)."""
    client = build_caller_client(ctx)
    if client is None:
        logger.warning("Renewal order for agreement %s has no caller auth context", agreement_id)
        raise ForbiddenError(detail="Caller authentication is required to place the order.")
    try:
        return await create_renewal_change_order(client, agreement_id, lines, renewal_payload, body)
    except MPTHttpError as error:
        logger.warning(
            "MPT API error while placing the renewal change order on agreement %s: status=%s %s",
            agreement_id,
            error.status_code,
            error,
        )
        raise UpstreamServiceError(detail=mpt_order_error_detail(error))


def _configuration_renewal_payload(
    agreement: Agreement,
    plan_subscriptions: list[PlanSubscription],
    body: RenewalOrderRequest,
) -> RenewalPayload:
    """Build the plan snapshot a quantity-less renewal plan still has to carry.

    When nothing moves a quantity the submission carries no order lines, and
    the Configuration order's subscriptions set only the AutoRenew flags. The
    rest of the plan (discount codes, renewal quantities, the recommendation
    tracker id and, on the early path, the decision to renew now) reaches
    fulfilment only through this snapshot, so it rides on either path. The plan
    arrives already stamped with its full Adobe offer ids and, on the early
    path, renewed quantities (the endpoint resolves both from one Adobe
    subscriptions load), so the snapshot is ready to build.
    """
    currency_code = agreement.authorization.currency if agreement.authorization else ""
    return build_renewal_payload(plan_subscriptions, [], body, currency_code or "")


async def _create_configuration_order(
    ctx: APIContext,
    agreement_id: str,
    subscriptions: list[Line],
    body: RenewalOrderRequest,
    renewal_payload: RenewalPayload,
) -> dict[str, object]:
    """Create the AutoRenew-only configuration order acting as the caller (client actor)."""
    client = build_caller_client(ctx)
    if client is None:
        logger.warning("Renewal order for agreement %s has no caller auth context", agreement_id)
        raise ForbiddenError(detail="Caller authentication is required to place the order.")
    try:
        return await create_renewal_configuration_order(
            client, agreement_id, subscriptions, body, renewal_payload
        )
    except MPTHttpError as error:
        logger.warning(
            "MPT API error while placing the renewal configuration order on agreement %s: "
            "status=%s %s",
            agreement_id,
            error.status_code,
            error,
        )
        raise UpstreamServiceError(detail=mpt_order_error_detail(error))
