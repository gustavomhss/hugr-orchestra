# WP-FIX-CONCURRENCY — a genesis pass spends its model calls concurrently, and no one can tell

**Task:** #158 (owner-approved 2026-08-02 — by CONCURRENCY, explicitly not by prompt-packing)
**Status:** implemented
**Touches:** `packages/genesis/src/drive.ts` (new), `packages/genesis/src/run-controller.ts`,
`packages/genesis/src/types.ts`, `packages/cli/src/mine.ts`, `packages/cli/src/mine-pool.ts` (new),
`packages/cli/src/mine-worker.ts` (new)

---

## The problem

A genesis pass costs ~18s per site, one model call each, strictly sequential. A 200-site run took 54
minutes. Cost and wall-clock are the axis this product loses on.

## The contract — determinism, not speed

> The report of a concurrent run MUST be byte-identical to the report of the same run executed
> sequentially — same seeded facts in the same order, same `budgetSpent`, same `llmCalls`, same coverage
> ledger, same resume token.

Sites complete out of order; nothing downstream may see it. Concurrency is an execution detail.

**One field is exempt, and the exemption is the honest half of the contract:** `modelCalls` — see
REQ-GEN-CONC-5.

---

## Requirements

**REQ-GEN-CONC-1 — concurrency enters through exactly one seam**

`ControllerDeps.visitAll?(cands): VisitAttempt[]` is the ONLY port through which work may overlap. It is
handed up to `POOL_WIDTH` candidates in ascending rank order and MUST return one attempt per candidate,
positionally aligned, and MUST NOT throw. Absent ⇒ the pre-change sequential drive, unchanged.

`POOL_WIDTH = 8`, a named constant beside `CEILING_CAP`. Not a CLI flag: a knob would make concurrency
observable. 8 because the work is network-bound — it buys wall-clock without a rate-limit story, where a
wider pool risks provider throttling, which reaches an operator as a product bug.

**REQ-GEN-CONC-2 — the report is invariant under scheduling**

The byte-identity contract above, stated normatively. Its mechanism is REQ-GEN-CONC-3.

**REQ-GEN-CONC-3 — the resume cursor is a contiguous prefix (the fold is by rank)**

`drive` walks each batch in ascending rank and stops at the first non-`ok`. Therefore
`lastCompletedRank` is the highest rank R such that EVERY rank ≤ R completed — the contiguous prefix,
never the highest rank that happened to finish. This is a structural consequence of folding in order and
breaking, not a maximum computed over arrivals: no arrival-ordered state exists for a resume to step
over, so a resume cannot open a hole.

The FIRST fault BY RANK is the reported one — never the first by wall-clock, which under a pool is an
arbitrary choice among several and would make the reported cause of a failed run depend on scheduling.

**REQ-GEN-CONC-4 — the ceiling is never overshot (clipped before dispatch, not checked after)**

Batch width is `min(POOL_WIDTH, ceiling − budgetSpent, remaining)`. The pass therefore cannot overshoot
the operator's spend cap by even one call. The obvious alternative — dispatch a full batch, stop once
the counter trips — overshoots by up to 7, and a cap exceeded silently is not a cap.

**REQ-GEN-CONC-6 — durable writes stay serialized**

`upsert` is called from the drive loop and only from the drive loop, one site at a time, in rank order.
The pool never touches the store. Concurrency buys the model calls, which is where the 18s/site lives,
and buys nothing near the sidecar, which is where a lost update would live (task #108 is that door and
this WP leaves it exactly as it found it).

_Measured on the real binary:_ the sidecar published generations 197→200 sequentially and 397→400 under
the pool — one publish per site on both paths, i.e. the write cadence is unchanged.

**REQ-GEN-CONC-5 — the report states what was PAID FOR, separately from what was USED**

`GenesisReport.modelCalls` = model calls ISSUED, including those whose results were discarded.
`llmCalls` keeps its existing meaning: sites whose result was USED. `modelCalls − llmCalls` is the
discarded count. Both are always present; `modelCalls` is emitted on every path INCLUDING ZERO, because
a field that appears only when non-zero reads as "this never happens".

