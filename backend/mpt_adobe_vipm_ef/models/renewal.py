from typing import Self

from mpt_extension_sdk.api.models.base import APIBaseModel
from mpt_extension_sdk.schemas import BaseSchema
from pydantic import Field, field_validator, model_validator

from mpt_adobe_vipm_ef.constants import MAX_LENGTH, MIN_LENGTH, NOTES_MAX_LENGTH
from mpt_adobe_vipm_ef.models.switch import OrderExternalIds

_MIN_RENEWAL_QUANTITY = 1


class RenewalSubscriptionSelection(BaseSchema):
    """The customer's at-anniversary decision for one existing subscription.

    ``renew`` maps to the standing ``autoRenewal.enabled`` preference: ON renews
    the subscription at the coterm date, OFF lets it lapse. ``renewalQuantity``
    is the quantity to renew and is only meaningful while renewing.
    """

    id: str = Field(min_length=MIN_LENGTH, max_length=MAX_LENGTH)
    offer_id: str = Field(alias="offerId", min_length=MIN_LENGTH, max_length=MAX_LENGTH)
    renew: bool
    renewal_quantity: int = Field(default=0, ge=0, alias="renewalQuantity")

    @model_validator(mode="after")
    def _require_a_renewal_quantity_when_renewing(self) -> Self:
        if self.renew and self.renewal_quantity < _MIN_RENEWAL_QUANTITY:
            raise ValueError(
                f"Subscription {self.id} renews without a quantity; "
                "a renewing subscription requires a renewal quantity of at least 1.",
            )
        return self


class NetNewItemSelection(BaseSchema):
    """A product the customer does not currently hold, scheduled to activate at the anniversary."""

    offer_id: str = Field(alias="offerId", min_length=MIN_LENGTH, max_length=MAX_LENGTH)
    quantity: int = Field(gt=0)


class RenewalPlanRequest(BaseSchema):
    """The customer's renewal plan: per-subscription decisions plus net-new products.

    Body schema for the 3YC floor pre-check endpoint and the base of the
    preview and submission request schemas, so the wizard sends the same plan
    shape at every step.
    """

    subscriptions: list[RenewalSubscriptionSelection] = Field(default_factory=list)
    net_new_items: list[NetNewItemSelection] = Field(default_factory=list, alias="netNewItems")

    @field_validator("subscriptions")
    @classmethod
    def _reject_duplicate_subscriptions(
        cls, subscriptions: list[RenewalSubscriptionSelection]
    ) -> list[RenewalSubscriptionSelection]:
        seen = set()
        for selection in subscriptions:
            if selection.id in seen:
                raise ValueError(
                    f"Subscription {selection.id} appears in the renewal plan more than once.",
                )
            seen.add(selection.id)
        return subscriptions


class RenewalPreviewRequest(RenewalPlanRequest):
    """Body schema for the renewal preview (pricing and discount codes) endpoint."""

    flex_discount_codes: list[str] = Field(default_factory=list, alias="flexDiscountCodes")


class RenewalOrderRequest(RenewalPreviewRequest):
    """Body schema for the at-anniversary renewal order submission endpoint."""

    recommendation_tracker_id: str = Field(
        default="",
        alias="recommendationTrackerId",
        max_length=MAX_LENGTH,
    )
    notes: str = Field(default="", max_length=NOTES_MAX_LENGTH)
    external_ids: OrderExternalIds = Field(
        default_factory=OrderExternalIds,
        alias="externalIds",
    )


class RenewalPayloadSubscription(APIBaseModel):
    """One existing subscription's at-anniversary decision, keyed by its Adobe id.

    Mirrors Adobe's auto-renewal preference object (``enabled`` as ``renew``,
    ``renewalQuantity`` and ``flexDiscountCodes``) so fulfilment can PATCH the
    subscription without recomputing the plan.
    """

    subscription_id: str = Field(alias="subscriptionId")
    offer_id: str = Field(alias="offerId")
    renew: bool
    renewal_quantity: int = Field(alias="renewalQuantity")
    flex_discount_codes: list[str] = Field(default_factory=list, alias="flexDiscountCodes")


class RenewalPayloadNetNewItem(APIBaseModel):
    """A net-new product to create as an Adobe scheduled subscription at fulfilment."""

    offer_id: str = Field(alias="offerId")
    quantity: int


class RenewalPayload(APIBaseModel):
    """The renewal plan snapshot stored in the hidden order DataObject.

    Locks in what the customer agreed to in the wizard: the per-subscription
    renew decisions with their quantities and discount codes, the net-new
    products to schedule (with their full offer ids), and the recommendation
    tracker id — everything the fulfillment extension needs to apply the plan
    to Adobe at the anniversary.
    """

    recommendation_tracker_id: str = Field(default="", alias="recommendationTrackerId")
    currency_code: str = Field(alias="currencyCode")
    subscriptions: list[RenewalPayloadSubscription]
    net_new_items: list[RenewalPayloadNetNewItem] = Field(
        default_factory=list,
        alias="netNewItems",
    )
