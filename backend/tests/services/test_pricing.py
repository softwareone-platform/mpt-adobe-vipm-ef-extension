import pytest
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.services.pricing import (
    add_selling_prices,
    apply_selling_price,
)

UNIT_SP = 307.28
SPXY = 3072.8
SPXM = 256.07
EXISTING_PPXY = 2734.8


def _build_ctx(mocker, *, agreement_dict, listing_dict, price_items):  # noqa: WPS210
    agreement = mocker.Mock()
    agreement.to_dict.return_value = agreement_dict
    listing = mocker.Mock()
    listing.to_dict.return_value = listing_dict

    iterator = mocker.MagicMock()
    iterator.__aiter__.return_value = price_items
    query = mocker.Mock()
    query.iterate.return_value = iterator
    items_service = mocker.Mock()
    items_service.filter.return_value = query

    caller_client = mocker.Mock()
    caller_client.catalog.price_lists.items.return_value = items_service
    mocker.patch(
        "mpt_adobe_vipm_ef.services.pricing.build_caller_client",
        return_value=caller_client,
    )

    ctx = mocker.Mock(spec=APIContext)
    ctx.mpt_api_service = mocker.Mock(
        agreements=mocker.Mock(get_by_id=mocker.AsyncMock(return_value=agreement)),
        client=mocker.Mock(
            catalog=mocker.Mock(
                listings=mocker.Mock(get=mocker.AsyncMock(return_value=listing)),
            ),
        ),
    )
    return ctx


def _price_item(mocker, item_id, unit_sp):
    return mocker.Mock(item=mocker.Mock(id=item_id), unit_sp=unit_sp)


def _subscription(**overrides):
    subscription = {
        "agreement": {"id": "AGR-1"},
        "terms": {"period": "1y"},
        "lines": [{"item": {"id": "ITM-1"}, "quantity": 10}],
    }
    subscription.update(overrides)
    return subscription


@pytest.mark.parametrize(
    ("period", "expected_yearly", "expected_monthly"),
    [
        ("1y", 3072.8, 256.07),
        ("1m", 36873.6, 3072.8),
        ("3y", 1024.27, 85.36),
    ],
)
def test_apply_selling_price_derives_totals(period, expected_yearly, expected_monthly):
    line = {"quantity": 10}

    apply_selling_price(line, UNIT_SP, period)  # act

    assert line["price"]["unitSP"] == pytest.approx(UNIT_SP)
    assert line["price"]["SPxY"] == pytest.approx(expected_yearly)
    assert line["price"]["SPxM"] == pytest.approx(expected_monthly)


def test_apply_selling_price_unknown_period_sets_only_unit():
    line = {"quantity": 10}

    apply_selling_price(line, UNIT_SP, "one-time")  # act

    assert line["price"] == {"unitSP": pytest.approx(UNIT_SP)}


def test_apply_selling_price_keeps_existing_price_fields():
    line = {"quantity": 10, "price": {"PPxY": EXISTING_PPXY, "currency": "USD"}}

    apply_selling_price(line, UNIT_SP, "1y")  # act

    assert line["price"]["PPxY"] == pytest.approx(EXISTING_PPXY)
    assert line["price"]["currency"] == "USD"
    assert line["price"]["unitSP"] == pytest.approx(UNIT_SP)


def test_apply_selling_price_without_unit_price_is_noop():
    line = {"quantity": 10}

    apply_selling_price(line, None, "1y")  # act

    assert "price" not in line


async def test_add_selling_prices_enriches_lines(mocker):
    ctx = _build_ctx(
        mocker,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item(mocker, "ITM-1", UNIT_SP)],
    )
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    price = subscription["lines"][0]["price"]
    assert price["unitSP"] == pytest.approx(UNIT_SP)
    assert price["SPxY"] == pytest.approx(SPXY)
    assert price["SPxM"] == pytest.approx(SPXM)


async def test_add_selling_prices_without_items_skips_lookup(mocker):
    ctx = _build_ctx(
        mocker,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[],
    )
    subscription = _subscription(lines=[])

    await add_selling_prices(subscription, ctx)  # act

    ctx.mpt_api_service.agreements.get_by_id.assert_not_awaited()


async def test_add_selling_prices_without_price_list_leaves_lines(mocker):
    ctx = _build_ctx(
        mocker,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={},
        price_items=[_price_item(mocker, "ITM-1", UNIT_SP)],
    )
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    assert "price" not in subscription["lines"][0]


async def test_add_selling_prices_without_agreement_skips_lookup(mocker):
    ctx = _build_ctx(
        mocker,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item(mocker, "ITM-1", UNIT_SP)],
    )
    subscription = _subscription(agreement={})

    await add_selling_prices(subscription, ctx)  # act

    ctx.mpt_api_service.agreements.get_by_id.assert_not_awaited()
    assert "price" not in subscription["lines"][0]


async def test_add_selling_prices_without_listing_leaves_lines(mocker):
    ctx = _build_ctx(
        mocker,
        agreement_dict={},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item(mocker, "ITM-1", UNIT_SP)],
    )
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    catalog = ctx.mpt_api_service.client.catalog
    catalog.listings.get.assert_not_awaited()
    assert "price" not in subscription["lines"][0]


async def test_add_selling_prices_ignores_items_without_unit_price(mocker):
    ctx = _build_ctx(
        mocker,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item(mocker, "ITM-1", None)],
    )
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    assert "price" not in subscription["lines"][0]


async def test_add_selling_prices_without_auth_leaves_lines(mocker):
    agreement = mocker.Mock()
    agreement.to_dict.return_value = {"listing": {"id": "LST-1"}}
    listing = mocker.Mock()
    listing.to_dict.return_value = {"priceList": {"id": "PRC-1"}}
    ctx = mocker.Mock(spec=APIContext)
    ctx.auth = None
    ctx.mpt_api_service = mocker.Mock(
        agreements=mocker.Mock(get_by_id=mocker.AsyncMock(return_value=agreement)),
        client=mocker.Mock(
            catalog=mocker.Mock(
                listings=mocker.Mock(get=mocker.AsyncMock(return_value=listing)),
            ),
        ),
    )
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    assert "price" not in subscription["lines"][0]


async def test_add_selling_prices_swallows_api_error(mocker):
    ctx = _build_ctx(
        mocker,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[],
    )
    ctx.mpt_api_service.agreements.get_by_id.side_effect = MPTError("boom")
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    assert "price" not in subscription["lines"][0]
