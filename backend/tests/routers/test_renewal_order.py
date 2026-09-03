import http

import pytest
from freezegun import freeze_time
from mpt_api_client.exceptions import MPTAPIError, MPTHttpError
from mpt_extension_sdk.api import ErrorDetail
from mpt_extension_sdk.api.auth.context import AccountType
from mpt_extension_sdk.api.errors import (
    ForbiddenError,
    NotFoundError,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.models import Agreement, Subscription

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.constants import CUSTOMER_ID_PARAM, EARLY_RENEWAL_NO_CHANGE_ITEM
from mpt_adobe_vipm_ef.models.product import ProductSegment
from mpt_adobe_vipm_ef.models.renewal import (
    RenewalOrderRequest,
    RenewalPlanRequest,
    RenewalPreviewRequest,
    SkuAutoRenewSupportRequest,
)
from mpt_adobe_vipm_ef.routers.api.renewal import (
    check_renewal_order_three_yc,
    create_renewal_order,
    get_renewal_auto_renew_support,
    get_renewal_path_state,
    get_renewal_state,
    preview_renewal_plan,
)
from mpt_adobe_vipm_ef.services.sku_mapping import THREE_YC_TYPE_LICENSE
from tests.routers.conftest import FakeAdobeCall, FakeAdobeNamespace

_AGREEMENT_ID = "AGR-1234-5678"
_SUBSCRIPTION_ID = "SUB-1234-5678"
_SECOND_SUBSCRIPTION_ID = "SUB-8765-4321"
_LINE_ID = "ALI-0001"
_SKU = "65304470CA"
_OFFER_ID = "65304470CA01A12"
_NET_NEW_OFFER_ID = "65304481CA01A12"
_NET_NEW_SKU = "65304481CA"
_NET_NEW_ITEM_ID = "ITM-NET-NEW"
_NO_CHANGE_ITEM_ID = "ITM-NO-CHANGE"
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
        "subscriptions": [
            {"id": _SUBSCRIPTION_ID, "name": "Renewing subscription"},
            {"id": _SECOND_SUBSCRIPTION_ID, "name": "Second renewing subscription"},
        ],
        "lines": [_line_payload(_LINE_ID, _SKU, _CURRENT_QUANTITY)],
    }


def _subscription_payload(vendor=_ADOBE_SUBSCRIPTION_ID, lines=None, *, auto_renew=True):
    default_lines = [_line_payload(_LINE_ID, _SKU, _CURRENT_QUANTITY)]
    return {
        "id": _SUBSCRIPTION_ID,
        "name": "Renewing subscription",
        "externalIds": {"vendor": vendor},
        "lines": default_lines if lines is None else lines,
        "autoRenew": auto_renew,
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
    path="anniversary",
):
    default_subscriptions = [
        {
            "id": _SUBSCRIPTION_ID,
            "offerId": _OFFER_ID,
            "renew": renew,
            "renewalQuantity": quantity,
            "flexDiscountCodes": codes or [],
        },
    ]
    return RenewalOrderRequest.model_validate({
        "subscriptions": default_subscriptions if subscriptions is None else subscriptions,
        "netNewItems": net_new or [],
        "recommendationTrackerId": tracker_id,
        "notes": notes,
        "externalIds": {"client": client_external_id},
        "renewalPath": path,
    })


def _plan_body(*, renew=True, quantity=7, net_new=None, subscriptions=None, path="anniversary"):
    default_subscriptions = [
        {"id": _SUBSCRIPTION_ID, "offerId": _OFFER_ID, "renew": renew, "renewalQuantity": quantity},
    ]
    return RenewalPlanRequest.model_validate({
        "subscriptions": default_subscriptions if subscriptions is None else subscriptions,
        "netNewItems": net_new or [],
        "renewalPath": path,
    })


