# #99 Sound Relation — wave plan (acceptance suite → WPs → merge order)

Feeds off [99-sound-relation-design.md](./99-sound-relation-design.md) (RATIFIED: F1 mechanical,
F2 exhaustive, F3 defer `calls`). Method: `/techlead-decompose` — completeness anchored on a **failing
acceptance suite**, not on the slice.

---

## 1. Acceptance suite (the spine) — every item is RED now, maps 1:1 to a vitest test

Each item names the test that proves it. All are mechanically testable (no `judged` items). The suite
was hardened by an independent cold suite-critic (2026-08-22); the +14 items it forced are marked ⊕.

**Locked design decisions the suite pins** (from the critic pass):

- **D-a** — a `proven depends-on A→B` **supersedes** any pre-existing advisory `A→B` (same `relationKey`
  identity; proven is strictly stronger; existing SUPERSEDE lineage carries it). No silent duplicate,
  no downgrade to advisory.
- **D-b** — N resolved references A→B collapse to **exactly one** `depends-on A→B` relation (identity).
- **D-c** — the projection emits an edge only when both endpoints are **distinct intra-repo units**
  (excludes external/`node_modules` resolved targets and intra-unit references).
- **D-d** — forgery defense is **two layers** (refined by R4 cold-review 2026-08-22): the write door
  strips a **shape**-forged proven relation (witness missing / malformed / non-provable `calls` kind) at
  admission (mirrors the predicate seal guard); but the door has no oracle, so a shape-VALID-but-false
  witness still persists proven there (exactly as a promoted predicate witness does) and is caught at
  **read-side reverify** (WP-R5 / #240), which re-runs the oracle and reads a non-re-derivable witness as
  `broken`/`unverifiable`, never `proven`. Neither layer alone is D-d; the two together are.
- **D-e** — the relation **unit granularity is the document (`docHash = nodeHashOfPath`)**, per the
  `resolved DepEdge` endpoints (measured, seam B). The sound `depends-on` is file→file. Consequence:
  the round-3 "intra-file distinct-unit" case does **not** arise — two symbols in one file share a
  docHash, so they are intra-unit and correctly excluded by AR-16 (which is therefore complete at this
  granularity). A finer (symbol-level) relation would be a separate future family, not this one.

### Soundness / 0-false

| id           | acceptance item                                                                                                                                                                                                           | test home            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **AR-1**     | A resolved `DepEdge A→B` projects to a `depends-on` relation `endpointA=unit(A), endpointB=unit(B)` sealed **`proven`**.                                                                                                  | genesis / adapter-io |
| **AR-3**     | An edge whose target is a `local ` symbol (#189) or whose `to` is `null` yields **no** proven relation.                                                                                                                   | genesis              |
| **AR-5**     | A `calls` relation can never obtain a `proven` seal (only `depends-on` is provable).                                                                                                                                      | genesis              |
| **AR-29 ⊕²** | **Asymmetric-emit soundness**: on a fixture where the index resolves ONLY A→B (no B→A reference), the proven set contains A→B and **no proven B→A** (a fabricated reverse must be absent from the SET, not just a query). | genesis / adapter-io |
| **AR-15 ⊕**  | **External exclusion (D-c)**: a _resolved_ edge to a non-repo symbol (`node_modules`/stdlib) yields **no** proven relation.                                                                                               | genesis / adapter-io |
| **AR-16 ⊕**  | **Cross-unit only (D-c/D-e)**: two distinct symbols resolving to the **same document** (docHash) yield no proven `depends-on` — complete at doc granularity (round-3 intra-file case subsumed here).                      | genesis              |
| **AR-17 ⊕**  | **Named honest boundary**: a reflection/dynamic-dispatch edge and a cross-language edge are each pinned as not-provable (no proven seal), distinct from a generic null target.                                            | genesis / docs       |

### Exhaustive / dedup

| id          | acceptance item                                                                                                                                                                                  | test home  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **AR-2**    | **Exhaustive (upper)**: every `kind:'resolved'` intra-repo `DepEdge` becomes ≤ one proven relation — none dropped, no dup within a run.                                                          | adapter-io |
| **AR-18 ⊕** | **Exhaustive (lower, anti-vacuous)**: on a fixture with a known non-zero resolved-edge set, a **specific expected pair is proven present** — "exhaustive" cannot pass by proving nothing (0==0). | adapter-io |
| **AR-19 ⊕** | **Multi-ref dedup (D-b)**: N resolved references A→B produce a **single** proven `depends-on A→B`.                                                                                               | adapter-io |
| **AR-20 ⊕** | **Idempotent re-derive**: deriving twice over an unchanged index yields the same relation set (no doubled rows; second run no-ops/supersedes).                                                   | adapter-io |

### Identity / collision

| id          | acceptance item                                                                                                                                              | test home  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **AR-4**    | **Directed identity**: `A→B` and `B→A` are distinct; a self-edge `A→A` is refused (`MalformedRelationError`).                                                | knowledge  |
| **AR-21 ⊕** | **Advisory→proven supersede (D-a)**: a proven derive on a pair with an existing advisory `A→B` supersedes it deterministically — no duplicate, no downgrade. | adapter-io |

### Witness / grounding / no-LLM

| id          | acceptance item                                                                                                                                                                                    | test home              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **AR-6**    | **Witness round-trips**: a proven relation carries a re-derivable witness `(endpointA, relationKind, endpointB)`; `claimNorm` derives from the witness, not model prose.                           | knowledge / genesis    |
| **AR-22 ⊕** | **Grounding + freshness**: a proven relation satisfies the 2-entry relation grounding fold (both endpoints grounded) AND carries a freshness anchor tying it to the proven-against index revision. | knowledge / adapter-io |
| **AR-23 ⊕** | **No-LLM (F1)**: the derive path runs with the model adapter absent/stubbed-to-throw and still produces proven relations.                                                                          | adapter-io             |

### Persistence / admission

| id          | acceptance item                                                                                                                                                           | test home  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **AR-7**    | **Door persists the seal**: a sound-minted proven relation's `seal` + witness reach the durable row/CAS (`governed-emit.ts:369` `!== 'relation'` guard lifted correctly). | adapter-io |
| **AR-24 ⊕** | **Admission rejects forgery (D-d)**: the door refuses to admit a `proven`-sealed relation lacking a re-derivable witness — it never reaches the durable row.              | adapter-io |

### Reverify (read-back) / drift = A2

| id          | acceptance item                                                                                                                                                     | test home  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **AR-8**    | **Re-proves**: a stored proven `depends-on` relation re-derives from the current index → `re-proven`.                                                               | adapter-io |
| **AR-9**    | **Drift → broken**: when the edge disappears (incl. the witnessed symbol renamed/moved), the stored proven relation reads **`broken`**, not falsely re-proven.      | adapter-io |
| **AR-25 ⊕** | **Endpoint deletion**: when an endpoint's file/unit is removed, the stored proven `A→B` reads broken/unverifiable — not re-proven, no crash on a dangling endpoint. | adapter-io |
| **AR-10**   | **#240 trap closed**: a `proven`-sealed relation with missing/forged witness or mismatched anchor/tier reads **`unverifiable`** at read — never silently passed.    | adapter-io |

### Read surface

| id          | acceptance item                                                                                                                       | test home |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **AR-11**   | **Read fold carries the seal**: `relationsOf` / `RelationEdge` surfaces the seal.                                                     | knowledge |
| **AR-26 ⊕** | **Reverse query**: querying B returns A as an **inbound** dependent (endpointB queryable), distinct from A's outbound `depends-on B`. | knowledge |
| **AR-12**   | **CLI surfaces it**: `atlas relations <unit>` / `atlas node <addr>` prints the proven seal + witness.                                 | cli       |

### Reachability / e2e / robustness

| id           | acceptance item                                                                                                                                                                                                                                      | test home    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **AR-13**    | **Reachable**: the projection runs through a real shipped entrypoint (not the test injector) and lands proven relations.                                                                                                                             | cli          |
| **AR-14**    | **Black-box e2e**: a subprocess story derives → queries → shows proven `depends-on` relations with a drift contrast.                                                                                                                                 | e2e-blackbox |
| **AR-27 ⊕**  | **Torn-write safety**: concurrent derive + reverify (or two derives) never leaves a half-written proven row without a witness.                                                                                                                       | adapter-io   |
| **AR-28 ⊕**  | **Budget at exhaustive scale**: exhaustive projection over the Atlas fixture stays within a stated row-count/time budget (recorded, not silently unbounded).                                                                                         | adapter-io   |
| **AR-30 ⊕²** | **Budget fail-loud**: if the resolved-edge count exceeds the budget ceiling, the projection **errors / flags the run incomplete** — it never emits a partial set labeled as a complete exhaustive run (else "exhaustive" is unfalsifiable at scale). | adapter-io   |

Baseline: all 30 RED (none exist / pass on master today). The acceptance-gate blocks "done" until every
item goes RED→GREEN, none vacuous (AR-18 is the explicit anti-vacuous teeth), nothing regressed.

---

## 2. WP slicing (owns acceptance ids)

Suite hardened over 3 critic rounds (15 → 2 → convergence check). Slice by **responsibility** (1 owner =
1 WP), files write-disjoint. `R0` is the orchestrator-generated **scaffold/contract-freeze** that
eliminates the shared files (types + barrels) so no builder ever edits a shared file (AP-1 killer).

| WP     | responsibility                                                                                                                                                                                                                                 | owns files (write-disjoint)                                                                                                                                             | owns acceptance ids                                                        | seat    | dep        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------- | ---------- |
| **R0** | **Scaffold / contract freeze** (orchestrator): `RelationWitness` type + `RelationNode.witness` carrier; relation `VerifyReq` variant stub; barrel export lines; empty `relation-derive.ts` with signature.                                     | `knowledge/src/types.ts`, `knowledge/src/index.ts`, `adapter-io/src/index.ts`, `genesis/src/verify-fact.ts` (type only), new `adapter-io/src/relation-derive.ts` (stub) | — (freeze)                                                                 | lead    | —          |
| **R2** | Sound relation **oracle + admit**: `verifyRelation` (reuse `reverseCallers∩scope`, `proven\|abstain`, no refute) + relation dispatch in `verify-fact-source`; relation sound-admit minting `seal:'proven'` + witness + claimNorm-from-witness. | `genesis/src/verify-fact.ts`, `genesis/src/verify-fact-source.ts`, `genesis/src/admit-relation.ts`, `genesis/src/admit-harness.ts` (relation branch)                    | AR-1, AR-3, AR-4, AR-5, AR-6, AR-17                                        | charlie | R0         |
| **R4** | Governed door **persists + rejects** the relation seal: lift `governed-emit.ts:369` `!== 'relation'` guard; relation witness carrier; grounding/freshness; reject witness-less proven at admission (D-d).                                      | `adapter-io/src/governed-emit.ts`, `adapter-io/src/governed-emit-identity.ts`                                                                                           | AR-7, AR-22, AR-24, AR-27                                                  | charlie | R0         |
| **R6** | Read fold + CLI **surface** the seal: `RelationEdge` carries seal; reverse-query direction; `render.ts` prints seal+witness.                                                                                                                   | `knowledge/src/read/relations.ts`, `cli/src/render.ts`                                                                                                                  | AR-11, AR-12, AR-26                                                        | charlie | R0         |
| **R3** | **Mechanical projection** (the heavy one): enumerate `resolved DepEdges` → filter to distinct intra-repo unit pairs (D-c) → dedup (D-b) → admit as proven; idempotent re-derive; supersede advisory (D-a); budget + fail-loud.                 | `adapter-io/src/relation-derive.ts` (fill)                                                                                                                              | AR-2, AR-15, AR-16, AR-18, AR-19, AR-20, AR-21, AR-23, AR-28, AR-29, AR-30 | charlie | R2         |
| **R5** | Read-side **reverify** (#240 close): `fact.kind==='relation'` branch in `reverify-store`; relation `reqOf`/`VerifyReq`; consume R2's oracle leg; relation tamper bindings (both endpoints exist, claim=triple, anchor=endpointA).              | `adapter-io/src/reverify-store.ts`                                                                                                                                      | AR-8, AR-9, AR-10, AR-25                                                   | charlie | R2         |
| **R7** | **Reachability**: shipped entrypoint (`atlas relations --derive` or a mine projection pass) + compose leg wiring R3's projection.                                                                                                              | `cli/src/` (new command), `adapter-io/src/compose.ts`                                                                                                                   | AR-13                                                                      | charlie | R3, R4, R5 |
| **R8** | **e2e + ADR + honesty**: black-box story (derive→query→drift contrast); ADR-0021; honesty-ledger `calls`/dynamic/cross-language non-behaviors.                                                                                                 | `e2e-blackbox/test/s3X-*.blackbox.test.ts`, `docs/adr/ADR-0021-*.md`, honesty ledger                                                                                    | AR-14 (+AR-17 docs)                                                        | charlie | R7, R6     |

Every acceptance id AR-1..AR-30 is owned exactly once (total + disjoint). No orphan WP.

## 3. Conflict map & merge order

- **Writes are disjoint** by construction: R0 owns every shared file (types, both barrels, the derive
  stub, the verify-fact type); after R0 freezes, **no builder edits a shared file**. R2↔R4↔R5 are all
  `adapter-io`/`genesis` but on **different modules** (verify-fact/admit vs governed-emit vs
  reverify-store vs relation-derive) → `CONFLICT_FREE`.
- **Write→read deps are contract-bound** (not conflicts): R3/R5 consume R2's frozen `verifyRelation`
  leg + witness type; R7 consumes R3/R4/R5; R8 reads R6/R7. Frozen at R0 + R2.
- **Waves**: `[R0]` → `[R2, R4, R6]` (parallel) → `[R3, R5]` (parallel) → `[R7]` → `[R8]`.
- **Merge order** (DAG): R0 → R2 → (R4, R6 any order) → (R3, R5 any order) → R7 → R8. Each branch:
  isolated worktree, cold-review (lucy) before merge, `tsc -b` + all 9 harness guards local before push.

## 4. DoD (global, every WP)

`tsc -b` green · the 9 harness guards green **locally before push** (the #196c lesson) · the WP's owned
acceptance ids RED→GREEN via the project runner · no regression · cold-review APPROVE · no gambiarra /
no `#[allow]` / no deferred debt without an owner waiver. Final gate: `acceptance-gate` over all 30 ids
red→green, none vacuous (AR-18 is the anti-vacuous teeth).
