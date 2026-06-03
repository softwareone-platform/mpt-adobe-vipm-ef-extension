import asyncio
import functools
import inspect
import logging
from collections.abc import Awaitable, Callable
from http import HTTPStatus
from typing import Any, cast

from mpt_api_client.exceptions import MPTHttpError
from mpt_extension_sdk.api import APIResponse
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.api.errors import (
    ForbiddenError,
    NotFoundError,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.api.models.errors import ErrorDetail
from mpt_extension_sdk.schemas import BaseSchema
from pydantic import Field

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.routers.api.agreements import agreements_router
from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)

_CUSTOMER_ID_PARAM = "customerId"
_MIN_LENGTH = 1
_MAX_LENGTH = 255
_AGREEMENT_CACHE_KEY = "agreements_by_id"


async def _load_agreement(ctx: APIContext, agreement_id: str) -> Any:
    """Fetch the agreement once per request and cache it in ``ctx.state``.

    The access guard and the route handlers both need the agreement; caching it
    keeps the number of MPT API calls at one per request.

    The MPT API client is account-scoped, so a caller without access to the
    agreement (or a missing agreement) gets a 404 from MPT. That is mapped to a
    :class:`NotFoundError`; any other MPT HTTP failure becomes an upstream error.
    """
    cache = ctx.state.setdefault(_AGREEMENT_CACHE_KEY, {})
    agreement = cache.get(agreement_id)
    if agreement is None:
        try:
            agreement = await ctx.mpt_api_service.agreements.get_by_id(agreement_id)
        except MPTHttpError as error:
            if error.status_code == HTTPStatus.NOT_FOUND:
                logger.warning("Agreement %s not found or not accessible: %s", agreement_id, error)
                raise NotFoundError(detail="Agreement not found.")
            logger.warning(
                "MPT API error while loading agreement %s: status=%s %s",
                agreement_id,
                error.status_code,
                error,
            )
            raise UpstreamServiceError(detail="MPT service request failed")
        cache[agreement_id] = agreement
    return agreement


def _resolve_product_id(agreement: Any) -> str | None:
    product = getattr(agreement, "product", None)
    if product is None:
        return None
    return getattr(product, "id", None)


def _assert_product_allowed(ctx: APIContext, agreement: Any, agreement_id: str) -> None:
    """Deny access (403) if the agreement's product is not in the allowlist."""
    product_id = _resolve_product_id(agreement)
    allowed_product_ids = cast(ExtensionSettings, ctx.ext_settings).product_ids
    if product_id not in allowed_product_ids:
        logger.warning(
            "Agreement %s product %r is not in the allowed products %r",
            agreement_id,
            product_id,
            allowed_product_ids,
        )
        raise ForbiddenError(
            detail="The agreement's product is not supported by this extension.",
        )


def validate_agreement_access(
    handler: Callable[..., Awaitable[APIResponse]],  # noqa: WPS110
) -> Callable[..., Awaitable[APIResponse]]:
    """Guard a route handler with the agreement product check.

    Loads the agreement once (cached in ``ctx.state``) and verifies its product
    is supported by this extension (403) before delegating to the wrapped
    handler. Access control is enforced by the account-scoped MPT client:
    :func:`_load_agreement` returns a 404 when the caller cannot access the
    agreement. The SDK injects handler arguments by keyword and inspects the
    original signature through ``functools.wraps``.
    """
    handler_signature = inspect.signature(handler)

    @functools.wraps(handler)
    async def wrapper(*args: Any, **kwargs: Any) -> APIResponse:
        bound = handler_signature.bind(*args, **kwargs)
        ctx = cast(APIContext, bound.arguments.get("ctx") or bound.arguments.get("context"))  # noqa: WPS221
        agreement_id: str = bound.arguments["agreement_id"]
        agreement = await _load_agreement(ctx, agreement_id)
        _assert_product_allowed(ctx, agreement, agreement_id)
        return await handler(*args, **kwargs)

    return wrapper


class ThreeYCRequestBody(BaseSchema):
    """Body schema for the 3YC commitment/recommitment request endpoint."""

    licenses: int | None = Field(default=None, ge=0)
    consumables: int | None = Field(default=None, ge=0)
    is_recommitment: bool = Field(
        default=False,
        serialization_alias="isRecommitment",
        validation_alias="isRecommitment",
    )


