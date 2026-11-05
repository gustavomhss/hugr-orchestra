# Lucy parallel construction wave

## Owner direction and baseline

The owner authorized six `xai/grok-4.7` tasks and four `openai/gpt-6.1-terra`
tasks. Both model IDs were resolved through the active model catalog, not guessed.
Each task has its own worktree and branch at the exact common baseline
`750a23b8ed40af0ceef23f3323ae4910d470718a`.

The owner's newer CI direction supersedes the original per-phase epic cadence:
open small reviewable PRs, run surgical checks for their changed paths, then bundle
all campaign work and run one final epic. Do not run an epic per PR, correction,
or phase. This does not authorize merging #1290, restarting the app/server,
running Atlas genesis, local heavy checks, or evaluations/benchmarks.

Construction is parallel; public contracts, review, CI dispatch and integration
remain lead-owned. Preparing later-phase branches does not establish that their
prerequisites have landed. Small dependent PRs must use an explicit predecessor
or campaign base, avoiding repeated copies of the whole phase-1 diff. The final
integration bundle carries the complete change for its final epic.

## Frozen ownership and dispatches

Worktrees below live under the approved session temporary directory. Context
ceilings bound each task's working set; no runtime enforcement is claimed.

| Task | Model | Branch / worktree | Write ownership | Context ceiling |
| --- | --- | --- | --- | --- |
| G1: dependency shadow | Grok 4.7 | `lucy-graph-build` / `lucy-wave-g1` | Snapshot materialization, new dependency helper, scratch resolution; scratch-copy and new graph tests | 70K |
| G2: phase-3 catalog | Grok 4.7 | `lucy-catalog-build` / `lucy-wave-g2` | Catalog entries/new phase-3 data module; existing catalog/route tests | 60K |
| G3: ast-grep | Grok 4.7 | `lucy-astgrep-build` / `lucy-wave-g3` | Analyzer, normalizer, own ast-grep adapter; analyzer/new conformance tests | 70K |
| G4: read-only Own | Grok 4.7 | `lucy-atlas-build` / `lucy-wave-g4` | Atlas reader/tool; native read-only grants if necessary; Atlas/new read tests | 60K |
| G5: delayed undo | Grok 4.7 | `lucy-undo-tests` / `lucy-wave-g5` | Cancellation test additions only; no production writes | 45K |
| G6: acceptance spine | Grok 4.7 | `lucy-phase3-tests` / `lucy-wave-g6` | New phase-3 catalog/tree and scope acceptance tests only | 45K |
| T1: runtime tree prose | GPT-6.1 Terra | `lucy-tree-author` / `lucy-wave-t1` | Approved phase-3 lens/audit privacy/PR skill prose only | 80K |
| T2: plain PR contract | GPT-6.1 Terra | `lucy-pr-contract` / `lucy-wave-t2` | New phase-3 PR execution packet; no runtime code | 60K |
| T3: languages packet | GPT-6.1 Terra | `lucy-language-plan` / `lucy-wave-t3` | Phase-4 execution/source packets only | 70K |
| T4: cold suite critic / Deep readiness | GPT-6.1 Terra | `lucy-wave-critic` / `lucy-wave-t4` | Independent phase-3 acceptance critique and phase-5 readiness packet only | 70K |

The corresponding task sessions are:

- G1 `ses_e570649feffeiRKTwUAVwfRH7S`.
- G2 `ses_e5705fa93ffe8RJ1CzHTmZAUgX`.
- G3 `ses_e5705a4d5ffevVaBcRt1NBXoJt`.
- G4 `ses_e5705584dffeRN23lrqZUvBAgp`.
- G5 `ses_e5705128effevnN76v6yUyYnrs`.
- G6 `ses_e5704cb12ffe4UazgsO6eJnAS6`.
- T1 `ses_e57046a67ffeqEJjxxZal5MKVj`.
- T2 `ses_e57041e37ffeU44O6R0nByvAsa`.
- T3 `ses_e5703d4f3ffecwFXfVh5McuJNJ`.
- T4 `ses_e570382ebffeLCkg3wzrfp09Ky`.

No automatic Relay stop hook has been established for these tasks. Reports and
commits are recoverable work, not verification. Each author must push only its own
branch early, stage files explicitly, and return a compact evidence card. The lead
opens PRs, dispatches CI, reads the complete diff and verifies negative controls.

## Acceptance and cross-task seams

- **D1, G1:** direct and transitive dependency resolution reads reviewed base/head
  rather than dirty live workspace code; host writes exclude shared dependency
  roots. Missing targets, bounds, escapes, loader limitations, `.bin` behavior,
  Windows refusal and cleanup follow the final dependency packet at `121f772394`.
- **C1, G2:** exact phase-3 catalog IDs, class/node/options and pinned rule mapping;
  seven overlays with binding-path/content-only/unrelated controls; deterministic
  routing, existing budgets and Deep fallback remain intact.
- **A1, G3:** actual pinned ast-grep controls distinguish matching, benign,
  comment/string lookalikes and acquisition errors; hostile repository config is
  ignored; head/base filtering and raw evidence retention use the actual analyzer.
- **O1, G4:** native Lucy catalog/unit reads and fresh Own checks work without
  anchor, memory, header or resume authority; held sources stay explicit. Grant
  integration into lead/lens scopes is pending the T2 contract and lead decision.
- **U1, G5:** actual undo cancellation cannot release the permit before restoration;
  the test must have a deterministic bad-release control, not timing sleeps.
