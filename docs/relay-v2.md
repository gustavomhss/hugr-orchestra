# Relay v2 — the campaign

**The call.** Relay is the engine. The MCP state machine (`HuGR/MCP-Statemachine`) becomes a frozen
reference: its profiles are the authoring corpus we migrate from, its Rust engine is not migrated and
not maintained. Every commit, PR and merge from here lands in this repo.

This document is the campaign's north star. It is written to be read cold, by someone (or some
context) that has none of the conversation that produced it.

**What v2 is, in one line:** the flat sprint becomes a two-coordinate state machine (`macro.sub`),
every sub-state carries a control that measures an outcome, and the loops that the harness used to
bound are bounded by this design instead.

The doctrine behind every choice here is [`enforcement-model.md`](enforcement-model.md). Where the two
disagree, that document wins and this one is stale. The mechanism decomposition it partially
supersedes is [`control-plane.md`](control-plane.md); §6 and §7 of that file are known wrong and are
fixed by **V11** below.

---

## 1. Frame

### 1.1 What we are optimizing for

Stated by the operator, and it is not throughput:

> Millimetric, surgical assertiveness. Protocols followed to the letter. Long complex horizons with N
> steps in between, followed to the letter. Without overloading the model's context, without
> lost-in-the-middle, and with per-state transparency.

Velocity is explicitly not a metric. A v2 that is slower and locates its failures precisely beats a v1
that is faster and reports "the output is wrong" over a 200-turn transcript.

### 1.2 The honest baseline

Measured on `main`, not assumed.

| | today |
|---|---|
| position | **one** coordinate, a WP id (R6) |
| structure | flat `work_packages[]`, no hierarchy |
| controls | `cmd` (deterministic, blocks) · `judge` (LLM, advisory unless `blocking: true`) |
| ledger | hash-chained, `gen` / `oracle` / `origin` in the hashed body (R5), round collapse (R7) |
| retry bounds | `retry_budget`, `reg_retry`, identical-round detection |
| CLI | `relay verify`, `relay-gate eval`, `relay-spec`, `relay-policy`, `relay-autodecompose`, `relay-corpus`, `relay-dash`, `relay-daemon` |
| profiles | **none in this repo** |
| block cap | **not handled at all** |
| self-check | not injected |
| judge artifact | static file paths from the plan; **no diff is computed** |
| wait channel | does not exist |
| tests | 138 passing |
| CI | **none configured** — `statusCheckRollup` is empty; the suite only ever runs locally |

Two measurements from the port experiment bound the migration's real cost:

- Compiling `profiles/planning.yaml` (4 macros, 16 sub-states, 52 criteria) produced **53 controls
  and 11 ungated sub-states** — every `execute` state. Those 11 advance on nothing today under MCP
  too, so the port was honest; but v2's whole claim is that a state is earned, and an ungated state
  is not.
- Keep-best costs **7.3×**: 53 declared controls became 389 executions across a full chain.

### 1.3 What "done" means for the campaign

V2 is done when, on a real profile, with a real agent, in one run:

1. the ledger shows a two-coordinate position on every entry,
2. `relay-spec lint` reports **zero** ungated sub-states,
3. `relay verify` reports INTACT and auditable with no oracle drift,
4. the chain is longer than the default block cap and completes anyway **with the cap explicitly
   disabled** — proving this design's own bounds held, not that the harness's cap was beaten,
5. the whole 138-test baseline is still green, plus v2's own tests.

Not "the code is written". Used, with the artifact to show for it.

---

## 2. How v2 works

### 2.1 The shape

```
hook chain   = [macro1, macro2, macro3, ...]    unbounded
  macro      = [sub1, sub2, sub3, ...]          a bounded scope, not a loop
    sub      = one gate, resolved in ONE fire
```

One agent for the whole chain. No reset at a macro boundary — a reset serializes a handoff, discards
live working memory between coupled states, and throws away the prefix cache.

**A macro is a scope, not a loop.** Each fire resolves exactly one sub-state. The macro says which set
of subs is active and contributes a prompt when first entered; it does not run its subs internally.
It carries no retry state of its own — per `enforcement-model.md` §7, what binds is a *recorded
verdict*, and only subs have those.

