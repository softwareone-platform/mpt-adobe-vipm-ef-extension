import pytest
from mpt_extension_sdk.api import UpstreamServiceError
from requests import ConnectionError as RequestsConnectionError

from mpt_adobe_vipm_ef.models.renewal import RenewalState
from mpt_adobe_vipm_ef.services.renewal_state import (
    build_now_path_eligibility,
    build_renewal_states,
    derive_renewal_state,
    is_early_renewable,
    is_increase_allowed,
    load_lifecycle,
)

_SUBSCRIPTION_ID = "dummy-sub-1"
_OTHER_SUBSCRIPTION_ID = "dummy-sub-2"
_SKU = "DUMMYSKU01"
_OFFER_ID = "DUMMYSKU0101A12"
_MARKET_SEGMENT = "COM"
_CURRENT_QUANTITY = 10
_INCREASED_RENEWED_QUANTITY = 15
_PREVIEWS_WITHOUT_A_SUBSCRIPTION_ID = (
    {},
    {"lineItems": None},
    {"lineItems": [{"status": "1000"}]},
)


@pytest.fixture
def ctx(mocker):
    return mocker.Mock()


@pytest.fixture
def sku_mapping_store(mocker):
    store_cls = mocker.patch("mpt_adobe_vipm_ef.services.renewal_state.SkuMappingStore")
    store = store_cls.from_settings.return_value
    store.list_lifecycle.return_value = {_SKU: {"endOfSale": False, "endOfLife": True}}
    return store


def _subscriptions(*, renewed_quantity=None):
    subscription_item = {
        "subscriptionId": _SUBSCRIPTION_ID,
        "offerId": _OFFER_ID,
        "currentQuantity": _CURRENT_QUANTITY,
    }
    if renewed_quantity is not None:
        subscription_item["renewedQuantity"] = renewed_quantity
    return {"items": [subscription_item]}


def _states(subscriptions, lifecycle=None, *, is_three_yc=False):
    return build_renewal_states(subscriptions, lifecycle or {}, is_three_yc=is_three_yc)


async def test_load_lifecycle_returns_the_store_result(ctx, sku_mapping_store):
    result = await load_lifecycle(ctx, [_SKU], _MARKET_SEGMENT)

    assert result == {_SKU: {"endOfSale": False, "endOfLife": True}}
    sku_mapping_store.list_lifecycle.assert_called_once_with([_SKU], _MARKET_SEGMENT)


async def test_load_lifecycle_skips_the_lookup_without_any_sku(ctx, sku_mapping_store):
    result = await load_lifecycle(ctx, [], _MARKET_SEGMENT)

    assert result == {}
    sku_mapping_store.list_lifecycle.assert_not_called()


async def test_load_lifecycle_maps_a_store_failure_to_an_upstream_error(ctx, sku_mapping_store):
    sku_mapping_store.list_lifecycle.side_effect = RequestsConnectionError("boom")

    with pytest.raises(UpstreamServiceError, match="SKU mapping data store"):
        await load_lifecycle(ctx, [_SKU], _MARKET_SEGMENT)


@pytest.mark.parametrize(
    ("current_quantity", "renewed_quantity", "expected"),
    [
        (10, 0, RenewalState.NOT_RENEWED),
        (10, 4, RenewalState.PARTIALLY_RENEWED),
        (10, 10, RenewalState.FULLY_RENEWED),
        (10, 12, RenewalState.FULLY_RENEWED),
    ],
)
def test_derive_renewal_state_classifies_the_renewed_quantity(
    current_quantity, renewed_quantity, expected
):
    result = derive_renewal_state(current_quantity, renewed_quantity)

    assert result is expected


def test_build_renewal_states_reports_the_remainder_of_a_partial_line():
    result = _states(_subscriptions(renewed_quantity=4))

    assert result == {
        _SUBSCRIPTION_ID: {
            "currentQuantity": _CURRENT_QUANTITY,
            "renewedQuantity": 4,
            "state": RenewalState.PARTIALLY_RENEWED.value,
            "remainingQuantity": 6,
            "earlyRenewable": True,
            "increaseAllowed": False,
        },
    }


