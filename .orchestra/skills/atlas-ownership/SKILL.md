---
name: atlas-ownership
description: Who owns each Atlas surface (the knowledge store, the doors, memory, the committed `.atlas/` tree, the Orchestra tools), the invariants that must not regress, the owner rulings already taken, and the declared limits
---

# Atlas ownership

Atlas is the project's grounded knowledge and memory: facts cited against a revision, held in a local content-addressed store and served through governed doors. Code is `modules/atlas/`; the Orchestra side is `modules/maestro/coordination/src/v2/tools/` and `modules/atlas/boundary/`. Mechanics and traps: skill `atlas-maintenance`. Commands: skill `atlas-usage`.

## Ownership

| Surface | Owner | Rule |
|---|---|---|
| Knowledge model and gates | `modules/atlas/packages/knowledge` | Truth, authorization and ratification gates; fail closed |
| Local store and provenance | `adapter-io/src/store.ts`, `store-provenance.ts` | The CAS and projection stay local and untracked; provenance decides what a tracked store may serve |
| Committed tree and replay | `adapter-io/src/layout.ts`, `knowledge-log.ts`, `knowledge-replay.ts`, `migrate-layout.ts` | The only code that writes or reads `.atlas/members/`, `project/` and `blobs/` |
| Composition | `adapter-io/src/compose.ts`, `wire.ts` | Builds the one logged store every door writes through, and runs replay at boot |
| MCP doors | `modules/atlas/packages/tools/src/handler.ts`, `packages/mcp-server` | `WRITE_PATHS` (`atlas-emit`, `atlas-link`) are the only MCP writers |
| CLI | `modules/atlas/packages/cli` | Has more writers than MCP (see `atlas-usage`); each goes through the same gates |
| Authorization | `.atlas/policy.json` `authz` | Admin-owned, tracked; decides who may write which scope |
| Orchestra tools | `modules/maestro/coordination/src/v2/tools/atlas.ts` (`atlas_context`), `atlas-memory.ts` (`atlas_memory_recall`, `atlas_memory_emit`) | The host binds owner and storage; the model supplies only a unit or an entry |
| Tool grants | `modules/maestro/coordination/src/roster.ts` | Every seat with `atlasMemory` gets all three tools. The `archie` seat also gets the arsenal tools and is the only seat allowed `atlas_context`'s `anchor` action. Maestro may read the `catalog` and `unit` views |
| Bundle for Orchestra | `modules/atlas/boundary` | Generated; rebuilt from the sources, never edited |

## Invariants

- Every write goes through a door. Nothing writes the store, the projection or a committed log by hand.
- The writer's identity comes from the host (`ATLAS_ACTOR`, else `git config user.email`; empty denies every write). A caller never chooses it, and `actorInScope` fails closed.
- A committed knowledge line is a claim, never authority. Replay applies only a `seal:'proven'` fact that re-proves now and whose actor is in scope; everything else waits for ratify. There is no merged-PR check.
- `.atlas/cas/`, `projection*.json` and `staging*.json` stay untracked, and the `store-provenance.ts` tripwire is never loosened.
- Knowledge is ordered by `(at, contentHash)`, never by `seq`. Money is integer `costMicroUsd`.
- Continuity is scrubbed before it is hashed. Re-spawn uses `makeRespawn` plus V2 history.
- Attempt and context files go in the bundle's record commit, written by the host, never by a seat.
- The logbook author stays `orch`.
- `docs/` and these skills stay in the repository; they never go into a seat's `skills` list.

## Owner rulings (do not reopen)

- **Knowledge travels in git** as per-actor outcome logs plus blobs, replayed under the trust rule above. Project memory is per actor.
- **Public repositories travel redacted** (2026-10-28). Rows keep ids, links, model, timings and hashes and drop free text and spend; transcripts and continuity chunks are never committed. Public or private is read from the remote host, never configured.
- **Signed commits are deferred** (2026-10-28). Until they exist, a committed row is a candidate, not a decision.

## Known limits (declared, not bugs)

- Redaction on public repositories is not built: memory rows still carry their bodies, so do not commit memory from a public repository yet.
- Committed memory is served without replay or a folder check.
- A row a commit removes from the projection is not logged, so replay cannot remove it. No door removes a row today.
- A candidate ratify rejected is staged again on the next boot; nothing records the rejection in the logs.
- Atlas vitest is not reachable through `test:ci`; it runs only in test.yml's atlas job.
