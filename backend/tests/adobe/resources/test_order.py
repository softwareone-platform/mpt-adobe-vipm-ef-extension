import http
import json

import pytest
import responses

from adobe.enums import AdobeOrderType
from adobe.errors import AdobeAPIError, AdobeHttpError

_ORDERS_URL = "https://api.adobe.io/v3/customers/CUST-000/orders"


@pytest.fixture
def line_items():
    return [{"extLineItemNumber": 1, "offerId": "65322651CA02A12", "quantity": 6}]


@pytest.fixture
def cancelling_items():
    return [
        {
            "extLineItemNumber": 1,
            "referenceLineItemNumber": 1,
            "subscriptionId": "adobe-sub-1",
            "quantity": 6,
        },
    ]


@pytest.fixture
def preview_switch_data(line_items, cancelling_items):
    return {
        "orderType": "PREVIEW_SWITCH",
        "currencyCode": "USD",
        "pricingSummary": [{"totalLineItemPrice": 810.5, "currencyCode": "USD"}],
        "lineItems": line_items,
        "cancellingItems": cancelling_items,
    }


@responses.activate
def test_preview_switch_order_calls_correct_url_and_returns_data(
    adobe_client, preview_switch_data, line_items, cancelling_items
):
    responses.post(_ORDERS_URL, json=preview_switch_data, status=http.HTTPStatus.OK)

    result = adobe_client.order.preview_switch_order(
        "AUT-1234-5678", "CUST-000", "USD", line_items, cancelling_items
    )

    request = responses.calls[0].request
    assert result == preview_switch_data
    assert request.url.startswith(_ORDERS_URL)


@responses.activate
def test_preview_switch_order_sends_preview_switch_body(
    adobe_client, preview_switch_data, line_items, cancelling_items
):
    responses.post(_ORDERS_URL, json=preview_switch_data, status=http.HTTPStatus.OK)

    adobe_client.order.preview_switch_order(  # act
        "AUT-1234-5678", "CUST-000", "USD", line_items, cancelling_items
    )

    body = json.loads(responses.calls[0].request.body)
    assert body == {
        "orderType": "PREVIEW_SWITCH",
        "currencyCode": "USD",
        "lineItems": line_items,
        "cancellingItems": cancelling_items,
    }


@responses.activate
def test_preview_switch_order_asks_for_pricing_when_requested(
    adobe_client, preview_switch_data, line_items, cancelling_items
):
    responses.post(_ORDERS_URL, json=preview_switch_data, status=http.HTTPStatus.OK)

    adobe_client.order.preview_switch_order(  # act
        "AUT-1234-5678", "CUST-000", "USD", line_items, cancelling_items, fetch_price=True
    )

    assert responses.calls[0].request.url == f"{_ORDERS_URL}?fetch-price=true"


@responses.activate
def test_preview_switch_order_does_not_ask_for_pricing_by_default(
    adobe_client, preview_switch_data, line_items, cancelling_items
):
    responses.post(_ORDERS_URL, json=preview_switch_data, status=http.HTTPStatus.OK)

    adobe_client.order.preview_switch_order(  # act
        "AUT-1234-5678", "CUST-000", "USD", line_items, cancelling_items
    )

    assert responses.calls[0].request.url == _ORDERS_URL


@responses.activate
def test_preview_switch_order_forwards_the_recommendation_tracker_header(
    adobe_client, preview_switch_data, line_items, cancelling_items
):
    responses.post(_ORDERS_URL, json=preview_switch_data, status=http.HTTPStatus.OK)

    adobe_client.order.preview_switch_order(  # act
        "AUT-1234-5678", "CUST-000", "USD", line_items, cancelling_items, "TRACKER-1"
    )

    request = responses.calls[0].request
    assert request.headers["x-recommendation-tracker-id"] == "TRACKER-1"


