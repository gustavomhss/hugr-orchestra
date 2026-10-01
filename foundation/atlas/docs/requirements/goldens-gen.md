# Goldens — Block GEN (genesis / mining) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-gen.md`; every INV method-tagged, **no** FSPEC in GEN — the sole Atlas formal model is `FSPEC-merge`, Block KRN) ·
> **owner:** charlie (FORGE); genesis domain authored by jimmy (COMPASS). GEN is the **largest block** (75 REQ over 16 INV).
>
> **Derivation (generated from the S2 method-tag — hand-authored only for true residue; GEN has none):**
>
> - **GEN-11 (11a/11b/11c) is `PBT`** — the one determinism law: SCNs are **witnesses of the PPR reproducibility
>   property** (`genesis/ref/rank.ts` as oracle) — permute the def→ref adjacency / input order and re-run,
>   assert a byte-identical ranking; the mutant = an unpinned seed / unstable float-sort → nondeterministic — `gen: PBT`.
> - **GEN-1..10, 12..16 are `reference-model`** → **conformance / differential** against the named build-language
>   mock (`genesis/ref/*.ts`, reused as the unit-test mock; anti-rot) — `gen: conformance`. GEN-8's golden is a
>   PBT-**fuzz** differential but the tag stays `reference-model` (the total reference IS the oracle; shape is
>   robustness/totality, not ordering — mirrors INV-KERNEL-7/8; method-tags-gen.md §GEN-8).
> - **residue: none.** Every GEN slot has a pure/total reference oracle or the PBT determinism law; unlike the KRN
>   pilot (KERNEL-12a self-install) there is no oracle-less integration residue here.
>
> **Likely-invariant honesty (load-bearing for every teeth direction):** genesis proves **machine-checked _likely_
> invariants** (Daikon-style — HOLD on current code + survive a mechanical mutant), **never** ∀-input theorems
> (method-tags-gen.md §Refuse-to-model). **No golden below claims universal proof.** GEN-12j's teeth is the axis
> of the whole block: a synthesized `check` earns admission only if it **flips to BROKEN on ≥1 mechanical mutant**
> of its anchored subtree — a check no mutant breaks is a tautology and is dropped. Its golden asserts the
> **META-property** (mutation-of-the-mutation) — see §GEN-12j.

Concrete fixture universe reused across the block (`acme-repo@rev-c0ffee`, mirrors `genesis/ref` shapes):

| id  | file::symbol                   | PPR rank | tier | subtreeHash | note                             |
| --- | ------------------------------ | -------- | ---- | ----------- | -------------------------------- |
| s1  | `ledger/post.ts::applyPosting` | 0.91     | T0   | `st-a10`    | top blast, ranked #1             |
| s2  | `ledger/refund.ts::void`       | 0.74     | T1   | `st-b22`    | ranked #2                        |
| s3  | `auth/token.ts::rotate`        | 0.55     | T1   | `st-c31`    | ranked #3                        |
| s4  | `util/pad.ts::lpad`            | 0.09     | T2   | `st-d40`    | cold tail, ranked #4             |
| u1  | `vendor/three.min.js`          | —        | —    | —           | vendored, 0 churn, **un-ranked** |

Frontier = {s1,s2,s3,s4} (size 4 of 900 repo symbols) ⇒ `--budget = min(4, 200) = 4`. PPR: damping `0.85`
pinned, seed pinned, ties broken by a stable total order. Skeleton hash of the run = `sk-3f2a`.

---

## REQ-GEN-1 — deterministic $0-LLM genesis skeleton

### REQ-GEN-1a — deterministic $0-LLM S0/S1 (happy)

### SCN-GEN-1a-1 — S0+S1 are $0-LLM pure functions of the repo@rev (happy)

source: REQ-GEN-1a
Given `acme-repo@rev-c0ffee`, the reference stages `genesis/ref/scan.ts` + `mine.ts`, and the S0/S1 call-graph
When `scan(repo,rev)` then `mine(scan)` run and the S0/S1 import graph is scanned for any LLM client symbol
Then the skeleton is produced spending **0 LLM calls** and **0** LLM symbols are reachable from the S0/S1 path — S0+S1 = pure `f(repo,rev)`
teeth: breaks-on "the mine stage calls an LLM to score a site — an LLM client symbol enters the S0/S1 call graph and the $0-purity assertion fails"
gen: conformance # differential vs the pure reference `scan.ts`/`mine.ts` + a static zero-LLM-path assertion

### REQ-GEN-1b — re-run reproduces skeleton (happy)

### SCN-GEN-1b-1 — same rev → byte-identical skeleton (happy)

source: REQ-GEN-1b
Given the skeleton `sk-3f2a` from a first run over `rev-c0ffee`
When genesis re-runs `scan∘mine` on the identical rev and the two skeletons are compared byte-for-byte
Then the second skeleton is **byte-identical** to `sk-3f2a`
teeth: breaks-on "scan orders files by filesystem mtime (nondeterministic) — the re-run reorders nodes and diverges from `sk-3f2a`"
gen: conformance

### REQ-GEN-1c — re-run reproduces ranking (happy)

### SCN-GEN-1c-1 — same rev → byte-identical candidate ranking (happy)

source: REQ-GEN-1c
Given the ranking `[s1,s2,s3,s4]` from a first run over `rev-c0ffee`
When genesis re-runs and the two rankings are compared byte-for-byte
Then the ranking is byte-identical `[s1,s2,s3,s4]` (the determinism arm is delegated to the GEN-11 law)
teeth: breaks-on "the ranker seeds PPR from an unpinned RNG — the re-run permutes the near-tie s2/s3 pair and the ranking diverges"
gen: conformance

---

## REQ-GEN-2 — rationed intelligence over the ranked frontier

### REQ-GEN-2a — no LLM on un-ranked sites (guard)

### SCN-GEN-2a-1 — an un-ranked site receives 0 LLM calls (guard)

source: REQ-GEN-2a
Given the ranked frontier {s1,s2,s3,s4} and the un-ranked vendored file `u1` (not in the frontier)
When the spend scheduler runs to completion
Then `u1` receives **0** LLM calls — every visited site ∈ the ranked set
teeth: breaks-on "the scheduler falls back to a repo-wide walk after draining the frontier — `u1` gets an LLM call though it was never ranked"
gen: conformance # oracle = `genesis/ref/schedule.ts`; asserts every visited site ∈ ranked set

### REQ-GEN-2b — spend highest-first (happy)

### SCN-GEN-2b-1 — calls issue in strictly descending PPR order (happy)

source: REQ-GEN-2b
Given the ranked frontier `[s1(0.91), s2(0.74), s3(0.55), s4(0.09)]`
When the scheduler issues its bounded calls and the call order is recorded
Then the call sequence is exactly `[s1,s2,s3,s4]` — strictly descending PPR, highest-first
teeth: breaks-on "the scheduler pops the frontier FIFO by discovery order — s3 is called before s2 (not highest-first)"
gen: conformance

### REQ-GEN-2c — one bounded call per site (happy)

### SCN-GEN-2c-1 — exactly one bounded call per visited site (happy)

source: REQ-GEN-2c
Given the scheduler visiting `s1`
When `s1` is processed
Then `s1` receives **exactly one** bounded (token-capped) LLM call and is never re-called — `call-count(s1) = 1`
teeth: breaks-on "self-consistency samples `s1` three times — `call-count(s1) = 3` (more than one call per site)"
gen: conformance

### REQ-GEN-2d — hard budget ceiling (happy)

### SCN-GEN-2d-1 — total spend capped at min(frontier_size, 200) (happy)

source: REQ-GEN-2d
Given a frontier of size 4 → `budget = min(4,200) = 4`, and a fixture frontier of size 500 → `budget = min(500,200) = 200`
When the scheduler runs each to completion
Then total LLM calls ≤ 4 in the first and ≤ 200 in the second — the hard ceiling holds in both
teeth: breaks-on "budget is computed as `max(frontier,200)` — the 500-site frontier spends 500 calls, blowing the 200 ceiling"
gen: conformance

### REQ-GEN-2e — marginal-value halt (happy)

### SCN-GEN-2e-1 — halt when the trailing-20 admit-rate < 20% (happy)

source: REQ-GEN-2e
Given a run where the last 20 completed sites admitted only 3 candidates (admit-rate 15% `< 20%`)
When the scheduler evaluates the trailing-20 admit-rate after site 20
Then genesis **halts** — no further ranked site is called
teeth: breaks-on "the halt predicate is written with `>` (admit-rate `> 20%` continues) — the run drives past the diminishing-returns floor and drains the whole budget"
gen: conformance

### REQ-GEN-2f — no repo-wide LLM sweep (guard)

### SCN-GEN-2f-1 — no whole-repo LLM sweep occurs (guard)

source: REQ-GEN-2f
Given the repo with 4 ranked sites out of 900 total symbols
When the whole run completes and the visited-site set is compared to the total symbol set
Then LLM was spent on ≤ 4 ranked sites — the 896 un-ranked symbols got **0** calls (no repo-wide sweep)
teeth: breaks-on "a final catch-all pass sweeps every symbol — LLM calls scale to 900 (a repo-wide sweep)"
gen: conformance

---

## REQ-GEN-3 — cost tracks the importance-surface, not size

### REQ-GEN-3a — cost tracks frontier not size (happy)

### SCN-GEN-3a-1 — call-count = f(frontier), invariant to line count (happy)

source: REQ-GEN-3a
Given two revs of acme-repo with the **same** PPR frontier {s1..s4} but rev-B carrying 3× the total line count of rev-A (all in un-churned files)
When genesis runs on each and the call-counts are compared
Then `call-count(A) == call-count(B) == 4` — cost is a function of the frontier, invariant to line count
teeth: breaks-on "the accountant sizes spend by file/line totals — rev-B (3× lines) spends 3× the calls"
gen: conformance # oracle = `genesis/ref/cost.ts`

### REQ-GEN-3b — un-churned code raises no spend (guard)

### SCN-GEN-3b-1 — +10k un-churned lines → Δspend = 0 (guard)

source: REQ-GEN-3b
Given a baseline run over `rev-c0ffee` with `call-count = 4`, and a fixture rev that **adds 10,000 lines of never-committed-churn code** (a new vendored file, 0 SZZ, 0 hotspot)
When genesis runs on the +10k-lines rev
Then the call-count is still 4 — **Δspend = 0** (differential / metamorphic)
teeth: breaks-on "the frontier is seeded from raw file size — the +10k-line file enters the frontier and adds LLM calls (Δ > 0)"
gen: conformance

---

## REQ-GEN-4 — grounded from birth

### REQ-GEN-4a — grounded by subtreeHash (happy)

### SCN-GEN-4a-1 — every seeded fact carries a re-deriving subtreeHash (happy)

source: REQ-GEN-4a
Given a seeded fact `F` citing `ledger/post.ts::applyPosting@st-a10`
When `atlas-emit` re-derives the citation at `source@sha`
Then `F` is grounded and **carries the re-derived `subtreeHash` `st-a10`** in its stored record
teeth: breaks-on "the emit-gate stores the fact with an **unpopulated/stale** subtreeHash (skips the recompute) — `F` is emitted carrying `∅`/`st-OLD` instead of `st-a10`, so its later drift-check is broken"
gen: conformance # oracle = `genesis/ref/emit-gate.ts` (reuses the KNOW-2 grounding reference)

### REQ-GEN-4b — pass the truth door and carry an obviousness score (happy)

amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).

### SCN-GEN-4b-1 — a seed clears the truth door and is emitted carrying a score (happy)

source: REQ-GEN-4b
Given a seed that is grounded (`st-a10` re-derives) **and** non-obvious (does not merely restate a type signature)
When `atlas-emit` applies the truth door and the harness's obviousness predicate
Then the seed is emitted (`emitted:true`) and its stored record **carries an obviousness score** (TOTALITY)
teeth: breaks-on "the emitted seed carries **no** obviousness score (totality violated — the score defaults to absent instead of being computed), or a resurrected obviousness gate drops it"
gen: conformance

### REQ-GEN-4c — reject the ungrounded; never reject the obvious (guard)

amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).

### SCN-GEN-4c-1 — ungrounded seed → emitted:false; obvious seed → emitted with a low score (guard)

source: REQ-GEN-4c
Given seed `U` whose citation does **not** re-derive at `source@sha`, and seed `O` that is obvious (restates that `lpad(s,n)` pads to `n`) but grounds cleanly
When `atlas-emit` applies the truth door to each
Then `U` is rejected — `emitted:false`, never reaching the fact set — and `O` **is emitted**, carrying a low obviousness score (ADR-0012: obviousness is scored, never gated)
teeth: breaks-on "the gate downgrades a failed truth door to a warning — the ungrounded seed `U` is emitted anyway — or a **resurrected obviousness gate** drops `O` to `emitted:false`, destroying the very evidence needed to audit the filter"
gen: conformance

### REQ-GEN-4d — no self-declared truth (guard)

### SCN-GEN-4d-1 — a seed cannot self-declare true (guard)

source: REQ-GEN-4d
Given a candidate carrying `self_asserted:true` / `confidence:1.0` and **no** external grounding
When the emit-gate evaluates it
Then the self-declaration is ignored — admission depends only on the mechanical truth door; the seed is rejected
teeth: breaks-on "the gate reads the candidate's own `self_asserted` flag as sufficient — the ungrounded seed self-promotes to a fact"
gen: conformance

---

## REQ-GEN-5 — propose only; the contested is human-ratified

### REQ-GEN-5a — write only candidates (happy)

### SCN-GEN-5a-1 — genesis output is candidate-only (happy)

source: REQ-GEN-5a
Given genesis completing a run that produces 12 seeds
When the written objects' status fields are inspected
Then all 12 are written as `candidate` — **0** are written `ratified`
teeth: breaks-on "genesis writes a high-confidence seed directly as `ratified` — a non-candidate enters the store from genesis"
gen: conformance # oracle = `genesis/ref/ratify-router.ts`

### REQ-GEN-5b — batched human ratification (happy)

### SCN-GEN-5b-1 — T0/contested facts ratified via a batched, ranked interview (happy)

source: REQ-GEN-5b
Given 8 T0/contested candidates awaiting ratification
When the ratification interview is assembled
Then they are presented as **one batched, ranked** interview (batch size > 1, capped 20 Q/session) for human ratification
teeth: breaks-on "the router ratifies each candidate the moment it is proposed with no human interview — the batched-interview edge is bypassed"
gen: conformance

### REQ-GEN-5c — never auto-promote (guard)

### SCN-GEN-5c-1 — no auto-promote edge exists for a T0/contested fact (guard)

source: REQ-GEN-5c
Given a T0 candidate `C` in the ratify-router state machine
When the router's edges are enumerated
Then the **only** edge `C→ratified` passes through `interview(batch)` — no `candidate→ratified` edge bypasses the human
teeth: breaks-on "an `auto_promote(tier==T0)` edge is added — `C` reaches ratified with no interview"
gen: conformance

### REQ-GEN-5d — never one question at a time (guard)

### SCN-GEN-5d-1 — the interview is never one-question-at-a-time (guard)

source: REQ-GEN-5d
Given 8 contested candidates
When the interview is emitted
Then the batch carries **>1** ranked question per session — never a single-question drip
teeth: breaks-on "the interview emits one question, waits, then emits the next — batch size collapses to 1 (one-at-a-time)"
gen: conformance

---

## REQ-GEN-6 — mined signals are heuristics, never facts

### REQ-GEN-6a — signals only as ranking heuristics (happy)

### SCN-GEN-6a-1 — mined signals feed only the rank field (happy)

source: REQ-GEN-6a
Given a site with hotspot, SZZ, coupling, and ownership signals
When the miner routes those signals
Then they land only in the candidate's `rank` field — **never** in `Fact[]`
teeth: breaks-on "the miner writes the SZZ score directly into the fact set — a mined signal becomes a fact without grounding"
gen: conformance # oracle = `genesis/ref/mine.ts` (shared with GEN-1)

### REQ-GEN-6b — signal is not a fact until grounded (guard)

### SCN-GEN-6b-1 — an ungrounded signal is not served as a fact (guard)

source: REQ-GEN-6b
Given a high-hotspot site with a signal but **no** grounded + ratified invariant
When the served fact set is queried
Then the signal is **absent** from the fact set — it stays a rank heuristic until grounded ∧ ratified
teeth: breaks-on "the served set includes ungrounded signals as facts — the un-ratified hotspot is served as truth"
gen: conformance

### REQ-GEN-6c — churn alone mints no fact (guard)

### SCN-GEN-6c-1 — high churn/SZZ + no invariant → 0 facts (guard)

source: REQ-GEN-6c
Given `ledger/post.ts` with top-decile churn and high SZZ but **no** grounded invariant extracted
When genesis processes it
Then **0** facts are minted from it — churn/SZZ alone mints nothing
teeth: breaks-on "the miner mints a 'this file is important' fact from the churn signal alone — 1 fact from 0 grounded invariants"
gen: conformance

---

## REQ-GEN-7 — one-time then hand off; incremental idempotent re-run

### REQ-GEN-7a — hand off to born-from-work (happy)

### SCN-GEN-7a-1 — genesis transfers control, does not stand as a sweeper (happy)

source: REQ-GEN-7a
Given genesis completing its one-time seeding pass
When the run finishes
Then control is handed to born-from-work (KNOW-13) — **no** standing genesis sweeper process remains
teeth: breaks-on "genesis registers a daemon that keeps re-sweeping the repo — control is never handed off"
gen: conformance # oracle = `genesis/ref/rerun.ts`

### REQ-GEN-7b — idempotent re-run upsert (happy)

### SCN-GEN-7b-1 — genesis∘genesis produces 0 duplicate facts (happy)

source: REQ-GEN-7b
Given a first run that grounded facts {F1,F2,F3}
When genesis is run a second time on the same rev
Then the second run **upserts by fact id** — 0 duplicate facts (`genesis∘genesis ≡ genesis` on the grounded set)
teeth: breaks-on "the re-run inserts facts unconditionally — {F1,F2,F3} are duplicated to 6 facts (upsert degrades to append)"
gen: conformance

### REQ-GEN-7c — incremental re-run (happy)

### SCN-GEN-7c-1 — a re-run re-indexes only changed files (happy)

source: REQ-GEN-7c
Given a first run over `rev-c0ffee`, then `rev-d1` that changes exactly 1 file
When genesis re-runs on `rev-d1`
Then only the 1 changed file's nodes are re-indexed — the untouched files are not re-processed
teeth: breaks-on "the re-run re-indexes the whole repo regardless of the diff — every file is re-processed (non-incremental)"
gen: conformance

---

## REQ-GEN-8 — total & resumable

### REQ-GEN-8a — resume from last site (happy)

### SCN-GEN-8a-1 — an interrupted run resumes from the last completed site (happy)

source: REQ-GEN-8a
Given a run killed after completing s1,s2 of `[s1,s2,s3,s4]`, with a persisted `resumeToken` pointing at s2
When genesis is restarted with the `resumeToken`
Then it resumes at **s3** — s1,s2 are not re-called (resume from the last completed ranked site)
teeth: breaks-on "restart ignores the `resumeToken` and re-processes from s1 — s1,s2 get a second LLM call (no resume)"
gen: conformance

### SCN-GEN-8a-3 — the resumed run's site set still closes over the ORIGINAL frontier (happy)

source: REQ-GEN-8a
Given a run over `[s1,s2,s3,s4]` interrupted at s2, then restarted with its `resumeToken`
When the resumed `GenesisReport` is inspected
Then its per-site outcomes account for all **4** planned sites exactly once — the first leg's completed rows carried forward, the remainder re-driven, no site counted twice and none unaccounted; and a resume handed a cursor AHEAD of where the run stopped genuinely skips sites, which the report reports as unaccounted rather than closing over
teeth: breaks-on "the resumed report accounts only for the sites the resume itself re-drove, so the frontier appears to shrink at exactly the moment the run was interrupted"
gen: conformance # oracle = the run controller across `genesis` → `resume`

### REQ-GEN-8b — malformed yields partial skeleton (guard)

### SCN-GEN-8b-1 — a malformed rev yields an honest empty/partial skeleton (guard)

source: REQ-GEN-8b
Given a malformed input — rev `deadbeef` that does not exist / a shallow clone with a corrupt object
When genesis runs on it
Then it returns an honest empty/partial `GenesisReport` + a `resumeToken` — the reachable portion is skeletonized, the rest reported missing
teeth: breaks-on "the malformed rev produces a fabricated _full_ skeleton (invented nodes for the unreadable objects) instead of an honest partial"
gen: conformance # PBT-fuzz differential over malformed repos/revs; tag stays reference-model (§GEN-8: the total reference IS the oracle)

### REQ-GEN-8c — never throw (guard)

### SCN-GEN-8c-1 — a malformed rev never throws (guard)

source: REQ-GEN-8c
Given the PBT-fuzz stream of malformed repos/revs (corrupt objects, non-UTF8 paths, empty repo, detached HEAD) — 10k corner-biased cases
When each is fed to every genesis entry point side-by-side with the total reference pipeline
Then every call returns a `Result` / partial report — **0** exceptions thrown; prod matches ref
teeth: breaks-on "a corrupt-object input propagates an uncaught exception instead of a structured partial report"
gen: conformance # PBT-fuzz differential vs the total reference `genesis/ref/*.ts`

---

## REQ-GEN-9 — seeds the self-model (Awareness sources)

### REQ-GEN-9a — create Awareness sources (happy)

### SCN-GEN-9a-1 — genesis seeds every Awareness facet's source (happy)

source: REQ-GEN-9a
Given a repo with a ratified T0 manifest and `CONVENTIONS.md@sha`
When genesis assembles Awareness
Then it creates the sources each facet rolls up from — `constitution` from the T0 manifest, `taste` at `CONVENTIONS.md@sha`, the `mission` stub
teeth: breaks-on "genesis leaves the `taste` facet with no source object though `CONVENTIONS.md` exists — a rollup source is missing"
gen: conformance # oracle = `genesis/ref/awareness.ts` (reuses the MEM-11 reference)

### REQ-GEN-9b — source-less facet is UN-SEEDED (guard)

### SCN-GEN-9b-1 — a facet with no source renders UN-SEEDED (guard)

source: REQ-GEN-9b
Given the `mission` facet for which no DEFINE artifact exists (no source)
When Awareness renders the facet
Then it renders the `UN-SEEDED` sentinel — not a value
teeth: breaks-on "the source-less `mission` facet renders as an empty-but-present value instead of `UN-SEEDED` (a hole masquerades as seeded)"
gen: conformance

### REQ-GEN-9c — never fabricate a facet (guard)

### SCN-GEN-9c-1 — a source-less facet is never fabricated (guard)

source: REQ-GEN-9c
Given the source-less `mission` facet
When Awareness assembles
Then **no** fabricated `mission` value is invented (MEM-11) — it stays `UN-SEEDED`
teeth: breaks-on "Awareness synthesizes a plausible `mission` string from the README — a facet is fabricated with no source"
gen: conformance

### REQ-GEN-9d — mission stub stays unratified (guard)

### SCN-GEN-9d-1 — the mission stub stays unratified until a real DEFINE artifact (guard)

source: REQ-GEN-9d
Given the `mission` stub and no ratified DEFINE artifact
When Awareness is assembled and the stub's flag is read
Then the stub carries `unratified:true` — it never presents as ratified
teeth: breaks-on "the mission stub is emitted with `ratified:true` before any DEFINE artifact exists"
gen: conformance

---

## REQ-GEN-10 — explicit-structural mechanisms only

### REQ-GEN-10a — every stage binds a structural mechanism (happy)

