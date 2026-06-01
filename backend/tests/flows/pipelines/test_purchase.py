from mpt_adobe_vipm_ef.flows.pipelines.purchase import PurchasePipeline
from mpt_adobe_vipm_ef.flows.steps.log_order import LogOrderStep


def test_purchase():
    result = PurchasePipeline().steps

    assert len(result) == 1
    assert isinstance(result[0], LogOrderStep) is True
