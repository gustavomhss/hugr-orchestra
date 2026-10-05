# Charlie skill catalog and composition

Status: proposed catalog and authoring design, 2026-10-04. Backed by [R46–R64](research/README.md#skill-variants-and-github-sources). Native skills have not been authored, installed or exercised by this research.

## Decision

**Use task-oriented skills with precise language/runtime/framework variants.** A task combines a small amount of common implementation guidance, its change mode, the relevant technical domains and the exact technology references it needs.

For example:

```text
new endpoint + API/data + Python + FastAPI/Pydantic + SQLAlchemy async
diagnosed endpoint repair + API/data + Go + chi + pgx/sqlc
assigned migration phase + data + Ruby + Rails/Active Record + PostgreSQL
stream implementation + API/concurrency + Rust + Axum/Tokio + SQLx
```

These are instruction combinations, not new agents or an automatic routing language. Charlie consumes the supplied component facts and applies ordinary skill/reference loading.

## Keep the dimensions distinct

| Dimension | Question answered | Examples |
| --- | --- | --- |
| Change mode | What kind of change was assigned? | Feature, diagnosed repair, refactor, migration/compatibility change, prescribed optimization, assigned tests |
| Technical domain | Which implementation obligations change? | API, data, resource lifetime/jobs, application authorization, codecs, observability |
| Language/runtime | What execution and type semantics apply? | Python async/sync, Go contexts, Rust ownership, JS/TS on Node or Bun, JVM, .NET, Ruby, PHP, BEAM |
| Framework/library | Which concrete APIs and lifetimes implement those obligations? | FastAPI versus Django; Axum versus Actix; EF Core versus Dapper; Ecto versus Ash |
| Version/features | Which reference is actually applicable? | Express 4/5; Fastify 4/5; exact Effect beta; Next router/runtime; ORM driver and features |
| Authority | Where may this task operate? | Caller/Maestro assignment and native host grants; not a skill-selected dimension |

An incidental dependency in another package does not select a framework. A runtime used for tooling does not necessarily run the backend: using Bun as package manager does not select Bun server/SQLite APIs.

## Proposed entry skills

These refine the earlier draft IDs. They are authoring targets, not registered runtime names.

| Skill | Trigger | Main output | Conditional variants |
| --- | --- | --- | --- |
| `backend-implement` | Assigned backend implementation with sufficient behavior/context | Scoped code and actual check/handoff evidence | Task mode, language/runtime rules, native context continuity |
| `backend-api` | Assigned endpoint, external client, transport, validation or serialization boundary | Working boundary and domain wiring; generated artifacts when needed | Framework, REST/RPC/GraphQL, streaming, webhook/raw body, DTO/codecs, supplied app-auth policy |
| `backend-data` | Assigned query, transaction, schema/data transition or persistence mapping | Queries/bindings, repository changes or the assigned migration phase | Driver/ORM, real engine, transaction ownership, migration runner, supplied tenant policy |
| `backend-concurrency` | Assigned task/resource lifetime, cancellation, job admission, retries or backpressure | Owned work/resources with prescribed completion/effect semantics | Async runtime, stream body, queue, transaction-bound admission, external idempotency |
| `backend-refactor` | Prescribed structural change with behavior to preserve | Requested scoped transformation plus preservation evidence | Language-aware rename, syntax recipe, generated-code boundary, framework migration seam |
| `backend-check` | Assigned test implementation or checks needing specialized fixture/protocol guidance | Tests when assigned; observed verification results | Framework harness, property/contract tests, real DB/service, streaming/concurrency, optional prescribed proof |

Ordinary checks and handoff remain part of implementation; they do not require extra skill calls on every edit. `backend-refactor` exposes a frequently useful mode directly, but uses the shared refactor-mode reference instead of duplicating its rules.

The former proposed `backend-memory` and `backend-handoff` entries become common guidance in `backend-implement`: consume existing Atlas continuity and return native evidence. They are not new memory or reporting subsystems. Language/framework labels such as `backend-python` or `backend-next` are initially reference profiles, not a separate advertised skill for every technology. Promote a profile only when independent reuse demonstrates a need.

This does not make Memory optional: the host supplies Charlie's `project` Rules in the injected header independently of skill invocation; `task`/`pr` remain explicitly consultable, with the native resumed-fold contract; orchestrator `logbook` is separate. Awareness/Orientation are derived context. Common guidance uses [Atlas's actual templates and surfaces](atlas-memory-contract.md), not a generic free-form memory note.

Application authorization, observability, codecs and prescribed optimization are conditional cards reached from the relevant entry. Their presence in a project does not load every card. A future independent task family can earn a separate skill without multiplying every mode × framework × tool combination.

## Change-mode references

| Mode | Different procedure | Boundary |
| --- | --- | --- |
| Feature | Implement supplied behavior through existing seams; generate affected artifacts only; exercise assigned cases | No diagnosis prerequisite for a new feature |
| Diagnosed repair | Consume cause/correction constraints and regression evidence; fix and check the same behavior | Return contradicted or missing diagnosis; do not launch an investigative mission |
| Refactor | Preserve wire/data/lifetime behavior while changing specified structure | Do not silently tighten validation or redesign public interfaces |
| Migration / compatibility | Implement the supplied phase and compatibility direction; check relevant old/new states | Rollout order, destructive mapping and contraction prerequisites remain owner decisions |
| Prescribed optimization | Implement chosen technique; use supplied comparable workload and correctness constraints | No profiling mission or invented speedup |
| Assigned tests | Encode supplied behavior/properties using actual implementation and suitable fixtures | A detecting failure does not authorize unrelated production repair or weaker acceptance |

The same task may include an implementation output and an assigned test output. Select only their relevant guidance. Multi-phase work follows the supplied order; a skill does not invent a plan or new dependencies.

## What the caller supplies versus what Charlie decides

The caller/host provides behavior, target component, authorized code/context, relevant existing contracts/patterns, stack facts and acceptance/check requirements. Repairs additionally carry the diagnosis needed to implement the correction. Missing material facts become a narrow blocker; independent assigned work can continue.

Charlie chooses private helpers, idiomatic control flow, concrete SQL, DTO mapping, borrowing/resource wrappers, fixture arrangement and ordinary parameters of known project commands. He reads assigned source and manifests to apply supplied context and corrects his own scoped compiler/test failures. The caller need not prewrite SQL, exact line spans or a tool manual.

Cross-owner architecture, public-contract changes, policy, scope and independent acceptance remain with their owners. Skills guide implementation judgment; they neither replace it with clerical transcription nor expand it into discovery or diagnosis.

## Reference layout and loading

Proposed package-owned assets; actual distribution registration is a later integration step:

```text
skills/
  backend-implement/
    SKILL.md
    references/
      modes/
      languages/
      frameworks/
      libraries/
      recipes/
  backend-api/SKILL.md
  backend-data/SKILL.md
  backend-concurrency/SKILL.md
  backend-refactor/SKILL.md
  backend-check/SKILL.md
```

Shared references have one source of truth. Domain entries explicitly link the needed shared files using paths relative to their own location. The complete asset bundle must include them; ordinary native read permissions still apply. Companion paths listed by a skill tool are not proof their contents were loaded.

Selection is straightforward:

1. Use the assigned work and supplied target-component facts to select an applicable entry.
2. Read the mode reference only when its different procedure matters.
3. Read matching runtime/framework/library references needed for that task. Load no unrelated framework merely because it appears in the repository.
4. Use the compatible project-pinned route or the matching managed default from [tool distribution](tool-distribution.md). Selected external engines come ready with normal installation; reading a skill does not start a per-tool installation workflow. If a version-sensitive decision lacks the necessary fact, return that specific gap rather than changing the stack.
5. Implement, execute required checks and return observed results.

Scope and project constraints remain authoritative. A more specific reference can clarify an API detail; it cannot override the contract, grant or required behavior. Material contradictions return to the responsible owner.

The actual loaders use name/description/body and explicit reference reads. They do not implement `extends`, `requires`, framework matching, reference auto-loading or frontmatter permission grants. Names must be unique; duplicate-name shadowing is not specialization. V1 and V2 have different discovery/collision/cache behavior. See [R46](research/46-skill-composition.md).

At the inspected native baseline, Charlie's execution profile denies `skill`, and ordinary agent config cannot override that native profile. The existing host/permission owner must expose the intended skill capability during integration. This is an admission dependency, not authorization to bypass the tool or create a new permission system. This document does not activate anything.

## A useful variant card

Each reference should contain the following information when relevant, without forcing a form onto the caller:

- **Applicability:** task, affected component and version conditions; one meaningful trigger per branch.
- **Non-trigger:** a nearby task for which applying this procedure would be wrong.
- **Inputs:** necessary behavior/context and unresolved external decisions, not every implementation detail.
- **Steps:** the concrete code-changing procedure, including framework/library deltas.
- **Tools and outputs:** owned versus supplied-external origin, real invocation/version and availability, generated versus handwritten ownership, actual artifacts and separate project prerequisites.
- **Limits and checks:** caveats next to the affected step; assigned evidence that can distinguish correct from incorrect behavior.