def _preview_body(*, renew=True, quantity=7, codes=None, net_new=None, path="anniversary"):
    return RenewalPreviewRequest.model_validate({
        "subscriptions": [
            {
                "id": _SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": renew,
                "renewalQuantity": quantity,
                "flexDiscountCodes": codes or [],
            },
        ],
        "netNewItems": net_new or [],
        "renewalPath": path,
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
def create_configuration_order_mock(mocker):
    return mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.renewal.create_renewal_configuration_order",
        mocker.AsyncMock(return_value={"id": "ORD-0002", "status": "Processing"}),
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


@pytest.fixture(autouse=True)
def auto_renew_support_store(mocker, fake_ctx, allowed_product_id):
    """Stub the per-SKU auto-renewal support gate every renewal endpoint runs.

    Autouse because the gate stands in front of the whole renewal flow: without
    it every endpoint call would reach the real Airtable store. Both SKUs
    support auto-renewal, so tests that do not care about routing are
    unaffected; a test that does re-points ``list_auto_renew_supported``.
    """
    fake_ctx.ext_settings.product_segments = (ProductSegment(id=allowed_product_id, segment="COM"),)
    store_cls = mocker.patch("mpt_adobe_vipm_ef.services.renewal_auto_renew.SkuMappingStore")
    store = store_cls.from_settings.return_value
    store.list_auto_renew_supported.return_value = {_SKU: True, _NET_NEW_SKU: True}
    return store


@pytest.fixture
def lifecycle_store(mocker, fake_ctx, allowed_product_id):
    """Stub the Airtable lifecycle lookup (the SKU neither end of sale nor end of life)."""
    fake_ctx.ext_settings.product_segments = (ProductSegment(id=allowed_product_id, segment="COM"),)
    store_cls = mocker.patch("mpt_adobe_vipm_ef.services.renewal_state.SkuMappingStore")
    store = store_cls.from_settings.return_value
    store.list_lifecycle.return_value = {_SKU: {"endOfSale": False, "endOfLife": False}}
    return store


@pytest.fixture
def net_new_sku_mapping(mocker, fake_ctx, allowed_product_id):
    """Stub the Airtable full-SKU lookup for net-new offers and the segment config."""
    fake_ctx.ext_settings.product_segments = (ProductSegment(id=allowed_product_id, segment="COM"),)
    store_cls = mocker.patch("mpt_adobe_vipm_ef.services.sku_mapping.SkuMappingStore")
    store = store_cls.from_settings.return_value
    store.list_full_skus.return_value = {_NET_NEW_SKU: _NET_NEW_OFFER_ID}
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


async def test_create_renewal_order_creates_a_configuration_order_for_an_autorenew_only_change(
    fake_ctx, submit_deps, create_order_mock, create_configuration_order_mock, adobe_call
):
    """Disabling AutoRenew with the quantity untouched carries no line-quantity delta.

    The platform rejects a Change order shaped like that, so the plan is
    submitted as a Configuration order instead, carrying only the
    AutoRenew-changed subscription's current snapshot.
    """
    body = _body(renew=False, quantity=0)  # renewing_subscription defaults autoRenew=True

    result = await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    assert result.payload == {"id": "ORD-0002", "status": "Processing"}
    call_args, _ = create_configuration_order_mock.await_args
    assert call_args[2] == [
        {
            "id": _SUBSCRIPTION_ID,
            "name": "Renewing subscription",
            "revision": None,
            "status": None,
            "commitmentDate": None,
            "AutoRenew": False,
            "lines": [_line_payload(_LINE_ID, _SKU, _CURRENT_QUANTITY)],
        },
    ]
    create_order_mock.assert_not_awaited()
    # Only the Adobe customer load (for the 3YC pre-check) and the path-lock
    # subscriptions load run: nothing renews, so there is no offer-id
    # resolution and no PREVIEW_RENEWAL quote.
    assert len(adobe_call.calls) == 2


async def test_create_renewal_order_snapshots_the_plan_on_an_early_renewal_configuration_order(
    fake_ctx, submit_deps, fake_subscriptions, create_configuration_order_mock
):
    """Renewing now with the quantities untouched still has to reach fulfilment.

    The order carries no line-quantity delta, so it is a Configuration order —
    but the early renewal is executed against Adobe as soon as it processes,
    so the plan snapshot rides on it too, unlike at the anniversary.
    """
    fake_subscriptions.subscription = Subscription.from_payload(
        _subscription_payload(auto_renew=False)
    )
    body = _body(renew=True, quantity=_CURRENT_QUANTITY, codes=["CODE-1"], path="now")

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_configuration_order_mock.await_args
    assert call_args[4].to_dict() == {
        "renewalPath": "now",
        "recommendationTrackerId": "TRACKER-1",
        "currencyCode": "USD",
        "subscriptions": [
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": True,
                "renewalQuantity": _CURRENT_QUANTITY,
                "renewedQuantity": 0,
                "flexDiscountCodes": ["CODE-1"],
            },
        ],
        "netNewItems": [],
    }


async def test_create_renewal_order_leaves_an_anniversary_configuration_order_without_a_payload(
    fake_ctx, submit_deps, create_configuration_order_mock
):
    """At the anniversary the AutoRenew decisions the order carries are the whole plan."""
    body = _body(renew=False, quantity=0)  # renewing_subscription defaults autoRenew=True

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_configuration_order_mock.await_args
    assert call_args[4] is None


async def test_create_renewal_order_rejects_a_plan_with_no_changes(
    fake_ctx, submit_deps, create_order_mock, create_configuration_order_mock, adobe_call
):
    """At the anniversary a plan that neither moves a quantity nor flips AutoRenew is a no-op."""
    body = _body(renew=True, quantity=_CURRENT_QUANTITY)  # matches autoRenew=True and current qty

    with pytest.raises(ValidationError, match="no changes to submit"):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    assert not adobe_call.calls
    create_order_mock.assert_not_awaited()
    create_configuration_order_mock.assert_not_awaited()


async def test_create_renewal_order_rejects_an_anniversary_plan_once_the_path_is_locked(
    fake_ctx, submit_deps, create_order_mock, adobe_call
):
    """An early renewal has rolled the anniversary, so it can no longer be renewed at."""
    adobe_call.returns = {
        "cotermDate": "2027-08-20",
        "items": [{"subscriptionId": _ADOBE_SUBSCRIPTION_ID, "renewalDate": _COTERM_IN_WINDOW}],
    }

    with pytest.raises(ValidationError, match="already moved the anniversary date forward"):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())

    create_order_mock.assert_not_awaited()


async def test_create_renewal_order_submits_an_unchanged_early_renewal_as_a_change_order(
    fake_ctx,
    submit_deps,
    resolve_net_new_item,
    create_order_mock,
    create_configuration_order_mock,
):
    """Renewing now with everything left as it stands is the wizard's normal case.

    Nothing moves a quantity and no AutoRenew decision changes, so neither
    order type stands on its own (the platform rejects a Change order without
    a quantity delta and a Configuration order without an AutoRenew flip). The
    plan is submitted as a Change order whose single line is the platform's
    ``adobe-early-renewal-no-change`` placeholder item, and fulfilment
    executes it from the ``renewalPayload`` snapshot.
    """
    resolve_net_new_item.return_value = {
        EARLY_RENEWAL_NO_CHANGE_ITEM: {
            "id": _NO_CHANGE_ITEM_ID,
            "name": "Early renewal (no changes)",
            "externalId": EARLY_RENEWAL_NO_CHANGE_ITEM,
        },
    }
    body = _body(renew=True, quantity=_CURRENT_QUANTITY, path="now")

    result = await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    assert result.payload == {"id": "ORD-0001", "status": "Processing"}
    create_configuration_order_mock.assert_not_awaited()
    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [{"item": {"id": _NO_CHANGE_ITEM_ID}, "quantity": 1}]
    assert call_args[3].to_dict()["renewalPath"] == "now"


