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
  - `api/discounts.py` — discount code management endpoints (Discount Management
    TDR); CRUD over the Airtable discount data store, scoped to an agreement
    passed as the `agreement` query parameter. Client accounts read; vendor and
    operations accounts also author and curate closed codes. Open codes are
    read-only for every account: they belong to the Adobe synchronization job,
    which rewrites their fields on every run, so update and delete only accept
    closed codes. The listing endpoint doubles as the offer shortlist: when an
    `orderType` is given (the renewal wizard) it also reads the optional per-line
    eligibility parameters — `offerId` (the line's SKU), `ownedOfferIds` (the
    customer's owned SKUs) and `commitment` (`ANNUAL` / `THREE_YC`) — and returns
    only the codes that survive the full eligibility filter; without an
    `orderType` (the discounts tab) it lists every code, redeemed ones included.
  - `api/order_render.py` — `GET /api/v2/orders/{order_id}/render` renders the
    product template a placed order carries, which the wizards' summary steps
    show instead of wording of their own. It proxies the marketplace's own
    render endpoint on the caller's token, so the platform decides who may read
    the order, and decodes the JSON string body that endpoint answers with
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
    Because the `now` path can be ordered more than once, its quoted and
    snapshotted quantities are deltas against Adobe's live `renewedQuantity` —
    what the order still has to renew — an already-covered subscription
    dropping out of the quote and riding the snapshot with a zero delta that
    tells fulfilment to keep it active untouched. Removing a renewed
    subscription from the renewal is the customer taking back an early
    renewal placed by mistake: it rides the snapshot as `renew` off with the
    observed `renewedQuantity` (every snapshot entry carries that baseline),
    which fulfilment executes as a RETURN order of those seats — and since
    such a removal has nothing to quote, a plan whose quotable content is
    empty still previews (as an empty quote) when it carries one. A plan that
    keeps renewing but asks for fewer seats than already renewed is rejected
    on preview and submit alike, since a partial return is not supported.
    `path-state` reports whether a renewal can be planned at all — Adobe takes
    a renewal order and a scheduled net-new subscription only between 30 and 3
    days before the anniversary, and only for a customer holding an active
    subscription — and which path is already established: `lockedPath` is `now`
    once an early renewal has rolled the customer's `cotermDate` past the
    subscriptions' `renewalDate`, and `anniversary` once deferred auto-renewal
    preferences are staged on an active subscription (set to lapse, or to renew
    at a quantity other than the one it holds), since an at-anniversary renewal
    moves no date and bills nothing now. The wizard's first step presents the
    established path as confirmed state and offers no other. The submit route
    repeats that lock check and rejects a plan on the closed-off path, because
    the wizard's gate is a display, not the boundary. `path-state` also
    rejects a non-Active agreement, so the wizard never opens while an order
    is still processing: a plan assembled then would read `renewedQuantity`
    before the in-flight order lands on it and double-count what is left to
    renew.
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
  - `schedules/discounts.py` — scheduled task router for discount
    synchronization; defines the daily open discount catalogue sync task
    (`/schedules/discounts/open-sync`) that runs on a cron schedule (`0 0 * * *`
    daily at midnight UTC)
- `mpt_adobe_vipm_ef/flows/` — `pipelines/` and `steps/` that execute order
  processing.
- `mpt_adobe_vipm_ef/services/` — business logic services:
  - `discounts.py` — Airtable-backed data store for discount code management;
    wraps the Airtable API with discount-specific queries (list, find, create,
    update codes and values, list the open rows and retire them in batches). The extension keeps a local copy of the Adobe
    flexible discount catalogue in an Airtable base with three tables: `Discount
    Codes` (one row per code, open and closed), `Discount Values` (per-country
    amount) and `Discount Redemptions` (one row per code redeemed by a
    customer).
  - `regions.py` — Adobe region metadata: resolves the region of a storefront
    country and the countries of a region from the packaged
    `mpt_adobe_vipm_ef/data/region_country_mapping.json`.
  - `discount_mapping.py` — mapping between Airtable discount rows and the API
    object representation (TDR); handles serialization/deserialization and the
    offer-shortlist eligibility filter. Beyond order type, validity windows and
    enrichment status (codes pending enrichment are never offered), the shortlist
    evaluates each stored prerequisite against the per-line context: the INTRO
    category (offered on net-new lines only), the line's SKU against
    `target_offer_ids`, the customer's owned SKUs against `qualifying_offer_ids`,
    the commitment term against `supports_annual` / `supports_3yc` (a coarse
    match — Adobe's `PREVIEW_RENEWAL` owns the full 3YC logic), and the customer's
    country against the `Discount Values` support matrix. The filter honours the
    asymmetry rule: where a context input is absent or the data is uncertain it
    keeps the code (Adobe's preview is the backstop; over-restrictive hiding is
    not), so absent parameters never hide a code. It also excludes codes the
    customer has already redeemed (once per customer); only single-use codes are
    excluded — a reusable stays offerable within its discount lock window even
    after redemption. The redemption read model exposes the redeeming order
    alongside the redemption timestamp, matching the `Discount Redemptions` rows
    the fulfilment engine writes on confirmed order completion.
  - `discount_sync.py` — scheduled synchronization of the open Adobe flexible
    discount catalogue into the Airtable store; walks platform catalog
    authorizations, derives the storefront country, expands it into the Adobe
    region's countries (each region only once per run), and mirrors the open
    `GET /v3/flex-discounts` listing of every market segment (COM, EDU, GOV).
    Open rows are keyed by `(code, market_segment)` and owned by this sync
    (`source = "API"`); enrichment fields stay untouched for operations to
    curate. Each run ends with an expiry review that retires the open rows out
    of their usable window, while the upsert un-retires a row Adobe reports as
    usable again.
- `mpt_adobe_vipm_ef/settings.py` — builds the runtime configuration, including
  the Adobe settings and Airtable credentials, from environment variables and
  credential files.
- `mpt_adobe_vipm_ef/context.py`, `models.py` — API context and data models.

## Adobe client

`backend/adobe/` is the Adobe VIP Marketplace API client used by the flows and
scheduled synchronization:

- `client.py` — the Adobe client facade composing resource clients
- `transport.py` — HTTP transport and authentication
- `resources/` — resource-specific operations:
  - `customer.py`, `offer.py`, `order.py`, `subscription.py` — core VIPM
    resources
  - `discount.py` — flexible discount catalogue endpoints; exposes
    `list_flex_discounts(authorization_id, market_segment, country)` which
    retrieves the open flexible discounts via `GET /v3/flex-discounts`, walking
    pages until `totalCount` is exhausted (Adobe caps page size at 50 items).
  - `recommendation.py` — recommendation endpoints
- `dataclasses.py`, `enums.py`, `errors.py` — request/response types and errors

## Frontend

The `frontend/` package is a TypeScript plug UI bundled with esbuild into
`backend/static/` and surfaced through the backend's plug routes. Components and
hooks are tested with jest. See [contributing.md](contributing.md) and
[local-development.md](local-development.md) for the build and watch commands.

## Discount synchronization flow

The open Adobe flexible discount catalogue is synchronized daily into the
Airtable discount store via the scheduled task defined in
`routers/schedules/discounts.py`:

1. **Schedule trigger** — the task runs daily at midnight UTC (`cron: 0 0 * * *`)
2. **Authorization collection** — the sync queries the platform's catalog
   authorizations for the extension's products, filtering to those with Adobe
   credentials configured and a valid owner country (derived from the
   authorization owner's address)
3. **Region expansion** — the owner country only selects the Adobe region
   (`services/regions.py`, backed by
   `mpt_adobe_vipm_ef/data/region_country_mapping.json`): the authorization's
   credentials are used to sync every country of that region. The regions
   already expanded are remembered in memory for the run, so a later
   authorization of an already synchronized region is skipped; a country that
   maps to no region is synchronized on its own
4. **Segment iteration** — for each (authorization, country) target, the
   sync walks the three public market segments (COM, EDU, GOV; GOV_LGA has no
   open discounts)
5. **Adobe retrieval** — for each (authorization, segment, country) triple, the
   sync calls `adobe.discount.list_flex_discounts()` which retrieves all open
   discounts via `GET /v3/flex-discounts`, walking pages until exhausted
6. **Airtable upsert** — each discount is upserted into the store:
   - New codes are inserted with `source = "API"` (open),
     `enrichment_status = "PENDING"`, and the attributes Adobe reports (name,
     description, category, start/end dates, target/qualifying offer IDs)
   - Existing open codes are updated with fresh Adobe data; enrichment fields
     (applicable order types, annual/3YC support) are left untouched for
     operations to curate
   - Closed codes (`source = "Operations"` / `"Vendor"` / `"Client"`, or the
     legacy `"Ops/Vendor"`) are never overwritten by the sync
   - Per-country discount values are replaced atomically (one row per country)
   - A stored `retired_at` is cleared when the dates Adobe now reports leave the
     code usable again, bringing a row an earlier expiry review had retired back
     into scope
7. **Expiry review** — once the mirroring is done, the sync reads every
   non-retired open row and stamps `retired_at` with the run time on the ones
   whose usable window has closed, in a single Airtable batch. The window is the
   one the offer filter uses (`end_date`, extended to `discount_lock_end_date`
   for a reusable code), so a reusable code is not retired while its lock is
   still open, and a row without a readable upper bound is never retired. The
   review reads the dates the same run just refreshed and runs even when no
   authorization is synchronizable, since retiring stale rows needs no Adobe call
8. **Error handling** — a failing (authorization, segment) pair is logged and
   skipped so the rest of the catalogue still synchronizes; the task fails at
   the end when any pair could not be synchronized, or when the expiry review
   could not be written
9. **Progress reporting** — the task reports progress as pairs complete, reaching
   100% when all (authorization × segment) pairs are processed

Open codes are keyed by `(code, market_segment)` in the Airtable store and
remain visible to all customers in that segment. Closed codes target a specific
customer and are authored/curated manually through the discount management API;
their `source` records the authoring account type (`"Operations"` or
`"Vendor"`; `"Client"` marks a client-sourced row this API never writes, and
legacy rows carry `"Ops/Vendor"`), and their `retired_at` belongs to that API's
soft delete — the sync never writes it.

## External integrations

Adobe VIPM API (`backend/adobe/`), the MPT API (via the SDK), and Airtable
(for discount storage and optional `mpt-tool` storage). See
[external-integrations.md](external-integrations.md) for purpose, auth, and
configuration.

## Boundaries

- The Adobe API is reached only through `backend/adobe/`; flows and scheduled
  tasks depend on that client, not on raw HTTP.
- The Airtable discount store is accessed through `services/discounts.py`
  (`DiscountStore` class); discount endpoints and sync logic depend on that
  service, not on raw Airtable API calls.
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
