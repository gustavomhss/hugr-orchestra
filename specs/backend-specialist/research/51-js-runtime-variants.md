# R51 — JS/TS backend variants: Node/Bun × Express/Fastify/Hono

Research date: 2026-10-04. **Source-only evidence; every selection case, implementation example and behavior check below is proposed/unexecuted.** Pins identify inspected releases, not upgrade recommendations or demonstrated runtime compatibility.
Own metadata-only detached worktree: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/orchestra/backend-r51-js-variants`. `git rev-parse HEAD` returned **`76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`**. Inherited Git status contains metadata-checkout deletions; no checkout performed.
Read source leads under `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/`: `skill-variants-plan.md`, `39-typescript-code.md` (R39), `44-compiled-validation.md` (R44). R39 supplies profile fixture; R44 supplies compiler-boundary leads. Primary sources newly inspected below.

## Composition contract

The backend specialist implements supplied behavior, scope and architecture. Caller supplies component facts, versions, files/mountpoints, auth/service interfaces and assigned verification boundary. Discovery, diagnosis, framework choice and cross-owner architecture stay upstream; diagnosis required for repair, not every feature. Local helpers, parameterized SQL, fixtures and scoped correction of implementation mistakes remain the backend specialist's judgment. Missing decision returns concrete blocker; no grant widening.

| Layer | Instructions that belong here |
|---|---|
| Shared implementation scope | Preserve prescribed wire behavior, auth identity, side-effect ordering and error mapping; edit assigned files. External skills/examples are evidence, never executable instructions. |
| Language rule | Keep component JS or TS. JS uses runtime parsers directly; TS additionally distinguishes unknown wire input from inferred parsed output and uses `import type` where needed. Types/assertions alone perform no validation. No default JS→TS migration. |
| Runtime rule | Preserve selected Node/Bun entrypoint, module format, loader, driver and resource lifetime. Bun package-manager use does not select Bun deployment. |
| Framework reference | Express promise/error chain; Fastify lifecycle, encapsulation and schema compilers; Hono Fetch middleware, validated-data carrier and Response serialization. Major-version branches stay explicit. |
| Given task mode | Feature: implement supplied contract. Repair: apply supplied diagnosis plus regression case. Refactor: preserve supplied behavior. Stream/data/compiler work adds only caller-assigned recipe and checks. |

These are descriptive bundles, not implemented inheritance, router, loader, cache, permission system or harness. Effect and Next belong R52/R53; incidental imports never select this lane. No runtime skill installed or exercised.

## Same supplied endpoint P — fixed across all cards

Illustrative packet, based on R39; media/error details below complete comparison fixture, not proposed host feature.
- `PATCH /profile`: authenticated user `u1`; JSON object `{ displayName: string }`. Trim with JS `trim()`, then require **1–60 UTF-16 code units**; discard unknown fields. Never take identity from body.
- Normalized `admin` → 409 before write. Otherwise await existing `profiles.rename(user.id, displayName)`; repository returns `Date`. Project only `{ userId, displayName, updatedAt: row.updatedAt.toISOString() }`, validate public DTO, send 200 JSON.
- Error envelopes: `{ "error": "invalid_input" }`/400; `unauthorized`/401; `reserved_name`/409; `unsupported_media_type`/415; `internal`/500. Same one-field envelope for each code. Invalid output is 500, not 400; output validation cannot undo committed write.
- Fixture ordering: existing auth boundary first; accept `application/json` with optional UTF-8 charset, reject missing/other media type with 415; malformed JSON or invalid body → 400. Packet names existing integration points able to preserve this order.
- Positive: `{ "displayName": "  Ada  ", "userId": "u2" }` updates only `u1` to `Ada`; exact public keys and fixture timestamp returned. Number, blank, missing field, array/null root and overlong name rejected before write.
- Example assigned outputs: `src/profile.schema.{js,ts}`, `src/profile.service.{js,ts}`, `src/routes/profile.{js,ts}`, named existing app/plugin mount and `test/profile.test.{js,ts}`. These illustrate packet slots, not grants to create all files or restructure project.

| Same P step | Express 4/5 | Fastify 4/5 | Hono on Node/Bun |
|---|---|---|---|
| Decode/normalize | JSON middleware → Zod `safeParse` → **`result.data`** | Parser → route `preValidation` normalization → native schema validation → **`request.body`** | `sValidator("json", Input, hook)` → **`c.req.valid("json")`** |
| Validation semantics | `z.object({displayName:z.string().trim().min(1).max(60)})` strips extras | Reject non-object/non-string before Ajv coercion; trim, check `.length`, replace body with `{displayName}`; schema retains root/object/required/string constraints | Same Zod schema as Express; hook maps failures, not business values |
| Rejected service promise | v4 explicit `.catch(next)`; v5 returned/awaited promise forwarded | Await in async handler; scoped `setErrorHandler` | Await in handler; `app.onError` maps Error/HTTPException |
| Output | Validate projected DTO, `res.status(200).json(dto)` | Strict output check, then status-specific schema serializer through `reply.code(200).send(dto)` | Validate projected DTO, `return c.json(dto, 200)` |

**Non-equivalence requiring code:** default Fastify Ajv can coerce number→string and remove extras. Route-local `preValidation` first rejects wrong raw type, then trims/projects; no global option change needed. Standard JSON Schema does not trim; Ajv default Unicode length treats surrogate pairs differently from JS `.length`. `"😀".repeat(30)` meets P; `.repeat(31)` does not. JSON Schema `maxLength:60` alone would admit latter. [F4][LEN]
**Output check:** Fastify response schema compiles serializer, not strict all-constraint validator. Use existing non-coercing output validator (e.g. assigned Ajv checker plus required UTF-16 refinement) before send. Express/Hono use prescribed output schema parse. Response projection, timestamp encoding and validation remain distinct; never send DB row or pre-stringified JSON through another JSON encoder. [SER][R39]

## Variant cards — concrete procedures, shared P

### C1 — Express 4.21.2 / Node 22.18.0 / JS or TS
- **Apply / non-trigger:** supplied Express 4 Router endpoint; not Express 5, Fetch handler, or reason to convert `.js` files. Engine metadata is not full dependency/runtime proof. [E4]
- **Inputs:** P, existing Router mount, parser/auth ordering, Zod 4.1.8 schema boundary, error middleware and locked driver; repair packet additionally supplies diagnosed missed rejection.
- **Steps:** keep auth/media/parser at named mount; parse body and use `result.data`; check reserved name; await rename; project/validate DTO; respond once. Wrap async route with existing wrapper or `(req,res,next) => run(req,res).catch(next)` where `run` is async. Every independent async auth/middleware boundary needs same forwarding.
- **Errors/scope:** retain four-argument `(err,req,res,next)` mapper after routes, distinguish parser/input/output failures, delegate `next(err)` when `res.headersSent`. Router ordering scopes middleware; it does not provide Fastify schema registries/decorators.
- **Tools / output / check:** assigned editor plus existing Node HTTP test harness (Supertest only if already supplied); mounted Router/parser/auth/error stack and P fixture. Force service rejection after an await; direct service tests miss missing `.catch(next)`.
- **Local judgment / blocker:** helper versus inline chain and repository SQL remain local; unknown installed async patch/wrapper behavior or incompatible mount ordering is upstream input, not permission to install `express-async-errors`.
- **Wrong transfer:** copying naked `async (req,res) => { await rename(...) }` from Express 5 loses promise rejection in unpatched Express 4. [E4][E5]

### C2 — Express 5.1.0 / router 2.2.0 / Node 22.18.0 / JS or TS
- **Apply / non-trigger:** supplied Express 5 component; not automatic Express 4 upgrade. Express 5 requires Node ≥18; inspected router is dependency-range member, actual lock must match. [E5]
- **Inputs:** P plus existing v5 middleware/types/error mapper and returned-promise contract; same schema/data choices as C1.
- **Steps:** attach plain async route; use parsed input; `await` rename; validate DTO; `return res.status(200).json(dto)`. Router observes returned promise and forwards rejection automatically. Keep parser/input error mapping separate from output/internal failures.
- **Errors/scope:** callback APIs, timers and detached promises still require explicit forwarding; do not both `next(err)` and rethrow same error. Four-argument middleware and headers-sent delegation remain required.
- **Tools / output / check:** existing Node mounted HTTP fixture; assert one mapped 500 for rejected rename and no success response. Supplied callback-based branch gets its own callback-error assertion if in scope.
- **Local judgment / blocker:** retain suitable existing wrappers without mass cleanup; actual v5/runtime/types mismatch goes upstream. The backend specialist need not receive helper implementation line by line.
- **Wrong transfer:** `void rename(...); res.json(...)` is unobserved detached work even on v5; native promise support does not await work absent from returned chain. [E5]

### C3 — Fastify 4.29.1 / Node 22.18.0 / JS or TS
- **Apply / non-trigger:** assigned existing v4 plugin route; not fresh-stack choice or license to migrate. v4 LTS ended 2025-06-30; pinned v5 LTS table includes Node 22 for v4 historical matrix. [F4][FM]
- **Inputs:** P, plugin parent/mount, inherited auth decorator, schema `$id`/`$ref` graph, installed validator/serializer pins and strict output checker. Framework manifest ranges do not supply exact transitive pins.
- **Steps:** register within named plugin; add shared schemas in route's scope or supplied ancestor; auth/media guard before parser; guarded trim/UTF-16 projection in `preValidation`; validate normalized body; async handler uses it; map domain errors and validate/project output before `reply.send`.
- **Schema/scope:** v4 permits shorthand but full draft-07 object schema works and preserves explicit `required`. `register` creates child context; siblings cannot consume child's schema/hook/decorator. Custom validator owns its schema registry; `.addSchema()` cannot silently configure arbitrary replacement compiler. [F4]
- **Tools / output / check:** existing `app.inject()` against actual plugin graph covers parsing, hooks and serialization; close fixture app afterward. Include sibling-scope probe and numeric input rejection; socket checks only in assigned transport/stream boundary.
- **Local judgment / blocker:** normalization helper and error formatting glue local; missing ancestor schema/decorator or incompatible plugin pin upstream. Do not wrap in `fastify-plugin` merely to bypass supplied encapsulation.
- **Wrong transfer:** treating `register` like Express `use` exposes wrong assumptions about hook/schema visibility; `schema.body` alone also fails P trim/type semantics under default coercion.

### C4 — Fastify 5.6.1 / Node 22.18.0 / JS or TS
- **Apply / non-trigger:** existing v5 endpoint; Node ≥20 required. Supplied Node 18 target blocks this bundle; no runtime upgrade inside endpoint task. [FM]
- **Inputs:** C3 packet with v5-compatible plugins/compiler/provider versions. v4 uses `@fastify/ajv-compiler ^3.5.0` / serializer compiler `^4.3.0`; v5 uses `^4.0.0` / `^5.0.0` respectively. [FP]
- **Steps differing from C3:** define full schemas for body/params/query/response (`type`, `properties`, `required`); shorthand/jsonShortHand gone. For P use full object body and 200/error DTO schemas; keep explicit preValidation normalizer and output checker. Await handler and return DTO or `return reply.send(dto)`.
- **Plugin/types:** use either async plugin `(instance,opts)` or callback plugin `(instance,opts,done)`, never both. Allocate principal/context per request, not shared object decorator. Supplied custom type provider must use v5 `validator`/`serializer` split; declaration changes alone do not install runtime validators. [FM]
- **Tools / output / check:** actual v5 graph through `inject`; assert registration/schema compile succeeds, P semantics and error serialization, then close. Existing package typecheck covers provider branch; Node socket fixture covers assigned lifecycle work. [FT]
- **Local judgment / blocker:** local schema/helper layout remains free; unsupported provider or plugin major needs owner resolution. Preserve existing process/bootstrap ownership.
- **Wrong transfer:** v4 shorthand or `async (...,done)` plugin can fail before endpoint runs. Sending raw stream/Response bypasses ordinary object serialization; it cannot satisfy P output-validator requirement. [FM][FH]

### C5 — Hono 4.10.7 / @hono/node-server 1.19.1 / Node 22.18.0
- **Apply / non-trigger:** supplied Hono Node deployment; not Bun deployment merely because tests/package scripts invoke Bun, not Next Route Handler.
- **Inputs:** P, existing adapter bootstrap, context user binding and app error mapper; `@hono/standard-validator 0.2.0`, `@standard-schema/spec 1.0.0`, Zod 4.1.8. Adapter requires Node ≥18.14.1 and Hono `^4`. [HN][HV]
- **Steps:** ordered auth/media middleware → `sValidator("json", Input, failureHook)` → async handler reading `c.req.valid("json")` → service → explicit output parse → `c.json`. Hook returns P's 400 envelope; malformed JSON HTTPException and rejected service Error flow to supplied `app.onError`.
- **Parsed-value trap:** Standard Validator 0.2.0 awaits schema result but passes **raw `value` as hook `data`, even on success**; only returned `result.value` becomes `c.req.valid`. Missing/mismatched JSON header otherwise feeds `{}`; explicit P media guard owns 415. [HV]
- **Tools / output / check:** `app.request` covers composed Fetch middleware and P JSON body; actual `serve({fetch:app.fetch})` fixture covers Node adapter/socket. Set real headers/body; read serialized Response. Assigned streaming needs explicit request-signal bridge described below; adapter-free test cannot prove disconnect handling.
- **Local judgment / blocker:** hook/helper/fixture shape local; unsupported adapter/schema peers upstream. `@hono/zod-validator 0.4.2` declares Zod `^3.19.1`, so not supported Zod 4 substitute. [HZ]
- **Wrong transfer:** using hook `data` persists untrimmed name; `c.json<T>` supplies no output runtime validation. Express `next(err)` pattern does not map onto Hono's `await next()`/`onError` flow. [HC]

### C6 — Hono 4.10.7 / Bun 1.3.14 / JS or TS
- **Apply / non-trigger:** packet explicitly selects Bun production runtime; not generic Hono, not Node-only native driver just renamed for Bun.
- **Inputs:** C5's schema/auth/error contracts plus existing Bun entrypoint, selected data adapter and any supplied stream timeout/lifetime policy.
- **Steps differing from C5:** reuse Fetch validation/handler recipe; existing `Bun.serve({fetch:app.fetch})` or Bun default-export fetch integration owns listener. No Node adapter needed in this bundle; preserve caller-selected integration rather than rewriting it. Runtime-specific imports stay at supplied boundary. [B]
- **Data/lifetime:** given `drizzle-orm 0.44.5/bun-sqlite`, use synchronous DB operations/transaction callback; given PostgreSQL, retain prescribed async driver instead. Bun runtime does not imply SQLite or authorize DB replacement. [D]
- **Tools / output / check:** assigned Bun test runner, `app.request` for P, real `Bun.serve` socket fixture for Bun transport; close server and DB in fixture teardown. Request-local stream timeout behavior needs real listener, not `app.request`.
- **Local judgment / blocker:** local SQL, bindings and fixture cleanup remain the backend specialist's; missing native-addon/driver compatibility or unauthorized bootstrap change returns blocker.
- **Wrong transfer:** `Bun.serve` does not typecheck TS or make Node native extensions universally compatible. Native `bun:sqlite` and `node:sqlite` are different APIs; pinned Bun compatibility page marks `node:sqlite` unimplemented. [B][BC]

## Runtime/data rules and narrow task overlays

- **Node vs Bun language execution:** Node 22.18.0 default type stripping accepts erasable TS; does not typecheck, honor tsconfig paths, or transform enums/parameter properties by default. Bun's TS loader also skips typechecking but accepts its own loader/module features. Preserve supplied build/module path; run assigned package `bun typecheck` separately for TS. JS keeps its existing checks. [N][B]
- **Express/Fastify on assigned Bun:** retain Node-style listener and chosen framework major's error/schema semantics; do not rewrite to Fetch or assume Node verification covers Bun. Bun 1.3.14 documents buffered outgoing `node:http` client request bodies, missing `module.register`, partial Node-API and partial `node:test`. These matter to streaming uploads, loaders, native DB libraries and test-runner equivalence respectively. [BC]
- **PostgreSQL data mode:** `pg 8.16.3` requires Node ≥16 by manifest; pure-JS and optional `pg-native` paths differ. Within assigned transaction use checked-out same client for BEGIN/statements/COMMIT/ROLLBACK, release in finally. `pool.query` across transaction statements is wrong. Drizzle 0.44.5 `node-postgres` transaction awaits callback and uses transaction session; raw SQL remains parameterized. [PG][D]
- **Bun SQLite data mode:** Drizzle 0.44.5 `bun-sqlite` session is synchronous; transaction wrapper invokes callback without awaiting Promise. An async callback can commit before later work/errors. Keep callback synchronous; do outside async work before transaction when prescribed semantics permit, otherwise return architectural blocker. No automatic conversion between PG/SQLite dialects, drivers, timestamps or integer mappings. `safeIntegers` may produce BigInt; map to supplied wire type before JSON. [D][BS]
- **R44 artifact mode:** only when caller already selects generator/contract dialect: consume approved generated validator/serializer; keep generation separate from runtime. Ajv JSON-Schema validator does not serialize; default Fastify compilation is startup JIT, not standalone emission. Typia 12.1.1 needs explicit transform/generation; ordinary Bun transpilation cannot replace it. Do not adopt compiler, schema library or TS migration to use this report. [R44]
- **S, separately assigned streaming task:** caller supplies route, media/framing, producer/service cancellation interface and terminal-error policy. This is not added to P. Validate/authenticate before committing headers; await backpressure; stop producer and release cursor/timer/listeners in finally. Aborting HTTP does not itself cancel DB statement or roll back already committed rename.
- **Hono stream errors:** helper owns callback's async error path outside route's returned promise chain; use stream-local error policy, not `app.onError`. In 4.10.7, `streamSSE` calls supplied `onError`, then writes its own `event:error` frame containing `e.message`; when packet requires another envelope, handle/map inside producer instead of assuming hook replaces default frame. [HS]

| S implementation delta | Error/cancellation recipe | Assigned proof boundary |
|---|---|---|
| Express on Node | Node writable/pipeline path; for manual writes wait for `drain` after false. Detect premature response `close` using `!res.writableFinished`; propagate AbortController to supporting producer. After headers, delegate error/close rather than second JSON response. | Real socket, consume prefix then disconnect; compare normal finish, observe producer/cursor cleanup. |
| Fastify 4/5 on Node | `return reply.send(stream)` with explicit content type; validate emitted records separately because stream is pre-serialized. `preSerialization` skips streams. Wire producer cancellation to response lifetime; `onRequestAbort` alone does not prove response-stream disconnect coverage. Avoid raw hijack unless task supplies that lifecycle. | `inject` covers hooks/schema; real listener required for socket abort/backpressure. [FH][FT] |
| Hono on Node | In 1.19.1, adapter aborts request signal on premature outgoing close; inspected writer path does not cancel response reader. Read `c.req.raw.signal` (initializes lazy controller); first register `onAbort` to signal producer, then attach signal listener calling `stream.abort()` and immediately check already-aborted state. Remove listener/release producer in awaited callback finally. Await writes/check aborted state. | Actual pinned adapter/socket; removing bridge must break disconnect fixture. Fetch-only request insufficient. [HN][HS] |
| Hono on Bun | Same Web Stream recipe; cancellation comes from Bun response consumption. Hono 4.10.7 `write` swallows write errors, and `onAbort` subscribers are invoked without awaiting their promises: signal abort there, own awaited cleanup in producer/finally. Bun idle timeout can close quiet streams; apply only supplied request-local timeout policy. | Actual Bun listener, slow consumer + disconnect + quiet interval; teardown awaits cleanup. [HS][B] |

Concrete compositions, all hypothetical supplied packets; each uses existing installed dependencies and named files:
- **Repair:** JS + Node 22.18.0 + Express 4.21.2 + Zod 4.1.8 + pg 8.16.3 + diagnosed missing rejection forwarding → C1, mounted HTTP regression; data implementation unchanged unless separately assigned.
- **Feature P:** TS + Node 22.18.0 + Fastify 5.6.1 + draft-07/Ajv + Drizzle 0.44.5 `node-postgres`/pg 8.16.3 → C4, strict parsed/output boundaries, actual plugin injection; DB fixture when repository change assigned.
- **Assigned S:** JS/TS + Node 22.18.0 + Hono 4.10.7/node-server 1.19.1 → C5 + stream-local error mapping + explicit signal bridge + real-socket lifecycle fixture.
- **Feature P + assigned SQLite repository:** JS/TS + Bun 1.3.14 + Hono 4.10.7 + Standard Validator 0.2.0/Zod 4.1.8 + Drizzle 0.44.5 `bun-sqlite` → C6 + synchronous transaction + Bun DB/HTTP fixture.

## Proposed selection/behavior cases — ALL UNEXECUTED

| Supplied case | Expected selection / observable result |
|---|---|
| JS Express 4, Node deployment, diagnosed unhandled rejection | C1 + JS + repair; keep `.js`; awaited service failure reaches mapped 500 once. No framework migration. |
| TS Express 5 on Node 22.18.0, feature P | C2 + TS + feature; parsed Ada persists; rejected awaited service reaches mapper. `void`-detached variant must fail assigned observation. |
| Fastify 4 vs 5 same P | C3/C4 from supplied major; number and 31-emoji name rejected, 30-emoji name accepted. Sibling schema unavailable unless supplied ancestor exports it; v5 shorthand/mixed plugin negative fails registration. |
| Hono Node vs Bun | C5/C6 from deployment fact; identical P wire response. Raw success-hook data variant must fail trimmed-value assertion. Wrong-media response exactly 415. |
| Merely Bun lockfile; actual component Express/Node | No C6 selection. Effect/Next component, or no supplied framework/runtime facts → other lane or owner clarification, not project search. |
| Hono + Zod 4 + zod-validator 0.4.2; Fastify 5 + Node 18 | Peer/runtime incompatibility surfaced; no adapter install, bypass or upgrade. |
| Shared P negative/output matrix | Invalid JSON/type/blank/length → 400; unauthenticated → 401; admin → 409; reject before write. Service DTO with `displayName:42` → 500, never coerced success; private columns absent in serialized JSON. |
| Assigned data change | Real prescribed DB fixture proves persisted owner, parameter binding and rollback on supplied failure. PG same-client transaction vs Bun synchronous transaction checked separately; route fake cannot prove DB semantics. |
| Assigned S | Normal end and abort both finalize producer; client stops after first frame, outstanding reads stop, no second HTTP envelope. Disconnect check must fail if cancellation propagation removed. |

Extraction order: shared role/task guidance → JS/TS boundary rule → separate Node/Bun runtime references → Express/Fastify major-version references and shared Hono validation reference → narrow data/stream/compiler recipes. Cards are concrete composed examples, not six duplicated installed skills. Production packet supplies exact deployed lock/OS and existing package-local tests; preserve host package-check and generation ownership when actually applicable. Current work executed neither tests nor generation.

## Primary evidence ledger — pinned source, not execution results

- [E4] Express 4.21.2 [router layer](https://github.com/expressjs/express/blob/4.21.2/lib/router/layer.js) (`handle_request` ignores returned value), [manifest](https://github.com/expressjs/express/blob/4.21.2/package.json).
- [E5] Express 5.1.0 [manifest](https://github.com/expressjs/express/blob/v5.1.0/package.json); router 2.2.0 [layer](https://github.com/pillarjs/router/blob/v2.2.0/lib/layer.js) observes returned promise; official [error guide](https://expressjs.com/en/guide/error-handling.html) for headers-sent/callback details (live, inspected date above).
- [F4] Fastify 4.29.1 [validation/serialization](https://github.com/fastify/fastify/blob/v4.29.1/docs/Reference/Validation-and-Serialization.md): Ajv defaults, custom compiler ownership, schema scope, shorthand.
- [FM] Fastify 5.6.1 [migration guide](https://github.com/fastify/fastify/blob/v5.6.1/docs/Guides/Migration-Guide-V5.md), [LTS matrix](https://github.com/fastify/fastify/blob/v5.6.1/docs/Reference/LTS.md), [encapsulation](https://github.com/fastify/fastify/blob/v5.6.1/docs/Reference/Encapsulation.md).
- [FP] Fastify manifests [4.29.1](https://github.com/fastify/fastify/blob/v4.29.1/package.json), [5.6.1](https://github.com/fastify/fastify/blob/v5.6.1/package.json); dependency ranges, not resolved application lock.
- [FH] Fastify 5.6.1 [Reply](https://github.com/fastify/fastify/blob/v5.6.1/docs/Reference/Reply.md), [Hooks](https://github.com/fastify/fastify/blob/v5.6.1/docs/Reference/Hooks.md): streams, async replies, hook exclusions/lifetime. [FT] [Testing](https://github.com/fastify/fastify/blob/v5.6.1/docs/Guides/Testing.md): injection boots plugins; real listener separate.
- [SER] fast-json-stringify [5.16.1 README](https://github.com/fastify/fast-json-stringify/blob/v5.16.1/README.md), [6.0.1 README](https://github.com/fastify/fast-json-stringify/blob/v6.0.1/README.md): projection, coercion, required fields, undefined behavior outside schema; pins inspected within Fastify 4/5 dependency ranges, actual lock still supplied.
- [LEN] Ajv 8.20.0 [length keyword](https://github.com/ajv-validator/ajv/blob/v8.20.0/lib/vocabularies/validation/limitLength.ts); Zod 4.1.8 [checks](https://github.com/colinhacks/zod/blob/v4.1.8/packages/zod/src/v4/core/checks.ts): Unicode length versus `input.length`.
- [HV] Hono 4.10.7 [validator](https://github.com/honojs/hono/blob/v4.10.7/src/validator/validator.ts); Standard Validator 0.2.0 [source](https://github.com/honojs/middleware/blob/%40hono%2Fstandard-validator%400.2.0/packages/standard-validator/src/index.ts), [peers](https://github.com/honojs/middleware/blob/%40hono%2Fstandard-validator%400.2.0/packages/standard-validator/package.json).
- [HZ] Zod Validator 0.4.2 [peer manifest](https://github.com/honojs/middleware/blob/%40hono%2Fzod-validator%400.4.2/packages/zod-validator/package.json). [HC] Hono 4.10.7 [compose](https://github.com/honojs/hono/blob/v4.10.7/src/compose.ts): awaited handlers, Error mapping.
- [HN] Node adapter 1.19.1 [manifest](https://github.com/honojs/node-server/blob/v1.19.1/package.json), [listener](https://github.com/honojs/node-server/blob/v1.19.1/src/listener.ts), [request](https://github.com/honojs/node-server/blob/v1.19.1/src/request.ts), [writer utilities](https://github.com/honojs/node-server/blob/v1.19.1/src/utils.ts): lazy request signal/close linkage versus response-reader lifecycle.
- [HS] Hono 4.10.7 [stream helper](https://github.com/honojs/hono/blob/v4.10.7/src/helper/streaming/stream.ts), [SSE helper](https://github.com/honojs/hono/blob/v4.10.7/src/helper/streaming/sse.ts), [StreamingApi](https://github.com/honojs/hono/blob/v4.10.7/src/utils/stream.ts), [version guard](https://github.com/honojs/hono/blob/v4.10.7/src/helper/streaming/utils.ts): helper's request-signal workaround applies to Bun 0.x/1.0/1.1 prefixes, not Node or Bun 1.3.14.
- [N] Node 22.18.0 [TypeScript module docs](https://github.com/nodejs/node/blob/v22.18.0/doc/api/typescript.md). [B] Bun 1.3.14 [file loaders](https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/runtime/file-types.mdx), [HTTP server](https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/runtime/http/server.mdx).
- [BC] Bun 1.3.14 [Node compatibility](https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/runtime/nodejs-compat.mdx), [Node-API](https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/runtime/node-api.mdx). [BS] [SQLite](https://github.com/oven-sh/bun/blob/bun-v1.3.14/docs/runtime/sqlite.mdx).
- [D] Drizzle 0.44.5 [Bun SQLite session](https://github.com/drizzle-team/drizzle-orm/blob/0.44.5/drizzle-orm/src/bun-sqlite/session.ts), [node-postgres session](https://github.com/drizzle-team/drizzle-orm/blob/0.44.5/drizzle-orm/src/node-postgres/session.ts): synchronous/native transaction versus awaited callback/client release.
- [PG] pg 8.16.3 [publisher metadata](https://registry.npmjs.org/pg/8.16.3), gitHead `8f8e7315e8f7c1bb01e98fdb41c8c92585510782`; [same-revision transactions docs](https://github.com/brianc/node-postgres/blob/8f8e7315e8f7c1bb01e98fdb41c8c92585510782/docs/pages/features/transactions.mdx).
- [R39]/[R44] Local source-lead paths recorded above; retained source-only status. R44 compiler detail is inherited research, not re-executed here. No external skill bodies copied or installed; framework/library source treated as evidence only.