- **S1, G6:** independent hard-coded contract assertions and the actual authored
  tree express the demand. Tests may remain intentionally RED until G2/T1 land;
  no fake production tree, skipped criterion or weakened checker is allowed.
- **K1, T1:** authored skills use the stable IDs in `de3254b1a1`, progressive
  disclosure and actual evidence requirements. Privacy is not full compliance.
- **P1, T2:** plain PR review returns a card without a governed receipt or posting;
  the exact request/grant seam must be accepted before backend implementation.
- **L1, T3:** language/advisory/precision slices have primary-source-backed tool
  facts, frozen minimal contracts and named red acceptance cases before dispatch.
- **B1, T4:** an independent critic refutes missing phase-3 acceptance; Deep
  readiness identifies actual build/probe/LSP seams without implementing them.

G2 and G3 share metadata, not files: pack `ast-grep`, template
`ast-grep-scan-json`, parser `ast-grep`, rules `lucy-js-eval` and `lucy-ts-eval`,
security boundary class, P2/probation, pinned version 0.45.3. G3 owns the actual
adapter and parser; G2 owns catalog declarations. T1 consumes G2's frozen IDs,
while G6 checks the actual combined catalog/tree. G4 must not edit fan-out or the
governed review tool; T2 proposes that seam separately to prevent collisions.

The phase-3 overlay proposal is frozen for this wave. Its performance overlay
routes both `correctness-performance` and `correctness-resources`; cleanup signals
remain content suggestions, not binding path evidence. Other mappings follow the
packet. Profile `pr` metadata follows code-stage risk routing; metadata alone is
not an implemented plain PR workflow.

## Integration and proof order

1. Verify and integrate phase-1 repairs, dependency isolation and cancellation
   tests through small PRs with change-scoped checks. Preserve the queue phase.
2. Capture G6's named RED cases, resolve T4's critique, then combine G2/G3/T1 at
   their frozen seams; verify actual catalog/tree and binary behavior remotely.
3. Accept T2's minimal PR/scope contract, dispatch its backend slice immediately,
   integrate G4's native read boundary and complete scoped access acceptance.
4. Review T3/T4 packets and dispatch the next ready backend slices while earlier
   PRs undergo surgical checks. Do not wait for a landing merely to prepare work.
5. Once all campaign code is closed, assemble the final PR bundle, run one epic,
   account for every selected lane, and seek any still-required owner approval.

No task may run local tests, typechecks, builds, generators, evaluations or
benchmarks; dispatch CI, merge, force-push, alter spawn allowlists or gate budgets;
run genesis; or restart/kill app/server/other-session processes. Small PRs and
parallel work change throughput, not these constraints or the evidence standard.

## Rolling follow-ups

Completed sessions are reused rather than spawning beyond the authorized fleet.
These additional ownership assignments remain isolated from the original writers:

- T2 authored card-only fanout completion `65392d429c`, then a standalone card
  validator on `lucy-card-validation`. The latter is not wired into the request
  tool; lead and cold review found omission, status and identity bypasses and
  requested corrections before runtime acceptance. Its pure validator owns only
  `workflow/review-card.ts` and `test/lucy-review-card.test.ts`.
- T3 authored the pack-license schema boundary on `lucy-pack-license`
  (`1e53ca023d`), owning `catalog/index.ts` and a new license test. G2 still owns
  catalog data and existing tests, so these writes are disjoint.
- T4 authored only the stronger inode control (`aa387f4b24`), after independent
  review of the original fixture. This adds same-jail hardlink identity/read and
  alias-chmod positive controls, not a production sandbox change.
- T1 captured privacy evidence limits (`e43c5668e6`), persisted phase-6/7 execution
  candidates, then authored phase-6 audit/artifact skill prose on a separate
  `lucy-audit-tree` branch. Future prose is not phase-6 host behavior.
- G4's grant follow-up `fa980c9303` owns `review/seat-tools.ts`, the review floor in
  `roster.ts`, and its native/scope tests. It does not edit the fanout. The common
  read set is separate from lead's Atlas read; verifier must not inherit lead.
- G5's delayed-undo test `6a99d681ef` is held after cold review found its proposed
  scheduler-based negative control could pass. It is not accepted as closure.
  G5 next authors only new actual dependency probe integration tests on
  `lucy-dependency-probes`, without touching G1's graph or scratch-copy files.
- G2 correction `052ddff074` restores the original real-tree checker and exact
  class citation assertions. No TODO or synthetic flat-node substitute may replace
  them. The actual combined tree/catalog seam still needs remote execution.
- G3's first adapter delivery is being repackaged into three small stacked units:
  pack/parser units, real pinned-binary conformance, then analyzer integration.
  Canonical verified-artifact setup is authorized only as isolated remote test-host
  provisioning before a review; production `locate` remains status-only.
- G6's acceptance spine `cb0405c561` is authored, not executed. It is deliberately
  incomplete without the separate analyzer, plain PR, real scope and privacy-source
  criteria. An intentionally RED spine must be captured before combined acceptance.

Lead-verified surgical evidence now includes card-only fanout run `41939128598`
(nine tests in its changed test file), exact-head Maestro typecheck `41938574280`,
and the deliberate receipt-filter failure `41938742180`. The strengthened inode
control executed separately on Linux `41939461225` and macOS `41939989712`.
The lead read full control logs, matched the test-source SHA-256, and compared
uploaded source path/mode/blob maps to the frozen candidate commits, excluding only
the CI request. A deliberately changed known entry calibrated that comparison.
These are scoped proofs, not a final epic or universal sandbox certification.
