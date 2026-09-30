import logging
from functools import partial
from http import HTTPStatus
from typing import Any, NamedTuple, cast

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
from mpt_extension_sdk.models import Agreement, Subscription, SubscriptionLine
from mpt_extension_sdk.routing import APIRouter

from mpt_adobe_vipm_ef.context import adobe_client
from mpt_adobe_vipm_ef.models.switch import (
    SwitchPayload,
    UpgradeOrderRequest,
    UpgradePreviewRequest,
    build_switch_payload,
)
from mpt_adobe_vipm_ef.routers.api.customer import (
    get_authorization_id,
    load_agreement,
    require_customer_id,
    validate_agreement_access,
)
from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs
from mpt_adobe_vipm_ef.services.clients import build_caller_client
from mpt_adobe_vipm_ef.services.discount_preview import (
    preview_with_discounts,
    request_adobe_preview,
)
from mpt_adobe_vipm_ef.services.items import get_partial_sku, resolve_items_by_sku
from mpt_adobe_vipm_ef.services.subscriptions import find_existing_target_line
from mpt_adobe_vipm_ef.services.switch_order import (
    build_change_order_lines,
    create_switch_change_order,
    mpt_order_error_detail,
    require_active_agreement,
)

logger = logging.getLogger(__name__)

upgrade_router = APIRouter(prefix="/agreements")


class _SwitchSelection(NamedTuple):
    """The customer's switch selection, validated and resolved against the agreement."""

    source_line: SubscriptionLine
    adobe_subscription_id: str
    target_item_id: str
    switch_payload: SwitchPayload


@upgrade_router.post(
    path="/{agreement_id}/subscriptions/{subscription_id}/upgrade-order/preview",
    name="agreements-upgrade-order-preview",
    body_validator=UpgradePreviewRequest,
)
@validate_agreement_access
@log_inputs
async def preview_upgrade_order(
    agreement_id: str, subscription_id: str, ctx: APIContext, body: UpgradePreviewRequest
) -> APIResponse:
    """Quote the mid-term upgrade through an Adobe ``PREVIEW_SWITCH`` order.

    The wizard calls this on the Promotions step, before it advances: the
    selection is validated exactly as the submission validates it, and the
    flexible discount code the customer picked rides the target line of the
    quoted switch, so Adobe adjudicates the code before any order exists.
    Every refused code is answered as a ``422`` whose ``errors`` name the
    target offer (``pointer``) and Adobe's reason (``detail``). On success the
    Adobe quote is returned under ``preview`` so the wizard can show the
    discounted price on Review order.
    """
    selection = await _resolve_switch_selection(ctx, agreement_id, subscription_id, body)
    preview = await _preview_switch(ctx, agreement_id, selection.switch_payload, fetch_price=True)
    return APIResponse.ok(payload={"preview": preview})


@upgrade_router.post(
    path="/{agreement_id}/subscriptions/{subscription_id}/upgrade-order",
    name="agreements-upgrade-order",
    body_validator=UpgradeOrderRequest,
)
@validate_agreement_access
@log_inputs
async def create_upgrade_order(
    agreement_id: str, subscription_id: str, ctx: APIContext, body: UpgradeOrderRequest
) -> APIResponse:
    """Submit a mid-term upgrade as a switch-driven change order.

    Validates the customer's selection, gates it through an Adobe
    ``PREVIEW_SWITCH`` quote — carrying the flexible discount code applied on
    the target line, so a code Adobe refuses fails here with the same
    ``422`` the preview answers — and only then creates the change order
    (directly in Processing status) carrying the hidden ``switchPayload``
    DataObject parameter.
    """
    selection = await _resolve_switch_selection(ctx, agreement_id, subscription_id, body)

    await _preview_switch(ctx, agreement_id, selection.switch_payload)

    target_line = await find_existing_target_line(
        ctx, agreement_id, selection.adobe_subscription_id, body.target_offer_id
    )
    lines = build_change_order_lines(
        selection.source_line, body.quantity, target_line, selection.target_item_id
    )
    order = await _create_change_order(ctx, agreement_id, lines, selection.switch_payload, body)
    return APIResponse.created(payload=order)


async def _resolve_switch_selection(
    ctx: APIContext, agreement_id: str, subscription_id: str, body: UpgradePreviewRequest
) -> _SwitchSelection:
    """Validate the customer's selection and build the switch snapshot it describes.

    Shared by the preview and the submission, so a selection the preview
    accepts is exactly the one the submission would place.
    """
    if not ctx.auth.account.is_client():
        raise ForbiddenError(detail="The mid-term upgrade is available to client accounts only.")
    agreement = await load_agreement(ctx, agreement_id)
    require_active_agreement(agreement)
    source_line, adobe_subscription_id = await _load_switch_source(ctx, agreement, subscription_id)
    _validate_quantity(body.quantity, source_line.quantity)

    target_item_id = await _require_target_item_id(ctx, agreement, body.target_offer_id)
    switch_payload = build_switch_payload(
        body, adobe_subscription_id, cast(str, agreement.authorization.currency)
    )
    return _SwitchSelection(source_line, adobe_subscription_id, target_item_id, switch_payload)


