import logging
from typing import Any

from mpt_api_client import RQLQuery
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.services.clients import build_caller_client

logger = logging.getLogger(__name__)


async def get_unit_selling_prices(
    ctx: APIContext, agreement_id: str, item_ids: list[Any]
) -> dict[str, float]:
    """Fetch per-unit selling prices for items on the agreement's listing price list.

    An API failure yields an empty map so callers can degrade gracefully.
    """
    if not item_ids:
        return {}
    try:
        return await _fetch_unit_selling_prices(ctx, agreement_id, item_ids)
    except MPTError:
        logger.exception("Failed to load selling prices for items")
        return {}


async def _fetch_unit_selling_prices(  # noqa: WPS210
    ctx: APIContext, agreement_id: str, item_ids: list[Any]
) -> dict[str, float]:
    """Walk agreement -> listing -> price list and read each item's per-unit price.

    Selling prices are only visible to the caller's own token, so we use the
    caller's bearer token rather than the extension's minted account token.
    """
    agreement = await ctx.mpt_api_service.agreements.get_by_id(agreement_id)
    listing_id = agreement.to_dict()["listing"]["id"]
    client = build_caller_client(ctx)
    if client is None:
        return {}
    catalog = ctx.mpt_api_service.client.catalog
    listing = await catalog.listings.get(listing_id, select=["priceList"])
    price_list_id = listing.to_dict().get("priceList", {}).get("id")
    if not price_list_id:
        return {}
    query = client.catalog.price_lists.items(price_list_id).filter(
        RQLQuery().n("item.id").in_(item_ids)
    )
    unit_prices: dict[str, float] = {}
    async for price_item in query.iterate():
        item_id = getattr(price_item.item, "id", None)
        unit_sp = getattr(price_item, "unit_sp", None)
        if item_id and unit_sp is not None:
            unit_prices[item_id] = unit_sp
    return unit_prices
