from mpt_extension_sdk.api import APIResponse
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.routing import APIRouter

agreements_router = APIRouter(prefix="/agreements")


@agreements_router.post(path="/{agreement_id}/sync", name="agreements-sync")
async def sync_agreement(agreement_id: str, ctx: APIContext) -> APIResponse:
    """Synchronize an agreement view with the current Marketplace data."""
    agreement = await ctx.mpt_api_service.agreements.get_by_id(agreement_id)
    return APIResponse.ok(payload=agreement.to_dict())
