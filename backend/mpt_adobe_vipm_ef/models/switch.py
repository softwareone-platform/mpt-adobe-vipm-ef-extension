from mpt_extension_sdk.api.models.base import APIBaseModel
from mpt_extension_sdk.schemas import BaseSchema
from pydantic import Field, field_validator

from adobe.enums import AdobeOrderType
from mpt_adobe_vipm_ef.constants import MAX_LENGTH, MIN_LENGTH, NOTES_MAX_LENGTH

_FIRST_LINE_NUMBER = 1
_MAX_FLEX_DISCOUNT_CODES_PER_LINE = 1


class SwitchLineItem(APIBaseModel):
    """The Adobe switch order line acquiring the target offer.

    ``flexDiscountCodes`` carries the flexible discount code the customer
    applied on the wizard's Promotions step. It is omitted when no code was
    applied, so a snapshot stored before discounts existed still parses.
    """

    ext_line_item_number: int = Field(alias="extLineItemNumber")
    offer_id: str = Field(alias="offerId")
    quantity: int
    flex_discount_codes: list[str] = Field(default_factory=list, alias="flexDiscountCodes")


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


class OrderExternalIds(BaseSchema):
    """Customer-provided identifiers attached to the marketplace order."""

    client: str = Field(default="", max_length=MAX_LENGTH)


class UpgradePreviewRequest(BaseSchema):
    """Body schema for the mid-term upgrade preview endpoint.

    The customer's selection as the submission sends it, minus what only the
    order carries (notes and additional ids). ``flexDiscountCodes`` holds at
    most one code (Adobe error 2147): it applies to the target line only.
    Codes are normalised (trimmed, upper-cased, blanks dropped) so a code typed
    in the wizard reaches Adobe the way the store holds it.
    """

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
    flex_discount_codes: list[str] = Field(
        default_factory=list,
        alias="flexDiscountCodes",
        max_length=_MAX_FLEX_DISCOUNT_CODES_PER_LINE,
    )

    @field_validator("flex_discount_codes")
    @classmethod
    def _normalise_flex_discount_codes(cls, codes: list[str]) -> list[str]:
        normalised = (code.strip().upper() for code in codes)
        return [code for code in normalised if code]


class UpgradeOrderRequest(UpgradePreviewRequest):
    """Body schema for the mid-term upgrade order submission endpoint."""

    notes: str = Field(default="", max_length=NOTES_MAX_LENGTH)
    external_ids: OrderExternalIds = Field(
        default_factory=OrderExternalIds,
        alias="externalIds",
    )


def build_switch_payload(
    request: UpgradePreviewRequest, adobe_subscription_id: str, currency_code: str
) -> SwitchPayload:
    """Build the DataObject snapshot from the customer's selection.

    Adobe requires the acquired and cancelled quantities to be equal on a
    switch, so both items carry the requested quantity; a partial upgrade is
    expressed by cancelling less than the source subscription's total. The
    flexible discount code rides the target line only: Adobe discounts the
    acquired quantity, never the cancelled one, on full and partial upgrades
    alike.
    """
    target_line: dict[str, object] = {
        "extLineItemNumber": _FIRST_LINE_NUMBER,
        "offerId": request.target_offer_id,
        "quantity": request.quantity,
    }
    if request.flex_discount_codes:
        target_line["flexDiscountCodes"] = list(request.flex_discount_codes)
    return SwitchPayload.from_payload({
        "recommendationTrackerId": request.recommendation_tracker_id,
        "orderType": AdobeOrderType.SWITCH.value,
        "currencyCode": currency_code,
        "lineItems": [target_line],
        "cancellingItems": [
            {
                "extLineItemNumber": _FIRST_LINE_NUMBER,
                "referenceLineItemNumber": _FIRST_LINE_NUMBER,
                "subscriptionId": adobe_subscription_id,
                "quantity": request.quantity,
            },
        ],
    })