### SCN-GEN-10a-1 — each stage binds a named, deterministic mechanism (happy)

source: REQ-GEN-10a
Given the stage registry (scan→tree-sitter/SCIP/stack-graphs, rank→SZZ/hotspots/coupling/PPR, check→CodeQL/Semgrep)
When each stage's bound mechanism is enumerated
Then every stage maps to a named deterministic mechanism from the admissible set — **none** unbound
teeth: breaks-on "the rank stage binds an unnamed 'smart scorer' not in the registry — a stage runs an unregistered mechanism"
gen: conformance # oracle = `genesis/ref/registry.ts`

### REQ-GEN-10b — no embedding, vector store, or ANN (guard)

### SCN-GEN-10b-1 — zero embedding/vector/ANN in the index or rank path (guard)

source: REQ-GEN-10b
Given the index / rank / check dependency graph
When the import graph is scanned for embedding, vector-store, and ANN symbols
Then **0** are reachable — retrieval and ranking are explicit graph/query mechanisms (A-14)
teeth: breaks-on "the ranker imports a vector-embedding similarity lib — an ANN symbol enters the rank path (A-14 violated)"
gen: conformance

---

## REQ-GEN-11 — reproducible ranking (determinism law · PBT)

### REQ-GEN-11a — deterministic PPR ranking (happy)

### SCN-GEN-11a-1 — ranking is a deterministic function of repo@rev under input permutation (happy)

source: REQ-GEN-11a
Given the def→ref adjacency of `rev-c0ffee` fed to a personalized PageRank (damping `0.85` pinned, seed pinned) with SZZ+hotspots+coupling personalization
When the ranking is computed, then the adjacency / input order is permuted and it is re-run
Then the ranking is identical `[s1,s2,s3,s4]` under **every** permutation — a stable total order breaks numeric ties deterministically
teeth: breaks-on "ties are broken by hash-map iteration order — permuting the adjacency reorders the near-tie s2/s3 pair (ranking depends on input order)"
gen: PBT # witness of the PPR determinism law under adjacency/input permutation (`genesis/ref/rank.ts`)

### REQ-GEN-11b — no model, no randomness (guard)

### SCN-GEN-11b-1 — the rank path carries no RNG/clock/model handle (guard)

source: REQ-GEN-11b
Given the ranker call graph
When it is audited for RNG / clock / model handles and the damping+seed are checked
Then **0** RNG/clock/model symbols are reachable and damping+seed are pinned constants
teeth: breaks-on "the ranker seeds PPR from `Math.random()` — an unpinned RNG enters the path and successive runs differ"
gen: PBT # witness: an unseeded/RNG path fails the run-to-run identity property

### REQ-GEN-11c — reproduces across runs and machines (happy)

### SCN-GEN-11c-1 — same rev → byte-identical ranking across machines (happy)

source: REQ-GEN-11c
Given `rev-c0ffee` ranked on machine X and independently on machine Y (different arch / float env)
When the two rankings are compared byte-for-byte
Then they are **byte-identical** `[s1,s2,s3,s4]` — cross-machine reproducibility
teeth: breaks-on "PPR scores are compared as raw floats under an unstable sort — machine Y permutes a near-tie pair vs machine X (float-nondeterminism)"
gen: PBT # witness of cross-run/machine byte-identity (canonicalized fixed-point scores + stable order)

---

## REQ-GEN-12 — proposer-in-a-harness; mechanical admission with teeth

### REQ-GEN-12a — LLM only proposes in S2 (happy)

### SCN-GEN-12a-1 — in S2 the LLM only proposes typed candidates (happy)

source: REQ-GEN-12a
Given stage S2 processing site `s1`
When the LLM is invoked
Then its output is a **typed candidate proposal only** — it does not write to the fact set or cast the admission decision
teeth: breaks-on "the LLM's output is written straight into the fact set — the model acts as an oracle, not a proposer"
gen: conformance # oracle = `genesis/ref/admit-harness.ts`

### REQ-GEN-12b — admission is mechanical (happy)

### SCN-GEN-12b-1 — admission is decided by the mechanical harness, not the model (happy)

source: REQ-GEN-12b
Given a typed candidate proposed by the LLM
When admission runs
Then the admit/reject decision comes only from the mechanical harness (compile ∧ HOLDS ∧ mutant-flip) — the model casts no admission vote
teeth: breaks-on "admission reads the model's `confidence` score as the deciding factor — admission is no longer mechanical"
gen: conformance

### REQ-GEN-12c — predicate admitted only if check HOLDS (guard)

### SCN-GEN-12c-1 — a check that won't compile or won't HOLDS is not admitted (guard)

source: REQ-GEN-12c
Given predicate candidate `P` whose synthesized check either (i) fails to compile or (ii) compiles but returns **BROKEN** on the current code
When the admit-harness evaluates `P`
Then `P` is **not** admitted in either case — admission requires compile ∧ HOLDS-on-current-code
teeth: breaks-on "the harness admits `P` on 'compiles' alone without evaluating HOLDS — a check that is BROKEN on current code is admitted"
gen: conformance

### REQ-GEN-12d — failing check refined then dropped (guard)

### SCN-GEN-12d-1 — a failing check is refined ≤K then dropped, never forced (guard)

source: REQ-GEN-12d
Given predicate candidate `P` whose check returns BROKEN (a counterexample), with `K=1`
When the harness processes `P`
Then it refines `P` at most once; if still BROKEN it is **dropped** — `P` is never forced into the fact set
teeth: breaks-on "on a persistent BROKEN check the harness disables the check and admits `P` anyway (forces the fact) instead of dropping it"
gen: conformance

### REQ-GEN-12e — advisory passes the truth door, and is scored for obviousness (guard)

### SCN-GEN-12e-1 — an ungrounded advisory is not admitted; an obvious one is admitted with a low score (guard)

source: REQ-GEN-12e
Given advisory candidate `A` that is grounded but **obvious** (restates a public type signature), and advisory candidate `A_ung` whose citation does not ground
When the admit-harness applies the truth door and the harness's obviousness predicate
Then `A_ung` is **not** admitted (the truth door blocks it), while `A` **is** admitted carrying a **low obviousness score** — obviousness is scored, never gated (ADR-0012)
teeth: breaks-on "a **resurrected obviousness gate** — the obvious advisory `A` is dropped, so the filter's own accuracy can never be measured — or the admitted advisory carries no score at all (totality violated)"
gen: conformance

### REQ-GEN-12f — chain-of-thought never persisted (guard)

### SCN-GEN-12f-1 — chain-of-thought is scratch, never a fact (guard)

source: REQ-GEN-12f
Given an LLM proposal whose reasoning trace (chain-of-thought) is captured in the harness scratch buffer
When the run's persisted fact set is inspected
Then **no** chain-of-thought text is persisted — only the admitted typed candidate; the scratch is discarded
teeth: breaks-on "the reasoning trace is stored as an advisory fact — chain-of-thought is persisted as truth"
gen: conformance

### REQ-GEN-12g — abstention is valid (happy)

### SCN-GEN-12g-1 — abstention with a grounded why-not is a valid outcome (happy)

source: REQ-GEN-12g
Given site `s3` where the LLM finds no groundable invariant and returns an abstention with a grounded why-not
When the harness records the outcome
Then abstention is accepted as a **valid outcome** — 0 facts, a recorded grounded why-not, no retry-forcing
teeth: breaks-on "abstention is treated as failure and the site is retried until it emits a fact — abstention is not a valid outcome"
gen: conformance

### SCN-GEN-12g-3 — the RUN reports the grounded why-not, per site (happy)

source: REQ-GEN-12g
Given a run over the ranked frontier `[s1,s2,s3]` where `s2` yields no grounded fact and the S2 driver returns its grounded why-not
When the finished `GenesisReport` is inspected
Then `s2` carries a per-site outcome `abstained` holding that **same** `WhyNot` verbatim (site + reason), and a seeded site names **which** facts it produced — a valid outcome is one that is RECORDED, not one that is discarded
teeth: breaks-on "the run keeps only `.facts` and the why-not is dropped, so the report shows `s2` exactly as it shows a site that was never visited"
gen: conformance # oracle = the run controller over injected `plan`/`visit`/`upsert` seams

### SCN-GEN-12g-4 — a DROPPED site is distinguishable from an abstaining one (guard)

source: REQ-GEN-12g
Given a ranked frontier of 4 sites under a hard budget ceiling of 2, where every visited site abstains
When the finished `GenesisReport` is inspected
Then the 2 visited sites read `abstained` with their grounded why-nots and the 2 cold-tail sites read `unvisited` with cause `ceiling` — never visited is a **different** outcome from abstained, and both are accounted for
teeth: breaks-on "the ceiling stops the drive and records nothing for the cold tail, so a site that was dropped and a site that abstained produce the same (empty) record"
gen: conformance # oracle = the run controller; the same shape holds for an interrupted run's tail

### REQ-GEN-12h — no pressure to emit (guard)

### SCN-GEN-12h-1 — the model is not pressured to emit a fact (guard)

source: REQ-GEN-12h
Given the proposal step for site `s4` (cold tail, likely nothing groundable to say)
When the proposal step runs
Then the model may return **0** candidates with no reward/penalty steering it toward emitting — no "you must produce a fact" pressure
teeth: breaks-on "the harness re-prompts 'you must return at least one fact' until the model emits — the model is pressured to emit"
gen: conformance

### REQ-GEN-12i — labelled likely-invariant not proof (happy)

### SCN-GEN-12i-1 — an admitted predicate is labelled a machine-checked likely invariant (happy)

source: REQ-GEN-12i
Given an admitted predicate `P` (compiled, HOLDS on current code, flips to BROKEN on a mutant)
When `P`'s label is read
Then it is labelled `machine-checked likely invariant` — never `proof` / `theorem` / ∀-input
teeth: breaks-on "`P` is labelled a `proven invariant` — a sampled-current-code check is misrepresented as a ∀-input proof"
gen: conformance

### REQ-GEN-12j — teeth drop vacuous check (guard) ★ the block's teeth axis — META-property

### SCN-GEN-12j-1 — a check that survives every mutant is dropped as vacuous (guard)

source: REQ-GEN-12j
Given predicate candidate `V` whose synthesized check returns **HOLDS** on the current code **and** also returns HOLDS on _every_ mechanically-mutated counterfactual of the anchored subtree `st-a10` — i.e. it flips to BROKEN on **0** mutants (a tautology / matches nothing)
When the admit-harness runs the mutation-flip gate — this golden asserts the **META-property** (mutation-of-the-mutation): _a synthesized check with no teeth is REJECTED_
Then `V` is **dropped as vacuous** — admission requires HOLDS-on-current ∧ BROKEN-on-≥1-mutant, and `V` fails the second conjunct
teeth: breaks-on "the harness admits on HOLDS alone and **skips the mutant-flip conjunct** — the tautological check `V` (survives its own mutant) is admitted, i.e. the harness admits a toothless check (a vacuous golden enters the Atlas as a fact)"
gen: conformance # the teeth-gate IS an executable mutation/differential oracle; the mutant here is the harness dropping its own mutation-flip requirement (mutation-of-the-mutation)

### REQ-GEN-12k — sound oracle first (happy)

### SCN-GEN-12k-1 — a type-expressible slot prefers the type-checker / LSP (happy)

source: REQ-GEN-12k
Given a `contract` / `ownership` / visibility-`dependency` slot that is expressible in the language's type system
When the check is selected
Then it uses the language **type-checker / LSP diagnostics** (sound, `$0` — the compiler already ran) — not a synthesized CodeQL/Semgrep query
teeth: breaks-on "a type-expressible contract is checked by a synthesized Semgrep query instead of the sound compiler — an unsound approximate check replaces the `$0` sound one"
gen: conformance

---

## REQ-GEN-13 — cost discipline: cheap by default, escalate by value

### REQ-GEN-13a — extra mechanisms off at base tier (happy)

### SCN-GEN-13a-1 — base tier runs a single grounded proposal, all extras off (happy)

