---
name: maestro-orchestra-tools-atlas
description: What Atlas is, how `atlas_context` reads verified ownership knowledge (catalog and unit), when it holds instead of answering, and how Own snapshots, facts, drift and memory fit together.
internal: true
when: Before routing or reviewing a change in an area you do not know, when the owner asks what Atlas is or why atlas_context holds, or when a fact or briefing may be stale.
not-when: The question is about code behavior you can read directly, or about this session's own history (use context recall).
covers: [modules/atlas]
---

# Atlas

Atlas is Orchestra's knowledge layer for a codebase: short facts pinned to the code they describe, checked for drift, kept in git. No embeddings, no vector store, no server of its own. It answers "what is true about this code, and is it still true?" deterministically.

## What you can call

| Tool | Who | Does |
|---|---|---|
| `atlas_context` `{"action":"catalog"}` | Maestro and the seats that carry Atlas Memory | Bounded metadata of the verified Own catalog: units (name, skill name, graph coverage, token estimate, complete flag) and territories (name, owner, tier, globs). No bodies. |
| `atlas_context` `{"action":"unit","unit":"<exact id>"}` | same | The complete, fresh, verified briefing of one unit. The id is exact; there is no nearest-name match and no owner or root argument. |
| `atlas_context` `{"action":"anchor", ...}` | `archie` only | Binds up to 8 verified units to proposed work (`target` kind `assignment` or `work-package`). Not an approval and not a promotion of knowledge. |
| `atlas_memory_recall`, `atlas_memory_emit` | seats whose definition carries Atlas Memory: `backend`, `jimmy`, `archie`, `live` | Read and write the seat's own memory. Hidden from every other agent; each call re-checks the caller. Maestro does not hold them. |

Load units one at a time: start with `catalog`, then load only the unit that covers the area at hand. Each call returns a receipt (project, source identity, unit, content hash, coverage).

## When it holds

`atlas_context` never claims absence on a failure. It returns a hold with a reason, and a hold blocks only claims that depend on the missing context. Common reasons (modules/maestro/coordination/src/v2/atlas-source.ts):

| Reason | Cause |
|---|---|
| `provider-unconfigured` | The project config has no `maestro.atlas` block (`projectID`, `directory`, optional `sourceDirectory`). Atlas context exists only for projects that configure it and ship `TERRITORY-CATALOG.json` and `OWN-SNAPSHOT.json` in that directory. |
| `provider-project-mismatch` | The configured `projectID` is not this session's project. |
| `source-revision-not-ancestor` | The snapshot was built from a revision that is not an ancestor of HEAD. |
| `repository-unavailable`, `repository-head-invalid` | Not a git repository or HEAD unreadable. |
| `static-data-changed-during-read`, `source-changed-during-read`, `provider-changed-during-read` | Files or config moved during the read; retry. |
| `context-empty`, `catalog-json-invalid`, `path-*` | Empty, malformed or path-escaping inputs. |

A hold is a fact about the environment, not "no owner". Say what is missing; do not guess ownership from names.

## Model

| Part | What it is |
|---|---|
| Structural index | A BLAKE3 Merkle index hashes every unit (file, module, package); retrieval by scope, dependency blast radius and trigger. |
| Facts | Templated claims (advisory, predicate, relation, negation, transition, test-vacuity) pinned to the hash of the subtree they describe, in tiers; the top tier needs human ratification. |
| Drift | A fact is FRESH, DRIFTED, STALE or BROKEN as the code changes. Mechanical drift is re-grounded; a meaning flip makes `atlas reconcile` exit `2` and blocks the merge until someone decides. |
| Write doors | Facts enter only through `atlas emit` (grounded facts) or `atlas link` (sameAs edges); memory through `atlas memory-emit`. Reads carry no write authority. |
| Own snapshot | `OWN-SNAPSHOT.json` plus generated briefing skills with a receipt of the facts and file blobs they were built from. Refresh with `atlas own-export` then `atlas repair`, or the materialize script, after changing anchored source. |
| Memory | Per seat, scoped, decays by non-use: project rules (a short set injected each turn), task memory, pull request memory, logbook. Knowledge is shared and project-level; memory is per seat. |

On disk it is append-only files under `.atlas/` (policy, project, `members/<seat>/memory|knowledge|context`, `cards/<CARD>/`, content-addressed `blobs/`), merged with `merge=union`. Only logs travel in git; the working store and code index are local caches, and a fresh clone rebuilds its projection by replay (proven facts are re-proven, everything else returns as a candidate held for ratification). In public repositories card messages, decisions and continuity chunks keep only hashes.

## Cost record

Every attempt at a card is metered into `.atlas/cards/<CARD>/attempts/a<n>.jsonl` (seat, session, engine and model, tokens, tool calls, wall time, reworks, gates, verdict, `costMicroUsd`, transcript hash). The merge queue commits `chore(queue): record <label>`. An engine that reports no usage shows "not metered", never zero. Budgets warn at 80%, ask at 90%, pause at 100%.

## CI

`atlas-guard.yml` runs the Own snapshot guard on PRs that touch Own-anchored files; `atlas-worklist.yml` writes the stale-Own worklist on pushes to `dev`. Stale briefings are repaired with `atlas repair --worklist`.

## `modules/atlas`
The Atlas workspace: its own npm workspace (Node 20+) that never depends on Orchestra code. Layered packages (contracts, kernel, persist, index, grounding, knowledge, retrieval, memory, tools, genesis, adapter-io), the `atlas` CLI (44 commands; exit codes 0 ok, 1 usage, 2 governed refusal) and a stdio MCP server (18 tools). Orchestra consumes it only through the generated `@orchestra/atlas-boundary` bundles in modules/atlas/boundary. The CLI is not on `PATH` after a workspace install; it must be built first.
