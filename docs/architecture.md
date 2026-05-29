# Architecture

Keep this document focused on actual architecture decisions for the repository.

If the repository does not yet have stable architectural decisions, keep this file short and avoid speculative descriptions.

## What To Document Here

When architecture details become relevant, document:

- the main runtime components
- repository boundaries and responsibility split
- extension entry points
- data flow between API handlers, event listeners, pipelines, and external services
- any persistence model and migration boundaries
- important design decisions or tradeoffs

## Guidance

- Keep this file minimal until there is real architecture to describe.
- Avoid fictional or speculative architecture.
- Put workflow details in the other topic-specific documents under `docs/`.
- Update this file when the repository gains stable components or non-trivial design rules.
