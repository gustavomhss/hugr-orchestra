# Relay

**A deterministic reliability control plane for long-horizon agentic work**

*White paper — v0.1, 2026-05-30*

---

## 0. Abstract

Relay intercepts the exact moment an LLM agent declares it is "done" and, before letting it finalize, runs a deterministic acceptance gate — the current work package's Definition-of-Done, expressed as real checks (`pytest`, lint, type, `grep`, shell). If the gate passes, Relay injects the next work package from an on-disk plan into the **same continuous agent context** and the agent keeps working. If it fails, Relay re-injects the precise failure and the agent fixes it, under a bounded retry budget that escalates to a human on exhaustion. Accepted work packages are locked, and their gates are re-run on every later step so new work cannot silently break old work.

The effect is to replace the trust assumption *"the agent said done"* with the verifiable fact *"a real check passed,"* enforced from **outside** the model's control. It is, in one analogy, **git + CI for the act of doing work** — atomic verified commits, a pre-commit gate, a keep-best ratchet, and a plan under version control, moved *in-loop*.

This document is deliberately split between what is **measured**, what is **argued**, and what is **unknown**. The honest state today: the mechanism works and is demoable; every campaign we have measured shows Relay as **pure overhead** versus a monolithic run (2.1× cost, 3.8× turns, identical quality), because a strong model aces them first-pass. The size at which per-step gating starts to *win* — the crossover N — was the one number the prior draft did not have. **We now have it: we built the high-N generator and measured the monolith out to N=500 on two independent substrates; it never breaks, so no crossover exists up to N=500 (`benchmark/RESULTS.md`).** The amplifier thesis is therefore **falsified, not pending.** The durable product never depended on that number resolving favorably, and it is what now stands: a deterministic external oracle, a verified ratchet against a real regression failure, and a tamper-evident audit trail are valuable at all N and do not erode as models improve.

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

Relay's core primitive is a small amount of bash over a Claude Code hook. When the agent stops, the hook fires; returning `{"decision":"block","reason": <text>}` **forces the agent to continue** with `<text>` injected into its context. This single primitive turns one continuous agent context into a **forward-only state machine that cannot finalize until the current WP's DoD passes**. Two hooks ship over one shared gate core (`lib/relay-gate.sh`): the plain-`Stop` single-runner measurement harness (`benchmark/relay_hook.sh`) and the production `SubagentStop` multi-runner gate (`bin/relay-arm-hook.sh`, §3.5). A vendor-neutral CLI (`bin/relay-gate`) exposes the same gate core to any non-Claude loop (§6.4). The detailed walk-through below describes the single-runner gate; the multi-runner generalization is §3.5.

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

**The gap we closed — and the discrimination problem we hit on the way.** The prior draft conceded that the `SubagentStop` multi-runner mechanism was "roadmap, not running": the only shipped hook was a plain `Stop` single-runner. That gap is now closed in code. `bin/relay-arm-hook.sh` **is** a shipped `SubagentStop` multi-runner gate: each subagent stop fires it, it runs the current gate in *that* subagent's own chain, and a stop with no relay arm is left untouched (exit 0). One honest correction to the original design, learned by building it: **multi-runner keying is not by `agent_id`.** Subagents spawned via the Task tool share the parent session's cwd and expose no discriminating `agent_id`, so neither cwd nor `agent_id` can tell two arms apart. The shipped hook instead binds an arm to its subagent by a `RELAY-ARM:<token>` marker the orchestrator embeds in that subagent's prompt — recovered from the unique `transcript_path` in the `SubagentStop` payload (`bin/relay-arm-hook.sh` lines 32–47). The old plain-`Stop` single-runner (`benchmark/relay_hook.sh`) still ships too — it is the measurement harness — and both hooks now share one gate core (`lib/relay-gate.sh`), so the mechanism the docs describe and the mechanism that runs can no longer drift. **Residual:** the token-marker contract presumes a cooperative orchestrator that embeds the marker; a hostile or buggy parent that omits it leaves the subagent ungated (the hook fails open by design, exit 0).

