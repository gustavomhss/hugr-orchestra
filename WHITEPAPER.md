# Relay

**A deterministic reliability control plane for long-horizon agentic work**

*White paper — v0.1, 2026-05-30*

---

## 0. Abstract

Relay intercepts the exact moment an LLM agent declares it is "done" and, before letting it finalize, runs a deterministic acceptance gate — the current work package's Definition-of-Done, expressed as real checks (`pytest`, lint, type, `grep`, shell). If the gate passes, Relay injects the next work package from an on-disk plan into the **same continuous agent context** and the agent keeps working. If it fails, Relay re-injects the precise failure and the agent fixes it, under a bounded retry budget that escalates to a human on exhaustion. Accepted work packages are locked, and their gates are re-run on every later step so new work cannot silently break old work.

The effect is to replace the trust assumption *"the agent said done"* with the verifiable fact *"a real check passed,"* enforced from **outside** the model's control. It is, in one analogy, **git + CI for the act of doing work** — atomic verified commits, a pre-commit gate, a keep-best ratchet, and a plan under version control, moved *in-loop*.

This document is deliberately split between what is **measured**, what is **argued**, and what is **unknown**. The honest state today: the mechanism works and is demoable; the two campaigns we have measured (N=12, N=30) both show Relay as **pure overhead** versus a monolithic run (2.1× cost, 3.8× turns, identical quality), because a strong model aces both campaigns first-pass. The size at which per-step gating starts to *win* — the crossover N — is **the single number we do not yet have**, and measuring it is the top roadmap item. The durable product does not depend on that number resolving favorably: a deterministic external oracle, a verified ratchet against a real regression failure, and a tamper-evident audit trail are valuable at all N and do not erode as models improve.

---

## 1. Vision — reliability for the *act* of doing work

As autonomous agents take on multi-hundred-step work — migrations, mass codemods, framework upgrades, refactors that touch a whole codebase — one assumption silently underwrites everything: that when the agent says "done," it is done. That assumption is **unverifiable at the moment it matters** and increasingly **expensive when wrong**. The agent owns its own done-signal; its self-check is something it can skip, rationalize, or hallucinate; and its plan rots along with its context over a long run.

Relay's thesis is one sentence:

> **Replace "the agent said done" with "a real check passed," enforced from outside the model's control plane.**

The north-star analogy is exact and load-bearing:

| Human software work | Relay (agentic work) |
|---|---|
| An atomic commit | One work package (WP) |
| Pre-commit / pre-push hook | The deterministic gate (the WP's DoD) |
| CI on every push | Regression re-run of all prior gates |
| A ratchet (green stays green) | Keep-best: accepted WPs are locked |
| The plan / issue tracker | `sprint.json` under version control |
| `git log` / signed commits | The verified-trace ledger |

The one difference — and the entire point — is that Relay moves this machinery **in-loop**, so the gate fires at the moment of "done" rather than at the end of a long run. The model is the fast, capable, *unreliable-at-distance* compute; Relay is the deterministic control plane it cannot bypass.

**What Relay is explicitly not.** It is not a generic agent framework, not a planner, not a prompt-engineering layer, and — most importantly — **not a throughput amplifier**. The "make a weak model strong" framing is seductive and, as Section 4 argues, flawed. What survives is narrower and more durable: a verification + ratchet + audit control plane.

---

## 2. Problem — silent false-done and silent regression

Two failure modes motivate Relay. Both are concrete, both are expensive, and the second one we have **measured**.

**(a) Confidently-false "done."** An agent processes a long requirement list, drops or misexecutes a subset, and then declares completion with full confidence. Nothing in the agent's own loop forces the dropped requirements to surface. The cost is paid downstream — in review, in production, or in an audit — long after the cheap moment to catch it has passed.

**(b) Reflection regression.** A later "improve / refactor / clean up" pass regresses *already-correct* code into broken code. This is not hypothetical: it is a real measured failure pattern (correct → wrong under a reflection pass), and it is precisely the kind of damage a single end-of-run gate is structurally bad at preventing.

**Why post-hoc CI alone is insufficient at long horizon.** A single gate at the *end* of a 100-step run tells you something broke, but not *when*, and only after 100 steps of compounding. It cannot distinguish "WP 3 was wrong from the start" from "WP 80's refactor broke WP 3." The ratchet's contribution is **temporal localization**: it blocks the regression at the step that caused it, with the diff that caused it still in hand.

```
Monolith + final CI         Relay (per-step gate + regression set)
─────────────────────       ─────────────────────────────────────
WP1 ─ WP2 ─ ... ─ WP100      WP1 ✓ lock
                  │          WP2 ✓ lock  (re-check WP1)
                  ▼          ...
              [ ONE gate ]   WP80 ✗  ← breaks WP3's gate, caught HERE
              broke? where?         with WP80's diff still in context
              100 steps ago?
```

**Honest scoping, stated up front, not in a footnote.** This matters most for high-stakes, **test-oracle-rich**, **coupled** work inside one codebase. At low N — where a strong model would have aced the campaign anyway — Relay is overhead (Section 5). We lead with that boundary because the credibility of everything else depends on it.

---

## 3. Mechanism — intercept-done → gate → inject-next-from-disk → keep-best

### 3.1 The interception

Relay is delivered today as a single Claude Code hook (≈64 lines of bash; `benchmark/relay_hook.sh`). When the agent stops, the hook fires. Returning `{"decision":"block","reason": <text>}` **forces the agent to continue** with `<text>` injected into its context. This single primitive turns one continuous agent context into a **forward-only state machine that cannot finalize until the current WP's DoD passes**.

```
agent: "All done!"  ─►  Stop hook fires
                            │
                  read sprint.json[i] FRESH from disk
                            │
                    run WP[i].dod  (pytest/lint/grep/shell)
                    run WP[0..i-1].dod   (regression set)
                            │
            ┌───────────────┴───────────────┐
          PASS                              FAIL
            │                                │
   advance counter i→i+1            retry_i < budget?
   inject WP[i+1].instructions   ┌──────┴──────┐
   via decision:block           yes            no
            │              re-inject with     escalate
       (or EXIT if         exact failures     to human
        i+1 == N)          via decision:block (halt)
```

### 3.2 The plan lives on disk, not in the model's memory

The authoritative plan is `sprint.json`: an ordered list of work packages, each with `instructions` and a `dod` (a list of shell commands that must exit 0). The hook **re-reads it fresh on every fire**. This is the deliberate inversion that makes Relay a *control plane* rather than a prompt: the source of truth is an external, versionable artifact, not the model's drifting in-context recollection of "what we agreed to do." When the model's memory of the plan and the on-disk plan disagree, the on-disk plan wins, every time.

### 3.3 Keep-best ratchet + regression set

Once WP *i* passes, its counter advances and it is **locked**. At every later WP, the hook re-runs the gates of all prior WPs (`relay_hook.sh` line 50: `.work_packages[range(0;$i)].dod[].cmd`). A regression — new work breaking a previously-accepted gate — re-blocks the agent exactly as a fresh failure would. This is the catraca: **forward-only, green stays green.** It is the structural answer to failure mode (b) from Section 2, and — critically — it **survives model improvement**: a better model still benefits from being told "your refactor broke WP 3," because that is a *fact*, not a capability.

### 3.4 Bounded retry, then escalate

Each WP has a retry budget (default 3). On exhaustion the chain **halts at a human** (`relay_hook.sh` line 55–57). This must be stated honestly: **Relay's guarantee is a verified prefix — the campaign correct up to the first WP it cannot pass — not the whole campaign at 1.0.** For a campaign with one genuinely hard WP, a monolithic agent might deliver *broad-but-partial* output while Relay delivers *verified-but-truncated*. Which is better is a value judgment (Section 6), not a strict win.

### 3.5 Verified technical facts — and the doc/impl gap, stated plainly

Empirically verified on the running harness:

- `Stop` + `{"decision":"block"}` forces continuation with injected text.
- The hook can read the runner's transcript and last assistant message.
- A bounded retry counter on disk (`retry_i`) plus the harness's own `stop_hook_active` guard prevent infinite loops.
- Removing the hook from settings does **not** hot-reload mid-session, but the hook **script body** is re-read each fire — so the gate logic can be edited live.

**The gap we will not hide.** Our `SPEC.md`/`WHITEPAPER.md` describe a `SubagentStop` mechanism with stable per-runner `agent_id` keying for multi-runner orchestration. The **shipped** artifact does not do this: `run_arm.sh` (line 22) registers a plain `Stop` hook; the hook **drains and ignores stdin** including `agent_id` (`relay_hook.sh` line 12); and it counts via a single flat-file counter for one runner per run. The multi-runner / `agent_id` mechanism is **roadmap, not running.** Any claim in our docs that depends on it is aspirational until this gap is closed.

---

## 4. The thesis we are testing — and the one we are *not* claiming

### 4.1 The active ingredient is the gate, not the chunking

The hypothesis Relay actually rests on is narrow and testable:

> **Decomposition alone does not buy reliability. The deterministic gate + bounded retry is the active ingredient.**

The arithmetic of why chunking-alone fails: if each of 100 atomic steps is independently correct with probability 0.97, the chance *all* are correct is 0.97¹⁰⁰ ≈ **4.7%**. Decomposition without a gate simply re-partitions the same compounding error. The gate changes the term: a passing gate plus bounded retry drives *effective* per-step success toward 1 (you do not advance until the check is green), and the regression set catches cross-step breakage. **Ratchet, not chain.**

To test that the win (if any) comes from the *gate* and not the *chunking*, our benchmark includes a dedicated ablation arm:

| Arm | Plan | Gate | What it isolates |
|---|---|---|---|
| **M** | 1 WP (whole campaign) | gated once | No-gate-until-end monolith |
| **R** | multi-WP | gated per step | Relay |
| **D** | multi-WP | **un**gated | **Decomposition without the gate** |
| **M+CI** *(not yet built)* | 1 well-structured prompt | one final full-CI pass + bounded aggregate-repair loop | **The realistic baseline** |

Arm D exists specifically so that any R-over-something win can be **attributed to the gate** rather than to decomposition. Building this arm is the part of the methodology we are most confident is correct.

### 4.2 What we are retracting

We previously framed Relay around a **bounded-regime amplification** thesis: that frontier models hold ~97% instruction-following accuracy up to N≈100 atomic requirements but fall to ~62–68% at N≈500 (IFScale) and ~48% on nested/interacting structures (ComplexBench), and that Relay converts one N=500 pass at ~65% into ~100 sequential k=5 passes at ~97% each, gated. **We are demoting this argument to a footnote, for three reasons:**

1. **The anchors do not transfer.** IFScale and ComplexBench are flat lexical keyword-inclusion tasks, not coupled engineering. The mechanism that makes a model drop the 437th keyword is not obviously the mechanism that makes it drop a coupled requirement in a migration.
2. **One anchor is contradicted by our own data.** ComplexBench predicts that *intricacy* (nested, interacting instructions) is a difficulty lever. Our N=30 campaign has `dag_depth` 9 and deeply-interacting requirements (precedence traps: discount-before-rounding, sum-of-rounded-lines ≠ round-of-sum, tax-on-discounted, B2B reverse-charge exempt from the floor). A strong model (Sonnet) **aced all 30, RSR 1.0, in 6 turns, $0.29.** Our own evidence says **intricacy is not the lever; only scale is.**
3. **The boundary is receding.** The IFScale N=500 ceiling reportedly moved from ~68% to ~100% in roughly a year. The regime where a model is "unreliable enough" to need a *per-step* ratchet is shrinking as models improve. **An amplifier built on that gap dies with the next model generation.**

### 4.3 The claim that survives

What is left is **model-improvement-robust**:

> Determinism, tamper-evidence, and an **external oracle** do not erode as the model gets better. A near-perfect engineer still runs CI. A flawless agent still benefits from a signed, reproducible proof that it passed a real check — because the proof is for the *humans and auditors downstream*, not for the agent.

The amplifier may die. The control plane does not.

---

## 5. Evidence — measured, not-measured, and what would settle it

### 5.1 What we measured (and it is negative)

Two campaigns, both **saturated** (a strong model aces them, leaving no headroom for a reliability layer to recover):

| Campaign | N | type | dag_depth | Arm M (monolith) | Arm R (Relay) | Verdict |
|---|---|---|---|---|---|---|
| 01-billing-integrity | 12 | coupled-deep | 6 | RSR 1.0 | RSR 1.0 | saturated |
| 02-billing-engine-pro | 30 | coupled-deep-interacting | 9 | RSR 1.0, 6 turns, $0.29 | RSR 1.0 | saturated |

On campaign 01 the head-to-head:

| Arm | RSR | regressions | cost | turns |
|---|---|---|---|---|
| **M** — monolithic, 1-WP, gated | 1.00 | 0 | $0.25 | 6 |
| **R** — Relay, 7-WP, gated | 1.00 | 0 | $0.53 | 23 |

> **Relay = 2.1× cost, 3.8× turns, identical RSR 1.0 → pure overhead.**

We state this measured-negative result **up front, not buried.** It is exactly what the model predicts *below the crossover*: with no headroom, per-step gating buys nothing and costs turns. Our own `RESULTS.md` labels this data "NOT a result" (it validates the *pipeline*, not Relay's value); `meta.json` flags N=30 as `SATURATED`. We will not cite an RSR number as evidence of efficacy until the conditions in §5.3 are met.

### 5.2 The one number that decides it

> **Crossover N** — the smallest campaign size at which per-step gated Relay beats the realistic baseline **M+CI** (one well-structured prompt + one final full-CI pass + a bounded aggregate-repair loop, *at equal budget*) on **cost-normalized quality**, measured on a freshly-authored, contamination-immune, coupled-engineering suite.

Today: **admitted-unknown.** The only two measured points (N=12, N=30) sit *below* it, where Relay is overhead. The high-N (150–500) campaign generator that could find the crossover is **unbuilt** — and there is a real risk we struggle to build a *headroom* campaign at all, because we cannot make a strong model fail by adding interaction depth; only scale seems to work, and authoring a genuinely-coupled N=500 campaign with a clean oracle is hard.

If the crossover lands at an N that real campaigns actually hit (large migrations, mass codemods, framework upgrades) **and** survives frontier models getting more reliable, the efficacy thesis is confirmed. If it does not exist, recedes past usable N, or only beats the **no-gate strawman M** (rather than **M+CI**), then the amplifier thesis is dead and only the control-plane / compliance product survives. We will report whichever it is.

### 5.3 Integrity prerequisites before *any* efficacy number is cited

The current harness is **reward-hackable as built**, and we will not paper over it:

- **Gate == grader.** The hook runs the WP `dod` over `checks/`; the grader (`grader.py`) runs `pytest checks/`; and the brief (`run_arm.sh` line 31) *explicitly tells the agent* to self-check with `python3 -m pytest checks/ -q`. Under continuation pressure, the model is incentivized to special-case the exact asserted inputs rather than implement the requirement. **A green gate cannot yet be trusted to mean "done."**
- **Prerequisites (prescribed in `DESIGN.md`, not yet implemented):**
  1. **Held-out grader split** — the grader runs checks the agent **never sees**; the gate runs a disjoint subset. `gate ≠ grader`.
  2. **Adversarial pass (BenchJack)** — actively probe for the trivial-pass / special-case exploit and drive residual hack rate to ≈0.
  3. **Reject too-narrow assertions** — DoDs that can be satisfied by hard-coding the test inputs are not valid gates.
- **Pre-registration** — arms, budget-matching, equal oracle access, and a **blind grader** fixed in advance, so the result is falsifiable.

### 5.4 Measured vs argued vs unknown — the ledger

| Claim | Status |
|---|---|
| `Stop`+`decision:block` forces continuation; gate physically blocks "done" | **MEASURED** |
| Keep-best + regression re-run blocks a prior-gate regression | **MEASURED** (mechanism), regression *failure* it defends is a measured external finding |
| On N=12/N=30, Relay is pure overhead (2.1×/3.8×, same RSR) | **MEASURED** |
| Intricacy is not a difficulty lever for a strong model; only scale is | **MEASURED** (our N=30, ARGUED to generalize) |
| Gate (not chunking) is the active ingredient | **ARGUED** (arithmetic + D-arm designed; not yet run past saturation) |
| Bounded-regime amplification (N=500@65% → 100×k=5@97%) | **ARGUED via external benchmarks; one already contradicted by our data** |
| Crossover N vs M+CI | **UNKNOWN** — generator unbuilt, this is the decisive number |
| Multi-runner / stable `agent_id` keying | **UNKNOWN in code** — docs describe it, shipped hook ignores `agent_id` |

---

## 6. Honest boundaries (non-negotiable)

These are sections, not footnotes. Relay's credibility comes from naming exactly where it breaks.

**6.1 The gate-expressiveness wall (deepest limitation).** Deterministic gates ratchet only what reduces to `pytest`/lint/`grep`/property-tests. The DoDs that actually cause long-horizon failure — *"is this the right abstraction?", API ergonomics, security posture, "did it satisfy the intent?"* — are decided by **no shell command.** Our docs route these to an LLM-judge that our **own docs concede systematically over-rejects** — which reintroduces the exact unreliability Relay exists to kill. **Relay's value is precisely proportional to the fraction of your DoD expressible mechanically**, and near-zero in design / security / ergonomics work.

**6.2 Single-context rot at the tail.** "Every step stays at k=3–5" is true for the *count of newly-revealed requirements*, but **false for context size.** By WP 80 of 100, the continuous context is large and degraded — the very regime Relay claims to escape. The ratchet defends *prior* work via regression checks, but does nothing for omission or misexecution on the *new* WP under a rotted context. **Compaction is named in every doc and built in none**; and compaction is itself lossy.

**6.3 Coupling-benefit vs rot-cost is unmeasured.** Continuous-context Relay beats fresh-context orchestration only on **coupled** chains short enough that context has not rotted. On independent / parallelizable WPs, or very long horizons, an orchestrator with fresh isolated agents likely wins. **The boundary between "coupling benefit" and "rot cost" is itself unmeasured.** Honest carve-out: coupled, not-yet-rotted chains.

**6.4 Vendor dependency.** The whole mechanism rests on **observed (not contracted)** behavior of one vendor's harness. One settings or changelog change can silently kill it. The only mitigation is the unbuilt model-agnostic SDK/daemon.

**6.5 Escalation is a floor, not a strict win.** As in §3.4: Relay guarantees a *verified prefix*, not the whole campaign. Against a broad-but-partial monolith on a campaign with one genuinely-hard WP, "verified-but-truncated" is a value judgment, not a dominance claim.

**6.6 No data corpus exists.** The verified-trace flywheel (§7, §8) is **aspirational.** Runs are ephemeral — `run_arm.sh` line 9 does `rm -rf "$OUT"` each invocation, so **zero trace corpus accumulates on disk.** A funded lab out-collects this in months. And the benchmark methodology is a moat **only while unpublished** — this very document converts part of it into a citable gift.

---

## 7. Roadmap

Ordered by what most reduces uncertainty about whether Relay is more than a compliance artifact.

1. **Measure the crossover N (top priority).** Build the N=150–500 **contamination-immune** campaign generator, then measure per-step Relay vs **M+CI** on cost-normalized quality. This is the one number that decides the efficacy half of the thesis. Until it exists, every efficacy claim stays *argued*.
2. **Close the integrity gaps before any public number.** Split **gate ≠ grader** (held-out checks), run the **BenchJack adversarial pass** to ≈0 residual hack rate, and reject too-narrow assertions. A green gate must *earn* the meaning "done."
3. **Close the doc/impl gap.** Either implement the `SubagentStop` + stable-`agent_id` multi-runner mechanism the docs describe, or rewrite the docs to match the shipped plain-`Stop` single-runner hook. No aspirational mechanism stated as fact.
4. **Crush authoring cost.** Auto-decomposition + auto-drafted gates from the existing test suite, to drive the upfront tax of writing `sprint.json` toward zero. Authoring cost is the real adoption blocker, and it is what makes Relay *negative-value* at low N.
5. **Abstract to a model-agnostic SDK/daemon.** The intercept-done → gate → inject-next pattern is agent-agnostic. Implementing it over any agent loop removes single-vendor risk and is the path to an independent, vendor-neutral oracle — the one wedge a model lab is structurally disinclined to ship.
6. **Persist the trace ledger.** Stop `rm -rf`-ing runs; write a tamper-evident, timestamped pass/fail + diff + retry-distribution record per WP. This is simultaneously the compliance artifact and the substrate for any future process-supervision reward signal.

**Decision rule, stated in advance.** If per-step gating *cannot* beat M+CI cost-normalized at a usable N — once gate ≠ grader and the adversarial pass are run — we will **deprecate the per-step ratchet** and ship only the durable core: **authoritative on-disk plan + deterministic gate + verified ledger.** That core stands on its own; the per-step amplifier must earn its keep.

---

## 8. What is durable regardless

Strip away the amplifier thesis entirely and three things remain, none of which depend on the crossover N resolving favorably and none of which erode as models improve:

1. **A deterministic external oracle.** "A real check passed" replaces "the agent said done." This is valuable the first time an agent ever lies about completion — which is to say, immediately, and at all N.
2. **A forward-only keep-best ratchet** with regression re-checks, blocking the measured correct→wrong reflection-regression failure at the moment it occurs.
3. **A tamper-evident, timestamped verified-trace ledger** — a per-milestone compliance and audit artifact. For regulated build owners who legally cannot ship "the model said done," the trace can be worth as much as the work.

The honest positioning, then, is **reliability insurance and a compliance artifact — *proof, not speed*** — strong specifically on coupled, dependency-deep, test-oracle-rich, high-stakes campaigns inside one codebase. The mechanism is 64 lines of bash over a public feature; there is no moat in the mechanism, and we say so. The defensible assets — a private measured crossover-N eval and a verified-trace flywheel at volume — are both **currently unbuilt.** Everything else is a head start: research taste, opinionated packaging, and a brand.

We would rather ship that narrow, true claim than a wide, unproven one. The wide claim — that Relay makes a bounded model strong at distance — may be true; we have not earned the right to make it. The narrow claim — that an agent operating under Relay **cannot finalize until a real check passes, and leaves a signed proof that it did** — is true today, demoable in ninety seconds, and the thing we are willing to put our name on.

---

*Status of this document: v0.1. It supersedes the amplification framing in prior `WHITEPAPER.md`/`SPEC.md`. Where those docs describe the `SubagentStop`/multi-runner mechanism or cite RSR numbers as efficacy evidence, this document's §3.5, §5, and §7 take precedence until the named gaps are closed in code and the crossover N is measured.*