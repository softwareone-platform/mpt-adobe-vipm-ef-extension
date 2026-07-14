from mpt_extension_sdk.api.models.base import APIBaseModel
from mpt_extension_sdk.schemas import BaseSchema
from pydantic import Field


class RecommendationProduct(APIBaseModel):
    """Adobe recommendation product."""

    base_offer_id: str | None = Field(default=None, alias="baseOfferId")


class RecommendationSource(APIBaseModel):
    """Adobe recommendation source."""

    source_type: str | None = Field(default=None, alias="sourceType")
    offer_ids: list[str] = Field(default_factory=list, alias="offerIds")


class Recommendation(APIBaseModel):
    """The Adobe recommendation."""

    rank: int | None = None
    product: RecommendationProduct | None = Field(default=None, alias="product")
    source: RecommendationSource | None = Field(default=None, alias="source")


class Recommendations(APIBaseModel):
    """The Adobe recommendations response."""

    upsells: list[Recommendation] = Field(default_factory=list, alias="upsells")
    cross_sells: list[Recommendation] = Field(default_factory=list, alias="crossSells")
    add_ons: list[Recommendation] = Field(default_factory=list, alias="addOns")


class RecommendationsResponse(APIBaseModel):
    """The Adobe recommendations response."""

    product_recommendations: Recommendations | None = Field(
        default=None, alias="productRecommendations"
    )
    x_recommendation_tracker_id: str = Field(default="", alias="xRecommendationTrackerId")


class RecommendationOfferRequest(BaseSchema):
    """The Adobe recommendation offer request."""

    offer_id: str = Field(alias="offerId", min_length=1)
    quantity: int


class RecommendationRequest(BaseSchema):
    """The Adobe recommendation request."""

    offers: list[RecommendationOfferRequest] = Field(alias="offers", min_length=1)
