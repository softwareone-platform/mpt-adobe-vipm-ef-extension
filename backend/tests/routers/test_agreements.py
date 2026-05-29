from mpt_api_client.resources.commerce.agreements import Agreement
from mpt_extension_sdk.api.context import APIContext

from swo_playground.routers.api.agreements import sync_agreement


async def test_sync_reads_marketplace(mocker, agreement_payload):
    agreement = mocker.Mock(spec=Agreement)
    agreement.to_dict.return_value = agreement_payload
    get_by_id = mocker.AsyncMock(return_value=agreement)
    ctx = mocker.Mock(spec=APIContext)
    ctx.mpt_api_service = mocker.Mock(agreements=mocker.Mock(get_by_id=get_by_id))

    result = await sync_agreement("AGR-1234-5678", ctx)  # act

    get_by_id.assert_awaited_once_with("AGR-1234-5678")
    assert result.payload == agreement_payload
