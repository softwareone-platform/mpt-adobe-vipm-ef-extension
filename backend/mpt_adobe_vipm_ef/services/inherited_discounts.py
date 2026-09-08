import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

_SUCCESS_RESULT = "SUCCESS"


@dataclass(frozen=True)
class InheritedDiscount:
    """A reusable discount Adobe auto-applies to a renewing line, enriched for display.

    ``code`` and ``eligible`` come from the automated ``PREVIEW_RENEWAL`` — the
    authority on which held reusable auto-applies to the line (Adobe resolves
    the precedence between several held reusables and the extended lock window)
    and on whether it still qualifies (``result`` ``SUCCESS`` vs ``FAILURE``).
    The remaining fields are looked up from the customer's held-reusable
    catalogue (``GET /v3/customers/{id}/flex-discounts``) to render the code in
    the wizard; they stay empty when the catalogue has no matching row.
    """

    offer_id: str
    code: str
    adobe_id: str = ""
    subscription_id: str = ""
    eligible: bool = True
    name: str = ""
    description: str = ""
    discount_lock_end_date: str = ""
    discount_values: list[dict[str, Any]] = field(default_factory=list)


def build_inherited_discounts(
    automated_preview: dict[str, Any] | None,
    held_catalogue: list[dict[str, Any]],
) -> dict[str, list[InheritedDiscount]]:
    """Map Adobe's automated renewal preview into inherited discounts per offer.

    Each preview line carries the flexible discounts Adobe auto-applies to it;
    they are joined by ``code`` to the customer's held-reusable catalogue for
    display detail and keyed by the line's full Adobe ``offerId`` (the automated
    preview leaves ``subscriptionId`` empty, and the offer id is what the renewal
    plan already resolves onto each line). A preview with no renewing lines — the
    customer has no auto-renewing subscriptions — yields an empty map.
    """
    if not automated_preview:
        return {}
    catalogue_by_code = {
        str(discount.get("code")): discount for discount in held_catalogue if discount.get("code")
    }
    inherited: dict[str, list[InheritedDiscount]] = {}
    for line_item in automated_preview.get("lineItems") or []:
        offer_id = str(line_item.get("offerId") or "")
        line_discounts = _line_inherited_discounts(offer_id, line_item, catalogue_by_code)
        if line_discounts:
            inherited.setdefault(offer_id, []).extend(line_discounts)
    return inherited


def _line_inherited_discounts(
    offer_id: str,
    line_item: dict[str, Any],
    catalogue_by_code: dict[str, dict[str, Any]],
) -> list[InheritedDiscount]:
    """Build the inherited discounts for a single renewing line."""
    if not offer_id:
        return []
    return [
        _build_inherited_discount(offer_id, line_item, flex_discount, catalogue_by_code)
        for flex_discount in line_item.get("flexDiscounts") or []
        if isinstance(flex_discount, dict) and flex_discount.get("code")
    ]


def serialize_inherited_discounts(
    inherited: dict[str, list[InheritedDiscount]],
) -> list[dict[str, Any]]:
    """Flatten the inherited-discount map into the wizard's response payload."""
    return [
        {
            "offerId": discount.offer_id,
            "subscriptionId": discount.subscription_id,
            "code": discount.code,
            "adobeId": discount.adobe_id,
            "eligible": discount.eligible,
            "name": discount.name,
            "description": discount.description,
            "discountLockEndDate": discount.discount_lock_end_date,
            "discountValues": discount.discount_values,
        }
        for discounts in inherited.values()
        for discount in discounts
    ]


def _build_inherited_discount(
    offer_id: str,
    line_item: dict[str, Any],
    flex_discount: dict[str, Any],
    catalogue_by_code: dict[str, dict[str, Any]],
) -> InheritedDiscount:
    code = str(flex_discount.get("code"))
    catalogue_entry = catalogue_by_code.get(code, {})
    return InheritedDiscount(
        offer_id=offer_id,
        code=code,
        adobe_id=str(flex_discount.get("id") or ""),
        subscription_id=str(line_item.get("subscriptionId") or ""),
        eligible=flex_discount.get("result") == _SUCCESS_RESULT,
        name=str(catalogue_entry.get("name") or ""),
        description=str(catalogue_entry.get("description") or ""),
        discount_lock_end_date=str(catalogue_entry.get("discountLockEndDate") or ""),
        discount_values=_first_outcome_values(catalogue_entry),
    )


def _first_outcome_values(catalogue_entry: dict[str, Any]) -> list[dict[str, Any]]:
    outcomes = catalogue_entry.get("outcomes") or []
    if not outcomes:
        return []
    return list(outcomes[0].get("discountValues") or [])
