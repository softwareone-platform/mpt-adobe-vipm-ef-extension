from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api.context import APIContext

from mpt_adobe_vipm_ef.constants import AGREEMENT_SELECT, LINES_SELECT
from mpt_adobe_vipm_ef.routers.api import subscriptions

sync_subscription = subscriptions.sync_subscription


def _entity(mocker, entity_data):
    entity = mocker.Mock()
    entity.to_dict.return_value = entity_data
    return entity


def _resource(mocker, entity_data):
    return mocker.Mock(get=mocker.AsyncMock(return_value=_entity(mocker, entity_data)))


def _build_ctx(mocker, payload, *, related=None, with_caller=True, priced_lines=None):  # noqa: WPS210
    related = related or {}
    subscription = mocker.Mock()
    subscription.to_dict.return_value = payload
    resource = {
        key: _resource(mocker, related.get(key))
        for key in ("agreement", "licensee", "buyer", "seller")
    }
    resource["subscription"] = _resource(mocker, {"lines": priced_lines or []})
    client = mocker.Mock(
        commerce=mocker.Mock(
            agreements=resource["agreement"],
            subscriptions=resource["subscription"],
        ),
        accounts=mocker.Mock(
            licensees=resource["licensee"],
            buyers=resource["buyer"],
            sellers=resource["seller"],
        ),
    )
    caller = client if with_caller else None
    mocker.patch.object(subscriptions, "build_caller_client", return_value=caller)
    ctx = mocker.Mock(spec=APIContext)
    ctx.mpt_api_service = mocker.Mock(
        subscriptions=mocker.Mock(get_by_id=mocker.AsyncMock(return_value=subscription)),
    )
    return ctx, client


async def test_sync_enriches_related_entities(mocker):
    payload = {
        "id": "SUB-1",
        "agreement": {"id": "AGR-1", "name": "stub"},
        "licensee": {"id": "LCE-1"},
        "buyer": {"id": "BUY-1"},
        "seller": {"id": "SEL-1"},
    }
    ctx, _ = _build_ctx(
        mocker,
        payload,
        related={
            "agreement": {"id": "AGR-1", "vendor": {"name": "Adobe"}},
            "licensee": {"id": "LCE-1", "status": "Enabled"},
            "buyer": {"id": "BUY-1", "taxId": "VAT1"},
            "seller": {"id": "SEL-1", "status": "Active"},
        },
    )

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["agreement"] == {"id": "AGR-1", "vendor": {"name": "Adobe"}}
    assert result.payload["licensee"] == {"id": "LCE-1", "status": "Enabled"}
    assert result.payload["buyer"] == {"id": "BUY-1", "taxId": "VAT1"}
    assert result.payload["seller"] == {"id": "SEL-1", "status": "Active"}


async def test_sync_requests_agreement_parameters(mocker):
    payload = {"id": "SUB-1", "agreement": {"id": "AGR-1", "name": "stub"}}
    ctx, client = _build_ctx(mocker, payload, related={"agreement": {"id": "AGR-1"}})

    await sync_subscription("SUB-1", ctx)  # act

    _, kwargs = client.commerce.agreements.get.call_args
    assert kwargs["select"] == AGREEMENT_SELECT


async def test_sync_skips_entities_without_id(mocker):
    payload = {"id": "SUB-1", "agreement": None}
    ctx, client = _build_ctx(mocker, payload)

    result = await sync_subscription("SUB-1", ctx)  # act

    client.commerce.agreements.get.assert_not_awaited()
    assert result.payload["agreement"] is None


async def test_sync_keeps_stub_on_api_error(mocker):
    payload = {"id": "SUB-1", "agreement": {"id": "AGR-1", "name": "stub"}}
    ctx, client = _build_ctx(mocker, payload, related={"agreement": {"id": "AGR-1"}})
    client.commerce.agreements.get.side_effect = MPTError("boom")

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["agreement"] == {"id": "AGR-1", "name": "stub"}


async def test_sync_takes_the_line_prices_from_the_caller_view(mocker):
    payload = {"id": "SUB-1", "lines": [{"id": "ALI-1", "price": {"unitSP": 400.0}}]}
    priced = {"id": "ALI-1", "price": {"unitSP": 307.28, "SPxY": 3072.8, "SPxM": 256.07}}
    ctx, client = _build_ctx(mocker, payload, priced_lines=[priced])

    result = await sync_subscription("SUB-1", ctx)  # act

    client.commerce.subscriptions.get.assert_awaited_once_with("SUB-1", select=LINES_SELECT)
    assert result.payload["lines"][0]["price"] == priced["price"]


async def test_sync_keeps_the_line_price_when_the_caller_view_lacks_it(mocker):
    payload = {"id": "SUB-1", "lines": [{"id": "ALI-1", "price": {"PPxY": 2734.8}}]}
    other_line = {"id": "ALI-2", "price": {"unitSP": 1.0}}
    ctx, _ = _build_ctx(mocker, payload, priced_lines=[other_line])

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["lines"][0]["price"] == {"PPxY": 2734.8}


async def test_sync_keeps_the_line_prices_when_the_caller_read_fails(mocker):
    payload = {"id": "SUB-1", "lines": [{"id": "ALI-1", "price": {"PPxY": 2734.8}}]}
    ctx, client = _build_ctx(mocker, payload)
    client.commerce.subscriptions.get.side_effect = MPTError("boom")

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["lines"][0]["price"] == {"PPxY": 2734.8}


async def test_sync_without_caller_skips_enrichment(mocker):
    payload = {"id": "SUB-1", "agreement": {"id": "AGR-1", "name": "stub"}}
    ctx, _ = _build_ctx(mocker, payload, with_caller=False)

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["agreement"] == {"id": "AGR-1", "name": "stub"}