class LinkedMembershipRequestBody(BaseSchema):
    """Body schema for the linked membership request endpoint."""

    name: str = Field(min_length=_MIN_LENGTH, max_length=_MAX_LENGTH)


def _resolve_authorization_id(agreement: Any) -> str | None:
    authorization = getattr(agreement, "authorization", None)
    if authorization is None:
        return None
    return getattr(authorization, "id", None)


def _resolve_customer_id(agreement: Any) -> str | None:
    agreement_parameters = getattr(agreement, "parameters", None)
    if agreement_parameters is None:
        return None
    agreement_param = agreement_parameters.get_parameter(
        _CUSTOMER_ID_PARAM, "fulfillment"
    ) or agreement_parameters.get_parameter(_CUSTOMER_ID_PARAM, "ordering")
    if agreement_param is None:
        return None
    return agreement_param.value or agreement_param.display_value or None


async def _require_authorization_id(ctx: APIContext, agreement_id: str) -> str:
    """Resolve the agreement's authorization id or raise ValidationError."""
    agreement = await _load_agreement(ctx, agreement_id)
    authorization_id = _resolve_authorization_id(agreement)
    logger.debug("Agreement %s resolved to authorization_id=%r", agreement_id, authorization_id)
    if not authorization_id:
        logger.warning("Agreement %s has no authorization", agreement_id)
        raise ValidationError(
            detail="Agreement is not linked to an authorization.",
            errors=[ErrorDetail(pointer="#/authorization", detail="Missing authorization.id")],
        )
    return authorization_id


async def _require_customer_id(ctx: APIContext, agreement_id: str) -> str:
    """Resolve the agreement's Adobe customer id or raise ValidationError."""
    agreement = await _load_agreement(ctx, agreement_id)
    customer_id = _resolve_customer_id(agreement)
    logger.debug("Agreement %s resolved to customer_id=%r", agreement_id, customer_id)
    if not customer_id:
        logger.warning(
            "Agreement %s is missing the '%s' parameter", agreement_id, _CUSTOMER_ID_PARAM
        )
        raise ValidationError(
            detail="Agreement is missing the Adobe customer identifier.",
            errors=[ErrorDetail(pointer=f"#/parameters/{_CUSTOMER_ID_PARAM}", detail="Not set")],
        )
    return customer_id


@agreements_router.get(
    path="/{agreement_id}/customer",
    name="agreements-customer",
)
@validate_agreement_access
async def get_customer(agreement_id: str, ctx: APIContext) -> APIResponse:
    """Fetch the Adobe customer payload for the agreement's customer."""
    logger.info("GET customer for agreement %s", agreement_id)
    authorization_id = await _require_authorization_id(ctx, agreement_id)
    customer_id = await _require_customer_id(ctx, agreement_id)
    try:
        customer = await asyncio.to_thread(
            ctx.adobe_client.customer.get_customer,  # type: ignore[attr-defined]
            authorization_id,
            customer_id,
        )
    except AdobeAPIError as error:
        logger.warning(
            "Adobe API error on get_customer for agreement %s customer %s: %s",
            agreement_id,
            customer_id,
            error,
        )
        raise UpstreamServiceError(detail="Adobe service request failed")
    except AdobeHttpError as error:
        logger.warning(
            "Adobe HTTP error on get_customer for agreement %s customer %s: status=%s body=%r",
            agreement_id,
            customer_id,
            error.status_code if hasattr(error, "status_code") else "?",
            error.response_content,
        )
        raise UpstreamServiceError(detail="Adobe service request failed")
    except AdobeError as error:
        logger.warning(
            "Adobe configuration error on get_customer for agreement %s: %s",
            agreement_id,
            error,
        )
        raise ValidationError(detail=str(error))
    logger.info(
        "Adobe customer %s retrieved for agreement %s (status=%r)",
        customer_id,
        agreement_id,
        customer.get("status"),
    )
    return APIResponse.ok(payload=customer)


