import pytest
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.errors import (
    ForbiddenError,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.models import Agreement

from mpt_adobe_vipm_ef.routers.api.price_list_items import (
    PriceListItemsRequestBody,
    get_price_list_items,
)

_AGREEMENT_ID = "AGR-1234-5678"
_LISTING_ID = "LST-2993-3317"
_PRICE_LIST_ID = "PRC-6095-3767-0001"


class FakeEntity:
    """API entity exposing the payload the API returned for it."""

    def __init__(self, payload):
        self._payload = payload

    def to_dict(self):
        return self._payload


class FakeListings:
    """Fake catalog listings resource returning a preset payload or raising."""

    def __init__(self, payload=None):
        self.payload = payload
        self.error = None
        self.get_calls = []

    async def get(self, resource_id):
        self.get_calls.append(resource_id)
        if self.error is not None:
            raise self.error
        return FakeEntity(self.payload)


class FakePriceListItemsQuery:
    """Fake price list items query recording the filter, select and yielding preset entries."""

    def __init__(self, entries=None):
        self.entries = entries or []
        self.error = None
        self.filters = []
        self.selected = []

    def filter(self, rql):  # noqa: WPS125
        self.filters.append(str(rql))
        return self

    def select(self, *fields):
        self.selected.extend(fields)
        return self

    async def iterate(self, batch_size=100):
        if self.error is not None:
            raise self.error
        for entry in self.entries:
            yield FakeEntity(entry)


class FakePriceLists:
    """Fake catalog price lists resource exposing the items sub-resource."""

    def __init__(self, query):
        self.query = query
        self.items_calls = []

    def items(self, price_list_id):  # noqa: WPS110
        self.items_calls.append(price_list_id)
        return self.query


class FakeCatalog:
    """Catalog namespace of the account-scoped MPT client."""

    def __init__(self, listings, price_lists):
        self.listings = listings
        self.price_lists = price_lists


class FakeMPTClient:
    """Fake MPT client exposing the catalog namespace."""

    def __init__(self, catalog):
        self.catalog = catalog


def _entry(entry_id, vendor_sku):
    return {
        "id": entry_id,
        "status": "ForSale",
        "unitLP": 234,
        "unitSP": 234,
        "item": {"id": f"ITM-{entry_id}", "externalIds": {"vendor": vendor_sku}},
    }


@pytest.fixture
def listing_payload():
    return {"id": _LISTING_ID, "priceList": {"id": _PRICE_LIST_ID, "currency": "USD"}}


@pytest.fixture
def fake_listings(listing_payload):
    return FakeListings(listing_payload)


@pytest.fixture
def fake_items_query():
    return FakePriceListItemsQuery([
        _entry("PRI-1", "65322587CA01A12"),
        _entry("PRI-2", "65304578CA01A12"),
    ])


@pytest.fixture
def fake_price_lists(fake_items_query):
    return FakePriceLists(fake_items_query)


@pytest.fixture
def catalog_ctx(fake_ctx, fake_listings, fake_price_lists, patch_agreement, agreement_factory):
    """Context wired with an agreement carrying a listing and a fake catalog client."""
    agreement = agreement_factory()
    patch_agreement(
        Agreement.from_payload({**agreement.to_dict(), "listing": {"id": _LISTING_ID}}),
    )
    fake_ctx.mpt_api_service.client = FakeMPTClient(
        FakeCatalog(fake_listings, fake_price_lists),
    )
    return fake_ctx


@pytest.fixture
def request_body():
    return PriceListItemsRequestBody.model_validate({"recommendedSkus": ["65304578CA"]})


async def test_get_price_list_items_badges_recommended_entries(catalog_ctx, request_body):
    result = await get_price_list_items(_AGREEMENT_ID, catalog_ctx, request_body)  # act

    flags = {entry["id"]: entry["recommended"] for entry in result.payload}
    assert flags == {"PRI-1": False, "PRI-2": True}


async def test_get_price_list_items_resolves_listing_and_price_list(
    catalog_ctx, fake_listings, fake_price_lists, fake_items_query, request_body
):
    await get_price_list_items(_AGREEMENT_ID, catalog_ctx, request_body)  # act

    assert fake_listings.get_calls == [_LISTING_ID]
    assert fake_price_lists.items_calls == [_PRICE_LIST_ID]
    assert "eq(status,'ForSale')" in fake_items_query.filters[0]
    assert fake_items_query.selected == ["item.terms"]


async def test_get_price_list_items_rejects_agreement_without_listing(
    fake_ctx, resolve_ids, request_body
):
    with pytest.raises(ValidationError):
        await get_price_list_items(_AGREEMENT_ID, fake_ctx, request_body)


async def test_get_price_list_items_rejects_listing_without_price_list(
    catalog_ctx, fake_listings, request_body
):
    fake_listings.payload = {"id": _LISTING_ID}

    with pytest.raises(ValidationError):
        await get_price_list_items(_AGREEMENT_ID, catalog_ctx, request_body)


async def test_get_price_list_items_maps_mpt_errors_to_upstream_error(
    catalog_ctx, fake_listings, request_body
):
    fake_listings.error = MPTError("MPT unavailable")

    with pytest.raises(UpstreamServiceError):
        await get_price_list_items(_AGREEMENT_ID, catalog_ctx, request_body)


async def test_get_price_list_items_raises_forbidden_when_product_not_allowed(
    fake_ctx, patch_agreement, agreement_factory, disallowed_product_id, request_body
):
    patch_agreement(agreement_factory(product_id=disallowed_product_id))

    with pytest.raises(ForbiddenError):
        await get_price_list_items(_AGREEMENT_ID, fake_ctx, request_body)
