from http import HTTPStatus

from mpt_api_client.resources.commerce.agreements import Agreement
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.routers.api.agreements import split_agreement, sync_agreement


async def test_sync_reads_marketplace(mocker, agreement_id, agreement_payload):
    agreement = mocker.Mock(spec=Agreement)
    agreement.to_dict.return_value = agreement_payload
    get_by_id = mocker.AsyncMock(return_value=agreement)
    ctx = mocker.Mock(spec=APIContext)
    ctx.mpt_api_service = mocker.Mock(agreements=mocker.Mock(get_by_id=get_by_id))

    result = await sync_agreement(agreement_id, ctx)  # act

    get_by_id.assert_awaited_once_with(agreement_id)
    assert result.payload == agreement_payload


async def test_split_reads_marketplace(mocker, agreement_id, split_payload):
    response = mocker.Mock()
    response.json.return_value = split_payload
    agreements = mocker.Mock(path="/public/v1/commerce/agreements")
    agreements.http_client.request = mocker.AsyncMock(return_value=response)
    build_caller_client = mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.agreements.build_caller_client"
    )
    build_caller_client.return_value.commerce.agreements = agreements
    ctx = mocker.Mock(spec=APIContext)

    result = await split_agreement(agreement_id, ctx)  # act

    build_caller_client.assert_called_once_with(ctx)
    agreements.http_client.request.assert_awaited_once_with(
        "GET", f"/public/v1/commerce/agreements/{agreement_id}/split"
    )
    assert result.payload == split_payload


async def test_split_without_auth_returns_none(mocker, agreement_id):
    mocker.patch("mpt_adobe_vipm_ef.routers.api.agreements.build_caller_client", return_value=None)
    ctx = mocker.Mock(spec=APIContext)

    result = await split_agreement(agreement_id, ctx)  # act

    assert result.payload is None


async def test_split_rejects_malformed_agreement_id(mocker):
    build_caller_client = mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.agreements.build_caller_client"
    )
    ctx = mocker.Mock(spec=APIContext)

    result = await split_agreement("../../secret", ctx)  # act

    assert result.status_code == HTTPStatus.BAD_REQUEST
    build_caller_client.assert_not_called()
