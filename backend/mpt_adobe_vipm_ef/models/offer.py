from mpt_extension_sdk.api.models.base import APIBaseModel
from pydantic import Field

from mpt_adobe_vipm_ef.models.audit import Audit
from mpt_adobe_vipm_ef.models.reference import Reference
from mpt_adobe_vipm_ef.models.terms import Terms


class ProductItem(APIBaseModel):
    """The MPT catalog item resolved for an offer-switch target."""

    id: str | None = None
    name: str | None = None
    external_id: str | None = Field(default=None, alias="externalId")
    unit_sp: float | None = Field(default=None, alias="unitSP")
    status: str | None = None
    terms: Terms | None = None
    audit: Audit | None = None
    product: Reference | None = None
    vendor: Reference | None = None


class AgreementSubscription(APIBaseModel):
    """The agreement subscription (and its line) already holding a target SKU."""

    id: str | None = None
    name: str | None = None
    status: str | None = None
    quantity: int | None = None
    line_id: str | None = Field(default=None, alias="lineId")
    commitment_date: str | None = Field(default=None, alias="commitmentDate")
    terms: Terms | None = None
    audit: Audit | None = None


class OfferTarget(APIBaseModel):
    """A single offer-switch target, enriched with its resolved catalog item."""

    target_base_offer_id: str | None = Field(default=None, alias="targetBaseOfferId")
    product_item: ProductItem | None = Field(default=None, alias="item")
    subscription: AgreementSubscription | None = None


class ProductUpgrade(APIBaseModel):
    """A product upgrade path exposing its list of switch targets."""

    target_list: list[OfferTarget] = Field(default_factory=list, alias="targetList")


class OfferSwitchPaths(APIBaseModel):
    """The Adobe offer-switch-paths response."""

    product_upgrades: list[ProductUpgrade] = Field(default_factory=list, alias="productUpgrades")
