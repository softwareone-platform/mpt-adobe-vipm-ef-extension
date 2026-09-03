"""Mapping between Airtable discount rows and the API object representation (TDR)."""

import datetime as dt
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any

from mpt_adobe_vipm_ef.models.discount import (
    DiscountCategory,
    DiscountCodeCreateRequest,
    DiscountCodeUpdateRequest,
    DiscountOrderType,
    DiscountType,
)
from mpt_adobe_vipm_ef.services.discounts import (
    ACTIVE_STATUS,
    CODE_FIELD,
    ENRICHMENT_COMPLETE,
    ENRICHMENT_PENDING,
    SOURCE_CLOSED,
    SOURCE_OPEN,
    AirtableRecord,
)
from mpt_adobe_vipm_ef.services.items import get_partial_sku

ValueEntry = dict[str, Any]
AdobeFlexDiscount = dict[str, Any]


@dataclass(frozen=True)
class Redemption:
    """A customer's redemption of a code, as read from the redemptions store.

    Mirrors the row the fulfilment engine writes on confirmed order completion;
    ``order_id`` is the MPT order that consumed the code.
    """

    redeemed_at: Any
    order_id: Any


_SOURCE_LABELS = MappingProxyType({SOURCE_OPEN: "Open", SOURCE_CLOSED: "Closed"})
_CSV_SEPARATOR = ","

# Adobe's flex-discount outcome types keyed to the discount types the store uses.
_ADOBE_DISCOUNT_TYPES = MappingProxyType({
    "PERCENTAGE_DISCOUNT": DiscountType.PERCENTAGE.value,
    "PERCENTAGE": DiscountType.PERCENTAGE.value,
    "FIXED_DISCOUNT": DiscountType.FIXED_DISCOUNT.value,
    "FIXED_PRICE": DiscountType.FIXED_PRICE.value,
})


def _fields(record: AirtableRecord) -> dict[str, Any]:
    """Return the Airtable row's field mapping."""
    return record["fields"]


def record_code(record: AirtableRecord) -> str:
    """Return the discount code stored on a code row."""
    return str(_fields(record).get(CODE_FIELD, ""))


def is_closed(record: AirtableRecord) -> bool:
    """Return whether the row is a closed (Ops/Vendor-authored) code."""
    return bool(_fields(record).get("source") == SOURCE_CLOSED)


def is_reusable(record: AirtableRecord) -> bool:
    """Return whether the row is a reusable code (carries a discount lock)."""
    return bool(_fields(record).get("reusable"))


def is_visible(record: AirtableRecord, market_segment: str, customer_id: str) -> bool:
    """Return whether the row is in scope for the customer and segment.

    Mirrors the listing filter: not retired, same market segment, and either an
    open code or a closed code targeting the customer.
    """
    fields = record["fields"]
    if fields.get("retired_at"):
        return False
    if fields.get("market_segment") != market_segment:
        return False
    return not is_closed(record) or fields.get("target_customer_id") == customer_id


def is_offerable(record: AirtableRecord, order_type: DiscountOrderType, now: dt.datetime) -> bool:
    """Return whether an order of ``order_type`` can still apply the code.

    The row must not be retired, must not be pending enrichment (its order
    types and annual/3YC support are not curated yet), must list the order
    type among its applicable ones (an empty list is "any order type", so it
    restricts nothing), and ``now`` must sit inside its usable window: the
    ``start_date``/``end_date`` range for a single-use code, extended to
    ``discount_lock_end_date`` for a reusable one (the lock keeps a redeemed
    code applicable past its end date). A missing or unreadable bound leaves
    that side of the window open.
    """
    fields = record["fields"]
    if fields.get("retired_at") or fields.get("enrichment_status") == ENRICHMENT_PENDING:
        return False
    applicable = fields.get("applicable_order_types") or []
    if applicable and order_type.value not in applicable:
        return False
    return _is_within(now, _read_date(fields.get("start_date")), _usable_until(fields))


