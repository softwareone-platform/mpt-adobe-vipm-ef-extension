import http

import pytest
from mpt_extension_sdk.api.errors import (
    ForbiddenError,
    UpstreamServiceError,
    ValidationError,
)

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.routers.api.recommendations import get_recommendations

_AGREEMENT_ID = "AGR-1234-5678"

_ADOBE_API_ERROR = AdobeAPIError(http.HTTPStatus.BAD_REQUEST, {"code": "4000", "message": "Bad"})
_ADOBE_CONFIG_ERROR = AdobeError("Config error")


async def test_get_recommendations_returns_payload_with_tracker_id(
    fake_ctx, resolve_ids, adobe_call, recommendation_body, adobe_recommendation_return
):
    adobe_call.returns = adobe_recommendation_return

    result = await get_recommendations(_AGREEMENT_ID, fake_ctx, recommendation_body)  # act

    cross_sells = result.payload["productRecommendations"]["crossSells"]
    assert cross_sells[0]["product"]["baseOfferId"] == "OFFER-CROSS"
    assert result.payload["xRecommendationTrackerId"] == "TRACKER-1"


async def test_get_recommendations_omits_tracker_id_when_header_absent(
    fake_ctx, resolve_ids, adobe_call, recommendation_body, recommendations_data
):
    adobe_call.returns = (recommendations_data, {})

    result = await get_recommendations(_AGREEMENT_ID, fake_ctx, recommendation_body)  # act

    assert not result.payload["xRecommendationTrackerId"]


async def test_get_recommendations_passes_authorization_and_body_to_adobe(
    fake_ctx, resolve_ids, adobe_call, recommendation_body, adobe_recommendation_return
):
    adobe_call.returns = adobe_recommendation_return

    await get_recommendations(_AGREEMENT_ID, fake_ctx, recommendation_body)  # act

    call_args, _ = adobe_call.calls[0]
    assert call_args == ("AUT-123", "CUST-001", [{"offerId": "OFFER-SOURCE", "quantity": 10}])


async def test_get_recommendations_maps_malformed_payload_to_upstream_error(
    fake_ctx, resolve_ids, adobe_call, recommendation_body, tracker_headers
):
    adobe_call.returns = ({"productRecommendations": "not-an-object"}, tracker_headers)

    with pytest.raises(UpstreamServiceError):
        await get_recommendations(_AGREEMENT_ID, fake_ctx, recommendation_body)


@pytest.mark.parametrize(
    "scenario",
    [
        (_ADOBE_API_ERROR, UpstreamServiceError),
        (
            AdobeHttpError(http.HTTPStatus.SERVICE_UNAVAILABLE, "Service Unavailable"),
            UpstreamServiceError,
        ),
        (_ADOBE_CONFIG_ERROR, ValidationError),
    ],
)
async def test_get_recommendations_maps_adobe_errors_to_api_errors(
    fake_ctx, resolve_ids, adobe_call, recommendation_body, scenario
):
    error, expected = scenario
    adobe_call.error = error

    with pytest.raises(expected):
        await get_recommendations(_AGREEMENT_ID, fake_ctx, recommendation_body)


async def test_get_recommendations_raises_forbidden_when_product_not_allowed(
    fake_ctx, patch_agreement, agreement_factory, disallowed_product_id, recommendation_body
):
    patch_agreement(agreement_factory(product_id=disallowed_product_id))

    with pytest.raises(ForbiddenError):
        await get_recommendations(_AGREEMENT_ID, fake_ctx, recommendation_body)
