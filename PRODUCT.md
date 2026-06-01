# Relay — Product & Strategy

**Version control + CI for the *act* of doing work.**

A deterministic reliability control plane that intercepts the moment an agent declares "done," runs the current work package's real Definition-of-Done (pytest / lint / type / grep / shell), and refuses to let the agent finalize until a real check passes — then injects the next work package from an on-disk plan into the *same* continuous context.

---

## 0. Status of claims in this document

This document distinguishes three epistemic states explicitly, because the credibility of Relay rests on not overselling it:

| Tag | Meaning |
|-----|---------|
| **MEASURED** | We have data from our own benchmark substrate. |
| **ARGUED** | Supported by external benchmarks or first-principles reasoning, *not* yet proven on our substrate. |
| **UNKNOWN** | We do not have the number; we name it as a gap. |

The single most important **UNKNOWN** is the *crossover N* (Section 9). Until it is measured, Relay is sold as **reliability insurance + a compliance artifact**, not as a speed or cost win.

---

## 1. One-liner

> **Relay makes it physically impossible for an agent to lie that it's done.**

It replaces the trust assumption *"the agent said it finished"* with the verifiable fact *"a real check passed"* — enforced from **outside** the model's control plane, on every milestone, with a tamper-evident trace as proof.

The mental model:

```
Relay : agentic work  ::  git + CI : human software work
   work package  =  an atomic verified commit
   the gate      =  a pre-commit / pre-merge hook
   keep-best     =  a ratchet (forward-only, locked once green)
   sprint.json   =  the plan, under version control
```

— except the gate is moved **in-loop**: it fires *during* the run, at every milestone, not just at the end.

---

## 2. ICP — most acute pain first

Relay is narrow on purpose. Its value is proportional to the fraction of your Definition-of-Done that reduces to a deterministic check. We state the ICP in descending order of pain.

### 2.1 Primary — large coupled autonomous code campaigns inside one codebase

Teams running **multi-hundred-step** agentic work against a real codebase with a real test suite:

- Framework / major-version upgrades (e.g. a 300-file migration across a coupled dependency graph).
- Mass codemods / API migrations where step 80 can silently break step 12.
- Long refactors where a later "cleanup" pass regresses earlier-correct code.

**The acute pain:** the agent reports "done," and nobody can cheaply prove whether it actually is. The failure mode is not loud — it is a *confidently false* "all done" with a handful of silently-dropped requirements, discovered days later in production. These teams already fear this and currently **cannot disprove it**.

### 2.2 High-value — regulated / compliance-heavy build owners

Fintech, health, gov, safety-critical. These owners **legally cannot ship "the model said done."** For them the tamper-evident, timestamped verified-trace ledger is worth as much as the work itself: it is the artifact that survives an audit. Relay's value here is true at **all N**, independent of the unproven efficacy crossover.

### 2.3 OEM — agent-platform and dev-tool vendors

Vendors who would rather buy a model-agnostic gate/ratchet backend than re-derive the intercept-done → gate → inject-next state machine themselves.

### 2.4 Explicitly NOT the ICP

- **Low-N day-to-day tasks.** Below the crossover, Relay is pure overhead (Section 5, MEASURED). A strong model aces a 12-step campaign monolithically; Relay just makes it cost ~2x more.
- **Design / security-posture / API-ergonomics / "is this the right abstraction" work.** No shell command decides these. Relay's deterministic core does not apply, and the llm-judge fallback over-rejects (Section 8).

---

## 3. The wedge — *"Your agent cannot lie that it's done"*

One install of a single Claude Code Stop hook. From that moment, every time the agent tries to finalize, Relay runs your real DoD and either advances it or bounces it back into its own context.

### 3.1 The 90-second demo (the visceral beat)

Two runs of the same campaign, side by side:

```
VANILLA AGENT                          RELAY
─────────────────────────              ───────────────────────────────
... working ...                        ... working ...
"All done! ✅"                          "All done!"
[ run exits ]                          ┌─ Stop hook fires ─────────────┐
                                       │  gate: pytest checks/  → RED  │
actual state: 23/30 checks pass        │  23/30 — 7 requirements unmet │
7 silently dropped.                    │  decision: BLOCK              │
Nobody knows until prod.               │  reason: "WP-04 failed: <…>"  │
                                       └───────────────────────────────┘
                                       agent bounced back into context
                                       ... fixes it ...
                                       gate: pytest checks/  → GREEN
                                       30/30, 0 regressions
                                       every pass timestamped + signed
                                       [ run exits — and only now ]
```

