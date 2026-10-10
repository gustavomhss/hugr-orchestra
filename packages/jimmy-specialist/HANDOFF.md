# Jimmy final handoff — 2026-10-10

## Decision

**Feature implemented. Final main CI passed all 12 jobs. Qualification failed. Release acceptance BLOCKED.**

Final tested source: `fa00d95cb660de09ebbeffc0e1fafc9d02bb7e5c`.
Product tree: `a3ecd03c8e6078edda9cf81fc9844daf9b2663e5`. Branch `jimmy-delivery` adds documentation only to this tested source.
No feature readiness, superiority or method speedup claim.

## Research qualification

- Original v15 candidate `4df291b7e832385257eca092a475bb1db6d3082f`: 37 pass / 5 fail / 42.
- Original baseline: 30 pass / 9 fail / 3 unsupported / 42. All 84 trials and grades were retained in the original sealed ledger.
- Confirmation candidate `f8e276c20dc292369f9cf8958e4b3e1f049f4462`: 35 pass / 7 fail / 42 after v18 reconciliation.
- All 38 saved native returns have valid cold grades: 35 pass, three publication failures. No new native reruns.
- R05 rep3: declared-versus-verified provenance lost in completed parent answer.
- R08 rep1/rep2: material applicability qualification lost in completed parent answer.
- Four overall-budget failures lack native evaluation: one each in R11–R14.
- Sources were read/reopened and references checked in the three publication failures. Valid references do not prove semantic closure.
- Original grades and v17 inconclusive records retained; no best-of selection or replaced historical result.
- Loaded roster/worker hash: `9a00703e9ba953b12ae6bb03d5f5ce47dff0c1b7b63997a0b23183c6e97fb912`; `929cd402…` is historical.

Public evidence: [STUDY-CONFIRMATION.md, v17/v18](STUDY-CONFIRMATION.md). Temporary execution/evaluator directories are now unavailable; public reports were recovered from Git, and CI logs remain on GitHub. Raw private ledgers were not imported or recreated; backup availability is unverified.
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
| Production Chromium | [38027999108](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38027999108) | 28 passed, including English LTR/RTL and Arabic RTL |
| Final macOS Electron | [38028275423](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38028275423) | 3 passed, native Task/artifact bridge, typecheck and detecting cleanup controls |
| SDK/plugin build order | [38030580678](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38030580678) | 2 passed, real SDK generation then plugin compilation; removed-edge control rejected |

Exact scope/history: [IMPLEMENTATION.md](IMPLEMENTATION.md#current--final-evidence-checkpoint-2026-10-10).

## Full-main boundary

Latest full main [38030684084](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38030684084): **GREEN**, all 12 jobs successful.
Tested snapshot `86704ea0f4844f9b8099e54852c20befcd71f61f` matches the final product tree after excluding only `.ci-run.json`; altered-SHA control rejected. E2E: 469 passed, one existing fixme skip. Five Orchestra shards executed; Linux other-package Turbo completed 20 tasks with zero cached tests.
Coverage/auth/effect each executed 271 scenarios across 233 routes, with zero failure/missing/skip; all 13 research scenarios passed per mode.
All prior RED evidence remains in [EPIC-CONFIRMATION.md](EPIC-CONFIRMATION.md), followed by the final GREEN checkpoint. SDK regeneration now precedes plugin compilation; its destructive build proof runs in scoped CI rather than inside the concurrent unit suite.
Prior native `38022081085`, typecheck `38022083326`, Storybook `38022088731`, Nix `38022093645` passed on their prior exact source, not this final source.
Nix optional desktop-attribute warnings do not establish desktop build or feature qualification.

## Remaining acceptance boundary

The full main run does not execute specialized real-Electron cases or Windows E2E. Dedicated Linux/macOS Electron evidence above supplies its own scope. Ancillary native/typecheck/Storybook/Nix results retain their prior source identities. Mechanical success does not erase the failed model study.

## Performance and next fix

[Production benchmark](BASELINE-BENCHMARK.md): candidate median common-stream completion **1.410× slower**, descriptive only.
Machine equivalence and candidate installed dependency graph unknown; research render/open has no baseline counterpart.
Billing, billed/total native tokens and raw-read bytes unknown.

Next product fix: preserve general applicability qualifiers and declared-versus-verified provenance through publication and parent handoff, including resumed output.
Use admitted evidence and public failure classes, not private expected answers. Keep existing acceptance criteria and original records.
This handoff schedules no new model tests, architecture work, requirements or audit wave.
