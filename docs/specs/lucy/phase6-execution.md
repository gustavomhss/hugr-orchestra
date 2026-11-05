# Phase 6 execution packet: audit, diligence and artifact

## Status and authority

Preparation only; no implementation, acceptance or test is claimed. Authority: `build-plan.md:737-757`,
`design.md:164-181,192-200,290-308,688-695,888-903`, and R20 in `build-plan.md:415`.
Baseline `750a23b8ed40af0ceef23f3323ae4910d470718a`; phase 5 is not presumed landed. Small,
independently reviewable PRs; one final campaign bundle/epic, not an epic per phase.

## Observed seams and candidate contract

- `ReviewRoute.Request` has plan/code stage and open profile strings validated against the catalog;
  `route` consumes file trees and changes. New repository scope cannot be assumed to work by adding an ID.
- `ReviewResultV2.Card` is strict; `outcome` is `done` or `blocked`, `verdict` optional, with findings,
  questions, checks, coverage, handoffs, blockers, risks and nextActions. Blocked forbids verdict, but the
  existing parser does not enforce profile-specific no-verdict behavior. Finding includes rule, location,
  trigger, evidence, status, severity and confidence. Do not add unrecognized card keys as if they work.
- `ReviewFanoutV2.Input` is diff/work-card oriented; `Port.analyze` retains a URI and totals, and
  `firstRound` carries card plus reviewed identity. Its host scopes sessions, orchestrates existing entry,
  lens and verifier stages and treats change/author output as data. Do not invent a second orchestrator.
- **Candidate freeze for lead approval:** `audit` and `diligence` are catalog profiles with repository or
  subsystem scope and brief-defined time box. They return a report and a K2 card with no merge verdict,
  no governed receipt, and explicit examined/not-examined coverage. Host rejects or removes any model-
  supplied merge verdict before it reaches a consumer; a prompt alone cannot enforce this invariant.
- Preserve existing P0–P3 mapping to audit material weakness/significant deficiency/deficiency/observation
  and DD deal-breaker/price or structure/condition or remediation/observation. Confidence is uncalibrated
  and tied to evidence kind; security difficulty is separate from severity. No developer rating.
- `audit` variant work starts from a confirmed seed; match it before generalizing one element per
  generation. Host enforces at most three generations and stops when **more than half** of matches are
  noise. Record count, stop reason and coverage; exactly half is not the stop threshold.
- Fix review binds a stable finding ID, original reviewed revision and its actual evidence kind and
  reproduction input to the proposed fix revision. Replay that evidence against the fix; mark resolved only
  if the original trigger no longer fires on that evidence. Missing, refused or unrepeatable evidence is
  question/not examined, never resolved. A quoted finding rechecks its actual quoted path and guards, not
  a generic successful test; evidence of dismissal includes the accepted reason.
- `artifact` is a Standard merge-verdict profile over prompts, skills, playbooks, tool descriptions or evals.
  R20: use quote/tool evidence only for behavioral-safety concerns; list `behavioural eval` as not
  examined, reason `owner-permission`. Never claim behavior-safe from static evidence. Reject a mismatched
  artifact scope. This is not the analyzer's retained raw artifact URI or governed code artifact binding.

## Lead decisions before dependent code

Freeze repository request/scope and time-box representation, exact catalog stage mapping, and how the
strict existing card carries audit report and DD mapping without undocumented extra fields. Decide where
variant match/noise classification, generation state and immutable fix-replay inputs live and how replay
selects the original allowed evidence; resolve quote/tool/probe availability and unsafe/unavailable cases.
Freeze artifact profile routing and the scope-specific node grants. These are cross-WP integration choices,
not new owner architecture questions; do not implement parallel incompatible representations.

## Disjoint, pipelined work packages

1. **6A, profile host/route** (backend; after phase 5 real build lane): catalog entries and route/routing
   changes in `packages/core/src/review/{catalog/entries.ts,route.ts,routing.ts}` as needed; repository
   acquisition and no-verdict enforcement in `modules/maestro/coordination/src/v2/workflow/review-fanout.ts`
   and `.../governance/review-result.ts` only where strict compatibility needs it. Tests:
   `packages/core/test/review/route.test.ts`, `modules/maestro/coordination/test/v2-review-fanout.test.ts`,
   `.../test/lucy-review-result.test.ts`. Host output must not settle a governed review or emit a receipt.
2. **6B, audit trees** (prose; prepare independently, land after 6A): under
   `packages/lucy-specialist/skills/lucy-audit/`, author `context`, `variant`, `spec-map`, `diligence`,
   `forensics`, `controls`, `report`; preserve existing privacy subtree. Map six spec statuses, whole-
   population versus judgment sampling, scoped evidence quality and human-only diligence. SLSA/SSDF only
   per verified §14; ISO/SOC 2 wording is inferred, Scorecard practice details not captured. Tests:
   `modules/maestro/coordination/test/{seat-skills-build,v2-skills}.test.ts`,
   `packages/core/test/review/catalog.test.ts` against the actual catalog/tree seam.
3. **6C, artifact profile** (backend plus disjoint prose): profile wiring in catalog and fanout; author only
   `packages/lucy-specialist/skills/lucy-review/artifact/SKILL.md` and
   `packages/lucy-specialist/skills/lucy-lens/security/agents/SKILL.md`. Depends on 6A and frozen scope
   contract; R20 is host-enforced. Tests `test/v2-review-fanout.test.ts`, `test/v2-skills.test.ts` in
   maestro and `test/review/catalog.test.ts` in core. Integrate profile/catalog/tree together.
4. **6D, user documentation** after actual behavior is known: `docs/guides/review.md` and repo-only Lucy
   usage/maintenance skills per build plan; one owner to avoid overlapping edits.

## Acceptance controls, not executed

- Repository-only input with a real time box runs; no delta is required. Out-of-scope and time exhaustion are
  visible coverage; an absent required tool is not a pass. Hostile PR text cannot narrow scope or add authority.
- Inject a verdict into otherwise valid audit/diligence output: consumer gets no merge verdict or receipt.
  Check strict malformed/excess-field cards and blocked output separately. Verify normal code verdicts remain.
- Seeded variant finds a real sibling; no seed yields no search; four requested generations cannot run;
  half noise continues, greater than half stops. Count actual reviewed matches, not fabricated metadata.
- Real finding replay fails on unfixed tree and succeeds only after fix; unrelated green, changed evidence,
  unavailable tool and wrong revision cannot resolve it. Check retained evidence identity and coverage.
- Artifact static quote/tool finding survives; a behavior-safety claim and a model-requested evaluation do not
  bypass R20. Report the exact not-examined reason. Include a non-artifact request control.
- Run only change-scoped `bun run test:ci` entrypoints above and package `bun typecheck` at execution time;
  final campaign integration/epic runs once after phase dependencies and real-tree seams close. No local tests
  or CI dispatch were performed in preparing this packet.
