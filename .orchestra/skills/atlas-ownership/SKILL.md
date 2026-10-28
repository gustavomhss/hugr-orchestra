---
name: atlas-ownership
description: Who owns each Atlas surface (the knowledge store, the doors, memory, the committed `.atlas/` tree, the Orchestra tools), who a writer is, the invariants that must not regress, the owner rulings already taken, and the declared limits
---

# Atlas ownership

Atlas is the project's grounded knowledge and memory: facts cited against a revision, held in a local content-addressed store and served through governed doors. Code is `modules/atlas/`; the Orchestra side is `modules/maestro/coordination/src/v2/` and `modules/atlas/boundary/`. Mechanics and traps: skill `atlas-maintenance`. Commands: skill `atlas-usage`.

## Ownership

| Surface | Owner | Rule |
|---|---|---|
| Knowledge model and gates | `modules/atlas/packages/knowledge` | Truth, authorization and ratification gates; fail closed |
| Local store and provenance | `adapter-io/src/store.ts`, `store-provenance.ts` | The CAS and projection stay local and untracked; provenance decides what a tracked store may serve |
| Committed tree and replay | `adapter-io/src/layout.ts`, `knowledge-log.ts`, `knowledge-replay.ts`, `migrate-layout.ts` | The only code that writes or reads `.atlas/members/`, `project/` and `blobs/` |
| Cards, attempts, transcripts | `adapter-io/src/card-log.ts`, `transcript-blobs.ts` | The only code that writes or reads `.atlas/cards/`; transcripts go to `blobs/` only on a private repository. Called by the host, never a seat |
| Context continuity in git | `adapter-io/src/context-log.ts`, `modules/continuity/src/v2/archive.ts` (`exportTo`, `read`) | The only code that writes or reads `.atlas/members/<seat>/context/`; chunks go to `blobs/` only on a private repository. Exported by the host, never a seat |
| Attempt trailer and PR record | `persist/src/host-adapter.ts` (`Trailer.Attempt`), `adapter-io/src/pr-record.ts` | The commit trailer names card and attempt; the PR body block only points back to the attempt files and drops spend on a public repository. Written by the host, never a seat |
| Repo visibility | `adapter-io/src/repo-visibility.ts` | The one answer to public or private, read from the remote host; any doubt answers public |
| Composition | `adapter-io/src/compose.ts`, `wire.ts` | Builds the one logged store every door writes through, and runs replay at boot |
| MCP doors | `modules/atlas/packages/tools/src/handler.ts`, `packages/mcp-server` | `WRITE_PATHS` is `atlas-emit`, `atlas-link` and `atlas-memory-emit`; only the first two write knowledge. Comments in `promote.ts` and `promote.md` that say two are stale |
| CLI | `modules/atlas/packages/cli` | Has more writers than MCP (skill `atlas-usage`) |
| Authorization | `.atlas/policy.json` `authz` | Admin-owned, tracked; decides who may write which scope |
| Orchestra tools | `v2/tools/atlas.ts` (`atlas_context`), `v2/tools/atlas-memory.ts` (`atlas_memory_recall`, `atlas_memory_emit`), `v2/atlas-source.ts` | The host binds owner and storage; the model supplies only a unit or an entry |
| Tool grants | `modules/maestro/coordination/src/roster.ts` | Every seat with `atlasMemory` gets all three tools. The `archie` seat also gets the arsenal tools and is the only seat allowed `atlas_context`'s `anchor` action. Maestro may read the `catalog` and `unit` views |
| Bundle for Orchestra | `modules/atlas/boundary` | Generated; rebuilt from the sources, never edited |

## Identity

- **Orchestra tools:** the memory owner is the seat id, decided by `v2/atlas-source.ts` `owner()`; the backend seat also reads its legacy owner's records, so its memory spans two folders.
- **CLI and MCP:** `ATLAS_ACTOR`, else `git config user.email`. An empty actor, including `ATLAS_ACTOR=""` set explicitly, denies every write. That identity is committed as the folder name and in each knowledge line, so an email travels with the repository.
- **`atlas migrate-layout`:** an admin one-shot that picks the actor itself (skill `atlas-maintenance`).
- A model never chooses its identity, and `actorInScope` fails closed.

## Invariants

- Every write goes through a door, except replay. Nothing writes the store, the projection or a committed log by hand.
- **Trust rule.** A committed knowledge line is a claim, never authority. Replay applies a row only when its blob is committed, its fact carries `seal:'proven'`, the line's actor is in the row's scope under the local policy, and it re-proves now; every other row is staged for ratify. Actor, scope and seal come from the line itself, so re-proof is the only real check. There is no merged-PR check.
- The durable store stays untracked, and the `store-provenance.ts` tripwire is never loosened.
- Continuity is scrubbed before it is hashed. Re-spawn uses `makeRespawn` plus V2 history.

## Owner rulings (do not reopen)

- **Knowledge travels in git** as per-actor outcome logs plus blobs, replayed under the trust rule. Project memory is per actor.
- **Public repositories travel redacted** (2026-10-28). Rows keep ids, links, model, timings and hashes and drop free text and spend; transcripts and continuity chunks are never committed. Public or private is read from the remote host, never configured.
- **Signed commits are deferred** (2026-10-28). Until they exist, a committed row is a candidate, not a decision.
- **Attempt and context files** (when built) go in the bundle's record commit, written by the host, never by a seat.
- **The logbook author stays `orch`.**

## Known limits (declared, not bugs)

- Redaction on public repositories is built only for card, attempt and context files and transcripts. Memory rows still carry their bodies and CLI identities are emails, so do not commit `.atlas/members/` from a public repository yet.
- Visibility is read only from GitHub; any other host answers public, so its card files travel redacted.
- Committed memory is served as read, without replay.
- A committed context chunk is found by the reading agent's id, so a re-spawn under another seat does not see it; archive list and search read only the local archive.
- A row a commit removes from the projection is not logged, so replay cannot remove it. No door removes a row today.
- A candidate ratify rejected is staged again on the next boot; nothing records the rejection in the logs.
