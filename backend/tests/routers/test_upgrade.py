import http

import pytest
from mpt_api_client.exceptions import MPTAPIError, MPTHttpError
from mpt_extension_sdk.api.auth.context import AccountType
from mpt_extension_sdk.api.errors import (
    ForbiddenError,
    NotFoundError,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.models import Agreement, Subscription

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.constants import CUSTOMER_ID_PARAM
from mpt_adobe_vipm_ef.models.switch import UpgradeOrderRequest
from mpt_adobe_vipm_ef.routers.api.upgrade import create_upgrade_order

_AGREEMENT_ID = "AGR-1234-5678"
_SUBSCRIPTION_ID = "SUB-1234-5678"
_SOURCE_LINE_ID = "ALI-0001"
_TARGET_LINE_ID = "ALI-0002"
_SOURCE_SKU = "65304479CA"
_TARGET_OFFER_ID = "65322651CA02A12"
_TARGET_SKU = "65322651CA"
_TARGET_ITEM_ID = "ITM-TARGET"
_ADOBE_SUBSCRIPTION_ID = "adobe-sub-1"
_QUANTITY_ABOVE_SOURCE = 11

_ADOBE_API_ERROR = AdobeAPIError(
    http.HTTPStatus.BAD_REQUEST,
    {"code": "2150", "message": "Switch path validity check failed."},
)


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


def _agreement_payload(product_id="PRD-1111-1111", lines=None, status="Active"):
    return {
        "id": _AGREEMENT_ID,
        "name": "Dummy Agreement",
        "status": status,
        "client": {"id": "ACC-0000-0001", "name": "Dummy Client"},
        "licensee": {"id": "LCE-0000-0001", "name": "Dummy Licensee", "status": "active"},
        "product": {"id": product_id, "name": "Dummy Product"},
        "authorization": {"id": "AUT-123", "name": "Dummy Authorization", "currency": "USD"},
        "parameters": {"fulfillment": [{"externalId": CUSTOMER_ID_PARAM, "value": "CUST-001"}]},
        "subscriptions": [{"id": _SUBSCRIPTION_ID, "name": "Source subscription"}],
        "lines": [_line_payload(_SOURCE_LINE_ID, _SOURCE_SKU, 10)] if lines is None else lines,
    }


def _subscription_payload(vendor=_ADOBE_SUBSCRIPTION_ID, lines=None):
    default_lines = [_line_payload(_SOURCE_LINE_ID, _SOURCE_SKU, 10)]
    return {
        "id": _SUBSCRIPTION_ID,
        "name": "Source subscription",
        "externalIds": {"vendor": vendor},
        "lines": default_lines if lines is None else lines,
    }


def _body(quantity=6, tracker_id="TRACKER-1"):
    return UpgradeOrderRequest.model_validate({
        "targetOfferId": _TARGET_OFFER_ID,
        "quantity": quantity,
        "recommendationTrackerId": tracker_id,
    })


@pytest.fixture
def upgrade_agreement(patch_agreement):
    return patch_agreement(Agreement.from_payload(_agreement_payload()))


@pytest.fixture
def source_subscription(fake_subscriptions):
    fake_subscriptions.subscription = Subscription.from_payload(_subscription_payload())
    return fake_subscriptions.subscription


@pytest.fixture
def resolve_target_item(mocker):
    return mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.upgrade.resolve_items_by_sku",
        return_value={
            _TARGET_SKU: {"id": _TARGET_ITEM_ID, "name": "Target Item", "externalId": _TARGET_SKU},
        },
    )


@pytest.fixture
def caller_client(mocker):
    client = mocker.Mock()
    mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.upgrade.build_caller_client",
        return_value=client,
    )
    return client


@pytest.fixture
def create_order_mock(mocker):
    return mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.upgrade.create_switch_change_order",
        mocker.AsyncMock(return_value={"id": "ORD-0001", "status": "Processing"}),
    )


@pytest.fixture
def submit_deps(
    upgrade_agreement, source_subscription, resolve_target_item, caller_client, create_order_mock
):
    """Bundle the happy-path collaborators for the submit endpoint."""


async def test_create_upgrade_order_partial_creates_two_line_order(
    fake_ctx, submit_deps, create_order_mock
):
    result = await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))

    assert result.status_code == http.HTTPStatus.CREATED
    assert result.payload == {"id": "ORD-0001", "status": "Processing"}
    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [
        {"id": _SOURCE_LINE_ID, "quantity": 4},
        {"item": {"id": _TARGET_ITEM_ID}, "quantity": 6},
    ]


async def test_create_upgrade_order_full_creates_single_line_order(
    fake_ctx, submit_deps, create_order_mock
):
    await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(10))  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [{"item": {"id": _TARGET_ITEM_ID}, "quantity": 10}]


async def test_create_upgrade_order_tops_up_existing_target_line(
    fake_ctx,
    patch_agreement,
    submit_deps,
    create_order_mock,
):
    patch_agreement(
        Agreement.from_payload(
            _agreement_payload(
                lines=[
                    _line_payload(_SOURCE_LINE_ID, _SOURCE_SKU, 10),
                    _line_payload(_TARGET_LINE_ID, _TARGET_SKU, 4),
                ],
            ),
        ),
    )

    await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [
        {"id": _SOURCE_LINE_ID, "quantity": 4},
        {"id": _TARGET_LINE_ID, "quantity": 10},
    ]


