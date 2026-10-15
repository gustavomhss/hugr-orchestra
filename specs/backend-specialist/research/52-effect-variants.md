# R52 — Effect backend implementation skill variants

Research date: 2026-10-04. Status: source-only research; snippets, selection cases and behavior checks below **unexecuted**.
Metadata worktree `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/orchestra/backend-r52-effect-variants`: `git rev-parse HEAD` returned **76015a9dcd5b0c77164a3f1bee49b0060a4d37f0**, matching requested baseline. Frozen `backend-plugin` worktree returned same HEAD.
Read frozen [plan](/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/skill-variants-plan.md) and [R39](/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/39-typescript-code.md); R39 comparison fixture retained below.
Host root **H** = `/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical`; local citations describe inspected worktree bytes, whose checkout HEAD was `5e4bea3b519c04cebfb787e98dfa171f5771d25c`.

## Family, version and evidence boundary

- Target: **effect 4.0.0-beta.83 + `patches/effect@4.0.0-beta.83.patch`**, per H/`package.json:34-36,66,160`. Platform-node, SQLite-Bun and OpenTelemetry packages share beta.83 pin; package manager Bun 1.3.14. Manifest facts, not measured installed versions.
- Upstream tag `effect@4.0.0-beta.83` resolves through tag object `fd729130449b07247a4df21bbcb7c8b6671356a6` to commit **cd7ab658994104bd6fe8f841f1440bea32c387f5**. Primary Effect links below pin that commit; package manifest confirms beta.83 and MIT license. [V]
- Host patch changes `StreamSse({ data })` JSON-string wrapper identifier to `${identifier}Stream` when data schema has identifier; applies source and distributed JS. Preserve decoded data identity and separate OpenAPI transport identity. Anonymous data keeps upstream wrapper behavior. [L1][SSE]
- Available beta.98 checkout at `/Users/gustavoschneiter/.local/share/orchestra/repos/github.com/Effect-TS/effect-smol` supplies no target API evidence here. Newer checkout or v3 recipe cannot establish beta.83 compatibility; re-pin source if supplied component version changes.

## Shared contract for every card

- Select from supplied target component, technical scope and exact versions. Incidental Effect dependency does not select Effect implementation; task selection grants no authority.
- Packet supplies assigned behavior/files, existing mountpoints/service interfaces, auth/error contracts, runtime/version/patch facts and acceptance commands. Repair packet includes owner diagnosis; new feature needs behavior and seams, not invented diagnostic prerequisite.
- The backend specialist chooses local algorithms, schemas within contract, SQL, helpers, composition and focused implementation corrections. Discovery, project diagnosis, cross-owner architecture and independent review remain upstream inputs.
- Consume existing layer/application-node/test integration. New service registry, loader, permission mechanism or harness is outside these recipes.
- Use `Effect.gen`, named `Effect.fn("Domain.method")` where useful; bind services before calls: `const profiles = yield* Profiles.Service`, then `yield* profiles.rename(...)`. No nested service yields, `any`, import aliases or star imports. Existing source examples establish mechanisms, not permission to copy conflicting style.
- Dependency direction: Schema supplies Core/Protocol; Server composes Core/Protocol. Browser-safe schemas stay Schema; runtime/services stay domain-owned. Client runtime may import Schema/Protocol, never Core/Server; `sdk-next` composes Client/Core/Server.
- Research tools used: Read/Glob/Grep for named local seams, `git rev-parse HEAD`, read-only `gh api` for pinned source. Only this report authored via `apply_patch`.
- Future implementation tools: package-local focused `bun test <assigned-file>` and `bun typecheck` in each affected package; never root tests or direct `tsc`. Public Protocol/Server `HttpApi` changes require `bun run generate` from `packages/client`; generated directories remain generator-owned. Assigned legacy SDK regeneration uses `./packages/sdk/js/script/build.ts`.

## Same specified behavior: Effect versus Promise-style Hono

Illustrative R39 packet: authenticated `PATCH /profile`, JSON `{ displayName }`; trim then require 1–60 UTF-16 code units, discard unknown keys. Verified principal selects user; normalized `admin` fails 409 before write. Existing repository returns Date; DTO projects UTC ISO timestamp with `toISOString()` in both variants.
Positive: `u1` + `"  Ada  "` persists `Ada`, returns 200 with `{ userId, displayName, updatedAt }`. Number/blank/61-unit name → 400; missing auth with valid body → 401; reserved name → 409; rejected cases leave profile unchanged. Forged `userId` cannot redirect write. Invalid output must fail supplied output mapper; response validation cannot undo committed write.

| Instruction that changes | Effect beta.83 + patch | Hono 4.10.7 + Standard Validator 0.2.0 + Zod 4.1.8 |
| --- | --- | --- |
| Decode normalized input | `Schema.Struct({ displayName: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(60)) })`; pass as endpoint `payload` | `z.object({ displayName: z.string().trim().min(1).max(60) })`; `sValidator("json", schema, validationHook)` |
| Implement mounted handler | `HttpApiEndpoint.patch` → existing group/API → `HttpApiBuilder.group(...).handle(...)`; return Effect | `app.patch(..., async (c) => ...)`; await existing Promise service with `c.req.valid("json")` |
| Bind actor/service | Named `yield* Principal.Service` and `yield* Profiles.Service`, then service call | Supplied auth middleware populates context; `c.get("user").id` passed explicitly to Promise service |
| Encode output/errors | Normal handler return uses declared success/error codecs; map known domain tags, retain supplied schema-error middleware | Explicit `ProfileOutput.parse(dto)` before `c.json`; validation hook and supplied error handler map envelopes/statuses |

Wrong transfer: replacing normal Effect return with raw response bypasses success codec; assuming Hono `c.json` validates output removes enforcement. Hono implementation serializes with `JSON.stringify`; Standard Validator returns transformed `result.value`. Business rule, actor binding and timestamp mapping still need code in both. No framework conversion proposed. [API][CODEC][H]

## C1 — HttpApi, schema codecs and declared failures

**Trigger:** assigned Effect endpoint/DTO/error behavior, including schema-only wire change. **Non-trigger:** Promise-only route, inferred TypeScript type with no requested runtime boundary, framework-selection task.
**Inputs:** payload/query/output examples, unknown-key/default policy, exact status/envelope schemas, auth service/middleware, domain errors, existing Protocol/Server mountpoints and affected clients.
**Steps:**
1. Put canonical wire schemas in Schema; preserve branded IDs, stable identifiers and package `optional(...)` helper when encoded `undefined` must disappear. Separate decoded `Type` from `Encoded`; pure parsing/validation stays synchronous when sufficient. [L2]
2. For untrusted JSON strings use `Schema.UnknownFromJsonString` or `Schema.fromJsonString(Dto)`. `decodeUnknownOption` returns absence without diagnostics; use `decodeUnknownEffect` when typed `SchemaError` details must map into assigned error channel. Do not turn pure validation into unnecessary Effect helpers. [CODEC]
3. Supply JSON payload as schema, e.g. `payload: RenameInput`; beta.83 bare field object selects form-url-encoded payload. Constructors derive JSON/string-tree codecs by default; inspect transformed dates/query values before choosing `disableCodecs`. [API]
4. Keep handler thin; bind actor/services by name, call Core behavior, map known domain tags with `Effect.catchTag` into Protocol errors declared via `Schema.TaggedErrorClass`/`httpApiStatus`. Wire supplied middleware; schema/security declarations do not authenticate callers. [L3]
**Tools → output:** named schema/group/handler reads; future package-local checks/generation → canonical codecs, endpoint declaration, mapped handler and assigned fixtures.
**Version caveat:** `handleRaw` skips automatic payload decoding, but params/query/headers still decode; returning `HttpServerResponse` bypasses ordinary success encoding. Unhandled `HttpApiSchemaError` becomes defect. Host transform maps even `Body` response-schema errors to `InvalidRequestError`/400; preserve assigned policy. Malformed JSON uses builder's `JSON.parse` defect path, not ordinary schema rejection; unsupported payload media type returns 415. [API][L3]
**Local freedom:** choose refinements, DTO projection and small mapper structure within wire contract. **Upstream blocker:** missing status/encoding/auth seam, or requested parsing behavior without assigned integration boundary.
**Unexecuted checks:** R39 cases above; optional-key omission; decode/encode round-trip; malformed JSON versus invalid decoded payload; unsupported content type; invalid service output reaches specified mapper and does not imply rollback.

