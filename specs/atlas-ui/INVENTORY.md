# Atlas UI — inventory of what the code exposes

> Path note: `packages/orchestra` was the V1 monolith and no longer exists (see `docs/architecture/monolith-map.md`). Paths below under `packages/orchestra` are historical; the live code is in `packages/core`, `modules/*` and `apps/cli`.

2026-10-18. Every field below exists in code; the UI may show these and nothing else. Paths are relative to `modules/atlas/packages/` (Atlas) or `packages/orchestra/src/` (Orchestra). "Real store" = the standalone Atlas repository's `.atlas/` used by the mock.

## 1. Envelope and exit codes (every command)

- `Verdict {ok, data?, rejected?, guidance {next, invariant}}` (`tools/src/types.ts:62`). CLI prints `status: ok|rejected|error`, `next:`, `invariant:`, then `reason:` or a `data:` block (`cli/src/render.ts:447`).
- Exit `ok 0 · error 1 · rejected 2` (`cli/src/map.ts:257`). `guidance.next` is a fixed string per tool, not per outcome.
- Store provenance (`adapter-io/src/store-provenance.ts`, `read-access.ts`): `trusted` (normal) · `tracked-provable` (projection or CAS tracked by git: reads serve only sealed facts that re-prove, writes refused) · `tracked-staging` (everything refused `untrusted-store`). Real store: `tracked-provable`, 0 sealed, so 0 served.

## 2. Knowledge reads

| Command | Output (fields) | Real store |
|---|---|---|
| `own <scope>` (CLI only) | `tool`; pack `unit` (role), `invariants[]`, `gotchas[]`, `advisory[]`, `advisoryDropped`, `shape {contents, owner, tier}`, `edges {dependents, dependencies}`, `drill {finer[], refresh.pull, complement.pull}`, `grounding.source tree|manifest|goal`, `tokenEstimate`, `manifest {pointers[{kind,name,digest,pull,hits}], truncated}`, `pullReachable[]` (`retrieval/src/own-model.ts:76`) | computable |
| `query <scope> [--by scope\|dependency\|trigger]` | `pack {territory, axisHash, invariants[], advisory[], advisoryDropped, tokenEstimate, stale}`, `subsumes[{broader,narrower}]`, `sameAs[{a,b}]`; row `{nodeId, tier, claim, freshness FRESH\|DRIFTED\|STALE}` (`contracts/src/pack.ts:32`). `trigger` has no producer. | computable |
| `node <addr>` | whole `GroundedFact`: `kind, id, tier, grounding.entries[{anchor{kind,qualifiedPath,subtreeHash}, path}], freshness, claims, authoring`, advisory: `claimNorm, scope, predicateSlot, obviousness{rank,by}, seal, witness{slot,target,scope,atLeast}`; predicate: `check, status HOLDS\|BROKEN\|NA`; relation/negation/transition/test-vacuity variants (`knowledge/src/types.ts:98`) | yes (advisory only) |
| Projection row `CurrentNode` | `nodeKey, family, contentHash, claims, provenanceByClaim, supersededBy, primaryAnchor, slot, sameAs, sameAsRetracted, scope, tier, derivedAt, endpointA/B, relationKind, unitKey, shaBefore/After, testName, shape, seal, answerRef` (`knowledge/src/write/projection-types.ts:78`) | 8 fields used; no slot, seal, supersededBy, sameAs |
| `relations <unit> [out\|in\|both]` | `{relations[{nodeKey, relationKind depends-on\|calls, endpointA, endpointB, seal}], unit, direction}` | none |
| `negations <scope> [--abstained]` | `negations[{nodeKey, relationKind, target, scope, freshness}]`, `abstentions[{id, relationKind, target, scope, reason, witness}]`; reasons `scope-open, target-not-global, scope-empty, target-unresolvable, escape-open, scope-dynamic` | none |
| `transitions <unit>` | `[{nodeKey, unitKey, shaBefore, shaAfter, authoring TRANSITIONED\|SUPERSEDED, freshness}]` | none |
| `test-vacuities <unit>` | `[{nodeKey, unitKey, testName, shape assertion-only-in-catch\|no-assertion-in-test\|assertion-never-invoked, seal}]` | none |
| `anchors <path>` | `{rev, units[{qualifiedPath, kind file\|dir\|symbol, subtreeHash, path}], holes[{ext, fileCount, reason}]}` | computable |
| `slots` | 13 `{slot, meaning}` (`tools/src/slots.ts:37`) | static |
| `draft <anchor> <slot> <claim>` | `{fact, rev, operation CREATE\|UPDATE, route auto-accept\|full-ratify, requires "ATLAS_RATIFY_TOKEN"}` | — |
| `check` | `{wouldEmit, gates[{gate shape\|truth\|authz\|ratify, pass, reason, remedy}]}` | — |
| `verify-fact <kind> <target> --scope` | `{kind, verdict proven\|refuted\|abstain, reason, oracle, target, scope}` | — |

