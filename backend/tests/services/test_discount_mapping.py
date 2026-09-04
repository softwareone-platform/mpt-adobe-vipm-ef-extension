import datetime as dt

import pytest
from freezegun import freeze_time

from mpt_adobe_vipm_ef.models.discount import (
    Commitment,
    DiscountCodeCreateRequest,
    DiscountOrderType,
    EligibilityContext,
)
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


@pytest.mark.parametrize("source", ["Operations", "Vendor"])
def test_build_closed_code_fields_stamps_authoring_metadata(create_body, source):
    result = discount_mapping.build_closed_code_fields(create_body, "COM", "CUST-001", _NOW, source)

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
        "source": source,
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


def test_build_open_update_fields_unions_offer_ids_with_the_stored_ones(
    flex_discount, code_record_factory
):
    existing = code_record_factory(
        target_offer_ids="65304520CA,11083117CA", qualifying_offer_ids="65322651CA"
    )
    flex_discount["qualification"] = {
        "baseOfferIds": ["65322651CA02A12", "65304520CA01A12"],
        "qualifyingOfferIds": ["11083117CA01A12"],
    }

    result = discount_mapping.build_open_update_fields(flex_discount, _NOW, existing)

    assert result["target_offer_ids"] == "65304520CA,11083117CA,65322651CA"
    assert result["qualifying_offer_ids"] == "65322651CA,11083117CA"


def test_build_open_update_fields_keeps_stored_offer_ids_adobe_omits(
    flex_discount, code_record_factory
):
    existing = code_record_factory(target_offer_ids="65304520CA")
    flex_discount["qualification"] = {}

    result = discount_mapping.build_open_update_fields(flex_discount, _NOW, existing)

    assert result["target_offer_ids"] == "65304520CA"


def test_build_open_update_fields_maps_percentage_outcome_and_defaults():
    discount = {"outcomes": [{"type": "PERCENTAGE_DISCOUNT"}]}

    result = discount_mapping.build_open_update_fields(discount, _NOW)

    assert result["discount_type"] == "PERCENTAGE"
    assert result["status"] == "ACTIVE"
    assert result["reusable"] is False
    assert result["discount_lock_end_date"] is None


def test_build_open_update_fields_clears_the_retirement_of_a_usable_code(
    flex_discount, code_record_factory
):
    existing = code_record_factory(retired_at="2026-07-01T00:00:00Z")

    result = discount_mapping.build_open_update_fields(flex_discount, _NOW, existing)

    assert result["retired_at"] is None


def test_build_open_update_fields_keeps_the_retirement_of_an_expired_code(
    flex_discount, code_record_factory
):
    existing = code_record_factory(retired_at="2026-07-01T00:00:00Z")
    flex_discount["endDate"] = "2026-06-30T23:59:59Z"
    flex_discount["discountLockEndDate"] = "2026-07-15T23:59:59Z"

    result = discount_mapping.build_open_update_fields(flex_discount, _NOW, existing)

    assert "retired_at" not in result


def test_build_open_update_fields_leaves_retirement_alone_on_a_live_row(
    flex_discount, code_record_factory
):
    result = discount_mapping.build_open_update_fields(flex_discount, _NOW, code_record_factory())

    assert "retired_at" not in result


def test_build_open_code_fields_never_retires_a_new_row(flex_discount):
    flex_discount["endDate"] = "2026-06-30T23:59:59Z"
    flex_discount["discountLockEndDate"] = None

    result = discount_mapping.build_open_code_fields(flex_discount, "COM", _NOW)

    assert "retired_at" not in result


@pytest.mark.parametrize(
    ("field_overrides", "expected"),
    [
        pytest.param({"end_date": "2026-08-31T23:59:59Z"}, False, id="inside-window"),
        pytest.param({"end_date": "2026-07-01T00:00:00Z"}, True, id="past-end-date"),
        pytest.param({"end_date": "2026-07-21T12:00:00Z"}, False, id="ends-right-now"),
        pytest.param({"end_date": None}, False, id="no-end-date"),
        pytest.param({"end_date": "not-a-date"}, False, id="unreadable-end-date"),
        pytest.param(
            {
                "end_date": "2026-07-01T00:00:00Z",
                "reusable": True,
                "discount_lock_end_date": "2026-12-31T23:59:59Z",
            },
            False,
            id="reusable-inside-lock",
        ),
        pytest.param(
            {
                "end_date": "2026-06-01T00:00:00Z",
                "reusable": True,
                "discount_lock_end_date": "2026-07-01T00:00:00Z",
            },
            True,
            id="reusable-past-lock",
        ),
    ],
)
def test_is_expired_mirrors_the_usable_window(field_overrides, expected, code_record_factory):
    fields = code_record_factory(**field_overrides)["fields"]

    result = discount_mapping.is_expired(fields, _NOW)

    assert result is expected


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


