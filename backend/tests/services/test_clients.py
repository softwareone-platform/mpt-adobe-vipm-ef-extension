from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.services.clients import build_caller_client


def test_build_caller_client_uses_caller_token(mocker):
    build_mpt_client = mocker.patch(
        "mpt_adobe_vipm_ef.services.clients.build_mpt_client",
    )
    ctx = mocker.Mock(spec=APIContext)
    ctx.auth = mocker.Mock(token=mocker.sentinel.token)
    ctx.runtime_settings = mocker.Mock(mpt_api_base_url="https://mpt.example")

    result = build_caller_client(ctx)

    assert result is build_mpt_client.return_value
    build_mpt_client.assert_called_once_with(
        base_url="https://mpt.example",
        api_token=mocker.sentinel.token,
    )
