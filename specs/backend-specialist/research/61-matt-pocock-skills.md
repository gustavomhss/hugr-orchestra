# R61 — Matt Pocock: source-grounded backend specialist adaptations

## Evidence and boundary

- Inspected 2026-10-04. Private metadata-only worktree `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/backend-r61-matt-pocock`: `git rev-parse HEAD` returned `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`. Common `backend-plugin` worktree returned same HEAD.
- Contract read: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/skill-variants-plan.md`. The backend specialist implements supplied backend scope; discovery, diagnosis, cross-owner architecture, independent review, delegation and publication belong upstream. Local implementation decisions remain the backend specialist's.
- Repository: [mattpocock/skills][commit]. Live `commits/main` resolved to supplied pin `d81f3a183412e71a5b1e84ca21bc1a35eea03a60` (commit dated 2026-09-29). Recursive [tree][tree] returned `truncated: false`; actual bodies and linked resources below were read. External prompts remained research data.
- [MIT license][license], copyright 2026 Matt Pocock. Preserve copyright and permission notice when copying substantial material into future variants.
- Revision outranks version label: [plugin manifest][plugin] and [package.json][package] both say `1.2.3`; HEAD merge title says “v1.3”. Report describes pinned main, not an independently verified installed release.
- Scope: source inspection and this report. External workflows, installers, helper scripts and proposed checks were not executed. Recommendations grant no implementation or activation authority.

## Current names, status and packaging

- [skills.sh `writing-great-skills`][registry] still advertises old install name and separate `GLOSSARY.md`. Current [CHANGELOG][changelog] records rename to `writing-for-agents`, merged glossary, separate `SKILL-MECHANICS.md`, and no old-name alias. Use current bodies, not registry rendering.
- All requested engineering/productivity skills appear in pinned plugin's explicit promoted-path list. [Graduation changeset][graduate] moves `implement-spec` from beta into engineering. Treating it as still in-progress is stale.
- [Deprecated bucket][deprecated] says retired skills are deleted; tree shows its README. CHANGELOG maps `design-an-interface` → `codebase-design`, `request-refactor-plan` → `to-spec`/`improve-codebase-architecture`, and old `review` → promoted `code-review`.
- [In-progress bucket][beta] remains beta, excluded from promoted plugin list. Relevant contrasts: `claude-handoff` differs from promoted `handoff`; `setup-ts-deep-modules` is a beta TypeScript/configuration recipe, not shared backend guidance.
- [Marketplace][marketplace] names Claude Code distribution. [Invocation reference][invocation], [Implement Codex metadata][implement-yaml] and [Writing Codex metadata][writing-yaml] distinguish Claude frontmatter from Codex `allow_implicit_invocation`. These are harness conventions, not the backend specialist permissions or proof of native OpenCode compatibility. Consume R46's native-loader findings rather than inventing a router/loader.

## Actual bodies and dependency edges

| Source | Actual behavior/resources inspected | The backend specialist disposition |
| --- | --- | --- |
| [implement][implement] | Supplied spec/tickets → `/tdd` at pre-agreed seams; regular typechecking and single-file tests; full suite at end; `/code-review`; commit current branch. | Extract implementation/check cadence. Remove self-review and commit closeout; use repo-required verification scope. |
| [implement-spec][implement-spec] | Reads ticket dependency graph/frontier; optional exploration agent; integration branch; implementer worktree base verification/reset and TDD; merger agents; review; conditional draft PR; resolves tickets; cleanup. Requires supplied tracker or setup. | Maestro/orchestrator recipe. Only supplied ticket/context pointers transfer to the backend specialist. |
| [tdd][tdd] | Reference-only red → green; public seams confirmed with user before tests; glossary/ADRs; calls `codebase-design` for disputed interface shape. [tests.md][tests] supplies behavior/oracle examples; [mocking.md][mocking] limits mocks to system edges. | Strong extraction candidate after removing repeat seam-approval ceremony and architecture invocation. |
| [codebase-design][design] | Small interface hiding meaningful behavior; interface includes invariants, ordering, errors, configuration and performance. [DEEPENING.md][deepening] classifies dependencies and replaces shallow tests. [DESIGN-IT-TWICE.md][twice] dispatches competing interface designs. | Keep local design heuristics; cross-owner seam redesign/parallel proposals go to architecture owner. |
| [improve-codebase-architecture][architecture] | User direction or git-history hotspots → exploration agent → temporary HTML candidate report → user choice → `grilling` and `domain-modeling`; possible glossary/ADR writes. [HTML helper][html] loads Tailwind/Mermaid CDNs and report is opened with OS command. | Discovery/architecture owner; unsuitable implementation trigger. |
| [diagnosing-bugs][diagnosis] | Red-capable feedback command → reproduce/minimize → ranked falsifiable hypotheses → instrumentation → fix/regression → cleanup. [HITL helper][hitl] reads terminal observations and prints captured values. | Diagnosis owner supplies result/reproducer. Extract regression and original-scenario verification, not investigation phases. |
| [code-review][review] | Resolves fixed ref, records three-dot diff against HEAD plus commit list; finds spec/standards; parallel Standards and Spec reviewers; repo overrides heuristic Fowler smells. Depends on tracker config. | Independent reviewer owner. The backend specialist provides evidence and applies assigned corrections; never owns acceptance verdict. |
| [to-spec][spec] / [to-tickets][tickets] | Spec synthesis plus seam confirmation and tracker publication; ticket decomposition, blocking edges, approval and publication. Wide-refactor exception uses expand–contract. | Planning owner supplies decisions/acceptance. The backend specialist executes assigned slice or migration phase. |
| [writing-for-agents][writing] | Trigger-bearing context pointers, steps vs references, progressive disclosure, co-location, checkable completion, single-source pruning. [SKILL-MECHANICS.md][mechanics] adds invocation/router mechanics. | Authoring guidance for variant authors; runtime instructions need native-host translation. |
| [handoff][handoff] | Temporary-directory summary, artifact pointers, redaction, next-session focus and suggested skills. | Adapt output/evidence shape; suggested skills are advisory, never authority to invoke or delegate. |
| [setup-matt-pocock-skills][setup] | Prompt-driven exploration/confirmation, then writes agent-instruction block and tracker/domain/optional triage docs from templates. | Environment/configuration owner; not prerequisite to implementing an already supplied backend specialist assignment. |

**Important source disagreement:** README still markets red-green-refactor; pinned TDD says “Refactoring is not part of the loop.” CHANGELOG confirms deliberate move to review. Do not silently attribute classic red-green-refactor to this revision. The backend specialist adaptation retains scoped cleanup/local coding judgment without invoking self-review.

## Strongest adaptations — short exact clauses, explicit rewrites

1. **Behavior-first vertical slices.** [TDD][tdd]: “One seam, one test, one minimal implementation per cycle.” “Expected values must come from an independent source of truth”. Implement one supplied acceptance behavior at a time, observe meaningful failure, add necessary code, verify. Take expected results from contract/worked examples, not cloned implementation. Reuse caller-supplied acceptance surface and existing public seams; escalate unresolved contract changes, not every fixture or helper. Carry [implement][implement]'s frequent focused checks; finish required package checks. Repo test policy decides whether new tests are warranted.
2. **Dependency-aware test seams.** [Mocking][mocking]: “Mock at **system boundaries** only”; [deepening][deepening] separates in-process, local-substitutable, remote-owned and true-external dependencies. Use real internal behavior, suitable test DB, existing injected transport or external adapter as appropriate. The backend specialist chooses fixtures/injection details locally. A stand-in establishes only behavior it represents; SQL/durability/concurrency require matching target semantics. Public surface can be a storage interface when storage is assigned behavior.
3. **Scoped refactoring with preserved behavior.** [Design][design]: “Accept dependencies, don't create them.” [Review][review]: “The repo overrides.” Use depth/locality and deletion thought experiment to remove needless forwarding or speculative abstraction inside assigned area. Keep project's service/API vocabulary; Matt's ban on those nouns is not portable. Rewrite deepening's automatic old-test deletion as preservation of required behavior coverage before removing genuinely redundant tests. Internal-seam guidance and TDD's public-interface rule need scope-relative interpretation, not universal bans.
4. **Wide-refactor exception.** [Tickets][tickets]: “Wide refactors are the exception to vertical slicing.” For supplied migration design, execute approved expand → migrate → contract phase, preserving compatibility during migration. Keep caller/phase dependencies explicit. Planner owns cross-package decomposition, integration sequencing and authorization to contract; the backend specialist owns local edits and phase verification. Narrow backend slice never expands into UI just because upstream ticket recipe says “every layer”.
5. **Branch-aware instruction authoring.** [Writing][writing]: “One trigger per branch.” “Every step ends on a **completion criterion**”. Put universal implementation steps inline; disclose stack/task-specific references behind exact applicability conditions. Co-locate definition, caveats and completion evidence. Keep authoritative rule in one place; avoid copying easy-to-query environment facts. Positive action wording helps, but retain explicit role limits/non-triggers. Skill descriptions select relevant guidance; host still enforces authority.
6. **Pointer-based evidence handoff.** [Handoff][handoff]: “Reference them by path or URL instead.” Report assigned behavior, changed paths, checks actually run/results, blockers and unresolved limits; point to supplied spec, diagnosis and existing decisions. Redact sensitive evidence. This preserves implementation context without duplicating a planning system, recommending automatic skill execution or publishing work.

## Proposed variant cards — unimplemented, unexercised

**Common contract:** supplied backend task, acceptance behavior, target component/runtime/framework/library versions and relevant constraints. Skill selection uses these facts, not incidental repo dependencies. Existing harness/Atlas supplies context; caller/host supplies authority. Missing glossary is optional context ([domain template][domain]); missing repair diagnosis or cross-owner decision is an upstream blocker. SQL, helpers, fixtures, local error handling and exact check arguments remain the backend specialist's judgment.

### A. Backend behavior slice
- **Trigger/non-trigger:** assigned new/changed backend behavior; not open-ended product discovery, diagnosis, architecture survey or purely mechanical low-impact edit needing no new test.
- **Inputs/steps:** contract and assigned/existing acceptance surface → independent expected example → warranted failing behavior test → minimal implementation → focused and required broader checks. No diagnosis prerequisite for new feature.
- **Tools/output:** repo read/edit tools, existing test runner/compiler commands; scoped patch plus check evidence. **Local judgment:** algorithms, SQL, helper shape, fixtures. **Blocker:** unresolved externally visible behavior or required inaccessible environment, not unspecified implementation minutiae.

### B. Diagnosed repair
- **Trigger/non-trigger:** supplied cause, failing scenario and expected correction; “something is slow/broken, find why” routes to diagnosis owner.
- **Inputs/steps:** diagnosis/reproducer → regression at existing suitable seam → fix → focused check and original scenario. Correct own implementation mistakes within assigned scope; return contradictions in upstream diagnosis with evidence.
- **Tools/output:** supplied harness/test command and repo tools; patch, observed before/after and original-scenario result. **Local judgment:** equivalent fixture, precise fix. **Blocker:** absent/contradicted diagnosis, unavailable necessary reproducer or seam requiring cross-owner redesign.

### C. Assigned refactor / migration phase
- **Trigger/non-trigger:** behavior-preserving local refactor or supplied expand/migrate/contract phase; not “find architecture opportunities” or unrestricted repository cleanup.
- **Inputs/steps:** intended shape, invariants and phase limits → retain behavior checks → scoped restructuring → verify compatibility; contract only when caller-supplied phase prerequisites are met and verifiable.
- **Tools/output:** repo editor, reference navigation and existing checks; patch plus preserved-behavior/phase evidence. **Local judgment:** inlining/extraction, SQL and migration mechanics within design. **Blocker:** cross-owner API/schema decision or unresolved phase dependency.

### D. Variant authoring reference — author owner, not the backend specialist runtime
- **Trigger/non-trigger:** separately authorized skill-document authoring; an application assignment does not trigger agent/config rewriting.
- **Inputs/steps:** frozen role, target facts, pinned sources, native loader semantics → shared steps → conditional references → explicit done evidence and selection cases.
- **Tools/output:** source reader and document editor; draft skill/reference plus attribution and unexecuted cases. **Local judgment:** wording and disclosure boundaries. **Blocker:** unknown native mechanics or owner boundary; never solve by creating loader, selector agent or permissions system.

## Same assigned task, different dependency variants

Illustrative task: “Same order key and payload returns existing order; conflicting payload is rejected.” Comparisons are proposed adaptations of [dependency categories][deepening], not framework compatibility tests.

| Supplied target | Instructions that change | Wrong transfer |
| --- | --- | --- |
| In-process order module | Exercise real public operations against isolated in-memory state; known literal expectations; use repo's runner. | Add HTTP server/DB or new port solely to resemble another variant. |
| PostgreSQL-backed module | Exercise persistence through assigned storage/application surface with target-compatible test DB; include transaction/uniqueness/concurrency evidence if contract requires it. | Treat PGLite example or mocked repository calls as proof of PostgreSQL concurrency; ban SQL assertions when DB constraints are assigned surface. |
| Remote-owned order service | Exercise local orchestration through supplied port and in-memory adapter; use supplied transport/contract checks for behavior outside fake's reach. | Redesign network topology or declare wire-level behavior proved by in-memory adapter. |
| Third-party order/payment adapter | Inject existing external-client seam; fixtures encode independently supplied vendor success/conflict/error contract. | Call live payment service by default or mock local collaborators instead of testing local behavior. |

**Portable vs specific:** seam selection, independent oracles, scoped refactoring and document structure travel across stacks. Inspected examples use TypeScript, Jest-style `test`/`expect`/`jest.mock`, `fetch`, Stripe and PGLite; these are examples, not stack-selection rules. Concrete Effect resource scopes, framework request lifetimes, ORM transactions and runtime test commands require respective exact-version references from other research slices.

**Specific counterexample:** beta [setup-ts-deep-modules][ts-setup] assumes flat package-root entry files, private subfolders, dependency-cruiser and `.cjs` configuration. Its [actual config][ts-config] reads `tsconfig.json`, lists TS/JS/JSON resolution extensions and leaves layer-direction rules commented out. It installs a dev dependency, edits checks/config/instructions and scaffolds an example. Its pass → deliberate violation → pass procedure is useful validation methodology for a separately assigned guard task; it does not authorize adding a guard here or transferring package-layout rules to Python/Go/Effect.

## Dependencies and side effects to remove or assign elsewhere

- **Skill dependencies:** `implement` → TDD/review; TDD → design vocabulary; architecture → design/grilling/domain-modeling; `implement-spec` → TDD/review plus dispatch/merge machinery. Extract references selectively; importing orchestration body imports its behaviors too.
- **Hard vs optional setup:** [setup ADR][setup-adr] distinguishes tracker/label prerequisites from optional glossary/ADRs. Current bodies extend tracker reliance to `implement-spec` and `code-review`; old ADR's list is not exhaustive. Supplied backend specialist task/context replaces tracker setup dependency.
- **Setup writes:** `CLAUDE.md` preferred when present, otherwise `AGENTS.md`; `docs/agents/issue-tracker.md`, `domain.md`, conditional `triage-labels.md`. [GitHub][tracker-gh]/[GitLab][tracker-gl]/[local][tracker-local] templates prescribe issue creation, claims, closure and blocking relationships; [label template][labels] maps triage state. These are planner/configuration responsibilities.
- **Install distinctions:** [README][readme] describes managed read-only Claude plugin versus editable files via external `skills` CLI. That CLI was not audited here. [Plugin ADR][plugin-adr] documents official-marketplace SHA pinning, so source-main pin and installed-marketplace revision are distinct evidence. Native compatibility and actual installation remain unexercised.
- **Maintainer linker:** [scripts/link-skills.sh][linker] explicitly says unsupported dev-only installer. It creates links in `~/.claude/skills` and `~/.agents/skills`, includes beta, skips deprecated/misc, and executes `rm -rf` on existing non-symlink targets before linking. Do not reuse as native packaging. [list-skills.sh][lister] only enumerates source paths; it is not compatibility validation. Scripts were read, not run.
- **Tooling vs runtime:** [package.json][package] declares Changesets dev tooling and npm versioning commands. This describes collection maintenance, not dependencies the backend specialist application must adopt. HITL Bash and HTML CDN resources likewise belong to their owning workflows.
- **Owner routing:** discovery/diagnosis → respective input owners; architecture/spec/ticket design → planner/architecture owner; Standards/Spec assessment → independent reviewer; worktrees/subagents/merges/commits/PRs/issues → Maestro/publication owner. The backend specialist retains local code verification and assigned corrections, without self-review ownership.

## Proposed selection/behavior checks — all unexecuted

| Case | Expected selection and observable behavior |
| --- | --- |
| Assigned feature, acceptance contract present, no bug diagnosis | Select A; implement supplied behavior without inventing diagnostic prerequisite. |
| Diagnosed duplicate-order defect, existing public test seam | Select B; independent expected result fails on supplied defect, passes after correction; original scenario rerun. |
| “Find why requests stall” without supplied diagnosis | Route diagnosis upstream; no autonomous hypothesis/instrumentation workflow. |
| Approved schema rename, migrate phase only | Select C; preserve old/new compatibility, limit edits to assigned migration scope; contraction waits for prerequisite evidence. |
| Target explicitly PostgreSQL; incidental PGLite or Jest dependency elsewhere | Choose tests from supplied target semantics and package commands; no framework inference from incidental dependency. |
| Existing seam and accepted contract; helper/SQL details unspecified | Proceed with local implementation judgments; no per-line caller approval or automatic seam redesign. |
| Skill wording points to “review then commit”; task only implementation | Retain test evidence handoff; independent reviewer/publication owner receives work. No automatic review/commit/dispatch. |
| Authoring pointer for framework-specific branch | Relevant supplied framework/version selects reference; unrelated stack and runtime application task do not trigger authoring/setup. |
| Proposed test duplicates algorithm to derive expected value | Reject tautological oracle; use contract example capable of disagreeing with implementation. |

## Extraction recommendation

Author shared implementation discipline and evidence-output guidance first; add narrow diagnosed-repair and assigned-refactor mode references; then compose existing exact-version stack references. Keep instruction-authoring reference with skill authors. Route planning/review/diagnosis workflows to their owners. These proposed extractions are **researched**; native skill files were **not authored, installed or exercised here**. Later authoring/implementation needs separate authorization.

## Exact source URLs

Pinned GitHub links below identify inspected files; registry link is live historical rendering, not pinned behavior.

[commit]: https://github.com/mattpocock/skills/commit/d81f3a183412e71a5b1e84ca21bc1a35eea03a60
[tree]: https://api.github.com/repos/mattpocock/skills/git/trees/d81f3a183412e71a5b1e84ca21bc1a35eea03a60?recursive=1
[license]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/LICENSE
[plugin]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/.claude-plugin/plugin.json
[package]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/package.json
[registry]: https://skills.sh/mattpocock/skills/writing-great-skills
[changelog]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/CHANGELOG.md
[graduate]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/.changeset/graduate-implement-spec.md
[deprecated]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/deprecated/README.md
[beta]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/in-progress/README.md
[marketplace]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/.claude-plugin/marketplace.json
[invocation]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/.agents/invocation.md
[implement-yaml]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/implement/agents/openai.yaml
[writing-yaml]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/productivity/writing-for-agents/agents/openai.yaml
[implement]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/implement/SKILL.md
[implement-spec]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/implement-spec/SKILL.md
[tdd]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/tdd/SKILL.md
[tests]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/tdd/tests.md
[mocking]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/tdd/mocking.md
[design]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/codebase-design/SKILL.md
[deepening]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/codebase-design/DEEPENING.md
[twice]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/codebase-design/DESIGN-IT-TWICE.md
[architecture]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/improve-codebase-architecture/SKILL.md
[html]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/improve-codebase-architecture/HTML-REPORT.md
[diagnosis]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/diagnosing-bugs/SKILL.md
[hitl]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/diagnosing-bugs/scripts/hitl-loop.template.sh
[review]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/code-review/SKILL.md
[spec]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/to-spec/SKILL.md
[tickets]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/to-tickets/SKILL.md
[writing]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/productivity/writing-for-agents/SKILL.md
[mechanics]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/productivity/writing-for-agents/SKILL-MECHANICS.md
[handoff]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/productivity/handoff/SKILL.md
[setup]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/setup-matt-pocock-skills/SKILL.md
[domain]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/setup-matt-pocock-skills/domain.md
[ts-setup]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/in-progress/setup-ts-deep-modules/SKILL.md
[ts-config]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/in-progress/setup-ts-deep-modules/dependency-cruiser.config.cjs
[setup-adr]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/.agents/adr/0001-explicit-setup-pointer-only-for-hard-dependencies.md
[tracker-gh]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/setup-matt-pocock-skills/issue-tracker-github.md
[tracker-gl]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/setup-matt-pocock-skills/issue-tracker-gitlab.md
[tracker-local]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md
[labels]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/setup-matt-pocock-skills/triage-labels.md
[readme]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/README.md
[plugin-adr]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/.agents/adr/0002-ship-as-a-claude-code-plugin.md
[linker]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/scripts/link-skills.sh
[lister]: https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/scripts/list-skills.sh
