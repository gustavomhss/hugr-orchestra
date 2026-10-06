# R63 — GitHub plugins: backend implementation transfers

## Result and evidence boundary

Recommendation: extract five bounded procedures below. Highest backend value: contract-bound handlers and migration implementation; supporting value: behavior checks, local simplification, scoped structural edits.
Inspected 2026-10-04. Source-only: repository metadata, pinned skill/command bodies, hook manifests, adapters and helper code. Runtime compatibility, effectiveness and proposed checks remain unexercised.
Both assigned metadata worktree and `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin` returned HEAD `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`.
Common contract: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/skill-variants-plan.md`.
Discovery: named candidates plus public [agent-skills][I1] and [claude-code-plugin][I2] pages sorted by stars; Ponytail appeared prominently on both. Search API restriction `User flagged as spammy.` supplied by research contract; direct repository APIs worked here. Popularity-informed sample, not exhaustive ranking or install-count validation.
The backend specialist receives assigned behavior, component facts and applicable upstream decisions. Repair receives diagnosis; new feature does not need invented diagnosis. Local implementation choices remain the backend specialist's. Harness owns execution/cache/compaction/persistence; Maestro owns scope/permissions; Atlas owns knowledge/memory.

## Canonical repositories, versions and licenses

Versions below are manifest values at inspected source revisions, not claims about installed/released compatibility.

| Family / canonical repository | Revision and version boundary | License inspected |
| --- | --- | --- |
| [obra/superpowers][S] | `8ca22dba9a94f28898bbce59f2537ff4d87c747d`; main; plugin `6.4.2` | [MIT][SL], Jesse Vincent |
| [affaan-m/ECC][E] | `ef648e01899ba3e8dc6371642deaaf64b4477775`; main; `ecc-universal` `2.2.3` | [MIT][EL], Affaan Mustafa |
| [anthropics/claude-plugins-official][A] | `d182ca456ca09d31d139f7d3818d1d333b103cce`; main; code-simplifier `1.0.0`; feature-dev identified by SHA | Selected feature-dev/code-simplifier licenses: [Apache-2.0][AL]; both license blobs equal root license blob |
| [code-yeongyu/oh-my-openagent][O] | `f985c7831830b3a4b1919aeb470fd522f8460e76`; dev; root npm name remains `oh-my-opencode`, `5.1.14` | [Sustainable Use License 1.0][OL]; incorporated third-party components retain original licenses |
| [DietrichGebert/ponytail][P] | `c982cd411abb53323c4baa1baa3c2f020b8d0b08`; main; package `4.10.3` | [MIT][PL], DietrichGebert |

Direct API canonical identities resolve `affaan-m/everything-claude-code` → `affaan-m/ECC`, and `code-yeongyu/oh-my-opencode` → `code-yeongyu/oh-my-openagent`. Code-yeongyu remains origin; similarly named organizations are not substituted.
MIT extraction retains copyright/license notices. Apache extraction retains license/attribution, marks modifications and carries applicable NOTICE material. SUL limits use to internal business/non-commercial/personal purposes and distribution to free non-commercial distribution; do not treat whole OMO platform as permissively reusable.
OMO's vendored `packages/shared-skills/skills/ast-grep` has separate [MIT license][O7]; [SOURCE][O6] names `code-yeongyu/ast-grep-skill @ 3148c69`, ast-grep `0.45.0`. Distinguish that subtree from SUL command/runtime files.

## Concrete packaging and runtime findings

| Candidate | Actual inspected integration shape | The backend specialist extraction / platform cost |
| --- | --- | --- |
| Superpowers | [TDD][S1] and [verification][S2] are Markdown procedures. [SessionStart manifest][S4] invokes [shell bootstrap][S5]. [OpenCode adapter][S3] registers skills, maps V1/V2 tools, caches bootstrap and injects controller instructions into context. Child-session detection skips controller bootstrap when parent identity is known; lookup failure falls back to injection. | Keep small implementation/evidence procedures. Bootstrap/controller workflow brings planning and approval behavior. Existing adapter source is evidence of an adapter, not proof of compatibility with this pinned host. |
| ECC | [API][E1]/[migration][E2] skills are portable text. [build-fix][E3] groups compiler errors and repairs incrementally, but also detects build systems and diagnoses. [OpenCode hook module][E4] declares strict-profile formatting/typechecks, changed-file tracking, compaction injection and permission auto-approval responses. | Keep backend recipes and correction of the backend specialist's own local compiler mistakes. Use supplied stack/build commands. Permission handling conflicts with Maestro; context/persistence conflicts with harness/Atlas. |
| Anthropic selected plugins | [feature-dev command][A1] is phased controller text: discovery/explorer agents, architecture agents, user approval, implementation, reviewer agents. [code-simplifier agent][A2] has `model: opus`, recently-touched scope and behavior preservation, plus concrete JS/React style opinions. | Phase 5 contributes “read supplied relevant files, follow chosen architecture and project conventions.” Simplification becomes inline local work, not independent reviewer/model dispatch. Replace upstream style opinions with component conventions. |
| OMO | [refactor command sections][O1] combine plan-agent invocation, LSP/AST edits, checks and commits. [runtime construction][O4] wires managers, tools, hooks, config migration, model cache and compaction/autocontinue. [adapter package][O8] pins `@opencode-ai/plugin`/SDK `1.18.31`. | Keep independently phrased scoped-edit procedure only. Full platform duplicates execution/orchestration/config ownership and adds host-version/tool dependencies; SUL boundary also matters. |
| Ponytail | [skill][P1] contains reuse/stdlib/native-feature ladder and explicit protection for validation/data-loss handling. [instruction builder][P3] reads skill body and filters intensity examples. [OpenCode adapter][P2] registers skills/commands, injects system text each turn and persists mode under XDG config or `~/.config/opencode/.ponytail-active`. | Keep local reuse/minimality guidance. Persistent persona/state, requirement-challenging modes, whole-flow diagnosis and audit/review commands exceed the backend specialist's implementation role. |

Helper-code findings sharpen portability limits:
- ECC's standalone [post-edit-typecheck helper][E5] invokes `npx tsc --noEmit`, filters diagnostics to edited-file path candidates, truncates displayed lines and exits zero after handling failures. This is best-effort feedback, not project-green evidence. OpenCode strict hook likewise logs failures; use package-owned `bun typecheck` here.
- OMO's [edit-error recovery hook][O3] only matches three English `edit` error strings and appends a reread reminder. Portable behavior: reread current file after failed/stale edit; hook-string coverage does not transfer to `apply_patch` automatically.
- OMO's [AST helper][O5] previews through JSON, applies through a separate `--update-all` call, and reports preview match totals. Its JSON parser salvages malformed output, and replacement returns success on empty parsed matches. Adapt procedure to require trustworthy preview and inspect resulting diff; helper output alone cannot prove expected edits happened.

## Prioritized transfer cards

### T1 — Contract-bound HTTP handler implementation (ECC; high)
- Trigger: assigned create/update/list endpoint in known backend component. Non-trigger: choosing public API architecture, versioning policy, authentication design or framework.
- Inputs: supplied route/behavior contract, component/runtime/framework versions, data boundary, application authorization policy and existing error mapping; caller need not prewrite implementation.
- Method: decode request; validate at trust boundary; call existing service/data boundary; translate domain failures to supplied contract; serialize success/status/headers. For assigned cursor pagination, use ordered key boundary and fetch `limit + 1` to establish next-page existence.
- Adapt: extract implementation sections of [E1], replacing route naming, envelope, status, rate-limit and versioning preferences with existing contract. Validate cursor/limit using component conventions; ordering must match cursor semantics.
- Tools/output: existing editor, handler/integration tests and public-schema generator when relevant → scoped handler/schema diff plus exact command evidence.
- Local judgment: schema composition, helper choice, error translation implementation. Upstream blocker: incompatible or missing externally observable contract that affects requested behavior.
- Cost/role boundary: text recipe only; application authorization implements supplied policy and does not grant agent permissions.

### T2 — Implement assigned migration phase (ECC; high)
- Trigger: assigned schema/data change with known DB and migration tool. Non-trigger: choosing rollout architecture, deploying production migration or redesigning persistence.
- Inputs: DB/ORM versions, old/new schema intent, compatibility requirement, assigned rollout phase, relevant concurrency/backfill constraints.
- Method: preserve deployed migrations; create new migration; separate schema expansion from bounded backfill where required; implement compatible reads/writes for assigned phase; contract/drop only when phase assignment permits it. Use supplied rollout ordering.
- Adapt: [E2] offers expand/contract, historical Django models and custom SQL for concurrent indexes. Source's early rename example backfills before dual writes; later strategy reverses order. Use supplied concurrency-safe rollout, not early abbreviated sequence.
- Correction: source calls nullable `ADD COLUMN` “no lock.” [PostgreSQL 17][D1] specifies `ACCESS EXCLUSIVE` unless stated otherwise; no table rewrite is not no lock. Concurrent-index transaction restrictions must match actual migration runner.
- Tools/output: existing migration generator/runner and permitted test DB → immutable migration files, bounded backfill code if assigned, compatibility evidence and outstanding rollout prerequisites.
- Local judgment: SQL/ORM expression and local batching mechanics within supplied constraints. Upstream blocker: unresolved cross-deployment compatibility or data-loss policy. Extra runtime: existing DB tooling only.

### T3 — Behavior-first implementation and evidence handoff (Superpowers; shared)
- Trigger: non-trivial assigned feature/repair needing executable behavior evidence. Non-trigger: comment-only edits, generated output or low-impact changes already covered adequately.
- Inputs: acceptance behavior; repair diagnosis when repairing; supplied component/test conventions and authorized verification scope.
- Method: express one real behavior; observe expected failure rather than setup error; implement smallest complete change; rerun applicable checks; report command, environment/scope and actual result. [S1][S2]
- Adapt: retain red/green causal evidence and fresh completion evidence. Remove blanket “delete code and start over,” per-function tests, forced suite expansion and repeated-command rituals; preserve user work and repository verification policy.
- Tools/output: current test runner/compiler through harness → implementation, meaningful behavior check where needed, evidence handoff. This is implementer verification, not independent review.
- Local judgment: fixture and assertion shape, minimal patch, correction of own implementation mistakes. Upstream blocker: contradictory acceptance or missing repair diagnosis requiring another owner's investigation.
- Cost: few shared instructions; no controller bootstrap, subagent loop or new verification runtime.

### T4 — Bounded reuse and behavior-preserving simplification (Anthropic + Ponytail; shared)
- Trigger: implementing/refining assigned backend code or explicit local refactor. Non-trigger: broad audit, architecture replacement, unrelated cleanup or deciding requested feature is unnecessary.
- Inputs: assigned files/component, required semantics, project style, supplied architecture where relevant, existing local facilities.
- Method: reuse fitting local helper → stdlib/native facility → installed dependency → minimal new code; simplify touched assigned code by reducing redundant nesting/abstraction while preserving outputs, side effects and failure behavior. [A1][A2][P1]
- Adapt: prefer clarity over shortest line count. Preserve validation, application authorization, cancellation and data-loss protection. Eligible scope is assigned scope intersected with touched code, not every file another actor touched this session.
- Remove upstream hard-coded React/function/return-type conventions, global persona persistence, “grep every caller” diagnosis mandate, speculative requirement veto and ad hoc self-test mandate; use repository style/checks.
- Tools/output: editor, diff and applicable existing checks → smaller understandable implementation with significant choices recorded.
- Local judgment: choose existing primitive and useful helper boundaries. Upstream blocker: simplification would change accepted behavior or cross component ownership. Cost: text only, no agent/model dispatch.

### T5 — Previewed, scoped structural edit (OMO; conditional)
- Trigger: assigned symbol rename or repeated syntactic change in known files. Non-trigger: discovering migration scope, API redesign, unsupported language or tool installation.
- Inputs: named symbols/transformation, allowed paths, exact language/tool facts, compatibility requirements and existing diagnostic baseline.
- Method: read current files; use available language-aware rename preparation or structural preview; confirm matched nodes/files stay in scope; apply through authorized editor/tool; inspect actual diff and run applicable diagnostics/checks. On stale edit, reread before retry. [O1][O3][O5]
- Adapt: preserve preview/apply distinction, not OMO tool names. AST matches syntax, not symbol identity; use semantic rename for symbols. Reject malformed/incomplete previews; empty result is not proof requested migration completed.
- Tools/output: existing native LSP/AST capability when exposed, otherwise scoped patch for tractable change → explicit transformed-file diff and check evidence. Do not provision helper binaries or claim unavailable native tools.
- Local judgment: syntax pattern, edit grouping, correction of own patch mistakes. Upstream blocker: required edits outside assignment or contract change needing owner decision.
- Cost/role boundary: independently written procedure; installing OMO adds platform/runtime/license costs. Drop plan/oracle/librarian delegation, automatic commits, root test commands and standalone `tsc` defaults.

## Same-task comparison: create-user endpoint

Same supplied behavior: validate input, create user through existing boundary, return `201` and `Location`; invalid-input shape/status follow target contract. [E1] provides these distinct implementation shapes; examples omit exact framework versions, so target versions remain supplied inputs.

| Target variant | Instruction that changes | Wrong transfer to reject |
| --- | --- | --- |
| Next.js App Router + Zod | `await req.json()` then `safeParse`; construct `NextResponse.json` with explicit status/headers. Handle malformed JSON through existing error path, not only schema failure. | Treating schema `safeParse` as protection for earlier JSON decode; importing Next response types into unrelated Bun/Node framework. |
| Django REST Framework | Consume `request.data`; serializer `.is_valid(raise_exception=True)` and `.validated_data`; serialize result through DRF. | Assuming Next example's explicit `422` is DRF default: [DRF ValidationError][D2] defaults to `400`; supplied mapper determines contract. |
| Go `net/http` | Decode body with `json.Decoder`, validate typed request, pass `r.Context()` to service, map domain errors and set header before writing body. | Copying JS exception-only control flow or dropping request context when invoking service. |

Same word “rename,” different scope: internal backend symbol rename can use T5 semantic references; deployed PostgreSQL column rename under compatibility requirement uses T2's assigned migration phase. Global text/LSP rename cannot implement old/new deployment coexistence.

## Proposed selection and assigned-behavior checks — UNEXECUTED

| Card | Positive / negative selection pair | Behavior evidence to require when later exercised |
| --- | --- | --- |
| T1 | Implement supplied endpoint / choose API policy | Valid request yields contract response; malformed and field-invalid requests cause no write; duplicate/domain error uses supplied mapping; pagination boundary respects declared order. |
| T2 | Implement supplied expansion/backfill phase / invent rollout | Old supported path remains usable; interrupted backfill resumes without corrupting assigned invariant; contract/drop excluded from expansion-only diff; lock/transaction assumptions match real runner. |
| T3 | Non-trivial behavior change / comment-only edit | Intended implementation omission makes check fail for relevant behavior; restored implementation passes applicable checks; skipped checks and unavailable environments are explicit. |
| T4 | Local simplification / broad audit | Observable output and failure side effects preserved; trust-boundary validation survives; no unassigned abstraction/dependency or unrelated cleanup. |
| T5 | Scoped symbol/call rewrite / unknown-scope migration | Same-spelling unrelated symbol remains untouched; preview stays within allowed files; stale content causes reread; malformed preview or tool failure cannot become “done”; resulting diff confirms edits. |

## Extraction shape and exclusions

- Shared implementation guidance: T3 + T4 + feature-dev Phase 5's supplied-input discipline. These do not need separate always-on plugin personas.
- Narrow task recipes: T1 handler-contract, T2 migration-phase, conditional T5 scoped-refactor; attach language/framework/version references only from supplied component facts. Package metadata is descriptive selection input, not permissions or implemented routing/inheritance.
- Existing harness invokes tools/checks; Maestro constrains scope; Atlas supplies existing knowledge. No new loader, executor, persistent mode, memory store, compaction policy or approval mechanism.
- Index-level exclusions, not source audits: claude-mem/memsearch/arscontexta target memory/knowledge; claude-octopus targets multi-model orchestration. Popularity does not create backend implementation value here. Wshobson, Matt Pocock and vendor collections remain other research slices.
- Status: researched and source-linked; procedures proposed. Installation, runtime activation, implementation tests and independent review are not evidence supplied by this report.

## Primary source URLs

[I1]: https://github.com/topics/agent-skills?o=desc&s=stars
[I2]: https://github.com/topics/claude-code-plugin?o=desc&s=stars
[S]: https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d
[SL]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/LICENSE
[S1]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/test-driven-development/SKILL.md
[S2]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/verification-before-completion/SKILL.md
[S3]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/.opencode/plugins/superpowers.js
[S4]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/hooks/hooks.json
[S5]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/hooks/session-start
[E]: https://github.com/affaan-m/ECC/tree/ef648e01899ba3e8dc6371642deaaf64b4477775
[EL]: https://github.com/affaan-m/ECC/blob/ef648e01899ba3e8dc6371642deaaf64b4477775/LICENSE
[E1]: https://github.com/affaan-m/ECC/blob/ef648e01899ba3e8dc6371642deaaf64b4477775/skills/api-design/SKILL.md
[E2]: https://github.com/affaan-m/ECC/blob/ef648e01899ba3e8dc6371642deaaf64b4477775/skills/database-migrations/SKILL.md
[E3]: https://github.com/affaan-m/ECC/blob/ef648e01899ba3e8dc6371642deaaf64b4477775/commands/build-fix.md
[E4]: https://github.com/affaan-m/ECC/blob/ef648e01899ba3e8dc6371642deaaf64b4477775/.opencode/plugins/ecc-hooks.ts
[E5]: https://github.com/affaan-m/ECC/blob/ef648e01899ba3e8dc6371642deaaf64b4477775/scripts/hooks/post-edit-typecheck.js
[A]: https://github.com/anthropics/claude-plugins-official/tree/d182ca456ca09d31d139f7d3818d1d333b103cce
[AL]: https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/code-simplifier/LICENSE
[A1]: https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/feature-dev/commands/feature-dev.md
[A2]: https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/code-simplifier/agents/code-simplifier.md
[O]: https://github.com/code-yeongyu/oh-my-openagent/tree/f985c7831830b3a4b1919aeb470fd522f8460e76
[OL]: https://github.com/code-yeongyu/oh-my-openagent/blob/f985c7831830b3a4b1919aeb470fd522f8460e76/LICENSE.md
[O1]: https://github.com/code-yeongyu/oh-my-openagent/blob/f985c7831830b3a4b1919aeb470fd522f8460e76/packages/omo-opencode/src/features/builtin-commands/templates/refactor-sections/plan-and-execution.ts
[O3]: https://github.com/code-yeongyu/oh-my-openagent/blob/f985c7831830b3a4b1919aeb470fd522f8460e76/packages/omo-opencode/src/hooks/edit-error-recovery/hook.ts
[O4]: https://github.com/code-yeongyu/oh-my-openagent/blob/f985c7831830b3a4b1919aeb470fd522f8460e76/packages/omo-opencode/src/testing/create-plugin-module.ts
[O5]: https://github.com/code-yeongyu/oh-my-openagent/blob/f985c7831830b3a4b1919aeb470fd522f8460e76/packages/shared-skills/skills/ast-grep/scripts/ast_grep_helper.py
[O6]: https://github.com/code-yeongyu/oh-my-openagent/blob/f985c7831830b3a4b1919aeb470fd522f8460e76/packages/shared-skills/skills/ast-grep/SOURCE
[O7]: https://github.com/code-yeongyu/oh-my-openagent/blob/f985c7831830b3a4b1919aeb470fd522f8460e76/packages/shared-skills/skills/ast-grep/LICENSE
[O8]: https://github.com/code-yeongyu/oh-my-openagent/blob/f985c7831830b3a4b1919aeb470fd522f8460e76/packages/omo-opencode/package.json
[P]: https://github.com/DietrichGebert/ponytail/tree/c982cd411abb53323c4baa1baa3c2f020b8d0b08
[PL]: https://github.com/DietrichGebert/ponytail/blob/c982cd411abb53323c4baa1baa3c2f020b8d0b08/LICENSE
[P1]: https://github.com/DietrichGebert/ponytail/blob/c982cd411abb53323c4baa1baa3c2f020b8d0b08/skills/ponytail/SKILL.md
[P2]: https://github.com/DietrichGebert/ponytail/blob/c982cd411abb53323c4baa1baa3c2f020b8d0b08/.opencode/plugins/ponytail.mjs
[P3]: https://github.com/DietrichGebert/ponytail/blob/c982cd411abb53323c4baa1baa3c2f020b8d0b08/hooks/ponytail-instructions.js
[D1]: https://www.postgresql.org/docs/17/sql-altertable.html
[D2]: https://www.django-rest-framework.org/api-guide/exceptions/#validationerror