async def test_create_renewal_order_fails_an_unchanged_early_renewal_without_the_item(
    fake_ctx, submit_deps, resolve_net_new_item, create_order_mock, create_configuration_order_mock
):
    """A catalog missing the placeholder item cannot submit the unchanged plan."""
    resolve_net_new_item.return_value = {}
    body = _body(renew=True, quantity=_CURRENT_QUANTITY, path="now")

    with pytest.raises(UpstreamServiceError, match="placeholder item"):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    create_order_mock.assert_not_awaited()
    create_configuration_order_mock.assert_not_awaited()


async def test_create_renewal_order_passes_the_renewal_payload(
    fake_ctx, submit_deps, create_order_mock
):
    await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body(codes=["CODE-1"]))  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[3].to_dict() == {
        "renewalPath": "anniversary",
        "recommendationTrackerId": "TRACKER-1",
        "currencyCode": "USD",
        "subscriptions": [
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": True,
                "renewalQuantity": 7,
                "renewedQuantity": 0,
                "flexDiscountCodes": ["CODE-1"],
            },
        ],
        "netNewItems": [],
    }


async def test_create_renewal_order_snapshots_the_early_renewal_path(
    fake_ctx, submit_deps, create_order_mock
):
    """Fulfilment reads the path back to pick which flow to execute."""
    await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body(path="now"))  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[3].to_dict()["renewalPath"] == "now"


def _renewed_subscriptions_payload(renewed_quantity, coterm=_COTERM_IN_WINDOW):
    """One payload for both Adobe calls: the coterm and a partially-renewed subscription."""
    return {
        "cotermDate": coterm,
        "items": [
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renewedQuantity": renewed_quantity,
            },
        ],
    }


async def test_create_renewal_order_snapshots_the_delta_on_a_repeat_early_renewal(
    fake_ctx, submit_deps, create_order_mock, adobe_call
):
    """The early path can be ordered more than once, and renewed seats never re-renew.

    The Marketplace line keeps the plain total (line quantities are absolute),
    while the ``renewalPayload`` snapshot carries only what this order still
    has to renew: the wizard's total minus Adobe's ``renewedQuantity``.
    """
    adobe_call.returns = _renewed_subscriptions_payload(4)
    body = _body(quantity=12, path="now")  # noqa: WPS432

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [{"id": _LINE_ID, "quantity": 12}]
    assert call_args[3].to_dict()["subscriptions"][0]["renewalQuantity"] == 8


async def test_create_renewal_order_keeps_an_already_covered_subscription_in_the_snapshot(
    fake_ctx, submit_deps, resolve_net_new_item, create_order_mock, adobe_call
):
    """A subscription a previous order fully renewed still rides the snapshot.

    It carries ``renew`` on with a zero delta, which tells fulfilment to keep
    it active without renewing it again; with nothing left to move, the order
    itself is the placeholder-item Change order.
    """
    resolve_net_new_item.return_value = {
        EARLY_RENEWAL_NO_CHANGE_ITEM: {
            "id": _NO_CHANGE_ITEM_ID,
            "name": "Early renewal (no changes)",
            "externalId": EARLY_RENEWAL_NO_CHANGE_ITEM,
        },
    }
    adobe_call.returns = _renewed_subscriptions_payload(_CURRENT_QUANTITY)
    body = _body(quantity=_CURRENT_QUANTITY, path="now")

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[2] == [{"item": {"id": _NO_CHANGE_ITEM_ID}, "quantity": 1}]
    subscription_snapshot = call_args[3].to_dict()["subscriptions"][0]
    assert subscription_snapshot["renew"] is True
    assert subscription_snapshot["renewalQuantity"] == 0


async def test_create_renewal_order_rejects_a_total_below_the_renewed_seats(
    fake_ctx, submit_deps, create_order_mock, adobe_call
):
    """A RENEWAL order cannot take renewed seats back: that would be a partial return."""
    adobe_call.returns = _renewed_subscriptions_payload(8)
    body = _body(quantity=7, path="now")

    with pytest.raises(ValidationError, match="cannot renew fewer seats"):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    create_order_mock.assert_not_awaited()


async def test_create_renewal_order_snapshots_the_removal_of_a_renewed_subscription(
    fake_ctx, submit_deps, create_order_mock, create_configuration_order_mock, adobe_call
):
    """Taking a renewed subscription off the renewal undoes a mistaken early renewal.

    No quantity moves on the Marketplace side, so the submission is the
    AutoRenew-flip Configuration order; the snapshot carries the removal —
    ``renew`` off with the renewed baseline — which fulfilment executes as a
    RETURN order of those seats.
    """
    adobe_call.returns = _renewed_subscriptions_payload(4)
    body = _body(renew=False, quantity=0, path="now")

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    create_order_mock.assert_not_awaited()
    call_args, _ = create_configuration_order_mock.await_args
    subscription_snapshot = call_args[4].to_dict()["subscriptions"][0]
    assert subscription_snapshot["renew"] is False
    assert subscription_snapshot["renewalQuantity"] == 0
    assert subscription_snapshot["renewedQuantity"] == 4