## 3. Health and diagnostics

| Command | Output | Real store |
|---|---|---|
| `doctor cas` | `{objects, referenced, corrupt[], unreadable[], missing[], orphan, sound}`; referenced = projection's cas list; orphan never makes it unsound | 1,320 objects · 596 referenced · 0 missing · 724 orphan (staging and reasoning) · sound |
| `verify-store` | `{sealedProven, reProven, broken, unverifiable, dangling, rows[{nodeKey, outcome, reason}]}`; exit 2 if any non-re-proven | 0 sealed |
| `doctor why <fact>` | `{fact, class mechanical\|semantic, anchorWas, anchorNow}`; mechanical = the old content still exists elsewhere at HEAD | computable |
| `doctor reground <fact>` | plan `{action reground\|retire, emit}`; proposal only | computable |
| `doctor archive [scope]` | content hashes of the current nodes plus their `supersededBy` chain | 596 |
| `doctor hotset <budget>` | `{size, budget, over}` | — |
| `doctor index` | `{scip absent\|unreadable\|present{documents}, configured[{lang, tool, version, files}], holes[]}`; pinned `scip-typescript 0.4.0`, `scip-python 0.6.6` (`adapter-io/src/scip.ts:203`) | scip present; 820 .ts, 76 .mjs |
| `reconcile <mergeBase> [--accept-reground]` | `{drift[DriftItem], mechanical[], semantic[], regroundedCount, reauthorCount, exitCode}`; accept-reground only counts | computable per base |
| `budget`, `territories` | `servedRecords 0`; `{rows[], threshold 0.3}`; no writer | honest zero |

## 4. Writes and curation