source: REQ-GEN-13a
Given a base-tier site `s3` (not high-value ∧ uncertain)
When it is processed
Then exactly one LLM call fires and every extra mechanism (self-consistency, refuter, CEGIS>1, CodeQL) is **off**
teeth: breaks-on "self-consistency is on by default at the base tier — `s3` costs 3 samples instead of 1"
gen: conformance # oracle = `genesis/ref/cost-policy.ts`

### REQ-GEN-13b — escalate only on value and uncertainty (happy)

### SCN-GEN-13b-1 — a mechanism switches on only when high-value ∧ uncertain (happy)

source: REQ-GEN-13b
Given site `s1` (T0, high blast) flagged **uncertain**, `s2` (T1, high blast) flagged **certain**, and `s4` (low tier) flagged **certain**
When the escalation predicate runs
Then extra mechanisms switch on for `s1` only — `s2` (high-value **but certain**) and `s4` both stay at the single-proposal base
teeth: breaks-on "escalation fires on high-value alone (drops the uncertainty conjunct) — `s2` (high-value ∧ certain) needlessly escalates instead of staying at base"
gen: conformance

### REQ-GEN-13c — default one sample (happy)

### SCN-GEN-13c-1 — the default is one sample, no self-consistency (happy)

source: REQ-GEN-13c
Given the default cost policy with no escalation
When a site is proposed
Then exactly **one** sample is drawn — no self-consistency voting
teeth: breaks-on "the default draws 5 samples and majority-votes — self-consistency is on by default"
gen: conformance

### REQ-GEN-13d — default advisory unless checkable (happy)

### SCN-GEN-13d-1 — a candidate defaults to advisory unless checkable ∧ tier≥T1 (happy)

source: REQ-GEN-13d
Given candidate `A` (not mechanically checkable) and candidate `B` (checkable ∧ tier T1)
When their kinds are assigned
Then `A` defaults to **advisory**; only `B` (checkable ∧ tier≥T1) becomes a predicate
teeth: breaks-on "an un-checkable candidate is admitted as a predicate — the checkable∧T1 guard is dropped"
gen: conformance

### REQ-GEN-13e — default CEGIS K≤1 (happy)

### SCN-GEN-13e-1 — CEGIS default refinement bound is K≤1 (happy)

source: REQ-GEN-13e
Given the default CEGIS config
When a check needs refinement
Then at most **1** refine round runs (`K≤1`) before drop
teeth: breaks-on "the default CEGIS bound is `K=10` — refinement loops 10× per candidate by default (cost blow-up)"
gen: conformance

### REQ-GEN-13f — refuter only for T0 (guard)

### SCN-GEN-13f-1 — the refuter runs only for T0 candidates (guard)

source: REQ-GEN-13f
Given a T1 candidate and a T0 candidate
When the cost policy decides whether to run the refuter
Then the refuter runs for the T0 candidate **only** — the T1 candidate skips it
teeth: breaks-on "the refuter runs for every tier — a T2 candidate invokes the small-model refuter (cost leak)"
gen: conformance

### REQ-GEN-13g — Semgrep before CodeQL (happy)

### SCN-GEN-13g-1 — Semgrep is attempted before CodeQL (happy)

source: REQ-GEN-13g
Given a check expressible in either Semgrep or CodeQL
When the analyzer is chosen
Then **Semgrep** (cheaper) is attempted first; CodeQL only if Semgrep cannot express it
teeth: breaks-on "CodeQL is invoked first by default — the expensive analyzer runs before the cheap one"
gen: conformance

### REQ-GEN-13h — query DB built once (guard)

### SCN-GEN-13h-1 — the query DB is built once, never per-check (guard)

source: REQ-GEN-13h
Given 20 checks over the same repo that require a CodeQL DB
When the checks run
Then the DB is built **once** and amortized across all 20 — never rebuilt per-check
teeth: breaks-on "the DB is rebuilt for each check — 20 checks trigger 20 DB builds (per-check cost)"
gen: conformance

### REQ-GEN-13i — no whole-repo pass required (guard)

### SCN-GEN-13i-1 — genesis requires no whole-repo pass (guard)

source: REQ-GEN-13i
Given a run scoped to the frontier {s1..s4} in a 900-symbol repo
When genesis executes
Then it completes without a whole-repo pass — the 896 non-frontier symbols are not analyzed
teeth: breaks-on "a mandatory whole-repo CodeQL pass runs before extraction — genesis requires analyzing all 900 symbols"
gen: conformance

### REQ-GEN-13j — scopable to a subtree (happy)

### SCN-GEN-13j-1 — genesis is scopable to a subtree, cold tail left to born-from-work (happy)

source: REQ-GEN-13j
Given `--scope ledger/` limiting the run to the ledger subtree
When genesis runs
Then only `ledger/` sites are processed; the cold tail (`auth/`, `util/`) is left to born-from-work
teeth: breaks-on "the `--scope` flag is ignored — genesis processes the whole tree regardless (not scopable)"
gen: conformance

### REQ-GEN-13k — report cost per stage (happy)

### SCN-GEN-13k-1 — the GenesisReport carries per-stage cost (happy)

source: REQ-GEN-13k
Given a completed run
When the `GenesisReport` is inspected
Then it carries a **per-stage** cost breakdown (scan / mine / rank / extract) under the ceiling
teeth: breaks-on "the report carries only a single lump total — per-stage cost is not reported"
gen: conformance

---

## REQ-GEN-14 — deepening loops governed, not free-running

### REQ-GEN-14a — loops opt-in or default-shallow (happy)

### SCN-GEN-14a-1 — REVIEW / ENRICH / EXPAND are opt-in or default-shallow (happy)

source: REQ-GEN-14a
Given the default config
When the loop settings are read
Then each of REVIEW, ENRICH, EXPAND is off / default-shallow — none runs deep unless opted in
teeth: breaks-on "EXPAND defaults to deep (10 rounds) — a deepening loop runs deep without being opted in"
gen: conformance # oracle = `genesis/ref/loops.ts`

### REQ-GEN-14b — loops budget-gated (happy)

### SCN-GEN-14b-1 — each deepening loop is budget-gated (happy)

source: REQ-GEN-14b
Given ENRICH opted in with a budget of 50 calls
When ENRICH runs
Then it halts at the 50-call budget — the loop is gated by the budget
teeth: breaks-on "ENRICH ignores the budget and runs to natural completion — the budget gate is absent"
gen: conformance

### REQ-GEN-14c — loops carry a fixpoint stop (happy)

### SCN-GEN-14c-1 — each loop carries a diminishing-returns / fixpoint stop (happy)

source: REQ-GEN-14c
Given REVIEW running until a no-revision round
When a round produces 0 revisions
Then REVIEW stops (fixpoint reached) — or on marginal value `< ε`, or loop-until-dry on the admission bar
teeth: breaks-on "REVIEW has no fixpoint predicate — it keeps looping after a no-revision round"
gen: conformance

### REQ-GEN-14d — no unbounded loop (guard)

### SCN-GEN-14d-1 — no deepening loop runs unbounded (guard)

source: REQ-GEN-14d
Given a pathological input that never reaches a natural fixpoint
When EXPAND runs on it
Then EXPAND still **terminates** at its budget / round bound — no loop runs unbounded
teeth: breaks-on "EXPAND lacks both a budget and a round cap — on the pathological input it loops forever (unbounded)"
gen: conformance

### REQ-GEN-14e — loops-off equals single pass (happy)

### SCN-GEN-14e-1 — with all loops off, cost == the GEN-13 single pass (happy)

source: REQ-GEN-14e
Given genesis run with REVIEW / ENRICH / EXPAND all off, vs the GEN-13 single cheap pass on the same rev
When the two costs are compared
Then they are **equal** — Δ=0 (loops-off adds no cost over the single pass)
teeth: breaks-on "an always-on ENRICH prologue runs even with loops off — loops-off costs more than the single pass (Δ > 0)"
gen: conformance

### REQ-GEN-14f — loops reuse existing machinery (happy)

### SCN-GEN-14f-1 — each loop reuses propose→verify / relate() (happy)

source: REQ-GEN-14f
Given the loop-runner implementation
When a loop's internals are inspected
Then each loop is built from the existing propose→verify harness and `relate()` — no bespoke pipeline
teeth: breaks-on "ENRICH ships its own parallel extraction pipeline — a loop does not reuse propose→verify"
gen: conformance

### REQ-GEN-14g — no new subsystem (guard)

### SCN-GEN-14g-1 — the deepening loops add no new subsystem (guard)

source: REQ-GEN-14g
Given the module graph before and after enabling the loops
When new top-level subsystems are counted
Then **0** new subsystems are added — loops live inside existing machinery
teeth: breaks-on "EXPAND introduces a standalone crawler subsystem — a new subsystem is added for a loop"
gen: conformance

### REQ-GEN-14h — no duplicate lazy enrichment (guard)

### SCN-GEN-14h-1 — loops do not duplicate born-from-work's free lazy enrichment (guard)

source: REQ-GEN-14h
Given born-from-work already provides free lazy enrichment on consult
When the ENRICH loop's scope is checked
Then it does **not** re-do born-from-work's lazy enrichment — no duplicated work
teeth: breaks-on "ENRICH eagerly pre-enriches every fact that born-from-work would lazily enrich for free — duplicated enrichment"
gen: conformance

---

## REQ-GEN-15 — history-thin fallback

### REQ-GEN-15a — degenerate history falls back (happy)

### SCN-GEN-15a-1 — degenerate history trips the pre-check → structural fallback (happy)

source: REQ-GEN-15a
Given a shallow clone (blame concentrated in 1 squash commit, commit count below threshold)
When the cheap pre-check runs before ranking
Then it detects degenerate history and switches the PPR **personalization vector to structural signals** (type / API-surface density, no history seeding)
teeth: breaks-on "the pre-check threshold is disabled — the shallow repo seeds PPR from the single squash commit and the personalization degenerates"
gen: conformance # oracle = `genesis/ref/fallback.ts`

### REQ-GEN-15b — history is booster not dependency (guard)

### SCN-GEN-15b-1 — history is a booster, never a dependency (guard)

source: REQ-GEN-15b
Given a repo with zero usable history (empty log)
When genesis ranks it
Then it still produces a **non-degenerate structural ranking** — history boosts but is not required
teeth: breaks-on "the ranker hard-requires history seeding — with an empty log it errors / returns no ranking (history is a dependency)"
gen: conformance

### REQ-GEN-15c — degrade to structural centrality (guard)

### SCN-GEN-15c-1 — degrades to structural centrality, not rank noise (guard)

source: REQ-GEN-15c
Given the degenerate-history fallback engaged on a shallow repo
When the fallback ranking is inspected
Then it is **structural centrality** (PPR over the def→ref graph + type-surface density) — a non-uniform, non-random frontier
teeth: breaks-on "the fallback returns a uniform / random ranking — degradation yields rank noise instead of structural centrality"
gen: conformance

---

## REQ-GEN-16 — usefulness graded a-posteriori

### REQ-GEN-16a — gate not on self-assessment (guard)

### SCN-GEN-16a-1 — the non-obvious ∧ actionable gate ignores proposer self-assessment (guard)

source: REQ-GEN-16a
Given a candidate carrying a high `self_score` / `importance` field from the proposer
When the admission gate evaluates it
Then admission reads **no** proposer self-assessment input — the decision is independent of `self_score`; and the STORED obviousness score is likewise independent of it, being computed by the harness's predicate over the source bytes (ADR-0012 does not amend this clause)
teeth: breaks-on "admission is gated on the proposer's `self_score ≥ 0.8` — the gate rests on self-assessment — or the stored obviousness score is read off a proposer-written field instead of computed"
gen: conformance # oracle = `genesis/ref/usefulness.ts` (reuses the KNOW-17 decay reference)

### REQ-GEN-16b — seed loose-but-thin (happy)

### SCN-GEN-16b-1 — genesis seeds loose-but-thin (happy)

