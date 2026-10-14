"""3YC floor pre-check for the at-anniversary renewal plan.

A customer with an active three-year commitment (3YC) must keep at least the
committed minimum licenses and consumables when the term renews. The wizard
runs this check while the customer drafts the plan, and the submit endpoint
repeats it as a final gate, so a decrease or a disabled renewal that would
break a floor is blocked with an explanation before any order exists.
"""

import asyncio
import logging
from collections.abc import Callable
from typing import Any, cast

from mpt_extension_sdk.api import (
    APIContext,
    ErrorDetail,
    UpstreamServiceError,
    ValidationError,
)
from requests import RequestException

from mpt_adobe_vipm_ef.constants import (
    INACTIVE_SUBSCRIPTION_STATUS,
    SCHEDULED_SUBSCRIPTION_STATUS,
)
from mpt_adobe_vipm_ef.services.items import get_partial_sku
from mpt_adobe_vipm_ef.services.renewal_plan import NetNewLine, PlanSubscription
from mpt_adobe_vipm_ef.services.sku_mapping import (
    THREE_YC_TYPE_CONSUMABLE,
    THREE_YC_TYPE_LICENSE,
    SkuMappingStore,
)
from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)

THREE_YEAR_COMMIT_BENEFIT = "THREE_YEAR_COMMIT"
LICENSE_OFFER_TYPE = "LICENSE"
CONSUMABLES_OFFER_TYPE = "CONSUMABLES"

# Only a commitment in force constrains the renewal: a pending request
# (REQUESTED/ACCEPTED) has no floors yet and an expired or non-compliant one
# is Adobe's to enforce.
_ENFORCEABLE_STATUSES = frozenset(("COMMITTED", "ACTIVE"))


def get_three_yc_commitment(customer: dict[str, Any]) -> dict[str, Any]:
    """Return the customer's three-year commitment detail, or an empty dict."""
    for benefit in customer.get("benefits") or []:
        if benefit.get("type") == THREE_YEAR_COMMIT_BENEFIT:
            return benefit.get("commitment") or {}
    return {}


def has_three_yc_in_force(customer: dict[str, Any]) -> bool:
    """Whether the customer holds a three-year commitment covering the anniversary.

    The same notion the floor check enforces on, reused so the early-renewal
    rules that depend on being a 3YC customer — the end-of-life SKU allowance —
    cannot drift from it.
    """
    commitment = get_three_yc_commitment(customer)
    return _is_enforceable(commitment, str(customer.get("cotermDate") or ""))


async def check_renewal_plan_three_yc_floor(  # noqa: WPS210
    ctx: APIContext,
    customer: dict[str, Any],
    resolve_market_segment: Callable[[], str],
    renewal_quantities: dict[str, int],
) -> dict[str, Any]:
    """Check the renewal plan against the customer's 3YC minimum quantities.

    Takes the seats per product from ``project_renewal_quantities``, splits
    them into licenses and consumables through the Airtable SKU mapping and
    compares each total against its committed floor. Returns the check summary
    for the wizard; raises :class:`ValidationError` when a floor would break.
    Customers without a commitment in force covering the anniversary are not
    constrained and skip the check (``checked: false``), which is why the
    market segment is resolved lazily: it is only needed for the SKU lookup.
    """
    commitment = get_three_yc_commitment(customer)
    commitment_status = commitment.get("status") or None
    if not _is_enforceable(commitment, str(customer.get("cotermDate") or "")):
        return {"checked": False, "commitmentStatus": commitment_status}
    sku_types = await _load_sku_types(ctx, sorted(renewal_quantities), resolve_market_segment())
    licenses, consumables = _count_by_offer_type(renewal_quantities, sku_types)
    minimum_licenses, minimum_consumables = _require_floors(commitment, licenses, consumables)
    return {
        "checked": True,
        "commitmentStatus": commitment_status,
        "licenses": {"selected": licenses, "minimum": minimum_licenses},
        "consumables": {"selected": consumables, "minimum": minimum_consumables},
    }


def _is_enforceable(commitment: dict[str, Any], coterm_date: str) -> bool:
    """Whether the commitment constrains the upcoming anniversary renewal.

    A commitment that ends before the anniversary (coterm) date no longer
    constrains it. Both dates are in Adobe's ``YYYY-MM-DD`` wire format, so the
    lexicographic comparison is chronological.
    """
    if commitment.get("status") not in _ENFORCEABLE_STATUSES:
        return False
    end_date = commitment.get("endDate") or ""
    return not (end_date and coterm_date and end_date < coterm_date)


def project_renewal_quantities(
    adobe_subscriptions: dict[str, Any],
    plan_subscriptions: list[PlanSubscription],
    net_new_lines: list[NetNewLine],
) -> dict[str, int]:
    """Count the seats each product will renew, the same way fulfillment counts them.

    Every Adobe subscription counts, not only the ones in the plan. Inactive
    ones count nothing.
    """
    plans_by_subscription_id = {plan.adobe_subscription_id: plan for plan in plan_subscriptions}
    projected = [
        _project_subscription(
            subscription_item,
            plans_by_subscription_id.get(str(subscription_item.get("subscriptionId") or "")),
        )
        for subscription_item in adobe_subscriptions.get("items") or []
        if subscription_item.get("status") != INACTIVE_SUBSCRIPTION_STATUS
    ]
    for net_new in net_new_lines:
        _project_net_new_line(projected, net_new)
    return _sum_by_sku(projected)