@freeze_time(_TODAY)
async def test_create_renewal_order_snapshots_the_net_new_offers_in_the_payload(
    fake_ctx, submit_deps, net_new_sku_mapping, create_order_mock, adobe_call
):
    """The wizard only ever holds the partial vendor SKU.

    The Airtable SKU mapping carries the full Adobe offer id the
    ``renewalPayload`` snapshot needs, since a net-new product has no Adobe
    subscription to read it from.
    """
    adobe_call.returns = {"cotermDate": _COTERM_IN_WINDOW}
    body = _body(
        net_new=[{"offerId": _NET_NEW_SKU, "quantity": 5, "flexDiscountCodes": ["CODE-NET-NEW"]}],
    )

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_order_mock.await_args
    payload = call_args[3].to_dict()
    assert payload["netNewItems"] == [
        {"offerId": _NET_NEW_OFFER_ID, "quantity": 5, "flexDiscountCodes": ["CODE-NET-NEW"]},
    ]
    net_new_sku_mapping.list_full_skus.assert_called_once_with([_NET_NEW_SKU], "COM")


async def test_create_renewal_order_forwards_the_customer_details(
    fake_ctx, submit_deps, create_order_mock
):
    body = _body(notes="Renewal for the design team", client_external_id="234234234")

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = create_order_mock.await_args
    assert call_args[4] is body


@freeze_time(_TODAY)
async def test_create_renewal_order_adds_net_new_lines_within_the_window(
    fake_ctx, submit_deps, net_new_sku_mapping, create_order_mock, adobe_call
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
async def test_create_renewal_order_creates_change_order_for_a_net_new_only_plan(
    fake_ctx, submit_deps, net_new_sku_mapping, create_order_mock, adobe_call
):
    adobe_call.returns = {"cotermDate": _COTERM_IN_WINDOW}
    body = _body(
        subscriptions=[],
        net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}],
    )

    await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)  # act

    # No renewing subscription: only the Adobe customer and the path-lock
    # subscriptions load, no offer-id resolution and no PREVIEW_RENEWAL quote.
    assert len(adobe_call.calls) == 2
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


@freeze_time(_TODAY)
async def test_create_renewal_order_rejects_a_net_new_offer_without_a_full_sku(
    fake_ctx, submit_deps, net_new_sku_mapping, create_order_mock, adobe_call
):
    net_new_sku_mapping.list_full_skus.return_value = {}
    adobe_call.returns = {"cotermDate": _COTERM_IN_WINDOW}
    body = _body(net_new=[{"offerId": _NET_NEW_SKU, "quantity": 5}])

    with pytest.raises(ValidationError, match="SKU mapping"):
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
async def test_create_renewal_order_maps_offer_id_resolution_errors(
    fake_ctx, submit_deps, create_order_mock, scenario
):
    error, expected = scenario
    subscription_call = FakeAdobeCall()
    subscription_call.error = error
    fake_ctx.adobe_client.subscription = FakeAdobeNamespace(subscription_call)

    with pytest.raises(expected):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())

    assert subscription_call.calls
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


async def test_create_renewal_order_requires_caller_auth_for_a_configuration_order(
    fake_ctx, submit_deps, mocker
):
    mocker.patch(
        "mpt_adobe_vipm_ef.routers.api.renewal.build_caller_client",
        return_value=None,
    )

    with pytest.raises(ForbiddenError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body(renew=False, quantity=0))


async def test_create_renewal_order_maps_configuration_order_mpt_errors(
    fake_ctx, submit_deps, create_configuration_order_mock
):
    create_configuration_order_mock.side_effect = MPTHttpError(
        http.HTTPStatus.BAD_REQUEST, "Bad Request", ""
    )

    with pytest.raises(UpstreamServiceError):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body(renew=False, quantity=0))


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


# --- GET /agreements/{id}/renewal-order/renewal-state ---


async def test_get_renewal_state_reports_each_subscription_renewal_state(
    fake_ctx, renewal_agreement, lifecycle_store, adobe_call
):
    adobe_call.returns = {
        "items": [
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "currentQuantity": _CURRENT_QUANTITY,
                "renewedQuantity": 4,
            },
        ],
    }

    result = await get_renewal_state(_AGREEMENT_ID, fake_ctx)

    assert result.status_code == http.HTTPStatus.OK
    assert result.payload == {
        "subscriptions": {
            _ADOBE_SUBSCRIPTION_ID: {
                "currentQuantity": _CURRENT_QUANTITY,
                "renewedQuantity": 4,
                "state": "partiallyRenewed",
                "remainingQuantity": 6,
                "earlyRenewable": True,
                "increaseAllowed": False,
            },
        },
    }
    lifecycle_store.list_lifecycle.assert_called_once_with([_SKU], "COM")


async def test_get_renewal_state_omits_an_end_of_sale_line(
    fake_ctx, renewal_agreement, lifecycle_store, adobe_call
):
    """An end-of-sale SKU cannot be early-renewed, so the wizard leaves it out."""
    lifecycle_store.list_lifecycle.return_value = {_SKU: {"endOfSale": True, "endOfLife": False}}
    adobe_call.returns = {
        "items": [{"subscriptionId": _ADOBE_SUBSCRIPTION_ID, "offerId": _OFFER_ID}],
    }

    result = await get_renewal_state(_AGREEMENT_ID, fake_ctx)

    states = result.payload["subscriptions"]
    assert states[_ADOBE_SUBSCRIPTION_ID]["earlyRenewable"] is False


async def test_get_renewal_state_maps_an_adobe_failure_to_a_bad_gateway(
    fake_ctx, renewal_agreement, adobe_call
):
    adobe_call.error = _ADOBE_API_ERROR

    with pytest.raises(UpstreamServiceError):
        await get_renewal_state(_AGREEMENT_ID, fake_ctx)


