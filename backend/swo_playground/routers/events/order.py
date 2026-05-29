import logging

from mpt_extension_sdk.api.models.events import Event
from mpt_extension_sdk.pipeline import OrderContext
from mpt_extension_sdk.routing import EventRouter

from swo_playground.flows.pipelines.purchase import PurchasePipeline

logger = logging.getLogger(__name__)

orders_router = EventRouter(prefix="/events/orders")


@orders_router.task(
    path="/purchase",
    name="orders-purchase",
    event="platform.commerce.order.status_change",
    condition="eq(product.id,PRD-5516-5707)",
)
async def process_order_purchase(event: Event, context: OrderContext) -> None:
    """Process order purchase events."""
    logger.info("Processing purchase event id=%s object_id=%s", event.id, event.object.id)
    await PurchasePipeline().execute(context)
