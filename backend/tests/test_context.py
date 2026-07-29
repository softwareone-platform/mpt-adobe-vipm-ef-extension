from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

from mpt_extension_sdk.api.context import APIContext

import mpt_adobe_vipm_ef.context  # noqa: WPS301 (registers APIContext.adobe_client)


@dataclass
class _FakeContext:
    """Minimal stand-in exposing the same ``state`` slot the property uses."""

    state: dict[str, Any] = field(default_factory=dict)


def test_adobe_client_property_is_registered():
    assert isinstance(APIContext.adobe_client, property)  # act


def test_adobe_client_builds_once_and_caches_in_state(mocker):
    client = mocker.Mock()
    get_adobe_client = mocker.patch(
        "mpt_adobe_vipm_ef.context.get_adobe_client", return_value=client
    )
    ctx = _FakeContext()

    first = APIContext.adobe_client.fget(ctx)  # act

    second = APIContext.adobe_client.fget(ctx)
    assert first is client
    assert second is client
    assert ctx.state["adobe_client"] is client
    get_adobe_client.assert_called_once()


def test_adobe_client_returns_value_already_in_state(mocker):
    injected = mocker.Mock()
    get_adobe_client = mocker.patch("mpt_adobe_vipm_ef.context.get_adobe_client")
    ctx = _FakeContext(state={"adobe_client": injected})

    result = APIContext.adobe_client.fget(ctx)

    assert result is injected
    get_adobe_client.assert_not_called()


def test_adobe_client_accessor_returns_context_client():
    client = object()
    ctx = SimpleNamespace(adobe_client=client)

    result = mpt_adobe_vipm_ef.context.adobe_client(ctx)

    assert result is client
