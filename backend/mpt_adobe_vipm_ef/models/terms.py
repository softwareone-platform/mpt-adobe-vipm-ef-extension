from mpt_extension_sdk.api.models.base import APIBaseModel


class Terms(APIBaseModel):
    """The billing period and commitment of an item or a subscription."""

    period: str | None = None
    commitment: str | None = None
