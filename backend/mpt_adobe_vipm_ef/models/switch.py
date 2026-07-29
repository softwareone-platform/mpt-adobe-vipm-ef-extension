from mpt_extension_sdk.api.models.base import APIBaseModel
from mpt_extension_sdk.schemas import BaseSchema
from pydantic import Field

from adobe.enums import AdobeOrderType
from mpt_adobe_vipm_ef.constants import MAX_LENGTH, MIN_LENGTH

_FIRST_LINE_NUMBER = 1


class SwitchLineItem(APIBaseModel):
    """The Adobe switch order line acquiring the target offer."""

    ext_line_item_number: int = Field(alias="extLineItemNumber")
    offer_id: str = Field(alias="offerId")
    quantity: int


class SwitchCancellingItem(APIBaseModel):
    """The Adobe switch order line cancelling quantity on the source subscription."""

    ext_line_item_number: int = Field(alias="extLineItemNumber")
    reference_line_item_number: int = Field(alias="referenceLineItemNumber")
    subscription_id: str = Field(alias="subscriptionId")
    quantity: int


class SwitchPayload(APIBaseModel):
    """The Adobe-resolved switch snapshot stored in the hidden order DataObject.

    Locks in what the customer agreed to: the tracker id returned by Adobe's
    recommendations API plus the exact ``SWITCH`` order body the fulfillment
    extension must send to Adobe.
    """

    recommendation_tracker_id: str = Field(default="", alias="recommendationTrackerId")
    order_type: str = Field(default=AdobeOrderType.SWITCH.value, alias="orderType")
    currency_code: str = Field(alias="currencyCode")
    line_items: list[SwitchLineItem] = Field(alias="lineItems")
    cancelling_items: list[SwitchCancellingItem] = Field(alias="cancellingItems")


class UpgradeOrderRequest(BaseSchema):
    """Body schema for the mid-term upgrade order submission endpoint."""

    target_offer_id: str = Field(
        alias="targetOfferId",
        min_length=MIN_LENGTH,
        max_length=MAX_LENGTH,
    )
    quantity: int = Field(gt=0)
    recommendation_tracker_id: str = Field(
        default="",
        alias="recommendationTrackerId",
        max_length=MAX_LENGTH,
    )


def build_switch_payload(
    request: UpgradeOrderRequest, adobe_subscription_id: str, currency_code: str
) -> SwitchPayload:
    """Build the DataObject snapshot from the customer's selection.

    Adobe requires the acquired and cancelled quantities to be equal on a
    switch, so both items carry the requested quantity; a partial upgrade is
    expressed by cancelling less than the source subscription's total.
    """
    return SwitchPayload.from_payload({
        "recommendationTrackerId": request.recommendation_tracker_id,
        "orderType": AdobeOrderType.SWITCH.value,
        "currencyCode": currency_code,
        "lineItems": [
            {
                "extLineItemNumber": _FIRST_LINE_NUMBER,
                "offerId": request.target_offer_id,
                "quantity": request.quantity,
            },
        ],
        "cancellingItems": [
            {
                "extLineItemNumber": _FIRST_LINE_NUMBER,
                "referenceLineItemNumber": _FIRST_LINE_NUMBER,
                "subscriptionId": adobe_subscription_id,
                "quantity": request.quantity,
            },
        ],
    })