@pytest.mark.parametrize("account_type", [AccountType.VENDOR, AccountType.OPERATIONS])
async def test_get_renewal_state_rejects_non_client_account(
    fake_ctx, renewal_agreement, auth_context_factory, account_type
):
    fake_ctx.auth = auth_context_factory(account_type)

    with pytest.raises(ForbiddenError):
        await get_renewal_state(_AGREEMENT_ID, fake_ctx)


# --- GET /agreements/{id}/renewal-order/path-state ---


def _path_state_payload(coterm_date, renewal_date=_COTERM_IN_WINDOW, status="1000"):
    """One payload for both Adobe calls: the customer's coterm and its subscriptions."""
    return {
        "cotermDate": coterm_date,
        "items": [
            {
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "status": status,
                "renewalDate": renewal_date,
            },
        ],
    }


@freeze_time(_TODAY)
async def test_get_renewal_path_state_reports_an_open_window(
    fake_ctx, renewal_agreement, adobe_call
):
    adobe_call.returns = _path_state_payload(_COTERM_IN_WINDOW)

    result = await get_renewal_path_state(_AGREEMENT_ID, fake_ctx)

    assert result.status_code == http.HTTPStatus.OK
    assert result.payload == {
        "anniversaryDate": _COTERM_IN_WINDOW,
        "windowOpen": True,
        "windowOpensDays": 30,
        "windowClosesDays": 3,
        "hasActiveSubscriptions": True,
        "lockedPath": None,
    }


@freeze_time(_TODAY)
async def test_get_renewal_path_state_reports_a_closed_window(
    fake_ctx, renewal_agreement, adobe_call
):
    adobe_call.returns = _path_state_payload(_COTERM_OUT_OF_WINDOW)

    result = await get_renewal_path_state(_AGREEMENT_ID, fake_ctx)

    assert result.payload["windowOpen"] is False


@freeze_time(_TODAY)
async def test_get_renewal_path_state_reports_no_active_subscriptions(
    fake_ctx, renewal_agreement, adobe_call
):
    adobe_call.returns = _path_state_payload(_COTERM_IN_WINDOW, status="1009")

    result = await get_renewal_path_state(_AGREEMENT_ID, fake_ctx)

    assert result.payload["hasActiveSubscriptions"] is False


@freeze_time(_TODAY)
async def test_get_renewal_path_state_locks_the_early_path_once_rolled(
    fake_ctx, renewal_agreement, adobe_call
):
    """A coterm past the subscription's renewal date means an early renewal rolled it."""
    adobe_call.returns = _path_state_payload("2027-08-20")

    result = await get_renewal_path_state(_AGREEMENT_ID, fake_ctx)

    assert result.payload["lockedPath"] == "now"


async def test_get_renewal_path_state_rejects_a_non_active_agreement(
    fake_ctx, patch_agreement, adobe_call
):
    """The wizard must not open while an order is processing (agreement Updating).

    A plan assembled then would read Adobe's renewed quantities before the
    in-flight order lands on them and double-count what is left to renew.
    """
    patch_agreement(Agreement.from_payload(_agreement_payload(status="Updating")))

    with pytest.raises(ValidationError) as exc_info:
        await get_renewal_path_state(_AGREEMENT_ID, fake_ctx)

    assert "The agreement is currently Updating." in exc_info.value.detail
    assert not adobe_call.calls


async def test_get_renewal_path_state_maps_an_adobe_failure_to_a_bad_gateway(
    fake_ctx, renewal_agreement, adobe_call
):
    adobe_call.error = _ADOBE_API_ERROR

    with pytest.raises(UpstreamServiceError):
        await get_renewal_path_state(_AGREEMENT_ID, fake_ctx)


@pytest.mark.parametrize("account_type", [AccountType.VENDOR, AccountType.OPERATIONS])
async def test_get_renewal_path_state_rejects_non_client_account(
    fake_ctx, renewal_agreement, auth_context_factory, account_type
):
    fake_ctx.auth = auth_context_factory(account_type)

    with pytest.raises(ForbiddenError):
        await get_renewal_path_state(_AGREEMENT_ID, fake_ctx)


# --- POST /agreements/{id}/renewal-order/preview ---


