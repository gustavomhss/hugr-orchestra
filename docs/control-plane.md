# Relay Control Plane — design

How an orchestrator drives and **mutates a live chain**, and how a human sees and intervenes in one.

This document is a design, not a description: most of what it specifies is not built. It follows
the repo's existing claim discipline — **MEASURED** (reproduced on this machine, command included),
**ARGUED** (reasoned from primary sources, not run here), **UNKNOWN** (named, not guessed).

---

## 0. What this renegotiates

`docs/architecture.md:26` states the current doctrine plainly:

> "The orchestrator never polls, never injects mid-reasoning, and never interprets output."

and `docs/getting-started.md:156`: "The orchestrator never needs to re-enter the loop. The stop is
the engine."

**This design contradicts that on purpose.** It keeps "the stop is the engine" — the hook remains the
only thing that advances a chain — and drops "the orchestrator never re-enters". The orchestrator
becomes a second writer of *desired state*, never of position.

That is a doctrine change, not an implementation detail. It is recorded here so a future reader does
not treat a deliberate decision as a regression against `architecture.md`.

**Why it is worth the change.** `sprint.json` is re-read from disk on every fire
(`bin/relay-arm-hook.sh:67-70,118,144`), so live mutation already *works*; it is simply unguarded,
unrecorded, and undocumented as a control surface. The choice is not "mutable vs immutable" — the
chain is already mutable. The choice is whether that mutability is **accounted for**.

---

## 1. Three defects that must close before anything else is built

All three are MEASURED. All three are load-bearing: a control plane built on top of them would be
building comfort on a record that cannot support it.

### D1 — the ledger records the claim, never the oracle · MEASURED

`ledger_item` writes `{id, assert, verdict, graded_by}` (`lib/relay-gate.sh:62-67`). The `cmd` — the
only thing connecting the assertion to reality — never enters the hashed body. Combined with
(a) `sprint.json` re-read per fire, and (b) `relay verify` taking each control's **last** verdict
("post-repair state", `bin/relay:46-52`), a one-line edit converts a failing control into an
auditable pass.

Reproduced:

```
control LGPD-1  assert: "no raw email (PII) reaches the application logs"
                cmd:    ! grep -q '@' app.log        app.log contains gustavo@example.com
fire 1  ->  FAIL, blocks.                                          correct

edit only the oracle; id and assert byte-identical:
                cmd:    true
fire 2  ->  sprint-complete

$ relay verify run
  chain integrity:  INTACT (4 chained entries, head c15c293d005c...)
  LGPD-1  no raw email (PII) reaches the application logs   deterministic
  RESULT: PASS - deterministic controls verified, chain intact, auditable.   exit 0
```

The PII is still in the file. Nothing was tampered with: the chain is intact because the chain never
knew what it was verifying.

`bin/relay-dash.py:59-78` already articulates the correct principle — it refuses to source the
terminal outcome from `outcome.json` because that file sits outside the hash chain. The `cmd` sits in
exactly the same position and was not noticed.

**Fix:** the evaluated oracle enters the hashed body. See §5.

**Residual, found later by reproducing rather than reasoning** (relay-v2 V3, `docs/gates.md` §5):
recording the oracle was necessary but not sufficient. D1's shape is fail-then-pass, and that is what
`relay verify` was taught to look for. Swapping the `cmd` of a control that had **already passed**
never produces a fail, so it never matched — and there was nothing to match against anyway, because
the only path that re-executes an earlier control, the keep-best regression guard, recorded nothing
at all. The chain therefore held one oracle per control and the swap was invisible. Fixed by
recording re-runs (`regression-item`) and by reporting *any* oracle change within a run.

### D2 — position is an array index, so mutation before the cursor livelocks · MEASURED

Advancement state is a bare integer (`bin/relay-arm-hook.sh:66,90`). `docs/faq.md:126` warns "Avoid
reordering WPs in a live sprint" and `docs/authoring-sprints.md:35` "Never change an id mid-sprint" —
both are symptoms of index-as-identity, and both understate the failure.

Reproduced. Splicing **after** the cursor is clean:

```
chain A B C, cursor at B (counter=1); insert NEW between B and C
fire -> "Relay gate 'B' passed. Next gate: NEW. injected mid-run"
```

Splicing **before** the cursor does not merely misaim — it produces a false accusation that never
terminates:

