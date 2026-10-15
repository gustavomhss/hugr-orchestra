# `atlas memory-orientation`

The **DERIVED, SHARED, byte-identical Orientation slab** (CAMPAIGN-11, MEM-6) — milestone/state labels about
the RUN, owned by nobody, folded from the tracked orientation log (`.atlas/orientation.jsonl`). It is never a
WRITTEN memory (no `atlas memory-orientation-emit` door exists), so it cannot rot the way a stale, hand-kept
status file does.

This page describes the **CLI** command `atlas memory-orientation`. The MCP tool is
`atlas-memory-orientation`. It is a `READ_SURFACE` member (`packages/tools/src/handler.ts`): a planner-shaped
read door, no `Tool` token, no write authority.

## Invocation

```
atlas memory-orientation
```

No positional, no flag. Like [`memory-awareness`](./memory-awareness.md), this door reads nothing
owner-scoped — the slab is identical for every member.

`goal` is read from an OPAQUE, caller-supplied `define` artifact this door does not accept as an argument —
this repository has no ratified DEFINE artifact (the same absence `genesis/src/seed.ts` states for
`mission`), so `goal` reads empty until one exists. Inventing a file convention for it would be authoring the
artifact rather than reading it.

## Worked example — a fresh repository

```
$ atlas memory-orientation
status: ok
next: the SHARED, derived slab — byte-identical for every member; goal reads empty until a ratified DEFINE artifact exists
invariant: MEM-6: atlas-memory-orientation is the DERIVED, SHARED, byte-identical-across-members Orientation slab — milestone/state labels about the RUN, owned by nobody, folded from the tracked orientation log; never a written memory, so it cannot rot
# exit 0
```

## Exit codes

| code | meaning                                                                                   |
| ---- | ----------------------------------------------------------------------------------------- |
| `0`  | the slab was assembled (an empty/absent tracked log folds to an empty slab, not an error) |
| `1`  | an uncomposed runtime — the composition root failed to stand up, never a throw            |

There is no `2` (rejected) outcome: this door opens no governed token and persists nothing.

## Authority

`atlas memory-orientation` binds `atlas-query` — a READ authority oracle, intercepted before the governed
handler like `atlas doctor`/`atlas node`, reading off the composition root's `memoryOrientation` leg. It opens
**no** governed surface and is **not** a `WRITE_PATHS` member. Also exposed over MCP as the
`atlas-memory-orientation` tool, driving the SAME shared verdict builder as the CLI.

## Related

- [`memory-header`](./memory-header.md) — the per-turn composite this slab feeds unchanged.
- [`memory-awareness`](./memory-awareness.md) — the sibling DERIVED, SHARED slab (taste/constitution, not
  milestone/state).