async def test_preview_renewal_plan_returns_the_adobe_quote(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    adobe_call.returns = {"lineItems": [{"extLineItemNumber": 1, "pricing": {}}]}

    result = await preview_renewal_plan(
        _AGREEMENT_ID, fake_ctx, _preview_body(codes=["ABCD-XV54-HG34-78YT"])
    )

    assert result.status_code == http.HTTPStatus.OK
    assert result.payload == {
        "preview": {"lineItems": [{"extLineItemNumber": 1, "pricing": {}}]},
        "eligibility": {},
    }
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


async def test_preview_renewal_plan_carries_the_early_renewal_additions(  # noqa: WPS211
    fake_ctx,
    renewal_agreement,
    renewing_subscription,
    resolve_net_new_item,
    net_new_sku_mapping,
    adobe_call,
):
    """Early renewal rides its additions on the RENEWAL order itself.

    Only a preview that carries them lets Adobe reject the renew-and-add basket
    it forbids in a single order.
    """
    adobe_call.returns = {"items": []}
    body = _preview_body(net_new=[{"offerId": _NET_NEW_SKU, "quantity": 5}], path="now")

    await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = adobe_call.calls[1]
    assert call_args[3] == [
        {
            "extLineItemNumber": 1,
            "offerId": _OFFER_ID,
            "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
            "quantity": 7,
        },
        {"extLineItemNumber": 2, "offerId": _NET_NEW_OFFER_ID, "quantity": 5},
    ]
    net_new_sku_mapping.list_full_skus.assert_called_once_with([_NET_NEW_SKU], "COM")


async def test_preview_renewal_plan_quotes_only_the_remaining_delta(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    """A previous early renewal's seats are already priced and must not be quoted again."""
    adobe_call.returns = _renewed_subscriptions_payload(4)
    body = _preview_body(quantity=_CURRENT_QUANTITY, path="now")

    await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = adobe_call.calls[1]
    assert call_args[3] == [
        {
            "extLineItemNumber": 1,
            "offerId": _OFFER_ID,
            "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
            "quantity": 6,
        },
    ]


async def test_preview_renewal_plan_drops_an_already_covered_subscription(  # noqa: WPS211
    fake_ctx,
    renewal_agreement,
    renewing_subscription,
    resolve_net_new_item,
    net_new_sku_mapping,
    adobe_call,
):
    """A fully covered subscription has a zero delta and leaves the quote entirely.

    A follow-up basket that only adds products therefore quotes as the
    add-only order Adobe will actually take.
    """
    adobe_call.returns = _renewed_subscriptions_payload(_CURRENT_QUANTITY)
    body = _preview_body(
        quantity=_CURRENT_QUANTITY,
        net_new=[{"offerId": _NET_NEW_SKU, "quantity": 5}],
        path="now",
    )

    await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = adobe_call.calls[1]
    assert call_args[3] == [
        {"extLineItemNumber": 1, "offerId": _NET_NEW_OFFER_ID, "quantity": 5},
    ]


async def test_preview_renewal_plan_rejects_a_total_below_the_renewed_seats(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    """A renewing line cannot ask below the renewed seats: a partial return is unsupported."""
    adobe_call.returns = _renewed_subscriptions_payload(8)
    body = _preview_body(quantity=7, path="now")

    with pytest.raises(ValidationError, match="cannot renew fewer seats"):
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)

    # Only the subscriptions load ran: the plan never reached the quote.
    assert len(adobe_call.calls) == 1


async def test_preview_renewal_plan_allows_an_empty_quote_for_a_renewed_removal(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call
):
    """Removing a renewed subscription is a real action with nothing to quote.

    The customer is taking back an early renewal placed by mistake, which
    fulfilment executes as a RETURN — so the preview succeeds with an empty
    quote instead of blocking the wizard.
    """
    adobe_call.returns = _renewed_subscriptions_payload(4)
    body = _preview_body(renew=False, quantity=0, path="now")

    result = await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)

    assert result.payload == {"preview": None, "eligibility": {}}
    # Only the subscriptions load ran: there was nothing to quote.
    assert len(adobe_call.calls) == 1


async def test_preview_renewal_plan_leaves_the_anniversary_additions_out(
    fake_ctx, renewal_agreement, renewing_subscription, resolve_net_new_item, adobe_call
):
    """At the anniversary a net-new product has no Adobe subscription to price yet."""
    adobe_call.returns = {"items": []}
    body = _preview_body(net_new=[{"offerId": _NET_NEW_SKU, "quantity": 5}])

    await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)  # act

    call_args, _ = adobe_call.calls[1]
    assert [line["offerId"] for line in call_args[3]] == [_OFFER_ID]


async def test_preview_renewal_plan_previews_an_early_add_only_basket(  # noqa: WPS211
    fake_ctx,
    renewal_agreement,
    renewing_subscription,
    resolve_net_new_item,
    net_new_sku_mapping,
    adobe_call,
):
    adobe_call.returns = {"lineItems": []}
    body = _preview_body(
        renew=False,
        quantity=0,
        net_new=[{"offerId": _NET_NEW_SKU, "quantity": 5}],
        path="now",
    )

    await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)  # act

    # The now path always reads the live subscriptions (a switched-off row may
    # be the removal of a renewed one); the quote is the second call.
    call_args, _ = adobe_call.calls[1]
    assert call_args[3] == [
        {"extLineItemNumber": 1, "offerId": _NET_NEW_OFFER_ID, "quantity": 5},
    ]


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
async def test_preview_renewal_plan_maps_preview_call_errors(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_call, scenario
):
    """Isolates errors from the PREVIEW_RENEWAL call itself, past offer-id resolution."""
    adobe_call.returns = {"items": []}
    error, expected = scenario
    order_call = FakeAdobeCall()
    order_call.error = error
    fake_ctx.adobe_client.order = FakeAdobeNamespace(order_call)

    with pytest.raises(expected):
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body())

    assert order_call.calls


def _flex_error(code, reason=None, line=1, message=None):
    detail = f"Line Item: {line}" if reason is None else f"Line Item: {line}, Reason: {reason}"
    return AdobeAPIError(
        http.HTTPStatus.BAD_REQUEST,
        {
            "code": code,
            "message": message or "Customer is not qualified for the Flexible Discount",
            "additionalDetails": [detail],
        },
    )


@pytest.fixture
def preview_call(fake_ctx, adobe_call):
    """The PREVIEW_RENEWAL call on its own, past the offer-id resolution call."""
    adobe_call.returns = {"items": []}
    order_call = FakeAdobeCall()
    fake_ctx.adobe_client.order = FakeAdobeNamespace(order_call)
    return order_call


async def test_preview_renewal_plan_reports_a_rejected_code_against_its_line(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    preview_call.answers = [
        _flex_error("2141", reason="INELIGIBLE_COMMITMENT_STATUS"),
        {"lineItems": []},
    ]

    with pytest.raises(ValidationError) as rejection:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["COMMIT15"]))

    assert rejection.value.errors == [
        ErrorDetail(pointer=_ADOBE_SUBSCRIPTION_ID, detail="INELIGIBLE_COMMITMENT_STATUS"),
    ]


