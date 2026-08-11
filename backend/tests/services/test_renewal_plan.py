import pytest
from mpt_extension_sdk.api import ValidationError
from mpt_extension_sdk.models import Subscription

from mpt_adobe_vipm_ef.models.renewal import RenewalOrderRequest
from mpt_adobe_vipm_ef.services.renewal_plan import (
    NetNewLine,
    PlanSubscription,
    build_preview_renewal_line_items,
    build_renewal_payload,
    require_renewal_changes,
    require_renewal_selections,
)

_SUBSCRIPTION_ID = "SUB-1234-5678"
_LINE_ID = "ALI-0001"
_OFFER_ID = "65304470CA01A12"
_NET_NEW_OFFER_ID = "65304481CA01A12"
_ADOBE_SUBSCRIPTION_ID = "adobe-sub-1"
_CURRENT_QUANTITY = 10


def _request(subscriptions=None, net_new_items=None, codes=None, **extra):  # noqa: WPS432
    return RenewalOrderRequest.model_validate({
        "subscriptions": [] if subscriptions is None else subscriptions,
        "netNewItems": [] if net_new_items is None else net_new_items,
        "flexDiscountCodes": [] if codes is None else codes,
        **extra,
    })


def _selection(*, renew=True, quantity=7, subscription_id=_SUBSCRIPTION_ID):  # noqa: WPS432
    return {
        "id": subscription_id,
        "offerId": _OFFER_ID,
        "renew": renew,
        "renewalQuantity": quantity,
    }


def _subscription(*, subscription_id=_SUBSCRIPTION_ID, auto_renew=True):
    return Subscription.model_validate({
        "id": subscription_id,
        "name": f"Subscription for {subscription_id}",
        "autoRenew": auto_renew,
        "lines": [
            {
                "id": _LINE_ID,
                "quantity": _CURRENT_QUANTITY,
                "item": {"id": "ITM-0001", "name": "Item One"},
            }
        ],
    })


def _plan(request, *, auto_renew=True, current_quantity=_CURRENT_QUANTITY):
    return [
        PlanSubscription(
            selection=selection,
            line_id=_LINE_ID,
            current_quantity=current_quantity,
            adobe_subscription_id=_ADOBE_SUBSCRIPTION_ID,
            offer_id=selection.offer_id,
            subscription=_subscription(subscription_id=selection.id, auto_renew=auto_renew),
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


def test_build_renewal_payload_snapshots_the_whole_plan():
    request = _request(
        subscriptions=[
            _selection(),
            _selection(renew=False, quantity=0, subscription_id="SUB-9999-0001"),
        ],
        net_new_items=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}],
        codes=["BLACK_FRIDAY", "CYBER_MONDAY"],
        recommendationTrackerId="TRACKER-1",
    )
    net_new_lines = [
        NetNewLine(selection=request.net_new_items[0], item_id="ITM-NET-NEW"),
    ]

    result = build_renewal_payload(_plan(request), net_new_lines, request, "USD")

    assert result.to_dict() == {
        "recommendationTrackerId": "TRACKER-1",
        "currencyCode": "USD",
        "subscriptions": [
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": True,
                "renewalQuantity": 7,
                "flexDiscountCodes": ["BLACK_FRIDAY", "CYBER_MONDAY"],
            },
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": False,
                "renewalQuantity": 0,
                "flexDiscountCodes": [],
            },
        ],
        "netNewItems": [{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}],
    }


def test_build_renewal_payload_keeps_codes_off_lapsing_subscriptions():
    request = _request(
        subscriptions=[_selection(renew=False, quantity=0)],
        codes=["BLACK_FRIDAY"],
    )

    result = build_renewal_payload(_plan(request), [], request, "USD")

    assert result.subscriptions[0].flex_discount_codes == []


def test_build_renewal_payload_defaults_the_optional_fields():
    request = _request(subscriptions=[_selection()], recommendationTrackerId="")

    result = build_renewal_payload(_plan(request), [], request, "USD")

    payload = result.to_dict()
    assert not payload["recommendationTrackerId"]
    assert payload["netNewItems"] == []


def test_require_renewal_changes_accepts_a_quantity_change():
    request = _request(subscriptions=[_selection(quantity=37)])  # noqa: WPS432

    require_renewal_changes(_plan(request), [])  # act


def test_require_renewal_changes_accepts_an_autorenew_change():
    request = _request(subscriptions=[_selection(renew=False, quantity=_CURRENT_QUANTITY)])

    require_renewal_changes(_plan(request, auto_renew=True), [])  # act


def test_require_renewal_changes_accepts_a_net_new_only_plan():
    net_new_request = _request(net_new_items=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])
    net_new_lines = [
        NetNewLine(selection=net_new_request.net_new_items[0], item_id="ITM-NET-NEW"),
    ]

    require_renewal_changes([], net_new_lines)  # act


def test_require_renewal_changes_rejects_a_pure_no_op_plan():
    request = _request(subscriptions=[_selection(renew=True, quantity=_CURRENT_QUANTITY)])

    with pytest.raises(ValidationError, match="no changes to submit"):
        require_renewal_changes(_plan(request, auto_renew=True), [])


def test_require_renewal_changes_rejects_an_unchanged_lapse():
    request = _request(subscriptions=[_selection(renew=False, quantity=0)])

    with pytest.raises(ValidationError, match="no changes to submit"):
        require_renewal_changes(_plan(request, auto_renew=False), [])
