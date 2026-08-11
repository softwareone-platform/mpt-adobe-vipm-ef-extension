import pytest
from mpt_extension_sdk.api import UpstreamServiceError, ValidationError
from mpt_extension_sdk.models import Subscription
from requests import ConnectionError as RequestsConnectionError

from mpt_adobe_vipm_ef.models.renewal import NetNewItemSelection, RenewalSubscriptionSelection
from mpt_adobe_vipm_ef.services.renewal_plan import NetNewLine, PlanSubscription
from mpt_adobe_vipm_ef.services.renewal_three_yc import (
    check_renewal_plan_three_yc_floor,
    get_three_yc_commitment,
)
from mpt_adobe_vipm_ef.services.sku_mapping import THREE_YC_TYPE_CONSUMABLE, THREE_YC_TYPE_LICENSE

_LICENSE_SKU = "65304470CA"
_CONSUMABLE_SKU = "65304999CA"
_LICENSE_OFFER_ID = "65304470CA01A12"
_CONSUMABLE_OFFER_ID = "65304999CA01A12"
_MARKET_SEGMENT = "COM"
_COTERM_DATE = "2026-08-20"
_COMMITMENT_END = "2029-08-20"
_ABOVE_LICENSE_FLOOR = 12
_CONSUMABLES_FLOOR = 400
_NET_NEW_CONSUMABLES = 500
_UNMAPPED_QUANTITY = 50


def _plan_subscription(*, offer_id=_LICENSE_OFFER_ID, renew=True, quantity=7, sub_id="SUB-1"):
    selection = RenewalSubscriptionSelection.model_validate({
        "id": sub_id,
        "offerId": offer_id,
        "renew": renew,
        "renewalQuantity": quantity,
    })
    return PlanSubscription(
        selection=selection,
        line_id="ALI-0001",
        current_quantity=10,
        adobe_subscription_id="adobe-sub-1",
        offer_id=offer_id,
        subscription=Subscription.model_validate({"id": sub_id, "name": sub_id}),
    )


def _net_new_line(*, offer_id=_CONSUMABLE_OFFER_ID, quantity=_NET_NEW_CONSUMABLES):
    selection = NetNewItemSelection.model_validate({"offerId": offer_id, "quantity": quantity})
    return NetNewLine(selection=selection, item_id="ITM-0001")


def _customer(*, benefits=None, coterm=_COTERM_DATE):
    return {"cotermDate": coterm, "benefits": benefits or []}


def _commitment_benefit(  # noqa: WPS211
    *,
    status="COMMITTED",
    licenses=None,
    consumables=None,
    end_date=_COMMITMENT_END,
):
    minimums = []
    if licenses is not None:
        minimums.append({"offerType": "LICENSE", "quantity": licenses})
    if consumables is not None:
        minimums.append({"offerType": "CONSUMABLES", "quantity": consumables})
    return {
        "type": "THREE_YEAR_COMMIT",
        "commitment": {
            "status": status,
            "endDate": end_date,
            "minimumQuantities": minimums,
        },
    }


@pytest.fixture
def sku_mapping_store(mocker):
    store_cls = mocker.patch("mpt_adobe_vipm_ef.services.renewal_three_yc.SkuMappingStore")
    store = store_cls.from_settings.return_value
    store.list_three_yc_types.return_value = {
        _LICENSE_SKU: THREE_YC_TYPE_LICENSE,
        _CONSUMABLE_SKU: THREE_YC_TYPE_CONSUMABLE,
    }
    return store


@pytest.fixture
def ctx(mocker):
    return mocker.Mock()


def _resolve_segment():
    return _MARKET_SEGMENT


def test_get_three_yc_commitment_returns_the_commitment_detail():
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])

    result = get_three_yc_commitment(customer)

    assert result["status"] == "COMMITTED"
    assert result["minimumQuantities"] == [{"offerType": "LICENSE", "quantity": 10}]


@pytest.mark.parametrize(
    "customer",
    [
        {},
        {"benefits": []},
        {"benefits": [{"type": "OTHER_BENEFIT"}]},
        {"benefits": [{"type": "THREE_YEAR_COMMIT", "commitment": None}]},
    ],
)
def test_get_three_yc_commitment_returns_empty_when_absent(customer):
    result = get_three_yc_commitment(customer)

    assert result == {}


async def test_check_skips_customers_without_a_commitment(ctx, sku_mapping_store):
    result = await check_renewal_plan_three_yc_floor(
        ctx, _customer(), _resolve_segment, [_plan_subscription()], []
    )

    assert result == {"checked": False, "commitmentStatus": None}
    sku_mapping_store.list_three_yc_types.assert_not_called()


