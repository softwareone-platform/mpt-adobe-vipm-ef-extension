"""Orchestration helpers shared by the discount code endpoints.

Bridges the request scope with the Airtable data store: runs the synchronous
store off-loop, maps store failures to API errors, and enriches code rows with
their per-country values and the customer's redemptions.
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any, cast

from mpt_extension_sdk.api import (
    APIContext,
    ErrorDetail,
    NotFoundError,
    UpstreamServiceError,
    ValidationError,
)
from requests import RequestException

from mpt_adobe_vipm_ef.models.discount import DiscountCodeUpdateRequest, DiscountScope
from mpt_adobe_vipm_ef.services import discount_mapping
from mpt_adobe_vipm_ef.services.discounts import AirtableRecord, DiscountStore
from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)


def build_store(ctx: APIContext) -> DiscountStore:
    """Build the Airtable store from the extension settings."""
    return DiscountStore.from_settings(cast(ExtensionSettings, ctx.ext_settings))


async def store_call(store_method: Callable[..., Any], *args: Any) -> Any:
    """Run a synchronous store call off-loop, mapping Airtable failures to 502."""
    try:
        return await asyncio.to_thread(store_method, *args)
    except RequestException as error:
        logger.warning("Discount data store request failed: %s", error)
        raise UpstreamServiceError(detail="Discount data store request failed")


async def require_visible_record(
    store: DiscountStore,
    scope: DiscountScope,
    discount_id: str,
    *,
    closed_only: bool = False,
) -> AirtableRecord:
    """Load a code row, hiding anything out of the caller's scope as a 404.

    With ``closed_only`` the row must also be a closed (Ops/Vendor-authored)
    code: open codes belong to the Adobe synchronization and reject writes.
    """
    record = cast(AirtableRecord | None, await store_call(store.get_code, discount_id))
    in_scope = record is not None and discount_mapping.is_visible(
        record, scope.market_segment, scope.customer_id
    )
    if record is None or not in_scope:
        raise NotFoundError(detail="Discount code not found.")
    if closed_only and not discount_mapping.is_closed(record):
        raise ValidationError(
            detail="Open discount codes are managed by the Adobe synchronization "
            "and cannot be modified.",
        )
    return record


# In-process locks keyed by ``(code, market_segment)``. Airtable has no unique
# constraint, so the duplicate check and the insert must run as one critical
# section to keep concurrent creates from leaving two rows for the same pair.
# Entries are reference-counted and dropped once no request holds them.
_create_locks: dict[tuple[str, str], "asyncio.Lock"] = {}
_create_lock_waiters: dict[tuple[str, str], int] = {}
_create_registry_guard = asyncio.Lock()


@asynccontextmanager
async def guard_code_creation(scope: DiscountScope, code: str) -> AsyncIterator[None]:
    """Serialize the check-then-create of one ``(code, market_segment)`` pair."""
    key = (code, scope.market_segment)
    async with _create_registry_guard:
        lock = _create_locks.setdefault(key, asyncio.Lock())
        _create_lock_waiters[key] = _create_lock_waiters.get(key, 0) + 1
    try:
        async with lock:
            yield
    finally:
        async with _create_registry_guard:
            _create_lock_waiters[key] -= 1
            if _create_lock_waiters[key] == 0:
                _create_lock_waiters.pop(key)
                _create_locks.pop(key)


async def reject_duplicate_code(store: DiscountStore, scope: DiscountScope, code: str) -> None:
    """Enforce uniqueness of ``(code, market_segment)``, including open codes."""
    existing = await store_call(store.find_code, code, scope.market_segment)
    if existing is not None:
        raise ValidationError(
            detail="A discount with this code already exists in the market segment.",
            errors=[ErrorDetail(pointer="#/code", detail="Duplicate code.")],
        )


def resolve_value_fields(
    scope: DiscountScope, code: str, body: DiscountCodeUpdateRequest
) -> dict[str, Any]:
    """Build the per-country value row, resolving country and currency from scope."""
    country = scope.country
    if not country:
        raise ValidationError(
            detail="The agreement's licensee has no country to store the discount value against.",
        )
    currency = body.currency or scope.currency
    if not currency:
        raise ValidationError(detail="A currency is required to store the discount value.")
    return discount_mapping.build_value_fields(
        code, scope.market_segment, country, currency, body.amount
    )


def value_entry(value_fields: dict[str, Any]) -> dict[str, Any]:
    """Shape a stored value row as the API ``values`` entry."""
    return {
        "country": value_fields["country"],
        "currency": value_fields["currency"],
        "value": value_fields["value"],
    }


async def serialize_page(
    store: DiscountStore, scope: DiscountScope, page: list[AirtableRecord]
) -> list[dict[str, Any]]:
    """Serialize code rows, enriched with their values and the customer's redemptions."""
    codes = [discount_mapping.record_code(record) for record in page]
    value_records, redemption_records = await asyncio.gather(
        store_call(store.list_values, codes, scope.market_segment),
        store_call(store.list_redemptions, codes, scope.customer_id),
    )
    values_by_code = discount_mapping.group_values(value_records)
    redemptions = discount_mapping.redeemed_at_by_code(redemption_records)
    return [
        discount_mapping.to_api_payload(
            record,
            values_by_code.get(discount_mapping.record_code(record), []),
            redemptions.get(discount_mapping.record_code(record)),
        )
        for record in page
    ]
