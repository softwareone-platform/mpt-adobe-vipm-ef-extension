# Testing

Shared unit-test rules live in [unittests.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/unittests.md). Frontend (UI) tests follow [extensions-ui-testing-best-practices.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/standards/extensions-ui-testing-best-practices.md).

Shared build and target knowledge also applies:

- [knowledge/build-and-checks.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/knowledge/build-and-checks.md)
- [knowledge/make-targets.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/knowledge/make-targets.md)

This file documents only repository-specific testing behavior.

## Test Scope

The app-startup tests verify that the API, event, and plug routers are registered and that agreement plug metadata is generated (see [`backend/tests/test_app.py`](../backend/tests/test_app.py)).

## Commands

Use the repository make targets:

```bash
make test
make check
make check-all
```

Repository command mapping:

- `make test` runs `pytest`
- `make check` runs `ruff format --check`, `ruff check`, `flake8`, `mypy`, and `uv lock --check`
- `make check-all` runs both checks and tests

The CI workflow in [`.github/workflows/pr-build-merge.yml`](../.github/workflows/pr-build-merge.yml) uses the same `make build` and `make check-all` flow.

## Pytest Configuration

Repository-specific test settings come from [`backend/pyproject.toml`](../backend/pyproject.toml):

- tests are discovered under `tests`
- `pythonpath` includes the repository root
- coverage is collected for `mpt_adobe_vipm_ef`
- tests run with `--import-mode=importlib`

## Jest Configuration

Repository-specific test settings come from
[`frontend/jest.config.cjs`](../frontend/jest.config.cjs):

- stylesheet imports resolve to an empty module, because styles carry no
  behavior the unit tests assert
- the SDK's `Icon` resolves to [`frontend/test/iconMock.tsx`](../frontend/test/iconMock.tsx),
  both for direct imports and for the SDK components that pull it in
  internally. The real one fetches its sprite in a promise and sets state when
  it lands, which React reports as an update outside `act(...)` once the test
  has already asserted

## Writing Tests

Repository-specific guidance:

- Use fixtures from [`tests/conftest.py`](../tests/conftest.py) where possible.
- Mock external Marketplace SDK calls rather than calling real services.
- Keep tests focused on the behavior of the extension layer, not on internals of `mpt-extension-sdk` itself.
- Follow the shared unit-test standard for AAA structure, parametrization, mocking rules, deterministic behavior, and coverage expectations.

## When Tests Are Required

Add or update tests when a change modifies:

- API request handling
- event processing
- pipeline step behavior
- command output
- dependency wiring in the extension app

If a change only affects documentation, tests are not required.
