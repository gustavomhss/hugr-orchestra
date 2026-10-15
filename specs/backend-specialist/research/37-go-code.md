# R37 — Go implementation accelerators for closed-scope backend specialist

Research snapshot: **2026-10-03**. Primary docs, pinned source, examples and test bodies inspected. Research only; commands below describe future assigned work. No tools installed, code/tests executed, subagents dispatched, or config changed.

## Decision and assignment boundary

Pick **Ent**, **stringer + Go generation mechanisms**, **go-playground/validator**, and **golang.org/x/sync**. Ent saves most repetitive code when storage already uses Ent; other picks target enum drift, input checks, and request-local service concurrency.
HTTP/RPC generators, SQL-first generators, migrations-tool selection, and application job SDKs belong to other lanes. Ent included specifically for supplied Go schemas → typed implementation, not permission to replace chosen storage.

Owner supplies one closed packet:
- Chosen architecture, interfaces/DTOs, storage/dialect, policy and transaction rules; exact source/output paths and allowed implementation targets.
- Go patch version, GOOS/GOARCH/build tags, module/tool versions, existing generation command, relevant source/docs, error contract and acceptance fixtures.
- Tenant/auth context, deadlines, concurrency/sharing rules, business invariants and exact checks with expected outcomes.
The backend specialist translates packet into code, invokes existing assigned CLI/library integration, and implements assigned tests. Missing decisions return to owner; discovery, diagnosis, design, permission and harness work stay outside the backend specialist.
Direct imports and existing CLI/`go:generate` suffice. New MCP wrapper adds transport/lifecycle work without improving these operations.

## Verified pins and compatibility

Latest non-prerelease releases/tags returned by upstream endpoints during this review; exact commits cross-checked against Go module proxy metadata. Dates distinguish GitHub publication from module source timestamp. A `v0` tag does not promise v1 API stability.

| Candidate/module | Release/tag; date | Commit SHA | Root license | Declared Go floor |
|---|---|---|---|---|
| `entgo.io/ent` | `v0.14.6`; published 2026-03-23 | `e0ba79d911cca949468293d4e2899d4c61cfc823` | Apache-2.0 | `1.24`, toolchain `go1.24.0` |
| `golang.org/x/tools/cmd/stringer` | tools `v0.51.0`; source timestamp 2026-10-02 | `ea2f152dc35325e4b9b639583972375972350a84` | BSD-3-Clause | `1.26.0` |
| `github.com/go-playground/validator/v10` | `v10.30.5`; published 2026-09-20 | `6a9b66661aec1c9f9172781187b6638b7a3f7d31` | MIT | `1.26.0` |
| `golang.org/x/sync` | `v0.23.0`; source timestamp 2026-08-31 | `f75267d8412fc1dfd12b343644a7ea46e4d9c85d` | BSD-3-Clause | `1.26.0` |

Evidence: [E-pin], [G-pin], [V-pin], [S-pin]; pinned LICENSE/go.mod links below. Root licenses verified, not transitive dependency license audit. SHA identifies inspected source, not signature verification.
Ent generator/runtime versions must match. Other current pins need Go 1.26; incompatible owner packet needs owner-selected compatible pin. The backend specialist must not silently upgrade toolchain. Go `tool` directives exist since 1.24, but tool dependencies participate in module version selection: directive alone does not freeze resolved version. [E-doc] [G-tool]

## 1. Ent — typed schema/query/mutation generation

**Fit/value:** strong for existing Ent graph with repetitive CRUD, predicates, edge traversal and mutations. Skip when packet chooses raw SQL/sqlc or different persistence model; ORM adoption is architecture work.
- **Input packet:** supplied `ent/schema` fields, edges, IDs, optionality, indexes, dialect, selected feature flags, tenant rules, transaction boundaries, Ent pin and adapter interface.
- **Concrete operation:** update supplied schema definitions; invoke existing `go generate ./ent` resolving matching Ent CLI; implement assigned adapter using generated builders and prescribed policy/hooks. Privacy example enables `privacy,entql`; flags are packet inputs. [E-doc] [E-example]
- **Produced code/behavior:** entity structs, typed setters/predicates, CRUD/query builders, mutation types, `Client`/`Tx`, hook and migration assets. Replaces handwritten builder/row-mapping scaffolding; compiler catches many field/type mismatches. Generated migration assets are not authorization to apply schema changes.
- **Still manual:** domain-to-entity mapping, policy bodies/context, transaction composition, error translation, migration rollout and dialect-specific behavior. Generated client is not complete service implementation.
- **Hidden semantic limit:** required fields/edges checked during `Save`, not enforced by builder's Go type. Hooks execute in application, not database; out-of-band SQL cannot inherit them. Schema hooks need generated runtime registration. [E-generated] [E-hooks]
- **Important example boundary:** inspected `Group.Policy` installs `DenyMismatchedTenants` for `ent.OpCreate` only. Copying example does not establish cross-tenant edge safety on updates. Tenant filtering and relationship authorization remain separate requirements. [E-policy]
- **Inspected evidence:** schema/mixins, generated `UserCreate.check`, handwritten `FilterTenantRule`, and executable examples `Example_tenantView` / `Example_denyMismatchedTenants`. Examples assert missing-viewer denial, scoped reads/bulk mutations, foreign deletion failure and create-time relationship denial using SQLite. These are source assertions, not observed passes. [E-generated] [E-policy] [E-tests]
- **Assigned scenario E1:** supplied real dialect, tenants A/B, positive same-tenant create/read/update control. Exercise list/count/edge traversal, bulk update/delete, missing viewer, and A attaching B's user during both create and update; assert packet's denial/error contract and unchanged B rows. Inject later transaction failure; assert rollback. In disposable fixture, deliberately permit forbidden relationship and verify corresponding negative test fails; account for any independent database enforcement. SQLite upstream examples do not establish production-dialect isolation.

