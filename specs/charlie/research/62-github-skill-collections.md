# R62 — GitHub skill collections: reusable backend authoring patterns

Inspection: **2026-10-04**. Source-only research; proposed selection/behavior checks below **unexecuted**.

## Decision and evidence boundary

**Adopt authoring methods plus narrow, corrected references.** Best combination: Anthropic’s conditional references and evidence-bearing evaluations; Addy’s scoped implementation slices; framework-specific request/testing deltas from Hobson and Awesome Copilot. Popularity supplies sample, not correctness evidence.

- `git rev-parse HEAD` returned **`76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`** in both `/Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin` and assigned metadata-only worktree `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/charlie-r62-github-skills`.
- Read `specs/charlie/research/skill-variants-plan.md`, `03-native-plugin.md`, `20-evaluation.md` from supplied Charlie worktree; inspected native skill loading/tool source cited below. Plan’s current backend-only contract controls transfer.
- Used preselected public-topic/skills.sh sample. Search API blocker, `User flagged as spammy.`, supplied by brief; used direct `gh api` repository/commit/tree/content endpoints with pinned refs. No fresh popularity ranking or install-count verification claimed.
- Selected assets below are actual `SKILL.md` bodies plus named resources, examples and evaluation implementations. Optional `sickn33/agentic-awesome-skills` catalog comparison omitted: primary bodies already answer transfer question. Matt Pocock, Superpowers/ECC and vendor-specific lanes remain outside sample.
- External content treated as data. Research operations: source reads, Git identity/status reads, report write. Foreign scripts/workflows were not executed; research did not install, activate, delegate, commit or push.

## Revision and license ledger

Collection source links below pin inspected revision. License text inspected at same revision; Anthropic license is asset-specific, not inferred from repository metadata.

| Collection | Exact inspected SHA | Selected assets / license |
|---|---|---|
| `anthropics/skills` | `8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4` | A: skill-creator, B: mcp-builder; each **Apache-2.0**, Copyright 2026 Anthropic, PBC. [A license][AL], [B license][BL] |
| `addyosmani/agent-skills` | `1401c8b8030e023baeebb31781a6653fe8e93026` | C: incremental-implementation; **MIT**, Copyright 2025 Addy Osmani. [License][CL] |
| `wshobson/agents` | `156b7a5e7a8b93642628a339ee4039c925b34c7f` | D: nodejs-backend-patterns, E: temporal-python-testing; **MIT**, Copyright 2024 Seth Hobson. [License][DL] |
| `github/awesome-copilot` | `143a3d976b3c1603cc8932984d5e1f28501cb5fc` | F: spring-boot-testing; **MIT**, Copyright GitHub, Inc. [License][FL] |

If later copying substantial text/code, retain applicable license/copyright notices and Apache change notices. Recommendations here describe adaptations, not completed ports.

## Selected assets: concrete extraction and counterexamples

### A — Anthropic `skill-creator`: maintainer authoring method

- **Inspected:** [body][A], [grader instructions][AG], [trigger runner][AE], [description optimization loop][AO]. Body separates metadata, triggered procedure and on-demand references; framework example selects one of `aws.md`, `gcp.md`, `azure.md`. Grader examines actual outputs, cites evidence per assertion, and critiques assertions that also accept wrong results.
- **Adopt:** description states task context and exclusion; body provides named reference plus explicit read condition. Evaluate realistic positives and near-miss negatives separately from backend outcomes. Compare candidate with native baseline/previous skill under same task/model; critique weak assertions. These are skill-maintainer methods, not Charlie’s runtime responsibilities.
- **Adaptation:** put applicability/non-trigger facts in description, not solely unloaded body. Replace “pushy” keyword expansion with component + task + version boundaries. Require fresh final holdout: `run_loop.py` selects best iteration by repeatedly observed test score, making that split validation data rather than untouched confirmation.
- **Counterexample:** `run_eval.py` creates temporary `.claude/commands`, invokes `claude -p`, and can return false on first unrelated tool call. Query exceptions become `False`, which can credit a should-not-trigger case. This measures a particular Claude first-action proxy; it is not native OpenCode compatibility or reliable negative evidence. Keep infrastructure failure separate from non-trigger. Static reading, not reproduced execution.

### B — Anthropic `mcp-builder`: shared protocol procedure, language leaves

- **Inspected:** [body][B], [TypeScript guide][BT], [Python guide][BP], [evaluation guide and XML examples][BE]. Same tool task changes concretely: TS `McpServer.registerTool` with explicit Zod schemas/description and `structuredContent`; Python SDK’s `mcp.server.fastmcp.FastMCP`, `@mcp.tool`, Pydantic v2 model and signature/docstring-derived schema/description.
- **Adopt:** shared input/output/error/pagination obligations; load only supplied SDK/language/transport leaf. For assigned `list_users`, implement supplied page contract through existing client, check malformed input, empty/page-boundary results and protocol response shape. Keep names, schema and observable error semantics explicit.
- **Version boundary:** TS example declares `@modelcontextprotocol/sdk: ^1.6.1`, Zod `^3.23.8`; these are ranges, not tested exact pins. Python text identifies Pydantic v2 but leaves SDK version open. SDK-bundled FastMCP import is a concrete identity, not permission to substitute similarly named package. Author reference against supplied component lockfile versions.
- **Counterexample/adaptation:** remove broad API discovery, language recommendation, architecture and self-review phases. Read-only multi-hop Q&A with exact-string answers evaluates tool usability; it cannot establish writes, rollback, cancellation or response-schema conformance. Use assigned backend behavior checks instead. TS guide’s “avoid any” checklist coexists with `makeApiRequest<any>` examples: checklist prose does not validate snippets.

### C — Addy `incremental-implementation`: shared scope discipline

- **Inspected:** [body][C], [case JSON][CE], [CSV plan][CP], [fixture test][CT], [evaluation documentation][CD], [actual runner][CR]. Body specifies thin working slices, no adjacent cleanup, repository-native checks, and rerunning checks only after relevant changes. Cases include sunk-cost pressure as well as normal implementation.
- **Adopt:** implement assigned backend slice, check its behavior, continue within assignment. Slice size follows coherent behavior and repository constraints; Charlie chooses local sequence/helpers/SQL. Retain pressure cases where prompt tempts unrelated changes or unsupported “done” claims.
- **Counterexample/adaptation:** source mandates commits, illustrates whole-stack DB/API/UI slices, and prescribes feature flags for incomplete merges plus rollback migrations; these cannot become universal backend obligations. Remove its self-review checklist, fixed line-count heuristics and default commit cycle. Flags/migrations only follow assigned behavior and existing project policy.
- **Evaluation limit:** runner’s default routing tier is stemmed TF-IDF/cosine similarity; behavioral tier injects skill body into `claude -p` and model-grades trace. Neither default lexical result nor forced body injection proves native selection. CSV case expectations test slicing/verification/commits; inspected fixture test checks archived-report filtering. Add real CSV quoting/newline/empty-result acceptance checks before using case as feature-correctness evidence. Negative cases naming expected owner are useful contrastive examples, not a routing system to import.

### D — Hobson `nodejs-backend-patterns`: framework delta extraction

- **Inspected:** [body][D] and [worked details][DD]. Examples distinguish Express middleware/`next(error)` from Fastify plugin registration and route `schema.body`; body itself triggers broadly on REST, GraphQL, microservices, authentication and architecture.
- **Adopt:** split request validation/error handling into small framework references, each named for actual framework major and schema library. Preserve existing component framework and architecture. Shared skill names behavior; leaves explain framework mechanics. Replace vague “read details when insufficient” with “read Fastify validation reference when changing supplied Fastify route schema.”
- **Counterexample:** Express `validate` awaits `schema.parseAsync(...)` then discards parsed result; defaults/coercions/transforms therefore do not reach handler through that example. Fastify `Reply` TypeScript generic is not a runtime response schema. Layer/DI/cache templates and “TypeScript prevents runtime errors” must not be imported as universal rules.
- **Version correction:** collection leaves Express/Fastify majors unspecified. [Express 4][X4] requires rejected promises forwarded to `next`; [Express 5][X5] forwards returned-promise rejection automatically. [Fastify 5.6 validation][FV] uses route JSON Schema/Ajv and configurable validation error handling. Pin actual target; Node tooling elsewhere in repository does not select this skill.

