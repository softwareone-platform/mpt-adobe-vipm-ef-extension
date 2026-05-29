# Deployment

This document describes runtime configuration.

It is the source of truth for environment parameters referenced by local development and deployment flows.

## Configuration Source

The repository runtime expects environment variables, typically provided through `.env` for local Docker Compose usage.

Local setup instructions live in [docs/local-development.md](local-development.md).

## Core Application Settings

| Environment Variable | Default | Example | Description |
| --- | --- | --- | --- |
| `EXT_WEBHOOKS_SECRETS` | - | `{"PRD-1111-1111": "123qweasd3432234"}` | Webhook secret keyed by Marketplace product id |
| `MPT_API_BASE_URL` | `http://localhost:8000` | `https://api.platform.softwareone.com` | SoftwareOne Marketplace API URL |
| `MPT_API_TOKEN` | - | `eyJhbGciOiJSUzI1N...` | SoftwareOne Marketplace API token |
| `MPT_INITIALIZER` | - | `<package>.initializer.initialize` | Optional initializer function |
| `MPT_KEY_VAULT_NAME` | `mpt-key-vault` | `<key-vault-name>` | Key Vault name |
| `MPT_PRODUCTS_IDS` | `PRD-1111-1111` | `PRD-1234-1234,PRD-4321-4321` | Comma-separated list of Marketplace product ids |
| `MPT_PORTAL_BASE_URL` | `http://localhost:8000` | `https://portal.softwareone.com` | SoftwareOne Marketplace Portal URL |
| `MPT_TOOL_STORAGE_TYPE` | `local` | `airtable` | Storage type for MPT tools |
| `MPT_TOOL_STORAGE_AIRTABLE_API_KEY` | - | `patXXXXXXXXXXXXXX` | Airtable API key when Airtable storage is enabled |
| `MPT_TOOL_STORAGE_AIRTABLE_BASE_ID` | - | `appXXXXXXXXXXXXXX` | Airtable base id when Airtable storage is enabled |
| `MPT_TOOL_STORAGE_AIRTABLE_TABLE_NAME` | - | `MigrationTracking` | Airtable table name when Airtable storage is enabled |
| `MPT_ORDERS_API_POLLING_INTERVAL_SECS` | `120` | `60` | Order polling interval in seconds |

## AppInsights Settings

`APPLICATIONINSIGHTS_CONNECTION_STRING` and `OTEL_SERVICE_NAME` are optional for local development unless local telemetry is explicitly enabled. In production or telemetry-enabled environments, set both variables together.

| Environment Variable | Default | Example | Description |
| --- | --- | --- | --- |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | - | `InstrumentationKey=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx;IngestionEndpoint=https://westeurope-1.in.applicationinsights.azure.com/;LiveEndpoint=https://westeurope.livediagnostics.monitor.azure.com/` | Azure Application Insights connection string |
| `OTEL_SERVICE_NAME` | - | `Swo.Extensions.<ServiceName>` | Service name shown in telemetry |

## Local Example

Example `.env` snippet:

```env
EXT_WEBHOOKS_SECRETS={"PRD-1111-1111": "<webhook-secret-for-product>", "PRD-2222-2222": "<webhook-secret-for-product>"}
MPT_API_BASE_URL=https://api.s1.show
MPT_API_TOKEN=c0fdafd7-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MPT_INITIALIZER="<package>.initializer.initialize"
MPT_KEY_VAULT_NAME=""
MPT_ORDERS_API_POLLING_INTERVAL_SECS=120
MPT_PORTAL_BASE_URL=https://portal.s1.show
MPT_PRODUCTS_IDS=PRD-1111-1111,PRD-2222-2222
MPT_TOOL_STORAGE_TYPE=local
MPT_TOOL_STORAGE_AIRTABLE_API_KEY=<airtable-api-key>
MPT_TOOL_STORAGE_AIRTABLE_BASE_ID=<airtable-base-id>
MPT_TOOL_STORAGE_AIRTABLE_TABLE_NAME=<airtable-table-name>
```

`MPT_PRODUCTS_IDS` is a comma-separated list of Marketplace product identifiers.

For each product id in `MPT_PRODUCTS_IDS`, define the corresponding secret in `EXT_WEBHOOKS_SECRETS` using the product id as the key.

The `MPT_TOOL_STORAGE_*` variables mirror the storage configuration documented in `mpt-tool`. When `MPT_TOOL_STORAGE_TYPE=local`, the Airtable variables may remain unset locally. When `MPT_TOOL_STORAGE_TYPE=airtable`, set `MPT_TOOL_STORAGE_AIRTABLE_API_KEY`, `MPT_TOOL_STORAGE_AIRTABLE_BASE_ID`, and `MPT_TOOL_STORAGE_AIRTABLE_TABLE_NAME` together.

Adjust examples in this file to match the actual package names, service names, endpoints, and integrations used by the target repository.
