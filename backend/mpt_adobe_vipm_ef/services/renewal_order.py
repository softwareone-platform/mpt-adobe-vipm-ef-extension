import logging
from typing import Any

from mpt_extension_sdk.services.api_client_v2.mpt_api_client import AsyncMPTClient

from mpt_adobe_vipm_ef.constants import (
    CHANGE_ORDER_TYPE,
    FLEXIBLE_DISCOUNTS_PARAM,
    PROCESSING_ORDER_STATUS,
)
from mpt_adobe_vipm_ef.models.renewal import RenewalOrderRequest
from mpt_adobe_vipm_ef.services.renewal_plan import Line, NetNewLine, PlanSubscription

logger = logging.getLogger(__name__)


def build_renewal_order_lines(
    plan_subscriptions: list[PlanSubscription],
    net_new_lines: list[NetNewLine],
) -> list[Line]:
    """Build the change order lines for the customer's renewal plan.

    Quantities are absolute. A renewing subscription carries its renewal
    quantity; a lapsing one carries its current quantity unchanged, since the
    lapse is deferred to the anniversary and expressed only in the payload.
    Net-new products enter as item lines the platform materialises as
    order-scoped subscriptions during processing.
    """
    lines: list[Line] = [
        {
            "id": plan.line_id,
            "quantity": (
                plan.selection.renewal_quantity if plan.selection.renew else plan.current_quantity
            ),
        }
        for plan in plan_subscriptions
    ]
    lines.extend(
        {"item": {"id": net_new.item_id}, "quantity": net_new.selection.quantity}
        for net_new in net_new_lines
    )
    return lines


async def create_renewal_change_order(
    client: AsyncMPTClient,
    agreement_id: str,
    lines: list[Line],
    flexible_discounts: Line | None,
    request: RenewalOrderRequest,
) -> dict[str, Any]:
    """Create the renewal-driven change order on the marketplace, already in execution.

    The order is created directly with ``Processing`` status (the platform
    requires ``status`` on creation), so no separate process call is needed.
    When the plan carries flexible discount codes or a recommendation tracker
    id, they ride on the product's existing ``flexibleDiscounts`` fulfillment
    parameter for the fulfillment extension to apply at processing. The
    customer's optional notes and additional (client) id are also forwarded.
    """
    order_payload: dict[str, Any] = {
        "status": PROCESSING_ORDER_STATUS,
        "type": CHANGE_ORDER_TYPE,
        "agreement": {"id": agreement_id},
        "lines": lines,
    }
    if flexible_discounts is not None:
        order_payload["parameters"] = {
            "fulfillment": [
                {"externalId": FLEXIBLE_DISCOUNTS_PARAM, "value": flexible_discounts},
            ],
        }
    if request.notes:
        order_payload["notes"] = request.notes
    if request.external_ids.client:
        order_payload["externalIds"] = {"client": request.external_ids.client}
    order = await client.commerce.orders.create(order_payload)
    order_data = order.to_dict()
    logger.info(
        "Created renewal change order %s on agreement %s (status=%s)",
        order_data.get("id"),
        agreement_id,
        order_data.get("status"),
    )
    return order_data