**One dispatcher, macros as data.** Not one hook script per macro. N scripts sharing a position file
breaks the single-writer invariant, and when the position matches no registered script every script
exits 0 and the chain is abandoned with nothing recorded — strictly worse than today's `POSITION LOST`,
which at least writes a line.

### 2.2 Why the schema stays flat

The obvious move is to nest: `macros[].subs[]`. We are not doing that.

Every existing path indexes `work_packages[]` positionally — the regression guard's
`.work_packages[range(0;$i)]`, keep-best, position-by-id, the corpus exporter, `relay-gate eval`.
Nesting rewrites all of them, and buys nothing, because the macro holds no state that the subs do not
already hold. So: **a macro lookup table plus a `macro` field on each WP.**

```json
{
  "brief": "...",
  "retry_budget": 3,
  "macros": [
    { "id": "frame", "title": "FRAME",
      "instructions": "Load protocols/planning.md@sha256:41808c99e71d — its MUST clauses bind." }
  ],
  "work_packages": [
    { "id": "intake", "macro": "frame", "kind": "execute",
      "title": "Intake",
      "instructions": "...",
      "self_check": ["Which inputs did you classify, and by what provenance?"],
      "checklist": [ { "id": "inputs-classified", "cmd": "plan-check --phase frame --criterion inputs_classified" } ] }
  ]
}
```

- Position is `<macro>.<sub>`, both ids, never array indices.
- A WP with no `macro` belongs to the implicit macro `_`. **A v1 sprint runs unchanged.**
- Entering a macro for the first time prepends that macro's `instructions` to the block reason. Once
  per macro, not once per sub — tracked by a marker file under the arm, because "first" cannot be
  inferred from the position alone once amendments can reorder. A macro re-entered after an amendment
  re-injects; a regression does **not** re-enter, because a regression re-blocks in place and never
  moves the cursor back.
- Ledger entries gain a `macro` field inside the hashed body, exactly as R5 added `gen` — but
  **only when the WP declares one**. `lib/relay-gate.sh` is shared with `benchmark/relay_hook.sh`,
  whose historical ledger hashes must stay comparable; it never sets `macro`, so its bytes and hashes
  are unchanged. This mirrors the existing rule that the benchmark omits the `arm` field by design.

### 2.3 Sub-state kinds

The mapping surface the profile compiler targets. Protocol Enforcer's five sub-state types become:

| PE type | v2 `kind` | behavior |
|---|---|---|
| `execute` | `execute` (default) | today's behavior — work, then the gate |
| `checklist` | `gate` | controls only; no instructions to work on |
| `review` | `review` | an `execute` whose controls include a verdict artifact, carrying the cold-context instruction |
| `inject` | `inject` | no work: the reason carries the named file's **real bytes**, the sha goes on the ledger, and the position advances in the same fire |
| `human_approval` | `human` | parks as `awaiting-human`; only a person's action moves it |

`inject` is the one that must not be faked. The engine reads the file and delivers it; a missing file
fails closed rather than advancing on an empty injection.

### 2.4 The gate, unchanged in mechanism

The agent never runs the test and does not know one exists. It works and stops. **Stopping is the
trigger.** Advancement is also a block — same channel, different reason, position moved. There is no
separate "advance hook".

What changes at the gate is only *what a control is allowed to be*:

- A deterministic control (`cmd`, exit 0) is the real oracle.
- A discursive control may be **added**, never stand alone, and is graded by cross-checking its
  claims against an artifact **the checker computed** — not one the agent supplied. See V5.
- A self-check ships **with the next state's instructions**, not after a failure. It is a forcing
  function and is never recorded as a verdict. An agent that knows in advance what it will be asked
  works toward it; asked only after failing, it is a remedy.

### 2.5 The bound that used to be free

