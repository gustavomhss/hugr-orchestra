# Lucy final go-live campaign

Status: plan approved by two independent authenticated Grok reviewers on 2026-11-13. This is approval of the campaign, not a claim that its runtime acceptance has passed.

Baseline: `e46de97b6090ae82b813a8f955ac3b4fc5ec04de` on `dev`. Work runs in the isolated `lucy-go-live` branch. The owner's canonical checkout, app and server are preserved.

## Goal and scope

Deliver the approved Lucy design capabilities C1–C16 and framework extensions E1–E13 as working, qualified user flows. Completion follows [the coverage matrix](go-live-coverage.md), not a count of new tool adapters. Every required row needs production code, reachable shipped knowledge, a concrete acceptance observation and exact hosted evidence.

The existing approved deferrals in [build-plan §1](build-plan.md) remain explicit: GitHub/GitLab output, MCP pack bridges, Atlas Memory, scored evaluations and ablations, project budget overrides, and card rendering owned by the Interface workstream. Everything else must be delivered or receive an explicit owner scope decision. A missing tool, unread fact, source constraint or unavailable result does not cancel a requirement.

The [83-tool ledger](q1-qualification-ledger.md) is completed source research. Its entries include CLIs, compiler components, plugins, libraries, converters and metapackages. It is neither 83 interchangeable new executables nor proof that those capabilities are available at runtime. Each row retains its actual form and requirements through qualification.

## Deliveries already accepted

