import logging
from typing import Any, cast

from mpt_api_client import RQLQuery
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.constants import ITEM_SELECT

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
    return catalog.items.filter(product_filter & vendor_filter).select(*ITEM_SELECT)


def _item_details(payload: dict[str, Any], vendor: str) -> dict[str, Any]:
    """Keep the item fields the wizard info card shows, product vendor included."""
    product = payload.get("product") or {}
    return {
        "id": payload.get("id"),
        "name": payload.get("name"),
        "externalId": vendor,
        "status": payload.get("status"),
        "terms": payload.get("terms"),
        "audit": payload.get("audit"),
        "product": {
            "id": product.get("id"),
            "name": product.get("name"),
            "icon": product.get("icon"),
        },
        "vendor": product.get("vendor"),
    }


async def resolve_items_by_sku(
    ctx: APIContext, product_id: str, skus: list[str]
) -> dict[str, dict[str, Any]]:
    """Resolve catalog items for the given vendor SKUs, keyed by vendor external id.

    Returns ``{vendor_external_id: item_details}`` as built by
    :func:`_item_details`. An API failure yields an empty map so callers can
    degrade gracefully.
    """
    if not skus:
        return {}
    query = _items_query(ctx, product_id, skus)
    product_items: dict[str, dict[str, Any]] = {}
    try:
        async for product_item in query.iterate():
            payload = product_item.to_dict()
            vendor = (payload.get("externalIds") or {}).get("vendor")
            if vendor:
                product_items[vendor] = _item_details(payload, vendor)
    except MPTError:
        logger.exception("Failed to resolve catalog items by SKU")
        return {}
    return product_items
