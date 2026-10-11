# Jimmy on SWE-QA-Pro: system comparison, judged by Claude

Date: 2026-10-11. Candidate: `jimmy-claude-candidate` @ `68de9a03d5`.
Jimmy runs as a native Task subagent on `claude-opus-5-5` through the `claude-code` engine.

This is a **system comparison**: the model is the same in both arms, and only the harness differs.

**Read this first.** All totals below come from a Claude judge, `claude-sonnet-5-5`, not the paper's GPT-5 judge. They are **not comparable to published SWE-QA-Pro numbers**: the reproduction anchor (gate J2) failed, 21.56 against 27.69 ± 2.0. Only differences between arms scored by the same judge are interpretable.

## Benchmark

- **Paper:** SWE-QA-Pro (arXiv 2603.16124, Findings of ACL 2026).
- **Data and code:** dataset `TIGER-Lab/SWE-QA-Pro-Bench` at HF revision `596892dac6`; code at `TIGER-AI-Lab/SWE-QA-Pro` @ `93ac6a4f3a`. Both are MIT-licensed.
- **Size:** 260 questions from 26 long-tail Python repositories, each pinned to one commit.
- **Question types:** What / Where / Why / How, split into 12 subclasses.
- **Read-only:** answering needs no code execution. The paper's own agent is read-only, so Jimmy's lack of a shell is not a handicap here.
- **Scoring:** an LLM judge compares each answer with a human-verified reference answer. References were first drafted by Claude Code. The judge gives five integer scores from 1 to 10 (correctness, completeness, relevance, clarity, reasoning); the total is their sum, 5–50.

## Method

**Sample.** 60 of the 260 questions, chosen with seed 20261011 and stratified proportionally by subclass. Per question type: What 12, Where 18, Why 15, How 15.

**Arms.** Each arm made one attempt per question, with at most 3 runs at once.

| Arm | Setup |
|---|---|
| **Jimmy** | Native Maestro→Task(`jimmy`) dispatch with the candidate's per-dispatch allowance (24 provider calls, 64 tools, 64 MiB, 600 s). The repository snapshot is the Location. Web tools are denied in Jimmy's child Session, because the reference answers are public on the web. No web tool was available or used in any run. |
| **Baseline** | Plain Claude Code (`claude -p`), same model, built-in Read/Grep/Glob only, `--max-turns 24`, 600 s, empty config, no settings or MCP. |
| **Opus direct** | Memorization probe: the paper's Direct mode with no tools, using the paper's prompt. |

- Both agentic arms received the same prompt: the paper's "Repository Path / Question" header plus one line asking for prose with `path: line a-b` citations.
- Snapshots are shallow (target commit only). They were verified unchanged after every run.

**Failures.** A timeout, exhausted allowance, failed task or empty answer scores the floor, 5/50. There were no reruns and no best-of.

**Judge.**
- The paper's judge prompt and score parser are used unchanged. The model is `claude-sonnet-5-5` at effort low, called through `claude -p` with no tools and an isolated empty config.
- Each answer was judged in 3 independent runs, and the item score is their mean.
- Blinding: Jimmy's result card and research reference ids were removed, along with any short "here is the answer" lead-in. The same rules applied to both arms. Keys were opaque, order was shuffled, and the judge never saw an arm label.

**Freeze.** Everything was frozen by hash before the first scored arm, and nothing was tuned after scores were seen. The freeze covers the candidate SHA, harness scripts, Claude CLI 2.1.295 binary hash, bun 1.3.14, dataset, sample, judge decision, J1/J2 results and analysis plan. The private eval directory holds `FREEZE-v2.txt`, sha256 `49f082b1…0871`.

## Judge calibration gates

**J1, known-quality controls: PASS for `claude-sonnet-5-5`.**

The test used 30 sample questions, each scored in five versions: the reference answer, plus four versions degraded mechanically with no model:
- truncated to the first third;
- file paths and identifiers swapped for another repo's;
- auxiliary verbs negated throughout;
- an off-topic answer taken from another repo.

Pass conditions were declared and hashed before judging:

