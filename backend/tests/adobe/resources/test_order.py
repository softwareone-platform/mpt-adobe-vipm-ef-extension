import http
import json

import pytest
import responses

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
