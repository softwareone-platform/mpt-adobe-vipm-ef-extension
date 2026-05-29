# Local Development

This document describes how to run the repository locally in the supported Docker workflow.

## Prerequisites

- Docker with the `docker compose` plugin
- `make`

## Setup

Build the development image and install dependencies:

```bash
make build
```

## Running the Service

Start the service with Docker Compose:

```bash
make run
```

The service is exposed on `http://localhost:8080`.

Useful helper commands:

```bash
make bash
make shell
make down
```

## Environment Parameters

Local startup requires an `.env` file consumed by Docker Compose.

The parameter reference lives in [docs/deployment.md](deployment.md). Use that document for:

- required and optional environment variables
- example values
- runtime-specific notes for Marketplace integration, webhook secrets, Airtable, and AppInsights

Do not duplicate the parameter reference in this file.

Adjust startup commands, URLs, and helper commands in this file if the target repository differs from the defaults documented here.