source: REQ-GEN-16b
Given a concrete candidate `c_loose` — a plausible-but-unproven fact (grounded, non-obvious, but `0` measured `hits` yet)
When genesis seeds at admission-time
Then `c_loose` is **seeded** (loose-but-thin: usefulness deferred to measured `hits`, not a strict a-priori bar)
teeth: breaks-on "admission is tightened to a strict a-priori bar requiring proven usefulness — `c_loose` (`0` hits yet) is rejected, defeating the loose-but-thin + a-posteriori-hits design"
gen: conformance

### REQ-GEN-16c — accrue logged hits (happy)

### SCN-GEN-16c-1 — each seeded fact accrues logged hits on consult (happy)

source: REQ-GEN-16c
Given a seeded fact `F` served over several waves
When a wave consults `F`
Then `F`'s `hits` counter increments (KNOW-17) — usefulness is logged a-posteriori
teeth: breaks-on "consulting `F` does not increment its `hits` counter — usefulness is never measured (decay can't calibrate)"
gen: conformance

### REQ-GEN-16d — unconsulted fact decays out (guard)

### SCN-GEN-16d-1 — a fact no wave consults decays out, archived and re-enterable (guard)

source: REQ-GEN-16d
Given a seeded fact `F` with `hits == 0` across its full window
When the decay pass runs
Then `F` decays out of the served set — **archived and re-enterable** (not deleted)
teeth: breaks-on "an unconsulted fact (`hits==0`) stays in the served set forever — no decay (the served set only grows)"
gen: conformance

### REQ-GEN-16e — threshold calibrates on hits (happy)

### SCN-GEN-16e-1 — the admission threshold calibrates against observed hits (happy)

source: REQ-GEN-16e
Given an observed `hits` distribution over a window
When the admission threshold is recomputed
Then it is a function of observed hits — `threshold = f(hits)`, calibrated a-posteriori
teeth: breaks-on "the threshold is a hard-coded constant, ignoring observed hits — no calibration against measured usefulness"
gen: conformance

---

## Held-out second fixtures (Wave H · execution-GATE held-out leg → FULL assurance)

> **state:** S3 re-freeze (Wave H) · **owner:** charlie (FORGE) · **grounds:** invents **no** behaviour —
> each `-2` SCN witnesses the _same_ INV branch + teeth as its `-1` sibling on a **genuinely independent**
> fixture (different repo skeleton, mined candidate set, ranked frontier, budget, resume token). The GATE
> holds this second fixture back from the builder; an implementation that memorised the acme-repo fixture-1
> concrete values (a renamed clone) FAILS its held-out leg — every `-2` below carries DIFFERENT concrete data
> hitting the SAME behaviour, with its own `teeth: breaks-on`. This turns each conformance REQ's held-out leg
> AVAILABLE → **FULL assurance**.
>
> **Held-out fixture universe** (`beacon-repo@rev-1d0a`, an **independent** repo skeleton — mirrors
> `genesis/ref` shapes, shares **no** symbol / hash / frontier with the acme universe of §top):
>
> | id  | file::symbol                   | PPR rank | tier | subtreeHash | note                             |
> | --- | ------------------------------ | -------- | ---- | ----------- | -------------------------------- |
> | h1  | `billing/invoice.ts::finalize` | 0.88     | T0   | `st-e50`    | top blast, ranked #1             |
> | h2  | `billing/credit.ts::reverse`   | 0.63     | T1   | `st-f61`    | ranked #2 (near-tie with h3)     |
> | h3  | `session/key.ts::renew`        | 0.61     | T1   | `st-g72`    | ranked #3 (near-tie with h2)     |
> | h4  | `format/trim.ts::rtrim`        | 0.12     | T2   | `st-h83`    | cold tail, ranked #4             |
> | h5  | `text/wrap.ts::softwrap`       | 0.10     | T2   | `st-i94`    | ranked #5 (near-tie with h4)     |
> | v2  | `third_party/chart.min.js`     | —        | —    | —           | vendored, 0 churn, **un-ranked** |
>
> Frontier = {h1,h2,h3,h4,h5} (size **5** of 1200 repo symbols) ⇒ `--budget = min(5, 200) = 5`. PPR damping
> `0.85` pinned, seed pinned, ties broken by a stable total order. Skeleton hash of the held-out run = `sk-9b1c`.
> **Scope:** the 72 `gen: conformance` SCNs each get a held-out `-2` **except the 5 GEN-16 SCNs** (exempt —
> see §GEN-16 held-out note) ⇒ **67 held-out added**. The 3 `gen: PBT` SCNs (GEN-11a/b/c) are the
> determinism-law witnesses — their permutation property already ranges over inputs, so no single held-out
> fixture applies. Every `-2` restates only its `-1` sibling's behaviour on new data (grounded, no new INV).

### SCN-GEN-1a-2 — S0+S1 are $0-LLM pure functions of beacon-repo@rev-1d0a (held-out · happy)

source: REQ-GEN-1a
held_out: true # GATE holds this back; an impl overfit to the acme S0/S1 call-graph fails here
Given `beacon-repo@rev-1d0a`, the reference stages `genesis/ref/scan.ts` + `mine.ts`, and the beacon S0/S1 call-graph
When `scan(repo,rev)` then `mine(scan)` run and the S0/S1 import graph is scanned for any LLM client symbol
Then the skeleton `sk-9b1c` is produced spending **0 LLM calls** and **0** LLM symbols are reachable from the S0/S1 path — S0+S1 = pure `f(repo,rev)`
teeth: breaks-on "the beacon mine stage calls an LLM to score `billing/invoice.ts::finalize` — an LLM client symbol enters the S0/S1 call graph and the $0-purity assertion fails"
gen: conformance

### SCN-GEN-1b-2 — same rev → byte-identical beacon skeleton (held-out · happy)

source: REQ-GEN-1b
held_out: true # different repo@rev, same byte-identity reproducibility property (HARD RULE 5)
Given the skeleton `sk-9b1c` from a first run over `rev-1d0a`
When genesis re-runs `scan∘mine` on the identical rev and the two skeletons are compared byte-for-byte
Then the second skeleton is **byte-identical** to `sk-9b1c`
teeth: breaks-on "scan orders beacon files by inode/readdir order (nondeterministic) — the re-run reorders nodes and diverges from `sk-9b1c`"
gen: conformance

### SCN-GEN-1c-2 — same rev → byte-identical beacon ranking (held-out · happy)

source: REQ-GEN-1c
held_out: true # different repo@rev, still asserts reproducible ranking (HARD RULE 5; determinism arm delegated to GEN-11)
Given the ranking `[h1,h2,h3,h4,h5]` from a first run over `rev-1d0a`
When genesis re-runs and the two rankings are compared byte-for-byte
Then the ranking is byte-identical `[h1,h2,h3,h4,h5]`
teeth: breaks-on "the ranker seeds PPR from an unpinned RNG — the re-run permutes the near-tie h2/h3 pair and the ranking diverges"
gen: conformance

### SCN-GEN-2a-2 — the un-ranked vendored `v2` receives 0 LLM calls (held-out · guard)

source: REQ-GEN-2a
held_out: true
Given the ranked frontier {h1,h2,h3,h4,h5} and the un-ranked vendored file `v2` (not in the frontier)
When the spend scheduler runs to completion
Then `v2` receives **0** LLM calls — every visited site ∈ the ranked set
teeth: breaks-on "the scheduler falls back to a repo-wide walk after draining the 5-site frontier — `v2` gets an LLM call though it was never ranked"
gen: conformance

### SCN-GEN-2b-2 — calls issue in strictly descending PPR order over 5 sites (held-out · happy)

source: REQ-GEN-2b
held_out: true
Given the ranked frontier `[h1(0.88), h2(0.63), h3(0.61), h4(0.12), h5(0.10)]`
When the scheduler issues its bounded calls and the call order is recorded
Then the call sequence is exactly `[h1,h2,h3,h4,h5]` — strictly descending PPR, highest-first
teeth: breaks-on "the scheduler pops the frontier FIFO by discovery order — h3 is called before h2 (not highest-first)"
gen: conformance

### SCN-GEN-2c-2 — exactly one bounded call for h1 (held-out · happy)

source: REQ-GEN-2c
held_out: true
Given the scheduler visiting `h1`
When `h1` is processed
Then `h1` receives **exactly one** bounded (token-capped) LLM call and is never re-called — `call-count(h1) = 1`
teeth: breaks-on "self-consistency samples `h1` five times — `call-count(h1) = 5` (more than one call per site)"
gen: conformance

### SCN-GEN-2d-2 — total spend capped at min(frontier_size, 200) on beacon (held-out · happy)

source: REQ-GEN-2d
held_out: true
Given a frontier of size 5 → `budget = min(5,200) = 5`, and a fixture frontier of size 750 → `budget = min(750,200) = 200`
When the scheduler runs each to completion
Then total LLM calls ≤ 5 in the first and ≤ 200 in the second — the hard ceiling holds in both
teeth: breaks-on "budget is computed as `max(frontier,200)` — the 750-site frontier spends 750 calls, blowing the 200 ceiling"
gen: conformance

### SCN-GEN-2e-2 — halt when the trailing-20 admit-rate < 20% (2 of 20) (held-out · happy)

source: REQ-GEN-2e
held_out: true
Given a beacon run where the last 20 completed sites admitted only 2 candidates (admit-rate 10% `< 20%`)
When the scheduler evaluates the trailing-20 admit-rate after site 20
Then genesis **halts** — no further ranked site is called
teeth: breaks-on "the halt boundary is written with `>=` (10% read as passing) — the run drives past the diminishing-returns floor and drains the whole budget"
gen: conformance

### SCN-GEN-2f-2 — no whole-repo LLM sweep on the 1200-symbol beacon repo (held-out · guard)

source: REQ-GEN-2f
held_out: true
Given the beacon repo with 5 ranked sites out of 1200 total symbols
When the whole run completes and the visited-site set is compared to the total symbol set
Then LLM was spent on ≤ 5 ranked sites — the 1195 un-ranked symbols got **0** calls (no repo-wide sweep)
teeth: breaks-on "a final catch-all pass sweeps every symbol — LLM calls scale to 1200 (a repo-wide sweep)"
gen: conformance

### SCN-GEN-3a-2 — beacon call-count = f(frontier), invariant to line count (held-out · happy)

source: REQ-GEN-3a
held_out: true
Given two revs of beacon-repo with the **same** frontier {h1..h5} but rev-Q carrying 4× the total line count of rev-P (all in un-churned files)
When genesis runs on each and the call-counts are compared
Then `call-count(P) == call-count(Q) == 5` — cost is a function of the frontier, invariant to line count
teeth: breaks-on "the accountant sizes spend by file/line totals — rev-Q (4× lines) spends 4× the calls"
gen: conformance

### SCN-GEN-3b-2 — +25k un-churned lines → Δspend = 0 on beacon (held-out · guard)

source: REQ-GEN-3b
held_out: true
Given a baseline run over `rev-1d0a` with `call-count = 5`, and a fixture rev that **adds 25,000 lines of never-committed-churn code** (a new vendored bundle, 0 SZZ, 0 hotspot)
When genesis runs on the +25k-lines rev
Then the call-count is still 5 — **Δspend = 0** (differential / metamorphic)
teeth: breaks-on "the frontier is seeded from raw file size — the +25k-line bundle enters the frontier and adds LLM calls (Δ > 0)"
gen: conformance

### SCN-GEN-4a-2 — a beacon seed carries its re-deriving subtreeHash `st-e50` (held-out · happy)

source: REQ-GEN-4a
held_out: true
Given a seeded fact `G` citing `billing/invoice.ts::finalize@st-e50`
When `atlas-emit` re-derives the citation at `source@sha`
Then `G` is grounded and **carries the re-derived `subtreeHash` `st-e50`** in its stored record
teeth: breaks-on "the emit-gate stores `G` with an **unpopulated/stale** subtreeHash (skips the recompute) — `G` is emitted carrying `∅`/`st-OLD` instead of `st-e50`, breaking its later drift-check"
gen: conformance

