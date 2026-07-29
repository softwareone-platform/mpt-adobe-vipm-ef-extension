import asyncio
import logging
from typing import Any

from mpt_extension_sdk.api import (
    APIContext,
    APIResponse,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.routing import APIRouter

from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.context import adobe_client
from mpt_adobe_vipm_ef.models.offer import (
    AgreementSubscription,
    OfferSwitchPaths,
    OfferTarget,
    ProductItem,
)
from mpt_adobe_vipm_ef.routers.api.customer import (
    get_authorization_id,
    load_agreement,
    require_customer_id,
    validate_agreement_access,
)
from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs
from mpt_adobe_vipm_ef.services.items import get_partial_sku, resolve_items_by_sku
from mpt_adobe_vipm_ef.services.pricing import get_unit_selling_prices
from mpt_adobe_vipm_ef.services.subscriptions import resolve_agreement_subscriptions_by_sku

logger = logging.getLogger(__name__)

offer_router = APIRouter(prefix="/agreements")


@offer_router.get(
    path="/{agreement_id}/subscriptions/{subscription_id}/offer-switch-paths",
    name="agreements-offer-switch-paths",
)
@validate_agreement_access
@log_inputs
async def get_offer_switch_paths(
    agreement_id: str, subscription_id: str, ctx: APIContext
) -> APIResponse:
    """Fetch Adobe offer switch paths (eligible upgrade targets) for a subscription."""
    authorization_id = await get_authorization_id(ctx, agreement_id)
    customer_id = await require_customer_id(ctx, agreement_id)
    try:
        raw_paths = await asyncio.to_thread(
            adobe_client(ctx).offer.get_offer_switch_paths,
            authorization_id,
            customer_id,
            subscription_id,
        )
    except AdobeAPIError as error:
        logger.warning("Adobe API error on get_offer_switch_paths: %s", error)
        raise UpstreamServiceError(detail="Adobe service request failed")
    except AdobeHttpError as error:
        logger.warning(
            "Adobe HTTP error on get_offer_switch_paths: status=%s body=%r",
            error.status_code if hasattr(error, "status_code") else "?",
            error.response_content,
        )
        raise UpstreamServiceError(detail="Adobe service request failed")
    except AdobeError as error:
        logger.warning("Adobe configuration error on get_offer_switch_paths: %s", error)
        raise ValidationError(detail=str(error))

    paths = OfferSwitchPaths.from_payload(raw_paths)
    enriched = await _enrich_targets(ctx, agreement_id, subscription_id, paths)
    return APIResponse.ok(payload=enriched.to_dict())


async def _enrich_targets(
    ctx: APIContext, agreement_id: str, source_subscription_id: str, paths: OfferSwitchPaths
) -> OfferSwitchPaths:
    """Attach the catalog item and any existing agreement subscription to each target.

    A target whose SKU is already held by another subscription on the agreement
    carries that subscription (id, name, status, current quantity), so the
    wizard shows the switch as a top-up of the existing subscription instead of
    a new one — mirroring how the submitted change order is built.
    """
    targets = [target for upgrade in paths.product_upgrades for target in upgrade.target_list]
    priced_items = await _resolve_priced_items(ctx, agreement_id, targets)
    subscriptions_by_sku = await resolve_agreement_subscriptions_by_sku(
        ctx, agreement_id, source_subscription_id
    )
    return paths.model_copy(
        update={
            "product_upgrades": [
                upgrade.model_copy(
                    update={
                        "target_list": [
                            _enrich_target(target, priced_items, subscriptions_by_sku)
                            for target in upgrade.target_list
                        ]
                    }
                )
                for upgrade in paths.product_upgrades
            ]
        }
    )


def _enrich_target(
    target: OfferTarget,
    priced_items: dict[str, ProductItem],
    subscriptions_by_sku: dict[str, dict[str, Any]],
) -> OfferTarget:
    offer_id = target.target_base_offer_id
    if not offer_id:
        return target
    sku = get_partial_sku(offer_id)
    existing = subscriptions_by_sku.get(sku)
    return target.model_copy(
        update={
            "product_item": priced_items.get(sku),
            "subscription": AgreementSubscription.from_payload(existing) if existing else None,
        }
    )


def _target_skus(targets: list[OfferTarget]) -> list[str]:
    return sorted({
        get_partial_sku(target.target_base_offer_id)
        for target in targets
        if target.target_base_offer_id
    })


async def _resolve_priced_items(
    ctx: APIContext, agreement_id: str, targets: list[OfferTarget]
) -> dict[str, ProductItem]:
    """Resolve the catalog item for each target SKU and attach its unit selling price."""
    product_id = (await load_agreement(ctx, agreement_id)).product.id
    product_items = await resolve_items_by_sku(ctx, product_id, _target_skus(targets))
    unit_prices = await get_unit_selling_prices(
        ctx,
        agreement_id,
        [product_item["id"] for product_item in product_items.values() if product_item.get("id")],
    )
    return {
        sku: ProductItem.from_payload({
            **product_item,
            "unitSP": unit_prices.get(product_item["id"]),
        })
        for sku, product_item in product_items.items()
    }
