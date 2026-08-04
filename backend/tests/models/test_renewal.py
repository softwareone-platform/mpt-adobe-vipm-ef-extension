import pytest

from mpt_adobe_vipm_ef.models.renewal import RenewalOrderRequest

_SUBSCRIPTION_ID = "SUB-1234-5678"
_OFFER_ID = "65304470CA01A12"
_NET_NEW_OFFER_ID = "65304481CA01A12"


def test_renewal_order_request_maps_aliases():
    result = RenewalOrderRequest.model_validate({
        "subscriptions": [
            {"id": _SUBSCRIPTION_ID, "offerId": _OFFER_ID, "renew": True, "renewalQuantity": 7},
        ],
        "netNewItems": [{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}],
        "flexDiscountCodes": ["ABCD-XV54-HG34-78YT"],
        "recommendationTrackerId": "TRACKER-1",
    })

    assert result.subscriptions[0].offer_id == _OFFER_ID
    assert result.subscriptions[0].renewal_quantity == 7
    assert result.net_new_items[0].offer_id == _NET_NEW_OFFER_ID
    assert result.flex_discount_codes == ["ABCD-XV54-HG34-78YT"]
    assert result.recommendation_tracker_id == "TRACKER-1"


def test_renewal_order_request_defaults_to_an_empty_plan():
    result = RenewalOrderRequest.model_validate({})

    assert not result.subscriptions
    assert not result.net_new_items
    assert not result.flex_discount_codes
    assert not result.recommendation_tracker_id


def test_renewal_order_request_rejects_negative_renewal_quantity():
    with pytest.raises(ValueError, match="renewalQuantity"):
        RenewalOrderRequest.model_validate({
            "subscriptions": [
                {
                    "id": _SUBSCRIPTION_ID,
                    "offerId": _OFFER_ID,
                    "renew": True,
                    "renewalQuantity": -1,
                },
            ],
        })


def test_renewal_order_request_rejects_duplicate_subscriptions():
    selection = {"id": _SUBSCRIPTION_ID, "offerId": _OFFER_ID, "renew": True, "renewalQuantity": 7}

    with pytest.raises(ValueError, match="more than once"):
        RenewalOrderRequest.model_validate({"subscriptions": [selection, selection]})


def test_renewal_order_request_rejects_renewing_without_quantity():
    with pytest.raises(ValueError, match="renewal quantity"):
        RenewalOrderRequest.model_validate({
            "subscriptions": [
                {"id": _SUBSCRIPTION_ID, "offerId": _OFFER_ID, "renew": True, "renewalQuantity": 0},
            ],
        })


def test_renewal_order_request_accepts_a_lapse_without_quantity():
    result = RenewalOrderRequest.model_validate({
        "subscriptions": [
            {"id": _SUBSCRIPTION_ID, "offerId": _OFFER_ID, "renew": False, "renewalQuantity": 0},
        ],
    })

    assert result.subscriptions[0].renew is False


def test_renewal_order_request_rejects_non_positive_net_new_quantity():
    with pytest.raises(ValueError, match="quantity"):
        RenewalOrderRequest.model_validate({
            "netNewItems": [{"offerId": _NET_NEW_OFFER_ID, "quantity": 0}],
        })