### SCN-GEN-4b-2 — a beacon seed clears the truth door and carries a score (held-out · happy)

source: REQ-GEN-4b
held_out: true
Given a seed on `billing/credit.ts::reverse` that is grounded (`st-f61` re-derives) **and** non-obvious (it does not merely restate a type signature)
When `atlas-emit` applies the truth door and the harness's obviousness predicate
Then the seed is emitted (`emitted:true`) and its stored record **carries an obviousness score** (TOTALITY)
teeth: breaks-on "the emitted beacon seed carries **no** obviousness score (totality violated), or a resurrected obviousness gate drops it"
gen: conformance

### SCN-GEN-4c-2 — ungrounded beacon seed → emitted:false; obvious one → scored (held-out · guard)

source: REQ-GEN-4c
held_out: true
Given seed `U2` whose citation does **not** re-derive at `source@sha`, and seed `O2` that is obvious (restates that `rtrim(s)` strips trailing whitespace) but grounds cleanly
When `atlas-emit` applies the truth door to each
Then `U2` is rejected — `emitted:false` — and `O2` **is emitted**, carrying a low obviousness score (ADR-0012)
teeth: breaks-on "the gate downgrades a failed grounding door to a warning — the ungrounded seed `U2` is emitted anyway — or a resurrected obviousness gate drops `O2`"
gen: conformance

### SCN-GEN-4d-2 — a beacon seed cannot self-declare true (held-out · guard)

source: REQ-GEN-4d
held_out: true
Given a candidate on `session/key.ts::renew` carrying `self_asserted:true` / `confidence:1.0` and **no** external grounding
When the emit-gate evaluates it
Then the self-declaration is ignored — admission depends only on the mechanical truth door; the seed is rejected
teeth: breaks-on "the gate reads the candidate's own `self_asserted` flag as sufficient — the ungrounded seed self-promotes to a fact"
gen: conformance

### SCN-GEN-5a-2 — beacon genesis output is candidate-only (held-out · happy)

source: REQ-GEN-5a
held_out: true
Given genesis completing a beacon run that produces 9 seeds
When the written objects' status fields are inspected
Then all 9 are written as `candidate` — **0** are written `ratified`
teeth: breaks-on "genesis writes a high-confidence beacon seed directly as `ratified` — a non-candidate enters the store from genesis"
gen: conformance

### SCN-GEN-5b-2 — T0/contested beacon facts ratified via a batched, ranked interview (held-out · happy)

source: REQ-GEN-5b
held_out: true
Given 6 T0/contested candidates awaiting ratification
When the ratification interview is assembled
Then they are presented as **one batched, ranked** interview (batch size > 1, capped 20 Q/session) for human ratification
teeth: breaks-on "the router ratifies each candidate the moment it is proposed with no human interview — the batched-interview edge is bypassed"
gen: conformance

### SCN-GEN-5c-2 — no auto-promote edge for the T0 candidate on `finalize` (held-out · guard)

source: REQ-GEN-5c
held_out: true
Given the T0 candidate on `billing/invoice.ts::finalize` in the ratify-router state machine
When the router's edges are enumerated
Then the **only** edge to `ratified` passes through `interview(batch)` — no `candidate→ratified` edge bypasses the human
teeth: breaks-on "an `auto_promote(tier==T0)` edge is added — the finalize candidate reaches ratified with no interview"
gen: conformance

### SCN-GEN-5d-2 — the beacon interview is never one-question-at-a-time (held-out · guard)

source: REQ-GEN-5d
held_out: true
Given 6 contested beacon candidates
When the interview is emitted
Then the batch carries **>1** ranked question per session — never a single-question drip
teeth: breaks-on "the interview emits one question, waits, then emits the next — batch size collapses to 1 (one-at-a-time)"
gen: conformance

### SCN-GEN-6a-2 — beacon mined signals feed only the rank field (held-out · happy)

source: REQ-GEN-6a
held_out: true
Given `billing/invoice.ts::finalize` with hotspot, SZZ, coupling, and ownership signals
When the miner routes those signals
Then they land only in the candidate's `rank` field — **never** in `Fact[]`
teeth: breaks-on "the miner writes the finalize SZZ score directly into the fact set — a mined signal becomes a fact without grounding"
gen: conformance

### SCN-GEN-6b-2 — an ungrounded beacon signal is not served as a fact (held-out · guard)

source: REQ-GEN-6b
held_out: true
Given a high-hotspot `session/key.ts::renew` with a signal but **no** grounded + ratified invariant
When the served fact set is queried
Then the signal is **absent** from the fact set — it stays a rank heuristic until grounded ∧ ratified
teeth: breaks-on "the served set includes ungrounded signals as facts — the un-ratified renew hotspot is served as truth"
gen: conformance

### SCN-GEN-6c-2 — high churn/SZZ on `billing/credit.ts` + no invariant → 0 facts (held-out · guard)

source: REQ-GEN-6c
held_out: true
Given `billing/credit.ts::reverse` with top-decile churn and high SZZ but **no** grounded invariant extracted
When genesis processes it
Then **0** facts are minted from it — churn/SZZ alone mints nothing
teeth: breaks-on "the miner mints a 'this file is important' fact from the churn signal alone — 1 fact from 0 grounded invariants"
gen: conformance

### SCN-GEN-7a-2 — beacon genesis hands off, leaves no sweeper (held-out · happy)

source: REQ-GEN-7a
held_out: true
Given genesis completing its one-time seeding pass over beacon-repo
When the run finishes
Then control is handed to born-from-work (KNOW-13) — **no** standing genesis sweeper process remains
teeth: breaks-on "genesis registers a daemon that keeps re-sweeping beacon-repo — control is never handed off"
gen: conformance

### SCN-GEN-7b-2 — genesis∘genesis produces 0 duplicate beacon facts (held-out · happy)

source: REQ-GEN-7b
held_out: true
Given a first run that grounded facts {G1,G2,G3,G4}
When genesis is run a second time on `rev-1d0a`
Then the second run **upserts by fact id** — 0 duplicate facts (`genesis∘genesis ≡ genesis` on the grounded set)
teeth: breaks-on "the re-run inserts facts unconditionally — {G1,G2,G3,G4} are duplicated to 8 facts (upsert degrades to append)"
gen: conformance

### SCN-GEN-7c-2 — a beacon re-run re-indexes only changed files (held-out · happy)

source: REQ-GEN-7c
held_out: true
Given a first run over `rev-1d0a`, then `rev-1e2` that changes exactly 2 files
When genesis re-runs on `rev-1e2`
Then only those 2 changed files' nodes are re-indexed — the untouched files are not re-processed
teeth: breaks-on "the re-run re-indexes the whole repo regardless of the diff — every file is re-processed (non-incremental)"
gen: conformance

### SCN-GEN-8a-2 — an interrupted beacon run resumes from the last completed site (held-out · happy)

source: REQ-GEN-8a
held_out: true
Given a run killed after completing h1,h2,h3 of `[h1,h2,h3,h4,h5]`, with a persisted `resumeToken` pointing at h3
When genesis is restarted with the `resumeToken`
Then it resumes at **h4** — h1,h2,h3 are not re-called (resume from the last completed ranked site)
teeth: breaks-on "restart ignores the `resumeToken` and re-processes from h1 — h1,h2,h3 get a second LLM call (no resume)"
gen: conformance

### SCN-GEN-8b-2 — a truncated-packfile beacon clone yields an honest partial skeleton (held-out · guard)

source: REQ-GEN-8b
held*out: true
Given a malformed input — a beacon clone with a **truncated packfile** (most objects readable, one pack object corrupt)
When genesis runs on it
Then it returns an honest partial `GenesisReport` + a `resumeToken` — the reachable objects are skeletonized, the corrupt pack object reported missing
teeth: breaks-on "the truncated pack produces a fabricated \_full* skeleton (invented nodes for the unreadable pack object) instead of an honest partial"
gen: conformance # PBT-fuzz differential over malformed clones; tag stays reference-model (§GEN-8)

### SCN-GEN-8c-2 — a distinct malformed-repo fuzz family never throws (held-out · guard)

source: REQ-GEN-8c
held_out: true
Given a **held-out** PBT-fuzz stream of malformed repos/revs (symlink cycles, zero-byte blobs, a gitlink to a missing submodule commit, CRLF-corrupt paths) — 20k corner-biased cases disjoint from the SCN-8c-1 family
When each is fed to every genesis entry point side-by-side with the total reference pipeline
Then every call returns a `Result` / partial report — **0** exceptions thrown; prod matches ref
teeth: breaks-on "a symlink-cycle input propagates an uncaught stack-overflow instead of a structured partial report"
gen: conformance # PBT-fuzz differential vs the total reference `genesis/ref/*.ts`

### SCN-GEN-9a-2 — beacon genesis seeds every Awareness facet's source (held-out · happy)

source: REQ-GEN-9a
held_out: true
Given a beacon repo with a ratified T0 manifest and `STYLE.md@sha` (the beacon conventions artifact)
When genesis assembles Awareness
Then it creates the sources each facet rolls up from — `constitution` from the T0 manifest, `taste` at `STYLE.md@sha`, the `mission` stub
teeth: breaks-on "genesis leaves the `taste` facet with no source object though `STYLE.md` exists — a rollup source is missing"
gen: conformance

### SCN-GEN-9b-2 — a source-less beacon facet renders UN-SEEDED (held-out · guard)

source: REQ-GEN-9b
held_out: true
Given the `mission` facet for which no DEFINE artifact exists in beacon-repo (no source)
When Awareness renders the facet
Then it renders the `UN-SEEDED` sentinel — not a value
teeth: breaks-on "the source-less `mission` facet renders as an empty-but-present value instead of `UN-SEEDED` (a hole masquerades as seeded)"
gen: conformance

### SCN-GEN-9c-2 — a source-less beacon facet is never fabricated (held-out · guard)

source: REQ-GEN-9c
held_out: true
Given the source-less `mission` facet in beacon-repo
When Awareness assembles
Then **no** fabricated `mission` value is invented (MEM-11) — it stays `UN-SEEDED`
teeth: breaks-on "Awareness synthesizes a plausible `mission` string from `README.md` — a facet is fabricated with no source"
gen: conformance

### SCN-GEN-9d-2 — the beacon mission stub stays unratified (held-out · guard)

source: REQ-GEN-9d
held_out: true
Given the beacon `mission` stub and no ratified DEFINE artifact
When Awareness is assembled and the stub's flag is read
Then the stub carries `unratified:true` — it never presents as ratified
teeth: breaks-on "the mission stub is emitted with `ratified:true` before any DEFINE artifact exists"
gen: conformance

### SCN-GEN-10a-2 — each beacon stage binds a named, deterministic mechanism (held-out · happy)

source: REQ-GEN-10a
held_out: true
Given the stage registry (scan→tree-sitter/SCIP/stack-graphs, rank→SZZ/hotspots/coupling/PPR, check→CodeQL/Semgrep) applied to beacon-repo
When each stage's bound mechanism is enumerated
Then every stage maps to a named deterministic mechanism from the admissible set — **none** unbound
teeth: breaks-on "the check stage binds an unnamed 'AI linter' not in the registry — a stage runs an unregistered mechanism"
gen: conformance

### SCN-GEN-10b-2 — zero embedding/vector/ANN in the beacon index or rank path (held-out · guard)

source: REQ-GEN-10b
held_out: true
Given the beacon index / rank / check dependency graph
When the import graph is scanned for embedding, vector-store, and ANN symbols
Then **0** are reachable — retrieval and ranking are explicit graph/query mechanisms (A-14)
teeth: breaks-on "the ranker imports a FAISS-style ANN index to pre-cluster sites — an ANN symbol enters the rank path (A-14 violated)"
gen: conformance

### SCN-GEN-12a-2 — in S2 the LLM only proposes a typed candidate for h1 (held-out · happy)

source: REQ-GEN-12a
held_out: true
Given stage S2 processing site `h1`
When the LLM is invoked
Then its output is a **typed candidate proposal only** — it does not write to the fact set or cast the admission decision
teeth: breaks-on "the LLM's output for `h1` is written straight into the fact set — the model acts as an oracle, not a proposer"
gen: conformance

### SCN-GEN-12b-2 — beacon admission is decided by the mechanical harness (held-out · happy)

source: REQ-GEN-12b
held_out: true
Given a typed candidate proposed by the LLM for `billing/credit.ts::reverse`
When admission runs
Then the admit/reject decision comes only from the mechanical harness (compile ∧ HOLDS ∧ mutant-flip) — the model casts no admission vote
teeth: breaks-on "admission reads the model's `confidence` score as the deciding factor — admission is no longer mechanical"
gen: conformance

### SCN-GEN-12c-2 — a beacon check that won't compile or won't HOLDS is not admitted (held-out · guard)

source: REQ-GEN-12c
held_out: true
Given predicate candidate `P2` on `session/key.ts::renew` whose synthesized check either (i) fails to compile or (ii) compiles but returns **BROKEN** on the current code
When the admit-harness evaluates `P2`
Then `P2` is **not** admitted in either case — admission requires compile ∧ HOLDS-on-current-code
teeth: breaks-on "the harness admits `P2` on 'compiles' alone without evaluating HOLDS — a check that is BROKEN on current code is admitted"
gen: conformance

### SCN-GEN-12d-2 — a failing beacon check is refined ≤K then dropped (held-out · guard)

source: REQ-GEN-12d
held_out: true
Given predicate candidate `P2` whose check returns BROKEN (a counterexample), with `K=1`
When the harness processes `P2`
Then it refines `P2` at most once; if still BROKEN it is **dropped** — `P2` is never forced into the fact set
teeth: breaks-on "on a persistent BROKEN check the harness disables the check and admits `P2` anyway (forces the fact) instead of dropping it"
gen: conformance

### SCN-GEN-12e-2 — an obvious beacon advisory is admitted with a low score (held-out · guard)

source: REQ-GEN-12e
held_out: true
Given advisory candidate `A2` on `format/trim.ts::rtrim` that is grounded but **obvious** (restates a public type signature)
When the admit-harness applies the truth door and the harness's obviousness predicate
Then `A2` **is** admitted, carrying a **low obviousness score** — an advisory is blocked only by the truth door (ADR-0012)
teeth: breaks-on "a resurrected obviousness gate — `A2` is dropped — or `A2` is admitted with no obviousness score (totality violated)"
gen: conformance

### SCN-GEN-12f-2 — beacon chain-of-thought is scratch, never a fact (held-out · guard)

source: REQ-GEN-12f
held_out: true
Given an LLM proposal for `h2` whose reasoning trace (chain-of-thought) is captured in the harness scratch buffer
When the run's persisted fact set is inspected
Then **no** chain-of-thought text is persisted — only the admitted typed candidate; the scratch is discarded
teeth: breaks-on "the reasoning trace is stored as an advisory fact — chain-of-thought is persisted as truth"
gen: conformance

### SCN-GEN-12g-2 — abstention with a grounded why-not on h3 is valid (held-out · happy)

source: REQ-GEN-12g
held_out: true
Given site `h3` where the LLM finds no groundable invariant and returns an abstention with a grounded why-not
When the harness records the outcome
Then abstention is accepted as a **valid outcome** — 0 facts, a recorded grounded why-not, no retry-forcing
teeth: breaks-on "abstention is treated as failure and `h3` is retried until it emits a fact — abstention is not a valid outcome"
gen: conformance

### SCN-GEN-12h-2 — the model is not pressured to emit on h5 (held-out · guard)

source: REQ-GEN-12h
held_out: true
Given the proposal step for site `h5` (cold tail, likely nothing groundable to say)
When the proposal step runs
Then the model may return **0** candidates with no reward/penalty steering it toward emitting — no "you must produce a fact" pressure
teeth: breaks-on "the harness re-prompts 'you must return at least one fact' until the model emits — the model is pressured to emit on `h5`"
gen: conformance

### SCN-GEN-12i-2 — an admitted beacon predicate is labelled a likely invariant (held-out · happy)

source: REQ-GEN-12i
held_out: true
Given an admitted predicate `P2` on `billing/invoice.ts::finalize` (compiled, HOLDS on current code, flips to BROKEN on a mutant of `st-e50`)
When `P2`'s label is read
Then it is labelled `machine-checked likely invariant` — never `proof` / `theorem` / ∀-input
teeth: breaks-on "`P2` is labelled a `proven invariant` — a sampled-current-code check is misrepresented as a ∀-input proof"
gen: conformance

### SCN-GEN-12j-2 — a beacon check that survives every mutant is dropped as vacuous (held-out · guard) ★ held-out leg of the block's teeth axis

source: REQ-GEN-12j
held*out: true
Given predicate candidate `V2` whose synthesized check returns **HOLDS** on the current code **and** also returns HOLDS on \_every* mechanically-mutated counterfactual of the anchored subtree `st-e50` — i.e. it flips to BROKEN on **0** mutants (a tautology / matches nothing)
When the admit-harness runs the mutation-flip gate — this held-out golden asserts the same **META-property** (mutation-of-the-mutation) on independent data: _a synthesized check with no teeth is REJECTED_
Then `V2` is **dropped as vacuous** — admission requires HOLDS-on-current ∧ BROKEN-on-≥1-mutant, and `V2` fails the second conjunct
teeth: breaks-on "the harness admits on HOLDS alone and **skips the mutant-flip conjunct** — the tautological check `V2` (survives every mutant of `st-e50`) is admitted, i.e. a toothless check enters the Atlas as a fact"
gen: conformance # held-out witness of the teeth-gate META-property on the independent beacon subtree st-e50

### SCN-GEN-12k-2 — a type-expressible beacon slot prefers the type-checker / LSP (held-out · happy)

source: REQ-GEN-12k
held_out: true
Given a `contract` slot on `session/key.ts::renew` that is expressible in the language's type system
When the check is selected
Then it uses the language **type-checker / LSP diagnostics** (sound, `$0` — the compiler already ran) — not a synthesized CodeQL/Semgrep query
teeth: breaks-on "the renew contract is checked by a synthesized Semgrep query instead of the sound compiler — an unsound approximate check replaces the `$0` sound one"
gen: conformance

### SCN-GEN-13a-2 — base tier runs a single grounded proposal on h3, extras off (held-out · happy)

source: REQ-GEN-13a
held_out: true
Given a base-tier site `h3` (not high-value ∧ uncertain)
When it is processed
Then exactly one LLM call fires and every extra mechanism (self-consistency, refuter, CEGIS>1, CodeQL) is **off**
teeth: breaks-on "self-consistency is on by default at the base tier — `h3` costs 3 samples instead of 1"
gen: conformance

### SCN-GEN-13b-2 — a mechanism switches on only when high-value ∧ uncertain (held-out · happy)

source: REQ-GEN-13b
held_out: true
Given site `h1` (T0, high blast) flagged **uncertain**, `h2` (T1, high blast) flagged **certain**, and `h4` (low tier) flagged **certain**
When the escalation predicate runs
Then extra mechanisms switch on for `h1` only — `h2` (high-value **but certain**) and `h4` both stay at the single-proposal base
teeth: breaks-on "escalation fires on high-value alone (drops the uncertainty conjunct) — `h2` (high-value ∧ certain) needlessly escalates instead of staying at base"
gen: conformance

### SCN-GEN-13c-2 — the beacon default is one sample, no self-consistency (held-out · happy)

source: REQ-GEN-13c
held_out: true
Given the default cost policy with no escalation
When a beacon site is proposed
Then exactly **one** sample is drawn — no self-consistency voting
teeth: breaks-on "the default draws 5 samples and majority-votes — self-consistency is on by default"
gen: conformance

### SCN-GEN-13d-2 — a beacon candidate defaults to advisory unless checkable ∧ tier≥T1 (held-out · happy)

source: REQ-GEN-13d
held_out: true
Given candidate `A2` on `text/wrap.ts::softwrap` (not mechanically checkable) and candidate `B2` on `billing/credit.ts::reverse` (checkable ∧ tier T1)
When their kinds are assigned
Then `A2` defaults to **advisory**; only `B2` (checkable ∧ tier≥T1) becomes a predicate
teeth: breaks-on "the un-checkable `A2` is admitted as a predicate — the checkable∧T1 guard is dropped"
gen: conformance

### SCN-GEN-13e-2 — beacon CEGIS default refinement bound is K≤1 (held-out · happy)

source: REQ-GEN-13e
held_out: true
Given the default CEGIS config
When a beacon check needs refinement
Then at most **1** refine round runs (`K≤1`) before drop
teeth: breaks-on "the default CEGIS bound is `K=8` — refinement loops 8× per candidate by default (cost blow-up)"
gen: conformance

### SCN-GEN-13f-2 — the refuter runs only for the T0 beacon candidate (held-out · guard)

source: REQ-GEN-13f
held_out: true
Given the T1 candidate `h2` and the T0 candidate `h1`
When the cost policy decides whether to run the refuter
Then the refuter runs for `h1` (T0) **only** — the T1 candidate `h2` skips it
teeth: breaks-on "the refuter runs for every tier — the T2 candidate `h4` invokes the small-model refuter (cost leak)"
gen: conformance

### SCN-GEN-13g-2 — Semgrep is attempted before CodeQL on beacon (held-out · happy)

source: REQ-GEN-13g
held_out: true
Given a beacon check expressible in either Semgrep or CodeQL
When the analyzer is chosen
Then **Semgrep** (cheaper) is attempted first; CodeQL only if Semgrep cannot express it
teeth: breaks-on "CodeQL is invoked first by default — the expensive analyzer runs before the cheap one"
gen: conformance

### SCN-GEN-13h-2 — the beacon query DB is built once, never per-check (held-out · guard)

source: REQ-GEN-13h
held_out: true
Given 30 checks over the same beacon repo that require a CodeQL DB
When the checks run
Then the DB is built **once** and amortized across all 30 — never rebuilt per-check
teeth: breaks-on "the DB is rebuilt for each check — 30 checks trigger 30 DB builds (per-check cost)"
gen: conformance

### SCN-GEN-13i-2 — beacon genesis requires no whole-repo pass (held-out · guard)

source: REQ-GEN-13i
held_out: true
Given a run scoped to the frontier {h1..h5} in a 1200-symbol repo
When genesis executes
Then it completes without a whole-repo pass — the 1195 non-frontier symbols are not analyzed
teeth: breaks-on "a mandatory whole-repo CodeQL pass runs before extraction — genesis requires analyzing all 1200 symbols"
gen: conformance

### SCN-GEN-13j-2 — beacon genesis is scopable to a subtree (held-out · happy)

source: REQ-GEN-13j
held_out: true
Given `--scope billing/` limiting the run to the billing subtree
When genesis runs
Then only `billing/` sites (h1,h2) are processed; the cold tail (`session/`, `format/`, `text/`) is left to born-from-work
teeth: breaks-on "the `--scope` flag is ignored — genesis processes the whole tree regardless (not scopable)"
gen: conformance

### SCN-GEN-13k-2 — the beacon GenesisReport carries per-stage cost (held-out · happy)

source: REQ-GEN-13k
held_out: true
Given a completed beacon run
When the `GenesisReport` is inspected
Then it carries a **per-stage** cost breakdown (scan / mine / rank / extract) under the ceiling
teeth: breaks-on "the report carries only a single lump total — per-stage cost is not reported"
gen: conformance

### SCN-GEN-14a-2 — beacon REVIEW / ENRICH / EXPAND are opt-in or default-shallow (held-out · happy)

