# Backend implementation toolbox

Research date: 2026-10-03. Decision shortlist from [R29–R45](research/README.md#backend-implementation-research). Source-reviewed mechanisms; integration examples, benchmarks and acceptance cases have not been executed. These are recipe candidates, not installed capabilities.

## Direction

**Use compilers, generators and selected implementation libraries to remove repetitive coding; reserve the backend specialist's work for the assigned business behavior and integration.**

The backend specialist receives the scope, design, contracts, target files, versions and checks. The following tools consume those inputs. They do not assign it project discovery, diagnosis, architecture selection or independent review. Maestro and the existing harness/Atlas retain the ownership defined in [README.md](README.md#existing-foundation--ownership-not-a-backend-specialist-backlog).

The selection favors executable output, useful compiler checks, repeatable transformations and strong implementation feedback. Popularity and feature count are not evidence of benefit. The owner's distribution decision is explicit: selected useful free/open-source engines come ready by default, separately identified from our own tools. [Tool distribution](tool-distribution.md) records the approved initial payload and readiness obligations. A project's explicit compatible tool/version remains authoritative for its build; default availability does not force a new application dependency.

## Highest-return recipe candidates

Each row's use is conditional on the supplied project and task. This is an applicability condition, not a requirement for the user to install an already-selected default tool. Use only the recipes required by that task.

| Assigned work | Candidate | Concrete work removed | Remaining backend specialist work / limit | Evidence |
| --- | --- | --- | --- | --- |
| Implement a supplied HTTP contract | **ogen** for Go; **Orval** for TS clients/validators; **OpenAPI Generator** for selected server targets; **Kiota** for outbound clients | Routing/decoding/codecs, client transport, DTOs and selected runtime validators | Business handlers, auth, transactions and error mapping. Targets differ: Orval/Kiota do not generate the backend business handler; response/request validation can need explicit wiring | [R29](research/29-http-codegen.md) |
| Implement supplied RPC/event contracts | **Buf + Protobuf-ES + Connect**, **tonic/prost** | Message codecs, service interfaces, client stubs and dispatch | Implement service methods and prescribed effect/cancellation semantics. Generated `Unimplemented` handlers are not completion | [R30](research/30-rpc-contracts.md) |
| Implement specified database access | **sqlc**, **SQLx**, **PgTyped**; existing **Kysely** codegen lane | SQL bindings/scanning, typed parameters/results or checked macro expansion | Query/domain semantics, transaction binding and DTOs. Compilation does not prove uniqueness, tenant isolation or schema freshness | [R31](research/31-typed-sql.md) |
| Implement specified DTOs and mappings | **datamodel-code-generator**, **MapStruct**, **Mapperly** | Python model source from canonical schemas; Java/C# mapper implementations | Configure exact coercion/null/field policies and write business conversions. Mapper completeness becomes a hard check only with the appropriate compiler policy | [R38](research/38-python-composer.md), [R40](research/40-jvm-dotnet.md) |
| Apply a supplied structural change | **ast-grep**, **ts-morph**, **OpenRewrite**; selected native Go fixes | Repeated syntax edits or binding-aware transformations | Apply only the authorized delta. Syntax matching is not symbol identity; semantic tools still require complete supplied context and scoped writes | [R33](research/33-codemods.md) |
| Implement boundaries in the chosen framework | **Effect Schema + HttpApi**, existing Hono/Standard Schema, Next safe actions; Rust derive/router composition | Repeated decoding, route contracts, response encoding and middleware glue | Domain methods, auth and wire mapping. Use the existing framework; returning raw responses can bypass encoders | [R36](research/36-rust-code.md), [R39](research/39-typescript-code.md) |
| Compile a supplied validation contract | **Ajv standalone**; conditional **typia AOT** | Importable JS validators; type-derived validators/stringifiers where supported | Connect the generated artifact, errors and serialization correctly. Ajv can retain runtime helpers; typia requires actual transformation before Bun execution | [R44](research/44-compiled-validation.md) |
| Write explicitly assigned backend tests | **Schemathesis**, **fast-check**, **Hypothesis**, **proptest**; **Testcontainers** and selected fixture libraries | Schema/property case generation, shrinking/replay and reusable real-service fixtures | Encode supplied properties/oracles and verify the actual implementation. All-401, zero selected cases and skipped checks do not discharge acceptance | [R34](research/34-generated-tests.md), [R35](research/35-test-fixtures.md) |

Ordinary helpers such as `stringer`, `errgroup`, standard validators and middleware remain useful stack knowledge. They do not each warrant a new backend specialist integration product.

## Frontier mechanisms worth a focused pilot

These have stronger specialization costs. They enter only when the implementation packet already permits their language, format and verification boundary.

| Mechanism | Why it is interesting | Exact boundary |
| --- | --- | --- |
| **Verus `exec_spec_verified!`** | Supported functional specifications produce executable Rust counterparts and equivalence proof obligations | Restricted supported fragment, not synthesis from arbitrary requirements. Several collection translations remain trusted/unverified; proof assumptions and generated obligations must stay visible |
| **Kani** | Symbolic checking of actual Rust against supplied assertions; loop-free kernels can cover their entire admitted finite input domain | Sequential code, declared assumptions and resource/bound limits. A kernel result is not proof of database, network, concurrency or whole-service correctness |
| **Dafny** | Implement/prove the prescribed algorithm, then generate callable C#/Go/Java/JS/Python code | Requires an approved generated-language boundary and ABI/runtime mapping. Its `{:synthesize}` mock feature is not a general business-code synthesizer |
| **Kaitai Struct** | A supplied binary layout generates endian/bit/record parsing code across target languages | Framing, quotas and business semantics remain explicit. Version 0.11 writing support is Java/Python only; other target maturity differs |
| **FlatBuffers / Cap’n Proto** | Supplied format generates builders/accessors and relevant structural checking | Existing format only. Validation is target-specific; direct buffer access is neither universal zero-copy nor domain validation |

Sources and exact pins: [verified kernels](research/43-verified-code.md), [binary codecs](research/45-binary-codecs.md). The promising effect is less duplicated implementation and stronger evidence for supplied properties, not a blanket correctness or speed claim.

## HuGR Composer: valuable local asset, qualify concrete outputs

The existing producer contains real FastAPI CRUD/schema/auth generators and selected runtime primitives. Reuse comes through preselected entrypoints and explicit dependency closure, not the backend specialist browsing the catalog. [R38](research/38-python-composer.md) traces producer source at `df04cf8f9c9c4307d22b6447d513b05b94c08572` and the existing Orchestra bridge.

Source-inspected blockers prevent blanket readiness:

- `recipe_template` and `ad_hoc` generate TODO skeletons; `tool_delegate` returns a pointer rather than executing the target.
- The inspected generic adapter emitter instantiates a class, while the selected webhook adapter exports module-level `install(...)` with different arguments.
- Scaffold security/provenance paths include writes relative to process CWD instead of the supplied `output_dir`.
- The bridge handles MCP `isError`, but structured producer failures can still receive a success-looking title.

These need narrowly assigned producer/bridge qualification before those operations enter the executable recipe set. They are not a mandate for the backend specialist to rebuild Composer or its platform. Other tool recipes do not depend on catalog-wide repair. Domain rules and generated-app behavior still need the supplied acceptance checks.

## Application-stack dependencies and specialized recipes

- **Ent, jOOQ, Ash, Laravel Data, Alba/Typelizer:** valuable when their schema/resource/serializer model is already selected. No framework migration just to gain generation. [R37](research/37-go-code.md), [R40](research/40-jvm-dotnet.md), [R42](research/42-web-backends.md).
- **Alembic, Drizzle/Prisma, Flyway/Liquibase/Goose:** implement the given migration plan using project tooling. Rename/backfill intent remains supplied; `--create-only` is not universally side-effect-free. Ariga Atlas is a separate migration product, unrelated to HuGR Atlas. [R32](research/32-migrations.md).
- **River, Graphile Worker, Restate, Temporal, DBOS, Trigger.dev, Hatchet, Oban:** implement the already-selected application job/effect contract. Server/runtime adoption and operations stay upstream. Durable completion, unique admission and provider idempotency are different guarantees. These are target-application technologies, not the backend specialist persistence. [R41](research/41-application-jobs.md), [R42](research/42-web-backends.md).
- **TypeSpec, AsyncAPI Modelina, Avro, TypeBox, parser generators:** use where that source contract already exists and the output is needed. Do not add an intermediate language or runtime merely to enlarge the catalog. [R29](research/29-http-codegen.md), [R30](research/30-rpc-contracts.md), [R44](research/44-compiled-validation.md), [R45](research/45-binary-codecs.md).

## Integration into the backend specialist

The [skill catalog](skill-catalog.md) and [variant matrix](skill-matrix.md) specify how these recipes vary by task and technology without creating one skill per tool or combination.

**The normal integration unit is a small implementation recipe in the existing skills plus a compatible project-pinned or product-supplied CLI/library.** A recipe records:

1. The supplied task/contract and supported project versions that make it applicable.
2. Exact input artifacts, existing generation/build operation and authorized output paths.
3. Generated versus handwritten ownership, remaining domain work and known semantic limits.
4. Supplied checks and concrete blockers such as unsupported schema, missing toolchain or an unexpected output mode.

Load only the applicable recipe and invoke the compatible project-pinned tool or managed default. Native read/edit/shell tools already execute most of this work. Reuse existing Composer MCP when its selected route is qualified; a compiler does not need a new MCP server just to run its CLI. Tool installation is handled by product packaging, not by asking the user to provision each selected engine. Bundling a tool does not automatically add its generated-code runtime libraries or a framework to the target application.

The surrounding task keeps implementation choices local: the backend specialist can write the requested handler, query, mapper, resource lifetime or test inside the supplied design. This is not a requirement for another member to dictate every line or expression. New frameworks, protocol/storage choices, scope and acceptance changes remain upstream decisions.

Reusable command, compatibility and output-ownership metadata belongs in recipe assets. The caller supplies task-specific behavior and boundaries rather than rebuilding a detailed tool manual for every assignment.

## Adoption sequence

1. Author the directly useful API, typed-SQL, DTO and scoped-transform recipes against their actual supplied stack versions; preserve handwritten business seams.
   Package their selected default engines and necessary tool runtimes as part of normal installation; verify advertised operations using the distributed artifacts.
2. Reuse native boundary libraries and the assigned project's test/fixture tools. Add AOT validation only when it eliminates work the existing schema path does not already handle.
3. Qualify the exact Composer generator/slice needed by a real packet, separately from unrelated recipes.
4. Pilot one prescribed pure-kernel proof or binary-parser task when such work exists; stronger machinery must fit a real requirement.

Use the existing evaluation approach from [capabilities.md](capabilities.md): same model/runtime, packet and available toolchain against the native baseline; compare accepted code, check outcomes and actual usage. Recipe availability alone is not evidence of improvement. No model trial or speedup was measured in this research.

## Source review notes

Reports preserve release/source/license pins and distinguish upstream tests inspected from checks executed. The lead re-opened the ogen feature defaults, sqlc generated Go, datamodel-code-generator output examples, Ajv standalone documentation, Kani soundness limits, Verus spec-to-exec guide and local Composer emitter/adapter/CWD-write paths before selecting the mechanisms above.

The Effect reference checkout is newer than the target: the host remains `4.0.0-beta.83` plus its SSE-schema patch. R39 inspected the older original checkout; the lead compared its manifest to the backend specialist worktree baseline: differences are the `check:godfile` script and `@turbo/darwin-64`, while the Effect patch has the same Git blob. This does not certify runtime compatibility of an example.
