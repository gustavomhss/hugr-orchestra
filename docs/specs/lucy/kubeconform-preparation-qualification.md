# Kubeconform P1 — observed preparation qualification

Status: focused P1 qualified. This is not Kubernetes analysis, compliance, redistribution clearance or final Lucy GO.

## Scope and immutable source

Production source: `c6a16ad8165d1152a2815e2f3a6582243ca0aa6c`, tree `48c652aa5f540a6dd4bf4ace0e3a35537501b74c`.
It integrates dev `8bd743bdb0ace333a700d010c4ad61022bbc03fb` through merge
`38e56c6c849b5cf3ba28c9f0c2e8178cff0d3031`. The seven frozen predecessor
contract/data/test files remain byte-identical to `d33df82e28cbce4d3fc0133623ab151e3a05317b`.
See the [frozen contract](kubeconform-preparation-contract.md) and
[PR #1666](https://github.com/gustavomhss/hugr-orchestra/pull/1666).

The qualified behavior is explicit Linux x64 preparation through the existing
Maestro tool, pinned executable and all 19 origin-preserving notices, a bounded
real version probe, private cache identity, and no acquisition in local reads.
Old completed global installs remain byte-identical and fail closed when required
notices are absent or modified. The user guide describes this compatibility choice.

## Causal predecessor

The corrected RED2 source is `d33df82e28cbce4d3fc0133623ab151e3a05317b`.
[Core RED2](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46116123812)
and [Maestro RED2](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46116125740)
passed package types and reached the intended assertions after real controls.
The historical RED1 notice-filename setup failure was corrected and is not
misclassified as causal behavior failure. No frozen TypeScript assertion changed.

## Hosted GREEN and preservation

Every row below passed its package typecheck, declared Omni control and tests.
There were no test skips, failing tests or delegated spawns. Cleanup succeeded
for all four workflows. Counts describe executions per host, not distinct
campaign requirements.

| Gate | Host | Run / job | Pass | Assertions | Omni spawns |
| --- | --- | --- | ---: | ---: | ---: |
| core | Linux x64 | [46164949485](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164949485/job/141040295610) | 9 | 313 | 10 |
| core | macOS ARM64 | [46164949485](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164949485/job/141040295631) | 5 | 86 | 3 |
| core | Windows x64 | [46164949485](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164949485/job/141040295418) | 5 | 86 | 3 |
| maestro | Linux x64 | [46165129953](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46165129953/job/141040844587) | 6 | 303 | 175 |
| maestro | macOS ARM64 | [46165129953](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46165129953/job/141040844851) | 6 | 48 | 148 |
| maestro | Windows x64 | [46165129953](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46165129953/job/141040844877) | 6 | 48 | 108 |
| preservation | Linux x64 | [46165199326](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46165199326/job/141041069204) | 22 | 618 | 279 |
| preservation | Windows x64 | [46165202534](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46165202534/job/141041079041) | 19 | 492 | 147 |

| Snapshot | Source-equivalent scope |
| --- | --- |
| `0528ba089e65340903cf5b886691059bacd664d4` | Core acceptance, all three hosts |
| `6d2e56b7677b4c2fd577106a23bf59dea4d74973` | Maestro acceptance, all three hosts |
| `176ea433108c35d9998e41ae94ac31467bb860e3` | Linux preparation/conformance/read/sandbox preservation |
| `d79083b5c3a015106f0f48c3b46791ed6be9afa9` | Windows preparation/read/AppContainer preservation |

GitHub comparisons show that each snapshot is a direct child of the production
source and changes only `.ci-run.json` and an additive package typecheck step.
Production and test bytes are unchanged in every snapshot. No local test,
probe, build or package typecheck ran.

The first Maestro GREEN request used an incorrect package selector and
[run 46164953193](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164953193)
stopped at request validation on all hosts, before package types or tests.
Only the request was corrected to the canonical `packages/maestro` selector;
its actual working directory remains `modules/maestro/coordination`.
The successful run above does not relabel that setup failure.

## What the evidence establishes

- Linux public preparation exercised real explicit-once permission, denial with
  no cache write, the Maestro seat gate, input bounds, duplicate/order handling,
  mixed shfmt/Kubeconform preparation, missing sandbox refusal and executable
  mutation after the native version return.
- Core exercised fresh installation with all measured notices, unchanged old
  global installs, notice mutation, default sandbox reacquisition, opt-out on
  both ordinary and endpoint selections, and refusal while another owner was
  acquiring without interfering with that acquisition.
- macOS and Windows exercised active public preparation/read refusals and
  distribution/notice integrity. They did not execute a qualified Kubeconform
  analysis or public preparation success.
- Existing Linux shfmt/cargo-machete conformance and read confinement passed.
  Windows real tool preparation and AppContainer behavior passed. The specific
  new `acquire:false` AppContainer policy-failure fallback was corrected and
  independently source-reviewed; the frozen packet does not directly exercise
  that exact fallback branch.

Root and an independent reviewer confirmed the seven production files, five
executable identities and all 19 notice origins against the independent fixture.
Review caught and corrected the second AppContainer unconfined fallback while
preserving default behavior. Production guards and the Atlas own-snapshot guard
passed on the tested source.

## Still open

Analyzer/catalog dispatch, Kubernetes schema policy, output normalization,
retained analyzer proof, positive and seeded-negative manifest analysis,
compliance integration and final integrated platform/artifact acceptance remain
separate work. Required transitive notices are retained; this document makes
no license-closure or redistribution decision. P1 does not close the 83-tool
Kubeconform qualification row.