```
insert EARLY at the head  ->  EARLY A B NEW C
counter stays 2, now points at B (already passed)
fire -> "an earlier gate regressed - restore these before finishing: cE.
         (Current gate 'B' is satisfied; this is a backslide in prior work.)"
```

Nothing regressed. `cE` did not exist while the runner worked; it is being told to restore work it
was never assigned. And because a regression-only failure deliberately does not charge the current
gate's retry budget (`bin/relay-arm-hook.sh:126-131`, locked by
`tests/test_arm_state.py::test_regression_only_does_not_escalate_current_gate`), the only exit from
the loop is disabled:

```
retry_budget=9
fire 1..12 -> block, block, ...   counter=2  retry_2=0 throughout
escalate events in ledger: 0
```

Twelve fires, zero progress, zero escalation, and each fire costs a model turn. The runner is stuck
forever and no human is told.

**Fix:** position is a WP id (§4), and the orchestrator cannot name a position at all (§6).

### D3 — provenance is stamped and then dropped · MEASURED (by reading)

`bin/relay-policy.py:86-89` stamps `policy: <bundle>` onto each injected control, and its docstring
(`:19`) says this exists "so the ledger/audit can tell org-mandated from WP-specific". The gate core
never reads that field: `relay_run_checklist` (`lib/relay-gate.sh:60-80`) passes only
`id, assert, verdict, graded_by` to `ledger_item`. The stamp never reaches the chain.

This matters more under this design than it does today: once an orchestrator can inject controls, a
trace that cannot distinguish a pre-decided control from an injected one cannot support the claim
the ledger exists to make.

**Fix:** `origin` becomes a chained field (§5), fed by the existing stamp.

---

## 2. The model

Relay is **a reconciler that ticks at stop boundaries.** It is not an RPC target and should not grow
into one.

```
desired state    sprint.json                      written by the orchestrator
observed state   position + retries + workdir     written only by the gate
tick             a SubagentStop / a gate eval     the only moment relay has agency
```

The orchestrator never calls relay. It edits desired state; the next tick reconciles. That is
already the mechanism — this design names it, and adds the two things a reconciler needs and relay
lacks: a way to tell whether an edit has been observed (§3), and a bounded set of edits that are
legal from the current position (§6).

**Ownership, stated once:**

| Writer | May write | May never write |
|---|---|---|
| orchestrator | `sprint.json` (through the verbs in §7) | `position`, `retry_*`, `ledger.jsonl` |
| gate (hook / CLI / daemon) | `position`, `retry_*`, `ledger.jsonl` | `sprint.json` |
| human | a signed override that the gate applies | anything, directly |

Today nothing enforces this and `counter` is a plain file any process can write
(`docs/sdk.md:27`, `bin/relay-arm-hook.sh:66`). A control plane whose participants can write each
other's state has no invariants at all.

---

## 3. Generation

`sprint.json` carries `gen` (monotonic, bumped by every accepted mutation). Every ledger entry stamps
the `gen` it evaluated under. The arm exposes `observedGeneration` = the `gen` of the most recent
tick.

Without this, an orchestrator that mutates a live chain is firing and hoping: it has no way to know
whether its edit was seen before, during, or after the gate it cares about. With it, "did my change
land?" is `observedGeneration >= gen`, and every verdict on the chain is attributable to a specific
version of the plan.

ARGUED, from Kubernetes' `generation`/`observedGeneration` and from Temporal's versioning of running
executions. Kubernetes bumps `generation` on *intent* changes only — never on observations — which is
the discipline that keeps the echo meaningful: if gate results bumped it, the echo would be noise.

**A mutation carries a read-witness, not just a version.** `(expected_gen, expected_ledger_head)`,
both checked. Generation alone is the weaker primitive git calls `--force-with-lease`, and git's own
man page explains why it is not enough: any background read "launders the lease" — you overwrite a
value you never actually looked at. `--force-if-includes` fixes it by requiring proof you built on
what you are replacing. The ledger head is that proof, and it costs nothing because the chain already
computes it.

---

## 4. Position is an id — and position is not status

`position` becomes the WP `id`, not an array index. `retry_*` keys by id.

**Position is a fact, not a state machine.** Whether the chain is running, blocked, waiting on a
person, or diverged is a *separate* observation. Kubernetes shipped the other design — a linear
`phase` enum — and formally deprecated it: *"Phase was essentially a state-machine enumeration field,
that contradicted system-design principles and hampered evolution, since adding new enum values
breaks backward compatibility."* Their replacement is orthogonal **conditions**, each with a required
machine-readable `reason`, a human `message`, a `lastTransitionTime`, and the `observedGeneration` it
was computed under.

The reason it matters here is concrete: a single enum cannot say *"standing on `wp3`"* AND *"an
amendment is pending"* AND *"no agent has checked in for 20 minutes"* at once, and those are exactly
the three things a stuck operator needs simultaneously. R6 lands the minimum — `state` as
`active | complete | escalated`, separate from `position`. R8 grows it into the condition set.

Consequences, all good: splice anywhere becomes representable; `docs/faq.md:124-127` and
`docs/authoring-sprints.md:35` stop being warnings and become facts about a machine that cannot
misaim; a removed WP is a detectable error ("position `wp3` no longer exists in gen 7") instead of a
silent re-aim.

Migration: an arm whose state predates this reads its integer once and resolves it against the
`gen` it was written under, then stores the id. Old ledgers are unaffected — this changes state, not
the chain format (§5 changes the chain format; they should land together, once).

---

## 5. What a chained entry must carry