@agreements_router.post(
    path="/{agreement_id}/3yc-request",
    name="agreements-3yc-request",
    body_validator=ThreeYCRequestBody,
)
@validate_agreement_access
async def request_three_yc_commitment(
    agreement_id: str,
    ctx: APIContext,
    body: ThreeYCRequestBody,
) -> APIResponse:
    """Submit a 3YC commitment (or recommitment) request to Adobe for the agreement's customer."""
    logger.info(
        "POST 3YC request for agreement %s (licenses=%s consumables=%s isRecommitment=%s)",
        agreement_id,
        body.licenses,
        body.consumables,
        body.is_recommitment,
    )
    if not body.licenses and not body.consumables:
        raise ValidationError(
            detail="At least one of 'licenses' or 'consumables' is required.",
            errors=[
                ErrorDetail(
                    pointer="#/licenses",
                    detail="Provide a minimum number of licenses or consumables.",
                ),
            ],
        )

    authorization_id = await _require_authorization_id(ctx, agreement_id)
    customer_id = await _require_customer_id(ctx, agreement_id)

    commitment_request = {
        "3YCLicenses": str(body.licenses) if body.licenses else "",
        "3YCConsumables": str(body.consumables) if body.consumables else "",
    }
    logger.info(
        "3YC: invoking Adobe create_three_year_request for agreement %s "
        "(customer=%s is_recommitment=%s)",
        agreement_id,
        customer_id,
        body.is_recommitment,
    )

    try:
        result = await asyncio.to_thread(
            ctx.adobe_client.customer.create_three_year_request,  # type: ignore[attr-defined]
            authorization_id,
            customer_id,
            commitment_request,
            is_recommitment=body.is_recommitment,
        )
    except AdobeAPIError as error:
        logger.warning(
            "Adobe rejected the 3YC request: %s (payload=%r)",
            error,
            error.payload,
        )
        raise UpstreamServiceError(detail=str(error))
    except AdobeHttpError as error:
        logger.warning("Adobe HTTP error on 3YC request: %s", error)
        raise UpstreamServiceError(detail=error.response_content or "Adobe HTTP error")
    except AdobeError as error:
        logger.warning("Adobe configuration error on 3YC request: %s", error)
        raise ValidationError(detail=str(error))

    logger.info("3YC: Adobe accepted the request for agreement %s", agreement_id)
    return APIResponse.accepted(payload=result)


@agreements_router.post(
    path="/{agreement_id}/global-sales",
    name="agreements-global-sales",
)
@validate_agreement_access
async def enable_global_sales(
    agreement_id: str,
    ctx: APIContext,
) -> APIResponse:
    """Enable global sales on Adobe for the agreement's customer."""
    authorization_id = await _require_authorization_id(ctx, agreement_id)
    customer_id = await _require_customer_id(ctx, agreement_id)

    try:
        result = await asyncio.to_thread(
            ctx.adobe_client.customer.enable_global_sales,  # type: ignore[attr-defined]
            authorization_id,
            customer_id,
        )
    except AdobeAPIError as error:
        logger.warning("Adobe rejected the global sales request: %s", error)
        raise UpstreamServiceError(detail=str(error))
    except AdobeHttpError as error:
        logger.warning("Adobe HTTP error on global sales request: %s", error)
        raise UpstreamServiceError(detail=error.response_content or "Adobe HTTP error")
    except AdobeError as error:
        logger.warning("Adobe configuration error on global sales request: %s", error)
        raise ValidationError(detail=str(error))

    return APIResponse.accepted(payload=result)


@agreements_router.post(
    path="/{agreement_id}/linked-membership",
    name="agreements-linked-membership",
    body_validator=LinkedMembershipRequestBody,
)
@validate_agreement_access
async def request_linked_membership(
    agreement_id: str,
    ctx: APIContext,
    body: LinkedMembershipRequestBody,
) -> APIResponse:
    """Submit a linked membership request to Adobe for the agreement's customer."""
    authorization_id = await _require_authorization_id(ctx, agreement_id)
    customer_id = await _require_customer_id(ctx, agreement_id)

    try:
        result = await asyncio.to_thread(
            ctx.adobe_client.customer.create_linked_membership_request,  # type: ignore[attr-defined]
            authorization_id,
            customer_id,
            body.name,
        )
    except AdobeAPIError as error:
        logger.warning("Adobe rejected the linked membership request: %s", error)
        raise UpstreamServiceError(detail=str(error))
    except AdobeHttpError as error:
        logger.warning("Adobe HTTP error on linked membership request: %s", error)
        raise UpstreamServiceError(detail=error.response_content or "Adobe HTTP error")
    except AdobeError as error:
        logger.warning("Adobe configuration error on linked membership request: %s", error)
        raise ValidationError(detail=str(error))

    return APIResponse.accepted(payload=result)
