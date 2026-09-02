"""Mapping between Airtable discount rows and the API object representation (TDR)."""

import datetime as dt
from types import MappingProxyType
from typing import Any

from mpt_adobe_vipm_ef.models.discount import (
    DiscountCodeCreateRequest,
    DiscountCodeUpdateRequest,
    DiscountOrderType,
)
from mpt_adobe_vipm_ef.services.discounts import (
    ACTIVE_STATUS,
    CODE_FIELD,
    ENRICHMENT_COMPLETE,
    SOURCE_CLOSED,
    SOURCE_OPEN,
    AirtableRecord,
)

ValueEntry = dict[str, Any]

_SOURCE_LABELS = MappingProxyType({SOURCE_OPEN: "Open", SOURCE_CLOSED: "Closed"})
_CSV_SEPARATOR = ","


def record_code(record: AirtableRecord) -> str:
    """Return the discount code stored on a code row."""
    return str(record["fields"].get(CODE_FIELD, ""))


def is_closed(record: AirtableRecord) -> bool:
    """Return whether the row is a closed (Ops/Vendor-authored) code."""
    return bool(record["fields"].get("source") == SOURCE_CLOSED)


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

    The row must not be retired, must list the order type among its applicable
    ones (an empty list is "any order type", so it restricts nothing), and
    ``now`` must sit inside its usable window: the
    ``start_date``/``end_date`` range for a single-use code, extended to
    ``discount_lock_end_date`` for a reusable one (the lock keeps a redeemed
    code applicable past its end date). A missing or unreadable bound leaves
    that side of the window open.
    """
    fields = record["fields"]
    if fields.get("retired_at"):
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


def build_value_fields(
    code: str,
    market_segment: str,
    country: str,
    currency: str,
    amount: float,
) -> dict[str, Any]:
    """Build the Airtable fields of the per-country value row of a closed code."""
    return {
        "code": code,
        "market_segment": market_segment,
        "country": country,
        "currency": currency,
        "value": amount,
    }


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


def redeemed_at_by_code(redemption_records: list[AirtableRecord]) -> dict[str, Any]:
    """Map each redeemed code to its redemption timestamp."""
    redemptions = {}
    for record in redemption_records:
        fields = record["fields"]
        redemptions[str(fields.get("code", ""))] = fields.get("redeemed_at")
    return redemptions


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
