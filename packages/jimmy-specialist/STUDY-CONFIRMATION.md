# Candidate-only confirmation: bounded v17 checkpoint

This is a candidate-only confirmation, not a new paired baseline study or a
superiority claim. All 42 slots were predeclared: R01–R14, three repetitions.

Source: `f8e276c20dc292369f9cf8958e4b3e1f049f4462`.
Tree: `bd9e2822a5485031c7ab5030aaa2c5aa5c4c174e`.
Actual loaded roster: `9a00703e9ba953b12ae6bb03d5f5ce47dff0c1b7b63997a0b23183c6e97fb912`.
Model: `openai/gpt-6.1-sol`. Maximum concurrent trial/grading workers: six.
Dispatch cap: 600 seconds; R14 retains two dispatches and first-dispatch maintenance charges.
Original inputs, private rubrics, thresholds and 52 closed source controls were retained.

## Bounded outcome

The 40-minute admission/execution window ended with 42 retained slot records:
38 native task returns and four slots without a final native evaluation.
There were 26 valid fresh cold assessments: 23 passed, three failed closure.
Sixteen outcomes remain grading-inconclusive. Acceptance is incomplete.

| Case | Passed | Failed closure | Inconclusive |
| --- | ---: | ---: | ---: |
| R01 | 2 | 0 | 1 |
| R02 | 2 | 0 | 1 |
| R03 | 2 | 0 | 1 |
| R04 | 2 | 0 | 1 |
| R05 | 1 | 1 | 1 |
| R06 | 2 | 0 | 1 |
| R07 | 3 | 0 | 0 |
| R08 | 0 | 2 | 1 |
| R09 | 2 | 0 | 1 |
| R10 | 1 | 0 | 2 |
| R11 | 1 | 0 | 2 |
| R12 | 1 | 0 | 2 |
| R13 | 2 | 0 | 1 |
| R14 | 2 | 0 | 1 |

External infrastructure findings: completed supervisors retained deadline timers;
only completed owned supervisors with an absent native PID were released.
Private packet projection had a syntax error before any grader model call for
ten slots. Original inconclusive records were preserved; no native trial was rerun.
Final slots/grading reached the overall budget. No best-of selection or averaging
was applied, and none of the original 84 v15 trials or grades was replaced.

Transport SHA256: `96c19c88e1707e78a21c64340ed616d22b8e58aee06f8dfe5f9a809c9f7cda83`.
Proxy SHA256: `ec137968bf7975d69dbdfb751fdbed5c2ac9415d8f3c44695acdb76da290a254`.
Transport freeze SHA256: `277f7ae97798391498855f34b9abf04b8cf98db02e040eb8858bb840a4febdcb`.
Sealed ledger SHA256: `0e764bdd1cd548a112c55b8bbc6f69932bba6400193074eb8372286ab42a33ef`.

Ledger remains in the external evaluator lane at
`jimmy-eval-private/candidate-confirmation-v17/ledger.json`.
Trial billing, billed tokens and raw-read bytes remain unknown.
This report contains counts, identities and mechanical failure classes only.