Preserve governed plan/code review, re-review, standalone PR review, routing and receipts, scoped tools/skills, precision accounting, existing native analyzers, jscpd, offline cargo-audit/RustSec, the qualified Deep/probe/release delivery, .NET/Swift detection, and the completed shfmt/cargo-machete wave. Their prior evidence is recorded in [the completion ledger](completion-plan.md). The local-check wave ended in [PR #1585](https://github.com/gustavomhss/hugr-orchestra/pull/1585), with [56/56 jobs in its full epic](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43395393800); that result qualifies that bounded wave, not this final campaign. Final regression verifies their continued behavior; it does not manufacture a new RED baseline for existing features.

Existing SCIP index producers/query/cache and the head-only Deep consumer, Pyright's LSP registration, and kubeconform provisioning are foundations to reuse. A proposed historical-index extension is a separate behavior, not evidence that SCIP was absent. Names such as PMD's CPD and jscpd, or TypeScript's tsgo and tsgolint, must not be conflated.

## Acceptance spine

| ID | Required terminal observation |
| --- | --- |
| A01 | Maestro accepts a separate engagement request without a validation ID; other seats cannot invoke it; governed and PR requests keep their contracts. |
| A02 | Audit, diligence and artifact produce a strict report bound to host source/scope/evidence. Any verdict field is rejected, including APPROVE. No report becomes a governed receipt on retry. |
| A03 | The host enforces the requested time box and cancellation. Expiry records unexamined work without a partial verdict. Audit permits at most three variant generations and stops at half noise; diligence/artifact have zero variants. |
| A04 | Fix review reloads the stored report/finding/evidence identity, runs the existing analyze/probe mechanism, and records disposition. It cannot run an arbitrary supplied command or install/fetch tools. |
| A05 | Existing context, variant, spec-map, diligence, forensics, controls, report, artifact and security/agents leaves are reachable only in appropriate Session scopes. ISO/SOC 2 remains labelled inferred; R20 behavioral evaluation is not examined without owner permission. |
| C01 | Compliance routes through the operational engagement flow and returns evidence, findings, confidence and human decisions, without certification or developer scores. |
| C02 | Required audit/compliance leaves are reachable in the correct scopes and embedded in production CLI and desktop artifacts. Existing leaf content is reused; missing reachability is not solved by rewriting the tree. |
| C03 | OPA, Kyverno, ORT and axe-core each have a qualified invocation/backend/platform with actual positive and seeded-negative proof, output binding and explicit unsafe/missing-prerequisite outcomes. |
| T01 | All 83 names have an accurate requirement/form/mechanism/invocation/platform/proof row. Every required row closes through qualified delivery or an explicit existing owner scope disposition, never through research completion or unavailability alone. |
| T02 | Existing analyzer, repo/build/probe, index and LSP mechanisms are reused only where actual public-path proof establishes the named capability. |
| T03 | Each admitted tool has verified identity, configuration and distribution constraints, a preparation/analysis boundary, the correct execution lane and bounded retained output. Review never installs or accesses the network. |
| O01 | Governed plan/code/re-review, PR, release, tiers, precision accounting and old receipt replay pass final integrated regression. |
| O02 | Named hosted tests exercise the public setup/request/report/fix-review/denial/interruption/retry flows, including honest coverage and source/cache mutation boundaries. |
| O03 | Hosted production packaging tests inspect CLI embedded prompts/skills and desktop sidecar/resources. The user guide, setup, diagnostics and rollback instructions match the artifact and platform matrix. |
| O04 | Independent adversarial Grok review, package types, guards, boundaries, spawn checks and one final full hosted epic pass on the exact integrated source. No required acceptance row remains pending. |

The coverage matrix gives C1–C16 and E1–E13 their own G-IDs and concrete observations. Compound A/C/T/O rows are expanded into named tests and atomic work packages before source authors are dispatched. Test targets and old greens are not terminal proof.

## Sequence and ownership

1. **Reconcile and freeze.** Preserve previous deliveries and incomplete drafts separately. Establish the exact source baseline, coverage matrix and per-tool facts. The lead chooses interfaces, invocation contracts, execution lanes and platform claims.
2. **Operational engagements.** Complete the request, immutable source capture, report, durable retention/retry, host time box, variant control and fix review. Reuse existing card-only fan-out and Session execution rather than introducing a second agent loop. The shared request/route/fan-out integration has one lead-owned editor.
3. **Compliance.** The operational compliance profile depends on the accepted engagement contract and flow. Its source/artifact qualification may proceed beside engagement work, but each feature author waits for its own frozen contract and acceptance gate. Preserve Conftest, ScanCode and REUSE's actual invoke/distribution constraints; they are not silently cut.
4. **Language and tool coverage.** Process the 83 rows by actual mechanism and dependency. Source extraction is parallel; architectural decisions stay with the lead. A tool may reuse a proven existing runner without gaining a redundant adapter. No unknown binary inherits the researched version, and no pack is enabled by metadata alone.
5. **Integrated readiness.** Exercise all required profiles, package the production artifacts, finish operating documentation, perform adversarial review and run the final full epic. Fix observed failures and qualify the corrected source before merging.

First implementation package: a cohesive engagement input/policy/report contract, consumed by later request/controller/compliance packages. It owns `review-engagement-policy.ts` and its dedicated tests. It establishes safe request bounds, host budget calculation, variant limits, report verdict refusal/R20 and exact audit/DD severity mappings. It is not claimed to implement the public engagement flow by itself.

Every dependent package receives compilable frozen interfaces and an immutable acceptance suite. New behavior must reach named assertion-level hosted RED after types pass. Import/type/setup failures are not RED evidence. Existing behavior is tested as a regression control, not deliberately broken.

## Execution and gates

Use authenticated Grok for preparation, tests, implementation and independent reviews. Run at most four nontrivial authors and one critic beside the lead, with disjoint write sets. The lead keeps architecture, acceptance judgment and serial integration. Relay hook wiring remains unverified; deterministic scope commands and root verification are explicit gates.

Consolidate a cohesive behavior and its tests into a reviewable PR. Shared registries, request unions, routes, prompts and generated output are integrated serially. Do not repeat the previous cascade of tiny infrastructure PRs or rerun a global suite for every unit.

The package gate includes Maestro coordination, Core catalog/review-toolkit/packs, the Lucy specialist tree, the CLI binary and desktop Node sidecar, plus affected Session/engine boundaries. Tests run only through hosted `bun run test:ci`; type checks use `bun typecheck` from package directories. Resource failures are reported as failures, never green. Before completion run `check:guards --base origin/dev`, module boundaries and spawn checks, and obtain independent cold review of the exact source.

Run the full epic once at final readiness; repeat only when failures or subsequent fixes require it. Merge serially under the owner's existing approval to merge after genuine green and independent review. Preserve unrelated `dev` changes.

## Ready-for-go-live receipt

The final receipt binds the source SHA/tree, all acceptance results, per-tool proof matrix, declared platform matrix, packaged artifact identities, adversarial review, user documentation and rollback recipe. Unsupported or absent prerequisites remain visible to users; those states are not positive qualification.

A wave boundary, a twelve-hour slice, a completed research ledger or an agent report is not campaign completion. The full accepted matrix must be closed. No date or percentage substitutes for that evidence.

Preparation and qualification are authorized now. Readiness does not authorize an agent to restart the owner's app/server or publish a release. Any required activation step is presented only after the concrete artifacts and verification are ready. The optional observed live proof remains separate from deferred scored evaluations.
