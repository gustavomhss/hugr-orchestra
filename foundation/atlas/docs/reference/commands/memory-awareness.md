# `atlas memory-awareness`

The **SHARED, byte-identical Awareness slab** (CAMPAIGN-11, MEM-11/12) — assembled fresh from the REAL Atlas
root each read: `taste` from `CONVENTIONS.md@sha` (a real file read, content-hashed) and `constitution` from
the T0-tier rows of the persisted knowledge projection (`.atlas/cas`), both grounded off real bytes on disk.
`mission`/`terrain`/`ontology` render **UN-SEEDED** when no ratified source exists yet — never fabricated.

This page describes the **CLI** command `atlas memory-awareness`. The MCP tool is `atlas-memory-awareness`.
It is a `READ_SURFACE` member (`packages/tools/src/handler.ts`): a planner-shaped read door, no `Tool` token,
no write authority.

## Invocation

```
atlas memory-awareness
```

No positional, no flag. Unlike [`memory-header`](./memory-header.md)/[`memory-recall`](./memory-recall.md),
this door reads NOTHING owner-scoped — the slab is identical for every seat reading the same repo state
(MEM-11/12's whole point), so there is no actor to resolve.

## Worked example — a fresh repository

```
$ atlas memory-awareness
status: ok
next: the SHARED slab — byte-identical for every seat reading the same repo state; UN-SEEDED facets have no ratified source yet
invariant: MEM-11/12: atlas-memory-awareness is the SHARED, byte-identical-across-members Awareness slab — assembled fresh from the real Atlas root each read (taste + constitution from real bytes on disk; mission/terrain/ontology render UN-SEEDED when no ratified source exists — never fabricated)
# exit 0
```

A fresh repository has no `CONVENTIONS.md` and no persisted T0 knowledge row yet, so both real-source facets
(`taste`, `constitution`) render UN-SEEDED alongside the three that have no source at all — this door does
not distinguish "no file yet" from "no ratified constitution row yet" in its guidance line; both are the
honest absence `rollup` (`@atlas/memory`) renders, never a fabricated value.

## Exit codes

| code | meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| `0`  | the slab was assembled (an UN-SEEDED facet is a legitimate answer, not an error) |
| `1`  | an uncomposed runtime — the composition root failed to stand up, never a throw   |

There is no `2` (rejected) outcome: this door opens no governed token and persists nothing.

## Authority

`atlas memory-awareness` binds `atlas-query` — a READ authority oracle, intercepted before the governed
handler like `atlas doctor`/`atlas node`, reading off the composition root's `memoryAwareness` leg. It opens
**no** governed surface and is **not** a `WRITE_PATHS` member. Also exposed over MCP as the
`atlas-memory-awareness` tool, driving the SAME shared verdict builder as the CLI.

## Related

- [`memory-header`](./memory-header.md) — the per-turn composite this slab feeds unchanged.
- [`memory-orientation`](./memory-orientation.md) — the sibling DERIVED, SHARED slab (milestone/state, not
  taste/constitution).