def _sum_by_sku(projected: list[dict[str, Any]]) -> dict[str, int]:
    quantities: dict[str, int] = {}
    for projected_subscription in projected:
        sku = projected_subscription["sku"]
        quantities[sku] = quantities.get(sku, 0) + projected_subscription["quantity"]
    return quantities


def _project_subscription(
    subscription_item: dict[str, Any], plan: PlanSubscription | None
) -> dict[str, Any]:
    """Outside the plan, count what Adobe will auto-renew."""
    if plan is None:
        auto_renewal = subscription_item.get("autoRenewal") or {}
        enabled = bool(auto_renewal.get("enabled"))
        quantity = int(auto_renewal.get("renewalQuantity") or 0) if enabled else 0
    elif plan.selection.renew:
        quantity = plan.selection.renewal_quantity
    else:
        quantity = 0
    return {
        "status": str(subscription_item.get("status") or ""),
        "sku": get_partial_sku(str(subscription_item.get("offerId") or "")),
        "quantity": quantity,
    }


def _project_net_new_line(projected: list[dict[str, Any]], net_new: NetNewLine) -> None:
    """Count a net-new product once, even if Adobe already has it scheduled."""
    sku = get_partial_sku(net_new.selection.offer_id)
    scheduled = next(
        (
            projected_subscription
            for projected_subscription in projected
            if projected_subscription["status"] == SCHEDULED_SUBSCRIPTION_STATUS
            and projected_subscription["sku"] == sku
        ),
        None,
    )
    if scheduled is None:
        projected.append({
            "status": SCHEDULED_SUBSCRIPTION_STATUS,
            "sku": sku,
            "quantity": net_new.selection.quantity,
        })
    else:
        scheduled["quantity"] = net_new.selection.quantity


async def _load_sku_types(
    ctx: APIContext, partial_skus: list[str], market_segment: str
) -> dict[str, str]:
    """Load the 3YC type of each SKU from Airtable, mapping failures to 502."""
    store = SkuMappingStore.from_settings(cast(ExtensionSettings, ctx.ext_settings))
    try:
        return await asyncio.to_thread(store.list_three_yc_types, partial_skus, market_segment)
    except RequestException as error:
        logger.warning("SKU mapping store request failed: %s", error)
        raise UpstreamServiceError(detail="SKU mapping data store request failed")


def _count_by_offer_type(
    plan_quantities: dict[str, int], sku_types: dict[str, str]
) -> tuple[int, int]:
    """Split the plan totals into (licenses, consumables) via the SKU mapping.

    A SKU without a mapping row (or with a blank ``type_3yc`` column) counts
    toward neither floor, mirroring the fulfilment extension's behaviour.
    """
    licenses = 0
    consumables = 0
    for sku, quantity in plan_quantities.items():
        three_yc_type = sku_types.get(sku, "")
        if three_yc_type == THREE_YC_TYPE_LICENSE:
            licenses += quantity
        elif three_yc_type == THREE_YC_TYPE_CONSUMABLE:
            consumables += quantity
        else:
            logger.warning("SKU %s has no 3YC type mapping; excluded from the floor totals", sku)
    return licenses, consumables


def _require_floors(  # noqa: WPS210
    commitment: dict[str, Any], licenses: int, consumables: int
) -> tuple[int, int]:
    """Compare the plan totals against the committed floors, returning them.

    Raises :class:`ValidationError` carrying one field error per broken floor.
    """
    minimum_licenses = _read_floor(commitment, LICENSE_OFFER_TYPE)
    minimum_consumables = _read_floor(commitment, CONSUMABLES_OFFER_TYPE)
    errors = []
    if licenses < minimum_licenses:
        errors.append(
            _floor_error(f"{licenses}", f"{minimum_licenses} licenses"),
        )
    if consumables < minimum_consumables:
        errors.append(
            _floor_error(f"{consumables}", f"{minimum_consumables} consumables"),
        )
    if errors:
        logger.warning(
            "3YC floor pre-check failed: licenses=%s/%s consumables=%s/%s",
            licenses,
            minimum_licenses,
            consumables,
            minimum_consumables,
        )
        raise ValidationError(
            detail=(
                "The renewal plan would place the account below the minimum quantities "
                "committed for the three-year commitment."
            ),
            errors=errors,
        )
    return minimum_licenses, minimum_consumables


def _read_floor(commitment: dict[str, Any], offer_type: str) -> int:
    for minimum in commitment.get("minimumQuantities") or []:
        if minimum.get("offerType") == offer_type:
            return int(minimum.get("quantity") or 0)
    return 0


def _floor_error(selected: str, floor: str) -> ErrorDetail:
    return ErrorDetail(
        pointer="#/subscriptions",
        detail=(
            f"The quantity selected of {selected} would place the account below "
            f"the minimum commitment of {floor} for the three-year commitment."
        ),
    )