---

## 4. The thesis we tested — and the one we are *not* claiming

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
| **M+CI** *(built; this is the high-N Arm M)* | 1 well-structured prompt | one final full-CI pass + bounded aggregate-repair loop | **The realistic baseline** |

Arm D exists specifically so that any R-over-something win can be **attributed to the gate** rather than to decomposition. Building this arm is the part of the methodology we are most confident is correct.

### 4.2 What we are retracting

We previously framed Relay around a **bounded-regime amplification** thesis: that frontier models hold ~97% instruction-following accuracy up to N≈100 atomic requirements but fall to ~62–68% at N≈500 (IFScale) and ~48% on nested/interacting structures (ComplexBench), and that Relay converts one N=500 pass at ~65% into ~100 sequential k=5 passes at ~97% each, gated. **We retract this argument — and unlike the prior draft, we now retract it on our own direct evidence (§5), not only on the three a-priori reasons below:**

1. **The anchors do not transfer.** IFScale and ComplexBench are flat lexical keyword-inclusion tasks, not coupled engineering. The mechanism that makes a model drop the 437th keyword is not obviously the mechanism that makes it drop a coupled requirement in a migration.
2. **Both candidate levers are contradicted by our own data.** ComplexBench predicts *intricacy* (nested, interacting instructions) is a difficulty lever; our N=30 campaign has `dag_depth` 9 and deeply-interacting precedence traps (discount-before-rounding, sum-of-rounded-lines ≠ round-of-sum, tax-on-discounted, B2B reverse-charge exempt from the floor), and a strong model **aced all 30, RSR 1.0, in 6 turns, $0.29.** That left *scale* as the only remaining candidate — and §5 measured it directly: the monolith aces **N=500** coupled requirements first-pass, held-out-confirmed. So our own evidence now says **neither intricacy nor scale (to N=500) is a lever** for a strong model.
3. **The boundary is receding.** The IFScale N=500 ceiling reportedly moved from ~68% to ~100% in roughly a year. The regime where a model is "unreliable enough" to need a *per-step* ratchet is shrinking as models improve. **An amplifier built on that gap dies with the next model generation** — and on our substrates it is already dead at the current one.

### 4.3 The claim that survives

What is left is **model-improvement-robust**:

> Determinism, tamper-evidence, and an **external oracle** do not erode as the model gets better. A near-perfect engineer still runs CI. A flawless agent still benefits from a signed, reproducible proof that it passed a real check — because the proof is for the *humans and auditors downstream*, not for the agent.

The amplifier died (§5). The control plane did not.

---

## 5. Evidence — measured, not-measured, and what would settle it

### 5.1 What we measured (and it is negative)

Two hand-authored campaigns, both **saturated** (a strong model aces them, leaving no headroom for a reliability layer to recover):

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

