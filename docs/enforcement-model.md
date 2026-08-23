# The design

One AI agent works. A protocol authored before it ran holds it to a sequence of small states, and
every advance is earned by a check the agent cannot reach. What the run leaves behind is a record
precise enough to debug from.

Marked throughout: **[PAPER]** = designed, not built · **[CODE]** = shipped in relay today ·
**[MEASURED]** = observed in a real run this session.

---

## 1. Why states at all

Not for security first. **For localization.** Without state separation a failure gives you "the
output is wrong" and a 200-turn transcript. With it you get `macro2.sub3, control C7`.

This is also the honest reason the record must be accurate. A fabricated pass does not merely hide a
defect — it points your debugging at the wrong state. You investigate sub5 while the defect entered
at sub3 and was stamped good. Record integrity is not paranoia about a malicious model; it is what
keeps the trace worth reading. It matters even if the agent never had bad intent.

The whole value proposition follows: you are not trusting the agent more. You are removing the need
to be present.

---

## 2. Structure — recursive, not respawning

```
hook chain   = [macro1, macro2, macro3, ...]    unbounded
  macro      = [sub1, sub2, sub3, ...]          a bounded scope, not a loop
    sub      = one gate, resolved in ONE fire
```

ONE agent for the whole chain. Continuous context, no reset at macro boundaries: a reset serializes
a handoff, discards live working memory between coupled states, and throws away the prefix cache.
Hierarchy lives in the chain, not in agent lifecycle.

**A macro is a scope, not a loop.** Each fire resolves exactly one sub-state. The macro says which
set of subs is active; it does not run them internally. (An earlier draft said "a loop inside the
macro's hook" — that cannot coexist with per-sub retry, since retrying requires the agent to have
stopped and been re-invoked.)

**One dispatcher hook, macros as data.** Not one script per macro. N scripts all reading a shared
position file breaks the single-writer invariant the rest of the design depends on, and — worse —
when the position matches no registered script, *every* script exits 0 and the chain is abandoned
with nothing recorded. A single dispatcher keeps one writer and keeps the `position-lost` path that
already exists **[CODE]**.

