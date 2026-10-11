# Jimmy frozen quality pilot: BLOCKED before admission

This records the predeclared 9-slot pilot (R05, R08, R14, three repetitions each) against the frozen candidate. The pilot is **BLOCKED**. The first provider request returned HTTP 429 (provider usage/rate limit). Under the pilot rules, zero slots were consumed. No model attempt was admitted, no slot was graded, and none was rerun. The other 33 slots remain held.

This file contains only identities, counts, classes and durations. Questions, answers, oracle text, rubric wording and grader reasoning stay in the evaluator's private ledgers.

## Identities (verified before launch)

| Item | Value | Verified |
|---|---|---|
| Candidate source | `jimmy-delivery` @ `594820460e8f8073a3665c98efa01f605a816417` | yes, clean checkout and clean runtime clone |
| Source tree | `3eea61b50e6a3e082ac6bcc557ed5cca18585802` | yes |
| Loaded roster/worker hash | `9a00703e9ba953b12ae6bb03d5f5ce47dff0c1b7b63997a0b23183c6e97fb912` | yes, via the real `rosterHash(roster)` |
| Calibration seal (v6, 70/70) | `8a754cd21e1207a73e5bf2ddcbd787847277e60ca21f227aa5176e65abdba260` | yes |
| Case version | `d797f5bc6857eaf20abbc28f3b609060f96439f121a246742a01a1687059d125` | yes, fresh 14-family / 42-slot roster |
| Model | `openai/gpt-6.1-sol`, read-only OAuth loan (expiry read only, no refresh) | yes |
| Trusted setup | `7e5b03a09b73c2450978bb603540fbb5a02d1dea9a04e933d4fa14dcc09c37cb` | yes |
| Candidate proxy | `6e66b363c2d4cdb6fa811b41f08cf399f58450bb974c88bd430e456b15b4be14` | yes, `idleTimeout:0`, `timeout:false` |
| Grader proxy | `cf127dc30f5d4e65fb1466fb48824e7cd4b139246a7b57528b2245aae7641549` | yes |
| Transport | `0327a1283b57069f1dc235b57a7cfff02a3dbd4d9aec5d8edeb791c8d05b4c9a` | yes, `timeout:false` and caller `AbortSignal` kept |
| Seatbelt producer | `f7337359f2f8aefad749734ffab40c871f2d89b3254105bcde9e07edcb81c92b` | yes, applied in every slot |
| Isolation follow-up record | `69584a9819ac5ffee7c2569ed43e9fb3186b0002b32783fe5529256ac928c83c` | yes; scanner clean/reject control re-fired |
| Model catalog | `409395a4a93df1daa9aa53212639118f18907269945299946aac56b2a43dd5b8` | yes |
| Disclosed inputs manifest | `e4765164343f809abb7cec28c9273cad535fcad88bebafe417c6b42183d29ce9` | yes |
| Native pilot / continuation / retained scripts | `f8b14b0b…`, `d9dd7be8…`, `e147ab3a…` | yes, unchanged since preparation seal |
| Pilot freeze | `93d426fe3303fffe650be3e60c65cc75b87e3c7bc44e368e9704899288092bca` | n/a |
| Generated driver (unchanged native pilot with confinement and phase meter) | `bff047ec00a09745cfdb638fbbe0094d6dc69b36144a5e0fa05dc31df16c137d` | n/a |

Budgets were frozen as before: 24 provider calls, 64 tool calls and 64 MiB per dispatch, with a 600 s maximum per dispatch. R14 gets two dispatches, with maintenance charged to the first.

## Per slot

| Slot | Status | Verdict | Public class |
|---|---|---|---|
| R14-rep1 | gate dispatch; first provider request returned 429 | not consumed | provider-quota (BLOCKED) |
| R14-rep2 | not launched | not consumed | provider-quota (BLOCKED) |
| R14-rep3 | not launched | not consumed | provider-quota (BLOCKED) |
| R05-rep1 | not launched | not consumed | provider-quota (BLOCKED) |
| R08-rep1 | not launched | not consumed | provider-quota (BLOCKED) |
| R05-rep2 | not launched | not consumed | provider-quota (BLOCKED) |
| R08-rep2 | not launched | not consumed | provider-quota (BLOCKED) |
| R05-rep3 | not launched | not consumed | provider-quota (BLOCKED) |
| R08-rep3 | not launched | not consumed | provider-quota (BLOCKED) |

## Per case

| Case | Graded | Pass | Fail | Inconclusive |
|---|---|---|---|---|
| R05 | 0/3 | 0 | 0 | 0 |
| R08 | 0/3 | 0 | 0 | 0 |
| R14 | 0/3 | 0 | 0 | 0 |

No quality conclusion is possible.

## Pre-admission infrastructure attempt (A)

Attempt A launched all nine slots, five at a time. Each slot was confined, but none created a native Session or made a provider request (0 provider requests in total). The cause was that `/usr/bin/git` is the xcrun shim. Under the seatbelt it cannot write its cache in the user temp directory, so instance provisioning stalled. The fix was infrastructure only: the real developer-tools `git` was put first on the slot's `PATH`. No source, criteria, budget or proxy changed. Diagnostics used a capability-denied proxy, so zero upstream requests were possible; they confirmed that R05 and R14 then reach dispatch under the seatbelt. Attempt A is retained privately and counts as no model attempt.

## Private ledgers (retained, not committed)

- Attempt B (BLOCKED): `68e4d71833560a7c4bf85e9e46c11da86565babce65451cad1e6b1adbed66dfa`
- Attempt A (pre-admission infrastructure): `b6a6cd695e4ca5b00ad21b4ebd0f2184eee16fa5e72cab583e7c517cfce466e5`

## Durations

- Materialization: under 1 min (single preparation run).
- Attempt A: 272.9 s from launch to stop, with 0 provider requests.
- Attempt B: 124.4 s from launch until the quota gate saw HTTP 429 on the first provider response. The run stopped at that point.
- Grading: none; no handoff existed to grade.

## Limitations

- Usage, billing and raw-read bytes are unknown and were not measured.
- The upstream 429 body was not persisted, so the reset time is unknown.
- This would have been a candidate-only system comparison. It makes no superiority claim and has no baseline rerun.
- The 33 remaining slots and any rerun of this pilot need the lead's decision once provider quota is available.