@pytest.mark.parametrize("stored_source", ["Operations", "Vendor", "Client", "Ops/Vendor"])
def test_to_api_payload_labels_every_closed_source(code_record_factory, stored_source):
    record = code_record_factory(source=stored_source)

    result = discount_mapping.to_api_payload(record, [], None)

    assert result["source"] == "Closed"


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


def test_is_offerable_accepts_an_enriched_code(code_record_factory):
    record = code_record_factory(enrichment_status="COMPLETE")

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
        pytest.param({"enrichment_status": "PENDING"}, id="pending-enrichment"),
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


def test_redemptions_by_code_maps_redeemed_at_and_order_id():
    redemption_records = [
        {
            "id": "recR",
            "fields": {
                "code": "SUMMER25",
                "redeemed_at": "2026-07-01T00:00:00Z",
                "order_id": "ORD-1",
            },
        },
    ]

    result = discount_mapping.redemptions_by_code(redemption_records)

    assert result == {
        "SUMMER25": discount_mapping.Redemption(
            redeemed_at="2026-07-01T00:00:00Z", order_id="ORD-1"
        )
    }


def test_exclude_redeemed_drops_a_redeemed_single_use_code(code_record_factory):
    record = code_record_factory(reusable=False)
    redemptions = {"SUMMER25": discount_mapping.Redemption("2026-07-01T00:00:00Z", "ORD-1")}

    result = discount_mapping.exclude_redeemed([record], redemptions)

    assert result == []


def test_exclude_redeemed_keeps_a_redeemed_reusable_code(code_record_factory):
    record = code_record_factory(reusable=True)
    redemptions = {"SUMMER25": discount_mapping.Redemption("2026-07-01T00:00:00Z", "ORD-1")}

    result = discount_mapping.exclude_redeemed([record], redemptions)

    assert result == [record]


def test_exclude_redeemed_keeps_a_code_the_customer_has_not_redeemed(code_record_factory):
    record = code_record_factory(reusable=False)

    result = discount_mapping.exclude_redeemed([record], {})

    assert result == [record]


def test_allows_category_rejects_intro_codes_on_renewing_lines(code_record_factory):
    record = code_record_factory(category="INTRO")

    result = discount_mapping.allows_category(record, DiscountOrderType.RENEWAL)

    assert result is False


def test_allows_category_offers_intro_codes_on_net_new_lines(code_record_factory):
    record = code_record_factory(category="INTRO")

    result = discount_mapping.allows_category(record, DiscountOrderType.NEW)

    assert result is True


def test_allows_category_offers_standard_codes_on_any_order_type(code_record_factory):
    record = code_record_factory(category="STANDARD")

    result = discount_mapping.allows_category(record, DiscountOrderType.RENEWAL)

    assert result is True


@pytest.mark.parametrize(
    ("target_offer_ids", "offer_partial_sku", "expected"),
    [
        pytest.param("65322651CA,11083117CA", "65322651CA", True, id="sku-in-target-set"),
        pytest.param("65322651CA,11083117CA", "99999999ZZ", False, id="sku-outside-target-set"),
        pytest.param("", "65322651CA", True, id="empty-target-set-is-any"),
        pytest.param("65322651CA", None, True, id="unknown-sku-is-kept"),
        pytest.param("65322651CA02A12", "65322651CA", True, id="full-stored-sku-matches-partial"),
    ],
)
def test_matches_target_sku(target_offer_ids, offer_partial_sku, expected, code_record_factory):
    record = code_record_factory(target_offer_ids=target_offer_ids)

    result = discount_mapping.matches_target_sku(record, offer_partial_sku)

    assert result is expected


