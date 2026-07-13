from mpt_extension_sdk import ExtensionApp

from mpt_adobe_vipm_ef.routers.api import customer  # noqa: F401  (registers agreement routes)
from mpt_adobe_vipm_ef.routers.api.agreements import agreements_router
from mpt_adobe_vipm_ef.routers.api.offer import offer_router
from mpt_adobe_vipm_ef.routers.api.settings import settings_router
from mpt_adobe_vipm_ef.routers.api.subscriptions import subscriptions_router
from mpt_adobe_vipm_ef.routers.events.order import orders_router
from mpt_adobe_vipm_ef.routers.plugs import plugs_router

ext_app = ExtensionApp(prefix="/api/v2", version="6.0.0")
ext_app.include_router(orders_router)
ext_app.include_router(agreements_router)
ext_app.include_router(offer_router)
ext_app.include_router(plugs_router)
ext_app.include_router(settings_router)
ext_app.include_router(subscriptions_router)