### E — Hobson `temporal-python-testing`: concern-indexed references

- **Inspected:** [body][E], [unit/activity examples][EU], [replay examples][ER]. Strong navigation pattern: each resource has file, “when to load,” and contents. `WorkflowEnvironment` time-skipping, `ActivityEnvironment`, and `Replayer` exercise different boundaries.
- **Adopt:** narrow assigned workflow-test recipe: supplied workflow behavior → time-skipping cases; activity effect → real activity boundary; supplied compatibility requirement/history → replay. Load only relevant resource. Replay establishes compatibility with supplied histories, not general deployment safety or activity correctness.
- **Counterexample:** replay suite iterates `glob("workflow_histories/*.pb")` and fails only if collected failures exist; empty history inventory can bypass meaningful replay. Require expected history identities and actual execution evidence. Version example uses `workflow.get_version`; official [Python versioning documentation][TV] instead documents `workflow.patched`/`deprecate_patch`. Re-author against pinned Python SDK rather than transplanting that snippet.
- **Boundary:** skill leaves Temporal SDK version unspecified. Strip debugging, deployment/CI setup, production-history harvesting and fixed ≥80% coverage obligations. Caller supplies approved fixtures/history and compatibility intent; failure evidence may require upstream diagnosis. Source-only findings, not executed failures.

### F — Awesome Copilot `spring-boot-testing`: scope × version navigation

- **Inspected:** [body][F], [MVC examples][FW], [JPA examples][FJ], [Boot 4 migration reference][FM]. Useful decision matrix: controller/HTTP → `@WebMvcTest`; JPA query → `@DataJpaTest`; external client → `@RestClientTest`; full app → `@SpringBootTest`. JPA examples flush SQL and clear persistence context for readback; real database example avoids assuming embedded DB parity.
- **Adopt:** choose test boundary from assigned behavior, then version-specific reference from supplied Boot/Framework/JDK/test-library versions. HTTP assertions cover status/headers/body; persistence assertions use real configured database boundary. A mocked service invocation cannot prove committed storage behavior.
- **Counterexample/version correction:** body labels `MockMvcTester` “3.2+.” Official [Framework 6.2.0 API][SM] says “Since: 6.2”; [Boot 3.4.13][S34] requires Framework 6.2.15, while [Boot 3.2.12][S32] identifies Framework 6.1.x baseline. Select on actual dependency versions; do not teach Boot 3.2 implies tester availability.
- **Boundary:** source centers Boot 4/JUnit 6 and modular test starters. Do not auto-upgrade Boot, apply MVC recipe to WebFlux, prescribe migration, import test-context-cache tuning, force 80% coverage, or make test-case count an architecture/refactoring trigger. Version corrections above verified against primary docs; remaining snippets uncompiled.

## Proposed native composition

Author shared assigned-change procedure once; attach separate task-mode notes and conditionally read technology references. Example logical composition: **feature implementation + HTTP validation + Node/Express 5/Zod target versions**. Another: **supplied compatibility repair + Temporal Python replay + supplied SDK/history versions**. These are documentation choices, not new inheritance/router metadata.

Native baseline inspected: V1 [skill tool][N1] returns selected body, base directory and sampled resource paths; V2 [skill source][N2] records name/description/content/location. Keep links explicit and portable relative to skill directory. Resource listings are sampled, so author must name required references. Host/caller owns authorization; skill names, scope tags and “read-only” prose do not grant it.

Illustrative description, not an installed skill:

```yaml
name: charlie-http-implementation
description: Implement assigned HTTP handler behavior or a supplied repair in an explicitly identified backend component. Use its supplied runtime, framework, schema library and versions for validation, error mapping and response changes. Excludes incident diagnosis, API architecture, review requests and client-only work.
```

