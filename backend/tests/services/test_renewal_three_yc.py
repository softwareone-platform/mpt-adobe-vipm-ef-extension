import pytest
from mpt_extension_sdk.api import UpstreamServiceError, ValidationError
from mpt_extension_sdk.models import Subscription
from requests import ConnectionError as RequestsConnectionError

from mpt_adobe_vipm_ef.constants import (
    ACTIVE_SUBSCRIPTION_STATUS,
    INACTIVE_SUBSCRIPTION_STATUS,
    SCHEDULED_SUBSCRIPTION_STATUS,
)
from mpt_adobe_vipm_ef.models.renewal import NetNewItemSelection, RenewalSubscriptionSelection
from mpt_adobe_vipm_ef.services.renewal_plan import NetNewLine, PlanSubscription
from mpt_adobe_vipm_ef.services.renewal_three_yc import (
    check_renewal_plan_three_yc_floor,
    get_three_yc_commitment,
    has_three_yc_in_force,
    project_renewal_quantities,
)
from mpt_adobe_vipm_ef.services.sku_mapping import THREE_YC_TYPE_CONSUMABLE, THREE_YC_TYPE_LICENSE

_LICENSE_SKU = "65304470CA"
_OUTSIDE_PLAN_LICENSE_SKU = "65304578CA"
_CONSUMABLE_SKU = "65304999CA"
_LICENSE_OFFER_ID = "65304470CA01A12"
_OUTSIDE_PLAN_LICENSE_OFFER_ID = "65304578CA01A12"
_CONSUMABLE_OFFER_ID = "65304999CA01A12"
_MARKET_SEGMENT = "COM"
_COTERM_DATE = "2026-08-20"
_COMMITMENT_END = "2029-08-20"
_ABOVE_LICENSE_FLOOR = 12
_PLAN_PLUS_OUTSIDE_PLAN_LICENSES = 11
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
        adobe_subscription_id=f"adobe-{sub_id}",
        offer_id=offer_id,
        subscription=Subscription.model_validate({"id": sub_id, "name": sub_id}),
    )


def _net_new_line(*, offer_id=_CONSUMABLE_OFFER_ID, quantity=_NET_NEW_CONSUMABLES):
    selection = NetNewItemSelection.model_validate({"offerId": offer_id, "quantity": quantity})
    return NetNewLine(selection=selection, item_id="ITM-0001", offer_id=offer_id)


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
        _OUTSIDE_PLAN_LICENSE_SKU: THREE_YC_TYPE_LICENSE,
        _CONSUMABLE_SKU: THREE_YC_TYPE_CONSUMABLE,
    }
    return store


@pytest.fixture
def ctx(mocker):
    return mocker.Mock()


@pytest.fixture
def adobe_subscription_factory():
    def factory(
        *,
        subscription_id="adobe-SUB-1",
        offer_id=_LICENSE_OFFER_ID,
        renewal_quantity=1,
        status=ACTIVE_SUBSCRIPTION_STATUS,
        auto_renew=True,
    ):
        return {
            "subscriptionId": subscription_id,
            "offerId": offer_id,
            "status": status,
            "autoRenewal": {"enabled": auto_renew, "renewalQuantity": renewal_quantity},
        }

    return factory


@pytest.fixture
def one_license_quantities():
    return {_LICENSE_SKU: 1}


@pytest.fixture
def license_customer_factory():
    def factory(licenses_quantity):
        return _customer(benefits=[_commitment_benefit(licenses=licenses_quantity)])

    return factory


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


def test_has_three_yc_in_force_accepts_a_committed_customer():
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])

    result = has_three_yc_in_force(customer)

    assert result is True


@pytest.mark.parametrize(
    "benefits",
    [
        None,
        [_commitment_benefit(status="REQUESTED", licenses=10)],
        [_commitment_benefit(licenses=10, end_date="2026-01-01")],
    ],
)
def test_has_three_yc_in_force_rejects_a_commitment_not_covering_the_anniversary(benefits):
    result = has_three_yc_in_force(_customer(benefits=benefits))

    assert result is False


