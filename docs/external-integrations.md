# External Integrations

This document lists the external systems the extension integrates with, their
purpose, and how they authenticate. The full environment-variable reference
lives in [deployment.md](deployment.md); this document is the index and does not
duplicate those tables.

## Integrations

| System | Purpose | Auth | Configuration | Code |
| --- | --- | --- | --- | --- |
| Adobe VIPM API | Adobe VIP Marketplace customer and order operations, flexible discount catalogue retrieval | OAuth 2.0 (Adobe IMS); credentials and authorizations loaded from mounted JSON files | `EXT_ADOBE_API_BASE_URL`, `EXT_ADOBE_AUTH_ENDPOINT_URL`, `EXT_ADOBE_CREDENTIALS_FILE`, `EXT_ADOBE_AUTHORIZATIONS_FILE` | [`backend/adobe/`](../backend/adobe) |
| SoftwareOne Marketplace (MPT) API | Order events, agreement/customer API, plug metadata | Bearer token (JWT) / extension credentials | `MPT_API_BASE_URL`, `MPT_API_TOKEN`, `MPT_PRODUCTS_IDS`, `SDK_EXTENSION_API_KEY`, `SDK_EXTENSION_ID`, `SDK_EXTENSION_URL` | provided by `mpt-extension-sdk` |
| Airtable | Discount code storage (required), optional `mpt-tool` storage backend | API key | Discount store: `EXT_AIRTABLE_API_TOKEN`, `EXT_AIRTABLE_DISCOUNTS_ID`; `mpt-tool`: `MPT_TOOL_STORAGE_TYPE`, `MPT_TOOL_STORAGE_AIRTABLE_API_KEY`, `MPT_TOOL_STORAGE_AIRTABLE_BASE_ID`, `MPT_TOOL_STORAGE_AIRTABLE_TABLE_NAME` | [`backend/mpt_adobe_vipm_ef/services/discounts.py`](../backend/mpt_adobe_vipm_ef/services/discounts.py), `mpt-tool` |

## Adobe flexible discount catalogue retrieval

The extension synchronizes the open Adobe flexible discount catalogue daily via
the `GET /v3/flex-discounts` endpoint. The sync is scoped by:

- **Authorization** — each platform catalog authorization maps to an Adobe
  credential set in the authorizations file; the sync derives the authorization
  ID from the platform's catalog authorizations of the extension's products
- **Market segment** — Adobe publishes open discounts per market segment; the
  sync walks COM, EDU, and GOV (GOV_LGA has no open discounts)
- **Country** — the storefront country is derived from the authorization owner's
  address, and that country resolves to an Adobe region through the packaged
  `mpt_adobe_vipm_ef/data/region_country_mapping.json`; the sync then queries
  Adobe once per country of the region with the same credentials. Each region is
  processed once per run, and a country belonging to no region is queried on its
  own

The endpoint returns the open catalogue only (closed codes must be queried
individually by code). Adobe caps the page size at 50 items; the client walks
pages until `totalCount` is exhausted. Each discount includes:

- Code, name, description, category, status
- Start date, end date, discount lock end date (for reusable codes)
- Discount type (percentage, fixed discount, fixed price)
- Target offer IDs and qualifying offer IDs
- Per-country discount values (country, currency, amount)

Open discounts are mirrored into the Airtable discount store with
`source = "API"` and `enrichment_status = "PENDING"`. Enrichment fields
(applicable order types, annual/3YC support) are curated by operations and left
untouched by the sync.

## Airtable discount-store synchronization

The Airtable discount store (`EXT_AIRTABLE_DISCOUNTS_ID`) holds three tables:

- **Discount Codes** — one row per code (open and closed), keyed by
  `(code, market_segment)`; carries the code attributes (name, description,
  dates, reusability, target/qualifying offer IDs, enrichment status)
- **Discount Values** — per-country discount amount rows, linked to the code row
- **Discount Redemptions** — one row per code redeemed by a customer, tracking
  when the code was first applied

