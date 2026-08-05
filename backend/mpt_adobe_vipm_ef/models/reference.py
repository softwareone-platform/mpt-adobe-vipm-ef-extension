from mpt_extension_sdk.api.models.base import APIBaseModel


class Reference(APIBaseModel):
    """A named entity stub as returned within a payload."""

    id: str | None = None
    name: str | None = None
