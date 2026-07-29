# Architecture

This document describes the structure, major components, boundaries, and layer
responsibilities of `mpt-adobe-vipm-ef-extension`. For configuration, local
setup, external systems, testing, and migrations, see the documents linked
below.

## Purpose

`mpt-adobe-vipm-ef-extension` is a SoftwareOne Marketplace Platform (MPT)
extension for the Adobe VIP Marketplace. It has a Python backend built on the
MPT Extension SDK and a TypeScript frontend that provides plug UI for
Marketplace screens.

## Repository layout

```text
backend/mpt_adobe_vipm_ef/   extension runtime (routers, flows, settings)
backend/adobe/               Adobe VIPM API client
backend/migrations/          migration files
backend/tests/               backend test suite
frontend/                    TypeScript plug UI (esbuild)
```

## Backend

- `mpt_adobe_vipm_ef/app.py` — the extension app; importing it registers the
  routers below on the SDK app (`ext_app.routes`).
- `mpt_adobe_vipm_ef/routers/` — route definitions:
  - `api/agreements.py`, `api/customer.py`, `api/settings.py` — API routes
  - `api/upgrade.py` — mid-term upgrade order route; restricted to client
    accounts (non-client callers are rejected with `403`)
  - `events/order.py` — order event router (fulfilment)
  - `plugs.py` — plug routes that expose plug metadata to the frontend
- `mpt_adobe_vipm_ef/flows/` — `pipelines/` and `steps/` that execute order
  processing.
- `mpt_adobe_vipm_ef/settings.py` — builds the runtime configuration, including
  the Adobe settings, from environment variables and credential files.
- `mpt_adobe_vipm_ef/context.py`, `models.py` — API context and data models.

## Adobe client

`backend/adobe/` is the Adobe VIP Marketplace API client used by the flows:

- `client.py` — the Adobe client
- `transport.py` — HTTP transport and authentication
- `resources/` — resource-specific operations (e.g. `customer.py`)
- `constants.py`, `dataclasses.py`, `enums.py`, `errors.py` — shared request
  headers, request/response types, and errors

### Scheduled net-new subscriptions

`resources/subscription.py` creates a subscription for a product the customer
does not yet hold. Adobe creates it with `currentQuantity` 0 and status `1009`:
it activates and is invoiced only at the anniversary (coterm) date, which is
left unchanged. `autoRenewal.enabled` is always sent as `true` because Adobe
rejects any other value on creation, `currencyCode` and `deploymentId` are sent
only for global customers ordering outside their home country, and the captured
`x-recommendation-tracker-id` is replayed as a request header so Adobe can
attribute the outcome.

Adobe accepts the creation only between 30 and 3 days before the anniversary
date and only while the customer holds at least one active subscription. The
client does not check either constraint; callers must invoke
`mpt_adobe_vipm_ef/services/renewal.py::require_scheduled_creation_eligibility`
themselves before creating the subscription, so they can show an explanation
rather than an Adobe rejection code.

## Frontend

The `frontend/` package is a TypeScript plug UI bundled with esbuild into
`backend/static/` and surfaced through the backend's plug routes. Components and
hooks are tested with jest. See [contributing.md](contributing.md) and
[local-development.md](local-development.md) for the build and watch commands.

## External integrations

Adobe VIPM API (`backend/adobe/`), the MPT API (via the SDK), and Airtable when
`mpt-tool` Airtable storage is enabled. See
[external-integrations.md](external-integrations.md) for purpose, auth, and
configuration.

## Boundaries

- The Adobe API is reached only through `backend/adobe/`; flows depend on that
  client, not on raw HTTP.
- Configuration is read in `settings.py` from environment variables and the
  Adobe credential/authorization files, not from the environment inside business
  logic.
- The frontend communicates with the backend through plug metadata and the API
  routes; it does not call external systems directly.

## Deployment shape

The container image is built from the multi-stage `Dockerfile` (frontend assets
are built and mounted into the backend's `static/`) and started via the SDK
entrypoint. `compose.yaml` and `compose.local.yaml` provide the local stack. See
[deployment.md](deployment.md) for configuration.

## Related documentation

- [local-development.md](local-development.md) — local setup and run
- [contributing.md](contributing.md) — development workflow and commands
- [testing.md](testing.md) — test strategy and execution
- [deployment.md](deployment.md) — configuration and deployment model
- [external-integrations.md](external-integrations.md) — external systems
- [migrations.md](migrations.md) — migration workflow