Additive fields only, per `docs/compaction.md:71-74` ("new events must be additive and verifiable by
`verify_ledger.py` exactly like any other event"). Both envelopes gain:

| Field | On | Why |
|---|---|---|
| `gen` | every entry | which version of the plan produced this verdict (§3) |
| `oracle` | `checklist-item` | `sha256(cmd)` for deterministic items; the judge criterion's hash for judge items. Closes D1. |
| `origin` | `checklist-item` | where the control came from: `sprint` \| `policy:<bundle>` \| `injected:<actor>`. Closes D3, and makes §11 auditable. |

`oracle` is a hash, not the command: a `cmd` may carry paths or secrets, and sameness is all the
audit needs. `relay verify` gains one line of output it cannot produce today — *"LGPD-1 passed, but
its oracle changed at seq 42 (a1b2… → c3d4…)"* — which is the difference between a silent flip and a
visible amendment.

**This is a breaking change to the hash chain.** Existing ledgers verify under the old body shape.
`verify_ledger.py` must accept both, keyed on the presence of `gen`, exactly as it already reads a
`mac`-less legacy entry as plain (`SPEC.md:147`).

---

## 6. The mutation surface: legal targets, never positions

### The predicate: an amendment is legal iff the ledger is still a valid trace of the amended plan

This is the **compliance criterion** from the workflow-migration literature (ADEPT, Reichert & Dadam;
van der Aalst's *dynamic change bug* — duplication, skipping, deadlock and livelock introduced by
migrating a running instance onto a changed schema). It is decidable, and on a linear chain it
collapses to something small enough to implement in an afternoon:

| Mutation | Compliant? |
|---|---|
| append after the tail | always — history untouched |
| amend a state strictly after the cursor | always — nothing in history references it |
| splice in after the cursor | always |
| amend the state under the cursor | the *change region* — postpone to the next transition |
| amend an already-passed state | **never** — the ledger holds a pass against a definition that no longer exists |

Reject with the state that broke, not a generic error. ADEPT blocks the migration rather than forcing
it; the options are to amend the plan so the history *is* producible, or leave the instance where it
is. That is the rule, and R6 already applies it to the keep-best guard: a control the chain never
accepted cannot regress.

### Granularity: a recorded verdict binds, not an open macro · CORRECTED (V11)

The table above is written for a **linear** chain, and on a two-coordinate position it gives two
opposite answers to the same question. With the cursor at `macro2.sub3`, amending `macro2.sub2` is
simultaneously *"under the cursor"* — macro2 is open, so the change region rule postpones it — and
*"already passed"* — sub2 has a recorded pass, so the never rule rejects it.

**The rule that resolves it: a recorded verdict is what binds. The enclosing macro being open is
irrelevant.** A macro is a scope, not a unit of compliance; it holds no verdict of its own, so there
is nothing about it for the ledger to be a trace of. Read every row above as "state" = *the thing
with a recorded verdict*, which is a sub-state.

The keep-best guard already implements exactly this — *"a control with no recorded pass on this chain
was never accepted, so there is nothing to regress"* — so this correction brings the doctrine into
line with the code rather than the other way round.

### The mechanism: enumerate, never name

Borrowed directly from DAP. `goto` does not take a line — it takes a `targetId` obtained from a prior
`gotoTargets` request, so the adapter owns the legal landing set and the client cannot name an
arbitrary program counter.

Applied: **the orchestrator never names an index, an id, or a position.** It asks the arm what is
legal from here and receives opaque ids bound to the current `gen`:

```
targets(arm)  ->  [ {id: "t1", verb: "append",       gen: 7},
                    {id: "t2", verb: "splice-after", after: "wp2", gen: 7},
                    {id: "t3", verb: "amend",        wp: "wp4",    gen: 7}, ... ]
mutate(arm, target_id, payload, reason?)
```

A target whose `gen` no longer matches is refused — the plan moved under the caller, which is the
same class of failure Temporal names `TMPRL1100` and which relay currently reports as a false
regression (D2).

Splice-before-cursor is simply never in the returned set. The livelock stops being a documented
hazard and becomes unrepresentable.

The same primitive serves the human console: what the operator may do is exactly the target list,
so the UI cannot offer an action the machine will refuse.

---

## 7. The verbs

| Verb | Position | Guard |
|---|---|---|
| `append` | after the end | none — MEASURED safe |
| `splice-after` | strictly after the cursor | none — MEASURED safe |
| `amend` | a WP not yet reached | recorded |
| `fork` | at or before the cursor | see below |
| `release` | force past a failed gate | human only, `reason` required · **SHIPPED (V7)** |
| `wind-down` | the chain | graceful |
| `abort` | the chain | forceful |

### Loosening is defined by effect, not by act type · CORRECTED (V11)

The guards above are written per **act**, and that is the wrong axis. Deleting a control was the
signed act; everything filed as an "addition" was free. But all of these shrink what must pass, and
every one of them was free under the act-type rule:

- rerouting so a control becomes **unreachable**
- **moving** a control behind the effective exit — the act reads as a reorder, the effect is a removal
- splitting one hard control into **two weak ones**, as "decomposition": the count goes *up* and the
  control that actually had to pass is gone
- turning a blocking judge **advisory**, or replacing a `cmd` with a `judge` under the same id:
  nothing moved, nothing was deleted, it simply stopped being able to stop anything
- adding a state that **bypasses** a control's consequence

So the rule is the set:

> **Loosening = the set of controls that must pass to reach a terminal state shrinks.**

That set is comparable mechanically, before and after, with nobody judging intent. Adding work that
does not shrink it is free; anything that shrinks it is a signed act requiring a human. Granting more
*time* does not shrink it, so it stays legitimate orchestrator authority.

```sh
relay-spec.py amend-check before.json after.json --cursor wp3
relay-spec.py amend-check before.json after.json --signed-by "GS: c2 duplicated c1, verified by hand"
```

Findings are `control-removed`, `oracle-downgraded`, `control-disarmed`, `moved-behind-cursor`. Exit
1 unless signed, and an empty signature is refused — shrinking the set is not forbidden, it is
attributable. An override that does not exist gets replaced by an operator editing the plan out of
band, which loses the record entirely.

**What it will not claim:** it cannot rank two commands by strength, so the same id under a different
command is reported as a note, not a finding. That case is an *oracle* change, and `relay verify`
reports it from the live chain as ORACLE DRIFT (V3) — where the evidence actually is. A check that
guesses gets ignored.

### fork, not in-place rewrite

Anything at or before the cursor must **not** edit the arm. It forks: a new token, replayed to the
fork point, the old arm marked `superseded`, both traces retained.

This is Temporal's `reset`, which forks the history branch, rebuilds state to the reset point,
terminates the old run and mints a **new Run ID** rather than mutating in place. It preserves
append-only, preserves the keep-best ratchet (`docs/concepts.md:68-71`), and yields two auditable
traces instead of one with rewritten history.

It also matters for a reason specific to relay: the regression guard re-executes every earlier
gate's `cmd` on every fire (`bin/relay-arm-hook.sh:114-119`). Tightening a past control in place
retroactively blocks the runner for work it was never assigned — which is D2's failure mode arriving
through a legitimate-looking operation.

Temporal refuses a reset when the target point has pending children, cancels, or signals
(`CheckResettable()`). The analogue: refuse a fork while an artifact of the current state is
half-written.

### release

The only verb that advances without a gate passing, and therefore the only one that contradicts a
stated invariant (`docs/gates.md:161-167`, "no skipping"). It exists because the alternative is an
operator poking `counter` out of band, which loses the record entirely — better to provide the door
and log who walked through it.

Requirements: human-only, `reason` mandatory (Temporal's `reset --reason` is `required: true`), and
a distinct chained event type — never a position write that looks like an advance.

DAP is worth one more note here: the spec describes `goto` in purely mechanical terms and carries no
danger language at all; VS, GDB and LLDB each independently invented their own guard (managed-code
hard block; y/n confirmation; hard refusal plus an explicit `--force` unreachable from the `jump`
alias). **No layer below will supply the warning. If relay exposes `release`, the warning is
relay's.**

### wind-down vs abort

From DAP's `terminate` / `disconnect` split: `terminate` asks the debuggee to stop and **may be
vetoed**, leaving the session alive; `disconnect` unconditionally ends it. `wind-down` marks the
chain to stop at the next gate boundary; `abort` ends the arm now.

Relay has neither. Its only stop is `echo 'exit 0' > relay-arm-hook.sh`
(`docs/configuration.md:177-187`), which disarms **every** arm in the session.

---

## 8. A stuck gate must get cheaper, not louder

Temporal's default on non-determinism is `BlockWorkflow`: the task fails and retries indefinitely,
the execution stays Running, and a corrected deployment resumes it with no manual intervention.
`FailWorkflow` exists and its own doc warns that enabling it "can cause all open workflows to fail on
a single bug or bad deployment".

The asymmetry that decides it for relay: **a Temporal retry costs a worker poll; a relay retry costs
a model turn.** Block-forever is affordable there and is not here. That is the real reason relay
releases on budget exhaustion — and it is why the answer is neither block nor release, but park (§9).

One mechanic transfers directly, one does not — and the difference is the same asymmetry:

- **Backoff does NOT transfer.** Temporal's schedule (5s initial, coefficient 2.0, ceiling 10 min,
  no backoff for the first 3 attempts) rations *polls*, which arrive on a timer. This hook fires only
  when the agent stops, so there is no timer to ration: sleeping in it buys latency and saves no
  turns. The transferable form of the bound is a **turn count**, and the D2 livelock fired at full
  speed because one re-blocking path had none — the regression-only branch deliberately does not
  charge the current gate's budget, and had no budget of its own. Correct reading of "not this gate's
  budget": its own. **[R7 — implemented: `$ARM/reg_retry`, cleared by a clean pass.]**
- **Do not inflate the record.** Only the *first* workflow-task failure is written to history;
  attempts 2..∞ are transient and append nothing, which is why a stuck execution shows one failure
  event and an attempt counter in the thousands. Relay appends a full `checklist-item` set on every
  fire; the D2 repro wrote twelve identical rounds. Record the first, then count — the `retry` field
  already exists on the gate envelope. **[R7 — implemented: a round is identified by a sha over its
  verdicts and the failing set it produced; an identical consecutive round becomes one
  `gate-fail-repeat` carrying that sha, so the collapsed verdicts stay reachable under it. Anything
  that differs is written in full, and a terminal outcome always flushes its round — collapse only
  ever hides a repetition.]**

---

## 9. `awaiting-human` is a state, not an exit

Today escalation writes `counter = nwp` and exits 0 (`bin/relay-arm-hook.sh:137-141`). In *state* it
is indistinguishable from completion — only the ledger event differs — and there is no notification
path anywhere in the repo. It was deliberately hardened to be terminal, and the test says why:
`tests/test_arm_state.py:39-41`, "an escalated arm must not reopen and self-complete **(no human in
the loop)**".

