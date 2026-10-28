---
name: atlas-ownership
description: Who owns each Atlas surface (the knowledge store, the doors, memory, the committed `.atlas/` tree, the Orchestra tools), the invariants that must not regress, and the owner rulings already taken
---

# Atlas ownership

Atlas is the project's grounded knowledge and memory: facts cited against a revision, held in a local content-addressed store and served through governed doors. Code is `modules/atlas/` (packages under `modules/atlas/packages/`); the Orchestra side is `modules/maestro/coordination/src/v2/tools/` and `modules/atlas/boundary/`. Design and reference: `modules/atlas/docs/`. How the tree works: skill `atlas-maintenance`. Using it: skill `atlas-usage`.

## Ownership

| Surface | Owner | Rule |
|---|---|---|
| Knowledge model and gates | `modules/atlas/packages/knowledge` | Truth, authorization and ratification gates; fail closed |
| Local store and provenance | `adapter-io/src/store.ts`, `store-provenance.ts` | The CAS and projection stay local and untracked; provenance decides what a tracked store may serve |
| Committed tree and replay | `adapter-io/src/layout.ts`, `knowledge-log.ts`, `knowledge-replay.ts`, `migrate-layout.ts` | The only paths into and out of `.atlas/members/`, `project/` and `blobs/` |
| Doors (CLI and MCP) | `modules/atlas/packages/tools/src/handler.ts`, `packages/cli`, `packages/mcp-server` | `WRITE_PATHS` lists the write doors; every other command is read-only |
| Authorization | `.atlas/policy.json` `authz` | Admin-owned, tracked; decides who may write which scope |
| Orchestra tools | `modules/maestro/coordination/src/v2/tools/atlas.ts` (`atlas_context`), `atlas-memory.ts` (`atlas_memory_recall`, `atlas_memory_emit`) | The host binds owner and storage; the model supplies only a unit or an entry |
| Who gets the tools | `modules/maestro/coordination/src/roster.ts` (`seat.atlasMemory`) | Memory tools only for seats with `atlasMemory`; the `archie` seat also gets `atlas_context` |
| Bundle for Orchestra | `modules/atlas/boundary` | Generated; rebuilt from the sources, never edited |

## Invariants

- Every write goes through a door (`atlas emit`, `atlas link`, `atlas memory-emit`). Nothing writes the store, the projection or a committed log by hand.
- The writer's identity comes from the host (`ATLAS_ACTOR`, else `git config user.email`, else empty, which denies every write). A caller never chooses it, and `actorInScope` fails closed.
- A committed line is a claim, never authority. Replay applies only a `seal:'proven'` fact that re-proves now and whose seat is in scope; everything else waits for ratify. There is no merged-PR check.
- `.atlas/cas/` and `.atlas/projection*.json` / `staging*.json` stay untracked, and the `store-provenance.ts` tripwire is never loosened.
- Order by `(at, contentHash)`, never by `seq`. Money is integer `costMicroUsd`.
- The logbook author stays `orch`. A seat appends only under its own `members/<seat>/` folder.
- `docs/` and these skills stay in the repository; they never go into a seat's `skills` list.

## Owner rulings (do not reopen)

- **Knowledge travels in git** as per-seat outcome logs plus blobs, replayed under the trust rule above.
- **Public repositories travel redacted** (2026-10-28). Rows keep ids, links, model, timings and hashes and drop free text and spend; transcripts and continuity chunks are never committed. Public or private is read from the remote host.
- **Signed commits are deferred** (2026-10-28). Until they exist, a committed row is a candidate, not a decision.

## Known limits (declared, not bugs)

- Redaction on public repositories is decided but not built: memory rows still carry their bodies.
- A removed row is not logged; a candidate ratify rejected is staged again on the next boot.
- Atlas vitest is not reachable through `test:ci`; it runs only in test.yml's atlas job.
