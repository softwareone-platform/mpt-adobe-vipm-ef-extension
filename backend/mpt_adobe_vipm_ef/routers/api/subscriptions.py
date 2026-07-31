import asyncio
import logging
from typing import Any

from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api import APIResponse
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.routing import APIRouter

from mpt_adobe_vipm_ef.constants import (
    AGREEMENT_SELECT,
    BUYER_SELECT,
    LICENSEE_SELECT,
    LINES_SELECT,
    SELLER_SELECT,
    SPLIT_SELECT,
)
from mpt_adobe_vipm_ef.services.clients import build_caller_client

logger = logging.getLogger(__name__)

subscriptions_router = APIRouter(prefix="/subscriptions")


async def _enrich_related(payload: dict[str, Any], key: str, resource: Any, select: Any) -> None:
    """Replace a related entity stub in the payload with its full details."""
    entity_id = (payload.get(key) or {}).get("id")
    if not entity_id:
        return
    try:
        entity = await resource.get(entity_id, select=select)
    except MPTError:
        logger.exception("Failed to load %s details", key)
        return
    payload[key] = entity.to_dict()


async def _enrich_split(payload: dict[str, Any], subscription_id: str, resource: Any) -> None:
    """Attach the subscription's own split allocations.

    ``split`` is not part of the default subscription payload, it has to be
    selected explicitly. Allocations are per subscription, so the agreement
    split cannot stand in for them: agreements with several subscriptions have
    different percentages per subscription.
    """
    if not payload.get("splitStatus"):
        return
    try:
        subscription = await resource.get(subscription_id, select=SPLIT_SELECT)
    except MPTError:
        logger.exception("Failed to load subscription split")
        return
    payload["split"] = subscription.to_dict().get("split")


@subscriptions_router.post(path="/{subscription_id}/sync", name="subscriptions-sync")
async def sync_subscription(subscription_id: str, ctx: APIContext) -> APIResponse:  # noqa: WPS210
    """Synchronize a subscription view with the current Marketplace data."""
    subscription = await ctx.mpt_api_service.subscriptions.get_by_id(subscription_id)
    payload = subscription.to_dict()

    client = build_caller_client(ctx)

    if client is None:
        return APIResponse.ok(payload=payload)

    related = (
        ("agreement", client.commerce.agreements, AGREEMENT_SELECT),
        ("licensee", client.accounts.licensees, LICENSEE_SELECT),
        ("buyer", client.accounts.buyers, BUYER_SELECT),
        ("seller", client.accounts.sellers, SELLER_SELECT),
    )
    await asyncio.gather(
        *(_enrich_related(payload, key, resource, select) for key, resource, select in related),
        _enrich_split(payload, subscription_id, client.commerce.subscriptions),
    )

    return APIResponse.ok(payload=payload)
