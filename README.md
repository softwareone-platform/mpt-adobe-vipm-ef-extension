# MPT Adobe VIPM EF Extension

`mpt-adobe-vipm-ef-extension` is a minimal SoftwareOne Marketplace extension built on top of `mpt-extension-sdk` and `mpt-tool`.

It shows the baseline extension shape, a simple validation API endpoint, an event listener, a small fulfillment pipeline, and the development workflow used by extension repositories in this ecosystem.

## Repository Layout

- `backend/mpt_adobe_vipm_ef/` contains the extension package.
- `backend/tests/` contains the pytest suite.
- `make/*.mk` contains the repository make targets.
- `compose.yaml` defines the local Docker-based development environment.

## Quick Start

Prerequisites:

- Docker with the `docker compose` plugin
- `make`

Recommended setup:

```bash
make build
make test
make run
```

The application runs on `http://localhost:8080`.

## Common Commands

Shared meaning of common make targets is documented in:

- [knowledge/make-targets.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/knowledge/make-targets.md)
- [knowledge/build-and-checks.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/knowledge/build-and-checks.md)

## Scheduled Tasks

The extension runs scheduled tasks for background operations:

- **Open Discount Catalogue Sync** (`/schedules/discounts/open-sync`)
  - Schedule: Daily at midnight UTC (`cron: 0 0 * * *`)
  - Purpose: Synchronizes the open Adobe flexible discount catalogue into the
    Airtable discount store
  - Requirements: `EXT_AIRTABLE_API_TOKEN` and `EXT_AIRTABLE_DISCOUNTS_ID` must
    be configured
  - Behavior: Walks platform catalog authorizations, queries Adobe
    `GET /v3/flex-discounts` for each (authorization, market segment, country)
    triple, and upserts open codes into Airtable. Enrichment fields are left
    untouched for operations to curate.

Scheduled tasks are registered via the SDK's `ScheduleRouter` and can be
monitored through platform task logs. See
[docs/external-integrations.md](docs/external-integrations.md) for sync details.

## Documentation

- [AGENTS.md](AGENTS.md): entry point for AI agents
- [docs/architecture.md](docs/architecture.md): architecture and component descriptions
- [docs/contributing.md](docs/contributing.md): repository-specific development workflow
- [docs/local-development.md](docs/local-development.md): local setup and service startup
- [docs/deployment.md](docs/deployment.md): runtime configuration and deployment-facing settings
- [docs/testing.md](docs/testing.md): testing strategy and commands
- [docs/migrations.md](docs/migrations.md): migration workflow and current constraints
- [docs/documentation.md](docs/documentation.md): repository documentation rules
- [docs/external-integrations.md](docs/external-integrations.md): external system integrations and sync flows

Keep repository-specific workflow details in the documents under [`docs/`](docs/), not in this file.
