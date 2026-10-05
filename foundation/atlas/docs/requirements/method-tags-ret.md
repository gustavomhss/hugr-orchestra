# Method-tags — Block RET (retrieval) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-ret.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE).
>
> One tag per **behavioural** INV by the 3-conjunct rule. **No RETR invariant is `formal`** — the whole Atlas's
> one `formal` cluster is the `FSPEC-merge` core (KRN block); retrieval consumes that core, it does not host one.
> Retrieval's shapes are **bounded deterministic composition** (pack / drop-order / relate / own — `PBT` on the
> ordering + cap laws) and **standard behaviour + robustness** (`reference-model`). All 13 RETR invariants are
> `behavioural` (register), so none carries `n/a`.
>
> **Pinned cap measure (load-bearing).** Every `~`-cap in this block (pack `~2K`, ceiling `~5K`, Awareness
> `~400`, `own` `~1.5K`, poke `~150`, …) is a **ratified pinned-measure bound** under **`cl100k_base` (tiktoken),
> pinned by version + content hash** (data model, `atlas-retrieval.md`). Every golden asserts the cap **under that
> pinned tokenizer** (a deterministic function of the input, `Pack.tokenEstimate`) — NOT a vague threshold. This
> is what keeps the byte-identity gates (INDEX-8 / RETR-1) falsifiable; it closes S0 carry-forward **D**.

---

### INV-RETR-1

method-tag: reference-model
fspec: —
up-property: "closed-surface determinism: relevance is a pure function of (scope, dependency, trigger) over the hashed index — **0** embedding / vector / RAG calls (A-14); two identical queries return byte-identical results (determinism inherited from INDEX-8)"
down-model: "the reference resolver reads ONLY the three index axes and has no embedding/vector dependency in its import graph; a grep-assertion proves 0 embedding calls; PBT-fuzz asserts two-identical-query byte-identity against the resolver"
anti-rot: `retrieval/ref/resolve.ts` (the axes-only reference resolver) is imported as the mock in the query unit tests; a code path that reaches for an embedding model / vector store cannot type-check against the mock's dependency-free seam and breaks the byte-identity property. _(Tag stays `reference-model`: the shape is closed-surface **absence** + pure-function equality against the reference resolver, not a standalone ordering law — so it does not earn a `PBT` tag even though it carries a determinism property.)_

### INV-RETR-2

method-tag: PBT
fspec: —
up-property: "bounded deterministic pack composition: a pack is ≤ the pinned `~2K` cap; carries all **T0 in full**, then **T1 by the total order `(hits-desc, ppr-desc, nodeKey-asc)`** until the cap; the **cap wins** (truncation marker + `pull-reachable` tail — **0** silent drops); a merged pack over `K` territories is `≤ ~2K` total, T0-first then the same rank; byte-identical for equal input; **0** free prose"
down-model: "executable reference packer = stable-sort-by-comparator then greedy fill under the pinned cap-measure; PBT the ordering laws (the rank is a **total, deterministic, antisymmetric** order), the cap bound (the pinned count never exceeds `~2K`), and cap-wins (any omission ⇒ a truncation marker is present, never a silent drop); the golden asserts the `~2K` cap under `cl100k_base`, not a vague threshold"
anti-rot: `retrieval/ref/pack.ts` (+ the shared comparator `retrieval/ref/rank.ts`) is the mock reused in the pack unit tests; a code packer that drops silently, re-orders, or blows the pinned cap diverges under the shared ordering + cap-wins properties.

### INV-RETR-3

method-tag: reference-model
fspec: —
up-property: "fail-closed staleness: `stale` ⇔ **any** grounding backing the pack drifted (never a guess); a `stale` pack is refused until re-grounded (**0** stale packs trusted as-is)"
down-model: "the reference `stale` = OR over the backings' drifted-bit read from the index drift-oracle (INDEX-5 seam); a `stale` pack is routed to re-ground before use; a conformance test drifts one backing and asserts `stale:true` + refusal"
anti-rot: `retrieval/ref/stale.ts` reuses the index drift-oracle as its mock (the seam #1 consumer); a guessed / heuristic staleness path diverges from the exact OR-of-drifted and fails the drift-then-refuse conformance test.

### INV-RETR-4

method-tag: reference-model
fspec: —
up-property: "debounced once-per-scope poke: a poke fires iff a single-file navigation signal **settles** as the current scope across a debounce window of `N = 2` consecutive tool calls **and** that scope was not already poked this session; multi-file `Grep`/`Glob` and `Bash` path-args never drive scope; ≤1 poke/scope/session; transient in-and-out crossings ⇒ **0** pokes"
down-model: "a reference **debounce automaton** over a tool-call sequence: `classify(call) → {navigate(file) | suppress}`; settle-window = 2; a per-session `poked` set; PBT-fuzz random tool-call sequences asserting the settle + once-per-scope + no-transient-poke properties against the automaton"
anti-rot: `retrieval/ref/poke.ts` (the debounce automaton) is the mock in the tool-call-hook unit tests; a code hook that re-pokes an already-poked scope or pokes a transient crossing diverges from it. _(Tag stays `reference-model`: the shape is a deterministic **sequential state machine**, not async and not a standalone ordering law — the automaton IS the oracle; the PBT-fuzz is merely its golden generator, mirroring KERNEL-7. The debounce is over a **count** of calls, not wall-clock — nothing real-time to model.)_

### INV-RETR-5

method-tag: reference-model
fspec: —
up-property: "scoped tool surface: only nodes covering the **current** scope are projected as MCP tools; on scope-exit they retract; the whole graph is **never** simultaneously projected — **0** cross-scope accumulation (A-15)"
down-model: "the reference projector = `coveringNodes(scope)` with a retract on every scope-change; a conformance test enters/exits a sequence of scopes and asserts the live tool-set == the covering set at each step and never accumulates"
anti-rot: `retrieval/ref/project.ts` (the covering-set projector) is the mock; an accumulating or whole-graph projection path fails the exit-retract + never-whole-graph assertions against it.

### INV-RETR-6

method-tag: PBT
fspec: —
up-property: "bounded deterministic **drop under capacity**: the auto-injected sum ≤ the pinned `~5K` ceiling; on overflow droppable kinds drop by **observed per-kind `hitRate`, least-used first** (the RETR-8 ledger), never an undefined/hardcoded order; the two pins (`Awareness.constitution`, `protocols.safetyCritical`) **never** drop; the documented cold-start order applies until the ledger has data; the drop order is a **deterministic total order** over kinds"
down-model: "the **executable reference drop-policy as the oracle** (the S2.md example for this INV): order kinds by `(pinned-desc, hitRate-asc)` with the cold-start default until ledger data, then drop from the bottom until `sum ≤ ceiling`; PBT the determinism + total-order + pin-never-dropped + ceiling-holds laws; the golden asserts the `~5K` ceiling under `cl100k_base`"
anti-rot: `retrieval/ref/drop.ts` (the reference drop-policy) is the mock reused in the injection-budget unit tests; a hardcoded / undefined drop order, a dropped pin, or a breached ceiling diverges under the shared ordering + pin properties. _(Ordering shape → `PBT`; a formal model here is overhead — the reference policy is the oracle.)_

### INV-RETR-7

method-tag: reference-model
fspec: —
up-property: "per-kind cap enforcement under the pinned measure: each injection kind stays within its ratified sweet-spot cap (Awareness `~400` · Orientation `~250` · projectMem `~500` / orch `~800` · `own` `~1.5K` · pack `~2K` · related `~300` · protocols `~500` shared · poke `~150`); no single kind consumes the whole `~5K` ceiling; Awareness + Orientation are **derived, never written**"
down-model: "the reference cap-table = a pure map `kind → pinnedCap`, plus an enforcement predicate; a conformance test asserts each kind's `tokenEstimate ≤ its cap` under `cl100k_base` and that no single cap == the ceiling; the golden asserts the **pinned** caps, not vague thresholds"
anti-rot: `retrieval/ref/caps.ts` (the reference cap-table) is the mock shared by the packer (RETR-2), drop-policy (RETR-6), and composer (RETR-12); a cap drift or a written-Awareness/Orientation path diverges from it and breaks the shared cap assertion.

### INV-RETR-8

method-tag: reference-model
fspec: —
up-property: "calibration from observed use, not guesswork: caps AND the drop order derive from the ledger's observed `hits` / `hitRate`, never a static constant divorced from usage; `hits` measure **precision** (served facts used), never **coverage** (that is RETR-13's MISS-oracle)"
down-model: "the reference ledger = a per-kind `hits` / `hitRate` accumulator that the cap-table and drop-policy READ; a conformance test mutates the ledgered hits and asserts the caps/drop-order **change** (proving they are a function of the ledger, not a constant); PBT-fuzz over hit sequences"
anti-rot: `retrieval/ref/ledger.ts` (the reference hits ledger) is the mock feeding RETR-6's `drop.ts`; a hardcoded-constant path that ignores the ledger diverges — mutating `hits` leaves the order unchanged and fails the calibration property.

### INV-RETR-9

method-tag: reference-model
fspec: —
up-property: "totality: a malformed or missing territory/scope yields an **empty pack + empty tool set + no poke** and **never throws** (0 exceptions) — mirrors §3.4 / A-14 and KERNEL-7"
down-model: "the reference retrieval surface is **total by construction** — `pack`/`projectTools`/`poke`/`relate`/`own`/`offAtlas` return empty structures or `null` on malformed input, never throw; the golden generator is **PBT-fuzz** over arbitrary + malformed scopes asserting no-throw + empty results side-by-side with the code"
anti-rot: the total reference surface (`retrieval/ref/*.ts`, the same modules reused across this block) is the mock; PBT fuzzes code and reference together, so a throwing code path fails the shared no-throw property. _(Tag stays `reference-model`, exactly like KERNEL-7: the shape is robustness/**totality**, the total reference IS the oracle, and the PBT-fuzz is its golden generator — it does not earn a standalone `PBT` tag.)_

### INV-RETR-10

method-tag: PBT
fspec: —
up-property: "deterministic partitioned closure: `relate(unit)` = the **exact** set from the index's three axes (spatial roll-up + `depends-on` forward & reverse closure + territory), **partitioned by relation kind** (`enclosing`/`dependents`/`dependencies`/`governing`/optional `coChanged`), byte-identical for equal input, **0** LLM; `coChanged` is opt-in + labeled, **never mixed** into the structural bands"
down-model: "the executable reference `relate` = the union of the three axis-closures, partitioned; PBT the determinism (byte-identity under equal input), partition-**disjointness** (the structural bands never overlap `coChanged`), and closure-**exactness** against the reference; the model supplies only the touched unit — the closure is the index's job"
anti-rot: `retrieval/ref/relate.ts` (the reference closure) is the mock; an LLM-in-the-path or a `coChanged`-mixed-into-structural-bands code path diverges under the determinism + partition-disjointness properties and breaks the build.

### INV-RETR-11

method-tag: reference-model
fspec: —
up-property: "bounded, ranked, deterministic truncation: `dependents` cut at `maxHops = 2`, ordered by the total rank `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)`, capped at `K = 8`, truncated **after ranking** with honest `dependents_meta` (`total` / `returned` / `truncated`); forward `dependencies` use the same `K = 8`; a high-`ppr` hub 2 hops out outranks a low-`ppr` leaf 1 hop in"
down-model: "the reference bounder = `closure(maxHops=2) → stable-sort-by-rank → take(K=8)` with honest meta, reusing RETR-10's closure; PBT-fuzz the rank **total-order** + **truncate-after-rank** (the returned set is a rank-prefix) + honest-`total` against the reference bounder"
anti-rot: `retrieval/ref/bound.ts` (+ the shared `retrieval/ref/rank.ts` comparator) is the mock; a truncate-**before**-rank or a distance-primary code path diverges under the ranking property. _(Tag stays `reference-model`: the bounder is a **functional computation** (closure→rank→cap→meta) whose oracle is the reference model; its rank-determinism is PBT-fuzzed **inside** that reference harness — like KERNEL-7 — not as a standalone `PBT` tag. Per the block baseline, only pack/relate/own composition {2,10,12} + the drop-order {6} carry the standalone `PBT`.)_

### INV-RETR-12

method-tag: PBT
fspec: —
up-property: "mechanical deterministic `own`-pack: `own_<unit>` = a curated `OwnPack` composed by **index reads alone** (0 LLM, 0 free prose), ≤ the pinned `~1.5K` cap, byte-identical for equal input; a seat receives its `own` without choosing a scope; an `epic` composes from its Orientation goal + the features' `OwnPack`s (not a grounded node); **dedup** vs a co-injected pack by `nodeId` (own wins, the pack shows a `pull-reachable` pointer — a fact paid for **once**)"
down-model: "the executable reference composer = deterministic assembly of (`tier≥T1` invariants + terrain + a bounded `relate()` + scoped memory pointers) under the pinned cap; PBT byte-identity + the **dedup law** (`own ∩ pack = ∅` after dedup, own wins) + the cap bound; the golden asserts the `~1.5K` cap under `cl100k_base`"
anti-rot: `retrieval/ref/own.ts` (the reference composer, reusing `pack.ts` / `relate.ts` / `caps.ts`) is the mock; an LLM-assembled `OwnPack` or a double-counted fact (same `nodeId` in both `own` and the co-injected pack) diverges under the determinism + dedup properties.

AMENDED 2026-08-03 (REQ-RETR-12m — the briefing is two bands, extending ADR-0013 from `atlas-query` to `atlas-own`): the `up-property` above is unchanged AS A STATEMENT ABOUT THE GOVERNING BAND — `tier≥T1`, `≤ ~1.5K`, byte-identical for equal input, the dedup law, the epic composition, all still exactly true of `OwnPack.invariants` + `OwnPack.gotchas`, whose content, order and budget this amendment does not move. Added beside it: `OwnPackPlus.advisory` carries the `T2` rows under `OWN_ADVISORY_CAP` — a SUB-cap INSIDE the unchanged `OWN_CAP`, filled LAST so the governing band keeps priority — with an `OwnPackPlus.advisoryDropped` ledger and the existing `pullReachable` tail naming every refused row (0 silent drops). Both bands are stated as tier MEMBERSHIP through the ONE shared `@atlas/tools` src/bands.ts predicate pair, so an off-lattice tier is in NEITHER, and every advisory row carries the per-fact GROUND-1 verdict the governing rows already carry. NOT amended here and recorded as an open divergence: `reference/atlas-retrieval.md#retr-12`, which still states the briefing as `tier≥T1` alone — ADR-0013's own declared surface, exactly as `atlas-tools.md#tools-6` was left for TOOLS-6 (REQ-RETR-12m).

### INV-RETR-13

method-tag: reference-model
fspec: —
up-property: "deterministic coverage ledger (the MISS-oracle): a per-territory **off-atlas rate** = fraction of served turns with an out-of-scope `Read`/`Grep`; crossing **a threshold** raises a calibration prompt to author the missing tag/edge; no served history ⇒ rate `0`, **never a throw**; byte-identical for equal input. (Measures **coverage** — the one silent failure RETR-3's drift-oracle cannot see, because un-anchored knowledge has no grounding to drift.)"
down-model: "the reference off-atlas ledger = per-territory `offAtlasReads / served`; the threshold-crossing predicate is written **parametric over the DEFINE threshold value** (see below); a conformance test asserts the rate computation + `rate 0` on no-history + no-throw; the threshold golden is **PENDING** the DEFINE value"
anti-rot: `retrieval/ref/offatlas.ts` (the reference coverage ledger) is the mock; a non-deterministic or throwing no-history path diverges. **THRESHOLD = OPEN DEFINE DEPENDENCY:** the off-atlas value that triggers the calibration prompt (REQ-RETR-13b) is **silent in the reference clause** — an open reconciliation routed to DEFINE (`req-ret.md` §[NEEDS RECONCILIATION]). The behaviour is tagged **now** and the reference model is written **threshold-parametric**, so S3's golden binds the concrete number once DEFINE supplies it. The constant is **not invented at S2**.

---

## Refuse-to-model

- **performance / real context-window pressure + injection latency**: the caps + `~5K` ceiling **bound** the footprint, but actual degradation and latency are covered by load tests — there is no correctness oracle to model (ShardStore drops perf).
- **the code itself**: conformance-tested (**sampled**) against the reference models — "success = we could not find a bug"; a verified design is not a verified impl. Confidence is bought with scale + coverage, not a proof claim.
- **the tokenizer's own byte-accuracy**: `cl100k_base` (tiktoken), pinned by version + content-hash, is a **trusted primitive** — we model that every cap is a _deterministic function under it_, NOT tiktoken's internal correctness (mirrors the BLAKE3 refusal in KRN).
- **whether a served fact was actually _useful_ to the LLM**: `hits` / `hitRate` (RETR-8) and the off-atlas rate (RETR-13) are **observed calibration signals**, not correctness oracles — precision and coverage are tuned, never _verified_.
- **real-time / wall-clock**: the RETR-4 debounce is over a **count** of consecutive tool calls (`N = 2`), not a timer — no clock enters the model, so there is nothing real-time to model.
- **concurrent multi-seat injection + crash simultaneously**: per-seat injection scoping (MEM-1) and process-crash / durability are checked **separately**, never in one model (ShardStore rule).
- **the RETR-13 off-atlas threshold value**: an **open DEFINE reconciliation** — the reference model is threshold-**parametric**; the concrete number is supplied by DEFINE and bound by S3's golden, **not invented at S2**.

## FSPEC-merge

**None in this block.** RETR hosts no `formal` cluster. Where retrieval depends on merge/fold determinism it **consumes** the KRN core `FSPEC-merge` ([`../spec/fspec-merge.md`](../spec/fspec-merge.md)) as a frozen seam — it does not re-model it.

## Completion report

- tagged-register: `docs/requirements/method-tags-ret.md`
- tag histogram: **formal 0** · **exhaustive 0** · **PBT 4** (RETR-2 / 6 / 10 / 12) · **reference-model 9** (RETR-1 / 3 / 4 / 5 / 7 / 8 / 9 / 11 / 13)
- every RETR-1..13 tagged: **yes** (13/13; all behavioural, 0 `n/a`)
- refusal count: **7**
- shape-no-fit flags: **none** (every INV fit a tool-per-shape row)
- surprises / notes for cold-review:
  1. **RETR-13 threshold is an OPEN DEFINE dependency** — behaviour tagged, reference model written threshold-parametric, concrete number deferred to DEFINE (`req-ret.md` §[NEEDS RECONCILIATION]); S3 golden pending.
  2. **RETR-4 (sequential debounce automaton)** and **RETR-11 (ranked bounded truncation)** carry ordering/state-machine sub-shapes that could _look_ `PBT`, but their oracle **is** the reference model and PBT-fuzz is only its golden generator — kept `reference-model` per the block baseline (which reserves the standalone `PBT` tag for the pack/relate/own composition {2,10,12} + the drop-order {6}), documented exactly like KERNEL-7.
- → next_state **S3** (goldens).
