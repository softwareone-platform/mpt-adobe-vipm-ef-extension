from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.models.product import ProductSegment
from mpt_adobe_vipm_ef.routers.api.settings import get_settings


def test_get_settings_returns_product_segments(mocker):
    product_segments = (ProductSegment(id="PRD-1111-1111", segment="COM"),)
    ctx = mocker.Mock(spec=APIContext)
    ctx.ext_settings = mocker.Mock(product_segments=product_segments)

    result = get_settings(ctx)

    assert result.payload == {"products": [{"id": "PRD-1111-1111", "segment": "COM"}]}