@pytest.mark.parametrize("status", ["REQUESTED", "ACCEPTED", "EXPIRED", "NONCOMPLIANT"])
async def test_check_skips_commitments_not_in_force(ctx, sku_mapping_store, status):
    customer = _customer(benefits=[_commitment_benefit(status=status, licenses=100)])

    result = await check_renewal_plan_three_yc_floor(
        ctx, customer, _resolve_segment, [_plan_subscription(quantity=1)], []
    )

    assert result == {"checked": False, "commitmentStatus": status}


async def test_check_skips_a_commitment_ending_before_the_anniversary(ctx, sku_mapping_store):
    benefit = _commitment_benefit(licenses=100, end_date="2026-08-10")
    customer = _customer(benefits=[benefit], coterm=_COTERM_DATE)

    result = await check_renewal_plan_three_yc_floor(
        ctx, customer, _resolve_segment, [_plan_subscription(quantity=1)], []
    )

    assert result == {"checked": False, "commitmentStatus": "COMMITTED"}


async def test_check_returns_the_summary_when_the_floors_hold(ctx, sku_mapping_store):
    customer = _customer(
        benefits=[_commitment_benefit(licenses=10, consumables=_CONSUMABLES_FLOOR)],
    )
    plan = [_plan_subscription(quantity=_ABOVE_LICENSE_FLOOR)]
    net_new = [_net_new_line()]

    result = await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, plan, net_new)

    assert result == {
        "checked": True,
        "commitmentStatus": "COMMITTED",
        "licenses": {"selected": _ABOVE_LICENSE_FLOOR, "minimum": 10},
        "consumables": {"selected": _NET_NEW_CONSUMABLES, "minimum": _CONSUMABLES_FLOOR},
    }
    sku_mapping_store.list_three_yc_types.assert_called_once_with(
        [_LICENSE_SKU, _CONSUMABLE_SKU], _MARKET_SEGMENT
    )


async def test_check_blocks_a_decrease_below_the_licenses_floor(ctx, sku_mapping_store):
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_three_yc_floor(
            ctx, customer, _resolve_segment, [_plan_subscription(quantity=7)], []
        )

    assert "three-year commitment" in exc_info.value.detail
    assert "of 7 " in exc_info.value.errors[0].detail
    assert "10 licenses" in exc_info.value.errors[0].detail


async def test_check_blocks_a_disabled_renewal_below_the_floor(ctx, sku_mapping_store):
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])
    plan = [_plan_subscription(renew=False, quantity=0)]

    with pytest.raises(ValidationError):
        await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, plan, [])


async def test_check_blocks_a_plan_below_the_consumables_floor(ctx, sku_mapping_store):
    customer = _customer(benefits=[_commitment_benefit(consumables=1000)])

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_three_yc_floor(
            ctx, customer, _resolve_segment, [], [_net_new_line()]
        )

    assert "1000 consumables" in exc_info.value.errors[0].detail


async def test_check_reports_both_floor_breaches_at_once(ctx, sku_mapping_store):
    customer = _customer(benefits=[_commitment_benefit(licenses=10, consumables=1000)])
    plan = [_plan_subscription(quantity=7)]

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_three_yc_floor(
            ctx, customer, _resolve_segment, plan, [_net_new_line()]
        )

    assert len(exc_info.value.errors) == 2


async def test_check_excludes_unmapped_skus_from_the_totals(ctx, sku_mapping_store):
    sku_mapping_store.list_three_yc_types.return_value = {}
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])

    with pytest.raises(ValidationError):
        await check_renewal_plan_three_yc_floor(
            ctx, customer, _resolve_segment, [_plan_subscription(quantity=_UNMAPPED_QUANTITY)], []
        )


async def test_check_sums_selections_sharing_a_sku(ctx, sku_mapping_store):
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])
    plan = [
        _plan_subscription(quantity=6, sub_id="SUB-1"),
        _plan_subscription(quantity=6, sub_id="SUB-2"),
    ]

    result = await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, plan, [])

    assert result["licenses"] == {"selected": 12, "minimum": 10}


async def test_check_maps_store_failures_to_upstream_errors(ctx, sku_mapping_store):
    sku_mapping_store.list_three_yc_types.side_effect = RequestsConnectionError("boom")
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])

    with pytest.raises(UpstreamServiceError):
        await check_renewal_plan_three_yc_floor(
            ctx, customer, _resolve_segment, [_plan_subscription()], []
        )
