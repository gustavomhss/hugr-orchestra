# R29 — supplied HTTP contract → implementation code

**Pick four stack-specific recipes:** ogen for Go transport + validators; Orval for TypeScript fetch + Zod; OpenAPI Generator's Spring interface-only target for Java; Kiota for C# outbound SDKs. Value: generated executable plumbing, omitted boilerplate, compiler-enforced interfaces. Maestro preselects recipe; the backend specialist does not choose architecture.
**Role boundary:** the backend specialist receives complete scope, interfaces, authorized paths, stack/version, dependencies and prescribed checks. The backend specialist implements supplied work; does not investigate, diagnose, discover projects, expand scope or manage grants. Harness already owns persistence/cache/compaction; native Atlas owns Knowledge/Memory.
**Evidence date: 2026-10-03.** Official release metadata, docs, selected source/templates/tests inspected. Commands, generated fixture outputs and acceptance cases below are prospective: no installation, generator execution, compilation or tests run. Live docs can drift; SHA-pinned source controls version-specific claims.

## Inspected pins and licenses

GitHub release tags resolved to these commits; openapi-typescript's own package release selected, rather than monorepo's unrelated latest openapi-react-query release.

| Project / release | Release date | Inspected commit | Tool license |
|---|---|---|---|
| ogen v1.24.0 | 2026-08-07 | `0d865e7e568f1b36e5e6788e39aa5cd14e02999f` | [Apache-2.0](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/LICENSE) |
| Orval v8.39.0 | 2026-09-30 | `f5555fcd394e716926b7cdcb0feb3839ffcfd6ac` | [MIT](https://github.com/orval-labs/orval/blob/f5555fcd394e716926b7cdcb0feb3839ffcfd6ac/LICENSE) |
| OpenAPI Generator v7.25.0 | 2026-08-24 | `ef964b04480889ef86b56cfae84ade8ad4c91c41` | [Apache-2.0](https://github.com/OpenAPITools/openapi-generator/blob/ef964b04480889ef86b56cfae84ade8ad4c91c41/LICENSE) |
| Kiota v1.35.0 | 2026-09-04 | `114aa7ee609262d892fd9ceb02b2d9f7ecb84190` | [MIT](https://github.com/microsoft/kiota/blob/114aa7ee609262d892fd9ceb02b2d9f7ecb84190/LICENSE) |
| TypeSpec typespec-stable@1.16.0; openapi3 package 1.16.0 | 2026-09-09 | `54d93a99737da023ed2cf8479b9573f73683b84d` | [MIT](https://github.com/microsoft/typespec/blob/54d93a99737da023ed2cf8479b9573f73683b84d/LICENSE) |
| oapi-codegen v2.8.0 | 2026-07-17 | `de2d8b2b0afb287198554eb305bb0d2687d26a85` | [Apache-2.0](https://github.com/oapi-codegen/oapi-codegen/blob/de2d8b2b0afb287198554eb305bb0d2687d26a85/LICENSE) |
| openapi-typescript 7.13.0 | 2026-02-11 | `5709d33a5977c4908b9e331f01cd0f9e181b1c37` | [MIT](https://github.com/openapi-ts/openapi-typescript/blob/5709d33a5977c4908b9e331f01cd0f9e181b1c37/packages/openapi-typescript/LICENSE) |

**Generated-code licensing:** OpenAPI Generator explicitly says templates retain project license, while generated code is user-owned and intentionally not subject to parent license ([pinned statement](https://github.com/OpenAPITools/openapi-generator/blob/ef964b04480889ef86b56cfae84ade8ad4c91c41/README.md#34---license-information-on-generated-code)). Inspected materials establish tool licenses for others, but do not establish equivalent output exceptions. Do not infer output licensing from generated headers alone; runtime dependencies and copied template/support code retain their own terms.

## Exact common input packet and fixture

Packet supplies: working directory; local `contract.yaml` plus every referenced file and content hashes; chosen operation set; exact generator artifact/path; toolchain and runtime lockfiles; supplied recipe config; replaceable generated root; handwritten implementation paths; naming/base URL/auth/error decisions; exact generation, compile and contract-check commands. Missing packet item or unsupported contract returns blocker to Maestro, rather than triggering the backend specialist discovery.
Below recipes assume preprovisioned binaries/JAR and dependencies. All recipe configs are supplied inputs, not files created during this research. Ordinary native Read → CLI/Bash → Read/diff → apply_patch on handwritten implementation → prescribed checks suffices; no agent framework, MCP wrapper or generation service needed.

Shared `contract.yaml`:
```yaml
openapi: 3.0.3
info: { title: Widget API, version: 1.0.0 }
servers: [{ url: 'https://api.example.test' }]
paths:
  /widgets:
    post:
      operationId: createWidget
      tags: [Widgets]
      requestBody:
        required: true
        content:
          application/json: { schema: { $ref: '#/components/schemas/Widget' } }
      responses:
        '201':
          description: Created
          content:
            application/json: { schema: { $ref: '#/components/schemas/Widget' } }
        '400':
          description: Invalid input
          content:
            application/json: { schema: { $ref: '#/components/schemas/Problem' } }
components:
  schemas:
    Widget:
      type: object
      required: [name, quantity]
      properties:
        name: { type: string, minLength: 1, maxLength: 80 }
        quantity: { type: integer, format: int32, minimum: 1 }
    Problem: { type: object, required: [message], properties: { message: { type: string } } }
```
Acceptance payloads: **V** = `{"name":"bolt","quantity":1}`; **I** = `{"name":"","quantity":0}`. I is structurally well-typed but violates schema bounds. File names below follow inspected templates/docs; this fixture was not generated here.

## 1. ogen — strongest Go transport/validation generation

- **INPUT:** common packet; ogen 1.24.0; Go ≥1.25.0 according to [pinned go.mod](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/go.mod), despite quick-start's Go 1.24 tool-directive example. Lock generated runtime imports, including ogen and jx. Supply `recipes/ogen.yml`: `generator: {features: {enable: ["client/request/validation", "server/response/validation"]}}`.
- **OPERATION:** `ogen --config recipes/ogen.yml --target gen/go --package api contract.yaml`.
- **OUTPUT/payoff:** `gen/go/oas_schemas_gen.go`, `oas_server_gen.go`, `oas_client_gen.go`, `oas_router_gen.go`, `oas_handlers_gen.go`, `oas_json_gen.go`, `oas_validators_gen.go`, request/response encoders/decoders and supporting files. Produces typed `Handler`, static routing, parameter/body decoding, JSON codecs, response variants and executable validation. Avoids hand-writing both transport directions.
- **The backend specialist implements:** Handler methods, business rules, storage/transactions, server startup, security callbacks when contract declares security, and prescribed error-envelope mapping. Wire implementation with `api.NewServer(handler)` into existing `net/http` host; generated client uses `api.NewClient(baseURL)`.
- **Validation boundary:** server request decoding invokes generated `Validate()`. Client-request and server-response validation are separate opt-in features, enabled by recipe above; not defaults. Direct struct assignment is not validation. Generated default error handler uses `error_message`, not fixture's `Problem.message`.
- **Constraints/failure:** Go-specific runtime/types; unsupported constructs or ambiguous union discrimination can fail IR construction. Do not use `ignore_not_implemented: ["all"]` to silently omit supplied operations. Browser spec validator intentionally ignores unsupported operations and is not generation acceptance evidence.
- **Acceptance:** raw JSON POST V reaches implemented handler and returns 201; raw POST I returns 400 before handler/storage executes. Error adapter must make body match `Problem`. Use raw HTTP for this server check so generated client's own validation cannot mask server behavior.
- **Source-inspected evidence:** [quick start/output inventory](https://ogen.dev/docs/intro), [actual generated decoder](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/internal/integration/sample_api/oas_request_decoders_gen.go#L40-L95), [feature defaults](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/gen/features.go), [valid/invalid constraint tests](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/internal/integration/validate_test.go), [400 decode error](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/ogenerrors/ogenerrors.go), [default envelope](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/ogenerrors/handler.go).

## 2. Orval — TS fetch implementation plus actual Zod validators

- **INPUT:** common packet; Orval 8.39.0; Node ≥22.18.0 ([package requirement](https://github.com/orval-labs/orval/blob/f5555fcd394e716926b7cdcb0feb3839ffcfd6ac/packages/orval/package.json)); supplied compatible TypeScript/Zod 4 lock. Project-root `orval.config.ts`:
```ts
import { defineConfig } from 'orval';
export default defineConfig({ widgets: {
  input: './contract.yaml',
  output: {
    target: './gen/ts/client.ts', mode: 'single', client: 'fetch',
    baseUrl: 'https://api.example.test',
    schemas: { path: './gen/ts/models', type: 'zod', mode: 'single' },
    override: { zod: { version: 4 }, fetch: { runtimeValidation: true, forceSuccessResponse: true } },
  },
} });
```
- **OPERATION:** `./node_modules/.bin/orval --config orval.config.ts` from supplied project root.
- **OUTPUT/payoff:** `gen/ts/client.ts` supplies `createWidget`, URL construction, JSON serialization, status/header handling; `gen/ts/models/index.zod.ts` supplies reusable schemas such as `Widget`, derived input/output types and operation schemas. Eligible successful JSON responses call generated schema `.parse()`; avoids separate handwritten fetch and schema layers.
- **The backend specialist implements:** business handlers, auth/header injection per supplied design, timeout/error handling and explicit request validation. Example native-library glue: `const body = Widget.parse(raw); await createWidget(body)`. Backend route may use same schema before invoking domain code; recipe does not generate that route.
- **Validation boundary:** fetch runtime validation defaults off. This recipe enables response parsing; request body bounds still require the backend specialist's explicit `Widget.parse`. `forceSuccessResponse` throws for non-2xx before success-schema parsing; does not establish typed/validated `Problem` handling. Custom mutators own their request path and bypass generated parsing.
- **Constraints/failure:** primitive/non-JSON/NDJSON responses and some array shapes skip automatic validation. Zod target must match installed major. Selected tests explicitly emit `zod.unknown()` for missing dynamic anchors; successful generation is not proof of complete JSON Schema semantics. Keep supplied dialect/construct acceptance cases.
- **Acceptance:** `Widget.safeParse(V).success` true; same call on I false. Independently, test endpoint returning 201 + I with `Content-Type: application/json` must reject generated client's promise, proving response parse wiring rather than merely type-checking payload.
- **Source-inspected evidence:** [pinned schema-output config](https://github.com/orval-labs/orval/blob/f5555fcd394e716926b7cdcb0feb3839ffcfd6ac/docs/content/docs/reference/configuration/output.mdx), [fetch source: validation condition and request serialization](https://github.com/orval-labs/orval/blob/f5555fcd394e716926b7cdcb0feb3839ffcfd6ac/packages/fetch/src/index.ts#L575-L602), [parse/mutator/array tests](https://github.com/orval-labs/orval/blob/f5555fcd394e716926b7cdcb0feb3839ffcfd6ac/packages/fetch/src/index.test.ts#L377-L610), [constraint-emission and missing-anchor tests](https://github.com/orval-labs/orval/blob/f5555fcd394e716926b7cdcb0feb3839ffcfd6ac/packages/zod/src/zod.test.ts), [public Zod guide](https://orval.dev/docs/guides/zod).

## 3. OpenAPI Generator / Spring — compile-enforced Java implementation seam

- **INPUT:** common packet; CLI JAR 7.25.0; supplied JDK 17/Spring Boot 3 stack with Jackson, Jakarta Validation API and runtime provider such as Hibernate Validator. Generator itself documents Java 11 minimum; chosen Boot stack needs higher baseline. `recipes/spring.json`:
```json
{"interfaceOnly":true,"skipDefaultInterface":true,"useSpringBoot3":true,
 "useBeanValidation":true,"openApiNullable":false,"useTags":true,
 "annotationLibrary":"none","documentationProvider":"none",
 "apiPackage":"backend.http.api","modelPackage":"backend.http.model",
 "hideGenerationTimestamp":true,"disallowAdditionalPropertiesIfNotPresent":false}
```
- **OPERATION:** `java -jar /tools/openapi-generator-cli-7.25.0.jar generate -g spring --library spring-boot -i contract.yaml -c recipes/spring.json -o gen/spring --global-property apis,models,apiDocs=false,modelDocs=false,apiTests=false,modelTests=false`.
- **OUTPUT/payoff:** `gen/spring/src/main/java/backend/http/api/WidgetsApi.java`, `.../model/Widget.java`, `.../model/Problem.java`, plus generator metadata. Generates request mappings, method signatures, DTO/Jackson code, `@Valid`, `@NotNull`, `@Size` and `@Min` constraints. `skipDefaultInterface=true` removes placeholder default methods, making missing handler implementation a compile error.
- **The backend specialist implements:** handwritten `@RestController` implementing `WidgetsApi`, service/repository logic, generated-source build inclusion, validation provider wiring, security and exception-to-Problem mapping. Native CLI produces isolated source root; existing compiler/host consumes it.
- **Validation boundary:** `useBeanValidation=true` emits annotations, not standalone validator execution. Spring binding/validation provider must invoke them. Direct `new Widget()` and arbitrary method calls need not validate; response annotation presence does not establish response validation.
- **Constraints/failure:** target-specific mappings differ; broad generator catalog is not uniform capability. Boot/Jakarta vs older javax stacks must match. Composition/nullability/additional-properties semantics need supplied checks; recipe disables JsonNullable because fixture has no nullable fields, not as universal mapping policy.
- **Acceptance:** completed controller + active provider accepts POST V with 201; POST I produces 400/Problem before service invocation. Separate compiler check: concrete controller omitting `createWidget` must fail, confirming stub defaults do not hide unfinished implementation.
- **Source-inspected evidence:** [pinned target options](https://github.com/OpenAPITools/openapi-generator/blob/ef964b04480889ef86b56cfae84ade8ad4c91c41/docs/generators/spring.md), [constraint template](https://github.com/OpenAPITools/openapi-generator/blob/ef964b04480889ef86b56cfae84ade8ad4c91c41/modules/openapi-generator/src/main/resources/JavaSpring/beanValidationCore.mustache), [default-interface switch](https://github.com/OpenAPITools/openapi-generator/blob/ef964b04480889ef86b56cfae84ade8ad4c91c41/modules/openapi-generator/src/main/java/org/openapitools/codegen/languages/SpringCodegen.java#L807-L813), [request-body annotation test](https://github.com/OpenAPITools/openapi-generator/blob/ef964b04480889ef86b56cfae84ade8ad4c91c41/modules/openapi-generator/src/test/java/org/openapitools/codegen/java/spring/SpringCodegenTest.java#L3132-L3162), [public target docs](https://openapi-generator.tech/docs/generators/spring/).

## 4. Kiota / C# — generated outbound request builders and serializers

- **INPUT:** common packet; Kiota 1.35.0; supplied .NET 8+ project/tool runtime. [Pinned CLI project](https://github.com/microsoft/kiota/blob/114aa7ee609262d892fd9ceb02b2d9f7ecb84190/src/kiota/kiota.csproj) targets net8/9/10; [language metadata](https://github.com/microsoft/kiota/blob/114aa7ee609262d892fd9ceb02b2d9f7ecb84190/src/kiota/appsettings.json) marks CSharp stable and lists Microsoft.Kiota.Bundle 2.0.0, or corresponding abstractions/HTTP/serialization packages. Actual dependency restore compatibility untested here.
- **OPERATION:** `kiota generate --openapi contract.yaml --language CSharp --class-name WidgetClient --namespace-name backend specialist.Generated --output gen/csharp`.
- **OUTPUT/payoff:** `gen/csharp/WidgetClient.cs`, `Widgets/WidgetsRequestBuilder.cs`, `Models/Widget.cs`, `Models/Problem.cs`, `kiota-lock.json`. Generates `client.Widgets.PostAsync(...)`, URL/request construction, `IParsable` serializers/deserializers, factories and declared error mappings. Eliminates per-endpoint HTTP/JSON SDK glue while sharing request-adapter infrastructure.
- **The backend specialist implements:** request-adapter/auth-provider construction, application calls, supplied timeout/retry/error policies and request/domain validation. Fixture glue: `new WidgetClient(new HttpClientRequestAdapter(new AnonymousAuthenticationProvider()))`; use supplied provider for secured API. Include generated sources in existing project.
- **Validation boundary:** inspected C# property writer emits ordinary properties; method writer serializes values and delegates HTTP to `RequestAdapter`. This does not enforce `minLength`/`minimum`. Kiota's generation-time OpenAPI validation rules are not runtime payload validators.
- **Constraints/failure:** runtime libraries required; use Kiota serialization rather than assuming native JSON serialization preserves discriminator behavior. Multiple success shapes, missing discriminators and unsupported formats need packet-specific handling. Object `oneOf` requires discriminator per model docs; source generation is not schema-conformance certification.
- **Acceptance:** `new Widget { Name = "bolt", Quantity = 1 }` compiles and supplied endpoint can return V through `PostAsync`; `Name = true` must fail C# compilation. Bounds-invalid I still fits generated types and remains serializable: server or the backend specialist's explicit validator must reject it. Declared 400 response generates Problem error mapping, not server-side validation.
- **Source-inspected evidence:** [CLI](https://learn.microsoft.com/en-us/openapi/kiota/using), [model rules](https://learn.microsoft.com/en-us/openapi/kiota/models), [property writer](https://github.com/microsoft/kiota/blob/114aa7ee609262d892fd9ceb02b2d9f7ecb84190/src/Kiota.Builder/Writers/CSharp/CodePropertyWriter.cs), [request/serialization writer](https://github.com/microsoft/kiota/blob/114aa7ee609262d892fd9ceb02b2d9f7ecb84190/src/Kiota.Builder/Writers/CSharp/CodeMethodWriter.cs#L431-L537), [writer assertions for send/error maps](https://github.com/microsoft/kiota/blob/114aa7ee609262d892fd9ceb02b2d9f7ecb84190/tests/Kiota.Builder.Tests/Writers/CSharp/CodeMethodWriterTests.cs#L449-L483).

## Screened alternatives — valid tools, weaker or redundant default here

### TypeSpec: retain only when supplied contract already uses TypeSpec
- **Packet → operation → output:** complete `main.tsp` service, locked compiler/http/openapi libraries and `@typespec/openapi3` 1.16.0, Node ≥22 → `tsp compile main.tsp --emit=@typespec/openapi3` → default `tsp-output/@typespec/openapi3/openapi.yaml` (OpenAPI 3.0.0 default). Native compiler diagnoses contract types; downstream preselected generator still produces backend/client code, the backend specialist still implements service.
- **Acceptance/boundary:** `quantity: int32` compiles into integer/int32 schema; unknown type `quantity: Strnig` must fail compilation. OpenAPI-emitter output itself does not validate HTTP payload I. Actual [model tests](https://github.com/microsoft/typespec/blob/54d93a99737da023ed2cf8479b9573f73683b84d/packages/openapi3/test/models.test.ts#L13-L73) assert schema output and duplicate-name diagnostics.
- **Reject as default extra hop:** supplied OpenAPI already suffices; adopting another contract language would exceed the backend specialist's recipe. TypeSpec does have direct code emitters: [JS server README](https://github.com/microsoft/typespec/blob/54d93a99737da023ed2cf8479b9573f73683b84d/packages/http-server-js/README.md) explicitly calls itself highly experimental; [C# emitter](https://github.com/microsoft/typespec/blob/54d93a99737da023ed2cf8479b9573f73683b84d/packages/http-server-csharp/README.md) offers mock business implementations, not real business logic. [OpenAPI emitter options](https://github.com/microsoft/typespec/blob/54d93a99737da023ed2cf8479b9573f73683b84d/packages/openapi3/README.md).

### oapi-codegen: substitute for existing Go router stack, not additional generator
- **Packet → operation → output:** contract + locked Go/runtime stack + `recipes/oapi.yaml` containing `{package: api, output: gen/api.gen.go, generate: {models: true, std-http-server: true, strict-server: true, client: true, embedded-spec: true}}` → `oapi-codegen -config recipes/oapi.yaml contract.yaml` → `gen/api.gen.go` with types, strict request/response interfaces, net/http adapters, client and embedded spec.
- **The backend specialist/integration/acceptance:** implement `StrictServerInterface`, bind generated wrappers, supply prescribed validation middleware and business code. `Widget{Name: "bolt", Quantity: 1}` type-checks; `Widget{Name: true, Quantity: 1}` fails. Bounds-invalid I is not rejected merely because `strict-server` is enabled. Strictness improves method/response typing, not comprehensive request validation.
- **Reject duplicate Go slot:** ogen better matches compiled-validation goal; existing router fit can make this preferable when Maestro specifies it. Current 2.8.0 supports OpenAPI 3.1, including documented nullability/webhook handling; old “3.0 only” rejection is stale. Cross-spec strict response refs require destination strict generation or emitted code can fail compilation. [Pinned README/validation limits](https://github.com/oapi-codegen/oapi-codegen/blob/de2d8b2b0afb287198554eb305bb0d2687d26a85/README.md#requestresponse-validation-middleware), [exact config schema](https://github.com/oapi-codegen/oapi-codegen/blob/de2d8b2b0afb287198554eb305bb0d2687d26a85/configuration-schema.json).

### openapi-typescript: type-only fallback when transport already supplied
- **Packet → operation → output:** contract + locked Node/TypeScript stack + openapi-typescript 7.13.0 → `./node_modules/.bin/openapi-typescript contract.yaml -o gen/schema.d.ts` → `paths`, `components`, `operations` declarations. Native compiler consumes them; the backend specialist still writes or uses prescribed transport, validation and backend implementation.
- **Acceptance/boundary:** `const x: components["schemas"]["Widget"] = {name: "bolt", quantity: 1}` type-checks; `name: true` fails. I remains type-correct; declarations add no runtime rejection. Separate openapi-fetch can use generated paths, but is another supplied runtime, not emitted endpoint/validator implementation.
- **Reject duplicate TS slot:** excellent low-runtime-cost type synchronization, weaker output than Orval for this task's client-plus-validator requirement. Supports OpenAPI 3.0/3.1. [Official scope: runtime-free types](https://openapi-ts.dev/introduction), [pinned string/enum type-output tests](https://github.com/openapi-ts/openapi-typescript/blob/5709d33a5977c4908b9e331f01cd0f9e181b1c37/packages/openapi-typescript/test/transform/schema-object/string.test.ts).

## Decision and blocked assumptions

Maestro selects one recipe matching already-decided stack; the backend specialist executes it and implements remaining seams. No generator credited with business rules, transactions, authorization decisions or database persistence. Compile success alone cannot certify wire validation; generated examples/mocks are not behavior tests. Complete OpenAPI/JSON Schema dialect coverage, supplied-contract compatibility, dependency resolution and runtime acceptance remain unproven until prescribed checks actually run. All testing evidence in this report is **source-inspected, not executed**.
