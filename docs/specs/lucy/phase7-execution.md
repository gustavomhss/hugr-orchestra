# Phase 7 execution packet: compliance evidence

## Status and authority

Preparation only, not an implementation, legal opinion or test result. Authority: `build-plan.md:351-352,
759-774`, `design.md:172-181,192-200,290-308,387-396,1100-1118`; R21 in `build-plan.md:416`.
Baseline `750a23b8ed40af0ceef23f3323ae4910d470718a`; phase 6 and phase 5's real build lane are not
presumed landed. Ship small independent changes and one final campaign bundle/epic, not an epic per phase.

## G10 and G10L: exact boundaries

- **G10:** `lucy-audit-compliance-cyber`, `ai-act` and `accessibility-law` state only claims §14 marks
  verified. The following are human decisions or open questions, with no date, deadline or duty stated
  until the actual primary source is captured: CRA SBOM wording, 24-hour reporting deadline and disclosure
  contact duty; AI Act amending-regulation number, Art 50 paragraph dates and Art 19 retention; NIS2
  reporting clock; DORA entirely; EN 301 549; Data Act and DSA; SSDF practice tables and Scorecard.
- **G10L:** Conftest and ScanCode licences were undetermined (GitHub NOASSERTION); REUSE's was not
  captured. Pin none until each licence class is read from the upstream licence at the exact pinned version.
  OPA, Kyverno and ORT are recorded Apache-2.0; axe-core MPL-2.0. Recheck the upstream licence at each chosen
  pin and record evidence; unknown, missing or incompatible licence means not pinned/not run, never a pass.
- Do not upgrade indexed excerpts into captured primary sources. Phase-3 source map on branch
  `lucy-tree-author` at `e43c5668e6:docs/specs/lucy/privacy-sources.md` explicitly leaves full direct
  ePrivacy, UK GDPR and WP248 text unreadable and current law/local applicability unverified; California
  legislative full fetch also failed. Those gaps are not closed by this packet. Privacy sources, A10
  captures and future source acquisition are separate evidence work; unsupported facts remain questions.

## Candidate contract for lead freeze

- `compliance` is an open-string catalog profile for repository-scoped evidence against named regimes or
  frameworks. It uses the phase-6 host path, not a new orchestrator. A strict `ReviewResultV2.Card` can carry
  findings with evidence and confidence, questions, checks and coverage; `verdict` is optional but the
  parser only forbids it for blocked cards. Profile-specific host enforcement must forbid a merge verdict
  on both done and blocked compliance outcomes. A check's `pass` describes only that specific check, never
  overall compliance. Report evidence, findings, uncalibrated confidence and human-decision list only;
  never output an overall 'compliant' label, certification, legal determination or developer rating.
- The existing card rejects excess keys. Lead must freeze how named controls and human decisions map to
  existing fields or a strictly versioned extension, how report prose is validated at the host boundary,
  and how repository scope/time box and tool artifacts are bound. Do not silently add a `humanDecisions`
  key or assume a language prompt enforces the boundary. Decide how to distinguish a legitimate quoted
  source containing the word compliant from an overall conclusion without discarding source evidence.
- Findings require rule, location, concrete trigger and evidence; unsupported or unavailable evidence is
  a question/not examined. Human decides applicability, risk, conformity and attestation; tool failures,
  partial populations and missing manual accessibility checks cannot become a green overall determination.
- **Proposed no-build cohort**, not a pin freeze: OPA and Kyverno policy checks, ORT licence inventory,
  axe-core accessibility checks. Select specific supported versions, target artifacts, upstream licence
  and per-target integrity from real authoritative sources before authoring manifests. No fabricated
  checksums or inherited grants. Review is offline, no installation, no product writes; missing artifact or
  required runtime is `not-run`/`check-unavailable`, never install or claim a pass. If a tool cannot meet
  those lane constraints, explicitly defer it rather than pretend metadata executes it.

## Pipelined, conflict-disjoint work

