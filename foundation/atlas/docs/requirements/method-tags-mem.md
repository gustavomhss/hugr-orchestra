# Method-tags — Block MEM (memory) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-mem.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE).
>
> One tag per **behavioural** INV by the 3-conjunct rule. The MEM block carries **no** `formal` cluster — the
> single Atlas `formal` model is `FSPEC-merge`, and MEM only **consumes** kernel seams (the append-only log,
> the portable serializer, the fold reducer), it does not add a convergence core. Two invariants are `PBT` by
> **shape**: MEM-7 (deterministic eviction ordering under capacity — the retrieval drop-order shape) and MEM-11
> (byte-identical derivation determinism). The rest is `reference-model` per the ratified baseline — a feature,
> not a compromise. All 13 MEM invariants are `behavioural` (register lines 176-188), so none carries `n/a`.
>
> **Semantic pin (MEM-1):** MEM-1 is **injection-scoping, NOT access-control**. Its verification asserts a
> _scoping_ behaviour (A's turn-header injects only A's own Memory), never a _confidentiality / isolation_
> property — the design explicitly disclaims that (Memory is git-native; any repo reader holds every seat's
> bytes). Cross-seat confidentiality is on the **Refuse-to-model** list, not tagged here.

---

### INV-MEM-1

method-tag: reference-model
fspec: —
up-property: "injection-scoping (NOT confidentiality): a member's assembled turn-header contains only that member's own Memory entries — the orchestrator likewise — and never another seat's; 0 cross-seat entries injected. This is a scoping predicate over a shared store, NOT an access-control / isolation guarantee (a repo reader still reads every seat's bytes)"
down-model: "injectFor(store, seat) = { e ∈ store | e.owner == seat }; the reference injector filters by owner-id; the mock asserts injected ⊆ seat-owned and that no e.owner ≠ seat leaks into the header"
anti-rot: `memory/ref/inject.ts` (the owner-scoped reference injector) is the mock in the header-assembly unit tests; a code path that injects a foreign seat's entry diverges from it and breaks the build. Confidentiality is **not** asserted (see Refuse-to-model).

### INV-MEM-2

method-tag: reference-model
fspec: —
up-property: "kind partition: a Memory entry never routes into the shared-Knowledge partition and a Knowledge fact never routes into Memory — though both live in the one Atlas on the same index/format; 0 conflations"
down-model: "put(kind, entry) routes on a discriminant kind∈{memory,knowledge} into the matching partition of the one CAS; the reference router rejects a memory→knowledge or knowledge→memory store; the mock asserts partition(entry)==entry.kind for every write"
anti-rot: `memory/ref/kinds.ts` (the kind-router over the single store, shares KERNEL-3's `store.ts`) is the mock; a conflating code path fails the partition assertion in the shared unit test.

### INV-MEM-3

method-tag: reference-model
fspec: —
up-property: "injected-cap totality: a member's injected `project` memory is always `≤` its token cap (member `~500`, orchestrator `~800`); a would-exceed write is a structured rejection, never a silent overflow (0 overflow)"
down-model: "capGate(entries, cap) = Σ tok(e) ≤ cap ? accept : reject; the reference gate sums the pinned tokenizer and rejects over-budget; the mock asserts the injected sum ≤ cap and that an over-cap write returns a rejection"
anti-rot: `memory/ref/cap.ts` (the cap-gate) is the mock; a silent-overflow code path fails the ≤-cap assertion. The `~`-caps are **ratified pinned bounds**; the tokenizer itself is a trusted primitive (Refuse-to-model), the gate wiring is what is modeled.

### INV-MEM-4

method-tag: reference-model
fspec: —
up-property: "consultable is never free: `task` / `pr` / `logbook` memory never auto-injects on a running turn (0 auto-inject); each is returned only by an explicit `memory-recall` — the sole exception being the MEM-13 re-spawn push of a seat's own resumed fold"
down-model: "assembleHeader(seat) excludes kinds {task,pr,logbook}; recall(query) is the only path that returns them; the reference asserts the running-turn header ∩ consultable == ∅, and that the MEM-13 spawn event is the one carve-out"
anti-rot: `memory/ref/inject.ts` (shared with MEM-1) is the mock; a consultable kind that leaks into a running-turn header diverges from it and breaks the build.

### INV-MEM-5

method-tag: reference-model
fspec: —
up-property: "templated fail-closed: every write fills its per-type template (ProjectMemoryEntry / TaskMemoryEntry / PrMemoryEntry / LogbookEntry) or is rejected fail-closed; a missing required field or over-cap entry never persists (0 free-prose); logbook prose is confined within its fixed sections"
down-model: "validate(kind, entry) checks the per-type required-field set + section bounds (mirrors spec A-13); the reference validator rejects on any missing field / over cap / out-of-section prose; the mock asserts no invalid entry persists"
anti-rot: `memory/ref/template.ts` (the per-type validator) is the mock reused by the write unit tests; a free-prose or missing-field write fails against it.

### INV-MEM-6

method-tag: reference-model
fspec: —
up-property: "Orientation is derived & shared, never a written entry: `goal` is assembled from the ratified DEFINE artifact and `last/current/state` as a fold over the event log; it is byte-identical across all members, `≤ ~250 tok`, and MUST NOT be a per-member written memory (so it can never go stale)"
down-model: "orient(defineArtifact, log) = { goal: fromDefine(defineArtifact), last/current/state: fold(log) }; the reference assembler is a pure function of (DEFINE, log) with no per-seat input; a two-seat test asserts byte-identity and that no `project`-write path can author Orientation"
anti-rot: `memory/ref/orient.ts` (the assembler, shares KERNEL-5's `fold.ts` reducer) is the mock; a hand-written or seat-divergent Orientation diverges from it and breaks the byte-identity test.

### INV-MEM-7

method-tag: PBT
fspec: —
up-property: "deterministic frecency eviction ordering under capacity: the injected `project` set is the **top-12 by frecency** (one time-decayed score of logged, cited hits — a `hit` increments only when a seat/cold-reviewer cites the rule-id in the ledger); an entry whose frecency decays to ~zero is evicted to the archive; the ranking is total + deterministic and an old-popular rule cannot pin a slot; no memory is ever deleted (evicted = retained, versioned, re-spawnable)"
down-model: "executable reference frecency policy as oracle (same shape as RETR-6 drop-order): score(entry, ledger) = decay(Σ cited-hit events); rank = sort-desc by score, take 12; PBT the determinism (same ledger ⇒ same top-12 + same evict set), the total-order tie-break, evict-at-~zero, and no-pinning (a stale-but-cumulative entry loses its slot to a fresher one)"
anti-rot: `memory/ref/frecency.ts` (the reference ranking + eviction policy) is the mock in the injection-set unit tests; a raw-count / window-machinery / LFU-ossifying code path diverges from it under the PBT ordering laws and breaks the build. _(Tag is `PBT` by SHAPE — deterministic eviction ordering under capacity, the retrieval drop-order shape — not `reference-model`; the reference policy is the oracle and PBT exercises the ordering/determinism laws. Decay is over logged ledger events, NOT wall-clock — see Refuse-to-model.)_

### INV-MEM-8

method-tag: reference-model
fspec: —
up-property: "logbook is a ledger: orchestrator-only, exactly **one append-only entry per PR** within the fixed sections + per-section caps, consultable (by PR/date/territory) and never injected; a later entry supersedes a past decision **by link, never by rewriting** history (0 rewritten)"
down-model: "logbook = append-only Map<prId, LogbookEntry> with a one-per-PR guard + section validator; supersede(prId, link) appends a link, never mutates an extant entry; the reference asserts orchestrator-only writes, ≤1 entry/prId, and no in-place edit of a landed entry"
anti-rot: `memory/ref/logbook.ts` (append-only, shares KERNEL-4's insert-only `log.ts`) is the mock; a rewrite / second-entry / non-orchestrator path fails against it. Consultable-never-injected is enforced via the MEM-4 injector mock.

### INV-MEM-9

method-tag: reference-model
fspec: —
up-property: "portable round-trip: `export → import` yields byte-identical Memory as open JSON with no lock-in (deepEqual(mem, import(export(mem)))). The **secret-scrub fail-closed gate** (named scanner blocks a secret-carrying write) is a downstream guarantee, delegated — see below"
down-model: "export():string open-JSON Memory dump; import replays 1:1; a unit test asserts deepEqual over every memory type and greps the dump for 0 host/external refs. The scanner arm is NOT covered by this reference model — a named-scanner (gitleaks/trufflehog) fail-closed gate has no pure-function oracle; its verification is an **integration/conformance gate** delegated to the FR-12 safety concern (billy): a write carrying a planted secret is blocked, not merely redacted"
anti-rot: `memory/ref/portable.ts` (the (de)serializer, shares KERNEL-6's `portable.ts`) is the mock for the round-trip; a lock-in encoding drift fails the equality. The scanner gate's anti-rot is the **conformance harness against the real scanner binary** (billy/FR-12), out of this block's reference-model scope. _(Split mirrors KERNEL-12: the modelable round-trip is `reference-model`; the black-box scanner arm is delegated to an integration test, not modeled here.)_

### INV-MEM-10

method-tag: reference-model
fspec: —
up-property: "versioned & nothing dies: every memory type of every member (incl. the orchestrator) is versioned with the repo and travels at each commit / PR / branch / fork; each ephemeral agent's run is re-spawnable from the versioned record; 0 memory dies (governed by Atlas A-16/17/18)"
down-model: "memory is a git-native append-only projection over the CAS/log (KERNEL-4/10); the reference asserts log-length monotonicity across a simulated commit/branch/fork and that a re-spawn rebuilds the seat's state solely from the versioned record — no in-place mutable snapshot"
anti-rot: reuses KERNEL-4's insert-only `log.ts` as the mock; a delete / in-place-mutate / snapshot-dependent path fails the monotonicity + re-spawn-from-record assertions.

### INV-MEM-11

method-tag: PBT
fspec: —
up-property: "byte-identical derived rollup: the injected **Awareness** (mission / constitution / terrain / ontology / taste) is assembled from the Atlas root — each facet grounded (`node@sha`) + drift-checked, top-tier only under `≤ ~400 tok`, byte-identical across all members, never hand-written; a facet whose source is **absent** renders a labeled `UN-SEEDED` sentinel (never a fabricated line); a generic language/stack card never stands in; the tail stays pull-reachable"
down-model: "executable reference rollup per facet: rollup(rootNode) is a pure derivation; PBT the determinism (same root ⇒ byte-identical Awareness across seats and across re-runs), the absent-source ⇒ `UN-SEEDED` law, the moved-source ⇒ drift-flag law (serve-flagged not stale), and the ≤-cap + top-tier truncation. `ontology` sources `slot='definition'` nodes curated by the DEFINE persona (walt); `taste` grounds to `CONVENTIONS.md@sha` + the gate config"
anti-rot: `memory/ref/awareness.ts` (the reference facet-rollup) is the mock in the header-assembly unit tests; a hand-written, seat-divergent, or non-deterministic Awareness diverges from it under the PBT byte-identity property and breaks the build. _(Tag is `PBT` by SHAPE — determinism / byte-identical derivation — not `reference-model`; the reference rollup is the oracle and PBT exercises the determinism + UN-SEEDED + drift laws.)_

### INV-MEM-12

method-tag: reference-model
fspec: —
up-property: "memoized assembly, not free: each Awareness facet is cached keyed on **its own source's subtree hash** (constitution set / territory-axis top / `CONVENTIONS.md@sha`) — NOT the root `rId‖rState` — so a facet re-rolls only when its own source moves; Awareness is assembled **once per root-state and shared across seats** (0 per-seat re-roll); on an unchanged `rId‖rState` turn there are **0** facet re-rolls and **0** per-`node@sha` drift-checks (cache hit); Orientation is an **incremental fold** over only the newly-appended event-log entries, never a full replay"
down-model: "the reference memoizer wraps the MEM-11 rollup with a per-facet-source-hash cache + an instrumented re-roll/drift-check counter; the mock asserts counter==0 when no source moved, counter>0 only for the moved facet, one shared assembly per root-state, and that Orientation folds only the tail delta"
anti-rot: `memory/ref/memoize.ts` (the instrumented memoizer over `awareness.ts`/`orient.ts`) is the mock; a root-keyed (always-miss) cache or a per-seat re-roll or a whole-log Orientation replay diverges from it and breaks the counter assertions. _(This is a cache-hit-determinism correctness invariant checked by an instrumented call-counter, NOT an ordering problem — `reference-model`, not `PBT`; assembly latency itself is Refuse-to-model.)_

### INV-MEM-13

method-tag: reference-model
fspec: —
up-property: "recall fires at re-spawn (push, not pull): a re-spawned seat auto-receives its **own** prior `task` / `pr` closing fold (`attempted / failedWith / stoppedAt / lesson`) for the unit it is resuming **at spawn**; it is scoped to the seat's own fold for the resumed unit (never general consultable auto-injection — MEM-4 still bars that on a running turn); deterministic and ledger-driven off the unit's archived fold; a fold no re-spawn ever recalls is a spec failure, not dead weight"
down-model: "spawnRecall(seat, unit) = archivedFold(seat, unit); the reference spawn-hook looks up the archived closing fold by (seat, unit) and pushes it once at spawn; the mock asserts the push is scoped to own+resumed only, is deterministic off the archived record, and fires exactly at spawn (not on a running turn)"
anti-rot: `memory/ref/respawn.ts` (the deterministic spawn-recall) is the mock; a discretionary-pull, foreign-fold, or running-turn-injection path diverges from it and breaks the build. Reuses MEM-10's versioned-record archive as its source.

---

## Refuse-to-model

- **cross-seat confidentiality / isolation (EXPLICITLY refused)**: MEM-1 is **injection-scoping, not access-control**. Memory is git-native (MEM-9/10), so anyone with repo read holds every seat's Memory bytes — the design disclaims confidentiality. We verify the _scoping_ predicate (A's header injects only A's entries), and we deliberately do **not** tag or model an isolation / confidentiality property the design does not make. True per-seat confidentiality would need opt-in per-seat encryption (a future option), and is not in this baseline.
- **named-scanner secret-scrub effectiveness (MEM-9 / FR-12)**: gitleaks/trufflehog _detection completeness_ is a black-box scanner-conformance concern — **billy / FR-12 territory** — with no pure-function oracle. We model only the round-trip (export=import) and that the gate is wired **fail-closed** (a scanner hit blocks the write); the scanner's own detection quality is verified by a conformance harness against the real binary, delegated, not modeled here.
- **token-counting accuracy / the `~`-caps**: the tokenizer is a trusted primitive; `~500` / `~800` / `~250` / `~400` are **ratified pinned bounds**, not modeled. We model that the cap-gate rejects over-budget writes (MEM-3) and that Awareness/Orientation truncate under cap — not the exact token arithmetic.
- **assembly performance / latency & archive growth**: MEM-12 memoization is checked by an **instrumented re-roll counter** (0 re-rolls on an unchanged root), NOT by timing; wall-clock assembly latency and the grow-only archive/OR-Set footprint have no correctness oracle and are covered by load tests.
- **real-time / wall-clock in frecency decay**: MEM-7 decay is a deterministic pure function of **logged, cited-hit ledger events** + a decay step over waves — no real clock enters the ranking (same discipline as KERNEL-10's clock-free fold). We model the ledger-driven decay, not wall-clock time.
- **the code itself**: every reference model here is **conformance-tested (sampled)** against the code — "success = we could not find a bug"; a verified design is not a verified impl. Confidence is bought with scale + coverage, not a proof claim.

## FSPEC-merge

**None in this block.** MEM carries no `formal` cluster — the single Atlas machine-checked model is
`FSPEC-merge` (KERNEL-9/10/11 + PERSIST-11), authored in the KRN block. MEM only **consumes** kernel seams as
anti-rot mocks: the insert-only log (`log.ts`, KERNEL-4) for MEM-8/10, the portable serializer
(`portable.ts`, KERNEL-6) for MEM-9, the fold reducer (`fold.ts`, KERNEL-5) for MEM-6, and the single store
(`store.ts`, KERNEL-3) for MEM-2.

## Completion report

- tagged-register: `docs/requirements/method-tags-mem.md`
- tag histogram: **formal 0** · **exhaustive 0** · **PBT 2** (MEM-7 eviction-ordering, MEM-11 byte-identical-rollup) · **reference-model 11** (MEM-1/2/3/4/5/6/8/9/10/12/13)
- FSPEC-merge: none in this block (Atlas core lives in KRN)
- refusal count: **6**
- every MEM-1..13 tagged: **yes** (13/13; all behavioural per register lines 176-188, 0 `n/a`)
- → next_state **S3** (goldens).