- **emit** `{node, at}` → `{emitted, id, nodeKey, rejected}`. Gates `shape → truth → authz → ratify` (`adapter-io/src/governed-emit-gates.ts:72`); refusal prefixes: `malformed tier|scope|family|relation|grounding`, `canonical-form violation`, `ungrounded`, `unauthorized`, `unauthorized for anchor|target`, `unverifiable target`, `governance-relocation|downgrade`, `unratified`, `closed-slot-violation`, `contended`, `unreadable store`, `untrusted-store`. The routing (DEDUP/CREATE/UPDATE/SUPERSEDE) is never returned; only `draft` previews CREATE/UPDATE.
- **ratify**: `ATLAS_RATIFY_TOKEN`; any non-empty value for T1/T2, literal `billy` for T0. `route` auto-accepts only grounded, low-risk, T2, trusted, uncontested, non-promoted writes. Actor = `ATLAS_ACTOR` or git e-mail.
- **promote** (no args) → `{read, refusal?, candidates, promoted, refused, rows[{nodeKey, settled, id?, rejected?}]}`; printed `promote: P of C staged candidate(s) promoted; R refused` and one line per row. Every row needs a ratify token. Real store: all 64 unpromoted candidates' files changed since mining (`ungrounded` at promote).
- **mine** (env knobs `ATLAS_MINE_SLOT`, `ATLAS_MINE_BUDGET`, `ATLAS_FRONTIER=symbol`, `ATLAS_ENRICH`, `ATLAS_TASK_PROPOSALS`, `ATLAS_MODEL_CONFIG`) → `GenesisReport {seeded, ratified, llmCalls, budgetSpent, resumeToken{lastCompletedRank}, coverage{planned, sites[seeded|abstained|unrecorded|interrupted|unvisited]}}`; printed `genesis: seeded N; ratified N`, `cost: llmCalls N · budgetSpent N`, `coverage: …`, `site: {…}`. No command takes the resume token. Nothing persists a run report.
- **link / retract** `{a, b, retract?}` → `{linked, a, b, retracted}`; refusals `sameAs requires two distinct nodes`, `unauthorized`, `unverifiable endpoint`, `unratified`, `not-linked`, `already-retracted`, `retracted-pair`.
- **derive-relations** → `{resolvedEdgeCount, proven, persisted, refused, rows, overBudget?}` (cap 50,000).
- **transition**, **test-vacuity** producers; **init** → `{territories, blastRadius, t0Candidates}` (names matched against `policy.t0Heuristic.keywords`); **export** → `atlas-okf.json` (CAS only); **import** into an empty target only.
- **History kept:** no write log, no actor, no time. Generations `projection|staging.<g>.json`, head + 3 kept (real: projection 614, staging 2626–2629). Per row: `derivedAt`, `provenanceByClaim`, `supersededBy`, `sameAs`, `seal`, `answerRef`. CAS append-only.

## 5. Memory

- **Kinds** (`memory/src/types.ts`): project `{rule, scope, grounding?, frecency}` · task `{taskId, attempted[], failedWith[], stoppedAt, lesson, ref?}` · pr `{prId, decisions[], reviewOutcomes[], knowledgeDelta: GroundedFact[], ref?}` · logbook (Maestro) `{prId, at, territories[], shipped, decisions, tradeoffs, risks, openThreads, links[]}`.
- **Emit refusals:** `undetermined-kind, template-invalid, kind-conflation, unowned, logbook-unauthorized, store-unavailable, store-partial, logbook-duplicate, over-cap, scanner-unavailable, scanner-blocked`.
- **Header** `TurnHeader {awareness{mission, constitution, terrain, ontology, taste: {content, grounding, state seeded|UN-SEEDED|drifted}}, orientation{goal, last, current, state}, rules[]}`; rendered by Orchestra as `<atlas-header member rules rule-words>` on every provider request of backend, jimmy, archie; degraded forms `rules-partial`, `unavailable`. Not persisted anywhere.
- **Log events** `{id, seq, contentHash, payload}`: no timestamp.

## 6. Orchestra