The daily sync (`/schedules/discounts/open-sync`, cron `0 0 * * *`) upserts open
codes atomically:

1. New codes are inserted with the attributes Adobe reports
2. Existing open codes are updated with fresh Adobe data; enrichment fields stay
   untouched
3. Closed codes (`source = "Operations"`, `"Vendor"` or `"Client"`, or the
   legacy `"Ops/Vendor"` on rows authored before the split) are never
   overwritten by the sync
4. Per-country values are replaced atomically (one row per country)

Every run then closes with an expiry review of the stored open rows, so the
store keeps up with codes whose window has moved or that Adobe has dropped from
the open catalogue altogether:

- **Retirement** — a non-retired open row whose usable window closed before the
  run time is retired in a single Airtable batch (`retired_at` stamped with the
  run time). The window is the same one the offer filter uses: `end_date`, or
  `discount_lock_end_date` for a reusable code, so a redeemed reusable code is
  not retired while its lock is still open. A row without a readable upper
  bound is never retired
- **Un-retirement** — while an open row is upserted, a stored `retired_at` is
  cleared when the dates Adobe now reports leave the code usable again (Adobe
  extending or correcting an end date). Being tied to the upsert, this only
  reverses the sync's own retirements: a closed code soft-deleted through the
  API stays retired
- The review reads the dates the same run just refreshed, runs even when no
  authorization is synchronizable (retiring stale rows needs no Adobe call), and
  only ever touches `source = "API"` rows

Closed codes are authored manually through the discount management API
(`/api/v2/discount-codes`) by vendor or operations accounts. The row records its
author in `source`: an operations account stores `"Operations"`, a vendor
account `"Vendor"` (rows authored before the split carry `"Ops/Vendor"`).
`"Client"` marks a client-sourced closed row, which this API never writes:
client accounts cannot author codes. Every one of these values is a closed code
and the API reports them all as `source = "Closed"`. They
target a specific customer and are not visible to other customers in the
segment. Their `retired_at` is owned by that API's soft delete, never by the
sync.

The discount management API scopes all operations to an agreement (passed as the
`agreement` query parameter), deriving the customer ID and market segment from
the agreement. Client accounts read; vendor and operations accounts also author
and curate closed codes. Open codes are read-only for every account: they belong
to the sync, which rewrites their fields on every run, so update and delete only
accept closed codes.

## Notes

- Adobe credentials (`EXT_ADOBE_CREDENTIALS_FILE`) and authorizations
  (`EXT_ADOBE_AUTHORIZATIONS_FILE`) are JSON files read lazily by
  `backend/mpt_adobe_vipm_ef/settings.py`: `_load_adobe_authorizations()` runs
  through the `ExtensionSettings.adobe_authorizations` `@cached_property`, so the
  files are read on first access (during the first Adobe API request via
  `get_authorization()`), not during `load()`/app startup.
- The Airtable discount store is required for discount code management and is
  configured separately from the optional `mpt-tool` Airtable storage backend.
  When `MPT_TOOL_STORAGE_TYPE=airtable`, both Airtable integrations are active
  but target different bases/tables.
- The discount store is built on demand from settings via
  `DiscountStore.from_settings(settings)`, which fails fast when
  `EXT_AIRTABLE_API_TOKEN` or `EXT_AIRTABLE_DISCOUNTS_ID` is unset.
- All Airtable HTTP calls are bounded by a 60-second timeout (matching the Adobe
  transport timeout) to prevent stalled requests from hanging worker threads.
- The split billing view is served by the subscription sync
  (`POST /subscriptions/{id}/sync`): when the subscription has a `splitStatus`,
  the sync reads it back with `select=split` using the caller's token, so
  allocation selling prices resolve. Allocations are per subscription, so the
  agreement split cannot stand in for them.
- The sync also selects `split.allocations` on the agreement, because the two
  splits answer different questions: the subscription split holds the
  percentages this subscription is billed by, while the agreement split lists
  every buyer configured for split billing, including those with no allocation.
  Order-based billing can target any of them, so the buyer picker is driven by
  the agreement split.