The beat that lands in the room is **the door not opening.** The agent *wants* to stop. It cannot. It is forced back into its own context until a deterministic check — not its own judgment — says it may leave.

### 3.2 Why the wedge is honest at all N

Even on a campaign a strong model would ace monolithically, Relay still converts an **unverifiable "done"** into a **signed, reproducible pass**. The *proof* is the product. That value is real at N=12 and at N=500 alike, and it is fully decoupled from the unproven high-N efficacy claim. We lead with **insurance and compliance**, never with speed, until the crossover N is measured.

---

## 4. Mechanism

### 4.1 The core loop

```
                       ┌──────────────────────────────────────────┐
                       │              sprint.json                  │
                       │  [ WP-01 {instr, DoD}, WP-02 {…}, … ]     │
                       │  authoritative plan, on disk, re-read     │
                       │  FRESH on every hook fire                 │
                       └──────────────────┬───────────────────────┘
                                          │ read fresh
                                          ▼
   agent works ──► "done" ──►  ┌─────────────────────────┐
        ▲                      │  STOP / SubagentStop HOOK│
        │                      │  run current WP's DoD    │
        │                      │  (pytest/lint/type/grep) │
        │                      └───────────┬─────────────┘
        │                                  │
        │              ┌───────────────────┴───────────────────┐
        │              ▼                                        ▼
        │        GATE PASSES                               GATE FAILS
        │   lock WP (keep-best)                       retries < budget?
        │   re-run regression set                      │           │
        │   (all prior WP gates)                      yes          no
        │              │                               │           │
        │   any prior WP RED? ──► block w/ regression  │           ▼
        │              │ no                            │      escalate to
        │              ▼                               │       human; halt
        └── inject NEXT WP via                         │   (verified prefix
            {"decision":"block",                       │    is the guarantee)
             "reason": <next WP instructions>}  ◄──────┘
                                              block w/ precise failure
```

The interception turns **one continuous agent context into a forward-only state machine that physically cannot finalize** until the current WP's DoD passes.

### 4.2 Properties

- **Authoritative external plan.** `sprint.json` on disk is the source of truth. It is re-read fresh on every fire, so it overrides the model's drifting, rotting in-context memory. The plan does not degrade with the conversation.
- **Forward-only keep-best ratchet.** An accepted WP is *locked*. The system never moves backward through a green milestone.
- **Regression set.** At every later WP, the gates of all previously-accepted WPs are re-run. New work that silently breaks old work is caught *the moment it happens* — not at an end-of-run CI pass. This directly blocks the measured **correct → wrong reflection-regression** failure (Section 7).
- **Bounded retry → escalate.** A failing WP gets a bounded retry budget; on exhaustion the chain halts at a human. `stop_hook_active` plus a bounded retry counter prevent infinite loops.
- **The guarantee is a *verified prefix*, not whole-campaign perfection.** Relay promises "a verified chain up to the first WP it could not pass," then a human. This is a floor, stated honestly — not a claim of 1.0 on arbitrary campaigns (Section 8).

### 4.3 Verified technical facts (MEASURED)

On the **shipped plain-`Stop` path**:

- `Stop` + `{"decision":"block"}` forces continuation with injected text rather than finalization.
- The hook can read `last_assistant_message` and the runner's transcript.
- `stop_hook_active` plus a bounded on-disk retry counter prevent infinite loops.
- Settings-hook **removal** does not hot-reload mid-session, but the hook **script body** reloads on each fire — so the gate logic and `sprint.json` are both live-editable mid-run.

Verified in clean-room design probes but **not** exercised by the shipped hook: `SubagentStop` carries a stable per-runner `agent_id` (the intended basis for multi-runner keying in our SPEC). The shipped artifact uses plain `Stop` and ignores `agent_id` — see §4.4. We tag it ARGUED-in-code, not MEASURED-as-running.

### 4.4 Doc/impl gap, stated plainly (honesty over polish)

**Update (closed):** the multi-runner gap is now shipped. Two hooks share one gate core
(`lib/relay-gate.sh`): the original plain-`Stop` single-runner benchmark hook, and `bin/relay-arm-hook.sh`
— a **`SubagentStop`** hook that holds each spawned agent to its own checklist chain with per-runner
state + ledger. One honest caveat on the keying: it is by a **`RELAY-ARM:<token>` marker in the agent's
transcript**, *not* by `agent_id` — Task-spawned subagents inherit the parent cwd and expose no
discriminating `agent_id`, so the token (unique per subagent transcript) is the realized basis for
multi-runner keying. It was exercised in an ad-hoc multi-agent fleet run (distinct chains, no observed
cross-talk); the *reproducible, committed* evidence is the deterministic LLM-free distillation in
`examples/fleet-chain/` (a single-token end-to-end proof) — the live 15-agent run is not re-runnable
in-repo. The conceptual `agent_id` design in the SPEC stands as the target; the token mechanism is what
runs.