That reasoning inverts once the loop exists. `awaiting-human` is a state the human's action leaves.
The runner is released (turns are expensive); the arm is not finished.

Related, and small: the hook cannot distinguish complete from escalate — both are empty stdout
(`bin/relay-arm-hook.sh:93,141`), so `examples/fleet-chain/run_example.py:203-205` has to read
`counter` to find out which happened. `bin/relay-gate` already distinguishes them
(outcome + exit 0/2). The hook should say which.

### The fleet needs to be asked, not polled

Temporal derives a `TemporalReportedProblems` search attribute after N consecutive failures
(default 5), formatted `category=… cause=…`, and **clears it automatically** on the next success.

The analogue: a derived `problems` field per arm, computed from the chain. A fleet console then
filters to the arms asking for attention rather than rendering fifteen progress bars, which is the
difference between a dashboard and a queue.

---

## 10. The human view

**The view is the ledger rendered. If the screen shows something the chain does not say, the screen
is lying.** `bin/relay-dash.py` already lives by this — it accepts `outcome.json` as an argument and
ignores it, sourcing the terminal outcome only from the signed chain (`:59-78`) — and this design
extends the rule rather than inventing one.

**The live data already exists and is not being read.** `$ARM/ledger.jsonl` is appended on every
fire. `relay-dash` reads `$RELAY_CORPUS_DIR`, which `archive_trace` populates **only on terminal
outcomes** (`bin/relay-arm-hook.sh:93,137`), so a running arm is invisible — while
`docs/telemetry.md:7-8` advertises "progress you can watch while a fleet of armed agents runs". The
doc describes a tool that cannot do it, and the `incomplete` bucket (`docs/telemetry.md:28-31`)
cannot separate *running* from *tail-truncated*.

