from types import MappingProxyType

import pytest
from mpt_api_client.exceptions import MPTError

from mpt_adobe_vipm_ef.services.pricing import (
    ListPrice,
    build_client_quote,
    get_unit_purchase_prices,
    get_unit_selling_prices,
    reduce_client_quote,
)

UNIT_SP = 307.28
UNIT_PP = 285.84
LIST_UNIT_SP = 533.05
LIST_UNIT_PP = 495.84
LIST_PRICE = ListPrice(LIST_UNIT_SP, LIST_UNIT_PP)
QUOTED_UNIT_SP = 412.95
QUOTED_DISCOUNTED_UNIT_SP = 371.65
CODE_DISCOUNT_RATIO = 0.9
ITEMS_BY_LINE = MappingProxyType({1: "ITM-1", 2: "ITM-2", 3: "ITM-3"})
CENT = 0.01

_BUILD_CALLER_CLIENT = "mpt_adobe_vipm_ef.services.pricing.build_caller_client"
_BUILD_VENDOR_CLIENT = "mpt_adobe_vipm_ef.services.pricing.build_vendor_client"


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


def _price_item(item_id, unit_sp, unit_pp=None):
    return FakeAttrs(item=FakeAttrs(id=item_id), unit_sp=unit_sp, unit_pp=unit_pp)


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
    monkeypatch.setattr(_BUILD_VENDOR_CLIENT, lambda ctx: FakeCallerClient(price_items))
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


async def test_get_unit_purchase_prices_reads_the_price_list_as_the_vendor(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item("ITM-1", None, UNIT_PP)],
    )

    result = await get_unit_purchase_prices(ctx, "AGR-1", ["ITM-1"])  # act

    assert result == {"ITM-1": pytest.approx(UNIT_PP)}


async def test_get_unit_purchase_prices_without_vendor_token_returns_empty(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[_price_item("ITM-1", UNIT_SP, UNIT_PP)],
    )
    monkeypatch.setattr(_BUILD_VENDOR_CLIENT, lambda ctx: None)

    result = await get_unit_purchase_prices(ctx, "AGR-1", ["ITM-1"])  # act

    assert result == {}


async def test_get_unit_purchase_prices_swallows_api_error(monkeypatch):
    ctx = _build_ctx(
        monkeypatch,
        agreement_dict={"listing": {"id": "LST-1"}},
        listing_dict={"priceList": {"id": "PRC-1"}},
        price_items=[],
    )
    ctx.mpt_api_service.agreements.error = MPTError("boom")

    result = await get_unit_purchase_prices(ctx, "AGR-1", ["ITM-1"])  # act

    assert result == {}


@pytest.fixture
def quote_factory():
    def factory(*lines):
        return {
            "orderType": "PREVIEW_SWITCH",
            "customerId": "P1005612228",
            "pricingSummary": [{"totalLineItemPartnerPrice": 684.75, "currencyCode": "USD"}],
            "lineItems": list(lines),
        }

    return factory


@pytest.fixture
def priced_line():
    return {
        "extLineItemNumber": 1,
        "offerId": "65322651CA13A12",
        "subscriptionId": "",
        "quantity": 1,
        "proratedDays": 388,
        "pricing": {
            "partnerPrice": 384.12,
            "discountedPartnerPrice": 384.12,
            "netPartnerPrice": 408.32,
            "lineItemPartnerPrice": 408.32,
        },
    }


def test_reduce_client_quote_keeps_only_what_the_wizard_prices_from(quote_factory, priced_line):
    quote = quote_factory(priced_line)

    result = reduce_client_quote(quote, {})

    assert result == {
        "lineItems": [
            {
                "offerId": "65322651CA13A12",
                "subscriptionId": "",
                "pricing": {"discountedPriceRatio": pytest.approx(1)},
            },
        ],
    }


def test_reduce_client_quote_reports_the_codes_discount_as_a_ratio(quote_factory, priced_line):
    discounted_line = {
        **priced_line,
        "pricing": {"partnerPrice": 100, "discountedPartnerPrice": 90},
    }

    result = reduce_client_quote(quote_factory(discounted_line), {})

    pricing = result["lineItems"][0]["pricing"]
    assert pricing == {"discountedPriceRatio": pytest.approx(CODE_DISCOUNT_RATIO)}


def test_reduce_client_quote_prices_a_price_list_line(quote_factory, priced_line):
    other_line = {**priced_line, "extLineItemNumber": 2}
    quote = quote_factory(priced_line, other_line)

    result = reduce_client_quote(quote, {1: LIST_PRICE})

    assert [line["pricing"] for line in result["lineItems"]] == [
        {
            "discountedPriceRatio": pytest.approx(1),
            "quotedUnitSP": pytest.approx(QUOTED_UNIT_SP, abs=CENT),
        },
        {"discountedPriceRatio": pytest.approx(1)},
    ]


