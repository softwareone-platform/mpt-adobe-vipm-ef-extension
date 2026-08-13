import logging
from typing import Any

from mpt_extension_sdk.services.api_client_v2.mpt_api_client import AsyncMPTClient

from mpt_adobe_vipm_ef.constants import (
    CHANGE_ORDER_TYPE,
    CONFIGURATION_ORDER_TYPE,
    PROCESSING_ORDER_STATUS,
    RENEWAL_PAYLOAD_PARAM,
)
from mpt_adobe_vipm_ef.models.renewal import (
    RenewalOrderRequest,
    RenewalPayload,
)
from mpt_adobe_vipm_ef.services.renewal_plan import Line, NetNewLine, PlanSubscription

logger = logging.getLogger(__name__)


def build_renewal_order_lines(
    plan_subscriptions: list[PlanSubscription],
    net_new_lines: list[NetNewLine],
) -> list[Line]:
    """Build the Change order lines for the customer's renewal plan.

    The platform rejects a Change order whose lines carry no quantity delta,
    so only a renewing subscription whose renewal quantity actually differs
    from its current quantity carries a line here; a lapsing or
    quantity-unchanged subscription is dropped entirely (its renew decision
    still reaches fulfilment through the ``renewalPayload`` snapshot built by
    ``build_renewal_payload``, which records every plan subscription
    regardless of this filter). Net-new products always enter as item lines
    the platform materialises as order-scoped subscriptions during
    processing. An empty result means the plan has no quantity changes and no
    net-new products, so a Configuration order should be created instead
    (see ``build_configuration_order_subscriptions``) — unless nothing changes
    AutoRenew either, in which case an early renewal falls back to a Change
    order carrying the platform's placeholder item
    (see ``resolve_no_change_line``).
    """
    lines: list[Line] = [
        {"id": plan.line_id, "quantity": plan.selection.renewal_quantity}
        for plan in plan_subscriptions
        if plan.selection.renew and plan.selection.renewal_quantity != plan.current_quantity
    ]
    lines.extend(
        {"item": {"id": net_new.item_id}, "quantity": net_new.selection.quantity}
        for net_new in net_new_lines
    )
    return lines


def build_configuration_order_subscriptions(
    plan_subscriptions: list[PlanSubscription],
) -> list[Line]:
    """Build the Configuration order's subscription snapshots.

    Used when the renewal plan changes no quantities and adds no net-new
    products (``build_renewal_order_lines`` returned no lines). Each entry
    carries the subscription's current lines untouched alongside the plan's
    AutoRenew decision.

    The platform rejects a Configuration order subscription whose AutoRenew
    value does not actually change, so on both renewal paths only a
    subscription whose ``renew`` decision differs from its standing
    ``autoRenew`` preference is included; the ones that repeat their standing
    preference drop out. On the early-renewal ("Renew now") path the plan
    itself still reaches fulfilment through the ``renewalPayload`` snapshot
    the order carries, which records every plan subscription regardless of
    this filter; when this filter empties the result on that path, the plan
    is submitted as a Change order carrying the platform's placeholder item
    instead (see ``resolve_no_change_line``).
    """
    return [
        _configuration_order_subscription(plan)
        for plan in plan_subscriptions
        if plan.selection.renew != bool(plan.subscription.auto_renew)
    ]


def _configuration_order_subscription(plan: PlanSubscription) -> Line:
    subscription_data = plan.subscription.to_dict()
    return {
        "id": subscription_data["id"],
        "name": subscription_data["name"],
        "revision": subscription_data.get("revision"),
        "status": subscription_data.get("status"),
        "commitmentDate": subscription_data.get("commitmentDate"),
        "AutoRenew": plan.selection.renew,
        "lines": subscription_data.get("lines", []),
    }


async def create_renewal_change_order(
    client: AsyncMPTClient,
    agreement_id: str,
    lines: list[Line],
    renewal_payload: RenewalPayload,
    request: RenewalOrderRequest,
) -> dict[str, Any]:
    """Create the renewal-driven change order on the marketplace, already in execution.

    The order is created directly with ``Processing`` status (the platform
    requires ``status`` on creation), so no separate process call is needed.
    It carries the hidden ``renewalPayload`` DataObject parameter — the
    discriminator the fulfillment extension uses to apply the renewal plan
    (renew decisions, quantities and discount codes) to Adobe — plus the
    customer's optional notes and additional (client) id.
    """
    order_payload: dict[str, Any] = {
        "status": PROCESSING_ORDER_STATUS,
        "type": CHANGE_ORDER_TYPE,
        "agreement": {"id": agreement_id},
        "lines": lines,
        "parameters": {
            "ordering": [
                {"externalId": RENEWAL_PAYLOAD_PARAM, "value": renewal_payload.to_dict()},
            ],
        },
    }
    return await _create_renewal_order(client, order_payload, agreement_id, request, "change")


async def create_renewal_configuration_order(
    client: AsyncMPTClient,
    agreement_id: str,
    subscriptions: list[Line],
    request: RenewalOrderRequest,
    renewal_payload: RenewalPayload | None = None,
) -> dict[str, Any]:
    """Create the AutoRenew-only configuration order on the marketplace.

    Used when the renewal plan changes no quantities and adds no net-new
    products: the platform rejects a Change order with no line-quantity
    delta, so such a plan is submitted as a Configuration order instead,
    carrying only the subscriptions whose renew decision actually changed.

    ``renewal_payload`` is attached — on the Configuration context's own
    ``renewalPayload`` parameter, a parameter definition being bound to one
    order context — only on the early-renewal ("Renew now") path, where the
    plan is executed against Adobe immediately and fulfilment therefore needs
    the snapshot. At the anniversary nothing is executed now and the standing
    AutoRenew preferences the order itself carries are the whole plan, so no
    payload rides along.
    """
    order_payload: dict[str, Any] = {
        "status": PROCESSING_ORDER_STATUS,
        "type": CONFIGURATION_ORDER_TYPE,
        "agreement": {"id": agreement_id},
        "subscriptions": subscriptions,
    }
    if renewal_payload is not None:
        order_payload["parameters"] = {
            "ordering": [
                {"externalId": RENEWAL_PAYLOAD_PARAM, "value": renewal_payload.to_dict()},
            ],
        }
    return await _create_renewal_order(
        client, order_payload, agreement_id, request, "configuration"
    )


async def _create_renewal_order(
    client: AsyncMPTClient,
    order_payload: dict[str, Any],
    agreement_id: str,
    request: RenewalOrderRequest,
    order_kind: str,
) -> dict[str, Any]:
    if request.notes:
        order_payload["notes"] = request.notes
    if request.external_ids.client:
        order_payload["externalIds"] = {"client": request.external_ids.client}
    order = await client.commerce.orders.create(order_payload)
    order_data = order.to_dict()
    logger.info(
        "Created renewal %s order %s on agreement %s (status=%s)",
        order_kind,
        order_data.get("id"),
        agreement_id,
        order_data.get("status"),
    )
    return order_data
