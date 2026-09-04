"""Request scope resolution for the discount code endpoints.

Every discount endpoint receives the agreement as the ``agreement`` query
parameter; the market segment, customer id, currency and country the data
store needs are derived from it (they are read-only in the API, per the TDR).
"""

import logging
from types import MappingProxyType
from typing import cast

from mpt_extension_sdk.api import (
    APIContext,
    ErrorDetail,
    ForbiddenError,
    ValidationError,
)
from mpt_extension_sdk.api.auth import AccountType
from mpt_extension_sdk.models import Agreement

from mpt_adobe_vipm_ef.models.discount import (
    Commitment,
    DiscountOrderType,
    DiscountScope,
    EligibilityContext,
)
from mpt_adobe_vipm_ef.routers.api.customer import load_agreement, require_customer_id
from mpt_adobe_vipm_ef.services.discounts import SOURCE_OPERATIONS, SOURCE_VENDOR
from mpt_adobe_vipm_ef.services.items import get_partial_sku
from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)

AGREEMENT_QUERY_PARAM = "agreement"
ORDER_TYPE_QUERY_PARAM = "orderType"
OFFER_ID_QUERY_PARAM = "offerId"
OWNED_OFFER_IDS_QUERY_PARAM = "ownedOfferIds"
COMMITMENT_QUERY_PARAM = "commitment"

_OFFER_ID_SEPARATOR = ","
_EDITOR_ACCOUNT_REQUIRED = "Managing discount codes requires a vendor or operations account."
# The ``source`` a closed code is stored with, per authoring account type.
_CLOSED_SOURCES = MappingProxyType({
    AccountType.OPERATIONS: SOURCE_OPERATIONS,
    AccountType.VENDOR: SOURCE_VENDOR,
})
_SUPPORTED_ORDER_TYPES = ", ".join(order_type.value for order_type in DiscountOrderType)
_SUPPORTED_COMMITMENTS = ", ".join(commitment.value for commitment in Commitment)


def require_editor_account(ctx: APIContext) -> None:
    """Allow only vendor and operations accounts to author or curate codes."""
    if ctx.auth.account.is_client():
        raise ForbiddenError(detail=_EDITOR_ACCOUNT_REQUIRED)


def resolve_closed_source(ctx: APIContext) -> str:
    """Return the ``source`` a code authored by this caller is stored with.

    Closed codes record their authoring actor: an operations account stores
    "Operations", a vendor account "Vendor". Any other account type cannot
    author codes at all, so it is rejected like :func:`require_editor_account`.
    """
    source = _CLOSED_SOURCES.get(ctx.auth.account.type)
    if source is None:
        raise ForbiddenError(detail=_EDITOR_ACCOUNT_REQUIRED)
    return source


async def load_discount_scope(ctx: APIContext) -> DiscountScope:
    """Resolve the agreement, market segment and customer id for the request."""
    agreement_id = ctx.request.query.get(AGREEMENT_QUERY_PARAM)
    if not agreement_id:
        raise ValidationError(
            detail="The 'agreement' query parameter is required.",
            errors=[ErrorDetail(pointer="#/agreement", detail="Missing query parameter.")],
        )
    agreement = await load_agreement(ctx, agreement_id)
    _assert_product_allowed(ctx, agreement)
    customer_id = await require_customer_id(ctx, agreement_id)
    return DiscountScope(
        agreement=agreement,
        market_segment=resolve_market_segment(ctx, agreement),
        customer_id=customer_id,
    )


def read_order_type_filter(ctx: APIContext) -> DiscountOrderType | None:
    """Read the optional ``orderType`` filter of the listing endpoint.

    The renewal wizard passes ``RENEWAL`` to be offered only the codes a
    renewal can still apply; the discounts tab omits it and lists every code.
    """
    raw_order_type = ctx.request.query.get(ORDER_TYPE_QUERY_PARAM)
    if not raw_order_type:
        return None
    try:
        return DiscountOrderType(raw_order_type.strip().upper())
    except ValueError:
        raise ValidationError(
            detail=f"The 'orderType' query parameter must be one of {_SUPPORTED_ORDER_TYPES}.",
            errors=[ErrorDetail(pointer="#/orderType", detail="Unsupported order type.")],
        )


def read_eligibility_context(ctx: APIContext) -> EligibilityContext:
    """Read the optional per-line eligibility parameters of the shortlist request.

    The renewal wizard passes the line's offer id, the customer's owned offer ids
    and the commitment term so the shortlist can evaluate the SKU, qualifying-SKU
    and commitment gates. Every parameter is optional; offer ids are normalised to
    their 10-char partial SKUs to match how the store holds them.
    """
    query = ctx.request.query
    return EligibilityContext(
        offer_partial_sku=_read_partial_sku(query.get(OFFER_ID_QUERY_PARAM)),
        owned_partial_skus=_read_owned_partial_skus(query.get(OWNED_OFFER_IDS_QUERY_PARAM)),
        commitment=_read_commitment(query.get(COMMITMENT_QUERY_PARAM)),
    )


def _read_partial_sku(raw_offer_id: str | None) -> str | None:
    """Normalise a single offer id to its partial SKU, or None when absent."""
    if not raw_offer_id or not raw_offer_id.strip():
        return None
    return get_partial_sku(raw_offer_id.strip())


def _read_owned_partial_skus(raw_offer_ids: str | None) -> frozenset[str]:
    """Normalise the comma-separated owned offer ids to a set of partial SKUs."""
    if not raw_offer_ids:
        return frozenset()
    return frozenset(
        get_partial_sku(token.strip())
        for token in raw_offer_ids.split(_OFFER_ID_SEPARATOR)
        if token.strip()
    )


def _read_commitment(raw_commitment: str | None) -> Commitment | None:
    """Parse the optional ``commitment`` filter, rejecting an unknown value."""
    if not raw_commitment:
        return None
    try:
        return Commitment(raw_commitment.strip().upper())
    except ValueError:
        raise ValidationError(
            detail=f"The 'commitment' query parameter must be one of {_SUPPORTED_COMMITMENTS}.",
            errors=[ErrorDetail(pointer="#/commitment", detail="Unsupported commitment.")],
        )


def _assert_product_allowed(ctx: APIContext, agreement: Agreement) -> None:
    """Deny access (403) when the agreement's product is not served by this extension."""
    product_id = agreement.product.id
    allowed_product_ids = cast(ExtensionSettings, ctx.ext_settings).product_ids
    if product_id not in allowed_product_ids:
        logger.warning(
            "Agreement %s product %r is not in the allowed products %r",
            agreement.id,
            product_id,
            allowed_product_ids,
        )
        raise ForbiddenError(
            detail="The agreement's product is not supported by this extension.",
        )


def resolve_market_segment(ctx: APIContext, agreement: Agreement) -> str:
    """Map the agreement's product to its configured market segment."""
    settings = cast(ExtensionSettings, ctx.ext_settings)
    product_id = agreement.product.id
    for product_segment in settings.product_segments:
        if product_segment.id == product_id:
            return product_segment.segment
    logger.warning("Product %s has no configured market segment", product_id)
    raise ValidationError(
        detail="The agreement's product has no configured market segment.",
    )