def test_reduce_client_quote_carries_the_discount_code_onto_a_price_list_line(
    quote_factory, priced_line
):
    discounted_line = {
        **priced_line,
        "pricing": {"partnerPrice": 384.12, "discountedPartnerPrice": 345.71},
    }

    result = reduce_client_quote(quote_factory(discounted_line), {1: LIST_PRICE})

    pricing = result["lineItems"][0]["pricing"]
    assert pricing["quotedUnitSP"] == pytest.approx(QUOTED_DISCOUNTED_UNIT_SP, abs=CENT)


def test_reduce_client_quote_skips_the_quoted_unit_sp_without_a_purchase_price(
    quote_factory, priced_line
):
    list_prices_by_line = {1: ListPrice(LIST_UNIT_SP, 0)}

    result = reduce_client_quote(quote_factory(priced_line), list_prices_by_line)

    pricing = result["lineItems"][0]["pricing"]
    assert pricing == {"discountedPriceRatio": pytest.approx(1)}


@pytest.mark.parametrize(
    "pricing",
    [
        None,
        {},
        {"partnerPrice": 384.12},
        {"partnerPrice": 0, "discountedPartnerPrice": 384.12},
    ],
)
def test_reduce_client_quote_leaves_a_line_adobe_did_not_price_without_pricing(
    quote_factory, pricing
):
    line = {"extLineItemNumber": 1, "offerId": "65322651CA13A12", "pricing": pricing}

    result = reduce_client_quote(quote_factory(line), {1: LIST_PRICE})

    assert result == {"lineItems": [{"offerId": "65322651CA13A12"}]}


def test_reduce_client_quote_reads_a_quote_without_lines(quote_factory):
    result = reduce_client_quote({"orderType": "PREVIEW_RENEWAL"}, {})

    assert result == {"lineItems": []}


@pytest.fixture
def list_prices(mocker):
    selling = mocker.patch(
        "mpt_adobe_vipm_ef.services.pricing.get_unit_selling_prices",
        mocker.AsyncMock(return_value={"ITM-1": LIST_UNIT_SP}),
    )
    purchase = mocker.patch(
        "mpt_adobe_vipm_ef.services.pricing.get_unit_purchase_prices",
        mocker.AsyncMock(return_value={"ITM-1": LIST_UNIT_PP}),
    )
    return selling, purchase


async def test_build_client_quote_reads_the_items_adobe_priced(
    quote_factory, priced_line, list_prices
):
    selling, purchase = list_prices
    unpriced_line = {"extLineItemNumber": 2, "offerId": "65304481CA13A12"}
    quote = quote_factory(priced_line, unpriced_line)

    result = await build_client_quote(None, "AGR-1", quote, ITEMS_BY_LINE)

    assert result == reduce_client_quote(quote, {1: LIST_PRICE})
    selling.assert_awaited_once_with(None, "AGR-1", ["ITM-1"])
    purchase.assert_awaited_once_with(None, "AGR-1", ["ITM-1"])


@pytest.mark.parametrize("missing_side", [0, 1])
async def test_build_client_quote_leaves_a_line_missing_either_list_price_unquoted(
    quote_factory, priced_line, list_prices, missing_side
):
    list_prices[missing_side].return_value = {}
    quote = quote_factory(priced_line)

    result = await build_client_quote(None, "AGR-1", quote, {1: "ITM-1"})

    assert result == reduce_client_quote(quote, {})


@pytest.mark.parametrize(
    ("quote", "items_by_line"),
    [
        ({"lineItems": [{"extLineItemNumber": 1}]}, {1: "ITM-1"}),
        ({"lineItems": [{"extLineItemNumber": 1, "pricing": {"partnerPrice": 1}}]}, {}),
    ],
)
async def test_build_client_quote_reads_no_price_list_without_a_line_to_price(
    list_prices, quote, items_by_line
):
    selling, purchase = list_prices

    result = await build_client_quote(None, "AGR-1", quote, items_by_line)

    assert result == reduce_client_quote(quote, {})
    selling.assert_not_awaited()
    purchase.assert_not_awaited()


async def test_build_client_quote_answers_no_quote_without_one(list_prices):
    selling, purchase = list_prices

    result = await build_client_quote(None, "AGR-1", None, {1: "ITM-1"})

    assert result is None
    selling.assert_not_awaited()
    purchase.assert_not_awaited()
