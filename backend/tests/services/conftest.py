import datetime as dt
from types import SimpleNamespace

import pytest

_PRODUCT_ID = "PRD-0000-0000"
_CREATED_AT = "2000-01-01T00:00:00.000Z"


class FakeCatalogItem:
    """Catalog item exposing the payload the items query returned for it."""

    def __init__(self, payload):
        self.payload = payload

    def to_dict(self):
        return self.payload


class FakeCatalogQuery:
    """Fake catalog query yielding preset catalog items, or raising when iterated."""

    def __init__(self, product_items, error=None):
        self.product_items = product_items
        self.error = error

    def iterate(self):
        if self.error is not None:
            raise self.error
        return self.yield_items()

    async def yield_items(self):
        for product_item in self.product_items:
            yield product_item


class FakeCatalogItems:
    """Fake catalog items accessor recording the filters and fields it was queried with."""

    def __init__(self):
        self.product_items = []
        self.error = None
        self.filters = []
        self.selects = []

    def filter(self, query):
        self.filters.append(query)
        return self

    def select(self, *fields):
        self.selects.append(fields)
        return FakeCatalogQuery(self.product_items, self.error)


@pytest.fixture
def anniversary_date():
    return dt.date.fromisoformat("2026-08-01")


@pytest.fixture
def catalog_product_id():
    return _PRODUCT_ID


@pytest.fixture
def catalog_items():
    """The catalog items accessor the service under test queries."""
    return FakeCatalogItems()


@pytest.fixture
def catalog_ctx(catalog_items):
    """The request context exposing the catalog items accessor."""
    return SimpleNamespace(
        mpt_api_service=SimpleNamespace(
            client=SimpleNamespace(catalog=SimpleNamespace(items=catalog_items)),
        ),
    )


@pytest.fixture
def product_item_factory():
    """Build a catalog item as the items query yields it, catalog details included."""

    def factory(item_id, name, vendor):
        return FakeCatalogItem({
            "id": item_id,
            "name": name,
            "externalIds": {"vendor": vendor},
            "status": "Published",
            "terms": {"period": "dummy-period", "commitment": "dummy-commitment"},
            "audit": {"created": {"at": _CREATED_AT}},
            "product": {
                "id": _PRODUCT_ID,
                "name": "Dummy Product",
                "icon": "/v1/catalog/products/PRD-0000-0000/icon",
                "vendor": {"id": "ACC-0000-0000", "name": "Dummy Vendor"},
            },
        })

    return factory


@pytest.fixture
def expected_item_factory():
    """Build the item details the items service is expected to return."""

    def factory(item_id, name, vendor):
        return {
            "id": item_id,
            "name": name,
            "externalId": vendor,
            "status": "Published",
            "terms": {"period": "dummy-period", "commitment": "dummy-commitment"},
            "audit": {"created": {"at": _CREATED_AT}},
            "product": {
                "id": _PRODUCT_ID,
                "name": "Dummy Product",
                "icon": "/v1/catalog/products/PRD-0000-0000/icon",
            },
            "vendor": {"id": "ACC-0000-0000", "name": "Dummy Vendor"},
        }

    return factory
