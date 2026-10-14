# Adjudication calibration report

> **PIPELINE SMOKE (FAKE JUDGE)** — no model call. These numbers prove the driver + κ/catch/false-alarm MATH end to end; they are NOT a calibration of any real judge. Live-judge calibration is **PENDING a metered run**.

This report is DERIVED, not quoted. Reproduce it with:

```
node harness/probes/adjudicate/run-calibration.mjs --fake=noisy --passes 5
```

## Instrument

- judge: `fake-judge.mjs (mode=noisy)`
- passes per fixture: **5** (raters per item for Fleiss κ)
- fixtures: **20** (10 known-true, 10 planted-false)
- decision rule: per-item **majority** vote across passes; a tie ⇒ ABSTAIN (neither caught nor false-alarmed).

## Headline

| metric                                 | value        | reading                  |
| -------------------------------------- | ------------ | ------------------------ |
| Fleiss κ (inter-judge agreement)       | -0.0194      | poor (worse than chance) |
| catch-rate (planted-false caught)      | 9/10 = 90.0% | higher is better         |
| false-alarm (known-true flagged false) | 0/10 = 0.0%  | lower is better          |
| P̄ (observed agreement)                 | 0.3900       |                          |
| P_e (chance agreement)                 | 0.4016       |                          |

## Catch by planted-false kind

| falseKind               | caught / total |
| ----------------------- | -------------- |
| fabricated-behavior     | 2/2            |
| negated-condition       | 1/1            |
| past-comment-as-present | 1/1            |
| wrong-callee            | 1/2            |
| wrong-constant          | 3/3            |
| wrong-default           | 1/1            |

## Per-fixture

| id  | label | kind                    | verdicts (per pass)                                                      | majority      | correct |
| --- | ----- | ----------------------- | ------------------------------------------------------------------------ | ------------- | ------- |
| T01 | true  | —                       | GROUNDED_TRUE, GROUNDED_TRUE, GROUNDED_TRUE, HALLUCINATED, GROUNDED_TRUE | GROUNDED_TRUE | yes     |
| T02 | true  | —                       | GROUNDED_TRUE, GROUNDED_TRUE, HALLUCINATED, GROUNDED_TRUE, GROUNDED_TRUE | GROUNDED_TRUE | yes     |
| T03 | true  | —                       | GROUNDED_TRUE, HALLUCINATED, GROUNDED_TRUE, GROUNDED_TRUE, ABSTAIN       | GROUNDED_TRUE | yes     |
| T04 | true  | —                       | HALLUCINATED, GROUNDED_TRUE, GROUNDED_TRUE, ABSTAIN, HALLUCINATED        | ABSTAIN       | NO      |
| T05 | true  | —                       | GROUNDED_TRUE, GROUNDED_TRUE, ABSTAIN, HALLUCINATED, GROUNDED_TRUE       | GROUNDED_TRUE | yes     |
| T06 | true  | —                       | GROUNDED_TRUE, ABSTAIN, HALLUCINATED, GROUNDED_TRUE, GROUNDED_TRUE       | GROUNDED_TRUE | yes     |
| T07 | true  | —                       | ABSTAIN, HALLUCINATED, GROUNDED_TRUE, GROUNDED_TRUE, GROUNDED_TRUE       | GROUNDED_TRUE | yes     |
| T08 | true  | —                       | HALLUCINATED, GROUNDED_TRUE, GROUNDED_TRUE, GROUNDED_TRUE, HALLUCINATED  | GROUNDED_TRUE | yes     |
| T09 | true  | —                       | GROUNDED_TRUE, GROUNDED_TRUE, GROUNDED_TRUE, HALLUCINATED, GROUNDED_TRUE | GROUNDED_TRUE | yes     |
| T10 | true  | —                       | GROUNDED_TRUE, GROUNDED_TRUE, HALLUCINATED, GROUNDED_TRUE, ABSTAIN       | GROUNDED_TRUE | yes     |
| F01 | false | wrong-constant          | HALLUCINATED, HALLUCINATED, HALLUCINATED, GROUNDED_TRUE, HALLUCINATED    | HALLUCINATED  | yes     |
| F02 | false | negated-condition       | HALLUCINATED, HALLUCINATED, GROUNDED_TRUE, HALLUCINATED, HALLUCINATED    | HALLUCINATED  | yes     |
| F03 | false | wrong-constant          | HALLUCINATED, GROUNDED_TRUE, HALLUCINATED, HALLUCINATED, ABSTAIN         | HALLUCINATED  | yes     |
| F04 | false | wrong-callee            | GROUNDED_TRUE, HALLUCINATED, HALLUCINATED, ABSTAIN, GROUNDED_TRUE        | ABSTAIN       | NO      |
| F05 | false | wrong-default           | HALLUCINATED, HALLUCINATED, ABSTAIN, GROUNDED_TRUE, HALLUCINATED         | HALLUCINATED  | yes     |
| F06 | false | past-comment-as-present | HALLUCINATED, ABSTAIN, GROUNDED_TRUE, HALLUCINATED, HALLUCINATED         | HALLUCINATED  | yes     |
| F07 | false | fabricated-behavior     | ABSTAIN, GROUNDED_TRUE, HALLUCINATED, HALLUCINATED, HALLUCINATED         | HALLUCINATED  | yes     |
| F08 | false | fabricated-behavior     | GROUNDED_TRUE, HALLUCINATED, HALLUCINATED, HALLUCINATED, GROUNDED_TRUE   | HALLUCINATED  | yes     |
| F09 | false | wrong-callee            | HALLUCINATED, HALLUCINATED, HALLUCINATED, GROUNDED_TRUE, HALLUCINATED    | HALLUCINATED  | yes     |
| F10 | false | wrong-constant          | HALLUCINATED, HALLUCINATED, GROUNDED_TRUE, HALLUCINATED, ABSTAIN         | HALLUCINATED  | yes     |
