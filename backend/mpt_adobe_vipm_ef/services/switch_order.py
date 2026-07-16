import logging
from http import HTTPStatus
from typing import Any

from mpt_api_client.exceptions import MPTAPIError, MPTHttpError
from mpt_extension_sdk.api import ValidationError
from mpt_extension_sdk.models import Agreement
from mpt_extension_sdk.models.agreement import AgreementLine
from mpt_extension_sdk.models.subscription import SubscriptionLine
from mpt_extension_sdk.services.api_client_v2.mpt_api_client import AsyncMPTClient

from mpt_adobe_vipm_ef.constants import (
    ACTIVE_AGREEMENT_STATUS,
    CHANGE_ORDER_TYPE,
    PROCESSING_ORDER_STATUS,
    SWITCH_PAYLOAD_PARAM,
)
from mpt_adobe_vipm_ef.models.switch import SwitchPayload

logger = logging.getLogger(__name__)

Line = dict[str, Any]


def require_active_agreement(agreement: Agreement) -> None:
    """Reject the submission early when the agreement cannot take orders.

    The platform only accepts orders on Active agreements; failing here gives
    the wizard a clear message before any Adobe call is made.
    """
    if agreement.status != ACTIVE_AGREEMENT_STATUS:
        raise ValidationError(
            detail=(
                "Orders can only be created for Active agreements. "
                f"The agreement is currently {agreement.status}."
            ),
        )


def find_agreement_line_by_sku(
    agreement: Agreement, partial_sku: str, source_line_id: str
) -> AgreementLine | None:
    """Find the agreement line already holding the target SKU, if any.

    Each SKU has at most one active subscription on an agreement; when a line
    for the target offer exists, the change order tops up that line instead of
    creating a new subscription.
    """
    return next(
        (
            line
            for line in agreement.lines
            if line.id != source_line_id and line.product_item.external_ids.vendor == partial_sku
        ),
        None,
    )


def build_change_order_lines(
    source_line: SubscriptionLine,
    quantity: int,
    target_line: AgreementLine | None,
    target_item_id: str,
) -> list[Line]:
    """Build the change order lines for the customer's switch selection.

    Quantities are absolute (the line's state after the change). A full upgrade
    (the whole source quantity switches) carries only the target line: the
    source subscription is terminated as a side-effect of fulfilling the
    switch, not by this order. A partial upgrade also carries the source line
    decremented to its residual quantity.
    """
    target = _build_target_line(quantity, target_line, target_item_id)
    residual_quantity = source_line.quantity - quantity
    if residual_quantity == 0:
        return [target]
    return [{"id": source_line.id, "quantity": residual_quantity}, target]


async def create_switch_change_order(
    client: AsyncMPTClient,
    agreement_id: str,
    lines: list[Line],
    switch_payload: SwitchPayload,
) -> dict[str, Any]:
    """Create the switch-driven change order on the marketplace, already in execution.

    The order is created directly with ``Processing`` status (the platform
    requires ``status`` on creation), so no separate process call is needed.
    It carries the hidden ``switchPayload`` DataObject parameter — the
    discriminator the fulfillment extension uses to place the Adobe SWITCH
    order.
    """
    order_payload = {
        "status": PROCESSING_ORDER_STATUS,
        "type": CHANGE_ORDER_TYPE,
        "agreement": {"id": agreement_id},
        "lines": lines,
        "parameters": {
            "ordering": [
                {"externalId": SWITCH_PAYLOAD_PARAM, "value": switch_payload.to_dict()},
            ],
        },
    }
    order = await client.commerce.orders.create(order_payload)
    order_data = order.to_dict()
    logger.info(
        "Created switch change order %s on agreement %s (status=%s)",
        order_data.get("id"),
        agreement_id,
        order_data.get("status"),
    )
    return order_data


def mpt_order_error_detail(error: MPTHttpError) -> str:
    """Build a client-facing message from an MPT order rejection.

    Client errors (4xx) carry the platform's own explanation (e.g. "Cannot
    create order because the associated agreement is in status Updating"), so
    surface it to the wizard. Server errors stay generic to avoid leaking
    internals.
    """
    generic_detail = "MPT service request failed"
    is_client_error = error.status_code < HTTPStatus.INTERNAL_SERVER_ERROR
    if not is_client_error or not isinstance(error, MPTAPIError):
        return generic_detail
    # error.detail falls back to the bare HTTP message, so prefer the payload's own fields.
    detail = error.payload.get("detail") or error.title or ""
    flattened_errors = _flatten_field_errors(error.errors)
    if detail and flattened_errors:
        return f"{detail} {flattened_errors}"
    return detail or flattened_errors or generic_detail


def _flatten_field_errors(field_errors: Any) -> str:
    """Render the problem-details ``errors`` map as ``field: message`` pairs."""
    if not isinstance(field_errors, dict):
        return ""
    fragments = []
    for field, messages in field_errors.items():
        if isinstance(messages, list):
            joined = ", ".join(str(message) for message in messages)
        else:
            joined = str(messages)
        fragments.append(f"{field}: {joined}")
    return "; ".join(fragments)


def _build_target_line(
    quantity: int, target_line: AgreementLine | None, target_item_id: str
) -> Line:
    if target_line is None:
        return {"item": {"id": target_item_id}, "quantity": quantity}
    return {"id": target_line.id, "quantity": target_line.quantity + quantity}
