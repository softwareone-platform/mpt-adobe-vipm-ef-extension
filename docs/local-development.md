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

There are two run modes, and they differ in how the extension is reached:

```bash
make run        # platform integration mode
make run-local  # local Uvicorn mode
```

`make run` registers the extension instance with the Marketplace and then serves
it through an OpenZiti tunnel. **Nothing listens on `http://localhost:8080` in
this mode**, despite the port mapping in `compose.yaml`. Reach the extension
through the portal, not through localhost.

`make run-local` runs the backend under Uvicorn instead, which does serve on
`http://localhost:8080`. It additionally requires a `backend/.env.local` file
(see [Environment Parameters](#environment-parameters)).

`make run scope=all` starts detached, so use `make logs` (or the container's log
view) to follow startup. In platform integration mode a successful start ends
with `listening on ziti service ext-...`.

Useful helper commands:

```bash
make bash
make logs
make down
```

### Only One Instance At A Time

The team shares a single `SDK_EXTENSION_ID`. Every `make run` registers an
additional instance under it — `SDK_EXTENSION_EXTERNAL_ID` defaults to the
container hostname — and the portal may serve any live instance. If two people
run at once, the portal can serve the other person's code, so local changes look
like they have no effect.

Before investigating a change that "does not show up", confirm nobody else is
running `make run`.

### Corporate Certificate Authority

If the container cannot start because of `CERTIFICATE_VERIFY_FAILED` /
`unable to get local issuer certificate`, its trust store is missing the CA that
signs the intercepted connection to `SDK_EXTENSION_URL`. This is common on
managed Windows machines.

Export the SoftwareONE root (and issuing) certificates as Base-64 X.509, combine
them into `backend/swo-ca.crt`, and point the runtime at that file in
`backend/.env`:

```bash
SSL_CERT_FILE=/extension/swo-ca.crt
```

`backend/` is mounted at `/extension` in the container. Note that
`SSL_CERT_FILE` *replaces* the default CA bundle rather than extending it, so if
other hosts then fail verification, append these certificates to a copy of
`certifi/cacert.pem` and point `SSL_CERT_FILE` at the combined file instead.

## Environment Parameters

Local startup reads environment files from `backend/`, consumed by Docker Compose:

- `make run` reads `backend/.env`, which is optional.
- `make run-local` reads `backend/.env` and additionally requires
  `backend/.env.local`; startup fails without it.

The parameter reference lives in [docs/deployment.md](deployment.md). Use that document for:

- required and optional environment variables
- example values
- runtime-specific notes for Marketplace integration, webhook secrets, Airtable, and AppInsights

Do not duplicate the parameter reference in this file.

Adjust startup commands, URLs, and helper commands in this file if the target repository differs from the defaults documented here.
