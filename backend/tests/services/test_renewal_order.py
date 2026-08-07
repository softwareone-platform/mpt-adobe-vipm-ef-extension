import pytest

from mpt_adobe_vipm_ef.models.renewal import RenewalOrderRequest
from mpt_adobe_vipm_ef.services.renewal_order import (
    build_renewal_order_lines,
    create_renewal_change_order,
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


def _plan(request):
    return [
        PlanSubscription(
            selection=selection,
            line_id=_LINE_ID,
            current_quantity=_CURRENT_QUANTITY,
            adobe_subscription_id=_ADOBE_SUBSCRIPTION_ID,
            offer_id=selection.offer_id,
        )
        for selection in request.subscriptions
    ]


def test_build_renewal_order_lines_carries_renewal_and_current_quantities():
    request = _request(
        subscriptions=[
            _selection(),
            _selection(renew=False, quantity=0, subscription_id="SUB-9999-0001"),
        ],
    )
    net_new_request = _request(net_new_items=[{"offerId": _NET_NEW_OFFER_ID, "quantity": 5}])
    net_new_lines = [
        NetNewLine(selection=net_new_request.net_new_items[0], item_id=_NET_NEW_ITEM_ID),
    ]

    result = build_renewal_order_lines(_plan(request), net_new_lines)

    assert result == [
        {"id": _LINE_ID, "quantity": 7},
        {"id": _LINE_ID, "quantity": _CURRENT_QUANTITY},
        {"item": {"id": _NET_NEW_ITEM_ID}, "quantity": 5},
    ]


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
