from mpt_api_client.exceptions import MPTError

from mpt_adobe_vipm_ef.services.items import get_partial_sku, resolve_items_by_sku


def test_get_partial_sku_slices_to_ten_chars():
    result = get_partial_sku("ABCDEFGHIJ1234567890")

    assert result == "ABCDEFGHIJ"


def test_get_partial_sku_keeps_shorter_ids():
    result = get_partial_sku("SHORT")

    assert result == "SHORT"


async def test_resolve_items_by_sku_returns_empty_for_empty_skus(
    catalog_ctx, catalog_items, catalog_product_id
):
    result = await resolve_items_by_sku(catalog_ctx, catalog_product_id, [])

    assert result == {}
    assert catalog_items.filters == []


async def test_resolve_items_by_sku_builds_map_keyed_by_vendor(
    catalog_ctx, catalog_items, catalog_product_id, product_item_factory, expected_item_factory
):
    catalog_items.product_items = [
        product_item_factory("ITM-1", "Item One", "SKU0000001"),
        product_item_factory("ITM-2", "Item Two", "SKU0000002"),
    ]

    result = await resolve_items_by_sku(
        catalog_ctx, catalog_product_id, ["SKU0000001", "SKU0000002"]
    )

    assert result == {
        "SKU0000001": expected_item_factory("ITM-1", "Item One", "SKU0000001"),
        "SKU0000002": expected_item_factory("ITM-2", "Item Two", "SKU0000002"),
    }


async def test_resolve_items_by_sku_skips_items_without_vendor(
    catalog_ctx, catalog_items, catalog_product_id, product_item_factory
):
    catalog_items.product_items = [product_item_factory("ITM-1", "Item One", None)]

    result = await resolve_items_by_sku(catalog_ctx, catalog_product_id, ["SKU0000001"])

    assert result == {}


async def test_resolve_items_by_sku_returns_empty_on_mpt_error(
    catalog_ctx, catalog_items, catalog_product_id
):
    catalog_items.error = MPTError("boom")

    result = await resolve_items_by_sku(catalog_ctx, catalog_product_id, ["SKU0000001"])

    assert result == {}
