import asyncio
import logging
from dataclasses import replace
from http import HTTPStatus
from typing import cast

from mpt_api_client.exceptions import MPTHttpError
from mpt_extension_sdk.api import (
    APIContext,
    APIResponse,
    ForbiddenError,
    NotFoundError,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.models import Agreement, Subscription
from mpt_extension_sdk.routing import APIRouter

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.constants import (
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
    is_renewal_window_open,
    require_unlocked_anniversary_path,
    resolve_locked_path,
)
from mpt_adobe_vipm_ef.services.renewal_plan import (  # noqa: WPS235
    Line,
    NetNewLine,
    PlanSubscription,
    build_preview_renewal_line_items,
    build_renewal_payload,
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
async def get_renewal_path_state(agreement_id: str, ctx: APIContext) -> APIResponse:
    """Report whether a renewal can be planned today and which path is established.

    The wizard's first step reads this before it offers a path: outside the
    window — or with no active subscription to renew — there is nothing to plan,
    and the step says so instead of walking the customer into an Adobe
    rejection. ``lockedPath`` is set once an early renewal has rolled the
    anniversary forward, which fixes the path to ``now`` and makes the step
    read-only.
    """
    _require_client_account(ctx)
    customer = await _load_adobe_customer(ctx, agreement_id)
    subscriptions = await _load_adobe_subscriptions(ctx, agreement_id)
    coterm_date = str(customer.get("cotermDate") or "")
    locked_path = resolve_locked_path(coterm_date, subscriptions)
    return APIResponse.ok(
        payload={
            "anniversaryDate": coterm_date,
            "windowOpen": is_renewal_window_open(coterm_date),
            "windowOpensDays": SCHEDULED_CREATION_WINDOW_OPENS_DAYS,
            "windowClosesDays": SCHEDULED_CREATION_WINDOW_CLOSES_DAYS,
            "hasActiveSubscriptions": has_active_subscriptions(subscriptions),
            "lockedPath": locked_path.value if locked_path else None,
        },
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

    The at-anniversary wizard calls this on the discount codes step: the
    selected flexible discount codes ride on every renewing line, so Adobe
    validates their eligibility and returns the renewal pricing the wizard
    shows as the estimate. Net-new products have no Adobe subscription to
    preview yet on that path and are priced only at fulfilment.

    The early-renewal ("Renew now") wizard calls it on every step that changes
    the basket — the items and the discount codes — because the RENEWAL order
    is placed now, which makes Adobe the authority on whether the basket is
    valid: the preview carries the additions too, so a mixed renew-and-add
    basket (which Adobe forbids in one order) is rejected in the wizard instead
    of at fulfilment. A SKU that cannot renew at the anniversary is rejected
    here too, so no route quotes a plan the submit route would refuse.

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
    plan_subscriptions = await _resolve_renewal_offer_ids(ctx, agreement_id, plan_subscriptions)
    net_new_lines = await _resolve_preview_net_new_lines(ctx, agreement, body)
    line_items = build_preview_renewal_line_items(
        plan_subscriptions, body.flex_discount_codes, net_new_lines
    )
    if not line_items:
        raise ValidationError(
            detail="The renewal plan has no renewing subscriptions to preview.",
        )
    currency_code = agreement.authorization.currency or ""
    preview = await _preview_renewal(ctx, agreement_id, currency_code, line_items)
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
    AutoRenew value does not change) — plus, on the early-renewal path alone,
    the same plan snapshot on that context's own ``renewalPayload`` parameter,
    since renewing now is executed against Adobe whether or not a quantity
    moved. At the anniversary the platform accepts neither order type for a
    plan with no real change, so that case is rejected upfront; renewing now
    is always a change, so a plan that repeats the current quantities and
    AutoRenew decisions still becomes a Change order carrying the platform's
    ``adobe-early-renewal-no-change`` placeholder item as its single line,
    with fulfillment executing the plan from the snapshot alone.
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
    if net_new_lines:
        require_scheduled_creation_window(coterm_date)
    if body.renewal_path is RenewalPath.ANNIVERSARY:
        require_unlocked_anniversary_path(
            coterm_date, await _load_adobe_subscriptions(ctx, agreement_id)
        )

    lines = build_renewal_order_lines(plan_subscriptions, net_new_lines)
    if lines:
        currency_code = agreement.authorization.currency or ""
        plan_subscriptions = await _resolve_renewal_offer_ids(ctx, agreement_id, plan_subscriptions)
        net_new_lines = await resolve_net_new_offer_ids(
            ctx, net_new_lines, lambda: resolve_market_segment(ctx, agreement)
        )
        renewal_payload = build_renewal_payload(
            plan_subscriptions, net_new_lines, body, currency_code
        )
        order = await _create_change_order(ctx, agreement_id, lines, renewal_payload, body)
    else:
        configuration_subscriptions = build_configuration_order_subscriptions(plan_subscriptions)
        early_payload = await _early_renewal_payload(ctx, agreement, plan_subscriptions, body)
        if configuration_subscriptions or early_payload is None:
            order = await _create_configuration_order(
                ctx, agreement_id, configuration_subscriptions, body, early_payload
            )
        else:
            # An unchanged early renewal: neither order type stands on its own,
            # so the Change order rides on the catalog's placeholder item and
            # fulfilment executes the plan from the renewalPayload snapshot.
            no_change_line = await resolve_no_change_line(ctx, agreement)
            order = await _create_change_order(
                ctx, agreement_id, [no_change_line], early_payload, body
            )
    return APIResponse.created(payload=order)


def _require_client_account(ctx: APIContext) -> None:
    if ctx.auth is None or not ctx.auth.account.is_client():
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
    floor pre-check) and its coterm date (for the net-new scheduling window),
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


async def _resolve_renewal_offer_ids(
    ctx: APIContext, agreement_id: str, plan_subscriptions: list[PlanSubscription]
) -> list[PlanSubscription]:
    """Override each renewing line's offer id with Adobe's own, before it is previewed.

    MPT's subscription and catalog data only ever carries the partial
    (10-char) vendor SKU on ``selection.offer_id``; Adobe's PREVIEW_RENEWAL
    (and the order it gates) needs the full offer id, which only the
    customer's live Adobe subscriptions have. Skipped when nothing renews, so
    a lapse-only or net-new-only plan does not pay for the extra Adobe call.
    """
    if not any(plan.selection.renew for plan in plan_subscriptions):
        return plan_subscriptions
    offer_ids_by_subscription = await _load_adobe_subscription_offer_ids(ctx, agreement_id)
    return [
        replace(
            plan,
            offer_id=offer_ids_by_subscription.get(plan.adobe_subscription_id) or plan.offer_id,
        )
        for plan in plan_subscriptions
    ]


async def _load_adobe_subscription_offer_ids(ctx: APIContext, agreement_id: str) -> dict[str, str]:
    """Map each Adobe subscription id to its current full offer id.

    ``GET /v3/customers/{customer_id}/subscriptions`` is the only source of
    the full offer id: MPT's subscription and its catalog item both only ever
    carry the partial vendor SKU.
    """
    subscriptions = await _load_adobe_subscriptions(ctx, agreement_id)
    raw_items = subscriptions.get("items") or []
    subscription_items = cast(list[dict[str, str]], raw_items)
    return {
        subscription_item["subscriptionId"]: subscription_item["offerId"]
        for subscription_item in subscription_items
        if subscription_item.get("subscriptionId") and subscription_item.get("offerId")
    }


def _held_partial_skus(subscriptions: dict[str, object]) -> list[str]:
    """List the partial SKUs of the customer's Adobe subscriptions, for the SKU lookups."""
    raw_items = subscriptions.get("items") or []
    subscription_items = cast(list[dict[str, str]], raw_items)
    return sorted({
        get_partial_sku(subscription_item["offerId"])
        for subscription_item in subscription_items
        if subscription_item.get("offerId")
    })


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


async def _preview_renewal(
    ctx: APIContext, agreement_id: str, currency_code: str, line_items: list[Line]
) -> dict[str, object] | None:
    """Quote the renewing lines through an Adobe PREVIEW_RENEWAL order.

    The preview carries the customer's selections — renewal quantities and the
    flexible discount codes chosen in the wizard — so Adobe validates them
    before any order exists, and returns the renewal pricing. A plan with
    nothing renewing (only lapses or net-new additions) has nothing Adobe can
    preview and skips the quote.
    """
    if not line_items:
        logger.info("Renewal plan for agreement %s has no renewing lines to preview", agreement_id)
        return None
    authorization_id = await get_authorization_id(ctx, agreement_id)
    customer_id = await require_customer_id(ctx, agreement_id)
    try:
        return await asyncio.to_thread(
            adobe_client(ctx).order.preview_renewal_order,
            authorization_id,
            customer_id,
            currency_code,
            line_items,
        )
    except AdobeAPIError as error:
        logger.warning("Adobe rejected the renewal preview: %s", error)
        raise UpstreamServiceError(detail=str(error))
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


async def _early_renewal_payload(
    ctx: APIContext,
    agreement: Agreement,
    plan_subscriptions: list[PlanSubscription],
    body: RenewalOrderRequest,
) -> RenewalPayload | None:
    """Build the plan snapshot a quantity-less early renewal still has to carry.

    An early renewal ("Renew now") is executed against Adobe as soon as the
    order processes, so fulfilment needs the plan even when nothing moved a
    quantity and the submission is a Configuration order: without it the order
    would only carry the AutoRenew decisions and the ``now`` path would be
    invisible. The renewing lines get their full Adobe offer ids here for the
    same reason the Change path resolves them. At the anniversary the
    configuration order is the whole plan already, so there is no snapshot to
    attach.
    """
    if body.renewal_path is not RenewalPath.NOW:
        return None
    plan_subscriptions = await _resolve_renewal_offer_ids(ctx, agreement.id, plan_subscriptions)
    currency_code = agreement.authorization.currency if agreement.authorization else ""
    return build_renewal_payload(plan_subscriptions, [], body, currency_code or "")


async def _create_configuration_order(
    ctx: APIContext,
    agreement_id: str,
    subscriptions: list[Line],
    body: RenewalOrderRequest,
    renewal_payload: RenewalPayload | None,
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
