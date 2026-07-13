import asyncio
import logging

from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs


@log_inputs
async def _payload_route(agreement_id: str, ctx: object) -> str:
    return await asyncio.sleep(0, result="payload")


@log_inputs
async def _string_route(agreement_id: str, subscription_id: str) -> None:
    await asyncio.sleep(0)


@log_inputs
async def _mixed_route(agreement_id: str, count: int) -> None:
    await asyncio.sleep(0)


async def test_log_inputs_returns_wrapped_result():
    result = await _payload_route("AGR-1", ctx=object())

    assert result == "payload"


async def test_log_inputs_strips_crlf_from_string_inputs(caplog):
    with caplog.at_level(logging.INFO):
        await _string_route("AGR\r\n-1", "SUB\n-2")  # act

    result = caplog.records[-1].getMessage()

    assert "\r" not in result
    assert "\n" not in result
    assert "AGR-1" in result
    assert "SUB-2" in result


async def test_log_inputs_excludes_non_string_inputs(caplog):
    with caplog.at_level(logging.INFO):
        await _mixed_route("AGR-1", 5)  # act

    result = caplog.records[-1].getMessage()

    assert "agreement_id" in result
    assert "count" not in result
