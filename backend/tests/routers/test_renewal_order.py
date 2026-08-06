import http

import pytest
from freezegun import freeze_time
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
from mpt_adobe_vipm_ef.models.product import ProductSegment
from mpt_adobe_vipm_ef.models.renewal import (
    RenewalOrderRequest,
    RenewalPlanRequest,
    RenewalPreviewRequest,
)
from mpt_adobe_vipm_ef.routers.api.renewal import (
    check_renewal_order_three_yc,
    create_renewal_order,
    preview_renewal_plan,
)
from mpt_adobe_vipm_ef.services.sku_mapping import THREE_YC_TYPE_LICENSE
from tests.routers.conftest import FakeAdobeCall, FakeAdobeNamespace

_AGREEMENT_ID = "AGR-1234-5678"
_SUBSCRIPTION_ID = "SUB-1234-5678"
_LINE_ID = "ALI-0001"
_SKU = "65304470CA"
_OFFER_ID = "65304470CA01A12"
_NET_NEW_OFFER_ID = "65304481CA01A12"
_NET_NEW_SKU = "65304481CA"
_NET_NEW_ITEM_ID = "ITM-NET-NEW"
_ADOBE_SUBSCRIPTION_ID = "adobe-sub-1"
_CURRENT_QUANTITY = 10
_TODAY = "2026-08-04"
_COTERM_IN_WINDOW = "2026-08-20"
_COTERM_OUT_OF_WINDOW = "2026-12-01"
_COMMITMENT_END = "2029-08-20"
_ABOVE_FLOOR_QUANTITY = 12

_ADOBE_API_ERROR = AdobeAPIError(
    http.HTTPStatus.BAD_REQUEST,
    {"code": "3132", "message": "Ineligible product or orderType"},
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


def _agreement_payload(product_id="PRD-1111-1111", status="Active"):
    return {
        "id": _AGREEMENT_ID,
        "name": "Dummy Agreement",
        "status": status,
        "client": {"id": "ACC-0000-0001", "name": "Dummy Client"},
        "licensee": {"id": "LCE-0000-0001", "name": "Dummy Licensee", "status": "active"},
        "product": {"id": product_id, "name": "Dummy Product"},
        "authorization": {"id": "AUT-123", "name": "Dummy Authorization", "currency": "USD"},
        "parameters": {"fulfillment": [{"externalId": CUSTOMER_ID_PARAM, "value": "CUST-001"}]},
        "subscriptions": [{"id": _SUBSCRIPTION_ID, "name": "Renewing subscription"}],
        "lines": [_line_payload(_LINE_ID, _SKU, _CURRENT_QUANTITY)],
    }


def _subscription_payload(vendor=_ADOBE_SUBSCRIPTION_ID, lines=None):
    default_lines = [_line_payload(_LINE_ID, _SKU, _CURRENT_QUANTITY)]
    return {
        "id": _SUBSCRIPTION_ID,
        "name": "Renewing subscription",
        "externalIds": {"vendor": vendor},
        "lines": default_lines if lines is None else lines,
    }


def _body(  # noqa: WPS211
    *,
    renew=True,
    quantity=7,
    codes=None,
    net_new=None,
    subscriptions=None,
    tracker_id="TRACKER-1",
    notes="",
    client_external_id="",
):
    default_subscriptions = [
        {"id": _SUBSCRIPTION_ID, "offerId": _OFFER_ID, "renew": renew, "renewalQuantity": quantity},
    ]
    return RenewalOrderRequest.model_validate({
        "subscriptions": default_subscriptions if subscriptions is None else subscriptions,
        "netNewItems": net_new or [],
        "flexDiscountCodes": codes or [],
        "recommendationTrackerId": tracker_id,
        "notes": notes,
        "externalIds": {"client": client_external_id},
    })


def _plan_body(*, renew=True, quantity=7, net_new=None, subscriptions=None):
    default_subscriptions = [
        {"id": _SUBSCRIPTION_ID, "offerId": _OFFER_ID, "renew": renew, "renewalQuantity": quantity},
    ]
    return RenewalPlanRequest.model_validate({
        "subscriptions": default_subscriptions if subscriptions is None else subscriptions,
        "netNewItems": net_new or [],
    })


def _preview_body(*, renew=True, quantity=7, codes=None):
    return RenewalPreviewRequest.model_validate({
        "subscriptions": [
            {
                "id": _SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": renew,
                "renewalQuantity": quantity,
            },
        ],
        "flexDiscountCodes": codes or [],
    })


def _customer_payload(benefits=None, coterm=_COTERM_IN_WINDOW):
    return {"cotermDate": coterm, "benefits": benefits or []}


def _three_yc_benefit(  # noqa: WPS211
    *,
    status="COMMITTED",
    licenses=None,
    consumables=None,
    end_date=_COMMITMENT_END,
):
    minimums = []
    if licenses is not None:
        minimums.append({"offerType": "LICENSE", "quantity": licenses})
    if consumables is not None:
        minimums.append({"offerType": "CONSUMABLES", "quantity": consumables})
    return {
        "type": "THREE_YEAR_COMMIT",
        "commitment": {
            "status": status,
            "endDate": end_date,
            "minimumQuantities": minimums,
        },
    }


@pytest.fixture
def renewal_agreement(patch_agreement):
    return patch_agreement(Agreement.from_payload(_agreement_payload()))


@pytest.fixture
def renewing_subscription(fake_subscriptions):
    fake_subscriptions.subscription = Subscription.from_payload(_subscription_payload())
    return fake_subscriptions.subscription


@pytest.fixture
def resolve_net_new_item(mocker):
    return mocker.patch(
        "mpt_adobe_vipm_ef.services.renewal_plan.resolve_items_by_sku",
        return_value={
            _NET_NEW_SKU: {
                "id": _NET_NEW_ITEM_ID,
                "name": "Net-new Item",
                "externalId": _NET_NEW_SKU,
            },
        },
    )


@pytest.fixture
def caller_client(mocker):
    client = mocker.Mock()
    mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.renewal.build_caller_client",
        return_value=client,
    )
    return client