**Why they must be allowed to differ.** When a site faults, its higher-ranked batch-mates have already
been called. Those calls are discarded — not counted in `llmCalls`, producing no ledger row, which is
what keeps the report byte-identical — but they were really made and really billed. So an interrupted
concurrent run genuinely costs more than an interrupted sequential one, by up to `POOL_WIDTH − 1` calls.
A `modelCalls` that agreed across the two would be a false claim about money, on the exact axis this
product is trying to win. Byte-identity therefore binds every field describing the repository or the
run's progress; `modelCalls` describes spend and is required to differ when spend differed. On a run
with no fault the two are identical anyway.

This also fixes a pre-existing understatement: a _sequential_ run already discarded its own faulting
call without counting it.

---

## Scenarios

| id             | scenario                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCN-GEN-CONC-1 | 37 sites (ragged final batch): concurrent report is byte-identical to sequential, and `modelCalls == llmCalls == 37`                                                          |
| SCN-GEN-CONC-2 | **TEETH** — a pool that lets ARRIVAL order leak into its returned array makes the identity assertion FAIL, and the seeded facts come back in a different order                |
| SCN-GEN-CONC-3 | ceiling 22 over 30 sites (22 not a multiple of 8): byte-identical, `budgetSpent == modelCalls == 22`, zero overshoot, cold tail recorded as `ceiling`                         |
| SCN-GEN-CONC-4 | ranks 3 and 6 both fault in ONE batch: identical modulo spend, `lastCompletedRank == 2`, rank 3 is the interruption; `modelCalls` 8 vs 4 — the overshoot is real and reported |
| SCN-GEN-CONC-5 | resume after a concurrent interruption is identical to resume after a sequential one; spend accumulates across legs (16→24 concurrent, 11 sequential)                         |
| SCN-GEN-CONC-6 | `modelCalls` is present and `0` on a malformed run and on an empty frontier                                                                                                   |
| SCN-GEN-CONC-7 | the GEN-2e marginal-value halt is not pass-level on this path, so a pool cannot skew it                                                                                       |

### On SCN-GEN-CONC-7 — a worry that turned out to be structurally impossible

The concern was that `runExtract`'s trailing-20 admit window (`MARGINAL_WINDOW = 20`) would become
scheduling-dependent under a pool. It cannot, and not by care: **the pool lives in `drive`, one layer
ABOVE `runExtract`**, and the `mine` driver calls `runExtract` with exactly ONE candidate and a ceiling
of 1 (`SINGLE_SITE`). A window needing 20 outcomes is never consulted by a call producing 1, so the
GEN-2e halt never fires on this path at all — it is not a pass-level stop here, and there is nothing for
a pool to reorder. The `mine` path's only pass-level stop is the GEN-2d ceiling, which REQ-GEN-CONC-3
handles by clipping (REQ-GEN-CONC-4). Asserted mechanically rather than argued.

---

## Design notes

**Why the pool is threads and not promises.** The S2 model call bottoms out in `execFileSync`
(`adapter-io/src/llm.ts`) — a BLOCKING subprocess. A bounded pool of async tasks over a blocking call is
not concurrent at all; it runs strictly one at a time while looking exactly like a pool in the source.
Measured: width 8 over 8×1s of `execFileSync` = **8.09s (0.99×)**; the same width over a genuinely async
spawn = **1.06s**. A pool built the obvious way would have been green in `src/` and dead in `dist/`.

**Why the main thread blocks.** `GenesisApi.genesis` is synchronous and must stay so: its only
production caller is `mine.ts`, but ~40 call sites across frozen test suites read `api.genesis(...).seeded`
directly. So the pool dispatches a batch, blocks on `Atomics.wait`, and returns answers in slot order —
concurrency contained inside one synchronous call.

**Why only the proposer is parallelized.** Admission is mechanical and local; the store must stay
single-writer. Only the network-bound leg moves. This also keeps a worker cheap to start: it rebuilds
just the proposer (`resolveProposer(repoPath, env)` — pure in those two arguments, which is why it can
cross a thread at all), where rebuilding the index would cost ~9s per worker.