**[MEASURED]** The harness caps consecutive hook blocks. Three runs of a real `claude -p` session
with an always-blocking Stop hook: 10 fires with a varying reason, 9 with an identical one, and
**20 with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0`** (the run's own release limit, never the harness's).
Since advancement is itself a block, the default cap would limit a chain to ~8 states total. The cap
must be disabled — and disabling it removes the harness's only runaway protection, so **every loop
below is bounded by this design or it is a bug**.

---

## 3. The gate — one hook, one fire, two branches

The agent never runs the test and does not know one exists. It works and stops. **Stopping is the
trigger.** On each fire the dispatcher:

1. reads the position — two coordinates, `macro.sub`, both ids, never array indices **[CODE for one
   coordinate, PAPER for two]**
2. runs that sub-state's checklist itself
3. **FAIL** → `{"decision":"block", reason: <the failing control ids>}` — position does not move
4. **PASS** → record each verdict on the ledger, move the position, block with the next sub-state's
   instructions

Advancement is also a block: same channel, different `reason`, position moved. There is no separate
"advance hook".

---

## 4. What may open the gate

- A pass **recorded on the ledger** unlocks the next state. Append-only, hash-chained, single writer,
  and the agent never writes to it.
- The agent's claims may **never** advance the chain. They may only shorten the path to a human.
- There is no code, token, or phrase that ends a state. Any credential the agent can produce, it can
  produce without doing the work.

**Single writer is load-bearing.** `relay_chain_append` computes `prev`/`seq` by reading the file's
tail with no locking, and the code says why that is safe: exactly one sequential writer **[CODE]**.
Anything else that needs to append (§6) routes its writes through the dispatcher, or takes a
`mkdir`-based lock. The verifier does catch a collision — it checks `seq` against file position —
but only when a human runs it, never in the live path.

---

## 5. Controls

A deterministic control (`cmd`, exit 0 = pass) is the real oracle. A discursive control may be added,
**never alone**:

```
1. cmd:   pytest -q                                        proves it works
2. judge: "does what the agent described match the diff?"  proves it knows what it did
```

**The discursive one is graded by cross-checking its claims against the artifact**, not by judging
the writing. **[MEASURED]** 8 judge runs over 5 condition types, all verdicts correct: honest
description PASS; fabricated claim FAIL; vague/unfalsifiable FAIL ("pure unverifiable assertion");
material omission FAIL — including under a criterion so weak it never said "omit"; prompt-injected
scope narrowing FAIL, with no anti-injection instruction given to the judge, and the injection was
hiding a real fabrication.

The inputs are kept under [`fixtures/enforcement-model/`](fixtures/enforcement-model/README.md) so
the measurement can be re-run instead of believed.

Two things this depends on, both of which an earlier draft left open:

- **The diff is computed by the checker, never supplied.** Today the judge only receives static file
  paths listed in the checklist item's `context` **[CODE]** — nothing computes a diff at all. Against
  what base ref, by whom, at what moment, must be specified or the control is undefined.
- **Artifact selection is an oracle decision, not a state decision.** `context` lives in the plan,
  which the orchestrator writes freely. Narrowing it to omit the file where the problem lives makes
  the judge dutifully cross-check an incomplete artifact and pass — the same scope-narrowing attack
  the control is tested against, moved from the agent's prose into the orchestrator's field.

**Atomicity does not make controls optional.** Small states kill *drift* — the model losing the
thread and overstating what it did across a long horizon. They do not kill *shortcuts*: the cheats
measured in the wild (hardcode a return value for the exact test input; write a verifier that prints
PASS) are one-liners that fit in any state, and the measured driver is difficulty and pressure, not
ambiguity. What atomicity buys is that a shortcut cannot *survive*: in a small unit with a control
that measures the outcome, there is nowhere for it to hide. It gives a good control its stage. It
does not replace one.

**Self-check is a forcing function, not a gate.** Injected **with the next state's instructions**,
not only after a failure — an agent that knows in advance what it will be asked works toward it;
asked only after failing, it is a remedy. It must probe the *protocol's steps* while the
deterministic control measures the *outcome*: if both ask the same question, the self-check is
decoration. Unaided self-correction is known to plateau or hurt; anchored to an external check, it
works. That anchor is §3.

---

## 6. Stuck is a state, not a failure

**a. No-progress detection.** A round is identified by a sha over its verdicts and the failing set
**[CODE, R7]**. An identical round repeating means stuck, not slow — escalate immediately rather than
burning the whole budget.

**b. The agent says so.** A structured marker in its final message, honored only when the checklist
also failed. Parking is not passing: position does not move, the work is still undone. Two
corrections over the first draft:

- The reason is **cross-checked against the artifact**, exactly like a discursive control. "Checklist
  also failed" alone is content-blind, and the agent usually controls whether the checklist fails —
  it can under-deliver deliberately and attach a plausible blocker.
- The marker **never stops being heard**. A hard budget closes the honest channel at the exact moment
  pressure peaks, which is the regime that produces covert shortcuts. Recurrence *accelerates* the
  path to a human instead.

**c. The agent waits instead of stopping.** An `ask_orchestrator(question)` tool blocks inside a tool
call. A block costs a model turn; a wait costs only wall clock, so waiting is strictly cheaper.

```
poke 1,2,3    same ticket id every time — a new id would provision N times
round 4       park as awaiting-human, position preserved
answer "no"   park immediately, do not wait out the rounds
```

**This channel is where the first draft broke its own invariant.** The whole design rests on "stopping
is the trigger", and a tool call that never stops leaves the enforcement layer blind for its entire
duration: no-progress detection sees nothing, no round is produced, nothing is metered. Three fixes:

- The tool is server-side, on the far side of the boundary, so **the meter goes in the tool**, not in
  the hook.
- It **refuses unless the current sub-state's checklist is failing** — the server runs the checklist
  itself. It is a conditioned channel, not a rest button.
- The cap on total invocations is **passive with a deadline**: on breach it notifies the orchestrator
  and keeps serving. Orchestrator says continue → continue. Says stop, or says nothing within the
  window → park. Passive without a deadline is decorative; a dead orchestrator would mean no cap at
  all. The notification carries **facts, not the agent's prose** ("8 waits, 0 answered, 40 min,
  checklist still failing on C3") — the agent's text reaching the orchestrator is a social-engineering
  channel.

The breach is a **condition** on the arm: it appears when true and clears itself when resolved. Same
shape as the derived `problems` field **[PAPER, R8]**.

---

## 7. The orchestrator

May amend the plan of a running chain. May **never** change a verdict.

**Loosening is defined by effect, not by act type:**

> Loosening = the set of controls that must pass to reach a terminal state shrinks.

Deleting a control is only the trivial case. Rerouting so a control becomes unreachable, reordering
it past the effective exit, splitting one hard control into two weak ones as "decomposition", or
adding a state that bypasses a control's consequence — all reduce that set, all are caught by the
same rule, and all were classified as free "additions" under the act-type wording. The set is
comparable mechanically, before and after.

- adding work that does not shrink the set: free
- anything that shrinks it: a signed act, requires a human

Granting more *time* (§6c) does not shrink the set, so it is legitimate orchestrator authority.

**Compliance granularity is whatever has a recorded verdict.** On a nested position the linear
criterion is ambiguous: with the cursor at `macro2.sub3`, amending `macro2.sub2` is simultaneously
"under the cursor" (macro2 is open) and "already passed" (sub2 has a recorded pass), and the two
rules give opposite answers **[PAPER, control-plane.md §6 needs this]**. The rule that resolves it:
a recorded verdict is what binds. The enclosing macro being open is irrelevant.

---

## 8. Every loop is bounded

With the harness cap disabled, this list is the runaway protection.

| loop | bound | status |
|---|---|---|
| gate retries | `retry_budget`, then escalate | **[CODE]** |
| regression path | its own `reg_retry`, cleared by a clean pass | **[CODE, R7]** |
| identical rounds | no-progress detection escalates early | **[CODE]** counted, **[PAPER]** escalation |
| blocked-claims | never silenced; recurrence accelerates to human | **[PAPER]** |
| one `ask_orchestrator` question | 4 rounds | **[PAPER]** |
| total `ask_orchestrator` calls | passive cap + deadline | **[PAPER]** |
| chain length via amendment | deliberately unbounded — appending cannot dodge a stuck gate, since the cursor still must pass it | by design |

---

## 9. What is not built

The engine and the agent run as the **same OS user with no privilege boundary**. Five attacks were
reproduced against the shipped code **[MEASURED]**: overwrite the hook script (documented as a
feature); write `complete` to the arm's state file; redirect the workdir to a decoy; delete the
sprint; and swap an already-passed control's command with **no ledger trace at all** — after which
`relay verify` reported `INTACT / PASS — auditable` with the artifact absent.

Four of those five are still open, and each of them leaves a **loud** trace: a hook that no longer
matches the repo, a state file with no chain behind it, a workdir that is not the one the run
declared, a missing sprint. The fifth was the only **silent** one, and it is now closed
**[MEASURED]** — `relay verify` recomputes every control's oracle from the sprint on disk and
compares it to what the ledger recorded (`oracle_recheck`, `tests/test_sprint_diverged.py`):

```
  SPRINT DIVERGED — the spec on disk no longer asks what the ledger answered:
    F-REAL     oracle a99a633e8103 -> b5bea41b6c62 (changed after grading)
  The chain is intact and nothing on it was touched. The QUESTION was rewritten after it was answered.
```

Be exact about what that buys. It is a **comparison, not a boundary**: an attacker who can rewrite
the sprint can rewrite the ledger too, and then integrity catches it — the two together mean there
is no longer an edit that produces a clean `PASS`. It does nothing about the other four, and it
would not survive an attacker who is willing to be seen. What it removes is the case where the
record and the spec disagree and **nothing says so**.

The repo already wrote the verdict: *"A control plane whose participants can write each other's
state has no invariants at all."*

So the ordering is not "security first". It is:

1. **Controls that measure outcomes, not proxies.** Free, it is checklist design, and it addresses
   the common failure — an agent that stops believing it is done.
2. **Comparisons that make a forgery loud.** Cheap — chain integrity and the oracle re-check above
   are both a few dozen lines. They do not prevent an edit; they cost the attacker silence.
3. **The boundary** — the checker running where the agent cannot write. Expensive, it is
   infrastructure, and it addresses the rare failure. Its justification does not depend on frequency:
   a fabricated pass is indistinguishable from a real one, so rare-and-invisible costs you more than
   common-and-loud. Build it when not knowing costs more than the infrastructure does.
