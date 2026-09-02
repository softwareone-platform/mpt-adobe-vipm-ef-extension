from mpt_extension_sdk import ExtensionApp

from mpt_adobe_vipm_ef.routers.api import customer  # noqa: F401  (registers agreement routes)
from mpt_adobe_vipm_ef.routers.api.agreement_subscriptions import agreement_subscriptions_router
from mpt_adobe_vipm_ef.routers.api.agreements import agreements_router
from mpt_adobe_vipm_ef.routers.api.discounts import discounts_router
from mpt_adobe_vipm_ef.routers.api.offer import offer_router
from mpt_adobe_vipm_ef.routers.api.order_render import order_render_router
from mpt_adobe_vipm_ef.routers.api.price_list_items import price_list_items_router
from mpt_adobe_vipm_ef.routers.api.recommendations import recommendation_router
from mpt_adobe_vipm_ef.routers.api.renewal import renewal_router
from mpt_adobe_vipm_ef.routers.api.settings import settings_router
from mpt_adobe_vipm_ef.routers.api.subscriptions import subscriptions_router
from mpt_adobe_vipm_ef.routers.api.upgrade import upgrade_router
from mpt_adobe_vipm_ef.routers.events.order import orders_router
from mpt_adobe_vipm_ef.routers.plugs import plugs_router
from mpt_adobe_vipm_ef.routers.schedules.discounts import discount_schedules_router

ext_app = ExtensionApp(prefix="/api/v2", version="6.0.0")
ext_app.include_router(orders_router)
ext_app.include_router(agreements_router)
ext_app.include_router(agreement_subscriptions_router)
ext_app.include_router(offer_router)
ext_app.include_router(order_render_router)
ext_app.include_router(price_list_items_router)
ext_app.include_router(recommendation_router)
ext_app.include_router(plugs_router)
ext_app.include_router(settings_router)
ext_app.include_router(subscriptions_router)
ext_app.include_router(upgrade_router)
ext_app.include_router(renewal_router)
ext_app.include_router(discounts_router)
ext_app.include_router(discount_schedules_router)
