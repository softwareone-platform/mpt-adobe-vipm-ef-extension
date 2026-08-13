# Migrations

Use this document only for migration details that are specific to the repository.

Shared migration knowledge lives in:

- [knowledge/migrations.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/knowledge/migrations.md)
- [knowledge/make-targets.md](https://github.com/softwareone-platform/mpt-extension-skills/blob/main/knowledge/make-targets.md)

If the repository does not yet have repository-specific migration rules, keep this file short and rely on the shared migration knowledge above.

## What To Add Here

Add repository-specific migration details only when they exist, for example:

- where migration files live
- which migration commands are actually used in this repository
- required execution order or rollout rules
- operational constraints or safety checks
- differences from the shared migration knowledge

## Repository Rules

- Order parameters are defined per order context, so the same `externalId` has
  to be created once per context it is used in. `renewalPayload` exists twice
  for this reason: in the `Change` context
  (`20260805120000_renewal_payload_parameter.py`) and in the `Configuration`
  context (`20260813120000_renewal_payload_config_param.py`). The fulfilment
  extension's `adobeOrderIds` parameter (Purchase/Change/Termination contexts,
  defined in that repository's migrations) gets its `Configuration` twin here
  too (`20260814120000_adobe_order_ids_config_param.py`), because the
  early-renewal pipeline persists the Adobe order id on the configuration
  order.
- A migration that creates a parameter whose `externalId` already exists in
  another context must key its idempotency check on `(context, externalId)`,
  not on the `externalId` alone, or it skips every product that already has the
  other definition.
- Migration file names are linted like any other module, so keep the whole stem
  (timestamp included) at 45 characters or fewer.

## Documentation Rule

When repository-specific migration behavior is introduced or changed, update this document in the same change.
