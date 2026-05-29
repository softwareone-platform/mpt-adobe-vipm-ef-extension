from mpt_extension_sdk.routing import PlugRouter
from mpt_extension_sdk.routing.plugs import Plug

plugs_router = PlugRouter()


@plugs_router.register()
def agreement_plugs() -> list[Plug]:
    """Declare agreement UI plugs served from the static asset bridge."""
    return [
        Plug(
            id="agreement-playground",
            name="Playground",
            description="Synchronize the current agreement with Marketplace data.",
            socket="portal.commerce.agreements.agreement",
            href="/static/agreement/index.js",
        ),
    ]