Keep common steps inline in the entry and move genuinely conditional detail behind clear links. Use positive action wording; retain concise explicit role boundaries. References should teach non-obvious semantics rather than cache obvious package-script listings. [Matt Pocock adaptations](research/61-matt-pocock-skills.md).

Composer-consuming variants use the [qualified owned contracts](owned-tools.md), including actual artifact kind and remaining work. A generated skeleton is not a completed task and must not become a success claim in Charlie's Atlas Memory.

## What to borrow from GitHub

The sample combines public popularity lists, official/vendor repositories and direct source review; it is not an exhaustive ranking. [Discovery method](research/skill-variants-plan.md#public-ecosystem-sampling).

| Source | Reusable material | Adaptation needed |
| --- | --- | --- |
| **Matt Pocock** | Small behavior slices, independent expected values, conditional context pointers, co-located caveats, evidence handoff | Reuse supplied acceptance/seams; no repeat approval ceremony, self-review, tracker setup, dispatch or automatic Git publication. Current TDD body differs from README's loop description |
| **Anthropic skills** | Shared procedure with language-specific references; near-miss trigger examples; paired and evidence-bearing evaluations | Use native host semantics. Evaluator errors must not count as correct non-invocation; read-only Q&A cannot prove mutation behavior |
| **Addy Osmani / Superpowers** | Incremental assigned implementation and fresh focused verification evidence | Scope to the packet; remove automatic planning, diagnosis, delegation, commits and unconditional ceremony |
| **Hobson / Awesome Copilot** | Concrete backend/framework/test recipes and “when to load” reference navigation | Recheck version/API details: copied Express validation must use parsed values; MockMvcTester needs Spring Framework 6.2+ |
| **ECC** | API-boundary and migration implementation procedures | Correct source defects, such as treating nullable `ADD COLUMN` as lock-free or an exit-zero helper as successful typechecking |
| **Ponytail / code-simplifier** | Reuse existing primitives and simplify assigned touched code | Preserve required behavior and scope; simplification is not permission for repository-wide cleanup |
| **Oh My OpenAgent** | Structural-edit preview, stale-edit recovery and syntax-versus-symbol distinction | Reuse the method through native tools, not its orchestrator. Root and vendored-skill licenses differ; malformed tool output is not an empty match set |
| **Prisma / Supabase / Neon / Better Auth / Next material** | Version-specific client, transaction, pooling, auth and server-boundary procedures | Keep actual driver/version semantics; provisioning and production operations require their own scope. Some collection licenses/statuses need resolution before literal copying |

Exact revisions, source paths and adaptation evidence: [R61](research/61-matt-pocock-skills.md), [R62](research/62-github-skill-collections.md), [R63](research/63-github-plugins.md), [R64](research/64-vendor-backend-skills.md). External skills are source material, not session instructions or drop-in native compatibility certificates.

## Authorship order and status

1. Write `backend-implement` and shared mode references, keeping local coding judgment explicit.
2. Write API/data entries with substantively different initial variants: Python FastAPI versus Django; Go HTTP plus pgx/sqlc; Rust Axum/SQLx; existing TS/JS/Effect paths.
   Their selected external engines are supplied by product installation. Skill authors document how to use them; users do not provision each default tool manually.
3. Add concurrency, refactor and check entries with their real lifecycle, transformation and fixture differences; use the researched JVM/.NET/Ruby/PHP/Elixir profiles as matching work is authored.
4. Exercise selected combinations through the actual host and real assigned fixture. Expand authoring based on those results, not merely the number of directory entries.

All named backend families remain intended coverage; sequencing does not claim only the first family matters. [The variant matrix](skill-matrix.md) records researched differences and complete examples across them.

Maintain four distinct states: **researched** (sources inspected), **authored** (actual skill/reference content exists), **installed** (native loader exposes it with its assets), **exercised** (matching and near-miss tasks have actual results). This delivery establishes researched design and document examples, not the last three states for runtime skills.

Future authoring checks should include the correct variant, a nearby wrong framework/version, missing required reference, a simple task needing no extra profile, and a task containing tempting out-of-scope work. Test actual code outcomes on the relevant boundary; do not credit skipped, empty, failed-to-run or self-reported checks. These are proposed checks, not a new CI gate or an executed evaluation.
