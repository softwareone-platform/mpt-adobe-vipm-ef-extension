import pytest
from pydantic import ValidationError

from mpt_adobe_vipm_ef.models.recommendation import (
    RecommendationRequest,
    RecommendationsResponse,
)


def test_recommendations_response_parses_nested_structure(recommendations_payload):
    result = RecommendationsResponse.from_payload(recommendations_payload)

    recommendations = result.product_recommendations
    assert recommendations.cross_sells[0].product.base_offer_id == "OFFER-CROSS"
    assert recommendations.add_ons[0].product.base_offer_id == "OFFER-ADDON"
    assert recommendations.upsells == []


def test_recommendations_response_defaults_tracker_id_to_empty_string(recommendations_payload):
    result = RecommendationsResponse.from_payload(recommendations_payload)

    assert not result.x_recommendation_tracker_id


def test_recommendations_response_serializes_tracker_id_with_alias(recommendations_payload):
    parsed = RecommendationsResponse.from_payload(recommendations_payload)

    result = parsed.model_copy(update={"x_recommendation_tracker_id": "TRACKER-1"}).to_dict()

    assert result["xRecommendationTrackerId"] == "TRACKER-1"


def test_recommendation_request_serializes_offers_with_aliases():
    request = RecommendationRequest.model_validate({
        "offers": [{"offerId": "OFFER-SOURCE", "quantity": 10}],
    })

    result = request.to_dict()

    assert result == {"offers": [{"offerId": "OFFER-SOURCE", "quantity": 10}]}


def test_recommendation_request_rejects_empty_offers():
    with pytest.raises(ValidationError):
        RecommendationRequest.model_validate({"offers": []})


def test_recommendation_request_rejects_offer_without_offer_id():
    with pytest.raises(ValidationError):
        RecommendationRequest.model_validate({"offers": [{"quantity": 10}]})