def filter_offerable(
    records: list[AirtableRecord], order_type: DiscountOrderType | None
) -> list[AirtableRecord]:
    """Keep the codes an order of ``order_type`` can still apply today.

    Without an order type the rows are returned untouched: the discounts tab
    curates codes of every order type and validity, expired ones included.
    """
    if order_type is None:
        return records
    now = dt.datetime.now(tz=dt.UTC)
    return [record for record in records if is_offerable(record, order_type, now)]


def build_update_fields(body: DiscountCodeUpdateRequest, now: dt.datetime) -> dict[str, Any]:
    """Build the Airtable fields written by the edit wizard (code is immutable)."""
    return {
        "name": body.name,
        "description": body.description or "",
        "adobe_discount_id": body.adobe_discount_id or "",
        "category": body.category.value,
        "discount_type": body.discount_type.value,
        "start_date": _iso(body.start_date),
        "end_date": _iso(body.end_date),
        "reusable": body.is_reusable,
        "discount_lock_end_date": _iso(body.discount_lock_end_date),
        "target_offer_ids": _CSV_SEPARATOR.join(body.target_offer_ids),
        "qualifying_offer_ids": _CSV_SEPARATOR.join(body.qualifying_offer_ids),
        "applicable_order_types": [order_type.value for order_type in body.applicable_order_types],
        "supports_annual": body.supports_annual,
        "supports_3yc": body.supports_three_yc,
        "updated_at": _iso(now),
    }


def build_closed_code_fields(
    body: DiscountCodeCreateRequest,
    market_segment: str,
    customer_id: str,
    now: dt.datetime,
) -> dict[str, Any]:
    """Build the Airtable fields for a newly authored closed code."""
    fields = build_update_fields(body, now)
    fields.update({
        CODE_FIELD: body.code,
        "source": SOURCE_CLOSED,
        "status": ACTIVE_STATUS,
        "market_segment": market_segment,
        "target_customer_id": customer_id,
        "enrichment_status": ENRICHMENT_COMPLETE,
        "created_at": _iso(now),
    })
    return fields


def build_open_update_fields(discount: AdobeFlexDiscount, now: dt.datetime) -> dict[str, Any]:
    """Build the Airtable fields the Adobe sync owns on an open code row.

    Only the attributes ``GET /v3/flex-discounts`` reports are written; the
    enrichment fields (order types, annual/3YC support) are curated by
    operations and deliberately left untouched.
    """
    qualification = discount.get("qualification") or {}
    lock_end_date = _adobe_iso(discount.get("discountLockEndDate"))
    return {
        "name": str(discount.get("name") or ""),
        "description": str(discount.get("description") or ""),
        "adobe_discount_id": str(discount.get("id") or ""),
        "category": str(discount.get("category") or ""),
        "status": str(discount.get("status") or ACTIVE_STATUS),
        "discount_type": _open_discount_type(discount),
        "start_date": _adobe_iso(discount.get("startDate")),
        "end_date": _adobe_iso(discount.get("endDate")),
        # Reusability is derived from the lock date presence (TDR rule).
        "reusable": lock_end_date is not None,
        "discount_lock_end_date": lock_end_date,
        "target_offer_ids": _partial_sku_csv(qualification.get("baseOfferIds") or []),
        "qualifying_offer_ids": _partial_sku_csv(qualification.get("qualifyingOfferIds") or []),
        "synchronized_at": _iso(now),
        "updated_at": _iso(now),
    }


def build_open_code_fields(
    discount: AdobeFlexDiscount, market_segment: str, now: dt.datetime
) -> dict[str, Any]:
    """Build the Airtable fields for an open code row first seen by the sync."""
    fields = build_open_update_fields(discount, now)
    fields.update({
        CODE_FIELD: str(discount.get("code") or ""),
        "source": SOURCE_OPEN,
        "market_segment": market_segment,
        "enrichment_status": ENRICHMENT_PENDING,
        "created_at": _iso(now),
    })
    if fields["category"] == DiscountCategory.INTRO.value:
        # The only order-type enrichment the TDR fixes: INTRO is net-new only.
        fields["applicable_order_types"] = [DiscountOrderType.NEW.value]
    return fields


