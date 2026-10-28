---
name: atlas-usage
description: How a contributor or agent reads and writes Atlas — the CLI commands and their arguments, ratifying committed knowledge, the Orchestra tools, merging and setup, and what surprises people
---

# Using Atlas

Read Atlas before you change a scope, and write to it only through a door. Each command has a page in `modules/atlas/docs/reference/commands/<command>.md`; check it for flags. Surface and transport: `modules/atlas/docs/reference/atlas-tools.md`. Memory: `modules/atlas/docs/reference/atlas-memory.md`. Identity, owners and rulings: skill `atlas-ownership`. Internals: skill `atlas-maintenance`.

## Read

| Command | Use it to |
|---|---|
| `atlas query <scope> [--by scope\|dependency\|trigger]` | Get the pack for a scope: governing facts, an advisory band and related nodes, flagged `stale` when an anchor drifted |
| `atlas node <addr>` | Fetch one node by its 64-hex content address (not a node key) |
| `atlas relations <unit> [out\|in\|both]` | List a unit's relations |
| `atlas own <scope>` | Get the curated briefing for a crate, module, service or feature. CLI only |
| `atlas memory-recall [--owner <id>] [--kind task\|pr\|project\|logbook] [--task-id <id>] [--pr-id <id>]` | Read memory |
| `atlas doctor archive\|why\|hotset\|reground\|cas\|index` | Inspect the archive, explain a fact, check the hot-set budget, plan a re-ground, check the CAS or the index |

## Write

| Command | Use it to |
|---|---|
| `atlas emit <fact.json> --at <sha> [--replace]` | Write one grounded fact. The citation must re-derive at `<sha>` |
| `atlas link <a> <b> [--retract]` | Assert, or retract, that two nodes name the same fact |
| `atlas memory-emit <entry.json>` | Write a project rule, task, PR or logbook entry. The kind comes from the entry's shape |
| `atlas promote [nodeKey...]` | Ratify staged candidates, including committed knowledge a fresh clone staged. Needs `ATLAS_RATIFY_TOKEN`; T0 rows need more (see `promote.md`) |

The CLI also writes through `decide`, `transition`, `test-vacuity`, `derive-relations`, `hold`, `release`, `propose`, `answer`, `mine`, `migrate-layout`, `territory`, `own-export` and `repair`. Every command can also apply committed knowledge at boot (replay), so even a read may change the local store.

## In Orchestra

- `atlas_context`: `{"action":"catalog"}` lists units; `{"action":"unit","unit":"<exact id>"}` loads one. Only the `archie` seat may use `anchor`.
- `atlas_memory_recall`: returns only your own task and PR memory, never project rules, the logbook or another owner's records.
- `atlas_memory_emit`: the host fills in the owner; the model sends only the entry. A project rule becomes a proposal for the steward, not a rule.

## Merge and setup

- `atlas reconcile <mergeBase> [--accept-reground]` classifies drift since `<mergeBase>`. Exit 2 means semantic drift that needs review. `--accept-reground` only counts the mechanical part as accepted; it re-grounds nothing and never changes the exit code. It does not check that `<mergeBase>` really is the merge-base.
- `atlas init <path>` plans the structural move-in and writes the `.gitignore` rule that keeps the store untracked and the logs tracked.
- `atlas migrate-layout`, at the repository root, moves old single-file logs into the `.atlas/` tree. Land it before other branches append to the old files.

## Things that surprise people

- A write that fails says which gate refused it. Fix the cause; never route around the door.
- With neither `ATLAS_ACTOR` nor `git config user.email` set, every CLI write is denied. With the email set, the email is committed.
- `stale:true` or `emitted:false` is a signal to act on: `guidance.next` names the fix.
- What you commit under `.atlas/` is a claim. A fresh clone applies your knowledge row only if its blob is committed, it carries `seal:'proven'`, you are in its scope under that clone's policy, and it re-proves there. Otherwise run `atlas promote` there.
- `atlas: knowledge replay {...}` on stderr means some committed rows did not apply: `missing` is a blob not committed, `rejected` a torn or misfiled line, `unreadable` a folder Atlas could not read.