async def test_create_upgrade_order_previews_the_switch_snapshot(fake_ctx, submit_deps, adobe_call):
    await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))  # act

    call_args, _ = adobe_call.calls[0]
    assert call_args == (
        "AUT-123",
        "CUST-001",
        "USD",
        [{"extLineItemNumber": 1, "offerId": _TARGET_OFFER_ID, "quantity": 6}],
        [
            {
                "extLineItemNumber": 1,
                "referenceLineItemNumber": 1,
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "quantity": 6,
            },
        ],
        "TRACKER-1",
    )


async def test_create_upgrade_order_passes_switch_payload_with_tracker(
    fake_ctx, submit_deps, create_order_mock
):
    await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))  # act

    call_args, _ = create_order_mock.await_args
    payload = call_args[3].to_dict()
    assert payload["recommendationTrackerId"] == "TRACKER-1"
    assert payload["orderType"] == "SWITCH"
    assert payload["currencyCode"] == "USD"


async def test_create_upgrade_order_rejects_quantity_above_source(fake_ctx, submit_deps):
    body = _body(_QUANTITY_ABOVE_SOURCE)

    with pytest.raises(ValidationError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, body)


async def test_create_upgrade_order_rejects_unknown_subscription(fake_ctx, submit_deps):
    with pytest.raises(NotFoundError):
        await create_upgrade_order(_AGREEMENT_ID, "SUB-9999-9999", fake_ctx, _body(6))


async def test_create_upgrade_order_maps_subscription_not_found(
    fake_ctx, submit_deps, fake_subscriptions
):
    fake_subscriptions.error = MPTHttpError(http.HTTPStatus.NOT_FOUND, "Not Found", "")

    with pytest.raises(NotFoundError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))


async def test_create_upgrade_order_maps_subscription_load_failure_to_upstream_error(
    fake_ctx, submit_deps, fake_subscriptions
):
    fake_subscriptions.error = MPTHttpError(
        http.HTTPStatus.INTERNAL_SERVER_ERROR, "Server Error", ""
    )

    with pytest.raises(UpstreamServiceError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))


async def test_create_upgrade_order_requires_adobe_subscription_id(
    fake_ctx, submit_deps, fake_subscriptions
):
    fake_subscriptions.subscription = Subscription.from_payload(_subscription_payload(vendor=None))

    with pytest.raises(ValidationError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))


async def test_create_upgrade_order_requires_subscription_lines(
    fake_ctx, submit_deps, fake_subscriptions
):
    fake_subscriptions.subscription = Subscription.from_payload(_subscription_payload(lines=[]))

    with pytest.raises(ValidationError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))


async def test_create_upgrade_order_rejects_unknown_target_offer(
    fake_ctx, submit_deps, resolve_target_item
):
    resolve_target_item.return_value = {}

    with pytest.raises(ValidationError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))


@pytest.mark.parametrize(
    "scenario",
    [
        (_ADOBE_API_ERROR, UpstreamServiceError),
        (
            AdobeHttpError(http.HTTPStatus.SERVICE_UNAVAILABLE, "Service Unavailable"),
            UpstreamServiceError,
        ),
        (AdobeError("Config error"), ValidationError),
    ],
)
async def test_create_upgrade_order_maps_preview_errors_and_skips_order(
    fake_ctx, submit_deps, adobe_call, create_order_mock, scenario
):
    error, expected = scenario
    adobe_call.error = error

    with pytest.raises(expected):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))

    create_order_mock.assert_not_awaited()


@pytest.mark.parametrize("account_type", [AccountType.VENDOR, AccountType.OPERATIONS])
async def test_create_upgrade_order_rejects_non_client_account(
    fake_ctx, submit_deps, auth_context_factory, account_type
):
    fake_ctx.auth = auth_context_factory(account_type)

    with pytest.raises(ForbiddenError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))


async def test_create_upgrade_order_requires_caller_auth(fake_ctx, submit_deps, mocker):
    mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.upgrade.build_caller_client",
        return_value=None,
    )

    with pytest.raises(ForbiddenError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))


async def test_create_upgrade_order_maps_mpt_order_errors(fake_ctx, submit_deps, create_order_mock):
    create_order_mock.side_effect = MPTHttpError(http.HTTPStatus.BAD_REQUEST, "Bad Request", "")

    with pytest.raises(UpstreamServiceError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))


async def test_create_upgrade_order_surfaces_the_platform_rejection_detail(
    fake_ctx, submit_deps, create_order_mock
):
    create_order_mock.side_effect = MPTAPIError(
        http.HTTPStatus.BAD_REQUEST,
        "Bad Request",
        {
            "title": "Bad Request",
            "detail": (
                "Cannot create order because the associated agreement is in status "
                "Updating. Orders can only be created for Active agreements"
            ),
            "traceId": "00-6432cdd6f8c311b506817951a3ac5454-9bb3540d6e1ca195-01",
        },
    )

    with pytest.raises(UpstreamServiceError) as exc_info:
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))

    assert "agreement is in status Updating" in exc_info.value.detail


async def test_create_upgrade_order_rejects_non_active_agreement(
    fake_ctx, patch_agreement, submit_deps, create_order_mock
):
    patch_agreement(Agreement.from_payload(_agreement_payload(status="Updating")))

    with pytest.raises(ValidationError) as exc_info:
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))

    assert "The agreement is currently Updating." in exc_info.value.detail
    create_order_mock.assert_not_awaited()


async def test_create_upgrade_order_raises_forbidden_when_product_not_allowed(
    fake_ctx, patch_agreement, agreement_factory, disallowed_product_id
):
    patch_agreement(agreement_factory(product_id=disallowed_product_id))

    with pytest.raises(ForbiddenError):
        await create_upgrade_order(_AGREEMENT_ID, _SUBSCRIPTION_ID, fake_ctx, _body(6))