| Condition | Required | Sonnet 5.5 | Fable 5.1 |
|---|---|---|---|
| Reference beats each degraded version | ≥ 0.90 | 0.983 | 0.983 |
| Mean gap, reference vs degraded | ≥ 10 | 31.7 | 31.1 |
| Spread across the 3 runs | ≤ 2.0 | 0.47 | 0.87 |
| Reference mean | ≥ 40 | 49.8 | 49.4 |
| Missing judgments | ≤ 0.02 | 0.000 | **0.027** |
| **Verdict** | | **PASS** | **FAIL** |

Mean score per degraded version for Sonnet 5.5: truncated 26.4, negated 23.9, swapped 11.4, off-topic 10.6.

`claude-fable-5-1` was the owner's preferred judge, but it failed J1. In 12 of 450 judgments, even after three attempts, it wrote commentary before the JSON. The paper's prompt requires JSON only, and the unchanged parser rejects anything else. All 12 failures were on negated variants. `claude-opus-5-5`, the tested model, was not needed.

**J2, reproduction anchor: FAIL.**

Sonnet 4.5 answered all 260 questions directly (the paper's Direct mode, thinking off) and was judged 3 times by `claude-sonnet-5-5`. It scored **21.56** (SE 0.26) against the paper's **27.69 ± 2.0** under GPT-5. The gap sits in the style axes:

| Axis | Claude judge | Paper (GPT-5) |
|---|---|---|
| Correctness | 2.86 | 3.34 |
| Completeness | 2.73 | 2.74 |
| Relevance | 5.62 | 8.65 |
| Clarity | 6.74 | 8.12 |
| Reasoning | 3.62 | 4.84 |

The Claude judge separates good answers from bad ones (J1), but its scale is not GPT-5's.

## Results (60 questions, `claude-sonnet-5-5` judge, 3-run mean)

Confidence intervals are 95% t intervals with the finite-population correction to 260. Scores are on the 5–50 scale.

| Arm | Mean | 95% CI | SD | Correctness | Completeness | Relevance | Clarity | Reasoning | Failures |
|---|---|---|---|---|---|---|---|---|---|
| Jimmy | **39.18** | 37.41–40.95 | 7.80 | 7.64 | 7.54 | 8.01 | 8.20 | 7.79 | 2 timeouts (floor 5) |
| Baseline (Claude Code, Read/Grep/Glob) | **41.58** | 40.57–42.59 | 4.44 | 8.16 | 8.13 | 8.28 | 8.68 | 8.32 | 0 |
| Opus 5.5 direct (memorization probe) | **33.55** | 31.96–35.14 | 7.02 | 5.83 | 5.78 | 7.27 | 8.09 | 6.58 | 0 |

**Primary result: paired difference Jimmy − baseline = −2.39, 95% CI −4.00 to −0.79.**
- The baseline scored higher on 42 questions and Jimmy on 12 (6 tied).
- A Wilcoxon signed-rank test agrees: z = −3.87, p = 0.0001.

**By question type** (Jimmy / baseline / paired difference with 95% CI):

| Type | n | Jimmy | Baseline | Jimmy − baseline |
|---|---|---|---|---|
| What | 12 | 37.42 | 41.36 | −3.94 (−10.63 to 2.74) |
| Where | 18 | 39.91 | 42.72 | −2.81 (−7.27 to 1.64) |
| Why | 15 | 37.84 | 38.91 | −1.07 (−2.34 to 0.21) |
| How | 15 | 41.07 | 43.04 | −1.98 (−3.14 to −0.81) |

**Secondary: correctness + completeness (2–20).** These are the axes where the judge matched the paper within 0.5 on the anchor. They are **not a validated anchor**.

| Measure | Mean | 95% CI |
|---|---|---|
| Jimmy | 15.19 | 14.34–16.04 |
| Baseline | 16.29 | 15.69–16.89 |
| Opus direct | 11.61 | 10.68–12.53 |
| Paired difference, Jimmy − baseline | −1.10 | −1.77 to −0.43 |

**Post-hoc sensitivity, not pre-registered.** Excluding the two Jimmy timeouts (n = 58), Jimmy scores 40.36 against the baseline's 41.52, a paired difference of −1.16 (−1.66 to −0.65). The baseline still leads.

**Memorization probe.** Opus 5.5 with no tools scores 33.55, far above Sonnet 4.5's 21.56 under the same judge. The newer model knows these repositories, or the benchmark, much better than the models the paper's direct-answer filter used. Tools still add value: Jimmy − Opus direct = +5.63 (3.46–7.81).

**Cost and time** (per question, medians):

| Arm | Wall time | Max wall time | Provider calls | Output tokens | Cache read | Cache write |
|---|---|---|---|---|---|---|
| Jimmy | 65 s | 806 s | 6 | 302k | 9.35M | 1.40M |
| Baseline | 32 s | 77 s | 8 turns | 160k | 2.68M | 0.70M |

Token columns are totals over the 60 questions. Call counts are measured differently in the two harnesses: Orchestra step records for Jimmy, Claude Code turns for the baseline. At Opus 5.5 list prices the totals are about $15 for Jimmy and $7 for the baseline (notional; runs used the subscription).

**Timeouts.** Both Jimmy timeouts made only one provider call. They happened while the shared host was saturated by unrelated work (1-minute load average ≈ 100).
- One run took 260 s before the child Session received its prompt.
- Its research_capture calls took over 100 s each before the 600 s deadline aborted them.
- Median prepared-to-prompt latency across Jimmy runs was 9 s; the maximum was 660 s.
- The baseline arm, which is much lighter, had no timeouts in the same window.

## Limitations

1. **Claude judges Claude.** Judge, tested model and reference drafter (Claude Code) are all Claude. Self-preference may favour Claude-style answers in every arm, and the reference style may favour the plain-Claude-Code arm in particular.
2. **Totals are off the published scale.** J2 failed, mainly on relevance and clarity. Correctness + completeness matched on the anchor but is not a validated substitute.
3. **Answer length.** Medians are about 3.5k characters for Jimmy and 3.7k for the baseline, against 1.7k for the references. The rubric may penalize length through relevance and clarity, but within each arm length barely predicts score (r = 0.05 for Jimmy's answered items, −0.06 for the baseline). The raw Jimmy r = 0.41 comes only from the two empty, floored timeouts.
4. **False premises.** Some questions are generated with false premises. Ten answers in each arm explicitly challenged a premise. Jimmy's averaged 41.2 against 40.2 for its other answers; the baseline's averaged 40.3 against 41.8 (descriptive, small n). References drafted by Claude Code may still reward going along with a premise.
5. **Environment.** One attempt per item on a shared, heavily loaded 16 GB Mac. Jimmy's heavier runtime (Orchestra plus the Claude Agent SDK) is more exposed to host load. Both of its failures were timeouts during a load spike.
6. **Memorization.** Opus 5.5 scores well without tools (33.55), so the paper's filter does not neutralize prior knowledge for this model. The arms' absolute scores include memorized knowledge.
7. **Sample.** N = 60 of 260, one seed. The per-type intervals are wide.
8. **Effort.** Neither arm sets effort; both use the Claude Code default for Opus 5.5. Jimmy's LSP was off (pilot default).

## Conclusion

On this sample, under a Claude judge, Jimmy scored **2.4 points lower** (CI −4.0 to −0.8) than plain Claude Code with Read/Grep/Glob, using the same model. The gap shrinks to about 1.2 points, but persists, when the two load-related timeouts are excluded post hoc.

Jimmy's research protocol (skills, captured sources, published records, result card) took about twice the wall time and tokens without improving judged answer quality on this benchmark. Both agentic arms clearly beat the no-tool probe.

## Re-measure: defect fixes and method change

This re-measure used the same frozen setup as above:
- the same 60 questions (seed 20261011);
- the same adapter bytes and web-tool guard;
- the same `claude-sonnet-5-5` judge (unchanged upstream prompt, blinded, shuffled, 3 runs);
- the same scoring and statistics.

The original Jimmy and baseline answers and scores were reused, not regenerated. Two new Jimmy arms were added, one attempt each:

| Arm | Branch | Change |
|---|---|---|
| **J-fix** | `jimmy-engine-friction` @ `4dfc7f6f27` | Per-action required fields in tool schemas (`research_record` `contrary`/`conditions`), plus bare and Claude-Code tool-name aliases. |
| **J-fix+depth** | `jimmy-friction-depth` @ `2aeeff55c2` | J-fix plus two `jimmy.txt` sentences: verify beyond the first confirming source; state verified claims directly, with structure. |

The contrasts, statistics and load control were pre-registered by hash before any sample run (private `FREEZE-v3.txt`, sha256 `d102526b…48f1`).

### Load control

- At most 2 Jimmy runs at once, and each run started only once the 1-minute load average was below 30.
- Start load had a median of 4.4 and a maximum of 29.2. No run started above the gate; one run waited 30 s.
- Time to first prompt had a median of 5 s and a maximum of 19 s, against a maximum of 660 s in the original run.
- **No timeouts** in either new arm. The original had 2.

### Scores

All scores are under the Claude judge, so they are not comparable to published numbers (see J2). Scale is 5–50; correctness + completeness ("C+C") is 2–20.

| Arm | Mean | 95% CI | C+C | What | Where | Why | How |
|---|---|---|---|---|---|---|---|
| Jimmy (original) | 39.18 | 37.41–40.95 | 15.19 | 37.42 | 39.91 | 37.84 | 41.07 |
| J-fix | 40.43 | 39.30–41.56 | 15.67 | 40.94 | 42.35 | 36.98 | 41.16 |
| J-fix+depth | 40.96 | 39.91–42.02 | 15.98 | 40.11 | 42.63 | 38.62 | 41.98 |
| Baseline (Claude Code, Read/Grep/Glob) | 41.58 | 40.57–42.59 | 16.29 | 41.36 | 42.72 | 38.91 | 43.04 |

### Pre-registered paired contrasts

Paired over the same 60 questions; 95% t CI with the finite-population correction; Wilcoxon signed-rank p-value.

| Contrast | Mean difference | 95% CI | Wilcoxon p | Wins / losses | C+C difference |
|---|---|---|---|---|---|
| J-fix − Jimmy (defect fixes) | +1.24 | −0.39 to 2.88 | 0.49 | 28 / 22 | +0.48 (−0.20 to 1.16) |
| J-fix+depth − J-fix (method) | **+0.53** | 0.13 to 0.94 | 0.035 | 32 / 19 | +0.31 (0.09 to 0.54) |
| J-fix − baseline | −1.15 | −1.68 to −0.62 | 0.0004 | 14 / 34 | −0.62 (−0.90 to −0.35) |
| J-fix+depth − baseline | **−0.62** | −1.10 to −0.14 | 0.032 | 14 / 29 | −0.31 (−0.58 to −0.04) |

- **The fixes.** Most of the +1.24 comes from removing the two load-related timeouts in the original arm. The original was run under host load ≈ 100 and these runs under load < 30, so fixes and load are confounded in this contrast. The per-item gain on answered questions is small and not significant.
- **The method change** is a small, significant improvement. It is concentrated in Why questions (+1.64, CI 0.75 to 2.54) and How questions (+0.82), with a slight loss on What (−0.83).
- **Plain Claude Code** still leads the best Jimmy arm, by 0.62 points.

### Mechanics per arm (60 runs each)

| Arm | `research_record` errors (runs) | "No such tool" errors | All tool errors | Provider calls, median (max) | Files read, median | Wall time, median (max) |
|---|---|---|---|---|---|---|
| Jimmy | 46 (24) | 4 | 55 | 6 (12) | 3.5 | 65 s (806 s) |
| J-fix | 9 (8) | 0 | 13 | 6 (9) | 4 | 51 s (99 s) |
| J-fix+depth | 4 (2) | 0 | 7 | 5 (10) | 4 | 49 s (112 s) |

- The schema errors (missing `contrary`/`conditions`) and the tool-name collision are gone.
- The remaining `research_record` errors are mostly JSON-escaping failures the client rejected before the call (10), plus "Source line range does not exist" (3).
- No arm came near the 24-call or 64-tool cap.
- The depth sentences did not increase exploration in calls or files.
