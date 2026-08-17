import datetime as dt

import pytest

from mpt_adobe_vipm_ef.models.discount import DiscountCodeCreateRequest, DiscountOrderType
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


def test_to_api_payload_maps_tdr_representation(code_record_factory):
    record = code_record_factory()

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


def test_to_api_payload_labels_open_source(code_record_factory):
    record = code_record_factory(source="API")

    result = discount_mapping.to_api_payload(record, [], None)

    assert result["source"] == "Open"


def test_to_api_payload_ignores_computed_description_artifacts(code_record_factory):
    record = code_record_factory(description={"state": "error", "value": None})

    result = discount_mapping.to_api_payload(record, [], None)

    assert result["description"] is None


def test_to_api_payload_unwraps_generated_description_artifacts(code_record_factory):
    record = code_record_factory(
        description={"state": "generated", "value": "20% off", "isStale": False}
    )

    result = discount_mapping.to_api_payload(record, [], None)

    assert result["description"] == "20% off"


def test_is_visible_hides_retired_rows(code_record_factory):
    record = code_record_factory(retired_at="2026-07-01T00:00:00Z")

    result = discount_mapping.is_visible(record, "COM", "CUST-001")

    assert result is False


def test_is_visible_hides_closed_codes_of_other_customers(code_record_factory):
    record = code_record_factory(target_customer_id="CUST-999")

    result = discount_mapping.is_visible(record, "COM", "CUST-001")

    assert result is False


def test_is_visible_shows_open_codes_of_the_segment(code_record_factory):
    record = code_record_factory(source="API", target_customer_id=None)

    result = discount_mapping.is_visible(record, "COM", "CUST-001")

    assert result is True


def test_is_offerable_accepts_a_code_inside_its_validity_window(code_record_factory):
    record = code_record_factory()

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

    assert result is True


@pytest.mark.parametrize(
    "field_overrides",
    [
        pytest.param({"start_date": "2026-07-21T12:00:00Z"}, id="starts-now"),
        pytest.param({"end_date": "2026-07-21T12:00:00Z"}, id="ends-now"),
    ],
)
def test_is_offerable_accepts_the_bounds_of_the_validity_window(
    field_overrides, code_record_factory
):
    record = code_record_factory(**field_overrides)

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

    assert result is True


@pytest.mark.parametrize(
    "field_overrides",
    [
        pytest.param({"applicable_order_types": ["NEW", "SWITCH"]}, id="other-order-types"),
        pytest.param({"applicable_order_types": []}, id="no-order-types"),
        pytest.param({"applicable_order_types": None}, id="missing-order-types"),
        pytest.param({"start_date": "2026-08-01T00:00:00Z"}, id="not-started"),
        pytest.param({"end_date": "2026-07-01T00:00:00Z"}, id="expired"),
        pytest.param({"retired_at": "2026-07-01T00:00:00Z"}, id="retired"),
    ],
)
def test_is_offerable_rejects_codes_out_of_play(field_overrides, code_record_factory):
    record = code_record_factory(**field_overrides)

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

    assert result is False


def test_is_offerable_extends_a_reusable_code_to_its_discount_lock(code_record_factory):
    record = code_record_factory(
        end_date="2026-07-01T00:00:00Z",
        reusable=True,
        discount_lock_end_date="2026-12-31T23:59:59Z",
    )

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

    assert result is True


def test_is_offerable_rejects_a_reusable_code_past_its_discount_lock(code_record_factory):
    record = code_record_factory(
        end_date="2026-06-01T00:00:00Z",
        reusable=True,
        discount_lock_end_date="2026-07-01T00:00:00Z",
    )

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

    assert result is False


def test_is_offerable_falls_back_to_the_end_date_when_a_reusable_code_has_no_lock(
    code_record_factory,
):
    record = code_record_factory(end_date="2026-07-01T00:00:00Z", reusable=True)

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

    assert result is False


@pytest.mark.parametrize(
    "field_overrides",
    [
        pytest.param({"end_date": None}, id="missing-end-date"),
        pytest.param({"end_date": "not-a-date"}, id="unreadable-end-date"),
        pytest.param({"start_date": "2026-06-01", "end_date": "2026-08-31"}, id="date-only-cells"),
        pytest.param({"end_date": "2026-08-31T23:59:59"}, id="naive-end-date"),
    ],
)
def test_is_offerable_leaves_the_window_open_on_unusable_bounds(
    field_overrides, code_record_factory
):
    record = code_record_factory(**field_overrides)

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

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
