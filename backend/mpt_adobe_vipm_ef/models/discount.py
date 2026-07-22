"""Request schemas and enums for the discount code management API (Discount Management TDR)."""

import datetime as dt
from dataclasses import dataclass
from enum import StrEnum

from mpt_extension_sdk.models import Agreement
from mpt_extension_sdk.schemas import BaseSchema
from pydantic import Field, field_validator, model_validator

from mpt_adobe_vipm_ef.constants import MAX_LENGTH, MIN_LENGTH

MIN_PERCENTAGE = 1
MAX_PERCENTAGE = 100
CURRENCY_CODE_LENGTH = 3


class DiscountCategory(StrEnum):
    """Discount category; INTRO applies to net-new lines only."""

    STANDARD = "STANDARD"
    INTRO = "INTRO"


class DiscountType(StrEnum):
    """How the discount value is applied."""

    PERCENTAGE = "PERCENTAGE"
    FIXED_DISCOUNT = "FIXED_DISCOUNT"
    FIXED_PRICE = "FIXED_PRICE"


class DiscountOrderType(StrEnum):
    """Order types a discount applies to; an empty selection means any."""

    NEW = "NEW"
    RENEWAL = "RENEWAL"
    SWITCH = "SWITCH"


@dataclass(frozen=True)
class DiscountScope:
    """Agreement-derived context every discount endpoint works within."""

    agreement: Agreement
    market_segment: str
    customer_id: str

    @property
    def currency(self) -> str | None:
        """The agreement (customer) currency."""
        authorization = self.agreement.authorization
        return None if authorization is None else authorization.currency

    @property
    def country(self) -> str | None:
        """The customer country, taken from the licensee address."""
        address = self.agreement.licensee.address
        return None if address is None else address.country


def _clean_offer_ids(offer_ids: list[str]) -> list[str]:
    """Normalize offer ids, rejecting blank entries and embedded whitespace."""
    cleaned = [offer_id.strip() for offer_id in offer_ids]
    invalid = [offer_id for offer_id in cleaned if not offer_id or " " in offer_id]
    if invalid:
        raise ValueError("Offer ids must be non-empty Adobe part numbers without spaces.")
    return cleaned


class DiscountCodeUpdateRequest(BaseSchema):
    """Write payload for a closed discount code, without the immutable code."""

    name: str = Field(min_length=MIN_LENGTH, max_length=MAX_LENGTH)
    description: str | None = None
    adobe_discount_id: str | None = Field(
        default=None,
        serialization_alias="adobeDiscountId",
        validation_alias="adobeDiscountId",
    )
    category: DiscountCategory
    discount_type: DiscountType = Field(
        serialization_alias="discountType",
        validation_alias="discountType",
    )
    amount: float = Field(gt=0, serialization_alias="value", validation_alias="value")
    currency: str | None = Field(
        default=None,
        min_length=CURRENCY_CODE_LENGTH,
        max_length=CURRENCY_CODE_LENGTH,
    )
    start_date: dt.datetime = Field(
        serialization_alias="startDate",
        validation_alias="startDate",
    )
    end_date: dt.datetime = Field(serialization_alias="endDate", validation_alias="endDate")
    reusable: bool = False
    discount_lock_end_date: dt.datetime | None = Field(
        default=None,
        serialization_alias="discountLockEndDate",
        validation_alias="discountLockEndDate",
    )
    target_offer_ids: list[str] = Field(
        min_length=1,
        serialization_alias="targetOfferIds",
        validation_alias="targetOfferIds",
    )
    qualifying_offer_ids: list[str] = Field(
        default_factory=list,
        serialization_alias="qualifyingOfferIds",
        validation_alias="qualifyingOfferIds",
    )
    applicable_order_types: list[DiscountOrderType] = Field(
        serialization_alias="applicableOrderTypes",
        validation_alias="applicableOrderTypes",
    )
    supports_annual: bool = Field(
        default=False,
        serialization_alias="supportsAnnual",
        validation_alias="supportsAnnual",
    )
    supports_three_yc: bool = Field(
        default=False,
        serialization_alias="supports3yc",
        validation_alias="supports3yc",
    )

    @property
    def is_reusable(self) -> bool:
        """Reusability as stored: derived from the lock date presence (TDR rule)."""
        return self.discount_lock_end_date is not None

    @field_validator("target_offer_ids", "qualifying_offer_ids")
    @classmethod
    def _validate_offer_ids(cls, offer_ids: list[str]) -> list[str]:
        return _clean_offer_ids(offer_ids)

    @model_validator(mode="after")
    def _validate_cross_fields(self) -> "DiscountCodeUpdateRequest":
        self._validate_value()
        self._validate_dates()
        self._validate_reusability()
        self._validate_category()
        return self

    def _validate_value(self) -> None:
        is_percentage = self.discount_type is DiscountType.PERCENTAGE
        percentage_in_range = MIN_PERCENTAGE <= self.amount <= MAX_PERCENTAGE
        if is_percentage and not percentage_in_range:
            raise ValueError("A percentage value must be between 1 and 100.")
        if not is_percentage and not self.currency:
            raise ValueError("A currency is required for fixed amount and fixed price discounts.")

    def _validate_dates(self) -> None:
        if self.start_date >= self.end_date:
            raise ValueError("The start date must be before the end date.")

    def _validate_reusability(self) -> None:
        if self.reusable and self.discount_lock_end_date is None:
            raise ValueError("A discount lock end date is required for reusable discounts.")
        if not self.reusable and self.discount_lock_end_date is not None:
            raise ValueError("A discount lock end date is not allowed for non-reusable discounts.")
        lock_end_date = self.discount_lock_end_date
        if lock_end_date is not None and lock_end_date <= self.end_date:
            raise ValueError("The discount lock end date must be after the end date.")

    def _validate_category(self) -> None:
        if self.category is not DiscountCategory.INTRO:
            return
        if self.applicable_order_types != [DiscountOrderType.NEW]:
            raise ValueError("INTRO discounts apply to net-new order types only.")


class DiscountCodeCreateRequest(DiscountCodeUpdateRequest):
    """Write payload for creating a closed discount code."""

    code: str = Field(min_length=MIN_LENGTH, max_length=MAX_LENGTH)

    @field_validator("code")
    @classmethod
    def _validate_code(cls, code: str) -> str:
        cleaned = code.strip()
        if not cleaned:
            raise ValueError("The code cannot be blank.")
        return cleaned