## 2. stringer + `go generate` — enum formatting without parallel lookup tables

**Fit/value:** narrow, low-runtime-footprint choice when packet already has integer enums needing names. Avoid separate enum DSL/framework for this job.
- **Input packet:** existing enum declarations, approved numeric/name/alias mapping, build tags, `internal/status` target, expected `status_string.go`, pinned tools version and exact generation command.
- **Concrete operation:** use existing directive such as `//go:generate go tool stringer -type=Status -output=status_string.go`, then assigned `go generate ./internal/status`. Assumes owner already supplied module's `tool` dependency/version; module configuration is not the backend specialist's task. [G-tool]
- **Produced code/behavior:** self-contained `String() string` and lookup data, with compile-time assertions detecting changed numeric values of previously generated constants. Removes maintained-by-hand formatting switches/maps; generated runtime uses stdlib `strconv`. [G-source]
- **Still manual:** enum membership validation, parsing, wire/JSON/text encoding, stable external names, allowed state transitions and regeneration expectations. `String()` does not implement `MarshalJSON` or `UnmarshalText`.
- **Hidden semantic limit:** integer enums only; aliases sharing value collapse to one source-order name. Unknown values format as `Status(n)`, not validation errors. Appending new constant can leave old generated code compiling; value assertions are not exhaustive drift detection. Bitmask combinations do not gain flag-composition semantics. [G-source]
- **Generation mechanics:** `go generate` is explicit, never automatically part of build/test; commands run in package directory. Directives are line-scanned, even inside multiline strings; arguments have Go quoting/environment expansion, not shell globbing. Owner's exact target command matters. Standard `go/ast`, `go/types`, `go/format` support custom generators only when packet already specifies transformation; building generic generator framework gains nothing here. [G-generate] [G-source]
- **Inspected evidence:** `testdata/day.go` checks known and out-of-range names; `TestEndToEnd` generates then runs fixtures; `TestTags` checks build-tag selection; `TestConstValueChange` expects failed compilation after numeric drift. Inspected, not run. [G-tests]
- **Assigned scenario G1:** assert supplied name/alias/unknown-value table; verify expected output exists and repeat generation is byte-identical. Change existing numeric value in disposable fixture: stale output must fail compilation. Append new constant: regeneration must change output and new name assertion must pass. Separately assert supplied wire mapping and invalid-transition rejection; compiler success answers neither.

## 3. go-playground/validator — reusable DTO validation, not another transport layer

**Fit/value:** repeated nested field, collection and cross-field checks where packet lacks authoritative generated validation. Reuse existing validation mechanism instead if transport/schema already owns same constraints.
- **Input packet:** DTOs and presence/null/zero rules, allowed formats/ranges, nested collection constraints, cross-field rules, JSON error paths, chosen validation entrypoint and approved custom predicates.
- **Concrete operation:** initialize shared `validator.New(validator.WithRequiredStructEnabled())` as prescribed; register custom/struct rules before concurrent use; call `StructCtx(ctx, dto)` at supplied boundary and map `ValidationErrors`/`InvalidValidationError` to existing error contract. [V-api] [V-options]
- **Produced code/behavior:** runtime checks for tags such as `required`, `min`, `oneof`, `dive`, `gtefield`; structured field errors. Removes repeated traversal/format/range-check code; generates no Go code. Optional registered `validators.NotBlank` handles whitespace-only strings. [V-doc] [V-notblank]
- **Still manual:** decoding and unknown-field handling, normalization, presence representation, validation invocation, error mapping, tenant authorization, transactional uniqueness and business state transitions. Input grammar validation does not establish mailbox ownership or permission to access resource.
- **Hidden semantic limit:** `required` rejects scalar zero/false but only tests nil for slices/maps; nonnil empty slice needs length rule. `omitempty` skips subsequent checks on empty values; `WithRequiredStructEnabled` is opt-in for non-pointer structs. Unknown tags can panic at runtime; tags/cross-field names are not compiler-checked. Docs explicitly say unresolved `fieldexcludes` reference succeeds. [V-doc] [V-options]
- **Inspected evidence:** `_examples/simple` opts into required-struct behavior and walks nested errors; `_examples/struct-level` shows JSON names/custom cross-field errors. `TestNotBlank` contains invalid whitespace/empty/nil controls plus valid values, through actual validator. Registration methods explicitly documented non-thread-safe. [V-examples] [V-notblank] [V-api]
- **Assigned scenario V1:** table-test real entrypoint with valid DTO, absent versus allowed-zero field, nil/empty collection, nil nested item, invalid nested field and reversed date range. Assert exact external error paths and packet's accepted zero case. Isolated malformed-tag fixture must observe documented panic; actual DTO cases must not panic. Skipping validation must break negative fixtures. Separately test syntactically valid foreign-tenant resource against assigned authorization behavior.

## 4. `x/sync` — request fan-out and duplicate read suppression

**Fit/value:** existing API/service adapters performing independent reads. `errgroup` replaces WaitGroup/error-channel/cancellation plumbing; optional `singleflight` replaces per-key in-flight maps and locks. Both remain ordinary libraries, not job/workflow SDKs.
- **Input packet:** existing downstream client interfaces, read operation set, result ordering, deadline, positive concurrency limit, fail-fast/partial-result contract; if sharing chosen, exact key dimensions and shared-operation lifetime/mutability policy.
- **Concrete operation:** create `errgroup.WithContext`, call `SetLimit` before launching, pass derived context into assigned client calls, collect prescribed results and `Wait`. For approved duplicate reads, shared `singleflight.Group.DoChan(key, fn)` plus caller-context selection; shared work uses packet's own lifetime rules. [S-source]
- **Produced behavior:** bounded active goroutines per group, first returned error and cooperative sibling cancellation; overlapping same-key calls share first function's result/error. Removes handwritten orchestration without changing client interfaces.
- **Still manual:** honoring context in I/O, deadlines, partial-result mapping, safe writes to result structures, rate limits/retries, response ownership and visibility-safe keys. Key must encode all packet-specified tenant/auth/parameter dimensions; callers with same key share first callback's result even if callbacks differ.
- **Hidden semantic limit:** `Wait` cancels derived context even on success; `Go` admission can block at limit and is not context-selectable. Cancellation cannot stop callbacks ignoring context. `singleflight` is process-local overlapping-call suppression, not cache, durable deduplication or exactly-once effect protection; `Forget` permits overlap. `DoChan` channel never closes; canceled waiter does not automatically cancel shared work. [S-source]
- **Inspected evidence:** `ExampleGroup_parallel`, `TestWithContext`, `TestGoLimit`, `TestCancelCause`; singleflight `ExampleGroup`, `TestDoDupSuppress`, `TestForget`, `TestDoChan`. Suppression test asserts fewer executions than callers, not exactly one; deterministic example holds first callback open to prove sharing. [S-tests]
- **Assigned scenario S1:** channel-controlled downstreams verify concurrency cap, ordering, first-error propagation and cooperative cancellation; run assigned race check. Hold one `DoChan` callback open, register same-key duplicate and distinct-tenant key, then release: assert one call for shared key, separate tenant results, and fresh call after completion. Cancel one waiter; assert remaining waiter/shared lifetime follow packet. Positive successful fan-out prevents reject-all implementation passing.

## Reject/defer and evidence ceiling

- **Google Wire:** reject new adoption. Official repo archived **2025-08-25**, README says no longer maintained. Use supplied constructor graph and ordinary Go calls. Existing use is maintenance decision for owner. [Reject-Wire]
- **Generic repository generators:** reject when they duplicate assigned interfaces or erase useful Ent predicates/transaction boundaries. Generated CRUD façade cannot invent aggregate or tenant semantics.
- **DI containers/full service frameworks/event-bus stacks:** skip unless owner architecture already requires lifecycle/topology they supply. Added composition/configuration surface outweighs savings for these closed targets. This is fit judgment, not claim every framework is unmaintained.
- **Custom codegen/MCP wrappers:** skip when existing CLI, standard Go tooling or direct library calls perform exact operation. Application job SDK survey remains separate lane.

Checks above are **assignments, not execution results**. Compilation can establish type compatibility; it cannot establish tenant isolation, security, business semantics or transaction correctness. Each assignment needs valid controls plus deliberate broken-case checks against actual implementation and chosen environment. No performance or saved-line-count claim made.

## Primary source ledger

- [E-pin] Ent [release publication](https://github.com/ent/ent/releases/tag/v0.14.6), [tag→SHA](https://api.github.com/repos/ent/ent/git/ref/tags/v0.14.6), [proxy cross-check](https://proxy.golang.org/entgo.io/ent/@v/v0.14.6.info), [LICENSE](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/LICENSE), [go.mod](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/go.mod).
- [E-doc] [Code generation/output/version matching](https://entgo.io/docs/code-gen/); [E-hooks] [Hook scope and runtime registration](https://entgo.io/docs/hooks).
- [E-example] Pinned [generation directive](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/examples/privacytenant/ent/generate.go), [User schema](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/examples/privacytenant/ent/schema/user.go).
- [E-generated] [Generated UserCreate, checks and Save](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/examples/privacytenant/ent/user_create.go).
- [E-policy] [Handwritten rules](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/examples/privacytenant/rule/rule.go), [create-only Group policy](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/examples/privacytenant/ent/schema/group.go), [mixins](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/examples/privacytenant/ent/schema/mixin.go).
- [E-tests] [Tenant examples/tests](https://github.com/ent/ent/blob/e0ba79d911cca949468293d4e2899d4c61cfc823/examples/privacytenant/example_test.go).
- [G-pin] Tools [tags→SHA](https://api.github.com/repos/golang/tools/tags?per_page=5), [version/time/origin](https://proxy.golang.org/golang.org/x/tools/@v/v0.51.0.info), [LICENSE](https://github.com/golang/tools/blob/ea2f152dc35325e4b9b639583972375972350a84/LICENSE), [go.mod](https://github.com/golang/tools/blob/ea2f152dc35325e4b9b639583972375972350a84/go.mod).
- [G-source] [stringer docs and implementation](https://github.com/golang/tools/blob/ea2f152dc35325e4b9b639583972375972350a84/cmd/stringer/stringer.go).
- [G-tests] [End-to-end/tag/drift tests](https://github.com/golang/tools/blob/ea2f152dc35325e4b9b639583972375972350a84/cmd/stringer/endtoend_test.go), [day fixture](https://github.com/golang/tools/blob/ea2f152dc35325e4b9b639583972375972350a84/cmd/stringer/testdata/day.go).
- [G-generate] [Go 1.27.1 command docs/source](https://github.com/golang/go/blob/go1.27.1/src/cmd/go/internal/generate/generate.go); [G-tool] [Official tool dependency/version-selection docs](https://go.dev/doc/modules/managing-dependencies#tools).
- [V-pin] Validator [release](https://github.com/go-playground/validator/releases/tag/v10.30.5), [tag→SHA](https://api.github.com/repos/go-playground/validator/git/ref/tags/v10.30.5), [proxy cross-check](https://proxy.golang.org/github.com/go-playground/validator/v10/@v/v10.30.5.info), [LICENSE](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/LICENSE), [go.mod](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/go.mod).
- [V-doc] [Tag semantics and panic contract](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/doc.go); [V-options] [Opt-in required-struct behavior](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/options.go).
- [V-api] [Instance, registration and StructCtx implementation](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/validator_instance.go).
- [V-examples] [Simple nested validation](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/_examples/simple/main.go), [struct-level validation](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/_examples/struct-level/main.go).
- [V-notblank] [NotBlank implementation](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/non-standard/validators/notblank.go), [positive/negative tests](https://github.com/go-playground/validator/blob/6a9b66661aec1c9f9172781187b6638b7a3f7d31/non-standard/validators/notblank_test.go).
- [S-pin] Sync [tags→SHA](https://api.github.com/repos/golang/sync/tags?per_page=3), [version/time/origin](https://proxy.golang.org/golang.org/x/sync/@v/v0.23.0.info), [LICENSE](https://github.com/golang/sync/blob/f75267d8412fc1dfd12b343644a7ea46e4d9c85d/LICENSE), [go.mod](https://github.com/golang/sync/blob/f75267d8412fc1dfd12b343644a7ea46e4d9c85d/go.mod).
- [S-source] [errgroup](https://github.com/golang/sync/blob/f75267d8412fc1dfd12b343644a7ea46e4d9c85d/errgroup/errgroup.go), [singleflight](https://github.com/golang/sync/blob/f75267d8412fc1dfd12b343644a7ea46e4d9c85d/singleflight/singleflight.go).
- [S-tests] [errgroup examples/tests](https://github.com/golang/sync/blob/f75267d8412fc1dfd12b343644a7ea46e4d9c85d/errgroup/errgroup_test.go), [singleflight examples/tests](https://github.com/golang/sync/blob/f75267d8412fc1dfd12b343644a7ea46e4d9c85d/singleflight/singleflight_test.go).
- [Reject-Wire] [Official archive banner and maintenance notice](https://github.com/google/wire).
