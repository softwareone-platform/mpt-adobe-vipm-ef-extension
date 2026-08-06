import logging
from typing import Any

from mpt_api_client import RQLQuery
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.services.items import get_partial_sku

logger = logging.getLogger(__name__)

# The picker is an in-memory grid; cap the sweep so a runaway price list
# cannot hold the request open indefinitely.
MAX_ITEMS = 1000


def _for_sale_query() -> RQLQuery:
    """Live price list entries of published items only: what the account may buy."""
    return (
        RQLQuery().n("status").eq("ForSale")
        & RQLQuery().n("item.status").eq("Published")
        & RQLQuery().n("item.product.status").eq("Published")
    )


async def get_listing_price_list_id(ctx: APIContext, listing_id: str) -> str | None:
    """Resolve the price list id embedded in the listing payload.

    The agreement only carries the listing reference; the default listing
    payload embeds the price list. MPT failures propagate to the caller.
    """
    catalog = ctx.mpt_api_service.client.catalog
    listing = await catalog.listings.get(listing_id)
    price_list = listing.to_dict().get("priceList") or {}
    return price_list.get("id")


async def fetch_price_list_items(ctx: APIContext, price_list_id: str) -> list[dict[str, Any]]:
    """Page through the price list's for-sale entries, up to ``MAX_ITEMS``.

    MPT failures propagate to the caller.
    """
    catalog = ctx.mpt_api_service.client.catalog
    query = catalog.price_lists.items(price_list_id).filter(_for_sale_query())
    entries: list[dict[str, Any]] = []
    async for entry in query.iterate():
        entries.append(entry.to_dict())
        if len(entries) >= MAX_ITEMS:
            logger.warning(
                "Price list %s has more than %s for-sale entries; truncating",
                price_list_id,
                MAX_ITEMS,
            )
            break
    return entries


def mark_recommended(
    entries: list[dict[str, Any]], recommended_skus: list[str]
) -> list[dict[str, Any]]:
    """Flag each entry Adobe recommended for this customer.

    Catalog items reference Adobe products by partial SKU while Adobe payloads
    carry full offer ids, so both sides are compared as partial SKUs.
    """
    partial_skus = {get_partial_sku(sku) for sku in recommended_skus}
    for entry in entries:
        item_catalog = entry.get("item") or {}
        vendor = (item_catalog.get("externalIds") or {}).get("vendor") or ""
        entry["recommended"] = bool(vendor) and get_partial_sku(vendor) in partial_skus
    return entries
