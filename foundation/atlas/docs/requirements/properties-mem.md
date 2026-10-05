# Properties — Block MEM (memory) · S3-sibling rendered ∀-laws (for FULL-assurance PBT)

> **state:** S3-sibling (rendered from the frozen S2 method-tags — invents no law) ·
> **source (frozen):** `docs/requirements/method-tags-mem.md` @sha256:`ff9924a95d5b2572e785837f00cf0b91c709ba33cf0250d5c5b61cd0b27f0ec9` ·
> **owner:** charlie (FORGE) · **consumed by:** the execution GATE's PBT leg (subsumes the UNAVAILABLE `differential` leg — the `ref/*.ts` are pure-type interfaces, zero runtime).
>
> **Purpose (one line):** each behavioural INV's frozen `up-property` asserted directly on the implementation over generated inputs — the oracle-free beyond-the-witness check that raises MEM from FLOOR toward FULL.
>
> **Digest discipline:** every `source` is a ptr+digest into the frozen method-tags (short digest `ff9924a9`); an upstream edit changes the digest and renders the property STALE.
>
> **No FSPEC in this block.** MEM carries no `formal` cluster (the one Atlas machine-checked model, `FSPEC-merge`, lives in KRN). MEM only _consumes_ kernel seams; no formal-cluster law is transcribed here.
>
> **Semantic pin (MEM-1):** PROP-MEM-1 renders **injection-scoping**, NOT confidentiality/access-control. Cross-seat confidentiality is on the S2 Refuse-to-model list and is deliberately not a property.
>
> **Delegated (not rendered):** MEM-9's **secret-scrub fail-closed gate** has no pure ∀-form (a named-scanner black box) → verification is the FR-12 conformance harness (billy), not a PROP. PROP-MEM-9 renders only the modelable **round-trip** law. (HARD RULE 1 note — flagged, not forced.)

---

### PROP-MEM-1 — injection-scoping (own-Memory only)

inv: INV-MEM-1
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-1
law: ∀ store S, seat q. injectFor(S, q) = { e ∈ S | e.owner = q } — i.e. injectFor(S,q) ⊆ q-owned ∧ ∄ e ∈ injectFor(S,q). e.owner ≠ q (0 cross-seat entries injected). Scoping over a shared store, NOT confidentiality.
arbitrary: gen an arbitrary Memory store — entries tagged `owner` ∈ an arbitrary seat set {orch, alice, bob, …} — and an arbitrary target seat `q`.
covers_reqs: [ REQ-MEM-1a ] # REQ-MEM-1b (readability disclaimer) is a golden, not an ∀-injection law
witness: [ SCN-MEM-1a-1 ]
teeth: breaks-on "a recency/frecency-scoped injector that leaks a foreign seat's entry — killed across ALL store/seat shapes, not just the one 2-entry witness store"

### PROP-MEM-2 — kind partition (Memory ⊥ Knowledge)

inv: INV-MEM-2
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-2
law: ∀ entry e with intrinsic kind ∈ {memory, knowledge}. put(kind, e) is accepted ⟺ partition(e) = e.kind — a memory→knowledge or knowledge→memory route is rejected (0 conflations, over the one shared store).
arbitrary: gen entries carrying an intrinsic kind ∈ {memory, knowledge} paired with an arbitrary target-partition discriminant (matching + mismatching).
covers_reqs: [ REQ-MEM-2a, REQ-MEM-2b ]
witness: [ SCN-MEM-2a-1, SCN-MEM-2b-1 ]
teeth: breaks-on "a router that ignores the discriminant and stores an entry in the wrong partition — killed for arbitrary entry shapes, not just the two witnesses"

### PROP-MEM-3 — injected-cap totality (no silent overflow)

inv: INV-MEM-3
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-3
law: ∀ entry-set E, cap ∈ {member ~500, orch ~800}. capGate(E, cap) = accept ⟺ Σ tok(e) ≤ cap ∧ (Σ tok(e) > cap ⟹ structured reject, never silent overflow/truncation); the injected sum is always ≤ cap.
arbitrary: gen entry-sets whose token sums straddle the cap (below, at, above); gen cap ∈ the ratified pinned bounds. (`tok` is the trusted primitive — Refuse-to-model; the gate wiring is what is generated.)
covers_reqs: [ REQ-MEM-3a, REQ-MEM-3b ]
witness: [ SCN-MEM-3a-1, SCN-MEM-3b-1 ]
teeth: breaks-on "a dropped cap-check or silent truncation — killed across all sum/cap shapes, where the witnesses only pin 480/620/540"

### PROP-MEM-4 — consultable is never free

