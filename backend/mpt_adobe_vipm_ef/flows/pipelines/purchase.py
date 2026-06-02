from typing import override

from mpt_extension_sdk.pipeline import BasePipeline, BaseStep

from mpt_adobe_vipm_ef.flows.steps.log_order import LogOrderStep


class PurchasePipeline(BasePipeline):
    """Purchase pipeline used by the order event route."""

    @override
    @property
    def steps(self) -> list[BaseStep]:
        return [LogOrderStep()]