**One shared per-site expression.** Both `visit` and `visitAll` route through one `visitWith`
(`runExtract([cand], SINGLE_SITE, { proposer, gate })`), so there is a single budget, gate and admission
call in the process. The two paths cannot drift apart while both stay green.

---

## Operator precondition — the frontier is derived from SCIP and from nothing else

`atlas mine` visits **0 sites** on a repository with no `.atlas/index.scip`: `axes.edges` comes from SCIP
occurrences alone, so no index means 0 edges, 0 structural seeds and an empty frontier. Atlas does not run
indexers. `atlas doctor index` names the exact command and the pinned version; for this repo:

    scip-typescript --version                          # must print 0.4.0
    scip-typescript index --output .atlas/index.scip

This is a precondition of the MEASUREMENT below as much as of the product: the first attempt to benchmark
this change reported a perfectly healthy run of 0 sites, and the speedup of a pass that visits nothing is
undefined.

## Measurement (built binary, real `atlas mine`, real operator-configured model command)

200 sites over atlas itself. The model is a real operator-configured command running through
`createCommandClient`/`execFileSync` — the product's actual model seam — with a fixed latency standing in
for a paid provider. Every run below: `seeded 200 · llmCalls 200 · budgetSpent 200`, i.e. identical outcomes.

**Matched pair at 3s per site, measured on the REBASED tree (`2cbc5cc` vs this branch):**

|                                | wall-clock  |
| ------------------------------ | ----------- |
| before (`2cbc5cc`, sequential) | **641.58s** |
| after (pool of 8)              | **101.45s** |
|                                | **6.32×**   |

Re-measured rather than carried over, because the rebase moved three files on the S2 path:
`adapter-io/src/compose.ts` (the admission gate `mine` composes), `adapter-io/src/sidecar.ts` (the staging
write door `upsert` commits through) and `adapter-io/src/git-history.ts` (a ranking input). The result is
unchanged within noise from the pre-rebase pair (626.38s → 97.31s, 6.44×).

Supporting points from the pre-rebase binary, same method: concurrent 87.42s at 1s/site and 176.95s at
6s/site. Between 3s and 6s the concurrent path gains 79.6s for 75s of added per-site latency — 25 batches'
worth, i.e. the model-bound component is compressed by the full pool width of 8.

Two measurement caveats recorded rather than smoothed:

- **The first run after building a SCIP index is not representative.** The concurrent leg first measured
  146.66s and re-measured 101.45s under identical inputs. The concurrent path is dominated by fixed
  per-site cost, so cold-cache effects land on it hard, where the sequential leg hides them behind 600s of
  model latency. The reproducible value is reported.
- **The two trees are not identical frontiers** — this change adds three source files, so the planned-site
  count differs (512 before, 508 after). Both runs visited the same 200 sites under the same ceiling.
- At 1s/site the ratio falls to ~2.6× because the still-serialized per-site work (admission, CAS write,
  sidecar publish) dominates. The real regime is ~18s/site, where the model-bound component dominates
  almost entirely, so this measurement UNDERSTATES the product case.

---

## Traceability

work-package: WP-FIX-CONCURRENCY
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-CONC-1 # ptr+digest
- source: ../req-gen.md#REQ-GEN-CONC-2 # ptr+digest
- source: ../req-gen.md#REQ-GEN-CONC-3 # ptr+digest
- source: ../req-gen.md#REQ-GEN-CONC-4 # ptr+digest
- source: ../req-gen.md#REQ-GEN-CONC-5 # ptr+digest
- source: ../req-gen.md#REQ-GEN-CONC-6 # ptr+digest
  acceptance: # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-CONC-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-CONC-2 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-CONC-3 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-CONC-4 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-CONC-5 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-CONC-6 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-CONC-7 # ptr+digest
  seam-freezes: [ "ControllerDeps.visitAll — owned-by genesis/drive.ts, consumed-by cli/mine.ts" ]
