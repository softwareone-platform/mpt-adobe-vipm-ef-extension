import json

import pytest
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api import ForbiddenError, UpstreamServiceError

from mpt_adobe_vipm_ef.routers.api.order_render import render_order

_ORDER_ID = "ORD-1234-5678"
_BUILD_CALLER_CLIENT = "mpt_adobe_vipm_ef.routers.api.order_render.build_caller_client"

_TEMPLATE = (
    "<h2>Your Adobe account is managed through SoftwareOne</h2>\n\n"
    "* Adobe customer ID: **P1005501386**\n"
    "* Anniversary date: **:date[2027-08-21]**"
)
_RENDERED_BODY = json.dumps(_TEMPLATE)


@pytest.fixture
def caller_client(mocker):
    client = mocker.Mock()
    client.commerce.orders.render = mocker.AsyncMock(return_value=_RENDERED_BODY)
    mocker.patch(_BUILD_CALLER_CLIENT, return_value=client)
    return client


async def test_render_order_returns_the_rendered_product_template(fake_ctx, caller_client):
    result = await render_order(_ORDER_ID, fake_ctx)  # act

    assert result.payload == {"template": _TEMPLATE}
    caller_client.commerce.orders.render.assert_awaited_once_with(_ORDER_ID)


async def test_render_order_passes_through_a_body_that_is_not_a_json_string(
    fake_ctx, caller_client
):
    caller_client.commerce.orders.render.return_value = "# Plain body"

    result = await render_order(_ORDER_ID, fake_ctx)  # act

    assert result.payload == {"template": "# Plain body"}


async def test_render_order_maps_mpt_errors_to_upstream_error(fake_ctx, caller_client):
    caller_client.commerce.orders.render.side_effect = MPTError("boom")

    with pytest.raises(UpstreamServiceError):
        await render_order(_ORDER_ID, fake_ctx)


async def test_render_order_raises_forbidden_without_a_caller(fake_ctx, mocker):
    mocker.patch(_BUILD_CALLER_CLIENT, return_value=None)

    with pytest.raises(ForbiddenError):
        await render_order(_ORDER_ID, fake_ctx)
