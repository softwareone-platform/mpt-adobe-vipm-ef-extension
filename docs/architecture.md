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
  - `api/agreement_subscriptions.py` — lists an agreement's live subscriptions
    with their lines; the agreement payload's own lines do not carry the item
    vendor SKU. The lines expand the item's product, terms and audit trail so
    the wizard grids can show the item info card without a second call
  - `api/upgrade.py` — mid-term upgrade order route; restricted to client
    accounts (non-client callers are rejected with `403`)
  - `api/renewal.py` — renewal routes; restricted to client accounts. Every
    plan body carries the `renewalPath` the customer picked on the wizard's
    first step (`anniversary`, the default, or `now` for an early renewal),
    which decides how strictly the plan is validated.
    `auto-renew-support` reports which SKUs can renew at the
    anniversary at all (the hand-curated `auto_renew_supported` column of the
    Airtable SKU mapping), which the wizard uses to route: on the `anniversary`
    path a subscription whose SKU has no support is left out of the renewal
    plan. The `now` path carries that same SKU, since an early renewal places an
    explicit RENEWAL order and never uses those preferences. `3yc-check`
    re-checks that routing and pre-checks the plan against the customer's 3YC
    commitment floors (splitting licenses and consumables through the same SKU
    mapping), `preview` re-checks the routing and quotes the plan through an
    Adobe `PREVIEW_RENEWAL` order (validating the selected flexible discount
    codes and returning the renewal pricing plus each line's now-path
    eligibility); on the `now` path
    the quote also carries the net-new additions, which ride the RENEWAL order
    itself, so Adobe rejects the renew-and-add basket it forbids in one order.
    `path-state` reports whether a renewal can be planned at all — Adobe takes
    a renewal order and a scheduled net-new subscription only between 30 and 3
    days before the anniversary, and only for a customer holding an active
    subscription — and which path is already established: `lockedPath` is `now`
    once an early renewal has rolled the customer's `cotermDate` past the
    subscriptions' `renewalDate`, which the wizard's first step presents as
    confirmed state. The submit route repeats that lock check: an
    at-anniversary plan is rejected once an early renewal has moved the
    anniversary, because the wizard's gate is a display, not the boundary.
    `renewal-state` reports how much of each subscription is already
    early-renewed, whether its SKU can be early-renewed at all, and whether the
    Items step may offer an increase beyond the current quantity, which only a
    fully-renewed line can carry. The
    submit route repeats every gate and creates the
    change order carrying the plan snapshot (the renewal path, renew decisions,
    quantities, discount codes and the recommendation tracker id) on the hidden
    `renewalPayload` order parameter, the discriminator fulfilment reads to pick
    the execution flow. A plan that moves no quantity and adds no net-new
    product cannot be a change order, so it is submitted as a configuration
    order carrying only the AutoRenew-changed subscriptions (the platform
    rejects a subscription whose AutoRenew value does not change, on either
    path); on the `now` path that order also carries the same snapshot on the
    Configuration context's own `renewalPayload` parameter, because an early
    renewal is executed against Adobe whether or not a quantity moved. At the
    anniversary a plan that
    changes nothing at all is rejected upfront (the order would have no
    content); renewing now is itself the change, so the same plan is accepted
    there and becomes a change order whose single line is the catalog's
    `adobe-early-renewal-no-change` placeholder item, with fulfilment executing
    the plan from the snapshot alone
  - `events/order.py` — order event router (fulfilment)
  - `plugs.py` — plug routes that expose plug metadata to the frontend, serving
    only the plugs the `EXT_FEATURES` flags leave enabled (see
    [deployment.md](deployment.md))
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
- `dataclasses.py`, `enums.py`, `errors.py` — request/response types and errors

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
