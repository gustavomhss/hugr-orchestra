# Relay — Agent Evidence Brief

Audience: agents. Status: current evidence brief.

Source baseline: `684456d571e8deb5f435d39e789e1b1258453d85`.
Current authority: [SPEC.md](SPEC.md). Procedures: [operational skills](.opencode/skills/).
Product scope: [PRODUCT.md](PRODUCT.md). This brief reconciles the May 2026 white-paper
observations with committed evidence and current code; it is not an execution guide.

## 1. Narrow thesis

Relay substitutes an externally executed acceptance check for an agent's unsupported completion
claim, then records and sequences the result. Per-step checks can localize a detected regression
at a milestone. Neither progression control nor a ledger proves that a weak oracle measures
intent, that an agent cannot bypass shared-user enforcement, or that Relay improves quality/cost
against end-gated repair.

Use three evidence classes: **built** means source implements the surface; **historical observation**
means a dated report/artifact records a run; **unresolved** means the evidence does not settle it.
Built machinery is not a measured efficacy result.

## 2. Actual comparison arms

| Arm | Delivery and feedback | Interpretation |
|---|---|---|
| M | One WP containing the whole campaign, gated with bounded full-check repair | The implemented end-gated baseline, historically called M+CI |
| R | Multiple WPs, visible per-step gates and regression checks | Per-step gating treatment |
| D | Same decomposition as R, advancement on stop without gates | Decomposition ablation |

[run_arm.sh](benchmark/run_arm.sh) sets M's gate on; [relay_hook.sh](benchmark/relay_hook.sh)
implements its repair loop. There is no missing fourth M+CI arm. M's campaign checks are not
arbitrary project CI, and the runners do not enforce equal total token/call budgets. Generated
M retry budgets and R per-WP budgets differ. An attribution claim needs comparable M/R/D runs,
not the design table alone.

## 3. Historical observations

Audience: agents. Status: historical.

These tables retain the original observations. Except for the linked N500 JSON and campaign-02
metadata, they are report-level summaries, not a committed raw statistical run set. Full details
and provenance limits remain in [benchmark/RESULTS.md](benchmark/RESULTS.md).

| Billing pipeline | N | M RSR | R RSR | M cost / turns | R cost / turns |
|---|---|---|---|---|---|
| 01-billing-integrity | 12 | 1.00 | 1.00 | $0.25 / 6 | $0.53 / 23 |
| 02-billing-engine-pro | 30 | 1.00 | 1.00 reported | $0.29 / 6 | Not retained in the summary |

Campaign 01's roughly 2.1× cost and 3.8× turns apply to that saturated pipeline comparison.
They are not an all-campaign overhead ratio. Campaign 02's
[metadata](benchmark/campaigns/02-billing-engine-pro/meta.json) records saturation; its later
"only scale is hard" inference was not established by that pilot.

| Generated substrate | N | M held-out RSR reported | Turns | Cost |
|---|---|---|---|---|
| v1 templated-coupled | 60 | 1.00; time-capped, implementation reported complete | — | — |
| v1 templated-coupled | 150 | 1.00 | 6 | $0.66 |
| v1 templated-coupled | 300 | 1.00 | 7 | $0.81 |
| v2 bespoke-graph | 150 | 1.00 | 8 | $1.35 |
| v2 bespoke-graph | 300 | 1.00 | 8 | $1.16 |
| v2 bespoke-graph, seed 1, M only | 500 | 1.00 | 7 | $1.8373098 |

The last row has [one committed JSON record](benchmark/results/crossover_N500_s1_M.json):
`n=500`, `k=25`, `seed=1`, `arm=M`, `valid=true`, `out_tok=88178`, `secs=1866.2`,
`check_grader=false`. Its absolute output paths record the original machine, not portable inputs.
The aggregate record does not contain per-requirement grades or show whether repairs occurred.

**Conclusion supported:** these observations found no headroom for requirement recovery in the
reported M runs; a speed/amplifier claim is unsupported. **Conclusion not supported:** a full
statistical sweep, two substrates each measured to 500, first-pass correctness, universal
"no crossover ≤500," or universal superiority/inferiority of per-step gating.

## 4. Integrity machinery and its reach

- **Gate/grader split is built.** `run_arm.sh` removes `holdout/` from the copied runner directory;
  `grader.py --holdout` scores the campaign-source suite against the candidate. Visible-check
  fallback is smoke evidence only. Same-user filesystem access is not hardened blinding.
- **Run-validity checks are built but limited.** `validate_run` checks the usage envelope and rejects
  byte-identical candidate/reference files when a reference is present. It does not prove code
  provenance or exclude transformed copies; it can mark a run valid without a usable grade.
- **Grader sanity is weak.** `check_grader_discriminates` accepts anything other than a clean
  pytest pass, including import, collection and infrastructure errors. `--check-grader` is not a
  strong negative-control proof, and the committed N500 record did not enable it.
- **Skipped-test risk remains.** `grader.py` AND-combines requirement testcases but classifies only
  `failure`/`error` children as failures; a `skipped` testcase can count as passed. It does not
  separately validate pytest's exit code or collection completeness.
- Historical lookup-hacker results were approximately 0.08–0.11 held-out on v1 and 0.03 on v2.
  Those are dated, narrow probes, not zero residual hack rate or an automated adversarial gate.
- Freshly authored/generated tasks reduce obvious training-set reuse. They are not proven
  contamination-immune, especially once inputs or generators are published.

## 5. Current mechanism evidence and limits

The production [arm hook](bin/relay-arm-hook.sh) uses transcript tokens and checks `agent_id`
ownership when available. It prefers the subagent transcript, avoiding session-level multi-arm
confusion. Earlier prose claiming no discriminating agent ID was too broad.

[lib/relay-gate.sh](lib/relay-gate.sh) records generation, oracle hashes and origins; it locks
chain append. [relay verify](bin/relay) compares recorded oracles across gate/regression events
and, when reachable, against the current sprint. Hashing does not validate oracle strength.
Plain SHA-256 is rewriteable; HMAC needs a protected key; both need a head anchor to rule out
tail truncation. Neither provides public-key actor signatures.

Daemon, dashboard, auto-decomposition, policy/spec libraries and retained-trace extraction are
built local surfaces, not remaining "unbuilt" roadmap items. Residuals include unauthenticated
HTTP, corpus-only dashboard visibility, best-effort archive copies, unsigned corpus outcome
metadata, context rot and unforced cold-context review. `human` kind remains unsupported by
production arm dispatch despite compiler/linter recognition.

`amend-check --signed-by` supplies text attribution, not cryptographic authorization or automatic
live-plan enforcement. Opaque mutation targets and guarded fork/append/amend/abort verbs remain
design proposals. Release resumes the failed gate; it never grants a skip.

## 6. What remains unresolved

An equal-budget, multi-seed, held-out M/R/D comparison on a substrate with real headroom is still
needed to establish efficacy, attribution, reliability and a cost-normalized crossover. The
coupling-benefit/context-rot boundary and legal/commercial value of traces are also unresolved.
The historical decision to stop selling amplification is positioning; it did not switch the
implemented per-step ratchet to default-off or prove the statistical kill condition universally.

Agents summarizing Relay must preserve that distinction: local control/evidence surfaces ship;
universal speed, quality, non-bypassability and compliance-certification claims do not follow.
