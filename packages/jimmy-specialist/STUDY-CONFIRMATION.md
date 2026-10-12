# Candidate-only confirmation: bounded v17 checkpoint

Recovery note, 2026-10-10: this public report and its recorded seals were restored from Git after temporary execution/evaluator directories became unavailable. Ledger locations below describe the original evaluation, not currently available files. Raw private backup availability is unverified; private data was not imported or recreated. Historical trials, assessments and failure counts below remain unchanged.

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

## Appended grading reconciliation: v18

The original checkpoint above and its sealed ledger remain unchanged.
Grading reconciliation used saved immutable outputs only: no native task reruns,
candidate edits, acceptance edits or best-of selection. All 16 original
inconclusive records remain retained. Twelve new independent cold assessments
were appended with exact packet, original-grade and native-evaluation digests.
Two valid saved-output packet controls and a missing-evaluation rejection control
executed before model grading. The additional calls used at most six graders and
finished in 75436 ms, within the separately authorized ten-minute bound.

All 38 retained native task returns now have valid cold assessments:
35 passed and three failed closure. The four missing native evaluations remain
failures. Final scheduled-slot counts are 35 passed, seven failed, zero unknown;
this still does not meet the all-cases/three-repetitions acceptance requirement.

| Cases | Passed per case | Closure failures per case | Native failures per case |
| --- | ---: | ---: | ---: |
| R01–R04, R06–R07, R09–R10 | 3 | 0 | 0 |
| R05 | 2 | 1 | 0 |
| R08 | 1 | 2 | 0 |
| R11–R14 | 2 | 0 | 1 |

The three closure misses are completed-parent publication defects:
- R08 rep1: applicable source was captured and reopened; the completed answer
  still missed material applicability qualification. Six research records completed.
- R08 rep2: applicable source was read; other selected sources were reopened;
  the completed answer still missed applicability qualification. Seven records completed.
- R05 rep3: provenance source was read and reopened; the completed answer still
  failed the declared-versus-verified provenance boundary. Three records completed.
All three have parsed `discovery-work-result-v1` cards and checked references,
with no failed upstream stream. These are not demonstrated missing-read or
schema/receipt rejection failures. Valid references do not establish semantic closure.

The external supervisor root fix clears the losing fallback deadline timer;
its versioned repair was materialized without dispatching any native trial.
Owned diagnostic/model processes and proxy listeners were cleaned up.
Billing and total native token usage remain unknown.

Appended ledger: `jimmy-eval-private/grading-reconciliation-v18/ledger.json`.
Appended ledger SHA256: `19de3d80b6419e5036ce3ac4ffbb7c71396bdab6ee8842bde81b782abe37db20`.
Original v17 seal retained: `0e764bdd1cd548a112c55b8bbc6f69932bba6400193074eb8372286ab42a33ef`.
