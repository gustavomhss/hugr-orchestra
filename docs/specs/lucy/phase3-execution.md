# Phase 3 execution packet: lenses and overlays

## Status and authority

- Planning baseline: `b2d9515222dabe3678eef3a376a7d3b066ac64c7` (HEAD verified).
- This packet records planning, not completed implementation or a test result.
- Authority: owner-approved `build-plan.md:627-666`; no architecture reopening.
- **Fact** means observed at baseline; **Lead freeze** is the execution target accepted by the lead;
  **Proposal** remains an implementation detail for the lead to settle, not an owner architecture question.
- The first slice is backend WP 3.1: catalog entries and working ast-grep integration.
- Preparation is READY; execution/landing must honor the dependencies below.

## Facts that constrain the slice

- Phase-1 catalog, route and skill trees already exist at baseline; this is not genesis.
- Catalog IDs are open strings validated against the registry, not closed schema enums
  (`packages/core/src/review/catalog/index.ts:9-14`).
- Overlay paths bind; added-line content only suggests; PR prose cannot remove routing
  (`packages/core/src/review/route.ts:9-13,182-230`).
- Analyzer dispatch currently knows pinned gitleaks and repo gates, not ast-grep
  (`packages/core/src/review-toolkit/analyze.ts:155-170`). Metadata alone cannot build WP 3.1.
- Existing ast-grep pin is 0.45.3, MIT, with target-specific integrity values
  (`packages/core/src/backend-toolkit/packs/ast-grep.ts:5-53`). Reuse the artifact, not backend grants.
- Real-tree checking requires declared nodes and rejects unreachable lens/proof nodes
  (`packages/core/src/review/catalog/index.ts:298-325`).

## Lead freeze: stable cross-author contract

Preserve existing IDs, classes, `adequacy`, `secrets`, budgets and Deep-to-Standard fallback.
Node IDs are skill directory segments joined by `-`; each directory contains `SKILL.md`.
The following table is the immutable target for this bundle; a change requires lead coordination.

| Catalog lens ID | Delivered node ID | New classes raised |
|---|---|---|
| `correctness-resources` | `lucy-lens-correctness-resources` | `resources.lifetime` |
| `correctness-performance` | `lucy-lens-correctness-performance` | `performance.cost` |
| `contracts` | `lucy-lens-contracts` | `contracts.api`, `contracts.semver`, `contracts.data`, `contracts.third-party`, `contracts.ipc` |
| `security` (existing) | `lucy-lens-security` | `security.supply-chain`, `security.ci`, `security.infra` |
| `change` | `lucy-lens-change` | `change.structure`, `change.history`, `change.merge`, `change.provenance`, `change.health` |
| `experience` | `lucy-lens-experience` | `experience.interaction`, `experience.a11y`, `experience.visual`, `experience.content` |
| `privacy` | `lucy-audit-compliance-privacy` | `privacy.processing` |

- Security retains `security.boundary` and `security.secret`; new child skills do not create extra lens passes.
- Resources/performance classes use proof node `lucy-review-prove-regress`.
- Other new classes use `lucy-review-prove-quote`.
- New classes offer `* = [quote, probe:test, probe:script]`, with a class-specific statement of what each proves.
- `security.boundary` offers `[quote, tool:ast-grep, probe:test]`; add option `tool:ast-grep`, rung `tool`, cost `low`.
- Existing test classes `tests.missing` and `tests.weak-oracle` serve the new tests children.
- No new proof techniques, build lane, class schema or provider protocol are part of this slice.

### Tree-author target

All paths below are relative to `packages/lucy-specialist/skills/`:

- `lucy-lens/correctness/{resources,performance}`.
- `lucy-lens/tests/{oracles,smells,flaky,strategy}`; retain `adequacy`.
- `lucy-lens/contracts` with children `{api,semver,data,third-party,ipc}`.
- `lucy-lens/security/{boundaries,supply-chain,ci,infra}`; retain `secrets` and the security handoff.
- `lucy-lens/change` with children `{structure,history,merge,provenance,health}`.
- `lucy-lens/experience` with children `{interaction,a11y,visual,content}`.
- `lucy-audit` with its final root body, only `compliance` and `compliance/privacy` below it in phase 3.
- WP 3.4 additionally authors `lucy-review/pr`, node `lucy-review-pr`; it is not required for the WP 3.1 slice.
- Finders explain how to look, never how to prove; cite catalog IDs, not commands.
  Root/group bodies stay about 300 tokens, leaves about 2,000; retain progressive disclosure
  (`design.md:594-667`; `build-plan.md:589-595,637-653`).

## Lead freeze: initial ast-grep pack

- Pack ID `ast-grep`; version 0.45.3 and integrity values sourced from the unchanged backend manifest.
- Lucy owns its manifest fit, host invocation and structural rules; never borrow backend seat authority.
- Template ID `ast-grep-scan-json`; JSON parser ID `ast-grep`; no-build lane, Standard/Deep, offline,
  no product writes, probation. Installation is host setup, never an operation performed by a review.
- Rules `lucy-js-eval` (JavaScript) and `lucy-ts-eval` (TypeScript), pattern `eval($$$ARGS)`;
  each maps to class `security.boundary`, lens `security`, P2, probation.
- Triage: direct eval is a candidate only with a quoted untrusted-input trigger; a structural hit alone
  neither proves exploitability nor confirms a probation finding (`design.md:697-698`).
- Invoke only host-owned rules, not repository-provided config/rules; no rewrites.
- **Built acceptance requires real pinned-binary conformance:** malicious/matching, benign/nonmatching,
  comment/string lookalikes and invalid-rule controls must establish actual invocation, JSON and exit semantics.
  Do not infer findings from an assumed exit code or substitute fake-executable coverage for this proof.

