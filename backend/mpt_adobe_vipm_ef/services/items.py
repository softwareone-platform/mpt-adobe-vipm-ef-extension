import logging
from typing import Any, cast

from mpt_api_client import RQLQuery
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext

logger = logging.getLogger(__name__)

_SKU_LENGTH = 10


def get_partial_sku(offer_id: str) -> str:
    """Adobe offer ids are full SKUs; the MPT item vendor external id is the first 10 chars."""
    return offer_id[:_SKU_LENGTH]


def _items_query(ctx: APIContext, product_id: str, skus: list[str]) -> Any:
    """Build the catalog query filtering items by product and vendor SKUs."""
    product_filter = RQLQuery().n("product.id").eq(product_id)
    vendor_filter = RQLQuery().n("externalIds.vendor").in_(cast("list[Any]", skus))
    catalog = ctx.mpt_api_service.client.catalog
    return catalog.items.filter(product_filter & vendor_filter)


async def resolve_items_by_sku(
    ctx: APIContext, product_id: str, skus: list[str]
) -> dict[str, dict[str, Any]]:
    """Resolve catalog items for the given vendor SKUs, keyed by vendor external id.

    Returns ``{vendor_external_id: {"id", "name", "externalId"}}``. An API failure
    yields an empty map so callers can degrade gracefully.
    """
    if not skus:
        return {}
    query = _items_query(ctx, product_id, skus)
    product_items: dict[str, dict[str, Any]] = {}
    try:
        async for product_item in query.iterate():
            vendor = getattr(getattr(product_item, "external_ids", None), "vendor", None)
            if vendor:
                product_items[vendor] = {
                    "id": product_item.id,
                    "name": product_item.name,
                    "externalId": vendor,
                }
    except MPTError:
        logger.exception("Failed to resolve catalog items by SKU")
        return {}
    return product_items
