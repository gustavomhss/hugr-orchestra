# R44 — compile contracts into executable validation/serialization

Research date: 2026-10-03. Evidence: official docs, versioned source, committed output snapshots, upstream test bodies. No installs, downloaded-code execution, builds, tests, config edits, or agents. Commands below are future recipes, not execution evidence. No performance claims.

## Decision
| Mechanism | Actual artifact | Value versus existing native validators | Verdict |
|---|---|---|---|
| Ajv 8.20.0 standalone | Importable `.cjs`/`.mjs` validator functions with structured errors | Turns already-chosen JSON Schema into deployable code; removes runtime schema compilation and handwritten predicates | **First choice when JSON Schema already owns semantics** |
| typia 12.1.1 AOT | Transformed TS, then JS predicates, JSON stringifiers, protobuf codecs/schema string | Reuses concrete TS types instead of maintaining runtime schemas; serializer generation adds distinct work savings | **Conditional: plain-TS contracts plus explicit generation step**; protobuf export rejected under this pin |
| TypeBox 1.3.34 Compile/Code | JIT Validator, or standalone ESM `Check`/`SetExternal` module | Standalone artifact is real; largely same validation savings as Ajv, with external-value handling | **Reserve for existing TypeBox stacks**; weak new adoption case |

MIT for all selected packages; Ajv formats recipe additionally pins `ajv-formats@3.0.1` (MIT). Versions verified in publisher registry records [V]. Native Zod/Effect schema validators already save handwritten guards and infer types: translating them to another schema does not create that saving again, and may lose refinements/transforms. Compiler/framework migration cost counts against value. No NestJS, compiler daemon, Python service, or framework adoption needed for these recipes.

## The backend specialist handoff contract
- Owner supplies chosen contract and dialect, required/optional/null semantics, numeric ranges, formats, unknown-key policy, coercion/default rules, reference graph, serialization projection, and error mapping. Example below: JSON object `Job`, required UUID `id`, required integer `attempts` in `[0,3]`, reject extras, no mutation/coercion/defaults.
- Owner supplies exact read/write allowlist: input entry/type files, generation directory, generator script, implementation glue, existing config, check fixture. Also exact Node/Bun/TS/package versions and already-approved build command. Example `r44/` paths below are recipe names, not new authorization.
- The backend specialist performs supplied generation, connects exports at supplied boundary, supplies output and check results. Missing compiler support, unresolved references, or semantic mismatch returns blocker to owner; discovery, diagnosis, architecture, permissions, harness changes, and toolchain migration stay owner-owned.
- Keep repo dependency direction: Schema → Core/Protocol → Server; Client cannot acquire Core/Server runtime imports. Public Protocol/Server `HttpApi` changes still require owner-authorized client generation; compiler adoption cannot bypass existing codegen ownership.

## 1. Ajv standalone — highest leverage with canonical JSON Schema
**Input → build:** draft-07 schema plus explicit options/ref/format inventory. Run `node r44/generate.cjs` with already-installed pins; library route avoids adding ajv-cli. Example generator:
```js
const fs = require("node:fs")
const Ajv = require("ajv")
const standaloneCode = require("ajv/dist/standalone").default
const addFormats = require("ajv-formats")
const schema = {
  $id: "urn:r44:Job", type: "object", required: ["id", "attempts"], additionalProperties: false,
  properties: { id: { type: "string", format: "uuid" }, attempts: { type: "integer", minimum: 0, maximum: 3 } }
}
const ajv = new Ajv({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false,
  removeAdditional: false, code: { source: true } })
addFormats(ajv)
fs.writeFileSync("r44/job.cjs", standaloneCode(ajv, ajv.compile(schema)))
```
**Produced code → glue:** `job.cjs` exports callable `validate(value): boolean`, also `.default`; each call sets `.errors` to error objects or `null`. Emission source literally constructs `module.exports = ${n};module.exports.default = ${n};` plus schema-specific JS function bodies; `n` is compiler-assigned [A1]. `require("./job.cjs")` in CJS or default-import from ESM; reject before business logic, copy errors before another call, map `instancePath`/`keyword` into supplied API error shape. JSON text parsing stays outside validator.