async def test_preview_renewal_plan_reads_the_reason_from_the_message(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    """Adobe is expected to name the criterion, but not reliably in the same place."""
    preview_call.answers = [
        _flex_error("2141", message="SEAT_UPGRADE_PERCENTAGE_NOT_MET"),
        {"lineItems": []},
    ]

    with pytest.raises(ValidationError) as rejection:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["SEATUPG25"]))

    assert rejection.value.errors[0].detail == "SEAT_UPGRADE_PERCENTAGE_NOT_MET"


async def test_preview_renewal_plan_falls_back_to_the_error_code(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    """A refusal Adobe reports without a reason still resolves to copy of ours."""
    preview_call.answers = [
        _flex_error("2147", message="Only one code per line item"),
        {"lineItems": []},
    ]

    with pytest.raises(ValidationError) as rejection:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["TWOCODES"]))

    assert rejection.value.errors[0].detail == "2147"


async def test_preview_renewal_plan_reports_a_code_refused_on_a_successful_quote(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    """Adobe marks the line rather than failing the call, and prices it undiscounted."""
    preview_call.answers = [
        {
            "lineItems": [
                {
                    "extLineItemNumber": 1,
                    "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                    "flexDiscounts": [{"code": "BADCODE", "result": "FAILURE"}],
                },
            ],
        },
        {"lineItems": []},
    ]

    with pytest.raises(ValidationError) as rejection:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["BADCODE"]))

    assert rejection.value.errors == [
        ErrorDetail(pointer=_ADOBE_SUBSCRIPTION_ID, detail="FAILURE"),
    ]


async def test_preview_renewal_plan_collects_every_rejected_code_in_one_request(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    """Adobe refuses one code at a time, so the codes are dropped and re-quoted.

    Without that the customer would have to fix one code per wizard round-trip.
    """
    preview_call.answers = [
        _flex_error("2141", reason="INELIGIBLE_COMMITMENT_STATUS", line=1),
        _flex_error("2146", reason="NOT_FOUND", line=2),
        {"lineItems": []},
    ]
    body = RenewalPreviewRequest.model_validate({
        "subscriptions": [
            {
                "id": _SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": True,
                "renewalQuantity": 7,
                "flexDiscountCodes": ["COMMIT15"],
            },
            {
                "id": _SECOND_SUBSCRIPTION_ID,
                "offerId": _OFFER_ID,
                "renew": True,
                "renewalQuantity": 7,
                "flexDiscountCodes": ["BADCODE"],
            },
        ],
        "netNewItems": [],
        "renewalPath": "anniversary",
    })

    with pytest.raises(ValidationError) as rejection:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)

    assert [detail.detail for detail in rejection.value.errors] == [
        "INELIGIBLE_COMMITMENT_STATUS",
        "NOT_FOUND",
    ]
    assert len(preview_call.calls) == 3


async def test_preview_renewal_plan_drops_the_refused_code_before_quoting_again(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    preview_call.answers = [
        _flex_error("2146", reason="NOT_FOUND"),
        {"lineItems": []},
    ]

    with pytest.raises(ValidationError):
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["BADCODE"]))

    retried_lines, _ = preview_call.calls[1]
    assert "flexDiscountCodes" not in retried_lines[3][0]


async def test_preview_renewal_plan_walks_every_code_on_one_line(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    """One line can carry several codes, and each still gets its own quote."""
    preview_call.answers = [
        _flex_error("2146", reason="NOT_FOUND"),
        _flex_error("2146", reason="NOT_FOUND"),
        _flex_error("2146", reason="NOT_FOUND"),
        {"lineItems": []},
    ]

    with pytest.raises(ValidationError) as rejection:
        await preview_renewal_plan(
            _AGREEMENT_ID, fake_ctx, _preview_body(codes=["ONE", "TWO", "THREE"])
        )

    assert len(preview_call.calls) == 4
    assert [detail.detail for detail in rejection.value.errors] == [
        "NOT_FOUND",
        "NOT_FOUND",
        "NOT_FOUND",
    ]


async def test_preview_renewal_plan_reports_a_repeated_refusal_once(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    """Adobe refusing a line whose code is already gone must not repeat the message."""
    preview_call.error = _flex_error("2146", reason="NOT_FOUND")

    with pytest.raises(ValidationError) as rejection:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["ONE"]))

    assert len(rejection.value.errors) == 1
    assert len(preview_call.calls) == 2


async def test_preview_renewal_plan_keeps_the_rows_found_before_an_unnamed_refusal(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    preview_call.answers = [
        _flex_error("2141", reason="INELIGIBLE_COMMITMENT_STATUS"),
        AdobeAPIError(
            http.HTTPStatus.BAD_REQUEST,
            {"code": "2147", "message": "Only one Flexible Discount Code is allowed per line item"},
        ),
    ]

    with pytest.raises(ValidationError) as rejection:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["ONE", "TWO"]))

    assert [detail.detail for detail in rejection.value.errors] == [
        "INELIGIBLE_COMMITMENT_STATUS",
    ]


async def test_preview_renewal_plan_accepts_a_quote_whose_codes_all_applied(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    preview_call.returns = {
        "lineItems": [
            {
                "extLineItemNumber": 1,
                "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
                "status": "1000",
                "flexDiscounts": [{"code": "GOODCODE", "result": "SUCCESS"}],
            },
        ],
    }

    result = await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["GOODCODE"]))

    assert result.payload["eligibility"] == {_ADOBE_SUBSCRIPTION_ID: True}


