from mpt_extension_sdk.routing import PlugRouter
from mpt_extension_sdk.routing.plugs import Plug

from mpt_adobe_vipm_ef.settings import load_product_segments

plugs_router = PlugRouter()


@plugs_router.register()
def agreement_plugs() -> list[Plug]:
    """Declare agreement UI plugs served from the static asset bridge."""
    product_ids = ",".join(segment.id for segment in load_product_segments())
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
        Plug(
            id="request-commitment-action",
            name="Request 3-year commitment",
            description="Request or update an Adobe 3-year commitment for the agreement.",
            socket="portal.commerce.agreements.agreement.modal",
            href="/static/request-commitment-action/index.js",
            condition=condition,
        ),
        Plug(
            id="request-linked-membership-action",
            name="Create linked membership",
            description="Create an Adobe linked membership for the agreement's customer.",
            socket="portal.commerce.agreements.agreement.modal",
            href="/static/request-linked-membership-action/index.js",
            condition=condition,
        ),
        Plug(
            id="request-global-customer-action",
            name="Update global customer",
            description="Enable global sales for the agreement's Adobe customer.",
            socket="portal.commerce.agreements.agreement.modal",
            href="/static/request-global-customer-action/index.js",
            condition=condition,
        ),
    ]
