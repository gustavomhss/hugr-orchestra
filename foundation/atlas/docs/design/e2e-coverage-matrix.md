# Atlas E2E — exhaustive black-box coverage matrix (functional-surface method)

> Built via the repo's `functional-surface` (L0–L3 + 6 lenses + closure predicates) + a 3-agent
> exhaustive surface recon. Goal: every user-facing behavior × direction × edge has a black-box (`atlas`
> bin / `atlas-mcp` stdio) test — OR is an explicit, documented non-behavior. `[BB]`=covered by
> e2e-blackbox s1–s5; `[gap]`=works, no BB test; `[FINDING]`=behavior wrong/unreachable → fix-or-document.

## New FINDINGS the enumeration surfaced (beyond coverage) — HISTORICAL RECORD, ALL FIXED

> The 7 findings below (N1–N7) are recorded here as they were **originally surfaced** by the exhaustive
> enumeration, before any fix landed. Every one of them is now resolved — see "Status of the findings"
> immediately after this block for the current, authoritative state (what fixed each, and where). This
> section is kept as the historical trace of what the enumeration found, not as a list of open problems.

- **N1 `--accept-reground` is a NO-OP** — `tools/src/reconcile.ts:84-87` voids the option, `regroundedCount=0` always. The flag does nothing. → fix (wire the reground-accept path) OR document as unimplemented. **[FIXED — see below]**
- **N2 `byDependency` / `byTrigger` unreachable end-to-end** — `RetrievalApi` (`index/src/retrieval.ts:81-89`) is never constructed in `wire.ts`; `atlas query` only does scope resolution. 2 of 3 retrieval modes are dead-to-users (echoes the subsumes-unreachable finding). → wire them OR document scope-only. **[FIXED — see below]**
- **N3 `loadProjection` THROWS on corrupt `projection.json`** — `store.ts:131` `JSON.parse` unwrapped, violating the total-`undefined` contract `get` honors (`store.ts:99`). **Genuine totality bug.** → fix (total-undefined). **[FIXED — see below]**
- **N4 corrupt-but-present SCIP throws** through `composeRuntime` — `scip.ts:43` guards only MISSING; a corrupt `.scip` `deserializeSCIP`-throws. → fix (fail-closed to empty) OR document. **[FIXED — see below]**
- **N5 `--depth` is a DEAD flag** — validated (`parse.ts:100`), read by no leg. → wire OR remove. **[FIXED — removed, see below]**
- **N6 `resolveNode` / `poke` / transport-resolve not user-reachable** — exist as library surface, no CLI/MCP door. → document (likely orchestrator-owned) OR expose. **[FIXED — see below]**
- **N7 tier-ratification NOT composed into the emit door (governance hole)** — the governed emit door (`governed-emit.ts`, `wire.ts:153`) is truth→authz→upsert ONLY; the ratify/fastpath machinery (`knowledge/src/ratify/{ratify,fastpath}.ts`: T0→human+billy, fast-path T2-advisory) is NEVER composed into `atlas emit`. So a T0 fact bypasses the human+billy gate at the actual write door. → fix (compose ratify into the door) OR document (ratification is orchestrator/genesis-owned, upstream of emit). Was the **highest-risk finding at the time it was surfaced. [FIXED — RATIFY gate now composed into `governed-emit.ts`, see below]**

> **SEVERITY AT DISCOVERY: N3 + N4 were BOOT-CRASHERS** — a corrupt `.atlas/projection.json` (`compose.ts:137`) or a corrupt-present `.atlas/index.scip` (`compose.ts:128`) threw through `composeRuntime`, crashing BOTH bins at startup (not just the read path). Total-failure, not a degraded read. Both fixed — see below.

## Status of the findings (N1–N7 + W3-surfaced N8–N14)