**Executable evidence:** [A2] generates source, loads it with `require-from-string` or `module-from-string`, then asserts numeric `0/1` accepted, `-1/"1"` rejected. Same file exercises multiple exports, mutually recursive refs, and email formats. Inspected executable emitter and consumer tests; did not generate local output. JS artifact does not itself emit TS declarations: use owner-supplied DTO/declaration adapter; a cast cannot prove schema/type equivalence.

**Constraints:** [A0–A4]
- `code.source: true` required; omitting it throws `moduleCode: ajv instance must have code.source option`. ESM needs `code.esm: true`, `.mjs`, valid export-name mapping for URI schema IDs. CJS chosen here also accommodates generated helper `require(...)`; ESM exports do not guarantee helper-free code.
- Generated code may require `ajv/dist/runtime/*` and format implementation modules. Ship matching dependencies or approved bundle; “standalone” means no Ajv instance/compilation at request time, not universally dependency-free.
- Draft choice matters: default Ajv is draft-07; 2020-12 requires `ajv/dist/2020`, not silently mixing dialects [A5]. Preload complete `$id`/`$ref` graph via `addSchema`; recursive schemas supported. Missing refs fail compilation; remote retrieval belongs to an explicitly supplied build input, not validator runtime.
- Extras allowed unless schema closes objects. Keep mutating options off; `removeAdditional`, `useDefaults`, `coerceTypes` mutate properties, cannot replace caller's root scalar, and introduce evaluation-order effects. Every nested object needs intended policy.
- Formats require supplied definitions (`ajv-formats` here); strict unknown formats fail compilation. Custom function formats need serializable `code.formats` linkage. Standalone supports `code`/`macro` keywords, not arbitrary `validate`/`compile` callbacks with captured state.
- JSON-Schema compiler enforces schema, not erased TS brands/business invariants. `JSONSchemaType<T>` needs strict null checking and cannot prove all union members were included [A4]. `properties` alone does not require fields; `required` does. Metadata such as `contentEncoding`/`contentMediaType` is not validation in this pin [A5].
- This artifact validates, **does not serialize**. Ajv `compileSerializer`/`compileParser` are separate JTD APIs; serializer assumes valid input and projects schema fields. Do not present JSON-Schema standalone as serializer generation or silently switch schema language [A3].

**Node + Bun:** upstream standalone tests demonstrate Node module loading; Bun explicitly supports CJS/ESM, npm resolution, and `node:fs` [B]. This source/API evidence supports running generator and emitted CJS under both; exact pinned application matrix remains unexecuted. No TS compiler transformer involved.

## 2. typia AOT — TS type is actual compiler input
**Version fork:** registry current is **15.1.0**, whose official setup requires TypeScript 7 + `ttsc >=0.19.2`; ordinary `tsc`, `tsx`, or Bun transpilation does not install this transform. Do not substitute that toolchain implicitly. Explicit legacy lane: **12.1.1**, peer TS `>=4.8.0 <7.0.0`; choose owner's existing supported version, strict null semantics, pinned transitive generator/runtime packages [T0,V].

**Input → build:** concrete resolvable type and factory calls in `r44/source/job.ts`:
```ts
import typia, { tags } from "typia"
export interface Job {
  id: string & tags.Format<"uuid"> & tags.Sequence<1>
  attempts: number & tags.Type<"uint32"> & tags.Maximum<3> & tags.Sequence<2>
}
export const check = typia.createEquals<Job>()
export const stringify = typia.json.createAssertStringify<Job>()
export const encode = typia.protobuf.createAssertEncode<Job>()
export const decode = typia.protobuf.createAssertDecode<Job>()
export const proto = typia.protobuf.message<Job>()
```
```sh
node node_modules/typia/lib/executable/typia.js generate --input r44/source --output r44/compiled --project tsconfig.json
bun build ./r44/compiled/job.ts --target node --format esm --packages external --outfile ./r44/job.mjs
```
**Produced code:** first command uses TS `createProgram`, explicitly invokes typia transformer, prints transformed `.ts` files; it does not emit final JS or perform a complete normal TS diagnostic pass [T1]. Second command only erases/bundles already-expanded code. Existing package `bun typecheck` remains separate. Consume `job.mjs` under Node/Bun; `typia/lib/internal/*` runtime helper imports remain with this external-packages recipe [T2,B]. No patched compiler/config needed for this explicit generation lane.

**Output inspection:** pinned `tests/test-unplugin/src/fixtures/__snapshots__/rollup/is.js` contains object/field predicates, UUID/email helper calls, and `19 < input.age && input.age <= 100`, replacing `createIs<IMember>()` [T2]. Current official stringify page displays `examples/bin/json/createAssertStringify.js`: `_io*` checks plus `_so*` JSON-template concatenation and string-escaping helpers; current example is separate evidence, not asserted byte-identical to v12 [T3]. Outputs are executable guards/string builders, not runtime schemas.

**Glue:** gate unknown request with `check`; only then call business code or serializer/encoder. `createAssertStringify` alone permits extras through its structural assertion and serializes declared fields; it is not closed-object admission. Send resulting string as response body, not through another JSON stringifier. Exported `proto` is schema text; writing `.proto` requires separate supplied file-write glue.

**Semantic/compiler limits:** [T4–T8]
- Concrete generic required. A generic wrapper calling `createIs<T>()` while `T` remains type parameter fails with `non-specified generic argument.` Imported/recursive TS shapes resolve through compiler graph; this is not runtime `$ref` loading. Regenerate when any contributing type changes.
- Validators do not coerce/default/prune. `is/assert/validate` allow extras; `equals/assertEquals/validateEquals` reject them. TS `number` does not imply integer, bounds, or finite value: `numeric`/`finite` defaults are false; chosen `Type<"uint32">` and `Maximum<3>` supply actual checks. Plain string does not imply UUID; `Format` tag supplies it.
- User classes checked structurally, not `instanceof`; function checking requires `functional: true` and cannot prove function behavior. Do not treat nominal brands/readonly/business logic as automatically enforceable constraints.
- Plain `json.stringify<T>` assumes valid input; assert/validate variants add validation. v12 JSON analyzer rejects bigint, Map, Set, unsupported native types, and undefined array/optional tuple elements; Date/`toJSON` are escaped representations, not lossless object round-trips. Recursive type support does not make cyclic object graphs JSON-serializable.
- Protobuf requires one static top-level object; excludes top-level primitives/arrays/unions/dynamic records, nested containers such as `number[][]`, union map values, `any`/unknown/functions, Date/Set, and binary classes other than Uint8Array. Numeric tags choose wire types; `Sequence<N>` fixes field numbers for evolution. Encode returns Uint8Array; decode returns `Resolved<T>`; format/range tags need checked variants. Decoder docs explicitly limit validation of arbitrary malformed/wrong-message bytes [T7].
- **Reject v12.1.1 `.proto` export for strict protoc consumers:** inspected emitter writes `syntax = "proto3";` yet emits `required string id = 1;` for required Job field [T8]. Official proto3 grammar permits only optional/repeated labels [P]. Source-level incompatibility, not locally reproduced compiler result. Do not repair wire semantics inside the backend specialist's implementation task.

**Failure/compatibility evidence:** untranslated factory reaches throwing stub; first error line for this recipe is exactly `Error on typia.createEquals(): no transform has been configured.` [T5]. Bun's own transpiler does not call TS transformers [B,T0]. Pregen JS uses published CJS/ESM helper exports; v12 also has explicit Bun plugin adapter, confirming plugin registration is a distinct path [T9]. Pregen avoids that adapter's config and compiler-service adoption costs, but still adds TS program construction, artifact freshness, helper pinning, and error-adapter work.

**Tests inspected:** `_test_is.ts` demands generated positives pass and mutated `SPOILERS` fail; `_test_json_stringify.ts` compares parsed output against native JSON serialization. `_test_protobuf_encode.ts` checks round-trips/bytes and compares protobufjs only when message contains neither `oneof` nor `int64` [T10]. That test is not protoc interoperability evidence.

## 3. TypeBox Compile/Code — real AOT export, weaker incremental value
Pin **`typebox@1.3.34`**, ESM-only; version table targets TS 6–7+. Distinguish maintained `@sinclair/typebox@0.34.52` LTS, TS 5–6, whose `TypeCompiler` API differs [X0,V]. Do not upgrade either TS or package namespace to get this example.

**Input → library → code:** `Compile(schema)` returns Validator with `Check`, `Errors`, `Parse`, `Code`, `IsAccelerated`; JIT uses Function constructor and falls back to interpreted checking when evaluation disabled. For actual file artifact use named **`Code(schema)`**, not Validator's `.Code()` function-body string [X1]. Minimal future generator, `node r44/typebox-build.mjs` or `bun r44/typebox-build.mjs`:
```js
import { writeFileSync } from "node:fs"
import { Code } from "typebox/compile"
const result = Code({ type: "string" })
writeFileSync("r44/string.mjs", result.Code)
```
Complete executable output reconstructed from pinned emitter for this minimal schema, comments/blank lines omitted; **not locally generated** [X1,X2]:
```js
import { Hashing } from "typebox/system"
import { Guard } from "typebox/guard"
let External = []
export function SetExternal(external) { External = external.variables }
const check_0 = ((value) => typeof value === "string");
export function Check(value) { return check_0(value) }
```
**Glue/limits:** import `{ Check }` from emitted `.mjs`; `Check("ok")` true, `Check(1)` false. Generated modules retain TypeBox helper imports; errors require separate schema-backed error handling. Supply complete reference context: unresolved `$ref` target becomes false rather than Ajv-style compile failure. `Check` does not coerce; `Clean/Convert/Default` and corrective `Parse` are distinct semantics. Extras need `additionalProperties:false`; integers/bounds/formats must be explicit.

**Important external boundary:** `Code` returns `{ Code, External }`; regex patterns and registered format/refinement functions can occupy `External.variables`. Consumer must call `SetExternal` with matching live values/order. JSON-stringifying this array loses RegExp/functions; reconstructing via `Code(schema)` at startup forfeits AOT compilation removal. Missing format emits `true` in inspected `BuildFormat`, so owner must supply format inventory and rejection fixtures [X3]. Do not sell arbitrary Code output as self-contained.

**Serialization/compatibility:** Validator `Encode/Decode` apply codecs/value validation, not generated JSON stringifiers or protobuf encoders [X1]. Published `.mjs` modules and Bun ESM/npm support provide Node/Bun loading evidence [B,V]; pinned upstream workflow inspected runs Deno, so not runtime-matrix proof. Compile tests inspect valid/invalid refs and coercion distinctions; Code tests inspect string source and external counts, not execution of saved modules [X4]. Adoption adds schema/API/TS constraints and external-value glue without stronger R44 savings than Ajv. Reject fresh migration; keep only existing-stack opportunity.

## Supplied acceptance checks — future execution, both exact owner-pinned runtimes
Let `U = "550e8400-e29b-41d4-a716-446655440000"`, `P = {id: U, attempts: 0}`. Run same emitted artifact and fixtures with `node r44/check.mjs` and `bun r44/check.mjs`; never substitute source-only validation. Job rows apply to Ajv/typia recipes; TypeBox minimal string artifact uses its own row. A separately chosen TypeBox Job implementation must satisfy Job rows too, including supplied format linkage.
| Check | Required observation |
|---|---|
| Positive and boundary | P and `{id:U,attempts:3}` accepted; same values and keys afterward |
| Negative fields/root | `{}`, `null`, `[]`, `{id:"bad",attempts:0}`, `{id:U,attempts:4}`, `{id:U,attempts:-1}`, `{id:U,attempts:0.5}`, `{id:U,attempts:"0"}`, `{...P,extra:true}` rejected; input unchanged |
| Non-JSON numeric boundary | `{id:U,attempts:NaN}` and Infinity rejected; numeric strings stay strings |
| Error/serialization | Ajv `"0"` produces `/attempts` + `type` error; next P resets errors to null. typia stringify(P) exactly `{"id":"550e8400-e29b-41d4-a716-446655440000","attempts":0}`; invalid range throws; strict admission rejects extras before projection |
| Compiler route control | Raw typia factory under plain Bun and transformer-free JS must throw exact missing-transform first line; generated artifact accepts P and rejects negatives. Unbound generic factory must fail generation |
| Ref/format control | Supplied recursive schema accepts valid child, rejects child wrong type; missing ref must be surfaced before handoff. Ajv unknown format fails build; TypeBox unknown format requires explicit owner inventory failure, not trusting Check |
| TypeBox artifact control | Minimal string module passes `"ok"`, rejects `1`; separate supplied pattern/format fixture exercises rehydrated externals in fresh process. Positive must fail if external linkage removed |
| Protobuf, if owner separately resolves pin issue | Accept golden bytes; cross-language decode/re-encode agrees; Sequence numbers survive type reorder. Reject invalid range and truncated bytes at supplied decode boundary; check supplied unknown-field/presence policy. Strict protoc must accept emitted schema; current v12 required-field schema is expected negative |
| Freshness/oracle control | Change supplied constraint `maximum:3`→2 or typia `Maximum<3>`→2, regenerate, require attempts=3 rejected. Always-true replacement must fail negative fixtures; always-false replacement must fail positives |

Bottom line: **save contract transcription and deployment compilation, not semantic decisions.** Existing native validators remain best default when runtime schema already owns behavior. Ajv wins existing JSON Schema; typia wins concrete TS-only source plus needed serializers; TypeBox adds little unless already adopted.

## Exact official sources / inspected paths
- [V] Publisher version/license/compiler metadata: https://registry.npmjs.org/ajv/8.20.0 ; https://registry.npmjs.org/ajv-formats/3.0.1 ; https://registry.npmjs.org/typia/12.1.1 ; https://registry.npmjs.org/typia/15.1.0 ; https://registry.npmjs.org/typebox/1.3.34 ; https://registry.npmjs.org/@sinclair/typebox/0.34.52
- [B] Bun module/runtime/build contract: https://bun.com/docs/runtime/module-resolution ; https://bun.com/docs/runtime/nodejs-compat ; https://bun.com/docs/bundler (TypeScript loader, target, format, packages sections).
- [A0] Standalone docs: https://ajv.js.org/standalone.html
- [A1] Emitter: https://github.com/ajv-validator/ajv/blob/v8.20.0/lib/standalone/index.ts ; generated function bodies: https://github.com/ajv-validator/ajv/blob/v8.20.0/lib/compile/validate/index.ts
- [A2] Executable consumer tests: https://github.com/ajv-validator/ajv/blob/v8.20.0/spec/standalone.spec.ts
- [A3] Mutation, formats, serializer API: https://github.com/ajv-validator/ajv/blob/v8.20.0/docs/guide/modifying-data.md ; https://github.com/ajv-validator/ajv/blob/v8.20.0/docs/guide/formats.md ; https://github.com/ajv-validator/ajv/blob/v8.20.0/docs/api.md
- [A4] TS constraints: https://github.com/ajv-validator/ajv/blob/v8.20.0/docs/guide/typescript.md
- [A5] Dialects/keyword semantics: https://github.com/ajv-validator/ajv/blob/v8.20.0/docs/json-schema.md
- [T0] Current/legacy setup: https://typia.io/docs/setup/ ; https://typia.io/docs/setup/legacy/
- [T1] CLI/generator: https://github.com/samchon/typia/blob/v12.1.1/packages/typia/src/executable/TypiaGenerateWizard.ts ; https://github.com/samchon/typia/blob/v12.1.1/packages/transform/src/TypiaGenerator.ts
- [T2] Pinned input/output: https://github.com/samchon/typia/blob/v12.1.1/tests/test-unplugin/src/fixtures/type.d.ts ; https://github.com/samchon/typia/blob/v12.1.1/tests/test-unplugin/src/fixtures/is.ts ; https://github.com/samchon/typia/blob/v12.1.1/tests/test-unplugin/src/fixtures/__snapshots__/rollup/is.js
- [T3] Rendered compiled stringifier: https://typia.io/docs/json/stringify/ (`examples/bin/json/createAssertStringify.js`); pinned API: https://github.com/samchon/typia/blob/v12.1.1/packages/typia/src/json.ts
- [T4] Generic diagnostic and validation semantics: https://github.com/samchon/typia/blob/v12.1.1/packages/transform/src/internal/GenericTransformer.ts ; https://github.com/samchon/typia/blob/v12.1.1/website/src/content/docs/validators/is.mdx ; https://github.com/samchon/typia/blob/v12.1.1/packages/core/src/programmers/helpers/OptionPredicator.ts
- [T5] Missing-transform stub: https://github.com/samchon/typia/blob/v12.1.1/packages/typia/src/transformers/NoTransformConfigurationError.ts
- [T6] JSON restrictions/emitter: https://github.com/samchon/typia/blob/v12.1.1/packages/core/src/factories/JsonMetadataFactory.ts ; https://github.com/samchon/typia/blob/v12.1.1/packages/core/src/programmers/json/JsonStringifyProgrammer.ts
- [T7] Protobuf limits/API: https://github.com/samchon/typia/blob/v12.1.1/website/src/content/docs/protobuf/message.mdx ; https://github.com/samchon/typia/blob/v12.1.1/packages/typia/src/protobuf.ts
- [T8] Protobuf schema emission/numbering: https://github.com/samchon/typia/blob/v12.1.1/packages/core/src/programmers/protobuf/ProtobufMessageProgrammer.ts ; https://github.com/samchon/typia/blob/v12.1.1/packages/interface/src/tags/Sequence.ts
- [T9] Explicit Bun plugin: https://github.com/samchon/typia/blob/v12.1.1/packages/unplugin/src/bun.ts
- [T10] Validation/stringify/protobuf test bodies: https://github.com/samchon/typia/blob/v12.1.1/tests/test-typia-automated/src/internal/_test_is.ts ; https://github.com/samchon/typia/blob/v12.1.1/tests/test-typia-automated/src/internal/_test_json_stringify.ts ; https://github.com/samchon/typia/blob/v12.1.1/tests/test-typia-automated/src/internal/_test_protobuf_encode.ts
- [P] Proto3 normal-field grammar: https://protobuf.dev/reference/protobuf/proto3-spec/#normal_field
- [X0] TypeBox versions: https://github.com/sinclairzx81/typebox/blob/1.3.34/readme.md#versions
- [X1] TypeBox artifact/Validator/JIT: https://github.com/sinclairzx81/typebox/blob/1.3.34/src/compile/code.ts ; https://github.com/sinclairzx81/typebox/blob/1.3.34/src/compile/validator.ts ; https://github.com/sinclairzx81/typebox/blob/1.3.34/src/schema/build.ts
- [X2] Exact simple output derivation: https://github.com/sinclairzx81/typebox/blob/1.3.34/src/schema/engine/_functions.ts ; https://github.com/sinclairzx81/typebox/blob/1.3.34/src/schema/engine/schema.ts ; https://github.com/sinclairzx81/typebox/blob/1.3.34/src/guard/emit.ts
- [X3] External/format/ref behavior: https://github.com/sinclairzx81/typebox/blob/1.3.34/src/schema/engine/_externals.ts ; https://github.com/sinclairzx81/typebox/blob/1.3.34/src/schema/engine/format.ts ; https://github.com/sinclairzx81/typebox/blob/1.3.34/src/schema/engine/ref.ts
- [X4] Tests/workflow: https://github.com/sinclairzx81/typebox/blob/1.3.34/test/typebox/runtime/compile/compile.ts ; https://github.com/sinclairzx81/typebox/blob/1.3.34/test/typebox/runtime/compile/module.ts ; https://github.com/sinclairzx81/typebox/blob/1.3.34/.github/workflows/build.yml
