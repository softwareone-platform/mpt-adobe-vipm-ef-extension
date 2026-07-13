from mpt_extension_sdk.api.models.base import APIBaseModel
from pydantic import Field


class ProductItem(APIBaseModel):
    """The MPT catalog item resolved for an offer-switch target."""

    id: str | None = None
    name: str | None = None
    external_id: str | None = Field(default=None, alias="externalId")
    unit_sp: float | None = Field(default=None, alias="unitSP")


class OfferTarget(APIBaseModel):
    """A single offer-switch target, enriched with its resolved catalog item."""

    target_base_offer_id: str | None = Field(default=None, alias="targetBaseOfferId")
    product_item: ProductItem | None = Field(default=None, alias="item")


class ProductUpgrade(APIBaseModel):
    """A product upgrade path exposing its list of switch targets."""

    target_list: list[OfferTarget] = Field(default_factory=list, alias="targetList")


class OfferSwitchPaths(APIBaseModel):
    """The Adobe offer-switch-paths response."""

    product_upgrades: list[ProductUpgrade] = Field(default_factory=list, alias="productUpgrades")
