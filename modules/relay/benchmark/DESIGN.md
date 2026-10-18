# Relay Benchmark — Historical Experimental Design

Audience: agents. Status: historical.

Current authority: [SPEC.md](../SPEC.md). Procedures: [operational skills](../docs/skills/).
Read this as the intended experiment, not a current runbook or a completed statistical study.
Actual observations and their limits are in [RESULTS.md](RESULTS.md).

## 1. Research question and arms

The design sought a **regime map**: where per-step gating changes requirement satisfaction,
regression, consistency and cost against an end-gated monolith, and how decomposition contributes.

| Arm | Implemented delivery | Intended attribution |
|---|---|---|
| M | Whole campaign in `sprint_mono.json`, one WP, gate on, bounded aggregate repair | End-gated baseline; no separate missing M+CI arm |
| R | `sprint.json`, gates per WP and regression checks | Per-step gating treatment |
| D | Same decomposed sprint, gate off, advance on stop | Decomposition ablation |

Source: [run_arm.sh](run_arm.sh), [relay_hook.sh](relay_hook.sh). M receives the same visible
test feedback. R/D keep one continuous context; revealing fewer new requirements is not proof
of smaller live context.

## 2. Intended controls versus implemented controls

| Original requirement | Implemented reach / unresolved limit |
|---|---|
| Fixed model/tools/sandbox | Runner selects Sonnet and common hook/prompt mechanics; no hardened sandbox or complete temperature/environment record |
| Equal total calls/tokens | Not enforced by runners. Generated M uses `max(3, N//3)` retry budget; R uses per-WP budget 3. Timeout equality is not compute equality. |
| Same visible feedback; separate final oracle | Built campaign-copy split: `holdout/` removed from runner directory, final grader uses campaign-source holdout |
| Blind, isolated grader | Grader receives final candidate path, not an explicit arm label; a separate process under the same user is not unreachable isolation |
| Structured scoring | JUnit testcase parsing is built; skipped cases and unchecked pytest/collection failures limit its meaning |
| Multiple seeds, preregistered significance tests | Design intent, not a committed full run matrix, confidence-interval analysis or verified preregistration artifact |
| Residual hack rate near zero | Historical lookup-hacker snapshots only; no standing adversarial gate or universal exploit resistance |
| Contamination immunity | Original/generated inputs reduce direct reuse; publication and provenance are not proof of zero contamination |

## 3. Campaign design record

Original billing campaigns were self-contained tasks informed by hard-domain interaction styles,
without importing CoreLink code, requirements or identifiers. Intended axes were requirement
counts `{8,16,32,64}`, WP caps `{3,6}` and coupled-deep, independent-shallow, dense-interacting
types. Actual committed campaigns and generated pilots did not complete that grid.

The calibration proposal used 3–5 M pilots and roughly 0.85 RSR as the headroom threshold, with
a weak-to-strong model ladder. Saturated campaigns remain useful pipeline/overhead records;
the original instruction to discard them was superseded by retaining their negative evidence.
`run_crossover.py` compares the available valid M mean to a configurable threshold, not a
statistical model-ladder proof.

v1 generated templated record rules; v2 generated bespoke arithmetic functions with earlier
function calls and ordered global rules. Selected input snapshots are immutable experiment
inputs. Agents must not edit requirements, tests, skeletons or frozen sprint decomposition to
improve an arm's result. Generators can overwrite their chosen output directory; regeneration
is not evidence that an earlier experiment's inputs were frozen or identical.

## 4. Scoring and integrity

RSR is weighted final-state requirement satisfaction; all mapped tests for a requirement must
pass. CCR is all requirements satisfied. Grader REG compares with an explicitly supplied prior
per-requirement baseline; it is not automatically every correct→wrong flip during a run.
Definitions and instrument reach: [KPIS.md](KPIS.md).

Known source limits:

- [grader.py](grader.py) falls back to visible checks without `--holdout`; that is smoke evidence,
  not independent efficacy. It ignores pytest return status and marks only failure/error children
  as failures, so skipped testcases can count as successful requirements.
- [run_crossover.py](run_crossover.py) `--check-grader` accepts infrastructure/collection failure
  as a non-clean pass. The printed "discriminates" label overstates that check.
- Its reference guard rejects byte equality only when a reference file exists; transformed copies
  and broader leakage are outside its reach. `valid=true` also does not guarantee a usable grade.
- Runner outputs/ledger copies are best-effort and do not establish protected provenance.

## 5. Intended analysis, not delivered inference

The original plan called for per-cell RSR/CCR/REG intervals, a persistent positive R−M crossover,
`R−M = (D−M) + (R−D)` attribution, CNQ cost curves, reliability over repeated runs and live
context diagnostics. Those remain criteria for a stronger study. Arm means from unmatched
seeds/budgets do not establish causal decomposition or gating effects.

The recorded M pilots were saturated. The committed N500 evidence is one v2 seed-1 M aggregate,
not a high-N R/D comparison or two substrates measured to 500. Agents must retain the supported
conclusion: no demonstrated amplifier win in these observations; universal win/loss remains open.
