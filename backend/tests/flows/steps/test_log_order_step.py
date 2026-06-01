from logging import Logger

from mpt_extension_sdk.pipeline import OrderContext

from mpt_adobe_vipm_ef.flows.steps.log_order import LogOrderStep


async def test_log_order_step(mocker):
    logger = mocker.Mock(spec=Logger)
    ctx = mocker.Mock(spec=OrderContext, order_id="ORD-1", logger=logger)
    step = LogOrderStep()

    await step.process(ctx)  # act

    logger.info.assert_called_once_with("%s - Order pipeline executed.", "ORD-1")
