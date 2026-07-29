import http
import json

import pytest
import responses

from adobe.errors import AdobeAPIError, AdobeHttpError


@responses.activate
def test_create_subscription_calls_correct_url_and_returns_data(
    adobe_client, subscriptions_url, create_subscription_args, scheduled_subscription_data
):
    responses.post(subscriptions_url, json=scheduled_subscription_data, status=http.HTTPStatus.OK)

    result = adobe_client.subscription.create_subscription(**create_subscription_args)

    request = responses.calls[0].request
    assert result == scheduled_subscription_data
    assert request.url == subscriptions_url


@responses.activate
def test_create_subscription_sends_minimal_body_with_auto_renewal_enabled(
    adobe_client, subscriptions_url, create_subscription_args, scheduled_subscription_data
):
    responses.post(subscriptions_url, json=scheduled_subscription_data, status=http.HTTPStatus.OK)

    adobe_client.subscription.create_subscription(**create_subscription_args)  # act

    body = json.loads(responses.calls[0].request.body)
    assert body == {
        "offerId": "OFFER-NEW",
        "autoRenewal": {"enabled": True, "renewalQuantity": 10},
    }


@responses.activate
def test_create_subscription_sends_optional_fields_when_provided(
    adobe_client,
    subscriptions_url,
    create_subscription_args,
    create_subscription_optional_args,
    scheduled_subscription_data,
):
    responses.post(subscriptions_url, json=scheduled_subscription_data, status=http.HTTPStatus.OK)

    adobe_client.subscription.create_subscription(  # act
        **create_subscription_args, **create_subscription_optional_args
    )

    body = json.loads(responses.calls[0].request.body)
    assert body == {
        "offerId": "OFFER-NEW",
        "autoRenewal": {
            "enabled": True,
            "renewalQuantity": 10,
            "renewalCode": "RENEWAL-CODE",
            "flexDiscountCodes": ["DISCOUNT-CODE"],
        },
        "currencyCode": "USD",
        "deploymentId": "DEPLOY-001",
    }


@responses.activate
def test_create_subscription_forwards_the_recommendation_tracker_header(
    adobe_client, subscriptions_url, create_subscription_args, scheduled_subscription_data
):
    responses.post(subscriptions_url, json=scheduled_subscription_data, status=http.HTTPStatus.OK)

    adobe_client.subscription.create_subscription(**create_subscription_args)  # act

    request = responses.calls[0].request
    assert request.headers["x-recommendation-tracker-id"] == "TRACKER-1"


@responses.activate
def test_create_subscription_omits_the_tracker_header_when_empty(
    adobe_client, subscriptions_url, create_subscription_args, scheduled_subscription_data
):
    responses.post(subscriptions_url, json=scheduled_subscription_data, status=http.HTTPStatus.OK)
    create_subscription_args["recommendation_tracker_id"] = ""

    adobe_client.subscription.create_subscription(**create_subscription_args)  # act

    assert "x-recommendation-tracker-id" not in responses.calls[0].request.headers


@responses.activate
def test_create_subscription_raises_adobe_api_error_on_http_error_with_json(
    adobe_client, subscriptions_url, create_subscription_args
):
    responses.post(
        subscriptions_url,
        json={"code": "1116", "message": "Subscription creation window is closed."},
        status=http.HTTPStatus.BAD_REQUEST,
    )

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.subscription.create_subscription(**create_subscription_args)

    assert exc_info.value.status_code == http.HTTPStatus.BAD_REQUEST


@responses.activate
def test_create_subscription_raises_adobe_http_error_when_response_has_no_json(
    adobe_client, subscriptions_url, create_subscription_args
):
    responses.post(
        subscriptions_url,
        body="Service Unavailable",
        status=http.HTTPStatus.SERVICE_UNAVAILABLE,
    )

    with pytest.raises(AdobeHttpError) as exc_info:
        adobe_client.subscription.create_subscription(**create_subscription_args)

    assert exc_info.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE
