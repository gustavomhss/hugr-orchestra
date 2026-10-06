# Research synthesis: useful mechanisms, failure modes and adoption decisions

Research snapshots: 2026-10-03–04. Architecture research, not a product benchmark or a claim that the backend specialist already outperforms competitors.

## Role correction — precedence over research proposals

The owner explicitly clarified that **the backend specialist implements a pre-defined backend scope and does not investigate, diagnose or perform discovery**. Those responsibilities belong to other team members. This correction governs the active architecture and supersedes conflicting researcher recommendations, broad-agent comparisons, workflow suggestions and evaluation tasks below or in the archived reports.

The research effort investigated general agents and backend engineering; that does not assign every studied capability to the backend specialist. Responsible investigation/architecture/verification and foundation owners can use these reports to prepare implementation packets. The backend specialist consumes the supplied scope, decisions, targets, context and checks, then returns code/results/blockers. Even direct use without Maestro requires that clear packet.

The owner also reaffirmed existing ownership: persistence, cache and compaction are native harness capabilities; Maestro defines team scope and permissions; the harness enforces them. Atlas provides native Knowledge/Memory. Research about those systems is not a proposal to reconstruct them in the backend specialist, and the earlier broad foundation-building stage is withdrawn from its implementation plan.

## Reading order and authority

Read the [product architecture](../README.md), [Atlas integration](../atlas.md) and [capability/evaluation design](../capabilities.md) for the proposed backend specialist decisions. This directory preserves the research that informed them. Individual researcher recommendations are evidence and options, not additional product requirements.

The later owner decision on [tool distribution](../tool-distribution.md) also governs this corpus: selected useful free/open-source engines come ready by default, separately identified from HuGR/backend-specialist-owned tools. Historical references to preprovisioned tooling describe invocation assumptions, not a product policy of leaving users to install defaults one by one.

The [owned-tool contracts](../owned-tools.md) and [integration flow](../integration-flow.md) are subsequent design outputs. The owner's Memory clarification prompted a direct canonical-source check at Atlas `b319723d5c5c86a45ad362386d8c0583ed3a10f4`, recorded in [Atlas Memory consumer reference](../atlas-memory-contract.md): four stored kinds, injected versus consultable access, derived header slabs, exact write templates and actual public/internal surface differences. A narrow synthetic in-memory probe exercised actual template/header/recall functions; it is not a live Memory, durable-write or host/MCP-conformance result.

Twenty research assignments covered product mechanisms, implementation sources, memory, backend engineering, user reports and evaluation. Reports distinguish vendor documentation, inspected source, firsthand reports, proposed controls and unexecuted experiments. The lead additionally re-opened selected load-bearing primary sources, including Devin Skills, Grok Build plan-mode limits, Grok Bot's operating model, Factory skill semantics, Replit task-state semantics and the cited Cline/Claude Code issues.

A subsequent eight-assignment deep dive covers OpenClaw 2.0 and Hermes with pinned implementation paths, adverse branches, test-source reach, release/main differences and backend procedure cards. Its consolidated design impact is [technical-depth.md](../technical-depth.md). The original research remains preserved rather than silently re-labeled as the expanded survey.

The corrected-scope implementation survey is **R29–R45**: seventeen focused reports on tools that produce, transform or check backend code from supplied inputs. Its decision document is [backend-toolbox.md](../backend-toolbox.md), rather than the historical broad-agent proposals.

The next survey is **R46–R64**: nineteen reports on scope/language/runtime/framework/version variants, native skill composition, Matt Pocock, popular GitHub collections/plugins and vendor backend skills. The resulting [skill catalog](../skill-catalog.md) and [variant matrix](../skill-matrix.md) define proposed authoring boundaries and real implementation differences.

A documented feature is not proof of deployed conformance. A public issue establishes a reported experience, not prevalence or verified root cause. Historical incidents retain their dates and fix status. A source inspection is not a new runtime test. These distinctions apply to the reports and to this synthesis.

## What the product should feel like

The caller supplies a clear implementation packet, sees scoped progress, can redirect or stop execution, and receives code plus prescribed-check results. Returning later should not require reconstructing that packet. Missing context, decisions or diagnostic conclusions return to their owners; difficult work does not expand the backend specialist's responsibilities.

The product target is **accepted outcomes with low total cost and low user repair effort**. “More autonomy,” “more tools,” “more memory,” and “more tokens” are mechanisms to justify, not benefits by themselves.

## Backend implementation research

R29–R45 cover HTTP/RPC/event contracts, typed SQL, prescribed migrations, precise codemods, assigned tests/fixtures, Rust/Go/Python/TS/JS/Effect/Next/JVM/.NET/PHP/Ruby/Elixir mechanisms, existing HuGR Composer, application SDKs, compiled validators, verified kernels and generated binary codecs.

The research role discovers candidates; the backend specialist's runtime role remains implementing the supplied packet. The shortlist favors executable output and concrete compiler/verification leverage: **ogen/Orval, Buf/Connect/tonic, sqlc/SQLx/PgTyped, datamodel-code-generator, MapStruct/Mapperly, ast-grep/ts-morph/OpenRewrite, native schema libraries and assigned test tooling**. **Ajv standalone, typia, Verus/Kani/Dafny and Kaitai/FlatBuffers/Cap’n Proto** are conditional specialized opportunities with explicit compiler, proof or format limits.

Most integrations are skill recipes over existing project CLI/library calls. Composer has valuable source but selected routes need qualification: TODO-only modes, adapter call-shape mismatch, CWD-relative writes and structured failure handling are documented in [R38](38-python-composer.md). This is an integration dependency for the producer/bridge owner, not new platform work assigned to the backend specialist.

The reports contain source-inspected examples and proposed acceptance cases. Generators, solvers, application fixtures and model comparisons were not run; no performance or production-readiness result is claimed. Exact priorities, conditional support and integration shape are in the [toolbox](../backend-toolbox.md).

An [independent source-level review](backend-toolbox-review.md) checked the shortlist's role, output, version and guarantee boundaries. It requested no material correction within its stated scope. The lead additionally clarified that reusable tool metadata belongs in recipes, not in caller-authored micromanagement of every implementation step. This review is not runtime validation.

## Competitor mechanisms and their limits

| Reference | Valuable mechanism | Failure or limitation to account for | Team/foundation lesson, subject to role boundary |
| --- | --- | --- | --- |
| Codex | Typed task/turn boundaries, scoped workspaces, progressive skills, inspectable native execution | Queued/finished execution differs from accepted work; context budgets and resume durability need exact scope | Reuse native host identity and lifecycle; attach artifact-bound evidence |
| Claude Code / SDK | Concise project instructions, demand-loaded procedures, specialized handoffs | Tool availability, pre-approval and enforcement differ; compaction can lose important state in reported cases | Explicit host capability boundary; Atlas-backed continuity with preserved constraints |
| Devin | Repository-grounded investigation, reusable procedures, visible task steering and test feedback | Historical trial failures and repair cost; current Skills docs allow only one active skill | Small composable procedures, current-source evidence, bounded recovery |
| Replit Agent | Short path to usable preview, behavioral feedback, accessible recovery controls | Preview is not production; code restore and data recovery have separate scopes; documented Done grouping includes cancellation | Prove a useful flow, state exact verification and recovery scope, preserve truthful terminal states |
| Grok Build | Version-aware diagnostics, explicit effort controls, native task interaction | Plan mode gates edit tools but shell can still write; parent plan mode does not edit-gate subagents | Enforce effects in the host; do not infer read-only authority from a mode name |
| Grok Bot | Persistent teammate context, simple conversational setup, learning reusable procedures | Shared account computer is not per-Bot filesystem isolation; current-source checks remain necessary | Stable specialist identity, Atlas continuity, low-friction interaction through existing host |
| Cursor / Copilot / editor agents | Scoped rules, native diff/review, contextual work surfaces | Reports of false completion and lost context; product/runtime details differ by version | Show real delta and verification; preserve identity and context through existing UI |
| Amp | Focused thread handoff, on-demand recall, cache-aware effort choices | Extra consultation/model changes cost time, tokens and cache reuse | Optional bounded consultation only after measured value; one default execution path |
| Factory Droid | Lazy skills with effective-source and invalid/overridden visibility | `allowed-tools` is metadata in standard skill invocation; catalog/runtime disagreement has been reported | Use actual permission policy and a truthful effective skill view |
| Augment/Auggie | Checkout-aware retrieval and explicit correction memory | Remote/default-branch knowledge can disagree with dirty worktree; hosted indexing is not an Atlas substitute | Current-source-aware Atlas retrieval; deliberate, scope-aware corrections |
| Zed / Cline | Native hunk review; file and conversation recovery distinguished | Current checkpoint implementations can differ from docs; external-agent parity is conditional | Reuse host review and scoped recovery with tested ownership |
| OpenHands / SWE-agent / Aider / Continue | Agent-computer interfaces, bounded edit feedback, repo maps and reproducible tasks | Applicator fallbacks can relax scope; some documented mechanisms differ from source or maintained product state | Borrow narrow interfaces and tests; avoid importing another orchestrator or index |
| OpenClaw 2.0 and later snapshots | Durable custody, current-owner fences, progressive tool contracts and complete skill-resource bundles | Scheduling success can differ from persisted facts; release/main/docs differ; composed output validation can fail after effects | Preserve phase-specific native receipts, exact final-call authority, source-valid context and complete asset identity |
| Hermes Agent | Explicit bounded Memory mutation, demand-loaded/learned skills, cache-aware prompt construction and programmatic aggregation | Profile/context must survive deferred work; partial child outcomes and nested uncertainty can be lost; automatic curation adds cost without proving quality | Bind actual identities, retain semantic outcomes, reuse existing CodeMode and evaluate exported skills through the real host |

Sources and version details are in reports [R01](01-codex.md) through [R14](14-other-competitors.md). Grok API/model, Grok Build, official Grok Bot and community similarly named bots are separate products; [R13](13-grok.md) records their identities rather than conflating them.

## Skill variants and GitHub sources

The owner asked for variations by scope and language/stack/framework, then explicitly requested popular GitHub skills/plugins/extensions and Matt Pocock. The [wave plan](skill-variants-plan.md) records scope, disjoint assignments and discovery method. GitHub search queries failed with `User flagged as spammy.`; public topic pages, skills.sh and direct repository APIs supplied a popularity-informed sample rather than an exhaustive ranking.

**Decision:** task-oriented entry skills plus shared mode and precise technology references. The same API/data/concurrency task receives different implementation guidance for FastAPI versus Django, Axum versus Actix, Express/Fastify versions, Effect, Next, JVM/.NET, Rails, Laravel/Symfony and Phoenix/Ecto/Ash. Common authority and role rules are not duplicated or loosened by variants. The backend specialist retains local coding judgment rather than receiving caller-written SQL/helpers.

**GitHub adaptation:** Matt Pocock's behavior slices and conditional context pointers; Anthropic's shared-procedure/language-reference split; scoped implementation/evidence practices from Addy, Superpowers and ECC; framework recipes from Hobson, Awesome Copilot and vendor sources. Actual bodies and helper code were inspected. Broader diagnosis, architecture, self-review, delegation, configuration and publication workflows remain with their owners. Exact source/version/license notes are in R61–R64.

Important source corrections include stale registry names for Matt's skills, README-versus-body TDD semantics, driver-specific pooling instructions and a typecheck helper whose exit status can hide failure. SQLx tag and published-crate provenance were independently rechecked and documented as different source scopes in [R31](31-typed-sql.md) and [R50](50-rust-variants.md).

This is researched design. Descriptive frontmatter does not implement variant inheritance, selection predicates or permissions, and native the backend specialist's inspected profile still needs host-owned skill admission. Runtime skill files, installation and exercised task combinations remain distinct implementation deliverables.

Independent [role/composition review](skill-composition-review.md) accepted its inspected design scope. The [technical transfer review](skill-matrix-review.md) identified an overbroad Fastify v5 schema requirement; the lead checked primary source, restricted it to default JSON Schema compilers and preserved custom-compiler contracts. A focused recheck closed that finding. Both verdicts are source-level, not runtime compatibility results.

## Community evidence -> product requirements

The sample is qualitative and deliberately seeks concrete pain. It is not a survey or a frequency ranking. Reports include novice builders and experienced engineers, with English/public-community bias and access limitations. The full observation ledger is [R15](15-community.md).

| Reported pain | Direct evidence | Required user outcome |
| --- | --- | --- |
| “Says it changed something, but the file is unchanged” | [Cursor report, 2025-04-18](https://forum.cursor.com/t/gemini-2-5-constantly-fails-to-apply-changes-and-charges-fully/74345/19); closure/fix caveats in R15 | Completion points to the actual delta and relevant execution evidence |
| Repeated read/plan/compact cycles without implementation | [Cline #12957, 2026-08-05, open at inspection](https://github.com/cline/cline/issues/12957) | Reuse valid observations, recognize unchanged failure and take a materially different next step or expose the blocker |
| Instructions disappear after compaction | [Claude Code #96422, 2026-09-23, open at inspection](https://github.com/anthropics/claude-code/issues/96422) | Important instructions and task state survive native context transitions with provenance and visible coverage |
| Paid repair loops and unreliable steering | [Replit experience reports, September 2025](https://replit.discourse.group/t/agent-3-experience-feedback/7059/1) | Visible actual usage, bounded attempts, reliable stop/steer and retained partial work |
| Agent changes the architecture instead of fixing the request | [Replit builder, 2026-04-04](https://replit.discourse.group/t/how-i-went-from-full-agent-dependency-to-self-hosted-infrastructure-and-why-replit-is-still-part-of-the-stack/10919/1) | Existing architecture is the default; new machinery needs a requirement it solves |
| Agent silently replaces the intended database/service | [Replit billing-app builder, 2025-04-24](https://replit.discourse.group/t/agent-has-been-breaking-my-database-connection/4367/1) | Verify the actual configured backend and preserve it unless the task calls for a change |
| Getting a first result is delightful, finishing and maintaining it is hard | [Novice Cursor success account](https://forum.cursor.com/t/an-idiot-s-guide-to-smaller-projects-or-how-i-built-a-site-without-writing-a-single-line-of-code/86689/1) and counterexamples in R12/R15 | Preserve plain-language interaction and short feedback loops while proving persistence, compatibility and recovery |

Reported spend, elapsed time and anecdotes remain attributed to their authors. They are not measured backend specialist targets. Arbitrary token/time targets suggested in research notes are hypotheses for a pilot, not release promises.

## Adoption register

| ID | Decision | Minimal implementation home | Evidence / falsification |
| --- | --- | --- | --- |
| A1 | Supply current, bounded implementation context | Investigation/context owners + Atlas/native host | The backend specialist reads assigned references; missing/stale context returns to its owner rather than triggering discovery |
| A2 | Adopt progressive, inspectable skills | Existing skill loader + package assets | Unrelated task avoids body loading; required skill remains discoverable; winning source/version visible |
| A3 | Adopt artifact-bound completion evidence | Native tool/Session outcomes and existing review UI | No-op, skipped suite, missing runner and post-test artifact change cannot become verified completion |
| A4 | Adopt stable identity and evidence-backed memory | Shared Atlas + host binding | Rename/new Session preserves owner; wrong project/member and stale checkpoint do not cross into active context |
| A5 | Bound implementation retries and return unresolved failures | Existing retry/cancellation paths + caller handoff | The backend specialist preserves observed results and returns diagnosis/scope blockers; provider outage does not provoke speculative code edits |
| A6 | Adopt version-aware backend procedures | Shared methods + narrow stack overlays | Rust/Go lifecycle, actual DB atomicity, Next authorization/cache and runtime-specific failures are detected |
| A7 | Adapt visible file/conversation/data recovery scopes | Existing host snapshots and project-supported backup interfaces | Code restore does not claim to undo a payment, email or later production write |
| A8 | Adopt cache-aware, evidence-preserving efficiency | Native Context Epochs, tool output storage and usage | Paired task tests preserve acceptance while measuring cache, rereads, tool errors and human repair |
| A9 | Adapt a learned reusable procedure only after demonstrated reuse | Existing skill assets and normal change/review path | A one-off correction does not become an always-loaded global instruction |
| A10 | Evaluate host/caller model policy separately | Host/orchestrator owners | No self-delegated second opinion or additional review role is introduced inside the backend specialist |
| A11 | Adapt bounded deterministic aggregation | Existing CodeMode and canonical leaf settlement | Same complete result with bounded sources; denial, missing page and nested failure remain visible |
| A12 | Adopt generation-safe publication/cleanup where lifecycle requires it | Existing registry, cache, resource and execution owners | Late predecessor cannot repopulate cache, overwrite output or remove successor registration |
| A13 | Adopt phase-qualified recovery and result delivery | Existing native persistence/receipts | Lost reply does not replay an uncertain effect or rerun completed work |
| A14 | Adopt full-bundle and exported-artifact evaluation for skills | Existing package/skill loader and offline evaluation | Changed helper changes identity; the exact installed candidate must improve outcome, not just optimizer score |

### Explicit exclusions from the proposed architecture

- No replacement Atlas memory database, vector store, repository index or per-persona Markdown memory bank.
- No second model loop, worker scheduler, cloud computer fleet, shadow snapshot repository or universal deployment engine inside the backend specialist.
- No mandatory plan/review/approval sequence for ordinary reversible edits.
- No wrapper family that merely renames native shell, search, Git, HTTP or test-runner operations.
- No learned router, critic swarm or automatic post-task curation agent without measured marginal value.
- No blanket full-file/context dump, repeated identical investigation or whole-suite rerun when the evidence remains applicable.

These are scope decisions for this product, not claims those systems are useless in their own products.

## Reconciliation of research recommendations

1. **Shared foundation does not mean shared personal rules.** Per-member project rules remain member-scoped. Cross-member repository facts use Atlas Knowledge's own admission policy; another agent does not automatically inherit the backend specialist's experiential memory.
2. **A learned procedure is not current project truth.** Stable methods belong in skills. Current facts and experience remain Atlas-owned and freshness-qualified.
3. **A usage ledger is already a host concern.** Reuse native observations. Budget-aware behavior does not justify a second accounting store or a false hard-cash-cap guarantee.
4. **Embedding APIs are not plugin APIs.** `sdk-next` capabilities require the appropriate host composition; their existence does not prove V1/V2 plugin support.
5. **Provider references are version-specific.** Pin the installed model/runtime/tool versions before borrowing advice. Source/readable documentation is not a supported-version certificate.
6. **No universal performance number is adopted.** Paper/vendor results and proposed pilot budgets do not become the backend specialist SLOs. Measure a matched baseline first.
7. **The product's runtime corpus stays small.** These reports are design material, not skills to load into every task.
8. **Research references do not change product identity.** Only specialist public labels are configurable; Maestro stays fixed. Atlas remains the shared foundation, not a renamed persona or private skill store.
9. **Read source phases literally.** A stopped retry cycle, returned child summary, caught subcall error or delivery attempt is not proof of persisted memory, fulfilled task or successful external effect.
10. **Automatic recovery is not implicitly adopted.** OpenClaw/Hermes recovery machinery informs tests; Orchestra's advisory wakes remain distinct from explicit post-crash provider continuation.
11. **Competence does not expand responsibility.** Backend diagnosis, discovery, architecture selection and independent review in historical reports belong to their respective owners. Active backend specialist evaluations supply those inputs and penalize role overreach, even when an extra investigation finds a useful result.

## Research register

| ID | Topic | Report |
| --- | --- | --- |
| R01 | Codex mechanisms | [01-codex.md](01-codex.md) |
| R02 | Claude Code / Agent SDK | [02-claude.md](02-claude.md) |
| R03 | OpenCode/Orchestra native plugin seams | [03-native-plugin.md](03-native-plugin.md) |
| R04 | Cursor, Copilot, editor workflows | [04-editors.md](04-editors.md) |
| R05 | OpenHands and SWE-agent | [05-autonomous.md](05-autonomous.md) |
| R06 | Aider and Continue | [06-repomaps.md](06-repomaps.md) |
| R07 | Typed protocols, interruption, resumption | [07-protocols.md](07-protocols.md) |
| R08 | Atlas, Letta/MemGPT, Graphiti/Zep | [08-atlas-memory.md](08-atlas-memory.md) |
| R09 | Mem0 and Mastra lifecycle | [09-memory-lifecycle.md](09-memory-lifecycle.md) |
| R10 | Serena, SCIP, ast-grep | [10-semantic-tools.md](10-semantic-tools.md) |
| R11 | Devin | [11-devin.md](11-devin.md) |
| R12 | Replit Agent | [12-replit.md](12-replit.md) |
| R13 | Grok API, Build, Bot and community projects | [13-grok.md](13-grok.md) |
| R14 | Amp, Factory, Augment, Zed, Cline and wider scan | [14-other-competitors.md](14-other-competitors.md) |
| R15 | Community pain and positive experiences | [15-community.md](15-community.md) |
| R16 | Token, tool, context, cache and latency efficiency | [16-efficiency.md](16-efficiency.md) |
| R17 | Rust/Go backend depth | [17-rust-go.md](17-rust-go.md) |
| R18 | Python, TS/JS, Node/Bun, Effect, Next | [18-backend-stacks.md](18-backend-stacks.md) |
| R19 | SQL, migrations, API, retries, queues, security | [19-data-api.md](19-data-api.md) |
| R20 | Evaluation and user experience | [20-evaluation.md](20-evaluation.md) |
| R21 | OpenClaw 2.0 identity and runtime lifecycle | [21-openclaw-runtime.md](21-openclaw-runtime.md) |
| R22 | OpenClaw Memory, context and caching | [22-openclaw-memory.md](22-openclaw-memory.md) |
| R23 | OpenClaw tools, plugins and skill bundles | [23-openclaw-tools.md](23-openclaw-tools.md) |
| R24 | Hermes runtime, Sessions and recovery | [24-hermes-runtime.md](24-hermes-runtime.md) |
| R25 / R25A | Hermes Memory, skill learning, compression and offline evolution | [25-hermes-memory.md](25-hermes-memory.md) |
| R26 | Hermes tools, middleware, MCP and programmatic execution | [26-hermes-tools.md](26-hermes-tools.md) |
| R27 | Source-correlated OpenClaw/Hermes failures and fix status | [27-agent-failures.md](27-agent-failures.md) |
| R28 | Backend ownership, state, cache and publication recipes | [28-backend-depth.md](28-backend-depth.md) |
| R29 | HTTP contract to executable transport/validation code | [29-http-codegen.md](29-http-codegen.md) |
| R30 | RPC, event and serialization code generation | [30-rpc-contracts.md](30-rpc-contracts.md) |
| R31 | SQL contracts to typed application code | [31-typed-sql.md](31-typed-sql.md) |
| R32 | Prescribed application migration tooling | [32-migrations.md](32-migrations.md) |
| R33 | Exact scoped structural transformations | [33-codemods.md](33-codemods.md) |
| R34 | Generated/property tests for assigned behavior | [34-generated-tests.md](34-generated-tests.md) |
| R35 | Real-service and deterministic HTTP test fixtures | [35-test-fixtures.md](35-test-fixtures.md) |
| R36 | Rust derives, typed routes and middleware composition | [36-rust-code.md](36-rust-code.md) |
| R37 | Go implementation generators and libraries | [37-go-code.md](37-go-code.md) |
| R38 | Python generators and actual HuGR Composer output | [38-python-composer.md](38-python-composer.md) |
| R39 | TS/JS, Node/Bun, Effect and Next implementation boundaries | [39-typescript-code.md](39-typescript-code.md) |
| R40 | JVM/.NET database, mapping and serialization generation | [40-jvm-dotnet.md](40-jvm-dotnet.md) |
| R41 | Preselected application job and external API SDKs | [41-application-jobs.md](41-application-jobs.md) |
| R42 | PHP/Ruby/Elixir declarative implementation mechanisms | [42-web-backends.md](42-web-backends.md) |
| R43 | Rust verification, spec-to-exec and verified language output | [43-verified-code.md](43-verified-code.md) |
| R44 | Compiled validation and serialization artifacts | [44-compiled-validation.md](44-compiled-validation.md) |
| R45 | Supplied binary grammars and generated codecs | [45-binary-codecs.md](45-binary-codecs.md) |
| R46 | Native skill packaging/loading/composition affordances | [46-skill-composition.md](46-skill-composition.md) |
| R47 | Change modes and technical-domain variants | [47-scope-variants.md](47-scope-variants.md) |
| R48 | Python/FastAPI/Django/Flask and ORM variants | [48-python-variants.md](48-python-variants.md) |
| R49 | Go HTTP frameworks, contexts and data bindings | [49-go-variants.md](49-go-variants.md) |
| R50 | Rust/Axum/Actix/tonic/SQLx and task lifetime | [50-rust-variants.md](50-rust-variants.md) |
| R51 | JS/TS Node/Bun and Express/Fastify/Hono variants | [51-js-runtime-variants.md](51-js-runtime-variants.md) |
| R52 | Exact-version Effect API/data/resource/stream variants | [52-effect-variants.md](52-effect-variants.md) |
| R53 | Next server entrypoints, runtimes and versions | [53-next-variants.md](53-next-variants.md) |
| R54 | JVM Spring blocking/reactive/coroutine and persistence variants | [54-jvm-variants.md](54-jvm-variants.md) |
| R55 | .NET endpoint, EF/Dapper, serialization and lifetime variants | [55-dotnet-variants.md](55-dotnet-variants.md) |
| R56 | Ruby/Rails parameters, data, jobs and streaming variants | [56-ruby-variants.md](56-ruby-variants.md) |
| R57 | PHP Laravel/Symfony and short/long-lived worker variants | [57-php-variants.md](57-php-variants.md) |
| R58 | Elixir Phoenix/Ecto/Ash/Oban and process ownership | [58-elixir-variants.md](58-elixir-variants.md) |
| R59 | Protocol/transport/raw-body/codec procedure variants | [59-protocol-variants.md](59-protocol-variants.md) |
| R60 | Cross-stack data, migration, job and external-effect variants | [60-data-effect-variants.md](60-data-effect-variants.md) |
| R61 | Matt Pocock actual skills/resources and bounded adaptations | [61-matt-pocock-skills.md](61-matt-pocock-skills.md) |
| R62 | Popular/official GitHub skill collection patterns | [62-github-skill-collections.md](62-github-skill-collections.md) |
| R63 | GitHub plugin/extension implementation methods | [63-github-plugins.md](63-github-plugins.md) |
| R64 | Vendor backend skills and version-specific corrections | [64-vendor-backend-skills.md](64-vendor-backend-skills.md) |

## OpenClaw/Hermes version boundary

Official **OpenClaw 2.0** is the nickname for `v2026.8.1`, launch commit `ea806575e6450e4d1efdfc72c19f04be982a1b9b`. Selected launch admission/storage and terminal-observation paths were checked. The deeper current implementation study also uses release `v2026.9.8` (`fc23bc864e4553c2d215e479eeec47b67a0bf943`) and a separately pinned main snapshot (`06da0de86c0a27dc1e92995f9d0a2428880ce90c`). Do not credit every later mechanism to the launch.

Hermes release is package `v0.21.5` / tag `v2026.9.24` (`f97608f178d1ffeca59860195ab7da295f7c8e5f`), compared selectively with main `d795726f78e532ca31655f74656b4be63a907581`. Its separate self-evolution companion was inspected at `0a929e3aa20e15cf04dc7c28492a7d41a5139125`; that prototype's limitations do not describe every Hermes learning path.

Reports distinguish fixed-before-release, main-only corrections, unresolved source-correlated gaps and unverified reports. This is a mechanism/regression corpus, not a prevalence study or a deployed vulnerability audit.

## Reuse provenance

This delivery adopts design ideas and records sources; it does not vendor competitor implementation. Before a later literal code/skill port, inspect the exact source revision and its file/package license, retain applicable attribution/notices and record adaptations. Reported repository licensing is not assumed to cover hosted products, brands or all subdirectories.

## Architecture review disposition

Separate research agents reviewed the lead-authored product/host, Atlas and efficiency/evaluation contracts. The lead checked their source citations and corrected the documents; focused rechecks closed the reported design findings on 2026-10-03.

Corrections include stakeholder versus executing child Session identity, typed degraded-context admission, `maestro`/`orch` Memory compatibility, current Awareness/Orientation coverage, partial-read verdict gaps, estimate-based token accounting, initial V1 versus future V2 support, stable-ID UI routing, and a concrete early-value slice with per-slice prerequisites.

This is a source-level design review. It establishes neither installed plugin behavior nor benchmark performance. Runtime, model-level and user-evaluation work remains explicitly planned in the architecture.

Those reviews preceded the owner's execution-only role correction. They do not ratify the earlier broad backend specialist mandate. The active README/capability/Atlas contracts now apply the corrected division of work; archived reports remain historical research rather than executable role instructions.

The OpenClaw/Hermes technical extension received separate tool-contract, backend-state and learning reviews. Corrections clarified that schema compatibility cannot transfer invocation authority, idempotency is distinct from stale-owner fencing, and WAL/data checks alone cannot test POSIX lock custody. Focused rechecks closed those documentation findings; the new controls remain proposed runtime tests.

## Primary sources rechecked by the lead

- [Devin Skills](https://docs.devin.ai/product-guides/skills.md): progressive loading and current one-active-skill limitation.
- [Grok Build plan mode](https://docs.x.ai/build/features/plan-mode): explicit edit-versus-shell/subagent boundary.
- [Grok Bot overview](https://docs.x.ai/grok-bot/overview): persistent teammate interaction and shared account computer.
- [Replit task lifecycle](https://docs.replit.com/features/agent/task-lifecycle.md): Ready/Applying and Done's multiple terminal meanings.
- [Factory skills](https://docs.factory.com/harness/skills.md): progressive loading, effective-source states and metadata-only `allowed-tools`.
- [Anthropic tool-design guidance](https://www.anthropic.com/engineering/writing-tools-for-agents): task-centered tools, concise results and held-out evaluation; its example agent loop is not adopted as the backend specialist runtime.
- [Cline #12957](https://github.com/cline/cline/issues/12957) and [Claude Code #96422](https://github.com/anthropics/claude-code/issues/96422): direct issue bodies and open status at inspection; no independent reproduction asserted.
- [OpenClaw 2.0 release](https://docs.openclaw.ai/releases/2026.8.1): exact official nickname and calendar-version mapping; commit/tag metadata checked separately.
- [OpenClaw flush-exhaustion test source](https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/auto-reply/reply/agent-runner-memory.test.ts#L1263-L1289): returned exhaustion and success-looking scheduling latch are different facts; assertion inspected, not executed.
- [Hermes programmatic tool selection](https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/code_execution_tool.py): `_sandbox_tools_for` broadens an empty intersection; source fact, not an end-to-end exploit demonstrated here.
- [Hermes late-steer report](https://github.com/NousResearch/hermes-agent/issues/132359): explicit acceptance after final drain, reported reproduction and open status at inspection.
- [Hermes self-evolution fitness](https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/core/fitness.py) and [skill orchestration](https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/skills/evolve_skill.py): actual metric/caller and export/holdout sequence; no optimization trial executed.
- Local `packages/codemode/src/codemode.ts` and `packages/opencode/src/tool/code-mode.ts`: existing interpreter limits, MCP-oriented host exposure and absent explicit adapter limits at the pinned Orchestra baseline.