source: REQ-GEN-14a
held_out: true
Given the default config on beacon-repo
When the loop settings are read
Then each of REVIEW, ENRICH, EXPAND is off / default-shallow — none runs deep unless opted in
teeth: breaks-on "REVIEW defaults to deep (8 rounds) — a deepening loop runs deep without being opted in"
gen: conformance

### SCN-GEN-14b-2 — each beacon deepening loop is budget-gated (held-out · happy)

source: REQ-GEN-14b
held_out: true
Given ENRICH opted in with a budget of 30 calls
When ENRICH runs
Then it halts at the 30-call budget — the loop is gated by the budget
teeth: breaks-on "ENRICH ignores the budget and runs to natural completion — the budget gate is absent"
gen: conformance

### SCN-GEN-14c-2 — each beacon loop carries a diminishing-returns / fixpoint stop (held-out · happy)

source: REQ-GEN-14c
held_out: true
Given EXPAND running until a no-new-node round
When a round produces 0 new nodes
Then EXPAND stops (fixpoint reached) — or on marginal value `< ε`, or loop-until-dry on the admission bar
teeth: breaks-on "EXPAND has no fixpoint predicate — it keeps looping after a no-new-node round"
gen: conformance

### SCN-GEN-14d-2 — no beacon deepening loop runs unbounded (held-out · guard)

source: REQ-GEN-14d
held_out: true
Given a pathological beacon input that never reaches a natural fixpoint
When ENRICH runs on it
Then ENRICH still **terminates** at its budget / round bound — no loop runs unbounded
teeth: breaks-on "ENRICH lacks both a budget and a round cap — on the pathological input it loops forever (unbounded)"
gen: conformance

### SCN-GEN-14e-2 — with all beacon loops off, cost == the GEN-13 single pass (held-out · happy)

source: REQ-GEN-14e
held_out: true
Given beacon genesis run with REVIEW / ENRICH / EXPAND all off, vs the GEN-13 single cheap pass on `rev-1d0a`
When the two costs are compared
Then they are **equal** — Δ=0 (loops-off adds no cost over the single pass)
teeth: breaks-on "an always-on REVIEW prologue runs even with loops off — loops-off costs more than the single pass (Δ > 0)"
gen: conformance

### SCN-GEN-14f-2 — each beacon loop reuses propose→verify / relate() (held-out · happy)

source: REQ-GEN-14f
held_out: true
Given the beacon loop-runner implementation
When a loop's internals are inspected
Then each loop is built from the existing propose→verify harness and `relate()` — no bespoke pipeline
teeth: breaks-on "EXPAND ships its own parallel extraction pipeline — a loop does not reuse propose→verify"
gen: conformance

### SCN-GEN-14g-2 — the beacon deepening loops add no new subsystem (held-out · guard)

source: REQ-GEN-14g
held_out: true
Given the beacon module graph before and after enabling the loops
When new top-level subsystems are counted
Then **0** new subsystems are added — loops live inside existing machinery
teeth: breaks-on "REVIEW introduces a standalone indexer subsystem — a new subsystem is added for a loop"
gen: conformance

### SCN-GEN-14h-2 — beacon loops do not duplicate born-from-work's lazy enrichment (held-out · guard)

source: REQ-GEN-14h
held_out: true
Given born-from-work already provides free lazy enrichment on consult
When the beacon ENRICH loop's scope is checked
Then it does **not** re-do born-from-work's lazy enrichment — no duplicated work
teeth: breaks-on "ENRICH eagerly pre-enriches every fact that born-from-work would lazily enrich for free — duplicated enrichment"
gen: conformance

### SCN-GEN-15a-2 — degenerate beacon history trips the pre-check → structural fallback (held-out · happy)

source: REQ-GEN-15a
held_out: true
Given a beacon mirror imported as a **single squash commit** (blame concentrated in 1 commit, commit count below threshold)
When the cheap pre-check runs before ranking
Then it detects degenerate history and switches the PPR **personalization vector to structural signals** (type / API-surface density, no history seeding)
teeth: breaks-on "the pre-check threshold is disabled — the squashed repo seeds PPR from the single squash commit and the personalization degenerates"
gen: conformance

### SCN-GEN-15b-2 — beacon history is a booster, never a dependency (held-out · guard)

source: REQ-GEN-15b
held_out: true
Given a beacon repo with zero usable history (empty log)
When genesis ranks it
Then it still produces a **non-degenerate structural ranking** — history boosts but is not required
teeth: breaks-on "the ranker hard-requires history seeding — with an empty log it errors / returns no ranking (history is a dependency)"
gen: conformance

### SCN-GEN-15c-2 — beacon fallback degrades to structural centrality, not rank noise (held-out · guard)

source: REQ-GEN-15c
held_out: true
Given the degenerate-history fallback engaged on the squashed beacon repo
When the fallback ranking is inspected
Then it is **structural centrality** (PPR over the def→ref graph + type-surface density) — a non-uniform, non-random frontier
teeth: breaks-on "the fallback returns a uniform / random ranking — degradation yields rank noise instead of structural centrality"
gen: conformance

### §GEN-16 held-out note — EXEMPT (a-posteriori usefulness, no write-time oracle)

The 5 GEN-16 SCNs (16a..16e) are **exempt** from the held-out second-fixture leg — noted here, not skipped
silently. GEN-16's invariant is \*usefulness graded **a-posteriori\***: there is **no write-time oracle** a
builder could overfit to (usefulness is a _measured_ outcome via `hits` / decay over serving waves — not a
correctness oracle to model; method-tags-gen.md §Refuse-to-model, "usefulness a-priori"). The held-out
mechanism guards against overfitting a synthesizable **write-time** check to fixture-1's concrete values;
with no write-time oracle to overfit, a second genesis-time repo skeleton would witness nothing the `-1` SCN
does not. The a-posteriori arms (`hits` accrual 16c, decay 16d, threshold calibration 16e) are exercised over
serving **time** and are covered by the reused KNOW-17 hits/decay reference, not by a second write-time
fixture. No new behaviour is asserted; flagged for the coverage ledger.

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 75/75 REQ have ≥1 SCN (GEN-1..16, all clauses).
- **Guard coverage:** 32/32 unwanted-behaviour / If-then / While / negative REQ have a guard SCN —
  2a, 2f, 3b, 4c, 4d, 5c, 5d, 6b, 6c, 8b, 8c, 9b, 9c, 9d, 10b, 11b, 12c, 12d, 12e, 12f, 12h, 12j, 13f, 13h, 13i,
  14d, 14g, 14h, 15b, 15c, 16a, 16d. The remaining 43 are happy-path SCNs.
- **Teeth (Gate 3):** 75/75 SCN name the exact mutant of their REQ they flip to BROKEN on; **none vacuous**,
  none antecedent-failure. Witnesses are interesting (a real un-ranked vendored file for 2a; a real +10k-line
  differential for 3b; a genuine 2-writer degenerate-history repo for 15a/b/c; a genuine tautological check for
  12j). **GEN-12j is the block's teeth axis** — its golden asserts the META-property (mutation-of-the-mutation):
  the mutant is the _harness itself dropping its mutation-flip conjunct_, admitting a toothless check.
- **gen histogram:** PBT 3 (11a/11b/11c — the one determinism law) · conformance 72 (all reference-model INVs;
  8b/8c are PBT-fuzz differentials but tag stays reference-model per §GEN-8) · residue 0 (every slot has a
  pure/total oracle or the PBT law — no oracle-less integration residue, unlike KRN's 12a).
- **Likely-invariant honesty:** no golden claims a ∀-input proof; genesis proves machine-checked _likely_
  invariants (HOLD-on-current-code + survive-a-mutant), per method-tags-gen.md §Refuse-to-model.
- **Held-out leg (Wave H · execution GATE → FULL assurance):** every `gen: conformance` REQ now carries a
  **second, held-out** fixture (`held_out: true`) on the independent `beacon-repo@rev-1d0a` universe —
  **67 held-out added**: the 72 conformance SCNs **minus the 5 GEN-16 SCNs** (exempt — a-posteriori usefulness
  has no write-time oracle to overfit; see §GEN-16 held-out note). The 3 `gen: PBT` SCNs (11a/b/c) are the
  determinism-law permutation witnesses — no single held-out fixture applies. Each `-2` is genuinely
  INDEPENDENT (different repo skeleton / mined candidate set / ranked frontier of size 5 / budget 5 / resume
  token) hitting the SAME INV branch with its **own** `teeth: breaks-on`; a renamed clone of fixture-1 fails
  its held-out leg. Deterministic-ranking/skeleton REQs (1b/1c) use a different repo@rev yet still assert
  byte-identical reproducibility (HARD RULE 5). Held-out coverage: **67/67 conformance-eligible REQ**, 5
  exempt+noted (GEN-16), 3 out-of-scope PBT (GEN-11) ⇒ the held-out GATE leg is AVAILABLE for the whole
  conformance set.

## §GEN-CONC goldens — concurrency is unobservable, and spend is not hidden by it

### SCN-GEN-CONC-1 — a concurrent pass reports byte-identically to a sequential one (happy)

source: REQ-GEN-CONC-2
Given a 37-site frontier and a dispatch port that completes its batches in REVERSE order
When the pass is run concurrently and again sequentially
Then the two reports are byte-identical, and model calls issued equals sites used (37)
teeth: breaks-on "the batch is folded in completion order rather than rank order"
gen: conformance

### SCN-GEN-CONC-2 — arrival order leaking into the batch result is caught (guard)

source: REQ-GEN-CONC-1
Given a dispatch port that returns its results in COMPLETION order instead of the order it was handed them
When the pass is run and compared against the sequential report
Then the reports differ and the seeded facts come back in a different order
teeth: breaks-on "the port's positional-alignment obligation is dropped and nothing detects it"
gen: conformance

### SCN-GEN-CONC-3 — a pool spends exactly the sequential budget (guard)

source: REQ-GEN-CONC-4
Given a 30-site frontier under a ceiling of 22, which is not a multiple of the pool width
When the pass is run concurrently
Then budget spent, model calls issued and sites used are all 22, the report is byte-identical to sequential, and the 8-site cold tail is recorded with the ceiling named as its cause
teeth: breaks-on "the batch width ignores the calls remaining, so a full batch is dispatched past the ceiling"
gen: conformance

### SCN-GEN-CONC-4 — the first fault BY RANK is the interruption (guard)

source: REQ-GEN-CONC-3
Given ranks 3 and 6 both faulting inside ONE batch whose completion order is reversed
When the pass is run concurrently
Then the resume cursor is 2, rank 3 is the interruption, every later rank is recorded unvisited, and the report matches sequential apart from spend
teeth: breaks-on "the fault that finished first by wall-clock is reported, so the cursor steps over a rank that never ran"
gen: conformance

### SCN-GEN-CONC-5 — resume after a concurrent interruption matches resume after a sequential one (happy)

source: REQ-GEN-CONC-3
Given a 24-site frontier interrupted at rank 9 under both execution modes
When each interrupted run is resumed from its own token
Then both resumed reports agree apart from spend, spend accumulates across the two legs, and sites used agree exactly
teeth: breaks-on "the resumed leg re-derives its cursor from arrival order and skips a site"
gen: conformance

### SCN-GEN-CONC-6 — the spend counter is present even when it is zero (guard)

source: REQ-GEN-CONC-5
Given a malformed run that never obtained a frontier, and a run over an empty frontier
When each report is inspected
Then each carries the model-calls-issued field explicitly, set to zero
teeth: breaks-on "the counter is spread conditionally, so a zero reads as the field never applying"
gen: conformance

### SCN-GEN-CONC-7 — the marginal-value halt is not pass-level on the mine path (guard)

source: REQ-GEN-CONC-1
Given the mine driver, which calls the S2 extract with exactly one candidate and a ceiling of one
When 40 sites are driven
Then each call produces at most one outcome, so the trailing-20 admit window is never reachable and no scheduling-dependent halt exists
teeth: breaks-on "the pool is placed inside the multi-candidate extract loop, where the halt becomes arrival-dependent"
gen: conformance
