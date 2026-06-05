from mpt_extension_sdk.routing import PlugRouter
from mpt_extension_sdk.routing.plugs import Plug

from mpt_adobe_vipm_ef.settings import get_settings

plugs_router = PlugRouter()


@plugs_router.register()
def agreement_plugs() -> list[Plug]:
    """Declare agreement UI plugs served from the static asset bridge."""
    product_ids = ",".join(segment.id for segment in get_settings().product_segments)
    condition = f"in(agreement.product.id,({product_ids}))"
    return [
        Plug(
            id="agreement-adobe",
            name="Adobe",
            description="Synchronize the current agreement with Marketplace data.",
            socket="portal.commerce.agreements.agreement",
            href="/static/agreement/index.js",
            condition=condition,
        ),
    ]
