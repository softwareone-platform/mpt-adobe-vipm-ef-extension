# Contributing

This document describes repository-specific contribution rules.

Shared rules live in `mpt-extension-skills/standards` and should not be duplicated here:

- documentation standard: [documentation.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/documentation.md)
- makefile structure: [makefiles.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/makefiles.md)
- commit message rules: [commit-messages.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/commit-messages.md)
- dependency management: [packages-and-dependencies.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/packages-and-dependencies.md)
- extension design guidance: [extensions-best-practices.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/extensions-best-practices.md)
- pull request rules: [pull-requests.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/pull-requests.md)
- Python coding conventions: [python-coding.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/python-coding.md)

Shared operational knowledge also lives there:

- build and validation flow: [knowledge/build-and-checks.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/knowledge/build-and-checks.md)
- common make target meanings: [knowledge/make-targets.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/knowledge/make-targets.md)

## Development Model

The default development environment is Docker-based.

- Use `make build` to build the image and sync dependencies with `uv`.
- Use `make bash` when you need an interactive container session.

If the repository supports a local-only workflow outside Docker, document it explicitly in [docs/local-development.md](local-development.md). Otherwise, treat Docker as the default path.

For service startup and local environment expectations, use [docs/local-development.md](local-development.md).

## Code Changes

Repository-specific expectations:

- Keep production code in the repository's main application modules.
- Keep tests under `tests/`, mirroring the production module structure where practical.
- Prefer small, explicit changes that preserve the repository's intended scope.
- When adding a new extension behavior, update or add tests in the same change.

## Validation Before Review

Follow the shared build-and-checks knowledge for the general validation flow.

Repository-specific command entrypoints before review:

```bash
make check
make test
```

Use `make check-all` when the repository exposes it and you want the combined validation workflow.

See [docs/testing.md](testing.md) for repository-specific testing expectations.

## Documentation Changes

When changing repository docs:

- Update [docs/local-development.md](local-development.md), [docs/deployment.md](deployment.md), [docs/testing.md](testing.md), [docs/migrations.md](migrations.md), or [docs/documentation.md](documentation.md) when the corresponding workflow changes.
- Follow the shared documentation standard for structure and naming.
