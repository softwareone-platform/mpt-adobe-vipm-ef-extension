from typing import cast

from mpt_extension_sdk.api import APIResponse
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.routing import APIRouter

from mpt_adobe_vipm_ef.settings import ExtensionSettings

settings_router = APIRouter(prefix="/settings")


@settings_router.get(path="/", name="settings-get")
def get_settings(ctx: APIContext) -> APIResponse:
    """Get the current settings for the extension."""
    settings = cast(ExtensionSettings, ctx.ext_settings)
    products = [segment.to_dict() for segment in settings.product_segments]
    return APIResponse.ok(payload={"products": products})