@pytest.fixture
def create_order_mock(mocker):
    return mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.renewal.create_renewal_change_order",
        mocker.AsyncMock(return_value={"id": "ORD-0001", "status": "Processing"}),
    )


@pytest.fixture
def adobe_customer(adobe_call):
    """Preset the Adobe customer load with a customer holding no 3YC benefit."""
    adobe_call.returns = _customer_payload()
    return adobe_call


@pytest.fixture
def three_yc_customer(adobe_call):
    """Preset the Adobe customer load with a committed 3YC floor of 10 licenses."""
    adobe_call.returns = _customer_payload(benefits=[_three_yc_benefit(licenses=10)])
    return adobe_call


@pytest.fixture
def sku_mapping_store(mocker, fake_ctx, allowed_product_id):
    """Stub the Airtable SKU mapping (everything a license) and the segment config."""
    fake_ctx.ext_settings.product_segments = (ProductSegment(id=allowed_product_id, segment="COM"),)
    store_cls = mocker.patch("mpt_adobe_vipm_ef.services.renewal_three_yc.SkuMappingStore")
    store = store_cls.from_settings.return_value
    store.list_three_yc_types.return_value = {
        _SKU: THREE_YC_TYPE_LICENSE,
        _NET_NEW_SKU: THREE_YC_TYPE_LICENSE,
    }
    return store


@pytest.fixture
def submit_deps(  # noqa: WPS211
    renewal_agreement,
    renewing_subscription,
    resolve_net_new_item,
    caller_client,
    create_order_mock,
    adobe_customer,
):
    """Bundle the happy-path collaborators for the submit endpoint."""


async def test_create_renewal_order_creates_the_order(fake_ctx, submit_deps, create_order_mock):
    result = await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())

    assert result.status_code == http.HTTPStatus.CREATED
    assert result.payload == {"id": "ORD-0001", "status": "Processing"}
    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [{"id": _LINE_ID, "quantity": 7}]


