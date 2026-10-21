from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.services.clients import build_caller_client, build_vendor_client


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


def test_build_vendor_client_uses_the_mpt_api_token(mocker):
    build_mpt_client = mocker.patch(
        "mpt_adobe_vipm_ef.services.clients.build_mpt_client",
    )
    ctx = mocker.Mock(spec=APIContext)
    ctx.ext_settings = mocker.Mock(mpt_api_token=mocker.sentinel.vendor_token)
    ctx.runtime_settings = mocker.Mock(mpt_api_base_url="https://mpt.example")

    result = build_vendor_client(ctx)

    assert result is build_mpt_client.return_value
    build_mpt_client.assert_called_once_with(
        base_url="https://mpt.example",
        api_token=mocker.sentinel.vendor_token,
    )


def test_build_vendor_client_is_none_without_the_token(mocker):
    build_mpt_client = mocker.patch(
        "mpt_adobe_vipm_ef.services.clients.build_mpt_client",
    )
    ctx = mocker.Mock(spec=APIContext)
    ctx.ext_settings = mocker.Mock(mpt_api_token="")

    result = build_vendor_client(ctx)

    assert result is None
    build_mpt_client.assert_not_called()
