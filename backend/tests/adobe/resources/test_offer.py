import http
from urllib.parse import parse_qs, urlparse

import pytest
import responses

from adobe.errors import AdobeAPIError, AdobeHttpError

_OFFER_SWITCH_PATHS_URL = "https://api.adobe.io/v3/offer-switch-paths"


@pytest.fixture
def switch_paths_data():
    return {
        "totalCount": 1,
        "productUpgrades": [
            {
                "sourceBaseOfferId": "OFFER-SOURCE",
                "targetList": [
                    {"targetBaseOfferId": "OFFER-TARGET", "sequence": 1},
                ],
            }
        ],
    }


@responses.activate
def test_get_offer_switch_paths_calls_correct_url_and_returns_data(adobe_client, switch_paths_data):
    responses.get(_OFFER_SWITCH_PATHS_URL, json=switch_paths_data, status=http.HTTPStatus.OK)

    result = adobe_client.offer.get_offer_switch_paths("AUT-1234-5678", "CUST-000", "SUB-000")

    request = responses.calls[0].request
    assert result == switch_paths_data
    assert request.url.startswith(_OFFER_SWITCH_PATHS_URL)


@responses.activate
def test_get_offer_switch_paths_passes_customer_and_subscription_params(
    adobe_client, switch_paths_data
):
    responses.get(_OFFER_SWITCH_PATHS_URL, json=switch_paths_data, status=http.HTTPStatus.OK)

    adobe_client.offer.get_offer_switch_paths("AUT-1234-5678", "CUST-000", "SUB-000")  # act

    request = responses.calls[0].request
    query = parse_qs(urlparse(request.url).query)
    assert query["customer-id"] == ["CUST-000"]
    assert query["subscription-id"] == ["SUB-000"]


@responses.activate
def test_get_offer_switch_paths_raises_adobe_api_error_on_http_error_with_json(adobe_client):
    responses.get(
        _OFFER_SWITCH_PATHS_URL,
        json={"code": "1000", "message": "Not found"},
        status=http.HTTPStatus.NOT_FOUND,
    )

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.offer.get_offer_switch_paths("AUT-1234-5678", "CUST-404", "SUB-000")

    assert exc_info.value.status_code == http.HTTPStatus.NOT_FOUND


@responses.activate
def test_get_offer_switch_paths_raises_adobe_http_error_when_response_has_no_json(adobe_client):
    responses.get(
        _OFFER_SWITCH_PATHS_URL,
        body="Service Unavailable",
        status=http.HTTPStatus.SERVICE_UNAVAILABLE,
    )

    with pytest.raises(AdobeHttpError) as exc_info:
        adobe_client.offer.get_offer_switch_paths("AUT-1234-5678", "CUST-000", "SUB-000")

    assert exc_info.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE
