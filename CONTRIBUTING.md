# Contributing to HuGR Relay

Relay is at **North Star (v0)**: the [White Paper](WHITEPAPER.md) and [Spec](SPEC.md) define
intended behavior, and the implementation answers to them.

## Ground rules

1. **The Spec is the source of truth.** [`SPEC.md`](SPEC.md) owns the canonical terminology,
   the `sprint.json` schema, the DoD check-type catalog, and the worked example. Do not introduce
   alternative names, fields, or examples in code or docs — change the Spec first, then propagate.
2. **Docs derive from the Spec.** If you change a concept, update `SPEC.md`, then the affected
   docs under `docs/`. Keep the glossary and schema identical across files.
3. **Decisions are evidence-based.** Relay's shape comes from measured behavior (see Spec §10).
   Proposals that change a core decision (single-context, gated advancement, keep-best) should
   come with evidence, not preference.

## Working on the implementation

- Keep the orchestrator thin and the Relay hook generic; behavior is driven by `sprint.json`.
- Prefer **mechanical** DoD checks over `llm` checks; reserve model calls for criteria a script
  cannot decide.
- Preserve the two safety invariants: **bounded retries per WP** and **keep-best** (never ship a
  regressed version of an accepted WP).

## Documentation changes

- Match the existing professional, concise tone.
- Cross-link with relative paths.
- After substantive doc changes, regenerate the hashed index (`docs/INDEX.md`) so integrity hashes
  stay current.
