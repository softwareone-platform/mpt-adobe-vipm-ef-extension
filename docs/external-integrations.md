# External Integrations

This document lists the external systems the extension integrates with, their
purpose, and how they authenticate. The full environment-variable reference
lives in [deployment.md](deployment.md); this document is the index and does not
duplicate those tables.

## Integrations

| System | Purpose | Auth | Configuration | Code |
| --- | --- | --- | --- | --- |
| Adobe VIPM API | Adobe VIP Marketplace customer and order operations | OAuth 2.0 (Adobe IMS); credentials and authorizations loaded from mounted JSON files | `EXT_ADOBE_API_BASE_URL`, `EXT_ADOBE_AUTH_ENDPOINT_URL`, `EXT_ADOBE_CREDENTIALS_FILE`, `EXT_ADOBE_AUTHORIZATIONS_FILE` | [`backend/adobe/`](../backend/adobe) |
| SoftwareOne Marketplace (MPT) API | Order events, agreement/customer API, plug metadata | Bearer token (JWT) / extension credentials | `MPT_API_BASE_URL`, `MPT_API_TOKEN`, `MPT_PRODUCTS_IDS`, `SDK_EXTENSION_API_KEY`, `SDK_EXTENSION_ID`, `SDK_EXTENSION_URL` | provided by `mpt-extension-sdk` |
| Airtable (optional) | `mpt-tool` storage backend when enabled | API key | `MPT_TOOL_STORAGE_TYPE`, `MPT_TOOL_STORAGE_AIRTABLE_API_KEY`, `MPT_TOOL_STORAGE_AIRTABLE_BASE_ID`, `MPT_TOOL_STORAGE_AIRTABLE_TABLE_NAME` | `mpt-tool` |

## Notes

- Adobe credentials (`EXT_ADOBE_CREDENTIALS_FILE`) and authorizations
  (`EXT_ADOBE_AUTHORIZATIONS_FILE`) are JSON files read lazily by
  `backend/mpt_adobe_vipm_ef/settings.py`: `_load_adobe_authorizations()` runs
  through the `ExtensionSettings.adobe_authorizations` `@cached_property`, so the
  files are read on first access (during the first Adobe API request via
  `get_authorization()`), not during `load()`/app startup.
- Airtable is only used when `MPT_TOOL_STORAGE_TYPE=airtable`; with the default
  `local` storage the Airtable variables can remain unset.
- The split billing view is served by the subscription sync
  (`POST /subscriptions/{id}/sync`): when the subscription has a `splitStatus`,
  the sync reads it back with `select=split` using the caller's token, so
  allocation selling prices resolve. Allocations are per subscription, so the
  agreement split cannot stand in for them.
