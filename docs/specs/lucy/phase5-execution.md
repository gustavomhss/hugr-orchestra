# Phase 5 execution readiness — proposal, not implementation

Baseline `750a23b8ed40af0ceef23f3323ae4910d470718a`; authority is approved
`build-plan.md:705-735` and its referenced decisions. No phase-5 API, schema,
catalog contract, language pack, concurrency design or implementation is frozen
by this packet. All design choices below are proposals for lead approval.
Phase 5.1 waits for the final phase-4 language catalog and pack contracts; phase
5.3 depends on phase 1 and can be cut independently. Do not implement on this
baseline or assume phase 4 has landed. This is preparation only.

## Observed seams and constraints

- `packages/core/src/review-toolkit/analyze.ts:155-164` orders no-build, repo,
  build by requested lane, dispatches pinned gitleaks and repo gates, and refuses
  other packs as `not-built`. Lane eligibility is not a build implementation.
  `scanned` runs head/base with separate raw artifacts, refuses unavailable base,
  and sends normalized results through new-only processing. `gates` takes declared
  gates from base, runs in head scratch, checks `trusted`, and labels workspace
  execution. `check` currently derives the label from pack lane even on refusal:
  resolve attempted-versus-actual semantics with the lead before changing it.
- `review-toolkit/probe.ts` owns offered-option admission, repeat/per-candidate
  caps and a private one-permit review probe semaphore; closed `BUILT` includes
  regress/test/typecheck/script only. `execute` assumes its non-special final
  branch is regress: adding identifiers without dispatch changes is unsafe.
  Regress mutates and restores the scratch snapshot, not the worktree.
- Actual runner planner is `research-toolkit/probe/runners.ts`, not a
  `review-toolkit/probe/runners.ts`: `ProbeRunners.plan` resolves real paths
  within snapshot, fixes argv, and selects a closed runner; it can run workspace
  configuration. It is not a general arbitrary-command API.
- `ToolSafetySandbox.confine` denies network, restricts writes to explicit
  physical paths plus fresh scratch, and fails closed if unavailable; `analyze`
  and `probe` execute through `ResearchProcess`. Writable copy grants and output
  paths must be checked against its cwd/realpath restriction. The original
  worktree is never an allowable build output destination.
- D6: opened project is trusted, external/due-diligence is off unless owner
  explicitly enables that review. R8 is a low host cap on concurrent children
  and probes under catalog maxima, card records counts; current probe semaphore is
  module-private, so sharing with builds/children is not established. R19 honors
  R8 and R2: for this repository cite `typecheck.yml`, not heavy local runs;
  unavailable lanes are recorded under owner-approved settings, not silently
  green. Do not equate sandboxing with D6 authorization.

## Stage A — small backend build lane (5.1)

Depends on phase 4's final language detection, packs, templates, license and
version contracts. Proposal: choose one smallest host-owned typecheck pack first;
freeze supported language, binary source, argv, parser, copy/write locations,
timeout/RSS/output budgets, trust provenance, result semantics and cap sharing
with the lead before authoring. Typed lint and API/semver diff packs are required
by 5.1; one pilot alone is not phase completion. Establish whether comparison
needs both snapshots; never treat a missing base as a clean comparison.

No-build requests must not launch build or repo code even when selected; build
requires explicit lane plus D6 authorization and sandbox. Report check outcomes,
version and `workspaceExecuted` consistently; distinguish refusal, missing tool,
failed analysis, acquisition failure and valid findings. No installation during
review. The exact public interface and any `workspaceExecuted` semantics are
lead choices, not established by this document.

Future CI oracle: `bun run test:ci core test/review-toolkit/analyze.test.ts test/review-toolkit/build-lane.test.ts`.
Use a real minimal trusted fixture and real installed tool in CI: clean and
planted type error should differ, with actual confined invocation and copy hash
checks. Negative controls: untrusted external target with attempted side-effect
marker; no-build lane with same marker; missing tool; denied sandbox; timeout;
out-of-copy write/network attempt; valid explicit owner opt-in. Verify no marker
or original-worktree modification, plus explicit not-run reason. Fake binaries may
exercise unusual failures, not demonstrate tool or sandbox conformance.

## Stage B — Deep probe options (5.2)