**[MEASURED]** The harness caps consecutive hook blocks: three real `claude -p` runs gave 10 fires
with a varying reason, 9 with an identical one, and **20 with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0`**
(that run's own release limit, never the harness's). Since advancement is itself a block, the default
cap of 8 limits a whole chain to roughly 8 states.

V2 chains are longer than 8. So the cap must be off — and turning it off removes the harness's only
runaway protection. **Every loop in v2 is bounded by this design or it is a bug:**

| loop | bound | after v2 |
|---|---|---|
| gate retries | `retry_budget`, then escalate | shipped |
| regression path | `reg_retry`, cleared by a clean pass | shipped |
| identical rounds | no-progress detection escalates early | counted today; escalation in R8 |
| blocked-claims | never silenced; recurrence accelerates to a human | V7 |
| one `ask_orchestrator` question | 4 rounds | V10 |
| total `ask_orchestrator` calls | passive cap **with a deadline** | V10 |
| chain length via amendment | deliberately unbounded — appending cannot dodge a stuck gate, the cursor still must pass it | by design |

A chain that is longer than the live cap and does not know it is the campaign's single most likely
silent failure. **V2 makes it loud.**

---

## 3. The work packages

House idiom: **Owns (disjoint)** / **Frozen contract** / **Tests**. Nothing outside a package's Owns
list is touched by that package.

### V1 — Two-coordinate position

**Owns:** `bin/relay-arm-hook.sh` (position read/write, macro entry), `lib/relay-gate.sh` (ledger
envelope), `bin/relay-gate` (the two coordinates in its JSON outcome), `tests/test_position_macro.py`,
`docs/architecture.md`, `docs/authoring-sprints.md`.
**Does not own:** `benchmark/relay_hook.sh`. It deliberately stays on the integer counter so the
historical measurement corpus remains comparable — a decision already recorded in `control-plane.md`
§13, closed twice, not an oversight.
**Frozen contract:** sprint gains top-level `macros[]` and `work_packages[].macro`. Position file holds
`<macro>.<sub>`; a bare v1 position reads as `_.<sub>`. Ledger entries carry `macro` inside the hashed
body. A macro's `instructions` are injected exactly once, on first entry.
**Tests:** a v1 sprint runs byte-unchanged and its ledger still verifies · macro prompt injected once
across three subs · position survives a plan amendment · `relay-gate eval` reports the two coordinates.

### V2 — Block-cap preflight

**Owns:** `bin/relay-arm-hook.sh` (arm-creation path), `tests/test_cap_preflight.py`,
`docs/configuration.md`.
**Frozen contract:** on an arm's first fire, read `$CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` from the hook's
own environment — the hook runs inside the agent's process, so it sees the live value, which no
offline tool can. If the cap is unset, or set below the chain's block count, append a `cap-risk` entry
to the ledger **and** put the warning in the block reason. `0` (uncapped) is silent. Never proceed
silently into a chain that cannot finish.

The block count is **a lower bound, not a prediction**: `len(work_packages) + 1` assumes every gate
passes first try. Each retry, each regression re-block and each `ask_orchestrator` park costs another
block, so a chain that merely *fits* under the cap can still die mid-run. The warning says so; it does
not pretend to a number it cannot know.
**Tests:** unset env + a 12-WP sprint yields exactly one `cap-risk` on the chain · `=0` yields none ·
the entry survives `relay verify`.

### V3 — Oracle drift is reported

**Owns:** `bin/relay` (`laundered_controls`), `tests/test_ledger_provenance.py`, `docs/gates.md`.
**Frozen contract:** today only `fail → (new oracle) → pass` is reported. The measured attack is
`pass → (new oracle) → pass`: swap an already-passed control's `cmd` and `relay verify` prints
`INTACT / PASS — auditable` with the artifact absent. **The oracle change is already on the chain**
(R5) — only the report misses it. Add a distinct `ORACLE-DRIFT` class for **any** control whose oracle
changed mid-run, and refuse to print `auditable` when it is present.

No exemption is carved out for legitimate amendments, because no signed-amendment record exists yet —
**V11** introduces one. Until then every drift is reported, which is the correct failure direction: a
false positive costs a human one look, a false negative certifies a fabricated pass.
**Tests:** reproduce the swap on an all-passing chain — today it reports `INTACT / PASS — auditable`
— and assert `auditable` is withheld · an unchanged chain reports no drift.
*This is the cheapest real security win available; the evidence is already being written.*

### V4 — Self-check injected with the next state

**Owns:** `bin/relay-arm-hook.sh` (advance branch), sprint `work_packages[].self_check[]`,
`tests/test_self_check.py`, `docs/gates.md`.
**Frozen contract:** on advance, the reason carries the next sub's `instructions` **and** its
`self_check`. Never on a gate failure — failure feedback stays the failing control ids. A self-check
is text; it is never a verdict and never appears on the chain as one. It must probe the *protocol's
steps* while the deterministic control measures the *outcome*; if both ask the same question the
self-check is decoration, and **V8 lints for exactly that**.
**Tests:** advance reason contains the self-check · a gate-fail reason does not · no ledger entry is
produced by a self-check.

### V5 — The judge's artifact is computed, not supplied

**Owns:** `lib/relay-gate.sh` (judge branch), sprint `checklist[].diff` / `.paths`,
`tests/test_judge_diff.py`, `docs/gates.md`, `docs/fixtures/enforcement-model/`.
**Frozen contract:** the dispatcher records `base_ref` (the workdir's `HEAD`) on the ledger **in the
fire that advances into a sub-state** — that fire is the sub-state's entry; there is no other moment
the engine is running. A judge control with `diff: true` receives `git diff <base_ref>` computed by
the gate, which covers committed and uncommitted work alike, so an agent that never commits is not
invisible to it. Default
scope is **everything that changed**. A narrowing `paths` list is permitted but is recorded on the
chain as a narrowing, with its `origin` — so the scope-narrowing attack costs a visible entry instead
of being free. A non-git workdir **fails the control closed** with a stated reason; it never passes.
**Tests:** the six committed fixtures (`A-honest` … `F-injection-hides-lie`) replayed through the real
gate path, verdicts matching the recorded measurement · narrowing appears on the chain · non-git fails
closed.
*Rationale: `enforcement-model.md` §5 names both of these as open holes — the diff was never computed,
and artifact selection is an orchestrator field, which moves the scope-narrowing attack out of the
agent's prose and into the plan.*

### V6 — Sub-state kinds

**Owns:** sprint `work_packages[].kind`, `bin/relay-arm-hook.sh` dispatch, `tests/test_kinds.py`,
`docs/authoring-sprints.md`.
**Frozen contract:** the table in §2.3. `execute` is the default and is today's behavior exactly.
`inject` reads the file, delivers its real bytes, records the sha, advances in the same fire; a
missing file fails closed. `human` parks (needs **V7**).
**Tests:** `inject` advances in one fire and its sha is on the chain · a missing inject file fails
closed · `gate` with no instructions still blocks correctly · a v1 sprint with no `kind` anywhere is
unaffected.

### V7 — R8: `awaiting-human` + derived problems

**Owns:** as already decomposed in `control-plane.md` §13 (R8).
**Frozen contract:** `escalated` stops being an exit and becomes a state a person's action leaves. The
derived, self-clearing `problems` field. The hook can finally distinguish *complete* from *escalate*
in its output. Additionally: the agent's blocked-claim marker is honored only when the checklist also
failed, its reason is **cross-checked against the artifact** exactly like a discursive control, and the
marker is **never silenced** — a hard budget closes the honest channel at peak pressure, which is the
regime that produces covert shortcuts. Recurrence accelerates the path to a human instead.
**Tests:** per R8, plus: a blocked claim with a passing checklist does not park · a fabricated blocker
reason fails its cross-check.

### V8 — `relay-spec lint`

**Owns:** `bin/relay-spec.py` (new `lint` subcommand), `tests/test_spec_lint.py`,
`docs/spec-library.md`.
**Frozen contract:** over a sprint (compiled or hand-written), report and exit non-zero on:
sub-states with **zero deterministic controls**; controls that are judge-only and non-blocking;
`self_check` entries that duplicate a control's `assert`; a chain longer than the **default** block
cap of 8; and trivially-true commands (`true`, `exit 0`, `test -e .`). `--allow-ungated` downgrades
the first to a warning, for migration in progress.

The lint runs offline and therefore cannot see the agent's environment — it compares against the
documented default, and says so. **V2's preflight is the one that reads the live value.** The two are
not redundant: the lint catches an unrunnable profile at authoring time, the preflight catches a
misconfigured session at run time.
**Tests:** the planning profile compiled as-is reports **exactly 11** ungated sub-states — the number
the port measured, so the lint is calibrated against a known answer rather than against itself.
*Built before the migration, because it is the only instrument that can tell us the migration gated
anything.*

### V9 — The profile compiler

**Owns:** `bin/relay-profile.py`, `profiles/`, `tests/test_profile_compile.py`, `docs/profiles.md`.
**Frozen contract:** generalize `experiments/relay-port/planning-to-sprint.py` (in the reference repo)
into a first-class tool. Reads a PE-format YAML profile (`pipeline[].sub_states[]`) and emits a v2
sprint using V1's macros and V6's kinds. Macro order, sub-state order and criteria are **read from the
profile, never restated** — the family's cardinal rule.

**The `criteria_map` lives inside the profile YAML**, as a new top-level key, not in a sibling file.
One artifact cannot fork from itself, and the profiles are moving into this repo anyway, where the
Rust engine that would have choked on an unknown key never reads them.

A `--check` mode fails when the emitted sprint differs from the committed one, the same discipline
`gen-doc-index.py --check` already enforces. **It runs inside the test suite, not in CI** — this repo
has no CI checks configured.

The load-bearing clause: a criterion with no entry in the profile's `criteria_map` compiles to
**nothing at all**, and V8 reports the sub-state as ungated. It never compiles to a placeholder that
passes. A silently-passing placeholder is worse than an admitted hole, because it reads as coverage.
**Tests:** `planning.yaml` round-trips · an unmapped criterion produces zero controls and exactly one
lint finding · `--check` fails on a hand-edited sprint.

### V10 — `ask_orchestrator`

**Owns:** `bin/relay-daemon.py` (new endpoint), the tool shim, `tests/test_ask.py`, `docs/daemon.md`.
**Frozen contract:** per `enforcement-model.md` §6c. A block costs a model turn; a wait costs only wall
clock, so waiting is strictly cheaper — but a tool call that never stops leaves the enforcement layer
blind for its whole duration. Three consequences, all mandatory:

- **The meter is in the tool**, server-side, on the far side of the boundary — not in the hook, which
  never fires during a wait.
- The tool **refuses unless the current sub-state's checklist is failing**; the server runs the
  checklist itself. A conditioned channel, not a rest button.
- The total cap is **passive with a deadline**. On breach it notifies the orchestrator and keeps
  serving. Continue → continue. Stop, or silence past the window → park. Passive without a deadline is
  decorative; a dead orchestrator would mean no cap at all.

Pokes reuse **the same ticket id** — a new id would provision N times. Three pokes, park at the fourth.
An answer of "no" parks immediately rather than waiting out the rounds. The orchestrator notification
carries **facts, never the agent's prose** (`8 waits, 0 answered, 40 min, C3 still failing`); the
agent's text reaching the orchestrator is a social-engineering channel.

Single-writer is load-bearing — `relay_chain_append` computes `prev`/`seq` by reading the tail with no
locking, safe only because there is exactly one sequential writer. Daemon writes route through the
dispatcher or take a `mkdir` lock.
**Tests:** refusal when the checklist passes · ticket id stable across pokes · park at round 4 · a
silent orchestrator parks at the deadline rather than serving forever · a concurrent append does not
corrupt the chain.

### V11 — Amendment compliance, fixed

**Owns:** `docs/control-plane.md` §6/§7, the amendment path, `tests/test_amend.py`.
**Frozen contract:** two corrections to shipped doctrine.

1. **Compliance granularity is whatever has a recorded verdict.** With the cursor at `macro2.sub3`,
   amending `macro2.sub2` is simultaneously "under the cursor" (macro2 is open) and "already passed"
   (sub2 has a recorded pass); the linear criterion gives both answers. The rule that resolves it: a
   recorded verdict binds, and the enclosing macro being open is irrelevant.
2. **Loosening is defined by effect, not by act type.** Loosening = *the set of controls that must
   pass to reach a terminal state shrinks*. Deleting a control is the trivial case; rerouting so a
   control becomes unreachable, reordering it past the effective exit, splitting one hard control into
   two weak ones as "decomposition", and adding a state that bypasses a control's consequence all
   shrink that set — and all were free "additions" under the act-type wording. The set is comparable
   mechanically, before and after. Adding work that does not shrink it is free; anything that shrinks
   it is a signed act requiring a human. Granting more *time* (V10) does not shrink it, so it stays
   legitimate orchestrator authority.

**Tests:** each of the four disguised-loosening shapes is rejected · an append is accepted · deleting a
*currently failing* control is rejected (today it is legal).

### V12 — The walking skeleton

**Owns:** nothing new; a run and its recorded artifact.
**Frozen contract:** §1.3's five conditions, all in one real run, on one migrated profile, with a real
agent. This is the package that makes v2 true rather than written.

---

## 4. Profile migration

18 YAML profiles exist in the reference repo (`AUTHORING.md` is documentation, not a profile). They are not equal and most should not move.

| tier | profiles | disposition |
|---|---|---|
| **1 — migrate** | `planning`, `wp-execute`, `spec-decompose`, `design`, `research-v2`, `tdd_feature` | the working set; these are the product |
| **2 — on demand** | one of the `genesis-dependency*` lineage — **which one is an open question, see Q1** — and `finance-funnel-sota` (v1.1.0, the only profile past 1.0.0) | migrate when a run needs them |
| **3 — reference only** | `default`, `hacked`, `human-gate-demo`, `finance-funnel`, and whichever of `research` / `research-v2` and the genesis variants Q1 and Q2 retire | stay where they are, never migrated |
| **excluded** | `quick-bug-fix` | **notary-sealed — do not touch, at any tier** |

**The migration's real cost is not the compiler.** Per profile, the expensive artifact is the
`criteria_map`: one real command per criterion, plus a control for every `execute` sub-state that MCP
left ungated. `planning.yaml` alone is 52 criteria and 11 ungated states, both counted by the port's compiler.
Extrapolating that one profile across the six in tier 1 gives an order of 200 criteria and 40 ungated
states — **an estimate whose only basis is a single measured profile**, and the largest one. Treat it
as a magnitude, not a forecast; the second profile through the compiler replaces it with a real
figure. **That is the campaign, and the engine work
above is its prerequisite.**

### 4.1 Open questions — answer before migrating the tier they touch

| # | question | why it cannot be guessed | blocks |
|---|---|---|---|
| **Q1** | which of the five `genesis-dependency*` profiles is the live one? | all five are `version: "1.0.0"`, so the version field does not order them; by last-commit date `-sound-wired` (2026-08-22) is more recent than `-sound-attest` (2026-08-18), which contradicts the names. An initial draft of this plan asserted `-sound-attest` on the strength of the name alone, and that was wrong. | tier 2 |
| **Q2** | does `research-v2` actually supersede `research`? | inferred from the name only; both were last touched the same day | tier 3 |

### 4.2 The move itself

Copying the tier-1 profiles into `profiles/` in this repo is a discrete step, not a side effect of
**V9**, and it carries one rule: **the reference repo stops receiving commits.** Once a profile is
copied it is maintained here; the copy in `MCP-Statemachine` is frozen alongside the engine that used
to read it. A profile edited in both places is the fork this whole campaign exists to avoid.

### 4.3 Order

Per profile, in this order, and each one ends the same way: `relay-spec lint` reporting zero ungated
sub-states, and one recorded run.

1. `planning` — already compiled once by the port experiment, so it is the calibration case.
2. `wp-execute` — the natural downstream; a frozen plan's packets are what it consumes.
3. `tdd_feature` — smallest real profile, good for shaking out the compiler.
4. `spec-decompose`, `design`, `research-v2`.

---

## 5. Order, hotspots, and the thing that will bite

### 5.1 The hotspot

`bin/relay-arm-hook.sh` is touched by **V1, V2, V4, V6, V7**. That is five of twelve packages on one
file. They serialize; nothing else does.

```
serialized on the hook :  V1 → V2 → V4 → V6 → V7 → V10
parallel, disjoint     :  V3  (bin/relay)
                          V8  (bin/relay-spec.py)   [needs V1+V6's output shape to lint it]
                          V11 (docs + amendment path)
depends on everything  :  V9 (compiler)  →  migration  →  V12
```

### 5.2 Order, with the reason

1. **V1** first — every other package's output shape depends on the two coordinates existing.
2. **V2** and **V3** immediately after: both are small, both close a measured hole, and V2 in
   particular unblocks running anything longer than 8 states, which is every real profile.
3. **V4**, **V5**, **V6** — the control-quality trio. This is the enforcement model's own ordering:
   *controls that measure outcomes first, the privilege boundary second.*
4. **V7** (R8) — gates `kind: human` and V10's park.
5. **V8** before **V9**, always. The lint is what makes the compiler's honesty checkable; built after,
   it grades its own homework.
6. **V10** after V7.
7. **V11** any time; it is documentation plus one path.
8. Migration, then **V12**.

### 5.3 Risk register

| # | risk | why it is real | tripwire |
|---|---|---|---|
| **T1** | a chain longer than the live block cap dies silently at ~8 states | measured: 10 / 9 / 20 fires | a >8-WP run that produces no `cap-risk` entry means V2's preflight is broken |
| **T2** | the compiled sprint forks from its profile | the two are separate committed artifacts | `--check` in the suite; a green suite with a hand-edited sprint means the check is not wired |
| **T3** | migration produces controls that pass trivially, reading as coverage | 11 of 16 states have no control to start from, and the pressure is to fill them | V8's trivially-true detector; V9 compiling an unmapped criterion to nothing |
| **T4** | the daemon breaks single-writer on the ledger | `relay_chain_append` has no lock, by design | the concurrent-append test in V10; a spurious TAMPERED in normal use |
| **T5** | the 138-test baseline erodes package by package | five packages touch one hot file | full suite green is a precondition of every merge, not a final step |
| **T6** | scope creeps into the privilege boundary | it is the intellectually interesting problem | §6 below; it is out of scope and stays out |
| **T7** | `dod[]` and `checklist[]` are two vocabularies for one idea | already both in the schema | V9 targets `checklist[]` only; if a compiled sprint ever emits `dod[]`, the compiler drifted |

---

## 6. Explicitly not in v2

- **The privilege boundary.** The engine and the agent still run as the same OS user with no boundary,
  and five attacks reproduce against the shipped code. The ordering in `enforcement-model.md` §9 is
  deliberate and stands: controls that measure outcomes are free and address the common failure; the
  boundary is infrastructure and addresses the rare one. Build it when not knowing costs more than the
  infrastructure does. V3 takes the one piece that is already paid for.
- **Migrating the Rust engine.** `MCP-Statemachine` is reference. Its profiles move; its code does not.
- **`profiles/quick-bug-fix.yaml` and `~/.protocol-notary/`.** Sealed. Untouched at every tier.
- **Anything in `WhatiDidLately`.** Not this repo, no commits, ever.

---

## 7. Resuming this campaign cold

If you are reading this with no memory of the conversation that produced it, this section is the
entry point.

**Read in this order:** [`enforcement-model.md`](enforcement-model.md) (the doctrine — it wins over
this file wherever they disagree) → §2 above (how v2 works) → §3 (the twelve packages) → the state
line below.

**State:** the packages are numbered V1–V12 in §3. Each is either unstarted, or has a merged PR naming
it. `git log --oneline --grep='V[0-9]' main` is the authoritative answer; this paragraph is not.

**The corrections that must not regress.** Every one of these was wrong in a draft, and each is easy to
re-introduce because the wrong version is the intuitive one:

1. A macro is a **scope, not a loop**. It does not run its subs internally; one fire resolves exactly
   one sub-state. A "loop inside the macro's hook" cannot coexist with per-sub retry, since retrying
   requires the agent to have stopped and been re-invoked.
2. **One dispatcher, macros as data** — never one hook script per macro. N scripts break single-writer
   and, when the position matches no script, abandon the chain silently.
3. **Temporal's retry backoff does not transfer.** Backoff rations polls that arrive on a timer; the
   hook fires only when the agent stops, so sleeping buys latency and saves no turns. The bound is a
   turn count. Do not re-introduce a sleep. (`control-plane.md` §8 still carries the wrong version.)
4. **The blocked-claim marker is never silenced.** A hard budget closes the honest channel at peak
   pressure — the regime that produces covert shortcuts. Recurrence accelerates to a human instead.
5. **`ask_orchestrator` is metered server-side**, refuses unless the checklist is currently failing,
   and its cap is passive *with a deadline*. Waiting inside a tool call leaves the enforcement layer
   blind; that is the invariant this channel nearly broke.
6. **Loosening is by effect, not act type** — the must-pass set shrinking, however it shrinks.
7. **A recorded verdict binds**, not the enclosing macro's openness.
8. **An unmapped criterion compiles to nothing**, never to a placeholder that passes.
9. `relay_run_checklist` is consumed through a command substitution and therefore runs in a
   **subshell**; any in-memory buffer it fills evaporates. Buffers must be files. This one cost a
   rebuild once already.

**Positions already settled — do not re-litigate.** Velocity is not a metric. The agent is not reset
between states. Tool use is not restricted. Atomicity mitigates drift but does not replace controls.
The privilege boundary is deliberately deferred (§6).
