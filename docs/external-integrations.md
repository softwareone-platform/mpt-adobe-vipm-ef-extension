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
  (`EXT_ADOBE_AUTHORIZATIONS_FILE`) are JSON files read at startup by
  `backend/mpt_adobe_vipm_ef/settings.py`.
- Airtable is only used when `MPT_TOOL_STORAGE_TYPE=airtable`; with the default
  `local` storage the Airtable variables can remain unset.
