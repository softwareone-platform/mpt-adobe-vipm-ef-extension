from mpt_api_client.exceptions import MPTError

from mpt_adobe_vipm_ef.constants import AGREEMENT_SELECT, SPLIT_SELECT, SUBSCRIPTION_AUDIT_SELECT
from mpt_adobe_vipm_ef.routers.api import subscriptions

sync_subscription = subscriptions.sync_subscription


async def test_sync_enriches_related_entities(sync_setup):
    payload = {
        "id": "SUB-1",
        "agreement": {"id": "AGR-1", "name": "stub"},
        "licensee": {"id": "LCE-1"},
        "buyer": {"id": "BUY-1"},
        "seller": {"id": "SEL-1"},
    }
    ctx, _ = sync_setup(
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


async def test_sync_requests_agreement_parameters(sync_setup):
    payload = {"id": "SUB-1", "agreement": {"id": "AGR-1", "name": "stub"}}
    ctx, client = sync_setup(payload, related={"agreement": {"id": "AGR-1"}})

    await sync_subscription("SUB-1", ctx)  # act

    assert client.commerce.agreements.calls == [("AGR-1", AGREEMENT_SELECT)]


async def test_sync_skips_entities_without_id(sync_setup):
    ctx, client = sync_setup({"id": "SUB-1", "agreement": None})

    result = await sync_subscription("SUB-1", ctx)  # act

    assert client.commerce.agreements.calls == []
    assert result.payload["agreement"] is None


async def test_sync_keeps_stub_on_api_error(sync_setup):
    payload = {"id": "SUB-1", "agreement": {"id": "AGR-1", "name": "stub"}}
    ctx, client = sync_setup(payload, related={"agreement": {"id": "AGR-1"}})
    client.commerce.agreements.error = MPTError("boom")

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["agreement"] == {"id": "AGR-1", "name": "stub"}


async def test_sync_adds_the_subscription_split(sync_setup, split_payload):
    payload = {"id": "SUB-1", "splitStatus": "Active"}
    ctx, client = sync_setup(payload, split=split_payload)

    result = await sync_subscription("SUB-1", ctx)  # act

    assert ("SUB-1", SPLIT_SELECT) in client.commerce.subscriptions.calls
    assert result.payload["split"] == split_payload


async def test_sync_skips_the_split_without_split_status(sync_setup):
    ctx, client = sync_setup({"id": "SUB-1"})

    result = await sync_subscription("SUB-1", ctx)  # act

    assert client.commerce.subscriptions.calls == [("SUB-1", SUBSCRIPTION_AUDIT_SELECT)]
    assert "split" not in result.payload


async def test_sync_keeps_the_payload_when_the_split_fails(sync_setup, audit_payload):
    payload = {"id": "SUB-1", "splitStatus": "Active"}
    ctx, client = sync_setup(payload, audit=audit_payload)
    client.commerce.subscriptions.select_errors[SPLIT_SELECT] = MPTError("boom")

    result = await sync_subscription("SUB-1", ctx)  # act

    assert ("SUB-1", SPLIT_SELECT) in client.commerce.subscriptions.calls
    assert "split" not in result.payload
    assert result.payload["audit"] == audit_payload


async def test_sync_adds_the_subscription_audit(sync_setup, audit_payload):
    ctx, _ = sync_setup({"id": "SUB-1"}, audit=audit_payload)

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["audit"] == audit_payload


async def test_sync_keeps_the_payload_when_the_audit_fails(sync_setup, split_payload):
    ctx, client = sync_setup({"id": "SUB-1", "splitStatus": "Active"}, split=split_payload)
    client.commerce.subscriptions.select_errors[SUBSCRIPTION_AUDIT_SELECT] = MPTError("boom")

    result = await sync_subscription("SUB-1", ctx)  # act

    assert ("SUB-1", SUBSCRIPTION_AUDIT_SELECT) in client.commerce.subscriptions.calls
    assert "audit" not in result.payload
    assert result.payload["split"] == split_payload


async def test_sync_adds_the_line_item_details(sync_setup, item_details):
    payload = {
        "id": "SUB-1",
        "product": {"id": "PRD-1"},
        "lines": [
            {"id": "ALI-1", "item": {"id": "ITM-1", "externalIds": {"vendor": "SKU0000001"}}}
        ],
    }
    ctx, _ = sync_setup(payload, product_items={"SKU0000001": item_details})

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["lines"][0]["item"] == {
        "id": "ITM-1",
        "externalIds": {"vendor": "SKU0000001"},
        **item_details,
    }


async def test_sync_skips_the_lines_without_an_item(sync_setup, item_details):
    payload = {
        "id": "SUB-1",
        "product": {"id": "PRD-1"},
        "lines": [
            {"id": "ALI-1"},
            {"id": "ALI-2", "item": {"id": "ITM-1", "externalIds": {"vendor": "SKU0000001"}}},
        ],
    }
    ctx, _ = sync_setup(payload, product_items={"SKU0000001": item_details})

    result = await sync_subscription("SUB-1", ctx)  # act

    lines = result.payload["lines"]
    assert lines[0] == {"id": "ALI-1"}
    assert lines[1]["item"]["status"] == "Published"


async def test_sync_keeps_the_line_item_without_a_product(sync_setup, item_details):
    payload = {"id": "SUB-1", "lines": [{"item": {"externalIds": {"vendor": "SKU0000001"}}}]}
    ctx, _ = sync_setup(payload, product_items={"SKU0000001": item_details})

    result = await sync_subscription("SUB-1", ctx)  # act

    line_item = result.payload["lines"][0]["item"]
    assert line_item == {"externalIds": {"vendor": "SKU0000001"}}


async def test_sync_resolves_the_entity_icons(sync_setup, asset_url):
    licensee = {"id": "LCE-1", "icon": "/v1/accounts/licensees/LCE-1/icon"}
    payload = {"id": "SUB-1", "licensee": licensee}
    ctx, _ = sync_setup(payload, related={"licensee": licensee})

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["licensee"]["icon"] == f"{asset_url}/v1/accounts/licensees/LCE-1/icon"


async def test_sync_without_caller_skips_enrichment(sync_setup, patch_caller_client):
    payload = {"id": "SUB-1", "agreement": {"id": "AGR-1", "name": "stub"}}
    ctx, _ = sync_setup(payload)
    patch_caller_client(None)

    result = await sync_subscription("SUB-1", ctx)  # act

    assert result.payload["agreement"] == {"id": "AGR-1", "name": "stub"}
