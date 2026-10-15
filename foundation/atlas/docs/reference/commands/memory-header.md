# `atlas memory-header`

The composed actor's **running-turn header** (CAMPAIGN-11, MEM-1/4/7) — the SHARED `awareness`/`orientation`
slabs passed through unchanged, plus the seat's OWN `rules`: the top-ranked slice of the actor's `project`
memory, by EFFECTIVE frecency (a stored per-entry score, decayed by the entry's distance from the durable
log's own head — never wall-clock). `task`/`pr`/`logbook` memory is structurally excluded — `TurnHeader` has
no field for them (MEM-4); the only path to them is the explicit [`memory-recall`](./memory-recall.md).

This page describes the **CLI** command `atlas memory-header`. The MCP tool is `atlas-memory-header`. It is a
`READ_SURFACE` member (`packages/tools/src/handler.ts`): a planner-shaped read door, no `Tool` token, no
write authority.

## Invocation

```
atlas memory-header
```

No positional, no flag. The **actor** whose header this is comes from the SAME env/git-config identity every
other governed door reads (`ATLAS_ACTOR`, else `git config user.email`, else `''`) — never a flag.

## Worked example — a fresh repository

```
$ atlas memory-header
status: ok
next: 0 project rule(s) injected this turn — recall task/pr/logbook explicitly with atlas-memory-recall
invariant: MEM-1/4/7: atlas-memory-header is the running-turn header for the composed actor — awareness + orientation pass through unchanged (shared, derived elsewhere), rules is the seat's OWN top project entries by effective frecency; task/pr/logbook are structurally excluded (no field on TurnHeader) — MEM-4
# exit 0
```

A fresh repository holds no `project` rules of its own yet — `next:` reports the measured count (`0`), not
an absent/omitted line. Admitting a `project` rule through [`memory-emit`](./memory-emit.md) and re-running
this command surfaces it here, ranked, the next time this actor's turn starts.

## Exit codes

| code | meaning                                                                            |
| ---- | ---------------------------------------------------------------------------------- |
| `0`  | the header was assembled. `next:` reports the number of `rules` injected this turn |
| `1`  | an uncomposed runtime — the composition root failed to stand up, never a throw     |

There is no `2` (rejected) outcome for this door: it opens no governed token and persists nothing, so there
is no gate for it to fail.

## Relationship to the two derived slabs

`atlas memory-header`'s `awareness`/`orientation` fields are the SAME values
[`memory-awareness`](./memory-awareness.md)/[`memory-orientation`](./memory-orientation.md) return —
assembled over the SAME stores, never a second decision. The three doors differ only in SCOPE: the header is
the per-turn COMPOSITE (shared slabs + the seat's own rules); the other two are each slab ALONE, useful when
only one is needed.

## Authority

`atlas memory-header` binds `atlas-query` — a READ authority oracle (like `atlas doctor`/`atlas node`, it is
intercepted before the governed handler and reads off the composition root's `memoryHeader` leg). It opens
**no** governed surface (`GOVERNANCE_SURFACE` is untouched by it) and is **not** a `WRITE_PATHS` member. It is
also exposed over MCP as the `atlas-memory-header` tool, driving the SAME shared verdict builder as the CLI.

## Related

- [`memory-recall`](./memory-recall.md) — the explicit path to task/pr/logbook memory this header excludes.
- [`memory-emit`](./memory-emit.md) — how a `project` rule reaches the log this header ranks.
- [`memory-awareness`](./memory-awareness.md) / [`memory-orientation`](./memory-orientation.md) — the two
  slabs this header's `awareness`/`orientation` fields pass through unchanged.