## Proposal: overlay implementation table

Freeze these routing examples into test fixtures before implementation; expand only within WP 3.1.
Globs/patterns below are lead proposals, unlike the stable IDs above; check their actual matcher behavior.
Existing `docs` and `concurrency` overlays remain unchanged.

| Overlay ID | Binding path examples / proposed globs | Added-line suggestion example | Lenses added |
|---|---|---|---|
| `api-wire` | `**/*.proto`, `**/openapi.{yaml,yml,json}` | `Content-Type` | `contracts` |
| `data-migration` | `**/migrations/**` | `ALTER TABLE` | `contracts` |
| `performance` | `**/benchmarks/**` | `for await` | `correctness-performance` |
| `ci-infra` | `.github/workflows/**`, `**/*.tf` | `permissions:` | `security`, `change` |
| `dependency` | `**/{package.json,bun.lock,package-lock.json,pnpm-lock.yaml,yarn.lock}` | `dependencies:` | `contracts`, `security` |
| `ui` | `packages/app-shell/src/**`, `**/*.{tsx,jsx,css}` | `aria-label` | `experience` |
| `personal-data` | `**/privacy/**` | field `email` or outbound HTTPS host | `privacy` |

- Add a content-only lifetime/cleanup signal to route `correctness-resources` after lead confirmation.
- Use explicit patterns and negative fixtures, with identifier boundaries where appropriate; broad signals
  stay suggestions. Do not introduce phase-4 language packs as required overlay checks.
- Privacy reviews cover processing changes, not legal applicability or certification. Close the [A9] gaps
  named in `design.md:1114-1118` before shipping the privacy leaf; unsupported duties remain open questions.

## Test-first acceptance: write RED before implementation

1. `packages/core/test/review/catalog.test.ts`: exact new IDs, lens/node/class/proof mappings, option bounds,
   pack pin equality, rule class/lens/severity/triage/probation, reference validity and digest change.
   Preserve prior coverage while updating phase-1-only expected sets.
2. `packages/core/test/review/route.test.ts`: each new overlay has binding-path, content-only and unrelated
   controls; include root and nested manifest paths. Content adds no binding lens until confirmed.
3. Routing regressions: path beats content; removed-only text cannot suggest; PR prose cannot suppress;
   permutation is deterministic; caps yield explicit deviations; keep current budgets and Deep fallback.
4. `packages/core/test/review-toolkit/analyze.test.ts`: absent binary is named `not-run`, never installed;
   real valid output normalizes rule/class/lens and one-based locations; invalid/unreadable reports fail
   as `acquisition-error`, retaining raw artifacts rather than reporting pass.
5. Real-binary controls above establish exit semantics; host rules ignore hostile repository configuration.
   Head findings, base-only debt and unchanged findings distinguish new-only behavior; worktree stays untouched.
6. Catalog/tree seam: real authored tree passes `ReviewCatalog.check`, cites every declared class and routes
   every new lens; removing a required node or adding an unknown/unreachable reference must fail.
7. WP 3.2 keeps the planned seat-skill build/root/discovery acceptance; WP 3.3 tests scoped privacy-only audit
   delivery; WP 3.4 tests a card to Maestro without receipt/posting; WP 3.5 preserves memory/header/resume denials.

These are future acceptance requirements, not executed tests or reported results.

## Disjoint write ownership

- **Backend, WP 3.1:** `packages/core/src/review/catalog/entries.ts`,
  `packages/core/src/review-toolkit/{analyze,sarif}.ts`, new `packs/ast-grep.ts` under that toolkit;
  `packages/core/test/review/{catalog,route}.test.ts`, `packages/core/test/review-toolkit/analyze.test.ts`
  and their narrowly scoped fixtures. Add a parser-focused test file only if its boundary needs it.
- **Tree author, WP 3.2 and WP 3.4 prose:** only `packages/lucy-specialist/skills/**` as enumerated above.
  Backend owns core test expectations; tree author does not independently rename catalog IDs.
- **Later backend slices:** seat grants/scoping (3.3), PR workflow wiring (3.4), Atlas Own read (3.5),
  plus their planned tests; do not mix them into the first catalog/ast-grep slice.
- **WP 3.6:** `docs/guides/review.md` and both repo-only Lucy maintenance/ownership skills
  (`build-plan.md:380-386,666`); assign one documentation owner to avoid overlapping edits.

## Dependencies, boundaries and landing

- Before phase-1 merge: prepare fixtures, pin/rule adapter design, this frozen contract, tree/PR prose,
  Atlas acceptance deltas and documentation drafts. This does not waive execution dependencies.
- WP 3.1 and independent, cuttable WP 3.5 depend on phase 1; WP 3.2 depends on 3.1;
  WP 3.3 depends on 3.2; WP 3.4 depends on 3.1 (`build-plan.md:635-664`).
- **Integration dependency:** catalog and real tree must close together on the phase-3 bundle before landing.
  New catalog nodes can keep the real-tree check RED during preparation; no placeholder production skills,
  weakened checker, or fake production tree may turn that pending seam into a claimed green.
- Runtime provider work, Atlas genesis and evaluations/ablations are prohibited in this packet.
  No extra audit/compliance regimes, build lane, precision ledger or UI rendering are added.
- No new owner architecture decision is needed. Pattern details and class-specific proof wording belong to
  the lead; privacy source gaps are evidence tasks, not an excuse to reopen approved architecture.
- Framing correction: existing code is not proof phase 1 has landed; catalog-only metadata is not an analyzer;
  child skills are not separate lens passes; phase-3 privacy is not the full compliance phase.