- **N1** `--accept-reground` → FIXED (`reconcile.ts:93` counts `mechanical.length`, no phantom write). **N2** byDependency/byTrigger → FIXED (s9: byDependency real via the designed retrieval surface; byTrigger dormant-documented). **N3/N4** boot-crashers → FIXED (total-undefined / fail-closed-empty). **N5** `--depth` → REMOVED. **N6** node/poke → FIXED-read (`atlas node`, s10) + DOC-push (orchestrator-owned). **N7** tier-ratify → FIXED (RATIFY gate composed into `governed-emit.ts`). **N8** walkFileTree → FIXED. **N9** doctor drift class → FIXED.
- **N10 (FIXED)** — reconcile's MECHANICAL arm was path-keyed (re-derive at the SAME qualifiedPath) → unreachable for real drift (always semantic — the self-compare N9 killed for doctor). Now content-addressed via `revIndex.resolveBySubtreeAt` (mirror of N9), + git-drift detection widened for the pure-rename case (narrowed to old-path-GONE only, so an unmoved-but-duplicated fact can't fabricate a phantom move). doctor≡reconcile single-source-of-truth restored. Adapter-io only; frozen `@atlas/tools`/`@atlas/knowledge` untouched. Cold-review caught+reproduced a phantom-move over-emit (bobby) that the correctness pass under-rated — fixed before merge.
- **N11 (FIXED — honest freshness WATERMARK, `fb322bd`)** — owner elected "the SOTA path"; lead determined SOTA = a CQRS materialized-view watermark, NOT a live re-derivation on read (that would break the read/oracle split + put the #73 worktree-contention surface on every query). The projection is stamped at persist with `builtAt`=HEAD (injected `headSha` DI, store stays git-ignorant); a query cheaply compares to live HEAD (`rev-parse`, no worktree) and honestly flags a BEHIND-HEAD read `stale:true`. Conservative on the unknown (no false alarm). The live per-fact oracle stays `reconcile`/`doctor`. ADR: `docs/adr/ADR-0002-freshness-watermark.md`. Teeth: `s15-freshness-watermark.blackbox` (stale flips only when HEAD advances, both doors).
- **N12 (FIXED)** — `atlas query` CLI omitted `tokenEstimate` (only MCP JSON carried it). CLI/MCP parity line added to `render.ts`; s13 asserts both doors.
- **N13 (FIXED)** — `atlas node <addr>` fed a raw external string to the CAS path builder → `../`-traversal to `/dev/zero`/FIFO hung+OOM'd (billy PoC 4.67–8.28GB RSS) AND a symlink re-hashing to the addr was SERVED (integrity escape). Closed: charset gate `^[0-9a-f]{64}$` + `realpathSync` CAS-root sandbox + `statSync` non-regular/oversize reject, all before the read.
- **N14 (FIXED)** — N13's guard was 3 separate path-based syscalls (stat→realpath→read); a concurrent-write attacker could TOCTOU-swap the CAS symlink between check and read. Closed via an atomic fd-based read: `openSync(O_RDONLY|O_NOFOLLOW|O_NONBLOCK)` (final-component symlink → ELOOP miss; FIFO won't block) + `fstatSync(fd)` (reject non-regular/oversize) + `readFileSync(fd)` from the SAME pinned inode. billy re-verified: `/dev/zero`/FIFO/dir all fast misses, the in-CAS-symlink integrity-escape (SERVED pre-N14) now a miss, no exploitable residual. Intermediate-component sandbox (realpath) kept.
- **rev-index EMPTY-on-contention (FIXED — #73)** — `axesAt`'s bare `catch` conflated a transient `git worktree` lock failure with a genuine empty rev → silent-green drift drop. Fixed: classify the caught error (bad-rev signature → fast `EMPTY_AXES`; transient/lock/unclassified → bounded 4-attempt retry with a clock-free `Atomics.wait` backoff) + drop the per-call `git worktree prune` contention amplifier. adapter-io only, `RevIndex` never-throws totality preserved, frozen core untouched. Follow-up (DONE — #74, `fb322bd`): hoisted the classify+backoff to a shared no-shell `run-git.ts` seam; all 6 git call-sites migrated (rev-index keeps its structural fresh-worktree retry, reusing the shared primitives).
- **byDependency multimap (FIXED in review)** — the first byDependency wiring used a 1:1 anchor→contentHash map that dropped all-but-one fact per reachable file (slot-lossy-cast class); caught by lucy cold-review + a 2-facts/file regression before merge. Now a multimap.
- **CI exit-code (checked — NOT a defect)** — `npm test` (`vitest run`) DOES fail-closed on a failing package (probe-verified: `RAW_EXIT_CODE=1`). The apparent "exit 0" during the W3 gate was an artifact of the lead's own `npm test && echo OK || echo FAIL` shell wrapper (the `|| echo` always exits 0), not a product defect. The real lesson stands: never read a gate's pass/fail from a wrapped exit code — cold-check the printed test counts.

> **W3 process note** — every fix round in this wave surfaced a _new_ real defect (staleness, traversal-DoS, multimap-loss, symlink-integrity, the s13/N12 integration collision at the gate). The integration gate caught the s13 collision that all five isolated-green WPs missed — the "isolated-green ≠ integrated-green" law holding once more.

## Coverage matrix — the cells (grouped into remediation waves)

### WAVE-COV-1 — write/read matrix (the core knowledge behaviors) — CLOSED (W3)

| cell                                                                                                               | now                          | note                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| predicate facts: CREATE + SUPERSEDE lineage                                                                        | `[BB]` s11                   | emit predicate → re-emit variant → SUPERSEDE (same nodeKey, new contentHash) → `doctor archive` lists both (append-only)                                                                                                                       |
| check-engine per-op: index-query {exists/absent/has-object}, assertion {child-count/subtree-hash}, unrecognized→NA | `[DOC unit-owned]`           | the evaluator (`knowledge/src/lifecycle/evaluator.ts`) is a LIBRARY — NO CLI/MCP verb renders its verdicts; consumed internally by reconcile's drift re-derivation (which IS BB via s8/s12). Verdicts stay unit-asserted; documented non-door. |
| grounding-kind axis: symbol/file/block/repo/project — gate/drift per kind (only symbol enters nodeKey)             | `[BB]` s12                   | symbol+file covered; symbol-only identity + symbol=mechanical/file=semantic drift proven; block/repo/project fail-closed (fixture builds no such node) via real `atlas emit`                                                                   |
| `query byDependency` / `byTrigger` (was N2)                                                                        | `[BB]` s9                    | byDependency WIRED real through the designed `createRetrieval`/`RetrievalModel` (per-query rebuild); byTrigger = declared-but-**dormant** mode (`triggers:new Map()`, no producer exists) returns honest empty — documented in ADR             |
| pack `stale:true` rendered (a DRIFTED fact)                                                                        | `[BB]` s13 + `[FINDING N11]` | s13 authors a `freshness:'DRIFTED'` fact (the ONLY black-box route); **N11**: query.stale reads STORED freshness verbatim, is NOT a live drift oracle (see findings below)                                                                     |
| pack `tokenEstimate` (~2K budget)                                                                                  | `[BB]` s13 + `[N12 FIXED]`   | tokenEstimate now rendered on BOTH CLI+MCP (N12 parity fix); NO truncation on the query path — the hard ~2K cap lives in the retrieval Packer (`retrieval/src/pack.ts`), a DIFFERENT unit-owned consumer, documented                           |
| `underScope` segment boundary (`sr`⊄`src`)                                                                         | `[BB]` s13                   | segment-wise prefix on the file-path portion; `query sr` excludes `src/…` (not raw startsWith)                                                                                                                                                 |
| `cover` miss → verdict (unknown scope)                                                                             | `[BB]` s13                   | `query nonesuch` → `status: error`/exit 1 (NOT rejected/exit 2), reason `cover: no covering territory`, total (no crash)                                                                                                                       |
| `atlas node <addr>` read door (was N6)                                                                             | `[BB]` s10                   | resolveNode wired via NodeSource over durable CAS; read-only; addr charset-gated + CAS-sandboxed (N13); miss = structured exit 1                                                                                                               |

### WAVE-COV-2 — doctor + reconcile lifecycle

| cell                                                  | now            | action                               |
| ----------------------------------------------------- | -------------- | ------------------------------------ |
| `doctor archive [scope]` (lineage chain)              | `[gap]`        | BB                                   |
| `doctor reground <fact>` (proposal, persists nothing) | `[gap]`        | BB: proposes, `.atlas/cas` unchanged |
| doctor CLI totality (unknown sub / missing arg)       | `[gap]`        | BB: exit≠0 structured                |
| `--accept-reground`                                   | `[FINDING N1]` | fix-or-document + BB                 |
| stale→reground convergence                            | `[gap]`        | BB                                   |

### WAVE-COV-3 — governance (authz / policy / tier-ratify)

| cell                                                           | now            | action                                                        |
| -------------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| authz positive branches (`actorInScope` listed/absent)         | `[gap]`        | BB via scoped policy                                          |
| policy prototype-pollution hardening (`__proto__`)             | `[gap]`        | BB: malicious policy → defaults, no pollution                 |
| tier: T0-keyword flags but never auto-promotes; T0 needs billy | `[FINDING N7]` | ratify NOT composed into emit door — fix-or-document, then BB |
| fastpath auto-accept (grounded∧T2∧advisory) vs full-ratify     | `[FINDING N7]` | same — unreachable at the write door                          |

### WAVE-COV-4 — edge / error / totality

| cell                                       | now                  | action                   |
| ------------------------------------------ | -------------------- | ------------------------ |
| corrupt `projection.json`                  | `[FINDING N3 — bug]` | FIX total-undefined + BB |
| corrupt present SCIP                       | `[FINDING N4]`       | fix-or-document + BB     |
| non-git repo → deny (empty actor)          | `[gap]`              | BB                       |
| empty/fresh repo → files-only, no throw    | `[BB]` s1 partial    | BB explicit              |
| re-init / idempotency                      | `[gap]`              | BB                       |
| unknown tool / malformed args (both doors) | `[BB]` s5 partial    | BB explicit              |
| `--depth`                                  | `[FINDING N5]`       | wire-or-remove           |

### WAVE-COV-5 — transports / memory / mine / provenance — CLOSED (W3)

| cell                                              | now                        | note                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mine` CLI command (abstain-by-design line, exit) | `[BB]` s14                 | default run exits 0, seeds 0, exact `MINE_ABSTAIN_LINE`; no-model⇒abstain, never fabricate                                                                                                                                                                                                         |
| poke transport (push half of N6)                  | `[DOC orchestrator-owned]` | push (poke/pack) is the ORCHESTRATOR's job per `req-tls.md:165-171` (zero-grant, auto at phase boundary); exposing a user `poke` command would contradict that contract → left a library seam (`materializePoke`), documented in ADR. The READ half (resolveNode → `atlas node`) IS exposed (s10). |
| memory per-seat scoping + recall explicit-only    | `[DOC orchestrator-owned]` | the memory-injection/push surface rides the same orchestrator-owned transport as poke; no user door in Atlas layer-0 → in-proc/unit-owned (s07), documented non-door                                                                                                                               |
| hits ledger / decay / door-2                      | `[unit-owned]`             | store/threshold-derived, not observable at a user door; unit-asserted                                                                                                                                                                                                                              |
| provenance/dossier via `doctor why`               | `[BB]` s12/s8              | `doctor why` classifies mechanical/semantic drift (blame-grained provenance) — exercised black-box in s12 + s8                                                                                                                                                                                     |

### WAVE-COV-6 — sound relation proven family (#99, ADR-0021) — CLOSED (WP-R8)

| cell                                                                                                  | now                               | note                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atlas derive-relations` → proven `depends-on` (mechanical projection, no LLM)                        | `[BB]` s37                        | an authorized actor projects every resolved cross-unit edge into a `proven depends-on` relation through the governed emit door; exhaustive (5126 edges over the real 677-doc Atlas index, cold-verified exact), 0-false by construction (derivation IS the proof) |
| `atlas relations <unit>` surfaces the proven seal, both directions                                    | `[BB]` s37 + s30                  | outbound from the subject + inbound to the object, each `[proven]`; directed (util→app finds nothing)                                                                                                                                                             |
| `atlas node <addr>` renders relation seal + `RelationWitness`                                         | `[BB]` s37                        | `seal: proven` + `witness:` (relationKind/target/sourceScope — a `RelationWitness`, not a `PredicateWitness`)                                                                                                                                                     |
| `atlas verify-store` re-proves / drift → `broken` (A2 staleness)                                      | `[BB]` s37                        | a proven relation re-derives from the live index → `re-proven`; when the witnessed reference disappears it reads `broken` ("did NOT re-prove"), never falsely served — contrasted live against a still-fresh edge                                                 |
| **`calls` NOT provable** (documented non-behavior, F3)                                                | `[DOC + BB]` AR-5 / ADR-0021      | the frozen `ScipSymbolRole` is `definition\|reference` — SCIP has NO call-role, so a `calls` relation can never obtain a `proven` seal (it abstains; a later LLM arm may ship it advisory/justified). Pinned by AR-5 + the honesty boundary in ADR-0021           |
| **dynamic-dispatch / reflection / cross-language / FFI edges NOT provable** (documented non-behavior) | `[DOC]` ADR-0021 §honest boundary | these resolve to `unresolved`/`dynamic` edges (`to: null`), so the projection ABSTAINS — never a proven relation. Documented non-behavior, not a silent gap                                                                                                       |
| **`depends-on` proven ONLY at document granularity** (D-e)                                            | `[DOC + BB]` AR-16 / ADR-0021     | the relation unit is the document (`docHash = nodeHashOfPath`); two symbols in one file share a docHash ⇒ intra-unit ⇒ no proven edge (AR-16). A finer symbol-level relation is a separate future family, not this one                                            |
| **no refute** — an absent edge is abstained, never "these do not depend"                              | `[DOC]` ADR-0021                  | abstain ≠ refute; closeable-world absence is the separate #99b negation family                                                                                                                                                                                    |

## Closure predicates (functional-surface gate) — status

- [~] Actor×Goal matrix — actors: human-CLI, agent-MCP, orchestrator-poke, time/git-event (drift). human-CLI + agent-MCP full; **orchestrator-poke column is EMPTY at the user surface (N6 unreachable)** → not [x].
- [x] doctor `hotset <budget>` (size/budget/over) — `[BB]` covered (s4 + harness.smoke); listed for the ledger.
- [~] Every user-goal use case has Extensions enumerated — **done for the covered goals; the `[gap]` cells above ARE the un-interrogated extensions** (this matrix IS that enumeration).
- [x] Every kite decomposes / every fish rolls up — no orphan behavior found.
- [~] Every backbone activity re-walked per persona — CLI + MCP walked; **poke/orchestrator persona = N6 (not user-reachable)**.
- [x] Every event has producer + consumer — drift(git-event)→reconcile/doctor; emit→projection→query.
- [x] Every entity CRUD — fact: Create(emit)/Read(query)/Update(D1)/supersede(archive)/List(query pack); policy: read-only input; projection: internal.
- [~] Loop-until-dry — this pass surfaced N1–N6 + ~24 cells; **a completeness-critic pass is the gate before slicing** (below).

## Plan

5 coverage waves (disjoint story files per area) + the 6 findings folded in (fix-or-document per the same doctrine). Cold-critic THIS matrix for completeness first (nothing missed), then fan out ≤6.
