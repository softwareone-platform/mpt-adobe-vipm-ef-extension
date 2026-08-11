import pytest
from mpt_extension_sdk.models import Subscription

from mpt_adobe_vipm_ef.models.renewal import RenewalOrderRequest
from mpt_adobe_vipm_ef.services.renewal_order import (
    build_configuration_order_subscriptions,
    build_renewal_order_lines,
    create_renewal_change_order,
    create_renewal_configuration_order,
)
from mpt_adobe_vipm_ef.services.renewal_plan import (
    NetNewLine,
    PlanSubscription,
    build_renewal_payload,
)

_AGREEMENT_ID = "AGR-1234-5678"
_SUBSCRIPTION_ID = "SUB-1234-5678"
_LINE_ID = "ALI-0001"
_OFFER_ID = "65304470CA01A12"
_NET_NEW_OFFER_ID = "65304481CA01A12"
_NET_NEW_ITEM_ID = "ITM-NET-NEW"
_ADOBE_SUBSCRIPTION_ID = "adobe-sub-1"
_CURRENT_QUANTITY = 10


def _request(subscriptions=None, net_new_items=None, **extra):
    return RenewalOrderRequest.model_validate({
        "subscriptions": [] if subscriptions is None else subscriptions,
        "netNewItems": [] if net_new_items is None else net_new_items,
        **extra,
    })


def _selection(*, renew=True, quantity=7, subscription_id=_SUBSCRIPTION_ID):
    return {
        "id": subscription_id,
        "offerId": _OFFER_ID,
        "renew": renew,
        "renewalQuantity": quantity,
    }


def _subscription(  # noqa: WPS211
    *,
    subscription_id=_SUBSCRIPTION_ID,
    auto_renew=True,
    quantity=_CURRENT_QUANTITY,
    status="Active",
    revision=0,
    commitment_date="2027-07-22T00:00:00.000Z",
):
    return Subscription.model_validate({
        "id": subscription_id,
        "name": f"Subscription for {subscription_id}",
        "revision": revision,
        "status": status,
        "commitmentDate": commitment_date,
        "autoRenew": auto_renew,
        "lines": [
            {
                "id": _LINE_ID,
                "quantity": quantity,
                "item": {
                    "id": "ITM-0001",
                    "name": "Item One",
                    "revision": 1,
                    "externalIds": {"vendor": "65304470CA"},
                },
            },
        ],
    })


def _plan(request, *, auto_renew=True, current_quantity=_CURRENT_QUANTITY):
    return [
        PlanSubscription(
            selection=selection,
            line_id=_LINE_ID,
            current_quantity=current_quantity,
            adobe_subscription_id=_ADOBE_SUBSCRIPTION_ID,
            offer_id=selection.offer_id,
            subscription=_subscription(
                subscription_id=selection.id,
                auto_renew=auto_renew,
                quantity=current_quantity,
            ),
        )
        for selection in request.subscriptions
    ]


def test_build_renewal_order_lines_carries_only_the_changed_quantities():
    request = _request(
        subscriptions=[
            _selection(quantity=37),  # noqa: WPS432
            _selection(quantity=_CURRENT_QUANTITY, subscription_id="SUB-9999-0001"),
            _selection(renew=False, quantity=0, subscription_id="SUB-9999-0002"),
        ],
    )
    net_new_request = _request(net_new_items=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])
    net_new_lines = [
        NetNewLine(
            selection=net_new_request.net_new_items[0],
            item_id=_NET_NEW_ITEM_ID,
            offer_id=_NET_NEW_OFFER_ID,
        ),
    ]

    result = build_renewal_order_lines(_plan(request), net_new_lines)

    assert result == [
        {"id": _LINE_ID, "quantity": 37},
        {"item": {"id": _NET_NEW_ITEM_ID}, "quantity": 5},
    ]


def test_build_renewal_order_lines_is_empty_for_an_autorenew_only_plan():
    request = _request(subscriptions=[_selection(quantity=_CURRENT_QUANTITY)])

    result = build_renewal_order_lines(_plan(request), [])

    assert result == []