- **Config** `maestro.atlas {projectID, directory, sourceDirectory?}`; `directory` holds `OWN-SNAPSHOT.json` and `TERRITORY-CATALOG.json` (absent today). Seats with `atlasMemory: true`: backend, jimmy, archie.
- **`atlas_context`**: `catalog` → `{catalogVersion, snapshot, sourceRevision, units[{unit, skillName, graphCoverage, tokenEstimate, complete}], territories[{name, owner, tier, globs}], coverage{state complete|partial, units{returned,total}}}`; `unit` → `{unit, name, content, contentHash, receiptHash, receipt, coverage{graphCoverage, freshness FRESH}}`; `anchor` (Archie, input `{target{kind assignment|work-package, id}, units}`) → `{reference, name, sourceIdentity, sourceRevision, target, units[{unit, contentHash, receiptHash, bodyHash}]}`; held → `{status: held, reason, evidence}`. 50+ hold reasons; 9 carry next-step text, appended to the hold message (`maestro/atlas-source.ts:27`).
- **Receipts** on tool parts: `atlasContext {projectID, sourceIdentity, unit, contentHash, receiptHash, anchor, coverage}`; `atlasMemory {schema, op recall|emit, outcome admitted|refused|unavailable|uncertain|read, binding{projectID, root, memoryOwner, sessionID, callID, assistantMessageID}, ref{contentHash, eventId}, reconciled?, refusal?, store?, refs?}`; `atlasResume {residency admitted|restored, key{logicalResumeID, kind, id}, verdict}` with fold refusals `no-own-fold, record-not-found, foreign-owner, unit-mismatch, store-partial, store-unavailable, ambiguous`. No index: a UI reads them from session message parts.
- **Plans and Relay**: plan grounding `{catalogVersion, snapshot, sourceRevision, sourceIdentityHash, units[]}`; Archie anchors `{reference, target, units[1..8]{unit, contentHash, receiptHash, bodyHash}}`; Relay `knowledge: Reference[]` (≤8), injected as untrusted data; holds `anchor-source-drift`, `plan-grounding-stale`, `WORKFLOW_KNOWLEDGE_*`.
- **Research**: Jimmy's `atlas_context unit` calls become `atlas-own` sources `{sourceIdentity, unit, contentHash, receiptHash}`.
- **Existing app UI**: the Skills chapter marks `.orchestra/skills/own/` skills read-only as governed (`app-shell/src/orchestra/chapters/skills-data.ts:29`); `orchestra-governance-data.ts` shows `ownSource` missing|configured and the catalog/grounding tool results. Nothing reads the Atlas receipts.

## 7. Added in the third pass (2026-10-18)

- **Forward edges:** `own` always returns `edges.dependencies: []`; the index has `reverseClosure` only (`adapter-io/src/own-source.ts:172,221`). Frecency `hits` and `ppr` are 0 on every candidate.
- **`verify-fact` kinds:** dependency, count, definition, negation (relation internally); `refuted` only for negation (`adapter-io/src/verify-fact-source.ts:44,64`).
- **`draft` scope:** the first path segment, a structural default; the policy must grant it (`tools/src/draft.ts:198`).
- **Memory write outcomes:** `admitted` (optionally `reconciled`), `refused`, `unavailable`, `uncertain` (`orch/maestro/atlas-memory.ts:41`, `orch/tool/atlas-memory.ts:115`). Writes need a secret scanner (gitleaks from the backend toolkit, else PATH); none ⇒ `scanner-unavailable`.
- **Memory placement:** one `.atlas/memory.jsonl` per execution worktree, shared by all members, committed with the code. Cap 500 words, counted over every rule the owner ever wrote. A seat recalls only its own task/PR by id.
- **Header degraded forms:** `degraded="rules-partial"` plus a warning line; `degraded="unavailable"` replaces the header (`orch/maestro/atlas-header.ts:46,61`). Only constitution and taste can be seeded; nothing writes mission, terrain, ontology or orientation.
- **Seat tools:** `atlasMemory: true` grants `atlas_context`, `atlas_memory_recall`, `atlas_memory_emit` (backend, jimmy, archie); Archie also `anchor`; Maestro `maestro_catalog_context` (`orch/maestro/roster.ts:107`).
- **Republish preconditions** (`modules/atlas/scripts/materialize-own-snapshot.mjs`): input not under `.atlas`, `sourceRevision` an ancestor of HEAD, every anchor blob equal at the revision and now; writes `OWN-SNAPSHOT.json`, `.orchestra/skills/own/**`, `OWN-COVERAGE.json`. The script calls `exportOwnSnapshot`; nothing builds the reviewed snapshot JSON from the live store, and nothing in Orchestra or the CLI runs it.
- **Archie anchors:** up to 8 units / 128 KiB per reference; Relay checks body hashes before a step (`anchor-source-drift`).