---

## 5. The thesis — what we test, and what we do *not* claim

### 5.1 The gate, not the chunking, is the active ingredient

The naive story is "decompose the task." That story is **wrong on its own**: decomposition *alone* still compounds error. If each of 100 steps is independently 97% correct, the chance all 100 are correct is `0.97^100 ≈ 4.7%`. Chunking a long task into many sub-tasks, ungated, just relocates the compounding — it does not stop it.

The active ingredient is the **deterministic gate + bounded retry**. The gate drives effective per-step success toward 1 (a step is not allowed to advance until it passes), and the regression set catches cross-step breakage. It is a **ratchet, not a chain**: a chain is only as strong as its weakest link; a ratchet cannot slip backward.

To attribute any win to the gate rather than to the chunking, our benchmark includes a **D arm** — decomposed but **UNgated** — specifically as an ablation. Most "gated agent loop" pitches never build this arm and mis-attribute the win to decomposition. We built it on purpose.

### 5.2 What we explicitly RETRACT

The original framing pinned the thesis to **IFScale / ComplexBench** ("~97% instruction-following at N≈100, falling to ~65% at N≈500; ~48% on nested instructions"). We retract that framing as load-bearing evidence, for three reasons:

1. **Those are flat lexical-constraint tasks** (keyword-inclusion at scale), not coupled engineering. They do not transfer.
2. **ComplexBench is contradicted by our own data.** A strong model (Sonnet) aced our N=30 campaign at DAG depth 9 — 30 deeply-interacting requirements — at RSR 1.0 in ~6 turns. On our substrate, *intricacy was not a difficulty lever; only scale was.*
3. **The boundary is receding.** The IFScale N=500 instruction-following number moved roughly 68% → ~100% in about a year. The regime where a model is "unreliable enough" to need a *per-step* ratchet is shrinking as models improve.

So the "bounded-regime amplification" claim — *convert one N=500 pass at ~65% into ~100 k=5 passes at ~97%* — is **ARGUED, not proven**, demoted to a footnote, and explicitly **not** the durable thesis.

### 5.3 The durable claim — model-improvement-ROBUST

What survives the next model generation is *not* "amplify a weak model." It is:

- **A deterministic external oracle** — "a real check passed" replaces "the agent said done." A near-perfect engineer still runs CI before merging.
- **A forward-only ratchet with regression re-checks** — locks correct work against later self-inflicted regression.
- **A tamper-evident verified-trace ledger** — proof per milestone, an audit artifact.

None of these erode as the model gets better. The *amplifier* dies with the next model generation; the *control plane* survives. We build and sell the control plane.

---

## 6. Product surface

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RELAY CONTROL PLANE                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐   ┌────────────────────┐   ┌──────────────────┐   │
│  │  RELAY KERNEL │   │  DETERMINISTIC GATE │   │ sprint.json      │   │
│  │ intercept-done│──►│  CATALOG + REGRESS  │◄──│ authoring +      │   │
│  │ → gate →      │   │  ENGINE  ★MOAT-ADJ★ │   │ auto-decompose   │   │
│  │ inject-next   │   │  + llm-judge residue│   │ (adoption flywheel)│ │
│  │ keep-best lock│   │    (weak link)      │   └──────────────────┘   │
│  └───────────────┘   └────────────────────┘                          │
│         │                      │                                      │
│         ▼                      ▼                                      │
│  ┌────────────────┐   ┌────────────────────────┐                     │
│  │ TELEMETRY /    │   │  VERIFIED-TRACE LEDGER  │ ★★ THE MOAT ★★      │
│  │ BURNDOWN       │   │  tamper-evident pass/   │  compliance artifact│
│  │ dashboard      │   │  fail per WP + diff +   │  + RL-signal corpus │
│  │ (UNBUILT)      │   │  retry distribution     │  (BUILT)            │
│  └────────────────┘   └────────────────────────┘                     │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  MODEL-AGNOSTIC GATE CLI  — removes single-vendor risk (BUILT) │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