@responses.activate
def test_preview_switch_order_omits_the_tracker_header_when_empty(
    adobe_client, preview_switch_data, line_items, cancelling_items
):
    responses.post(_ORDERS_URL, json=preview_switch_data, status=http.HTTPStatus.OK)

    adobe_client.order.preview_switch_order(  # act
        "AUT-1234-5678", "CUST-000", "USD", line_items, cancelling_items
    )

    request = responses.calls[0].request
    assert "x-recommendation-tracker-id" not in request.headers


@responses.activate
def test_preview_switch_order_raises_adobe_api_error_on_http_error_with_json(
    adobe_client, line_items, cancelling_items
):
    responses.post(
        _ORDERS_URL,
        json={"code": "2150", "message": "Switch path validity check failed."},
        status=http.HTTPStatus.BAD_REQUEST,
    )

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.order.preview_switch_order(
            "AUT-1234-5678", "CUST-000", "USD", line_items, cancelling_items
        )

    assert exc_info.value.status_code == http.HTTPStatus.BAD_REQUEST


@responses.activate
def test_preview_switch_order_raises_adobe_http_error_when_response_has_no_json(
    adobe_client, line_items, cancelling_items
):
    responses.post(
        _ORDERS_URL,
        body="Service Unavailable",
        status=http.HTTPStatus.SERVICE_UNAVAILABLE,
    )

    with pytest.raises(AdobeHttpError) as exc_info:
        adobe_client.order.preview_switch_order(
            "AUT-1234-5678", "CUST-000", "USD", line_items, cancelling_items
        )

    assert exc_info.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE


@pytest.fixture
def renewal_line_items():
    return [
        {
            "extLineItemNumber": 1,
            "offerId": "65304470CA01A12",
            "subscriptionId": "adobe-sub-1",
            "quantity": 7,
            "flexDiscountCodes": ["ABCD-XV54-HG34-78YT"],
        },
    ]


@pytest.fixture
def preview_renewal_data(renewal_line_items):
    return {
        "orderType": "PREVIEW_RENEWAL",
        "currencyCode": "USD",
        "pricingSummary": [{"totalLineItemPrice": 350.5, "currencyCode": "USD"}],
        "lineItems": renewal_line_items,
    }


@responses.activate
def test_preview_renewal_order_calls_correct_url_and_returns_data(
    adobe_client, preview_renewal_data, renewal_line_items
):
    responses.post(_ORDERS_URL, json=preview_renewal_data, status=http.HTTPStatus.OK)

    result = adobe_client.order.preview_renewal_order(
        "AUT-1234-5678", "CUST-000", "USD", renewal_line_items
    )

    request = responses.calls[0].request
    assert result == preview_renewal_data
    assert request.url.startswith(_ORDERS_URL)


@responses.activate
def test_preview_renewal_order_asks_adobe_to_price_the_quote(
    adobe_client, preview_renewal_data, renewal_line_items
):
    """Adobe returns pricing only when the call asks for it."""
    responses.post(_ORDERS_URL, json=preview_renewal_data, status=http.HTTPStatus.OK)

    adobe_client.order.preview_renewal_order(  # act
        "AUT-1234-5678", "CUST-000", "USD", renewal_line_items
    )

    assert "fetch-price=true" in responses.calls[0].request.url


@responses.activate
def test_preview_renewal_order_sends_preview_renewal_body(
    adobe_client, preview_renewal_data, renewal_line_items
):
    responses.post(_ORDERS_URL, json=preview_renewal_data, status=http.HTTPStatus.OK)

    adobe_client.order.preview_renewal_order(  # act
        "AUT-1234-5678", "CUST-000", "USD", renewal_line_items
    )

    body = json.loads(responses.calls[0].request.body)
    assert body == {
        "orderType": "PREVIEW_RENEWAL",
        "currencyCode": "USD",
        "lineItems": renewal_line_items,
    }


@responses.activate
def test_preview_renewal_order_raises_adobe_api_error_on_http_error_with_json(
    adobe_client, renewal_line_items
):
    responses.post(
        _ORDERS_URL,
        json={"code": "3132", "message": "Ineligible product or orderType"},
        status=http.HTTPStatus.BAD_REQUEST,
    )

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.order.preview_renewal_order(
            "AUT-1234-5678", "CUST-000", "USD", renewal_line_items
        )

    assert exc_info.value.status_code == http.HTTPStatus.BAD_REQUEST