async def test_create_renewal_order_keeps_the_current_quantity_on_a_lapse(
    fake_ctx, submit_deps, create_order_mock, adobe_call
):
    await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body(renew=False, quantity=0))  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [{"id": _LINE_ID, "quantity": _CURRENT_QUANTITY}]
    # Only the Adobe customer load (for the 3YC pre-check) runs: nothing renews,
    # so there is no PREVIEW_RENEWAL quote.
    assert len(adobe_call.calls) == 1


async def test_create_renewal_order_previews_the_renewing_lines_with_codes(
    fake_ctx, submit_deps, adobe_call
):
    body = _body(codes=["ABCD-XV54-HG34-78YT"])

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    # calls[0] is the 3YC customer load, calls[1] resolves the full offer id
    # from Adobe's live subscriptions, calls[2] is the PREVIEW_RENEWAL quote.
    call_args, _ = adobe_call.calls[2]
    assert call_args == (
        "AUT-123",
        "CUST-001",
        "USD",
        [
            {
                "extLineItemNumber": 1,
                "offerId": _OFFER_ID,
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "quantity": 7,
                "flexDiscountCodes": ["ABCD-XV54-HG34-78YT"],
            },
        ],
    )


async def test_create_renewal_order_passes_the_renewal_payload(
    fake_ctx, submit_deps, create_order_mock
):
    await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body(codes=["CODE-1"]))  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[3].to_dict() == {
        "recommendationTrackerId": "TRACKER-1",
        "currencyCode": "USD",
        "subscriptions": [
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": True,
                "renewalQuantity": 7,
                "flexDiscountCodes": ["CODE-1"],
            },
        ],
        "netNewItems": [],
    }


