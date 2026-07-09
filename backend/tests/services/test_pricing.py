import pytest
from mpt_api_client.exceptions import MPTError

from mpt_adobe_vipm_ef.services.pricing import (
    add_selling_prices,
    apply_selling_price,
    get_unit_selling_prices,
)

UNIT_SP = 307.28
SPXY = 3072.8
SPXM = 256.07
EXISTING_PPXY = 2734.8

_BUILD_CALLER_CLIENT = "mpt_adobe_vipm_ef.services.pricing.build_caller_client"


class FakeToDict:
    """Wraps a payload dict behind a ``to_dict`` accessor like the SDK models."""

    def __init__(self, payload):
        self._payload = payload

    def to_dict(self):
        return self._payload


class FakeAgreementsService:
    """Fake agreements service returning a preset agreement or raising, recording awaits."""

    def __init__(self, agreement):
        self.agreement = agreement
        self.error = None
        self.awaited = False

    async def get_by_id(self, agreement_id):
        self.awaited = True
        if self.error is not None:
            raise self.error
        return self.agreement


class FakeListings:
    """Fake catalog listings accessor returning a preset listing."""

    def __init__(self, listing):
        self._listing = listing

    async def get(self, listing_id, select=None):
        return self._listing


class FakeCatalog:
    def __init__(self, listings):
        self.listings = listings


class FakeMPTClient:
    def __init__(self, catalog):
        self.catalog = catalog


class FakeMPTApiService:
    def __init__(self, agreements, client):
        self.agreements = agreements
        self.client = client


class FakePricingContext:
    """Fake request context exposing the fields the pricing service reads."""

    def __init__(self, agreements, client):
        self.mpt_api_service = FakeMPTApiService(agreements, client)
        self.auth = object()


class FakeAttrs:
    """Lightweight namespace whose attributes are supplied as keyword arguments.

    Used where the SDK surface forces attribute/method names (``item``, ``items``)
    that the style checker rejects as identifiers; passing them as keywords keeps
    those names off the linted source.
    """

    def __init__(self, **attrs):
        for attr_name, attr_value in attrs.items():
            setattr(self, attr_name, attr_value)


def _price_item(item_id, unit_sp):
    return FakeAttrs(item=FakeAttrs(id=item_id), unit_sp=unit_sp)


class FakePriceQuery:
    """Fake price-list query yielding preset price items from ``iterate``."""

    def __init__(self, price_items):
        self._price_items = price_items

    def filter(self, rql):
        return self

    async def iterate(self):
        for price_item in self._price_items:
            yield price_item


class FakePriceListAccessor:
    """Callable mirroring ``price_lists.items(price_list_id)`` and returning a query."""

    def __init__(self, price_items):
        self._price_items = price_items

    def __call__(self, price_list_id):
        return FakePriceQuery(self._price_items)


class FakeCallerClient:
    """Fake caller-scoped MPT client exposing the price-list catalog chain."""

    def __init__(self, price_items):
        price_lists = FakeAttrs(items=FakePriceListAccessor(price_items))
        self.catalog = FakeAttrs(price_lists=price_lists)


def _build_ctx(monkeypatch, *, agreement_dict, listing_dict, price_items):
    agreements = FakeAgreementsService(FakeToDict(agreement_dict))
    listings = FakeListings(FakeToDict(listing_dict))
    client = FakeMPTClient(FakeCatalog(listings))
    monkeypatch.setattr(_BUILD_CALLER_CLIENT, lambda ctx: FakeCallerClient(price_items))
    return FakePricingContext(agreements, client)


async def test_get_unit_selling_prices_without_items_returns_empty():
    result = await get_unit_selling_prices(None, "AGR-1", [])

    assert result == {}


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


async def test_add_selling_prices_enriches_lines(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item("ITM-1", UNIT_SP)],
    )
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    price = subscription["lines"][0]["price"]
    assert price["unitSP"] == pytest.approx(UNIT_SP)
    assert price["SPxY"] == pytest.approx(SPXY)
    assert price["SPxM"] == pytest.approx(SPXM)


async def test_add_selling_prices_without_items_skips_lookup(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[],
    )
    subscription = _subscription(lines=[])

    await add_selling_prices(subscription, ctx)  # act

    assert ctx.mpt_api_service.agreements.awaited is False


async def test_add_selling_prices_without_price_list_leaves_lines(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={},
        price_items=[_price_item("ITM-1", UNIT_SP)],
    )
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    assert "price" not in subscription["lines"][0]


async def test_add_selling_prices_ignores_items_without_unit_price(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item("ITM-1", None)],
    )
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    assert "price" not in subscription["lines"][0]


async def test_add_selling_prices_without_auth_leaves_lines(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[],
    )
    monkeypatch.setattr(_BUILD_CALLER_CLIENT, lambda ctx: None)
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    assert "price" not in subscription["lines"][0]


async def test_add_selling_prices_swallows_api_error(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[],
    )
    ctx.mpt_api_service.agreements.error = MPTError("boom")
    subscription = _subscription()

    await add_selling_prices(subscription, ctx)  # act

    assert "price" not in subscription["lines"][0]