async def _load_switch_source(
    ctx: APIContext, agreement: Agreement, subscription_id: str
) -> tuple[SubscriptionLine, str]:
    """Load the source subscription and extract its line and Adobe subscription id.

    Ensures the subscription belongs to the agreement and carries what the
    switch needs: at least one line and the Adobe (vendor) subscription id.
    """
    subscription = await _load_subscription(ctx, agreement, subscription_id)
    if not subscription.lines:
        logger.warning("Subscription %s has no lines", subscription_id)
        raise ValidationError(detail="The source subscription has no lines.")
    adobe_subscription_id = subscription.external_ids.vendor
    if not adobe_subscription_id:
        logger.warning("Subscription %s is missing the Adobe subscription id", subscription_id)
        raise ValidationError(
            detail="The source subscription is missing the Adobe subscription identifier.",
        )
    return subscription.lines[0], adobe_subscription_id


async def _load_subscription(
    ctx: APIContext, agreement: Agreement, subscription_id: str
) -> Subscription:
    """Load the source subscription, ensuring it belongs to the agreement."""
    agreement_subscription_ids = {subscription.id for subscription in agreement.subscriptions}
    if subscription_id not in agreement_subscription_ids:
        logger.warning(
            "Subscription %s does not belong to agreement %s", subscription_id, agreement.id
        )
        raise NotFoundError(detail="Subscription not found on the agreement.")
    try:
        return await ctx.mpt_api_service.subscriptions.get_by_id(subscription_id)
    except MPTHttpError as error:
        if error.status_code == HTTPStatus.NOT_FOUND:
            logger.warning("Subscription %s not found: %s", subscription_id, error)
            raise NotFoundError(detail="Subscription not found.")
        logger.warning(
            "MPT API error while loading subscription %s: status=%s %s",
            subscription_id,
            error.status_code,
            error,
        )
        raise UpstreamServiceError(detail="MPT service request failed")


def _validate_quantity(quantity: int, source_quantity: int) -> None:
    """Reject quantities outside 1..source; equality means a full upgrade."""
    if quantity > source_quantity:
        raise ValidationError(
            detail="The upgrade quantity cannot exceed the source subscription quantity.",
            errors=[
                ErrorDetail(
                    pointer="#/quantity",
                    detail=f"Must be between 1 and {source_quantity}.",
                ),
            ],
        )


async def _require_target_item_id(
    ctx: APIContext, agreement: Agreement, target_offer_id: str
) -> str:
    partial_sku = get_partial_sku(target_offer_id)
    product_items = await resolve_items_by_sku(ctx, agreement.product.id, [partial_sku])
    product_item = product_items.get(partial_sku)
    if product_item is None or not product_item.get("id"):
        logger.warning(
            "Target offer %s has no catalog item for product %s",
            target_offer_id,
            agreement.product.id,
        )
        raise ValidationError(
            detail="The target offer is not available in the product catalog.",
            errors=[ErrorDetail(pointer="#/targetOfferId", detail="Unknown offer.")],
        )
    return cast(str, product_item["id"])


async def _preview_switch(
    ctx: APIContext,
    agreement_id: str,
    switch_payload: SwitchPayload,
    *,
    fetch_price: bool = False,
) -> dict[str, Any] | None:
    """Quote the exact snapshot through an Adobe PREVIEW_SWITCH order.

    Every pass re-sends the same cancelling items: only the target line's
    discount code changes while the refused codes are walked.
    """
    authorization_id = await get_authorization_id(ctx, agreement_id)
    customer_id = await require_customer_id(ctx, agreement_id)
    payload = switch_payload.to_dict()
    quote = partial(
        request_adobe_preview,
        "switch",
        adobe_client(ctx).order.preview_switch_order,
        authorization_id,
        customer_id,
        switch_payload.currency_code,
        cancelling_items=payload["cancellingItems"],
        recommendation_tracker_id=switch_payload.recommendation_tracker_id,
        fetch_price=fetch_price,
    )
    return await preview_with_discounts(quote, payload["lineItems"])


async def _create_change_order(
    ctx: APIContext,
    agreement_id: str,
    lines: list[dict[str, Any]],
    switch_payload: SwitchPayload,
    body: UpgradeOrderRequest,
) -> dict[str, Any]:
    """Create and process the change order acting as the caller (client actor)."""
    client = build_caller_client(ctx)
    if client is None:
        logger.warning("Upgrade order for agreement %s has no caller auth context", agreement_id)
        raise ForbiddenError(detail="Caller authentication is required to place the order.")
    try:
        return await create_switch_change_order(client, agreement_id, lines, switch_payload, body)
    except MPTHttpError as error:
        logger.warning(
            "MPT API error while placing the switch change order on agreement %s: status=%s %s",
            agreement_id,
            error.status_code,
            error,
        )
        raise UpstreamServiceError(detail=mpt_order_error_detail(error))
