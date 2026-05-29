import asyncio

from mpt_extension_sdk.api.models.events import Event
from mpt_extension_sdk.models import Order
from mpt_extension_sdk.pipeline import OrderContext

from swo_playground.routers.events.order import process_order_purchase


def test_purchase_executes_pipeline(mocker):
    order = mocker.Mock(id="ORD-1", spec=Order)
    event = mocker.Mock(spec=Event, id="EVT-1", object=order)
    context = mocker.Mock(spec=OrderContext)
    pipeline = mocker.patch("swo_playground.routers.events.order.PurchasePipeline", autospec=True)

    asyncio.run(process_order_purchase(event, context))  # act

    pipeline.return_value.execute.assert_awaited_once_with(context)
