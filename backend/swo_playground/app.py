from mpt_extension_sdk import ExtensionApp

from swo_playground.routers.api.agreements import agreements_router
from swo_playground.routers.events.order import orders_router
from swo_playground.routers.plugs import plugs_router

ext_app = ExtensionApp(prefix="/api/v2", version="6.0.0")
ext_app.include_router(orders_router)
ext_app.include_router(agreements_router)
ext_app.include_router(plugs_router)