We state this measured-negative result **up front, not buried.** It is exactly what the model predicts *below the crossover*: with no headroom, per-step gating buys nothing and costs turns. Our own `RESULTS.md` labels this hand-authored data "NOT a result" (it validates the *pipeline*, not Relay's value); `meta.json` flags N=30 as `SATURATED`.

**And then we went looking for the headroom — at scale, under a trustworthy grader — and did not find it.** With the integrity prerequisites of §5.3 now built (held-out grader, anti-hack-verified), we ran a parametric, contamination-immune high-N sweep (`benchmark/RESULTS.md`):

| substrate | N | arm | held-out RSR | guards | turns | cost $ |
|---|---|---|---|---|---|---|
| v1 templated-coupled | 150 | M (monolith) | **1.00 (150/150)** | gate≠grader | 6 | 0.66 |
| v1 templated-coupled | 300 | M (monolith) | **1.00 (300/300)** | gate≠grader | 7 | 0.81 |
| v2 bespoke-graph (non-compressible) | 300 | M (monolith) | **1.00 (300/300)** | gate≠grader, cheat≈0.03 | 8 | 1.16 |
| v2 bespoke-graph (non-compressible) | 500 | M (monolith) | **1.00 (500/500)** | gate≠grader + ran-for-real + no-ref-leak | 7 | 1.84 |

The monolith aces 500 distinct, coupled, non-local-rule-bearing functions first-pass in 7 turns for ~$1.84, with an *independent held-out* grader confirming it generalizes. Across two independent substrates there is no crossover up to N=500. **The amplifier thesis is falsified on this evidence, not merely unsupported.** We will not cite an RSR number as evidence of Relay *efficacy* — because there is none to cite: the efficacy thesis is the one that died here.

### 5.2 The one number that decides it — now resolved

> **Crossover N** — the smallest campaign size at which per-step gated Relay beats the realistic baseline **M+CI** (one well-structured prompt + one final full-CI pass + a bounded aggregate-repair loop, *at equal budget*) on **cost-normalized quality**, measured on a freshly-authored, contamination-immune, coupled-engineering suite.

The prior draft listed this as **admitted-unknown** and the generator that would find it as **unbuilt**. Both are now resolved. The high-N generator is built — `benchmark/generator/gen_campaign_v2.py` emits bespoke coupled campaigns at any N (no cap), and `benchmark/run_crossover.py` orchestrates and integrity-guards the run. Using them, M is M+CI by construction (one prompt over the full spec plus a bounded full-suite repair loop), and we measured it out to N=500. **The crossover does not exist up to N=500.** §5.1's table is the evidence; `benchmark/RESULTS.md` states it flatly: "the amplifier thesis is now falsified on two independent substrates."

This is the kill condition the prior draft pre-registered (its §5.4 / §7 decision rule), and it fired. **The amplifier thesis is dead; only the control-plane / compliance product survives — and that product is now what the rest of this document is about.** The one lever left genuinely open is *sheer mechanical capacity* — N ≫ 500, where M may simply not fit the spec in one context window. A win there would be "M ran out of room," not "the model reasoned better with a ratchet"; it is a cost/throughput regime, not the reasoning-amplification claim we retracted, and we do not count it as resurrecting the amplifier.

### 5.3 Integrity prerequisites — the ones that were built, and the one that remains

The prior draft flagged the harness as **reward-hackable as built** and listed three integrity prerequisites as "prescribed in `DESIGN.md`, not yet implemented." The first and most important is now implemented; we say so, and we keep honest about what is still residual.

- **Gate ≠ grader — built.** `benchmark/run_arm.sh` strips `holdout/` from the run dir (line 17) before the runner ever starts, so the runner's feedback gate (the visible `checks/`) and the grade (the disjoint, never-seen `holdout/` suite scored by `grader.py`) are physically separate. This is what makes the §5.1 N≥150 numbers trustworthy where the campaign-01 pipeline numbers were not.
- **Anti-hack verified — built.** The held-out suite is reward-hacker-resistant by construction: a candidate that aces the visible gate by special-casing the asserted inputs scores only **≈0.03** held out (`benchmark/RESULTS.md`). The grader-discriminates guard (a pristine skeleton must *fail* the held-out suite) confirms the oracle still tests the candidate. `run_crossover.py` additionally refuses to report an RSR unless the run proves it executed for real and did not leak the `/tmp` reference into the run dir — the two guards that caught an earlier false `RSR 1.0`.
- **Residual: a standing, continuous adversarial gate.** What we ran is a *snapshot* anti-hack check (cheat-rate ≈0.03 on the current substrate), not a continuously-maintained adversarial probe (the "BenchJack" loop) that re-attacks every new gate as the suite evolves. New campaigns must each be checked; nothing yet does this automatically. **A green gate now means "done" on the measured substrates — but each new substrate still owes its own anti-hack proof.**
- **Pre-registration** — arms, budget-matching, equal oracle access, and a blind grader were fixed in advance, so the negative result above is falsifiable rather than fitted.

### 5.4 Measured vs argued vs unknown — the ledger

| Claim | Status |
|---|---|
| `Stop`+`decision:block` forces continuation; gate physically blocks "done" | **MEASURED** |
| Keep-best + regression re-run blocks a prior-gate regression | **MEASURED** (mechanism), regression *failure* it defends is a measured external finding |
| On N=12/N=30, Relay is pure overhead (2.1×/3.8×, same RSR) | **MEASURED** |
| Intricacy is not a difficulty lever for a strong model; only scale is | **MEASURED** (our N=30 hand-authored + held-out N≤500, ARGUED to generalize) |
| Monolith does not break up to N=500 (held-out, two substrates) → no crossover ≤500 | **MEASURED** — generator built, run integrity-guarded |
| Gate (not chunking) is the active ingredient | **ARGUED** (arithmetic + D-arm designed; moot at low N since both saturate) |
| Bounded-regime amplification (N=500@65% → 100×k=5@97%) | **FALSIFIED on our substrates** — the monolith does not drop at N=500; thesis retracted |
| Crossover N vs M+CI | **MEASURED: none up to N=500.** Open only at N≫500 (mechanical-capacity, not amplification) |
| Multi-runner `SubagentStop` gate | **BUILT in code** (`bin/relay-arm-hook.sh`) — keyed by `RELAY-ARM:<token>` marker, not `agent_id` (Task subagents share cwd / expose none) |

---

## 6. Honest boundaries (non-negotiable)

These are sections, not footnotes. Relay's credibility comes from naming exactly where it breaks.

**6.1 The gate-expressiveness wall (deepest limitation).** Deterministic gates ratchet only what reduces to `pytest`/lint/`grep`/property-tests. The DoDs that actually cause long-horizon failure — *"is this the right abstraction?", API ergonomics, security posture, "did it satisfy the intent?"* — are decided by **no shell command.** Our docs route these to an LLM-judge that our **own docs concede systematically over-rejects** — which reintroduces the exact unreliability Relay exists to kill. **Relay's value is precisely proportional to the fraction of your DoD expressible mechanically**, and near-zero in design / security / ergonomics work.

**6.2 Single-context rot at the tail.** "Every step stays at k=3–5" is true for the *count of newly-revealed requirements*, but **false for context size.** By WP 80 of 100, the continuous context is large and degraded — the very regime Relay claims to escape. The ratchet defends *prior* work via regression checks, but does nothing for omission or misexecution on the *new* WP under a rotted context. The prior draft said compaction was "named in every doc and built in none"; that is no longer true. A lightweight in-hook compaction now ships (`docs/compaction.md`, `bin/relay-arm-hook.sh`): repeat-reblocks of the same gate drop the verbatim instructions and re-inject only the still-failing ids, and at a configurable depth (`RELAY_COMPACT_AFTER`, default 6) the advance nudges the agent to checkpoint and summarize. **But this only controls the *reason string* Relay injects — it nudges the agent to self-summarize, it does not control the model's context window directly.** Deeper tail-rot — omission under a degraded window the agent does not voluntarily prune — remains a real, unsolved limit, and even agent-side compaction is lossy.

**6.3 Coupling-benefit vs rot-cost is unmeasured.** Continuous-context Relay beats fresh-context orchestration only on **coupled** chains short enough that context has not rotted. On independent / parallelizable WPs, or very long horizons, an orchestrator with fresh isolated agents likely wins. **The boundary between "coupling benefit" and "rot cost" is itself unmeasured.** Honest carve-out: coupled, not-yet-rotted chains.

**6.4 Vendor dependency.** Where you drive Relay through the **Claude hooks**, the mechanism still rests on **observed (not contracted)** behavior of one vendor's harness, and one settings or changelog change can silently kill that path. The prior draft said "the only mitigation is the unbuilt model-agnostic SDK/daemon"; the first half of that mitigation now ships. `bin/relay-gate` is a vendor-neutral CLI (`docs/sdk.md`): it evaluates one gate step as pure JSON in / JSON-plus-exit-code out, with zero knowledge of Claude Code, so any loop — LangGraph, AutoGen, a CI pipeline, a shell script — can drive the same gate core. **Lock-in survives only on the paths that use the Claude hooks.** What is still unbuilt is the *packaged* SDK and a long-running daemon; the CLI is the integration primitive, not yet a productized, distributed surface.

**6.5 Escalation is a floor, not a strict win.** As in §3.4: Relay guarantees a *verified prefix*, not the whole campaign. Against a broad-but-partial monolith on a campaign with one genuinely-hard WP, "verified-but-truncated" is a value judgment, not a dominance claim.

**6.6 The corpus now accumulates — but it is small.** The prior draft called the verified-trace flywheel "aspirational" and said runs were ephemeral because `run_arm.sh` did `rm -rf "$OUT"`, so "zero trace corpus accumulates on disk." That is now corrected in code. The `rm -rf` still clears the per-run *working* dir — but only *after* the ledger is copied out: `benchmark/run_arm.sh` archives each run's verified-trace ledger (plus its grade and run record) to `benchmark/.relay-ledger/` (20 archived artifacts already on disk), and the production hook's `archive_trace()` copies every terminal trace to `$RELAY_CORPUS_DIR` (`bin/relay-arm-hook.sh`), from which `bin/relay-corpus.py` extracts the per-step reward signal (each trace re-verified, tampered traces excluded). **The asset is no longer thrown away — only the scratch dir is.** The honest residual is *volume*: this is tens of traces from our own runs, not the millions a funded lab collects in months. The data product is *built*; it is not yet *at scale*. And the benchmark methodology is a moat **only while unpublished** — this very document converts part of it into a citable gift.

---

## 7. Roadmap

Most of the prior draft's roadmap was about *removing uncertainty over whether Relay is more than a compliance artifact*. That uncertainty is now resolved — against the amplifier — so this section is split into **done** (the items that closed the question) and **remaining** (the residuals that genuinely persist).

**Done — the items that resolved the thesis:**

1. ~~Measure the crossover N.~~ **Built and run.** The contamination-immune high-N generator (`benchmark/generator/gen_campaign_v2.py`, `benchmark/run_crossover.py`) exists; M+CI was measured to N=500 on two substrates; **no crossover** (§5.1–§5.2). This decided the efficacy half — negatively.
2. ~~Close the integrity gaps.~~ **Gate ≠ grader shipped** (`run_arm.sh` strips `holdout/`); the held-out suite is anti-hack-verified (reward-hacker ≈0.03). *Residual:* a *standing, continuous* adversarial probe per new substrate (§5.3) is not yet automated.
3. ~~Close the doc/impl gap.~~ **Closed.** The `SubagentStop` multi-runner gate ships (`bin/relay-arm-hook.sh`), keyed by a `RELAY-ARM:<token>` marker rather than `agent_id` (which Task subagents do not expose); both hooks now share one gate core (`lib/relay-gate.sh`), so doc and code can no longer drift (§3.5).
6. ~~Persist the trace ledger.~~ **Shipped.** Terminal traces are retained (`benchmark/.relay-ledger/`, `$RELAY_CORPUS_DIR`), re-verified, and exported as a reward signal by `bin/relay-corpus.py` (§6.6). *Residual:* volume — this is our own tens of traces, not a flywheel at scale.

**Remaining:**

4. **Crush authoring cost.** Auto-decomposition + auto-drafted gates from the existing test suite, to drive the upfront tax of writing `sprint.json` toward zero. Authoring cost is the real adoption blocker, and it is what makes Relay *negative-value* at low N.
5. **Productize the model-agnostic surface into an SDK/daemon.** The vendor-neutral CLI (`bin/relay-gate`, `docs/sdk.md`) is built — the intercept-done → gate → inject-next core now runs over any loop, not just the Claude hooks. What remains is the *packaged* SDK and a long-running daemon: distribution and operational hardening, not the core mechanism. This is still the path to a fully independent, vendor-neutral oracle.

**Decision rule, now fired.** The pre-registered rule was: if per-step gating cannot beat M+CI cost-normalized at a usable N — once gate ≠ grader and the adversarial pass are run — **deprecate the per-step ratchet** and ship only the durable core: **authoritative on-disk plan + deterministic gate + verified ledger.** Gate ≠ grader is run, the snapshot anti-hack pass is run, and per-step Relay did not beat M+CI up to N=500. So we act on the rule: **the per-step amplifier is demoted to a default-off option; the durable control-plane core is the product.** The per-step ratchet still earns its keep where it is *cheap and the work is genuinely coupled* (it localizes a regression at the step that caused it) — but it is no longer claimed as an efficacy win.

---

## 8. What is durable regardless

Strip away the amplifier thesis entirely and three things remain, none of which depend on the crossover N resolving favorably and none of which erode as models improve:

1. **A deterministic external oracle.** "A real check passed" replaces "the agent said done." This is valuable the first time an agent ever lies about completion — which is to say, immediately, and at all N.
2. **A forward-only keep-best ratchet** with regression re-checks, blocking the measured correct→wrong reflection-regression failure at the moment it occurs.
3. **A tamper-evident, timestamped verified-trace ledger** — a per-milestone compliance and audit artifact. For regulated build owners who legally cannot ship "the model said done," the trace can be worth as much as the work.

The honest positioning, then, is **reliability insurance and a compliance artifact — *proof, not speed*** — strong specifically on coupled, dependency-deep, test-oracle-rich, high-stakes campaigns inside one codebase. The mechanism is a small amount of bash over a public feature; there is no moat in the mechanism, and we say so. Of the two defensible assets the prior draft listed as "currently unbuilt": the **measured crossover-N eval is now built and run** — and its answer is *no crossover up to N=500*, which kills the amplifier rather than confirming it, but the eval itself (generator + integrity-guarded harness + held-out grader) is a real, reusable instrument. The **verified-trace flywheel is built but small** — traces accumulate and export as a reward signal, but at our own tens-of-runs volume, not a lab's millions. Everything else is a head start: research taste, opinionated packaging, and a brand.

We would rather ship the narrow, true claim than a wide, unproven one. The wide claim — that Relay makes a bounded model strong at distance — we **tested and it failed**: a strong model aced 500 coupled requirements first-pass, so per-step gating recovered nothing the monolith dropped, because the monolith dropped nothing (§5). We retract it rather than soften it. The narrow claim — that an agent operating under Relay **cannot finalize until a real check passes, and leaves a signed, tamper-evident proof that it did** — is true today, demoable in ninety seconds, and the thing we are willing to put our name on. The amplifier was on trial and lost; the control plane is what we ship.

---

*Status of this document: v0.2. It supersedes the amplification framing in prior `WHITEPAPER.md`/`SPEC.md`. The crossover N is now measured (no crossover up to N=500, two substrates) and the `SubagentStop`/multi-runner gate, gate ≠ grader split, in-hook compaction, vendor-neutral CLI, and retained verified-trace corpus all now ship in code — so the gaps the prior draft called "roadmap" or "aspirational" are reconciled here against the artifacts that close them (`bin/relay-arm-hook.sh`, `lib/relay-gate.sh`, `benchmark/run_arm.sh`, `benchmark/RESULTS.md`, `bin/relay-corpus.py`, `bin/relay-gate`, `docs/`). The residual honest limits — tail-rot beyond agent-side compaction, a standing per-substrate adversarial pass, corpus volume, packaged SDK/daemon, and Claude-hook vendor dependency on hook-driven paths — remain stated as such.*