def _partial_sku_csv(offer_ids: list[Any]) -> str:
    """Store Adobe offer ids as their 10-char partial SKUs, deduplicated in order.

    The MPT item vendor external id carries the partial SKU, so trimming the
    discount-level/segment suffix here lets the wizards match a code to a line
    regardless of the customer's volume level.
    """
    partial_skus = dict.fromkeys(get_partial_sku(str(offer_id)) for offer_id in offer_ids)
    return _CSV_SEPARATOR.join(sku for sku in partial_skus if sku)


def open_discount_values(discount: AdobeFlexDiscount) -> list[ValueEntry]:
    """Extract the value entries of an Adobe flex discount.

    Fixed-type outcomes carry one value per country; percentage outcomes are
    country-agnostic, reported by Adobe as a bare ``{"value": ...}`` without
    country or currency.
    """
    entries: list[ValueEntry] = []
    for outcome in discount.get("outcomes") or []:
        is_percentage = _outcome_discount_type(outcome) == DiscountType.PERCENTAGE.value
        for discount_value in outcome.get("discountValues") or []:
            entry = _value_entry(discount_value, require_country=not is_percentage)
            if entry is not None:
                entries.append(entry)
    return entries


def build_value_fields(
    code: str,
    market_segment: str,
    country: str | None,
    currency: str | None,
    amount: float,
) -> dict[str, Any]:
    """Build the Airtable fields of one value row of a code.

    Country and currency are set for fixed-type values only: a percentage is
    country-agnostic and its single row leaves both fields blank.
    """
    fields: dict[str, Any] = {
        "code": code,
        "market_segment": market_segment,
        "value": amount,
    }
    if country:
        fields["country"] = country
    if currency:
        fields["currency"] = currency
    return fields


def group_values(value_records: list[AirtableRecord]) -> dict[str, list[ValueEntry]]:
    """Group value rows by code as API ``values`` entries."""
    grouped: dict[str, list[ValueEntry]] = {}
    for record in value_records:
        fields = record["fields"]
        code = str(fields.get("code", ""))
        entries = grouped.setdefault(code, [])
        entries.append({
            "country": fields.get("country"),
            "currency": fields.get("currency"),
            "value": fields.get("value"),
        })
    return grouped


def redemptions_by_code(redemption_records: list[AirtableRecord]) -> dict[str, Redemption]:
    """Map each redeemed code to the customer's redemption of it.

    The store already scopes the query to one customer, so keying by code is
    enough; a code with several rows collapses to the last-seen redemption.
    """
    redemptions = {}
    for record in redemption_records:
        fields = record["fields"]
        redemptions[str(fields.get("code", ""))] = Redemption(
            redeemed_at=fields.get("redeemed_at"),
            order_id=fields.get("order_id"),
        )
    return redemptions


def exclude_redeemed(
    records: list[AirtableRecord], redemptions: dict[str, Redemption]
) -> list[AirtableRecord]:
    """Drop single-use codes the customer has already redeemed (once-per-customer).

    A reusable code is kept even after redemption: it stays valid for the
    customer until its discount lock end date (the window extension in
    :func:`is_offerable` honours that), so only single-use codes are excluded.
    """
    return [
        record
        for record in records
        if is_reusable(record) or record_code(record) not in redemptions
    ]