| Component | What it does | Defensibility |
|-----------|--------------|---------------|
| **Relay kernel** | intercept-done → gate → inject-next state machine; per-WP counter, keep-best lock, bounded retry + escalation. | **Zero.** Open-source it. It is distribution, not moat. |
| **Deterministic gate catalog + regression engine** | The active ingredient: what *physically* enforces truth. Library of mechanical checks (pytest/lint/type/grep/shell/property-test) + the engine that re-runs prior gates. | Moat-adjacent via taste and breadth, but cloneable. |
| **llm-judge residue** | Fallback for DoD that no shell command decides. **Clearly flagged as the weak link** — it over-rejects and reintroduces the unreliability Relay exists to kill. Minimized, never load-bearing. | Negative. A liability we bound, not a feature. |
| **sprint.json authoring + auto-decomposition** | Drafts mechanical checks from the *existing test suite*, drives authoring cost toward zero. **The adoption flywheel** — authoring is the real tax. **BUILT** (`bin/relay-autodecompose.py`). | Stickiness via workflow, not defensibility. |
| **Telemetry / burndown dashboard** | Per-WP timing, retry distribution, gate first-pass rate, escalations, live context size, regression count. **UNBUILT** — the signal exists (`bin/relay-corpus.py export`), the dashboard does not. | Product surface; commodity. |
| **Verified-trace ledger** | Tamper-evident pass/fail per WP + diff + retry distribution. **The compliance artifact AND the RL-signal substrate.** | **The real asset** — see Section 7. **BUILT**: hash-chain ledger (`lib/relay-gate.sh`) + retained corpus (`bin/relay-corpus.py`, `archive_trace`). |
| **Model-agnostic gate CLI** | The vendor-neutral oracle; evaluates one gate step as pure JSON + exit code over any agent loop. Removes single-vendor risk. **BUILT** as a CLI (`bin/relay-gate`); a long-running daemon / multi-language SDK is the next step, not yet built. | The lock-in *escape*, and the OEM revenue surface. |

---

## 7. The moat — stated honestly

### 7.1 What is NOT the moat

**The hook is not the moat.** It is ~64 lines of bash over a **public, documented** Claude Code feature (`Stop` + `{"decision":"block"}`), fully disclosed in our own SPEC/WHITEPAPER. A competent engineer clones the entire mechanism in an afternoon. Any pitch that claims the *mechanism* is defensible is lying.

### 7.2 What IS defensible — the machinery is built; the moat is the accrued data

| Asset | Why defensible | Status |
|-------|----------------|--------|
| **Crossover-N eval suite** | A freshly-authored, contamination-immune, coupled-engineering suite is **proprietary ground truth a weekend cloner cannot fabricate.** | **MACHINERY BUILT** (`benchmark/generator/gen_campaign_v2.py`, `grader.py`, `run_crossover.py`). But the measured result is **negative** — no crossover up to N=500, amplifier thesis falsified on two substrates (`benchmark/RESULTS.md`). There is no positive "crossover number" to keep private; the asset is the *eval methodology*, not a speed claim. |
| **Verified-trace data flywheel** | Gate verdict + diff + retry distribution per WP, at usage volume, is an **RLVR / process-supervision reward signal**: dense, verifiable, per-step. The model labs want exactly this. | **BUILT** — traces are retained, not ephemeral: `archive_trace` copies each terminal trace into `$RELAY_CORPUS_DIR`; `bin/relay-corpus.py` extracts the per-step signal. The *moat* is the corpus accrued at usage volume, which is not clone-able without doing the work. |

### 7.3 Everything else is a head start

- **Founder research taste.** The M / R / D design — and specifically building the D (ungated) ablation to attribute the win to the gate, not the chunking — is genuinely correct and rare. But it is now written down, hence copyable.
- **Opinionated drop-in packaging** and **brand.**

**Honest verdict: head-start + methodology + an *aspirational* data flywheel.** Time-to-copy the mechanism: an afternoon. Time-to-copy the *measured private crossover dataset* and the *trace corpus at volume*: not clone-able at all without doing the work and accruing the usage — which is the entire strategy.

### 7.4 The one structural wedge against the model lab

The standing threat is the **model lab itself** absorbing "gated continuation over a stop hook" into its SDK. What a lab is structurally **disinclined** to ship is an **independent, vendor-neutral oracle whose entire purpose is to *not trust their model*.** That independence — "we verify you, we don't take your word" — is the only durable position, and it is why the model-agnostic SDK + the audit ledger (not the hook) are where we invest.

### 7.5 Strategic implication

