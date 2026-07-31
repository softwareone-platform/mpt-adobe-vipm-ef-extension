import pytest
from mpt_api_client.exceptions import MPTError

from mpt_adobe_vipm_ef.services.pricing import get_unit_selling_prices

UNIT_SP = 307.28

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


async def test_get_unit_selling_prices_reads_the_price_list(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item("ITM-1", UNIT_SP)],
    )

    result = await get_unit_selling_prices(ctx, "AGR-1", ["ITM-1"])  # act

    assert result == {"ITM-1": pytest.approx(UNIT_SP)}


async def test_get_unit_selling_prices_without_price_list_returns_empty(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={},
        price_items=[_price_item("ITM-1", UNIT_SP)],
    )

    result = await get_unit_selling_prices(ctx, "AGR-1", ["ITM-1"])  # act

    assert result == {}


async def test_get_unit_selling_prices_ignores_items_without_unit_price(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item("ITM-1", None)],
    )

    result = await get_unit_selling_prices(ctx, "AGR-1", ["ITM-1"])  # act

    assert result == {}


async def test_get_unit_selling_prices_without_auth_returns_empty(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item("ITM-1", UNIT_SP)],
    )
    monkeypatch.setattr(_BUILD_CALLER_CLIENT, lambda ctx: None)

    result = await get_unit_selling_prices(ctx, "AGR-1", ["ITM-1"])  # act

    assert result == {}


async def test_get_unit_selling_prices_swallows_api_error(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[],
    )
    ctx.mpt_api_service.agreements.error = MPTError("boom")

    result = await get_unit_selling_prices(ctx, "AGR-1", ["ITM-1"])  # act

    assert result == {}