@pytest.mark.parametrize(
    ("qualifying_offer_ids", "owned", "expected"),
    [
        pytest.param("11083117CA", frozenset(("11083117CA",)), True, id="owns-a-qualifying-sku"),
        pytest.param("11083117CA", frozenset(("65322651CA",)), False, id="owns-no-qualifying-sku"),
        pytest.param("", frozenset(("65322651CA",)), True, id="no-qualifying-set-required"),
        pytest.param("11083117CA", frozenset(), True, id="unknown-owned-skus-are-kept"),
        pytest.param(
            "11083117CA01A12",
            frozenset(("11083117CA",)),
            True,
            id="full-qualifying-sku-matches-owned-partial",
        ),
    ],
)
def test_matches_qualifying(qualifying_offer_ids, owned, expected, code_record_factory):
    record = code_record_factory(qualifying_offer_ids=qualifying_offer_ids)

    result = discount_mapping.matches_qualifying(record, owned)

    assert result is expected


@pytest.mark.parametrize(
    ("supports", "commitment", "expected"),
    [
        pytest.param(
            {"supports_annual": True, "supports_3yc": False},
            Commitment.ANNUAL,
            True,
            id="annual-code-annual-line",
        ),
        pytest.param(
            {"supports_annual": True, "supports_3yc": False},
            Commitment.THREE_YC,
            False,
            id="annual-code-3yc-line",
        ),
        pytest.param(
            {"supports_annual": False, "supports_3yc": True},
            Commitment.THREE_YC,
            True,
            id="3yc-code-3yc-line",
        ),
        pytest.param(
            {"supports_annual": False, "supports_3yc": False},
            Commitment.THREE_YC,
            True,
            id="no-support-flags-constrains-nothing",
        ),
        pytest.param(
            {"supports_annual": True, "supports_3yc": True},
            None,
            True,
            id="unknown-commitment-is-kept",
        ),
    ],
)
def test_matches_commitment(supports, commitment, expected, code_record_factory):
    record = code_record_factory(**supports)

    result = discount_mapping.matches_commitment(record, commitment)

    assert result is expected


def test_exclude_out_of_country_keeps_a_code_offered_in_the_country(code_record_factory):
    record = code_record_factory()
    value_records = [{"id": "recV", "fields": {"code": "SUMMER25", "country": "US"}}]

    result = discount_mapping.exclude_out_of_country([record], value_records, "US")

    assert result == [record]


def test_exclude_out_of_country_keeps_a_country_agnostic_percentage_code(code_record_factory):
    record = code_record_factory()
    value_records = [{"id": "recV", "fields": {"code": "SUMMER25", "value": 20}}]

    result = discount_mapping.exclude_out_of_country([record], value_records, "US")

    assert result == [record]


def test_exclude_out_of_country_drops_a_code_priced_only_for_other_countries(code_record_factory):
    record = code_record_factory()
    value_records = [{"id": "recV", "fields": {"code": "SUMMER25", "country": "CA"}}]

    result = discount_mapping.exclude_out_of_country([record], value_records, "US")

    assert result == []


def test_exclude_out_of_country_keeps_a_code_with_no_value_rows(code_record_factory):
    record = code_record_factory()

    result = discount_mapping.exclude_out_of_country([record], [], "US")

    assert result == [record]


@freeze_time("2026-07-21T12:00:00Z")
def test_filter_offerable_applies_the_context_gates(code_record_factory):
    hit = code_record_factory(target_offer_ids="65322651CA")
    miss = code_record_factory(target_offer_ids="99999999ZZ")
    context = EligibilityContext(offer_partial_sku="65322651CA")

    result = discount_mapping.filter_offerable([hit, miss], DiscountOrderType.RENEWAL, context)

    assert result == [hit]


@freeze_time("2026-07-21T12:00:00Z")
def test_filter_offerable_without_context_keeps_offerable_codes(code_record_factory):
    record = code_record_factory(target_offer_ids="99999999ZZ")

    result = discount_mapping.filter_offerable([record], DiscountOrderType.RENEWAL)

    assert result == [record]


@freeze_time("2026-07-21T12:00:00Z")
def test_filter_offerable_enforces_the_intro_category_gate(code_record_factory):
    record = code_record_factory(category="INTRO", applicable_order_types=[])

    result = discount_mapping.filter_offerable([record], DiscountOrderType.RENEWAL)

    assert result == []


def test_filter_offerable_without_order_type_returns_records_untouched(code_record_factory):
    record = code_record_factory(target_offer_ids="99999999ZZ")
    context = EligibilityContext(offer_partial_sku="65322651CA")

    result = discount_mapping.filter_offerable([record], None, context)

    assert result == [record]