## C2 — Scoped service and resource lifetime

**Trigger:** assigned service method/layer or resource acquisition/cleanup in existing Effect ownership seam. **Non-trigger:** pure DTO function; proposal to choose global versus Location ownership or build replacement registry.
**Inputs:** existing `Context.Service` key/interface and layer slot, owner lifetime, acquire/use/release contracts, required dependencies, startup/readiness expectations and cleanup failure policy.
**Steps:** implement method using named `Effect.fn`; use existing key and explicit `Layer.effect` composition. beta.83 executes layer construction in layer scope. For per-operation resources scope complete use; for owner-lived resources acquire in supplied layer scope. [L4][LIFETIME]

```ts
// Inside the supplied owning scope; Leases is a packet-supplied service.
const leases = yield* Leases.Service
const lease = yield* Effect.acquireRelease(leases.open(), (lease) => lease.close())
yield* lease.use()
```

**Steps, continued:** use `Effect.forkScoped` for assigned scope-owned work, `forkIn(scope)` for explicitly supplied scope, `forkChild` for parent-fiber lifetime. These lifetimes differ; `forkDetach` targets global scope. Do not substitute detached execution to silence Scope requirements. [FIBERS]
**Tools → output:** named owner/layer/resource sources plus pinned signatures; future focused lifetime checks → service implementation, explicit provisioning and finalizers in existing seams.
**Version caveat:** `acquireRelease` protects acquisition from interruption by default; `{ interruptible: true }` changes that contract and needs partial-acquisition cleanup accounted for. Release callback has `never` typed error channel; honor supplied cleanup policy. `Effect.scoped` closes on success/failure/interruption; returning lazy stream from already-closed scope releases too early. [LIFETIME]
**Local freedom:** resource adapters, helper boundaries and layer composition within supplied ownership. **Upstream blocker:** unspecified owner lifetime, dependency interface or partial-acquisition/cleanup contract.
**Unexecuted checks:** successful acquisition releases once after use on success, typed failure, defect and interruption; failed acquisition does not invoke registered release; owner close interrupts worker and waits for cleanup; readiness precedes dependent work.

## C3 — Data codecs and atomic work in existing DB service