Depends on 5.1. Proposal: extend host option-to-runner mapping deliberately,
retain candidate/option authorization and closed argv; define per-language
capabilities from the final catalog. Mutants target changed lines only;
interleave requires a gated test; race exists only for a declared detector;
property/fuzzing is time-boxed with all writes confined to scratch copy. The
existing `write: []` probe jail cannot simply be assumed to permit a fuzzer to
write its corpus into the copy: agree a narrow grant and restoration policy.
Preserve per-candidate attempts, repeat, cancellation, busy and host caps.

Future CI oracle: `bun run test:ci core test/review-toolkit/probe.test.ts test/review/catalog.test.ts`.
Real language/tool fixtures: planted mutant killed vs surviving, scheduled race
exposed vs synchronized control, available race detector vs unsupported language,
property counterexample vs invariant-preserving input. Negative controls: option
not offered, unchanged-line mutant, missing detector, deadline, sandbox denial,
outside-copy write, cancellation and snapshot restoration. Check actual evidence,
artifact and `not-run` reasons; fake runner tests are not proof of detection.

## Stage C — read-only LSP diagnostics (5.3)

Observed public `LSP.Interface.diagnostics()` at `packages/core/src/lsp/lsp.ts:127,350`
aggregates already-present client diagnostic maps; it does not itself open a
file, request a fresh result, or establish a snapshot boundary. `touchFile` at
`:126,330` calls `notify.open` and can wait for document/full diagnostics;
`client.ts` handles push/pull state. `lsp/launch.ts:157` has confined launching.
No new public function name is assumed or frozen. Lead must choose whether and
how a fresh, scoped, non-mutating diagnostic call uses these seams, isolates
workspace/config execution and reports absent server, stale data and jail failure.
Read-only refers to product files, not a claim that server execution is inert.

Identified existing tests: `packages/core/test/lsp-stdio.test.ts` exercises
`LSP.Service` connection with `test/fixture/lsp-stdio-server.js`, and
`packages/core/test/config/lsp.test.ts` covers LSP config; connection is not
diagnostics or confinement proof. Proposal: add
`packages/core/test/lsp-diagnostics-readonly.test.ts` and name it in CI.
Future oracle: `bun run test:ci core test/lsp-stdio.test.ts test/config/lsp.test.ts test/lsp-diagnostics-readonly.test.ts`.
Real confined fixture server emits a known diagnostic for an opened document;
verify exact path/range/message and no product-file mutation. Negative controls:
no diagnostics vs diagnostic, stale prior document/version, unsupported file,
server absent/timeout, sandbox unavailable and attempted outside-write/network.
Protocol fixture proves transport and confinement, not language-server semantic
correctness; include a real installed language-server fixture when available.
Neither a server nor LSP was invoked in this readiness investigation.

## Stage D — Deep execution and release profile (5.4–5.6)

Depends on 5.1 and 5.2. Route up to eight distinct lenses, two independent passes
per selected lens with reordered diff, merge agreement, up to ten verifiers,
and blast-radius location in noise; remove only the R3 Deep-to-Standard fallback
when these capabilities exist. Release covers provenance, signing, updater,
SBOM and notes. Trees and documentation are also required, not optional add-ons.
Lead must decide agreement identity, reorder algorithm/seed, count reporting and
partial-run handling before any interface freeze; no invented agreement semantics.

Future CI oracles: `bun run test:ci maestro test/v2-review-fanout.test.ts test/v2-workflow-review.test.ts`;
`bun run test:ci core test/review/route.test.ts test/review-toolkit/noise.test.ts`;
`bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts`;
`bun run test:ci core test/review/catalog.test.ts`.
Exercise actual request, child delivery and merged card: two different orderings,
agreeing and disagreeing planted candidates, verifier cap, blast-radius included
vs unrelated location, release coverage, no silent fallback. Negatives: one
sample missing, duplicate same sample counted as agreement, above-cap children,
unavailable build/probe and omitted release component. Confirm partial coverage
and reasons rather than fabricating a successful Deep run.

## Integration conflicts and decision gates

Likely shared files across A/B/D: `review/catalog/entries.ts`,
`review-toolkit/analyze.ts`, `probe.ts`, `review/route.ts`, noise and their tests;
maestro fanout/workflow and runtime skill trees also overlap D. Stage C owns only
the LSP read path plus its tests unless the lead explicitly settles an interface.
Coordinate phase-4 catalog landing, serialize overlapping edits, and run seam
tests against the integrated real registry and runtime. Small backend PRs and
change-scoped CI precede one final bundled epic; no phase-5 code is authorized
here. Tests, build, typecheck, generators, evaluation and CI are unexecuted.
