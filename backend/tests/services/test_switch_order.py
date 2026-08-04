import http

import pytest
from mpt_api_client.exceptions import MPTAPIError, MPTHttpError

from mpt_adobe_vipm_ef.models.switch import UpgradeOrderRequest, build_switch_payload
from mpt_adobe_vipm_ef.services.switch_order import (
    ExistingTargetLine,
    build_change_order_lines,
    create_switch_change_order,
    mpt_order_error_detail,
)

_AGREEMENT_ID = "AGR-1234-5678"
_SOURCE_LINE_ID = "ALI-0001"
_TARGET_LINE_ID = "ALI-0002"
_TARGET_ITEM_ID = "ITM-TARGET"


@pytest.fixture
def source_line(mocker):
    return mocker.Mock(id=_SOURCE_LINE_ID, quantity=10)


def test_build_change_order_lines_partial_upgrade_has_two_lines(source_line):
    result = build_change_order_lines(source_line, 6, None, _TARGET_ITEM_ID)

    assert result == [
        {"id": _SOURCE_LINE_ID, "quantity": 4},
        {"item": {"id": _TARGET_ITEM_ID}, "quantity": 6},
    ]


def test_build_change_order_lines_full_upgrade_has_target_line_only(source_line):
    result = build_change_order_lines(source_line, 10, None, _TARGET_ITEM_ID)

    assert result == [{"item": {"id": _TARGET_ITEM_ID}, "quantity": 10}]


def test_build_change_order_lines_tops_up_existing_target_line(source_line):
    target_line = ExistingTargetLine(id=_TARGET_LINE_ID, quantity=4)

    result = build_change_order_lines(source_line, 6, target_line, _TARGET_ITEM_ID)

    assert result == [
        {"id": _SOURCE_LINE_ID, "quantity": 4},
        {"id": _TARGET_LINE_ID, "quantity": 10},
    ]


@pytest.fixture
def upgrade_request():
    return UpgradeOrderRequest.model_validate({
        "targetOfferId": "65322651CA02A12",
        "quantity": 6,
    })


@pytest.fixture
def switch_payload(upgrade_request):
    return build_switch_payload(upgrade_request, "adobe-sub-1", "USD")


@pytest.fixture
def orders_service(mocker):
    created = mocker.Mock()
    created.to_dict.return_value = {"id": "ORD-0001", "status": "Processing"}
    return mocker.Mock(
        create=mocker.AsyncMock(return_value=created),
        process=mocker.AsyncMock(),
    )


async def test_create_switch_change_order_creates_in_processing_status(
    mocker, orders_service, upgrade_request, switch_payload
):
    client = mocker.Mock(commerce=mocker.Mock(orders=orders_service))
    lines = [{"id": _SOURCE_LINE_ID, "quantity": 4}]

    result = await create_switch_change_order(
        client, _AGREEMENT_ID, lines, switch_payload, upgrade_request
    )

    assert result == {"id": "ORD-0001", "status": "Processing"}
    orders_service.create.assert_awaited_once_with({
        "status": "Processing",
        "type": "Change",
        "agreement": {"id": _AGREEMENT_ID},
        "lines": lines,
        "parameters": {
            "ordering": [{"externalId": "switchPayload", "value": switch_payload.to_dict()}],
        },
    })
    orders_service.process.assert_not_awaited()


async def test_create_switch_change_order_carries_the_customer_details(
    mocker, orders_service, switch_payload
):
    client = mocker.Mock(commerce=mocker.Mock(orders=orders_service))
    lines = [{"id": _SOURCE_LINE_ID, "quantity": 4}]
    request = UpgradeOrderRequest.model_validate({
        "targetOfferId": "65322651CA02A12",
        "quantity": 6,
        "notes": "Upgrade for the design team",
        "externalIds": {"client": "234234234"},
    })

    await create_switch_change_order(client, _AGREEMENT_ID, lines, switch_payload, request)

    call_args, _kwargs = orders_service.create.await_args
    assert call_args[0]["notes"] == "Upgrade for the design team"
    assert call_args[0]["externalIds"] == {"client": "234234234"}


def test_mpt_order_error_detail_returns_the_platform_detail():
    error = MPTAPIError(
        http.HTTPStatus.BAD_REQUEST,
        "Bad Request",
        {
            "title": "Bad Request",
            "detail": "Cannot create order because the associated agreement is in status Updating.",
            "traceId": "00-trace-01",
        },
    )

    result = mpt_order_error_detail(error)

    assert result == "Cannot create order because the associated agreement is in status Updating."


def test_mpt_order_error_detail_flattens_field_errors():
    error = MPTAPIError(
        http.HTTPStatus.BAD_REQUEST,
        "Bad Request",
        {
            "title": "One or more validation errors occurred.",
            "errors": {"status": ["Property must be provided"]},
        },
    )

    result = mpt_order_error_detail(error)

    assert result == "One or more validation errors occurred. status: Property must be provided"


def test_mpt_order_error_detail_keeps_server_errors_generic():
    error = MPTAPIError(
        http.HTTPStatus.INTERNAL_SERVER_ERROR,
        "Server Error",
        {"title": "Internal failure", "detail": "stack trace details"},
    )

    result = mpt_order_error_detail(error)

    assert result == "MPT service request failed"


def test_mpt_order_error_detail_falls_back_for_plain_http_errors():
    error = MPTHttpError(http.HTTPStatus.BAD_REQUEST, "Bad Request", "not json")

    result = mpt_order_error_detail(error)

    assert result == "MPT service request failed"