@freeze_time(_TODAY)
async def test_create_renewal_order_snapshots_the_net_new_offers_in_the_payload(
    fake_ctx, submit_deps, create_order_mock, adobe_call
):
    adobe_call.returns = {"cotermDate": _COTERM_IN_WINDOW}
    body = _body(net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_order_mock.await_args
    payload = call_args[3].to_dict()
    assert payload["netNewItems"] == [{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}]


async def test_create_renewal_order_forwards_the_customer_details(
    fake_ctx, submit_deps, create_order_mock
):
    body = _body(notes="Renewal for the design team", client_external_id="234234234")

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[4] is body


@freeze_time(_TODAY)
async def test_create_renewal_order_adds_net_new_lines_within_the_window(
    fake_ctx, submit_deps, create_order_mock, adobe_call
):
    adobe_call.returns = {"cotermDate": _COTERM_IN_WINDOW}
    body = _body(net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [
        {"id": _LINE_ID, "quantity": 7},
        {"item": {"id": _NET_NEW_ITEM_ID}, "quantity": 5},
    ]


@freeze_time(_TODAY)
async def test_create_renewal_order_rejects_net_new_outside_the_window(
    fake_ctx, submit_deps, create_order_mock, adobe_call
):
    adobe_call.returns = {"cotermDate": _COTERM_OUT_OF_WINDOW}
    body = _body(net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    with pytest.raises(ValidationError, match="anniversary date"):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    create_order_mock.assert_not_awaited()


@freeze_time(_TODAY)
async def test_create_renewal_order_skips_the_preview_for_a_net_new_only_plan(
    fake_ctx, submit_deps, create_order_mock, adobe_call
):
    adobe_call.returns = {"cotermDate": _COTERM_IN_WINDOW}
    body = _body(
        subscriptions=[],
        net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}],
    )

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    assert len(adobe_call.calls) == 1
    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [{"item": {"id": _NET_NEW_ITEM_ID}, "quantity": 5}]


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
async def test_create_renewal_order_maps_customer_load_errors_on_net_new(
    fake_ctx, submit_deps, adobe_call, create_order_mock, scenario
):
    error, expected = scenario
    adobe_call.error = error
    body = _body(net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    with pytest.raises(expected):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    create_order_mock.assert_not_awaited()


async def test_create_renewal_order_rejects_an_unknown_net_new_offer(
    fake_ctx, submit_deps, resolve_net_new_item, create_order_mock
):
    resolve_net_new_item.return_value = {}
    body = _body(net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    with pytest.raises(ValidationError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    create_order_mock.assert_not_awaited()


async def test_create_renewal_order_rejects_an_empty_plan(fake_ctx, submit_deps):
    with pytest.raises(ValidationError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body(subscriptions=[]))


async def test_create_renewal_order_rejects_an_unknown_subscription(fake_ctx, submit_deps):
    body = _body(
        subscriptions=[
            {"id": "SUB-9999-9999", "offerId": _OFFER_ID, "renew": True, "renewalQuantity": 7},
        ],
    )

    with pytest.raises(NotFoundError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)


async def test_create_renewal_order_maps_subscription_not_found(
    fake_ctx, submit_deps, fake_subscriptions
):
    fake_subscriptions.error = MPTHttpError(http.HTTPStatus.NOT_FOUND, "Not Found", "")

    with pytest.raises(NotFoundError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())


async def test_create_renewal_order_maps_subscription_load_failure_to_upstream_error(
    fake_ctx, submit_deps, fake_subscriptions
):
    fake_subscriptions.error = MPTHttpError(
        http.HTTPStatus.INTERNAL_SERVER_ERROR, "Server Error", ""
    )

    with pytest.raises(UpstreamServiceError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())


async def test_create_renewal_order_requires_the_adobe_subscription_id(
    fake_ctx, submit_deps, fake_subscriptions
):
    fake_subscriptions.subscription = Subscription.from_payload(_subscription_payload(vendor=None))

    with pytest.raises(ValidationError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())


async def test_create_renewal_order_requires_subscription_lines(
    fake_ctx, submit_deps, fake_subscriptions
):
    fake_subscriptions.subscription = Subscription.from_payload(_subscription_payload(lines=[]))

    with pytest.raises(ValidationError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())


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
async def test_create_renewal_order_maps_preview_errors_and_skips_order(
    fake_ctx, submit_deps, create_order_mock, scenario
):
    error, expected = scenario
    order_call = FakeAdobeCall()
    order_call.error = error
    fake_ctx.adobe_client.order = FakeAdobeNamespace(order_call)

    with pytest.raises(expected):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())

    assert order_call.calls
    create_order_mock.assert_not_awaited()


@pytest.mark.parametrize("account_type", [AccountType.VENDOR, AccountType.OPERATIONS])
async def test_create_renewal_order_rejects_non_client_account(
    fake_ctx, submit_deps, auth_context_factory, account_type
):
    fake_ctx.auth = auth_context_factory(account_type)

    with pytest.raises(ForbiddenError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())


async def test_create_renewal_order_requires_caller_auth(fake_ctx, submit_deps, mocker):
    mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.renewal.build_caller_client",
        return_value=None,
    )

    with pytest.raises(ForbiddenError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())


async def test_create_renewal_order_maps_mpt_order_errors(fake_ctx, submit_deps, create_order_mock):
    create_order_mock.side_effect = MPTHttpError(http.HTTPStatus.BAD_REQUEST, "Bad Request", "")

    with pytest.raises(UpstreamServiceError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())


async def test_create_renewal_order_surfaces_the_platform_rejection_detail(
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
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())

    assert "agreement is in status Updating" in exc_info.value.detail


async def test_create_renewal_order_rejects_non_active_agreement(
    fake_ctx, patch_agreement, submit_deps, create_order_mock
):
    patch_agreement(Agreement.from_payload(_agreement_payload(status="Updating")))

    with pytest.raises(ValidationError) as exc_info:
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())

    assert "The agreement is currently Updating." in exc_info.value.detail
    create_order_mock.assert_not_awaited()


async def test_create_renewal_order_raises_forbidden_when_product_not_allowed(
    fake_ctx, patch_agreement, agreement_factory, disallowed_product_id
):
    patch_agreement(agreement_factory(product_id=disallowed_product_id))

    with pytest.raises(ForbiddenError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())


async def test_create_renewal_order_blocks_a_plan_below_the_three_yc_floor(  # noqa: WPS211
    fake_ctx, submit_deps, three_yc_customer, sku_mapping_store, create_order_mock, adobe_call
):
    with pytest.raises(ValidationError, match="three-year commitment"):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body(quantity=7))

    # Only the Adobe customer load ran: the floor breach blocks the plan
    # before the PREVIEW_RENEWAL quote and the order creation.
    assert len(adobe_call.calls) == 1
    create_order_mock.assert_not_awaited()