```
OPEN-SOURCE (for distribution)        MONETIZE / KEEP PRIVATE (the assets)
──────────────────────────────       ───────────────────────────────────
• the hook / kernel                   • the measured crossover-N number
• the gate catalog                    • the eval suite (as a paid eval)
• sprint.json format                  • the verified-trace ledger / corpus
                                      • the authoring + telemetry layer
                                      • the compliance/audit product
```

Do **not** publish the crossover number and methodology as a whitepaper. Publishing converts the only real methodological moat into a citable gift.

---

## 8. Honest boundaries (non-negotiable)

These are stated up front because the credibility of everything above depends on not hiding them.

1. **The gate-expressiveness wall (the deepest limit).** Relay ratchets only what reduces to a deterministic check. The DoDs that actually cause long-horizon failure — *is this the right abstraction, are the API ergonomics good, is the security posture sound, did it satisfy intent* — no shell command decides. These route to an llm-judge that **over-rejects**, reintroducing the unreliability Relay exists to kill. **Relay's value is exactly proportional to the fraction of your DoD expressible mechanically.** It is near-worthless in pure design / security / ergonomics work.

2. **Bounded-regime amplification is ARGUED, not proven, and the anchor already broke.** See Section 5.2. IFScale/ComplexBench do not transfer; ComplexBench is contradicted by our own N=30; the boundary recedes as models improve.

