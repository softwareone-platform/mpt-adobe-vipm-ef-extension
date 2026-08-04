import logging

from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api import APIContext, APIResponse, UpstreamServiceError
from mpt_extension_sdk.routing import APIRouter

from mpt_adobe_vipm_ef.routers.api.customer import validate_agreement_access
from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs
from mpt_adobe_vipm_ef.services.subscriptions import fetch_agreement_subscriptions

logger = logging.getLogger(__name__)

agreement_subscriptions_router = APIRouter(prefix="/agreements")


@agreement_subscriptions_router.get(
    path="/{agreement_id}/subscriptions",
    name="agreements-subscriptions",
)
@validate_agreement_access
@log_inputs
async def get_agreement_subscriptions(agreement_id: str, ctx: APIContext) -> APIResponse:
    """List the agreement's live subscriptions with their lines.

    The subscriptions have to be queried separately from the agreement because
    the agreement payload's own lines do not carry the item vendor SKU.
    """
    try:
        subscriptions = await fetch_agreement_subscriptions(ctx, agreement_id)
    except MPTError as error:
        logger.warning("Failed to load the agreement subscriptions: %s", error)
        raise UpstreamServiceError(detail="MPT service request failed")
    return APIResponse.ok(payload=subscriptions)