@responses.activate
def test_preview_renewal_order_raises_adobe_http_error_when_response_has_no_json(
    adobe_client, renewal_line_items
):
    responses.post(
        _ORDERS_URL,
        body="Service Unavailable",
        status=http.HTTPStatus.SERVICE_UNAVAILABLE,
    )

    with pytest.raises(AdobeHttpError) as exc_info:
        adobe_client.order.preview_renewal_order(
            "AUT-1234-5678", "CUST-000", "USD", renewal_line_items
        )

    assert exc_info.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE


@pytest.fixture
def automated_renewal_data(renewal_line_items):
    return {
        "orderType": "PREVIEW_RENEWAL",
        "currencyCode": "USD",
        "lineItems": renewal_line_items,
    }


@responses.activate
def test_preview_automated_renewal_order_asks_adobe_to_price_the_quote(
    adobe_client, automated_renewal_data
):
    responses.post(_ORDERS_URL, json=automated_renewal_data, status=http.HTTPStatus.OK)

    result = adobe_client.order.preview_automated_renewal_order("AUT-1234-5678", "CUST-000", "USD")

    assert result == automated_renewal_data
    assert "fetch-price=true" in responses.calls[0].request.url


@responses.activate
def test_preview_automated_renewal_order_sends_body_without_line_items(
    adobe_client, automated_renewal_data
):
    """The automated preview omits line items so Adobe uses standing auto-renewal preferences."""
    responses.post(_ORDERS_URL, json=automated_renewal_data, status=http.HTTPStatus.OK)

    adobe_client.order.preview_automated_renewal_order("AUT-1234-5678", "CUST-000", "USD")  # act

    body = json.loads(responses.calls[0].request.body)
    assert body == {"orderType": "PREVIEW_RENEWAL", "currencyCode": "USD"}
    assert "lineItems" not in body


@responses.activate
def test_preview_automated_renewal_order_raises_adobe_api_error_when_no_auto_renewal(
    adobe_client,
):
    """Adobe rejects the automated preview when no subscription has auto-renewal enabled."""
    responses.post(
        _ORDERS_URL,
        json={"code": "2131", "message": "No subscriptions with autoRenewal enabled"},
        status=http.HTTPStatus.BAD_REQUEST,
    )

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.order.preview_automated_renewal_order("AUT-1234-5678", "CUST-000", "USD")

    assert exc_info.value.status_code == http.HTTPStatus.BAD_REQUEST


@responses.activate
def test_list_orders_walks_every_page_of_one_order_type(adobe_client):
    responses.get(
        _ORDERS_URL,
        json={
            "items": [{"orderId": "P1"}],
            "links": {"next": {"uri": "/v3/customers/CUST-000/orders?limit=100&offset=100"}},
        },
        status=http.HTTPStatus.OK,
    )
    responses.get(
        _ORDERS_URL,
        json={"items": [{"orderId": "P2"}], "links": {}},
        status=http.HTTPStatus.OK,
    )

    result = adobe_client.order.list_orders("AUT-1234-5678", "CUST-000", AdobeOrderType.RENEWAL)

    assert result == [{"orderId": "P1"}, {"orderId": "P2"}]
    first, second = (call.request for call in responses.calls)
    assert "offset=0" in first.url
    assert "order-type=RENEWAL" in first.url
    assert "offset=100" in second.url


@responses.activate
def test_list_orders_raises_adobe_api_error_on_http_error_with_json(adobe_client):
    responses.get(
        _ORDERS_URL,
        json={"code": "1116", "message": "Invalid Customer"},
        status=http.HTTPStatus.NOT_FOUND,
    )

    with pytest.raises(AdobeAPIError):
        adobe_client.order.list_orders("AUT-1234-5678", "CUST-000", AdobeOrderType.RENEWAL)
