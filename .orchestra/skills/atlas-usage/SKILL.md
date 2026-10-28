---
name: atlas-usage
description: How a contributor or agent reads and writes Atlas through its doors — the CLI commands, the Orchestra tools, which tier a seat can reach, and what surprises people
---

# Using Atlas

Read Atlas before you change a scope, and write to it only through a door. Command pages: `modules/atlas/docs/reference/commands/<command>.md`. Surface and transport: `modules/atlas/docs/reference/atlas-tools.md`. Memory: `modules/atlas/docs/reference/atlas-memory.md`. Ownership: skill `atlas-ownership`. Internals: skill `atlas-maintenance`.

## Read

| Command | Use it to |
|---|---|
| `atlas query <scope>` | Get the pack for a scope: governing facts, an advisory band and related nodes, flagged `stale` when an anchor drifted |
| `atlas node <nodeAddr>` | Fetch one node by content address |
| `atlas relate <scope>` | List the related-node set |
| `own_<unit>` | Get the curated briefing for a crate, module, service or feature |
| `atlas memory-recall [--owner] [--kind] [--task-id] [--pr-id]` | Read task, PR or logbook memory. No flag at all returns nothing |
| `atlas doctor archive\|why-broken\|hot-set\|reground` | Inspect the archive, explain a broken fact, check the hot-set budget, plan a re-ground. Read-only |

In Orchestra, a seat reads through `atlas_context` and `atlas_memory_recall` instead of the CLI.

## Write

| Command | Use it to |
|---|---|
| `atlas emit <fact.json> --at <sha> [--replace]` | Write one grounded fact. The citation must re-derive at `<sha>` |
| `atlas link <nodeKeyA> <nodeKeyB> [--retract]` | Assert, or retract, that two nodes name the same fact |
| `atlas memory-emit <entry.json>` | Write a project rule, task, PR or logbook entry. The kind comes from the entry's shape |

In Orchestra, a seat writes memory through `atlas_memory_emit`. The host fills in the owner; the model sends only the entry.

## Merge and setup

- `atlas reconcile <mergeBase>` classifies drift since the merge-base. Exit 2 means semantic drift that needs review; `--accept-reground` re-grounds the mechanical part in one pass.
- `atlas init <path>` does the structural move-in; `atlas migrate-layout` moves old single-file logs into the `.atlas/` tree once.

## Which tier a seat reaches

Push needs nothing: the orchestrator puts the pack in the brief. A seat spawned through the SDK in-process path gets the MCP tools. A Claude Code `.claude/agents` subagent does not get MCP, so it falls back to a file, a relay request, or the CLI (`atlas node <addr>`). Every tier returns the same node.

## Things that surprise people

- A write that fails says which gate refused it. Fix the cause; never route around the door.
- Your identity is `ATLAS_ACTOR`, else `git config user.email`. With neither set, every write is denied.
- `stale:true` or `emitted:false` is a signal to act on: `guidance.next` names the fix.
- What you commit under `.atlas/` is a claim. A fresh clone applies your knowledge row only if it carries `seal:'proven'` and re-proves there; otherwise it waits for ratify.
- On a public repository, do not commit memory with free text yet: redaction is decided but not built.
- Never commit `.atlas/cas/` or `.atlas/projection*.json`. A tracked store turns replay off.
