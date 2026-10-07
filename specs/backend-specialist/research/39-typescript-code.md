# R39 — TypeScript/JavaScript server-side implementation mechanisms

Research date: 2026-10-03. Evidence: primary docs, version-tagged source, release records, package metadata, licenses. Source inspection only; examples and acceptance checks below remain unexecuted.
Code fragments show composition boundaries; schema/service/auth symbols and imports come from prescribed packet, not generated implementations.

## Selection

| Rank | Mechanism | Use when packet already selects | Concrete value |
| --- | --- | --- | --- |
| 1 | Effect Schema + HttpApi | Existing Effect v4 backend; host target | One schema vocabulary drives decoded inputs, typed handlers, response codecs, declared errors and HTTP routes. |
| 2 | Hono + Standard Schema + Zod | Existing Hono HTTP endpoint; Zod directly for plain JS | Small request-validation boundary; same schema runs in JavaScript without compiler plugins. |
| 3 | ts-rest | Existing REST contract and supported server, Express examined here | Contract determines method/path, handler argument types and response unions; library mounts implementations. |
| 4 | next-safe-action | Existing Next App Router Server Actions | Composes validated action inputs/outputs, typed auth context and structured action results. |

The backend specialist receives exact runtime/package versions, prescribed contract, named files/mountpoints, supplied auth/domain-service interfaces and package-local acceptance commands. The backend specialist implements that packet. Stack selection, project discovery, diagnosis, scope/grants and agent-runtime/persistence/cache/compaction reconstruction stay upstream.
Native libraries provide leverage here. API/SQL generators belong to other lanes. Framework migration or extra adapter solely to claim tool coverage disqualifies fit. ts-rest replaces neither host Effect nor existing Hono; Next actions require an action contract already selected upstream.

## Version evidence and traps

- Host `package.json:34-36,66,160`: `effect`, `@effect/platform-node`, `@effect/sql-sqlite-bun`, `@effect/opentelemetry` pin **4.0.0-beta.83**. Bun package manager **1.3.14**, TypeScript catalog **5.8.2**. These are manifest facts, not observed runtime versions.
- Available Effect reference `packages/effect/package.json:4` says **4.0.0-beta.98**. Reference API examples cannot replace beta.83 evidence. Beta.83 release, 2026-06-12, specifically fixes public HttpApi declaration metadata exports. [E1]
- Host additionally applies `patches/effect@4.0.0-beta.83.patch`: SSE JSON-string wrapper gets distinct `${identifier}Stream` OpenAPI identity. Exact target means **beta.83 plus host patch**, including generation behavior.
- Host catalogs `hono@4.10.7`, `@hono/standard-validator@0.2.0`, `zod@4.1.8`. Also catalogs `@hono/zod-validator@0.4.2`; that adapter declares Zod peer **^3.19.1**, outside host Zod 4. Use prescribed Standard Schema path or direct parsing. [H2][H3]
- ts-rest GitHub latest stable record is **3.52.1** (2025-03-04); Standard Schema/Zod 4 support belongs to **3.53.0-rc.1** (2025-06-02). Express 5 support also lands in that RC. Pin core and Express packages together; use RC only when packet explicitly selects it. [T1]
- RC-tag source manifests still say `3.52.1`; published registry metadata confirms both packages at `3.53.0-rc.1`, with Express adapter requiring matching core. Record this release-process mismatch rather than guessing version from one manifest. [T3]
- next-safe-action examined at **8.7.3**, released 2026-09-07. Package requires Node >=18.17, Next >=14 and React/React DOM >=18.2; docs require App Router and TS >=5. Actual Next/runtime pins remain packet inputs; their own requirements also apply. v7 adapter examples differ from v8 Standard Schema API. [N1][N3]
- Live Zod docs advertise 4.6; host stays **4.1.8**. Examples here use tagged `safeParse`, `safeParseAsync`, `trim`, `min`, `max`, `parse`; live-doc additions do not establish target support. [Z]

## Fixed comparison acceptance fixture

Illustrative packet, not proposed host feature: authenticated profile rename. Production packet supplies its own exact fixtures and error envelopes.