async def test_preview_renewal_plan_reports_a_refusal_that_names_no_line(
    fake_ctx, renewal_agreement, renewing_subscription, preview_call
):
    """A refusal with no row to sit against fails the plan with Adobe's message."""
    preview_call.error = AdobeAPIError(
        http.HTTPStatus.BAD_REQUEST,
        {
            "code": "2147",
            "message": "Only one Flexible Discount Code is allowed per line item",
            "additionalDetails": ["No line named here"],
        },
    )

    with pytest.raises(ValidationError, match="Only one Flexible Discount Code") as rejection:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body(codes=["TWOCODES"]))

    assert not rejection.value.errors


@pytest.mark.parametrize("account_type", [AccountType.VENDOR, AccountType.OPERATIONS])
async def test_preview_renewal_plan_rejects_non_client_account(
    fake_ctx, renewal_agreement, auth_context_factory, account_type
):
    fake_ctx.auth = auth_context_factory(account_type)

    with pytest.raises(ForbiddenError):
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body())


async def test_check_renewal_order_blocks_a_sku_without_auto_renewal_support(
    fake_ctx, renewal_agreement, renewing_subscription, auto_renew_support_store
):
    auto_renew_support_store.list_auto_renew_supported.return_value = {_SKU: False}

    with pytest.raises(ValidationError, match="cannot renew at the anniversary date"):
        await check_renewal_order_three_yc(_AGREEMENT_ID, fake_ctx, _plan_body())

    auto_renew_support_store.list_auto_renew_supported.assert_called_once_with([_SKU], "COM")


async def test_check_renewal_order_skips_the_gate_on_the_early_path(
    fake_ctx, renewal_agreement, renewing_subscription, adobe_customer, auto_renew_support_store
):
    """An early renewal orders explicitly, so auto-renewal support does not apply."""
    auto_renew_support_store.list_auto_renew_supported.return_value = {_SKU: False}

    await check_renewal_order_three_yc(_AGREEMENT_ID, fake_ctx, _plan_body(path="now"))  # act

    auto_renew_support_store.list_auto_renew_supported.assert_not_called()


async def test_preview_renewal_plan_blocks_a_sku_without_auto_renewal_support(
    fake_ctx, renewal_agreement, renewing_subscription, auto_renew_support_store
):
    auto_renew_support_store.list_auto_renew_supported.return_value = {_SKU: False}

    with pytest.raises(ValidationError, match="cannot renew at the anniversary date"):
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, _preview_body())


async def test_preview_renewal_plan_blocks_a_net_new_sku_without_auto_renewal_support(
    fake_ctx, renewal_agreement, renewing_subscription, auto_renew_support_store
):
    auto_renew_support_store.list_auto_renew_supported.return_value = {
        _SKU: True,
        _NET_NEW_SKU: False,
    }
    body = _preview_body(net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    with pytest.raises(ValidationError) as exc_info:
        await preview_renewal_plan(_AGREEMENT_ID, fake_ctx, body)

    assert exc_info.value.errors[0].pointer == "#/netNewItems"


async def test_create_renewal_order_blocks_a_sku_without_auto_renewal_support(
    fake_ctx, submit_deps, auto_renew_support_store, create_order_mock
):
    auto_renew_support_store.list_auto_renew_supported.return_value = {_SKU: False}

    with pytest.raises(ValidationError, match="cannot renew at the anniversary date"):
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, _body())

    create_order_mock.assert_not_awaited()


async def test_create_renewal_order_blocks_a_net_new_sku_without_auto_renewal_support(
    fake_ctx, submit_deps, resolve_net_new_item, auto_renew_support_store, create_order_mock
):
    auto_renew_support_store.list_auto_renew_supported.return_value = {
        _SKU: True,
        _NET_NEW_SKU: False,
    }
    body = _body(net_new=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])

    with pytest.raises(ValidationError) as exc_info:
        await create_renewal_order(_AGREEMENT_ID, fake_ctx, body)

    assert exc_info.value.errors[0].pointer == "#/netNewItems"
    create_order_mock.assert_not_awaited()


async def test_get_renewal_auto_renew_support_reports_each_sku(
    fake_ctx, renewal_agreement, auto_renew_support_store
):
    auto_renew_support_store.list_auto_renew_supported.return_value = {_SKU: True}
    body = SkuAutoRenewSupportRequest.model_validate({"skus": [_OFFER_ID, _NET_NEW_SKU]})

    result = await get_renewal_auto_renew_support(_AGREEMENT_ID, fake_ctx, body)

    assert result.status_code == http.HTTPStatus.OK
    assert result.payload == {"skus": {_SKU: True, _NET_NEW_SKU: False}}
    auto_renew_support_store.list_auto_renew_supported.assert_called_once_with(
        [_SKU, _NET_NEW_SKU], "COM"
    )


async def test_get_renewal_auto_renew_support_handles_an_empty_request(
    fake_ctx, renewal_agreement, auto_renew_support_store
):
    body = SkuAutoRenewSupportRequest.model_validate({"skus": []})

    result = await get_renewal_auto_renew_support(_AGREEMENT_ID, fake_ctx, body)

    assert result.payload == {"skus": {}}
    auto_renew_support_store.list_auto_renew_supported.assert_not_called()


@pytest.mark.parametrize("account_type", [AccountType.VENDOR, AccountType.OPERATIONS])
async def test_get_renewal_auto_renew_support_rejects_non_client_account(
    fake_ctx, renewal_agreement, auth_context_factory, account_type
):
    fake_ctx.auth = auth_context_factory(account_type)
    body = SkuAutoRenewSupportRequest.model_validate({"skus": [_OFFER_ID]})

    with pytest.raises(ForbiddenError):
        await get_renewal_auto_renew_support(_AGREEMENT_ID, fake_ctx, body)