inv: INV-MEM-4
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-4
law: ∀ seat q, store S, running turn. assembleHeader(q) ∩ {task, pr, logbook} = ∅ ∧ recall(query) is the sole path returning them (the MEM-13 own-resumed spawn push being the one carve-out).
arbitrary: gen a store holding arbitrary task/pr/logbook entries + a running-turn context for an arbitrary seat.
covers_reqs: [ REQ-MEM-4a, REQ-MEM-4b ]
witness: [ SCN-MEM-4a-1, SCN-MEM-4b-1 ]
teeth: breaks-on "any consultable kind (task/pr/logbook) leaking into the running-turn header — killed for arbitrary stores, not just the single witness"

### PROP-MEM-5 — templated, fail-closed

inv: INV-MEM-5
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-5
law: ∀ entry e persisted. validate(e.kind, e) = ok — i.e. no invalid entry persists: required-field set complete ∧ within section bounds ∧ ≤ cap; a missing field / over-cap / out-of-section-prose write is rejected fail-closed (0 free-prose).
arbitrary: gen per-type entries (ProjectMemoryEntry / TaskMemoryEntry / PrMemoryEntry / LogbookEntry) with randomly dropped required fields, out-of-section prose, and over-cap bodies.
covers_reqs: [ REQ-MEM-5a, REQ-MEM-5b ]
witness: [ SCN-MEM-5a-1, SCN-MEM-5b-1 ]
teeth: breaks-on "a fail-open validator that persists a missing-field or out-of-section entry — killed across arbitrary field-drop/prose shapes, beyond the one `stoppedAt` witness"

### PROP-MEM-6 — Orientation derived, shared, never written

inv: INV-MEM-6
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-6
law: ∀ DEFINE artifact D, event-log L, seats s1 ≠ s2. orient(D, L) is a pure function of (D, L) with no per-seat input ⟹ orient(D,L)@s1 bytes == orient(D,L)@s2 bytes ∧ goal = fromDefine(D) ∧ last/current/state = fold(L) (≡ replay-from-empty) ∧ Σ tok ≤ ~250 ∧ ∄ project-write path that authors Orientation.
arbitrary: gen a DEFINE artifact + an arbitrary event log; gen two distinct seats.
covers_reqs: [ REQ-MEM-6a, REQ-MEM-6b, REQ-MEM-6c, REQ-MEM-6d, REQ-MEM-6e ]
witness: [ SCN-MEM-6a-1, SCN-MEM-6b-1, SCN-MEM-6c-1, SCN-MEM-6d-1, SCN-MEM-6e-1 ]
teeth: breaks-on "a per-seat field folded into Orientation (divergent bytes across s1/s2) or a mutable-snapshot state read (diverges from fold-replay) — killed across arbitrary logs, where witnesses pin one head"

### PROP-MEM-7 — deterministic frecency eviction ordering (PBT by shape)

inv: INV-MEM-7
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-7
law: ∀ cited-hit ledger Λ, capacity = 12, decay d, wave w. let score(e, Λ) = decay(Σ cited-hit events) and rank = sort-desc by score, tie-broken by rule-id (a total order), take 12. Then:
(i) determinism: rank(Λ) = rank(Λ) — same Λ ⇒ identical ordered top-12 ∧ identical evict-set;
(ii) total tie-break: equal scores are ordered by rule-id asc (deterministic, never insertion-order);
(iii) evict-at-~zero: score(e) ≈ 0 ⟹ e is evicted to the archive even when slots remain free;
(iv) no-pin: ordering is by frecency, never raw Σ hits — a high-raw-count/low-frecency entry holds no slot;
(v) hit-counting: a hit increments only on a cited-as-governing event, never on a mere read/mention;
(vi) never-delete: the store is monotone non-decreasing — evicted ⟹ archived (versioned) ∧ re-spawnable.
arbitrary: gen a cited-hit ledger (rule-ids × {(wave, hit)} events, decay 0.5/wave, a wave counter) spanning tie, old-popular-low-frecency, and near-zero-decay shapes. Decay is over logged ledger events, NOT wall-clock (Refuse-to-model).
covers_reqs: [ REQ-MEM-7a, REQ-MEM-7b, REQ-MEM-7c, REQ-MEM-7d, REQ-MEM-7e, REQ-MEM-7f ]
witness: [ SCN-MEM-7a-1, SCN-MEM-7b-1, SCN-MEM-7c-1, SCN-MEM-7d-1, SCN-MEM-7e-1, SCN-MEM-7f-1 ]
teeth: breaks-on "LFU/raw-count ossification (R13's 50 hits pin a slot), insertion-order tie-break, rank-position eviction (retaining a ~zero-frecency entry while slots remain), a mention-bumped hit, or a hard-delete eviction — none refutable by the single R1..R13 witness ledger"

### PROP-MEM-8 — logbook is an append-only ledger

inv: INV-MEM-8
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-8
law: ∀ logbook L, prId p, author a, section-fill f. write(a, p, f) accepted ⟺ a = orch ∧ |{ e ∈ L | e.prId = p }| = 0 ∧ f within fixed sections + per-section caps; supersede(p, link) appends a link ∧ leaves the extant entry's bytes unchanged (0 rewritten); ≤ 1 entry / prId; the logbook is consultable but header ∩ logbook = ∅ (never injected).
arbitrary: gen logbook write sequences with arbitrary authors (orch + member seats), prIds (with collisions), section fills (within + over cap), and supersede ops on landed entries.
covers_reqs: [ REQ-MEM-8a, REQ-MEM-8b, REQ-MEM-8c, REQ-MEM-8d, REQ-MEM-8e ]
witness: [ SCN-MEM-8a-1, SCN-MEM-8b-1, SCN-MEM-8c-1, SCN-MEM-8d-1, SCN-MEM-8e-1 ]
teeth: breaks-on "a second-entry-per-PR, an in-place rewrite on supersede, or a non-orchestrator write — killed across arbitrary prId/author sequences, beyond the single `#42` witness"

### PROP-MEM-9 — portable round-trip (scrub gate delegated)

inv: INV-MEM-9
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-9
law: ∀ Memory store M. deepEqual(M, import(export(M))) ∧ export(M) contains 0 host/external refs (open JSON, no lock-in).
[DELEGATED — the secret-scrub **fail-closed gate** (a named-scanner hit blocks the write) has no pure-function ∀-oracle → verified by the FR-12 conformance harness against the real gitleaks/trufflehog binary (billy), NOT rendered as a PROP. This mirrors the KERNEL-12 split: modelable round-trip here, black-box scanner arm delegated.]
arbitrary: gen a Memory store holding ≥1 entry of each memory type (project / task / pr / logbook), with arbitrary field values.
covers_reqs: [ REQ-MEM-9a ] # REQ-MEM-9b / 9c (scanner arm) are delegated residue, not rendered
witness: [ SCN-MEM-9a-1 ]
teeth: breaks-on "a lossy / lock-in encoding (e.g. a dropped task-memory map) — import(export(M)) ≠ M — killed across arbitrary multi-type stores, beyond the one-entry-each witness"

### PROP-MEM-10 — versioned & nothing dies

inv: INV-MEM-10
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-10
law: ∀ memory store M, op-sequence σ ∈ {commit, branch, fork}\*. log-length is monotone non-decreasing across σ ∧ every memory type (all members incl. orch) travels at each op (0 left behind) ∧ reSpawn(record) rebuilds the seat's state solely from the versioned record (no mutable in-memory snapshot).
arbitrary: gen a store of all memory types + an arbitrary sequence of commit/branch/fork ops; gen an ephemeral run recorded in the versioned record.
covers_reqs: [ REQ-MEM-10a, REQ-MEM-10b ]
witness: [ SCN-MEM-10a-1, SCN-MEM-10b-1 ]
teeth: breaks-on "a non-versioned local side-store type that fails to travel on a fork, or a snapshot-dependent re-spawn — killed across arbitrary op sequences, beyond the single commit/branch/fork witness"

### PROP-MEM-11 — byte-identical derived Awareness rollup (PBT by shape)

inv: INV-MEM-11
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-11
law: ∀ Atlas root R, seats s1 ≠ s2. rollup(R) is a pure derivation ⟹
(i) byte-identity: rollup(R)@s1 == rollup(R)@s2 ∧ rollup(R) == rollup(R) across re-runs (determinism);
(ii) UN-SEEDED: a facet whose source is absent renders a labeled `UN-SEEDED` sentinel — never a fabricated line, and a generic language/stack card never substitutes;
(iii) drift-flag: a facet whose source moved (`sha → sha'`) is served drift-flagged (re-grounded), never silently stale;
(iv) cap + top-tier: Σ tok ≤ ~400 ∧ only the top tier of each facet is carried, the tail stays pull-reachable (not dropped);
(v) ontology sources only walt-curated `slot='definition'` nodes;
(vi) Awareness is never hand-written (a written entry is not a source).
arbitrary: gen an Atlas root with 5 facet sources, each independently ∈ {present@sha, absent, moved sha→sha'}; gen two distinct seats + a re-run.
covers_reqs: [ REQ-MEM-11a, REQ-MEM-11b, REQ-MEM-11c, REQ-MEM-11d, REQ-MEM-11e, REQ-MEM-11f, REQ-MEM-11g, REQ-MEM-11h, REQ-MEM-11i ]
witness: [ SCN-MEM-11a-1, SCN-MEM-11b-1, SCN-MEM-11c-1, SCN-MEM-11d-1, SCN-MEM-11e-1, SCN-MEM-11f-1, SCN-MEM-11g-1, SCN-MEM-11h-1, SCN-MEM-11i-1 ]
teeth: breaks-on "a per-seat input folded into the rollup (divergent bytes across s1/s2), a fabricated line on an absent source, a dropped drift-check (stale `t1` served), a dropped tail, or a generic-card substitution — none refutable by a single fixed-root witness"

### PROP-MEM-12 — memoized assembly, not free (instrumented counter)

inv: INV-MEM-12
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-12
law: ∀ facet-source set with moved-subset F ⊆ facets (F may be ∅ even when the root `rId‖rState` bumps), wave of N seats, event-log tail delta δ. re-roll count = |F| (0 when F = ∅ despite a root bump) ∧ drift-check count = 0 on a cache hit ∧ Awareness assembled once per root-state (assembly count = 1 across the N-seat wave, not N) ∧ Orientation folds only δ (never a full replay).
arbitrary: gen a per-facet source set + a moved-subset F (incl. ∅ under a root-state bump) + a wave of N seats + an event-log with an appended tail δ. Counter is instrumented, NOT timed (latency is Refuse-to-model).
covers_reqs: [ REQ-MEM-12a, REQ-MEM-12b, REQ-MEM-12c ]
witness: [ SCN-MEM-12a-1, SCN-MEM-12b-1, SCN-MEM-12c-1 ]
teeth: breaks-on "a root-keyed (always-miss) cache (counter = 5 on a root bump with no facet moved), a per-seat re-roll (assembly = N), or a whole-log Orientation replay — killed across arbitrary moved-subsets/seat-counts, beyond the single S42→S43 witness"

### PROP-MEM-13 — recall fires at re-spawn (push, not pull)

inv: INV-MEM-13
source: ../requirements/method-tags-mem.md@sha256:ff9924a9#INV-MEM-13
law: ∀ seat s, unit u re-spawned. spawnRecall(s, u) = archivedFold(s, u) pushed exactly once at spawn ∧ scoped to own + resumed only (∄ push of a foreign seat's fold or general consultable memory) ∧ deterministic off the archived record (spawnRecall run twice ⇒ identical push) ∧ never fires on a running turn (MEM-4 still bars general auto-injection).
arbitrary: gen archived closing folds for {own, foreign} seats × {resumed, other} units; gen a re-spawn of (s, u) + a repeated spawn.
covers_reqs: [ REQ-MEM-13a, REQ-MEM-13b, REQ-MEM-13c ]
witness: [ SCN-MEM-13a-1, SCN-MEM-13b-1, SCN-MEM-13c-1 ]
teeth: breaks-on "a discretionary-pull (nothing pushed at spawn), a foreign-fold/general-consultable push, or a live-mutable-state read (nondeterministic across two spawns) — killed across arbitrary fold sets, beyond the single T7 witness"

---

## Completeness (set-level gate)

- **behavioural INVs → PROP:** 13/13 (MEM-1..13); 0 uncovered, 0 invented-without-INV. All 13 MEM INVs are behavioural (no `n/a`).
- **PBT (property-flavored) goldens subsumed:** the 15 `gen: PBT` SCNs — MEM-7a..7f (→ PROP-MEM-7) and MEM-11a..11i (→ PROP-MEM-11) — each instance a clause of its rendered ∀-law; none contradicted.
- **conformance goldens linked as witness:** the 29 `gen: conformance` SCNs are carried as concrete witnesses of PROP-MEM-1/2/3/4/5/6/8/9/10/12/13.
- **residue (delegated, not rendered):** MEM-9b / 9c (named-scanner secret-scrub arm) — no pure ∀-oracle → FR-12 conformance harness (billy). Flagged in PROP-MEM-9, not forced into a property.
- **formal-cluster laws:** none in MEM (FSPEC-merge lives in KRN); nothing transcribed from `fspec-merge.md`.

## Self-check

- [x] one `properties-mem.md`; one PROP block per behavioural INV; every block conforms to the template card.
- [x] every behavioural INV → ≥1 PROP (13/13, mechanical count against `method-tags-mem.md`).
- [x] every `source` is a ptr+digest resolving to a real `### INV-MEM-<n>`; no invented law; no prose copy of code.
- [x] every `law` in the `∀ … . predicate` runnable idiom; no formal-cluster law in this block to transcribe.
- [x] every property-flavored (`gen: PBT`) golden's law present in PROP-MEM-7 / PROP-MEM-11; no PROP contradicts its witness.
- [x] every `teeth` names a mutant killed beyond the single witness.
- [ ] MEM-9 scrub-gate acceptance — **DELEGATED** to FR-12/billy (no pure ∀-form); flagged, not rendered.