**Trigger:** assigned persistence behavior using host Effect-backed Drizzle/SQLite, or explicitly supplied generic Effect SqlClient seam. **Non-trigger:** incidental database dependency, selecting datastore, inventing migration/retry/admission policy.
**Inputs:** tables/repository interface, row/DTO codecs, atomicity and isolation requirements, transaction owner, expected failures, idempotency/retry contract and supplied DB fixture.
**Steps:** bind `const database = yield* Database.Service`; keep host queries Effect-yielded. Use `database.db.transaction((tx) => Effect.gen(function* () { ... }))` with both assigned writes inside callback. Callback returns Effect, not `async` Promise; do not escape transaction context through `Effect.runPromise` or detached writes. [L4][L5]
**Steps, continued:** decode stored unknown values using assigned schema/error policy; encode explicitly where stored representation differs. Keep browser DTOs and domain runtime separate; Drizzle fields snake_case. Existing `orDie` callsites are deliberate defect boundaries, not default recipe for expected constraint/domain failures.
**Steps, continued:** retry only packet-approved transient failures, with supplied bounded policy/idempotency. Keep external notifications after commit or in supplied durable mechanism; transaction/retry alone cannot establish exactly-once external effects.
**Variant difference:** generic beta.83 SqlClient uses named `const sql = yield* SqlClient.SqlClient`, then `sql.withTransaction(work)`. Host adapter has its own transaction finalization, including rollback after deferred-constraint commit failure and savepoint release. Replacing it with generic wrapper changes behavior. [SQL][L5]
**Tools → output:** assigned DB/adapter/row schema sources; future local typecheck and real DB fixture → atomic method, codec/error mapping and scoped data checks.
**Version caveat:** generic SqlClient reserves transaction connection in Effect context and rolls back failing/interrupted body; commit failure is promoted to defect. Host adapter semantics must be read separately; source evidence is not observed durability. [SQL][L5]
**Local freedom:** SQL shape, local helpers and transaction callback within supplied schema/isolation. **Upstream blocker:** missing atomic boundary, expected error policy or externally visible retry/idempotency contract.
**Unexecuted checks:** successful two-write operation persists both; second-write failure rolls back first; interrupt before commit then read fresh connection; deferred constraint failure leaves connection reusable; bad row codec follows specified error; exact retry follows supplied delivery semantics.

## C4 — Streams, cancellation and SSE transport

**Trigger:** assigned Effect stream/SSE behavior or cancellation repair with supplied owner/transport. **Non-trigger:** bounded JSON response without streaming requirement; introducing durable runner/replay ownership.
**Inputs:** event codec, typed versus raw handler seam, subscription acquisition and release, capacity/overflow/order policy, heartbeat/termination rules, cancellation source and Promise adapter signal support.
**Steps:** preserve Protocol `HttpApiSchema.StreamSse({ data: EventSchema })` declaration and selected Server path. Existing `/api/event` uses `handleRaw`, explicit schema encoding and SSE framing; declaration alone does not encode raw response. [L6][SSE]

```ts
// Packet supplies EventV2 and capacity; acquisition belongs to stream consumption.
const events = yield* EventV2.Service
const output = Stream.unwrap(
  Effect.gen(function* () {
    const live = yield* EventV2.allBounded(events, capacity)
    return Stream.make(connected).pipe(Stream.concat(live))
  }),
)
```

**Steps, continued:** install listener before connected/readiness event; keep consumption lazy and scoped. Host bounded listener fails stream on rejected queue offer and finalizes unsubscribe/shutdown; it does not silently drop overflow. Preserve `Stream.merge(heartbeat, { haltStrategy: "left" })` so heartbeat cannot keep finished data stream alive. [L4][L6][STREAM]
**Steps, continued:** consume background streams with `Stream.runForEach(...).pipe(Effect.forkScoped)`. At required Promise boundary use `Effect.tryPromise({ try: (signal) => client.read({ signal }), catch: mapReadError })`; pass signal through. Prefer supplied Effect-aware clients when already available. Wrapping existing Promise cannot cancel producer that ignores signal. [FIBERS]
**Tools → output:** named subscription/HTTP/patch sources; future live transport and scope checks → scoped stream, explicit raw codec/framing, bounded overflow and cancellation wiring.
**Version caveat:** `Stream.unwrap` handles acquisition Scope in beta.83; immediate `Effect.scoped(acquireStream)` is different lifetime. Host SSE patch changes schema identity, not raw framing or cancellation. After headers start, follow assigned stream termination/error-event contract rather than promise of new HTTP error status.
**Local freedom:** composition, queue plumbing and Promise adapter inside supplied policies. **Upstream blocker:** unspecified overflow semantics, owner scope, wire-error format or producer cancellation support.
**Unexecuted checks:** event immediately after readiness delivered; invalid event hits raw encoder; saturation follows supplied failure policy; data completion stops heartbeat; client disconnect releases listener/queue; cooperative Promise sees abort; named data and `${identifier}Stream` remain distinct in future generated OpenAPI.

## C5 — Assigned Effect behavior tests

**Trigger:** packet assigns tests for Effect services, typed failures, scopes, streams or runtime integration. **Non-trigger:** independent review/project diagnosis; pure synchronous schema check needs no service harness by default.
**Inputs:** behavior oracle, named implementation/tests, package-local commands, real DB/OS/HTTP fixture, production-equivalent layer topology and clock/ownership assumptions.
**Steps:** reuse package's `testEffect(...)`: Core has `packages/core/test/lib/effect.ts`; orchestra has `packages/orchestra/test/lib/effect.ts`. Compose explicit supplied layers; invoke actual service with named bindings. Avoid reimplementing behavior in tests or blanket mocks. [TEST]
**Steps, continued:** `it.effect` provides TestClock/TestConsole for deterministic Effect time; `it.live` keeps live clock for filesystem, git, sockets, processes, locks and DB integration. orchestra `it.instance` supplies live scoped instance fixture; Core helper does not expose that method. Preserve existing fixture ownership instead of copying richer helper elsewhere.
**Steps, continued:** synchronize with Deferred/readiness rather than guessed sleeps. TestClock only controls Effect time, not native timers/OS. Await `Fiber.interrupt` or close inner test scope before asserting finalizers. Scoped outer harness cleanup occurs after body; assertion inside still-open scope cannot prove release. [CLOCK][FIBERS]
**Steps, continued:** mounted HttpApi tests exercise middleware order, decoded inputs and serialized response; use supplied Effect HTTP test layers. Shared pub/sub identity, when required by existing orchestra fixture, uses supplied `testEffectShared`/memo map; do not create replacement runtime. [TEST]
**Tools → output:** read assigned tests/helpers; later package-local `bun typecheck` and focused tests → meaningful positive/negative assertions plus recorded executed/skipped/unexecuted results.
**Version caveat:** helper names/topology are host-specific, not universal Effect testing API; beta.83 `TestClock.adjust` and fiber cleanup semantics require pinned source. Promise `await` assertion alone exercises neither scoped finalizers nor typed failure/defect distinction.
**Local freedom:** fixture composition, synchronization and assertion detail within assigned behavior. **Upstream blocker:** missing observable success/failure contract, required fixture or test command; request named input rather than invent harness.
**Unexecuted checks:** C1–C4 oracles through actual implementation; distinct expected failure/defect/interruption observations; both acquire and release observed; awaited cancellation; exact selected runtime/transport exercised. Skipped test is not behavior evidence.

## Proposed selection cases and extraction

All selection cases **unexecuted**: Effect DTO/HttpApi assignment → C1; scoped Effect resource assignment → C2; existing DB atomic write → C3; existing SSE cancellation assignment → C4; assigned service tests → C5 plus relevant behavior card.
Negative cases **unexecuted**: Hono route with incidental Effect dependency → Hono recipe, not C1; pure Schema refinement → C1 without resource harness; unknown service lifetime → C2 upstream question; new persistence/replay policy → owner decision, not C3/C4 invention; test-only assignment → C5 plus assigned seam, not production redesign.
Extraction: shared backend specialist scope/local-freedom rules + TS/Bun house rules + pinned beta.83/patch framework reference + these narrow task recipes. Compose only relevant cards; metadata does not implement inheritance, routing or authorization. Research ready for lead synthesis; runtime skill authoring/activation/exercise remain separate deliverables.
Execution evidence pending by assignment: compile snippets against selected lockfile; run assigned package tests; exercise live cancellation/transactions/HTTP; run client generation and inspect patch-sensitive OpenAPI. This research ran no tests, typechecks, generators, installs or clones; authored no runtime/config changes.

## Primary evidence ledger

- [V] [tag resolution](https://api.github.com/repos/Effect-TS/effect-smol/git/tags/fd729130449b07247a4df21bbcb7c8b6671356a6), [beta.83 manifest](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/package.json), [MIT](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/LICENSE).
- [API] [HttpApiEndpoint.ts:1219–1338,1460–1483](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts#L1219-L1338), [HttpApiBuilder.ts:576–695](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts#L576-L695), [schema-error transform](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/unstable/httpapi/HttpApiMiddleware.ts#L385-L439).
- [CODEC] [Schema.ts](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/Schema.ts): `decodeUnknownEffect` 1158–1186; Option 1275–1298; UTF-16 `.length` checks 7532–7599; JSON codecs 10466–10574; `Trim` 11116–11132; `TaggedErrorClass` 12417; `toCodecJson` 12884.
- [LIFETIME] [Context.Service](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/Context.ts#L173-L233), [Layer.effect](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/Layer.ts#L938-L993), [Effect scoped/acquireRelease](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/Effect.ts#L6296-L6452).
- [FIBERS] [Effect.ts](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/Effect.ts): Promise boundary 823–942; forkChild/In/Scoped/Detach 8400–8605; [Fiber.interrupt:312–346](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/Fiber.ts#L312-L346).
- [SQL] [SqlClient.ts:50–57,139–167,214–291](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/unstable/sql/SqlClient.ts#L214-L291): transaction context, exit and finalization.
- [STREAM] [Stream.ts](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/Stream.ts): unwrap 1801–1825; merge 3128–3150; runForEach 10844–10885. [SSE] [HttpApiSchema.ts:394–434](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/unstable/httpapi/HttpApiSchema.ts#L394-L434).
- [CLOCK] [TestClock.ts](https://github.com/Effect-TS/effect-smol/blob/cd7ab658994104bd6fe8f841f1440bea32c387f5/packages/effect/src/testing/TestClock.ts): virtual time semantics, `layer` 379 and `adjust` 445.
- [H] [Hono 4.10.7 context JSON](https://github.com/honojs/hono/blob/v4.10.7/src/context.ts#L691-L703), [Standard Validator 0.2.0](https://github.com/honojs/middleware/blob/%40hono%2Fstandard-validator%400.2.0/packages/standard-validator/src/index.ts), [Zod 4.1.8](https://github.com/colinhacks/zod/blob/v4.1.8/packages/zod/src/v4/classic/schemas.ts): parse 169–172, length/trim 274–282. Primary tagged implementations inspected; versions also recorded in R39.
- [L1] H/`package.json:34-36,66,160`; H/`patches/effect@4.0.0-beta.83.patch:1-57`.
- [L2] H/`packages/schema/AGENTS.md`; `packages/schema/src/credential.ts:9-35`; `packages/schema/src/schema.ts:12-29`.
- [L3] H/`packages/protocol/src/groups/credential.ts:6-37`, `src/errors.ts:3-44`, `src/api.ts:25-64`; H/`packages/server/src/api.ts:1-8`, `src/handlers/credential.ts:6-22`, `src/middleware/schema-error.ts:14-20`.
- [L4] H/`packages/core/src/credential.ts:49-129`, `src/database/database.ts:13-40`, `src/session/store.ts:28-58`, `src/event.ts:160-171,643-661`.
- [L5] H/`packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts:118-203`; H/`packages/core/src/event.ts:592-600`.
- [L6] H/`packages/protocol/src/groups/event.ts:29-45`; H/`packages/server/src/handlers/event.ts:11-49`.
- [TEST] H/`packages/core/test/lib/effect.ts:11-53`; H/`packages/orchestra/test/lib/effect.ts:38-65,131-147`; `packages/orchestra/test/AGENTS.md`; `packages/orchestra/test/server/AGENTS.md`; inspected test examples: Core `test/event.test.ts:81-103`, orchestra `test/server/httpapi-schema-error-body.test.ts:110-121` and `test/server/httpapi-event.test.ts:26-58` (latter legacy transport fixture, not current event-schema oracle).
