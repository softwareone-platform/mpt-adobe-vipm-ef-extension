import pytest

from mpt_adobe_vipm_ef.models.switch import (
    SwitchPayload,
    UpgradeOrderRequest,
    UpgradePreviewRequest,
    build_switch_payload,
)

_TARGET_OFFER_ID = "65322651CA02A12"
_ADOBE_SUBSCRIPTION_ID = "adobe-sub-1"


@pytest.fixture
def upgrade_request():
    return UpgradeOrderRequest.model_validate({
        "targetOfferId": _TARGET_OFFER_ID,
        "quantity": 6,
        "recommendationTrackerId": "TRACKER-1",
    })


def test_upgrade_order_request_maps_aliases():
    result = UpgradeOrderRequest.model_validate({
        "targetOfferId": _TARGET_OFFER_ID,
        "quantity": 6,
        "recommendationTrackerId": "TRACKER-1",
    })

    assert result.target_offer_id == _TARGET_OFFER_ID
    assert result.quantity == 6
    assert result.recommendation_tracker_id == "TRACKER-1"


def test_upgrade_order_request_defaults_tracker_id_to_empty():
    result = UpgradeOrderRequest.model_validate({
        "targetOfferId": _TARGET_OFFER_ID,
        "quantity": 6,
    })

    assert not result.recommendation_tracker_id


def test_upgrade_order_request_rejects_non_positive_quantity():
    with pytest.raises(ValueError, match="quantity"):
        UpgradeOrderRequest.model_validate({"targetOfferId": _TARGET_OFFER_ID, "quantity": 0})


def test_build_switch_payload_serializes_tdr_shape(upgrade_request):
    payload = build_switch_payload(upgrade_request, _ADOBE_SUBSCRIPTION_ID, "USD")

    result = payload.to_dict()

    assert result == {
        "recommendationTrackerId": "TRACKER-1",
        "orderType": "SWITCH",
        "currencyCode": "USD",
        "lineItems": [
            {"extLineItemNumber": 1, "offerId": _TARGET_OFFER_ID, "quantity": 6},
        ],
        "cancellingItems": [
            {
                "extLineItemNumber": 1,
                "referenceLineItemNumber": 1,
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "quantity": 6,
            },
        ],
    }


def test_build_switch_payload_matches_cancel_and_acquire_quantities(upgrade_request):
    result = build_switch_payload(upgrade_request, _ADOBE_SUBSCRIPTION_ID, "USD")

    assert result.line_items[0].quantity == result.cancelling_items[0].quantity


def test_switch_payload_parses_tdr_document(upgrade_request):
    payload = build_switch_payload(upgrade_request, _ADOBE_SUBSCRIPTION_ID, "USD")

    result = SwitchPayload.from_payload(payload.to_dict())

    assert result == payload


def test_upgrade_request_normalises_the_discount_code():
    result = UpgradePreviewRequest.model_validate({
        "targetOfferId": _TARGET_OFFER_ID,
        "quantity": 6,
        "flexDiscountCodes": ["  upgrade10 "],
    })

    assert result.flex_discount_codes == ["UPGRADE10"]


def test_upgrade_request_drops_a_blank_discount_code():
    result = UpgradeOrderRequest.model_validate({
        "targetOfferId": _TARGET_OFFER_ID,
        "quantity": 6,
        "flexDiscountCodes": ["   "],
    })

    assert not result.flex_discount_codes


def test_upgrade_request_rejects_more_than_one_discount_code():
    with pytest.raises(ValueError, match="flexDiscountCodes"):
        UpgradeOrderRequest.model_validate({
            "targetOfferId": _TARGET_OFFER_ID,
            "quantity": 6,
            "flexDiscountCodes": ["UPGRADE10", "UPGRADE20"],
        })


def test_build_switch_payload_carries_the_code_on_the_target_line_only():
    request = UpgradeOrderRequest.model_validate({
        "targetOfferId": _TARGET_OFFER_ID,
        "quantity": 6,
        "flexDiscountCodes": ["UPGRADE10"],
    })

    result = build_switch_payload(request, _ADOBE_SUBSCRIPTION_ID, "USD").to_dict()

    assert result["lineItems"] == [
        {
            "extLineItemNumber": 1,
            "offerId": _TARGET_OFFER_ID,
            "quantity": 6,
            "flexDiscountCodes": ["UPGRADE10"],
        },
    ]
    assert "flexDiscountCodes" not in result["cancellingItems"][0]


def test_switch_payload_parses_a_snapshot_without_discount_codes():
    result = SwitchPayload.from_payload({
        "currencyCode": "USD",
        "lineItems": [{"extLineItemNumber": 1, "offerId": _TARGET_OFFER_ID, "quantity": 6}],
        "cancellingItems": [
            {
                "extLineItemNumber": 1,
                "referenceLineItemNumber": 1,
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "quantity": 6,
            },
        ],
    })

    assert not result.line_items[0].flex_discount_codes
