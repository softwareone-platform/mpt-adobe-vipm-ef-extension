import logging
from typing import Any

from mpt_extension_sdk.models import Agreement
from mpt_extension_sdk.models.agreement import AgreementLine
from mpt_extension_sdk.models.subscription import SubscriptionLine
from mpt_extension_sdk.services.api_client_v2.mpt_api_client import AsyncMPTClient

from mpt_adobe_vipm_ef.constants import CHANGE_ORDER_TYPE, SWITCH_PAYLOAD_PARAM
from mpt_adobe_vipm_ef.models.switch import SwitchPayload

logger = logging.getLogger(__name__)

Line = dict[str, Any]


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
    """Create and process the switch-driven change order on the marketplace.

    The order carries the hidden ``switchPayload`` DataObject parameter — the
    discriminator the fulfillment extension uses to place the Adobe SWITCH
    order.
    """
    order_payload = {
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
    order_id = order.to_dict()["id"]
    logger.info("Created switch change order %s on agreement %s", order_id, agreement_id)
    processed = await client.commerce.orders.process(order_id)
    logger.info("Processed switch change order %s", order_id)
    return processed.to_dict()


def _build_target_line(
    quantity: int, target_line: AgreementLine | None, target_item_id: str
) -> Line:
    if target_line is None:
        return {"item": {"id": target_item_id}, "quantity": quantity}
    return {"id": target_line.id, "quantity": target_line.quantity + quantity}
