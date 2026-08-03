from mpt_api_client.resources.commerce.agreements import Agreement
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.routers.api.agreements import sync_agreement


async def test_sync_reads_marketplace(mocker, agreement_id, agreement_payload):
    agreement = mocker.Mock(spec=Agreement)
    agreement.to_dict.return_value = agreement_payload
    get_by_id = mocker.AsyncMock(return_value=agreement)
    ctx = mocker.Mock(spec=APIContext)
    ctx.mpt_api_service = mocker.Mock(agreements=mocker.Mock(get_by_id=get_by_id))

    result = await sync_agreement(agreement_id, ctx)  # act

    get_by_id.assert_awaited_once_with(agreement_id)
    assert result.payload == agreement_payload