def to_api_payload(
    record: AirtableRecord,
    code_values: list[ValueEntry],
    redeemed_at: Any,
) -> dict[str, Any]:
    """Serialize a code row into the TDR object representation."""
    fields = record["fields"]
    stored_source = str(fields.get("source", "")) or None
    source_label = None if stored_source is None else _SOURCE_LABELS.get(stored_source)
    return {
        "id": record["id"],
        "adobeDiscountId": _text_or_none(fields.get("adobe_discount_id")),
        "code": record_code(record),
        "name": fields.get("name"),
        "description": _text_or_none(fields.get("description")),
        "source": source_label or stored_source,
        "category": fields.get("category"),
        "status": fields.get("status"),
        "discountType": fields.get("discount_type"),
        "marketSegment": fields.get("market_segment"),
        "startDate": fields.get("start_date"),
        "endDate": fields.get("end_date"),
        "reusable": bool(fields.get("reusable")),
        "discountLockEndDate": fields.get("discount_lock_end_date"),
        "targetOfferIds": _split_csv(fields.get("target_offer_ids")),
        "qualifyingOfferIds": _split_csv(fields.get("qualifying_offer_ids")),
        "applicableOrderTypes": list(fields.get("applicable_order_types") or []),
        "supportsAnnual": bool(fields.get("supports_annual")),
        "supports3yc": bool(fields.get("supports_3yc")),
        "targetCustomerId": fields.get("target_customer_id"),
        "values": code_values,
        "redeemedAt": redeemed_at,
        "retiredAt": fields.get("retired_at"),
        "enrichmentStatus": fields.get("enrichment_status"),
        "synchronizedAt": fields.get("synchronized_at"),
        "createdAt": fields.get("created_at"),
        "updatedAt": fields.get("updated_at"),
    }


def _value_entry(discount_value: dict[str, Any], *, require_country: bool) -> ValueEntry | None:
    """Build one value entry, or None when it is incomplete.

    ``require_country`` is False for percentage outcomes: Adobe reports those
    without a country, so only the value itself is mandatory.
    """
    country = discount_value.get("country")
    amount = discount_value.get("value")
    if amount is None or (require_country and not country):
        return None
    return {
        "country": country,
        "currency": discount_value.get("currency"),
        "value": amount,
    }


def _open_discount_type(discount: AdobeFlexDiscount) -> str:
    """Map the first Adobe outcome type to the discount type the store uses."""
    outcomes = discount.get("outcomes") or []
    if not outcomes:
        return ""
    return _outcome_discount_type(outcomes[0])


def _outcome_discount_type(outcome: dict[str, Any]) -> str:
    """Map one Adobe outcome type to the discount type the store uses."""
    adobe_type = str(outcome.get("type") or "")
    return _ADOBE_DISCOUNT_TYPES.get(adobe_type, adobe_type)


def _adobe_iso(raw_date: Any) -> str | None:
    """Normalize an Adobe ISO-8601 date string to the stored UTC format."""
    return _iso(_read_date(raw_date))


def _usable_until(fields: dict[str, Any]) -> dt.datetime | None:
    """The last moment the code can be applied, honouring the discount lock."""
    end_date = _read_date(fields.get("end_date"))
    if not fields.get("reusable"):
        return end_date
    return _read_date(fields.get("discount_lock_end_date")) or end_date


def _is_within(moment: dt.datetime, start: dt.datetime | None, end: dt.datetime | None) -> bool:
    if start is not None and moment < start:
        return False
    return end is None or moment <= end


def _read_date(raw_date: Any) -> dt.datetime | None:
    """Read an Airtable date cell as an aware UTC datetime, or None."""
    if not isinstance(raw_date, str) or not raw_date:
        return None
    try:
        parsed = dt.datetime.fromisoformat(raw_date)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.UTC)


def _iso(moment: dt.datetime | None) -> str | None:
    if moment is None:
        return None
    aware = moment if moment.tzinfo else moment.replace(tzinfo=dt.UTC)
    return aware.astimezone(dt.UTC).isoformat()


def _split_csv(raw_csv: Any) -> list[str]:
    if not isinstance(raw_csv, str):
        return []
    return [token.strip() for token in raw_csv.split(_CSV_SEPARATOR) if token.strip()]


def _text_or_none(raw_text: Any) -> str | None:
    if isinstance(raw_text, dict):
        # Airtable AI/computed fields return a state object instead of plain text.
        raw_text = raw_text.get("value")
    return raw_text if isinstance(raw_text, str) and raw_text else None
