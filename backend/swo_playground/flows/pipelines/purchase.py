from typing import override

from mpt_extension_sdk.pipeline import BasePipeline, BaseStep

from swo_playground.flows.steps.log_order import LogOrderStep


class PurchasePipeline(BasePipeline):
    """Purchase pipeline used by the playground event route."""

    @override
    @property
    def steps(self) -> list[BaseStep]:
        return [LogOrderStep()]