async def test_check_skips_customers_without_a_commitment(
    ctx, sku_mapping_store, one_license_quantities
):
    result = await check_renewal_plan_three_yc_floor(
        ctx, _customer(), _resolve_segment, one_license_quantities
    )

    assert result == {"checked": False, "commitmentStatus": None}
    sku_mapping_store.list_three_yc_types.assert_not_called()


@pytest.mark.parametrize("status", ["REQUESTED", "ACCEPTED", "EXPIRED", "NONCOMPLIANT"])
async def test_check_skips_commitments_not_in_force(
    ctx, sku_mapping_store, one_license_quantities, status
):
    customer = _customer(benefits=[_commitment_benefit(status=status, licenses=100)])

    result = await check_renewal_plan_three_yc_floor(
        ctx, customer, _resolve_segment, one_license_quantities
    )

    assert result == {"checked": False, "commitmentStatus": status}


async def test_check_skips_a_commitment_ending_before_the_anniversary(
    ctx, sku_mapping_store, one_license_quantities
):
    benefit = _commitment_benefit(licenses=100, end_date="2026-08-10")
    customer = _customer(benefits=[benefit], coterm=_COTERM_DATE)

    result = await check_renewal_plan_three_yc_floor(
        ctx, customer, _resolve_segment, one_license_quantities
    )

    assert result == {"checked": False, "commitmentStatus": "COMMITTED"}


async def test_check_returns_the_summary_when_the_floors_hold(ctx, sku_mapping_store):
    customer = _customer(
        benefits=[_commitment_benefit(licenses=10, consumables=_CONSUMABLES_FLOOR)],
    )
    renewal_quantities = {
        _LICENSE_SKU: _ABOVE_LICENSE_FLOOR,
        _CONSUMABLE_SKU: _NET_NEW_CONSUMABLES,
    }

    result = await check_renewal_plan_three_yc_floor(
        ctx, customer, _resolve_segment, renewal_quantities
    )

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
    renewal_quantities = {_LICENSE_SKU: 7}

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, renewal_quantities)

    assert "three-year commitment" in exc_info.value.detail
    assert "of 7 " in exc_info.value.errors[0].detail
    assert "10 licenses" in exc_info.value.errors[0].detail


def test_project_counts_nothing_for_a_lapsing_plan_subscription(adobe_subscription_factory):
    adobe_subscriptions = {"items": [adobe_subscription_factory()]}
    plan_subscriptions = [_plan_subscription(renew=False, quantity=0)]
    expected_result = {_LICENSE_SKU: 0}

    result = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    assert result == expected_result


async def test_check_blocks_a_plan_below_the_consumables_floor(ctx, sku_mapping_store):
    customer = _customer(benefits=[_commitment_benefit(consumables=1000)])
    renewal_quantities = {_CONSUMABLE_SKU: _NET_NEW_CONSUMABLES}

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, renewal_quantities)

    assert "1000 consumables" in exc_info.value.errors[0].detail


async def test_check_reports_both_floor_breaches_at_once(ctx, sku_mapping_store):
    customer = _customer(benefits=[_commitment_benefit(licenses=10, consumables=1000)])
    renewal_quantities = {_LICENSE_SKU: 7, _CONSUMABLE_SKU: _NET_NEW_CONSUMABLES}

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, renewal_quantities)

    assert len(exc_info.value.errors) == 2


async def test_check_excludes_unmapped_skus_from_the_totals(ctx, sku_mapping_store):
    sku_mapping_store.list_three_yc_types.return_value = {}
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])
    renewal_quantities = {_LICENSE_SKU: _UNMAPPED_QUANTITY}

    with pytest.raises(ValidationError):
        await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, renewal_quantities)


def test_project_sums_subscriptions_sharing_a_sku(adobe_subscription_factory):
    adobe_subscriptions = {
        "items": [
            adobe_subscription_factory(subscription_id="adobe-SUB-1"),
            adobe_subscription_factory(subscription_id="adobe-SUB-2"),
        ],
    }
    plan_subscriptions = [
        _plan_subscription(quantity=6, sub_id="SUB-1"),
        _plan_subscription(quantity=6, sub_id="SUB-2"),
    ]
    expected_result = {_LICENSE_SKU: 12}

    result = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    assert result == expected_result


def test_project_counts_a_renewing_plan_subscription_at_its_plan_total(
    adobe_subscription_factory,
):
    adobe_subscriptions = {"items": [adobe_subscription_factory(renewal_quantity=10)]}
    plan_subscriptions = [_plan_subscription(quantity=_ABOVE_LICENSE_FLOOR)]
    expected_result = {_LICENSE_SKU: _ABOVE_LICENSE_FLOOR}

    result = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    assert result == expected_result


def test_project_skips_an_inactive_plan_subscription(adobe_subscription_factory):
    adobe_subscriptions = {
        "items": [adobe_subscription_factory(status=INACTIVE_SUBSCRIPTION_STATUS)],
    }
    plan_subscriptions = [_plan_subscription(quantity=_ABOVE_LICENSE_FLOOR)]
    expected_result = {}

    result = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    assert result == expected_result


@pytest.mark.parametrize("status", [ACTIVE_SUBSCRIPTION_STATUS, SCHEDULED_SUBSCRIPTION_STATUS])
def test_project_counts_an_auto_renewing_subscription_outside_the_plan(
    adobe_subscription_factory, status
):
    adobe_subscriptions = {
        "items": [
            adobe_subscription_factory(),
            adobe_subscription_factory(
                subscription_id="adobe-SUB-2",
                offer_id=_OUTSIDE_PLAN_LICENSE_OFFER_ID,
                renewal_quantity=5,
                status=status,
            ),
        ],
    }
    plan_subscriptions = [_plan_subscription(quantity=6)]
    expected_result = {_LICENSE_SKU: 6, _OUTSIDE_PLAN_LICENSE_SKU: 5}

    result = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    assert result == expected_result


@pytest.mark.parametrize("status", [ACTIVE_SUBSCRIPTION_STATUS, SCHEDULED_SUBSCRIPTION_STATUS])
def test_project_counts_nothing_for_a_subscription_outside_the_plan_without_auto_renewal(
    adobe_subscription_factory, status
):
    adobe_subscriptions = {
        "items": [
            adobe_subscription_factory(),
            adobe_subscription_factory(
                subscription_id="adobe-SUB-2",
                offer_id=_OUTSIDE_PLAN_LICENSE_OFFER_ID,
                renewal_quantity=5,
                status=status,
                auto_renew=False,
            ),
        ],
    }
    plan_subscriptions = [_plan_subscription(quantity=6)]
    expected_result = {_LICENSE_SKU: 6, _OUTSIDE_PLAN_LICENSE_SKU: 0}

    result = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    assert result == expected_result


def test_project_skips_an_inactive_subscription_outside_the_plan(adobe_subscription_factory):
    adobe_subscriptions = {
        "items": [
            adobe_subscription_factory(),
            adobe_subscription_factory(
                subscription_id="adobe-SUB-2",
                offer_id=_OUTSIDE_PLAN_LICENSE_OFFER_ID,
                renewal_quantity=5,
                status=INACTIVE_SUBSCRIPTION_STATUS,
            ),
        ],
    }
    plan_subscriptions = [_plan_subscription(quantity=6)]
    expected_result = {_LICENSE_SKU: 6}

    result = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    assert result == expected_result


def test_project_adds_a_net_new_product():
    adobe_subscriptions = {"items": []}
    net_new_lines = [_net_new_line()]
    expected_result = {_CONSUMABLE_SKU: _NET_NEW_CONSUMABLES}

    result = project_renewal_quantities(adobe_subscriptions, [], net_new_lines)

    assert result == expected_result


def test_project_counts_a_scheduled_net_new_product_once(adobe_subscription_factory):
    adobe_subscriptions = {
        "items": [
            adobe_subscription_factory(
                offer_id=_CONSUMABLE_OFFER_ID,
                status=SCHEDULED_SUBSCRIPTION_STATUS,
            ),
        ],
    }
    net_new_lines = [_net_new_line()]
    expected_result = {_CONSUMABLE_SKU: _NET_NEW_CONSUMABLES}

    result = project_renewal_quantities(adobe_subscriptions, [], net_new_lines)

    assert result == expected_result


async def test_check_maps_store_failures_to_upstream_errors(
    ctx, sku_mapping_store, one_license_quantities
):
    sku_mapping_store.list_three_yc_types.side_effect = RequestsConnectionError("boom")
    customer = _customer(benefits=[_commitment_benefit(licenses=10)])

    with pytest.raises(UpstreamServiceError):
        await check_renewal_plan_three_yc_floor(
            ctx, customer, _resolve_segment, one_license_quantities
        )


async def test_check_counts_seats_outside_the_plan_toward_the_floor(  # noqa: WPS210
    ctx, sku_mapping_store, adobe_subscription_factory, license_customer_factory
):
    customer = license_customer_factory(10)
    adobe_subscriptions = {
        "items": [
            adobe_subscription_factory(),
            adobe_subscription_factory(
                subscription_id="adobe-SUB-2",
                offer_id=_OUTSIDE_PLAN_LICENSE_OFFER_ID,
                renewal_quantity=5,
            ),
        ],
    }
    plan_subscriptions = [_plan_subscription(quantity=6)]
    renewal_quantities = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])
    expected_result = {"selected": 11, "minimum": 10}

    result = await check_renewal_plan_three_yc_floor(
        ctx, customer, _resolve_segment, renewal_quantities
    )

    assert result["licenses"] == expected_result


async def test_check_counts_consumables_outside_the_plan_toward_the_floor(  # noqa: WPS210
    ctx, sku_mapping_store, adobe_subscription_factory
):
    customer = _customer(
        benefits=[_commitment_benefit(licenses=10, consumables=_CONSUMABLES_FLOOR)],
    )
    adobe_subscriptions = {
        "items": [
            adobe_subscription_factory(),
            adobe_subscription_factory(
                subscription_id="adobe-SUB-2",
                offer_id=_CONSUMABLE_OFFER_ID,
                renewal_quantity=_CONSUMABLES_FLOOR,
            ),
        ],
    }
    plan_subscriptions = [_plan_subscription(quantity=_ABOVE_LICENSE_FLOOR)]
    renewal_quantities = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])
    expected_result = {"selected": _CONSUMABLES_FLOOR, "minimum": _CONSUMABLES_FLOOR}

    result = await check_renewal_plan_three_yc_floor(
        ctx, customer, _resolve_segment, renewal_quantities
    )

    assert result["consumables"] == expected_result


@pytest.mark.parametrize(
    ("plan_quantity", "auto_renew", "expected_count"),
    [
        (4, True, "of 9 "),
        (6, False, "of 6 "),
    ],
)
async def test_check_blocks_a_plan_below_the_floor_counting_seats_outside_it(  # noqa: WPS211
    ctx,
    sku_mapping_store,
    adobe_subscription_factory,
    license_customer_factory,
    plan_quantity,
    auto_renew,
    expected_count,
):
    customer = license_customer_factory(10)
    adobe_subscriptions = {
        "items": [
            adobe_subscription_factory(),
            adobe_subscription_factory(
                subscription_id="adobe-SUB-2",
                offer_id=_OUTSIDE_PLAN_LICENSE_OFFER_ID,
                renewal_quantity=5,
                auto_renew=auto_renew,
            ),
        ],
    }
    plan_subscriptions = [_plan_subscription(quantity=plan_quantity)]
    renewal_quantities = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, renewal_quantities)

    assert expected_count in exc_info.value.errors[0].detail


@pytest.mark.parametrize(
    ("plan_quantity", "outside_subscriptions", "expected_count"),
    [
        pytest.param(10, [], 10, id="renew-now-first-10"),
        pytest.param(
            _ABOVE_LICENSE_FLOOR, [], _ABOVE_LICENSE_FLOOR, id="renew-now-10-renewed-plus-2"
        ),
        pytest.param(_ABOVE_LICENSE_FLOOR, [], _ABOVE_LICENSE_FLOOR, id="anniversary-12"),
        pytest.param(
            6,
            [{"status": SCHEDULED_SUBSCRIPTION_STATUS}],
            _PLAN_PLUS_OUTSIDE_PLAN_LICENSES,
            id="plan-6-scheduled-5-outside",
        ),
        pytest.param(
            6,
            [{"status": ACTIVE_SUBSCRIPTION_STATUS}],
            _PLAN_PLUS_OUTSIDE_PLAN_LICENSES,
            id="plan-6-active-5-outside",
        ),
    ],
)
async def test_check_passes_the_cases_fulfillment_also_passes(  # noqa: WPS211
    ctx,
    sku_mapping_store,
    adobe_subscription_factory,
    license_customer_factory,
    plan_quantity,
    outside_subscriptions,
    expected_count,
):
    customer = license_customer_factory(10)
    adobe_subscriptions = {
        "items": [adobe_subscription_factory()]
        + [
            adobe_subscription_factory(
                subscription_id="adobe-SUB-2",
                offer_id=_OUTSIDE_PLAN_LICENSE_OFFER_ID,
                renewal_quantity=5,
                **outside_subscription,
            )
            for outside_subscription in outside_subscriptions
        ],
    }
    plan_subscriptions = [_plan_subscription(quantity=plan_quantity)]
    renewal_quantities = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    result = await check_renewal_plan_three_yc_floor(
        ctx, customer, _resolve_segment, renewal_quantities
    )

    assert result["licenses"]["selected"] == expected_count


@pytest.mark.parametrize(
    ("plan_quantity", "outside_subscriptions", "expected_count"),
    [
        pytest.param(9, [], 9, id="renew-now-7-renewed-plus-2"),
        pytest.param(
            6,
            [{"status": ACTIVE_SUBSCRIPTION_STATUS, "auto_renew": False}],
            6,
            id="plan-6-outside-5-auto-renew-off",
        ),
        pytest.param(4, [{"status": ACTIVE_SUBSCRIPTION_STATUS}], 9, id="plan-4-active-5-outside"),
    ],
)
async def test_check_blocks_the_cases_fulfillment_also_blocks(  # noqa: WPS211
    ctx,
    sku_mapping_store,
    adobe_subscription_factory,
    license_customer_factory,
    plan_quantity,
    outside_subscriptions,
    expected_count,
):
    customer = license_customer_factory(10)
    adobe_subscriptions = {
        "items": [adobe_subscription_factory()]
        + [
            adobe_subscription_factory(
                subscription_id="adobe-SUB-2",
                offer_id=_OUTSIDE_PLAN_LICENSE_OFFER_ID,
                renewal_quantity=5,
                **outside_subscription,
            )
            for outside_subscription in outside_subscriptions
        ],
    }
    plan_subscriptions = [_plan_subscription(quantity=plan_quantity)]
    renewal_quantities = project_renewal_quantities(adobe_subscriptions, plan_subscriptions, [])

    with pytest.raises(ValidationError) as exc_info:
        await check_renewal_plan_three_yc_floor(ctx, customer, _resolve_segment, renewal_quantities)

    assert f"of {expected_count} " in exc_info.value.errors[0].detail