async def test_create_renewal_order_passes_the_three_yc_floor_check(
    fake_ctx, submit_deps, three_yc_customer, sku_mapping_store, create_order_mock
):
    await create_renewal_order(
        _AGREEMENT_ID, fake_ctx, _body(quantity=_ABOVE_FLOOR_QUANTITY)
    )  # act

    create_order_mock.assert_awaited()


# --- POST /agreements/{id}/renewal-order/3yc-check ---


async def test_check_renewal_order_three_yc_skips_customers_without_a_commitment(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_customer
):
    result = await check_renewal_order_three_yc(_AGREEMENT_ID, fake_ctx, _plan_body())

    assert result.status_code == http.HTTPStatus.OK
    assert result.payload == {"checked": False, "commitmentStatus": None}


async def test_check_renewal_order_three_yc_returns_the_check_summary(
    fake_ctx, renewal_agreement, renewing_subscription, three_yc_customer, sku_mapping_store
):
    result = await check_renewal_order_three_yc(
        _AGREEMENT_ID, fake_ctx, _plan_body(quantity=_ABOVE_FLOOR_QUANTITY)
    )

    assert result.payload == {
        "checked": True,
        "commitmentStatus": "COMMITTED",
        "licenses": {"selected": _ABOVE_FLOOR_QUANTITY, "minimum": 10},
        "consumables": {"selected": 0, "minimum": 0},
    }
    sku_mapping_store.list_three_yc_types.assert_called_once_with([_SKU], "COM")


async def test_check_renewal_order_three_yc_blocks_a_decrease_below_the_floor(
    fake_ctx, renewal_agreement, renewing_subscription, three_yc_customer, sku_mapping_store
):
    with pytest.raises(ValidationError, match="three-year commitment"):
        await check_renewal_order_three_yc(_AGREEMENT_ID, fake_ctx, _plan_body(quantity=7))


async def test_check_renewal_order_three_yc_blocks_a_disable_below_the_floor(
    fake_ctx, renewal_agreement, renewing_subscription, three_yc_customer, sku_mapping_store
):
    with pytest.raises(ValidationError, match="three-year commitment"):
        await check_renewal_order_three_yc(
            _AGREEMENT_ID, fake_ctx, _plan_body(renew=False, quantity=0)
        )


