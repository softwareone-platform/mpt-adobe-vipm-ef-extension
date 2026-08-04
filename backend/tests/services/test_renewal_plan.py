import pytest
from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.models.renewal import RenewalOrderRequest
from mpt_adobe_vipm_ef.services.renewal_plan import (
    PlanSubscription,
    build_flexible_discounts_value,
    build_preview_renewal_line_items,
    require_renewal_selections,
)

_SUBSCRIPTION_ID = "SUB-1234-5678"
_LINE_ID = "ALI-0001"
_OFFER_ID = "65304470CA01A12"
_NET_NEW_OFFER_ID = "65304481CA01A12"
_ADOBE_SUBSCRIPTION_ID = "adobe-sub-1"
_CURRENT_QUANTITY = 10


def _request(subscriptions=None, net_new_items=None, codes=None, **extra):
    return RenewalOrderRequest.model_validate({
        "subscriptions": [] if subscriptions is None else subscriptions,
        "netNewItems": [] if net_new_items is None else net_new_items,
        "flexDiscountCodes": [] if codes is None else codes,
        **extra,
    })


def _selection(*, renew=True, quantity=7, subscription_id=_SUBSCRIPTION_ID):
    return {
        "id": subscription_id,
        "offerId": _OFFER_ID,
        "renew": renew,
        "renewalQuantity": quantity,
    }


def _plan(request):
    return [
        PlanSubscription(
            selection=selection,
            line_id=_LINE_ID,
            current_quantity=_CURRENT_QUANTITY,
            adobe_subscription_id=_ADOBE_SUBSCRIPTION_ID,
        )
        for selection in request.subscriptions
    ]


def test_require_renewal_selections_rejects_an_empty_plan():
    with pytest.raises(ValidationError, match="at least one subscription"):
        require_renewal_selections(_request())


def test_require_renewal_selections_accepts_a_lapse_without_quantity():
    request = _request(subscriptions=[_selection(renew=False, quantity=0)])

    require_renewal_selections(request)  # act


def test_require_renewal_selections_accepts_a_net_new_only_plan():
    request = _request(net_new_items=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    require_renewal_selections(request)  # act


def test_build_preview_renewal_line_items_carries_the_selection_and_codes():
    request = _request(subscriptions=[_selection()], codes=["ABCD-XV54-HG34-78YT"])

    result = build_preview_renewal_line_items(_plan(request), request.flex_discount_codes)

    assert result == [
        {
            "extLineItemNumber": 1,
            "offerId": _OFFER_ID,
            "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
            "quantity": 7,
            "flexDiscountCodes": ["ABCD-XV54-HG34-78YT"],
        },
    ]


def test_build_preview_renewal_line_items_omits_codes_when_none_selected():
    request = _request(subscriptions=[_selection()])

    result = build_preview_renewal_line_items(_plan(request), request.flex_discount_codes)

    assert "flexDiscountCodes" not in result[0]


def test_build_preview_renewal_line_items_skips_lapsing_subscriptions():
    request = _request(subscriptions=[_selection(renew=False, quantity=0)])

    result = build_preview_renewal_line_items(_plan(request), request.flex_discount_codes)

    assert result == []


def test_build_flexible_discounts_value_maps_codes_per_renewing_line():
    request = _request(
        subscriptions=[
            _selection(),
            _selection(renew=False, quantity=0, subscription_id="SUB-9999-0001"),
        ],
        codes=["BLACK_FRIDAY", "CYBER_MONDAY"],
        recommendationTrackerId="TRACKER-1",
    )

    result = build_flexible_discounts_value(_plan(request), request)

    assert result == {
        "recommendationTrackerId": "TRACKER-1",
        "lineItems": [
            {
                "extLineItemNumber": 1,
                "baseOfferId": _OFFER_ID,
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "flexDiscountCode": "BLACK_FRIDAY",
            },
            {
                "extLineItemNumber": 1,
                "baseOfferId": _OFFER_ID,
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "flexDiscountCode": "CYBER_MONDAY",
            },
        ],
    }


def test_build_flexible_discounts_value_numbers_lines_like_the_preview():
    request = _request(
        subscriptions=[
            _selection(),
            _selection(subscription_id="SUB-9999-0001"),
        ],
        codes=["BLACK_FRIDAY"],
    )

    result = build_flexible_discounts_value(_plan(request), request)

    line_numbers = [entry["extLineItemNumber"] for entry in result["lineItems"]]
    preview_numbers = [
        line_item["extLineItemNumber"]
        for line_item in build_preview_renewal_line_items(_plan(request), ["BLACK_FRIDAY"])
    ]
    assert line_numbers == preview_numbers


def test_build_flexible_discounts_value_keeps_the_tracker_without_codes():
    request = _request(subscriptions=[_selection()], recommendationTrackerId="TRACKER-1")

    result = build_flexible_discounts_value(_plan(request), request)

    assert result == {"recommendationTrackerId": "TRACKER-1", "lineItems": []}


def test_build_flexible_discounts_value_is_none_when_nothing_to_record():
    request = _request(subscriptions=[_selection()], recommendationTrackerId="")

    result = build_flexible_discounts_value(_plan(request), request)

    assert result is None