Pointing the existing renderer at the arms dir is the cheapest high-value change in this document.

What an operator needs, in priority order:

1. **Where am I** — position, what remains.
2. **Why am I stuck** — which control failed, retries left, how long in this state.
3. **What was actually checked** — the oracle, not the assertion. Requires §5.
4. **What may I do** — the legal target set. Requires §6.

One caution carried from `bin/relay-dash.py:26-43`: ledger bodies contain agent- and
orchestrator-authored strings and ride *inside* the signature. Integrity is not render-safety; a
crafted `\x1b[2K\r` can overwrite the console's own warnings. Any new surface sanitizes.

---

## 11. Injecting state and injecting an oracle are different privileges

A `cmd` is `eval`'d unsandboxed on the gate host. `docs/guardrails.md:44-49` is explicit: a bundle is
"equivalent to shell access on the gate host: only load bundles from a trusted source (an org
admin), never an arbitrary path supplied by the sprint author."

If an LLM orchestrator may inject controls into a live chain, an LLM has been handed `eval` on the
gate host. This is the largest security consequence of this design and it is not incidental to it.

The split:

| Capability | Who | Recorded as |
|---|---|---|
| inject **state** — instructions, ordering, titles | orchestrator (may be a model) | `origin: injected:<actor>` |
| inject an **oracle** — any `cmd` | trusted source only: policy bundle, signed spec, or human | `origin: policy:<bundle>` \| `origin: human` |

An orchestrator that needs a new check composes it from an allow-listed catalog (the `specs/` and
`policies/` mechanisms already exist and already validate shape) rather than authoring a shell
string. `bin/relay-spec.py`'s key-aware `shlex` quoting of `cmd` parameters (`:141-156`) is the
existing precedent and covers parameter values only — not author-supplied commands.

---

## 12. Non-goals

- **Not a scheduler.** Relay still ticks only at stop boundaries (`docs/architecture.md:139-146`).
  Nothing here introduces an interrupt, a timer, or mid-reasoning intervention.
- **Not a general RPC surface.** The verbs mutate desired state. There is no "advance now" that is
  not `release`, and `release` is a human act.
- **Not a rewrite of the gate.** One gate core (`lib/relay-gate.sh`), per `R4-daemon.md`.
- **Does not make the trace true.** A signed chain proves a verdict was rendered against a named
  oracle at a named generation. Whether that oracle measures what its `assert` claims stays the
  author's responsibility — §5 makes the drift visible, not impossible.

---

## 13. Decomposition

Disjoint, in dependency order. R5 and R6 are prerequisites: the rest builds comfort on top of a
record that must first be able to carry it.

**R5 — accountable chain entries.** Owns `lib/relay-gate.sh`, `benchmark/verify_ledger.py`,
`bin/relay`, `tests/test_ledger_provenance.py`, `SPEC.md` §7. Nothing else.
Frozen contract: `gen`, `oracle`, `origin` are additive fields inside the hashed body; the verifier
accepts legacy entries lacking them; `relay verify` reports an oracle change per control.
Tests: the D1 repro is a regression test — mutate a `cmd`, keep `id`/`assert`, assert `relay verify`
no longer returns exit 0 PASS.

