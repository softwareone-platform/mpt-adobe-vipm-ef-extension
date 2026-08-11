import logging
from typing import Any

from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api import (
    APIContext,
    APIResponse,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.routing import APIRouter
from mpt_extension_sdk.schemas import BaseSchema
from pydantic import Field

from mpt_adobe_vipm_ef.routers.api.customer import load_agreement, validate_agreement_access
from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs
from mpt_adobe_vipm_ef.services.price_list_items import (
    fetch_price_list_items,
    get_listing_price_list_id,
    mark_recommended,
)

logger = logging.getLogger(__name__)

price_list_items_router = APIRouter(prefix="/agreements")


class PriceListItemsRequestBody(BaseSchema):
    """Body schema: the SKUs Adobe recommended, to badge matching entries."""

    recommended_skus: list[str] = Field(
        default_factory=list,
        serialization_alias="recommendedSkus",
        validation_alias="recommendedSkus",
    )


def _resolve_listing_id(agreement: Any) -> str | None:
    """Read the listing reference off the agreement payload.

    ``listing`` is not a typed field of the SDK agreement model; it survives as
    an extra attribute (a plain mapping) when the payload carries it.
    """
    listing = getattr(agreement, "listing", None)
    if isinstance(listing, dict):
        return listing.get("id")
    return getattr(listing, "id", None)


async def _load_entries(ctx: APIContext, listing_id: str) -> list[dict[str, Any]] | None:
    """Resolve the listing's price list and fetch its entries; None when it has none."""
    price_list_id = await get_listing_price_list_id(ctx, listing_id)
    if not price_list_id:
        return None
    return await fetch_price_list_items(ctx, price_list_id)


@price_list_items_router.post(
    path="/{agreement_id}/price-list-items",
    name="agreements-price-list-items",
    body_validator=PriceListItemsRequestBody,
)
@validate_agreement_access
@log_inputs
async def get_price_list_items(
    agreement_id: str, ctx: APIContext, body: PriceListItemsRequestBody
) -> APIResponse:
    """Fetch the agreement's purchasable price list entries, badged with Adobe's recommendations.

    The listing is resolved server-side from the agreement, so callers cannot
    read another account's catalog, and the account-scoped MPT client enforces
    access on every hop.
    """
    agreement = await load_agreement(ctx, agreement_id)
    listing_id = _resolve_listing_id(agreement)
    if not listing_id:
        logger.warning("Agreement %s carries no listing reference", agreement_id)
        raise ValidationError(detail="Agreement has no listing reference.")

    try:
        entries = await _load_entries(ctx, listing_id)
    except MPTError as error:
        logger.warning(
            "MPT request failed while loading price list items for agreement %s "
            "(listing %s): status=%s %s",
            agreement_id,
            listing_id,
            getattr(error, "status_code", None),
            error,
        )
        raise UpstreamServiceError(detail="MPT service request failed")

    if entries is None:
        logger.warning("Listing %s embeds no price list", listing_id)
        raise ValidationError(detail="The agreement's listing has no price list.")

    return APIResponse.ok(payload=mark_recommended(entries, body.recommended_skus))
