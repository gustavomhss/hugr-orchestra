# adjudicate — the TRUTH adjudication instrument (bench axes A1 precision, A4 recall)

A1 (precision) and A4 (recall) both need one thing the shipped path does not have: a way to decide, for a
`(mined-fact, code)` pair, whether the fact is **grounded+true** or **hallucinated** — with _measured_
reliability, not a claim. Grounding is aboutness; the #95 baseline shipped 9 false facts that were all
correctly _about_ their anchored code. This instrument scores TRUTH, and it measures how much its own judges
agree before any number it emits is trusted.

It used to exist only in a scratchpad (a Fleiss-κ panel). This is the committed, re-runnable version.

## What is here

| file                                       | role                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `fleiss.mjs`                               | the pure, model-free MATH: Fleiss' κ, majority vote, catch-rate, false-alarm. No I/O.                                                        |
| `fixtures.mjs`                             | 10 known-true + 10 planted-false `(fact, code)` pairs — the calibration ground-truth. Each false names its `falseKind`. Plus `renderPrompt`. |
| `adjudicate.mjs`                           | the DRIVER: runs a judge command N passes over the fixtures, parses verdicts, scores. Makes no model call itself.                            |
| `judge.mjs`                                | the DEFAULT judge command (`claude --model $JUDGE_MODEL`). One interchangeable judge, not THE judge.                                         |
| `fake-judge.mjs`                           | a zero-cost stand-in judge for smoke/tests. Answers from the label — a PIPELINE proof, never a real calibration.                             |
| `run-calibration.mjs`                      | the re-runnable command that writes the DERIVED report.                                                                                      |
| `adjudicate.test.mjs`                      | proves the math on SYNTHETIC verdicts (canonical Fleiss 1971 example + hand-computed boundary cases). Runs under `npm test`.                 |
| `calibration-report.smoke-noisy.{md,json}` | committed DERIVED report — a fake-judge PIPELINE SMOKE. Live-judge calibration is PENDING a metered run.                                     |

## The judge model is a PARAMETER

The driver talks to the judge as "prompt on stdin → verdict text on stdout" (ADR-0011 D1 shape). The judge
MODEL is never hardcoded:

- `JUDGE_MODEL` / `JUDGE_BIN` / `JUDGE_ARGS` swap the model behind the default `judge.mjs`.
- `--judge-cmd <cmd> --judge-args <json>` points the driver at an entirely different command — a
  different-FAMILY judge (GPT/Gemini/local) drops in with no code change.

The default is same-family as the miner, which measures INTRA-family agreement. A model-INDEPENDENT number
(the oracle the bench ultimately needs) is exactly the cross-family swap above.

## Run it

```
# committed smoke (deterministic, no model call)
node harness/probes/adjudicate/run-calibration.mjs --fake=noisy --passes 5

# live / metered — real judge
JUDGE_MODEL=claude-sonnet-4-6 node harness/probes/adjudicate/run-calibration.mjs --passes 5

# cross-family judge
node harness/probes/adjudicate/run-calibration.mjs --judge-cmd my-gpt-judge --passes 5

# the math proof (no model call)
npx vitest run harness/probes/adjudicate/adjudicate.test.mjs
```

## Status

- MATH: proven on synthetic verdicts (24 tests green — canonical Fleiss κ=0.210 reproduced, boundary κ∈{1,0,−1/3}
  hand-computed, catch/false-alarm hand-built, verdict parsing pinned).
- LIVE-JUDGE κ / catch-rate / false-alarm: **PENDING a metered run** — no real model call was made in this
  seat. Running `run-calibration.mjs` without `--fake` against a real `claude` produces the live report.
