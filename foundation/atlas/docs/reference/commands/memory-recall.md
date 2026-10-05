# `atlas memory-recall`

**MEM-4b's ONE explicit-consult path** to `task`/`pr`/`logbook` memory (CAMPAIGN-11) — the only general way
those three kinds are ever read back. They never auto-inject on a running turn (`atlas memory-header`
structurally excludes them — `TurnHeader` has no field for them), so this door is the SAME shape the durable
log's own read fold (`recall`, `@atlas/memory`) already is: an EXPLICIT query, never free.

This page describes the **CLI** command `atlas memory-recall`. The MCP tool is `atlas-memory-recall`. It is a
`READ_SURFACE` member (`packages/tools/src/handler.ts`): a planner-shaped read door, no `Tool` token, no
write authority.

## Invocation

```
atlas memory-recall [--owner <memberId>] [--kind task|pr|project|logbook] [--task-id <id>] [--pr-id <id>]
```

- All four flags are optional and independent — pass any subset. `--owner`/`--kind`/`--task-id`/`--pr-id`
  are VALUED flags (`--flag value` or `--flag=value`, `packages/cli/src/parse.ts` `VALUED_FLAGS`).
- **An unqualified call — no flag at all — answers the empty set.** `recall` (`@atlas/memory`) is total and
  refuses to guess: a query with none of the four selectors matches nothing, on purpose (MEM-4b).

## Worked example — a fresh repository

```
$ atlas memory-recall
status: ok
next: no matching records — recall is explicit (MEM-4b): pass at least one of owner/kind/taskId/prId
invariant: MEM-4b: atlas-memory-recall is the ONE handler that returns consultable memory (task/pr/logbook), and ONLY in response to an explicit query — an unqualified query (no owner/kind/taskId/prId selector) answers the empty set, never a throw; task/pr/logbook never auto-inject on a running turn (see atlas-memory-header)
# exit 0
```

A QUALIFIED query over an empty log gets a DIFFERENT, more honest `next:` sentence — not the "pass a
selector" hint (which would be wrong advice: a selector was already passed):

```
$ atlas memory-recall --owner dev@example.com
status: ok
next: no matching records for this query — the durable log holds nothing that matches yet
invariant: MEM-4b: atlas-memory-recall is the ONE handler that returns consultable memory (task/pr/logbook), and ONLY in response to an explicit query — an unqualified query (no owner/kind/taskId/prId selector) answers the empty set, never a throw; task/pr/logbook never auto-inject on a running turn (see atlas-memory-header)
# exit 0
```

With matching records, `next:` reports the measured COUNT: `<n> matching record(s) — task/pr/logbook memory
is never auto-injected […]`.

## Exit codes

| code | meaning                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | the query ran. `next:` distinguishes an unqualified query from a qualified-but-empty one, and reports the matched count either way |
| `1`  | an uncomposed runtime — the composition root failed to stand up, never a throw                                                     |

There is no `2` (rejected) outcome: this door opens no governed token and persists nothing; `recall` itself
never throws (an unrecognised query narrows to `{}` and matches nothing, MEM-4b).

## Authority

`atlas memory-recall` binds `atlas-query` — a READ authority oracle, intercepted before the governed handler
like `atlas doctor`/`atlas node`, reading off the composition root's `memoryRecall` leg. It opens **no**
governed surface and is **not** a `WRITE_PATHS` member. Also exposed over MCP as the `atlas-memory-recall`
tool, driving the SAME shared verdict builder as the CLI.

## Related

- [`memory-header`](./memory-header.md) — the running-turn header this door's three kinds are excluded from.
- [`memory-emit`](./memory-emit.md) — how a `task`/`pr`/`logbook` record reaches the log this door reads.