3. **Efficacy thesis FALSIFIED on every clean-oracle substrate up to N=500.** **MEASURED:** at N=12 and N=30, Relay is **pure overhead** — ~2.1x cost, ~3.8x turns (23 vs 6 on N=12), **identical RSR 1.0** vs monolithic. The high-N generator is now **built** (`gen_campaign_v2.py`), and the crossover was **measured, not left unknown**: the monolith aces N=60/150/300/**500** at RSR 1.0 on two independent substrates — `benchmark/RESULTS.md` records the amplifier thesis as *falsified*, not pending. Intricacy is not a difficulty lever and, now measured, neither is scale to 500. **The honest verdict: the speed/amplifier half is dead; the durable product is the control-plane / compliance surface, which never depended on a crossover.**

4. **Missing the real baseline (M+CI).** Our arms are M (no-gate monolith), R (per-step gated), D (ungated decomposed). They omit the *actual* competitor: **one well-structured prompt + ONE final full-CI pass + a bounded aggregate-repair loop.** An R-beats-M result is partly attributable to "M had no final gate at all," not to "per-step beats end-gate." Until M+CI is run at equal budget, we cannot rule out that the per-step ratchet is redundant over end-gating.

5. **Reward-hacking / gate == grader — now SPLIT.** The benchmark previously let the agent self-check against the same nodes the grader graded. **Fixed:** gate ≠ grader is implemented — `run_arm.sh` strips `holdout/` from the run dir so the runner never sees it, and `grader.py` scores the disjoint held-out suite (`graded_by:"holdout"`). The adversarial pass is **demonstrated** (an auto-emitted reward-hacker scores ~0.03 held-out; `run_crossover.py --check-grader` proves the empty skeleton fails the grader) but is not yet a standing continuous gate. Residual honesty: in production the *checklist* controls and any final grader are author-supplied, so "gate ≠ grader" is a discipline the author must keep, not an automatic guarantee.

6. **Single-context rot at the tail.** "Every step stays at k=3–5" is true for revealed-requirement **count**, false for context **size**. By WP 80 of 100, the continuous context is large and degraded — the exact regime Relay claims to escape. The ratchet defends *prior* work via regression checks but does nothing for omission/misexecution on the *new* WP. **Compaction is now built** (a lightweight in-hook form: shortened repeat-reblocks + a deep-advance checkpoint hint past `RELAY_COMPACT_AFTER`, `docs/compaction.md`) — but it nudges the agent to self-summarize; it does not control the model's context directly. The deeper rot remains a real limit.

7. **Coupling-benefit vs rot-cost is itself UNMEASURED.** Continuous-context value beats fresh-context orchestration only on coupled chains short enough that context has not rotted. On independent/parallelizable WPs and very long horizons, an orchestrator with isolated fresh-context agents likely wins. We carve out honestly to **coupled, not-yet-rotted** chains.

8. **Vendor lock-in — partially mitigated.** The Claude hooks rest on *observed* (not contracted) behavior of one vendor's harness; one settings/changelog change can silently kill them. **Mitigation shipped:** `bin/relay-gate` is a vendor-neutral CLI that evaluates a gate step as pure JSON + exit code, so any harness can drive Relay without the Claude hook. The lock-in survives only where you *use* the Claude hooks; the gate logic itself is now portable. A long-running daemon / packaged SDK is the remaining step.

9. **Escalation is a floor, not a win.** On a campaign with one genuinely hard WP, a monolith may deliver *broad-but-partial* while Relay delivers *narrow-but-verified*. Which is better is a value judgment, not a strict win for Relay.

---

## 9. The one number that decides it

> **The crossover N**: the smallest campaign size at which per-step gated Relay beats the realistic baseline **M+CI** (one well-structured prompt + ONE final full-CI pass + bounded aggregate-repair loop, at **equal budget**) on **cost-normalized quality (CNQ)**, measured on a **freshly-authored, contamination-immune, coupled-engineering** campaign suite, with a **held-out grader (gate ≠ grader)** and the **adversarial exploit pass run to ~0 residual hack rate.**

| State | Value |
|-------|-------|
| Crossover N | **NONE up to N=500** — measured, not unknown |
| Measured points | N=12, N=30, and (generated) N=60/150/300/500 — monolith RSR 1.0 throughout; Relay = 2.1x cost / 3.8x turns / RSR 1.0 (**MEASURED, pure overhead**) |
| High-N generator | **BUILT** (`gen_campaign_v2.py`); ran to N=500 |

**The decision rule was stated in advance (falsifiable) — and it resolved against the amplifier:**

- If the crossover landed at a usable N **and** survived frontier models getting more reliable → efficacy thesis confirmed.
- If it did not exist, receded past usable N, or only beat the no-gate strawman → the **amplifier thesis is dead**; keep only **plan + gate + ledger** as the control-plane/compliance product.

**Outcome (measured): no crossover up to N=500 on two substrates** (`RESULTS.md`). The amplifier half is
deprecated as a sales claim; the control plane survives, exactly as the rule pre-committed. One honest
asterisk remains: **M+CI** (one prompt + a final full-CI repair loop) was not run as a separate arm, so
"per-step beats end-gate" is not separately proven — but since the monolith already saturates, the
efficacy question is moot either way.

---

## 10. Competitive positioning

| Category | Examples | What they do | What Relay does differently |
|----------|----------|--------------|------------------------------|
| **Agent orchestration frameworks** | multi-agent planners, graph/DAG runners, "supervisor + workers" | Decompose and route work across agents/contexts; coordinate. | Relay is **not** an orchestrator. It is an *in-loop oracle + ratchet over a single continuous context*. Orchestration **chunks**; Relay **gates**. Orchestration's failure (independent contexts re-deriving state) is the opposite of Relay's bet (coupled context, defended by regression checks). They are **complementary**: an orchestrator can dispatch Relay-gated workers. |
| **CI / CD** | GitHub Actions, end-of-run test gates | Verify at the *end*, out of loop, after the work is "done." | Relay moves the gate **in-loop** and runs it **per milestone**, so a regression is blocked *the moment it happens*, not discovered after 100 steps. CI is the end gate; Relay is the *per-commit* gate **inside the act of doing the work.** Relay does not replace CI — it front-loads it into the run. |
| **Agent guardrails / policy hooks** | content filters, permission gates, PR-time linters | Constrain *what the agent may do* (safety, permissions, style) at action time. | Guardrails constrain *actions*; Relay verifies *outcomes against a DoD* and **controls progression** (you don't advance until the outcome is proven). A guardrail says "you may not run that"; Relay says "you may not *leave* until this passed." |
| **Eval / benchmark harnesses** | task-suite runners, LLM-judge eval frameworks | Score an agent *after* a run, offline, for comparison. | Relay's gate is the *same kind* of check, but **online and enforcing** — it doesn't grade the run, it *is* the control flow of the run. (And our eval suite, kept private, is a separate product — Section 12.) |

**The clean one-sentence position:** orchestration frameworks decide *who does what*; CI decides *was it OK at the end*; guardrails decide *what's allowed*; **Relay decides *you don't get to say you're finished until a real check says you are* — in-loop, per milestone, with a signed trace.**

---

## 11. Roadmap (priority order)

Items 1–7 below were the original priority order; **all seven are now done** (2026-06-01). Status in
brackets; the durable conclusion is that the efficacy half is settled (negative) and the control-plane /
compliance / data half is built.

1. ✅ **High-N generator + crossover measurement.** [DONE — `gen_campaign_v2.py` + `run_crossover.py`; measured to N=500, **no crossover, thesis falsified** (`RESULTS.md`). The "number" is a negative.]
2. ✅ **Split gate from grader; adversarial exploit pass.** [DONE — held-out grader in `run_arm.sh`/`grader.py`; reward-hacker scores ~0.03. Continuous-pass-as-standing-gate is the residual.]
3. ✅ **Close the Stop-vs-SubagentStop gap.** [DONE — `bin/relay-arm-hook.sh` ships the SubagentStop multi-runner, keyed by transcript token (not `agent_id` — Task subagents share cwd / expose no discriminating id). §4.4.]
4. ✅ **Auto-decomposition + auto-drafted gates.** [DONE — `bin/relay-autodecompose.py`.]
5. ✅ **Verified-trace ledger; stop `rm -rf`-ing the asset.** [DONE — hash-chain ledger + `archive_trace` retention + `bin/relay-corpus.py`. The per-run *working* dir is still cleaned, but the ledger/corpus is copied out first.]
6. ✅ **Compaction for tail-context rot.** [DONE — in-hook lightweight form; `docs/compaction.md`. Deeper model-side rot remains a limit (§8.6).]
7. ✅ **Model-agnostic gate surface.** [DONE as a CLI — `bin/relay-gate`. A long-running daemon / packaged multi-language SDK is the next increment.]

**What's next (the §12 expansion bets, now that the kernel + data layer ship):** telemetry/burndown
dashboard over the corpus signal; org guardrail policy bundles; the executable-spec library; and — if a
buyer pulls — packaging the gate CLI into a daemon/SDK.

---

## 12. Expansion bets

| Bet | Thesis | Why it compounds |
|-----|--------|------------------|
| **Long-horizon-reliability benchmark *as a product*** | Own *the number* that defines "reliable at distance." Kept private, sold as a paid eval. | The crossover methodology is the methodological moat — valuable **only while unpublished.** Becomes the industry's reliability yardstick if it is the first credible one. |
| **RLVR / process-supervision reward engine** | Verified traces (gate verdict + diff + retry distribution per WP) are dense, per-step, verifiable reward signal. | This is the **labs-facing** asset that **model improvement consumes rather than obviates** — a better model makes *more* valuable traces, not fewer. The one expansion that gets *stronger* as the amplifier thesis gets weaker. |
| **Compliance / audit ledger** | Tamper-evident verified-trace ledger for SOC2 / PCI / FDA / EU-AI-Act regimes. | True at all N; sells on *proof*, not speed; the regulated buyer pays for the artifact regardless of the crossover. |
| **Executable-spec marketplace** | Author-once-ratchet-many: `sprint.json` + gate bundles for common campaigns (a Django 3→5 migration, a React class→hooks codemod), sold with a rake. | Turns authoring cost (the tax) into a *catalog* others buy; network effects on the supply side. |
| **Org guardrail layer** | Mandatory DoD bundles — coverage floors, "no loosened tests," "no debug prints," "no silently-skipped assertions" — that *every* agent run in an org must clear before "done." | Becomes org policy infrastructure: the deterministic floor every internal agent must pass. High stickiness, expands seat-by-seat across an org. |

---

## 13. Pricing

**Principles:**
- **Value-metered on verified work** — never seats, never pure token-passthrough. Token-passthrough *punishes the gate* (the gate costs tokens to enforce truth; you must not penalize the thing that creates the value).
- **Price the compliance/insurance value LOW and per-campaign**, explicitly **decoupled** from the unproven throughput crossover. The insurance is real today; the speed story is not yet.

| Tier | Who | Metric | What's included |
|------|-----|--------|-----------------|
| **Open core** | Everyone (distribution) | Free | Hook / kernel, gate catalog, `sprint.json` format. Makes *"your agent cannot lie that it's done"* the default install. |
| **Team / Pro** | Working teams | Per active campaign or per gated WP-run | Auto-decomposition, regression engine, telemetry/burndown, hosted trace ledger, spec library. |
| **Compliance / Enterprise** | Regulated build owners | Annual, priced against the cost of an *unprovable regulated deliverable* | Tamper-evident audit ledger, SSO/RBAC, on-prem / BYOK, org policy-gate bundles, SLA. |
| **Vendor / OEM** | Agent-platform vendors | SDK license + rev-share or per-seat-of-their-product | Model-agnostic SDK/daemon, the gate/ratchet backend. |
| **Data / benchmark** | Labs + enterprises | Paid report; dataset/reward-signal licensing | The reliability eval as a paid report; verified-trace datasets / reward-signal licensing to labs. |

The deliberate structure: **the hook is free** (it is distribution), **the proof is paid** (ledger, eval, compliance), **the data is the long game** (trace corpus → reward-signal licensing).

---

## 14. GTM — wedge → land → expand

### 14.1 Wedge

Open-core distribution. Free hook + gate catalog + `sprint.json` format, so **"your agent cannot lie that it's done"** becomes the default install for anyone running autonomous agents in Claude Code. The 90-second demo (Section 3.1) is the entire top of funnel — it answers a fear every team already has and cannot currently disprove.

Sell the **insurance + compliance artifact first** — true at **all N**, fully decoupled from the unproven efficacy crossover. Never lead with speed.

### 14.2 Land

Land in **coupled, test-oracle-rich, regulated accounts** where:
- a silent regression is expensive, **and**
- an audit trail is *required*.

For these accounts the first paid surface is the **tamper-evident ledger** and the **regression engine** — value that is real today, independent of the crossover. **Crush the authoring tax** on the way in via auto-decomposition + auto-drafted gates from their existing test suite; authoring cost is the #1 adoption blocker, and an account that has to hand-write 100 DoDs will churn before it sees value.

### 14.3 Expand

- Up the stack into the **compliance/audit product** (annual, priced against the cost of an unprovable deliverable).
- Across the org via the **mandatory-DoD guardrail layer** (every agent run clears a policy floor).
- Toward the **OEM SDK** for vendors who want the backend.
- Toward the **reward-signal data line** as the trace corpus accrues.

**Publishing discipline:** publish the crossover number **only** on the *buyer's* kind of work, and **only once** gate ≠ grader and the adversarial pass are run. A number produced under gate == grader is hollow and, if published, both wrong and a gift to cloners.

---

## 15. Biggest adoption risks & mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Unproven crossover N** undercuts the efficacy half. | High | Lead with the **at-all-N insurance/compliance wedge**; urgently build the high-N generator and measure (Roadmap #1). The product does not depend on the crossover to be worth installing. |
| **Authoring cost at low N exceeds benefit** — hand-writing 100 DoDs is a real tax. | High | **Auto-decomposition + auto-drafted gates** from the existing test suite drive authoring toward zero (Roadmap #4). This is the single biggest adoption lever. |
| **Reward-hacking + gate==grader** erode trust in the green gate — and "trust the green gate" is the *one* value prop that otherwise survives. | High | **Split gate/grader** (held-out checks the agent never sees), **run the adversarial pass to ~0 hack rate** *before any public number* (Roadmap #2). |
| **Doc/impl mismatch** (plain Stop hook vs documented SubagentStop multi-runner) undermines credibility. | Medium | Close the gap in code; disclose it honestly until closed (Section 4.4, Roadmap #3). |
| **Model labs absorb gated-continuation** into the SDK. | Medium-High | Own the **independent, vendor-neutral oracle + audit ledger** — the thing a lab is structurally disinclined to ship ("we verify you, we don't trust you"). Section 7.4. |
| **Single-vendor lock-in** on observed harness behavior. | Medium | Ship the **model-agnostic SDK/daemon** (Roadmap #7). |
| **Tail-context rot** degrades new-WP execution on very long campaigns. | Medium | Build **compaction** (Roadmap #6); honestly carve out to coupled, not-yet-rotted horizons until then. |
| **Orchestrator + isolated agents win on long/parallel horizons.** | Medium | Carve out honestly to **coupled** chains; position Relay as a **gated worker** an orchestrator can dispatch, not a competitor to orchestration. |

---

## 16. Summary

Relay is **git + CI for the act of doing work**: a deterministic, model-agnostic reliability control plane that replaces *"the agent said done"* with *"a real check passed,"* enforced from outside the model, with a tamper-evident trace as proof.

**What is real today (MEASURED):** the mechanism works and demos in 90 seconds; the keep-best ratchet with regression re-checks is a correct structural answer to a real measured regression failure; at low N (12, 30) Relay is *pure overhead* vs a monolith.

**What is argued, not proven (ARGUED):** that per-step gating beats a realistic end-gate baseline at high N — the amplifier thesis, anchored on external benchmarks that do not cleanly transfer.

**What we do not know (UNKNOWN):** the crossover N — the single number that decides whether the amplifier half lives or dies.

**The durable product, regardless of that number:** an independent external oracle + a forward-only verified ratchet + a tamper-evident audit ledger — *reliability insurance and a compliance artifact* that does not erode as models improve. We **open-source the mechanism** (it is distribution, not moat), **monetize the proof** (ledger, eval, compliance), and **build toward the data flywheel** (verified traces → reward signal). We lead with insurance, not speed — and we name every boundary, because that honesty is the only thing here a competitor cannot clone in an afternoon.