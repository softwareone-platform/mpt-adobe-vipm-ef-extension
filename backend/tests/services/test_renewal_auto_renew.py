import pytest
from mpt_extension_sdk.api import UpstreamServiceError, ValidationError
from mpt_extension_sdk.models import Subscription
from requests import ConnectionError as RequestsConnectionError

from mpt_adobe_vipm_ef.models.renewal import NetNewItemSelection, RenewalSubscriptionSelection
from mpt_adobe_vipm_ef.services.renewal_auto_renew import (
    check_renewal_plan_auto_renew_support,
    load_auto_renew_support,
)
from mpt_adobe_vipm_ef.services.renewal_plan import PlanSubscription

# Partial SKUs are the first 10 characters of the Adobe offer id.
_SUPPORTED_SKU = "AAAAAAAAAA"
_UNSUPPORTED_SKU = "BBBBBBBBBB"
_UNMAPPED_SKU = "CCCCCCCCCC"
_SUPPORTED_OFFER_ID = f"{_SUPPORTED_SKU}01A12"
_UNSUPPORTED_OFFER_ID = f"{_UNSUPPORTED_SKU}01A12"
_UNMAPPED_OFFER_ID = f"{_UNMAPPED_SKU}01A12"
_MARKET_SEGMENT = "COM"


def _plan_subscription(*, offer_id=_SUPPORTED_OFFER_ID, renew=True, sub_id="SUB-1"):
    selection = RenewalSubscriptionSelection.model_validate({
        "id": sub_id,
        "offerId": offer_id,
        "renew": renew,
        "renewalQuantity": 7 if renew else 0,
    })
    return PlanSubscription(
        selection=selection,
        line_id="ALI-0001",
        current_quantity=10,
        adobe_subscription_id="adobe-sub-1",
        offer_id=offer_id,
        subscription=Subscription.model_validate({"id": sub_id, "name": sub_id}),
    )


def _net_new_item(*, offer_id=_SUPPORTED_OFFER_ID):
    return NetNewItemSelection.model_validate({"offerId": offer_id, "quantity": 5})


@pytest.fixture
def sku_mapping_store(mocker):
    store_cls = mocker.patch("mpt_adobe_vipm_ef.services.renewal_auto_renew.SkuMappingStore")
    store = store_cls.from_settings.return_value
    store.list_auto_renew_supported.return_value = {
        _SUPPORTED_SKU: True,
        _UNSUPPORTED_SKU: False,
    }
    return store


@pytest.fixture
def ctx(mocker):
    return mocker.Mock()


def _resolve_segment():
    return _MARKET_SEGMENT


async def test_load_auto_renew_support_returns_the_store_result(ctx, sku_mapping_store):
    result = await load_auto_renew_support(ctx, [_SUPPORTED_SKU], _MARKET_SEGMENT)

    assert result == {_SUPPORTED_SKU: True, _UNSUPPORTED_SKU: False}
    sku_mapping_store.list_auto_renew_supported.assert_called_once_with(
        [_SUPPORTED_SKU], _MARKET_SEGMENT
    )


async def test_load_auto_renew_support_maps_a_store_failure_to_an_upstream_error(
    ctx, sku_mapping_store
):
    sku_mapping_store.list_auto_renew_supported.side_effect = RequestsConnectionError("boom")

    with pytest.raises(UpstreamServiceError, match="SKU mapping data store"):
        await load_auto_renew_support(ctx, [_SUPPORTED_SKU], _MARKET_SEGMENT)


async def test_check_passes_a_plan_whose_skus_all_support_auto_renewal(ctx, sku_mapping_store):
    plan = [_plan_subscription()]

    await check_renewal_plan_auto_renew_support(ctx, _resolve_segment, plan, [_net_new_item()])

    sku_mapping_store.list_auto_renew_supported.assert_called_once_with(
        [_SUPPORTED_SKU], _MARKET_SEGMENT
    )


async def test_check_skips_the_lookup_when_the_plan_schedules_nothing(ctx, sku_mapping_store):
    plan = [_plan_subscription(renew=False, offer_id=_UNSUPPORTED_OFFER_ID)]

    await check_renewal_plan_auto_renew_support(ctx, _resolve_segment, plan, [])

    sku_mapping_store.list_auto_renew_supported.assert_not_called()


async def test_check_blocks_a_renewing_subscription_without_auto_renewal_support(
    ctx, sku_mapping_store
):
    plan = [_plan_subscription(offer_id=_UNSUPPORTED_OFFER_ID)]

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_auto_renew_support(ctx, _resolve_segment, plan, [])

    assert "cannot renew at the anniversary date" in exc_info.value.detail
    assert exc_info.value.errors[0].pointer == "#/subscriptions"
    assert _UNSUPPORTED_SKU in exc_info.value.errors[0].detail


async def test_check_blocks_a_net_new_item_without_auto_renewal_support(ctx, sku_mapping_store):
    net_new = [_net_new_item(offer_id=_UNSUPPORTED_OFFER_ID)]

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_auto_renew_support(ctx, _resolve_segment, [], net_new)

    assert exc_info.value.errors[0].pointer == "#/netNewItems"
    assert _UNSUPPORTED_SKU in exc_info.value.errors[0].detail


async def test_check_treats_an_unmapped_sku_as_unsupported(ctx, sku_mapping_store):
    plan = [_plan_subscription(offer_id=_UNMAPPED_OFFER_ID)]

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_auto_renew_support(ctx, _resolve_segment, plan, [])

    assert _UNMAPPED_SKU in exc_info.value.errors[0].detail


async def test_check_reports_every_unsupported_sku_in_the_plan(ctx, sku_mapping_store):
    plan = [
        _plan_subscription(offer_id=_UNSUPPORTED_OFFER_ID),
        _plan_subscription(offer_id=_UNMAPPED_OFFER_ID, sub_id="SUB-2"),
    ]

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_auto_renew_support(
            ctx, _resolve_segment, plan, [_net_new_item(offer_id=_UNSUPPORTED_OFFER_ID)]
        )

    assert exc_info.value.errors[0].pointer == "#/subscriptions"
    assert exc_info.value.errors[1].pointer == "#/subscriptions"
    assert exc_info.value.errors[2].pointer == "#/netNewItems"
