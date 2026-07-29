import logging
from typing import Any

from mpt_api_client import RQLQuery
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.constants import (
    MONTHLY_FACTOR,
    PRICE_PRECISION,
    YEARLY_FACTOR,
)
from mpt_adobe_vipm_ef.services.clients import build_caller_client

logger = logging.getLogger(__name__)

Line = dict[str, Any]


def _item_id(line: Line) -> Any:
    return line.get("item", {}).get("id")


async def add_selling_prices(subscription: dict[str, Any], ctx: APIContext) -> None:  # noqa: WPS210
    """Merge selling prices onto each subscription line.

    The subscription payload only carries purchase prices; the per-unit selling
    price lives on the agreement's listing price list. We look it up per item and
    derive ``unitSP``/``SPxM``/``SPxY`` the same way the commerce apps do: from
    the per-unit price, the billing period and the line quantity. An API failure
    leaves the subscription untouched so the sync still succeeds.
    """
    lines = subscription.get("lines") or []
    item_ids = [_item_id(line) for line in lines if _item_id(line)]
    if not item_ids:
        return

    agreement_id = subscription["agreement"]["id"]
    unit_prices = await get_unit_selling_prices(ctx, agreement_id, item_ids)
    period = subscription.get("terms", {}).get("period")
    for line in lines:
        apply_selling_price(line, unit_prices.get(_item_id(line)), period)


def apply_selling_price(line: Line, unit_sp: float | None, period: str | None) -> None:
    """Derive a line's selling prices from its per-unit price and quantity."""
    if unit_sp is None:
        return
    quantity = line.get("quantity") or 0
    price = line.setdefault("price", {})
    price["unitSP"] = unit_sp
    yearly = YEARLY_FACTOR.get(period)
    if yearly is not None:
        price["SPxY"] = round(unit_sp * yearly * quantity, PRICE_PRECISION)
    monthly = MONTHLY_FACTOR.get(period)
    if monthly is not None:
        price["SPxM"] = round(unit_sp * monthly * quantity, PRICE_PRECISION)


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