Reference header should record applicable component facts, exact supported versions/source, changed instruction, non-transferable neighbor, observable result and required check. Prefer `references/express-4-errors.md`, `express-5-errors.md`, `fastify-5-validation.md` over one generic backend encyclopedia. Names illustrative; no new assets authored here.

## Small variant cards

Common implementation inputs (B–F): assigned behavior/acceptance, target component and stack versions, existing interfaces and allowed tools; diagnosis only for repair. Tools: existing native file/shell/document tools and project’s configured runner; no foreign runner installation. Output: scoped implementation/test artifact, exact checks/results, unverified boundary or upstream blocker. Charlie retains local coding/test design and correction of mistakes within assignment; no SQL/helper/CLI micromanagement required. A instead produces maintainer-owned skill drafts and evaluation cases.

| Proposed extraction | Applicability / non-trigger | Supplied extra inputs → steps / tools | Upstream blocker |
|---|---|---|---|
| A: authoring practice, maintainer-owned | Author/improve native skill; not Charlie implementing endpoint | Intended task boundary + fixtures → concise description, conditional references, separate selection/outcome cases; later existing native trials | Ambiguous owner boundary or missing acceptance oracle |
| B: MCP implementation leaf | Assigned MCP tool in identified TS/Python SDK; not choose transport/language | SDK/version, selected transport, input/output contract → register schema, implement bounded operation, protocol roundtrip with project test client | Missing tool contract or incompatible SDK/transport facts |
| C: shared backend slice | Assigned multi-step backend change; not cross-owner planning or trivial edit ceremony | Task behavior/order constraints → smallest meaningful local slice, repository check, next required slice | Needed cross-owner contract decision |
| D: HTTP framework reference | Assigned Express/Fastify handler; not incidental dependency/client code | Framework/schema versions, error format → validate and pass parsed data, implement handler, map errors, exercise real route | Unresolved public error/validation policy |
| E: Temporal testing recipe | Assigned workflow/activity/replay cases; not unknown incident or ordinary cron job | SDK version, expected decisions/effects, identified histories → relevant environment, execute cases, assert state/replay inventory using configured pytest | Missing required histories, compatibility policy or unavailable test service |
| F: Spring test reference | Assigned MVC/JPA/client behavior; not WebFlux selected from MVC keywords | Boot/Framework/JDK/database versions → narrow fitting slice; add integration boundary when persistence is required; configured Maven/Gradle checks | Unknown target versions, database fixture or required cross-component behavior |

## Scope deltas: shared guidance changes with assignment

| Task mode | Instruction that changes | Wrong transfer |
|---|---|---|
| New feature | Implement supplied behavior using local conventions; meaningful acceptance checks | Demand incident diagnosis before any new code |
| Supplied repair | Consume cause/reproduction, preserve regression case, correct affected behavior | Launch new investigation or repair unrelated findings |
| Behavior-preserving refactor | Preserve supplied observable invariants; accept alternative local structure | Force feature flags, a new layered architecture or caller-written helpers |
| Assigned tests | Choose oracle at required boundary: HTTP, committed data, activity effect, history compatibility | Treat mocked calls, coverage percentage or successful skill invocation as outcome proof |

## Same task, different framework instructions

Assigned contract: `POST /orders`; nonblank product and positive integer quantity; invalid input returns supplied 400 shape without writes; valid input persists order and returns supplied 201 response. Database/API architecture already supplied. Table proposes implementation/check deltas, not completed implementations.

