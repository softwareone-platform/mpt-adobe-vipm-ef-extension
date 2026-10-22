from pathlib import Path

from mpt_extension_sdk.routing import PlugRouter
from mpt_extension_sdk.routing.plugs import Plug

from mpt_adobe_vipm_ef.settings import is_feature_enabled, load_product_segments

plugs_router = PlugRouter()


def bundle_href(module: str) -> str:
    """Return the static href of a frontend module's bundle.

    The release build names each bundle index-<hash>.js, so a new release gets a new
    URL and browsers can't reuse a cached wizard (the static route sends no
    Cache-Control). A watch build, or no build at all, leaves the plain index.js.
    """
    hashed_bundles = sorted(
        (Path.cwd() / "static" / module).glob("index-*.js"),
        key=lambda bundle: bundle.stat().st_mtime,
    )
    bundle_name = hashed_bundles[-1].name if hashed_bundles else "index.js"
    return f"/static/{module}/{bundle_name}"


@plugs_router.register()
def agreement_plugs() -> list[Plug]:
    """Declare the agreement UI plugs that EXT_FEATURES leaves enabled."""
    product_ids = ",".join(segment.id for segment in load_product_segments())
    agreement_condition = f"in(agreement.product.id,({product_ids}))"
    subscription_condition = (
        f"and(in(subscription.product.id,({product_ids})),eq(subscription.status,Active))"
    )
    plugs = [
        Plug(
            id="agreement-adobe",
            name="Adobe",
            description="Synchronize the current agreement with Marketplace data.",
            socket="portal.commerce.agreements.agreement",
            href=bundle_href("agreement"),
            condition=agreement_condition,
        ),
        Plug(
            id="request-commitment-action",
            name="Request 3-year commitment",
            description="Request or update an Adobe 3-year commitment for the agreement.",
            socket="portal.commerce.agreements.agreement.modal",
            href=bundle_href("request-commitment-action"),
            condition=agreement_condition,
        ),
        Plug(
            id="request-linked-membership-action",
            name="Create linked membership",
            description="Create an Adobe linked membership for the agreement's customer.",
            socket="portal.commerce.agreements.agreement.modal",
            href=bundle_href("request-linked-membership-action"),
            condition=agreement_condition,
        ),
        Plug(
            id="request-global-customer-action",
            name="Update global customer",
            description="Enable global sales for the agreement's Adobe customer.",
            socket="portal.commerce.agreements.agreement.modal",
            href=bundle_href("request-global-customer-action"),
            condition=agreement_condition,
        ),
        Plug(
            id="request-discount-action",
            name="Discount",
            description="Create a closed discount code for the agreement's customer.",
            socket="portal.commerce.agreements.agreement.modal",
            href=bundle_href("request-discount-action"),
            condition=agreement_condition,
        ),
        Plug(
            id="request-midterm-upgrade-action",
            name="Upgrade",
            description="Request a mid-term upgrade for the subscription.",
            socket="portal.commerce.subscriptions.subscription.actions",
            href=bundle_href("request-midterm-upgrade-action"),
            condition=subscription_condition,
        ),
        Plug(
            id="request-renewal-action",
            name="Renew",
            description="Request a renewal for the agreement.",
            socket="portal.commerce.agreements.agreement.actions",
            href=bundle_href("request-renewal-action"),
            condition=agreement_condition,
        ),
    ]
    return [plug for plug in plugs if is_feature_enabled(plug.id)]
