# Jimmy final handoff — 2026-10-10

## Decision

**Feature implemented. Completed scoped mechanical checks passed within stated reach. Qualification failed. Release acceptance BLOCKED.**

Final source: `7f00a8bb6a035ed05405d0188b449aeab2a9060f`.
Last delta: three browser-test line replacements for translated Arabic labels.
No feature readiness, superiority or method speedup claim.

## Research qualification

- Original v15 candidate `4df291b7e832385257eca092a475bb1db6d3082f`: 37 pass / 5 fail / 42.
- Original baseline: 30 pass / 9 fail / 3 unsupported / 42. All 84 trials and grades preserved.
- Confirmation candidate `f8e276c20dc292369f9cf8958e4b3e1f049f4462`: 35 pass / 7 fail / 42 after v18 reconciliation.
- All 38 saved native returns have valid cold grades: 35 pass, three publication failures. No new native reruns.
- R05 rep3: declared-versus-verified provenance lost in completed parent answer.
- R08 rep1/rep2: material applicability qualification lost in completed parent answer.
- Four overall-budget failures lack native evaluation: one each in R11–R14.
- Sources were read/reopened and references checked in the three publication failures. Valid references do not prove semantic closure.
- Original grades and v17 inconclusive records retained; no best-of selection or replaced historical result.
- Loaded roster/worker hash: `9a00703e9ba953b12ae6bb03d5f5ce47dff0c1b7b63997a0b23183c6e97fb912`; `929cd402…` is historical.

Public external evidence: [STUDY-CONFIRMATION.md, v17/v18](../../../jimmy-study-lane/packages/jimmy-specialist/STUDY-CONFIRMATION.md).
Current [qualification](QUALIFICATION.md), [charter](CHARTER.md), [delivery](DELIVERY.md).

## Completed mechanical evidence

| Scope | Run | Actual result |
| --- | --- | --- |
| Repaired native controls | [38015590391](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38015590391) | 126 pass per OS: Linux, Windows, macOS |
| Core | [38024639488](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38024639488) | 22 pass per OS: Linux, Windows, macOS |
| App parity | [38025246533](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025246533) | 5 pass per OS: Linux, Windows |
| Client | [38025246237](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025246237) | 13 pass per OS: Linux, Windows, macOS |
| Codegen | [38014205713](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38014205713) | 67 pass, Linux; old-producer [38013811655](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38013811655): seven detecting failures |
| Permission/deadline | [38023867171](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38023867171) | 41 pass per OS: Linux, Windows; mutant [38023900771](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38023900771) retained |
| Bounded-log desktop | [38025429218](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025429218) | Linux 3 pass, actual guard proof + typecheck + cleanup controls; whole workflow RED from unsupported Windows |

Exact scope/history: [IMPLEMENTATION.md](IMPLEMENTATION.md#current--final-evidence-checkpoint-2026-10-10).

## Full-main boundary

Latest full main [38026385329](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38026385329): **RED**, 11 successful jobs / one failed.
E2E: 468 pass / one fail / one skip. Failure: stale English-fallback expectation after Arabic translation.
Coverage/auth/effect each executed 271 scenarios across 233 routes, with zero failure/missing/skip; all 13 research scenarios passed per mode.
All prior RED evidence remains in [EPIC-CONFIRMATION.md](../../../jimmy-epic-proof/EPIC-CONFIRMATION.md), including the latest append.
Prior native `38022081085`, typecheck `38022083326`, Storybook `38022088731`, Nix `38022093645` passed on their prior exact source, not this final source.
Nix optional desktop-attribute warnings do not establish desktop build or feature qualification.

## Two final lead updates — no pass claimed

| Lane | Actual-run marker | State at handoff | Lead completion evidence required |
| --- | --- | --- | --- |
| Production Chromium after three-line localization fix | `PENDING_ACTUAL_RUN_PRODUCTION_28` | RUNNING; 28-case scope, result pending | Actual run URL, tested SHA, completed 28-case result and skips/failures |
| Final bounded-log desktop, macOS | `PENDING_ACTUAL_RUN_MACOS_DESKTOP` | RUNNING; result pending | Actual run URL, tested SHA, proof/typecheck/cleanup evidence and controls |

Lead replaces these two markers only after completed actual evidence. Scoped passes do not change the recorded full-main RED or failed study.

## Performance and next fix

[Production benchmark](BASELINE-BENCHMARK.md): candidate median common-stream completion **1.410× slower**, descriptive only.
Machine equivalence and candidate installed dependency graph unknown; research render/open has no baseline counterpart.
Billing, billed/total native tokens and raw-read bytes unknown.

Next product fix: preserve general applicability qualifiers and declared-versus-verified provenance through publication and parent handoff, including resumed output.
Use admitted evidence and public failure classes, not private expected answers. Keep existing acceptance criteria and original records.
This handoff schedules no new model tests, architecture work, requirements or audit wave.
