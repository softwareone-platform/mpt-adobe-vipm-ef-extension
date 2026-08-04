import asyncio
import logging
from http import HTTPStatus

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
from mpt_adobe_vipm_ef.context import adobe_client
from mpt_adobe_vipm_ef.models.renewal import (
    RenewalOrderRequest,
    RenewalPlanRequest,
    RenewalPreviewRequest,
    RenewalSubscriptionSelection,
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
from mpt_adobe_vipm_ef.services.renewal import require_scheduled_creation_window
from mpt_adobe_vipm_ef.services.renewal_order import (
    build_renewal_order_lines,
    create_renewal_change_order,
)
from mpt_adobe_vipm_ef.services.renewal_plan import (
    Line,
    NetNewLine,
    PlanSubscription,
    build_flexible_discounts_value,
    build_preview_renewal_line_items,
    require_renewal_selections,
    resolve_net_new_lines,
)
from mpt_adobe_vipm_ef.services.renewal_three_yc import check_renewal_plan_three_yc_floor
from mpt_adobe_vipm_ef.services.switch_order import (
    mpt_order_error_detail,
    require_active_agreement,
)

logger = logging.getLogger(__name__)

renewal_router = APIRouter(prefix="/agreements")

_ADOBE_REQUEST_FAILED_DETAIL = "Adobe service request failed"


@renewal_router.post(
    path="/{agreement_id}/renewal-order/3yc-check",
    name="agreements-renewal-order-3yc-check",
    body_validator=RenewalPlanRequest,
)
@validate_agreement_access
@log_inputs
async def check_renewal_order_three_yc(
    agreement_id: str, ctx: APIContext, body: RenewalPlanRequest
) -> APIResponse:
    """Pre-check the renewal plan against the customer's 3YC minimum quantities.

    The wizard calls this while the customer selects the plan's items, before
    the discount codes step: a decrease or a disabled renewal that would place
    a committed customer below the three-year commitment floors fails here
    with a wizard-friendly message instead of a rejected order. Returns the
    check summary (the totals compared and the floors) when the plan holds.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)
    require_renewal_selections(body)

    plan_subscriptions = await _load_plan_subscriptions(ctx, agreement, body.subscriptions)
    net_new_lines = await resolve_net_new_lines(ctx, agreement, body.net_new_items)
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
async def preview_renewal_plan(
    agreement_id: str, ctx: APIContext, body: RenewalPreviewRequest
) -> APIResponse:
    """Quote the renewal plan through an Adobe ``PREVIEW_RENEWAL`` order.

    The wizard calls this on the discount codes step: the selected flexible
    discount codes ride on every renewing line, so Adobe validates their
    eligibility and returns the renewal pricing the wizard shows as the
    estimate. Net-new products have no Adobe subscription to preview yet and
    are priced only at fulfilment.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)

    plan_subscriptions = await _load_plan_subscriptions(ctx, agreement, body.subscriptions)
    line_items = build_preview_renewal_line_items(plan_subscriptions, body.flex_discount_codes)
    if not line_items:
        raise ValidationError(
            detail="The renewal plan has no renewing subscriptions to preview.",
        )
    currency_code = agreement.authorization.currency or ""
    preview = await _preview_renewal(ctx, agreement_id, currency_code, line_items)
    return APIResponse.ok(payload=preview)


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
    """Submit an at-anniversary renewal plan as a renewal-driven change order.

    Validates the customer's plan, re-checks the 3YC commitment floors, gates
    the plan through an Adobe ``PREVIEW_RENEWAL`` quote carrying the
    selections (quantities and flexible discount codes), and only then creates
    the change order (directly in Processing status) carrying the selected
    codes and the recommendation tracker id on the ``flexibleDiscounts``
    fulfillment parameter.
    """
    _require_client_account(ctx)
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)
    require_renewal_selections(body)

    plan_subscriptions = await _load_plan_subscriptions(ctx, agreement, body.subscriptions)
    net_new_lines = await resolve_net_new_lines(ctx, agreement, body.net_new_items)
    customer = await _load_adobe_customer(ctx, agreement_id)
    await _check_three_yc_floor(ctx, agreement, customer, plan_subscriptions, net_new_lines)
    if net_new_lines:
        require_scheduled_creation_window(str(customer.get("cotermDate") or ""))

    currency_code = agreement.authorization.currency or ""
    preview_line_items = build_preview_renewal_line_items(
        plan_subscriptions, body.flex_discount_codes
    )
    await _preview_renewal(ctx, agreement_id, currency_code, preview_line_items)

    lines = build_renewal_order_lines(plan_subscriptions, net_new_lines)
    flexible_discounts = build_flexible_discounts_value(plan_subscriptions, body)
    order = await _create_change_order(ctx, agreement_id, lines, flexible_discounts, body)
    return APIResponse.created(payload=order)


def _require_client_account(ctx: APIContext) -> None:
    if ctx.auth is None or not ctx.auth.account.is_client():
        raise ForbiddenError(
            detail="The at-anniversary renewal is available to client accounts only.",
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
    flexible_discounts: Line | None,
    body: RenewalOrderRequest,
) -> dict[str, object]:
    """Create and process the change order acting as the caller (client actor)."""
    client = build_caller_client(ctx)
    if client is None:
        logger.warning("Renewal order for agreement %s has no caller auth context", agreement_id)
        raise ForbiddenError(detail="Caller authentication is required to place the order.")
    try:
        return await create_renewal_change_order(
            client, agreement_id, lines, flexible_discounts, body
        )
    except MPTHttpError as error:
        logger.warning(
            "MPT API error while placing the renewal change order on agreement %s: status=%s %s",
            agreement_id,
            error.status_code,
            error,
        )
        raise UpstreamServiceError(detail=mpt_order_error_detail(error))