| Supplied variant | Actual delta | Instruction that transfers badly |
|---|---|---|
| Node + Express 4 + pinned Zod | Consume parsed Zod result; forward async rejection to existing error middleware; request tests plus persisted-state assertion | Express 5’s automatic returned-promise error forwarding |
| Node + Express 5 + pinned Zod | Same data contract; returned handler promise feeds framework error handling; preserve callback-specific forwarding | Treat every async path as automatically caught, including detached callbacks |
| Node + Fastify 5.6 + configured Ajv | Full route body schema and configured coercion; use response schema if required; map validation error to supplied contract; handler receives validated data | Express `next` middleware or TypeScript `Reply` type as serialization proof |
| Spring MVC on supplied Framework 6.2+/Boot line | Existing DTO validation/error advice; MVC slice for response contract; real integration for persistence; `MockMvcTester` only when dependencies support it | MVC slice with mocked service as proof of committed write; Boot 4 starters copied into older Boot |

Second direct language contrast: assigned MCP `list_users` keeps same pagination/error semantics, but TS leaf supplies explicit registration/schema/description and Python leaf uses decorator/Pydantic/signature conventions. SDK representation changes; caller’s wire contract does not silently change to match example. [TypeScript][BT], [Python][BP].

## Proposed selection and behavior checks — unexecuted

| Positive case | Near-miss / wrong choice | Observable acceptance |
|---|---|---|
| Assigned Fastify route; Express appears only transitively | Choose Express from repository keyword match | Native trace selects Fastify guidance; actual request rejects invalid input and follows supplied coercion policy |
| Assigned Express 4 rejected-promise repair with supplied cause | Apply Express 5 behavior | Error reaches specified handler once; request completes; no write on failure |
| New endpoint with complete behavior brief | Require diagnosis dossier or architecture phase | Charlie implements within supplied contract, chooses local helpers freely, returns actual check evidence |
| Same Spring MVC task on Framework 6.2 vs 6.1 | Follow collection’s “3.2+” tester label | Appropriate APIs compile under supplied dependencies without framework upgrade; both satisfy same HTTP contract |
| Assigned Temporal compatibility check with identified histories | Empty inventory, ordinary asyncio task, or replay replaced by two equal fresh outputs | Histories actually replay; incompatible command-sequence mutant rejected; missing inventory reported as missing evidence |
| Assigned MCP pagination or CSV backend export | Read-only Q&A/process rubric treated as implementation acceptance | Real page boundaries/empty results/schema/error checks, or CSV quotes/newlines/empty data and preserved filtering |
| Request asks “why production fails,” architecture review or delegation | Backend keywords activate implementer procedure | No implementation skill selected for out-of-role objective; identify needed upstream owner input |

Evaluation ownership: maintainer/evaluator, not Charlie self-review. Later compare native baseline versus candidate on same pinned repository/model/task/environment; record selected references separately from accepted backend outcomes. Use real route/service/database boundary required by task. Calibrate oracle with known-good, realistic wrong/no-op and alternate-valid artifacts. Missing execution, denied tool, timeout or malformed result is invalid/failure, not negative-trigger success. Keep tuning prompts separate from fresh confirmation cases. Borrow R20 evidence discipline through existing harness, not new loader/cache/memory/evaluation runtime.

## Recommendation order and limits

1. Draft shared scope contract and precise descriptions; add conditional reference map using supplied facts.
2. Extract/correct minimal framework leaves above; preserve provenance/version/license. Broader stack lanes own comprehensive stack coverage.
3. Author contrastive selection cases and backend outcome fixtures; later exercise through actual permitted native loader/execution path. Research does not prove current Charlie seat can load these skills.

Status: **researched proposals**. Skill performance, source examples and native composition were not runtime-tested. Living primary docs below accessed 2026-10-04; versioned URLs used where available. Selected repository SHAs pin observations, not target application dependency versions. Official branding, catalog popularity and structural lint success cannot certify behavior.

## Primary source links

