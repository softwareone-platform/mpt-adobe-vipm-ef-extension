"""Request scope resolution for the discount code endpoints.

Every discount endpoint receives the agreement as the ``agreement`` query
parameter; the market segment, customer id, currency and country the data
store needs are derived from it (they are read-only in the API, per the TDR).
"""

import logging
from typing import cast

from mpt_extension_sdk.api import (
    APIContext,
    ErrorDetail,
    ForbiddenError,
    ValidationError,
)
from mpt_extension_sdk.models import Agreement

from mpt_adobe_vipm_ef.models.discount import DiscountScope
from mpt_adobe_vipm_ef.routers.api.customer import load_agreement, require_customer_id
from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)

AGREEMENT_QUERY_PARAM = "agreement"


def require_editor_account(ctx: APIContext) -> None:
    """Allow only vendor and operations accounts to author or curate codes."""
    auth = ctx.auth
    if auth is None or auth.account.is_client():
        raise ForbiddenError(
            detail="Managing discount codes requires a vendor or operations account.",
        )


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
        market_segment=_resolve_market_segment(ctx, agreement),
        customer_id=customer_id,
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


def _resolve_market_segment(ctx: APIContext, agreement: Agreement) -> str:
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
