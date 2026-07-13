import http
import json

import pytest
import responses

from adobe.errors import AdobeAPIError, AdobeHttpError


@responses.activate
def test_get_recommendations_returns_body_and_headers(
    adobe_client, recommendations_url, recommendation_args, recommendations_data
):
    responses.post(
        recommendations_url,
        json=recommendations_data,
        status=http.HTTPStatus.OK,
        headers={"x-recommendation-tracker-id": "TRACKER-1"},
    )

    result, headers = adobe_client.recommendation.get_recommendations(  # act
        **recommendation_args
    )

    assert result == recommendations_data
    assert headers.get("x-recommendation-tracker-id") == "TRACKER-1"


@responses.activate
def test_get_recommendations_posts_customer_and_offers(
    adobe_client, recommendations_url, recommendation_args, recommendations_data
):
    responses.post(recommendations_url, json=recommendations_data, status=http.HTTPStatus.OK)
    adobe_client.recommendation.get_recommendations(**recommendation_args)

    result = json.loads(responses.calls[0].request.body)

    assert result == {
        "customerId": recommendation_args["customer_id"],
        "offers": recommendation_args["offers"],
    }


@responses.activate
def test_get_recommendations_omits_tracker_header_when_absent(
    adobe_client, recommendations_url, recommendation_args, recommendations_data
):
    responses.post(recommendations_url, json=recommendations_data, status=http.HTTPStatus.OK)

    _, headers = adobe_client.recommendation.get_recommendations(**recommendation_args)  # act

    assert headers.get("x-recommendation-tracker-id") is None


@responses.activate
def test_get_recommendations_raises_adobe_api_error_on_http_error_with_json(
    adobe_client, recommendations_url, recommendation_args
):
    responses.post(
        recommendations_url,
        json={"code": "4000", "message": "Bad"},
        status=http.HTTPStatus.BAD_REQUEST,
    )

    with pytest.raises(AdobeAPIError) as result:
        adobe_client.recommendation.get_recommendations(**recommendation_args)

    assert result.value.status_code == http.HTTPStatus.BAD_REQUEST


@responses.activate
def test_get_recommendations_raises_adobe_http_error_when_response_has_no_json(
    adobe_client, recommendations_url, recommendation_args
):
    responses.post(
        recommendations_url,
        body="Service Unavailable",
        status=http.HTTPStatus.SERVICE_UNAVAILABLE,
    )

    with pytest.raises(AdobeHttpError) as result:
        adobe_client.recommendation.get_recommendations(**recommendation_args)

    assert result.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE
