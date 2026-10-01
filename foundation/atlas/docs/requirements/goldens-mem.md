# Goldens — Block MEM (memory) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-mem.md`; every MEM INV method-tagged, no `formal` cluster — MEM only consumes kernel seams) ·
> **owner:** charlie (FORGE). MEM carries **no** `FSPEC` (the one Atlas `formal` model, `FSPEC-merge`, lives in KRN).
>
> **Derivation (not hand-authored where a generator exists):**
>
> - **MEM-7** (frecency eviction) and **MEM-11** (Awareness rollup) are `PBT` **by shape** — determinism laws.
>   Their SCNs are **concrete witness instances of the ordering/determinism laws** in `method-tags-mem.md`
>   (MEM-7: same cited-hit ledger ⇒ identical top-12 + identical evict set, total tie-break, no-pin, evict-at-~zero,
>   never-delete; MEM-11: same Atlas root ⇒ byte-identical Awareness across seats + re-runs, UN-SEEDED on absent
>   source, drift-flag on moved source) — `gen: PBT`.
> - **MEM-1/2/3/4/5/6/8/9a/10/12/13** are `reference-model` → **conformance / differential** against the named
>   build-language mock (`memory/ref/*.ts`, reused as the unit-test mock; anti-rot) — `gen: conformance`.
> - **MEM-9b / 9c** (the **named-scanner secret-scrub arm**) have **no pure-function oracle** — the scanner's
>   detection completeness is a black-box conformance concern **delegated to billy / FR-12** (method-tags-mem.md
>   §INV-MEM-9 + Refuse-to-model). The goldens here assert only the **pipeline wiring** (a named scanner runs
>   pre-write) and the **fail-closed gate** (a hit blocks the write); the scanner's own detection quality is **not**
>   authored as a golden in this block — `gen: residue`.
>
> **Semantic pin (MEM-1) — load-bearing for teeth direction:** MEM-1 is **injection-scoping, NOT access-control**
> (method-tags-mem.md §INV-MEM-1 + Refuse-to-model). SCN-MEM-1a asserts a **scoping** property (A's header injects
> only A's own entries, 0 cross-seat); SCN-MEM-1b asserts the design's **anti-confidentiality disclaimer**
> (Memory is git-native, so any repo reader reads every seat's bytes — the golden asserts **readability**). Neither
> is a cross-seat confidentiality / read-denial golden — that property is on the S2 **Refuse-to-model** list.

Concrete universe reused across the block:

| entity                 | value                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| seats                  | `orch` (orchestrator) · `alice` (member seat A) · `bob` (member seat B)                                                                                                                        |
| project-memory entries | `pm-A` (owner=`alice`, rule-id `R-seam-only`) · `pm-B` (owner=`bob`, rule-id `R-fold-pure`)                                                                                                    |
| member cap / orch cap  | `~500 tok` / `~800 tok` (ratified pinned bounds)                                                                                                                                               |
| Orientation cap        | `~250 tok` · Awareness cap `~400 tok` (ratified pinned bounds)                                                                                                                                 |
| Atlas root             | `rId=atlas@root`, `rState=S42`; facet sources `mission@m1`, `constitution@c1`, `terrain@t1`, `ontology@o1` (walt-curated `slot='definition'`), `taste@k1` (`CONVENTIONS.md@sha` + gate config) |
| frecency ledger `Λ`    | entries `R1..R13`; decay `0.5`/wave; current wave `w10`; a **cited-hit** = a seat/cold-reviewer citing the rule-id as governing a decision in the ledger                                       |

Frecency ledger `Λ` (MEM-7 witness — score = `Σ cited-hit · decay^(w10−hitWave)`):

| entry           | cited-hits (wave)           | frecency @ w10            | rank                    | in top-12?       |
| --------------- | --------------------------- | ------------------------- | ----------------------- | ---------------- |
| R1..R5, R8..R12 | 2 each @ {w9, w10}          | `2·(0.5+1)=3.0`           | 1–10 (by rule-id)       | yes              |
| R6              | 2 @ {w9, w10}               | `3.0` (ties R7)           | tie → rule-id `R6 < R7` | yes              |
| R7              | 2 @ {w9, w10}               | `3.0` (ties R6)           | tie → after R6          | yes              |
| **R13**         | **50 @ {w1}** (old-popular) | `50·0.5⁹ ≈ 0.098` (~zero) | 13                      | **no → evicted** |

(`R13` carries the largest **raw** hit-count (50) yet the **smallest** frecency ≈ ~zero — the no-pin witness.)

---

## REQ-MEM-1 — inject only own Memory (injection-scoping, NOT access-control)

### REQ-MEM-1a — inject only own Memory (happy)

### SCN-MEM-1a-1 — A's turn-header injects only A's own entries (happy)

source: REQ-MEM-1a
Given the store holds `pm-A` (owner=`alice`) and `pm-B` (owner=`bob`)
When alice's turn-header is assembled — `injectFor(store, alice)`
Then the header contains `pm-A` and **0** entries owned by `bob` — `injected ⊆ alice-owned` (a **scoping** predicate over the shared store)
teeth: breaks-on "the injector filters by recency/frecency instead of `owner` — `bob`'s `pm-B` leaks into alice's header (a foreign-seat entry injected)"
gen: conformance # differential vs `memory/ref/inject.ts` (owner-scoped injector). Asserts SCOPING, not confidentiality/read-denial.

### SCN-MEM-1a-2 — B's own turn-header injects only B's entries (held-out 2nd fixture) (happy)

source: REQ-MEM-1a
held_out: true
Given the same shared store holding `pm-A` (owner=`alice`, rule `R-seam-only`) and `pm-B` (owner=`bob`, rule `R-fold-pure`)
When bob's turn-header is assembled — `injectFor(store, bob)` (the mirror seat, a different owner)
Then the header contains `pm-B` and **0** entries owned by `alice` — `injected ⊆ bob-owned` (the same **scoping** predicate, witnessed on the other seat)
teeth: breaks-on "the injector is hardcoded to `alice` / filters by frecency instead of `owner` — `alice`'s `pm-A` (a foreign-seat entry) leaks into bob's header"
gen: conformance # held-out — DIFFERENT data (bob / `pm-B` / `R-fold-pure`), SAME owner-scoping behaviour & branch as SCN-MEM-1a-1; catches an alice-hardcoded injector

### REQ-MEM-1b — scoping, not access control (bytes stay readable) (happy)

### SCN-MEM-1b-1 — a repo reader reads every seat's Memory bytes (by design) (happy)

source: REQ-MEM-1b
Given Memory stored git-native as plaintext JSON in the repo, with `pm-A` owned by `alice`
When `bob` (holding only repo read, not seat A) reads the repo working tree
Then `bob` **can** read `pm-A`'s bytes on disk — Memory is not access-controlled; readability is the design (MEM-9/10 git-native)
teeth: breaks-on "the subsystem encrypts/gates per-seat Memory so a repo reader cannot read another seat's bytes — adding a confidentiality property the design explicitly disclaims (MEM-1 is scoping, not access-control)"
gen: conformance # asserts READABILITY (the disclaimer). Deliberately NOT a read-denial golden — true per-seat confidentiality is Refuse-to-model.

### SCN-MEM-1b-2 — a repo reader reads the other seat's Memory bytes (held-out 2nd fixture) (happy)

source: REQ-MEM-1b
held_out: true
Given Memory stored git-native as plaintext JSON in the repo, with `pm-B` owned by `bob`
When `alice` (holding only repo read, not seat B) reads the repo working tree
Then `alice` **can** read `pm-B`'s bytes on disk — Memory is not access-controlled; readability is the design (MEM-9/10 git-native)
teeth: breaks-on "the subsystem encrypts/gates per-seat Memory so a repo reader cannot read `pm-B`'s bytes — adding a confidentiality property the design explicitly disclaims (MEM-1 is scoping, not access-control)"
gen: conformance # held-out — mirror reader/target (`alice` reads `bob`'s `pm-B`), SAME readability disclaimer as SCN-MEM-1b-1. Deliberately NOT a read-denial golden.

---

## REQ-MEM-2 — kind partition (Memory ⊥ Knowledge)

### REQ-MEM-2a — no Memory-as-Knowledge (guard)

### SCN-MEM-2a-1 — a Memory entry routed into Knowledge is rejected (guard)

source: REQ-MEM-2a
Given a write `put(kind=knowledge, entry=<a Memory entry>)` — routing a Memory entry into the shared-Knowledge partition of the one Atlas store
When the kind-router processes it
Then the write is **rejected** — `partition(entry)` must equal `entry.kind`; no Memory entry enters the Knowledge partition
teeth: breaks-on "the router ignores the discriminant and stores the Memory entry as shared Knowledge (a memory→knowledge conflation)"
gen: conformance # oracle = `memory/ref/kinds.ts` (over the shared `store.ts`, KERNEL-3)

### SCN-MEM-2a-2 — a Logbook entry routed into Knowledge is rejected (held-out 2nd fixture) (guard)

source: REQ-MEM-2a
held_out: true
Given a write `put(kind=knowledge, entry=<a LogbookEntry>)` — routing a concrete Memory entry (an orchestrator logbook entry) into the shared-Knowledge partition of the one Atlas store
When the kind-router processes it
Then the write is **rejected** — `partition(entry)` must equal `entry.kind`; no Memory entry enters the Knowledge partition
teeth: breaks-on "the router ignores the discriminant and stores the logbook entry as shared Knowledge (a memory→knowledge conflation)"
gen: conformance # held-out — DIFFERENT concrete memory entry (a LogbookEntry, not a generic project entry), SAME partition-reject branch as SCN-MEM-2a-1

### REQ-MEM-2b — no Knowledge-as-Memory (guard)

### SCN-MEM-2b-1 — a Knowledge fact routed into Memory is rejected (guard)

source: REQ-MEM-2b
Given a write `put(kind=memory, entry=<a Knowledge fact>)` — routing a Knowledge fact into the Memory partition
When the kind-router processes it
Then the write is **rejected** — no Knowledge fact is stored as Memory
teeth: breaks-on "the router stores the Knowledge fact as Memory (a knowledge→memory conflation)"
gen: conformance

### SCN-MEM-2b-2 — an ontology definition fact routed into Memory is rejected (held-out 2nd fixture) (guard)

source: REQ-MEM-2b
held_out: true
Given a write `put(kind=memory, entry=<a walt-curated `slot='definition'` ontology fact>)` — routing a concrete Knowledge fact into the Memory partition
When the kind-router processes it
Then the write is **rejected** — no Knowledge fact is stored as Memory
teeth: breaks-on "the router stores the `slot='definition'` ontology fact as Memory (a knowledge→memory conflation)"
gen: conformance # held-out — DIFFERENT concrete Knowledge fact (an ontology definition node), SAME partition-reject branch as SCN-MEM-2b-1

---

## REQ-MEM-3 — injected `project` cap (totality, no silent overflow)

### REQ-MEM-3a — injected project memory capped (happy)

### SCN-MEM-3a-1 — a within-cap member injection is accepted (happy)

source: REQ-MEM-3a
Given two candidate `project` sets for alice against her `~500 tok` member cap: `A_ok` summing to `480 tok` and `A_over` summing to `620 tok`
When the cap-gate assembles each — `capGate(entries, ~500)`
Then `A_ok` (`480 ≤ 500`) is **accepted** and `A_over` (`620 > 500`) is **rejected**
teeth: breaks-on "the cap check is dropped — `A_over` (`620 tok`) is injected, exceeding the `~500` member cap"
gen: conformance # oracle = `memory/ref/cap.ts`; the `~`-caps are ratified pinned bounds (tokenizer itself Refuse-to-model)

### SCN-MEM-3a-2 — a within-cap orchestrator injection is accepted (held-out 2nd fixture) (happy)

source: REQ-MEM-3a
held_out: true
Given two candidate `project` sets for `orch` against its `~800 tok` orchestrator cap: `Ω_ok` summing to `760 tok` and `Ω_over` summing to `900 tok`
When the cap-gate assembles each — `capGate(entries, ~800)`
Then `Ω_ok` (`760 ≤ 800`) is **accepted** and `Ω_over` (`900 > 800`) is **rejected**
teeth: breaks-on "the cap check is dropped / hardcoded to the `~500` member cap — `Ω_over` (`900 tok`) is injected, exceeding the `~800` orchestrator cap"
gen: conformance # held-out — DIFFERENT seat + cap + token sums (orch / `~800` / 760·900), SAME accept/reject cap-gate branches as SCN-MEM-3a-1

### REQ-MEM-3b — over-cap write rejected (guard)

### SCN-MEM-3b-1 — an over-cap write is a structured rejection, never silent overflow (guard)

source: REQ-MEM-3b
Given a `project`-memory write that would push alice's injected set to `540 tok`, over her `~500` cap
When the write is attempted
Then it is **rejected** as a structured over-cap rejection — never silently truncated or overflowed
teeth: breaks-on "the over-cap write is silently accepted or silently truncated (silent overflow) instead of returning a rejection"
gen: conformance

### SCN-MEM-3b-2 — an over-cap orchestrator write is a structured rejection (held-out 2nd fixture) (guard)

source: REQ-MEM-3b
held_out: true
Given a `project`-memory write that would push `orch`'s injected set to `860 tok`, over its `~800` orchestrator cap
When the write is attempted
Then it is **rejected** as a structured over-cap rejection — never silently truncated or overflowed
teeth: breaks-on "the over-cap orchestrator write is silently accepted or silently truncated (silent overflow) instead of returning a rejection"
gen: conformance # held-out — DIFFERENT seat + cap (orch / `~800` / 860), SAME structured-rejection branch as SCN-MEM-3b-1

---

## REQ-MEM-4 — consultable is never free

### REQ-MEM-4a — consultable never auto-injects (guard)

### SCN-MEM-4a-1 — task/pr/logbook never auto-inject on a running turn (guard)

source: REQ-MEM-4a
Given alice on a **running turn** with `task` memory, `pr` memory, and a `logbook` all present in the store
When her running-turn header is assembled — `assembleHeader(alice)`
Then none of `{task, pr, logbook}` is auto-injected — `header ∩ {task,pr,logbook} = ∅`
teeth: breaks-on "`task` memory auto-injects into the running-turn header (a consultable kind leaks into injection)"
gen: conformance # oracle = `memory/ref/inject.ts` (shared with MEM-1)

### SCN-MEM-4a-2 — bob's running-turn header auto-injects no consultable (held-out 2nd fixture) (guard)

source: REQ-MEM-4a
held_out: true
Given `bob` on a **running turn** with `task` memory, `pr` memory, and a `logbook` all present in the store
When his running-turn header is assembled — `assembleHeader(bob)`
Then none of `{task, pr, logbook}` is auto-injected — `header ∩ {task,pr,logbook} = ∅`
teeth: breaks-on "`pr` memory auto-injects into bob's running-turn header (a consultable kind leaks into injection)"
gen: conformance # held-out — DIFFERENT seat (bob) and teeth on the `pr` kind, SAME consultable-∩-header=∅ branch as SCN-MEM-4a-1

### REQ-MEM-4b — consultable only via explicit recall (happy)

### SCN-MEM-4b-1 — task memory is returned only on an explicit memory-recall (happy)

source: REQ-MEM-4b
Given `task` memory present but not injected on the running turn
When alice issues an explicit `memory-recall` for it, and — separately — no recall is issued
Then it is returned **only** in response to the explicit `memory-recall`, and on no other read path (the MEM-13 re-spawn push of the seat's _own resumed_ fold being the sole carve-out)
teeth: breaks-on "`task` memory is returned on a non-recall read path — the explicit-recall gate is bypassed"
gen: conformance

### SCN-MEM-4b-2 — pr memory is returned only on an explicit memory-recall (held-out 2nd fixture) (happy)

source: REQ-MEM-4b
held*out: true
Given `pr` memory present but not injected on bob's running turn
When bob issues an explicit `memory-recall` for it, and — separately — no recall is issued
Then it is returned **only** in response to the explicit `memory-recall`, and on no other read path (the MEM-13 re-spawn push of the seat's \_own resumed* fold being the sole carve-out)
teeth: breaks-on "`pr` memory is returned on a non-recall read path — the explicit-recall gate is bypassed"
gen: conformance # held-out — DIFFERENT consultable kind (`pr`, not `task`) + seat (bob), SAME explicit-recall-only branch as SCN-MEM-4b-1

---

## REQ-MEM-5 — templated, fail-closed

### REQ-MEM-5a — untemplated write rejected (guard)

### SCN-MEM-5a-1 — a missing-field write is rejected fail-closed (guard)

source: REQ-MEM-5a
Given a `TaskMemoryEntry` write missing its required `stoppedAt` field (an untemplated write)
When the per-type validator runs — `validate(task, entry)`
Then the write is **rejected fail-closed** — the missing-field entry never persists
teeth: breaks-on "the validator is fail-open — the missing-field entry persists as free prose"
gen: conformance # oracle = `memory/ref/template.ts` (mirrors spec A-13)

### SCN-MEM-5a-2 — a Task entry missing its `lesson` field is rejected fail-closed (held-out 2nd fixture) (guard)

source: REQ-MEM-5a
held_out: true
Given a `TaskMemoryEntry` write missing its required `lesson` field (a different untemplated write than SCN-MEM-5a-1's missing `stoppedAt`)
When the per-type validator runs — `validate(task, entry)`
Then the write is **rejected fail-closed** — the missing-field entry never persists
teeth: breaks-on "the validator only checks `stoppedAt` (overfit to fixture-1) — the entry missing `lesson` persists as free prose"
gen: conformance # held-out — DIFFERENT missing field (`lesson`, not `stoppedAt`; both in the closing-fold field set), SAME fail-closed reject branch as SCN-MEM-5a-1; catches a stoppedAt-only validator

### REQ-MEM-5b — logbook prose bounded to sections (happy)

### SCN-MEM-5b-1 — logbook prose is confined to its fixed sections (happy)

source: REQ-MEM-5b
Given a `logbook` entry whose prose spills **outside** its fixed sections
When the section-validator runs
Then the out-of-section prose is **rejected** — prose is confined within the fixed sections
teeth: breaks-on "free-form prose outside the fixed sections is accepted into the logbook entry"
gen: conformance

### SCN-MEM-5b-2 — a logbook entry with an appended free-form paragraph is rejected (held-out 2nd fixture) (happy)

source: REQ-MEM-5b
held_out: true
Given a `logbook` entry that appends a free-form paragraph **after** its last fixed section (prose outside the fixed sections)
When the section-validator runs
Then the out-of-section prose is **rejected** — prose is confined within the fixed sections
teeth: breaks-on "a free-form paragraph appended after the fixed sections is accepted into the logbook entry"
gen: conformance # held-out — DIFFERENT concrete out-of-section shape (a trailing appended paragraph), SAME confine-to-sections reject branch as SCN-MEM-5b-1

---

## REQ-MEM-6 — Orientation is derived & shared, never a written entry

### REQ-MEM-6a — Orientation goal from DEFINE (happy)

### SCN-MEM-6a-1 — the goal is taken from the ratified DEFINE artifact (happy)

source: REQ-MEM-6a
Given the ratified DEFINE artifact carrying the mission `goal`
When Orientation is assembled — `orient(defineArtifact, log)`
Then `Orientation.goal` is taken from the ratified DEFINE artifact (not authored per-seat)
teeth: breaks-on "`goal` is sourced from a seat's `project` memory / hand-authored — it diverges from the ratified DEFINE artifact"
gen: conformance # oracle = `memory/ref/orient.ts`

### SCN-MEM-6a-2 — the goal tracks a re-ratified DEFINE artifact (held-out 2nd fixture) (happy)

source: REQ-MEM-6a
held_out: true
Given the DEFINE artifact re-ratified to a new mission `goal` (a superseding DEFINE version), with a seat's `project` memory also present
When Orientation is assembled — `orient(defineArtifact', log)`
Then `Orientation.goal` is taken from the **re-ratified** DEFINE artifact (not the seat's `project` memory, not the prior DEFINE)
teeth: breaks-on "`goal` is sourced from a seat's `project` memory / pinned to the stale prior DEFINE — it diverges from the re-ratified DEFINE artifact"
gen: conformance # held-out — DIFFERENT concrete DEFINE (a re-ratified version), SAME goal-from-DEFINE branch as SCN-MEM-6a-1

### REQ-MEM-6b — Orientation state as event-log fold (happy)

### SCN-MEM-6b-1 — last/current/state is a fold over the event log (happy)

source: REQ-MEM-6b
Given the event log with entries up to the current head
When Orientation's `last/current/state` is assembled
Then they are a **fold over the event log** (a pure function of the log) — identical to a replay-from-empty
teeth: breaks-on "`last/current/state` is read from a mutable snapshot — it diverges from a fold-from-log replay"
gen: conformance # shares KERNEL-5's `fold.ts` reducer

### SCN-MEM-6b-2 — a longer event log still folds to a replay-from-empty (held-out 2nd fixture) (happy)

source: REQ-MEM-6b
held_out: true
Given a **different** event log — more entries, a distinct head `H'` — up to the current head
When Orientation's `last/current/state` is assembled
Then they are a **fold over the event log** (a pure function of the log) — identical to a replay-from-empty over `H'`
teeth: breaks-on "`last/current/state` is read from a mutable snapshot — it diverges from a fold-from-log replay over `H'`"
gen: conformance # held-out — DIFFERENT concrete log/head, SAME fold-purity (== replay-from-empty) branch as SCN-MEM-6b-1

### REQ-MEM-6c — Orientation injected byte-identically (happy)

### SCN-MEM-6c-1 — two seats at one head get byte-identical Orientation (happy)

source: REQ-MEM-6c
Given `alice` and `bob` at the **same** event-log head
When each seat's Orientation is injected
Then `alice`'s Orientation bytes **==** `bob`'s (byte-identical across members) — `orient` has no per-seat input
teeth: breaks-on "assembly folds a per-seat field into Orientation — `alice` and `bob` get divergent Orientation"
gen: conformance

### SCN-MEM-6c-2 — a member and the orchestrator get byte-identical Orientation (held-out 2nd fixture) (happy)

source: REQ-MEM-6c
held_out: true
Given `alice` (member) and `orch` (orchestrator) at the **same** event-log head
When each seat's Orientation is injected
Then `alice`'s Orientation bytes **==** `orch`'s (byte-identical across all members, the orchestrator being a seat like any other) — `orient` has no per-seat input
teeth: breaks-on "assembly folds a per-seat field (e.g. an orch-vs-member branch) into Orientation — `alice` and `orch` get divergent Orientation"
gen: conformance # held-out — DIFFERENT seat pair (member vs orchestrator, not two members), SAME byte-identity branch as SCN-MEM-6c-1

### REQ-MEM-6d — Orientation within token cap (happy)

### SCN-MEM-6d-1 — injected Orientation is within the ~250 cap (happy)

source: REQ-MEM-6d
Given two Orientation assemblies at the current head: `O_ok` summing to `240 tok` and `O_over` summing to `300 tok`, against the `~250 tok` cap
When each is injected
Then `O_ok` (`240 ≤ 250`) is injected and `O_over` (`300 > 250`) is **rejected/truncated**
teeth: breaks-on "the `~250` cap is not enforced — `O_over` injects at `300 tok`"
gen: conformance # `~250` is a ratified pinned bound

### SCN-MEM-6d-2 — Orientation at the exact cap boundary is injected (held-out 2nd fixture) (happy)

source: REQ-MEM-6d
held_out: true
Given two Orientation assemblies at a different head: `O_edge` summing to exactly `250 tok` and `O_bust` summing to `251 tok`, against the `~250 tok` cap
When each is injected
Then `O_edge` (`250 ≤ 250`) is injected and `O_bust` (`251 > 250`) is **rejected/truncated**
teeth: breaks-on "the `~250` cap uses a strict `<` (off-by-one) or is unenforced — `O_edge` at the boundary is dropped or `O_bust` injects at `251 tok`"
gen: conformance # held-out — DIFFERENT token sums at the exact `≤`-boundary (250·251, not 240·300), SAME cap accept/reject branch as SCN-MEM-6d-1

### REQ-MEM-6e — Orientation never a written entry (guard)

### SCN-MEM-6e-1 — Orientation cannot be persisted as a per-member written entry (guard)

source: REQ-MEM-6e
Given Orientation derived from `(DEFINE, log)`
When a code path attempts to persist Orientation as a per-member written `project` entry
Then it is **rejected** — Orientation is derived-only, never a written entry (so it can never go stale)
teeth: breaks-on "Orientation is stored as a written `project`-memory entry — it later goes stale against a new log head"
gen: conformance

### SCN-MEM-6e-2 — Orientation cannot be persisted as a written `task` entry by the orchestrator (held-out 2nd fixture) (guard)

source: REQ-MEM-6e
held_out: true
Given Orientation derived from `(DEFINE, log)`
When `orch` attempts to persist Orientation as a written `task`-memory entry
Then it is **rejected** — Orientation is derived-only, never a written entry (so it can never go stale)
teeth: breaks-on "Orientation is stored as a written `task`-memory entry — it later goes stale against a new log head"
gen: conformance # held-out — DIFFERENT persistence attempt (orch / a `task` entry, not a member `project` entry), SAME derived-only reject branch as SCN-MEM-6e-1

---

## REQ-MEM-7 — deterministic frecency eviction ordering under capacity (PBT)

### REQ-MEM-7a — hit counts only on cited rule-id (happy)

### SCN-MEM-7a-1 — a hit increments only on a cited-as-governing event (happy)

source: REQ-MEM-7a
Given rule `R5` with 4 prior cited-hits; a seat's turn that merely **reads/mentions** `R5` in prose without citing it as governing, and a cold-reviewer event that **cites `R5` as governing** a decision in the ledger
When hits are recomputed — `score(R5, ledger)`
Then `R5`'s hit count rises by **exactly 1** (the cited-as-governing event), **not** by the mere read/mention
teeth: breaks-on "a hit increments on any access/mention of the rule — the read bumps `R5` and frecency inflates without a cited application"
gen: PBT # witness of the cited-only increment law (decay over logged ledger events, NOT wall-clock — Refuse-to-model)

### REQ-MEM-7b — injected set is top-12 by frecency (happy)

### SCN-MEM-7b-1 — same ledger ⇒ identical ordered top-12 (determinism) (happy)

source: REQ-MEM-7b
Given the cited-hit ledger `Λ` (R1..R13, capacity `12`, decay `0.5`/wave, current wave `w10`) with the score tie `frecency(R6)=frecency(R7)=3.0`
When the frecency ranker runs **twice** on the identical `Λ`
Then both runs yield the **identical ordered top-12** (R1..R12 by score desc; the R6/R7 tie broken by rule-id asc, `R6` before `R7`), byte-identical, with R13 excluded
teeth: breaks-on "the ranker breaks the R6/R7 score tie by **insertion-order** — the two runs order them differently (nondeterministic top-12)"
gen: PBT # witness of the determinism + total-tie-break laws (same ledger ⇒ identical top-12)

### REQ-MEM-7c — evict at near-zero frecency (happy)

### SCN-MEM-7c-1 — the ~zero-frecency entry is evicted to the archive (happy)

source: REQ-MEM-7c
Given only 5 active entries `R1..R5` (capacity 12, so **slots remain free**), where `R4` has decayed to frecency `≈0.05` (~zero) while `R1..R3,R5` sit at `3.0`
When the injection set is recomputed at wave `w10`
Then `R4` is **evicted to the archive** (~zero frecency) even though slots remain — the injected set is `{R1,R2,R3,R5}`
teeth: breaks-on "eviction is keyed on rank-position (drop only rank>12) not on ~zero frecency — with only 5 entries `R4` (rank ≤12) is retained though its frecency is ~zero"
gen: PBT # witness of the evict-at-~zero law

### REQ-MEM-7d — no slot pinned by old-popular rule (guard)

### SCN-MEM-7d-1 — a high-raw-count old rule loses its slot to a fresh one (guard)

source: REQ-MEM-7d
Given `R13` with **50 cumulative old hits** (all at `w1`) and `R1` with 2 recent hits (`w9,w10`); under frecency `R13≈0.098`, `R1=3.0`
When the top-12 injected set is ranked
Then `R1` outranks `R13` and `R13` holds **no slot** — cumulative popularity does not pin a slot
teeth: breaks-on "ranking is mutated to raw cumulative hit-count (LFU) — `R13`'s 50 hits pin slot 1 and the fresh `R1` is starved"
gen: PBT # THE no-pin law — the task-highlighted mutant (LFU / raw-count ossification)

### REQ-MEM-7e — evicted entries retained & re-spawnable (happy)

### SCN-MEM-7e-1 — an evicted entry stays in the versioned archive and re-spawns (happy)

source: REQ-MEM-7e
Given `R13` just evicted to the archive at `w10`
When the archive is queried and a re-spawn requests `R13`
Then `R13` is still present (versioned) in the archive and is **re-spawnable** into the active set
teeth: breaks-on "eviction removes `R13` from the store — the archive query misses and `R13` cannot be re-spawned"
gen: PBT

### REQ-MEM-7f — memory never deleted (guard)

### SCN-MEM-7f-1 — no delete op removes any memory; store size is monotone (guard)

source: REQ-MEM-7f
Given the memory store after eviction and archival churn over waves `w1..w10`
When any delete / hard-remove is attempted on any memory entry
Then it is **rejected** — the store is insert-only; store size is monotone non-decreasing across all waves
teeth: breaks-on "eviction is implemented as a hard delete — the evicted entry's bytes are removed and store size drops"
gen: PBT # reuses KERNEL-4's insert-only `log.ts` floor

---

## REQ-MEM-8 — the logbook is a ledger

### REQ-MEM-8a — logbook is orchestrator-only (happy)

### SCN-MEM-8a-1 — only the orchestrator may write the logbook (happy)

source: REQ-MEM-8a
Given a `logbook` write attempted by member seat `alice` and, separately, by `orch`
When each is processed
Then only `orch`'s write is accepted; `alice`'s is **rejected** — the logbook is orchestrator-only
teeth: breaks-on "a member seat's logbook write is accepted (a non-orchestrator author writes the logbook)"
gen: conformance # oracle = `memory/ref/logbook.ts` (append-only, shares KERNEL-4's `log.ts`)

### SCN-MEM-8a-2 — bob's logbook write is rejected; only orch's is accepted (held-out 2nd fixture) (happy)

source: REQ-MEM-8a
held_out: true
Given a `logbook` write attempted by member seat `bob` and, separately, by `orch`
When each is processed
Then only `orch`'s write is accepted; `bob`'s is **rejected** — the logbook is orchestrator-only
teeth: breaks-on "member seat `bob`'s logbook write is accepted (a non-orchestrator author writes the logbook)"
gen: conformance # held-out — DIFFERENT member seat (bob, not alice), SAME orchestrator-only reject branch as SCN-MEM-8a-1

### REQ-MEM-8b — one append-only entry per PR (happy)

### SCN-MEM-8b-1 — a second entry for the same PR is rejected (happy)

source: REQ-MEM-8b
Given a logbook already holding one entry for PR `#42`
When a second entry for PR `#42` is written
Then it is **rejected** — exactly one append-only entry per PR (`≤1 entry/prId`)
teeth: breaks-on "a second entry for PR `#42` is appended (or the existing one edited in place) — the one-per-PR guard is dropped"
gen: conformance

### SCN-MEM-8b-2 — a second entry for a different PR is rejected (held-out 2nd fixture) (happy)

source: REQ-MEM-8b
held_out: true
Given a logbook already holding one entry for PR `#57`
When a second entry for PR `#57` is written
Then it is **rejected** — exactly one append-only entry per PR (`≤1 entry/prId`)
teeth: breaks-on "a second entry for PR `#57` is appended (or the existing one edited in place) — the one-per-PR guard is dropped"
gen: conformance # held-out — DIFFERENT PR id (`#57`, not `#42`), SAME one-per-PR reject branch as SCN-MEM-8b-1

### REQ-MEM-8c — logbook fills capped fixed sections (happy)

### SCN-MEM-8c-1 — an over-cap / unfilled-section entry is rejected (happy)

source: REQ-MEM-8c
Given a logbook entry for PR `#42` whose fixed sections are filled within their per-section caps, and a second whose one section is over its cap
When each is validated
Then the within-cap entry is accepted and the over-cap one is **rejected** — the fixed sections + per-section caps are enforced
teeth: breaks-on "an over-cap / unfilled-section entry is accepted — the section caps are not enforced"
gen: conformance

### SCN-MEM-8c-2 — an entry whose `decision` section is over cap is rejected (held-out 2nd fixture) (happy)

source: REQ-MEM-8c
held_out: true
Given a logbook entry for PR `#57` whose fixed sections are filled within their per-section caps, and a second whose `decision` section is over its cap
When each is validated
Then the within-cap entry is accepted and the over-cap one is **rejected** — the fixed sections + per-section caps are enforced
teeth: breaks-on "an over-cap `decision`-section entry is accepted — the section caps are not enforced"
gen: conformance # held-out — DIFFERENT PR (`#57`) + over-cap section, SAME section-cap accept/reject branch as SCN-MEM-8c-1

### REQ-MEM-8d — logbook consultable, never injected (happy)

### SCN-MEM-8d-1 — the logbook is consultable but never injected (happy)

source: REQ-MEM-8d
Given a `logbook` present in the store during alice's running turn
When her header is assembled and, separately, a consult by PR/date/territory is issued
Then the logbook is **consultable** (returned by the consult) but **never injected** into the header
teeth: breaks-on "the logbook auto-injects into the turn-header (it must be consultable-only)"
gen: conformance # consultable-never-injected enforced via the MEM-4 `inject.ts` mock

### SCN-MEM-8d-2 — the logbook is consultable by territory but never injected (held-out 2nd fixture) (happy)

source: REQ-MEM-8d
held_out: true
Given a `logbook` present in the store during `orch`'s running turn
When its header is assembled and, separately, a consult **by territory** is issued
Then the logbook is **consultable** (returned by the territory consult) but **never injected** into the header
teeth: breaks-on "the logbook auto-injects into orch's turn-header (it must be consultable-only)"
gen: conformance # held-out — DIFFERENT seat (orch) + consult axis (territory, not PR), SAME consultable-never-injected branch as SCN-MEM-8d-1

### REQ-MEM-8e — supersede by link, not rewrite (guard)

### SCN-MEM-8e-1 — a later entry supersedes by link, leaving history intact (guard)

source: REQ-MEM-8e
Given a landed logbook entry `L1` for PR `#42` recording a decision, later superseded
When a later entry supersedes `L1`'s decision — `supersede(#42, link)`
Then the later entry **links** to `L1` and `L1`'s bytes are **unchanged** (supersede by link, never by rewriting history)
teeth: breaks-on "the supersede rewrites `L1`'s bytes in place — history is mutated instead of linked"
gen: conformance

### SCN-MEM-8e-2 — a superseding entry for a different PR links, leaving history intact (held-out 2nd fixture) (guard)

source: REQ-MEM-8e
held_out: true
Given a landed logbook entry `L2` for PR `#57` recording a decision, later superseded
When a later entry supersedes `L2`'s decision — `supersede(#57, link)`
Then the later entry **links** to `L2` and `L2`'s bytes are **unchanged** (supersede by link, never by rewriting history)
teeth: breaks-on "the supersede rewrites `L2`'s bytes in place — history is mutated instead of linked"
gen: conformance # held-out — DIFFERENT PR/entry (`#57` / `L2`, not `#42` / `L1`), SAME supersede-by-link (no-rewrite) branch as SCN-MEM-8e-1

---

## REQ-MEM-9 — portable round-trip (+ delegated secret-scrub arm)

### REQ-MEM-9a — Memory exports to open JSON (happy)

### SCN-MEM-9a-1 — export→import round-trips 1:1 as open JSON (happy)

source: REQ-MEM-9a
Given a Memory store holding one entry of each memory type (project / task / pr / logbook)
When `import(export(mem))` is computed
Then `deepEqual(mem, import(export(mem)))` holds — the open-JSON dump replays 1:1 into a fresh store, and a grep of the dump finds 0 host/external refs (no lock-in)
teeth: breaks-on "export drops the `task`-memory map (a lossy / lock-in encoding) — `import(export(mem)) ≠ mem`"
gen: conformance # oracle = `memory/ref/portable.ts` (shares KERNEL-6's `portable.ts`)

### SCN-MEM-9a-2 — a multi-member store with an archived entry round-trips 1:1 (held-out 2nd fixture) (happy)

source: REQ-MEM-9a
held_out: true
Given a Memory store holding `pm-A` and `pm-B`, an `orch` logbook entry, a `pr` entry, and an **archived (evicted) `R13`** entry
When `import(export(mem))` is computed
Then `deepEqual(mem, import(export(mem)))` holds — the open-JSON dump replays 1:1 into a fresh store (the archive included), and a grep of the dump finds 0 host/external refs (no lock-in)
teeth: breaks-on "export drops the archived `R13` entry (a lossy encoding of evicted-but-retained memory) — `import(export(mem)) ≠ mem`"
gen: conformance # held-out — DIFFERENT store contents (multi-member + archived R13, not one-of-each), SAME deepEqual round-trip branch as SCN-MEM-9a-1

### REQ-MEM-9b — secrets scrubbed by named scanner (happy) [DELEGATED — billy/FR-12]

### SCN-MEM-9b-1 — a named scanner runs in the pre-write path (happy)

source: REQ-MEM-9b
Given the write pipeline wired with a **named** scanner (gitleaks / trufflehog) in the pre-write stage
When a memory write is processed
Then a named scanner runs **before** the write persists — the scanner stage is present and named in the pipeline
teeth: breaks-on "the pre-write scanner stage is absent — writes persist with no scanner ever having run"
gen: residue # WIRING only. Scanner detection completeness has no pure-function oracle → delegated to the FR-12 conformance harness against the real binary (billy). NOT a scanner-detection golden.

### REQ-MEM-9c — scanner hit blocks the write (guard) [DELEGATED — billy/FR-12]

### SCN-MEM-9c-1 — a scanner hit blocks the write (fail-closed) (guard)

source: REQ-MEM-9c
Given the named scanner signals a **hit** on a memory write carrying a planted secret (the scanner-hit boolean is the delegated input — the scanner's detection quality is billy/FR-12 territory)
When the fail-closed gate processes the hit
Then the write is **blocked** (fail-closed) — not redacted-and-continued, not logged-and-passed
teeth: breaks-on "on a scanner hit the write is redacted-and-continued, or the gate fails open — the write persists despite the hit"
gen: residue # asserts fail-closed WIRING given a hit; scanner detection completeness delegated to billy/FR-12. NOT a scanner-detection golden.

---

## REQ-MEM-10 — versioned & nothing dies

### REQ-MEM-10a — every memory type versioned & travels (happy)

### SCN-MEM-10a-1 — every memory type travels at commit/PR/branch/fork (happy)

source: REQ-MEM-10a
Given the memory store (all types, all members incl. `orch`) at commit `C1`, then a branch and a fork
When each memory type is inspected at commit / PR / branch / fork
Then every memory type is versioned with the repo and **travels** at each — no type is left behind on the fork; log-length is monotone across the simulated commit/branch/fork
teeth: breaks-on "`task` memory is kept in a non-versioned local side-store — it does not travel on the fork"
gen: conformance # reuses KERNEL-4's insert-only `log.ts` (monotonicity)

### SCN-MEM-10a-2 — every type travels across two commits and a second fork (held-out 2nd fixture) (happy)

source: REQ-MEM-10a
held_out: true
Given a two-member store (`alice` + `bob`, all types incl. `orch`'s logbook) advanced across commits `C1 → C2`, then a branch and a **second** fork
When each memory type is inspected at commit / PR / branch / fork
Then every memory type is versioned with the repo and **travels** at each — no type is left behind on the fork; log-length is monotone across the `C1→C2` commit/branch/fork sequence
teeth: breaks-on "`pr` memory is kept in a non-versioned local side-store — it does not travel on the second fork"
gen: conformance # held-out — DIFFERENT topology (two commits + a second fork, multi-member) & teeth on the `pr` type, SAME travels-at-each + monotone branch as SCN-MEM-10a-1

### REQ-MEM-10b — runs re-spawnable from the record (happy)

### SCN-MEM-10b-1 — a run rebuilds solely from the versioned record (happy)

source: REQ-MEM-10b
Given an ephemeral agent's run recorded in the versioned record
When the run is re-spawned
Then it rebuilds **solely from the versioned record** — re-spawnable without any mutable in-memory snapshot
teeth: breaks-on "re-spawn depends on a mutable in-memory snapshot absent from the record — the run cannot be rebuilt after a restart"
gen: conformance

### SCN-MEM-10b-2 — a second run re-spawns from the record after a restart (held-out 2nd fixture) (happy)

source: REQ-MEM-10b
held_out: true
Given a second ephemeral agent (`bob`'s) run recorded in the versioned record, following a process restart
When the run is re-spawned
Then it rebuilds **solely from the versioned record** — re-spawnable without any mutable in-memory snapshot
teeth: breaks-on "re-spawn depends on a mutable in-memory snapshot absent from the record — bob's run cannot be rebuilt after the restart"
gen: conformance # held-out — DIFFERENT concrete run (bob's, post-restart), SAME rebuild-solely-from-record branch as SCN-MEM-10b-1

---

## REQ-MEM-11 — byte-identical derived Awareness rollup (PBT)

### REQ-MEM-11a — Awareness assembled from Atlas root (happy)

### SCN-MEM-11a-1 — Awareness is a pure derivation of the Atlas root (happy)

source: REQ-MEM-11a
Given the Atlas root (`rId=atlas@root`, `rState=S42`) with the five facet sources present
When alice's Awareness is assembled — `rollup(rootNode)`
Then Awareness is the derived rollup of `{mission@m1, constitution@c1, terrain@t1, ontology@o1, taste@k1}` — a pure function of the root, with no hand-authored bytes
teeth: breaks-on "Awareness is read from a per-seat memory blob instead of derived from the root — a subsequent root edit no longer changes Awareness"
gen: PBT # oracle = `memory/ref/awareness.ts`; witness of the root-derivation law

### REQ-MEM-11b — each facet grounded & drift-checked (happy)

### SCN-MEM-11b-1 — a moved facet source is served drift-flagged, never silently stale (happy)

source: REQ-MEM-11b
Given each facet carries a grounding `node@sha` (mission@m1 …), and the `terrain` source node is then **moved** (re-hashed `t1 → t2`)
When Awareness is re-assembled and drift-checked
Then the `terrain` facet is served **drift-flagged** (re-grounded to `t2` with a drift marker), never served silently stale at `t1`
teeth: breaks-on "the drift-check is dropped — `terrain` is served at the stale `t1` grounding with no flag after its source moved"
gen: PBT # witness of the moved-source ⇒ drift-flag law

### REQ-MEM-11c — top tier only within cap (happy)

### SCN-MEM-11c-1 — only the top tier is carried, under the ~400 cap (happy)

source: REQ-MEM-11c
Given the `constitution` facet whose full tier list exceeds the `~400 tok` Awareness cap
When Awareness is assembled under the `≤ ~400 tok` cap
Then only the **top tier** of each facet is carried and the injected Awareness sum is `≤ ~400 tok`
teeth: breaks-on "the cap is not enforced — the full constitution tier is injected and Awareness exceeds `~400 tok`"
gen: PBT # `~400` is a ratified pinned bound

### REQ-MEM-11d — ontology from curated definition nodes (happy)

### SCN-MEM-11d-1 — ontology sources only walt-curated definition nodes (happy)

source: REQ-MEM-11d
Given `slot='definition'` nodes curated by the DEFINE persona (walt) and a non-definition Knowledge fact authored by a member seat
When the `ontology` facet is assembled
Then it sources **only** the walt-curated `slot='definition'` nodes — the member's non-definition fact is not pulled into ontology
teeth: breaks-on "ontology sources any Knowledge fact regardless of slot/curator — a member's non-definition fact leaks into the ontology facet"
gen: PBT

### REQ-MEM-11e — absent source renders UN-SEEDED (guard)

### SCN-MEM-11e-1 — an absent facet source renders a labeled UN-SEEDED sentinel (guard)

source: REQ-MEM-11e
Given a fresh brownfield move-in (pre-genesis-seed GEN-9) where the `taste` facet's source (`CONVENTIONS.md@sha`) is **absent**
When Awareness is assembled
Then the `taste` facet renders as a labeled **`UN-SEEDED`** sentinel — never a fabricated self-model line
teeth: breaks-on "an absent facet source is filled with a hallucinated/fabricated taste line instead of the `UN-SEEDED` sentinel"
gen: PBT # witness of the absent-source ⇒ UN-SEEDED law

### REQ-MEM-11f — Awareness never hand-written (guard)

### SCN-MEM-11f-1 — a hand-written entry cannot author Awareness (guard)

source: REQ-MEM-11f
Given a hand-written memory entry that attempts to author the `mission` Awareness facet directly
When Awareness is assembled from the root
Then the hand-written entry is **not** a source — Awareness derives only from the Atlas root and cannot be authored by a written entry
teeth: breaks-on "a hand-written memory entry is accepted as an Awareness source — the facet rots (diverges from the root) and can go stale"
gen: PBT

### REQ-MEM-11g — Awareness byte-identical across members (happy)

### SCN-MEM-11g-1 — two seats get byte-identical Awareness from one root (happy)

source: REQ-MEM-11g
Given `alice` and `bob` both assembling Awareness from the identical Atlas root (`rState=S42`)
When each seat's header is built
Then `alice`'s Awareness bytes **==** `bob`'s Awareness bytes (byte-identical across members)
teeth: breaks-on "assembly folds a per-seat input (e.g. seat-id) into the facet rollup — `alice` and `bob` get divergent Awareness bytes"
gen: PBT # witness of the byte-identical-derivation determinism law

### REQ-MEM-11h — Awareness tail pull-reachable (happy)

### SCN-MEM-11h-1 — the truncated tail stays pull-reachable, not injected (happy)

source: REQ-MEM-11h
Given the `terrain` facet whose full territory list has a top tier (injected) and a tail (beyond the top tier)
When Awareness is assembled and injected
Then only the top tier is injected while the tail stays **pull-reachable** (fetchable on demand) — not injected, not dropped
teeth: breaks-on "the top-tier truncation **drops** the tail (a pull for a tail item misses) instead of keeping it pull-reachable"
gen: PBT

### REQ-MEM-11i — no generic card substitute (guard)

### SCN-MEM-11i-1 — a generic language/stack card never stands in for Awareness (guard)

source: REQ-MEM-11i
Given the Atlas root facet sources are **unavailable** (assembly cannot derive Awareness this turn), and a generic language/stack card ("a TypeScript/Node project") is available as a fallback
When Awareness is assembled
Then the seat is served **`UN-SEEDED`** (no derived Awareness) — the generic card never stands in for it
teeth: breaks-on "when facet assembly is unavailable the system substitutes the generic stack card as Awareness instead of serving `UN-SEEDED`"
gen: PBT

---

## REQ-MEM-12 — memoized assembly, not free (instrumented re-roll counter)

### REQ-MEM-12a — facet cached on its own source hash (happy)

### SCN-MEM-12a-1 — an unchanged root ⇒ 0 facet re-rolls (cached on the facet's own source hash) (happy)

source: REQ-MEM-12a
Given Awareness assembled at root-state `S42`, with per-facet caches keyed on each facet's **own** source subtree hash (`mission@m1`, `constitution@c1`, …) — NOT the root `rId‖rState`
When a turn runs at a **bumped root** (`rId‖rState` moves `S42→S43` because something _elsewhere_ in the Atlas changed) while **none of the 5 facet sources moved** (`mission@m1 … constitution@c1` all unchanged)
Then the instrumented re-roll / drift-check counter is **0** — every facet is a cache hit despite the root bump
teeth: breaks-on "the facet cache is keyed on the root `rId‖rState` — the root bump misses **all 5** facets and the counter is `5` (>0) though no facet source moved"
gen: conformance # oracle = `memory/ref/memoize.ts` (instrumented call-counter, NOT timing — latency is Refuse-to-model)

### SCN-MEM-12a-2 — a later root bump with no facet moved still costs 0 re-rolls (held-out 2nd fixture) (happy)

source: REQ-MEM-12a
held_out: true
Given Awareness assembled at root-state `S50`, with per-facet caches keyed on each facet's **own** source subtree hash
When a turn runs at a **bumped root** (`rId‖rState` moves `S50→S51` because something elsewhere in the Atlas changed) while **none of the 5 facet sources moved**
Then the instrumented re-roll / drift-check counter is **0** — every facet is a cache hit despite the root bump
teeth: breaks-on "the facet cache is keyed on the root `rId‖rState` — the `S50→S51` bump misses all 5 facets and the counter is `5` (>0) though no facet source moved"
gen: conformance # held-out — DIFFERENT root states (`S50→S51`, not `S42→S43`), SAME 0-re-roll cache-hit branch as SCN-MEM-12a-1

### REQ-MEM-12b — Awareness assembled once per root-state (happy)

### SCN-MEM-12b-1 — one shared assembly per wave, not one per seat (happy)

source: REQ-MEM-12b
Given a wave of 3 seats (`alice`, `bob`, `orch`) at root-state `S42`
When Awareness is assembled for the wave
Then it is assembled **once** and shared across all 3 seats — the assembly counter is `1`, not `3` (no per-seat re-roll; it is byte-identical by MEM-11)
teeth: breaks-on "Awareness is re-rolled per seat — the assembly counter is `3` (one per seat) for a byte-identical result"
gen: conformance

### SCN-MEM-12b-2 — a two-seat wave shares one assembly (held-out 2nd fixture) (happy)

source: REQ-MEM-12b
held_out: true
Given a wave of 2 seats (`alice`, `bob`) at root-state `S50`
When Awareness is assembled for the wave
Then it is assembled **once** and shared across both seats — the assembly counter is `1`, not `2` (no per-seat re-roll; it is byte-identical by MEM-11)
teeth: breaks-on "Awareness is re-rolled per seat — the assembly counter is `2` (one per seat) for a byte-identical result"
gen: conformance # held-out — DIFFERENT wave (2 seats at `S50`, not 3 at `S42`), SAME one-shared-assembly branch as SCN-MEM-12b-1

### REQ-MEM-12c — Orientation is an incremental fold (happy)

### SCN-MEM-12c-1 — Orientation folds only the tail delta, never a full replay (happy)

source: REQ-MEM-12c
Given Orientation last assembled at log head `H1`, with 2 new event-log entries appended since (head now `H3`)
When Orientation is recomputed for the next header
Then it folds **only** the 2 appended tail entries (incremental fold from `H1`), never a full replay of the whole log
teeth: breaks-on "Orientation replays the entire log each turn — the fold reprocesses all entries, not just the tail delta"
gen: conformance

### SCN-MEM-12c-2 — Orientation folds a single tail entry, not a replay (held-out 2nd fixture) (happy)

source: REQ-MEM-12c
held_out: true
Given Orientation last assembled at log head `H3`, with 1 new event-log entry appended since (head now `H4`)
When Orientation is recomputed for the next header
Then it folds **only** the 1 appended tail entry (incremental fold from `H3`), never a full replay of the whole log
teeth: breaks-on "Orientation replays the entire log each turn — the fold reprocesses all entries, not just the single tail entry"
gen: conformance # held-out — DIFFERENT delta (`H3→H4`, 1 entry, not `H1→H3`/2), SAME incremental-fold branch as SCN-MEM-12c-1

---

## REQ-MEM-13 — recall fires at re-spawn (push, not pull)

### REQ-MEM-13a — recall pushed at re-spawn (happy)

### SCN-MEM-13a-1 — a re-spawned seat's own prior fold is pushed at spawn (happy)

source: REQ-MEM-13a
Given seat `alice` re-spawned onto task `T7` she is resuming, whose archived closing fold carries `{attempted, failedWith, stoppedAt, lesson}`
When `alice` is spawned — `spawnRecall(alice, T7)`
Then her own prior `T7` fold is **pushed** at spawn (not awaited as a discretionary `memory-recall`)
teeth: breaks-on "the fold is only available via a discretionary pull — nothing is pushed at spawn and a re-spawn starts blind"
gen: conformance # oracle = `memory/ref/respawn.ts`; source = MEM-10's versioned archive

### SCN-MEM-13a-2 — a re-spawned seat's own prior PR fold is pushed at spawn (held-out 2nd fixture) (happy)

source: REQ-MEM-13a
held_out: true
Given seat `bob` re-spawned onto PR `#58` he is resuming, whose archived closing fold carries `{attempted, failedWith, stoppedAt, lesson}`
When `bob` is spawned — `spawnRecall(bob, #58)`
Then his own prior `#58` fold is **pushed** at spawn (not awaited as a discretionary `memory-recall`)
teeth: breaks-on "the fold is only available via a discretionary pull — nothing is pushed at spawn and a re-spawn starts blind"
gen: conformance # held-out — DIFFERENT seat + unit KIND (bob / a `pr` fold `#58`, not alice / a `task` fold T7), SAME push-at-spawn branch as SCN-MEM-13a-1

### REQ-MEM-13b — recall scoped to own resumed fold (happy)

### SCN-MEM-13b-1 — the spawn push is scoped to own + resumed only (happy)

source: REQ-MEM-13b
Given at re-spawn: `alice`'s own `T7` fold, `bob`'s `T7` fold, and general consultable `task` memory
When the spawn push fires
Then **only** `alice`'s own fold for the **resumed** `T7` is pushed — `bob`'s fold and general consultable are **not** (MEM-4 still bars general auto-injection on a running turn)
teeth: breaks-on "the spawn push injects a foreign seat's fold or general consultable memory — it is not scoped to own+resumed"
gen: conformance

### SCN-MEM-13b-2 — the PR-fold spawn push is scoped to own + resumed only (held-out 2nd fixture) (happy)

source: REQ-MEM-13b
held_out: true
Given at re-spawn: `bob`'s own `#58` fold, `alice`'s `#58` fold, and general consultable `pr` memory
When the spawn push fires
Then **only** `bob`'s own fold for the **resumed** `#58` is pushed — `alice`'s fold and general consultable are **not** (MEM-4 still bars general auto-injection on a running turn)
teeth: breaks-on "the spawn push injects a foreign seat's fold or general consultable memory — it is not scoped to own+resumed"
gen: conformance # held-out — DIFFERENT seat + `pr` unit (`bob` / `#58`, not alice / T7), SAME own+resumed-only scoping branch as SCN-MEM-13b-1

### REQ-MEM-13c — recall deterministic off archived fold (happy)

### SCN-MEM-13c-1 — the spawn recall is deterministic off the archived record (happy)

source: REQ-MEM-13c
Given `T7`'s archived closing fold in the versioned record
When the spawn recall runs **twice**
Then both runs push the **identical** fold, driven deterministically off the archived record (not live/mutable state)
teeth: breaks-on "the recall reads live mutable state instead of the archived fold — two spawns push different content (nondeterministic)"
gen: conformance

### SCN-MEM-13c-2 — the PR-fold spawn recall is deterministic off the archived record (held-out 2nd fixture) (happy)

source: REQ-MEM-13c
held_out: true
Given `#58`'s archived closing fold in the versioned record
When the spawn recall runs **twice**
Then both runs push the **identical** fold, driven deterministically off the archived record (not live/mutable state)
teeth: breaks-on "the recall reads live mutable state instead of the archived fold — two spawns push different content (nondeterministic)"
gen: conformance # held-out — DIFFERENT unit (`pr` `#58`, not `task` T7), SAME deterministic-off-archive branch as SCN-MEM-13c-1

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 46/46 REQ have ≥1 SCN (MEM-1a/1b · 2a/2b · 3a/3b · 4a/4b · 5a/5b · 6a/6b/6c/6d/6e · 7a/7b/7c/7d/7e/7f · 8a/8b/8c/8d/8e · 9a/9b/9c · 10a/10b · 11a/11b/11c/11d/11e/11f/11g/11h/11i · 12a/12b/12c · 13a/13b/13c).
- **Guard coverage:** 13/13 unwanted / If-then / "shall-not" REQ have a guard SCN — 2a, 2b, 3b, 4a, 5a, 6e, 7d, 7f, 8e, 9c, 11e, 11f, 11i.
- **Teeth (Gate 3):** 46/46 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous. PBT witnesses are **interesting** (a real R6/R7 score tie for 7b; a genuine high-raw-count/low-frecency R13 for 7d — the no-pin law; a real moved-source `t1→t2` for 11b; two distinct seats for 6c/11g/12b — no antecedent-failure passes).
- **gen histogram:** PBT 15 (7a–7f · 11a–11i) · conformance 29 (1a/1b · 2a/2b · 3a/3b · 4a/4b · 5a/5b · 6a–6e · 8a–8e · 9a · 10a/10b · 12a/12b/12c · 13a/13b/13c) · residue 2 (9b, 9c — the delegated secret-scrub arm).
- **Delegated (noted, not authored here):** MEM-9's named-scanner **detection completeness** — no pure-function oracle → billy / FR-12 conformance harness against the real gitleaks/trufflehog binary. SCN-MEM-9b/9c assert only pipeline wiring + fail-closed gate, never scanner detection quality.
- **Held-out leg (Wave H S3 re-freeze):** every `gen: conformance` REQ now carries a **second, `held_out: true`** fixture (`SCN-…-2`) — DIFFERENT concrete data (mirror seat / a distinct owner, the `~800` orchestrator cap, a `pr`-vs-`task` fold, distinct PR ids `#57`/`#58`, distinct root-states/heads, a `≤`-boundary sum, an archived-entry round-trip) hitting the **SAME** behaviour/branch, each with its own `teeth`. This arms the execution GATE's held-out leg (**FULL** assurance): the builder never sees the `-2` fixture, so an overfit that passes `-1` fails the independent `-2`. Coverage: **29/29** conformance REQ held-out-covered. **Exempt (noted, not held-out-covered):** the 15 `gen: PBT` SCN (MEM-7a–f, 11a–i — subsumed by `properties-mem.md`, where the property IS the generality) and the 2 `gen: residue` SCN (MEM-9b/9c — the delegated secret-scrub arm, billy/FR-12).
