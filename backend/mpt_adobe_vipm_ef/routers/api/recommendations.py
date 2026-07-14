import asyncio
import logging

from mpt_extension_sdk.api import (
    APIContext,
    APIResponse,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.routing import APIRouter
from pydantic import ValidationError as PydanticValidationError

from adobe.errors import AdobeError, AdobeHttpError
from adobe.transport import get_header_value
from mpt_adobe_vipm_ef.constants import RECOMMENDATION_TRACKER_HEADER
from mpt_adobe_vipm_ef.context import adobe_client
from mpt_adobe_vipm_ef.models.recommendation import (
    RecommendationRequest,
    RecommendationsResponse,
)
from mpt_adobe_vipm_ef.routers.api.customer import (
    get_authorization_id,
    require_customer_id,
    validate_agreement_access,
)
from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs

logger = logging.getLogger(__name__)

recommendation_router = APIRouter(prefix="/agreements")


@recommendation_router.post(
    path="/{agreement_id}/recommendations",
    name="agreements-recommendations",
    body_validator=RecommendationRequest,
)
@validate_agreement_access
@log_inputs
async def get_recommendations(
    agreement_id: str, ctx: APIContext, body: RecommendationRequest
) -> APIResponse:
    """Fetch Adobe product recommendations (and the tracker id) for a customer's offers."""
    authorization_id = await get_authorization_id(ctx, agreement_id)
    customer_id = await require_customer_id(ctx, agreement_id)
    try:
        raw_body, headers = await asyncio.to_thread(
            adobe_client(ctx).recommendation.get_recommendations,
            authorization_id,
            customer_id,
            [offer.to_dict() for offer in body.offers],
        )
    except AdobeHttpError as error:
        logger.warning(
            "Adobe HTTP error on get_recommendations: status=%s",
            error.status_code if hasattr(error, "status_code") else "?",
        )
        raise UpstreamServiceError(detail="Adobe service request failed")
    except AdobeError as error:
        logger.warning("Adobe configuration error on get_recommendations: %s", error)
        raise ValidationError(detail=str(error))

    try:
        recommendations = RecommendationsResponse.from_payload(raw_body)
    except PydanticValidationError as error:
        logger.warning("Adobe returned a malformed recommendations payload: %s", error)
        raise UpstreamServiceError(detail="Adobe service request failed")
    recommendations = recommendations.model_copy(
        update={
            "x_recommendation_tracker_id": get_header_value(headers, RECOMMENDATION_TRACKER_HEADER),
        },
    )
    return APIResponse.ok(payload=recommendations.to_dict())
