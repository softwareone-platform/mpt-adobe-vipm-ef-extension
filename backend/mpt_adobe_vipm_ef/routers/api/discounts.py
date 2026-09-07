"""Discount code management endpoints (Discount Management TDR).

CRUD over the Airtable discount data store, scoped to an agreement passed as
the ``agreement`` query parameter. Client accounts read; vendor and operations
accounts also author and curate closed codes. Open codes belong to the Adobe
synchronization job and are read-only on this surface for every actor.
"""

import datetime as dt

from mpt_extension_sdk.api import APIContext, APIResponse
from mpt_extension_sdk.api.pagination import PaginatedResult
from mpt_extension_sdk.routing import APIRouter

from mpt_adobe_vipm_ef.models.discount import (
    DiscountCodeCreateRequest,
    DiscountCodeUpdateRequest,
    DiscountScope,
)
from mpt_adobe_vipm_ef.routers.api.decorators import log_inputs
from mpt_adobe_vipm_ef.routers.api.discount_scope import (
    load_discount_scope,
    read_eligibility_context,
    read_order_type_filter,
    require_editor_account,
    resolve_closed_source,
)
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
from mpt_adobe_vipm_ef.services.discounts import AirtableRecord, DiscountStore

discounts_router = APIRouter(prefix="/discount-codes")


@discounts_router.get(path="/", name="discount-codes-list")
@log_inputs
async def list_discount_codes(ctx: APIContext) -> APIResponse:  # noqa: WPS210
    """List the discounts in scope for the agreement's customer (open + closed).

    The offer shortlist (an ``orderType`` is given, e.g. the renewal wizard)
    evaluates the full eligibility of each code against the current context — the
    line's SKU, the customer's owned SKUs and country, and the commitment term —
    and drops single-use codes the customer has already redeemed. The discounts
    tab (no ``orderType``) lists every code, redeemed ones included.
    """
    order_type = read_order_type_filter(ctx)
    scope = await load_discount_scope(ctx)
    store = build_store(ctx)
    stored = await store_call(store.list_codes, scope.market_segment, scope.customer_id)
    context = read_eligibility_context(ctx) if order_type else None
    records = discount_mapping.filter_offerable(stored, order_type, context)
    redemptions = None
    if order_type is not None:
        codes = [discount_mapping.record_code(record) for record in records]
        redemption_records = await store_call(store.list_redemptions, codes, scope.customer_id)
        redemptions = discount_mapping.redemptions_by_code(redemption_records)
        records = discount_mapping.exclude_redeemed(records, redemptions)
        records = await _exclude_out_of_country(store, scope, records)
    pagination = ctx.request.pagination
    page = records[pagination.offset : pagination.offset + pagination.limit]
    payloads = await serialize_page(store, scope, page, redemptions)
    return APIResponse.paginated(
        PaginatedResult.from_pagination(pagination, payload=payloads, total=len(records)),
    )


async def _exclude_out_of_country(
    store: DiscountStore, scope: DiscountScope, records: list[AirtableRecord]
) -> list[AirtableRecord]:
    """Drop codes not offered in the customer's country, using the value rows.

    The gate is skipped when the customer country is unknown: it would hide every
    per-country code with no backstop, so the shortlist errs towards showing them.
    """
    if not scope.country:
        return records
    codes = [discount_mapping.record_code(record) for record in records]
    value_records = await store_call(store.list_values, codes, scope.market_segment)
    return discount_mapping.exclude_out_of_country(records, value_records, scope.country)


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
    """Create a closed discount code authored by a vendor or operations actor.

    The row records its author in ``source``, resolved from the caller's
    account type: "Operations" or "Vendor".
    """
    source = resolve_closed_source(ctx)
    scope = await load_discount_scope(ctx)
    store = build_store(ctx)
    async with guard_code_creation(scope, body.code):
        await reject_duplicate_code(store, scope, body.code)
        now = dt.datetime.now(tz=dt.UTC)
        value_fields = resolve_value_fields(scope, body.code, body)
        record = await store_call(
            store.create_code,
            discount_mapping.build_closed_code_fields(
                body, scope.market_segment, scope.customer_id, now, source
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
    """Update a discount code from the edit wizard; the code is immutable.

    Only closed codes are editable: open codes are owned by the catalogue sync,
    which rewrites their Adobe-sourced fields on every run.
    """
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