[A]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/SKILL.md
[AG]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/agents/grader.md
[AE]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/scripts/run_eval.py
[AO]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/scripts/run_loop.py
[AL]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/LICENSE.txt
[B]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/mcp-builder/SKILL.md
[BT]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/mcp-builder/reference/node_mcp_server.md
[BP]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/mcp-builder/reference/python_mcp_server.md
[BE]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/mcp-builder/reference/evaluation.md
[BL]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/mcp-builder/LICENSE.txt
[C]: https://github.com/addyosmani/agent-skills/blob/1401c8b8030e023baeebb31781a6653fe8e93026/skills/incremental-implementation/SKILL.md
[CE]: https://github.com/addyosmani/agent-skills/blob/1401c8b8030e023baeebb31781a6653fe8e93026/evals/cases/incremental-implementation.json
[CP]: https://github.com/addyosmani/agent-skills/blob/1401c8b8030e023baeebb31781a6653fe8e93026/evals/fixtures/incremental-implementation/tasks/plan.md
[CT]: https://github.com/addyosmani/agent-skills/blob/1401c8b8030e023baeebb31781a6653fe8e93026/evals/fixtures/incremental-implementation/reports.test.js
[CD]: https://github.com/addyosmani/agent-skills/blob/1401c8b8030e023baeebb31781a6653fe8e93026/evals/README.md
[CR]: https://github.com/addyosmani/agent-skills/blob/1401c8b8030e023baeebb31781a6653fe8e93026/scripts/run-evals.js
[CL]: https://github.com/addyosmani/agent-skills/blob/1401c8b8030e023baeebb31781a6653fe8e93026/LICENSE
[D]: https://github.com/wshobson/agents/blob/156b7a5e7a8b93642628a339ee4039c925b34c7f/plugins/javascript-typescript/skills/nodejs-backend-patterns/SKILL.md
[DD]: https://github.com/wshobson/agents/blob/156b7a5e7a8b93642628a339ee4039c925b34c7f/plugins/javascript-typescript/skills/nodejs-backend-patterns/references/details.md
[DL]: https://github.com/wshobson/agents/blob/156b7a5e7a8b93642628a339ee4039c925b34c7f/LICENSE
[E]: https://github.com/wshobson/agents/blob/156b7a5e7a8b93642628a339ee4039c925b34c7f/plugins/backend-development/skills/temporal-python-testing/SKILL.md
[EU]: https://github.com/wshobson/agents/blob/156b7a5e7a8b93642628a339ee4039c925b34c7f/plugins/backend-development/skills/temporal-python-testing/resources/unit-testing.md
[ER]: https://github.com/wshobson/agents/blob/156b7a5e7a8b93642628a339ee4039c925b34c7f/plugins/backend-development/skills/temporal-python-testing/resources/replay-testing.md
[F]: https://github.com/github/awesome-copilot/blob/143a3d976b3c1603cc8932984d5e1f28501cb5fc/skills/spring-boot-testing/SKILL.md
[FW]: https://github.com/github/awesome-copilot/blob/143a3d976b3c1603cc8932984d5e1f28501cb5fc/skills/spring-boot-testing/references/webmvctest.md
[FJ]: https://github.com/github/awesome-copilot/blob/143a3d976b3c1603cc8932984d5e1f28501cb5fc/skills/spring-boot-testing/references/datajpatest.md
[FM]: https://github.com/github/awesome-copilot/blob/143a3d976b3c1603cc8932984d5e1f28501cb5fc/skills/spring-boot-testing/references/sb4-migration.md
[FL]: https://github.com/github/awesome-copilot/blob/143a3d976b3c1603cc8932984d5e1f28501cb5fc/LICENSE
[SM]: https://docs.spring.io/spring-framework/docs/6.2.0/javadoc-api/org/springframework/test/web/servlet/assertj/MockMvcTester.html
[S34]: https://docs.spring.io/spring-boot/3.4/system-requirements.html
[S32]: https://docs.spring.io/spring-boot/docs/3.2.12/reference/html/getting-started.html#getting-started.system-requirements
[TV]: https://docs.temporal.io/develop/python/versioning
[X4]: https://expressjs.com/en/4x/guide/error-handling
[X5]: https://expressjs.com/en/guide/error-handling.html
[FV]: https://fastify.dev/docs/v5.6.x/Reference/Validation-and-Serialization/
[N1]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/packages/opencode/src/tool/skill.ts#L54-L97
[N2]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/packages/core/src/skill.ts#L73-L105