def test_build_configuration_order_subscriptions_keeps_only_the_autorenew_changes():
    request = _request(
        subscriptions=[
            _selection(renew=False, quantity=_CURRENT_QUANTITY),
            _selection(renew=True, quantity=_CURRENT_QUANTITY, subscription_id="SUB-9999-0001"),
        ],
    )
    plan = _plan(request, auto_renew=True, current_quantity=_CURRENT_QUANTITY)

    result = build_configuration_order_subscriptions(plan)

    assert result == [
        {
            "id": _SUBSCRIPTION_ID,
            "name": f"Subscription for {_SUBSCRIPTION_ID}",
            "revision": 0,
            "status": "Active",
            "commitmentDate": "2027-07-22T00:00:00+00:00",
            "AutoRenew": False,
            "lines": [
                {
                    "id": _LINE_ID,
                    "quantity": _CURRENT_QUANTITY,
                    "item": {
                        "id": "ITM-0001",
                        "name": "Item One",
                        "revision": 1,
                        "externalIds": {"vendor": "65304470CA"},
                    },
                },
            ],
        },
    ]


def test_build_configuration_order_subscriptions_is_empty_without_an_autorenew_change():
    request = _request(subscriptions=[_selection(renew=True, quantity=_CURRENT_QUANTITY)])
    plan = _plan(request, auto_renew=True, current_quantity=_CURRENT_QUANTITY)

    result = build_configuration_order_subscriptions(plan)

    assert result == []


@pytest.fixture
def orders_service(mocker):
    created = mocker.Mock()
    created.to_dict.return_value = {"id": "ORD-0001", "status": "Processing"}
    return mocker.Mock(
        create=mocker.AsyncMock(return_value=created),
        process=mocker.AsyncMock(),
    )


async def test_create_renewal_change_order_creates_in_processing_status(mocker, orders_service):
    client = mocker.Mock(commerce=mocker.Mock(orders=orders_service))
    request = _request(
        subscriptions=[_selection()],
        flexDiscountCodes=["BLACK_FRIDAY"],
        recommendationTrackerId="TRACKER-1",
    )
    renewal_payload = build_renewal_payload(_plan(request), [], request, "USD")
    lines = [{"id": _LINE_ID, "quantity": 7}]

    result = await create_renewal_change_order(
        client, _AGREEMENT_ID, lines, renewal_payload, request
    )

    assert result == {"id": "ORD-0001", "status": "Processing"}
    orders_service.create.assert_awaited_once_with({
        "status": "Processing",
        "type": "Change",
        "agreement": {"id": _AGREEMENT_ID},
        "lines": lines,
        "parameters": {
            "ordering": [{"externalId": "renewalPayload", "value": renewal_payload.to_dict()}],
        },
    })
    orders_service.process.assert_not_awaited()


async def test_create_renewal_change_order_carries_the_customer_details(mocker, orders_service):
    client = mocker.Mock(commerce=mocker.Mock(orders=orders_service))
    request = _request(
        subscriptions=[_selection()],
        notes="Renewal for the design team",
        externalIds={"client": "234234234"},
    )
    renewal_payload = build_renewal_payload(_plan(request), [], request, "USD")

    await create_renewal_change_order(client, _AGREEMENT_ID, [], renewal_payload, request)  # act

    call_args, _kwargs = orders_service.create.await_args
    assert call_args[0]["notes"] == "Renewal for the design team"
    assert call_args[0]["externalIds"] == {"client": "234234234"}


async def test_create_renewal_configuration_order_creates_in_processing_status(
    mocker, orders_service
):
    client = mocker.Mock(commerce=mocker.Mock(orders=orders_service))
    request = _request(subscriptions=[_selection(renew=False)])
    subscriptions = [{"id": _SUBSCRIPTION_ID, "AutoRenew": False, "lines": []}]

    result = await create_renewal_configuration_order(client, _AGREEMENT_ID, subscriptions, request)

    assert result == {"id": "ORD-0001", "status": "Processing"}
    orders_service.create.assert_awaited_once_with({
        "status": "Processing",
        "type": "Configuration",
        "agreement": {"id": _AGREEMENT_ID},
        "subscriptions": subscriptions,
    })
    orders_service.process.assert_not_awaited()


async def test_create_renewal_configuration_order_carries_the_customer_details(
    mocker, orders_service
):
    client = mocker.Mock(commerce=mocker.Mock(orders=orders_service))
    request = _request(
        subscriptions=[_selection(renew=False)],
        notes="AutoRenew opt-out",
        externalIds={"client": "234234234"},
    )

    await create_renewal_configuration_order(client, _AGREEMENT_ID, [], request)  # act

    call_args, _kwargs = orders_service.create.await_args
    assert call_args[0]["notes"] == "AutoRenew opt-out"
    assert call_args[0]["externalIds"] == {"client": "234234234"}
    assert "parameters" not in call_args[0]
