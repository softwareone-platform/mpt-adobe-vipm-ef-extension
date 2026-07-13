from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.services.items import get_partial_sku, resolve_items_by_sku

_PRODUCT_ID = "PRD-0000-0000"


def _build_ctx(mocker, product_items, *, error=None):
    iterator = mocker.MagicMock()
    iterator.__aiter__.return_value = product_items
    query = mocker.Mock()
    if error is None:
        query.iterate.return_value = iterator
    else:
        query.iterate.side_effect = error
    items_service = mocker.Mock()
    items_service.filter.return_value = query

    ctx = mocker.Mock(spec=APIContext)
    ctx.mpt_api_service = mocker.Mock(
        client=mocker.Mock(catalog=mocker.Mock(items=items_service)),
    )
    return ctx


def _product_item(mocker, item_id, name, vendor):
    result = mocker.Mock(id=item_id, external_ids=mocker.Mock(vendor=vendor))
    result.name = name
    return result


def test_get_partial_sku_slices_to_ten_chars():
    result = get_partial_sku("ABCDEFGHIJ1234567890")

    assert result == "ABCDEFGHIJ"


def test_get_partial_sku_keeps_shorter_ids():
    result = get_partial_sku("SHORT")

    assert result == "SHORT"


async def test_resolve_items_by_sku_returns_empty_for_empty_skus(mocker):
    ctx = _build_ctx(mocker, [])

    result = await resolve_items_by_sku(ctx, _PRODUCT_ID, [])

    catalog = ctx.mpt_api_service.client.catalog
    assert result == {}
    catalog.items.filter.assert_not_called()


async def test_resolve_items_by_sku_builds_map_keyed_by_vendor(mocker):
    ctx = _build_ctx(
        mocker,
        [
            _product_item(mocker, "ITM-1", "Item One", "SKU0000001"),
            _product_item(mocker, "ITM-2", "Item Two", "SKU0000002"),
        ],
    )

    result = await resolve_items_by_sku(ctx, _PRODUCT_ID, ["SKU0000001", "SKU0000002"])

    assert result == {
        "SKU0000001": {"id": "ITM-1", "name": "Item One", "externalId": "SKU0000001"},
        "SKU0000002": {"id": "ITM-2", "name": "Item Two", "externalId": "SKU0000002"},
    }


async def test_resolve_items_by_sku_skips_items_without_vendor(mocker):
    ctx = _build_ctx(mocker, [_product_item(mocker, "ITM-1", "Item One", None)])

    result = await resolve_items_by_sku(ctx, _PRODUCT_ID, ["SKU0000001"])

    assert result == {}


async def test_resolve_items_by_sku_returns_empty_on_mpt_error(mocker):
    ctx = _build_ctx(mocker, [], error=MPTError("boom"))

    result = await resolve_items_by_sku(ctx, _PRODUCT_ID, ["SKU0000001"])

    assert result == {}
