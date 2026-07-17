# Domain Docs

How engineering skills consume this repository's domain documentation.

## Before exploring

- Read root `CONTEXT.md` when it exists.
- If root `CONTEXT-MAP.md` exists instead, read the contexts relevant to the work.
- Read ADRs in `docs/adr/` that affect the area under consideration.

If these files do not exist, proceed silently. The domain-modeling workflow creates them lazily when terminology or durable decisions are actually resolved.

## Layout

This is a single-context repository:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Vocabulary

Use terms exactly as defined in `CONTEXT.md` in issues, RFCs, architecture proposals, interfaces, and tests. Avoid synonyms explicitly rejected by the glossary.

If a required concept is absent, reconsider whether new terminology is necessary or resolve the gap through domain modeling.

## ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it.
