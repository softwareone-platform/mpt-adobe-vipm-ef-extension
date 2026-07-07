from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.services.api_client_v2.mpt_api_client import AsyncMPTClient
from mpt_extension_sdk.services.mpt_api_service.client_factory import build_mpt_client


def build_caller_client(ctx: APIContext) -> AsyncMPTClient | None:
    """Build an MPT client authenticated with the caller's bearer token.

    Unlike ``ctx.mpt_api_service`` (which mints its own account-scoped token),
    this acts as the original caller, so it sees exactly what the caller can --
    e.g. selling prices, which the extension's minted token does not receive.
    Returns ``None`` when the request has no auth context.
    """
    if ctx.auth is None:
        return None
    return build_mpt_client(
        base_url=ctx.runtime_settings.mpt_api_base_url,
        api_token=ctx.auth.token,
    )
