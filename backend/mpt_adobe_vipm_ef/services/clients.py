from typing import cast

from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.services.api_client_v2.mpt_api_client import AsyncMPTClient
from mpt_extension_sdk.services.mpt_api_service.client_factory import build_mpt_client

from mpt_adobe_vipm_ef.settings import ExtensionSettings


def build_caller_client(ctx: APIContext) -> AsyncMPTClient | None:
    """Build an MPT client authenticated with the caller's bearer token.

    Unlike ``ctx.mpt_api_service`` (which mints its own account-scoped token),
    this acts as the original caller, so it sees exactly what the caller can --
    e.g. selling prices, which the extension's minted token does not receive.
    """
    return build_mpt_client(
        base_url=ctx.runtime_settings.mpt_api_base_url,
        api_token=ctx.auth.token,
    )


def build_vendor_client(ctx: APIContext) -> AsyncMPTClient | None:
    """Build an MPT client authenticated with the vendor's ``MPT_API_TOKEN``.

    Used for the order steps only the vendor may take, such as validating a
    draft with lines whose price-list rows are private to the client. Returns
    ``None`` when the token is not configured.
    """
    api_token = cast(ExtensionSettings, ctx.ext_settings).mpt_api_token
    if not api_token:
        return None
    return build_mpt_client(
        base_url=ctx.runtime_settings.mpt_api_base_url,
        api_token=api_token,
    )
