import json
import logging

from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api import (
    APIContext,
    APIResponse,
    ForbiddenError,
    UpstreamServiceError,
)
from mpt_extension_sdk.routing import APIRouter

from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs
from mpt_adobe_vipm_ef.services.clients import build_caller_client

logger = logging.getLogger(__name__)

order_render_router = APIRouter(prefix="/orders")


def _decode(rendered: str) -> str:
    """Unwrap the rendered template from its JSON string body.

    ``render()`` hands back the response body verbatim and the endpoint answers
    with ``application/json``, so the template arrives quoted and escaped.
    """
    try:
        decoded = json.loads(rendered)
    except json.JSONDecodeError:
        return rendered
    return decoded if isinstance(decoded, str) else rendered


@order_render_router.get(path="/{order_id}/render", name="orders-render")
@log_inputs
async def render_order(order_id: str, ctx: APIContext) -> APIResponse:
    """Render the product template the order carries.

    The wizard summary steps show the same text the portal shows on a placed
    order: the product's ``OrderProcessing`` template -- the default one the
    platform resolves for a fresh order, later swapped by fulfillment for its
    named variant -- with the platform substituting this order's own values,
    the Adobe customer id and anniversary date among them, so none of that has
    to be filled in here. Rendering runs on the caller's token rather than the
    extension's minted one, so the platform decides who may read the order.
    """
    client = build_caller_client(ctx)
    if client is None:
        raise ForbiddenError(detail="The order template requires an authenticated caller.")
    try:
        template = await client.commerce.orders.render(order_id)
    except MPTError as error:
        logger.warning("Failed to render the order template: %s", error)
        raise UpstreamServiceError(detail="MPT service request failed")
    return APIResponse.ok(payload={"template": _decode(template)})
