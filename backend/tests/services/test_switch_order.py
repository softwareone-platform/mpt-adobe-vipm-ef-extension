import pytest
from mpt_extension_sdk.models import Agreement

from mpt_adobe_vipm_ef.models.switch import UpgradeOrderRequest, build_switch_payload
from mpt_adobe_vipm_ef.services.switch_order import (
    build_change_order_lines,
    create_switch_change_order,
    find_agreement_line_by_sku,
)

_AGREEMENT_ID = "AGR-1234-5678"
_SOURCE_LINE_ID = "ALI-0001"
_TARGET_LINE_ID = "ALI-0002"
_TARGET_ITEM_ID = "ITM-TARGET"
_TARGET_SKU = "65322651CA"


def _agreement_with_lines(lines):
    return Agreement.from_payload({
        "id": _AGREEMENT_ID,
        "name": "Dummy Agreement",
        "client": {"id": "ACC-0000-0001", "name": "Dummy Client"},
        "licensee": {"id": "LCE-0000-0001", "name": "Dummy Licensee", "status": "active"},
        "product": {"id": "PRD-1111-1111", "name": "Dummy Product"},
        "lines": lines,
    })


def _line_payload(line_id, vendor_sku, quantity):
    return {
        "id": line_id,
        "quantity": quantity,
        "item": {
            "id": "ITM-ANY",
            "name": "Any Item",
            "externalIds": {"vendor": vendor_sku},
        },
    }


@pytest.fixture
def source_line(mocker):
    return mocker.Mock(id=_SOURCE_LINE_ID, quantity=10)


def test_find_agreement_line_by_sku_returns_matching_line():
    agreement = _agreement_with_lines([
        _line_payload(_SOURCE_LINE_ID, "65304479CA", 10),
        _line_payload(_TARGET_LINE_ID, _TARGET_SKU, 4),
    ])

    result = find_agreement_line_by_sku(agreement, _TARGET_SKU, _SOURCE_LINE_ID)

    assert result is not None
    assert result.id == _TARGET_LINE_ID


def test_find_agreement_line_by_sku_skips_the_source_line():
    agreement = _agreement_with_lines([_line_payload(_SOURCE_LINE_ID, _TARGET_SKU, 10)])

    result = find_agreement_line_by_sku(agreement, _TARGET_SKU, _SOURCE_LINE_ID)

    assert result is None


def test_find_agreement_line_by_sku_returns_none_when_absent():
    agreement = _agreement_with_lines([_line_payload(_SOURCE_LINE_ID, "65304479CA", 10)])

    result = find_agreement_line_by_sku(agreement, _TARGET_SKU, _SOURCE_LINE_ID)

    assert result is None


def test_build_change_order_lines_partial_upgrade_has_two_lines(source_line):
    result = build_change_order_lines(source_line, 6, None, _TARGET_ITEM_ID)

    assert result == [
        {"id": _SOURCE_LINE_ID, "quantity": 4},
        {"item": {"id": _TARGET_ITEM_ID}, "quantity": 6},
    ]


def test_build_change_order_lines_full_upgrade_has_target_line_only(source_line):
    result = build_change_order_lines(source_line, 10, None, _TARGET_ITEM_ID)

    assert result == [{"item": {"id": _TARGET_ITEM_ID}, "quantity": 10}]


def test_build_change_order_lines_tops_up_existing_target_line(mocker, source_line):
    target_line = mocker.Mock(id=_TARGET_LINE_ID, quantity=4)

    result = build_change_order_lines(source_line, 6, target_line, _TARGET_ITEM_ID)

    assert result == [
        {"id": _SOURCE_LINE_ID, "quantity": 4},
        {"id": _TARGET_LINE_ID, "quantity": 10},
    ]


@pytest.fixture
def switch_payload():
    request = UpgradeOrderRequest.model_validate({
        "targetOfferId": "65322651CA02A12",
        "quantity": 6,
    })
    return build_switch_payload(request, "adobe-sub-1", "USD")


@pytest.fixture
def orders_service(mocker):
    created = mocker.Mock()
    created.to_dict.return_value = {"id": "ORD-0001"}
    processed = mocker.Mock()
    processed.to_dict.return_value = {"id": "ORD-0001", "status": "Processing"}
    return mocker.Mock(
        create=mocker.AsyncMock(return_value=created),
        process=mocker.AsyncMock(return_value=processed),
    )


async def test_create_switch_change_order_creates_and_processes(
    mocker, orders_service, switch_payload
):
    client = mocker.Mock(commerce=mocker.Mock(orders=orders_service))
    lines = [{"id": _SOURCE_LINE_ID, "quantity": 4}]

    result = await create_switch_change_order(client, _AGREEMENT_ID, lines, switch_payload)

    assert result == {"id": "ORD-0001", "status": "Processing"}
    orders_service.create.assert_awaited_once_with({
        "type": "Change",
        "agreement": {"id": _AGREEMENT_ID},
        "lines": lines,
        "parameters": {
            "ordering": [{"externalId": "switchPayload", "value": switch_payload.to_dict()}],
        },
    })
    orders_service.process.assert_awaited_once_with("ORD-0001")
