"""Per-subscription early-renewal state, read from the customer's Adobe subscriptions."""

import asyncio
import logging
from typing import Any, cast

from mpt_extension_sdk.api import APIContext, UpstreamServiceError
from requests import RequestException

from mpt_adobe_vipm_ef.constants import WILL_RENEW_LINE_STATUS
from mpt_adobe_vipm_ef.models.renewal import RenewalState
from mpt_adobe_vipm_ef.services.items import get_partial_sku
from mpt_adobe_vipm_ef.services.sku_mapping import SkuMappingStore
from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)

Payload = dict[str, Any]


async def load_lifecycle(
    ctx: APIContext, partial_skus: list[str], market_segment: str
) -> dict[str, dict[str, bool]]:
    """Load each SKU's end-of-sale and end-of-life flags from Airtable, mapping failures to 502.

    The lifecycle flags are hand-curated and cannot be derived from Adobe data.
    A SKU absent from the result has no mapping row and counts as neither
    retired at the call site, so a missing row never hides a product the
    customer holds.
    """
    if not partial_skus:
        return {}
    store = SkuMappingStore.from_settings(cast(ExtensionSettings, ctx.ext_settings))
    try:
        return await asyncio.to_thread(store.list_lifecycle, partial_skus, market_segment)
    except RequestException as error:
        logger.warning("SKU mapping store request failed: %s", error)
        raise UpstreamServiceError(detail="SKU mapping data store request failed")


def derive_renewal_state(current_quantity: int, renewed_quantity: int) -> RenewalState:
    """Classify a subscription from its renewed quantity against its current one.

    ``renewedQuantity`` is the cumulative quantity already early-renewed (base
    plus any add-mode increase) and ``currentQuantity`` is the sole baseline;
    the already-renewed amount is never taken from
    ``autoRenewal.renewalQuantity``, which fulfilment pins to
    ``renewedQuantity``. Fully renewed means every existing seat has been
    early-renewed, which is also the precondition for increasing the product
    beyond its current quantity in a later add-mode order.
    """
    if renewed_quantity <= 0:
        return RenewalState.NOT_RENEWED
    if renewed_quantity < current_quantity:
        return RenewalState.PARTIALLY_RENEWED
    return RenewalState.FULLY_RENEWED


def is_increase_allowed(renewal_state: RenewalState) -> bool:
    """Whether the product can be increased beyond its current quantity.

    Only once every existing seat is already early-renewed: an increase rides an
    add-mode order, so one mixed into a base renewal — or placed while a
    remainder is still unrenewed — is rejected on preview. A partially-renewed
    line therefore waits for a later add order.
    """
    return renewal_state is RenewalState.FULLY_RENEWED


def is_early_renewable(sku_lifecycle: dict[str, bool], *, is_three_yc: bool) -> bool:
    """Whether a SKU at this lifecycle stage can be early-renewed at all.

    An end-of-sale SKU never can; an end-of-life SKU only for a customer with a
    three-year commitment. A SKU with neither flag is unaffected.
    """
    if sku_lifecycle.get("endOfSale"):
        return False
    return is_three_yc if sku_lifecycle.get("endOfLife") else True


def build_renewal_states(
    adobe_subscriptions: Payload,
    lifecycle: dict[str, dict[str, bool]],
    *,
    is_three_yc: bool,
) -> dict[str, Payload]:
    """Map each Adobe subscription id to its early-renewal state.

    ``remainingQuantity`` is how much of the existing seats a further RENEWAL
    order can still early-renew — the figure the remainder control surfaces as
    "X of Y renewed, renew remaining Z". It floors at zero because
    ``renewedQuantity`` exceeds ``currentQuantity`` once an increase has been
    placed. Adobe returns ``renewedQuantity`` only inside the pre-anniversary
    window, so an absent value reads as not-renewed.

    ``earlyRenewable`` is false for a SKU Adobe will not early-renew at all: the
    wizard leaves the line out rather than showing it in a restricted state.
    ``increaseAllowed`` says whether the Items step offers an increase beyond the
    current quantity, which only a fully-renewed line can carry.
    """
    states = {}
    for subscription_item in adobe_subscriptions.get("items") or []:
        subscription_id = subscription_item.get("subscriptionId")
        if subscription_id:
            states[subscription_id] = _build_state(
                subscription_item, lifecycle, is_three_yc=is_three_yc
            )
    return states


def build_now_path_eligibility(preview: dict[str, Any]) -> dict[str, bool]:
    """Map each previewed line's Adobe subscription id to its now-path eligibility.

    The PREVIEW_RENEWAL line status is the authority on whether a line can be
    early-renewed (1000 will renew, 1004 product expired), so a line Adobe does
    not report as renewing is left out of the path rather than offered and
    rejected later. ``allowedActions`` is deliberately not used: it lands on
    expired subscriptions after the renewal date, making it a late-renewal
    signal only.
    """
    eligibility = {}
    for line in preview.get("lineItems") or []:
        subscription_id = line.get("subscriptionId")
        if subscription_id:
            eligibility[subscription_id] = str(line.get("status") or "") == WILL_RENEW_LINE_STATUS
    return eligibility


def _build_state(
    subscription_item: Payload,
    lifecycle: dict[str, dict[str, bool]],
    *,
    is_three_yc: bool,
) -> Payload:
    current_quantity = int(subscription_item.get("currentQuantity") or 0)
    renewed_quantity = int(subscription_item.get("renewedQuantity") or 0)
    partial_sku = get_partial_sku(str(subscription_item.get("offerId") or ""))
    renewal_state = derive_renewal_state(current_quantity, renewed_quantity)
    return {
        "currentQuantity": current_quantity,
        "renewedQuantity": renewed_quantity,
        "state": renewal_state.value,
        "remainingQuantity": max(current_quantity - renewed_quantity, 0),
        "increaseAllowed": is_increase_allowed(renewal_state),
        "earlyRenewable": is_early_renewable(
            lifecycle.get(partial_sku, {}), is_three_yc=is_three_yc
        ),
    }
