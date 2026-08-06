import http

import pytest
import responses

from adobe.errors import AdobeAPIError, AdobeHttpError

_SUBSCRIPTIONS_URL = "https://api.adobe.io/v3/customers/CUST-000/subscriptions"


@pytest.fixture
def subscriptions_data():
    return {
        "items": [
            {"subscriptionId": "SUB-0001", "offerId": "65304470CA01A12", "status": "1000"},
        ],
    }


@responses.activate
def test_get_subscriptions_calls_correct_url_and_returns_data(adobe_client, subscriptions_data):
    responses.get(_SUBSCRIPTIONS_URL, json=subscriptions_data, status=http.HTTPStatus.OK)

    result = adobe_client.subscription.get_subscriptions("AUT-1234-5678", "CUST-000")

    request = responses.calls[0].request
    assert result == subscriptions_data
    assert request.url == _SUBSCRIPTIONS_URL


@responses.activate
def test_get_subscriptions_raises_adobe_api_error_on_http_error_with_json(adobe_client):
    responses.get(
        _SUBSCRIPTIONS_URL,
        json={"code": "1000", "message": "Not found"},
        status=http.HTTPStatus.NOT_FOUND,
    )

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.subscription.get_subscriptions("AUT-1234-5678", "CUST-000")

    assert exc_info.value.status_code == http.HTTPStatus.NOT_FOUND


@responses.activate
def test_get_subscriptions_raises_adobe_http_error_when_response_has_no_json(adobe_client):
    responses.get(
        _SUBSCRIPTIONS_URL,
        body="Service Unavailable",
        status=http.HTTPStatus.SERVICE_UNAVAILABLE,
    )

    with pytest.raises(AdobeHttpError) as exc_info:
        adobe_client.subscription.get_subscriptions("AUT-1234-5678", "CUST-000")

    assert exc_info.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE
