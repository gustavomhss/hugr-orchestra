# HuGR Maestro V2: Atlas Foundation Seam Register

Status: current-source lift, measured seam subset. Source is vendored Atlas snapshot `foundation/atlas` at source commit
`b319723`. This register is independent from `v1-portability-register.md`: V1 internal `atlas/` proves nothing
about this foundation.

## Current Source Candidates

| Candidate          | Current source contract                                                                                                                                   | Named current tests                                | V2 status                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| Ownership read     | `@atlas/adapter-io/src/compose-runtime.ts`: `own(scope) -> OwnDispatch { tool, pack: OwnPackPlus }`; current store + axes compose bounded ownership state | `packages/retrieval/test/wp-6.20-retr.own.test.ts` | primary candidate for `assemble-context` after Own-first adapter freeze |
| Shared Awareness   | `@atlas/memory/src/awareness.ts`: derived grounded facets; explicit facet `UN-SEEDED`; cap/injection behavior                                             | `packages/memory/test/wp-6.24-a-mem.test.ts`       | candidate for `orient-session`                                          |
| Shared Orientation | `@atlas/memory/src/orient.ts`: derived from DEFINE artifact + event-log fold; no written-memory persistence                                               | `packages/memory/test/wp-6.24-b-mem.test.ts`       | candidate for `orient-session`                                          |
| Runtime exposure   | `packages/adapter-io/src/compose-runtime.ts`, `compose.ts`: `memoryAwareness()` and `memoryOrientation()` reads                                           | package-level runtime tests not yet selected       | candidate only; no OpenCode adapter exists                              |

## Measured State

Build prerequisite completed:

```text
npm ci
npm run build
```

Measured command:

```text
npm test -- --run packages/retrieval/test/wp-6.19-retr.pack.test.ts \
  packages/memory/test/wp-6.24-a-mem.test.ts \
  packages/memory/test/wp-6.24-b-mem.test.ts
```

Result: `3` files, `30` tests passed.

Vite emitted two non-fatal warnings resolving parent Orquestra `@tsconfig/bun/tsconfig.json`; all selected Atlas
tests collected and passed. This proves selected Atlas seams, not an OpenCode adapter or full Atlas runtime.

## Design Consequence

Current Atlas `own(scope)` is the real ownership-state surface. Therefore:

```text
orient-session -> admit-request -> select grounded ownership units -> draft-plan(context PENDING)
               -> plan own_<unit> state reads -> validate-plan
```

An empty/malformed/stale `OwnPackPlus` is not an `UN-SEEDED` declaration. V2 maps it to `HOLD`; pointers and
pull-reachable tail name the only valid depth path: another exact `own(unit)` read.

## Missing Seams

1. Implement OpenCode Session/Task mapping to ratified `ComposedActor` in `actor-identity-contract.md`.
2. Frozen Own-first ContextToolPlan adapter containing only current-proven fields V2 needs.
3. Atlas Own bridge with explicit structural/runtime snapshot identity for PR invalidation.
4. Explicit project-level unseeded declaration distinct from facet-level Awareness `UN-SEEDED`.

## OpenCode Discovery

Current OpenCode source proves `Session.Info.projectID` and selected `agent` exist in
`packages/opencode/src/session/session.ts`. They source `projectId` and future stable Maestro/member mapping.
V2 uses durable direct Session user reply for plan authority, so no external authenticated-principal seam is needed.
Provider `cfg.username` remains model metadata and is never provenance authority.

No Maestro runtime code, direct `foundation/atlas` import, V1 protocol adaptation, or new Atlas write door may
land before these seams have source proof, positive/negative acceptance, and ownership.