- HTTP contract: `PATCH /profile`, JSON `{ displayName: string }`; trim then require 1–60 UTF-16 code units. Discard unknown fields. Auth principal supplies user ID.
- Output: `{ userId: string, displayName: string, updatedAt: string }`, timestamp UTC ISO-8601. Existing repository returns `Date`; manual DTO mapping calls `toISOString()`.
- Manual business rule: normalized name exactly `admin` produces prescribed reserved-name error before repository write. Existing `profiles.rename(userId, displayName)` supplies storage operation.
- Positive case: authenticated `u1`, `{ "displayName": "  Ada  " }` → HTTP 200, persisted name `Ada`, DTO for `u1`, timestamp matching fixture repository/clock.
- Negative cases: number, blank or 61-character name → 400; unauthenticated valid body → 401; `admin` → 409. These cases must leave stored profile unchanged. Extra `userId: "u2"` must not change target identity.
- Output probe: deliberately invalid service DTO must fail output contract. Output validation runs after business work; it cannot undo committed writes. Error status follows supplied mapper; do not assume every validation failure is client error.
- Next variant is prescribed separately: `renameProfile(input)` returns `{ data }`, `{ validationErrors }` or mapped `{ serverError }`. Same domain cases; action envelopes replace HTTP-status assertions. A fixed REST path/status requirement excludes this variant.

## 1. Effect Schema + HttpApi — highest host leverage

**Packet files:** schema DTO in `packages/schema/src/profile.ts`; business rule in `packages/core/src/profile.ts`; endpoint/group in `packages/protocol/src/groups/profile.ts`; handler in `packages/server/src/handlers/profile.ts`; supplied API/layer mountpoints; `packages/server/test/profile.test.ts`. Filenames illustrate the closed packet, not repository discovery.
**Composition:** prescribed fields/refinements/transforms → `Schema.Struct`/codecs → `HttpApiEndpoint.patch` → `HttpApiGroup.make(...).add(...)` → `HttpApi.make(...).add(...)` → `HttpApiBuilder.group(..., handlers => handlers.handle(...))` → `HttpApiBuilder.layer(Api)` in existing server bootstrap. Import HTTP API modules from **`effect/unstable/httpapi`**. [E1][E2]

```ts
import { HttpApiEndpoint } from "effect/unstable/httpapi"

export const rename = HttpApiEndpoint.patch("rename", "/profile", {
  payload: RenameInput,
  success: ProfileOutput,
  error: [BadInput, Unauthorized, ReservedName],
})
```

Snippet assumes packet-supplied schemas with prescribed status annotations. Implement group handler with named Effect service bindings for authenticated principal and profile service, then call service using decoded `payload`; wire required layers explicitly.
**Produced:** inferred decoded handler types and service requirements; type-level missing-handler detection; runtime request decoding, middleware invocation, response/error encoding and route registration. `OpenApi.fromApi` derives specification data. These mechanisms compose executable routes; they do not generate business implementation files. [E1][E2]
**Manual:** reserved-name rule, repository call, actor binding, public DTO projection, domain-error/status mapping and existing bootstrap integration.
**Limits:** beta.83 endpoint constructors apply JSON/string-tree codecs unless `disableCodecs: true`. Verify wire representation after transformation, especially dates/query values. `handleRaw` skips automatic payload decoding; returning `HttpServerResponse` skips normal success-schema encoding. Schema/security declarations describe boundaries; supplied middleware performs credential verification and authorization. [E1][E2]
**Error trap:** beta.83 builder promotes unhandled `HttpApiSchemaError` to defect. `HttpApiMiddleware.layerSchemaErrorTransform` supplies explicit mapping. Host already wires `SchemaErrorMiddleware` and maps through `packages/server/src/middleware/schema-error.ts`; preserve packet-prescribed semantics, including output failures, rather than assuming generic automatic 400. [E2][E3]
**Acceptance/checks:** exercise fixture through actual mounted HttpApi with auth/error layers, inspect decoded payload and encoded DTO. Later run `bun typecheck` inside each changed package and focused server test. Public Protocol/Server HttpApi changes require `bun run generate` from `packages/client`, then client checks; generated directories remain generator-owned. Legacy JS SDK regeneration, when required, uses `./packages/sdk/js/script/build.ts`.
**Dependency direction:** Schema supplies Core/Protocol; Server composes them. Client runtime can consume Schema/Protocol, never Core/Server. Keep domain implementations downstream of contract declarations.

## 2. Hono + Standard Schema + Zod — thin HTTP and useful plain JS

**Pins:** host-matched Hono **4.10.7**, Standard Validator **0.2.0**, Zod **4.1.8**. Validator manifest declares `@standard-schema/spec: 1.0.0` peer and Hono >=3.9.0. Match existing lock/runtime; Bun host catalog is not proof of Node deployment behavior. [H1][H2][Z]
**Packet files:** `src/profile.schema.ts`, `src/profile.service.ts`, `src/routes/profile.ts`, supplied existing app mountpoint, `test/profile.test.ts`; plain-JS counterpart uses `.js`.
**Composition:** prescribed contract → Zod schema → `sValidator("json", schema, hook)` → typed `c.req.valid("json")` → manual service → explicit output parse → `c.json`. Schema and hook are native library calls. [H1][H2]

```ts
const RenameInput = z.object({ displayName: z.string().trim().min(1).max(60) })
app.patch("/profile", requireUser, sValidator("json", RenameInput, validationHook), async (c) => {
  const result = await rename(c.get("user").id, c.req.valid("json"))
  return c.json(ProfileOutput.parse(result), 200)
})
```

`requireUser`, `validationHook`, `rename`, output schema and error handler follow supplied packet contracts. Hook must return prescribed 400 response on invalid input; output parse failures use supplied server-error mapping.
**Produced:** runtime validation/transformation and typed access to validated inputs. Route types can support Hono RPC inference; `c.json`/RPC types alone do not validate response payloads. Bun can serve existing `app.fetch`; Node uses existing server integration, whose runtime/version must already be selected. [H1][H4]
**Manual/limits:** auth and reserved-name rule remain code. Standard Schema is an interface; runtime enforcement comes from calling validator implementation. Validator 0.2.0 awaits `schema["~standard"].validate(value)` and returns parsed value. Default failure response includes submitted `data`; custom hook establishes packet error envelope. JSON/form parsing requires matching content type; missing/mismatched header feeds `{}` to validator. Header keys are lowercase. [H1][H2][S]
**Plain JS:** same Zod 4.1.8 schema runs in `.js`: call `RenameInput.safeParse(body)`, branch on `success`, pass **`result.data`** to business code, then parse public output. Use `safeParseAsync` for async refinements. `z.infer` is compile-time only; parsing performs runtime work. Existing Node/Bun handler owns body parsing, HTTP errors and JSON serialization; adding Hono is unnecessary for this variant. [Z]
**Acceptance/checks:** `app.request("/profile", { method: "PATCH", headers, body })` exercises composed middleware; include `Content-Type: application/json`. Cover missing header, raw invalid JSON, unauthenticated input, trim, forged user ID and invalid output. Later run packet-local typecheck/focused tests plus selected-runtime HTTP acceptance. Native JS test entry can use `node --test test/profile.test.js` or packet-selected Bun equivalent; inference tests cannot replace those requests.

## 3. ts-rest — prescribed REST contract into typed implementation

**Pins/fit:** examined `@ts-rest/core` and `@ts-rest/express` **3.53.0-rc.1**, Zod **4.1.8**, packet's existing Express 4/5 and Node/runtime pins. Stable-only packet must stay within its stable contract/schema support. No conversion of host Effect/Hono routes to Express. [T1][T3]
**Packet files:** `src/contracts/profile.ts`, `src/profile.service.ts`, `src/routes/profile.ts`, supplied Express mountpoint, `test/profile.test.ts`.
**Composition:** fixed HTTP contract → `initContract().router(...)` with real schemas → `initServer().router(contract, implementations)` → `createExpressEndpoints(...)` on existing app. Existing JSON body parser precedes endpoints. [T1][T2]

```ts
const c = initContract()
const contract = c.router({
  rename: {
    method: "PATCH", path: "/profile", body: RenameInput,
    responses: { 200: ProfileOutput, 400: BadInput, 401: Unauthorized, 409: ReservedName },
  },
}, { strictStatusCodes: true })
const router = initServer().router(contract, { rename: renameHandler })
createExpressEndpoints(contract, router, app, {
  responseValidation: true, globalMiddleware: [requireUser], requestValidationErrorHandler: invalidRequest,
})
```

**Produced:** inferred request/response types and registered routes; handler returns prescribed `{ status, body }` union. `initServer().router` is runtime identity; route registration and schema calls supply execution. Client signatures are inferred from contract; source generation is unnecessary. [T2]
**Manual:** `renameHandler` calls domain service, binds actor from verified request context, maps reserved-name outcome and serializes DTO. Auth middleware/error responses sent directly through Express need their own contract checks.
**Limits:** `c.type<T>()` supplies types, not runtime validator. Response validation defaults **false**; enable exact option `responseValidation`, despite prose on Express docs mentioning `validateResponses`. `strictStatusCodes` narrows types; client runtime unknown-status enforcement separately needs `throwOnUnknownStatus`. [T1][T2]
**RC boundary:** validation utility throws **"Schema validation must be synchronous"** for Promise results. Keep async auth/database work in handler/middleware, not schema refinements. Express streaming branch bypasses ordinary response validation. Standard Schema validates/transforms values but does not define JSON encoding: Date/BigInt/custom class serialization still needs prescribed DTO mapping. [T2]
**Acceptance/checks:** exercise real mounted endpoint and parser, not only direct router function. Invalid JSON/type, auth, trim, reserved-name and output probes must reach expected mapper. Later run packet-local typecheck, exact focused tests and HTTP acceptance under selected deployment runtime. RC compatibility remains execution evidence to collect.

## 4. next-safe-action — existing Next server-action packet only

**Pins/fit:** next-safe-action **8.7.3**, Zod **4.1.8**, packet's exact Next/React/runtime pins satisfying requirements above. Server-side action composition is evaluated; client hooks are outside this packet. [N1]
**Packet files:** `src/lib/safe-action.ts`, `src/profile.schema.ts`, `src/profile.service.ts`, `src/app/profile/actions.ts`, `test/profile-action.test.ts`; supplied existing action integration fixture.
**Composition:** `createSafeActionClient({ handleServerError })` → `.use(...)` for supplied session verification/context → `.inputSchema(RenameInput)` → `.outputSchema(ProfileOutput)` → `.action(...)`. Export action from `"use server"` module. [N1][N2]

```ts
"use server"

export const renameProfile = authClient
  .inputSchema(RenameInput)
  .outputSchema(ProfileOutput)
  .action(async (input) => rename(input.ctx.user.id, input.parsedInput))
```

**Produced:** callable server action, inferred input/context/output, runtime parsing and structured result. Next build supplies Server Action transport; library does not produce REST endpoints or business code. Input failures skip action body. In 8.7.3, output parsing replaces raw result with parsed value, including transforms/defaults. [N2]
**Manual/limits:** supply auth and domain rule, safe error mapping and DTO projection. `.use()` runs before validation and receives untrusted input; use `parsedInput` inside action, or `.useValidated()` when prescribed authorization requires validated fields. Output schema is optional; inferred return type alone is not enforcement. v8 uses Standard Schema directly, unlike v7 adapter examples. [N2][N3]
**Serialization:** React Server Functions support more than JSON, including Date and BigInt, but restrict arbitrary class instances/functions. Schema acceptance does not prove React wire compatibility. Follow packet's DTO contract; converting a FormData submission into object-shaped input also needs an explicit selected mapping. [N4]
**Acceptance/checks:** positive case asserts `result.data`; invalid name asserts `validationErrors`; missing session/reserved name asserts prescribed `serverError`. Verify persisted owner and invalid-output behavior. Direct action tests cover library pipeline; supplied Next build/integration test must cover actual action transport/serialization. Later run package-local `bun typecheck`, existing `bun run build` script and supplied action tests.

## Evidence ledger — primary sources

- Local host root: `/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical`. Inspected `package.json`, Effect patch, `packages/protocol/src/api.ts`, Protocol/Server `middleware/schema-error.ts`. Available reference: `/Users/gustavoschneiter/.local/share/orchestra/repos/github.com/Effect-TS/effect-smol/packages/effect/package.json`.
- [E1] Effect beta.83 [release](https://github.com/Effect-TS/effect-smol/releases/tag/effect%404.0.0-beta.83), [endpoint API/source](https://raw.githubusercontent.com/Effect-TS/effect-smol/effect%404.0.0-beta.83/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts), [MIT license](https://raw.githubusercontent.com/Effect-TS/effect-smol/effect%404.0.0-beta.83/LICENSE).
- [E2] Exact beta.83 [HttpApiBuilder source](https://raw.githubusercontent.com/Effect-TS/effect-smol/effect%404.0.0-beta.83/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts): `Handlers.ValidateReturn`, `handlerToHttpEffect`, `decodePayload`, response encoders.
- [E3] Exact beta.83 [HttpApiMiddleware source/docs](https://raw.githubusercontent.com/Effect-TS/effect-smol/effect%404.0.0-beta.83/packages/effect/src/unstable/httpapi/HttpApiMiddleware.ts): `Service`, `layerSchemaErrorTransform`.
- [H1] Hono [validation docs](https://hono.dev/docs/guides/validation), [4.10.7 validator source](https://raw.githubusercontent.com/honojs/hono/v4.10.7/src/validator/validator.ts), [release](https://github.com/honojs/hono/releases/tag/v4.10.7), [MIT license](https://raw.githubusercontent.com/honojs/hono/v4.10.7/LICENSE).
- [H2] Standard Validator 0.2.0 [source](https://raw.githubusercontent.com/honojs/middleware/%40hono%2Fstandard-validator%400.2.0/packages/standard-validator/src/index.ts), [release](https://github.com/honojs/middleware/releases/tag/%40hono%2Fstandard-validator%400.2.0), [manifest/peers/MIT declaration](https://raw.githubusercontent.com/honojs/middleware/%40hono%2Fstandard-validator%400.2.0/packages/standard-validator/package.json). Standalone license text not retrieved; license evidence here is tagged package declaration.
- [H3] Zod Validator 0.4.2 [tagged peer manifest](https://raw.githubusercontent.com/honojs/middleware/%40hono%2Fzod-validator%400.4.2/packages/zod-validator/package.json).
- [H4] Hono [Bun integration/testing docs](https://hono.dev/docs/getting-started/bun); only basic `app.fetch` mechanism used here, not newer adapter examples.
- [Z] Zod [basic parsing docs](https://zod.dev/basics), [4.1.8 source](https://raw.githubusercontent.com/colinhacks/zod/v4.1.8/packages/zod/src/v4/classic/schemas.ts), [release](https://github.com/colinhacks/zod/releases/tag/v4.1.8), [MIT license](https://raw.githubusercontent.com/colinhacks/zod/v4.1.8/LICENSE).
- [S] [Standard Schema specification](https://standardschema.dev/schema): validator interface, inferred input/output and sync/async result semantics; specification itself is not validation engine.
- [T1] ts-rest [quickstart](https://ts-rest.com/quickstart), [contract docs](https://ts-rest.com/contract/overview), [Express docs](https://ts-rest.com/server/express), [stable release](https://github.com/ts-rest/ts-rest/releases/tag/v3.52.1), [RC release](https://github.com/ts-rest/ts-rest/releases/tag/v3.53.0-rc.1).
- [T2] RC [Express implementation](https://raw.githubusercontent.com/ts-rest/ts-rest/v3.53.0-rc.1/libs/ts-rest/express/src/lib/ts-rest-express.ts), [validation utilities](https://raw.githubusercontent.com/ts-rest/ts-rest/v3.53.0-rc.1/libs/ts-rest/core/src/lib/standard-schema-utils.ts), [MIT license](https://raw.githubusercontent.com/ts-rest/ts-rest/v3.53.0-rc.1/LICENCE).
- [T3] Published RC metadata: [core](https://registry.npmjs.org/@ts-rest/core/3.53.0-rc.1), [Express](https://registry.npmjs.org/@ts-rest/express/3.53.0-rc.1); compare [RC-tag core manifest](https://raw.githubusercontent.com/ts-rest/ts-rest/v3.53.0-rc.1/libs/ts-rest/core/package.json).
- [N1] next-safe-action [quickstart](https://next-safe-action.dev/docs/quick-start), [8.7.3 release](https://github.com/next-safe-action/next-safe-action/releases/tag/next-safe-action%408.7.3), [manifest/peers](https://raw.githubusercontent.com/next-safe-action/next-safe-action/next-safe-action%408.7.3/packages/next-safe-action/package.json), [MIT license](https://raw.githubusercontent.com/next-safe-action/next-safe-action/next-safe-action%408.7.3/LICENSE).
- [N2] [Client API](https://next-safe-action.dev/docs/api/create-safe-action-client), [builder methods](https://next-safe-action.dev/docs/api/safe-action-client), [8.7.3 action-builder source](https://raw.githubusercontent.com/next-safe-action/next-safe-action/next-safe-action%408.7.3/packages/next-safe-action/src/action-builder.ts).
- [N3] Official [v7→v8 migration](https://next-safe-action.dev/docs/migrations/v7-to-v8): Standard Schema switch and `inputSchema` naming.
- [N4] React primary [Server Function serialization contract](https://react.dev/reference/rsc/use-server#serializable-parameters-and-return-values).

**Execution evidence still required:** compile against actual selected lockfile, run supplied positive/negative acceptance fixtures through mounted runtime, inspect serialized response/action result. Library source supports mechanism claims; it does not establish a passing implementation or measured speedup.
