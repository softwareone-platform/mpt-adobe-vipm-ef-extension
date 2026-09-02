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


@pytest.fixture
def flex_discount():
    """An Adobe flex discount as ``GET /v3/flex-discounts`` returns it."""
    return {
        "id": "55555555-313b-476c-9d0b-6a610d5b91e0",
        "category": "INTRO",
        "code": "INTRO-PHSP",
        "name": "Intro Discount - Photoshop",
        "description": "Intro Discount - Photoshop - 15.99",
        "startDate": "2025-11-30T23:59:59Z",
        "endDate": "2026-12-31T23:59:59Z",
        "status": "ACTIVE",
        "discountLockEndDate": "2028-03-31T23:59:59Z",
        "qualification": {"baseOfferIds": ["11083117CA01A12"]},
        "outcomes": [
            {
                "type": "FIXED_PRICE",
                "discountValues": [{"country": "US", "currency": "USD", "value": 15.99}],
            }
        ],
    }


def test_build_open_update_fields_maps_adobe_attributes(flex_discount):
    result = discount_mapping.build_open_update_fields(flex_discount, _NOW)

    assert result == {
        "name": "Intro Discount - Photoshop",
        "description": "Intro Discount - Photoshop - 15.99",
        "adobe_discount_id": "55555555-313b-476c-9d0b-6a610d5b91e0",
        "category": "INTRO",
        "status": "ACTIVE",
        "discount_type": "FIXED_PRICE",
        "start_date": "2025-11-30T23:59:59+00:00",
        "end_date": "2026-12-31T23:59:59+00:00",
        "reusable": True,
        "discount_lock_end_date": "2028-03-31T23:59:59+00:00",
        "target_offer_ids": "11083117CA",
        "qualifying_offer_ids": "",
        "synchronized_at": "2026-07-21T12:00:00+00:00",
        "updated_at": "2026-07-21T12:00:00+00:00",
    }


def test_build_open_update_fields_stores_partial_skus_deduplicated(flex_discount):
    flex_discount["qualification"] = {
        "baseOfferIds": ["65304520CA01A12", "65304520CA02A12", "65322651CA03A12"],
        "qualifyingOfferIds": ["11083117CA01A12", "11083117CA12"],
    }

    result = discount_mapping.build_open_update_fields(flex_discount, _NOW)

    assert result["target_offer_ids"] == "65304520CA,65322651CA"
    assert result["qualifying_offer_ids"] == "11083117CA"


def test_build_open_update_fields_maps_percentage_outcome_and_defaults():
    discount = {"outcomes": [{"type": "PERCENTAGE_DISCOUNT"}]}

    result = discount_mapping.build_open_update_fields(discount, _NOW)

    assert result["discount_type"] == "PERCENTAGE"
    assert result["status"] == "ACTIVE"
    assert result["reusable"] is False
    assert result["discount_lock_end_date"] is None


def test_build_open_code_fields_stamps_sync_ownership(flex_discount):
    result = discount_mapping.build_open_code_fields(flex_discount, "COM", _NOW)

    ownership_keys = (
        "Code",
        "source",
        "market_segment",
        "enrichment_status",
        "created_at",
        "applicable_order_types",
    )
    assert {key: result[key] for key in ownership_keys} == {
        "Code": "INTRO-PHSP",
        "source": "API",
        "market_segment": "COM",
        "enrichment_status": "PENDING",
        "created_at": "2026-07-21T12:00:00+00:00",
        "applicable_order_types": ["NEW"],
    }
    assert "target_customer_id" not in result


def test_build_open_code_fields_leaves_standard_order_types_for_enrichment(flex_discount):
    flex_discount["category"] = "STANDARD"

    result = discount_mapping.build_open_code_fields(flex_discount, "COM", _NOW)

    assert "applicable_order_types" not in result


def test_open_discount_values_flattens_outcome_values(flex_discount):
    result = discount_mapping.open_discount_values(flex_discount)

    assert result == [{"country": "US", "currency": "USD", "value": 15.99}]


def test_open_discount_values_skips_incomplete_entries():
    discount = {
        "outcomes": [
            {
                "type": "FIXED_PRICE",
                "discountValues": [{"currency": "USD", "value": 1}, {"country": "US"}],
            }
        ]
    }

    result = discount_mapping.open_discount_values(discount)

    assert result == []


def test_open_discount_values_keeps_country_agnostic_percentage():
    discount = {"outcomes": [{"type": "PERCENTAGE_DISCOUNT", "discountValues": [{"value": 10.0}]}]}

    result = discount_mapping.open_discount_values(discount)

    assert result == [{"country": None, "currency": None, "value": 10.0}]


def test_open_discount_values_skips_percentage_entries_without_value():
    discount = {
        "outcomes": [{"type": "PERCENTAGE_DISCOUNT", "discountValues": [{"country": "US"}]}]
    }

    result = discount_mapping.open_discount_values(discount)

    assert result == []


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
        pytest.param({"start_date": "2026-08-01T00:00:00Z"}, id="not-started"),
        pytest.param({"end_date": "2026-07-01T00:00:00Z"}, id="expired"),
        pytest.param({"retired_at": "2026-07-01T00:00:00Z"}, id="retired"),
    ],
)
def test_is_offerable_rejects_codes_out_of_play(field_overrides, code_record_factory):
    record = code_record_factory(**field_overrides)

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

    assert result is False


@pytest.mark.parametrize(
    "applicable_order_types",
    [
        pytest.param([], id="no-order-types"),
        pytest.param(None, id="missing-order-types"),
    ],
)
def test_is_offerable_accepts_a_code_listing_no_order_type(
    applicable_order_types, code_record_factory
):
    """A code that names no order type applies to any of them."""
    record = code_record_factory(applicable_order_types=applicable_order_types)

    result = discount_mapping.is_offerable(record, DiscountOrderType.RENEWAL, _NOW)

    assert result is True


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