**R6 — position by id, and keep-best by acceptance.** Owns `bin/relay-arm-hook.sh`,
`tests/test_position_by_id.py`. Nothing else.
Frozen contract: `position` holds a WP id and is a fact, never a status (`state` carries
`active|complete|escalated` separately); `retry_*` keys by id; a position absent from the current
`gen` is a named error, never a silent re-aim; the regression guard enforces only controls with a
recorded pass on this chain (the compliance criterion of §6).
Tests: the D2 repro is a regression test — splice before the cursor, assert no livelock, no false
regression accusation, and that the chain terminates.
Note: `bin/relay-gate` and `benchmark/relay_hook.sh` deliberately stay on the integer counter for
now. The benchmark hook is the measurement harness (single runner, no mutation, historical ledgers
must stay comparable), and `relay-gate` is driven by external loops that own their own state dir.
Mutation is an arm-path capability; the two drivers converge in R9 or not at all — but the divergence
is a decision, recorded here, not an oversight.

**R7 — stuck-gate economics.** Owns the retry path in `bin/relay-arm-hook.sh`, the retry tally in
`bin/relay-corpus.py`, `tests/test_backoff.py`. Nothing else.
Frozen contract: identical consecutive failures append a counter, not a duplicate round; every
re-blocking path is bounded by a turn budget it owns, and a clean pass clears it.
Correction to §8 as first written: a wall-clock backoff is NOT part of this contract. The mechanic
does not transfer — see §8. The bound is turns.
Note: `bin/relay-gate` is out of scope after all. Its regression check shares the gate's budget, so
it never had the unbounded path, and its ledger is consumed by external loops that set their own
cadence — collapsing rounds there would change CLI ledgers for no economic gain. Same divergence
recorded under R6, same reason: mutation and turn-cost are arm-path concerns.

**R8 — `awaiting-human` + `problems`. SHIPPED** (relay-v2 V7). Owns the terminal path in
`bin/relay-arm-hook.sh`, `bin/relay`, `tests/test_await_human.py`, `docs/gates.md` escalation section.
Nothing else.
Frozen contract: escalation parks the arm in a state a human action leaves; the hook distinguishes
complete from escalate in its output; `problems` is derived from the chain and self-clearing.

Two things the contract did not say, settled while building:

- **`release` needs a reason, and is consumed rather than standing.** It is the only thing that moves
  a parked arm, so it is the one that must be attributable; an empty file is refused. It also clears
  the released gate's retry counters — resuming into a spent budget is a door that opens onto a wall.
  It resumes the gate, it does not skip it; skipping is a different verb with different consequences
  (§7, `release`).
- **How complete and escalate are distinguished.** Not by a new hook output shape: by `state`, which
  R6 already made the authority and which now carries three distinct values. `counter = nwp` stays as
  the pre-R6 mirror. Inventing a non-blocking stdout shape would have meant guessing at harness
  semantics to solve a problem `state` already solves.

`escalated` is still accepted on read, for arms written before this.

**R9 — targets and verbs.** Owns a new `bin/relay-arm` (targets/mutate), `tests/test_targets.py`,
`docs/control-plane.md`. Nothing else.
Frozen contract: no caller names a position; every mutation emits a typed chain event; `release` and
`fork` require `reason`.

**R10 — the live view.** Owns `bin/relay-dash.py`, `tests/test_dash.py`, `docs/telemetry.md`.
Nothing else.
Frozen contract: reads live arms as well as the corpus; running and tail-truncated are distinct;
still read-only; still sanitizes.

---

## 14. Open

- **UNKNOWN — does a mutating orchestrator help?** Nothing here is measured against a static chain.
  The relevant prior is `WHITEPAPER.md:232`: the coupling-benefit vs rot-cost boundary is unmeasured,
  and on independent or very long work "an orchestrator with fresh isolated agents likely wins."
  This design makes mutation *accountable*; it does not show it is *useful*.
- **UNKNOWN — the cost of `release`.** An override that is easy is an override that gets used. No
  data on how often an operator would reach for it.
- **ARGUED — fork over in-place rewrite.** Reasoned from Temporal's reset semantics; not run here.
- **The conservative alternative, stated fairly.** Temporal does not permit editing a running
  execution's plan at all: the answer to "the plan changed" is to version the code and let old runs
  replay the old path. The most mature system in this problem space chose **forbid and version**
  over **permit and audit**. Relay's plan is data rather than code, so the analogy is imperfect and
  mutation is legitimate here in a way it is not there — but the contrast is the reason D1 and D2 are
  prerequisites rather than improvements.
