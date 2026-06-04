from mpt_extension_sdk.api.models.base import APIBaseModel


class ProductSegment(APIBaseModel):
    """A product id paired with its market segment."""

    id: str
    segment: str