def test_build_renewal_states_treats_an_absent_renewed_quantity_as_not_renewed():
    """Adobe returns the renewed quantity only inside the pre-anniversary window."""
    result = _states(_subscriptions())

    assert result[_SUBSCRIPTION_ID]["state"] == RenewalState.NOT_RENEWED.value
    assert result[_SUBSCRIPTION_ID]["remainingQuantity"] == _CURRENT_QUANTITY


def test_build_renewal_states_floors_the_remainder_of_an_increased_line():
    """The renewed quantity exceeds the current one once an increase has been placed."""
    result = _states(_subscriptions(renewed_quantity=_INCREASED_RENEWED_QUANTITY))

    assert result[_SUBSCRIPTION_ID]["remainingQuantity"] == 0


@pytest.mark.parametrize("subscriptions", [{}, {"items": None}, {"items": [{}]}])
def test_build_renewal_states_skips_items_without_a_subscription_id(subscriptions):
    result = _states(subscriptions)

    assert result == {}


def test_build_renewal_states_marks_an_end_of_sale_line_as_not_early_renewable():
    lifecycle = {_SKU: {"endOfSale": True, "endOfLife": False}}

    result = _states(_subscriptions(), lifecycle)

    assert result[_SUBSCRIPTION_ID]["earlyRenewable"] is False


def test_build_renewal_states_allows_an_end_of_life_line_for_a_three_yc_customer():
    lifecycle = {_SKU: {"endOfSale": False, "endOfLife": True}}

    result = _states(_subscriptions(), lifecycle, is_three_yc=True)

    assert result[_SUBSCRIPTION_ID]["earlyRenewable"] is True


@pytest.mark.parametrize(
    ("sku_lifecycle", "is_three_yc", "expected"),
    [
        ({}, False, True),
        ({"endOfSale": True, "endOfLife": False}, True, False),
        ({"endOfSale": False, "endOfLife": True}, True, True),
        ({"endOfSale": False, "endOfLife": True}, False, False),
        ({"endOfSale": False, "endOfLife": False}, False, True),
    ],
)
def test_is_early_renewable_applies_the_lifecycle_rule(sku_lifecycle, is_three_yc, expected):
    result = is_early_renewable(sku_lifecycle, is_three_yc=is_three_yc)

    assert result is expected


@pytest.mark.parametrize(
    ("renewal_state", "expected"),
    [
        (RenewalState.NOT_RENEWED, False),
        (RenewalState.PARTIALLY_RENEWED, False),
        (RenewalState.FULLY_RENEWED, True),
    ],
)
def test_is_increase_allowed_needs_a_fully_renewed_line(renewal_state, expected):
    result = is_increase_allowed(renewal_state)

    assert result is expected


def test_build_renewal_states_allows_an_increase_on_a_fully_renewed_line():
    result = _states(_subscriptions(renewed_quantity=_CURRENT_QUANTITY))

    assert result[_SUBSCRIPTION_ID]["increaseAllowed"] is True


def test_build_now_path_eligibility_reads_the_previewed_line_statuses():
    preview = {
        "lineItems": [
            {"subscriptionId": _SUBSCRIPTION_ID, "status": "1000"},
            {"subscriptionId": _OTHER_SUBSCRIPTION_ID, "status": "1004"},
        ],
    }

    result = build_now_path_eligibility(preview)

    assert result == {_SUBSCRIPTION_ID: True, _OTHER_SUBSCRIPTION_ID: False}


@pytest.mark.parametrize("preview", _PREVIEWS_WITHOUT_A_SUBSCRIPTION_ID)
def test_build_now_path_eligibility_skips_lines_without_a_subscription_id(preview):
    result = build_now_path_eligibility(preview)

    assert result == {}


def test_build_now_path_eligibility_rejects_a_line_without_a_status():
    preview = {"lineItems": [{"subscriptionId": _SUBSCRIPTION_ID}]}

    result = build_now_path_eligibility(preview)

    assert result == {_SUBSCRIPTION_ID: False}
