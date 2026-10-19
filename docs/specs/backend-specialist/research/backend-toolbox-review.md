# Cold review — the backend specialist backend toolbox

**Verdict: source-level acceptable as conditional research shortlist. No material correction requested within reviewed scope.** This accepts mechanism selection and stated boundaries, not recipe execution, installed capabilities, compatibility certification, or measured return.

Reviewed 2026-10-03. File references below resolve under `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/` unless stated otherwise.

## Scope and authority

Read `backend-toolbox.md` first; then role boundaries in `README.md`, `capabilities.md`, corrected-scope `research/README.md`, and reports R29, R31, R38, R43, R44, R45. Consulted R39's version discussion and target root manifest for Effect compatibility concern.

`README.md:15-28`, `capabilities.md:9-17`, and `research/README.md:7-15` explicitly assign implementation to the backend specialist, scope/grants to Maestro or direct caller, persistence/cache/compaction/enforcement to harness, Knowledge/Memory to native Atlas. Research recommendations remain options, not extra product requirements. Review applies that precedence.

## Findings by concern

| Concern | Source-level disposition and limits |
| --- | --- |
| Executable HTTP payoff versus scaffolding | **Accept.** `backend-toolbox.md:19` and `research/29-http-codegen.md:65-72,90-95,108-124` distinguish ogen transport/validators, Orval fetch/schema output, Spring interfaces/annotations, and Kiota outbound SDK code. Auth, business handlers, transactions, request/response validation wiring remain explicit. Type-only openapi-typescript is accurately separated at R29:138-145. |
| Typed SQL versus correctness guarantees | **Accept.** `research/31-typed-sql.md:35-67,130-136` identifies generated binding/scanning, SQLx macro checking, PgTyped runtime objects, and Kysely's declaration-plus-builder lane. Extra-row behavior, stale metadata, nullable joins, driver types and transaction ownership are disclosed. `backend-toolbox.md:21` does not turn compilation into tenant-isolation or uniqueness proof. |
| Composer readiness/platform expansion | **Accept conditional selection.** `backend-toolbox.md:46-55` carries R38's concrete blockers: TODO modes, delegation pointers, adapter mismatch, CWD-relative writes, structured failure handling. R38:34,45-56,63-80 distinguishes useful generators/runtime implementations from non-installable glue. Selected-route qualification belongs to producer/bridge owner; neither catalog-wide repair nor new backend specialist platform follows. |
| Proof and code generation | **Accept narrow scope.** `backend-toolbox.md:36-38` and R43:41-43,75-81,100-115 distinguish Kani verification from synthesis, Verus supported spec compilation from arbitrary requirements, and Dafny proved source from generated target code. Assumptions, trusted translations, erased preconditions, bounds, toolchain trust and service-boundary limits remain visible. Proposed snippets are not recorded proof results. |
| Compiled validation | **Accept conditional value.** R44:40-52,71-87,108-112 discloses Ajv runtime helpers/dialects, typia transformation and version split, rejected v12 proto3 export, TypeBox external linkage and permissive unknown formats. `backend-toolbox.md:25,80` avoids duplicating existing schema validation merely to add tools. |
| Binary codecs | **Accept existing-format niche.** R45:18,44-50,60-67,77-83 distinguishes Kaitai parsing/writing targets, FlatBuffers structural verification and Cap'n Proto traversal checks. Framing, quotas, domain validation, lifetime and target-specific maturity remain handwritten/integration concerns. Round trips and direct access are not interoperability or universal zero-copy guarantees. |
| Version/runtime evidence | **Accept stated limits.** Target root `package.json:7,35-37,67,79,162` supports Bun 1.3.14, Effect beta.83 plus configured patch, TS 5.8.2. R39:20-27 and `backend-toolbox.md:90` explicitly prevent substituting newer reference APIs. Release pins elsewhere are research inputs, not an executed compatibility matrix. |

## What lead framing still risks missing

**Complete scope must not become upstream pre-programming.** R29:25-26 and R38:19 describe unusually detailed recipe packets. When extracting skills, retain reusable tool metadata in recipes; caller supplies task-specific behavior, external decisions, boundaries and acceptance. The backend specialist retains local coding choices. `backend-toolbox.md:75` and `README.md:86` already establish this distinction; no new architecture correction needed.

**“Highest-return” remains qualitative expectation.** Executable boilerplate removal is source-backed; net savings after packet preparation, wiring and maintenance remain unmeasured. `backend-toolbox.md:3,84` already qualifies this. Source-stage acceptance needs neither benchmarks nor tool installation.

**Research blockers do not authorize repair work.** Composer defects, proof tooling and codec options become implementation only through separately assigned scope. Existing ownership clauses already prevent treating reports as mandatory backlog.

## Targeted primary-source checks

- [typia v12.1.1 emitter](https://github.com/samchon/typia/blob/v12.1.1/packages/core/src/programmers/protobuf/ProtobufMessageProgrammer.ts): emits `proto3` plus `required` fields; supports R44's rejection, not runtime/protoc evidence.
- [Cap'n Proto v1.5.0 specimen](https://github.com/capnproto/capnproto/blob/v1.5.0/c%2B%2B/samples/addressbook.capnp): explicitly selects `addressbook` namespace; resolves concern about R45's callable names.
- [datamodel-code-generator 0.83.0 options](https://github.com/datamodel-code-generator/datamodel-code-generator/blob/0.83.0/docs/cli-reference/general-options.md): documents check/diff behavior claimed at R38:89.
- Target root manifest inspected directly for host-version distinction.

Source/document review only. No generator, solver, build, test, benchmark or installation executed. Only authored artifact: this `REVIEW.md`.