async def test_check_renewal_order_three_yc_counts_net_new_quantities_toward_the_floor(  # noqa: WPS211
    fake_ctx,
    renewal_agreement,
    renewing_subscription,
    resolve_net_new_item,
    three_yc_customer,
    sku_mapping_store,
):
    body = _plan_body(quantity=7, net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    result = await check_renewal_order_three_yc(_AGREEMENT_ID, fake_ctx, body)

    assert result.payload["licenses"] == {"selected": _ABOVE_FLOOR_QUANTITY, "minimum": 10}


async def test_check_renewal_order_three_yc_skips_a_commitment_ending_before_the_anniversary(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    benefit = _three_yc_benefit(licenses=10, end_date="2026-08-10")
    adobe_call.returns = _customer_payload(benefits=[benefit], coterm=_COTERM_IN_WINDOW)

    result = await check_renewal_order_three_yc(
        _AGREEMENT_ID, fake_ctx, _plan_body(renew=False, quantity=0)
    )

    assert result.payload == {"checked": False, "commitmentStatus": "COMMITTED"}


async def test_check_renewal_order_three_yc_rejects_an_empty_plan(fake_ctx, renewal_agreement):
    with pytest.raises(ValidationError):
        await check_renewal_order_three_yc(_AGREEMENT_ID, fake_ctx, _plan_body(subscriptions=[]))


@pytest.mark.parametrize("account_type", [AccountType.VENDOR, AccountType.OPERATIONS])
async def test_check_renewal_order_three_yc_rejects_non_client_account(
    fake_ctx, renewal_agreement, auth_context_factory, account_type
):
    fake_ctx.auth = auth_context_factory(account_type)

    with pytest.raises(ForbiddenError):
        await check_renewal_order_three_yc(_AGREEMENT_ID, fake_ctx, _plan_body())


# --- POST /agreements/{id}/renewal-order/preview ---


async def test_preview_renewal_plan_returns_the_adobe_quote(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    adobe_call.returns = {"lineItems": [{"extLineItemNumber": 1, "pricing": {}}]}

    result = await preview_renewal_plan(
        _AGREEMENT_ID, fake_ctx, _preview_body(codes=["ABCD-XV54-HG34-78YT"])
    )

    assert result.status_code == http.HTTPStatus.OK
    assert result.payload == {"lineItems": [{"extLineItemNumber": 1, "pricing": {}}]}
    # calls[0] resolves the full offer id from Adobe's live subscriptions;
    # calls[1] is the PREVIEW_RENEWAL quote itself.
    call_args, _ = adobe_call.calls[1]
    assert call_args == (
        "AUT-123",
        "CUST-001",
        "USD",
        [
            {
                "extLineItemNumber": 1,
                "offerId": _OFFER_ID,
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "quantity": 7,
                "flexDiscountCodes": ["ABCD-XV54-HG34-78YT"],
            },
        ],
    )


async def test_preview_renewal_plan_resolves_the_full_offer_id_from_adobe(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    """The wizard only ever holds the partial vendor SKU.

    Adobe's live subscription data carries the full offer id PREVIEW_RENEWAL needs.
    """
    adobe_call.returns = {
        "items": [{"subscriptionId": _ADOBE_SUBSCRIPTION_ID, "offerId": _OFFER_ID}],
    }
    body = RenewalPreviewRequest.model_validate({
        "subscriptions": [
            {"id": _SUBSCRIPTION_ID, "offerId": _SKU, "renew": True, "renewalQuantity": 7},
        ],
        "flexDiscountCodes": [],
    })

    await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = adobe_call.calls[1]
    assert call_args[3] == [
        {
            "extLineItemNumber": 1,
            "offerId": _OFFER_ID,
            "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
            "quantity": 7,
        },
    ]


async def test_preview_renewal_plan_falls_back_to_the_selected_offer_id(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    """Adobe holding no matching subscription (or none at all) is not fatal.

    The plan still previews with whatever offer id the wizard supplied.
    """
    adobe_call.returns = {"items": []}

    await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body())  # act

    call_args, _ = adobe_call.calls[1]
    assert call_args[3][0]["offerId"] == _OFFER_ID


async def test_preview_renewal_plan_requires_a_renewing_subscription(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    with pytest.raises(ValidationError, match="no renewing subscriptions"):
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(renew=False, quantity=0))

    assert not adobe_call.calls


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
async def test_preview_renewal_plan_maps_adobe_errors(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call, scenario
):
    error, expected = scenario
    adobe_call.error = error

    with pytest.raises(expected):
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body())


@pytest.mark.parametrize("account_type", [AccountType.VENDOR, AccountType.OPERATIONS])
async def test_preview_renewal_plan_rejects_non_client_account(
    fake_ctx, renewal_agreement, auth_context_factory, account_type
):
    fake_ctx.auth = auth_context_factory(account_type)

    with pytest.raises(ForbiddenError):
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body())
