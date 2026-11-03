import asyncio
import logging
from collections.abc import Callable
from typing import Any, NamedTuple

from mpt_api_client import RQLQuery
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.services.api_client_v2.mpt_api_client import AsyncMPTClient

from mpt_adobe_vipm_ef.services.clients import build_caller_client, build_vendor_client

logger = logging.getLogger(__name__)

ClientBuilder = Callable[[APIContext], AsyncMPTClient | None]

# The quote-line fields that find a line's wizard row; prices are reduced apart.
_CLIENT_LINE_FIELDS = ("offerId", "subscriptionId")


async def get_unit_selling_prices(
    ctx: APIContext, agreement_id: str, item_ids: list[Any]
) -> dict[str, float]:
    """Fetch per-unit selling prices for items on the agreement's listing price list.

    Selling prices are only visible to the caller's own token, so we use the
    caller's bearer token rather than the extension's minted account token.
    An API failure yields an empty map so callers can degrade gracefully.
    """
    return await _get_unit_prices(ctx, agreement_id, item_ids, build_caller_client, "unit_sp")


async def get_unit_purchase_prices(
    ctx: APIContext, agreement_id: str, item_ids: list[Any]
) -> dict[str, float]:
    """Fetch per-unit purchase prices for items on the agreement's listing price list.

    The client caller cannot see purchase prices, so they are read with the
    vendor's token. An API failure, or no vendor token, yields an empty map so
    callers can degrade gracefully.
    """
    return await _get_unit_prices(ctx, agreement_id, item_ids, build_vendor_client, "unit_pp")


class ListPrice(NamedTuple):
    """An item's per-unit prices on the agreement's listing price list."""

    unit_sp: float
    unit_pp: float


async def build_client_quote(
    ctx: APIContext,
    agreement_id: str,
    quote: dict[str, Any] | None,
    items_by_line: dict[int, str],
) -> dict[str, Any] | None:
    """Reduce Adobe's quote to the selling-side prices the client wizard shows.

    ``items_by_line`` names the catalog item behind each quote line the wizard
    prices from the price list (an upgrade target, a renewal's new product),
    by ``extLineItemNumber``. Only the lines Adobe priced are looked up, so a
    quote with none of them costs no price-list read. The item's selling price
    is read with the caller's token and its purchase price with the vendor's,
    both at once.
    """
    if quote is None:
        return None
    priced_items = _priced_line_items(quote, items_by_line)
    list_prices = await _get_list_prices(ctx, agreement_id, sorted(set(priced_items.values())))
    return reduce_client_quote(
        quote,
        {
            line_number: list_prices[item_id]
            for line_number, item_id in priced_items.items()
            if item_id in list_prices
        },
    )


def reduce_client_quote(
    quote: dict[str, Any], list_prices_by_line: dict[int, ListPrice]
) -> dict[str, Any]:
    """Reduce Adobe's quote to the lines the client wizard prices its rows from.

    Adobe's quote holds purchase prices, which the client caller must not see,
    so each line keeps only what finds its wizard row (``offerId`` and
    ``subscriptionId``) and what prices it:

    - ``pricing.discountedPriceRatio``, ``discountedPartnerPrice / partnerPrice``:
      what the discount codes leave of Adobe's price, below 1 when a code
      discounts the line. The wizard applies it to a unit SP already at the
      customer's discount level (a subscription line's).
    - ``pricing.quotedUnitSP``, on a line the wizard prices from the price list
      (``list_prices_by_line``). That selling price is marked up from the base
      level's purchase price, so ``unitSP * discountedPartnerPrice / unitPP``
      carries both the customer's level and the codes onto it.

    Lines are found by ``extLineItemNumber`` because Adobe can answer with
    another offer id (the level suffix). A line Adobe did not price carries no
    ``pricing``.
    """
    return {
        "lineItems": [
            _client_line(line, list_prices_by_line.get(line.get("extLineItemNumber")))
            for line in quote.get("lineItems") or []
        ],
    }


async def _get_list_prices(
    ctx: APIContext, agreement_id: str, item_ids: list[str]
) -> dict[str, ListPrice]:
    if not item_ids:
        return {}
    selling_prices, purchase_prices = await asyncio.gather(
        get_unit_selling_prices(ctx, agreement_id, item_ids),
        get_unit_purchase_prices(ctx, agreement_id, item_ids),
    )
    return {
        item_id: ListPrice(selling_prices[item_id], purchase_prices[item_id])
        for item_id in item_ids
        if item_id in selling_prices and item_id in purchase_prices
    }


def _priced_line_items(
    quote: dict[str, Any],
    items_by_line: dict[int, str],
) -> dict[int, str]:
    lines = quote.get("lineItems") or []
    return {
        line["extLineItemNumber"]: items_by_line[line["extLineItemNumber"]]
        for line in lines
        if line.get("extLineItemNumber") in items_by_line and line.get("pricing")
    }


def _client_line(
    line: dict[str, Any],
    list_price: ListPrice | None,
) -> dict[str, Any]:
    client_line: dict[str, Any] = {
        field: line[field] for field in _CLIENT_LINE_FIELDS if field in line
    }
    pricing = _client_pricing(line.get("pricing") or {}, list_price)
    if pricing:
        client_line["pricing"] = pricing
    return client_line


def _client_pricing(
    pricing: dict[str, Any],
    list_price: ListPrice | None,
) -> dict[str, float]:
    partner_price = pricing.get("partnerPrice")
    discounted_partner_price = pricing.get("discountedPartnerPrice")
    if not partner_price or discounted_partner_price is None:
        return {}
    client_pricing = {"discountedPriceRatio": discounted_partner_price / partner_price}
    if list_price is not None and list_price.unit_pp:
        client_pricing["quotedUnitSP"] = (
            list_price.unit_sp * discounted_partner_price / list_price.unit_pp
        )
    return client_pricing


async def _get_unit_prices(
    ctx: APIContext,
    agreement_id: str,
    item_ids: list[Any],
    build_client: ClientBuilder,
    price_field: str,
) -> dict[str, float]:
    if not item_ids:
        return {}
    try:
        return await _fetch_unit_prices(ctx, agreement_id, item_ids, build_client, price_field)
    except MPTError:
        logger.exception("Failed to load the items' %s from the price list", price_field)
        return {}


async def _fetch_unit_prices(  # noqa: WPS210
    ctx: APIContext,
    agreement_id: str,
    item_ids: list[Any],
    build_client: ClientBuilder,
    price_field: str,
) -> dict[str, float]:
    """Walk agreement -> listing -> price list and read each item's per-unit price.

    The price list is read with the client ``build_client`` builds, since each
    token sees a different side of the price: the caller its selling price,
    the vendor its purchase price.
    """
    agreement = await ctx.mpt_api_service.agreements.get_by_id(agreement_id)
    listing_id = agreement.to_dict()["listing"]["id"]
    client = build_client(ctx)
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
        unit_price = getattr(price_item, price_field, None)
        if item_id and unit_price is not None:
            unit_prices[item_id] = unit_price
    return unit_prices
