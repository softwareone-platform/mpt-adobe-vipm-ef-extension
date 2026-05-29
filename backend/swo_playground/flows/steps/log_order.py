from typing import override

from mpt_extension_sdk.pipeline import BaseStep, OrderContext


class LogOrderStep(BaseStep):
    """Log the order selected by the runtime context."""

    @override
    async def process(self, ctx: OrderContext) -> None:
        """Log the order id from the runtime context."""
        ctx.logger.info("%s - Playground order pipeline executed.", ctx.order_id)
