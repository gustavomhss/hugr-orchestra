# Lucy resumption checkpoint — 2026-11-28

This checkpoint reconciles the accepted completion mandate with repository evidence.
It is not the final GO receipt. The current work remains the approved
[go-live plan](go-live-plan.md), its [29-row coverage matrix](go-live-coverage.md)
and the [83 original tool requirements](q1-qualification-ledger.md).
The owner reconfirmed the remaining work: A05/forensics, compliance, tool
qualification and integrated acceptance.

## Source and continuity

The first audit fixed `dev` at `ff7f50b591494aba05b3c917379d633cc2d7176e`.
PR #1676 was still open then, and merged while the audit ran.
The Lucy implementation snapshot is now `c585d7ae79e676f2aca89bf86aa8770cf03a1468`,
tree `1f53aff8a01e0a36e55e3fd93b8671693b70db99`.
The current integration base is `c3ed848aef3c0883097eb8611bbd8eb1090f41f1`,
tree `11102f54cfa93ff72c2c896fadb08392fb1a5ef3`.
The later activity/Omni changes are preserved; final tests must use the integrated source.

| PR | Preserved delivery | Merge |
| --- | --- | --- |
| [#1599](https://github.com/gustavomhss/hugr-orchestra/pull/1599) | PR source and Git index lifetimes | `0be747d7284a536851e52e25e73c618557f99f19` |
| [#1600](https://github.com/gustavomhss/hugr-orchestra/pull/1600) | Public CODE tools bound to captured source | `b1877953cd4a3915c1bab27e93607dff329c7477` |
| [#1605](https://github.com/gustavomhss/hugr-orchestra/pull/1605) | Independent audit, diligence and artifact engagements | `5b2c840975e40d23467c47aa3a79ae5028cbd79d` |
| [#1618](https://github.com/gustavomhss/hugr-orchestra/pull/1618) | Durable engagement evidence and replay | `66371f666132cfa78006b50fc98cdc7800c2e044` |
| [#1643](https://github.com/gustavomhss/hugr-orchestra/pull/1643) | Honest binary-search coverage | `66cfef285979adee36168e62010e8788f510db3d` |
| [#1652](https://github.com/gustavomhss/hugr-orchestra/pull/1652) | Native audit variant generations | `2a9a60c0695e6bae5aaccf02000179307632faec` |
| [#1670](https://github.com/gustavomhss/hugr-orchestra/pull/1670) | Durable fix review, retained predecessor evidence | `4e43316f403b49557b5986236cc9e16ca2011fc6` |
| [#1676](https://github.com/gustavomhss/hugr-orchestra/pull/1676) | Scoped TypeScript probe and retest on Linux x64 | `c585d7ae79e676f2aca89bf86aa8770cf03a1468` |

PR #1667 is the historical frozen fix-review acceptance packet, consumed by #1670.
Its open draft status and old description must not restart that implementation.
PR #1666 remains the frozen Kubeconform P1 packet; its HEAD
`d33df82e28cbce4d3fc0133623ab151e3a05317b` contains contract/data/tests,
not production implementation. PR #1646 is retained measurement.

## Remaining acceptance work

These are implementation and reconciliation states, not final acceptance closure.
Every G-C/G-E row still needs its own exact integrated evidence.

| ID | Current evidence and next work |
| --- | --- |
| A01 | Separate Maestro-only request exists in #1605. Preserve public authorization, request isolation and governed/PR contracts in final regression. |
| A02 | Source-bound reports and durable replay exist in #1605/#1618. Preserve verdict refusal, byte identity, honest coverage and evidence integrity. |
| A03 | Host deadline/cancellation and audit variants exist in #1605/#1652. Preserve at most three generations, half-noise stop and zero diligence/artifact variants. |
| A04 | #1670 retests retained evidence; #1676 adds one closed TypeScript probe on Linux x64. Reconcile the remaining required analyze/probe reach and resource limits; do not generalize this qualification to other platforms or runners. |
| A05 | Implement a separately confined Git-history route bound to captured source/file authority, and complete profile-specific skill reachability. Preserve R20 owner permission, inferred ISO/SOC 2 labels and off-route refusal. |
| C01 | Public `compliance` still fails `engagement-profile-unavailable`. Deliver evidence/findings/confidence/human decisions through the operational engagement flow, without certification or developer scores. |
| C02 | Prove audit/compliance leaves in the right Session scopes and production CLI/Desktop artifacts. Reuse existing content. |
| C03 | Qualify real OPA, Kyverno, ORT and axe-core invocations, positive/negative fixtures, output binding and missing/unsafe prerequisite outcomes. |
| T01 | Reconcile all 83 original requirements by actual form and capability. Close each through qualified delivery or an explicit owner scope decision. Account for Conftest, ScanCode and REUSE constraints. |
| T02 | Reuse analyzer/build/probe/index/LSP foundations only with public-path proof for the named capability. Preserve SCIP, Pyright and Kubeconform's actual existing scope. |
| T03 | Qualify identity, configuration, licensing/distribution, platform, preparation boundary and bounded retained output. No install or network during review. Complete Kubeconform preparation before its separate analysis qualification. |
| O01 | Run integrated preservation of plan/code/re-review/PR/release, tiers, precision and old receipt replay. |
| O02 | Attach named hosted public setup/request/report/fix-review/denial/interruption/retry cases, including source/cache mutation boundaries. |
| O03 | Inspect real CLI/Desktop prompts, skills and resources at the candidate SHA; align setup, diagnostics, guide and rollback with the declared platform matrix. |
| O04 | Obtain authenticated independent Grok adversarial review and exact-source package types, guards, boundaries, spawn checks and one final full hosted epic. Keep unavailable reviewer access explicit. |

## Kubeconform P1 continuation

[The frozen PR #1666](https://github.com/gustavomhss/hugr-orchestra/pull/1666)
has qualified RED2: [Core](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46116123812)
and [Maestro](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46116125740).
The continuation preserves those acceptance files and adds only:

1. Explicit preparation through `maestro_prepare_review_checks`, retaining the
   Maestro gate, once permission, call provenance, deduplication/order and two-tool bound.
2. The measured 0.8.0 archive/executable identities and all 19 notice origins;
   content-derived private Linux x64 preparation with a real bounded version probe
   and integrity checks before and after it.
3. Active refusal on unqualified hosts; unchanged completed global installs;
   absent or modified notices refused without silent repair.
4. Host-only `acquire: false` in ordinary and endpoint sandbox selection,
   used by local reads without starting, retrying, waiting for or cancelling
   separately owned acquisition. Preserve default reacquisition controls.
5. Hosted focused GREEN, preparation/read regressions, independent source review
   and serial integration with current `dev`.

Analyzer/catalog dispatch, schema policy, compliance output, new evidence producers,
receipt versions, release and redistribution clearance are separate qualification.
Preparation alone cannot close Kubeconform's analysis row.

## Evidence corrections retained

- The #1670 [broad matrix](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46156144311)
  failed on fixture timeouts. The [corrective focused matrix](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46157003721)
  passed all ten cases on all three hosts. Reconciliation by exact test name
  establishes 53 passing cases on Linux and 52 plus one native-only skip on each
  of macOS/Windows. This is not a single all-green broad workflow.
- The historical [fix-review RED](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46116584161)
  included a Windows F6 timeout. Do not describe all 27 Windows failures as
  demonstrated assertion-level behavior failures.
- The [Q1 ledger](q1-qualification-ledger.md) records source research. Its old
  zero-runtime sentence describes that research batch; it does not erase later
  qualified shfmt/cargo-machete delivery. Libraries, components, plugins and
  converters retain their real forms.
- Old `completion-plan.md` status prose and [#1558](https://github.com/gustavomhss/hugr-orchestra/issues/1558)
  must be reconciled with later merges. Old wave epics do not close final Lucy GO.

## Operating boundaries

Preserve the existing approved exclusions: GitHub/GitLab output, MCP pack bridges,
Lucy Atlas Memory, scored evaluations/ablations, per-project budget overrides and
Interface-owned card rendering. Runtime tests run only in GitHub Actions. New
behavior needs compilable frozen tests and causal assertion RED before implementation.
Use isolated write sets and serial integration; do not rewrite accepted work.
Release publication, promotion and owner app/server restart require separate approval.
