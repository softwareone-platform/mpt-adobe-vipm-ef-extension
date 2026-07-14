import re
from http import HTTPStatus

from mpt_extension_sdk.api import APIResponse
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.routing import APIRouter

from mpt_adobe_vipm_ef.services.clients import build_caller_client

agreements_router = APIRouter(prefix="/agreements")

# Reject ids that are not shaped like an agreement id before using them in the split
# request path, so user input cannot alter the target URL (SSRF, SonarQube S7044). The
# check stays inline in the handler on purpose: moving it to a decorator does not clear
# the finding, because the analyzer treats the path parameter as tainted at the boundary.
AGREEMENT_ID_RE = re.compile(r"^AGR(-\d{4})+$")


@agreements_router.post(path="/{agreement_id}/sync", name="agreements-sync")
async def sync_agreement(agreement_id: str, ctx: APIContext) -> APIResponse:
    """Synchronize an agreement view with the current Marketplace data."""
    agreement = await ctx.mpt_api_service.agreements.get_by_id(agreement_id)
    return APIResponse.ok(payload=agreement.to_dict())


@agreements_router.get(path="/{agreement_id}/split", name="agreements-split")
async def split_agreement(agreement_id: str, ctx: APIContext) -> APIResponse:
    """Retrieve the split billing view of an agreement (allocations and buyers)."""
    if not AGREEMENT_ID_RE.fullmatch(agreement_id):
        return APIResponse(status_code=HTTPStatus.BAD_REQUEST)

    client = build_caller_client(ctx)
    if client is None:
        return APIResponse.ok(payload=None)

    agreements = client.commerce.agreements
    url = f"{agreements.path}/{agreement_id}/split"
    response = await agreements.http_client.request("GET", url)
    return APIResponse.ok(payload=response.json())
