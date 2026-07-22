"""Discount code management endpoints (Discount Management TDR).

CRUD over the Airtable discount data store, scoped to an agreement passed as
the ``agreement`` query parameter. Client accounts read; vendor and operations
accounts also author and curate closed codes. Open (sync-owned) codes are
read-only here — they belong to the Adobe synchronization job.
"""

import datetime as dt

from mpt_extension_sdk.api import APIContext, APIResponse
from mpt_extension_sdk.api.pagination import PaginatedResult
from mpt_extension_sdk.routing import APIRouter

from mpt_adobe_vipm_ef.models.discount import DiscountCodeCreateRequest, DiscountCodeUpdateRequest
from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs
from mpt_adobe_vipm_ef.routers.api.discount_scope import load_discount_scope, require_editor_account
from mpt_adobe_vipm_ef.services import discount_mapping
from mpt_adobe_vipm_ef.services.discount_codes import (
    build_store,
    guard_code_creation,
    reject_duplicate_code,
    require_visible_record,
    resolve_value_fields,
    serialize_page,
    store_call,
    value_entry,
)

discounts_router = APIRouter(prefix="/discount-codes")


@discounts_router.get(path="/", name="discount-codes-list")
@log_inputs
async def list_discount_codes(ctx: APIContext) -> APIResponse:  # noqa: WPS210
    """List the discounts in scope for the agreement's customer (open + closed)."""
    scope = await load_discount_scope(ctx)
    store = build_store(ctx)
    records = await store_call(store.list_codes, scope.market_segment, scope.customer_id)
    pagination = ctx.request.pagination
    page = records[pagination.offset : pagination.offset + pagination.limit]
    payloads = await serialize_page(store, scope, page)
    return APIResponse.paginated(
        PaginatedResult.from_pagination(pagination, payload=payloads, total=len(records)),
    )


@discounts_router.get(path="/{discount_id}", name="discount-codes-get")
@log_inputs
async def get_discount_code(discount_id: str, ctx: APIContext) -> APIResponse:
    """Return one discount for the edit pre-fill."""
    scope = await load_discount_scope(ctx)
    store = build_store(ctx)
    record = await require_visible_record(store, scope, discount_id)
    payloads = await serialize_page(store, scope, [record])
    return APIResponse.ok(payload=payloads[0])


@discounts_router.post(
    path="/", name="discount-codes-create", body_validator=DiscountCodeCreateRequest
)
@log_inputs
async def create_discount_code(  # noqa: WPS210
    ctx: APIContext, body: DiscountCodeCreateRequest
) -> APIResponse:
    """Create a closed discount code authored by a vendor or operations actor."""
    require_editor_account(ctx)
    scope = await load_discount_scope(ctx)
    store = build_store(ctx)
    async with guard_code_creation(scope, body.code):
        await reject_duplicate_code(store, scope, body.code)
        now = dt.datetime.now(tz=dt.UTC)
        value_fields = resolve_value_fields(scope, body.code, body)
        record = await store_call(
            store.create_code,
            discount_mapping.build_closed_code_fields(
                body, scope.market_segment, scope.customer_id, now
            ),
        )
        await store_call(store.replace_value, body.code, scope.market_segment, value_fields)
    payload = discount_mapping.to_api_payload(record, [value_entry(value_fields)], None)
    return APIResponse.created(payload=payload)


@discounts_router.put(
    path="/{discount_id}", name="discount-codes-update", body_validator=DiscountCodeUpdateRequest
)
@log_inputs
async def update_discount_code(  # noqa: WPS210
    discount_id: str, ctx: APIContext, body: DiscountCodeUpdateRequest
) -> APIResponse:
    """Update a closed discount code from the edit wizard; the code is immutable."""
    require_editor_account(ctx)
    scope = await load_discount_scope(ctx)
    store = build_store(ctx)
    record = await require_visible_record(store, scope, discount_id, closed_only=True)
    code = discount_mapping.record_code(record)
    now = dt.datetime.now(tz=dt.UTC)
    value_fields = resolve_value_fields(scope, code, body)
    updated = await store_call(
        store.update_code, record["id"], discount_mapping.build_update_fields(body, now)
    )
    await store_call(store.replace_value, code, scope.market_segment, value_fields)
    payload = discount_mapping.to_api_payload(updated, [value_entry(value_fields)], None)
    return APIResponse.ok(payload=payload)


@discounts_router.delete(path="/{discount_id}", name="discount-codes-delete")
@log_inputs
async def delete_discount_code(discount_id: str, ctx: APIContext) -> APIResponse:
    """Soft-delete a closed discount code by stamping ``retired_at``."""
    require_editor_account(ctx)
    scope = await load_discount_scope(ctx)
    store = build_store(ctx)
    record = await require_visible_record(store, scope, discount_id, closed_only=True)
    retired_at = dt.datetime.now(tz=dt.UTC).isoformat()
    await store_call(store.update_code, record["id"], {"retired_at": retired_at})
    return APIResponse.no_content()
