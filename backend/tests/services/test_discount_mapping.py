import datetime as dt

import pytest

from mpt_adobe_vipm_ef.models.discount import DiscountCodeCreateRequest
from mpt_adobe_vipm_ef.services import discount_mapping

_NOW = dt.datetime.fromisoformat("2026-07-21T12:00:00+00:00")
_TARGET_OFFER_ID = "65322651CA02A12"


@pytest.fixture
def create_body():
    return DiscountCodeCreateRequest.model_validate({
        "code": "SUMMER25",
        "name": "Summer 2025",
        "description": "20% off for renewals",
        "adobeDiscountId": "55555555-313b-476c-9d0b-6a610d5b91e0",
        "category": "STANDARD",
        "discountType": "PERCENTAGE",
        "value": 20,
        "startDate": "2026-06-01T00:00:00Z",
        "endDate": "2026-08-31T23:59:59Z",
        "targetOfferIds": [_TARGET_OFFER_ID],
        "applicableOrderTypes": ["RENEWAL"],
    })


def _code_record(**field_overrides):
    fields = {
        "Code": "SUMMER25",
        "name": "Summer 2025",
        "description": "20% off for renewals",
        "source": "Ops/Vendor",
        "category": "STANDARD",
        "status": "ACTIVE",
        "discount_type": "PERCENTAGE",
        "market_segment": "COM",
        "start_date": "2026-06-01T00:00:00Z",
        "end_date": "2026-08-31T23:59:59Z",
        "target_offer_ids": "65322651CA02A12, 11083117CA01A12",
        "applicable_order_types": ["RENEWAL"],
        "supports_annual": True,
        "target_customer_id": "CUST-001",
    }
    fields.update(field_overrides)
    return {"id": "rec123", "fields": fields}


def test_build_closed_code_fields_stamps_authoring_metadata(create_body):
    result = discount_mapping.build_closed_code_fields(create_body, "COM", "CUST-001", _NOW)

    authoring_keys = (
        "Code",
        "source",
        "status",
        "market_segment",
        "target_customer_id",
        "enrichment_status",
        "created_at",
    )
    assert {key: result[key] for key in authoring_keys} == {
        "Code": "SUMMER25",
        "source": "Ops/Vendor",
        "status": "ACTIVE",
        "market_segment": "COM",
        "target_customer_id": "CUST-001",
        "enrichment_status": "COMPLETE",
        "created_at": "2026-07-21T12:00:00+00:00",
    }


def test_build_update_fields_serializes_wizard_fields(create_body):
    result = discount_mapping.build_update_fields(create_body, _NOW)

    wizard_keys = (
        "name",
        "adobe_discount_id",
        "discount_type",
        "target_offer_ids",
        "applicable_order_types",
        "reusable",
        "updated_at",
    )
    assert {key: result[key] for key in wizard_keys} == {
        "name": "Summer 2025",
        "adobe_discount_id": "55555555-313b-476c-9d0b-6a610d5b91e0",
        "discount_type": "PERCENTAGE",
        "target_offer_ids": _TARGET_OFFER_ID,
        "applicable_order_types": ["RENEWAL"],
        "reusable": False,
        "updated_at": "2026-07-21T12:00:00+00:00",
    }
    assert "Code" not in result


def test_to_api_payload_maps_tdr_representation():
    record = _code_record()

    result = discount_mapping.to_api_payload(
        record,
        [{"country": "US", "currency": "USD", "value": 20}],
        None,
    )

    api_keys = (
        "id",
        "code",
        "source",
        "targetOfferIds",
        "values",
        "redeemedAt",
        "supportsAnnual",
        "supports3yc",
    )
    assert {key: result[key] for key in api_keys} == {
        "id": "rec123",
        "code": "SUMMER25",
        "source": "Closed",
        "targetOfferIds": ["65322651CA02A12", "11083117CA01A12"],
        "values": [{"country": "US", "currency": "USD", "value": 20}],
        "redeemedAt": None,
        "supportsAnnual": True,
        "supports3yc": False,
    }


def test_to_api_payload_labels_open_source():
    record = _code_record(source="API")

    result = discount_mapping.to_api_payload(record, [], None)

    assert result["source"] == "Open"


def test_to_api_payload_ignores_computed_description_artifacts():
    record = _code_record(description={"state": "error", "value": None})

    result = discount_mapping.to_api_payload(record, [], None)

    assert result["description"] is None


def test_to_api_payload_unwraps_generated_description_artifacts():
    record = _code_record(description={"state": "generated", "value": "20% off", "isStale": False})

    result = discount_mapping.to_api_payload(record, [], None)

    assert result["description"] == "20% off"


def test_is_visible_hides_retired_rows():
    record = _code_record(retired_at="2026-07-01T00:00:00Z")

    result = discount_mapping.is_visible(record, "COM", "CUST-001")

    assert result is False


def test_is_visible_hides_closed_codes_of_other_customers():
    record = _code_record(target_customer_id="CUST-999")

    result = discount_mapping.is_visible(record, "COM", "CUST-001")

    assert result is False


def test_is_visible_shows_open_codes_of_the_segment():
    record = _code_record(source="API", target_customer_id=None)

    result = discount_mapping.is_visible(record, "COM", "CUST-001")

    assert result is True


def test_group_values_groups_by_code():
    value_records = [
        {
            "id": "recA",
            "fields": {"code": "SUMMER25", "country": "US", "currency": "USD", "value": 20},
        },
        {
            "id": "recB",
            "fields": {"code": "SUMMER25", "country": "CA", "currency": "CAD", "value": 25},
        },
        {"id": "recC", "fields": {"code": "OTHER", "country": "US", "currency": "USD", "value": 5}},
    ]

    result = discount_mapping.group_values(value_records)

    assert len(result["SUMMER25"]) == 2
    assert result["OTHER"] == [{"country": "US", "currency": "USD", "value": 5}]


def test_redeemed_at_by_code_maps_timestamps():
    redemption_records = [
        {"id": "recR", "fields": {"code": "SUMMER25", "redeemed_at": "2026-07-01T00:00:00Z"}},
    ]

    result = discount_mapping.redeemed_at_by_code(redemption_records)

    assert result == {"SUMMER25": "2026-07-01T00:00:00Z"}