1. **7A, compliance profile** (backend; depends on phase 6; execution that uses build lane depends on
   phase 5 actual implementation). Own profile and scope integration in
   `packages/core/src/review/catalog/entries.ts`, `packages/core/src/review/route.ts` as necessary and
   `modules/maestro/coordination/src/v2/workflow/review-fanout.ts` plus
   `.../governance/review-result.ts` only after the contract freeze. Surgical tests:
   `modules/maestro/coordination/test/v2-review-fanout.test.ts`, `.../test/lucy-review-result.test.ts`.
   Validate no verdict or receipt and actual report boundary on done, blocked and malformed replies.
2. **7B, compliance leaves** (prose; independently draft against verified §14, integrate after 7A):
   `packages/lucy-specialist/skills/lucy-audit/compliance/{cyber,ai-act,accessibility-law,licensing,evidence}/SKILL.md`.
   Preserve privacy and parent navigation; distinguish written source, inference, unexamined and human
   decision. No new legal claims from failed capture. Tests: maestro `test/seat-skills-build.test.ts`,
   `test/v2-skills.test.ts`; core `test/review/catalog.test.ts`, using real declared tree and catalog.
3. **7C, pack cohort** (backend; after 7A contract; independently inspect upstream licences/pins now):
   `packages/core/src/review-toolkit/packs/` and narrowly necessary analyzer/parser wiring under
   `packages/core/src/review-toolkit/`; catalog registrations belong to the 7A integration owner to avoid
   parallel edits to `entries.ts`. Tests: core `test/review-toolkit/packs.test.ts`,
   `test/review/catalog.test.ts`, and `test/review-toolkit/analyze.test.ts` where adapter execution lives.
   Partition tool adapters into small PRs with disjoint files; lead freezes each runner/normalized-result seam.
4. **7D, source capture and docs** (independent read-only preparation; documentation after actual behavior):
   capture full primary texts named in G10 and unresolved privacy map, with exact version/article, date,
   source and access failures. Missing source is an explicit blocker to the corresponding claim, not a
   reason to invent it. Update `docs/guides/review.md` and repo-only Lucy skills only when behavior lands;
   assign one documentation owner across phases to avoid conflict.

## Real acceptance oracles, not executed

- Compliance request yields only bounded evidence/findings/confidence/human decisions, with no merge verdict,
  overall compliance claim, developer score or receipt even if a model asserts them. Check malformed strict
  cards, a blocked request, quoted external language, ordinary code-profile controls and coverage omissions.
- G10: assert each named missing item is a question with no unsupported duty; a deliberately injected
  unsupported claim must be rejected by the chosen review/check mechanism, not merely omitted in fixtures.
  A separately sourced fact is not applicable to an organization until a human decides that question.
- G10L: inspect the actual upstream licence at every exact pin; fixtures for absent/unknown licences must
  refuse inclusion. No new integrity value without acquired, independently checked bytes.
- For **each actually included tool**, run the real pinned tool in its real supported lane in CI: a matching
  input and a benign nonmatch, plus malformed input/config and missing-binary controls. Verify actual
  invocation, exit/JSON or SARIF semantics, rule/location/version and retained raw evidence; metadata-only
  tests or fake executables cannot substitute. Policy checks use host-owned fixtures/rules, never untrusted
  repo configuration as authority. Never run on a live target or install during review.
- ORT must identify a known licence and surface an unknown/missing one; network-disabled operation and any
  required dependency metadata must be evidenced. axe-core must detect an actual rendered accessibility
  violation and not flag its fixed counterpart; browser/DOM availability and unautomated checks are explicit
  coverage, not whole-site accessibility proof. OPA/Kyverno require a violation and nonviolating control.
- Run change-scoped `bun run test:ci` for the named entrypoints and package `bun typecheck` at execution;
  the final campaign bundle/epic covers integrated seams once. No tests, builds, evaluations, local runtime
  changes or CI dispatch occurred while preparing this packet.
