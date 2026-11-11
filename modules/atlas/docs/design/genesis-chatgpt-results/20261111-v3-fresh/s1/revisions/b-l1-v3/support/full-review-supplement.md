# B-v3 — additional decisive source evidence

Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocol pin: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. L1 only; all claims remain unjudged.

This projection contains only additional source lines, deduplicated against C01–C47 and S01–S38. Existing evidence is reused by exact ID and line spans. The separate minimal `complete-branch-context.md` reconstructs the binary and SSE-finally branches as requested; it repeats only their indispensable closing lines from C34. Full original archives and delegate evidence remain preserved.

## Artifact → new excerpt map

| Artifact | Additional source evidence |
| --- | --- |
| s1.api.server-edge | V01 (REASON_LIMIT); server domain rows and their G57 selections |
| s1.api.session-contract | V02 (active/history), V03–V04 (Core ownership), C21/S16 continuity |
| s1.api.stream-contract | V05 (production cache/capacity), V06 (complete finally with C34) |
| s1.api.client-projection | V06 (binary branch and finally with C34) |
| s1.api.schema-contracts | Q001–Q094 and semantic-disposition domains |
| s1.api.sdk-composition | Q095, complete two-line Core tool facade |
| s1.api.surface-disposition | All Q/P/G57 source selections and exact 190-member matrix |
| s1.api.boundaries / s1.api.codegen | Original bounded claims unchanged; new domain evidence is navigation, not a new build dependency |

## V01 — packages/server/src/middleware/schema-error.ts

B1 exact REASON_LIMIT; C29 lines10–19 already supply prefix+suffix and log/error mapping.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d39702b74b11b1ee8e0072903bf1f9f19310da33`; full-source SHA256 `cec3dac0a0706af6daa39233b37c453e99b57a234a40ddcd27ef01cb0777ec08`; 918 source bytes.

Lines 7–9; byte offsets [326, 395); 69 bytes; span SHA256 `fa69ba79485ddbfa718b665cd4ccd3c5e0ff312cd402996a7daa54aa96bf8fc2`.

```ts
const REASON_LIMIT = 1024

function truncateReason(reason: string) {
```

## V02 — packages/protocol/src/groups/session.ts

B2 SessionActive, 1–100 history limit and completion of active-route description after C21 line181.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; full-source SHA256 `2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f`; 29273 source bytes.

Lines 95–101; byte offsets [3867, 4117); 250 bytes; span SHA256 `cf503ff243149f3e48fd7346791e8024e86a47c1a40af480d1cd010bdfa345e9`.

```ts
const SessionActive = Schema.Struct({
  type: Schema.Literal("running"),
}).annotate({ identifier: "SessionActive" })

const SessionHistoryLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(100))

export const SessionHistoryQuery = Schema.Struct({
```

Lines 182–184; byte offsets [7182, 7342); 160 bytes; span SHA256 `98b16737318ead0c102d04fb5b0e4eb508a6f7b1ea1ce7416e6471859b697e77`.

```ts
            "Retrieve foreground Session drains currently owned by this Orchestra process. Sessions absent from the result are inactive.",
        }),
      ),
```

## V03 — packages/core/src/session.ts

B2 actual Core message lookup uses SessionStore.Service and returns only a stored message whose sessionID equals the requested sessionID.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `402a192a69bcad6a4b08c695657e24ff5e335f93`; full-source SHA256 `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; 34126 source bytes.

Lines 24–24; byte offsets [1043, 1090); 47 bytes; span SHA256 `5457629f46d24238d8726925a3d6f4fb50bd94e677767897f86a54bbd5b3f937`.

```ts
import { SessionStore } from "./session/store"
```

Lines 270–275; byte offsets [11369, 11654); 285 bytes; span SHA256 `df939f08aca17e11845f2578ab0701a18b1c2182b8cb2df7621314ed05d3177a`.

```ts
    const events = yield* EventV2.Service
    const projects = yield* ProjectV2.Service
    const execution = yield* SessionExecution.Service
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const global = yield* Global.Service
```

Lines 469–472; byte offsets [20993, 21212); 219 bytes; span SHA256 `bd4a0e8879df3ea7ae057e1264edcb68fe8b2a4496b551b1616e98e993e43544`.

```ts
      message: Effect.fn("V2Session.message")(function* (input) {
        const stored = yield* store.message(input.messageID)
        return stored?.sessionID === input.sessionID ? stored.message : undefined
      }),
```

## V04 — packages/core/src/session/store.ts

B2 store service takes Database, selects message by ID and returns its stored owning sessionID for the comparison.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1e44d051f1a51b816bfeb96ce46dbc0747d07aff`; full-source SHA256 `2532e550ec0d74f7b07c33560651db176479d6b9d827fdc19d1d1198ba0628de`; 4422 source bytes.

Lines 26–28; byte offsets [1237, 1410); 173 bytes; span SHA256 `9023adf6ade79ac0bd2833135a68cc191272e6ae8d87c7b9b01349c5d688e7e6`.

```ts
  readonly message: (
    messageID: SessionMessage.ID,
  ) => Effect.Effect<{ readonly sessionID: SessionSchema.ID; readonly message: SessionMessage.Message } | undefined>
```

Lines 33–41; byte offsets [1599, 1912); 313 bytes; span SHA256 `3c87f7e3edf143bee29e26f76817fce6e84a75d1dbaf7a4d6f0fb2ecfc043bb7`.

```ts
export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionStore") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)

    return Service.of({
```

Lines 73–86; byte offsets [3282, 3797); 515 bytes; span SHA256 `ae2e87c7b31bb3b078d40b630a6f57e0c6e0795a2a7f66c34ac5ac30d5cc1502`.

```ts
      message: Effect.fn("SessionStore.message")(function* (messageID) {
        const row = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.id, messageID))
          .get()
          .pipe(Effect.orDie)
        return row
          ? {
              sessionID: SessionSchema.ID.make(row.session_id),
              message: yield* decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(Effect.orDie),
            }
          : undefined
      }),
```

## V05 — packages/server/src/handlers/event.ts

B2 production subscriber capacity and eventFrames allocation outside the per-request callback.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d644f36bdd6aa93cd538f560dab63337c2436022`; full-source SHA256 `ca51a6d6bd47e97cda8d43b629e4a590cbe21e1a263b6146d3609d30bceae427`; 2924 source bytes.

Lines 26–26; byte offsets [1391, 1430); 39 bytes; span SHA256 `f00e06379de81d7dd2a0aa5169f7e64cbc9c5ebaf656d48a61b19230012c7eff`.

```ts
export const subscriberCapacity = 4096
```

Lines 46–53; byte offsets [2252, 2668); 416 bytes; span SHA256 `8c984251b7babb044dc6ffd690bdf2cf5547b845489c747c92ed0ebabb96bf54`.

```ts
export const EventHandler = HttpApiBuilder.group(Api, "server.event", (handlers) =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    // One memo for the whole server, so every subscriber reuses the first one's encode.
    const frame = eventFrames()
    return handlers.handleRaw("event.subscribe", () =>
      Effect.succeed(
        HttpServerResponse.stream(eventStream(events, frame), {
```

## V06 — packages/client/src/generated/client.ts

B2 omitted binary-success and SSE-finally lines; continuity map/complete-branch-context.md bind complete minimal branches to existing C34 closing lines.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; full-source SHA256 `f032a64d8223ac1b584ba17cf39e7f8da9e0be05f88682425692304a3a8ba20b`; 146714 source bytes.

Lines 595–596; byte offsets [16180, 16272); 92 bytes; span SHA256 `cfdbe7e8532a18804f63fc69ed464838f3bf6e0f995523fd853112b75494b690`.

```ts
    if (descriptor.binary) {
      return new Uint8Array(await response.arrayBuffer()) as A
```

Lines 648–652; byte offsets [18382, 18475); 93 bytes; span SHA256 `cccd73c17978507efca4988b43ca354d6a2156930a8ced55a6b7abcf79a75d9f`.

```ts
        }
      } finally {
        try {
          await reader.cancel()
        } catch {}
```

## G57-E001 — packages/server/src/capability-content-ticket.ts

assigned_member: packages/server/src/capability-content-ticket.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ac3409c69b8d5b283a316198498048cf7d817279`; full-source SHA256 `e054ec3a19e8dedf9bbf380636f9f0592c17e6a770e7b0eb53be0404ef661444`; 2187 source bytes.

Lines 9–18; byte offsets [371, 766); 395 bytes; span SHA256 `ec043ae9b75e374eba8f38c9d1bc75b45615cfba8b2b460a409fb47c02b39270`.

```ts
export type Claim = Readonly<{
  authority: CapabilityOperatorContract.Authority
  sessionID: SessionID
  ref: Readonly<{ id: Capability.ArtifactID; revision: number }>
}>

type Interface = Readonly<{
  mint: (claim: Claim) => Readonly<{ url: string; expiresAt: number }>
  /** The minted claim, or undefined for any expired or unknown ticket. */
  verify: (ticket: string) => Claim | undefined
```

## G57-E002 — packages/server/src/capability-content-ticket.ts

assigned_member: packages/server/src/capability-content-ticket.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ac3409c69b8d5b283a316198498048cf7d817279`; full-source SHA256 `e054ec3a19e8dedf9bbf380636f9f0592c17e6a770e7b0eb53be0404ef661444`; 2187 source bytes.

Lines 25–25; byte offsets [998, 1056); 58 bytes; span SHA256 `452ed3363819434c1eb004d9e6015d924c3f5f14b401c75406bb783e4e953889`.

```ts
export const layer = layerWith({ ttlMillis: 5 * 60_000 })
```

## G57-E003 — packages/server/src/capability-content-ticket.ts

assigned_member: packages/server/src/capability-content-ticket.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ac3409c69b8d5b283a316198498048cf7d817279`; full-source SHA256 `e054ec3a19e8dedf9bbf380636f9f0592c17e6a770e7b0eb53be0404ef661444`; 2187 source bytes.

Lines 33–48; byte offsets [1506, 2173); 667 bytes; span SHA256 `f0c684357aab9ef5de8a5c1613c9852cbc42ab827dd172343dbdc9ddf0aa8dea`.

```ts
    mint: (claim) => {
      const now = Date.now()
      issued.forEach((entry, token) => {
        if (now >= entry.expiresAt) issued.delete(token)
      })
      const token = randomBytes(32).toString("base64url")
      const expiresAt = now + ttlMillis
      issued.set(token, { ...claim, expiresAt })
      return { url: `/api/capability/content/${token}`, expiresAt }
    },
    verify: (ticket) => {
      const entry = issued.get(ticket)
      if (entry === undefined) return undefined
      if (Date.now() < entry.expiresAt) return { authority: entry.authority, sessionID: entry.sessionID, ref: entry.ref }
      issued.delete(ticket)
      return undefined
```

## G57-E004 — packages/server/src/capability-verification.ts

assigned_member: packages/server/src/capability-verification.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2ccb45657ac106cc605a715ce4d37b405f322746`; full-source SHA256 `0fe9c21339044189df48ee9d6e300f9131e6b89ddc7f46921fb35bf46cbe9876`; 695 source bytes.

Lines 7–12; byte offsets [330, 695); 365 bytes; span SHA256 `24e5715599f6812a6a789e167c2b482427c80eaffbd06acd02b3f37dd9a14968`.

```ts
/** Trusted host construction only; request payloads cannot replace production origins or identity checks. */
export class Service extends Context.Service<Service, CapabilityConnectionSetupContract.Verifier>()(
  "@orchestra/ServerCapabilityVerification",
) {}

export const layer = Layer.effect(Service, CapabilityConnectionVerification.make().pipe(Effect.orDie))
```

## G57-E005 — packages/server/src/cors.ts

assigned_member: packages/server/src/cors.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `767f94807b1c6437467f6f1e35bd784fbd004b16`; full-source SHA256 `d4f02ba7c886b1a0cc3f53863398b4e78eed59c9a94915bad38fa5ee24461dbb`; 2765 source bytes.

Lines 10–31; byte offsets [343, 1166); 823 bytes; span SHA256 `a6e221fb53a544a2aafc5fdc21174b57f2dd6361dcbc8655671881bcab318b29`.

```ts
export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (input.startsWith("http://localhost:")) return true
  if (input.startsWith("http://127.0.0.1:")) return true
  if (input.startsWith("oc://renderer")) return true
  if (input === "tauri://localhost" || input === "http://tauri.localhost" || input === "https://tauri.localhost")
    return true
  return opts?.cors?.includes(input) ?? false
}

export function isAllowedRequestOrigin(input: string | undefined, host: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (host && sameHost(input, host)) return true
  return isAllowedCorsOrigin(input, opts)
}

function sameHost(origin: string, host: string) {
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
```

## G57-E006 — packages/server/src/cors.ts

assigned_member: packages/server/src/cors.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `767f94807b1c6437467f6f1e35bd784fbd004b16`; full-source SHA256 `d4f02ba7c886b1a0cc3f53863398b4e78eed59c9a94915bad38fa5ee24461dbb`; 2765 source bytes.

Lines 35–41; byte offsets [1286, 1538); 252 bytes; span SHA256 `c2260571780e009040a05fa65b20b7faa74a5fe17f0fa87e3ae13c8c38db9160`.

```ts
export const corsLayer = (opts?: CorsOptions) =>
  Layer.mergeAll(
    corsVaryFix,
    HttpRouter.middleware(
      HttpMiddleware.cors({ allowedOrigins: (origin) => isAllowedCorsOrigin(origin, opts), maxAge: 86_400 }),
      { global: true },
    ),
```

## G57-E007 — packages/server/src/cors.ts

assigned_member: packages/server/src/cors.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `767f94807b1c6437467f6f1e35bd784fbd004b16`; full-source SHA256 `d4f02ba7c886b1a0cc3f53863398b4e78eed59c9a94915bad38fa5ee24461dbb`; 2765 source bytes.

Lines 55–66; byte offsets [2175, 2735); 560 bytes; span SHA256 `70105d4a9b67a02ef889e53ec7d25b09103a3e10ad1542f887b53930e947890f`.

```ts
    Effect.gen(function* () {
      const response = yield* effect
      const allowOrigin = response.headers["access-control-allow-origin"]
      if (!allowOrigin || allowOrigin === "*") return response

      const vary = response.headers["vary"]
      if (!vary) return HttpServerResponse.setHeader(response, "vary", "Origin")

      const tokens = vary.split(",").map((s) => s.trim().toLowerCase())
      if (tokens.includes("origin") || tokens.includes("*")) return response

      return HttpServerResponse.setHeader(response, "vary", `${vary}, Origin`)
```

## G57-E008 — packages/server/src/handlers/actions-binding.ts

assigned_member: packages/server/src/handlers/actions-binding.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7aa3bf6ff8d82ac41e35acb9ffbc4ec44acb07b7`; full-source SHA256 `e7fc29a45370ba8c4456e5c27ee0aaea2c4460b386be04ad5fcf3b91531f73d8`; 2229 source bytes.

Lines 9–19; byte offsets [352, 896); 544 bytes; span SHA256 `26b4c750254dcf314aa808b87c74cf1a3d24762caca3d0f85f2357d12dd43ff9`.

```ts
    .handle("actions.binding.list", () => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.list()
    })))
    .handle("actions.binding.create", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.create(ctx.payload)
    })))
    .handle("actions.binding.get", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.get(bindingRef(ctx))
```

## G57-E009 — packages/server/src/handlers/actions-binding.ts

assigned_member: packages/server/src/handlers/actions-binding.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7aa3bf6ff8d82ac41e35acb9ffbc4ec44acb07b7`; full-source SHA256 `e7fc29a45370ba8c4456e5c27ee0aaea2c4460b386be04ad5fcf3b91531f73d8`; 2229 source bytes.

Lines 21–29; byte offsets [905, 1603); 698 bytes; span SHA256 `934d85291f277399a8e3d72964d322f2c8656b3a269342be0caa3b1a0d5f6b15`.

```ts
    .handle("actions.binding.update", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      if (ctx.payload.expectedRevision !== undefined && ctx.payload.expectedRevision !== ctx.query.revision)
        return yield* new Actions.ActionsError({ kind: "binding_stale", message: "Binding update revision differs from the selected revision" })
      return yield* actions.bindings.update(ctx.params.bindingID, { ...ctx.payload, expectedRevision: ctx.query.revision })
    })))
    .handle("actions.binding.remove", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.remove(bindingRef(ctx))
```

## G57-E010 — packages/server/src/handlers/actions-binding.ts

assigned_member: packages/server/src/handlers/actions-binding.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7aa3bf6ff8d82ac41e35acb9ffbc4ec44acb07b7`; full-source SHA256 `e7fc29a45370ba8c4456e5c27ee0aaea2c4460b386be04ad5fcf3b91531f73d8`; 2229 source bytes.

Lines 31–41; byte offsets [1612, 2216); 604 bytes; span SHA256 `b3a224ef2b35d1f4d96d4dec07b8fe23653036d59ac490306384d2dd6e1726f4`.

```ts
    .handle("actions.binding.capabilities", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.capabilities(bindingRef(ctx))
    })))
    .handle("actions.binding.policy", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.policy(bindingRef(ctx))
    })))
    .handle("actions.binding.updatePolicy", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.updatePolicy(bindingRef(ctx), ctx.payload)
```

## G57-E011 — packages/server/src/handlers/actions-common.ts

assigned_member: packages/server/src/handlers/actions-common.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2b0ee980a3993effc238c54b685c3dbd90a184ba`; full-source SHA256 `fb84f207b325f69b222a5b45ba819f93c517acb3d1ad1b6c4c3e6a56198f8c5f`; 900 source bytes.

Lines 7–20; byte offsets [257, 898); 641 bytes; span SHA256 `7806f4fbbf4531f92ac81a5c2c3fd807cc7943cc98ab1dd32b0041a3809693b6`.

```ts
export function bindingRef(input: { params: { bindingID: BindingID }; query: { revision: number } }) {
  return { id: input.params.bindingID, revision: input.query.revision }
}

export function result<A, R>(data: Effect.Effect<A, Actions.ActionsError, R>) {
  return response(data.pipe(Effect.mapError(apiError)))
}

export function apiError(error: Actions.ActionsError) {
  return new ActionsApiError({
    kind: error.kind, message: error.message, bindingID: error.bindingID, provider: error.provider,
    resourceID: error.resourceID, retryAfter: error.retryAfter, operationID: error.operationID,
    disposition: error.disposition,
  })
```

## G57-E012 — packages/server/src/handlers/actions-job.ts

assigned_member: packages/server/src/handlers/actions-job.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3ac7250773470110baf53e02423c05e23fc18105`; full-source SHA256 `85f341e3e2cf019a10e584f4ed56c4ca8e450586d3a86ac38d14b527097e2774`; 1296 source bytes.

Lines 9–23; byte offsets [344, 1283); 939 bytes; span SHA256 `41b35fe26c1beefda41355769b083d3d7f1d9a324fd7be3ff97ba76119864c18`.

```ts
    .handle("actions.job.retry", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.retry", ctx.payload, { jobID: ctx.params.jobID })
    })))
    .handle("actions.job.play", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.play", ctx.payload, { jobID: ctx.params.jobID })
    })))
    .handle("actions.job.cancel", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.cancel", ctx.payload, { jobID: ctx.params.jobID })
    })))
    .handle("actions.job.erase", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.erase", ctx.payload, { jobID: ctx.params.jobID })
```

## G57-E013 — packages/server/src/handlers/actions-operation.ts

assigned_member: packages/server/src/handlers/actions-operation.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6a321cd67a6b8f063fab15e3447713086d1af6ab`; full-source SHA256 `9109722eed624929e576c90f906b1ad9ba3fa7becbcfba04d6b8071f62ae6408`; 993 source bytes.

Lines 9–19; byte offsets [356, 980); 624 bytes; span SHA256 `824ef5f8d4c84069072c2af967d07db7ea87712dfb6766f5f04a236b581f932a`.

```ts
    .handle("actions.operation.prepare", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.prepare(bindingRef(ctx), ctx.payload)
    })))
    .handle("actions.operation.get", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.operation(bindingRef(ctx), ctx.params.operationID)
    })))
    .handle("actions.operation.reconcile", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.reconcile(bindingRef(ctx), ctx.params.operationID)
```

## G57-E014 — packages/server/src/handlers/actions-pipeline.ts

assigned_member: packages/server/src/handlers/actions-pipeline.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5f7dff4cabd0fede451fd7ec25a9028617a919c5`; full-source SHA256 `f31f6d4929009eb9d6d72d4d882dfa100fab8185d707f970e8fc738d35e18ea6`; 887 source bytes.

Lines 9–15; byte offsets [354, 874); 520 bytes; span SHA256 `145ff21e032966841d27c0448f1d17169a9758d015cfee52c5c22ca0aab566bb`.

```ts
    .handle("actions.pipeline.mergeRequest", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "pipeline.mergeRequest", ctx.payload, { resourceID: ctx.params.mergeRequestID })
    })))
    .handle("actions.pipeline.trigger", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "pipeline.trigger", ctx.payload, { ref: ctx.payload.input.ref })
```

## G57-E015 — packages/server/src/handlers/actions-resource.ts

assigned_member: packages/server/src/handlers/actions-resource.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aa2fea3cc2877ce7ce42632768ec2afc7b23bf9d`; full-source SHA256 `a3da138d4f5f6321c18bc790da67debf1df622c9fd86563bfc80b683fe054797`; 1957 source bytes.

Lines 10–21; byte offsets [417, 1195); 778 bytes; span SHA256 `15b254acfd5b4746edc908402e1d6bd393c9408e27c1de2bf14b4f94fc4fad24`.

```ts
    .handle("actions.resource.list", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.resources(bindingRef(ctx), {
        kind: ctx.query.kind,
        ...(ctx.query.runID === undefined ? {} : { runID: ctx.query.runID }),
        ...(ctx.query.resourceID === undefined ? {} : { resourceID: ctx.query.resourceID }),
        ...(ctx.query.scope === undefined ? {} : { scope: ctx.query.scope }),
        ...(ctx.query.ref === undefined ? {} : { ref: ctx.query.ref }),
        ...(ctx.query.query === undefined ? {} : { query: ctx.query.query }),
        ...(ctx.query.cursor === undefined ? {} : { cursor: ctx.query.cursor }),
        ...(ctx.query.limit === undefined ? {} : { limit: ctx.query.limit }),
      })
```

## G57-E016 — packages/server/src/handlers/actions-resource.ts

assigned_member: packages/server/src/handlers/actions-resource.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aa2fea3cc2877ce7ce42632768ec2afc7b23bf9d`; full-source SHA256 `a3da138d4f5f6321c18bc790da67debf1df622c9fd86563bfc80b683fe054797`; 1957 source bytes.

Lines 23–32; byte offsets [1204, 1944); 740 bytes; span SHA256 `be9e7d6579f516c88a85b6f8d8627f8e29aa6ae72c3efa7834c0e9f180ff78f9`.

```ts
    .handle("actions.resource.command", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      const resourceKind = ctx.params.resourceKind
      const action = ctx.params.action
      const kind: OperationKind = action === "clear" ? "cache.clear"
        : action === "keep" ? "artifact.keep"
        : action === "play" ? resourceKind === "environments" ? "deployment.review" : "schedule.play"
        : action === "create" ? resourceKind === "runners" ? "runner.register" : "resource.create"
        : action === "delete" ? resourceKind === "runners" ? "runner.remove" : "resource.delete" : "resource.update"
      return yield* actions.execute(bindingRef(ctx), kind, ctx.payload, { resourceKind })
```

## G57-E017 — packages/server/src/handlers/actions-run.ts

assigned_member: packages/server/src/handlers/actions-run.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `598f6f3e0647fe53f6632bf78b66673b75bbbd24`; full-source SHA256 `6177fd44ef1e567f825c12a96e95bb304ee6183a0643267bc43f7d48be37881f`; 2973 source bytes.

Lines 9–24; byte offsets [344, 1399); 1055 bytes; span SHA256 `cc09c2ceaf50e6266183f5e8ab184496cd41045567b55583809d459ec72d8ac3`.

```ts
    .handle("actions.run.list", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.runs(bindingRef(ctx), {
        workflowID: ctx.query.workflowID, cursor: ctx.query.cursor, limit: ctx.query.limit,
        ref: ctx.query.ref, event: ctx.query.event, status: ctx.query.status, commit: ctx.query.commit,
        actor: ctx.query.actor, created: ctx.query.created, createdAfter: ctx.query.createdAfter,
        createdBefore: ctx.query.createdBefore, updatedAfter: ctx.query.updatedAfter, updatedBefore: ctx.query.updatedBefore,
      })
    })))
    .handle("actions.run.get", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.run(bindingRef(ctx), ctx.params.runID)
    })))
    .handle("actions.run.jobs", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.jobs(bindingRef(ctx), { runID: ctx.params.runID, attempt: ctx.query.attempt, cursor: ctx.query.cursor })
```

## G57-E018 — packages/server/src/handlers/actions-run.ts

assigned_member: packages/server/src/handlers/actions-run.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `598f6f3e0647fe53f6632bf78b66673b75bbbd24`; full-source SHA256 `6177fd44ef1e567f825c12a96e95bb304ee6183a0643267bc43f7d48be37881f`; 2973 source bytes.

Lines 26–29; byte offsets [1408, 1745); 337 bytes; span SHA256 `9bc12bebbf58a6df32ffb6c8b6773d7eda2b2592a2d92a15c1962c068e3a12aa`.

```ts
    .handle("actions.run.retry", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), ctx.payload.input.provider === "github" && ctx.payload.input.mode === "failed" ? "run.retryFailed" : "run.retry",
        ctx.payload, { runID: ctx.params.runID })
```

## G57-E019 — packages/server/src/handlers/actions-run.ts

assigned_member: packages/server/src/handlers/actions-run.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `598f6f3e0647fe53f6632bf78b66673b75bbbd24`; full-source SHA256 `6177fd44ef1e567f825c12a96e95bb304ee6183a0643267bc43f7d48be37881f`; 2973 source bytes.

Lines 31–49; byte offsets [1754, 2960); 1206 bytes; span SHA256 `f35b342b2583ec3014ff466b0335495f3111acb51aaa339b46779f3e538b69fd`.

```ts
    .handle("actions.run.cancel", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.cancel", ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.forceCancel", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.forceCancel", ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.remove", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.delete", ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.approveFork", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.approveFork", ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.rename", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.rename", ctx.payload, { runID: ctx.params.runID })
```

## G57-E020 — packages/server/src/handlers/actions-source.ts

assigned_member: packages/server/src/handlers/actions-source.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `319bb830d248814d20a27a94de91520be213d5c8`; full-source SHA256 `9194ce2bd2796955ba7d51c8c42af63c6b6f151679786067468bb736172a7dfa`; 1390 source bytes.

Lines 9–19; byte offsets [350, 1031); 681 bytes; span SHA256 `6acc9f1335665d462462cdaf4a5f11a3860a10ee18540f44a4cf3f7833e0619d`.

```ts
    .handle("actions.source.base", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.sourceBase(bindingRef(ctx), ctx.query.ref)
    })))
    .handle("actions.source.validateDraft", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.validateDraft(bindingRef(ctx), ctx.payload.base, ctx.payload.path, ctx.payload.draft)
    })))
    .handle("actions.source.validate", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.validateSource(bindingRef(ctx), ctx.payload.source, ctx.payload.draft)
```

## G57-E021 — packages/server/src/handlers/actions-source.ts

assigned_member: packages/server/src/handlers/actions-source.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `319bb830d248814d20a27a94de91520be213d5c8`; full-source SHA256 `9194ce2bd2796955ba7d51c8c42af63c6b6f151679786067468bb736172a7dfa`; 1390 source bytes.

Lines 21–25; byte offsets [1040, 1387); 347 bytes; span SHA256 `d4aae2a18cda80d1d28242acd213bb1788f2f00fe60bbe1e3d6c0790c2b6250b`.

```ts
    .handle("actions.source.command", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      const kind = ctx.params.action === "branch" ? "source.branch" : ctx.params.action === "review" ? "source.review" : "source.write"
      return yield* actions.execute(bindingRef(ctx), kind, ctx.payload, {})
    }))),
```

## G57-E022 — packages/server/src/handlers/actions-workflow.ts

assigned_member: packages/server/src/handlers/actions-workflow.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `09f777cf05508ebc344e81f47a8ccb61f2285051`; full-source SHA256 `5242b8c6457eec826e492f2cfa421058478822e83be41110cf50e8647da7cd28`; 1705 source bytes.

Lines 9–21; byte offsets [354, 1114); 760 bytes; span SHA256 `dea51860e999503402050d66128112a0b76f2c82cfc796b9f5927188f4f1f35e`.

```ts
    .handle("actions.workflow.list", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.workflows(bindingRef(ctx), {
        cursor: ctx.query.cursor, limit: ctx.query.limit, query: ctx.query.query, state: ctx.query.state,
      })
    })))
    .handle("actions.workflow.source", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.source(bindingRef(ctx), { path: ctx.query.path, ref: ctx.query.ref })
    })))
    .handle("actions.workflow.graph", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.graph(bindingRef(ctx), { path: ctx.query.path, ref: ctx.query.ref })
```

## G57-E023 — packages/server/src/handlers/actions-workflow.ts

assigned_member: packages/server/src/handlers/actions-workflow.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `09f777cf05508ebc344e81f47a8ccb61f2285051`; full-source SHA256 `5242b8c6457eec826e492f2cfa421058478822e83be41110cf50e8647da7cd28`; 1705 source bytes.

Lines 23–30; byte offsets [1123, 1692); 569 bytes; span SHA256 `b8d9f185a87fad2e16c25d14eb508e3abccba85b4878c8ae0c9420e9aa7f92c2`.

```ts
    .handle("actions.workflow.dispatch", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "workflow.dispatch", ctx.payload, { workflowID: ctx.params.workflowID })
    })))
    .handle("actions.workflow.state", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), ctx.payload.input.enabled ? "workflow.enable" : "workflow.disable", ctx.payload,
        { workflowID: ctx.params.workflowID })
```

## G57-E024 — packages/server/src/handlers/agent.ts

assigned_member: packages/server/src/handlers/agent.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `640c9a2368bbe9d60c5921545fc52e9a9c649ed9`; full-source SHA256 `5ea8a0c52977d04e833edd5e6f8198062b494c1f5f0df50d06fbddc5b7650950`; 5780 source bytes.

Lines 20–29; byte offsets [1064, 1560); 496 bytes; span SHA256 `5ebeec8714c0bcf7089f3efbd351410147cc260a0f2094542c916db4ae3f48ac`.

```ts
    // Agent files are read and written with the process-global FSUtil, captured here so it does not
    // leak into per-request requirements that every host would otherwise have to provide.
    const fs = yield* FSUtil.Service
    const annotate = yield* AgentExecution.Annotate

    return handlers
      .handle("agent.list", () =>
        Effect.gen(function* () {
          const agents = yield* AgentV2.Service
          return yield* response(agents.all().pipe(Effect.flatMap(annotate)))
```

## G57-E025 — packages/server/src/handlers/agent.ts

assigned_member: packages/server/src/handlers/agent.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `640c9a2368bbe9d60c5921545fc52e9a9c649ed9`; full-source SHA256 `5ea8a0c52977d04e833edd5e6f8198062b494c1f5f0df50d06fbddc5b7650950`; 5780 source bytes.

Lines 34–55; byte offsets [1619, 2648); 1029 bytes; span SHA256 `a7e1777da3b466b74832925b6cba7085e15408bb72e840c111285adf6ad5c37d`.

```ts
        Effect.fn(function* (ctx) {
          const agents = yield* AgentV2.Service
          const registry = yield* ToolRegistry.Service
          const skills = yield* SkillV2.Service
          const agent = yield* agents.get(AgentV2.ID.make(ctx.params.agentID))
          if (!agent)
            return yield* new InvalidRequestError({
              message: `Unknown agent: ${ctx.params.agentID}`,
              kind: "agent_unknown",
              field: "agentID",
            })
          const tools = yield* registry.materialize(agent.permissions)
          return yield* response(
            Effect.succeed({
              tools: tools.definitions.map((tool) => ({ name: tool.name, description: tool.description })),
              skills: SkillV2.available(yield* skills.list(), agent).map((skill) => ({
                name: skill.name,
                description: skill.description,
                location: skill.location,
              })),
              engines: yield* engines(agent.toolkit),
            }),
```

## G57-E026 — packages/server/src/handlers/agent.ts

assigned_member: packages/server/src/handlers/agent.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `640c9a2368bbe9d60c5921545fc52e9a9c649ed9`; full-source SHA256 `5ea8a0c52977d04e833edd5e6f8198062b494c1f5f0df50d06fbddc5b7650950`; 5780 source bytes.

Lines 75–88; byte offsets [3193, 3949); 756 bytes; span SHA256 `73e2fd2ca8016c097acb691272aabf229bbb6f7e15bebbc5297413c11e515ffd`.

```ts
          const name = yield* requireName(ctx.params.agentID)
          const location = yield* Location.Service
          const agents = yield* AgentV2.Service
          const file = yield* ConfigAgentFile.write(location.directory, name, ctx.payload).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.mapError((error) =>
              error instanceof ConfigAgentFile.ConflictError
                ? new ConflictError({ message: error.message, resource: error.path })
                : failure(error),
            ),
          )
          // The config agent plugin rescans `.orchestra` on reload, including a folder this write created.
          yield* agents.reload()
          return yield* response(Effect.succeed(file))
```

## G57-E027 — packages/server/src/handlers/agent.ts

assigned_member: packages/server/src/handlers/agent.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `640c9a2368bbe9d60c5921545fc52e9a9c649ed9`; full-source SHA256 `5ea8a0c52977d04e833edd5e6f8198062b494c1f5f0df50d06fbddc5b7650950`; 5780 source bytes.

Lines 129–144; byte offsets [5155, 5780); 625 bytes; span SHA256 `4fbc37bff8efc28c4ef7a098672190f921d318068a79e30b4a701f3d0fc515d1`.

```ts
function requireName(name: string) {
  if (ConfigAgentFile.validName(name)) return Effect.succeed(name)
  return Effect.fail(
    new InvalidRequestError({
      message: "Agent names are 1-64 letters, numbers, hyphens or underscores and not a reserved device name.",
      kind: "agent_name",
      field: "agentID",
    }),
  )
}

function failure(error: ConfigAgentFile.RejectedError | Error) {
  if (error instanceof ConfigAgentFile.RejectedError)
    return new InvalidRequestError({ message: error.message, kind: `agent_file_${error.reason}`, field: "agentID" })
  return new UnknownError({ message: error.message })
}
```

## G57-E028 — packages/server/src/handlers/atlas.ts

assigned_member: packages/server/src/handlers/atlas.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `692afb828dc5c896339adfebbb5e33ef39876347`; full-source SHA256 `5eacbbeeea4ae154b77523f0f3bb14bd6921816ad4ebbb7ee5145050ab874267`; 5875 source bytes.

Lines 21–36; byte offsets [1187, 1926); 739 bytes; span SHA256 `a75be9a510646e61b0529796e81dce750ae9d95ed8e05beb6ab2b2fafb1f8d0c`.

```ts
    const dependencies = { npm: yield* Npm.Service, processes: yield* AppProcess.Service }
    const client = yield* LLMClient.Service
    const unavailable = (error: Atlas.Unavailable) =>
      new ServiceUnavailableError({ service: "atlas", message: error.message })
    const at = <A, R>(call: (atlas: Atlas.Interface) => Effect.Effect<A, Atlas.Unavailable, R>) =>
      response(
        Effect.gen(function* () {
          const location = yield* Location.Service
          return yield* call(
            Atlas.open(
              dependencies,
              Atlas.storeRoot(location.project.directory, location.directory),
              location.project.id,
            ),
          )
        }).pipe(Effect.mapError(unavailable)),
```

## G57-E029 — packages/server/src/handlers/atlas.ts

assigned_member: packages/server/src/handlers/atlas.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `692afb828dc5c896339adfebbb5e33ef39876347`; full-source SHA256 `5eacbbeeea4ae154b77523f0f3bb14bd6921816ad4ebbb7ee5145050ab874267`; 5875 source bytes.

Lines 40–68; byte offsets [2145, 3487); 1342 bytes; span SHA256 `90689cda3ff38269e664cc889c4814b5bb81af35c150b5439e4706850ca1241d`.

```ts
    const model = Effect.fn(function* (providerID: string, modelID: string, system: string) {
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      return Effect.gen(function* () {
        const selected = (yield* catalog.model.available()).find(
          (item) => item.providerID === providerID && item.id === modelID,
        )
        if (!selected) return yield* Effect.fail(new Error(`Model unavailable: ${providerID}/${modelID}`))
        const resolved = yield* SessionRunnerModel.fromCatalogModel(
          selected,
          yield* SessionRunnerModel.credential(catalog, integrations, selected),
        )
        return (prompt: string) => {
          // Gateways such as OpenCode Go refuse a request without a session to route it by; each call is its own.
          const sessionID = SessionID.descending()
          return client
            .stream(
              LLM.request({
                model: resolved,
                http: { headers: SessionRunnerModel.sessionHeaders(resolved, sessionID) },
                system: [SystemPart.make(system)],
                prompt,
              }),
            )
            .pipe(
              Stream.filter(LLMEvent.is.textDelta),
              Stream.map((event) => event.text),
              Stream.mkString,
            )
```

## G57-E030 — packages/server/src/handlers/atlas.ts

assigned_member: packages/server/src/handlers/atlas.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `692afb828dc5c896339adfebbb5e33ef39876347`; full-source SHA256 `5eacbbeeea4ae154b77523f0f3bb14bd6921816ad4ebbb7ee5145050ab874267`; 5875 source bytes.

Lines 92–114; byte offsets [5022, 5859); 837 bytes; span SHA256 `f1ac2ea9b28db30c084cfd785458ba997a25d7260412d39f118c433354fd3685`.

```ts
      .handle("atlas.delegate", (ctx) =>
        Effect.gen(function* () {
          const ask = yield* model(ctx.payload.providerID, ctx.payload.modelID, Atlas.DELEGATE_SYSTEM)
          return yield* at((atlas) =>
            Atlas.delegate(
              {
                atlas,
                draft: (prompt) =>
                  ask.pipe(
                    Effect.flatMap((call) => call(prompt)),
                    Effect.map(Atlas.decodeReply),
                  ),
              },
              ctx.payload,
            ),
          )
        }),
      )
      .handle("atlas.mine", (ctx) =>
        Effect.gen(function* () {
          const ask = yield* model(ctx.payload.providerID, ctx.payload.modelID, Atlas.MINE_SYSTEM)
          return yield* at((atlas) => Atlas.mine({ atlas, model: ask }, ctx.payload))
        }),
```

## G57-E031 — packages/server/src/handlers/behavior.ts

assigned_member: packages/server/src/handlers/behavior.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8388d785f544120e4e9f36bce79d68f64b412b40`; full-source SHA256 `285b610ffb742ebc0e1f19a24b6eb0c0303552d1fe351cef6c6152bd8cc5d8a2`; 772 source bytes.

Lines 8–18; byte offsets [277, 765); 488 bytes; span SHA256 `0e21a39e32df48b81abbe9de086ef3e8c3d20530508ab5a9432cbbe011752f72`.

```ts
export const BehaviorHandler = HttpApiBuilder.group(Api, "server.behavior", (handlers) =>
  handlers.handle(
    "behavior.set",
    Effect.fn(function* (ctx) {
      const behavior = yield* BehaviorV2.Service
      return yield* response(behavior.set(ctx.payload.behaviors)).pipe(
        Effect.catchTag("BehaviorV2.DuplicateError", (error) =>
          Effect.fail(new InvalidRequestError({ message: error.message, kind: "duplicate", field: "behaviors" })),
        ),
      )
    }),
```

## G57-E032 — packages/server/src/handlers/board.ts

assigned_member: packages/server/src/handlers/board.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9b11b400cbcc5da7dfcd6dbd9a04a09425868bde`; full-source SHA256 `dfeb5365d7c500527e66e3c455a70e1e5fa1bf09c1b55f9ceceb739d65aa0ee5`; 3794 source bytes.

Lines 9–23; byte offsets [372, 1687); 1315 bytes; span SHA256 `c4c63c8c5cb584c88445f56bca74186a6d9d3048d9d8d0ee90bbc280f12c8b8e`.

```ts
    const board = yield* Board.Service

    return handlers
      .handle("board.list", (ctx) => board.summaries({ archived: ctx.query.archived }))
      .handle("board.get", (ctx) => board.snapshot(ctx.params.key).pipe(mapNotFound))
      .handle("board.issue", (ctx) => board.issuePage(ctx.params.key, ctx.params.number).pipe(mapNotFound))
      .handle("board.activity", (ctx) => board.activity(ctx.params.key, ctx.query.since).pipe(mapNotFound))
      .handle("board.spend", (ctx) => board.spend(ctx.params.key).pipe(mapNotFound))
      .handle("board.decisions", (ctx) => board.decisions(ctx.params.key).pipe(mapNotFound))
      .handle("board.proof", (ctx) => board.proof(ctx.params.key, ctx.params.number).pipe(mapNotFound))
      .handle("board.decisionChange", (ctx) => board.changeDecision(ctx.params.key, ctx.params.id, ctx.payload).pipe(mapErrors))
      .handle("board.settings", (ctx) => board.settings(ctx.params.key, ctx.payload, "owner").pipe(mapErrors))
      .handle("board.answer", (ctx) => board.answer(ctx.params.key, ctx.params.id, ctx.payload).pipe(mapErrors))
      .handle("board.note", (ctx) => board.note(ctx.params.key, ctx.params.number, ctx.payload).pipe(mapErrors))
      .handle("board.attach", (ctx) => board.attach(ctx.params.key, ctx.params.number, ctx.payload).pipe(mapErrors))
```

## G57-E033 — packages/server/src/handlers/board.ts

assigned_member: packages/server/src/handlers/board.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9b11b400cbcc5da7dfcd6dbd9a04a09425868bde`; full-source SHA256 `dfeb5365d7c500527e66e3c455a70e1e5fa1bf09c1b55f9ceceb739d65aa0ee5`; 3794 source bytes.

Lines 45–57; byte offsets [3221, 3792); 571 bytes; span SHA256 `970a696500ace3ca831fbc2f4b9c4431b7529365f29d8601e60fd303d6c2678c`.

```ts
function mapNotFound<A, R>(effect: Effect.Effect<A, Board.NotFoundError, R>) {
  return effect.pipe(Effect.mapError((error) => new BoardNotFoundError({ message: error.message })))
}

// Core errors become the protocol's tagged errors so the HTTP layer can set 404 and 409.
function mapErrors<A, R>(effect: Effect.Effect<A, Board.Error, R>) {
  return effect.pipe(
    Effect.mapError((error) =>
      error._tag === "Board.NotFoundError"
        ? new BoardNotFoundError({ message: error.message })
        : new BoardRefusedError({ message: error.message }),
    ),
  )
```

## G57-E034 — packages/server/src/handlers/capability-connections.ts

assigned_member: packages/server/src/handlers/capability-connections.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9ca64346ea1c6511674199f2bf4fe05eca666f4a`; full-source SHA256 `fb21aa9975ceb975bedb3fe16cc85b367cd9a3f27691ea7eb9541f93574cbb91`; 4883 source bytes.

Lines 20–36; byte offsets [1261, 2339); 1078 bytes; span SHA256 `46b7455a774e49c4ce428915276457a299a1a7b46b932a75e104f8fd9c9c6666`.

```ts
    const operators = yield* ServerOperator.Service
    const database = yield* Database.Service
    const store = yield* CapabilityConnectionStore.make
    const verifier = yield* ServerCapabilityVerification.Service
    const ledger = yield* CapabilityRequest.make({ operators })
    const setup = yield* CapabilityConnectionSetup.make({ operators, ledger, verifier })
    const bindings = yield* CapabilityConnectionBindings.make({ operators })
    // Cursor encryption keys belong to this handler layer, never an individual request.
    const management = yield* CapabilityConnectionManagement.make({ operators, store }).pipe(
      Effect.provideService(Database.Service, database),
    )
    return handlers
      .handle("capability.connection.connect", ({ payload }) => Effect.gen(function* () {
        const location = yield* Location.Service
        return yield* setup.connect({ projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }, payload)
      }).pipe(connectionResponse))
```

## G57-E035 — packages/server/src/handlers/capability-connections.ts

assigned_member: packages/server/src/handlers/capability-connections.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9ca64346ea1c6511674199f2bf4fe05eca666f4a`; full-source SHA256 `fb21aa9975ceb975bedb3fe16cc85b367cd9a3f27691ea7eb9541f93574cbb91`; 4883 source bytes.

Lines 41–57; byte offsets [2717, 4325); 1608 bytes; span SHA256 `86097ede2aafd1f32127d144d8920317fde5e8664ce26a4abc9fee002daf2d7e`.

```ts
      .handle("capability.connection.list", ({ query }) => Effect.gen(function* () {
        const location = yield* Location.Service
        return yield* management.list({ projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) },
          { ...(query.after === undefined ? {} : { after: query.after }),
            ...(query.limit === undefined ? {} : { limit: query.limit }) })
      }).pipe(connectionResponse))
      .handle("capability.connection.get", ({ params }) => management.get(params.connectionID).pipe(connectionResponse))
      .handle("capability.connection.targets", ({ params, query }) =>
        management.targets(params.connectionID, { ...(query.after === undefined ? {} : { after: query.after }),
          ...(query.limit === undefined ? {} : { limit: query.limit }) }).pipe(connectionResponse))
      .handle("capability.connection.disconnect", ({ payload }) => management.disconnect(payload).pipe(connectionResponse))
      .handle("capability.target.create", ({ payload }) => management.createTarget(payload).pipe(connectionResponse))
      .handle("capability.target.retarget", ({ payload }) => management.retargetTarget(payload).pipe(connectionResponse))
      .handle("capability.target.remove", ({ payload }) => management.removeTarget(payload).pipe(connectionResponse))
      .handle("capability.binding.put", ({ payload }) => management.bind(payload).pipe(connectionResponse))
      .handle("capability.binding.remove", ({ payload }) => management.unbind(payload).pipe(connectionResponse))
```

## G57-E036 — packages/server/src/handlers/capability-connections.ts

assigned_member: packages/server/src/handlers/capability-connections.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9ca64346ea1c6511674199f2bf4fe05eca666f4a`; full-source SHA256 `fb21aa9975ceb975bedb3fe16cc85b367cd9a3f27691ea7eb9541f93574cbb91`; 4883 source bytes.

Lines 61–69; byte offsets [4334, 4883); 549 bytes; span SHA256 `c181d92df2250de572a2be896ba7e597801562a48ab6ea54deddcd05b62fd5fc`.

```ts
export function connectionResponse<A, R>(effect: Effect.Effect<A, CapabilityConnectionStoreContract.Error, R>) {
  return effect.pipe(Effect.catchCause((cause) => Effect.failCause(Cause.fromReasons(cause.reasons.flatMap((reason) => {
    if (reason._tag !== "Fail") return [reason]
    return Cause.fail(reason.error instanceof Capability.Failure
      ? capabilityError(reason.error)
      : new ForbiddenError({ message: "Request denied" })).reasons.map((next) =>
        next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
  })))))
}
```

## G57-E037 — packages/server/src/handlers/capability-operator.ts

assigned_member: packages/server/src/handlers/capability-operator.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e3054b31517cb6aac79153ea7926e3fa0f9831cb`; full-source SHA256 `c5e69c65cb5066136993dc01ddac5e9b3fd929b2903a0fb4c99976addfea53ee`; 1561 source bytes.

Lines 16–27; byte offsets [688, 1561); 873 bytes; span SHA256 `0ac9ce8eddebf873d67836bffaefb9d5491752df984ac8acc174ef1629f158c8`.

```ts
export const inspect = (operator: CapabilityOperatorContract.Interface) => Effect.gen(function* () {
  const location = yield* Location.Service
  const binding = yield* operator.require({ action: "operator.inspect", placement: { projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) } }).pipe(
    Effect.exit, Effect.flatMap((exit) => Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(
      Cause.fromReasons(exit.cause.reasons.flatMap((reason) => reason._tag === "Fail"
        ? Cause.fail(capabilityError(reason.error)).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
        : [reason])),
    )),
  )
  return { requestID: binding.requestID, principal: binding.principal, origin: binding.origin, scopeHash: binding.scopeHash }
})
```

## G57-E038 — packages/server/src/handlers/capability-schedules.ts

assigned_member: packages/server/src/handlers/capability-schedules.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `73da4c80420f4ae1339eaf45194497f5006caf5e`; full-source SHA256 `45b4fdc1b7c9d35d5d995523414dad446f968e667b73680ee2ca47ed883ab8f3`; 2833 source bytes.

Lines 14–31; byte offsets [718, 1972); 1254 bytes; span SHA256 `50644a1079cdd49500baf3d38b5d87a122bd383dbe4fb4776c07ca3b1d9af1f0`.

```ts
    const operators = yield* ServerOperator.Service
    const tasks = yield* ScheduledTask.Service
    const management = CapabilityScheduleOperator.make({ operators, schedules: tasks.capability })
    const placement = Effect.gen(function* () {
      const location = yield* Location.Service
      return { projectID: location.project.id,
        location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }
    })
    return handlers
      .handle("capability.schedule.list", () => placement.pipe(Effect.flatMap(management.list), scheduleResponse))
      .handle("capability.schedule.pause", ({ params }) =>
        placement.pipe(Effect.flatMap((at) => management.pause(at, params.scheduleID)), scheduleResponse))
      .handle("capability.schedule.resume", ({ params }) =>
        placement.pipe(Effect.flatMap((at) => management.resume(at, params.scheduleID)), scheduleResponse))
      .handle("capability.schedule.run", ({ params }) =>
        placement.pipe(Effect.flatMap((at) => management.run(at, params.scheduleID)), scheduleResponse))
      .handle("capability.schedule.remove", ({ params }) =>
        placement.pipe(Effect.flatMap((at) => management.remove(at, params.scheduleID)), scheduleResponse))
```

## G57-E039 — packages/server/src/handlers/capability-schedules.ts

assigned_member: packages/server/src/handlers/capability-schedules.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `73da4c80420f4ae1339eaf45194497f5006caf5e`; full-source SHA256 `45b4fdc1b7c9d35d5d995523414dad446f968e667b73680ee2ca47ed883ab8f3`; 2833 source bytes.

Lines 35–48; byte offsets [1981, 2833); 852 bytes; span SHA256 `200ed405e716f57302311a552940b9f6d94dc6838b5db490757cbbdd814b149a`.

```ts
/** Unknown, foreign and denied schedules collapse to one constant 403; Core detail never reaches the response. */
function scheduleResponse<A, R>(effect: Effect.Effect<A, CapabilityScheduleOperator.Error, R>) {
  return effect.pipe(Effect.catchCause((cause) => Effect.failCause(Cause.fromReasons(cause.reasons.flatMap((reason) => {
    if (reason._tag !== "Fail") return [reason]
    return Cause.fail(mapError(reason.error)).reasons.map((next) =>
      next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
  })))))
}

function mapError(error: CapabilityScheduleOperator.Error) {
  if (error instanceof Capability.Failure) return capabilityError(error)
  if (error._tag === "ScheduledTask.InvalidError") return new ConflictError({ message: "Schedule cannot resume" })
  return new ConflictError({ message: "Schedule run did not start" })
}
```

## G57-E040 — packages/server/src/handlers/command.ts

assigned_member: packages/server/src/handlers/command.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c08e4f1218f1c7a33170069b8b116605ea598246`; full-source SHA256 `14ecfafbebb9e6bc79db2be87e5f9d64fd753d64f1166c8d1b41506ed60fcd33`; 349 source bytes.

Lines 6–8; byte offsets [187, 349); 162 bytes; span SHA256 `a25fc3fa1091bd410ab0c745afdfc3ea74b1e68ae61ebb618c5ca6240a773cb6`.

```ts
export const CommandHandler = HttpApiBuilder.group(Api, "server.command", (handlers) =>
  handlers.handle("command.list", () => response(SlashCommand.list())),
)
```

## G57-E041 — packages/server/src/handlers/config.ts

assigned_member: packages/server/src/handlers/config.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7c646dd72c47b4d58656a6111fbf0778f90b379d`; full-source SHA256 `8f0a504c3e526069e47d3a750a3b284da708a7383f25cc6a854e540b032808f9`; 2094 source bytes.

Lines 14–29; byte offsets [627, 1392); 765 bytes; span SHA256 `b684b3c5a4dbe30762ac04516ded2d3efb6c3c90e81b364eb2149f5e41a4267d`.

```ts
    // Settings are global: the document is written with process-global services and every open location reloads.
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const locations = yield* LocationServiceMap.Service
    return handlers
      .handle("config.shells", () => Effect.promise(() => Shell.list()))
      .handle("config.get", () =>
        Config.readGlobal().pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(Global.Service, global)),
      )
      .handle(
        "config.update",
        Effect.fn(function* (ctx) {
          yield* Config.updateGlobal(ctx.payload).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(Global.Service, global),
          )
```

## G57-E042 — packages/server/src/handlers/config.ts

assigned_member: packages/server/src/handlers/config.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7c646dd72c47b4d58656a6111fbf0778f90b379d`; full-source SHA256 `8f0a504c3e526069e47d3a750a3b284da708a7383f25cc6a854e540b032808f9`; 2094 source bytes.

Lines 31–44; byte offsets [1503, 2066); 563 bytes; span SHA256 `b774e1a31885495a1a607acaa0ce56d68353ec1e49fd70f6cba1980e45d729f9`.

```ts
          const refs = yield* RcMap.keys(locations.rcMap)
          yield* Effect.forEach(
            refs,
            (ref) =>
              Effect.scoped(
                Effect.gen(function* () {
                  const context = yield* locations.contextEffect(ref)
                  yield* Context.get(context, AgentV2.Service).reload()
                  yield* Context.get(context, Catalog.Service).reload()
                }),
              ).pipe(Effect.ignore),
            { discard: true },
          )
          return HttpApiSchema.NoContent.make()
```

## G57-E043 — packages/server/src/handlers/credential.ts

assigned_member: packages/server/src/handlers/credential.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `08007dd56e73cfeec007509e073613c1e528c2af`; full-source SHA256 `ed4d52333c3fdb307c1419728b290231ad91581223c05b652b75251d16b4ab4e`; 1289 source bytes.

Lines 13–17; byte offsets [486, 773); 287 bytes; span SHA256 `bbd7f5e4a1c797eadc2c6c196d04b963a1675f1f785d81ea733bfecfc39831bf`.

```ts
        const integrations = yield* Integration.Service
        yield* integrations.connection
          .update(ctx.params.credentialID, { label: ctx.payload.label })
          .pipe(Effect.catchTag("Credential.InheritedError", inherited))
        return HttpApiSchema.NoContent.make()
```

## G57-E044 — packages/server/src/handlers/credential.ts

assigned_member: packages/server/src/handlers/credential.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `08007dd56e73cfeec007509e073613c1e528c2af`; full-source SHA256 `ed4d52333c3fdb307c1419728b290231ad91581223c05b652b75251d16b4ab4e`; 1289 source bytes.

Lines 23–33; byte offsets [863, 1287); 424 bytes; span SHA256 `8b2e4f4f113a9867d267ad569900f4feddba4d2a70535f4b8859ba603e3867d8`.

```ts
        const integrations = yield* Integration.Service
        yield* integrations.connection
          .remove(ctx.params.credentialID)
          .pipe(Effect.catchTag("Credential.InheritedError", inherited))
        return HttpApiSchema.NoContent.make()
      }),
    ),
)

function inherited(error: Credential.InheritedError) {
  return Effect.fail(new ConflictError({ message: error.message, resource: "credential" }))
```

## G57-E045 — packages/server/src/handlers/formatter.ts

assigned_member: packages/server/src/handlers/formatter.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b6bb087654048fec526a9980c595105ecc921989`; full-source SHA256 `463e3f34b673e5e7ffcf645245508750699e457df8ef5d5c3d9f6720241ce1dc`; 372 source bytes.

Lines 6–8; byte offsets [174, 372); 198 bytes; span SHA256 `9c2e5bb80574796d7489f8a8e338414abb4407e4fda08f2c6b5e4c668835bc78`.

```ts
export const FormatterHandler = HttpApiBuilder.group(Api, "server.formatter", (handlers) =>
  handlers.handle("formatter.status", () => response(Format.Service.use((format) => format.status()))),
)
```

## G57-E046 — packages/server/src/handlers/guardrail.ts

assigned_member: packages/server/src/handlers/guardrail.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b3348283ee22836d8ff08f2237574fd5b82931bc`; full-source SHA256 `d9669d237611181456858a8d0880392578f3b2432c1d5e0932fb70e6ecbbe9a5`; 1098 source bytes.

Lines 11–24; byte offsets [405, 910); 505 bytes; span SHA256 `f4599527536b1fe0beb2a87737ae5ba57deca4e2e1a88764121324b3d203196b`.

```ts
      .handle("guardrail.rules", () =>
        response(
          Effect.gen(function* () {
            const guardrail = yield* Guardrail.Service
            return yield* guardrail.rules().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("guardrail.run", (ctx) =>
        response(
          Effect.gen(function* () {
            const guardrail = yield* Guardrail.Service
            return yield* guardrail.run(ctx.payload).pipe(Effect.mapError(apiError))
          }),
```

## G57-E047 — packages/server/src/handlers/guardrail.ts

assigned_member: packages/server/src/handlers/guardrail.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b3348283ee22836d8ff08f2237574fd5b82931bc`; full-source SHA256 `d9669d237611181456858a8d0880392578f3b2432c1d5e0932fb70e6ecbbe9a5`; 1098 source bytes.

Lines 30–32; byte offsets [938, 1098); 160 bytes; span SHA256 `7fd86c567b39c1973ab76774e42bec7dbd207821b96d96bd0d40a3461ead5da3`.

```ts
function apiError(error: Guardrail.EngineError) {
  return new GuardrailError({ name: "GuardrailError", data: { kind: error.kind, message: error.message } })
}
```

## G57-E048 — packages/server/src/handlers/health.ts

assigned_member: packages/server/src/handlers/health.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2de8e84ad6fe8833aaf3843ff0d292de49bd825a`; full-source SHA256 `a45c1f389238590e7545fc35f83d5b48baa6f74062e028e95b11e6766c44ab3d`; 421 source bytes.

Lines 6–9; byte offsets [194, 419); 225 bytes; span SHA256 `bf9e4ac49cb84d1fa8185b1eedd51b4d19be9f0e2c02ea1bd9800e135a3e8a94`.

```ts
export const HealthHandler = HttpApiBuilder.group(Api, "server.health", (handlers) =>
  handlers.handle("health.get", () =>
    Effect.succeed({ healthy: true as const, pid: process.pid, version: InstallationVersion }),
  ),
```

## G57-E049 — packages/server/src/handlers/installation.ts

assigned_member: packages/server/src/handlers/installation.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5f877ca7ccfc706ed9ca1e1c8cc9ac6971c698c2`; full-source SHA256 `3d5b63f50f030e884075152534e35400ae6ad91bf0f187a45bf1d13fce699842`; 1039 source bytes.

Lines 9–22; byte offsets [392, 1015); 623 bytes; span SHA256 `5ce3aec66c54c120fae7cedd01d04c18749b45e5eecca41d631e9fc55eb89c8d`.

```ts
    const installation = yield* Installation.Service
    return handlers.handle(
      "installation.upgrade",
      Effect.fn(function* (ctx) {
        const method = yield* installation.method()
        if (method === "unknown")
          return yield* new InvalidRequestError({
            message: "Unknown installation method",
            kind: "installation_unknown",
          })
        yield* installation
          .upgrade(method, ctx.payload.target)
          .pipe(Effect.mapError((error) => new UnknownError({ message: error.stderr })))
        return { success: true as const, version: ctx.payload.target }
```

## G57-E050 — packages/server/src/handlers/integration.ts

assigned_member: packages/server/src/handlers/integration.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; full-source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 source bytes.

Lines 8–28; byte offsets [311, 1075); 764 bytes; span SHA256 `94ab5bd16557d838aeab49c06e4c2035b7abfa297bec318b004caf8f3a94d597`.

```ts
const authorize = <A, R>(effect: Effect.Effect<A, Integration.AuthorizationError, R>) =>
  effect.pipe(
    Effect.mapError(
      () =>
        new InvalidRequestError({
          message: "Authentication failed",
          kind: "integration_authorization",
        }),
    ),
  )

const complete = <R>(effect: Effect.Effect<void, Integration.CodeRequiredError | Integration.AuthorizationError, R>) =>
  effect.pipe(
    Effect.mapError(
      (error) =>
        new InvalidRequestError({
          message:
            error._tag === "Integration.CodeRequired" ? "Authorization code is required" : "Authentication failed",
          kind: error._tag === "Integration.CodeRequired" ? "integration_code_required" : "integration_authorization",
        }),
    ),
```

## G57-E051 — packages/server/src/handlers/integration.ts

assigned_member: packages/server/src/handlers/integration.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; full-source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 source bytes.

Lines 42–51; byte offsets [1367, 1881); 514 bytes; span SHA256 `9f7fba6bd86178840df24d0962f7ff7a46335e32a7182b0e60cd9f265d40a8c5`.

```ts
const requireOwner = Effect.fn("IntegrationHandler.requireOwner")(function* (
  service: Integration.Interface,
  params: { attemptID: Integration.AttemptID; integrationID: Integration.ID },
) {
  const current = yield* status(service.attempt.status(params.attemptID))
  if (yield* service.attempt.ownedBy(params.attemptID, params.integrationID)) return current
  return yield* new InvalidRequestError({
    message: "OAuth attempt does not belong to this integration",
    kind: "integration_attempt_owner",
  })
```

## G57-E052 — packages/server/src/handlers/integration.ts

assigned_member: packages/server/src/handlers/integration.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; full-source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 source bytes.

Lines 73–79; byte offsets [2499, 2860); 361 bytes; span SHA256 `ea34d94e2f57eb3f0e3bb56f4f9312ccb3ec8f663abc5c1e24ebc2b21f9378d7`.

```ts
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* service.connection.disconnect(ctx.params.integrationID).pipe(
            Effect.catchTag("Credential.InheritedError", (error) =>
              Effect.fail(new ConflictError({ message: error.message, resource: "credential" })),
            ),
          )
```

## G57-E053 — packages/server/src/handlers/integration.ts

assigned_member: packages/server/src/handlers/integration.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; full-source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 source bytes.

Lines 84–110; byte offsets [2943, 3868); 925 bytes; span SHA256 `c8b3dc664e1ad005314d00cce10a25bb867e213ef9ec48d85f4798da9cbe7bf1`.

```ts
        "integration.connect.key",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* authorize(
            service.connection.key({
              integrationID: ctx.params.integrationID,
              key: ctx.payload.key,
              label: ctx.payload.label,
              metadata: ctx.payload.metadata,
            }),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "integration.connect.oauth",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          return yield* response(
            authorize(
              service.connection.oauth({
                integrationID: ctx.params.integrationID,
                methodID: ctx.payload.methodID,
                inputs: ctx.payload.inputs,
                label: ctx.payload.label,
              }),
            ),
```

## G57-E054 — packages/server/src/handlers/integration.ts

assigned_member: packages/server/src/handlers/integration.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; full-source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 source bytes.

Lines 114–136; byte offsets [3900, 4803); 903 bytes; span SHA256 `11e5e93ab11e8ba3aed71001236e8ecb9d7cd9900d97af47d8c88902ffa678e4`.

```ts
      .handle(
        "integration.oauth.status",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          return yield* response(requireOwner(service, ctx.params))
        }),
      )
      .handle(
        "integration.oauth.complete",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* requireOwner(service, ctx.params)
          yield* complete(service.attempt.complete({ attemptID: ctx.params.attemptID, code: ctx.payload.code }))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "integration.oauth.cancel",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* requireOwner(service, ctx.params)
          yield* service.attempt.cancel(ctx.params.attemptID)
          return HttpApiSchema.NoContent.make()
```

## G57-E055 — packages/server/src/handlers/integration.ts

assigned_member: packages/server/src/handlers/integration.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; full-source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 source bytes.

Lines 140–159; byte offsets [4838, 5649); 811 bytes; span SHA256 `3a7310b57919fa6bbe297ebf70cc25924ae74dd3c9d6679672a6d3ac4698bdae`.

```ts
        "integration.attempt.status",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          return yield* response(status(service.attempt.status(ctx.params.attemptID)))
        }),
      )
      .handle(
        "integration.attempt.complete",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* complete(service.attempt.complete({ attemptID: ctx.params.attemptID, code: ctx.payload.code }))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "integration.attempt.cancel",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* service.attempt.cancel(ctx.params.attemptID)
          return HttpApiSchema.NoContent.make()
```

## G57-E056 — packages/server/src/handlers/lean.ts

assigned_member: packages/server/src/handlers/lean.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3e1eb7e0e5e2215e28b9eed247e0f24d0477d97a`; full-source SHA256 `9b731bdeefe1059a653dbe03f2279f1a0f4e77de0eb162943ab32dd14bf2ed4f`; 2301 source bytes.

Lines 17–30; byte offsets [930, 1686); 756 bytes; span SHA256 `1e6ba47741adb3d1e178f50a799cca48c5eea78c7f663921228d0b8320d0d442`.

```ts
    const preferences = LeanProfilePreferences.make(yield* FSUtil.Service, yield* Global.Service)
    const collector = LeanProject.make(yield* Database.Service)
    const owner = Effect.gen(function* () {
      const location = yield* Location.Service
      return { projectID: location.project.id, directory: location.directory }
    })
    const unavailable = (error: LeanProfilePreferences.Unavailable) =>
      new ServiceUnavailableError({ service: "lean", message: error.message })
    return handlers
      .handle("lean.get", () =>
        response(
          Effect.gen(function* () {
            return yield* collector.read(yield* preferences.read(yield* owner), yield* LeanOutput.configured())
          }).pipe(Effect.mapError(unavailable)),
```

## G57-E057 — packages/server/src/handlers/lean.ts

assigned_member: packages/server/src/handlers/lean.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3e1eb7e0e5e2215e28b9eed247e0f24d0477d97a`; full-source SHA256 `9b731bdeefe1059a653dbe03f2279f1a0f4e77de0eb162943ab32dd14bf2ed4f`; 2301 source bytes.

Lines 33–45; byte offsets [1705, 2274); 569 bytes; span SHA256 `856430bb6f77c0def63fc28bdfc71d620fd47b226af7aaea4d839cf298878b7d`.

```ts
      .handle("lean.update", (ctx) =>
        response(
          Effect.gen(function* () {
            return yield* collector.read(yield* preferences.update(yield* owner, ctx.payload), yield* LeanOutput.configured())
          }).pipe(Effect.mapError(unavailable)),
        ),
      )
      .handle("lean.history", (ctx) =>
        response(
          Effect.gen(function* () {
            const state = yield* preferences.read(yield* owner)
            return yield* collector.history(state.scope, ctx.params.itemID)
          }).pipe(Effect.mapError(unavailable)),
```

## G57-E058 — packages/server/src/handlers/location.ts

assigned_member: packages/server/src/handlers/location.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fd37ae5eefd249b1f06db4a3057b6bd8970615e7`; full-source SHA256 `9c6224360c8bcfcfb3973f2b200c4bb8b9c57d2b32ef55c912a4784ed7a09a4e`; 1318 source bytes.

Lines 12–29; byte offsets [498, 1208); 710 bytes; span SHA256 `1be68340f9fd8b83e3dcc268a0bf5cb4b59e290f3b10d52cee64a8134e0f8424`.

```ts
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    return handlers
      .handle(
        "location.get",
        Effect.fn(function* () {
          const location = yield* Location.Service
          // Opening a directory makes its project known, with its repository, before any Session exists in it.
          yield* ProjectV2.record(database.db, events, {
            id: location.project.id,
            directory: location.project.directory,
            vcs: location.vcs,
          })
          return new Location.Info({
            directory: location.directory,
            workspaceID: location.workspaceID,
            project: location.project,
          })
```

## G57-E059 — packages/server/src/handlers/location.ts

assigned_member: packages/server/src/handlers/location.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fd37ae5eefd249b1f06db4a3057b6bd8970615e7`; full-source SHA256 `9c6224360c8bcfcfb3973f2b200c4bb8b9c57d2b32ef55c912a4784ed7a09a4e`; 1318 source bytes.

Lines 32–32; byte offsets [1228, 1310); 82 bytes; span SHA256 `8958595698280cd9a29a5a902393859ded9c5624187c46472748156fc5bb37b9`.

```ts
      .handle("location.paths", () => Effect.succeed({ home: Global.Path.home }))
```

## G57-E060 — packages/server/src/handlers/lsp.ts

assigned_member: packages/server/src/handlers/lsp.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `08ad1abc8064d1f0868db1d74d67a3d653a8a19c`; full-source SHA256 `f8fc0e69a5aa0c7b35238aa3b1a901784be77bfc7f22008a7768cfab239cac18`; 339 source bytes.

Lines 6–8; byte offsets [168, 339); 171 bytes; span SHA256 `762aa9c685615fc0cf855851d1ab178ed025f00b4cfd0c43eb6ee0e25f27c860`.

```ts
export const LspHandler = HttpApiBuilder.group(Api, "server.lsp", (handlers) =>
  handlers.handle("lsp.status", () => response(LSP.Service.use((lsp) => lsp.status()))),
)
```

## G57-E061 — packages/server/src/handlers/mcp.ts

assigned_member: packages/server/src/handlers/mcp.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`; full-source SHA256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`; 3425 source bytes.

Lines 10–21; byte offsets [380, 1038); 658 bytes; span SHA256 `14fef6129583cfd538ea1fd0bbaa7c4da8a1331810ce0dc0c0e8782fd5c909c3`.

```ts
    .handle("mcp.list", () => response(Mcp.Service.use((mcp) => mcp.list())))
    .handle("mcp.resource.catalog", () => response(Mcp.Service.use((mcp) => mcp.resources())))
    .handle("mcp.config", () => response(Mcp.Service.use((mcp) => mcp.config())))
    .handle("mcp.entries", () =>
      response(Mcp.Service.use((mcp) => mcp.entries()).pipe(Effect.mapError(invalid))),
    )
    .handle("mcp.tools", () => response(Mcp.Service.use((mcp) => mcp.tools())))
    .handle(
      "mcp.add",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.add(ctx.params.server, ctx.payload.config).pipe(Effect.mapError(invalid))
```

## G57-E062 — packages/server/src/handlers/mcp.ts

assigned_member: packages/server/src/handlers/mcp.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`; full-source SHA256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`; 3425 source bytes.

Lines 25–45; byte offsets [1067, 1815); 748 bytes; span SHA256 `0abb10eb6f2859b012934596b9c25b398ad9aa9c23585b8702aa5697ddb7c684`.

```ts
      "mcp.remove",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.remove(ctx.params.server).pipe(
          Effect.catchTag("Mcp.NotFoundError", notFound),
          Effect.catchTag("Mcp.ConfigError", (error) => Effect.fail(invalid(error))),
        )
      }),
    )
    .handle(
      "mcp.connect",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.connect(ctx.params.server).pipe(Effect.catchTag("Mcp.NotFoundError", notFound))
      }),
    )
    .handle(
      "mcp.disconnect",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.disconnect(ctx.params.server).pipe(Effect.catchTag("Mcp.NotFoundError", notFound))
```

## G57-E063 — packages/server/src/handlers/mcp.ts

assigned_member: packages/server/src/handlers/mcp.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`; full-source SHA256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`; 3425 source bytes.

Lines 61–84; byte offsets [2213, 3113); 900 bytes; span SHA256 `f2fbcad69492772068298515353f2cec358f0d7974cbc7f1868d363e8f55c0b2`.

```ts
      "mcp.auth.start",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        return yield* mcp.startAuth(ctx.params.server).pipe(
          Effect.catchTag("Mcp.NotFoundError", notFound),
          Effect.catchTag("Mcp.AuthError", (error) => Effect.fail(invalid(error))),
        )
      }),
    )
    .handle(
      "mcp.auth.callback",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        return yield* mcp.finishAuth(ctx.params.server, ctx.payload.code).pipe(
          Effect.catchTag("Mcp.NotFoundError", notFound),
          Effect.catchTag("Mcp.AuthError", (error) => Effect.fail(invalid(error))),
        )
      }),
    )
    .handle(
      "mcp.auth.remove",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.removeAuth(ctx.params.server).pipe(Effect.catchTag("Mcp.NotFoundError", notFound))
```

## G57-E064 — packages/server/src/handlers/mcp.ts

assigned_member: packages/server/src/handlers/mcp.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`; full-source SHA256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`; 3425 source bytes.

Lines 89–95; byte offsets [3133, 3425); 292 bytes; span SHA256 `dba614cca85d50fe2416cdd516304b77b4adcab1ea237bddd64e396b007d98c2`.

```ts
function notFound(error: Mcp.NotFoundError) {
  return Effect.fail(new McpServerNotFoundError({ server: error.name, message: `MCP server not found: ${error.name}` }))
}

function invalid(error: Mcp.ConfigError | Mcp.AuthError) {
  return new InvalidRequestError({ message: error.message })
}
```

## G57-E065 — packages/server/src/handlers/meeting.ts

assigned_member: packages/server/src/handlers/meeting.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `345c7592ea9625f0fcef9bf993693d1d1a017fae`; full-source SHA256 `c4100cefe2683ebbb91a21b6658f9eb26069eb4e53e1fd9ba31f330499c00566`; 3570 source bytes.

Lines 19–34; byte offsets [707, 1460); 753 bytes; span SHA256 `db33bdf2d54dd98ab2efbe8c6d305259867dc667cc9bf25ebdbb61a5962ff936`.

```ts
      .handle("meeting.append", (ctx) =>
        Effect.gen(function* () {
          const meeting = yield* SessionMeeting.Service
          yield* meeting.append(ctx.payload).pipe(Effect.mapError(apiError))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle("meeting.stop", (ctx) =>
        response(
          Effect.gen(function* () {
            const meeting = yield* SessionMeeting.Service
            const consolidation = yield* MeetingConsolidation.Service
            const stopped = yield* meeting.stop(ctx.payload).pipe(Effect.mapError(apiError))
            // The card is built in the background; stop answers before it is ready.
            yield* consolidation.start(stopped.id)
            return stopped
```

## G57-E066 — packages/server/src/handlers/meeting.ts

assigned_member: packages/server/src/handlers/meeting.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `345c7592ea9625f0fcef9bf993693d1d1a017fae`; full-source SHA256 `c4100cefe2683ebbb91a21b6658f9eb26069eb4e53e1fd9ba31f330499c00566`; 3570 source bytes.

Lines 86–98; byte offsets [3138, 3568); 430 bytes; span SHA256 `035a0801d725110c8389e2a9d6a8e2ae3357af6ad7e8ea6027a561d2c5b7eb91`.

```ts
      .handle("meeting.handoff", (ctx) =>
        response(
          Effect.gen(function* () {
            const handoff = yield* SessionMeeting.HandoffService
            return yield* handoff.handoff(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      ),
  ),
)

function apiError(error: SessionMeeting.MeetingError) {
  return new MeetingError({ name: "MeetingError", data: { reason: error.reason } })
```

## G57-E067 — packages/server/src/handlers/permission.ts

assigned_member: packages/server/src/handlers/permission.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e14f733c5cb7fdb9095fd041916b87a1e83a20d3`; full-source SHA256 `eccfedcd75825cfc8f02ec07e9f30af8c573a23f60ae9b41e58d777e21cf5438`; 3702 source bytes.

Lines 10–12; byte offsets [441, 594); 153 bytes; span SHA256 `bfc12f2481884786274f9bf899fbb2909df01346877d02524dd91897c8e2ef3f`.

```ts
function missingRequest(id: PermissionV2.ID) {
  return new PermissionNotFoundError({ requestID: id, message: `Permission request not found: ${id}` })
}
```

## G57-E068 — packages/server/src/handlers/permission.ts

assigned_member: packages/server/src/handlers/permission.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e14f733c5cb7fdb9095fd041916b87a1e83a20d3`; full-source SHA256 `eccfedcd75825cfc8f02ec07e9f30af8c573a23f60ae9b41e58d777e21cf5438`; 3702 source bytes.

Lines 24–48; byte offsets [926, 1857); 931 bytes; span SHA256 `4540c88d1a827e57f778423f28c6fbc0106267854556628a05b336e910e8b0fc`.

```ts
        "session.permission.create",
        Effect.fn(function* (ctx) {
          const permission = yield* PermissionV2.Service
          return {
            data: yield* permission
              .ask({
                id: ctx.payload.id,
                sessionID: ctx.params.sessionID,
                action: ctx.payload.action,
                resources: ctx.payload.resources,
                save: ctx.payload.save,
                metadata: ctx.payload.metadata,
                source: ctx.payload.source,
                agent: ctx.payload.agent,
              })
              .pipe(
                Effect.catchTag(
                  "Session.NotFoundError",
                  (error) =>
                    new SessionNotFoundError({
                      sessionID: error.sessionID,
                      message: `Session not found: ${error.sessionID}`,
                    }),
                ),
              ),
```

## G57-E069 — packages/server/src/handlers/permission.ts

assigned_member: packages/server/src/handlers/permission.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e14f733c5cb7fdb9095fd041916b87a1e83a20d3`; full-source SHA256 `eccfedcd75825cfc8f02ec07e9f30af8c573a23f60ae9b41e58d777e21cf5438`; 3702 source bytes.

Lines 60–76; byte offsets [2145, 3112); 967 bytes; span SHA256 `be6d7fbc61ad66537ff803d97c9885fff4a966a18464f993c1680c6ca42feffd`.

```ts
        "session.permission.get",
        Effect.fn(function* (ctx) {
          const request = yield* (yield* PermissionV2.Service).get(ctx.params.requestID)
          if (!request || request.sessionID !== ctx.params.sessionID) return yield* missingRequest(ctx.params.requestID)
          return { data: request }
        }),
      )
      .handle(
        "session.permission.reply",
        Effect.fn(function* (ctx) {
          const permission = yield* PermissionV2.Service
          const request = yield* permission.get(ctx.params.requestID)
          if (!request || request.sessionID !== ctx.params.sessionID) return yield* missingRequest(ctx.params.requestID)
          yield* permission
            .reply({ requestID: ctx.params.requestID, reply: ctx.payload.reply, message: ctx.payload.message })
            .pipe(Effect.catchTag("PermissionV2.NotFoundError", () => missingRequest(ctx.params.requestID)))
          return HttpApiSchema.NoContent.make()
```

## G57-E070 — packages/server/src/handlers/permission.ts

assigned_member: packages/server/src/handlers/permission.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e14f733c5cb7fdb9095fd041916b87a1e83a20d3`; full-source SHA256 `eccfedcd75825cfc8f02ec07e9f30af8c573a23f60ae9b41e58d777e21cf5438`; 3702 source bytes.

Lines 80–94; byte offsets [3147, 3674); 527 bytes; span SHA256 `ad208b2a8b72e727d02b7e65c5640f9fccf9c57e4034cd09517152cc71297b05`.

```ts
        "permission.saved.list",
        Effect.fn(function* (ctx) {
          const location = yield* Location.Service
          return {
            data: yield* (yield* PermissionSaved.Service).list({
              projectID: ctx.query.projectID ?? location.project.id,
            }),
          }
        }),
      )
      .handle(
        "permission.saved.remove",
        Effect.fn(function* (ctx) {
          yield* (yield* PermissionSaved.Service).remove(ctx.params.id)
          return HttpApiSchema.NoContent.make()
```

## G57-E071 — packages/server/src/handlers/project-copy.ts

assigned_member: packages/server/src/handlers/project-copy.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fa6258457253f29e7edb555079aac1565c2a9409`; full-source SHA256 `4dda2be957852dec674c9b87ab10d95d13f86eba9bd053c915739defb755ad90`; 4761 source bytes.

Lines 19–40; byte offsets [981, 2079); 1098 bytes; span SHA256 `c2cdb0f7f26fee48b01249cbe08dcd2f66093a526b5c7fe52757316aa281e867`.

```ts
    const generateName = Effect.fn("ProjectCopyHandler.generateName")(function* (context: string | undefined) {
      const text = context?.trim()
      if (!text) return Slug.create()
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      const fallback = yield* catalog.model.default()
      if (!fallback) return Slug.create()
      const selected = (yield* catalog.model.small(fallback.providerID)) ?? fallback
      const model = yield* SessionRunnerModel.fromCatalogModel(
        selected,
        yield* SessionRunnerModel.credential(catalog, integrations, selected),
      )
      // Gateways such as OpenCode Go refuse a request without a session to route it by; each call is its own.
      const sessionID = SessionID.descending()
      const reply = yield* client
        .stream(
          LLM.request({
            model,
            http: { headers: SessionRunnerModel.sessionHeaders(model, sessionID) },
            system: [SystemPart.make(ProjectCopy.NAME_SYSTEM)],
            prompt: ProjectCopy.namePrompt(text),
          }),
```

## G57-E072 — packages/server/src/handlers/project-copy.ts

assigned_member: packages/server/src/handlers/project-copy.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fa6258457253f29e7edb555079aac1565c2a9409`; full-source SHA256 `4dda2be957852dec674c9b87ab10d95d13f86eba9bd053c915739defb755ad90`; 4761 source bytes.

Lines 50–60; byte offsets [2307, 2717); 410 bytes; span SHA256 `bc659fc0d6efc86ebc718186f5492983ca249529fb3ae65b9142f233f6f2f648`.

```ts
      .handle("projectCopy.create", (ctx) =>
        Effect.gen(function* () {
          const copies = yield* ProjectCopy.Service
          const location = yield* Location.Service
          return yield* badRequest(
            copies.create({
              ...ctx.payload,
              projectID: ctx.params.projectID,
              sourceDirectory: location.project.directory,
            }),
          )
```

## G57-E073 — packages/server/src/handlers/project-copy.ts

assigned_member: packages/server/src/handlers/project-copy.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fa6258457253f29e7edb555079aac1565c2a9409`; full-source SHA256 `4dda2be957852dec674c9b87ab10d95d13f86eba9bd053c915739defb755ad90`; 4761 source bytes.

Lines 77–84; byte offsets [3265, 3634); 369 bytes; span SHA256 `db0c48b6142dad529440efb674abe7e3a8aa20b74eec3f4c0c038945356a3d64`.

```ts
      .handle("projectCopy.generateName", (ctx) =>
        generateName(ctx.payload.context).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("project copy name generation failed", { projectID: ctx.params.projectID, cause }).pipe(
              Effect.as(Slug.create()),
            ),
          ),
          Effect.map((name) => ({ name })),
```

## G57-E074 — packages/server/src/handlers/project-copy.ts

assigned_member: packages/server/src/handlers/project-copy.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fa6258457253f29e7edb555079aac1565c2a9409`; full-source SHA256 `4dda2be957852dec674c9b87ab10d95d13f86eba9bd053c915739defb755ad90`; 4761 source bytes.

Lines 90–115; byte offsets [3662, 4759); 1097 bytes; span SHA256 `80fe7a859f621bb14026b810a2a6216fbebedf26b73319835c8fa5b283864791`.

```ts
function badRequest<A, R>(effect: Effect.Effect<A, ProjectCopy.Error, R>) {
  return effect.pipe(
    Effect.mapError(
      (error) =>
        new ProjectCopyError({
          name: "ProjectCopyError",
          data: {
            message: message(error),
            forceRequired: error instanceof Git.WorktreeError ? error.forceRequired : undefined,
          },
        }),
    ),
  )
}

function message(error: ProjectCopy.Error) {
  if (error instanceof ProjectCopy.SourceDirectoryNotFoundError)
    return `Project copy source not found: ${error.directory}`
  if (error instanceof ProjectCopy.DestinationExistsError)
    return `Project copy destination already exists: ${error.directory}`
  if (error instanceof ProjectCopy.DirectoryUnavailableError)
    return `Project copy directory unavailable: ${error.directory}`
  if (error instanceof ProjectCopy.InvalidDirectoryError) return `Invalid project copy directory: ${error.directory}`
  if (error instanceof ProjectCopy.StrategyUnavailableError)
    return `Project copy strategy unavailable: ${error.strategy}`
  return error.message
```

## G57-E075 — packages/server/src/handlers/project.ts

assigned_member: packages/server/src/handlers/project.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0c4bdacc001ec83007a4ad52f643f01e47d21164`; full-source SHA256 `2729612650a620155d83aa017ce98b15dfe1d36c5fff8a9da72bff14ad030b95`; 2178 source bytes.

Lines 15–28; byte offsets [653, 1381); 728 bytes; span SHA256 `72376bbd5625152cce0411f2a399b9e63b921afc6eb99b1171ff5ec9c6119874`.

```ts
    const projects = yield* ProjectV2.Service
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const git = yield* GitCli.Service
    return handlers
      .handle("project.list", () => projects.list())
      .handle("project.directories", (ctx) => projects.directories({ projectID: ctx.params.projectID }))
      .handle(
        "project.update",
        Effect.fn(function* (ctx) {
          const updated = yield* ProjectV2.update(database.db, events, { projectID: ctx.params.projectID, ...ctx.payload })
          if (!updated)
            return yield* new InvalidRequestError({ message: `Project not found: ${ctx.params.projectID}`, field: "projectID" })
          return updated
```

## G57-E076 — packages/server/src/handlers/project.ts

assigned_member: packages/server/src/handlers/project.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0c4bdacc001ec83007a4ad52f643f01e47d21164`; full-source SHA256 `2729612650a620155d83aa017ce98b15dfe1d36c5fff8a9da72bff14ad030b95`; 2178 source bytes.

Lines 31–45; byte offsets [1401, 2150); 749 bytes; span SHA256 `27a65e2d63c21424c19aa9d7d3616a0bee9123de7ddec9b2fff9e7eca329e787`.

```ts
      // Served without the Location middleware: the folder has no project yet, and its services start once it has one.
      .handle(
        "project.initGit",
        Effect.fn(function* () {
          const location = ref(yield* HttpServerRequest.HttpServerRequest)
          const project = yield* ProjectV2.initGit({ db: database.db, events, git, projects }, location.directory)
          const resolved = yield* projects.resolve(location.directory)
          return {
            location: new Location.Info({
              directory: location.directory,
              workspaceID: location.workspaceID,
              project: { id: resolved.id, directory: resolved.directory },
            }),
            data: project ?? null,
          }
```

## G57-E077 — packages/server/src/handlers/pull-request.ts

assigned_member: packages/server/src/handlers/pull-request.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `20ab373169610e127ba50ef1313412c89e64783e`; full-source SHA256 `40f69e4bd3fdb357a0241bca3525cba3a3c677dd1dc277d2335204fb4fedc162`; 1248 source bytes.

Lines 11–24; byte offsets [419, 948); 529 bytes; span SHA256 `b635e804e37cebfa3d6dcf1aaacf7d6d4d322fccf8261d7e3554e106358890cb`.

```ts
      .handle("pullRequest.list", () =>
        response(
          Effect.gen(function* () {
            const pullRequests = yield* PullRequest.Service
            return yield* pullRequests.list().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("pullRequest.create", (ctx) =>
        response(
          Effect.gen(function* () {
            const pullRequests = yield* PullRequest.Service
            return yield* pullRequests.create(ctx.payload).pipe(Effect.mapError(apiError))
          }),
```

## G57-E078 — packages/server/src/handlers/pull-request.ts

assigned_member: packages/server/src/handlers/pull-request.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `20ab373169610e127ba50ef1313412c89e64783e`; full-source SHA256 `40f69e4bd3fdb357a0241bca3525cba3a3c677dd1dc277d2335204fb4fedc162`; 1248 source bytes.

Lines 30–40; byte offsets [976, 1246); 270 bytes; span SHA256 `03e382a527efe16cd3f741962031c9cc6c31f715b6aa8cacf605134a89be87ba`.

```ts
function apiError(error: PullRequest.HostError) {
  return new PullRequestError({
    name: "PullRequestError",
    data: {
      kind: error.kind,
      message: error.message,
      host: error.host,
      branch: error.branch,
      remote: error.remote,
    },
  })
```

## G57-E079 — packages/server/src/handlers/question.ts

assigned_member: packages/server/src/handlers/question.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `22b11e9cff3f9b2ba716af11d7873410c601a2b3`; full-source SHA256 `856f65aac9d6a9f2d96a7eba706922832eda1e4d7c671210ad0efca92f8ca555`; 2443 source bytes.

Lines 14–23; byte offsets [560, 1060); 500 bytes; span SHA256 `34637205a9a351918dfa04e601a2f3fad668cedc4d42bbeec3e632cecb1460f4`.

```ts
    const withOwnedQuestion = Effect.fnUntraced(function* <A, E>(
      sessionID: QuestionV2.Request["sessionID"],
      requestID: QuestionV2.ID,
      use: (question: QuestionV2.Interface) => Effect.Effect<A, E>,
    ) {
      const question = yield* QuestionV2.Service
      const request = (yield* question.list()).find((request) => request.id === requestID)
      if (!request || request.sessionID !== sessionID) return yield* missingRequest(requestID)
      return yield* use(question)
    })
```

## G57-E080 — packages/server/src/handlers/question.ts

assigned_member: packages/server/src/handlers/question.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `22b11e9cff3f9b2ba716af11d7873410c601a2b3`; full-source SHA256 `856f65aac9d6a9f2d96a7eba706922832eda1e4d7c671210ad0efca92f8ca555`; 2443 source bytes.

Lines 33–37; byte offsets [1266, 1516); 250 bytes; span SHA256 `70e849ceb5f0a3aff310f6c208757830ceff8303ee5b7f74255aba2877b98f4b`.

```ts
        "session.question.list",
        Effect.fn(function* (ctx) {
          const requests = yield* (yield* QuestionV2.Service).list()
          return { data: requests.filter((request) => request.sessionID === ctx.params.sessionID) }
        }),
```

## G57-E081 — packages/server/src/handlers/question.ts

assigned_member: packages/server/src/handlers/question.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `22b11e9cff3f9b2ba716af11d7873410c601a2b3`; full-source SHA256 `856f65aac9d6a9f2d96a7eba706922832eda1e4d7c671210ad0efca92f8ca555`; 2443 source bytes.

Lines 40–58; byte offsets [1539, 2415); 876 bytes; span SHA256 `daaa5f8e1ece1431f2d89a5c830cbfd49fad7e95a3faa074db79b96cd4ab5f45`.

```ts
        "session.question.reply",
        Effect.fn(function* (ctx) {
          yield* withOwnedQuestion(ctx.params.sessionID, ctx.params.requestID, (question) =>
            question
              .reply({ requestID: ctx.params.requestID, answers: ctx.payload.answers })
              .pipe(Effect.catchTag("QuestionV2.NotFoundError", () => missingRequest(ctx.params.requestID))),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.question.reject",
        Effect.fn(function* (ctx) {
          yield* withOwnedQuestion(ctx.params.sessionID, ctx.params.requestID, (question) =>
            question
              .reject(ctx.params.requestID)
              .pipe(Effect.catchTag("QuestionV2.NotFoundError", () => missingRequest(ctx.params.requestID))),
          )
          return HttpApiSchema.NoContent.make()
```

## G57-E082 — packages/server/src/handlers/rag-studio-session.ts

assigned_member: packages/server/src/handlers/rag-studio-session.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; full-source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 source bytes.

Lines 18–29; byte offsets [556, 1234); 678 bytes; span SHA256 `ae109519ac495c2c77dba5dc57a6ccd0dc3c650c70be59b8a5174b7ea577ca55`.

```ts
export function session<A>(db: Database.Interface["db"], run: (store: Store, locationId: string) => Promise<A>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const locationId = location.directory
    const sources = yield* db.select().from(RagSourceTable).where(eq(RagSourceTable.location_id, locationId)).all().pipe(Effect.orDie)
    const chunks = yield* db.select().from(RagChunkTable).where(eq(RagChunkTable.location_id, locationId)).all().pipe(Effect.orDie)
    const pipeline = yield* db
      .select()
      .from(RagPipelineTable)
      .where(eq(RagPipelineTable.location_id, locationId))
      .get()
      .pipe(Effect.orDie)
```

## G57-E083 — packages/server/src/handlers/rag-studio-session.ts

assigned_member: packages/server/src/handlers/rag-studio-session.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; full-source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 source bytes.

Lines 36–60; byte offsets [1410, 2531); 1121 bytes; span SHA256 `14c9aa4ca342953600925ff2197fbfe9bacb6d67f79d6724f027bac12b7662d2`.

```ts
    const revisionIds = revisions.map((row) => row.id)
    const members = revisionIds.length
      ? yield* db
          .select()
          .from(RagRevisionSourceTable)
          .where(inArray(RagRevisionSourceTable.revision_id, revisionIds))
          .all()
          .pipe(Effect.orDie)
      : []
    const questions = revisionIds.length
      ? yield* db.select().from(RagQuestionTable).where(inArray(RagQuestionTable.revision_id, revisionIds)).all().pipe(Effect.orDie)
      : []
    const questionIds = questions.map((row) => row.id)
    const traces = questionIds.length
      ? yield* db.select().from(RagTraceTable).where(inArray(RagTraceTable.question_id, questionIds)).all().pipe(Effect.orDie)
      : []
    const files = yield* Effect.promise(async () => {
      const next: Record<string, string | { failed: "no_text_layer"; bytes: string }> = {}
      for (const row of sources) {
        const read = await extract(row.path)
        if ("text" in read) next[row.path] = read.text
        if ("failed" in read && read.failed === "no_text_layer") next[row.path] = read
      }
      return next
    })
```

## G57-E084 — packages/server/src/handlers/rag-studio-session.ts

assigned_member: packages/server/src/handlers/rag-studio-session.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; full-source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 source bytes.

Lines 61–75; byte offsets [2531, 2968); 437 bytes; span SHA256 `0560000f7881cf5087d190623bcaf504dd08d9cfae183299e5b87f9396040a71`.

```ts
    const store = memoryStore({
      projectRoot: location.project.directory,
      locationRoot: location.directory,
      files,
    })
    if (pipeline?.blocked) store.fail(locationId)
    if (pipeline) {
      store.setPipeline(locationId, {
        parser: pipeline.parser,
        boundary: pipeline.boundary,
        tokenizer: pipeline.tokenizer,
        lexical: true,
        embedding: false,
        k: pipeline.k,
      })
```

## G57-E085 — packages/server/src/handlers/rag-studio-session.ts

assigned_member: packages/server/src/handlers/rag-studio-session.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; full-source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 source bytes.

Lines 132–135; byte offsets [4656, 4944); 288 bytes; span SHA256 `067a86a30defc0061da4ffa3532d22aa7ed04e19748258b33f336149520fc339`.

```ts
    yield* Effect.promise(() => withStore(store, () => Promise.all(sources.map((row) => noteBytes(row.id)))))
    const result = yield* Effect.promise(() => withStore(store, () => run(store, locationId)))
    yield* save(db, store, locationId, revisionIds, questionIds)
    return result
```

## G57-E086 — packages/server/src/handlers/rag-studio-session.ts

assigned_member: packages/server/src/handlers/rag-studio-session.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; full-source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 source bytes.

Lines 147–177; byte offsets [5142, 6619); 1477 bytes; span SHA256 `a5e1a40fbde0a15bfca72783781447924dd3cb91715d8baab021670298bee1d2`.

```ts
    if (previousQuestionIds.length) {
      yield* db.delete(RagTraceTable).where(inArray(RagTraceTable.question_id, previousQuestionIds)).run().pipe(Effect.orDie)
    }
    if (previousRevisionIds.length) {
      yield* db.delete(RagQuestionTable).where(inArray(RagQuestionTable.revision_id, previousRevisionIds)).run().pipe(Effect.orDie)
      yield* db
        .delete(RagRevisionSourceTable)
        .where(inArray(RagRevisionSourceTable.revision_id, previousRevisionIds))
        .run()
        .pipe(Effect.orDie)
    }
    yield* db.delete(RagRevisionTable).where(eq(RagRevisionTable.location_id, locationId)).run().pipe(Effect.orDie)
    yield* db.delete(RagChunkTable).where(eq(RagChunkTable.location_id, locationId)).run().pipe(Effect.orDie)
    yield* db.delete(RagSourceTable).where(eq(RagSourceTable.location_id, locationId)).run().pipe(Effect.orDie)
    yield* db.delete(RagPipelineTable).where(eq(RagPipelineTable.location_id, locationId)).run().pipe(Effect.orDie)
    const sources = store.sources().filter((row) => row.locationId === locationId)
    if (sources.length) {
      yield* db
        .insert(RagSourceTable)
        .values(
          sources.map((row) => ({
            id: row.id,
            location_id: row.locationId,
            path: row.path,
            content_hash: row.contentHash,
            status: row.status,
            reparsed_hash: row.reparsedHash ?? null,
          })),
        )
        .run()
        .pipe(Effect.orDie)
```

## G57-E087 — packages/server/src/handlers/rag-studio-session.ts

assigned_member: packages/server/src/handlers/rag-studio-session.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; full-source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 source bytes.

Lines 279–282; byte offsets [9652, 9807); 155 bytes; span SHA256 `1b8b40c98fb4eb30653346720dd023a8094289b5fa8779d0fe37714cc103bf13`.

```ts
function status(value: string) {
  if (value === "read" || value === "failed" || value === "not_yet_read") return value
  return "not_yet_read" as const
}
```

## G57-E088 — packages/server/src/handlers/rag-studio.ts

assigned_member: packages/server/src/handlers/rag-studio.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b91a9e061bb8f818a34756ea7e26e9f27dace4a7`; full-source SHA256 `3a3143d5b3243ac78bc87bd5f9dbb56ae9ab080730dd9ac7060700809de4ef0e`; 4883 source bytes.

Lines 30–46; byte offsets [747, 1397); 650 bytes; span SHA256 `61e92fecf3b4dac59bc3c8f4e3c2784b810abcd41f3a295549e8a60e53bbbce5`.

```ts
const rejected = new InvalidRequestError({ message: "rejected" })

function call<A>(db: Database.Interface["db"], run: (store: Store, locationId: string) => Promise<A>) {
  return session(db, async (store, locationId) => {
    try {
      return await run(store, locationId)
    } catch (error) {
      if (error instanceof Error && error.message === "rejected") return { refused: "rejected" as const }
      throw error
    }
  }).pipe(
    Effect.flatMap((result) =>
      result && typeof result === "object" && "refused" in result && result.refused === "rejected"
        ? Effect.fail(rejected)
        : Effect.succeed(result as A),
    ),
  )
```

## G57-E089 — packages/server/src/handlers/rag-studio.ts

assigned_member: packages/server/src/handlers/rag-studio.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b91a9e061bb8f818a34756ea7e26e9f27dace4a7`; full-source SHA256 `3a3143d5b3243ac78bc87bd5f9dbb56ae9ab080730dd9ac7060700809de4ef0e`; 4883 source bytes.

Lines 55–67; byte offsets [1770, 2443); 673 bytes; span SHA256 `a3ed5ab87ea96d0509f3c18c80d92b66e03734186861c6855a53d66be0547bf1`.

```ts
    .handle("ragStudio.admit", (ctx) =>
      response(
        call(db, async (store, id) => {
          const read = await extract(ctx.payload.path)
          if ("text" in read) store.writeFile(ctx.payload.path, read.text)
          if ("failed" in read && read.failed === "no_text_layer") store.writeFile(ctx.payload.path, read)
          return admit({ locationId: id, path: ctx.payload.path })
        }),
      ),
    )
    .handle("ragStudio.parse", (ctx) => response(call(db, () => parseSource(ctx.params.sourceId))))
    .handle("ragStudio.remove", (ctx) =>
      call(db, () => removeSource(ctx.params.sourceId)).pipe(Effect.as(HttpApiSchema.NoContent.make())),
```

## G57-E090 — packages/server/src/handlers/rag-studio.ts

assigned_member: packages/server/src/handlers/rag-studio.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b91a9e061bb8f818a34756ea7e26e9f27dace4a7`; full-source SHA256 `3a3143d5b3243ac78bc87bd5f9dbb56ae9ab080730dd9ac7060700809de4ef0e`; 4883 source bytes.

Lines 85–102; byte offsets [2958, 4252); 1294 bytes; span SHA256 `c5b455c971c01354f00cff26cdf46a78220d093dd8323fff5977e6126d6d4494`.

```ts
    .handle("ragStudio.revisionRead", (ctx) => response(call(db, () => readRevision(ctx.params.revisionId))))
    .handle("ragStudio.search", (ctx) => response(call(db, () => searchWords(ctx.payload.revisionId, ctx.payload.word))))
    .handle("ragStudio.ask", (ctx) => response(call(db, () => ask(ctx.payload.revisionId, ctx.payload.text))))
    .handle("ragStudio.question", (ctx) =>
      response(call(db, () => saveQuestion(ctx.payload.revisionId, ctx.payload.text, ctx.payload.span))),
    )
    .handle("ragStudio.retrieval", (ctx) =>
      response(call(db, async () => ({ ok: await retrievalProof(ctx.params.questionId, ctx.payload.revisionId) }))),
    )
    .handle("ragStudio.citation", (ctx) =>
      response(call(db, async () => ({ ok: await citationProof(ctx.params.questionId, ctx.payload.sentence) }))),
    )
    .handle("ragStudio.compare", (ctx) =>
      response(call(db, () => compareRevisions(ctx.payload.leftId, ctx.payload.rightId, ctx.payload.proofSetId))),
    )
    .handle("ragStudio.embedding", () => response(call(db, () => enableEmbedding())))
    .handle("ragStudio.pass", (ctx) => response(call(db, () => runPass(ctx.payload.pass, ctx.payload.sourceId))))
    .handle("ragStudio.passes", (ctx) => response(call(db, () => runPasses([...ctx.payload.passes]))))
```

## G57-E091 — packages/server/src/handlers/rag-studio.ts

assigned_member: packages/server/src/handlers/rag-studio.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b91a9e061bb8f818a34756ea7e26e9f27dace4a7`; full-source SHA256 `3a3143d5b3243ac78bc87bd5f9dbb56ae9ab080730dd9ac7060700809de4ef0e`; 4883 source bytes.

Lines 103–118; byte offsets [4252, 4848); 596 bytes; span SHA256 `3fd46ec53745410a786fde36048afda53a173ed1cd7782f125a95a23dded0ae6`.

```ts
    .handle("ragStudio.source", (ctx) =>
      response(
        call(db, async (store) => {
          const found = store.sources().find((row) => row.id === ctx.params.sourceId)
          if (!found) throw new Error("rejected")
          return {
            source: {
              id: found.id,
              locationId: found.locationId,
              path: found.path,
              contentHash: found.contentHash,
              status: found.status,
            },
            text: found.text,
            chunks: store.chunks().filter((chunk) => chunk.sourceId === found.id),
          }
```

## G57-E092 — packages/server/src/handlers/reference.ts

assigned_member: packages/server/src/handlers/reference.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ce39a2f3aa082549fd456f42773c2c4e59a2d69c`; full-source SHA256 `521ea525989df9cb283c92f78fefef28aec0dd4873a0dc223b83297dd42b411b`; 383 source bytes.

Lines 6–8; byte offsets [180, 383); 203 bytes; span SHA256 `71d2d2ec8b7904ed3020cb519870c3f66b8980fbb7094505f8a34c2001f05b7b`.

```ts
export const ReferenceHandler = HttpApiBuilder.group(Api, "server.reference", (handlers) =>
  handlers.handle("reference.list", () => response(Reference.Service.use((reference) => reference.list()))),
)
```

## G57-E093 — packages/server/src/handlers/relay-document.ts

assigned_member: packages/server/src/handlers/relay-document.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; full-source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 source bytes.

Lines 31–41; byte offsets [1509, 2136); 627 bytes; span SHA256 `089a6855a95c5b3a1eef32201c63b925900484c705da7daaed2a16f1b8cde33b`.

```ts
              const scopes = yield* store.scopes()
              // One stored document that no longer validates is left out, not a failed list for Workflows and Hooks.
              const views = yield* Effect.forEach(yield* store.documents(), (document) =>
                RelayDocuments.view(store, document, scopes).pipe(
                  Effect.map((view) => [view]),
                  Effect.catch((error) =>
                    Effect.logWarning("relay document left out of the list", { id: document.id, error }).pipe(
                      Effect.as([]),
                    ),
                  ),
                ),
```

## G57-E094 — packages/server/src/handlers/relay-document.ts

assigned_member: packages/server/src/handlers/relay-document.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; full-source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 source bytes.

Lines 71–89; byte offsets [3127, 4252); 1125 bytes; span SHA256 `37824a19fa6d8b66729e6fcf1d83ae2b90c5c027e7aa5b6d2794855a158725c6`.

```ts
            const payload = ctx.payload
            const guarded = payload.versionId !== undefined || payload.expectedChecksum !== undefined
            // Python saves unguarded when neither guard is sent; here a save must name what it replaces or force it.
            if (!payload.force && !guarded)
              return yield* RelayDocuments.refusal(
                "Send the versionId or expectedChecksum of the document you edited, or force the save",
                400,
                "invalid-request",
              )
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            return yield* documents.use((store) =>
              RelayDocuments.save({
                store,
                skills,
                fields: Struct.omit(payload, ["versionId", "expectedChecksum", "force"]),
                id: ctx.params.documentID,
                expectedVersion: payload.force ? undefined : payload.versionId,
                expectedChecksum: payload.force ? undefined : payload.expectedChecksum,
              }).pipe(Effect.flatMap((saved) => RelayDocuments.view(store, saved))),
```

## G57-E095 — packages/server/src/handlers/relay-document.ts

assigned_member: packages/server/src/handlers/relay-document.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; full-source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 source bytes.

Lines 96–119; byte offsets [4430, 5872); 1442 bytes; span SHA256 `ea8ddaa76b069515b8bd00fb29dd1a57b30353d995e632c3c70c729b244447c9`.

```ts
          const document = yield* store.get(ctx.params.documentID)
          if (!AuthoringHook.isHook(document)) return yield* store.remove(document.id)
          const relay = yield* Relay.Service
          const location = yield* Location.Service
          const retired = yield* RelayHookInstall.uninstallDocument({
            data: path.dirname(path.dirname(relay.paths.root)),
            projectID: location.project.id,
            document: document.id,
            principal: Principal.of(ctx.request),
          }).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.mapError((error) => RelayDocuments.refusal(error.message, 503, error.reason)),
          )
          // Filesystem installs and SQLite rows cannot share a transaction. Never re-enable enforcement on failure.
          yield* Effect.forEach(retired, (change) => relay.record(change.install.installID, change.receipt).pipe(
            Effect.mapError(() => RelayDocuments.refusal(
              "The hook was uninstalled, but its receipt could not be recorded. The document was not deleted.",
              503,
              "receipt-unrecorded",
            )),
          ))
          yield* store.remove(document.id).pipe(Effect.mapError((error) => retired.length
            ? RelayDocuments.refusal(`The hook was uninstalled, but the document could not be deleted: ${error.message}`, error.status, error.code)
            : error))
```

## G57-E096 — packages/server/src/handlers/relay-document.ts

assigned_member: packages/server/src/handlers/relay-document.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; full-source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 source bytes.

Lines 158–164; byte offsets [7369, 7616); 247 bytes; span SHA256 `2e096890e752a3f4a0ba1636e9b5f1e1c00a04efceffc37d432e0145fad5fd2a`.

```ts
      .handle("relay.document.check", () =>
        Effect.fail(
          new RelayForbiddenError({
            code: "maestro-execution-required",
            message: "Executable workflow checks are owned by Maestro.",
          }),
        ),
```

## G57-E097 — packages/server/src/handlers/relay-document.ts

assigned_member: packages/server/src/handlers/relay-document.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; full-source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 source bytes.

Lines 201–213; byte offsets [9197, 9836); 639 bytes; span SHA256 `7de13758f629ab00450dcddb1f6b0d596589db1ecba56ac845713260add77135`.

```ts
            const relay = yield* Relay.Service
            return yield* relay.trial(ctx.payload).pipe(
              Effect.catchTags({
                "Relay.Untrusted": () =>
                  Effect.fail(
                    new RelayForbiddenError({
                      code: "project-untrusted",
                      message: "Trust this project before running its commands from the editor.",
                    }),
                  ),
                "GateShell.Unavailable": (error) =>
                  Effect.fail(RelayDocuments.refusal(`The check could not start (${error.reason}).`, 503, error.reason)),
              }),
```

## G57-E098 — packages/server/src/handlers/relay-document.ts

assigned_member: packages/server/src/handlers/relay-document.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; full-source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 source bytes.

Lines 254–280; byte offsets [11743, 12980); 1237 bytes; span SHA256 `d7e34846c234b1ef7c1e0a15e087238b80531a4a58374c4b76aad6bb8f5f263d`.

```ts
        const changes =
          AuthoringHook.isHook(input.document) && input.fresh
            ? yield* RelayHookInstall.setPublished({
                data: path.dirname(path.dirname(relay.paths.root)),
                projectID: location.project.id,
                document: input.document.id,
                published: input.published,
                principal: input.principal,
              }).pipe(
                Effect.provideService(FSUtil.Service, fs),
                Effect.mapError((error) =>
                  RelayDocuments.refusal(
                    `The installed copies of this hook could not be ${input.published ? "resumed" : "stopped"}, so nothing changed: ${error.message}`,
                    503,
                    error.reason,
                  ),
                ),
              )
            : []
        const committed = yield* input.commit
        yield* Effect.forEach(changes, (change) =>
          relay.record(change.install.installID, change.receipt).pipe(
            Effect.mapError(() =>
              RelayDocuments.refusal(
                `The hook changed, but its ${change.receipt.event} receipt could not be recorded.`,
                503,
                "receipt-unrecorded",
```

## G57-E099 — packages/server/src/handlers/relay-document.ts

assigned_member: packages/server/src/handlers/relay-document.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; full-source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 source bytes.

Lines 291–310; byte offsets [13205, 14339); 1134 bytes; span SHA256 `c55c2cfc3b4b0b5f70a9954f471662d687c948310b171458a53fe613780fe238`.

```ts
            yield* RelayDocuments.requireRepository
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            return yield* documents.use((store) =>
              Effect.gen(function* () {
                const document = yield* store.get(ctx.params.documentID)
                // Python's publish: what does not compile is not published. Nor is a workflow Maestro cannot run.
                yield* RelayDocuments.compile(document, skills)
                if (!AuthoringHook.isHook(document)) yield* RelayWorkflowBinding.admission(document, skills)
                const principal = Principal.of(ctx.request)
                const published = yield* withInstalls({
                  document,
                  published: true,
                  fresh: document.versionId === ctx.payload.versionId && fresh(document, ctx.payload.expectedChecksum),
                  principal,
                  commit: store.publish(
                    ctx.params.documentID,
                    ctx.payload.versionId,
                    ctx.payload.expectedChecksum,
                    principal,
                  ),
```

## G57-E100 — packages/server/src/handlers/relay-document.ts

assigned_member: packages/server/src/handlers/relay-document.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; full-source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 source bytes.

Lines 339–342; byte offsets [15277, 15511); 234 bytes; span SHA256 `add455f2683f313eb758f19dbc04210388d1085efb8559bebcddfb9abd101e36`.

```ts
// What the store's checksum guard accepts.
function fresh(document: RelayAuthoring.Document, expectedChecksum: string | undefined) {
  return expectedChecksum === undefined || expectedChecksum === AuthoringStore.checksum(document)
}
```

## G57-E101 — packages/server/src/handlers/relay-hook.ts

assigned_member: packages/server/src/handlers/relay-hook.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; full-source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 source bytes.

Lines 45–55; byte offsets [2044, 2520); 476 bytes; span SHA256 `e9233f06c05e267c266972e74beb812d038a6d817507e42fc212f631a0b2178a`.

```ts
      .handle("relay.hook.install", (ctx) =>
        run(
          Effect.gen(function* () {
            yield* RelayDocuments.requireRepository
            const changed = yield* RelayHookInstall.install({
              ...(yield* binding),
              ...(yield* pinned(ctx.payload.document, ctx.payload.version)),
              document: ctx.payload.document,
              principal: Principal.of(ctx.request),
            })
            return yield* receipt(changed)
```

## G57-E102 — packages/server/src/handlers/relay-hook.ts

assigned_member: packages/server/src/handlers/relay-hook.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; full-source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 source bytes.

Lines 82–110; byte offsets [3463, 4461); 998 bytes; span SHA256 `c58fc83a255c80329f1f5fea0314ef409cd20065cda42deef9425f8cfe16cea3`.

```ts
      // Pausing and uninstalling stay open outside git, so an install made there earlier can always be taken back.
      .handle("relay.hook.enable", (ctx) =>
        run(
          RelayDocuments.requireRepository.pipe(
            Effect.andThen(binding),
            Effect.flatMap((bound) =>
              RelayHookInstall.setEnabled({
                ...bound,
                installID: ctx.params.installID,
                enabled: true,
                principal: Principal.of(ctx.request),
              }),
            ),
            Effect.flatMap(receipt),
          ),
        ),
      )
      .handle("relay.hook.disable", (ctx) =>
        run(
          binding.pipe(
            Effect.flatMap((bound) =>
              RelayHookInstall.setEnabled({
                ...bound,
                installID: ctx.params.installID,
                enabled: false,
                principal: Principal.of(ctx.request),
              }),
            ),
            Effect.flatMap(receipt),
```

## G57-E103 — packages/server/src/handlers/relay-hook.ts

assigned_member: packages/server/src/handlers/relay-hook.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; full-source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 source bytes.

Lines 122–133; byte offsets [4774, 5151); 377 bytes; span SHA256 `62c61b6118ebeb8fdcc835fd23b04c9db738d9d8cbd7af180670ef5d9a78f94e`.

```ts
      .handle("relay.hook.uninstall", (ctx) =>
        run(
          binding.pipe(
            Effect.flatMap((bound) =>
              RelayHookInstall.uninstall({
                ...bound,
                installID: ctx.params.installID,
                principal: Principal.of(ctx.request),
              }),
            ),
            Effect.flatMap(receipt),
          ),
```

## G57-E104 — packages/server/src/handlers/relay-hook.ts

assigned_member: packages/server/src/handlers/relay-hook.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; full-source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 source bytes.

Lines 153–157; byte offsets [5854, 6192); 338 bytes; span SHA256 `a960138d6d42ef9046e3fb181c576b562081fdb898f8f0c95d6405a2ebb40acf`.

```ts
// hooks.json is keyed by `Global.data` and the project ID, and Relay's data root is `<Global.data>/relay/<projectID>`.
const binding = Effect.gen(function* () {
  const relay = yield* Relay.Service
  const location = yield* Location.Service
  return { data: path.dirname(path.dirname(relay.paths.root)), projectID: location.project.id }
```

## G57-E105 — packages/server/src/handlers/relay-hook.ts

assigned_member: packages/server/src/handlers/relay-hook.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; full-source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 source bytes.

Lines 169–186; byte offsets [6499, 7371); 872 bytes; span SHA256 `942f27b8d806a03f83cccbf823f275055628734cd6e8449088699f5c1d5bbd70`.

```ts
  const document = yield* store.get(documentID)
  const published = document.activeVersionId
  if (!published || (version !== undefined && version !== published))
    return yield* RelayDocuments.refusal(
      "Only the published version of a hook can be installed; publish it first",
      409,
      "not-published",
    )
  const body = yield* store.version(documentID, published)
  if (!AuthoringHook.isHook(body))
    return yield* RelayDocuments.refusal("This document is a workflow, not a hook", 400, "not-a-hook")
  const snapshot = yield* AuthoringHook.compile(body)
  const text = yield* RelayJson.compact(snapshot).pipe(
    Effect.mapError(() =>
      RelayDocuments.refusal("The hook export is not JSON Relay can record", 400, "snapshot-invalid"),
    ),
  )
  return { version: published, snapshot, sha256: createHash("sha256").update(text).digest("hex") }
```

## G57-E106 — packages/server/src/handlers/relay-hook.ts

assigned_member: packages/server/src/handlers/relay-hook.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; full-source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 source bytes.

Lines 191–202; byte offsets [7565, 8024); 459 bytes; span SHA256 `c2b7e81fd29d02ee7203647395c1be410557e0eb15f4e29b273ad2d0008955da`.

```ts
const receipt = Effect.fnUntraced(function* (changed: RelayHookInstall.Changed) {
  const relay = yield* Relay.Service
  yield* relay.record(changed.install.installID, changed.receipt).pipe(
    Effect.mapError(
      () =>
        new RelayUnavailableError({
          code: "receipt-unrecorded",
          message: `The hook change was saved, but its ${changed.receipt.event} receipt could not be recorded.`,
        }),
    ),
  )
  return changed.install
```

## G57-E107 — packages/server/src/handlers/relay-hook.ts

assigned_member: packages/server/src/handlers/relay-hook.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; full-source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 source bytes.

Lines 205–237; byte offsets [8028, 9689); 1661 bytes; span SHA256 `17d8a192e59eb52b4c724b1d8793d566d20b5995280cc19117c23506be8c39bd`.

```ts
const decisions = Effect.fnUntraced(function* (installID: string) {
  // Install IDs name ledger directories; anything else cannot name one.
  if (!INSTALL_ID.test(installID))
    return yield* new RelayNotFoundError({ code: "install-missing", message: `No hook ledger for ${installID}.` })
  const relay = yield* Relay.Service
  const invalid = (message: string) => new RelayConflictError({ code: "ledger-invalid", message })
  const entries = yield* LedgerRead.entries(path.join(relay.paths.hooks, installID, "ledger.jsonl")).pipe(
    Effect.catchTag("LedgerRead.Missing", () => Effect.succeed([])),
    Effect.mapError((error) => invalid(`The hook ledger cannot be read: ${error.reason}`)),
  )
  return yield* Effect.forEach(entries.filter((entry) => entry.event === "hook-decision").slice(-DECISIONS), (entry) =>
    Schema.decodeUnknownEffect(RelayHookDecision)(entry).pipe(
      Effect.mapError((error) => invalid(`A hook decision in the ledger is malformed: ${error.message}`)),
    ),
  )
})

function refused(error: RelayHookInstall.Refused) {
  const fields = { code: error.reason, message: error.message }
  if (error.reason === "install-missing") return new RelayNotFoundError(fields)
  if (error.reason === "snapshot-invalid") return new RelayInvalidError(fields)
  if (UNAVAILABLE.has(error.reason)) return new RelayUnavailableError(fields)
  return new RelayConflictError(fields)
}

const INSTALL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/
const DECISIONS = 500
const UNAVAILABLE = new Set<RelayHookInstall.Reason>([
  "profile-project-invalid",
  "profile-state-root-acquisition",
  "profile-read-acquisition",
  "profile-write-acquisition",
])
```

## G57-E108 — packages/server/src/handlers/relay-run.ts

assigned_member: packages/server/src/handlers/relay-run.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9af748eb25d441d8ed3766b09ef9a610a915b731`; full-source SHA256 `a31caef959e54e26071c0d7d325f685fef6b12c176ab90fa3e7aee4c3f15cbb8`; 5917 source bytes.

Lines 21–28; byte offsets [969, 1476); 507 bytes; span SHA256 `9e899ab964ba6ccb227e24b09b3e6f188bd390b98cd604fb8fc605a8719fc6fb`.

```ts
          const names = yield* Effect.promise(() =>
            readdir(path.join(location.directory, ".relay", "runs")).catch(() => []),
          )
          const runs = yield* Effect.forEach(names, (name) => load(name).pipe(Effect.option))
          return runs
            .flatMap((item) => (Option.isSome(item) ? [item.value.run] : []))
            .filter((run) => ctx.query.document === undefined || run.documentID === ctx.query.document)
            .toSorted((a, b) => b.startedAt - a.startedAt)
```

## G57-E109 — packages/server/src/handlers/relay-run.ts

assigned_member: packages/server/src/handlers/relay-run.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9af748eb25d441d8ed3766b09ef9a610a915b731`; full-source SHA256 `a31caef959e54e26071c0d7d325f685fef6b12c176ab90fa3e7aee4c3f15cbb8`; 5917 source bytes.

Lines 39–78; byte offsets [1855, 3625); 1770 bytes; span SHA256 `9dc76c8f24857871e08d0698e5335a1217dcc85f09b34ca98752f51a51df32a7`.

```ts
const load = Effect.fnUntraced(function* (runID: string) {
  const ledger = yield* ledgerOf(runID)
  const entries = yield* LedgerRead.entries(ledger).pipe(
    Effect.mapError(
      (error) => new RelayConflictError({ code: "ledger-invalid", message: `The run ledger cannot be read: ${error._tag}` }),
    ),
  )
  const bodies = Schema.decodeUnknownOption(Schema.Array(RelayExternal.Body))(entries)
  const run = Option.isSome(bodies) ? RelayExternal.runFromLedger(runID, bodies.value) : undefined
  if (!run)
    return yield* new RelayConflictError({
      code: "ledger-invalid",
      message: `The ledger of ${runID} is not an external run that starts with run.start.`,
    })
  // A broken chain makes its self-reported steps untrustworthy, so the run shows only that it is broken.
  const verified = yield* LedgerVerify.verify(ledger)
  if (verified.exit !== 0)
    return {
      entries,
      run: {
        ...run,
        status: "failed" as const,
        failing: [],
        reason: `Ledger broken: ${`${verified.stdout}${verified.stderr}`.split("\n")[0]}`,
        endedAt: run.endedAt ?? run.startedAt,
        steps: [],
      },
    }
  if (run.status !== "parked" || (yield* Effect.promise(() => waiting(path.dirname(ledger))))) return { entries, run }
  return {
    entries,
    run: {
      ...run,
      status: "failed" as const,
      reason:
        "The process that asked for this approval has exited, so nobody can answer it. Start a new run with a new thread_id, or resume this one from a checkpointer that kept it.",
      endedAt: bodies.pipe(Option.map((value) => value.at(-1)!.at), Option.getOrUndefined),
      steps: run.steps.map((step) => (step.status === "running" ? { ...step, status: "failed" as const } : step)),
    },
  }
```

## G57-E110 — packages/server/src/handlers/relay-run.ts

assigned_member: packages/server/src/handlers/relay-run.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9af748eb25d441d8ed3766b09ef9a610a915b731`; full-source SHA256 `a31caef959e54e26071c0d7d325f685fef6b12c176ab90fa3e7aee4c3f15cbb8`; 5917 source bytes.

Lines 83–90; byte offsets [3816, 4145); 329 bytes; span SHA256 `afcefb73f80707880d949d420c5a3cb017ee81c79f5b78fc896a9131c453f5a3`.

```ts
async function waiting(folder: string) {
  const pid = Number((await Bun.file(path.join(folder, "waiting.pid")).text().catch(() => "")).trim())
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
```

## G57-E111 — packages/server/src/handlers/relay-run.ts

assigned_member: packages/server/src/handlers/relay-run.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9af748eb25d441d8ed3766b09ef9a610a915b731`; full-source SHA256 `a31caef959e54e26071c0d7d325f685fef6b12c176ab90fa3e7aee4c3f15cbb8`; 5917 source bytes.

Lines 94–108; byte offsets [4152, 4846); 694 bytes; span SHA256 `337ea37d284d296c9864b6b57f7219cc9a585273037af25d699e81a1721b6e6b`.

```ts
// The external process records its own checks, so an intact chain proves only that nothing changed afterwards.
const audit = Effect.fnUntraced(function* (runID: string) {
  const ledger = yield* ledgerOf(runID)
  const result = yield* LedgerVerify.verify(ledger)
  const message = `${result.stdout}${result.stderr}`.split("\n")[0] ?? ""
  if (result.exit === 0)
    return {
      status: "pending" as const,
      code: "external-self-reported",
      rows: [
        { label: "Chain", value: "chain intact, self-reported" },
        { label: "Verifier", value: message },
      ],
    }
  return { status: "fail" as const, code: "ledger-broken", rows: [{ label: "Chain", value: message }] }
```

## G57-E112 — packages/server/src/handlers/relay-run.ts

assigned_member: packages/server/src/handlers/relay-run.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9af748eb25d441d8ed3766b09ef9a610a915b731`; full-source SHA256 `a31caef959e54e26071c0d7d325f685fef6b12c176ab90fa3e7aee4c3f15cbb8`; 5917 source bytes.

Lines 111–127; byte offsets [4850, 5917); 1067 bytes; span SHA256 `73dacf0e1da0bb07503d213a150d1c10c7d080f5887fb8ebc1169fe5d6398637`.

```ts
// Only an ID that can name a run folder, whose folder and ledger are not symlinks and resolve inside
// `<location>/.relay/runs`.
const ledgerOf = Effect.fnUntraced(function* (runID: string) {
  const location = yield* Location.Service
  const missing = new RelayNotFoundError({ code: "run-missing", message: `No external run ${runID}.` })
  if (!RelayExternal.RUN_ID.test(runID)) return yield* missing
  const ledger = path.join(location.directory, ".relay", "runs", runID, "ledger.jsonl")
  if (!(yield* Effect.promise(() => contained(location.directory, ledger)))) return yield* missing
  return ledger
})

async function contained(directory: string, ledger: string) {
  const stats = await Promise.all([lstat(path.dirname(ledger)), lstat(ledger)]).catch(() => undefined)
  if (!stats || stats.some((stat) => stat.isSymbolicLink()) || !stats[1].isFile()) return false
  const real = await Promise.all([realpath(ledger), realpath(directory)]).catch(() => undefined)
  return real !== undefined && real[0] === path.join(real[1], path.relative(directory, ledger))
}
```

## G57-E113 — packages/server/src/handlers/research-artifact.ts

assigned_member: packages/server/src/handlers/research-artifact.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fe08e43a395c59631633353043bbd724adf03451`; full-source SHA256 `8a95ff6157c4b15afe8fbd69c37b1d250b635f5ac2819ba4170de070f1c45b38`; 2411 source bytes.

Lines 16–32; byte offsets [834, 2386); 1552 bytes; span SHA256 `42241b2e4b5b7318a9dd358bea92724986b29d88bde5c61ef7e565c2b703f975`.

```ts
    return handlers.handle("research.artifact", (ctx) => Effect.gen(function* () {
      const session = yield* database.db.select({ projectID: SessionTable.project_id }).from(SessionTable)
        .where(eq(SessionTable.id, ctx.params.sessionID)).get().pipe(Effect.orDie)
      if (!session) return yield* new ResearchArtifactNotFoundError({ message: "Research artifact not found" })
      const binding = yield* ResearchBinding.resolve(ctx.params.sessionID, session.projectID)
      const page = yield* artifacts.read(binding, { id: ctx.params.artifactID, revision: ctx.query.revision }, ctx.query.cursor, "task")
      if (page.receipt.binding.executionSessionID !== binding.executionSessionID || page.receipt.binding.taskId !== binding.taskId)
        return yield* new ResearchArtifactNotFoundError({ message: "Research artifact not found" })
      return page
    }).pipe(
      Effect.provideService(Database.Service, database),
       Effect.catchTag("Research.Error", (error) => {
         return Effect.fail(["not_found", "binding_missing", "binding_mismatch", "reference_invalid"].includes(error.code)
           ? new ResearchArtifactNotFoundError({ message: "Research artifact not found" })
           : error.code === "conflict" ? new ConflictError({ message: "Research revision or cursor conflicts" })
           : error.code === "over_cap" ? new InvalidRequestError({ message: "Research request exceeds supported bounds" })
           : new ServiceUnavailableError({ message: "Research artifact is unavailable", service: "research" }))
```

## G57-E114 — packages/server/src/handlers/schedule.ts

assigned_member: packages/server/src/handlers/schedule.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; full-source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 source bytes.

Lines 18–19; byte offsets [721, 837); 116 bytes; span SHA256 `eb59935a4244fdc2a51fb4ffd2eb2c3e23364c2755a0944a1ff873825f85bd98`.

```ts
          const location = yield* Location.Service
          return yield* response(tasks.list(location.directory))
```

## G57-E115 — packages/server/src/handlers/schedule.ts

assigned_member: packages/server/src/handlers/schedule.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; full-source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 source bytes.

Lines 24–35; byte offsets [899, 1479); 580 bytes; span SHA256 `623c7b57c1b67bc130e75e6c0e1b0c5c3ccf44bcbb668f3b779a96342a13230e`.

```ts
        Effect.fn(function* (ctx) {
          const location = yield* Location.Service
          return yield* response(tasks.create(location.directory, ctx.payload)).pipe(
            Effect.catchTags({
              "ScheduledTask.InvalidError": (error) => Effect.fail(invalid(error)),
              "ScheduledTask.ConflictError": (error) =>
                Effect.fail(
                  new ConflictError({
                    message: `Scheduled task ${error.id} belongs to another directory`,
                    resource: error.id,
                  }),
                ),
```

## G57-E116 — packages/server/src/handlers/schedule.ts

assigned_member: packages/server/src/handlers/schedule.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; full-source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 source bytes.

Lines 43–48; byte offsets [1605, 1982); 377 bytes; span SHA256 `df41f90fd3fa24a075b55164b7131acac9fb024675e433af5b602a2573d1e92b`.

```ts
          const location = yield* Location.Service
          return yield* response(tasks.update(location.directory, ctx.params.scheduleID, ctx.payload)).pipe(
            Effect.catchTags({
              "ScheduledTask.NotFoundError": (error) => Effect.fail(notFound(error)),
              "ScheduledTask.InvalidError": (error) => Effect.fail(invalid(error)),
            }),
```

## G57-E117 — packages/server/src/handlers/schedule.ts

assigned_member: packages/server/src/handlers/schedule.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; full-source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 source bytes.

Lines 55–59; byte offsets [2092, 2384); 292 bytes; span SHA256 `889d7e55ba6c01c3a08a92841bb3e5c5139ab4762e2392cf49c89b6057a2a210`.

```ts
          const location = yield* Location.Service
          yield* tasks
            .remove(location.directory, ctx.params.scheduleID)
            .pipe(Effect.catchTag("ScheduledTask.NotFoundError", (error) => Effect.fail(notFound(error))))
          return HttpApiSchema.NoContent.make()
```

## G57-E118 — packages/server/src/handlers/schedule.ts

assigned_member: packages/server/src/handlers/schedule.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; full-source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 source bytes.

Lines 65–69; byte offsets [2479, 2853); 374 bytes; span SHA256 `b439373a2b426d73f0086f4dbc8346ff92eaabec25acb24ecb4866ecf3112416`.

```ts
          const location = yield* Location.Service
          return yield* response(tasks.run(location.directory, ctx.params.scheduleID)).pipe(
            Effect.catchTags({
              "ScheduledTask.NotFoundError": (error) => Effect.fail(notFound(error)),
              "ScheduledTask.RunError": (error) => Effect.fail(new ScheduleRunError({ message: error.reason })),
```

## G57-E119 — packages/server/src/handlers/schedule.ts

assigned_member: packages/server/src/handlers/schedule.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; full-source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 source bytes.

Lines 77–82; byte offsets [2910, 3215); 305 bytes; span SHA256 `1a96f3c6e911776ae6f0450fd13dc5386a36fab32fcf16ab6c32df44b9c71d30`.

```ts
function notFound(error: ScheduledTask.NotFoundError) {
  return new ScheduleNotFoundError({ scheduleID: error.id, message: `Scheduled task not found: ${error.id}` })
}

function invalid(error: ScheduledTask.InvalidError) {
  return new InvalidRequestError({ message: error.message, field: error.field })
```

## G57-E120 — packages/server/src/handlers/skill.ts

assigned_member: packages/server/src/handlers/skill.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; full-source SHA256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`; 1871 source bytes.

Lines 16–27; byte offsets [643, 1130); 487 bytes; span SHA256 `acebf103e69b833e49cc424cd63bd8fbd23eda9c1215f05b9fc43fadf74a03ea`.

```ts
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        const input = ctx.payload
        return yield* response(
          skill.save(location.directory, {
            name: input.name,
            description: input.description,
            content: input.content,
            location: input.path,
            mtime: input.mtime,
          }),
        ).pipe(Effect.catchTag("SkillWriteError", (error) => Effect.fail(writeError(error))))
```

## G57-E121 — packages/server/src/handlers/skill.ts

assigned_member: packages/server/src/handlers/skill.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; full-source SHA256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`; 1871 source bytes.

Lines 33–38; byte offsets [1215, 1600); 385 bytes; span SHA256 `855ab66097572e1045a59afa8dab8b511021ed250d7c27cdc84750ea1cc89b6c`.

```ts
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        return yield* response(skill.remove(location.directory, ctx.query.path).pipe(Effect.as(true))).pipe(
          Effect.catchTag("SkillWriteError", (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message, kind: error.reason, field: "path" })),
          ),
```

## G57-E122 — packages/server/src/handlers/skill.ts

assigned_member: packages/server/src/handlers/skill.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; full-source SHA256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`; 1871 source bytes.

Lines 44–47; byte offsets [1630, 1871); 241 bytes; span SHA256 `d555ff9c2d9392b7f1290818fed6f2ecbe6e1256a09a313b1254f8201428674e`.

```ts
function writeError(error: SkillFile.WriteError) {
  if (error.reason === "conflict") return new ConflictError({ message: error.message, resource: "skill" })
  return new InvalidRequestError({ message: error.message, kind: error.reason })
}
```

## G57-E123 — packages/server/src/handlers/trust.ts

assigned_member: packages/server/src/handlers/trust.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c6ca8337aaaee3a64bc2b9dac74764edd9ee1975`; full-source SHA256 `8ad52039bad0345cbe1926be946a4d1642230f07abb536c5d5324df7741116f2`; 2409 source bytes.

Lines 14–29; byte offsets [707, 1284); 577 bytes; span SHA256 `593c078180a0520d9b188325f83dc2e72c0b8228d18761a0ff862b028fa14b4b`.

```ts
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const locations = yield* LocationServiceMap.Service
    const applyTrust = Effect.fn(function* () {
      const refs = yield* RcMap.keys(locations.rcMap)
      yield* Effect.forEach(
        refs,
        (ref) =>
          Effect.scoped(
            Effect.gen(function* () {
              const context = yield* locations.contextEffect(ref)
              yield* Context.get(context, Mcp.Service).applyTrust()
            }),
          ).pipe(Effect.ignore),
        { discard: true },
      )
```

## G57-E124 — packages/server/src/handlers/trust.ts

assigned_member: packages/server/src/handlers/trust.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c6ca8337aaaee3a64bc2b9dac74764edd9ee1975`; full-source SHA256 `8ad52039bad0345cbe1926be946a4d1642230f07abb536c5d5324df7741116f2`; 2409 source bytes.

Lines 41–49; byte offsets [1583, 2017); 434 bytes; span SHA256 `2629d39a3a9e782a76b011000a8edc734715df3f92abce00bb72b9ce0e29cc10`.

```ts
          yield* ConfigTrust.approve(ctx.payload.directory).pipe(
            Effect.catchTag("ConfigTrust.DirectoryError", (error) =>
              Effect.fail(new InvalidRequestError({ message: error.message })),
            ),
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(Global.Service, global),
          )
          yield* applyTrust()
          return HttpApiSchema.NoContent.make()
```

## G57-E125 — packages/server/src/handlers/trust.ts

assigned_member: packages/server/src/handlers/trust.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c6ca8337aaaee3a64bc2b9dac74764edd9ee1975`; full-source SHA256 `8ad52039bad0345cbe1926be946a4d1642230f07abb536c5d5324df7741116f2`; 2409 source bytes.

Lines 55–60; byte offsets [2112, 2381); 269 bytes; span SHA256 `5c17336c4f340ada38121470b22d95fd57ff630a212c605146fcb6706d9b603a`.

```ts
          yield* ConfigTrust.revoke(ctx.payload.directory).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(Global.Service, global),
          )
          yield* applyTrust()
          return HttpApiSchema.NoContent.make()
```

## G57-E126 — packages/server/src/handlers/vcs.ts

assigned_member: packages/server/src/handlers/vcs.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `18356095e244f41eefe459a2213ae2263577d1a3`; full-source SHA256 `11eea74dd0da6ececd8e46f2a55d63f7ee318f5098ed4a931b4879e565e5efed`; 3540 source bytes.

Lines 17–21; byte offsets [793, 1045); 252 bytes; span SHA256 `024a7c2f20795ecf14d279dd65ccd64ff165dd14a8e77588e1e81bfa03af274d`.

```ts
    const branches = Effect.fnUntraced(function* (directory: string) {
      const [current, root] = yield* Effect.all([git.branchCached(directory), git.defaultBranchCached(directory)], {
        concurrency: 2,
      })
      return { current, root }
```

## G57-E127 — packages/server/src/handlers/vcs.ts

assigned_member: packages/server/src/handlers/vcs.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `18356095e244f41eefe459a2213ae2263577d1a3`; full-source SHA256 `11eea74dd0da6ececd8e46f2a55d63f7ee318f5098ed4a931b4879e565e5efed`; 3540 source bytes.

Lines 27–39; byte offsets [1157, 1727); 570 bytes; span SHA256 `c49b4cb4bbde65a98303bc584f80ea64f8caf064b8c3aaf693f4b8ab79ed4608`.

```ts
            const location = yield* Location.Service
            if (location.vcs?.type !== "git") return {}
            const found = yield* branches(location.directory)
            return { branch: found.current, default_branch: found.root?.name }
          }),
        ),
      )
      .handle("vcs.status", () =>
        response(
          Effect.gen(function* () {
            const location = yield* Location.Service
            if (location.vcs?.type !== "git") return []
            return yield* Vcs.status(git, location.directory, location.project.directory)
```

## G57-E128 — packages/server/src/handlers/vcs.ts

assigned_member: packages/server/src/handlers/vcs.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `18356095e244f41eefe459a2213ae2263577d1a3`; full-source SHA256 `11eea74dd0da6ececd8e46f2a55d63f7ee318f5098ed4a931b4879e565e5efed`; 3540 source bytes.

Lines 46–54; byte offsets [1849, 2256); 407 bytes; span SHA256 `7b7611c939812becb6831f6610adf4d1368bc57d6a1fce694c5450858a9c1593`.

```ts
            const location = yield* Location.Service
            if (location.vcs?.type !== "git") return []
            return yield* Vcs.diff(
              git,
              location.directory,
              ctx.query.mode === "working" ? "git" : "branch",
              ctx.query.mode === "branch" ? yield* branches(location.directory) : {},
              { context: ctx.query.context },
            )
```

## G57-E129 — packages/server/src/handlers/vcs.ts

assigned_member: packages/server/src/handlers/vcs.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `18356095e244f41eefe459a2213ae2263577d1a3`; full-source SHA256 `11eea74dd0da6ececd8e46f2a55d63f7ee318f5098ed4a931b4879e565e5efed`; 3540 source bytes.

Lines 76–86; byte offsets [2918, 3499); 581 bytes; span SHA256 `22c623402f267d4c64e28023074744c1e160b80e7e22c3f5af4108e15801ab1a`.

```ts
            const location = yield* Location.Service
            // Non-git directories share the global project, so they are scoped to their own directory.
            const scope =
              location.project.id === ProjectV2.ID.global
                ? { directory: location.directory }
                : { projectID: location.project.id }
            return yield* SessionActivity.collect({
              scope,
              period: ctx.query.period,
              now: yield* Clock.currentTimeMillis,
            }).pipe(Effect.provideService(Database.Service, database))
```

## G57-E130 — packages/server/src/operator.ts

assigned_member: packages/server/src/operator.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `36a1723eea73686796fe3917b42bfbfad6ed6386`; full-source SHA256 `061a54b7023425c5b0f9d78a9b41fcd84995a6553e2826725ff64245bcbc1199`; 731 source bytes.

Lines 8–15; byte offsets [309, 731); 422 bytes; span SHA256 `b441eb328177b6b7e3febfc43dbbb94ddc57c5e9173efe9c9919bb13c53a23b1`.

```ts
/** Host-injected facade; its scoped Core factory owns authority and the request frame. */
export class Service extends Context.Service<Service, CapabilityOperatorContract.Interface>()(
  "@orchestra/ServerOperator",
) {}

export const layer = Layer.effect(Service, Effect.suspend(() => CapabilityOperator.make({
  principal: Principal.account(), scope: { placements: "instance", actions: ["*"] },
})).pipe(Effect.orDie))
```

## G57-E131 — packages/server/src/relay-documents.ts

assigned_member: packages/server/src/relay-documents.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; full-source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 source bytes.

Lines 43–63; byte offsets [1968, 2853); 885 bytes; span SHA256 `d852f461f0aa913b51915c0f14d7ca993dcd7c67f2f2f091c356591553ac739c`.

```ts
    const seeded = new Set<string>()
    const stores = yield* RcMap.make({
      lookup: (root: string) =>
        Effect.gen(function* () {
          const store = yield* AuthoringStore.open(root, path.basename(root))
          if (seeded.has(root)) return store
          seeded.add(root)
          // A missing profile catalog leaves the templates out; the project's own documents stay usable.
          yield* AuthoringStore.seedProfiles(store).pipe(
            Effect.catchCause((cause) => Effect.logWarning("relay profiles were not seeded", { root, cause })),
          )
          return store
        }),
      idleTimeToLive: "10 minutes",
    })
    return Service.of({
      use: (use) =>
        Effect.gen(function* () {
          const relay = yield* Relay.Service
          return yield* use(yield* RcMap.get(stores, relay.paths.root))
        }).pipe(Effect.scoped),
```

## G57-E132 — packages/server/src/relay-documents.ts

assigned_member: packages/server/src/relay-documents.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; full-source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 source bytes.

Lines 105–129; byte offsets [4521, 5816); 1295 bytes; span SHA256 `00e7cb68bd47fea6b5121d470b60eae39e68cd675ce662d8a51afb2d08ccac20`.

```ts
  const before = input.id ? yield* input.store.get(input.id) : undefined
  const fields = yield* rounded(input.fields)
  const candidate: Record<string, unknown> = structuredClone({ ...before, ...fields })
  Object.entries({ name: "New Relay workflow", nodes: [], connections: {}, meta: {} }).forEach((entry) => {
    if (!Object.hasOwn(candidate, entry[0])) candidate[entry[0]] = entry[1]
  })
  // Only publish and unpublish change what is available to run or install, never a save.
  candidate.active = before?.active ?? false
  candidate.activeVersionId = before?.activeVersionId ?? null
  yield* AuthoringGraph.validate(candidate)
  const meta = candidate.meta as { relay?: Record<string, unknown> }
  meta.relay ??= { schema: 1, kind: "workflow" }
  const relay = meta.relay
  const hook = AuthoringHook.isHook(candidate)
  relay.kind = hook ? "hook" : "workflow"
  const compiled = yield* (hook ? AuthoringHook.compile(candidate) : align(candidate, relay, input.skills)).pipe(
    Effect.result,
  )
  relay.diagnostics = Result.isSuccess(compiled) ? [] : [compiled.failure.message]
  return yield* input.store.save({
    body: candidate as Partial<RelayAuthoring.Document>,
    id: input.id,
    expectedVersion: input.expectedVersion,
    expectedChecksum: input.expectedChecksum,
  })
```

## G57-E133 — packages/server/src/relay-documents.ts

assigned_member: packages/server/src/relay-documents.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; full-source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 source bytes.

Lines 143–155; byte offsets [6471, 7200); 729 bytes; span SHA256 `03b1ae6dd572187e17f4ef3450d72a3519568d5c4d809e0dd8aaa6e4c6d01caf`.

```ts
export function skills(catalog: SkillV2.Interface): AuthoringGraph.SkillResolver {
  return (name) =>
    catalog.list().pipe(
      Effect.flatMap((list) => {
        const skill = list.find((item) => item.name === name)
        if (!skill) return Effect.fail(refusal("Skill unavailable", 404, "skill-unavailable"))
        if (!skill.content.trim() || skill.content.includes("\0") || Buffer.byteLength(skill.content) > SKILL_LIMIT)
          return Effect.fail(refusal("The skill is empty, invalid or over the size limit", 400, "invalid-request"))
        return Effect.succeed({
          id: skill.name,
          content: skill.content,
          sha256: createHash("sha256").update(skill.content).digest("hex"),
        })
```

## G57-E134 — packages/server/src/relay-documents.ts

assigned_member: packages/server/src/relay-documents.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; full-source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 source bytes.

Lines 166–173; byte offsets [7626, 7973); 347 bytes; span SHA256 `6a404a8d83f3ee9cb5bd6bacfaf2bdfcd02de6442c781338257e1a688d3b8327`.

```ts
export const requireRepository = Effect.gen(function* () {
  const location = yield* Location.Service
  if (location.project.id !== ProjectID.global) return
  return yield* refusal(
    "Hooks and workflows need a git repository. This folder isn't one, so they would apply to every non-repository folder.",
    409,
    "repository-required",
  )
```

## G57-E135 — packages/server/src/relay-documents.ts

assigned_member: packages/server/src/relay-documents.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; full-source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 source bytes.

Lines 181–200; byte offsets [8179, 9068); 889 bytes; span SHA256 `70a32136db33d86cc5e3346a35e9dcbdd785f432a31e98ffe956a90804cc4c4e`.

```ts
export function refusals<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.catchIf(
      (error): error is Extract<E, AuthoringGraph.Refusal> => error instanceof AuthoringGraph.Refusal,
      (error) => Effect.fail(refused(error)),
    ),
  )
}

/** An authoring refusal as the HttpApi error of its status. */
export function refused(error: { readonly status: number; readonly code: string; readonly message: string }) {
  const fields = { code: error.code, message: error.message }
  if (error.status === 404) return new RelayNotFoundError(fields)
  if (error.status === 409) return new RelayConflictError(fields)
  if (error.status === 503) return new RelayUnavailableError(fields)
  return new RelayInvalidError(fields)
}

export function refusal(message: string, status: number, code: string) {
  return new AuthoringGraph.Refusal({ status, code, message })
```

## G57-E136 — packages/server/src/relay-documents.ts

assigned_member: packages/server/src/relay-documents.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; full-source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 source bytes.

Lines 203–204; byte offsets [9071, 9143); 72 bytes; span SHA256 `2f26bfa99c7488b10d77d6320dcb574990862cbb8bc6f57c2b85710ceeb48b9d`.

```ts
// relay_authoring/skills.py LIMIT.
const SKILL_LIMIT = 2 * 1024 * 1024
```

## G57-E137 — packages/server/src/relay-documents.ts

assigned_member: packages/server/src/relay-documents.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; full-source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 source bytes.

Lines 233–244; byte offsets [10525, 11103); 578 bytes; span SHA256 `b015f0b93a648707cd5604177e1c3f1c8f3c0cf0825186c84972a544216dbea3`.

```ts
function rounded(fields: RelayDocumentCreate) {
  if (!fields.nodes) return Effect.succeed(fields)
  if (fields.nodes.some((node) => node.typeVersion !== undefined && !Number.isInteger(node.typeVersion)))
    return Effect.fail(refusal("A node typeVersion must be a whole number", 400, "invalid-request"))
  return Effect.succeed({
    ...fields,
    // `|| 0` keeps -0 (a rounded -0.4) out of the stored JSON.
    nodes: fields.nodes.map((node) => ({
      ...node,
      position: [Math.round(node.position[0]) || 0, Math.round(node.position[1]) || 0] as const,
    })),
  })
```

## G57-E138 — packages/server/src/web-ui.ts

assigned_member: packages/server/src/web-ui.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6bdd0f2213ecb53ca74ac935c0a16da1198fae77`; full-source SHA256 `2b473ed1ba3f6de98f602a6f47af37715dc827f989b7b7233df1355568bd83dc`; 2660 source bytes.

Lines 9–23; byte offsets [332, 1219); 887 bytes; span SHA256 `b0d4894d656887e6cc60187a408b85558f9959ed9612396e189a69708db27177`.

```ts
export function csp(hash = "") {
  return `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${hash ? ` 'sha256-${hash}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; media-src 'self' data:; connect-src * data: blob:`
}

export function cspForHtml(body: string) {
  const match = body.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i)
  return csp(match ? createHash("sha256").update(match[2]).digest("base64") : "")
}

/** Where the built web app lives: an explicit directory, else a `web` folder next to the executable. */
export async function resolveRoot(candidates: ReadonlyArray<string | undefined>) {
  for (const candidate of candidates) {
    if (candidate && (await Bun.file(path.join(candidate, "index.html")).exists())) return candidate
  }
  return undefined
```

## G57-E139 — packages/server/src/web-ui.ts

assigned_member: packages/server/src/web-ui.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6bdd0f2213ecb53ca74ac935c0a16da1198fae77`; full-source SHA256 `2b473ed1ba3f6de98f602a6f47af37715dc827f989b7b7233df1355568bd83dc`; 2660 source bytes.

Lines 30–46; byte offsets [1487, 2497); 1010 bytes; span SHA256 `2cb86f05c6efb2bff17a36a18524cfd61e28d16afd3859445b27eea4338af2e3`.

```ts
export function layer(root: string) {
  const base = path.resolve(root)
  return HttpRouter.add(
    "GET",
    "/*",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
      const requested = path.resolve(base, "." + pathname)
      // A path that climbs out of the root is answered like a missing file, never read.
      const inside = requested === base || requested.startsWith(base + path.sep)
      return yield* Effect.promise(async () => {
        const file = inside && (await exists(requested)) ? requested : path.join(base, "index.html")
        const body = new Uint8Array(await Bun.file(file).arrayBuffer())
        const headers = new Headers({ "content-type": Bun.file(file).type })
        if (file.endsWith(".html")) headers.set("content-security-policy", cspForHtml(new TextDecoder().decode(body)))
        return HttpServerResponse.raw(body, { headers })
```

## G57-E140 — packages/server/src/web-ui.ts

assigned_member: packages/server/src/web-ui.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6bdd0f2213ecb53ca74ac935c0a16da1198fae77`; full-source SHA256 `2b473ed1ba3f6de98f602a6f47af37715dc827f989b7b7233df1355568bd83dc`; 2660 source bytes.

Lines 52–55; byte offsets [2521, 2660); 139 bytes; span SHA256 `437e0e7d0865a189025860a4727760fb4ae0363efb57266023a0b8abab098cdc`.

```ts
async function exists(file: string) {
  const stat = await Bun.file(file).stat().catch(() => undefined)
  return stat?.isFile() ?? false
}
```

## G57-E141 — packages/server/src/location.ts

shared_authority_or_contract_support: packages/server/src/location.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1881a570a893ec8c55aa436598db44ad19edde04`; full-source SHA256 `57032232ea6a37a046399f147479eef2ccdd21376a59c62de3fcfbfaae78953e`; 3966 source bytes.

Prior context reused: C30:33–40.

Lines 18–32; byte offsets [806, 1252); 446 bytes; span SHA256 `53bc44b809a734c6ce2f2a14f7912143e8897a989aa55eb2face6135ae589dc6`.

```ts
export function response<A, E, R>(data: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    return {
      location: new Location.Info({
        directory: location.directory,
        workspaceID: location.workspaceID,
        project: location.project,
      }),
      data: yield* data,
    }
  })
}

/** The Location a request names: the `location[...]` query, else the server cwd. */
```

## G57-E142 — packages/server/src/location.ts

shared_authority_or_contract_support: packages/server/src/location.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1881a570a893ec8c55aa436598db44ad19edde04`; full-source SHA256 `57032232ea6a37a046399f147479eef2ccdd21376a59c62de3fcfbfaae78953e`; 3966 source bytes.

Lines 49–50; byte offsets [2186, 2397); 211 bytes; span SHA256 `01ff82c0c06245ba8df83e2d2b0d187eb3056c578aedba42f14e8449fab5c8b4`.

```ts
export function bootLocation<E, R>(services: Layer.Layer<LocationServices, E, R>, location: Location.Ref) {
  return services.pipe(Layer.catchCause((cause) => Layer.effectContext(bootFailure(cause, location))))
```

## G57-E144 — packages/server/src/location.ts

shared_authority_or_contract_support: packages/server/src/location.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1881a570a893ec8c55aa436598db44ad19edde04`; full-source SHA256 `57032232ea6a37a046399f147479eef2ccdd21376a59c62de3fcfbfaae78953e`; 3966 source bytes.

Lines 87–93; byte offsets [3605, 3952); 347 bytes; span SHA256 `8659b3e635804ebe1df5edf378477ada57a722adff90e4dbf09dec2eedc3f502`.

```ts
    const locations = yield* LocationServiceMap.Service
    return LocationMiddleware.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const location = ref(request)
        return yield* effect.pipe(Effect.provide(bootLocation(locations.get(location), location)))
      }),
```

## G57-E145 — packages/server/src/middleware/authorization.ts

shared_authority_or_contract_support: packages/server/src/middleware/authorization.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d1624034dd309e5740a3d642357155f405f5839b`; full-source SHA256 `07734b4c881ba2bb586f7a6561dfd6b77be70bf56d6d5f152dfdf1c4dba1e93f`; 3206 source bytes.

Prior context reused: C27:13–13.

Lines 10–12; byte offsets [571, 817); 246 bytes; span SHA256 `29e13839174f7665b8bd38a51f9baa29b62fde6600160f978277de11ada8625a`.

```ts
const AUTH_TOKEN_QUERY = "auth_token"
// EventSource and WebSocket cannot set an Authorization header, so only their routes read credentials
// from the query string. Everywhere else a URL credential would leak into logs and history for nothing.
```

Lines 14–14; byte offsets [910, 963); 53 bytes; span SHA256 `e0ca53e260932659f7db42caad8df68b3d0ab4b46af2a42b6d9252a105ee464a`.

```ts
const WWW_AUTHENTICATE = 'Basic realm="Secure Area"'
```

## G57-E146 — packages/server/src/middleware/authorization.ts

shared_authority_or_contract_support: packages/server/src/middleware/authorization.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d1624034dd309e5740a3d642357155f405f5839b`; full-source SHA256 `07734b4c881ba2bb586f7a6561dfd6b77be70bf56d6d5f152dfdf1c4dba1e93f`; 3206 source bytes.

Prior context reused: C27:34–39.

Lines 33–33; byte offsets [1482, 1561); 79 bytes; span SHA256 `0e2c86f70be1fca0da8beae8e34fd00e9a5766f57fc9cdff27ab76dc9ec27598`.

```ts
function credentialFromRequest(request: HttpServerRequest.HttpServerRequest) {
```

## G57-E147 — packages/server/src/middleware/authorization.ts

shared_authority_or_contract_support: packages/server/src/middleware/authorization.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d1624034dd309e5740a3d642357155f405f5839b`; full-source SHA256 `07734b4c881ba2bb586f7a6561dfd6b77be70bf56d6d5f152dfdf1c4dba1e93f`; 3206 source bytes.

Prior context reused: C27:45–57, C27:61–61.

Lines 58–60; byte offsets [2909, 3098); 189 bytes; span SHA256 `b964513a7438e9e85327ebca7d5d2176c1e4902d7ca4d38fd94f1704fa7c7754`.

```ts
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
        )
```

## G57-E148 — packages/server/src/middleware/capability-authorization.ts

shared_authority_or_contract_support: packages/server/src/middleware/capability-authorization.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`; full-source SHA256 `437afc6342984a2cabf7cd72c01ea77c4422fb61761d1a24b2a8bf867f798c88`; 4035 source bytes.

Lines 12–15; byte offsets [692, 992); 300 bytes; span SHA256 `c2f25e7e80de1a0986029ce475ead57b4958feb145ca4a99ceb097530723fd6a`.

```ts
/** The authority this request authenticated as; content tickets bind to it so a ticket never widens access. */
export const RequestAuthority = Context.Reference<CapabilityOperatorContract.Authority | undefined>(
  "@orchestra/server/CapabilityRequestAuthority", { defaultValue: () => undefined },
)
```

## G57-E149 — packages/server/src/middleware/capability-authorization.ts

shared_authority_or_contract_support: packages/server/src/middleware/capability-authorization.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`; full-source SHA256 `437afc6342984a2cabf7cd72c01ea77c4422fb61761d1a24b2a8bf867f798c88`; 4035 source bytes.

Prior context reused: C28:27–47.

Lines 25–26; byte offsets [1284, 1410); 126 bytes; span SHA256 `a0358dd0c34d62e7b682af89d176d4064145538e4ca30ce5105d4d001a48e02e`.

```ts
        const request = yield* HttpServerRequest.HttpServerRequest
        const authority = yield* Effect.gen(function* () {
```

## G57-E151 — packages/server/src/middleware/capability-authorization.ts

shared_authority_or_contract_support: packages/server/src/middleware/capability-authorization.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`; full-source SHA256 `437afc6342984a2cabf7cd72c01ea77c4422fb61761d1a24b2a8bf867f798c88`; 4035 source bytes.

Prior context reused: C28:80–84, S20:68–78.

Lines 67–67; byte offsets [3214, 3253); 39 bytes; span SHA256 `bdd5bd49e02ef50fcdcf9c1d8b918ae1650e9e26c8f6516d2cfd850cfdb639f4`.

```ts
function decodeBasic(header: string) {
```

Lines 79–79; byte offsets [3742, 3743); 1 bytes; span SHA256 `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b`.

```ts

```

## G57-E156 — packages/server/src/routes.ts

shared_authority_or_contract_support: packages/server/src/routes.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `75b0f9753e4c879767ef186f5003519e2b681025`; full-source SHA256 `60dee30b7277f501a2713f223db365e290119dcfd03b9d0ec634c9c599686155`; 6568 source bytes.

Prior context reused: C47:104–105.

Lines 81–103; byte offsets [3537, 4546); 1009 bytes; span SHA256 `85c1ae768a4df7ee50c501081df62b2efee31cd3b1ef76f17f59a081f345b1fa`.

```ts
export interface Options {
  readonly password?: string
  /** Product contributions the application composes (apps/cli `CliHost.contributions`); sdk-next passes none. */
  readonly host?: ReadonlyArray<Host.Contribution>
  /** Directory of the built web UI; when set, the server also serves it at `/`. */
  readonly webRoot?: string
  /** Extra origins the server answers cross-origin, besides the local and desktop ones. */
  readonly cors?: ReadonlyArray<string>
  /** Replaces the capability operator; tests and sdk-next embed their own. */
  readonly operator?: CapabilityOperatorContract.Interface
  /** Replaces the capability setup verifier; tests avoid vendor calls with it. */
  readonly verifier?: CapabilityConnectionSetupContract.Verifier
}

export function createRoutes(options: Options = {}) {
  return makeRoutes(
    options.password
      ? ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some(options.password) })
      : ServerAuth.Config.layer,
    options,
  )
}
```

## G57-E157 — packages/server/src/routes.ts

shared_authority_or_contract_support: packages/server/src/routes.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `75b0f9753e4c879767ef186f5003519e2b681025`; full-source SHA256 `60dee30b7277f501a2713f223db365e290119dcfd03b9d0ec634c9c599686155`; 6568 source bytes.

Lines 123–139; byte offsets [5412, 6390); 978 bytes; span SHA256 `1dffec9358b90bcf358aa835fc997f7eaf7e8640296bf4fd831ec515eaad8c91`.

```ts
  const api = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(handlers),
    Layer.provide(merged.references),
    Layer.provide(sessionLocationLayer),
    Layer.provide(locationLayer),
    Layer.provide(authorizationLayer),
    Layer.provide(capabilityAuthorizationLayer),
    Layer.provide(schemaErrorLayer),
    Layer.provide(auth),
    Layer.provide(options.operator ? Layer.succeed(ServerOperator.Service, options.operator) : ServerOperator.layer),
    Layer.provide(ServerContentTicket.layer),
    Layer.provide(options.verifier ? Layer.succeed(ServerCapabilityVerification.Service, options.verifier) : ServerCapabilityVerification.layer),
    Layer.provide(serviceLayer),
    // The desktop renderer (`oc://renderer`) calls a desktop-owned server cross-origin, as the earlier runtime did.
    Layer.provide(corsLayer({ cors: options.cors })),
  )
  return Layer.merge(api, options.webRoot ? WebUi.layer(options.webRoot) : Layer.empty)
```

## G57-E158 — packages/server/src/middleware/session-location.ts

shared_authority_or_contract_support: packages/server/src/middleware/session-location.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `86d49275ece013a3a1af6a75ed6a5e31d195781b`; full-source SHA256 `107d98617bdfee6dc3aaad704d3e3066c1485a47fe8037a5965047f88e64d004`; 2427 source bytes.

Prior context reused: C24:34–58.

Lines 32–33; byte offsets [1346, 1478); 132 bytes; span SHA256 `169c3fc7baad1b60b90705a6797507863f9a5f5fce410f3b1a809b1b68118e68`.

```ts
        const route = yield* HttpRouter.RouteContext
        const sessionID = yield* decodeSessionID(route.params.sessionID).pipe(
```

## G57-E159 — packages/server/src/handlers/capability-artifacts.ts

shared_authority_or_contract_support: packages/server/src/handlers/capability-artifacts.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f7f3110dbfa6af4e9ad992b560fcfa63ccc2ba9d`; full-source SHA256 `a26977fdec84799439e8a1af111d6e49b53294d21eea5279c53618fff934a90c`; 7969 source bytes.

Lines 33–40; byte offsets [2115, 2711); 596 bytes; span SHA256 `dcaba44669b1e740f5b0727f1dcabd38a562b8e91ab122a401e54f22c6406cd5`.

```ts
      .handle("capability.artifact.contentTicket", ({ params }) => Effect.gen(function* () {
        const ref = { id: params.artifactID, revision: params.revision }
        // The same Session, placement and artifact.read checks as `content`, without reading the blob.
        yield* management.get(params.sessionID, ref).pipe(artifactResponse)
        const authority = yield* RequestAuthority
        if (authority === undefined) return yield* new UnauthorizedError({ message: "Authentication required" })
        return tickets.mint({ authority, sessionID: params.sessionID, ref })
      }))
```

## G57-E161 — packages/protocol/src/api.ts

shared_authority_or_contract_support: packages/protocol/src/api.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `40b5b5bd266b8a9bd3893f74d5429bf535dc01d7`; full-source SHA256 `9c15c2fa2c9fed1a636eca8f1a23ed00330a409b80514f548bef742fb38aa752`; 7889 source bytes.

Prior context reused: C09:73–79.

Lines 71–72; byte offsets [3681, 3728); 47 bytes; span SHA256 `cb619b9c9280d1eebdd9e8f559274e438070ca626d275aa0158da990d26d44df`.

```ts
  HttpApi.make("server")
    .add(HealthGroup)
```

Lines 80–90; byte offsets [4120, 4729); 609 bytes; span SHA256 `2d4f18502cfed248ba03e04933f316c03f62fb1bce98bc7f3033dfdb912d5a4d`.

```ts
    .add(IntegrationGroup.middleware(locationMiddleware))
    .add(CredentialGroup.middleware(locationMiddleware))
    .add(makePermissionGroup(locationMiddleware, sessionLocationMiddleware))
    .add(makeFileSystemGroup(locationMiddleware))
    .add(VcsGroup.middleware(locationMiddleware))
    .add(CommandGroup.middleware(locationMiddleware))
    .add(McpGroup.middleware(locationMiddleware))
    .add(LspGroup.middleware(locationMiddleware))
    .add(FormatterGroup.middleware(locationMiddleware))
    .add(SkillGroup.middleware(locationMiddleware))
    .add(BehaviorGroup.middleware(locationMiddleware))
```

## G57-E162 — packages/protocol/src/api.ts

shared_authority_or_contract_support: packages/protocol/src/api.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `40b5b5bd266b8a9bd3893f74d5429bf535dc01d7`; full-source SHA256 `9c15c2fa2c9fed1a636eca8f1a23ed00330a409b80514f548bef742fb38aa752`; 7889 source bytes.

Prior context reused: C09:121–126.

Lines 93–120; byte offsets [4800, 6262); 1462 bytes; span SHA256 `3688558b1b0873462798bb3da8615853db094bb192ce82db4c6b878722390f9d`.

```ts
    .add(makeQuestionGroup(locationMiddleware, sessionLocationMiddleware))
    .add(ReferenceGroup.middleware(locationMiddleware))
    .add(ProjectCopyGroup.middleware(locationMiddleware))
    .add(ProjectGroup)
    .add(LeanGroup.middleware(locationMiddleware))
    .add(RagStudioGroup.middleware(locationMiddleware))
    .add(AtlasGroup.middleware(locationMiddleware))
    .add(ConfigGroup)
    .add(TrustGroup)
    .add(BoardGroup)
    .add(RelayDocumentGroup.middleware(locationMiddleware))
    .add(RelayPublishGroup.middleware(locationMiddleware))
    .add(RelayHookGroup.middleware(locationMiddleware))
    .add(PullRequestGroup.middleware(locationMiddleware))
    .add(ScheduleGroup.middleware(locationMiddleware))
    .add(ActionsBindingGroup.middleware(locationMiddleware))
    .add(ActionsOperationGroup.middleware(locationMiddleware))
    .add(ActionsWorkflowGroup.middleware(locationMiddleware))
    .add(ActionsRunGroup.middleware(locationMiddleware))
    .add(ActionsJobGroup.middleware(locationMiddleware))
    .add(ActionsPipelineGroup.middleware(locationMiddleware))
    .add(ActionsResourceGroup.middleware(locationMiddleware))
    .add(ActionsSourceGroup.middleware(locationMiddleware))
    .add(ActionsTransferGroup.middleware(locationMiddleware))
    .add(RelayRunGroup.middleware(locationMiddleware))
    .add(InstallationGroup)
    .add(GuardrailGroup.middleware(locationMiddleware))
    .add(MeetingGroup.middleware(locationMiddleware))
```

## G57-E169 — packages/protocol/src/groups/permission.ts

shared_authority_or_contract_support: packages/protocol/src/groups/permission.ts

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a34d8726146a5cdc1b989b583a4943290584d34b`; full-source SHA256 `9cef92dd60326651b2ee4b6d5946e4381ea6791076c017da532122b9be0fa1ab`; 5828 source bytes.

Lines 89–94; byte offsets [3710, 4015); 305 bytes; span SHA256 `5658be315cdb9422a250f14c87b957bb84dc3b3e14e8302ee818c6d7c911993e`.

```ts
      HttpApiEndpoint.get("session.permission.list", "/api/session/:sessionID/permission", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Array(Permission.Request) }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
```

## P01 — packages/protocol/src/groups/actions-binding.ts

CRUD de binding e acesso a capabilities/policy; create/update recebem BindingInput, policy usa Policy/PolicyState.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5d3c0a1f4956c97c285775ccb68b97a83b476048`; full-source SHA256 `0d24cd6645aae01e92a368d82bf69bf2b1d4dcf833b6e5da526dfb3138554f20`; 2530 source bytes.

Lines 15–20; byte offsets [910, 1400); 490 bytes; span SHA256 `c4c141200481cd561aacfb11c2d6228a7c7c603e3776bb3b25b15564a7241580`.

```ts
  .add(HttpApiEndpoint.get("actions.binding.get", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, success: Location.response(Actions.Binding), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.patch("actions.binding.update", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, payload: Actions.BindingInput,
    success: Location.response(Actions.Binding), error: ActionsApiError,
```

Lines 28–34; byte offsets [1975, 2530); 555 bytes; span SHA256 `c776a7004cb7f559bd4339e0b9d186b6bc68ffafd095993a2a18db6462349afb`.

```ts
  .add(HttpApiEndpoint.get("actions.binding.policy", "/api/actions/binding/:bindingID/policy", {
    params: BindingParams, query: BindingQuery, success: Location.response(Actions.PolicyState), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.put("actions.binding.updatePolicy", "/api/actions/binding/:bindingID/policy", {
    params: BindingParams, query: BindingQuery, payload: Actions.Policy,
    success: Location.response(Actions.PolicyState), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P02 — packages/protocol/src/groups/actions-common.ts

Define erro público ActionsError 400, bindingID, revision positiva e limites/attempt opcionais positivos.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3421cc6bf4002e1d60b06e0b38ea4341079e9bd1`; full-source SHA256 `431d715398a557a4df1ec6a00abcd786fd6633a9f96136d4237348ec106aa102`; 712 source bytes.

Lines 6–17; byte offsets [183, 712); 529 bytes; span SHA256 `4170aec08e5819add3a3471fc259213840ce74ef3a123c33c258984fb68520cb`.

```ts
export class ActionsApiError extends Schema.TaggedErrorClass<ActionsApiError>()(
  "ActionsError", Actions.ErrorData.fields, { httpApiStatus: 400 },
) {}

export const BindingParams = Schema.Struct({ bindingID: Actions.BindingID })
export const BindingQuery = Schema.Struct({
  ...LocationQuery.fields,
  revision: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt)),
})

export const OptionalLimit = Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional)
export const OptionalAttempt = OptionalLimit
```

## P03 — packages/protocol/src/groups/actions-job.ts

retry/play/cancel/erase usam jobID não vazio e retornam CommandExecution; comandos de cancel/erase são GitLabCommand.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `df7b4e04595cf59cc202f4e771549a5b26deb47b`; full-source SHA256 `60c097d3b0f689bb0b7ae78c3e52085ac699e417283542355b2101853096650a`; 1671 source bytes.

Lines 10–18; byte offsets [430, 1085); 655 bytes; span SHA256 `5f0fc8844cfb284f6f4d23509f33e55689da1edd6c48b2313c9d876f0f1864b2`.

```ts
export const ActionsJobGroup = HttpApiGroup.make("server.actionsJob")
  .add(HttpApiEndpoint.post("actions.job.retry", "/api/actions/job/:bindingID/:jobID/retry", {
    params: Params, query: BindingQuery, payload: Actions.JobRetryCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.job.play", "/api/actions/job/:bindingID/:jobID/play", {
    params: Params, query: BindingQuery, payload: Actions.JobPlayCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P04 — packages/protocol/src/groups/actions-operation.ts

prepare recebe OperationIntent; get/reconcile usam OperationID e devolvem Operation. A fonte separa admissão/readback de writes específicos.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3f10d378e05334b87044f4682bddb955829e89c4`; full-source SHA256 `41181bc92b6c8e8a66cafc591e3cd096ad2819841fbeed165717039b58c629af`; 1441 source bytes.

Lines 10–21; byte offsets [434, 1441); 1007 bytes; span SHA256 `396cb7f5042d568cc3a08374482b775021bdc292a785b7c409152db235aa3430`.

```ts
// Admission and readback are common; provider writes retain domain-specific payloads/endpoints.
export const ActionsOperationGroup = HttpApiGroup.make("server.actionsOperation")
  .add(HttpApiEndpoint.post("actions.operation.prepare", "/api/actions/operation/:bindingID", {
    params: BindingParams, query: BindingQuery, payload: Actions.OperationIntent,
    success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.operation.get", "/api/actions/operation/:bindingID/:operationID", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.operation.reconcile", "/api/actions/operation/:bindingID/:operationID/reconcile", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P05 — packages/protocol/src/groups/actions-pipeline.ts

merge-request usa mergeRequestID e MergeRequestCommand; trigger usa TriggerPipelineCommand; ambos devolvem CommandExecution.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9dbbab41ae7934a392b1bf1c84a724242d6327d5`; full-source SHA256 `9a0403bf24c224895b323679c5b2518c03719e4f2d0242d40b0f04b6c81237be`; 1190 source bytes.

Lines 10–18; byte offsets [451, 1190); 739 bytes; span SHA256 `03b61cbdaa5eff073dcc75fa2c8ac8099acb731dd89a5ce98ef210834b9d373a`.

```ts
export const ActionsPipelineGroup = HttpApiGroup.make("server.actionsPipeline")
  .add(HttpApiEndpoint.post("actions.pipeline.mergeRequest", "/api/actions/pipeline/:bindingID/merge-request/:mergeRequestID", {
    params: MergeRequestParams, query: BindingQuery, payload: Actions.MergeRequestCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.pipeline.trigger", "/api/actions/pipeline/:bindingID/trigger", {
    params: BindingParams, query: BindingQuery, payload: Actions.TriggerPipelineCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P06 — packages/protocol/src/groups/actions-resource.ts

list combina ResourceListInput e limit positivo; command restringe action a create/update/delete/play/pause/keep/clear e recebe ResourceCommand.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ca49542c3a6106b748d9826cbc4d2a86a2f38cec`; full-source SHA256 `5f2536f77880ab6ed56d0391392131dec166a4876d0793efd414917fcce10cf8`; 1315 source bytes.

Lines 8–19; byte offsets [356, 1315); 959 bytes; span SHA256 `4ccd615a6760b05ab1f6672a1af1a9f78656de5a85bc0a20409381f63ebcf212`.

```ts
const Query = Schema.Struct({ ...BindingQuery.fields, ...Actions.ResourceListInput.fields, limit: OptionalLimit })
const CommandParams = Schema.Struct({ ...BindingParams.fields, resourceKind: Actions.ResourceKind,
  action: Schema.Literals(["create", "update", "delete", "play", "pause", "keep", "clear"]) })

export const ActionsResourceGroup = HttpApiGroup.make("server.actionsResource")
  .add(HttpApiEndpoint.get("actions.resource.list", "/api/actions/resource/:bindingID", {
    params: BindingParams, query: Query, success: Location.response(Actions.ResourcePage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.resource.command", "/api/actions/resource/:bindingID/:resourceKind/:action", {
    params: CommandParams, query: BindingQuery, payload: Actions.ResourceCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P07 — packages/protocol/src/groups/actions-run.ts

List/get/jobs são readback paginado; retry/cancel/forceCancel/remove/approveFork/rename têm comandos com schemas específicos de provedor.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1763c6e768e40c91ca59839c587a1a5360b48ba4`; full-source SHA256 `76d65f1b75a0c5273b918c399b68af7ac00f880f0bfbbcec864c0424a89774ef`; 3262 source bytes.

Lines 8–23; byte offsets [373, 1650); 1277 bytes; span SHA256 `3c9f1205e1bfd45e7e6740222d74a47e7f93285359a4db1ef51f2ec57084e04b`.

```ts
const Params = Schema.Struct({ ...BindingParams.fields, runID: Schema.NonEmptyString })
const ListQuery = Schema.Struct({ ...BindingQuery.fields, ...Actions.RunListInput.fields, limit: OptionalLimit })
const JobsQuery = Schema.Struct({ ...BindingQuery.fields, attempt: OptionalAttempt, cursor: Schema.optional(Schema.String) })

export const ActionsRunGroup = HttpApiGroup.make("server.actionsRun")
  .add(HttpApiEndpoint.get("actions.run.list", "/api/actions/run/:bindingID", {
    params: BindingParams, query: ListQuery, success: Location.response(Actions.RunPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.run.get", "/api/actions/run/:bindingID/:runID", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Run), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.run.jobs", "/api/actions/run/:bindingID/:runID/jobs", {
    params: Params, query: JobsQuery, success: Location.response(Actions.JobPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.run.retry", "/api/actions/run/:bindingID/:runID/retry", {
    params: Params, query: BindingQuery, payload: Actions.RetryCommand,
```

## P08 — packages/protocol/src/groups/actions-source.ts

Validação de source/draft retorna Graph, com onExcessProperty:error nos DTOs de validação; branch/write/review são actions admitidas.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `31d9a2c3441371883b3bb054dabd95c476d909ec`; full-source SHA256 `7a76272f1ec26e5ccb90705420c9ebca86f255fee55b88a3def300a538cbb0ed`; 2143 source bytes.

Lines 8–22; byte offsets [341, 1564); 1223 bytes; span SHA256 `8e4f5588a9e4888ac9d190024a7b0f52788456bc5d2ce8f1ef79709c605529a7`.

```ts
const Params = Schema.Struct({ ...BindingParams.fields, action: Schema.Literals(["branch", "write", "review"]) })
const Validation = Schema.Struct({ source: Actions.Source, draft: Schema.String })
  .annotate({ identifier: "Actions.SourceValidation", parseOptions: { onExcessProperty: "error" } })
const DraftValidation = Schema.Struct({ base: Actions.SourceBase, path: Schema.NonEmptyString, draft: Schema.String })
  .annotate({ identifier: "Actions.DraftValidation", parseOptions: { onExcessProperty: "error" } })

export const ActionsSourceGroup = HttpApiGroup.make("server.actionsSource")
  .add(HttpApiEndpoint.get("actions.source.base", "/api/actions/source/:bindingID/base", {
    params: BindingParams, query: Schema.Struct({ ...BindingQuery.fields, ref: Schema.optional(Schema.NonEmptyString) }),
    success: Location.response(Actions.SourceBase), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.source.validateDraft", "/api/actions/source/:bindingID/validate-draft", {
    params: BindingParams, query: BindingQuery, payload: DraftValidation,
    success: Location.response(Actions.Graph), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

Lines 27–30; byte offsets [1846, 2143); 297 bytes; span SHA256 `3382228551a649105e9c5479a62a26b7fc85490d17e7205dfe6a186f3977267c`.

```ts
  .add(HttpApiEndpoint.post("actions.source.command", "/api/actions/source/:bindingID/:action", {
    params: Params, query: BindingQuery, payload: Actions.ResourceCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P09 — packages/protocol/src/groups/actions-workflow.ts

List/source/graph são leitura; dispatch/state aceitam DispatchCommand/WorkflowStateCommand e retornam CommandExecution.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a3551a8dd9adc2227c9ab239a6e54ac27c1e491b`; full-source SHA256 `5337f5dd0f397fe53807f54897ca49a59e37f5b2bb6d936323dbc7e4cb025c93`; 2172 source bytes.

Lines 8–17; byte offsets [356, 1233); 877 bytes; span SHA256 `56cce89d7f88ca70d76848a64a121de12fd0f8f33245bd86e45c56067ed67b38`.

```ts
const ListQuery = Schema.Struct({ ...BindingQuery.fields, ...Actions.ListInput.fields, limit: OptionalLimit })
const SourceQuery = Schema.Struct({ ...BindingQuery.fields, path: Schema.NonEmptyString, ref: Schema.NonEmptyString })
const WorkflowParams = Schema.Struct({ ...BindingParams.fields, workflowID: Schema.NonEmptyString })

export const ActionsWorkflowGroup = HttpApiGroup.make("server.actionsWorkflow")
  .add(HttpApiEndpoint.get("actions.workflow.list", "/api/actions/workflow/:bindingID", {
    params: BindingParams, query: ListQuery, success: Location.response(Actions.WorkflowPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.workflow.source", "/api/actions/workflow/:bindingID/source", {
    params: BindingParams, query: SourceQuery, success: Location.response(Actions.Source), error: ActionsApiError,
```

Lines 22–29; byte offsets [1528, 2172); 644 bytes; span SHA256 `b592987ace46f123fac45cc9bcff1439242f94949f73916de0f57a121086876f`.

```ts
  .add(HttpApiEndpoint.post("actions.workflow.dispatch", "/api/actions/workflow/:bindingID/:workflowID/dispatch", {
    params: WorkflowParams, query: BindingQuery, payload: Actions.DispatchCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.put("actions.workflow.state", "/api/actions/workflow/:bindingID/:workflowID/state", {
    params: WorkflowParams, query: BindingQuery, payload: Actions.WorkflowStateCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P10 — packages/protocol/src/groups/agent.ts

Detail anuncia tools, skills e engines/status; file get/update usam AgentFile e update declara 409 por revision stale.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `edc5df027602a83e1a85a90f89c8f93939d7a7c0`; full-source SHA256 `29757d8e109a561bff05d195979a69048c7a02c6ee20227dde48606da91d3948`; 3599 source bytes.

Lines 9–26; byte offsets [415, 1208); 793 bytes; span SHA256 `63d2d8954515b0747ebcca7fbfdc24cc48cc26145244ab6c322543e4efea81dc`.

```ts
const AgentDetail = Schema.Struct({
  tools: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String })),
  skills: Schema.Array(
    Schema.Struct({ name: Schema.String, description: Schema.String.pipe(Schema.optional), location: Schema.String }),
  ),
  /** The pinned command-line engines of the agent's toolkit, with their install state on this machine. */
  engines: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      version: Schema.String,
      license: Schema.String,
      upstream: Schema.String,
      role: Schema.Literals(["generator", "check", "indexer", "oracle"]),
      input: Schema.String,
      status: Schema.Literals(["absent", "fetching", "ready", "failed", "unsupported"]),
    }),
  ),
}).annotate({ identifier: "AgentV2.Detail" })
```

Lines 77–91; byte offsets [2890, 3586); 696 bytes; span SHA256 `7af440988fe52c379b88c17bc76056cee22de38af9ad6f65ccab441d95f4e035`.

```ts
    HttpApiEndpoint.put("agent.file.update", "/api/agent/:agentID/file", {
      params: { agentID: Schema.String },
      query: LocationQuery,
      payload: AgentFile.Input,
      success: Location.response(AgentFile.Info),
      error: [InvalidRequestError, ConflictError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.agent.file.update",
          summary: "Update agent file",
          description:
            "Write the agent definition to this location's .orchestra/agent directory and reload the registered agents. Fails with 409 when `revision` no longer matches the file.",
        }),
```

## P11 — packages/protocol/src/groups/atlas.ts

Fachada da tela/store Atlas: distingue draft, emit, review, decisões e setup/index/mine; todos os endpoints declaram ServiceUnavailable.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1ad5dee72e17105d118eef8974cc283b68ea64ce`; full-source SHA256 `561bc5cfa8116287a20513d4f31c3294aaf92a12deb78ac1248e9835d26b072d`; 13026 source bytes.

Lines 39–48; byte offsets [1024, 1523); 499 bytes; span SHA256 `55f2f403bd332bb74d6209f82b78132a113ad1a0975f20e8c1f21273b59c9b2f`.

```ts

// The Atlas screen over the requested Location's Atlas store: the legacy `/atlas/*` instance routes with the same wire
// shapes (an absent value is `null`, never omitted). A repository with no `.atlas/` answers `{ state: "empty" }`.
export const AtlasGroup = HttpApiGroup.make("server.atlas")
  .add(
    HttpApiEndpoint.get("atlas.snapshot", "/api/atlas/snapshot", {
      query: LocationQuery,
      success: Location.response(AtlasSnapshotResult),
      error: ServiceUnavailableError,
    })
```

Lines 122–150; byte offsets [4029, 5070); 1041 bytes; span SHA256 `41fcdf4fa9dc2672badeea6f02e162c288a7edf5afb00e8fd4b4447e46d590a7`.

```ts
    HttpApiEndpoint.post("atlas.draft", "/api/atlas/draft", {
      query: LocationQuery,
      payload: AtlasDraftInput,
      success: Location.response(AtlasDraftResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.draft",
          summary: "Draft and check an Atlas fact",
          description: "Compose a fact at an anchor and dry-run the emit gates; nothing is written.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.emit", "/api/atlas/emit", {
      query: LocationQuery,
      payload: AtlasEmitInput,
      success: Location.response(AtlasEmitResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.emit",
          summary: "Emit an Atlas fact",
          description: "Write a drafted fact through the governed emit door at the draft's rev.",
        }),
```

Lines 317–330; byte offsets [10669, 11266); 597 bytes; span SHA256 `9419c1725faae603a7c06e9b6499d441bb2d9559e8e59abe060b9ec1bce86890`.

```ts
    HttpApiEndpoint.post("atlas.delegate", "/api/atlas/delegate", {
      query: LocationQuery,
      payload: AtlasDelegateInput,
      success: Location.response(AtlasDelegateResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.delegate",
          summary: "Delegate Atlas interview questions to a model",
          description:
            "A model drafts an answer to each open question; each draft keeps its question open until a person accepts it.",
        }),
```

## P12 — packages/protocol/src/groups/behavior.ts

PUT recebe SetInput, devolve array Info e declara substituição do contexto de comportamento do projeto.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `425a3a163de79e880f5ff12271f799d1d2c4ead0`; full-source SHA256 `fb98fbb62ede3de878e903ef0c9a7a5c5ba1418ef1c4cc9fdf589682f5848753`; 1255 source bytes.

Lines 9–23; byte offsets [401, 1080); 679 bytes; span SHA256 `82b2f559e0c9b4982f1aaadbeab5e01360148e9853439fef081b520a0a492dc8`.

```ts
  .add(
    HttpApiEndpoint.put("behavior.set", "/api/behavior", {
      query: LocationQuery,
      payload: Behavior.SetInput,
      success: Location.response(Schema.Array(Behavior.Info)),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.behavior.set",
          summary: "Set behaviors",
          description:
            "Replace the behaviors of the requested location's project and return the stored set. Every session of the project receives them as system context from its next provider turn; removed behaviors leave the next turn's request.",
        }),
```

## P13 — packages/protocol/src/groups/board.ts

Projeto por key e issue por número positivo; reads têm DTOs específicos e writes OwnerResult, com 404/409; ownership de notas é declarado.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `23b0f0389ec8ff9fa55c88ddeb85c7d3e740b57d`; full-source SHA256 `f8d139d54bacba1df58ea757058c5cf6ed2773cbec0f75bf6db2e7a2d8ef8bb6`; 10513 source bytes.

Lines 6–23; byte offsets [231, 925); 694 bytes; span SHA256 `5d773443792b819dce6309e7de825c480e987430ea94aa4b85a20629890ce4e2`.

```ts
export class BoardNotFoundError extends Schema.TaggedErrorClass<BoardNotFoundError>()(
  "BoardNotFoundError",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

// A write the board's rules refuse; the message says what to do instead.
export class BoardRefusedError extends Schema.TaggedErrorClass<BoardRefusedError>()(
  "BoardRefusedError",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

const errors = [BoardNotFoundError, BoardRefusedError]
const IssueNumber = Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt))
const project = { key: Schema.String }
const issue = { key: Schema.String, number: IssueNumber }
const child = { ...issue, id: Schema.String }
```

Lines 52–56; byte offsets [1948, 2115); 167 bytes; span SHA256 `4b96f6f7972b10f1f0118f9f9d9389a9ebb535138e9741d7fcb90f1e0bb23d5e`.

```ts
    HttpApiEndpoint.get("board.get", "/api/board/:key", {
      params: project,
      success: Board.Snapshot,
      error: BoardNotFoundError,
    }).annotateMerge(
```

Lines 102–116; byte offsets [3713, 4359); 646 bytes; span SHA256 `308d39ae61343eb5c018c81fa1519029bb71ab9569d61209b6db7ac6ac3badbd`.

```ts
    HttpApiEndpoint.patch("board.noteEdit", "/api/board/:key/issue/:number/note/:id", {
      params: child,
      payload: Board.NoteInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("noteEdit", "Edit a note", "Edit one of the owner's notes; GitHub and Maestro notes are refused.")),
  )
  .add(
    HttpApiEndpoint.delete("board.noteDelete", "/api/board/:key/issue/:number/note/:id", {
      params: child,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc("noteDelete", "Delete a note", "Delete one of the owner's notes; GitHub and Maestro notes are refused."),
    ),
```

Lines 280–286; byte offsets [10308, 10513); 205 bytes; span SHA256 `cc3e0fdb435f0fbe57bc1199f10d888281bcd56434cb66050b7995cf443e83e2`.

```ts
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "board",
      description: "Projects board: Maestro plans through its tools; the owner reads, answers, comments and steers here.",
    }),
  )
```

## P14 — packages/protocol/src/groups/capability-connections.ts

Páginas 1..32, mutations com idempotency-key, input de setup/binding/target e receipts diretos; aplica CapabilityAuthorization.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6359c2f9200522ae1745e2b551e3065d3660a4e9`; full-source SHA256 `9587fa37465609a08572e0e213014f59b5fceace360e792d64a2398081f7e993`; 4481 source bytes.

Lines 9–32; byte offsets [485, 1544); 1059 bytes; span SHA256 `9dbc75048f854aa4a7bb8742b3a1e25a923e0ef5a0996b02577be0ca47fa6864`.

```ts
const Limit = Schema.NumberFromString.pipe(
  Schema.decodeTo(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))),
  Schema.optionalKey,
).annotate({ description: "Maximum page size, 1..32. Defaults to 16." })

const ConnectionQuery = Schema.Struct({
  ...LocationQuery.fields,
  after: CapabilityManagement.ConnectionQuery.fields.after,
  limit: Limit,
})
const TargetQuery = Schema.Struct({
  ...LocationQuery.fields,
  after: CapabilityManagement.TargetQuery.fields.after,
  limit: Limit,
})
const BindingQuery = Schema.Struct({ ...LocationQuery.fields,
  after: CapabilityManagement.BindingQuery.fields.after, limit: Limit })
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })

export const CapabilityConnectionsGroup = HttpApiGroup.make("server.capability.connections")
  .add(
    HttpApiEndpoint.post("capability.connection.connect", "/api/capability/connections/connect", {
      query: LocationQuery, headers: MutationHeaders, payload: CapabilitySetup.Input,
      success: CapabilityManagement.Receipt,
```

Lines 91–95; byte offsets [4192, 4481); 289 bytes; span SHA256 `206156cace9e290e490a2fa45e3f560557d6f2ae7c81214d1a623986d31ba886`.

```ts
  .annotateEndpointsMerge(locationQueryOpenApi)

export const makeCapabilityConnectionsGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityConnectionsGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
```

## P15 — packages/protocol/src/groups/capability-operator.ts

Inspeciona requestID/principal/origin/scopeHash; origin é configured-auth/desktop/cli/sdk; aplica CapabilityAuthorization.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8cc30598b00b048918bff67b8dfd9e4c17e0e6af`; full-source SHA256 `86cb90696da816a6d4c39c08582be0c5aafd287ad40d38e8c8f1e9c008ed2126`; 888 source bytes.

Lines 6–16; byte offsets [257, 888); 631 bytes; span SHA256 `64e2ef25a0d8975d2822e0c6dd13b8c3e335cf766e59be43ce1649a5b7f6bfd2`.

```ts
export const CapabilityOperatorGroup = HttpApiGroup.make("server.capability.operator").add(
  HttpApiEndpoint.get("capability.operator.inspect", "/api/capability/operator", {
    query: LocationQuery,
    success: Schema.Struct({ requestID: Schema.String, principal: Schema.String,
      origin: Schema.Literals(["configured-auth", "desktop", "cli", "sdk"]), scopeHash: Schema.String }),
  }),
)

export const makeCapabilityOperatorGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityOperatorGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
```

## P16 — packages/protocol/src/groups/capability-schedules.ts

Ações list/pause/resume/run/remove de schedules de agente; create/edit ficam no tool do agente; mutations exigem key.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `dd5dbd141492f84ecd5a54b16b27c334ebf31b0d`; full-source SHA256 `75201f38d78719bbd9649437ce55fa7ef18760fb0fb15c102a80739c98bc0b55`; 2701 source bytes.

Lines 9–14; byte offsets [505, 858); 353 bytes; span SHA256 `ae28d67c0b39430c6f0e1fb1fbebfa7776cfc03d9e3fe38e8409737030667e61`.

```ts
const path = "/api/capability/schedules"
const item = `${path}/:scheduleID`
const params = { scheduleID: ScheduledTask.ID }
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })
// Agent-created schedules only: create and edit stay with the owning agent's schedule_manage tool.
const errors = [ConflictError, UnknownError]
```

Lines 24–43; byte offsets [1304, 2701); 1397 bytes; span SHA256 `7be63c32b2c96569019db1d174c35ad9fc0bfbd6ac9e48c1dd321e67cd24bcc9`.

```ts
    HttpApiEndpoint.post("capability.schedule.pause", `${item}/pause`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Schedule, error: errors,
    }),
    HttpApiEndpoint.post("capability.schedule.resume", `${item}/resume`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Schedule, error: errors,
    }).annotateMerge(OpenApi.annotations({ description: "409 when the repeat limit is used up or a once lies in the past." })),
    HttpApiEndpoint.post("capability.schedule.run", `${item}/run`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Started, error: errors,
    }).annotateMerge(OpenApi.annotations({
      description: "Start a run now without moving the next slot. A retry with the same idempotency key returns the same Session.",
    })),
    HttpApiEndpoint.delete("capability.schedule.remove", item, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Removed, error: errors,
    }),
  )
  .annotateEndpointsMerge(locationQueryOpenApi)

export const makeCapabilitySchedulesGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilitySchedulesGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
```

## P17 — packages/protocol/src/groups/command.ts

GET retorna catálogo Command.Info na localização; execução de comando não pertence a este grupo.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6d028268790e99a5e5d0150d2cd143216fd56a56`; full-source SHA256 `bbd3ed5066f29c4d150539240d44350acd8f4c63035e15c0a57539e3bd31ee56`; 907 source bytes.

Lines 9–19; byte offsets [357, 762); 405 bytes; span SHA256 `c0facfa4506979785d07d99a61354db54b975945e44d766e1545ade89c739543`.

```ts
    HttpApiEndpoint.get("command.list", "/api/command", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Command.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.command.list",
          summary: "List commands",
          description: "Retrieve currently registered commands.",
        }),
```

## P18 — packages/protocol/src/groups/config.ts

Patch global de modelo/shell/engines/providers/permissions; listas substituem as anteriores; update é NoContent.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `45c90cf87ab5a587c378aa2e61c2d97996835a0d`; full-source SHA256 `f86c534fc957edb9bc4a19d38e89a09c9482d06a63a6e79935c297d070ed01b6`; 3736 source bytes.

Lines 15–40; byte offsets [870, 2224); 1354 bytes; span SHA256 `4946d8ea65309197d10a8397ad108f40eb8f830e3773aef4488d273552efdc67`.

```ts
export const ConfigPatch = Schema.Struct({
  model: Schema.optional(Schema.String),
  shell: Schema.optional(Schema.String),
  agents: Schema.optional(
    Schema.Record(Schema.String, Schema.Struct({ engine: Schema.optional(Schema.Literals(["orchestra", "claude-code"])) })),
  ),
  disabledProviders: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "The whole list of disabled providers, stored as `provider.use` deny policies. Replaces the previous list.",
  }),
  providers: Schema.optional(Schema.Record(Schema.String, CustomProvider)).annotate({
    description: "Custom providers by ID, each replacing any previous definition of that ID.",
  }),
  permissions: Schema.optional(Permission.Ruleset).annotate({
    description:
      "The whole ordered list of tool permission rules; a later matching rule wins. Replaces the previous list.",
  }),
}).annotate({ identifier: "ConfigPatch" })

export const ConfigSettings = Schema.Struct({
  model: Schema.optional(Schema.String),
  shell: Schema.optional(Schema.String),
  agents: Schema.Record(Schema.String, Schema.Struct({ engine: Schema.Literals(["orchestra", "claude-code"]) })),
  disabledProviders: Schema.Array(Schema.String),
  // In the user's order, since a later matching rule wins.
  permissions: Permission.Ruleset,
}).annotate({ identifier: "ConfigSettings" })
```

Lines 56–65; byte offsets [2674, 3156); 482 bytes; span SHA256 `9eecb3a62e5a77dea741cdf0e6830a65fdb23e9ab29e29e133cf76618f84f4c2`.

```ts
    HttpApiEndpoint.patch("config.update", "/api/config", {
      payload: ConfigPatch,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.config.update",
        summary: "Update global settings",
        description:
          "Merge the default model, agent engines, disabled providers and tool permission rules into the global config document, then reload the agents and catalog of every open location.",
      }),
```

## P19 — packages/protocol/src/groups/credential.ts

PATCH altera somente label; DELETE remove por Credential.ID; os dois retornam NoContent e declaram ConflictError.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `23c549e2806d9c5a1d5187ce6d341640cc35ae8a`; full-source SHA256 `9c1a5962a9ea3e8fce8f5c7aeb85cefde7bc30891d00230d7fc6c3c649fb67b0`; 1439 source bytes.

Lines 8–18; byte offsets [364, 755); 391 bytes; span SHA256 `c2d8d39b8672bc3d2fb7dcdfdcce666e61965e814d01653e679c203eef9a36ef`.

```ts
  .add(
    HttpApiEndpoint.patch("credential.update", "/api/credential/:credentialID", {
      params: { credentialID: Credential.ID },
      query: LocationQuery,
      payload: Schema.Struct({ label: Schema.String }),
      success: HttpApiSchema.NoContent,
      error: ConflictError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
```

Lines 26–36; byte offsets [934, 1348); 414 bytes; span SHA256 `de20f781c8865794c5d7d5131f68c25886fb717326554587baa0985501876895`.

```ts
    HttpApiEndpoint.delete("credential.remove", "/api/credential/:credentialID", {
      params: { credentialID: Credential.ID },
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: ConflictError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.credential.remove",
          summary: "Remove credential",
```

## P20 — packages/protocol/src/groups/formatter.ts

Status dos formatters configurados/disponíveis por Location, Array(Formatter.Status).

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ad4fd15e9908fd1efce2277980d689ee07706782`; full-source SHA256 `563e0c55f2624483d03cc0cfdc61897d07e9f69de7a33a6b4eddf8495c4d3caa`; 949 source bytes.

Lines 9–19; byte offsets [355, 814); 459 bytes; span SHA256 `7912b6390ae70233d3a4b6feb3fa717512f8c81efef8be540727c91f2ffa2196`.

```ts
    HttpApiEndpoint.get("formatter.status", "/api/formatter", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Formatter.Status)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.formatter.status",
          summary: "Formatter status",
          description: "List the Location's configured formatters and whether each one is available.",
        }),
```

## P21 — packages/protocol/src/groups/guardrail.ts

Rules e run/reports com erro400 kind/message e descrição de baseline merge-base.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a9c3d5c6643d271619f61f68444dca1fc5adcbc6`; full-source SHA256 `58b6a155fb294fc1f8ec6b592023e3df0461c154e32f0e0fbc368815eaa89ad4`; 1960 source bytes.

Lines 7–24; byte offsets [289, 922); 633 bytes; span SHA256 `1a370b6a4d12deaf710a1e29707ce4eb87bd407facd6abc59e03e1141684d3f6`.

```ts
// `kind` says why the engine could not answer, so clients can explain it without parsing the message.
export class GuardrailError extends Schema.ErrorClass<GuardrailError>("GuardrailError")(
  {
    name: Schema.Literal("GuardrailError"),
    data: Schema.Struct({
      kind: Guardrail.EngineErrorKind,
      message: Schema.String,
    }),
  },
  { httpApiStatus: 400 },
) {}

export const GuardrailGroup = HttpApiGroup.make("server.guardrail")
  .add(
    HttpApiEndpoint.get("guardrail.rules", "/api/guardrail/rules", {
      query: LocationQuery,
      success: Location.response(Guardrail.Rules),
      error: GuardrailError,
```

Lines 36–47; byte offsets [1271, 1769); 498 bytes; span SHA256 `e03f4d2478ed02481bdd02c14799bcd2ccae2a9f5ac14abac97f5a9f824ac98f`.

```ts
    HttpApiEndpoint.post("guardrail.run", "/api/guardrail/run", {
      query: LocationQuery,
      payload: Guardrail.RunInput,
      success: Location.response(Guardrail.Report),
      error: GuardrailError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.guardrail.run",
          summary: "Run guards",
          description: "Judge the location's current change against its guard rules and return the findings.",
```

## P22 — packages/protocol/src/groups/health.ts

GET declara healthy:true, version e pid opcional; é schema de resposta, não medição de disponibilidade desta sessão.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `be777a5f8d482fcb5f3b06c1a21077e2fc452bb5`; full-source SHA256 `a7d0a532d850330d45e04d672088dffc9df36a504bf09c95b2e78ac8b9a7f701`; 592 source bytes.

Lines 5–15; byte offsets [181, 577); 396 bytes; span SHA256 `a9124d29a00ed84e523d53df54691d35c0c07392cc61be24d7f02834df8a3034`.

```ts
  HttpApiEndpoint.get("health.get", "/api/health", {
    success: Schema.Struct({
      healthy: Schema.Literal(true),
      pid: Schema.optional(Schema.Int),
      version: Schema.String,
    }),
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "v2.health.get",
      summary: "Check server health",
      description: "Check whether the API server is ready to accept requests.",
```

## P23 — packages/protocol/src/groups/installation.ts

POST target seleciona release, resposta success:true/version e erros 400/500; upgrade executado não foi observado.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ea13ec670bb99929cc76dcfdccc0c481870dcc0b`; full-source SHA256 `710926457a0a8785e2a08032ff0a1b344e3a2b885e0eef89a4b54363ab189610`; 776 source bytes.

Lines 5–15; byte offsets [176, 769); 593 bytes; span SHA256 `d893a4f1986f7389093aaa604ef8cb9a419acf892466e5951b3e15d5fc4adebc`.

```ts
export const InstallationGroup = HttpApiGroup.make("server.installation").add(
  HttpApiEndpoint.post("installation.upgrade", "/api/installation/upgrade", {
    payload: Schema.Struct({ target: Schema.String }),
    success: Schema.Struct({ success: Schema.Literal(true), version: Schema.String }),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "v2.installation.upgrade",
      summary: "Upgrade Orchestra",
      description: "Install the given Orchestra release with the package manager that installed this server.",
    }),
```

## P24 — packages/protocol/src/groups/integration.ts

Discovery de métodos, connect por key/OAuth e polling/completion/cancel; endpoints OAuth por integrationID preservam compatibilidade.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `14d98becffeda67939dbf5d87f0b63cfbd2e70ba`; full-source SHA256 `07d62144b0b00aa08f1c43fb3a52388b6fd1dee07881d3d0d22a701b9fc0f57f`; 7681 source bytes.

Lines 41–54; byte offsets [1512, 2147); 635 bytes; span SHA256 `b5ffddadfeb9f3d28fa6c6e7bbe840353cbcfbaf82393ce6e4b001b60eb019ee`.

```ts
    HttpApiEndpoint.delete("integration.disconnect", "/api/integration/:integrationID/connection", {
      params: { integrationID: Integration.ID },
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: ConflictError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.integration.disconnect",
          summary: "Disconnect integration",
          description:
            "Remove every stored credential of one integration, such as a provider's saved key or sign-in. Environment variables are not stored and stay.",
        }),
```

Lines 79–96; byte offsets [2937, 3660); 723 bytes; span SHA256 `1b12c2f89f21a867c61b5365da75e4815127dc2b18df4c9bcadb1e0f0087c282`.

```ts
    HttpApiEndpoint.post("integration.connect.oauth", "/api/integration/:integrationID/connect/oauth", {
      params: { integrationID: Integration.ID },
      query: LocationQuery,
      payload: Schema.Struct({
        methodID: Integration.MethodID,
        inputs: Inputs,
        label: Schema.optional(Schema.String),
      }),
      success: Location.response(Integration.Attempt),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.integration.connect.oauth",
          summary: "Begin OAuth connection",
          description: "Start an OAuth attempt and return the authorization details.",
        }),
```

Lines 100–112; byte offsets [3681, 4321); 640 bytes; span SHA256 `70250569854cade9b220c4b33ab0be07a5d1ffb26cce20e4569eb2ae498101ab`.

```ts
    HttpApiEndpoint.get("integration.oauth.status", "/api/integration/:integrationID/connect/oauth/:attemptID", {
      params: { integrationID: Integration.ID, attemptID: Integration.AttemptID },
      query: LocationQuery,
      success: Location.response(Integration.AttemptStatus),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.integration.oauth.status",
          summary: "Get integration OAuth status",
          description: "Compatibility route for polling an OAuth attempt owned by this integration.",
        }),
```

Lines 169–181; byte offsets [6348, 6986); 638 bytes; span SHA256 `e26089cb97e61399722454e141fbcd184fd536fd394cc3558e0897251bac0edc`.

```ts
    HttpApiEndpoint.post("integration.attempt.complete", "/api/integration/attempt/:attemptID/complete", {
      params: { attemptID: Integration.AttemptID },
      query: LocationQuery,
      payload: Schema.Struct({ code: Schema.optional(Schema.String) }),
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.integration.attempt.complete",
          summary: "Complete OAuth connection",
          description: "Complete a code-based OAuth attempt and store the resulting credential.",
```

## P25 — packages/protocol/src/groups/lean.ts

Dashboard/update/history por item, todos com ServiceUnavailableError; não calcula economia nesta camada.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b83fcad1267819111ceeb2a83c165664440379b7`; full-source SHA256 `204a60d3ebec15a9da53f9f18d6e2612334b35dad29b90022ba1adc11614b32e`; 2253 source bytes.

Lines 9–14; byte offsets [500, 737); 237 bytes; span SHA256 `4371e8ef85c8965b46abbeefa7c1f3759dac5c73579fd50c9a7065ef92c98391`.

```ts
export const LeanGroup = HttpApiGroup.make("server.lean")
  .add(
    HttpApiEndpoint.get("lean.get", "/api/lean", {
      query: LocationQuery,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
```

Lines 26–37; byte offsets [1057, 1575); 518 bytes; span SHA256 `cd0b437fcb2655ff553b335f44939ed90f085e8c8569072c0853dc6c516927a0`.

```ts
    HttpApiEndpoint.patch("lean.update", "/api/lean", {
      query: LocationQuery,
      payload: LeanDashboard.Update,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lean.update",
          summary: "Update Lean preferences",
          description: "Switch Lean or one of its items on or off for the saved profile, and return the dashboard.",
```

Lines 42–54; byte offsets [1608, 2144); 536 bytes; span SHA256 `9cdef9b2df1f33a1b067323153449b871d397d1cf2d20a8c51bc4ada83a1af6f`.

```ts
    HttpApiEndpoint.get("lean.history", "/api/lean/history/:itemID", {
      params: { itemID: LeanCoverage.ItemID },
      query: LocationQuery,
      success: Location.response(LeanDashboard.History),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lean.history",
          summary: "Get Lean item history",
          description: "The latest executions one Lean item saved output on in this Location.",
        }),
```

## P26 — packages/protocol/src/groups/location.ts

Query directory/workspace opcionais deepObject; Info direto e paths.home no endpoint de caminhos.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7f5c91563ac986c182e397173db9e5aa4653296f`; full-source SHA256 `b99aa362106a3dff080f713552d9db82059fb42e2379ba825b9edb55e7e86442`; 1760 source bytes.

Lines 5–12; byte offsets [168, 418); 250 bytes; span SHA256 `579b2612769b55d44b8ea742480d0386580ab7bbc68e1cac6f371ee31edb4fa4`.

```ts
export const LocationQuery = Schema.Struct({
  location: Schema.optional(
    Schema.Struct({
      directory: Schema.optional(Schema.String),
      workspace: Schema.optional(Schema.String),
    }),
  ),
}).annotate({ identifier: "LocationQuery" })
```

Lines 20–23; byte offsets [637, 841); 204 bytes; span SHA256 `2930b8e441baee0ed979ab434442e788cdf48f38dc4d2dc8d2d474f49846e186`.

```ts
      parameters: parameters.map((parameter) =>
        parameter?.name === "location" && parameter?.in === "query"
          ? { ...parameter, style: "deepObject", explode: true }
          : parameter,
```

Lines 33–54; byte offsets [979, 1758); 779 bytes; span SHA256 `a87efc5b49b2ce6afc4456577c1af5f299edd51de82215a4049ee0f2742c28dd`.

```ts
export const LocationGroup = HttpApiGroup.make("server.location").add(
  HttpApiEndpoint.get("location.get", "/api/location", {
    query: LocationQuery,
    success: Location.Info,
  })
    .annotateMerge(locationQueryOpenApi)
    .annotateMerge(
      OpenApi.annotations({
        identifier: "v2.location.get",
        summary: "Get location",
        description: "Resolve the requested location or the server default location.",
      }),
    ),
  HttpApiEndpoint.get("location.paths", "/api/location/paths", {
    success: LocationPaths,
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "v2.location.paths",
      summary: "Get server paths",
      description: "Return the server user's home directory, where the app's folder picker starts.",
    }),
  ),
```

## P27 — packages/protocol/src/groups/lsp.ts

Status de language servers conectados na Location, Array(Lsp.Status).

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `af1abb1824158a7d1b9f4bad3f035d2f7d3859e6`; full-source SHA256 `2f8262ae4f8259bf778ad2a97aef3a83dfa507b58aa3e2d55fecc1e71d9bca7c`; 877 source bytes.

Lines 9–19; byte offsets [337, 754); 417 bytes; span SHA256 `bc12bb00627060cf08b312793a8b13d14037738c0c75a7eee911ac0a873706ed`.

```ts
    HttpApiEndpoint.get("lsp.status", "/api/lsp", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Lsp.Status)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lsp.status",
          summary: "LSP status",
          description: "List the Location's connected language servers and their status.",
        }),
```

## P28 — packages/protocol/src/groups/mcp.ts

Discovery/status/config/resources/tools, mutations de config/conexão e OAuth; descrições distinguem redaction e env refs não resolvidas.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6b2d1fbbd2dabfff14404e2fcd5e04715bf338f6`; full-source SHA256 `40d05cb2bff6ec512c5952ffc719a68744649a6d1c89be05be9dd1e76f0904ca`; 7750 source bytes.

Lines 39–53; byte offsets [1455, 2003); 548 bytes; span SHA256 `64ef02999d4dedea1c5b9afd12d54e177b18aaf46b7176776533d789e94fb524`.

```ts
  )
  .add(
    HttpApiEndpoint.get("mcp.config", "/api/mcp/config", {
      query: LocationQuery,
      success: Location.response(Schema.Record(Schema.String, Mcp.Entry)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.config",
          summary: "Read resolved MCP config",
          description:
            "Read each configured MCP server's resolved transport and endpoint. Headers, environment and OAuth settings are never returned.",
        }),
      ),
```

Lines 86–97; byte offsets [3075, 3497); 422 bytes; span SHA256 `1b886a232c978d28feb37a80456f2c868ae3c3b4fd13db55d88a9ffa6d1fe9e6`.

```ts
    HttpApiEndpoint.put("mcp.add", "/api/mcp/:server", {
      params: ServerParams,
      query: LocationQuery,
      payload: Schema.Struct({ config: ConfigMCP.Server }),
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.add",
          summary: "Add MCP server",
```

Lines 173–188; byte offsets [6037, 6687); 650 bytes; span SHA256 `a177c415687966d59341a2e014bdb2c771140f3ab3773940ac6d005dd2fd534c`.

```ts
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.auth.start",
          summary: "Start MCP OAuth",
          description:
            "Start an OAuth sign-in for a remote MCP server and return the authorization URL to open. The local callback completes the sign-in and reconnects the server; an empty URL means it was already authorized.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("mcp.auth.callback", "/api/mcp/:server/auth/callback", {
      params: ServerParams,
      query: LocationQuery,
      payload: Schema.Struct({ code: Schema.String }),
```

## P29 — packages/protocol/src/groups/meeting.ts

Start/append/stop/read/list, confirmações e handoff; ErrorReason estruturado em400, append NoContent e descrição de deduplicação.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1a098d8e8f58b0705fcf0c3921f8a98c08a19340`; full-source SHA256 `2aeb305bf54748eb641ce1b691bab954d95fb2fbf1571ce0f937e58f54a6a9e1`; 6192 source bytes.

Lines 7–25; byte offsets [300, 1083); 783 bytes; span SHA256 `b0b3b13da057fe00d4295c02801aa252adbf5c7bdc846e40a5d9e7cc4da36a8d`.

```ts
// `reason` says why the meeting could not change, so clients can explain it without parsing the message.
export class MeetingError extends Schema.ErrorClass<MeetingError>("MeetingError")(
  {
    name: Schema.Literal("MeetingError"),
    data: Schema.Struct({ reason: Meeting.ErrorReason }),
  },
  { httpApiStatus: 400 },
) {}

const ReadParams = Schema.Struct({ ...LocationQuery.fields, meetingID: Meeting.ID })
const ListParams = Schema.Struct({ ...LocationQuery.fields, ...Meeting.ListQuery.fields })

export const MeetingGroup = HttpApiGroup.make("server.meeting")
  .add(
    HttpApiEndpoint.post("meeting.start", "/api/meeting/start", {
      query: LocationQuery,
      payload: Meeting.StartInput,
      success: Location.response(Meeting.Info),
      error: MeetingError,
```

Lines 38–49; byte offsets [1430, 1940); 510 bytes; span SHA256 `eba42e087705ae6d3ba576d2b54e6be401f9c537d7ef78908177105812c8db2c`.

```ts
    HttpApiEndpoint.post("meeting.append", "/api/meeting/segments", {
      query: LocationQuery,
      payload: Meeting.AppendInput,
      success: HttpApiSchema.NoContent,
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.append",
          summary: "Append meeting segments",
          description: "Append final transcript segments to a running meeting. Segments already stored are skipped.",
```

Lines 164–176; byte offsets [5481, 6014); 533 bytes; span SHA256 `0ab9e8a8a837275eb028f4b669dcfa91f51bfcd39f7194a5c355fc554b903337`.

```ts
    HttpApiEndpoint.post("meeting.handoff", "/api/meeting/handoff", {
      query: LocationQuery,
      payload: Meeting.HandoffInput,
      success: Location.response(Meeting.HandoffResult),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.handoff",
          summary: "Send items to Maestro",
          description: "Send card items to Maestro through team_message, with their source and no transcript.",
        }),
```

## P30 — packages/protocol/src/groups/permission.ts

Queries de requests/saved e recursos de sessão; middleware placement separa endpoints prévios e session endpoints; reply é NoContent.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a34d8726146a5cdc1b989b583a4943290584d34b`; full-source SHA256 `9cef92dd60326651b2ee4b6d5946e4381ea6791076c017da532122b9be0fa1ab`; 5828 source bytes.

Lines 60–84; byte offsets [2461, 3669); 1208 bytes; span SHA256 `65db8f5d7aa44e8c772b6927157fcd957e7dd11ea9a5b72779300ce60d6d4ad8`.

```ts
    // Effect applies group middleware only to endpoints already added; session endpoints use session placement below.
    .middleware(locationMiddleware)
    .add(
      HttpApiEndpoint.post("session.permission.create", "/api/session/:sessionID/permission", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: Permission.ID.pipe(Schema.optional),
          action: Permission.Request.fields.action,
          resources: Permission.Request.fields.resources,
          save: Permission.Request.fields.save,
          metadata: Permission.Request.fields.metadata,
          source: Permission.Request.fields.source,
          agent: Agent.ID.pipe(Schema.optional),
        }),
        success: Schema.Struct({
          data: Schema.Struct({ id: Permission.ID, effect: Permission.Effect }),
        }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.permission.create",
            summary: "Create permission request",
            description: "Evaluate and, when approval is required, create a permission request for a session.",
```

Lines 104–128; byte offsets [4308, 5424); 1116 bytes; span SHA256 `2a81535fd993c0f17c77f2f3a35d92a48e73fe93cbe17435c3eca6c3f652d382`.

```ts
      HttpApiEndpoint.get("session.permission.get", "/api/session/:sessionID/permission/:requestID", {
        params: { sessionID: Session.ID, requestID: Permission.ID },
        success: Schema.Struct({ data: Permission.Request }),
        error: [SessionNotFoundError, PermissionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.permission.get",
            summary: "Get permission request",
            description: "Retrieve a pending permission request owned by a session.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.permission.reply", "/api/session/:sessionID/permission/:requestID/reply", {
        params: { sessionID: Session.ID, requestID: Permission.ID },
        payload: Schema.Struct({
          reply: Permission.Reply,
          message: Schema.String.pipe(Schema.optional),
        }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, PermissionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
```

## P31 — packages/protocol/src/groups/project-copy.ts

Create omite projectID/sourceDirectory do payload e usa params/contexto; Remove omite projectID; erro400 inclui forceRequired opcional.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6e9c31ffda7a581a06f82e23b82185ffa31dd77b`; full-source SHA256 `b7be27f97fe517482a62e18e222aade4965880d7e4f5c60d3bb2b7f43c39c3fa`; 2589 source bytes.

Lines 10–31; byte offsets [464, 1186); 722 bytes; span SHA256 `cd5011b19bb948f7268501aec893479d439f7a00c9cb18c33e44cab395b7070b`.

```ts
  {
    name: Schema.Literal("ProjectCopyError"),
    data: Schema.Struct({
      message: Schema.String,
      forceRequired: Schema.optional(Schema.Boolean),
    }),
  },
  { httpApiStatus: 400 },
) {}

const CreatePayload = Schema.Struct(Struct.omit(ProjectCopy.CreateInput.fields, ["projectID", "sourceDirectory"]))
const RemovePayload = Schema.Struct(Struct.omit(ProjectCopy.RemoveInput.fields, ["projectID"]))

export const ProjectCopyGroup = HttpApiGroup.make("server.projectCopy")
  .add(
    HttpApiEndpoint.post("projectCopy.create", root, {
      params: { projectID: Project.ID },
      query: LocationQuery,
      payload: CreatePayload,
      success: ProjectCopy.Copy,
      error: ProjectCopyError,
    })
```

Lines 36–43; byte offsets [1325, 1602); 277 bytes; span SHA256 `47dba7d7dcff111a307eadd8fa1a8139c5a015ffc62ea1d7a858ed9cb21332d9`.

```ts
    HttpApiEndpoint.delete("projectCopy.remove", root, {
      params: { projectID: Project.ID },
      query: LocationQuery,
      payload: RemovePayload,
      success: HttpApiSchema.NoContent,
      error: ProjectCopyError,
    })
      .annotateMerge(locationQueryOpenApi)
```

## P32 — packages/protocol/src/groups/project.ts

Catálogo global e mutation por Project.ID; initGit é operação com LocationQuery e resposta nullable dentro do envelope.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `46e212ecd9aa4c7eed43bec02f78e87a75d65b65`; full-source SHA256 `da3a028185367a5d87bb1ef19b0a9a387e38dc491713326c569b97d10cc37445`; 2606 source bytes.

Lines 10–26; byte offsets [453, 1093); 640 bytes; span SHA256 `c1d9270c66c1bcfff85d168cd75f8a44ddf9cb4d576e6ed220a070ef1b87d1c8`.

```ts
  .add(
    HttpApiEndpoint.get("project.list", "/api/project", {
      success: Schema.Array(Project.Info),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.project.list",
        summary: "List projects",
        description: "Retrieve every project this server has opened, oldest first.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("project.directories", "/api/project/:projectID/directories", {
      params: { projectID: Project.ID },
      success: Schema.Array(Schema.Struct({ directory: AbsolutePath, strategy: Schema.optional(Schema.String) })),
    }).annotateMerge(
      OpenApi.annotations({
```

Lines 35–48; byte offsets [1388, 1977); 589 bytes; span SHA256 `6facfbea22a47bf6215f09657124b363b5754769bb97e3cf77d7420a09fdfefc`.

```ts
      params: { projectID: Project.ID },
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
        icon: Schema.optional(Schema.Struct({ color: Schema.optional(Schema.String), override: Schema.optional(Schema.String) })),
        commands: Schema.optional(Project.Commands),
      }),
      success: Project.Info,
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.project.update",
        summary: "Update project",
        description: "Rename a project or change its icon or start command.",
      }),
```

Lines 51–61; byte offsets [1988, 2359); 371 bytes; span SHA256 `2fd8be10bdb5f18067bcd40668e61bb0c3948c6f953557d08bffeb2359c81d99`.

```ts
  .add(
    HttpApiEndpoint.post("project.initGit", "/api/project/git", {
      query: LocationQuery,
      success: Location.response(Schema.NullOr(Project.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.project.initGit",
          summary: "Initialize git",
          description:
```

## P33 — packages/protocol/src/groups/pull-request.ts

List/create com erro400 kind/message e contexto host; declaração atribui efeitos ao gh/glab autenticado do servidor.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3b4883efab40b49a172f80ba54b4f9ee5594a6b8`; full-source SHA256 `2d6ffaa70170cc87e6950f8050bcd80113dfcc9fe588d8142e451afa6671de45`; 2260 source bytes.

Lines 8–21; byte offsets [346, 849); 503 bytes; span SHA256 `2af0ab411774ade2945489bd9cdbe7d9a8edfb01675b88cff86d86250bb87abf`.

```ts
// `kind` says why the host CLI could not answer, so clients can explain it without parsing the message.
export class PullRequestError extends Schema.ErrorClass<PullRequestError>("PullRequestError")(
  {
    name: Schema.Literal("PullRequestError"),
    data: Schema.Struct({
      kind: PullRequest.ErrorKind,
      message: Schema.String,
      host: optional(PullRequest.Host),
      branch: optional(Schema.String),
      remote: optional(Schema.String),
    }),
  },
  { httpApiStatus: 400 },
) {}
```

Lines 25–37; byte offsets [930, 1477); 547 bytes; span SHA256 `88a90dc7e01b18b1324b915b03d064f068e53ed0107559287f74046eb88128f8`.

```ts
    HttpApiEndpoint.get("pullRequest.list", "/api/pull-request", {
      query: LocationQuery,
      success: Location.response(PullRequest.List),
      error: PullRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.pullRequest.list",
          summary: "List open pull requests",
          description:
            "List open pull requests on the location's github.com or gitlab.com remote through the gh or glab CLI signed in on the server.",
        }),
```

Lines 41–54; byte offsets [1498, 2085); 587 bytes; span SHA256 `9eb083a2ecbc0125cd1aa889d5c5d209eacf1836d866992b178aa3229da3d3ce`.

```ts
    HttpApiEndpoint.post("pullRequest.create", "/api/pull-request", {
      query: LocationQuery,
      payload: PullRequest.CreateInput,
      success: Location.response(PullRequest.Created),
      error: PullRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.pullRequest.create",
          summary: "Create pull request",
          description:
            "Open a pull request from a pushed branch of the location's repository through the gh or glab CLI signed in on the server.",
        }),
```

## P34 — packages/protocol/src/groups/question.ts

Pending list por Location; list/reply/reject por sessionID e requestID com middleware de sessão e erros404.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c946dfc26741746eab179ba8061391ead76a182b`; full-source SHA256 `e128a5558fb90cd1492b3d4621be4359e66af7f9b6ca662373975d64b6b8e31b`; 3616 source bytes.

Lines 33–62; byte offsets [1342, 2738); 1396 bytes; span SHA256 `19986a817f61f373b32b13e2c9b0dddfdfb79d1d8725148c4b99edb356652ada`.

```ts
    .annotateMerge(OpenApi.annotations({ title: "questions", description: "Experimental question routes." }))
    // Effect applies group middleware only to endpoints already added; session endpoints use session placement below.
    .middleware(locationMiddleware)
    .add(
      HttpApiEndpoint.get("session.question.list", "/api/session/:sessionID/question", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Array(Question.Request) }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.question.list",
            summary: "List session question requests",
            description: "Retrieve pending question requests owned by a session.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.question.reply", "/api/session/:sessionID/question/:requestID/reply", {
        params: { sessionID: Session.ID, requestID: Question.ID },
        payload: Question.Reply,
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, QuestionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.question.reply",
            summary: "Reply to pending question request",
```

Lines 67–78; byte offsets [2851, 3446); 595 bytes; span SHA256 `7fa724d8a1537715ba985bdd2ba3103ced99ebb1eb6d3f937b62e1012484da42`.

```ts
    .add(
      HttpApiEndpoint.post("session.question.reject", "/api/session/:sessionID/question/:requestID/reject", {
        params: { sessionID: Session.ID, requestID: Question.ID },
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, QuestionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.question.reject",
            summary: "Reject pending question request",
            description: "Reject a pending question request owned by a session.",
```

## P35 — packages/protocol/src/groups/rag-studio.ts

Sources/pipeline/revisions/search/ask/proofs; tipos explícitos de refusal embedding_off e one_pass restringem duas rotas.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d0abf2ac581e1e560e6cc3769bdf6b5afd51ea36`; full-source SHA256 `765710e476d9aad6c06abcd7b9b610e34e57a57b0e1ede116a33b64b7151da10`; 6080 source bytes.

Lines 11–18; byte offsets [578, 1004); 426 bytes; span SHA256 `d24e635648231783086ed5648066efa8032daf8f6b2e5e9a364200168d8533a6`.

```ts
// Rag Studio over the requested Location. Embedding stays off. Project source is refused as Atlas.
export const RagStudioGroup = HttpApiGroup.make("server.ragStudio")
  .add(
    HttpApiEndpoint.get("ragStudio.sources", "/api/rag-studio/sources", {
      query: LocationQuery,
      success: Location.response(Schema.Array(RagStudio.Source)),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
```

Lines 29–33; byte offsets [1303, 1535); 232 bytes; span SHA256 `d0865fb3ce4a725a1068cb9ff035f51eb86946179dc149d651bbfec5aa54ac7d`.

```ts
    HttpApiEndpoint.post("ragStudio.admit", "/api/rag-studio/sources", {
      query: LocationQuery,
      payload: RagStudio.PathInput,
      success: Location.response(RagStudio.AdmitResult),
      error: ServiceUnavailableError,
```

Lines 83–104; byte offsets [3248, 4100); 852 bytes; span SHA256 `08f019046472b3673679b4c32815992ee7e3d0023019e7d0ec8875546205609a`.

```ts
    HttpApiEndpoint.post("ragStudio.search", "/api/rag-studio/search", {
      query: LocationQuery,
      payload: RagStudio.SearchInput,
      success: Location.response(Schema.Array(RagStudio.Chunk)),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.ask", "/api/rag-studio/ask", {
      query: LocationQuery,
      payload: RagStudio.AskInput,
      success: Location.response(RagStudio.QuestionResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.question", "/api/rag-studio/questions", {
      query: LocationQuery,
      payload: RagStudio.QuestionInput,
      success: Location.response(RagStudio.IdResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
```

Lines 133–154; byte offsets [5088, 5982); 894 bytes; span SHA256 `a7130679ae704fd5f2c78655980c6a2834fcf57004c7787dd5f43236af18ed3b`.

```ts
    HttpApiEndpoint.post("ragStudio.embedding", "/api/rag-studio/embedding", {
      query: LocationQuery,
      success: Location.response(Schema.Struct({ refused: Schema.Literal("embedding_off") })),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.pass", "/api/rag-studio/passes", {
      query: LocationQuery,
      payload: RagStudio.PassInput,
      success: Location.response(RagStudio.PassResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.passes", "/api/rag-studio/passes/batch", {
      query: LocationQuery,
      payload: RagStudio.PassesInput,
      success: Location.response(Schema.Struct({ refused: Schema.Literal("one_pass") })),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
```

## P36 — packages/protocol/src/groups/reference.ts

Somente catálogo Reference.Info na localização; não fornece acesso de conteúdo.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0820aea4331c4617c4f4d5ef60bc94575e72ca6a`; full-source SHA256 `10cda63b26f6a8c899e61cd1da3bae24b0698efb7050af7d01abf1a9beb9b977`; 946 source bytes.

Lines 9–18; byte offsets [365, 781); 416 bytes; span SHA256 `d95db4735e0cad21512fea668506ccbe06cb3b187b182388e67dd3de6bf66035`.

```ts
    HttpApiEndpoint.get("reference.list", "/api/reference", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Reference.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.reference.list",
          summary: "List references",
          description: "List references available in the requested location.",
```

## P37 — packages/protocol/src/groups/relay-document.ts

Authoring e publicação; revision/checksum/force, recusa de check público e trial separado; versão publicada tem porta própria.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `03680e54451165bb46ea12a5466322dd20357d89`; full-source SHA256 `4ee493b253f003a5cee6225b6acef9c9ab6b68af4d6c3775fcda126b555a5539`; 17770 source bytes.

Lines 15–41; byte offsets [861, 1739); 878 bytes; span SHA256 `dde27683dd38bd563320e4a7dd5493af50ead5a7e5abd4ddab94d456b5d8c80d`.

```ts
export class RelayInvalidError extends Schema.TaggedErrorClass<RelayInvalidError>()("RelayInvalidError", refusal, {
  httpApiStatus: 400,
}) {}

export class RelayForbiddenError extends Schema.TaggedErrorClass<RelayForbiddenError>()(
  "RelayForbiddenError",
  refusal,
  {
    httpApiStatus: 403,
  },
) {}

export class RelayNotFoundError extends Schema.TaggedErrorClass<RelayNotFoundError>()("RelayNotFoundError", refusal, {
  httpApiStatus: 404,
}) {}

export class RelayConflictError extends Schema.TaggedErrorClass<RelayConflictError>()("RelayConflictError", refusal, {
  httpApiStatus: 409,
}) {}

export class RelayUnavailableError extends Schema.TaggedErrorClass<RelayUnavailableError>()(
  "RelayUnavailableError",
  refusal,
  { httpApiStatus: 503 },
) {}

export const RelayErrors = [RelayInvalidError, RelayNotFoundError, RelayConflictError, RelayUnavailableError]
```

Lines 74–80; byte offsets [3338, 3727); 389 bytes; span SHA256 `3fbc362738dbe94d71c8f618d58f5989dac190f071c4a53594fbe80e36ecfaaf`.

```ts
/** A save of the version the editor loaded: `versionId` is required unless `force` overwrites whatever is stored. */
export const RelayDocumentUpdate = Schema.Struct({
  ...DocumentFields,
  versionId: Schema.optionalKey(Schema.String),
  expectedChecksum: Schema.optionalKey(Schema.String),
  force: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: "RelayDocumentUpdate" })
```

Lines 306–319; byte offsets [11873, 12496); 623 bytes; span SHA256 `a0d862634d8177f3f6f9cd7704f51c80b1c46949bfec493a0e11496dc905772d`.

```ts
    HttpApiEndpoint.post("relay.document.check", `${document}/check`, {
      params,
      query: LocationQuery,
      payload: RelayCheckInput,
      success: Location.response(RelayArm.CheckOutcome),
      error: [...RelayErrors, RelayForbiddenError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.check",
          "Check workflow step",
          "Public authoring cannot execute workflow checks. This endpoint returns 403 maestro-execution-required; executable workflow checks are owned by Maestro through its approved native binding.",
        ),
```

Lines 353–366; byte offsets [13685, 14300); 615 bytes; span SHA256 `aee49894ce839b55a86193e9c0a558a038edc91962075125d4a6ae365869f3d7`.

```ts
    HttpApiEndpoint.post("relay.document.trial", "/api/relay/trial", {
      query: LocationQuery,
      payload: RelayTrialInput,
      success: Location.response(RelayTrial),
      error: [...RelayErrors, RelayForbiddenError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.trial",
          "Try a check command",
          "Run one check command in the project the way a check runs, for at most 60 seconds, and return the end of its output. It grades and records nothing. An untrusted project is a 403 project-untrusted.",
        ),
      ),
```

Lines 430–443; byte offsets [16586, 17109); 523 bytes; span SHA256 `a27561a24226b68f6aeb4deaa83cad5a2bfc46c80943ae7ee8216abb03e80cbf`.

```ts
    HttpApiEndpoint.post("relay.publish.publish", `${document}/publish`, {
      params,
      query: LocationQuery,
      payload: RelayPublishInput,
      success: Location.response(RelayDocumentView),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.publish.publish",
          "Publish Relay document",
          "Publish the document's current version once it compiles. The signed-in principal is recorded as publishedBy.",
        ),
```

## P38 — packages/protocol/src/groups/relay-hook.ts

Instalações versionadas, enable/disable/order/uninstall/decision read; repair explícito exige confirm:true e preserva ledger no uninstall.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `dfc36c1b3b2cdf2b597e770b32c8bd4e0ce719ff`; full-source SHA256 `889c86dde2a4af1076f93147d98591d6682ef2eba09b8144861892f3298afb5d`; 7034 source bytes.

Lines 17–47; byte offsets [841, 2268); 1427 bytes; span SHA256 `3801189ced9016c4243585416602b353056c58311ddd4c802af6e8d55b7106ad`.

```ts
/** Pin a published hook. `version` defaults to the document's published version and must be that version. */
export const RelayHookInstallInput = Schema.Struct({
  document: Schema.String,
  version: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayHookInstallInput" })

/** Repin an install to its document's published version; `version`, when sent, must be that version. */
export const RelayHookUpdateInput = Schema.Struct({
  version: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayHookUpdateInput" })

export const RelayHookOrderInput = Schema.Struct({ installIDs: Schema.Array(Schema.String) }).annotate({
  identifier: "RelayHookOrderInput",
})

/** The repair discards every install in a corrupt `hooks.json`, so the request states it. */
export const RelayHookRepairInput = Schema.Struct({ confirm: Schema.Literal(true) }).annotate({
  identifier: "RelayHookRepairInput",
})

/** The corrupt file was moved to `backup`, and `hooks.json` now holds no installs. */
export const RelayHookRepaired = Schema.Struct({
  backup: Schema.String,
  installs: Schema.Array(RelayHook.Install),
}).annotate({ identifier: "RelayHookRepaired" })

/** One `hook-decision` line of an install's ledger, with its chain sequence number. */
export const RelayHookDecision = Schema.Struct({
  ...RelayLedger.HookDecision.fields,
  seq: NonNegativeInt,
}).annotate({ identifier: "RelayHookDecision" })
```

Lines 126–138; byte offsets [4868, 5362); 494 bytes; span SHA256 `62bfba7eb516a9891ce0244432cae1a88098e05ac13119ee5f4aa0f516f944ef`.

```ts
    HttpApiEndpoint.patch("relay.hook.order", "/api/relay/hook/order", {
      query: LocationQuery,
      payload: RelayHookOrderInput,
      success: Location.response(RelayHookInstalls),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.order",
          "Reorder installed hooks",
          "Set the evaluation order. The list must name every install exactly once, else 409 order-mismatch.",
        ),
```

Lines 170–181; byte offsets [6236, 6901); 665 bytes; span SHA256 `8511eb26002b6003846cbaf8e25fc2dcd8d85218aa7313da5d0630aafd17128d`.

```ts
    HttpApiEndpoint.post("relay.hook.repair", "/api/relay/hook/repair", {
      query: LocationQuery,
      payload: RelayHookRepairInput,
      success: Location.response(RelayHookRepaired),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.repair",
          "Repair hooks.json",
          "Only on this explicit request: a corrupt hooks.json (a regular file that does not decode or verify, or is over the size cap) is moved aside to a backup and replaced by an empty install list. A valid file, a symlink, a non-file or an unreadable file is never touched and answers 409.",
```

## P39 — packages/protocol/src/groups/relay-run.ts

Leitura de runs e ledger externo; audit schema admite pass, mas descrição exige pending para cadeia íntegra self-reported.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `98e60955b216d71887830cda06f8d07cd442fa98`; full-source SHA256 `7237bae800ad36fc21c77f3df21d5480fc11760e4f9b432e0c0f60dc06294834`; 4378 source bytes.

Lines 8–10; byte offsets [338, 587); 249 bytes; span SHA256 `07bbbd4659bd8dedb3955bdcd0ed215ca12ca35c84160ce895e3714cd4235543`.

```ts
// External runs (Relay for LangGraph), read-only: each `<location>/.relay/runs/<runID>/ledger.jsonl` rebuilt into the
// run the app's Executions screen renders. The ledger is self-reported by the external process, so its audit is never
// a pass.
```

Lines 43–47; byte offsets [1643, 1907); 264 bytes; span SHA256 `8e33823875ab9050fdc40ace1812d433adc85016f9bfd35cf3b599f7493c4fe6`.

```ts
export const RelayExternalAudit = Schema.Struct({
  status: Schema.Literals(["pass", "fail", "pending"]),
  code: Schema.String,
  rows: Schema.Array(Schema.Struct({ label: Schema.String, value: Schema.String })),
}).annotate({ identifier: "RelayExternalAudit" })
```

Lines 82–94; byte offsets [3117, 3610); 493 bytes; span SHA256 `911be6259662c40ce9e486c1b3bd1c431fb216766ef26736c316d64abb6ff6da`.

```ts
    HttpApiEndpoint.get("relay.run.audit", `${run}/audit`, {
      params,
      query: LocationQuery,
      success: Location.response(RelayExternalAudit),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.run.audit",
          "Audit external run",
          "Verify the run's ledger chain. An intact chain is pending external-self-reported, never pass; a broken one fails at its first bad line.",
        ),
```

Lines 98–112; byte offsets [3631, 4248); 617 bytes; span SHA256 `51bd47964e1c94fbc20fe505d31e8be0f627df5c7afa7bcad391d4388cb73d71`.

```ts
    HttpApiEndpoint.get("relay.run.ledger", `${run}/ledger`, {
      params,
      query: Schema.Struct({
        ...LocationQuery.fields,
        after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
      }),
      success: Location.response(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.run.ledger",
          "Read external run ledger",
          "The run's ledger entries from seq `after` on (all of them when it is 0 or absent).",
```

## P40 — packages/protocol/src/groups/research-artifact.ts

SessionID + ArtifactID + revisão positiva, cursor opcional, ArtifactPage direto e middleware recebido; sem path de filesystem.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `517434f6b238a90ee46da5790343c4c0f58b4cd5`; full-source SHA256 `d890554a5de05935339e01dcb74076a0cabd96d080d07b07bdd8151cf5978402`; 1650 source bytes.

Lines 9–24; byte offsets [464, 1650); 1186 bytes; span SHA256 `8503ea154df3c7d0846e1720fb60df48778b2940ffb89cf37d720b5212d1dae2`.

```ts
export class ResearchArtifactNotFoundError extends Schema.TaggedErrorClass<ResearchArtifactNotFoundError>()(
  "ResearchArtifactNotFoundError", { message: Schema.String }, { httpApiStatus: 404 },
) {}

export const makeResearchArtifactGroup = <I extends HttpApiMiddleware.AnyId, S>(middleware: Context.Key<I, S>) =>
  HttpApiGroup.make("server.research")
    .add(HttpApiEndpoint.get("research.artifact", "/api/session/:sessionID/research/:artifactID", {
      params: Schema.Struct({ sessionID: SessionID, artifactID: Capability.ArtifactID }),
      query: Schema.Struct({ revision: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt)), cursor: optional(Schema.String) }),
      success: Research.ArtifactPage,
      error: [ResearchArtifactNotFoundError, ConflictError, InvalidRequestError, ServiceUnavailableError],
    }).annotateMerge(OpenApi.annotations({
      identifier: "v2.research.artifact", summary: "Read an admitted research artifact revision",
      description: "Return exact retained source/document text in bounded immutable pages. Session and admitted scope determine access; arbitrary filesystem paths are not accepted.",
    })))
    .middleware(middleware)
```

## P41 — packages/protocol/src/groups/schedule.ts

CRUD e run de ScheduledTask; erros404/500 explícitos para run, descrição separa admissão e execução.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0ca32d9e0c312fa279dbf98b1c3470252451876a`; full-source SHA256 `d901c49c299f7005f864dc21c0b7e1a99d4479888d10454a653dc7483c3f63c8`; 3793 source bytes.

Lines 8–21; byte offsets [376, 762); 386 bytes; span SHA256 `59654c9144c3debaad5a127c86f2bc9c193055b8a2e7addb6919abd6d65abbfd`.

```ts
export class ScheduleNotFoundError extends Schema.TaggedErrorClass<ScheduleNotFoundError>()(
  "ScheduleNotFoundError",
  {
    scheduleID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ScheduleRunError extends Schema.TaggedErrorClass<ScheduleRunError>()(
  "ScheduleRunError",
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}
```

Lines 41–54; byte offsets [1368, 1990); 622 bytes; span SHA256 `4a135bb6a227dcaef29fd6a5ddb1bb7a3f1b1ed4429fecbcf25ff89acc91c270`.

```ts
    HttpApiEndpoint.post("schedule.create", "/api/schedule", {
      query: LocationQuery,
      payload: ScheduledTask.CreateInput,
      success: Location.response(ScheduledTask.Info),
      error: [InvalidRequestError, ConflictError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.create",
          summary: "Create scheduled task",
          description:
            "Schedule a prompt for the location. The server runs due slots itself; creating with an ID the location already has returns that task unchanged.",
        }),
```

Lines 91–104; byte offsets [3062, 3680); 618 bytes; span SHA256 `07059a71abb28daa8a0387c83c54c1dda5e677d8b023ba7278d72c3a098d6b1b`.

```ts
    HttpApiEndpoint.post("schedule.run", "/api/schedule/:scheduleID/run", {
      params,
      query: LocationQuery,
      success: Location.response(ScheduledTask.RunResult),
      error: [ScheduleNotFoundError, ScheduleRunError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.run",
          summary: "Run scheduled task now",
          description:
            "Admit the task's prompt into a Session now. Serves the due slot when no run holds it, otherwise starts an extra run. A failed run is not recorded.",
        }),
```

## P42 — packages/protocol/src/groups/skill.ts

List e save/remove para catálogo/arquivos de projeto; save declara globals/built-ins/Atlas-governed read-only, com InvalidRequest/Conflict.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `28b28134f9b9c751f9564737ea46034a9b36761e`; full-source SHA256 `290c280836fb40fbd5d963492088a4ff60c7b1d1d6315125e1317d6f58ce756f`; 2259 source bytes.

Lines 29–42; byte offsets [973, 1612); 639 bytes; span SHA256 `b64ea5757b735aab98d937eee72c87b739e52ba5482d4a7a8060a36d2770cd31`.

```ts
    HttpApiEndpoint.put("skill.save", "/api/skill", {
      query: LocationQuery,
      payload: Skill.SaveInput,
      success: Location.response(Skill.Info),
      error: [InvalidRequestError, ConflictError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.save",
          summary: "Save skill",
          description:
            "Create a project skill under .orchestra/skills, or rewrite a registered project skill file given its path. Global, built-in and Atlas-governed skills are read-only. Front matter is re-serialized as YAML.",
        }),
```

Lines 46–56; byte offsets [1633, 2106); 473 bytes; span SHA256 `7dedcf2fc8fa8c1b0bdf3b43776e040717e1027af02f054be579e04bd980ef6d`.

```ts
    HttpApiEndpoint.delete("skill.remove", "/api/skill", {
      query: SkillRemoveQuery,
      success: Location.response(Schema.Boolean),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.remove",
          summary: "Remove skill",
          description: "Delete a registered project skill file given its path, and its folder when that is left empty.",
```

## P43 — packages/protocol/src/groups/trust.ts

Lista/aprova/revoga trust global com directory String; não é Location-scoped; realpath e herança são descrições de behavior.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6edc0294a84214180849fb00e25ce7f5a10ea381`; full-source SHA256 `5c605bf5836bc45630538c2b037e173b4062bc2d0991b6f0434d68b746bc4589`; 1986 source bytes.

Lines 5–7; byte offsets [177, 350); 173 bytes; span SHA256 `4e0b008d068d9574343bdc012cb1a064cbb3ec345ba71e1f724d9ad388eaa851`.

```ts
const DirectoryPayload = Schema.Struct({ directory: Schema.String })

// Trust is a user decision stored in the global config, so these routes are not scoped to a Location.
```

Lines 22–45; byte offsets [828, 1879); 1051 bytes; span SHA256 `e6b9f9d63a2aa59f71be99af147d70b0f37a848d6a7dee19bce7661e10665083`.

```ts
    HttpApiEndpoint.post("trust.approve", "/api/trust/approve", {
      payload: DirectoryPayload,
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.trust.approve",
        summary: "Trust project",
        description:
          "Store an existing absolute project folder, resolved to its real path, in the global config's trusted_projects, then start its blocked MCP servers. Approving a folder that is already trusted changes nothing.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("trust.revoke", "/api/trust/revoke", {
      payload: DirectoryPayload,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.trust.revoke",
        summary: "Revoke project trust",
        description:
          "Remove a folder's own entry from the global config's trusted_projects, then stop its running local MCP servers. A folder trusted only through a parent folder stays trusted.",
      }),
```

## P44 — packages/protocol/src/groups/vcs.ts

Info/status/diff working|branch, métricas entre millis e atividade de sessão por período.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `394f864cc464cbaaa7c11c565c12fb738702c1a4`; full-source SHA256 `ed0bc013c50e318eaba1e8dc8417ff97aad0f4508dc16b67c2c58edac280b6e3`; 3386 source bytes.

Lines 40–55; byte offsets [1426, 2099); 673 bytes; span SHA256 `c33a53c68329ba83ccbf561a6648116ce6e737e567e02bf38a79452f0d7cc516`.

```ts
  .add(
    HttpApiEndpoint.get("vcs.diff", "/api/vcs/diff", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        mode: Schema.Literals(["working", "branch"]),
        context: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
      }),
      success: Location.response(Schema.Array(Vcs.FileDiff)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.vcs.diff",
          summary: "Diff changes",
          description:
            "Diffs of the working tree against HEAD (`working`) or against the merge base with the default branch (`branch`).",
```

Lines 59–71; byte offsets [2124, 2643); 519 bytes; span SHA256 `113a5e4972ec6608a0e8afb4b85ee4625a97ecd033732ed1e3a1685029815255`.

```ts
  .add(
    HttpApiEndpoint.get("vcs.activity", "/api/vcs/activity", {
      query: Schema.Struct({ ...LocationQuery.fields, since: Millis, until: Millis }),
      success: Location.response(Vcs.Activity),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.vcs.activity",
          summary: "Get commit activity",
          description: "Commits, merges, authors and changed lines between two epoch-millisecond bounds.",
        }),
      ),
```

Lines 76–88; byte offsets [2818, 3253); 435 bytes; span SHA256 `345ccbff90f411135750a210e04cc83943c1fc0ca177b60561e107c2a3aed6cd`.

```ts
      success: Location.response(SessionActivity.Activity),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.activity.session",
          summary: "Get Session activity",
          description:
            "Recorded Session activity of the location's project over a period (of the directory alone outside git).",
        }),
      ),
  )
  .annotateMerge(
```

## Q001 — packages/schema/src/agent-file.ts

Agent markdown input/read revision and ordered permission update contract.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1fd3774ad15a772b5895ffd4351fc55206cb30c4`; full-source SHA256 `2a50259000db39a4e081479ef7ff288a5dd2c7045dec0abcc851eaf169160a31`; 1931 source bytes.

Lines 16–35; byte offsets [590, 1568); 978 bytes; span SHA256 `238860281c09be06bc856da282d75ed19154291a3a4e76e27b25347f92143f44`.

```ts
// The fields an agent markdown file (`.orchestra/agent/<name>.md`) defines; `system` is the body.
// `permission` keeps the file's key order because later entries win.
const fields = {
  description: Schema.String.pipe(optional),
  mode: Schema.Literals(["subagent", "primary", "all"]).pipe(optional),
  model: Schema.String.pipe(optional),
  avatar: Agent.Avatar.pipe(optional),
  steps: PositiveInt.pipe(optional),
  system: Schema.String.pipe(optional),
  permission: Schema.Record(Schema.String, Permission).pipe(optional),
  disable: Schema.Boolean.pipe(optional),
}

// Omitted fields are removed from the file, except `permission`: omitted leaves the file's rules as they are.
// `revision` is the value a read returned; a write fails when the file changed since.
export const Input = Schema.Struct({
  ...fields,
  revision: Schema.String.pipe(optional),
}).annotate({ identifier: "AgentFile.Input" })
export interface Input extends Schema.Schema.Type<typeof Input> {}
```

## Q002 — packages/schema/src/agent.ts

Agent engine/model/request/mode/toolkit/permission representation.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6d20c9672dd5d72fcca1ef86593199673b742acb`; full-source SHA256 `af5eb18c92b031ccac8b44c48d260e2f5edb4913c0e789763ecbda21922266eb`; 2654 source bytes.

Lines 28–41; byte offsets [1148, 1687); 539 bytes; span SHA256 `70ab2d730e6ffcc53a957ccc7caaa1a1aec3c1bfd439494012715de244f252b1`.

```ts
export const Info = Schema.Struct({
  id: ID,
  /** Display label; the id stays the address. */
  name: Schema.String.pipe(optional),
  engine: Schema.Literals(["orchestra", "claude-code"]).pipe(optional),
  model: Model.Ref.pipe(optional),
  request: Provider.Request,
  system: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  hidden: Schema.Boolean,
  color: Color.pipe(optional),
  avatar: Avatar.pipe(optional),
  steps: PositiveInt.pipe(optional),
```

Lines 55–65; byte offsets [2213, 2654); 441 bytes; span SHA256 `fa3b5c8261bcab6de504597217ab4253bbfd1c4ff324af3e43ee6a017e64e4fa`.

```ts
  /** The pinned engine set the agent's commands run with: the backend toolkit or the research toolkit. */
  toolkit: Schema.Literals(["backend", "research"]).pipe(optional),
  permissions: Permission.Ruleset,
})
  .annotate({ identifier: "AgentV2.Info" })
  .pipe(
    statics((schema) => ({
      empty: (id: ID) =>
        schema.make({ id, request: { headers: {}, body: {} }, mode: "all", hidden: false, permissions: [] }),
    })),
  )
```

## Q003 — packages/schema/src/behavior.ts

Stable behavior ID and ordered project instruction replacement.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7209e235841eed521f721c61423b297fa0e18bd7`; full-source SHA256 `bf9bdbd85d7365262fd1781f114a74d5add66685907cd297a28168503eb98890`; 935 source bytes.

Lines 5–22; byte offsets [73, 935); 862 bytes; span SHA256 `7c8f9b38d2db0ceef23e40d85418933d899a3c8c16515d01f3f9438eac58793f`.

```ts
// Lowercase so each behavior can name its own System Context source.
export const ID = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/)).annotate({
  description: "Stable behavior identifier: lowercase letters, digits, dots, underscores and hyphens.",
})

/** One model instruction a client applies to every Session of a project. */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  name: Schema.NonEmptyString,
  instructions: Schema.NonEmptyString,
}).annotate({ identifier: "Behavior.Info" })

export interface SetInput extends Schema.Schema.Type<typeof SetInput> {}
export const SetInput = Schema.Struct({
  /** The complete set, in order. An empty list removes every behavior from the project. */
  behaviors: Schema.Array(Info),
}).annotate({ identifier: "Behavior.SetInput" })
```

## Q004 — packages/schema/src/command.ts

Command template/catalog shape, not a command executor.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2bdf3a95c501408ecca807a9b315c79c121216b7`; full-source SHA256 `b12f94549d912d81a91c6209a285ef37ec1897fe204d162d0372724d857c32aa`; 497 source bytes.

Lines 8–15; byte offsets [204, 497); 293 bytes; span SHA256 `51590ddbd094e810d330cb511d01d68f1b156a3abf973532978058cdddd3bee3`.

```ts
export const Info = Schema.Struct({
  name: Schema.String,
  template: Schema.String,
  description: Schema.String.pipe(optional),
  agent: Schema.String.pipe(optional),
  model: Model.Ref.pipe(optional),
  subtask: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "CommandV2.Info" })
```

## Q005 — packages/schema/src/llm.ts

Provider metadata and text/file tool-content union.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `44101dd87671745c56151d74417a9e6ba6ade97d`; full-source SHA256 `2fe451dc9d1c854d6aeaa64a61a25df3d1c4886de36ac3217a04f99a8d14a527`; 1091 source bytes.

Lines 6–28; byte offsets [99, 1091); 992 bytes; span SHA256 `19beaaf037b0025a217f96cc90ec84ec59a536605277a4b2e840447fdfe9eb28`.

```ts
export const ProviderMetadata = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)).annotate({
  identifier: "LLM.ProviderMetadata",
})
export type ProviderMetadata = Schema.Schema.Type<typeof ProviderMetadata>

export interface ToolTextContent extends Schema.Schema.Type<typeof ToolTextContent> {}
export const ToolTextContent = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
}).annotate({ identifier: "Tool.TextContent" })

export interface ToolFileContent extends Schema.Schema.Type<typeof ToolFileContent> {}
export const ToolFileContent = Schema.Struct({
  type: Schema.Literal("file"),
  uri: Schema.String,
  mime: Schema.String,
  name: optional(Schema.String),
}).annotate({ identifier: "Tool.FileContent" })

export const ToolContent = Schema.Union([ToolTextContent, ToolFileContent])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "LLM.ToolContent" })
export type ToolContent = Schema.Schema.Type<typeof ToolContent>
```

## Q006 — packages/schema/src/prompt-context.ts

Host-owned reminders explicitly do not override permissions/tools.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b763d2d57ae72b3c0cb76b3aedc962026fc7472c`; full-source SHA256 `69688305977b38a3e717bbbbb602a60f544da7a9ead0fa70843cb2b4f3fed5fd`; 374 source bytes.

Lines 5–9; byte offsets [84, 374); 290 bytes; span SHA256 `69aa450031ac19d7dc3d96fc753cdd4db82fb81f4d20731747fb0fdf2a6f188c`.

```ts
/** Host-owned, ordered rendered reminders. Neutral text, never permission or tool overrides. */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  reminders: Schema.Array(Schema.String),
}).annotate({ identifier: "PromptContext.Info" })
```

## Q007 — packages/schema/src/skill.ts

Skill metadata/save revision intent and local/URL/embedded source identity.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6289f4503125ae14390871cc26bed114012f6b33`; full-source SHA256 `0e808d17b84e5435dcdf6e89ef41a6f9830f158772212d2dcf154b5e63de46b5`; 2822 source bytes.

Lines 20–42; byte offsets [676, 1720); 1044 bytes; span SHA256 `0a9f51e51050e1f19b1d1eb11547156e45dbe979cd04ecee2fff587460000997`.

```ts
export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.String.pipe(optional),
  slash: Schema.Boolean.pipe(optional),
  /** Set by `internal: true` in the frontmatter: the skill is for agents only, so user-facing pickers leave it out. */
  internal: Schema.Boolean.pipe(optional),
  location: AbsolutePath,
  content: Schema.String,
  /** Last modification time (ms) of the skill file, for optimistic concurrency on save. */
  mtime: Schema.Finite.pipe(optional),
}).annotate({ identifier: "SkillV2.Info" })

export interface SaveInput extends Schema.Schema.Type<typeof SaveInput> {}
export const SaveInput = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  content: Schema.String,
  /** Location of the registered skill to rewrite. Omit to create a project skill. */
  path: AbsolutePath.pipe(optional),
  /** The `mtime` read from the catalog; a save fails with a conflict when the file changed since. */
  mtime: Schema.Finite.pipe(optional),
}).annotate({ identifier: "SkillV2.SaveInput" })
```

Lines 44–70; byte offsets [1805, 2822); 1017 bytes; span SHA256 `6c61603c2dbfb7db44ee6020e93896a3d1c9b0f7e7c4c93b168a7e52219e929d`.

```ts
export const EmbeddedSource = Schema.Struct({
  type: Schema.Literal("embedded"),
  skill: Schema.suspend(() => Info),
}).annotate({ identifier: "SkillV2.EmbeddedSource" })

export type Source = DirectorySource | UrlSource | EmbeddedSource
export const Source = Object.assign(
  Schema.Union([DirectorySource, UrlSource, EmbeddedSource]).pipe(
    Schema.toTaggedUnion("type"),
    Schema.annotate({ identifier: "SkillV2.Source" }),
  ),
  {
    equals: (a: Source, b: Source) => {
      if (a.type !== b.type) return false
      if (a.type === "directory" && b.type === "directory") return a.path === b.path
      if (a.type === "url" && b.type === "url") return a.url === b.url
      if (a.type === "embedded" && b.type === "embedded") return a.skill.name === b.skill.name
      return false
    },
    key: (source: Source) =>
      source.type === "directory"
        ? `directory:${source.path}`
        : source.type === "url"
          ? `url:${source.url}`
          : `embedded:${source.skill.name}`,
  },
)
```

## Q008 — packages/schema/src/session-subagent-models.ts

Delegated provider/model allowlist or inherited policy.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8f233c6e13ea9bc37a13a5bb29ea17983eb6862c`; full-source SHA256 `60f09a057cae28c883bf0f32f65cec0809c92d8305f59fe78c07cb5dfecfd9ae`; 624 source bytes.

Lines 6–15; byte offsets [133, 624); 491 bytes; span SHA256 `dbfae21facf6fc06ca929955e4e616aff3fd5f074bf034e61cfd8579636a3376`.

```ts
// The policy constrains delegated provider/model identities, not reasoning variants or the parent's own turns.
export const Policy = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("inherit") }),
  Schema.Struct({ mode: Schema.Literal("allowlist"), models: Schema.Array(Model.Ref) }),
])
  .pipe(Schema.toTaggedUnion("mode"))
  .annotate({ identifier: "Session.SubagentModels.Policy" })
export type Policy = typeof Policy.Type

export const inherit = Policy.make({ mode: "inherit" })
```

## Q009 — packages/schema/src/permission.ts

Request/reply plus modern and historical Session permission shapes.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `17e4e4060b246d488c16cad4404a4bed956d8457`; full-source SHA256 `21d4bd4fae0f63d6c254b85160a5dbe2e9f5d136a7460ed715f57adc9fcffb43`; 2906 source bytes.

Lines 28–40; byte offsets [828, 1338); 510 bytes; span SHA256 `73edde76c148576c6fd4899d6d43b8cfd0b98141b78f73abcc56c59dc55b8ad1`.

```ts
  resources: Schema.Array(Schema.String),
  save: Schema.Array(Schema.String).pipe(optional),
  metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(optional),
  source: Source.pipe(optional),
}

export const Request = Schema.Struct({
  id: ID,
  ...RequestFields,
}).annotate({ identifier: "PermissionV2.Request" })
export interface Request extends Schema.Schema.Type<typeof Request> {}

export const Reply = Schema.Literals(["once", "always", "reject"]).annotate({ identifier: "PermissionV2.Reply" })
```

Lines 54–78; byte offsets [1677, 2906); 1229 bytes; span SHA256 `14d8980acaaa6cc708ca5bbe9b36c67a228b8e593b7d0e03eeb6bd581a1c8c01`.

```ts
export const Effect = Schema.Literals(["allow", "deny", "ask"]).annotate({ identifier: "PermissionV2.Effect" })
export type Effect = typeof Effect.Type

export interface Rule extends Schema.Schema.Type<typeof Rule> {}
export const Rule = Schema.Struct({
  action: Schema.String,
  resource: Schema.String,
  effect: Effect,
}).annotate({ identifier: "PermissionV2.Rule" })

export const Ruleset = Schema.Array(Rule).annotate({ identifier: "PermissionV2.Ruleset" })
export type Ruleset = typeof Ruleset.Type

// A Session's stored permission overrides keep their original `{ permission, pattern, action }` shape; the identifiers
// stay the public names generated clients already use.
export const SessionAction = Schema.Literals(["allow", "deny", "ask"]).annotate({ identifier: "PermissionAction" })
export type SessionAction = typeof SessionAction.Type

export const SessionRule = Schema.Struct({ permission: Schema.String, pattern: Schema.String, action: SessionAction }).annotate({
  identifier: "PermissionRule",
})
export type SessionRule = typeof SessionRule.Type

export const SessionRuleset = Schema.Array(SessionRule).annotate({ identifier: "PermissionRuleset" })
export type SessionRuleset = typeof SessionRuleset.Type
```

## Q010 — packages/schema/src/permission-saved.ts

Saved project/action/resource permission record.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `969a6dc25cad87bff7309ad7444f5c997ad0913b`; full-source SHA256 `58cd2074b989e82b8060e71614abdd83f2e7db3779c68709b05a8780deebbd6b`; 633 source bytes.

Lines 14–20; byte offsets [394, 633); 239 bytes; span SHA256 `737744085502ff596628cd806a5bbf6415133fd6609d9bcb519430cf2f0d5508`.

```ts
export const Info = Schema.Struct({
  id: ID,
  projectID: ProjectID,
  action: Schema.String,
  resource: Schema.String,
}).annotate({ identifier: "PermissionSaved.Info" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
```

## Q011 — packages/schema/src/question.ts

Session request identity and ordered answer payload.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aba5ebfbaf275cfb715cc0ef4b07623e165e4fe0`; full-source SHA256 `7eb21fc310e3325445eb988b95f21e0b14f8715ba6426cb94c484a5e70eb5913`; 3142 source bytes.

Lines 46–68; byte offsets [1743, 2686); 943 bytes; span SHA256 `c363c27bbda681f7042b84acde8047aba8ce0821c00236ff9420a04eb54ec10a`.

```ts
export const Tool = Schema.Struct({
  messageID: Schema.String,
  callID: Schema.String,
}).annotate({ identifier: "QuestionV2.Tool" })
export interface Tool extends Schema.Schema.Type<typeof Tool> {}

export const Request = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  questions: Schema.Array(Info).annotate({ description: "Questions to ask" }),
  tool: Tool.pipe(optional),
}).annotate({ identifier: "QuestionV2.Request" })
export interface Request extends Schema.Schema.Type<typeof Request> {}

export const Answer = Schema.Array(Schema.String).annotate({ identifier: "QuestionV2.Answer" })
export type Answer = typeof Answer.Type

export const Reply = Schema.Struct({
  answers: Schema.Array(Answer).annotate({
    description: "User answers in order of questions (each answer is an array of selected labels)",
  }),
}).annotate({ identifier: "QuestionV2.Reply" })
export interface Reply extends Schema.Schema.Type<typeof Reply> {}
```

## Q012 — packages/schema/src/revert.ts

Revert anchor and optional snapshot/diff/file list.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `05222d539819ee243c17cb4fd03e8ee6a1eeab69`; full-source SHA256 `145a30ba642db86d826e6309d0b0d66c3ec7ba04e891170d228b6cd1b340a47a`; 880 source bytes.

Lines 17–24; byte offsets [532, 880); 348 bytes; span SHA256 `1277a1dc14b98258d6928be46ec6a616d6724f75ba03d3dc31d59b0e71d310e8`.

```ts
export const State = Schema.Struct({
  messageID: SessionMessage.ID,
  partID: Schema.String.pipe(optional),
  snapshot: Schema.String.pipe(optional),
  diff: Schema.String.pipe(optional),
  files: Schema.Array(FileDiff).pipe(optional),
}).annotate({ identifier: "Revert.State" })
export interface State extends Schema.Schema.Type<typeof State> {}
```

## Q013 — packages/schema/src/session-activity.ts

Activity projection with period, timestamps and truncated status.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `acf49caf59b4553975536c74901855163ad08961`; full-source SHA256 `e9048f045b803a4a9f1fcd8de2e87a39ecc5287b7265be64dc0b7ba8dfb7de76`; 1932 source bytes.

Lines 3–7; byte offsets [55, 248); 193 bytes; span SHA256 `d5146d189a65f30b06e27a75682ac1b769bac9c9d52f36489cc0e30067eb4777`.

```ts
// Recorded activity of a project's Sessions over a period, as the home dashboard reads it.

import { Schema } from "effect"

export const Period = Schema.Literals(["7d", "30d", "90d", "all"])
```

Lines 33–47; byte offsets [1048, 1932); 884 bytes; span SHA256 `1da1678e1bfa9dfca66ee59cee96541050fdb448bf383d0432c76d19c412dd92`.

```ts
export const Activity = Schema.Struct({
  period: Period,
  edges: Schema.Array(Schema.Finite).annotate({
    description: "Ascending bucket boundaries at server-local midnights; bucket i is [edges[i], edges[i + 1])",
  }),
  days: Schema.Array(Schema.String).annotate({ description: "Server-local YYYY-MM-DD of each edge" }),
  previous: Schema.Boolean.annotate({ description: "True when bucket 0 is the equal window before the period" }),
  activeMs: Schema.Array(Schema.Finite).annotate({
    description: "Per bucket, wall clock during which any root-session assistant turn was running",
  }),
  sessions: Schema.Array(ActivitySession),
  facts: Schema.Array(Fact),
  truncated: Schema.Boolean.annotate({ description: "True when more than 200000 messages were in range" }),
}).annotate({ identifier: "SessionActivity" })
export type Activity = Schema.Schema.Type<typeof Activity>
```

## Q014 — packages/schema/src/session-compaction-event.ts

session.compacted notification.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ed1169ea6757ee981fc425219b2e82442db7c8b0`; full-source SHA256 `068bfba573c403c25442eec7ba816883f62e313099717943f2c1992822659d78`; 314 source bytes.

Lines 6–13; byte offsets [144, 314); 170 bytes; span SHA256 `c8ef839487562652867c1db3cfbc8cd52435ce6103ba939d197accb8714c3321`.

```ts
export const Compacted = Event.define({
  type: "session.compacted",
  schema: {
    sessionID: SessionID,
  },
})

export const Definitions = Event.inventory(Compacted)
```

## Q015 — packages/schema/src/session-todo.ts

Todo fields use String status/priority and publish session-linked updates.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7f6a72bf000617eb14ee8bedebd9dc0800260510`; full-source SHA256 `7b6e41ea6760ce94f5e817a574bf071608ad7e38639dcb520974d3e4de9aa1e0`; 821 source bytes.

Lines 7–25; byte offsets [165, 821); 656 bytes; span SHA256 `ec74f8083114e61f48187a8610f6137f87e90f198468cd10e44e474f13a9ad64`.

```ts
export const Info = Schema.Struct({
  content: Schema.String.annotate({ description: "Brief description of the task" }),
  status: Schema.String.annotate({
    description: "Current status of the task: pending, in_progress, completed, cancelled",
  }),
  priority: Schema.String.annotate({
    description: "Priority level of the task: high, medium, low",
  }),
}).annotate({ identifier: "Todo" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

const Updated = define({
  type: "todo.updated",
  schema: {
    sessionID: SessionID,
    todos: Schema.Array(Info),
  },
})
export const Event = { Updated, Definitions: inventory(Updated) }
```

## Q016 — packages/schema/src/identifier.ts

Ascending/descending identifier construction with timestamp/counter/random input.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9812a673fb06d00a262de2a6dba6d674ecd52365`; full-source SHA256 `3eeb8c682210921b6dac49f0d785d9088a48503c4539d590f5c3b0e848d78b27`; 838 source bytes.

Lines 1–30; byte offsets [0, 838); 838 bytes; span SHA256 `3eeb8c682210921b6dac49f0d785d9088a48503c4539d590f5c3b0e848d78b27`.

```ts
const length = 26
const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
let lastTimestamp = 0
let counter = 0

export function ascending() {
  return create(false)
}

export function descending() {
  return create(true)
}

export function create(descending: boolean, timestamp = Date.now()) {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp
    counter = 0
  }
  counter++

  const current = BigInt(timestamp) * 0x1000n + BigInt(counter)
  const value = descending ? ~current : current
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("")
  const bytes = crypto.getRandomValues(new Uint8Array(length - 12))
  return time + Array.from(bytes, (byte) => chars[byte % 62]).join("")
}
```

## Q017 — packages/schema/src/project-id.ts

Project brand and global sentinel.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8d2f061517475e03cad1259e33af5576b174dbc6`; full-source SHA256 `47aad330577133240b3c33938363fa980d32cd00de9564b8fccdcad05c110e7d`; 251 source bytes.

Lines 1–8; byte offsets [0, 251); 251 bytes; span SHA256 `47aad330577133240b3c33938363fa980d32cd00de9564b8fccdcad05c110e7d`.

```ts
import { Schema } from "effect"
import { statics } from "./schema"

export const ProjectID = Schema.String.pipe(
  Schema.brand("Project.ID"),
  statics((schema) => ({ global: schema.make("global") })),
)
export type ProjectID = typeof ProjectID.Type
```

## Q018 — packages/schema/src/workspace-id.ts

Workspace prefix validator and constructor.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e43e9673f6395fae50aa7f8fc1e727d2af8b7fb4`; full-source SHA256 `8756530476173c3888135b3ac76bb14069d61c3d4074464f2a307a0d078d19c9`; 594 source bytes.

Lines 5–19; byte offsets [109, 594); 485 bytes; span SHA256 `c0740b72e4a82d3dca63cea60380f1ef6b13c64ea911fdc008661253966c4f29`.

```ts
export const WorkspaceID = Schema.String.check(Schema.isStartsWith("wrk")).pipe(
  Schema.brand("WorkspaceV2.ID"),
  statics((schema) => {
    const create = () => schema.make("wrk_" + ascending())
    return {
      ascending: (id?: string) => {
        if (!id) return create()
        if (!id.startsWith("wrk")) throw new Error(`ID ${id} does not start with wrk`)
        return schema.make(id)
      },
      create,
    }
  }),
)
export type WorkspaceID = typeof WorkspaceID.Type
```

## Q019 — packages/schema/src/workspace.ts

Workspace identity/event facade.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ce35bf3b245234f33d9322ec0d9b8fd4acfd803e`; full-source SHA256 `a21abd037393a1a7b6f5d7c24629eef97e720582f79ac9b36b2ed80e18ef02c3`; 235 source bytes.

Lines 1–9; byte offsets [0, 235); 235 bytes; span SHA256 `a21abd037393a1a7b6f5d7c24629eef97e720582f79ac9b36b2ed80e18ef02c3`.

```ts
export * as Workspace from "./workspace"

import { WorkspaceEvent } from "./workspace-event"
import { WorkspaceID } from "./workspace-id"

export const ID = WorkspaceID
export type ID = WorkspaceID

export const Event = WorkspaceEvent
```

## Q020 — packages/schema/src/project.ts

Repository project Info and project.updated event.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7e73530a6d5624127c9086d3b6e783ca8072461b`; full-source SHA256 `d12577c05384e8415203a81ff3041246497cdb158427e06158dc134d271dfb97`; 1619 source bytes.

Lines 31–44; byte offsets [1135, 1619); 484 bytes; span SHA256 `e9674657478d02e25f982e111e25ebf5d1d054d96c1f86735cd2e64d944a60e2`.

```ts
export const Info = Schema.Struct({
  id: ID,
  worktree: Schema.String,
  vcs: optional(Vcs),
  name: optional(Schema.String),
  icon: optional(Icon),
  commands: optional(Commands),
  time: Time,
  sandboxes: Schema.Array(Schema.String),
}).annotate({ identifier: "Project" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

const Updated = define({ type: "project.updated", schema: Info.fields })
export const Event = { Updated, Definitions: inventory(Updated) }
```

## Q021 — packages/schema/src/project-directories.ts

Project directory invalidation.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e6cbde86499bcc38afa52c55f5381ce337d110b9`; full-source SHA256 `c89b1c2017873d66d2c744ef6234ac4a2d89e49308e99576652bdf96b27df496`; 312 source bytes.

Lines 1–10; byte offsets [0, 312); 312 bytes; span SHA256 `c89b1c2017873d66d2c744ef6234ac4a2d89e49308e99576652bdf96b27df496`.

```ts
export * as ProjectDirectories from "./project-directories"

import { define, inventory } from "./event"
import { Project } from "./project"

const Updated = define({
  type: "project.directories.updated",
  schema: { projectID: Project.ID },
})
export const Event = { Updated, Definitions: inventory(Updated) }
```

## Q022 — packages/schema/src/project-copy.ts

Named strategy with create/remove copy context.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `850b87bcb35654013ad247ebf0fe0c0b03943739`; full-source SHA256 `d77bbd07f3974a5b2e77a3fff7bd2613b4613e0ca7ab3ed91c5f2073d1156856`; 1113 source bytes.

Lines 8–30; byte offsets [197, 1113); 916 bytes; span SHA256 `f63519a1ffd1d91bdc423306ebf7b6d624bca8244229e2c2210a343901261c32`.

```ts
export const StrategyID = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()), Schema.brand("ProjectCopy.StrategyID"))
export type StrategyID = typeof StrategyID.Type

export const CreateInput = Schema.Struct({
  projectID: ProjectID,
  strategy: StrategyID,
  sourceDirectory: AbsolutePath,
  directory: AbsolutePath,
  name: optional(Schema.String),
}).annotate({ identifier: "ProjectCopy.CreateInput" })
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const RemoveInput = Schema.Struct({
  projectID: ProjectID,
  directory: AbsolutePath,
  force: Schema.Boolean,
}).annotate({ identifier: "ProjectCopy.RemoveInput" })
export interface RemoveInput extends Schema.Schema.Type<typeof RemoveInput> {}

export const Copy = Schema.Struct({
  directory: AbsolutePath,
}).annotate({ identifier: "ProjectCopy.Copy" })
export interface Copy extends Schema.Schema.Type<typeof Copy> {}
```

## Q023 — packages/schema/src/workspace-event.ts

Workspace ready/failed/connectivity status events.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `82e15e077190630ba023e6a16907ccc4555e2e6c`; full-source SHA256 `f9ef09253b0c964ccfa1e0c767a051a40236a120c9418056b58dfe7645cbba30`; 866 source bytes.

Lines 7–32; byte offsets [163, 866); 703 bytes; span SHA256 `b261beabe1a82406e33158db882909ed14754001c27bab663e9f8b0a166daf83`.

```ts
export const ConnectionStatus = Schema.Struct({
  workspaceID: WorkspaceID,
  status: Schema.Literals(["connected", "connecting", "disconnected", "error"]),
}).annotate({ identifier: "WorkspaceEvent.ConnectionStatus" })
export interface ConnectionStatus extends Schema.Schema.Type<typeof ConnectionStatus> {}

export const Ready = Event.define({
  type: "workspace.ready",
  schema: {
    name: Schema.String,
  },
})

export const Failed = Event.define({
  type: "workspace.failed",
  schema: {
    message: Schema.String,
  },
})

export const Status = Event.define({
  type: "workspace.status",
  schema: ConnectionStatus.fields,
})

export const Definitions = Event.inventory(Ready, Failed, Status)
```

## Q024 — packages/schema/src/worktree-event.ts

Worktree ready/failed notifications.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c42ea5821e1325a08fba6d00c62f9651f99adb58`; full-source SHA256 `c225902e262ec6e9a7dbf10d1191d134d9163153a6eea85d3b1c95e38e3c544b`; 468 source bytes.

Lines 7–22; byte offsets [152, 468); 316 bytes; span SHA256 `2906b438452c5b0c38f5984e94bdd8c00bbc122506f177ec00792cf1be60eaa5`.

```ts
export const Ready = Event.define({
  type: "worktree.ready",
  schema: {
    name: Schema.String,
    branch: optional(Schema.String),
  },
})

export const Failed = Event.define({
  type: "worktree.failed",
  schema: {
    message: Schema.String,
  },
})

export const Definitions = Event.inventory(Ready, Failed)
```

## Q025 — packages/schema/src/file-diff.ts

File delta counts/status and optional patch.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `45226df28ee3f809b2bd5aa2daa289ca2d565eb6`; full-source SHA256 `a55485c32b27c93c1dba5a523c33748394207759dbe1460e98066b639b0c842b`; 453 source bytes.

Lines 6–13; byte offsets [110, 453); 343 bytes; span SHA256 `7269c2542328e0a7380d22c72aec1b67aea9fbb6c8194bf22424187fc3d5143c`.

```ts
export const Info = Schema.Struct({
  file: optional(Schema.String),
  patch: optional(Schema.String),
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: optional(Schema.Literals(["added", "deleted", "modified"])),
}).annotate({ identifier: "SnapshotFileDiff" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
```

## Q026 — packages/schema/src/filesystem-watcher.ts

Watcher add/change/unlink notification.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5e4da777cae846e639f0288e48996acf43ae71ec`; full-source SHA256 `60e6e5d4836f867ba0514bf13843a7d3ba17ef243826f151deb48a74034183d8`; 361 source bytes.

Lines 1–13; byte offsets [0, 361); 361 bytes; span SHA256 `60e6e5d4836f867ba0514bf13843a7d3ba17ef243826f151deb48a74034183d8`.

```ts
export * as FileSystemWatcher from "./filesystem-watcher"

import { Schema } from "effect"
import { define, inventory } from "./event"

const Updated = define({
  type: "file.watcher.updated",
  schema: {
    file: Schema.String,
    event: Schema.Literals(["add", "change", "unlink"]),
  },
})
export const Event = { Updated, Definitions: inventory(Updated) }
```

## Q027 — packages/schema/src/filesystem.ts

Relative file/directory entry and search match DTOs.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1998c1b9fd688f93f81201cdec8fa8d860d8ed87`; full-source SHA256 `c6972ac22f347c2ac25e56250e77a8d17d44d2a353d6a1680cca2c1bbca364d3`; 1323 source bytes.

Lines 15–40; byte offsets [443, 1323); 880 bytes; span SHA256 `e5603d52f9a6fa4e7fd5a6db5bfb363f6360bce02dda076ebfc568c3890c6a08`.

```ts
export const Entry = Schema.Struct({
  path: RelativePath,
  type: Schema.Literals(["file", "directory"]),
}).annotate({ identifier: "FileSystem.Entry" })

export interface Submatch extends Schema.Schema.Type<typeof Submatch> {}
export const Submatch = Schema.Struct({
  text: Schema.String,
  start: NonNegativeInt,
  end: NonNegativeInt,
}).annotate({ identifier: "FileSystem.Submatch" })

export interface Match extends Schema.Schema.Type<typeof Match> {}
export const Match = Schema.Struct({
  entry: Entry,
  line: PositiveInt,
  offset: NonNegativeInt,
  text: Schema.String,
  submatches: Schema.Array(Submatch),
}).annotate({ identifier: "FileSystem.Match" })

export class FindInput extends Schema.Class<FindInput>("FileSystem.FindInput")({
  query: Schema.String,
  type: Schema.Literals(["file", "directory"]).pipe(optional),
  limit: PositiveInt.pipe(optional),
}) {}
```

## Q028 — packages/schema/src/vcs.ts

Branch/diff/apply/activity responses; no Git operation.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d1955f25a4e504ade467921f39b479fd2044881a`; full-source SHA256 `16ab2066e433f2b36f2931fcf4be859e50f8c6e1ca9d6960f2ca42b81c81bc58`; 3279 source bytes.

Lines 3–15; byte offsets [30, 521); 491 bytes; span SHA256 `2a1645f9810082cd8893fcfb505a00102a4cb238949a8033d0ea5142d71fbec5`.

```ts
// The version-control answers the server gives about a working directory: its branch, changed files, diffs and commit
// activity.

import { Schema } from "effect"

export const Mode = Schema.Literals(["git", "branch"])
export type Mode = Schema.Schema.Type<typeof Mode>

export const Info = Schema.Struct({
  branch: Schema.optional(Schema.String),
  default_branch: Schema.optional(Schema.String),
}).annotate({ identifier: "VcsInfo" })
export type Info = Schema.Schema.Type<typeof Info>
```

Lines 37–50; byte offsets [1363, 1717); 354 bytes; span SHA256 `c14fc05814ef0357b9f8df858804e15865dd17838317dd4e918b7c39fb047740`.

```ts
export const ApplyInput = Schema.Struct({
  patch: Schema.String,
})
export type ApplyInput = Schema.Schema.Type<typeof ApplyInput>

export const ApplyResult = Schema.Struct({
  applied: Schema.Boolean,
})
export type ApplyResult = Schema.Schema.Type<typeof ApplyResult>

export type ActivityInput = {
  readonly since: number
  readonly until: number
}
```

Lines 80–96; byte offsets [2585, 3279); 694 bytes; span SHA256 `484fcb693305a0c10b8a10d6ff61658d27dab79d00855167cd3d45fce2200c71`.

```ts
export const Activity = Schema.Struct({
  repository: Schema.Boolean,
  since: Schema.Finite,
  until: Schema.Finite,
  totals: ActivityTotals,
  days: Schema.Array(ActivityDay),
  topPaths: Schema.Array(ActivityPath),
  recent: Schema.Array(ActivityCommit),
  ahead: Schema.NullOr(Schema.Finite),
  behind: Schema.NullOr(Schema.Finite),
  truncated: Schema.Boolean.annotate({ description: "True when a commit, output or time bound cut any scan short" }),
  partial: Schema.Struct({
    commits: Schema.Boolean,
    lines: Schema.Boolean,
  }).annotate({ identifier: "VcsActivityPartial" }),
}).annotate({ identifier: "VcsActivity" })
export type Activity = Schema.Schema.Type<typeof Activity>
```

## Q029 — packages/schema/src/vcs-event.ts

Branch change notification.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1c0d720dc4bea65255037b339a143c5bc050b06f`; full-source SHA256 `8473a92a20bd47063c4335f2c13e6c0be8273b2777ca99d6c3b887d2588651af`; 332 source bytes.

Lines 7–14; byte offsets [142, 332); 190 bytes; span SHA256 `8e10619b2eb2d22187cc123b2012f139aa2cea10623870215fea04ac3aefc67e`.

```ts
export const BranchUpdated = Event.define({
  type: "vcs.branch.updated",
  schema: {
    branch: optional(Schema.String),
  },
})

export const Definitions = Event.inventory(BranchUpdated)
```

## Q030 — packages/schema/src/reference.ts

Local absolute-path or Git repository/branch reference source.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `84b623a2742f9de3ea1cea82342e6f32b10cb532`; full-source SHA256 `74ce167e60cbd14c318640a2bba84d9a2dbeb3c75991745b228880f19a890bd7`; 1407 source bytes.

Lines 12–39; byte offsets [407, 1407); 1000 bytes; span SHA256 `0f7a97b9e9196b7f4c95053a1b119587b5a29e1c78fca387b5adfd91ecff9e58`.

```ts
export const LocalSource = Schema.Struct({
  type: Schema.Literal("local"),
  path: AbsolutePath,
  description: Schema.String.pipe(optional),
  hidden: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "Reference.LocalSource" })

export interface GitSource extends Schema.Schema.Type<typeof GitSource> {}
export const GitSource = Schema.Struct({
  type: Schema.Literal("git"),
  repository: Schema.String,
  branch: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  hidden: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "Reference.GitSource" })

export const Source = Schema.Union([LocalSource, GitSource])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Reference.Source" })
export type Source = typeof Source.Type

export class Info extends Schema.Class<Info>("Reference.Info")({
  name: Schema.String,
  path: AbsolutePath,
  description: Schema.String.pipe(optional),
  hidden: Schema.Boolean.pipe(optional),
  source: Source,
}) {}
```

## Q031 — packages/schema/src/pull-request.ts

Host-CLI remote PR contract with typed refusal kinds.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a5c8a3fe10572520b9769a5c7ccd1547063fdd33`; full-source SHA256 `77dfc18af22bcd70c8f5fc15add1a209f37b205bf7440270013ffb8657c403a9`; 3172 source bytes.

Lines 6–8; byte offsets [116, 384); 268 bytes; span SHA256 `b918c6e765617097dec2e1efd43229bfee150218374c799bfcc422d2a89e0970`.

```ts
// Pull requests on the repository's GitHub or GitLab remote, read and opened through the host CLI
// (gh or glab) that the user already signed in to on the server.
export const Host = Schema.Literals(["github", "gitlab"]).annotate({ identifier: "PullRequest.Host" })
```

Lines 32–56; byte offsets [1194, 2135); 941 bytes; span SHA256 `150387c58df465eb68f99c4a6dc137b82b0c25102c7b8200adc8887562599075`.

```ts
export const CreateInput = Schema.Struct({
  title: Schema.Trim.pipe(Schema.check(Schema.isNonEmpty())),
  body: Schema.String,
  base: Schema.Trim.pipe(Schema.check(Schema.isNonEmpty())),
  // Defaults to the branch checked out in the repository.
  head: optional(Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))),
}).annotate({ identifier: "PullRequest.CreateInput" })
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const Created = Schema.Struct({
  host: Host,
  repository: Schema.String,
  number: Schema.Int,
  url: Schema.String,
}).annotate({ identifier: "PullRequest.Created" })
export interface Created extends Schema.Schema.Type<typeof Created> {}

export const ErrorKind = Schema.Literals([
  "not_installed",
  "not_authenticated",
  "no_remote",
  "branch_not_pushed",
  "cli_failed",
]).annotate({ identifier: "PullRequest.ErrorKind" })
export type ErrorKind = typeof ErrorKind.Type
```

## Q032 — packages/schema/src/pty.ts

PTY process Info, lifecycle events and create/update inputs.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `269364bded85901e4c30b79da012f19d31d68f31`; full-source SHA256 `bd5898f125d058bfa934f14bb255022099b9654e6b10e5efaa767fcd34d94b7e`; 2161 source bytes.

Lines 22–38; byte offsets [632, 1421); 789 bytes; span SHA256 `580c8935665ba2043d76ae12fbf694bfd6515dd83917e40bc6b47bfa86cb03cf`.

```ts
export const Info = Schema.Struct({
  id: ID,
  title: Schema.String,
  command: Schema.String,
  args: Schema.Array(Schema.String),
  cwd: Schema.String,
  status: Schema.Literals(["running", "exited"]),
  pid: NonNegativeInt,
  exitCode: optional(NonNegativeInt),
}).annotate({ identifier: "Pty" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

const Created = define({ type: "pty.created", schema: { info: Info } })
const Updated = define({ type: "pty.updated", schema: { info: Info } })
const Exited = define({ type: "pty.exited", schema: { id: ID, exitCode: NonNegativeInt } })
const Deleted = define({ type: "pty.deleted", schema: { id: ID } })
export const Event = { Created, Updated, Exited, Deleted, Definitions: inventory(Created, Updated, Exited, Deleted) }
```

Lines 40–61; byte offsets [1422, 2161); 739 bytes; span SHA256 `088ad6f92edd9a6c95c36aa8ac00dcab3540e94e163c03eba404f9119bad278a`.

```ts
export const CreateInput = Schema.Struct({
  command: optional(Schema.String),
  args: optional(Schema.Array(Schema.String)),
  cwd: optional(Schema.String),
  title: optional(Schema.String),
  env: optional(Schema.Record(Schema.String, Schema.String)),
  // The terminal's size at creation; the server clamps both sides to 1..32767.
  cols: optional(PositiveInt),
  rows: optional(PositiveInt),
})
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const UpdateInput = Schema.Struct({
  title: optional(Schema.String),
  size: optional(
    Schema.Struct({
      rows: PositiveInt,
      cols: PositiveInt,
    }),
  ),
})
export interface UpdateInput extends Schema.Schema.Type<typeof UpdateInput> {}
```

## Q033 — packages/schema/src/pty-ticket.ts

Connection ticket and expiry DTO; no authorization logic.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9b258575a902bd62826e5f30214d236cfa36e8b5`; full-source SHA256 `189a6e91a7bc12ba4ccb1355b2aba8673f0fbf4fca1da62264fe799c0bca97ee`; 346 source bytes.

Lines 6–10; byte offsets [115, 346); 231 bytes; span SHA256 `248d92c1665a19c1fffab3f711cf88138e5e78ae119cdcf39138bd08c157bedd`.

```ts
export const ConnectToken = Schema.Struct({
  ticket: Schema.String,
  expires_in: PositiveInt,
}).annotate({ identifier: "PtyTicket.ConnectToken" })
export interface ConnectToken extends Schema.Schema.Type<typeof ConnectToken> {}
```

## Q034 — packages/schema/src/provider.ts

AISDK/Native API distinction and request/info shape.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `51ff4b37913d568e9c59aef54e64041d9db14de8`; full-source SHA256 `f72afc446470bd4ac6fadce7f880539590604052c3cb003f39a415f2adcc1834`; 2352 source bytes.

Lines 27–43; byte offsets [839, 1507); 668 bytes; span SHA256 `f98ee713325e1bedebfe4d8d5983fd004e841593028710665cf65b40641ab7bc`.

```ts
export const AISDK = Schema.Struct({
  type: Schema.Literal("aisdk"),
  package: Schema.String,
  url: Schema.String.pipe(optional),
  settings: Schema.Record(Schema.String, Schema.Unknown).pipe(optional),
}).annotate({ identifier: "Provider.AISDK" })

export interface Native extends Schema.Schema.Type<typeof Native> {}
export const Native = Schema.Struct({
  type: Schema.Literal("native"),
  url: Schema.String.pipe(optional),
  settings: Schema.Record(Schema.String, Schema.Unknown),
}).annotate({ identifier: "Provider.Native" })

export const Api = Schema.Union([AISDK, Native])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Provider.Api" })
```

Lines 47–66; byte offsets [1613, 2212); 599 bytes; span SHA256 `82f7b67220d8d4baeae202baf5c47d5caf2bf5d86d045eb83babbfa04c5dbecf`.

```ts
export const Request = Schema.Struct({
  headers: Schema.Record(Schema.String, Schema.String),
  body: Schema.Record(Schema.String, Schema.Json),
}).annotate({ identifier: "Provider.Request" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  integrationID: Integration.ID.pipe(optional),
  name: Schema.String,
  disabled: Schema.Boolean.pipe(optional),
  api: Api,
  request: Request,
})
  .annotate({ identifier: "ProviderV2.Info" })
  .pipe(
    statics((schema) => ({
      empty: (id: ID) =>
        schema.make({
          id,
```

## Q035 — packages/schema/src/credential.ts

OAuth/API-key secret-bearing value representation.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e54e2f680b7b3179a28996078d670def3012c3dd`; full-source SHA256 `141f051d45fbb49d08b72154d5ddc4d398b87f18b106b948e67fa05a72e4bef6`; 1263 source bytes.

Lines 16–35; byte offsets [512, 1263); 751 bytes; span SHA256 `927235d2bc9138a487a2bd17023c520b65c47415f26ca379cf9fcaca6768b5ee`.

```ts
export const OAuth = Schema.Struct({
  type: Schema.Literal("oauth"),
  methodID: IntegrationMethodID,
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({ identifier: "Credential.OAuth" })

export interface Key extends Schema.Schema.Type<typeof Key> {}
export const Key = Schema.Struct({
  type: Schema.Literal("key"),
  key: Schema.String,
  metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({ identifier: "Credential.Key" })

export const Value = Schema.Union([OAuth, Key])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Credential.Value" })
export type Value = Schema.Schema.Type<typeof Value>
```

## Q036 — packages/schema/src/integration-id.ts

Integration and method identity brands.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2590dfe9f691c0410a419326e03587e554e6ac88`; full-source SHA256 `7f905d10763d397041dc8112e1761a27b8ebd976b0dc0a38ecfeb3dec84b5294`; 326 source bytes.

Lines 1–7; byte offsets [0, 326); 326 bytes; span SHA256 `7f905d10763d397041dc8112e1761a27b8ebd976b0dc0a38ecfeb3dec84b5294`.

```ts
import { Schema } from "effect"

export const IntegrationID = Schema.String.pipe(Schema.brand("Integration.ID"))
export type IntegrationID = typeof IntegrationID.Type

export const IntegrationMethodID = Schema.String.pipe(Schema.brand("Integration.MethodID"))
export type IntegrationMethodID = typeof IntegrationMethodID.Type
```

## Q037 — packages/schema/src/integration.ts

Authentication method/attempt lifecycle DTOs.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a7db6b20885bba9a3d72cfd3da3e9938f0656968`; full-source SHA256 `e11e093e3b692f2bcbcfd6cbdbe10e5cc99e4f7f1a5a1a828bfc76a54a476dad`; 4597 source bytes.

Lines 52–78; byte offsets [1710, 2849); 1139 bytes; span SHA256 `9f326f68a9f0661e0b31e5e817f3663e7024377ea86c47f852f3457d806f5d4f`.

```ts
export const OAuthMethod = Schema.Struct({
  id: MethodID,
  type: Schema.Literal("oauth"),
  label: Schema.String,
  prompts: optional(Schema.Array(Prompt)),
}).annotate({ identifier: "Integration.OAuthMethod" })

export interface KeyMethod extends Schema.Schema.Type<typeof KeyMethod> {}
export const KeyMethod = Schema.Struct({
  type: Schema.Literal("key"),
  label: optional(Schema.String),
  /** Values asked before the key; their answers are stored as the credential's metadata. */
  prompts: optional(Schema.Array(Prompt)),
}).annotate({ identifier: "Integration.KeyMethod" })

export interface EnvMethod extends Schema.Schema.Type<typeof EnvMethod> {}
export const EnvMethod = Schema.Struct({
  type: Schema.Literal("env"),
  names: Schema.Array(Schema.String),
}).annotate({ identifier: "Integration.EnvMethod" })

export const Method = Schema.Union([OAuthMethod, KeyMethod, EnvMethod])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Integration.Method" })
export type Method = typeof Method.Type

export const Inputs = Schema.Record(Schema.String, Schema.String).annotate({ identifier: "Integration.Inputs" })
```

Lines 109–131; byte offsets [3758, 4597); 839 bytes; span SHA256 `c91996e7039fc1eaed30514cf5f26b7da8603958b680e98eaf792168bf50170e`.

```ts

const AttemptTime = Schema.Struct({
  created: Schema.Number,
  expires: Schema.Number,
})

export class Attempt extends Schema.Class<Attempt>("Integration.Attempt")({
  attemptID: AttemptID,
  url: Schema.String,
  instructions: Schema.String,
  mode: Schema.Literals(["auto", "code"]),
  time: AttemptTime,
}) {}

export const AttemptStatus = Schema.Union([
  Schema.Struct({ status: Schema.Literal("pending"), time: AttemptTime }),
  Schema.Struct({ status: Schema.Literal("complete"), time: AttemptTime }),
  Schema.Struct({ status: Schema.Literal("failed"), message: Schema.String, time: AttemptTime }),
  Schema.Struct({ status: Schema.Literal("expired"), time: AttemptTime }),
])
  .pipe(Schema.toTaggedUnion("status"))
  .annotate({ identifier: "Integration.AttemptStatus" })
export type AttemptStatus = typeof AttemptStatus.Type
```

## Q038 — packages/schema/src/connection.ts

Safe credential-reference/environment-name projection.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2bacb977a870b5515d4745b16e3748c7b4d79e93`; full-source SHA256 `37d3914dab08b851c9c5a0c0dd7e1a3c77ab6224a8802a0a00fbb178565ecaab`; 787 source bytes.

Lines 7–22; byte offsets [204, 787); 583 bytes; span SHA256 `2bfef5330ba393c4a78c91d80d142dfcee090607678e9ee390ca9af9bbadfb5c`.

```ts
export const CredentialInfo = Schema.Struct({
  type: Schema.Literal("credential"),
  id: Credential.ID,
  label: Schema.String,
}).annotate({ identifier: "Connection.CredentialInfo" })

export interface EnvInfo extends Schema.Schema.Type<typeof EnvInfo> {}
export const EnvInfo = Schema.Struct({
  type: Schema.Literal("env"),
  name: Schema.String,
}).annotate({ identifier: "Connection.EnvInfo" })

export const Info = Schema.Union([CredentialInfo, EnvInfo])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Connection.Info" })
export type Info = typeof Info.Type
```

## Q039 — packages/schema/src/catalog.ts

Catalog invalidation event.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `54abb5b1280b8e119173d6503e29fee25e49940e`; full-source SHA256 `4dd398e781bd2bc9df86c02e7fcca429d16906c30cdea3d08a54842c220213eb`; 213 source bytes.

Lines 1–6; byte offsets [0, 213); 213 bytes; span SHA256 `4dd398e781bd2bc9df86c02e7fcca429d16906c30cdea3d08a54842c220213eb`.

```ts
export * as Catalog from "./catalog"

import { define, inventory } from "./event"

const Updated = define({ type: "catalog.updated", schema: {} })
export const Event = { Updated, Definitions: inventory(Updated) }
```

## Q040 — packages/schema/src/models-dev.ts

Models catalog refresh event.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4432bc4591ec656439ecd148300ccbb2bd0becd5`; full-source SHA256 `fc63c12f2ae068ffb32a233cf554af7e942725e0dfa77236fe497b8dde76adbd`; 234 source bytes.

Lines 1–9; byte offsets [0, 234); 234 bytes; span SHA256 `fc63c12f2ae068ffb32a233cf554af7e942725e0dfa77236fe497b8dde76adbd`.

```ts
export * as ModelsDev from "./models-dev"

import { define, inventory } from "./event"

const Refreshed = define({
  type: "models-dev.refreshed",
  schema: {},
})
export const Event = { Refreshed, Definitions: inventory(Refreshed) }
```

## Q041 — packages/schema/src/config-mcp.ts

Local versus remote MCP config with optional auth/timeouts.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5ef3ad45be47a75d78c7ef9c68b0f3ab34c7dfcb`; full-source SHA256 `b9b3ad22fb2f1bd41c5aa6de956e97178b2e5adb0e6b130bf1a188096ca1c6af`; 2067 source bytes.

Lines 6–48; byte offsets [115, 2067); 1952 bytes; span SHA256 `8d6e511282bc8c76f1a36e1a246720a8239298c41dbe55e0f0424d9a62f7056d`.

```ts
export class Timeout extends Schema.Class<Timeout>("ConfigV2.MCP.Timeout")({
  startup: PositiveInt.pipe(Schema.optional).annotate({
    description: "Maximum time in milliseconds to establish and initialize the MCP server.",
  }),
  request: PositiveInt.pipe(Schema.optional).annotate({
    description: "Maximum time in milliseconds to wait for each MCP request after initialization.",
  }),
}) {}

export class Local extends Schema.Class<Local>("ConfigV2.MCP.Local")({
  type: Schema.Literal("local"),
  command: Schema.String.pipe(Schema.Array),
  cwd: Schema.String.pipe(Schema.optional).annotate({
    description: "Working directory for the MCP server process. Relative paths resolve from the workspace directory.",
  }),
  environment: Schema.Record(Schema.String, Schema.String).pipe(Schema.optional),
  disabled: Schema.Boolean.pipe(Schema.optional),
  timeout: Timeout.pipe(Schema.optional),
}) {}

export class OAuth extends Schema.Class<OAuth>("ConfigV2.MCP.OAuth")({
  client_id: Schema.String.pipe(Schema.optional),
  client_secret: Schema.String.pipe(Schema.optional),
  scope: Schema.String.pipe(Schema.optional),
  callback_port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })).pipe(Schema.optional),
  redirect_uri: Schema.String.pipe(Schema.optional),
}) {}

export class Remote extends Schema.Class<Remote>("ConfigV2.MCP.Remote")({
  type: Schema.Literal("remote"),
  url: Schema.String,
  headers: Schema.Record(Schema.String, Schema.String).pipe(Schema.optional),
  oauth: Schema.Union([OAuth, Schema.Literal(false)]).pipe(Schema.optional),
  disabled: Schema.Boolean.pipe(Schema.optional),
  timeout: Timeout.pipe(Schema.optional),
}) {}

export const Server = Schema.Union([Local, Remote]).pipe(Schema.toTaggedUnion("type"))

export class Info extends Schema.Class<Info>("ConfigV2.MCP")({
  timeout: Timeout.pipe(Schema.optional),
  servers: Schema.Record(Schema.String, Server).pipe(Schema.optional),
}) {}
```

## Q042 — packages/schema/src/mcp.ts

MCP connection-state union, debug intent and endpoint-only Entry.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `bef08e6425d75218a6359c0c499ab7cb190dadf8`; full-source SHA256 `4570efac1d90606a3d3df17348041e13faecf78396d2fbfb942b7e6fe393a3fa`; 4396 source bytes.

Lines 6–35; byte offsets [99, 1401); 1302 bytes; span SHA256 `f0cdb62fe1d70d9725be9ee69a0ee431a14dacfd6a23ff511c6ef70199875e20`.

```ts
// Connection state of one configured MCP server, as reported to clients.
const StatusConnected = Schema.Struct({ status: Schema.Literal("connected") }).annotate({
  identifier: "MCPStatusConnected",
})
const StatusDisabled = Schema.Struct({ status: Schema.Literal("disabled") }).annotate({
  identifier: "MCPStatusDisabled",
})
const StatusFailed = Schema.Struct({ status: Schema.Literal("failed"), error: Schema.String }).annotate({
  identifier: "MCPStatusFailed",
})
const StatusNeedsAuth = Schema.Struct({ status: Schema.Literal("needs_auth") }).annotate({
  identifier: "MCPStatusNeedsAuth",
})
const StatusNeedsClientRegistration = Schema.Struct({
  status: Schema.Literal("needs_client_registration"),
  error: Schema.String,
}).annotate({ identifier: "MCPStatusNeedsClientRegistration" })

export const Status = Schema.Union([
  StatusConnected,
  StatusDisabled,
  StatusFailed,
  StatusNeedsAuth,
  StatusNeedsClientRegistration,
]).annotate({ identifier: "MCPStatus", discriminator: "status" })
export type Status = Schema.Schema.Type<typeof Status>

// One configured MCP server of a Location and its connection state.
export const Server = Schema.Struct({ name: Schema.String, status: Status }).annotate({ identifier: "McpServer" })
export type Server = Schema.Schema.Type<typeof Server>
```

Lines 69–75; byte offsets [2739, 3074); 335 bytes; span SHA256 `abf6e403ef0e5a50ddd86c3e7f1d7564d6e598df17f553926803766241f2a6a7`.

```ts
// What a remote server's debug probe saw: stored sign-in state, the answer to an unauthenticated initialize request,
// and, when that answer was 401, how the OAuth discovery went. Secrets are masked.
export const Debug = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
  oauth: Schema.Boolean,
  tokens: Schema.Struct({
```

Lines 100–106; byte offsets [3993, 4396); 403 bytes; span SHA256 `0d04d9adcf10830d341fa1e154bcb5656c85b52c65ea8bb86a10b0d2fc745bf0`.

```ts
// What the MCP page shows of one server's config: its transport and endpoint only, never headers, environment or OAuth.
export interface Entry extends Schema.Schema.Type<typeof Entry> {}
export const Entry = Schema.Struct({
  type: optional(Schema.Literals(["local", "remote"])),
  command: optional(Schema.Array(Schema.String)),
  url: optional(Schema.String),
}).annotate({ identifier: "McpEntry" })
```

## Q043 — packages/schema/src/mcp-event.ts

MCP tools/status/browser failure notifications.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4cdf2a29a859779944ec1698016738dc29e82bb8`; full-source SHA256 `17c983ad6c701bad096db8123e8e309c3a488bd58b8667a0454cf6a07a463ba2`; 595 source bytes.

Lines 6–28; byte offsets [106, 595); 489 bytes; span SHA256 `f2ddb078876c06fe539d51e80303d4cba62b1d316aa4155d117d24a70bc16bea`.

```ts
export const ToolsChanged = Event.define({
  type: "mcp.tools.changed",
  schema: {
    server: Schema.String,
  },
})

export const StatusChanged = Event.define({
  type: "mcp.status.changed",
  schema: {
    server: Schema.String,
  },
})

export const BrowserOpenFailed = Event.define({
  type: "mcp.browser.open.failed",
  schema: {
    mcpName: Schema.String,
    url: Schema.String,
  },
})

export const Definitions = Event.inventory(ToolsChanged, StatusChanged, BrowserOpenFailed)
```

## Q044 — packages/schema/src/lsp.ts

Language server root/name and connected/error status.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8aaa0b33b04c37f18dec6f0f3f4cf37cebdc3358`; full-source SHA256 `4916e2ca1bce6b4b4ad78aca908fdd18d39dd6f2e19cba6f4a986cac01c1cbfa`; 301 source bytes.

Lines 5–12; byte offsets [63, 301); 238 bytes; span SHA256 `96937101423f21878c7c7d13b6d29bfbf23e98e7f873ff67ff3a54f04279c84a`.

```ts
export const Status = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  root: Schema.String,
  status: Schema.Literals(["connected", "error"]),
}).annotate({ identifier: "LSPStatus" })

export type Status = typeof Status.Type
```

## Q045 — packages/schema/src/lsp-event.ts

LSP invalidation notification.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b6908469663afaba35adca0e94f468c1b530a9aa`; full-source SHA256 `ae7b29bb4d79ad13f5be53d43bdfcca87b32156caefab05bdb66e4fb9fd57fea`; 200 source bytes.

Lines 5–7; byte offsets [74, 200); 126 bytes; span SHA256 `44a89882f9f2b90a73a7bdabc32406df45315a3677c586d9dc0cfa8c36464b77`.

```ts
export const Updated = Event.define({ type: "lsp.updated", schema: {} })

export const Definitions = Event.inventory(Updated)
```

## Q046 — packages/schema/src/formatter.ts

Formatter enabled/extensions status.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `21bac081022f90f7304307665daf2c9b021a06b9`; full-source SHA256 `164190a5fcad45f47b010690e46ab672243b653c6f5e03f755db2f9c130e0e84`; 294 source bytes.

Lines 5–11; byte offsets [75, 294); 219 bytes; span SHA256 `e9fc980c84d91190961b80711f47703fd6aef2fcf31c37f6e48bc992a43d773a`.

```ts
export const Status = Schema.Struct({
  name: Schema.String,
  extensions: Schema.Array(Schema.String),
  enabled: Schema.Boolean,
}).annotate({ identifier: "FormatterStatus" })

export type Status = typeof Status.Type
```

## Q047 — packages/schema/src/actions.ts

Actions six-module public barrel.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3b9c5cc47c6e043e9e5d6f013a8201c4258abe0b`; full-source SHA256 `ff0507ebbb63a8a1ab74bc11187cb70bd19d51ed2ec8cb741eaf0155d03f6b07`; 1071 source bytes.

Lines 1–18; byte offsets [0, 1071); 1071 bytes; span SHA256 `ff0507ebbb63a8a1ab74bc11187cb70bd19d51ed2ec8cb741eaf0155d03f6b07`.

```ts
export * as Actions from "./actions"

export {
  Binding, BindingID, BindingInput, BindingRef, Capability, ErrorData, ErrorKind,
  OperationID, Policy, PolicyState, Provider, ProviderKind, SendDisposition,
} from "./actions/identity"
export { Graph, GraphJob, GraphStep, InputDefinition, ListInput, Source, SourceBase, Workflow, WorkflowPage } from "./actions/workflow"
export { Job, JobPage, Run, RunListInput, RunPage, Step } from "./actions/run"
export { Resource, ResourceKind, ResourceListInput, ResourcePage, TransferInfo, TransferInput } from "./actions/resource"
export {
  ExecuteInput, Operation, OperationAcknowledgement, OperationExpected, OperationIntent,
  OperationKind, OperationObservation, OperationTarget,
} from "./actions/operation"
export {
  CommandExecution, CommandOutput, DispatchCommand, GitHubCommand, GitHubDispatch, GitLabCommand,
  GitLabDispatch, JobPlayCommand, JobRetryCommand, MergeRequestCommand, ProviderCommand, RenameCommand,
  ResourceCommand, RetryCommand, TriggerPipelineCommand, WorkflowStateCommand,
} from "./actions/command"
```

## Q048 — packages/schema/src/actions/identity.ts

Binding revision/reference and closed refusal/send-disposition vocabulary.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `273b77520f81c755f62979b9609f45917e72e062`; full-source SHA256 `1d3361dd26b49e366b7c59d14a589f6684a16b36bfec0b761e62481fc15f6f14`; 4175 source bytes.

Lines 36–51; byte offsets [1498, 2148); 650 bytes; span SHA256 `743a91933f12f8459af69935ee01c0e0ae20d6482a8c0681b8ee41c5e601e16d`.

```ts
export const Binding = Schema.Struct({
  id: BindingID,
  revision: PositiveInt,
  remote: Schema.NonEmptyString,
  provider: Provider,
  projectID: Schema.NonEmptyString,
  projectPath: Schema.NonEmptyString,
  account: optional(Schema.String),
  directory: Schema.NonEmptyString,
  workspaceID: optional(Schema.String),
}).annotate({ identifier: "Actions.Binding" })
export interface Binding extends Schema.Schema.Type<typeof Binding> {}

export const BindingRef = Schema.Struct({ id: BindingID, revision: PositiveInt })
  .annotate({ identifier: "Actions.BindingRef" })
export interface BindingRef extends Schema.Schema.Type<typeof BindingRef> {}
```

Lines 62–85; byte offsets [2520, 3732); 1212 bytes; span SHA256 `7b6fc2070a54974604c4f616792acb1fdd21aa1c7387233f508b5530c0821e5a`.

```ts
export const ErrorKind = Schema.Literals([
  "binding_missing", "binding_stale", "host_mismatch", "cli_missing", "not_authenticated",
  "permission_denied", "capability_unavailable", "not_found", "invalid_input", "source_conflict",
  "source_unresolved", "rate_limited", "metadata_truncated", "transport_failed", "transfer_failed",
  "outcome_unknown", "operation_missing", "operation_expired", "operation_reused", "intent_conflict",
  "maintenance_required",
]).annotate({ identifier: "Actions.ErrorKind" })
export type ErrorKind = typeof ErrorKind.Type

export const SendDisposition = Schema.Literals(["definitely_unsent", "definitely_rejected", "unknown"])
  .annotate({ identifier: "Actions.SendDisposition" })
export type SendDisposition = typeof SendDisposition.Type

export const ErrorData = Schema.Struct({
  kind: ErrorKind,
  message: Schema.String,
  bindingID: optional(BindingID),
  provider: optional(ProviderKind),
  resourceID: optional(Schema.String),
  retryAfter: optional(Schema.Number),
  operationID: optional(OperationID),
  disposition: optional(SendDisposition),
}).annotate({ identifier: "Actions.ErrorData" })
export interface ErrorData extends Schema.Schema.Type<typeof ErrorData> {}
```

## Q049 — packages/schema/src/actions/operation.ts

Prepared identity/preconditions and distinct execution payload.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `da7b1bdfb6bd5f7dd8fd368adb5eb5402c37c6fe`; full-source SHA256 `6ad34b7a3cbc4eb4c1ce500f6f665894c0a7792d4d12177cdd1e055592812f0f`; 3857 source bytes.

Lines 17–45; byte offsets [985, 2309); 1324 bytes; span SHA256 `4e494651dd662b1bbbb7065d48fe91e7347a575b78510061825fb104f7975ffd`.

```ts
// Admission stores identity and optimistic preconditions, never a mutation's values.
export const OperationTarget = Schema.Struct({
  workflowID: optional(Schema.NonEmptyString),
  runID: optional(Schema.NonEmptyString),
  jobID: optional(Schema.NonEmptyString),
  resourceID: optional(Schema.NonEmptyString),
  resourceKind: optional(ResourceKind),
  scope: optional(Schema.String),
  path: optional(Schema.NonEmptyString),
  ref: optional(Schema.NonEmptyString),
}).annotate({ identifier: "Actions.OperationTarget" })
export interface OperationTarget extends Schema.Schema.Type<typeof OperationTarget> {}

export const OperationExpected = Schema.Struct({
  sourceVersion: optional(Schema.NonEmptyString),
  commit: optional(Schema.NonEmptyString),
  attempt: optional(PositiveInt),
  resourceVersion: optional(Schema.NonEmptyString),
}).annotate({ identifier: "Actions.OperationExpected" })
export interface OperationExpected extends Schema.Schema.Type<typeof OperationExpected> {}

export const OperationIntent = Schema.Struct({
  clientID: Schema.NonEmptyString,
  binding: BindingRef,
  kind: OperationKind,
  target: OperationTarget,
  expected: optional(OperationExpected),
}).annotate({ identifier: "Actions.OperationIntent" })
export interface OperationIntent extends Schema.Schema.Type<typeof OperationIntent> {}
```

Lines 62–79; byte offsets [3072, 3857); 785 bytes; span SHA256 `8c31bfae7259108406901d2aa5311cde6020882b1561b2659e3eb051c2561ebb`.

```ts
export const Operation = Schema.Struct({
  id: OperationID,
  bindingID: BindingID,
  clientID: Schema.String,
  kind: OperationKind,
  state: Schema.Literals(["prepared", "sending", "accepted", "confirmed", "rejected", "outcome_unknown", "expired"]),
  target: OperationTarget,
  createdAt: Schema.Number,
  expiresAt: Schema.Number,
  updatedAt: Schema.Number,
  result: optional(OperationAcknowledgement),
  reason: optional(Schema.String),
}).annotate({ identifier: "Actions.Operation" })
export interface Operation extends Schema.Schema.Type<typeof Operation> {}

export const ExecuteInput = Schema.Struct({ id: OperationID, input: Schema.Json })
  .annotate({ identifier: "Actions.ExecuteInput" })
export interface ExecuteInput extends Schema.Schema.Type<typeof ExecuteInput> {}
```

## Q050 — packages/schema/src/actions/resource.ts

Resource metadata/redaction ownership and transfer contract.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1346f69568a3796c88a55ed9d06ed4cc762aa93b`; full-source SHA256 `5579f778bc5055f362058bf0e9386e6098af2f2cba3700ef68de1381aab6f576`; 2429 source bytes.

Lines 11–23; byte offsets [459, 980); 521 bytes; span SHA256 `7d31f2ddc5bb933a9a68d61f9b8fa8ebd914fe4e86da2eaf1bb36d88f7864012`.

```ts
export const Resource = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  kind: ResourceKind,
  name: Schema.String,
  scope: optional(Schema.String),
  owner: optional(Schema.String),
  status: optional(Schema.String),
  sensitive: optional(Schema.Boolean),
  // Provider details are JSON, not unrestricted runtime values. Adapters redact sensitive fields.
  data: Schema.Json,
}).annotate({ identifier: "Actions.Resource" })
export interface Resource extends Schema.Schema.Type<typeof Resource> {}
```

Lines 42–57; byte offsets [1742, 2429); 687 bytes; span SHA256 `50e7accaa402d5c135575beb5e809823e67a355022f1b04f65fe7481e7ed4b75`.

```ts
export const TransferInput = Schema.Struct({
  kind: Schema.Literals(["jobLog", "runLog", "artifact", "secureFile"]),
  id: Schema.NonEmptyString,
  runID: optional(Schema.String),
  attempt: optional(PositiveInt),
  path: optional(Schema.String),
}).annotate({ identifier: "Actions.TransferInput" })
export interface TransferInput extends Schema.Schema.Type<typeof TransferInput> {}

export const TransferInfo = Schema.Struct({
  filename: Schema.String,
  contentType: Schema.String,
  size: optional(Schema.Number),
  digest: optional(Schema.String),
}).annotate({ identifier: "Actions.TransferInfo" })
export interface TransferInfo extends Schema.Schema.Type<typeof TransferInfo> {}
```

## Q051 — packages/schema/src/actions/command.ts

Strict provider commands and request-only secret-bearing output.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `763fc67220a5a5962794593062f4705840e7598b`; full-source SHA256 `46722d7902f6005986f3e2c372675e3f9e047e2dbe639e404146f151e1de3d85`; 5060 source bytes.

Lines 7–22; byte offsets [226, 1210); 984 bytes; span SHA256 `6c48c5a3d37d78630d252935ebf7c2c612fb204041e743ed51fb2b84f9477439`.

```ts
const strict = { onExcessProperty: "error" } as const
const Variables = Schema.Array(Schema.Struct({
  key: Schema.NonEmptyString, value: Schema.String,
  variable_type: optional(Schema.Literals(["env_var", "file"])),
}).annotate({ parseOptions: strict }))

export const GitHubDispatch = Schema.Struct({
  provider: Schema.Literal("github"), ref: Schema.NonEmptyString,
  inputs: optional(Schema.Record(Schema.String, Value)),
}).annotate({ identifier: "Actions.GitHubDispatch", parseOptions: strict })
export const GitLabDispatch = Schema.Struct({
  provider: Schema.Literal("gitlab"), ref: Schema.NonEmptyString,
  variables: optional(Variables), inputs: optional(Schema.Record(Schema.String, Schema.Json)),
}).annotate({ identifier: "Actions.GitLabDispatch", parseOptions: strict })
export const DispatchCommand = Schema.Struct({ id: OperationID, input: Schema.Union([GitHubDispatch, GitLabDispatch]) })
  .annotate({ identifier: "Actions.DispatchCommand", parseOptions: strict })
```

Lines 55–68; byte offsets [3877, 5060); 1183 bytes; span SHA256 `394031181e22cf11e83103d22b739214d8c52dbae86c824124fa7183fcbb1d5c`.

```ts
// These values are returned only to the owning request, never put in an operation row.
export const CommandOutput = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("runnerToken"), token: Schema.NonEmptyString, expiresAt: optional(Schema.String), runnerID: optional(Schema.String) }),
  Schema.Struct({ kind: Schema.Literal("runnerJit"), encodedConfiguration: Schema.NonEmptyString, runnerID: Schema.NonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("triggerToken"), token: Schema.NonEmptyString, triggerID: Schema.NonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("sourceReview"), id: Schema.NonEmptyString, url: Schema.NonEmptyString }),
]).annotate({ identifier: "Actions.CommandOutput" })
export type CommandOutput = typeof CommandOutput.Type
export const CommandExecution = Schema.Struct({ operation: Operation, output: optional(CommandOutput) })
  .annotate({ identifier: "Actions.CommandExecution" })
export interface CommandExecution extends Schema.Schema.Type<typeof CommandExecution> {}

export const ResourceCommand = Schema.Struct({ id: OperationID, input: Schema.Json })
  .annotate({ identifier: "Actions.ResourceCommand", parseOptions: strict })
```

## Q052 — packages/schema/src/actions/run.ts

Provider run/job state projections and pagination.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `830d6f13f362e0616160da6219f3eba8a9ab83df`; full-source SHA256 `c91ac0507e4f4f304cea12b4681aea4f658aec6aa7fca9af478e0f38613267f8`; 3593 source bytes.

Lines 5–29; byte offsets [122, 1050); 928 bytes; span SHA256 `12ef81a98c5d051731444d2ab7d184d178dbba0b5196e7dfd7dbb356cab329cc`.

```ts
export const Run = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  workflowID: Schema.NonEmptyString,
  name: Schema.NullOr(Schema.String),
  title: optional(Schema.String),
  number: optional(PositiveInt),
  ref: Schema.NullOr(Schema.String),
  commit: Schema.String,
  event: Schema.String,
  actor: optional(Schema.String),
  status: Schema.NullOr(Schema.String),
  conclusion: optional(Schema.NullOr(Schema.String)),
  attempt: optional(PositiveInt),
  createdAt: optional(Schema.String),
  startedAt: optional(Schema.String),
  finishedAt: optional(Schema.String),
  updatedAt: optional(Schema.String),
  triggeringActor: optional(Schema.String),
  repositoryID: optional(Schema.String),
  duration: optional(Schema.Number),
  parentID: optional(Schema.String),
  url: optional(Schema.String),
}).annotate({ identifier: "Actions.Run" })
export interface Run extends Schema.Schema.Type<typeof Run> {}
```

Lines 76–84; byte offsets [3042, 3593); 551 bytes; span SHA256 `15668d60151c697f7c0073c397272d37160809dcc3bb7b5a7950fbfa0e3f3ecc`.

```ts
export const RunPage = Schema.Struct({
  items: Schema.Array(Run), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.RunPage" })
export interface RunPage extends Schema.Schema.Type<typeof RunPage> {}

export const JobPage = Schema.Struct({
  items: Schema.Array(Job), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.JobPage" })
export interface JobPage extends Schema.Schema.Type<typeof JobPage> {}
```

## Q053 — packages/schema/src/actions/workflow.ts

Workflow/source binding and partial/unresolved graph states.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a061e32b53f984a7e103e836fdfac97e5f6e98ce`; full-source SHA256 `435abb6cb694c30d00c01bb0c00c8dd9cd821df163fe8c73cb30a4f09ad18321`; 3925 source bytes.

Lines 15–48; byte offsets [642, 2018); 1376 bytes; span SHA256 `88a5cdf49594bab8dbfcccecf674d1e2143fbb659a91a1e7a3e87cd6408641fb`.

```ts
export const Workflow = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  name: Schema.NullOr(Schema.String),
  path: Schema.String,
  defaultRef: optional(Schema.NonEmptyString),
  state: Schema.String,
  dispatchable: Schema.Boolean,
  dispatchState: optional(Schema.Literals(["available", "unavailable", "unknown"])),
  inputs: optional(Schema.Array(InputDefinition)),
  triggers: optional(Schema.Array(Schema.String)),
  updatedAt: optional(Schema.String),
}).annotate({ identifier: "Actions.Workflow" })
export interface Workflow extends Schema.Schema.Type<typeof Workflow> {}

export const SourceBase = Schema.Struct({
  bindingID: BindingID,
  ref: Schema.NonEmptyString,
  commit: Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)),
}).annotate({ identifier: "Actions.SourceBase" })
export interface SourceBase extends Schema.Schema.Type<typeof SourceBase> {}

export const Source = Schema.Struct({
  bindingID: BindingID,
  path: Schema.NonEmptyString,
  ref: Schema.NonEmptyString,
  commit: optional(Schema.String),
  version: Schema.NonEmptyString,
  text: Schema.String,
  editable: Schema.Boolean,
  includes: optional(Schema.Array(Schema.String)),
  diagnostics: optional(Schema.Array(Schema.String)),
}).annotate({ identifier: "Actions.Source" })
export interface Source extends Schema.Schema.Type<typeof Source> {}
```

Lines 72–83; byte offsets [2812, 3323); 511 bytes; span SHA256 `ca0e236e49c089e5932a50aa0125e3786b5ab2d62241065641d24a4853cd087b`.

```ts
export const Graph = Schema.Struct({
  source: Source,
  state: Schema.Literals(["complete", "partial", "unresolved"]),
  jobs: Schema.Array(GraphJob),
  diagnostics: Schema.Array(Schema.String),
  triggers: optional(Schema.Json),
  stages: optional(Schema.Array(Schema.String)),
  includes: optional(Schema.Json),
  inputs: optional(Schema.Array(InputDefinition)),
  header: optional(Schema.Json),
}).annotate({ identifier: "Actions.Graph" })
export interface Graph extends Schema.Schema.Type<typeof Graph> {}
```

## Q054 — packages/schema/src/capability.ts

Core authority boundary, opaque outcome receipt, symmetric UTF-8 JSON detail limit.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f2d1bf5a52f9995257c296edd4f606e935cac90e`; full-source SHA256 `c21600d2409460dc49b35ba3177154422c45fd0a21018fd81dcd2f64ea58111b`; 8631 source bytes.

Lines 41–48; byte offsets [1819, 2211); 392 bytes; span SHA256 `8deb3b8f712348079baac928f98c7eeffc3b0ebb17dbd1192524cd1d8eef17a6`.

```ts
// References identify data only; trusted authority bindings belong to Core.
export interface ConnectionRef extends Schema.Schema.Type<typeof ConnectionRef> {}
export const ConnectionRef = Schema.Struct({
  id: ConnectionID,
  provider: Schema.NonEmptyString,
  generation: NonNegativeInt,
}).annotate({ identifier: "Capability.ConnectionRef", parseOptions: { onExcessProperty: "error" } })
```

Lines 86–91; byte offsets [3860, 4086); 226 bytes; span SHA256 `877d857b16a9882f4d05383d2f5ea946e9d49d8e9d312502d7200e5f5cf4604f`.

```ts
export const Owner = Schema.Struct({
  projectID: Project.ID,
  location: Location.Ref,
  sessionID: SessionID,
  agentID: Agent.ID,
}).annotate({ identifier: "Capability.Owner", parseOptions: { onExcessProperty: "error" } })
```

Lines 105–119; byte offsets [4354, 5045); 691 bytes; span SHA256 `92dd9530b4951cf340418d5d73b9b3b321f11ed8689a8e952b4cdba32106c241`.

```ts
export const Verification = Schema.Literals(["acknowledged", "observed", "verified"]).annotate({
  identifier: "Capability.Verification",
})
export type Verification = typeof Verification.Type

// Receipt is a stable opaque reference, not a complete execution receipt.
const Outcome = { receipt: Schema.NonEmptyString, summary: Schema.String }

export interface Completed extends Schema.Schema.Type<typeof Completed> {}
export const Completed = Schema.Struct({
  ...Outcome,
  status: Schema.Literal("completed"),
  artifactRefs: Schema.Array(ArtifactRef),
  verification: Verification,
}).annotate({ identifier: "Capability.Result.Completed", parseOptions: { onExcessProperty: "error" } })
```

Lines 145–155; byte offsets [6119, 6588); 469 bytes; span SHA256 `ac39a83de71c7b0d488b0b90baebadc2aa8228143ec090a8a7db54bacd3f2a71`.

```ts
export const Unknown = Schema.Struct({
  ...Outcome,
  status: Schema.Literal("unknown"),
  reconciliationRef: optional(Schema.NonEmptyString),
}).annotate({ identifier: "Capability.Result.Unknown", parseOptions: { onExcessProperty: "error" } })

export const Result = Schema.Union([Completed, Submitted, Pending, Partial, Unknown]).annotate({
  identifier: "Capability.Result",
  parseOptions: { onExcessProperty: "error" },
})
export type Result = typeof Result.Type
```

Lines 175–197; byte offsets [7151, 8167); 1016 bytes; span SHA256 `e453e49d56508b1c9ae51b9473c44e37854ecca7166dfe12ec262253328b9afe`.

```ts
// At most 4 KiB of serialized UTF-8 JSON. Producers must redact provider detail before projection.
const detailBudget = SchemaGetter.checkEffect<Schema.Json>((value) =>
  Effect.succeed(
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= 4096
      ? undefined
      : "Failure detail must not exceed 4096 UTF-8 JSON bytes",
  ),
)
// A real transformation retains validation through authoritative imported clients.
export const FailureDetail = Schema.Json.pipe(
  Schema.decodeTo(Schema.Json, { decode: detailBudget, encode: detailBudget }),
).annotate({ identifier: "Capability.FailureDetail" })
export type FailureDetail = typeof FailureDetail.Type

export class Failure extends Schema.TaggedErrorClass<Failure>()(
  "Capability.Failure",
  Schema.Struct({
    code: ErrorCode,
    message: Schema.String,
    detail: optional(FailureDetail),
  }).annotate({ parseOptions: { onExcessProperty: "error" } }),
  { identifier: "Capability.Failure", parseOptions: { onExcessProperty: "error" } },
) {}
```

## Q055 — packages/schema/src/capability-artifact-management.ts

Operator artifact metadata, cursor/page bounds and share/pin input.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6736a109b67917285ebe44ab80b5f3b2ed16d661`; full-source SHA256 `e2437a4de28ef022fb509a8d5f4da9b6a16b9311707f6a68823b82aff4812fe4`; 1822 source bytes.

Lines 7–32; byte offsets [198, 1822); 1624 bytes; span SHA256 `3be65ff794f3a887900f4d3804ff3e99db4b9207610bd18d8bc3f05e82f8d768`.

```ts
// Operator projection only: owner, producer and user metadata stay host-private.
export interface Artifact extends Schema.Schema.Type<typeof Artifact> {}
export const Artifact = Schema.Struct({
  artifact: Capability.ArtifactRef,
  mime: Schema.String,
  kind: Schema.String,
  hash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/)),
  bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  verification: Capability.Verification,
  timeCreated: Schema.Int,
  pinned: Schema.Boolean,
}).annotate({ identifier: "CapabilityArtifactManagement.Artifact" })

// `<artifactID>:<revision>` of the last returned item; it never names an item the page omitted.
export const ArtifactCursor = Schema.String.check(Schema.isPattern(/^cart_[0-9A-Za-z]{26}:(0|[1-9][0-9]{0,15})(?![\s\S])/))
  .annotate({ identifier: "CapabilityArtifactManagement.ArtifactCursor" })
export const ArtifactQuery = Schema.Struct({ after: Schema.optionalKey(ArtifactCursor),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))) })
export interface ArtifactPage extends Schema.Schema.Type<typeof ArtifactPage> {}
export const ArtifactPage = Schema.Struct({ items: Schema.Array(Artifact), after: Schema.optionalKey(ArtifactCursor),
  coverage: Schema.Literal("live") }).annotate({ identifier: "CapabilityArtifactManagement.ArtifactPage" })

export const ShareInput = Schema.Struct({ targetSessionID: SessionID })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const PinInput = Schema.Struct({ pinned: Schema.Boolean })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
```

## Q056 — packages/schema/src/capability-management.ts

Versioned management refs, live pages, bindings and reused receipts.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8050ce6ede2c120d4f1a6193ec2fe4e702db457c`; full-source SHA256 `41245590c777afab845b7eeda90b03ba3c2d15505c2b225e39dd8ec0ae0123ac`; 3551 source bytes.

Lines 7–24; byte offsets [181, 1781); 1600 bytes; span SHA256 `8e7d368bd39e06b8c54ee6ac16b97bb298dce6444592cdd06d0cde17c05071b8`.

```ts
export const Connection = Schema.Struct({ connection: Capability.ConnectionRef,
  label: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  state: Schema.Literals(["active", "disconnected", "revoked"]), credential: Schema.Literals(["present", "missing"]) })
export const Target = Schema.Struct({ target: Capability.TargetRef })
export const TargetCursor = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{32,2048}(?![\s\S])/))
  .annotate({ identifier: "CapabilityManagement.TargetCursor" })
export const ConnectionPage = Schema.Struct({ items: Schema.Array(Connection),
  after: Schema.optionalKey(Capability.ConnectionID), coverage: Schema.Literal("live") })
export const TargetPage = Schema.Struct({ items: Schema.Array(Target),
  after: Schema.optionalKey(TargetCursor), coverage: Schema.Literal("live") })
export const ConnectionQuery = Schema.Struct({ after: Schema.optionalKey(Capability.ConnectionID),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))) })
export const TargetQuery = Schema.Struct({ after: Schema.optionalKey(TargetCursor),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))) })
export const TargetInput = Schema.Struct({ environment: Schema.NonEmptyString, resource: Schema.Json })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const BindingInput = Schema.Struct({ sessionID: SessionID, actions: Schema.Array(Schema.NonEmptyString)
  .check(Schema.isMinLength(1), Schema.isMaxLength(32)) }).annotate({ parseOptions: { onExcessProperty: "error" } })
```

Lines 35–45; byte offsets [2560, 3551); 991 bytes; span SHA256 `ca52b89ebad7b2ba8c616f4fff029ccf670972d6eeb4f5ab9f9fdcf2d4f7e288`.

```ts
export const RemoveBindingInput = Schema.Struct({ target: Capability.TargetRef, sessionID: SessionID })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const Receipt = Schema.Struct({ requestID: Schema.String, reused: Schema.Boolean, data: Schema.Json })
export interface Binding extends Schema.Schema.Type<typeof Binding> {}
export const Binding = Schema.Struct({ sessionID: SessionID, actions: Schema.Array(Schema.NonEmptyString) })
  .annotate({ identifier: "CapabilityManagement.Binding" })
export interface BindingPage extends Schema.Schema.Type<typeof BindingPage> {}
export const BindingPage = Schema.Struct({ items: Schema.Array(Binding), after: Schema.optionalKey(SessionID),
  coverage: Schema.Literal("current-actor") }).annotate({ identifier: "CapabilityManagement.BindingPage" })
export const BindingQuery = Schema.Struct({ after: Schema.optionalKey(SessionID),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))) })
```

## Q057 — packages/schema/src/capability-schedule-management.ts

Richer schedule cadence plus operator/session projection and manual-run receipt.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4572fecf0427d671d605ea4839640247e898632e`; full-source SHA256 `5193b6097e0a8827df04a6444c5f32fcf45ca7cb454f729ae5ee6157e54c658c`; 3073 source bytes.

Lines 9–20; byte offsets [279, 1256); 977 bytes; span SHA256 `5603f25c96c5ea09e1f999f6de4f0e3f4ce73a02bdb3bfd72a57e93de9bd64aa`.

```ts
// Local wall-clock time in the schedule's IANA time zone.
const Clock = Schema.String.check(Schema.isPattern(/^([01][0-9]|2[0-3]):[0-5][0-9](?![\s\S])/))
// No identifier on Cadence or Schedule: schedule_manage embeds them in its tool schema, which stays inline.
export const Cadence = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("once"), at: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("interval"), minutes: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 525_600 })) }),
  Schema.Struct({ kind: Schema.Literal("daily"), time: Clock }),
  Schema.Struct({ kind: Schema.Literal("weekly"), day: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })), time: Clock }),
  // Five fields: minute hour day-of-month month day-of-week; lists, ranges, steps and `*`; day fields use Vixie OR.
  Schema.Struct({ kind: Schema.Literal("cron"), expression: Schema.String.check(Schema.isMaxLength(256)) }),
])
export type Cadence = typeof Cadence.Type
```

Lines 41–54; byte offsets [1939, 3073); 1134 bytes; span SHA256 `a7b487f8b3b3b3d2489fd89c9069079b155e8bd5e31282e4116a1a358b67179f`.

```ts
// Operator projection: the owning Session and agent seat, never the owner's host placement.
export interface Item extends Schema.Schema.Type<typeof Item> {}
export const Item = Schema.Struct({ schedule: Schedule, sessionID: SessionID, agentID: Agent.ID })
  .annotate({ identifier: "CapabilityScheduleManagement.Item" })
export interface Page extends Schema.Schema.Type<typeof Page> {}
export const Page = Schema.Struct({ items: Schema.Array(Item), coverage: Schema.Literal("live") })
  .annotate({ identifier: "CapabilityScheduleManagement.Page" })
export interface Removed extends Schema.Schema.Type<typeof Removed> {}
export const Removed = Schema.Struct({ id: ScheduledTask.ID, removed: Schema.Literal(true) })
  .annotate({ identifier: "CapabilityScheduleManagement.Removed" })
/** A manual run never moves `next` or counts; `reused` marks a retry of the same idempotency key. */
export interface Started extends Schema.Schema.Type<typeof Started> {}
export const Started = Schema.Struct({ id: ScheduledTask.ID, sessionID: SessionID, reused: Schema.Boolean })
  .annotate({ identifier: "CapabilityScheduleManagement.Started" })
```

## Q058 — packages/schema/src/capability-setup.ts

Key/bearer setup and explicit verified/credential-only outcome.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2aa7562006a006c3f2a2a024167a15c52af83a28`; full-source SHA256 `32d8305b65970de0eaf5f99786ba4a3aeec3a2cc6ae731e6ce9be55aad2e3e3b`; 1596 source bytes.

Lines 7–22; byte offsets [166, 1596); 1430 bytes; span SHA256 `ead3de2525b245875b62f34fd5e48b34c785ba83e5786ff9ad051dc86000582c`.

```ts
// Key/bearer setup only. OAuth-only hosted MCPs (sentry, vercel, grafana, railway, netlify, prisma-postgres) need F05 OAuth.
export const Provider = Schema.Literals(["slack", "discord", "cloudflare", "supabase", "neon", "linear", "stripe",
  "openai", "runway", "globalping"]).annotate({ identifier: "CapabilitySetup.Provider" })
// verified: a fixed identity endpoint returned the account/user the key belongs to.
// credential-only: the provider has no identity endpoint for this key type; only key validity was observed.
export const Verification = Schema.Literals(["verified", "credential-only"]).annotate({ identifier: "CapabilitySetup.Verification" })
export type Provider = typeof Provider.Type
export const Label = Schema.String.check(Schema.isMaxLength(128)).annotate({ identifier: "CapabilitySetup.Label" })
export interface Input extends Schema.Schema.Type<typeof Input> {}
export const Input = Schema.Struct({ provider: Provider,
  key: Schema.NonEmptyString.check(Schema.isMaxLength(4096)), label: optional(Label) })
  .annotate({ identifier: "CapabilitySetup.Input", parseOptions: { onExcessProperty: "error" } }).pipe(Schema.redact)
export interface Result extends Schema.Schema.Type<typeof Result> {}
export type Verification = typeof Verification.Type
export const Result = Schema.Struct({ connection: Capability.ConnectionRef, verification: Verification })
  .annotate({ identifier: "CapabilitySetup.Result" })
```

## Q059 — packages/schema/src/atlas-knowledge.ts

Proposed knowledge target and host anchor with explicit canonical field order.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `264e38436fbf1550dd6228b43caba77e2944ec02`; full-source SHA256 `daffd3f2967e2dea8c68da404c9bbf9ed9d95ef4e3df0f274b4f7580ae9344fe`; 2901 source bytes.

Lines 9–28; byte offsets [291, 1130); 839 bytes; span SHA256 `cf8379f7092c52401c9f2896d37ce7948dbc8c5d00429df22f839f6764d13dfb`.

```ts
export const MAX_UNITS = 8
export const MAX_BYTES = 128 * 1024

export const UnitID = Schema.String.check(
  Schema.isMinLength(1), Schema.isMaxLength(256), Schema.isPattern(/^[^\u0000]+$/),
).annotate({ identifier: "AtlasKnowledge.UnitID" })
export type UnitID = typeof UnitID.Type

export const Reference = Schema.String.check(
  Schema.isMinLength(64), Schema.isMaxLength(64), Schema.isPattern(/^[0-9a-f]{64}$/),
)
  .annotate({ identifier: "AtlasKnowledge.Reference" })
export type Reference = typeof Reference.Type

// A proposed work identity, not a durable Task or execution authorization.
export const Target = Schema.Struct({
  kind: Schema.Literals(["assignment", "work-package"]),
  id: UnitID,
}).annotate({ identifier: "AtlasKnowledge.Target", ...closed })
export interface Target extends Schema.Schema.Type<typeof Target> {}
```

Lines 42–66; byte offsets [1513, 2901); 1388 bytes; span SHA256 `b77594ab1570733a64dbf6dcd6a3838533d71d193d366a75ff2f1eed1e681f95`.

```ts
// Host-produced tool metadata binds Archie's selection to its actual invocation.
export const Anchor = Schema.Struct({
  reference: Reference,
  projectID: ProjectID,
  authorSessionID: SessionID,
  assistantMessageID: SessionMessage.ID,
  callID: Schema.NonEmptyString,
  memberID: Schema.Literal("archie"),
  target: Target,
  units: Schema.Array(Unit).check(Schema.isMinLength(1), Schema.isMaxLength(MAX_UNITS)),
}).annotate({ identifier: "AtlasKnowledge.Anchor", ...closed })
export interface Anchor extends Schema.Schema.Type<typeof Anchor> {}

// The one canonical payload both the host anchor and Relay binding hash. Fields are rebuilt in schema order:
// decoding preserves input property order, which must not choose the digest. Arrays keep Archie's selection order.
export function canonical(anchor: Omit<Anchor, "reference">) {
  return JSON.stringify({
    projectID: anchor.projectID, authorSessionID: anchor.authorSessionID, assistantMessageID: anchor.assistantMessageID,
    callID: anchor.callID, memberID: anchor.memberID, target: { kind: anchor.target.kind, id: anchor.target.id },
    units: anchor.units.map((unit) => ({
      unit: unit.unit, name: unit.name, sourceIdentity: unit.sourceIdentity, sourceRevision: unit.sourceRevision,
      contentHash: unit.contentHash, receiptHash: unit.receiptHash, bodyHash: unit.bodyHash, content: unit.content,
    })),
  })
}
```

## Q060 — packages/schema/src/atlas-review.ts

Atlas review/decision wire forms; not review authority for this campaign.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `55c49f96b1b4d4ad187cef5d056e96a555c90a33`; full-source SHA256 `7f0c69058477f6860f34dc88ef183bc273e337f92ae8dc43aa31e8caaeef0ca8`; 3495 source bytes.

Lines 3–8; byte offsets [33, 470); 437 bytes; span SHA256 `f6eeefd6d0c07b027ee5b61a518dd30d4b74616779457f823a4a89d61f5cf31d`.

```ts
// The wire shapes of the Atlas review routes (DECISIONS.md D31, D35), transcribing
// modules/atlas/packages/adapter-io/src/surface/types-review.ts. An absent value is `null` on the wire, never omitted.
// The `AtlasEmpty` unions and the write verdict are composed in atlas-screen.ts, which owns `AtlasEmpty`; this file
// imports nothing from it, so the two modules never import each other.

const Tier = Schema.Literals(["T1", "T0"])
```

Lines 57–75; byte offsets [1979, 2850); 871 bytes; span SHA256 `bcb91af705956acb0e4c15a496a9928bdcc02718c3dafa978ee39af5ebbc2e22`.

```ts
export const AtlasHoldInput = Schema.Struct({ nodeKey: Schema.String })
export const AtlasReleaseInput = Schema.Struct({ nodeKey: Schema.String })
export const AtlasProposeInput = Schema.Struct({ nodeKey: Schema.String, toTier: Tier, reason: Schema.String })
export const AtlasDecideInput = Schema.Struct({
  proposalId: Schema.String,
  verdict: Schema.Literals(["ratified", "rejected"]),
  reason: Schema.String,
  token: Schema.optional(Schema.String),
})
export const AtlasAnswerInput = Schema.Struct({
  questionId: Schema.String,
  answer: Schema.String,
  drafted: Schema.optional(Schema.Struct({ model: Schema.String, why: Schema.String })),
})
export const AtlasMemoryDecideInput = Schema.Struct({
  proposalId: Schema.String,
  verdict: Schema.Literals(["indexed", "discarded"]),
  rule: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
```

## Q061 — packages/schema/src/atlas-screen.ts

Empty/present Atlas wire projection and verdict data.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e1709c1d7f25b68a8c7e2e0a86388994703112c6`; full-source SHA256 `98bcb28c924bf204251cbbb0d4f47d0210d10e07f138fd2186dcc9350daa3fea`; 12468 source bytes.

Lines 5–9; byte offsets [153, 550); 397 bytes; span SHA256 `76558a9fc118f94183a37b44f901dac423926cb40187a430d7f2958afe465f25`.

```ts
// The Atlas screen's wire shapes, shared by the legacy instance routes and the V2 server. They transcribe
// modules/atlas/packages/adapter-io/src/surface/types.ts and types-memory.ts field for field; a repository with no
// `.atlas/` answers `{ state: "empty" }` on every route.

export const AtlasEmpty = Schema.Struct({ state: Schema.Literal("empty") }).annotate({ identifier: "AtlasEmpty" })
```

Lines 220–227; byte offsets [7478, 7792); 314 bytes; span SHA256 `15d324bf9c161a2198d1b35f69195327b398687d3dd0c1adeae567090d1a794c`.

```ts
/** The fields every door verdict carries (surface `AtlasVerdict`); each verdict struct adds its own `data`. */
const VerdictFields = {
  state: Schema.Literal("ok"),
  ok: Schema.Boolean,
  rejected: Schema.optional(Schema.String),
  guidance: Schema.Struct({ next: Schema.String, invariant: Schema.String }),
}
```

Lines 307–320; byte offsets [10246, 10889); 643 bytes; span SHA256 `fb4bec0fb3ce7b44f7b3e67c3035c67ea63ef1796d1407c6e269ad97a993a7fc`.

```ts
export const AtlasReviewResult = Schema.Union([AtlasEmpty, AtlasReview]).annotate({ identifier: "AtlasReviewResult" })

/** Every review write (hold, release, propose, decide, answer, memory-decide, territory) answers this verdict. */
export const AtlasReviewWriteResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(Schema.Struct({ id: Schema.String })),
  }).annotate({ identifier: "AtlasReviewWrite" }),
]).annotate({ identifier: "AtlasReviewWriteResult" })

export const AtlasDelegateResult = Schema.Union([AtlasEmpty, AtlasDelegateOk]).annotate({
  identifier: "AtlasDelegateResult",
})
```

## Q062 — packages/schema/src/atlas-setup.ts

Atlas indexing/mining transport results.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `73f8ceecf7a353f7b7952c146cf8885dde18c144`; full-source SHA256 `e16cfab589094bedb8d609d16bb63914de5daf3e74b5d152e137c45bf620c876`; 951 source bytes.

Lines 3–28; byte offsets [33, 951); 918 bytes; span SHA256 `6338af24e581de44116793f96f548115d24abb312b1c27d888dc3d6702a49510`.

```ts
// D38 and D40 wire shapes (an absent value is `null`, never omitted). This file imports nothing from atlas-screen.ts; the
// unions that need `AtlasEmpty` live there.

export const AtlasIndexOk = Schema.Struct({
  state: Schema.Literal("ok"),
  ran: Schema.Boolean,
  tool: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Finite),
  documents: Schema.NullOr(Schema.Finite),
  message: Schema.NullOr(Schema.String),
}).annotate({ identifier: "AtlasIndex" })

export const AtlasMineInput = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
  ceiling: Schema.Finite,
})

export const AtlasMineOk = Schema.Struct({
  state: Schema.Literal("ok"),
  sites: Schema.Finite,
  facts: Schema.Finite,
  complete: Schema.Boolean,
  why: Schema.NullOr(Schema.String),
  refusal: Schema.NullOr(Schema.Literals(["contended", "unreadable", "untrusted"])),
}).annotate({ identifier: "AtlasMine" })
```

## Q063 — packages/schema/src/board.ts

Maestro/owner payload distinction and input/output secret boundary.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a6c4f61ba821da08f9b972df0236dc5cbfc7eb5a`; full-source SHA256 `2bc0209c7133f1210ee4dc380742b297c280a1a1b18244eb2c0f5f2de0b0df43`; 31577 source bytes.

Lines 11–12; byte offsets [373, 585); 212 bytes; span SHA256 `6059bc8b48c41357c1c6f4c64cd1d4fdf695f342febd38c7ec5ddd78cfcda3d6`.

```ts
// The Projects board: Maestro plans projects, epics, issues and steps; the owner answers, comments, attaches,
// undoes, pauses and holds. "Project" elsewhere is the git repo, so board types are always Board.*.
```

Lines 90–94; byte offsets [3449, 3764); 315 bytes; span SHA256 `402c9cca885186f14af6af121077ca2b7e7349124850129ca33e61fc8104e1e1`.

```ts
// `intake` holds only GitHub-born issues waiting for the owner. Only the host moves a card into or out of `queue`.
export const Stage = Schema.Literals(["intake", "backlog", "ready", "building", "review", "queue", "shipped", "cut"]).annotate({
  identifier: "Board.Stage",
})
export type Stage = typeof Stage.Type
```

Lines 264–274; byte offsets [9533, 9977); 444 bytes; span SHA256 `83e74aa0bf03f7134d4f086ec2dd2c95fb1abe3346b163ac44517d6ca52c2d8d`.

```ts
// A secret shows its label as `name` and never its value or where it is stored.
export interface Attachment extends Schema.Schema.Type<typeof Attachment> {}
export const Attachment = Schema.Struct({
  id: AttachmentID,
  issue: PositiveInt,
  kind: AttachmentKind,
  name: Schema.String,
  mime: Schema.NullOr(Schema.String),
  size: Schema.NullOr(NonNegativeInt),
  timeCreated: Schema.Finite,
}).annotate({ identifier: "Board.Attachment" })
```

Lines 541–544; byte offsets [21059, 21270); 211 bytes; span SHA256 `d5b83df799ef9e6327c2ecf5569a22eaa3e32c938072e0874877ba837f0eecc4`.

```ts
const Text = Schema.Trim.check(Schema.isNonEmpty())
const Reason = Schema.Trim.check(Schema.isNonEmpty()).annotate({
  description: "Why, in one sentence. Required on every write and kept in the board log.",
})
```

Lines 687–714; byte offsets [26626, 27987); 1361 bytes; span SHA256 `0fc97ba1817d47c04dbd12a258b1114c41b7c386bbec59ce00c89e75bdbbc7f6`.

```ts
// Owner write payloads (section 5). The owner's reason is optional.

export const AnswerInput = Schema.Struct({
  option: Schema.String,
  text: Schema.String.pipe(optional),
}).annotate({ identifier: "Board.AnswerInput" })
export type AnswerInput = typeof AnswerInput.Type

export const NoteInput = Schema.Struct({ body: Text }).annotate({ identifier: "Board.NoteInput" })
export type NoteInput = typeof NoteInput.Type

// Files arrive base64-encoded in JSON; a secret's value goes straight to the credential store and is never echoed.
// A file carries base64 `data`; a secret carries `value` (stored only in the credential store) and `name` is its label.
export const AttachmentInput = Schema.Struct({
  kind: AttachmentKind,
  name: Text,
  mime: Schema.String.pipe(optional),
  data: Schema.String.pipe(optional),
  value: Schema.String.pipe(optional),
}).annotate({ identifier: "Board.AttachmentInput" })
export type AttachmentInput = typeof AttachmentInput.Type

/** Target date and budget of a project; omitted fields stay, null clears one. Owner route. */
export const SettingsInput = Schema.Struct({
  target_date: Schema.NullOr(Schema.Finite).pipe(optional),
  budget_usd: Schema.NullOr(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))).pipe(optional),
  reason: Schema.String.pipe(optional),
}).annotate({ identifier: "Board.SettingsInput" })
```

Lines 787–796; byte offsets [31281, 31577); 296 bytes; span SHA256 `8cc9062565d6d13590c33d8eb31cc46ece5fd242cc137b8e4dda0dcccad24e9e`.

```ts
// Carries no board content: the app refetches what it shows.
const Changed = define({
  type: "board.changed",
  schema: {
    project: Schema.String,
    issue: Schema.String.pipe(optional),
    activity: Schema.String,
  },
})
export const Event = { Changed, Definitions: inventory(Changed) }
```

## Q064 — packages/schema/src/board-queue.ts

Derived queue state and tree-scoped check/attempt facts.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `69f607bb08fda8f0bd4530ce31655009d477abc1`; full-source SHA256 `393a085abeddbbcdba2cbdfff023a114f525d402cc531a3b75e94036893693d6`; 5391 source bytes.

Lines 14–30; byte offsets [510, 1301); 791 bytes; span SHA256 `15b02430e64a166abdf73e0362769ba88269b7a2bda08360c1220b2a154a4dbb`.

```ts
/**
 * The part of a card's PR record Maestro writes (docs/specs/maestro-lead/merge-queue.md section 4.5). The host adds
 * Evidence, Cost, Lineage and Integration when it renders the PR body. `follow_ups` are card keys such as `LCH-12`.
 */
export interface PrRecord extends Schema.Schema.Type<typeof PrRecord> {}
export const PrRecord = Schema.Struct({
  intent: Schema.String.pipe(optional),
  change: Schema.String.pipe(optional),
  decisions: Schema.String.pipe(optional),
  not_covered: Schema.String.pipe(optional),
  risk: Schema.Struct({
    level: RiskLevel.pipe(optional),
    breaks: Schema.String.pipe(optional),
    undo: Schema.String.pipe(optional),
  }).pipe(optional),
  follow_ups: Schema.Array(Schema.String).pipe(optional),
}).annotate({ identifier: "Board.PrRecord" })
```

Lines 60–91; byte offsets [2600, 4086); 1486 bytes; span SHA256 `184835bc55754cafb6da9a771c2d4ad3b86f98d69ada558f3c6f4407e0371f69`.

```ts
export const CheckID = Schema.String.pipe(
  Schema.brand("Board.CheckID"),
  statics((schema) => ({ create: () => schema.make("bck_" + ascending()) })),
)
export type CheckID = typeof CheckID.Type

export const CheckKind = Schema.Literals(["scoped", "workflow", "full"])
export type CheckKind = typeof CheckKind.Type
export const CheckOutcome = Schema.Literals(["pass", "fail", "pending", "error"])
export type CheckOutcome = typeof CheckOutcome.Type
/** Derived from `board_check` on the card's current tree, never stored. Null: nothing required has a result there yet. */
export const ScopedState = Schema.NullOr(Schema.Literals(["scoped-green", "scoped-red"]))
export type ScopedState = typeof ScopedState.Type

/** How an attempt ended; null while it is open. Only a merge or a cut ends a card's last attempt. */
export const AttemptOutcome = Schema.Literals(["merged", "ejected", "failed", "superseded", "cut"])
export type AttemptOutcome = typeof AttemptOutcome.Type

/** One pass or fail fact, keyed by the tree it ran on. `board_ci_run` keeps the billing next to it. */
export const Check = Schema.Struct({
  id: CheckID,
  attempt: NonNegativeInt,
  kind: CheckKind,
  command: Schema.String,
  treeSha: Schema.String,
  commitSha: Schema.NullOr(Schema.String),
  outcome: CheckOutcome,
  url: Schema.NullOr(Schema.String),
  failing: Schema.Array(Schema.String),
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
}).annotate({ identifier: "Board.Check" })
```

Lines 103–121; byte offsets [4451, 5391); 940 bytes; span SHA256 `954eb3cd0207842f22a68a1ef5fb94b8c90b3d1d3d3b0fd992f62d0867fcb1ee`.

```ts
export const QueueResult = Schema.Struct({
  /** The PR head the card queued at; the bundle merges exactly this commit. */
  head: Schema.String,
  tree: Schema.String,
  state: ScopedState,
}).annotate({ identifier: "Board.QueueResult" })
export type QueueResult = typeof QueueResult.Type

export const DequeueResult = Schema.Struct({
  /** The open bundle the card was in, dissolved with its PR closed; its other members stay queued. */
  dissolved: Schema.NullOr(PositiveInt),
}).annotate({ identifier: "Board.DequeueResult" })
export type DequeueResult = typeof DequeueResult.Type

export const BundleResult = Schema.Struct({
  /** The bundle's status after the verdict: `accepted` merges on the next tick, `dissolved` or `infra` lets the queue cut again. */
  status: Schema.Literals(["accepted", "dissolved", "infra", "released"]),
}).annotate({ identifier: "Board.BundleResult" })
export type BundleResult = typeof BundleResult.Type
```

## Q065 — packages/schema/src/hook-glob.ts

UTF-8 glob matcher shared by engine/UI with bounded brace nesting and platform separator.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `32d8d1cf8979807b673fb0ff053d96f59bed766a`; full-source SHA256 `e9fff629f93c2570126b5484be65c0a966a22f010d0424352d4da4ff3c3cc33e`; 13356 source bytes.

Lines 3–7; byte offsets [41, 613); 572 bytes; span SHA256 `80cb494ad6478ac4b5ddb13dadd4a5ad172d53baf0a81731de0d977e79a2d48d`.

```ts
// Path patterns for hook conditions, matched the way Bun's glob `match` does it (src/glob/matcher.zig at Bun 1.3.14),
// so the engine keeps those semantics under Node, where the desktop server runs. This is a line-for-line port: the
// pattern and the path are compared as UTF-8 bytes, character classes compare code points, and a lone surrogate is
// U+FFFD, as Bun's string conversion makes it. packages/relay/test/hook.test.ts checks it against Bun's own matcher.
// It lives in schema so the hook engine (@orchestra/relay) and the app's hook Test share one matcher.
```

Lines 27–42; byte offsets [1838, 2733); 895 bytes; span SHA256 `9e3b17c2fd67ede885f12f4c85b3baa2b34c9759dab208987500ae28b2e6dbb3`.

```ts
/**
 * Whether `path` matches `pattern`:
 * - `?` is any one character and `*` any run of characters, neither crossing a separator (`/`, and `\` on Windows);
 * - `**` is any run including separators, when it is a whole path segment;
 * - `[ab]`, `[a-z]`, `[!ab]` and `[^ab]` are character classes;
 * - `{a,b}` are alternatives, nested at most 10 deep;
 * - each leading `!` negates the result, and `\` escapes the next character.
 *
 * Matching is case-sensitive and a leading dot is an ordinary character. An invalid pattern matches nothing (before
 * any leading `!` applies).
 */
export const match = (pattern: string, path: string): boolean => {
  const bangs = /^!*/.exec(pattern)![0].length
  const state: State = { path: 0, glob: bangs, wildcard: origin(), globstar: origin(), depth: 0 }
  return run(state, encoder.encode(pattern), 0, encoder.encode(path), []) !== (bangs % 2 === 1)
}
```

Lines 63–64; byte offsets [2984, 3045); 61 bytes; span SHA256 `df639253933c9052f09099ad5b31c4a9564120dd4d35e361bc117feb1b60d281`.

```ts
const encoder = new TextEncoder()
const MAX_BRACE_DEPTH = 10
```

Lines 235–247; byte offsets [8985, 9439); 454 bytes; span SHA256 `012d35db0429a03be8d13761e8aa2c4164cc8548a66b1cfb23831cec9dc78fdd`.

```ts
function matchBranch(state: State, glob: Uint8Array, path: Uint8Array, open: number, branch: number, braces: Brace[]) {
  if (braces.length === MAX_BRACE_DEPTH) return false
  braces.push({ open, branch })
  const copy: State = {
    ...state,
    wildcard: { ...state.wildcard },
    globstar: { ...state.globstar },
    glob: branch,
    depth: braces.length,
  }
  const matched = run(copy, glob, branch, path, braces)
  braces.pop()
  return matched
```

Lines 314–317; byte offsets [12018, 12247); 229 bytes; span SHA256 `0022b47187f193090f3d8934abd0a05b2f7ac31c38ffe59e1e1db49d091d4b2f`.

```ts
// A browser has no `process`; there, as on POSIX, `/` is the only separator.
function separator(byte: number) {
  return byte === SLASH || (typeof process !== "undefined" && process.platform === "win32" && byte === BACKSLASH)
}
```

## Q066 — packages/schema/src/hook-match.ts

Path delegation and nonpath normalized wildcard matching.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0f64acf307d37cc37e949de4a3ed215491f5ecb5`; full-source SHA256 `a2352eb5488b1267dd22481416ad50cc714417a31892b64464a4d1611d012cf2`; 2866 source bytes.

Lines 5–29; byte offsets [83, 1434); 1351 bytes; span SHA256 `a160b886214c5eca7753f963f38575c267ce73a288781de1795802b09d1e7ec9`.

```ts
// The hook condition matcher, shared by the engine (@orchestra/relay) and the app's hook Test, so a pattern holds in
// the Test exactly when it holds at runtime. Pure and platform-free: the caller says whether to fold case.

/**
 * `path` patterns use HookGlob (`**` crosses directories; minimatch-like and case-sensitive); the other fields use
 * Orchestra's permission Wildcard, case-insensitive when `fold` is set (Windows). A pattern ending in " *" also
 * matches without the argument.
 */
export const matches = (
  field: "path" | "tool" | "command" | "event",
  pattern: string,
  value: string,
  fold = false,
): boolean => {
  if (field === "path") return HookGlob.match(pattern, value)
  const normalized = pattern.replaceAll("\\", "/")
  const subject = value.replaceAll("\\", "/")
  return star(normalized, subject, fold) || (normalized.endsWith(" *") && star(normalized.slice(0, -2), subject, fold))
}

/**
 * Orchestra's Wildcard (core/src/util/wildcard.ts: `*` any run, newlines included; `?` one character; everything else
 * literal; case-insensitive on Windows) without its regex. That regex backtracks polynomially on several stars, and the
 * value here is a model-written command, so this matches greedily in O(pattern × value): the first and last literal
 * segments are anchored and each middle one takes its leftmost fit.
```

## Q067 — packages/schema/src/config-maestro.ts

Optional Atlas project/directory context configuration.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `31a8d9041e63515a9a28615d3e8cbe23a238d8e5`; full-source SHA256 `abf7bd561adfa3e070e396ad360dc11b5ea779b9d23f16e92b8e4ddacfc65caf`; 455 source bytes.

Lines 6–15; byte offsets [120, 455); 335 bytes; span SHA256 `9ddd7e2a935cdc3de0a6846b6ff6590b341e7d74362860cd5f096aac4cdf7a40`.

```ts
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  atlas: optional(
    Schema.Struct({
      projectID: Schema.NonEmptyString,
      directory: Schema.NonEmptyString,
      sourceDirectory: optional(Schema.NonEmptyString),
    }),
  ),
}).annotate({ identifier: "Config.Maestro" })
```

## Q068 — packages/schema/src/maestro-context.ts

Grounding and actor/source-bound tool plan representation.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1647502c6edd14b8afa0569d553dfea73398ea59`; full-source SHA256 `96129481a9ccc3a338aa9c212c581d0e1cdcee24436c81e19c2dd57d07a1b418`; 2189 source bytes.

Lines 6–30; byte offsets [128, 1108); 980 bytes; span SHA256 `602dcb1130867fdbd76298e69910db9d2f2302e2bc0c72b5e2301b83fe2c7a04`.

```ts
const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const GitHash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/))
const Names = Schema.Array(Schema.NonEmptyString)

export const Grounding = Schema.Struct({
  catalogVersion: Schema.NonEmptyString,
  snapshot: Schema.NonEmptyString,
  sourceRevision: GitHash,
  sourceIdentityHash: Hash,
  units: Names.check(Schema.isMinLength(1)),
}).annotate({ identifier: "Maestro.Grounding" })

export const ToolPlan = Schema.Struct({
  version: Schema.Literal("context-tool-plan-v1"),
  actor: Schema.Struct({
    projectId: Schema.NonEmptyString,
    sessionId: Schema.NonEmptyString,
    memberId: Schema.NonEmptyString,
  }),
  actorBytes: Schema.NonEmptyString,
  planRevision: Schema.Struct({ id: Schema.NonEmptyString, hash: Hash }),
  catalogVersion: Schema.NonEmptyString,
  headSnapshot: Schema.NonEmptyString,
  sourceRevision: GitHash,
  territories: Names.check(Schema.isMinLength(1)),
```

Lines 60–66; byte offsets [1937, 2189); 252 bytes; span SHA256 `79f9aa5737d4f72f6a641857aa312b360380245d65f05d8ccf211c29e36063b4`.

```ts
export const LoadedSkill = Schema.Struct({
  unit: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  content: Schema.NonEmptyString,
  contentHash: Schema.NonEmptyString,
  receiptHash: Hash,
}).annotate({ identifier: "Maestro.LoadedOwnSkill" })
```

## Q069 — packages/schema/src/maestro-event.ts

Versioned product governance facts; actual upstream-missing filter and durable-only inventory.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e4792cc8bbbdf6d11b8caf503fbd09b0b2688fb2`; full-source SHA256 `d1d4ff601b422f55e6579f06b79805af24bdccda295fdcaa70b038afef0cdb8c`; 28276 source bytes.

Lines 237–278; byte offsets [7610, 9198); 1588 bytes; span SHA256 `66cc339720c960ee5bc57518b40157d2f6e01c736887a4fa08e28f523f3a9624`.

```ts
  const RecordedV3Data = Schema.Struct({
    ...Recorded.data.fields,
    ...WorkflowFields,
    revision: Schema.Literal("v3"),
    goal: FieldV3,
    acceptance: Schema.Array(FieldV3),
    scope: Schema.Array(FieldV3),
    constraints: Schema.Array(FieldV3),
    reviewRequirement: FieldV3,
    assumptions: Schema.Array(FieldV3),
    risks: Schema.Array(FieldV3),
    // Let explicit undefined reach the named missing check; optional still omits it when encoding.
    upstreamAttribution: optional(Schema.UndefinedOr(UpstreamAttribution.Any)),
    grounding: optional(MaestroContext.Grounding),
  }).check(
    Schema.makeFilter((data) =>
      data.upstreamAttribution === undefined &&
      [
        data.goal,
        data.reviewRequirement,
        ...data.acceptance,
        ...data.scope,
        ...data.constraints,
        ...data.assumptions,
        ...data.risks,
      ].some((field) => field.source === "upstream")
        ? { path: ["upstreamAttribution"], issue: "UPSTREAM_ATTRIBUTION_MISSING" }
        : undefined,
    ),
  )

  // Event.define accepts fields only. Embed the checked data schema itself so envelope decoding shares its checks.
  export const RecordedV3 = Schema.Struct({ ...Recorded.fields, data: RecordedV3Data })
    .annotate({ identifier: Recorded.type })
    .pipe(
      statics(() => ({
        type: Recorded.type,
        durable: { version: 3, aggregate: "sessionID" },
        data: RecordedV3Data,
      })),
    ) satisfies Event.Definition<typeof Recorded.type, typeof RecordedV3Data>
  export type RecordedV3 = typeof RecordedV3.Type
```

Lines 710–734; byte offsets [26252, 27405); 1153 bytes; span SHA256 `6048469aed4b272474fc28b497423670535046126f7ed78f03d81b4b76256efe`.

```ts
export namespace WorkResult {
  // Shared transitional contract: host verification and Maestro acceptance remain independent facts.
  export const Decided = Event.define({
    type: "maestro.work_result.decided",
    durable: { version: 1, aggregate: "authoritySessionID" },
    schema: {
      projectID: Schema.NonEmptyString,
      memberID: Schema.Literal("backend"),
      taskId: Schema.NonEmptyString,
      authoritySessionID: Schema.NonEmptyString,
      executionSessionID: Schema.NonEmptyString,
      resultRef: Schema.Struct({
        parentSessionID: Schema.NonEmptyString,
        messageID: Schema.NonEmptyString,
        partID: Schema.NonEmptyString,
        callID: Schema.NonEmptyString,
      }),
      workResultHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      decision: Schema.Literals(["accepted", "rejected"]),
      verificationState: Schema.Literals(["not-host-verified", "host-verified", "host-failed", "host-incomplete"]),
      terminalReason: Schema.Literals(["ended", "blocked", "failed", "interrupted"]),
      reason: optional(Schema.String),
    },
  })
  export type Decided = typeof Decided.Type
```

Lines 766–768; byte offsets [28025, 28276); 251 bytes; span SHA256 `4bb6d9e4fabe63cd4a87baebbd84d5489c7fb11a989686ca4f75ffb09a94a1a9`.

```ts
/** Maestro events stored and replayed by the host but never part of the public event surface. */
export const DurableOnlyDefinitions = Event.inventory(Task.WorkflowReviewHeld, Task.WorkflowRebound,
  Task.WorkflowReviewFindings, Task.ResumeAdmitted)
```

## Q070 — packages/schema/src/upstream-attribution.ts

Strict versioned actor/dispatch references explicitly do not verify authorship.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `73fa1773f7f9578eb6099fe10fde3d69d95a2d00`; full-source SHA256 `47871f9b7e274c96129b216c7cf4ff92b5b4b24f56e1e866bc0c6bc687f3b3d4`; 3522 source bytes.

Lines 9–38; byte offsets [256, 1517); 1261 bytes; span SHA256 `fdc8a4054eed103731d4b47f60871b4d4934e527e1424286eab0d85d1743eee7`.

```ts
export interface V1 extends Schema.Schema.Type<typeof V1> {}
export const V1 = Schema.Struct({
  schema: Schema.Literal("maestro-upstream-attribution-v1"),
  projectID: Project.ID,
  memberID: Agent.ID.pipe(
    Schema.refine<typeof Agent.ID, Agent.ID & "archie">((id): id is Agent.ID & "archie" => id === "archie", {
      expected: '"archie"',
      // Effect resolves brand annotations from the newest check.
      brands: Agent.ID.ast.annotations?.brands,
    }),
  ),
  profile: Schema.Literal("upstream"),
  authorSessionID: SessionID,
  authorMessageID: SessionMessage.ID,
  parentSessionID: SessionID,
  parentMessageID: SessionMessage.ID,
  parentCallID: Schema.NonEmptyString,
  logicalTaskID: Schema.NonEmptyString,
})
  .check(
    // Project.ID intentionally accepts arbitrary strings; retain its identity and reject empty attribution references.
    Schema.makeFilter((attribution) =>
      attribution.projectID.length > 0 ? undefined : { path: ["projectID"], issue: "projectID must not be empty" },
    ),
  )
  .annotate({
    identifier: "Maestro.UpstreamAttribution.V1",
    description: "Upstream proposal references. Structural validation does not establish host-verified authorship.",
    parseOptions: { onExcessProperty: "error" },
  })
```

Lines 40–60; byte offsets [1518, 2583); 1065 bytes; span SHA256 `172676de3b8cbced15b15c973c27f440699ec44f0ccbab2bf0feb80a0e801e35`.

```ts
/** Orchestra executed the dispatch itself: a non-provider-executed native `task` call. */
export const OrchestraTaskDispatch = Schema.Struct({ kind: Schema.Literal("orchestra-task") }).annotate({
  identifier: "Maestro.UpstreamAttribution.OrchestraTaskDispatch",
  parseOptions: { onExcessProperty: "error" },
})

/** Claude Code executed its own subagent tool; Orchestra only witnessed it in-process through hooks. */
export const ClaudeCodeAgentDispatch = Schema.Struct({
  kind: Schema.Literal("claude-code-agent"),
  // The raw observed tool name: current binaries call it "Agent", older ones "Task".
  tool: Schema.Literals(["Agent", "Task"]),
  // Plugin-scoped seat name; it maps to native "archie".
  subagentType: Schema.Literal("orchestra:archie"),
  executor: Schema.Literal("claude-code-host"),
  agentID: Schema.NonEmptyString,
  // Orchestra write-root grant bound to this tool use.
  grantID: Schema.NonEmptyString,
}).annotate({
  identifier: "Maestro.UpstreamAttribution.ClaudeCodeAgentDispatch",
  parseOptions: { onExcessProperty: "error" },
})
```

Lines 62–82; byte offsets [2584, 3522); 938 bytes; span SHA256 `3c17b64c52e986d0361337368efaf57fa741874fd01e38d348f9d231c763460f`.

```ts
export interface V2 extends Schema.Schema.Type<typeof V2> {}
export const V2 = Schema.Struct({
  ...V1.fields,
  schema: Schema.Literal("maestro-upstream-attribution-v2"),
  // parentCallID (from V1) carries the Claude Code tool_use_id for claude-code-agent.
  dispatch: Schema.Union([OrchestraTaskDispatch, ClaudeCodeAgentDispatch]),
})
  .check(
    Schema.makeFilter((attribution) =>
      attribution.projectID.length > 0 ? undefined : { path: ["projectID"], issue: "projectID must not be empty" },
    ),
  )
  .annotate({
    identifier: "Maestro.UpstreamAttribution.V2",
    description: "Upstream proposal references with the observed dispatch kind. Structural validation does not establish host-verified authorship.",
    parseOptions: { onExcessProperty: "error" },
  })

/** Persisted attributions accept every version; historical V1 events keep decoding. */
export type Any = V1 | V2
export const Any = Schema.Union([V1, V2])
```

## Q071 — packages/schema/src/meeting.ts

Final segments, retention/consent, owner consolidation and handoff intent.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7244e6ac95cc935a1fb11817c6fe8647823db7e3`; full-source SHA256 `6216a267111c79ea0fe4737a4cf8883fb534686e4879a93ed82bbed213b0a791`; 9350 source bytes.

Lines 8–28; byte offsets [189, 1141); 952 bytes; span SHA256 `f2d6cfedd53f876357a7e7494a8a566a38e5cad86bf27801570f0666d02cf041`.

```ts
// Meeting: the durable record of one live-seat meeting and its final transcript segments.
// Audio and partial captions never reach this record; only final segments do.
export const ID = Schema.String.check(Schema.isStartsWith("mtg_")).pipe(
  Schema.brand("Meeting.ID"),
  statics((schema) => ({ create: () => schema.make("mtg_" + descending()) })),
)
export type ID = typeof ID.Type

// The track is the only speaker attribution: the owner's microphone or the call's system audio.
export const Track = Schema.Literals(["me", "them"]).annotate({ identifier: "Meeting.Track" })
export type Track = typeof Track.Type

export const Segment = Schema.Struct({
  // Chosen by the desktop client so a retried append is idempotent.
  id: Schema.String.check(Schema.isNonEmpty()),
  track: Track,
  text: Schema.String,
  // Milliseconds from the meeting start.
  startMs: Schema.Number,
  endMs: Schema.Number,
}).annotate({ identifier: "Meeting.Segment" })
```

Lines 40–48; byte offsets [1490, 2013); 523 bytes; span SHA256 `f629c1463842e7389e2a65a55a7ad125f9b04514648dba54eaf558d752352dea`.

```ts
// kept stores segments and claims; ephemeral keeps segments only during the call and the card after stop.
export const Retention = Schema.Literals(["kept", "ephemeral"]).annotate({ identifier: "Meeting.Retention" })
export type Retention = typeof Retention.Type

// Asked at every start: whether the other participants were told the meeting is captured.
export const Consent = Schema.Literals(["announced", "not-needed", "unknown"]).annotate({
  identifier: "Meeting.Consent",
})
export type Consent = typeof Consent.Type
```

Lines 100–103; byte offsets [3997, 4268); 271 bytes; span SHA256 `08285bdc92c101f70aa9e909a40a41c0bd227854bda86da6da56aa33b5d17b6a`.

```ts
// Consolidation runs after stop: poll the meeting until the card is not pending. Suggestions are never written to
// Atlas; the owner or Maestro decides what to do with them.
export const Card = Schema.Struct({
  status: Schema.Literals(["pending", "ready", "failed"]),
```

Lines 130–143; byte offsets [5175, 5702); 527 bytes; span SHA256 `1b67d8ece13ea5c71973e08bc934f5c6012d3f27a4d690f286fe720894774a86`.

```ts
export const StartInput = Schema.Struct({
  sessionID: SessionID,
  title: Schema.String,
  // Defaults to kept.
  retention: Schema.optional(Retention),
  consent: Consent,
}).annotate({ identifier: "Meeting.StartInput" })
export interface StartInput extends Schema.Schema.Type<typeof StartInput> {}

export const AppendInput = Schema.Struct({
  meetingID: ID,
  segments: Schema.Array(Segment),
}).annotate({ identifier: "Meeting.AppendInput" })
export interface AppendInput extends Schema.Schema.Type<typeof AppendInput> {}
```

Lines 200–209; byte offsets [8160, 8695); 535 bytes; span SHA256 `2ed04a406e11f123e14238b8155781909f5093c39c9ac4285b7aa2b37c3a3309`.

```ts
// Sends items to Maestro through team_message with their source and no transcript.
export const HandoffInput = Schema.Struct({ meetingID: ID, itemIDs: Schema.Array(Schema.String) }).annotate({
  identifier: "Meeting.HandoffInput",
})
export interface HandoffInput extends Schema.Schema.Type<typeof HandoffInput> {}

export const HandoffResult = Schema.Struct({ sent: Schema.Array(Schema.String) }).annotate({
  identifier: "Meeting.HandoffResult",
})
export interface HandoffResult extends Schema.Schema.Type<typeof HandoffResult> {}
```

## Q072 — packages/schema/src/scheduled-task.ts

Legacy IDs and admission-level started/failed run contract.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `431d1b8c178802a6724945309fde78d2144b88b6`; full-source SHA256 `78b2151252415cd1f1e4e9c98f85b6143fd33c46b4cb50464e936ec43f887a6e`; 4193 source bytes.

Lines 8–18; byte offsets [227, 752); 525 bytes; span SHA256 `c174cf9f231e805a971da2b933d0a979553d38b23b91ef93c8fee29c69141df5`.

```ts
// Tasks saved on a device before the server owned schedules carry UUIDs, so any short non-empty ID is accepted.
export const ID = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)).pipe(
  Schema.brand("ScheduledTask.ID"),
  statics((schema) => ({ create: () => schema.make("tsk_" + ascending()) })),
)
export type ID = typeof ID.Type

export const Cadence = Schema.Literals(["once", "hourly", "daily", "weekly"]).annotate({
  identifier: "ScheduledTask.Cadence",
})
export type Cadence = typeof Cadence.Type
```

Lines 24–42; byte offsets [968, 1816); 848 bytes; span SHA256 `b8a517aed81806d438f61e5288c485b71d5104d9d5733e42395ee3b93789b17f`.

```ts
export interface StartedRun extends Schema.Schema.Type<typeof StartedRun> {}
export const StartedRun = Schema.Struct({
  outcome: Schema.Literal("started"),
  time: Schema.Finite,
  slot: Schema.Finite.pipe(optional),
  sessionID: SessionID,
}).annotate({ identifier: "ScheduledTask.StartedRun" })

export interface FailedRun extends Schema.Schema.Type<typeof FailedRun> {}
export const FailedRun = Schema.Struct({
  outcome: Schema.Literal("failed"),
  time: Schema.Finite,
  slot: Schema.Finite.pipe(optional),
  error: Schema.String,
}).annotate({ identifier: "ScheduledTask.FailedRun" })

// What the latest settled run actually did: its prompt was admitted into a Session, or it failed before that.
export type Run = StartedRun | FailedRun
export const Run = Schema.Union([StartedRun, FailedRun]).annotate({ identifier: "ScheduledTask.Run" })
```

Lines 69–83; byte offsets [2713, 3358); 645 bytes; span SHA256 `d339dde544e97f0311b77c5b36c616728783d3e12663c7d864b6ba9d1526d35c`.

```ts
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}
export const CreateInput = Schema.Struct({
  /** Creating with an ID the Location already has returns that task unchanged, so retries and imports are safe. */
  id: ID.pipe(optional),
  name: Text,
  prompt: Text,
  cadence: Cadence,
  next: Schema.Finite,
  timezone: Schema.String,
  /** Defaults to the local time of day of `next`. */
  minute: Minute.pipe(optional),
  enabled: Schema.Boolean.pipe(optional),
  /** Run history of a task imported from device storage. */
  history: History.pipe(optional),
}).annotate({ identifier: "ScheduledTask.CreateInput" })
```

Lines 97–101; byte offsets [3945, 4193); 248 bytes; span SHA256 `fa606f99aeb93fce21b7cae6456d1a2a38f1d74f2c5b2d16b09f4a672b9bd2d2`.

```ts
export interface RunResult extends Schema.Schema.Type<typeof RunResult> {}
export const RunResult = Schema.Struct({
  /** Session the run's prompt was admitted into. */
  sessionID: SessionID,
}).annotate({ identifier: "ScheduledTask.RunResult" })
```

## Q073 — packages/schema/src/lean-coverage.ts

Coverage inventory distinguishes reducer/preserve and maps profiles.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `19016bbda0d6f8838eadea8d76dc5fc7f3fcd545`; full-source SHA256 `6d9bb1a24099f847fe15184e8fdb1d071158a911947dd0d493a4e834d807c310`; 5011 source bytes.

Lines 5–14; byte offsets [82, 1186); 1104 bytes; span SHA256 `85d92582eefe2dbd869fe2ab543f47a852f25ce5fed9df601f9d38f35e9c16c9`.

```ts
// Inventory from HuGR-Lean PR129, db767483c06b57614fbed6c3fe7f70ae810e46a4 (MIT).
// Group labels/categories are Orchestra presentation; exact evidence does not imply a reducer.
export const items = [
  { id: "cargo", label: "Cargo", category: "build", mode: "reducer", profiles: ["cargo-test", "cargo-build", "cargo-check", "cargo-clippy"], exact: ["cargo-bench", "cargo-doc", "cargo-fetch", "cargo-fmt", "cargo-nextest"] },
  { id: "go", label: "Go", category: "test", mode: "reducer", profiles: ["go-test-verbose", "go-test-json", "go-mod"], exact: ["go-bench", "go-build"] },
  { id: "pytest", label: "pytest", category: "test", mode: "reducer", profiles: ["pytest"], exact: [] },
  { id: "jest", label: "Jest", category: "test", mode: "preserve", profiles: ["jest"], exact: [] },
  { id: "vitest", label: "Vitest", category: "test", mode: "preserve", profiles: ["vitest"], exact: [] },
  { id: "git", label: "Git status", category: "search", mode: "reducer", profiles: ["git-status"], exact: [] },
  { id: "rg", label: "ripgrep", category: "search", mode: "reducer", profiles: ["rg"], exact: [] },
```

Lines 48–55; byte offsets [4529, 5011); 482 bytes; span SHA256 `ab026b8272aedf47928d71daf11b1c28d343b263eecfbf9a038af21dfba81f85`.

```ts
export type ItemID = (typeof items)[number]["id"]
export const ItemID = Schema.Literals(items.map((item) => item.id))
export type Category = (typeof items)[number]["category"]
export const ids: readonly ItemID[] = Object.freeze(items.map((item) => item.id))
export type Settings = Readonly<Partial<Record<ItemID, boolean>>>
export function forProfile(profile: string): ItemID | undefined {
  return items.find((item) => (item.profiles as readonly string[]).includes(profile))?.id
}
```

## Q074 — packages/schema/src/lean-dashboard.ts

Saved-profile savings projection explicitly labels local token estimates.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7c679f6d69fb586a71b232214e3b5178fda90c54`; full-source SHA256 `8bb3f0b04d3c0c74fe94774e6c62a2f56c302843d37a7404be5de7a947717f45`; 2592 source bytes.

Lines 14–20; byte offsets [381, 697); 316 bytes; span SHA256 `075b27d037b960220407ca8c0a9ceeb6693c1957793939a398c1a249ec9f4830`.

```ts
/** Exact safe integers or unavailable; tokens are always explicitly local estimates. */
export const Savings = Schema.Struct({
  bytesSaved: Schema.NullOr(Schema.Int),
  tokensSaved: Schema.NullOr(Schema.Int),
  calls: NonNegativeInt,
  tokenCalls: NonNegativeInt,
}).annotate({ identifier: "LeanProfileSavings" })
```

Lines 30–38; byte offsets [934, 1220); 286 bytes; span SHA256 `beb8087e6ae668e969fe1f015ee619cec52333e91bf07696806b09fa8542ff49`.

```ts
export const Info = Schema.Struct({
  scope: Scope,
  engine: Schema.String,
  enabled: Schema.Boolean,
  coverage: Schema.Literal("saved-profile-history"),
  complete: Schema.Boolean,
  savings: Savings,
  items: Schema.Array(Item),
}).annotate({ identifier: "LeanProfileDashboard" })
```

Lines 71–76; byte offsets [2238, 2592); 354 bytes; span SHA256 `25d5107339ef9d2c179da84355600f134d871525390c7c85268b71d5993b1bcd`.

```ts
/** UI transport seam; production adapters implement real HTTP, never browser-owned preferences. */
export interface Transport {
  readonly read: (signal?: AbortSignal) => Promise<Info>
  readonly update: (value: Update, signal?: AbortSignal) => Promise<Info>
  readonly history: (itemID: LeanCoverage.ItemID, signal?: AbortSignal) => Promise<History>
}
```

## Q075 — packages/schema/src/lean-engine.ts

Current and legacy persisted engine IDs.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e18ba44de9dcc2dbeb674f7fb90c2897f731bb43`; full-source SHA256 `9aa2cb9bcb69da5d6e6ea6a3e16a4c3d19d776e5c89a14f177baa202a044c5da`; 584 source bytes.

Lines 1–9; byte offsets [0, 584); 584 bytes; span SHA256 `9aa2cb9bcb69da5d6e6ea6a3e16a4c3d19d776e5c89a14f177baa202a044c5da`.

```ts
export * as LeanEngine from "./lean-engine"

export const legacy = "hugr-lean@0.2.0:4e46ae0534937bdf" as const
/** Lossless 0.2.0 engine; its saved decisions stay decodable after the 0.4.0 upgrade. */
export const lossless = "hugr-lean@0.2.0:369206cd0a468904" as const
/** Parent updates this only after verifying the immutable package artifact (sha256 prefix). */
export const current = "hugr-lean@0.4.0:5ff983c58aa056d8" as const
export type ID = typeof legacy | typeof lossless | typeof current
export const accepted: readonly string[] = Object.freeze([legacy, lossless, current])
```

## Q076 — packages/schema/src/lean-metrics.ts

Strict decoder of numeric provenance and arithmetic, separate from factual truth.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ece2b32793cf3de837103ef42e34814b64287837`; full-source SHA256 `4e8243211ee2df7b02689db54c57c61134d43f347a9154c7d31fb06e0744568b`; 6213 source bytes.

Lines 28–56; byte offsets [1299, 3765); 2466 bytes; span SHA256 `0a0c070d146c86a105aabc8bd60c89972b2599a893f5fe71d8074429a1dbe40f`.

```ts
export const decode: (value: unknown) => Decision | undefined = (value) => {
  try {
    const root = record(value, ["version", "scope", "owner", "orchestraProfile", "model", "engine", "itemID", "producer",
      "eligible", "status", "reason", "filterProfile", "bytes", "tokens", "durationMs"])
    if (!root || root.version !== 1 || root.scope !== "standard-registry"
      || typeof root.engine !== "string" || !LeanEngine.accepted.includes(root.engine)
      || (root.itemID !== undefined && (typeof root.itemID !== "string" || !LeanCoverage.ids.some((id) => id === root.itemID)))
      || (root.producer !== "native-shell" && root.producer !== "native-tool" && root.producer !== "unverified")
      || typeof root.eligible !== "boolean" || (root.eligible && root.producer === "unverified")
      || (root.status !== "applied" && root.status !== "normalized" && root.status !== "passthrough")
      || !text(root.reason) || typeof root.durationMs !== "number" || !Number.isFinite(root.durationMs) || root.durationMs < 0
      || (root.orchestraProfile !== undefined && !text(root.orchestraProfile))
      || (root.filterProfile !== undefined && !text(root.filterProfile))) return undefined
    const mappedItem = typeof root.filterProfile === "string" ? LeanCoverage.forProfile(root.filterProfile) : undefined
    if (root.itemID !== undefined && mappedItem !== undefined && root.itemID !== mappedItem) return undefined
    const owner = record(root.owner, ["projectID", "location", "sessionID", "callID"])
    const model = record(root.model, ["provider", "id"])
    const bytes = counts(root.bytes)
    const token = record(root.tokens, ["kind", "counter", "before", "after", "saved"])
    if (!owner || !text(owner.projectID) || !text(owner.location, 4096) || !text(owner.sessionID) || !text(owner.callID)
      || !model || !text(model.provider) || !text(model.id) || !bytes || !token) return undefined
    const tokens: Decision["tokens"] | undefined = token.kind === "unavailable" && Object.keys(token).length === 1
      ? Object.freeze({ kind: "unavailable" })
      : token.kind === "estimated" && token.counter === "chars-per-token-4"
        ? estimated(token) : undefined
    if (!tokens) return undefined
    if (root.status === "passthrough") {
      if (bytes.saved !== 0 || (tokens.kind === "estimated" && tokens.saved !== 0)) return undefined
    } else if (!root.eligible || root.producer === "unverified" || bytes.saved <= 0) return undefined
```

Lines 67–92; byte offsets [4520, 5931); 1411 bytes; span SHA256 `4f518d3081930d1bd1b742ddc3e07d7e9fca3d28a7cb0d49a972572c434221ae`.

```ts
  } catch {
    return undefined
  }
}

// Snapshot only own whitelisted fields, once. Never retain caller-owned objects or accessors.
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  const own = Reflect.ownKeys(value)
  if (own.some((key) => typeof key !== "string" || !keys.includes(key))) return undefined
  return Object.fromEntries(own.map((key) => [key, Reflect.get(value, key)]))
}

function text(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
}

function counts(value: unknown): Decision["bytes"] | undefined {
  const part = record(value, ["before", "after", "saved"])
  if (!part || typeof part.before !== "number" || typeof part.after !== "number" || typeof part.saved !== "number"
    || !Number.isSafeInteger(part.before) || part.before < 0 || !Number.isSafeInteger(part.after) || part.after < 0
    || !Number.isSafeInteger(part.saved) || part.saved !== part.before - part.after) return undefined
  return Object.freeze({ before: part.before, after: part.after, saved: part.saved })
```

## Q077 — packages/schema/src/rag-studio.ts

Lexical-only pipeline and staged retrieval diagnostics.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b553ee9dc72cbb7d87ff01eba7cb7608a5ab89df`; full-source SHA256 `948d52ca2c846da8059bb297a8e564aa82e5cec5dc1edf97906eb010f71b9918`; 6596 source bytes.

Lines 5–18; byte offsets [76, 632); 556 bytes; span SHA256 `faf053113abe8ab39b0634bfda65f8474e8dc225877df61495949e626b99c46c`.

```ts
export const FileStatus = Schema.Literals(["not_yet_read", "read", "failed"]).annotate({
  identifier: "RagStudioFileStatus",
})
export type FileStatus = typeof FileStatus.Type

export const Light = Schema.Literals(["not_in_corpus", "search_miss", "dropped_before_model", "sent"]).annotate({
  identifier: "RagStudioLight",
})
export type Light = typeof Light.Type

export const PassName = Schema.Literals(["reparse", "rechunk", "redo_numbers", "orphan_delete"]).annotate({
  identifier: "RagStudioPassName",
})
export type PassName = typeof PassName.Type
```

Lines 47–55; byte offsets [1539, 1867); 328 bytes; span SHA256 `a5a5a621b904e73a6121f5488ac59d5eec39ef8a764b0916d4e7788e39ac9e48`.

```ts
export interface Pipeline extends Schema.Schema.Type<typeof Pipeline> {}
export const Pipeline = Schema.Struct({
  parser: Schema.String,
  boundary: Schema.String,
  tokenizer: Schema.String,
  lexical: Schema.Literal(true),
  embedding: Schema.Literal(false),
  k: Schema.Int,
}).annotate({ identifier: "RagStudioPipeline" })
```

Lines 80–96; byte offsets [2621, 3320); 699 bytes; span SHA256 `5eff1caf09403aae534968b35460aa0b88a74c85c38eb02851d96c48c5ad2157`.

```ts
export interface QuestionResult extends Schema.Schema.Type<typeof QuestionResult> {}
export const QuestionResult = Schema.Struct({
  revisionId: Schema.String,
  light: Schema.NullOr(Light),
  reasons: Reasons,
  fileStatus: Schema.NullOr(FileStatus),
  span: Schema.NullOr(Span),
  hits: Schema.Array(Schema.String),
  dropped: Schema.Array(Schema.String),
  promptText: Schema.String,
  promptChunkIds: Schema.Array(Schema.String),
  retrievalOptional: Schema.Boolean,
}).annotate({ identifier: "RagStudioQuestionResult" })

export const AdmitResult = Schema.Union([Source, Schema.Struct({ refused: Schema.Literals(["atlas", "permission"]) })]).annotate({
  identifier: "RagStudioAdmitResult",
})
```

## Q078 — packages/schema/src/research.ts

Strict binding/evidence/receipt structures with completeness and host-owned card declarations.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f865f7cd4cd76eb7e89f562c155d8593b69af369`; full-source SHA256 `f00d57a9f6d3bb1888518816fa277be35884469d9a16050f90d5edad8f768236`; 20129 source bytes.

Lines 10–22; byte offsets [329, 1025); 696 bytes; span SHA256 `ec9b7448508bbd72e298802f4219a85f4642e5008fe87c62798f827f96192c98`.

```ts
function recordID<const Name extends string>(name: Name, prefix: string) {
  return Schema.String.check(Schema.isPattern(new RegExp(`^${prefix}[0-9A-Za-z]{26}(?![\\s\\S])`))).pipe(
    Schema.brand(name),
    statics((schema) => ({ create: () => schema.make(prefix + ascending()) })),
  )
}

function struct<const Fields extends Schema.Struct.Fields>(name: string, fields: Fields) {
  return Schema.Struct(fields).annotate({ identifier: name, parseOptions: { onExcessProperty: "error" } })
}

const text = (limit: number) => Schema.NonEmptyString.check(Schema.isMaxLength(limit))
const list = <S extends Schema.Top>(schema: S, limit = 32) => Schema.Array(schema).check(Schema.isMaxLength(limit))
```

Lines 52–60; byte offsets [2864, 3121); 257 bytes; span SHA256 `f46699d9880cacf3ab5a9b9e93593eed496371d05c8bd2d25859711eb8a351bd`.

```ts
export const Binding = struct("Research.Binding", {
  projectID: Project.ID,
  memberID: Schema.Literal("jimmy"),
  taskId: text(256),
  executionSessionID: SessionID,
  authoritySessionID: SessionID,
  directory: AbsolutePath,
  worktree: AbsolutePath,
})
```

Lines 72–94; byte offsets [3393, 4396); 1003 bytes; span SHA256 `1ba74cba188c05d3cbb7333bd4967dc33fa3295fbf6ce8f14c621fd1af24a994`.

```ts
export const Locator = Schema.Union([
  // An absent basis is "retained": historical rows decode, and their canonical digests stay unchanged (J5.3).
  struct("Research.LineLocator", {
    kind: Schema.Literal("lines"), start: PositiveInt, end: PositiveInt, basis: optional(Schema.Literals(["original", "retained"])),
  }),
  struct("Research.QuoteLocator", {
    kind: Schema.Literal("quote"),
    exact: text(8192),
    prefix: optional(text(4096)),
    suffix: optional(text(4096)),
  }),
  struct("Research.JsonLocator", { kind: Schema.Literal("json"), pointer: Schema.String.check(Schema.isMaxLength(2048)) }),
])
export type Locator = typeof Locator.Type

export const SourceRef = struct("Research.SourceRef", {
  artifact: Capability.ArtifactRef,
  representation: Representation,
  digest: Digest,
})
export type SourceRef = typeof SourceRef.Type
export const EvidenceRef = struct("Research.EvidenceRef", { source: SourceRef, locator: Locator })
export type EvidenceRef = typeof EvidenceRef.Type
```

Lines 100–126; byte offsets [4689, 5575); 886 bytes; span SHA256 `ab5c9df716d86abfb16de399e83730046acf144966021c5e4b0111d822a38e7e`.

```ts
export const SourceReceipt = struct("Research.SourceReceipt", {
  binding: Binding,
  ref: SourceRef,
  origin: struct("Research.SourceOrigin", {
    kind: Schema.Literals(["file", "url", "tool-output", "atlas-own"]),
    uri: text(8192),
    revision: optional(text(256)),
  }),
  capturedAt: NonNegativeInt,
  mediaType: text(256),
  bytes: NonNegativeInt,
  complete: Schema.Boolean,
  derivedFrom: optional(SourceRef),
  transformation: optional(text(256)),
  // Locators address the retained representation from line 1, not original-file coordinates.
  observed: optional(struct("Research.SourceExtent", {
    byteStart: NonNegativeInt,
    lineStart: optional(PositiveInt),
    lineEnd: optional(PositiveInt),
  })),
  atlas: optional(struct("Research.AtlasSource", {
    sourceIdentity: Digest,
    unit: text(256),
    contentHash: text(256),
    receiptHash: Digest,
  })),
})
```

Lines 297–307; byte offsets [13491, 14091); 600 bytes; span SHA256 `a7136ae1ffd9fb451cd6a18a1554cfb51d08462c4cf3be221d23ebdcacd37ab3`.

```ts
export const Allowance = struct("Research.Allowance", {
  binding: Binding,
  dispatchCallID: text(256),
  // Version 1 bindings admitted before tiers existed were all quick; decoding them keeps that allowance.
  tier: Depth.pipe(Schema.withDecodingDefaultKey(Effect.succeed("quick" as const))),
  providerLimit: PositiveInt,
  toolLimit: PositiveInt,
  byteLimit: PositiveInt,
  deadlineSeconds: PositiveInt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(Tiers.quick.deadlineSeconds))),
  probeSecondsLimit: PositiveInt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(ProbeSeconds.quick))),
})
```

Lines 374–383; byte offsets [18015, 18484); 469 bytes; span SHA256 `003c57155ab55cf48e88460578d953d8da873cc19393cc2c161987f9920d055e`.

```ts
/** Assembled by the host on close; the model never writes card JSON (J5.12). */
export const CardV2 = struct("Research.CardV2", {
  schema: Schema.Literal("jimmy-card-v2"),
  answer: Schema.String.check(Schema.isMaxLength(32768)),
  profile: Profile,
  depth: Depth,
  sufficiency: Sufficiency,
  subquestions: list(struct("Research.CardSubquestion", {
    ref: RecordRef, question: text(4096), status: Schema.Literals(["answered", "partial", "uncovered"]),
  }), 6),
```

## Q079 — packages/schema/src/research-event.ts

Research session-ledger source/record/document/allowance and inquiry event ownership.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b56f5ea8ffae64cf95de91e8a9b48e932edfe241`; full-source SHA256 `1e50a53af6b60e2c7839aecda7984fe29ad7c416940b8bc104b98d60d6af3b03`; 2844 source bytes.

Lines 9–39; byte offsets [237, 1323); 1086 bytes; span SHA256 `61d2ed59c6b8696fed396af258cc081a41affee2811805b75a55c19d570dba01`.

```ts
const operation = {
  sessionID: SessionID,
  operation: Schema.NonEmptyString,
  inputHash: Research.Digest,
  binding: Research.Binding,
}

export const SourceAdmitted = Event.define({
  type: "research.source.admitted",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, receipt: Research.SourceReceipt },
})
export const SourceAttempted = Event.define({
  type: "research.source.attempted",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, receipt: Research.AttemptReceipt },
})
export const SourceRequested = Event.define({
  type: "research.source.requested",
  durable: { version: 1, aggregate: "sessionID" },
  schema: operation,
})
export const RecordCommitted = Event.define({
  type: "research.record.committed",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, record: Research.Record },
})
export const DocumentPublished = Event.define({
  type: "research.document.published",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, receipt: Research.DocumentReceipt },
```

Lines 55–72; byte offsets [1928, 2844); 916 bytes; span SHA256 `50848e6ddc3cdff0461298b303668ac8b01a5f25e8591dfe60340ad00a037d8e`.

```ts
// One dispatch's inquiry (J5.1): opened over its question records, each check, and the close that carries the card.
export const InquiryOpened = Event.define({
  type: "research.inquiry.opened",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, ...Research.InquiryOpened.fields },
})
export const InquiryChecked = Event.define({
  type: "research.inquiry.checked",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, ...Research.InquiryChecked.fields },
})
export const InquiryClosed = Event.define({
  type: "research.inquiry.closed",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, ...Research.InquiryClosed.fields },
})
export const Definitions = Event.inventory(SourceAdmitted, SourceRequested, SourceAttempted, RecordCommitted, DocumentPublished,
  AllowanceBound, AllowanceCharged, InquiryOpened, InquiryChecked, InquiryClosed)
```

## Q080 — packages/schema/src/relay-arm.ts

Publication versus authority and plan/execution/task binding; host-owned checks and checkpoint intent.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9f08a74f49e3d1de47e5679a11c61482818360d6`; full-source SHA256 `60622efd23c1ac59af2e93d6087369118876b74c3efa1ce693f03f7669b0421b`; 14265 source bytes.

Lines 23–60; byte offsets [1000, 2973); 1973 bytes; span SHA256 `d54351d6a1583a249c394724336730a98aa0ee934c8c2808f0378d91db0fcb5a`.

```ts
// Host-acquired publication identity, not authorship or execution authority. Document/version IDs are existing
// Authoring IDs (strings); the immutable body's save-time active flags never establish live publication.
export const Publication = Schema.Struct({
  projectID: ProjectID,
  documentID: RelayAuthoring.Document.fields.id,
  activeVersionID: RelayAuthoring.Version.fields.versionId,
  immutableVersionBodyChecksum: Hex64,
  livePublicationChecksum: Hex64,
}).annotate({ identifier: "RelayArm.Publication" })
export interface Publication extends Schema.Schema.Type<typeof Publication> {}

export const Materialization = Schema.Struct({
  schemaIdentifier: Schema.Literal("RelaySprint.Sprint"),
  digest: Hex64,
  byteLength: NonNegativeInt,
}).annotate({ identifier: "RelayArm.Materialization" })
export interface Materialization extends Schema.Schema.Type<typeof Materialization> {}

// The inputs covered by the existing Plan/Task hash payload. Attribution remains in the upstream-owned V3 revision.
export const WorkflowDefinition = Schema.Struct({
  publication: Publication,
  materialization: Materialization,
  resolvedSkills: Schema.Array(RelayAuthoring.SkillBinding),
  parameters: Schema.Record(Schema.String, Schema.String),
  writePaths: Schema.Array(Schema.NonEmptyString),
  knowledge: optional(Schema.Array(AtlasKnowledge.Anchor)),
}).annotate({ identifier: "RelayArm.WorkflowDefinition" })
export interface WorkflowDefinition extends Schema.Schema.Type<typeof WorkflowDefinition> {}

export const WorkflowBinding = Schema.Struct({
  definition: WorkflowDefinition,
  // External reference to the actual persisted revision; excluded from that revision's own hashed body.
  planRevisionID: Event.ID,
  executionSessionID: SessionID,
  authoritySessionID: SessionID,
  logicalTaskID: Schema.NonEmptyString,
}).annotate({ identifier: "RelayArm.WorkflowBinding" })
export interface WorkflowBinding extends Schema.Schema.Type<typeof WorkflowBinding> {}
```

Lines 151–161; byte offsets [6560, 7078); 518 bytes; span SHA256 `49eff8d115ddc58058c409cae17e53d70a6668225126afaa1ffb2627caeb5100`.

```ts
export interface HostCheckInput {
  readonly token: Token
  readonly sessionID?: string
  readonly gateID: string
  readonly check: { readonly id: string; readonly hostCheck: Id }
  // HEAD as the revision guard read it before the checks, for the result's provenance (WP18, additive).
  readonly revision?: string
}

// A failed or defective callback is an `acquisition-error` result, never a pass. Checks run one at a time, 60 s each.
export type HostCheck = (input: HostCheckInput) => Effect.Effect<HostCheckResult>
```

Lines 231–239; byte offsets [9661, 10237); 576 bytes; span SHA256 `b20cc967de7c570366b836509ff7640f802bd6824474e27b0db8f291f5272653`.

```ts
// A pending checkpoint is a fence: interrupted evaluation cannot be retried against a provider turn. The same-lock
// evaluator adapter reconciles a durable disposition before completing it; missing evidence is a named HOLD.
export const WorkflowCheckpoint = Schema.Struct({
  binding: WorkflowBinding,
  settlement: WorkflowSettlement,
  phase: Schema.Literals(["pending", "settled"]),
  evaluation: optional(Evaluation),
}).annotate({ identifier: "RelayArm.WorkflowCheckpoint" })
export interface WorkflowCheckpoint extends Schema.Schema.Type<typeof WorkflowCheckpoint> {}
```

Lines 262–284; byte offsets [11027, 12186); 1159 bytes; span SHA256 `d0228a04dbfd83bbfd7e2949653aacf1d0266da320242f59f7292374925435a5`.

```ts
// ---- Arsenal completion contract, verbatim from orchestra/src/maestro/arsenal-completion.ts (moves here in WP18). ----
// The ≤1000 total checks and unique gate/check IDs rule stays in the host, where it maps to
// `completion-callback-cap-or-duplicate` rather than to a decode failure.

const ContractID = Id
export const Contract = Schema.Struct({
  sessionID: ContractID,
  label: Schema.NonEmptyString.check(Schema.isMaxLength(4096)),
  retryBudget: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(32))),
  // Absent on a workflow Task's arm: the host arms the approved plan's own controls. An ordinary Task's arm needs it.
  chain: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: ContractID,
        instructions: Schema.optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
        checks: Schema.Array(Schema.Struct({ id: ContractID, hostCheck: ContractID })).check(
          Schema.isMinLength(1),
          Schema.isMaxLength(64),
        ),
      }),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  ),
}).annotate({ identifier: "RelayArm.Contract" })
```

## Q081 — packages/schema/src/relay-authoring.ts

Incomplete draft contract preserves unknown keys; immutable version separate from live publication.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5582a1f0bd68eed7c2b7cbc9b89fdb61f66cd3f0`; full-source SHA256 `dfd159dc2c26332084691ca95d6cd085d494209c3fa5cfc1032e30cd250c2458`; 8044 source bytes.

Lines 7–10; byte offsets [184, 563); 379 bytes; span SHA256 `5e59ab8e65d182697df135abbdcaaeb6e736653bf17d14b8fb4a111eaaba3e59`.

```ts
// Authoring documents in the relay_authoring shape (graph.py, store.py). A saved document may be an incomplete draft:
// node parameters stay open here and are checked by compile, which records diagnostics instead of refusing a save.
// Stored documents are Relay data, so unknown keys are preserved.
const preserve = { parseOptions: { onExcessProperty: "preserve" } } as const
```

Lines 100–125; byte offsets [4816, 5920); 1104 bytes; span SHA256 `d7d75ae8fb1046ec714cb378141c9de4bf20eb87012a6799162ced18ace75649`.

```ts
// Timestamps are ISO-8601 UTC with a `Z` suffix; `versionId` is a fresh UUID per save, the draft revision guard.
export const Document = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
  nodes: Schema.Array(Node),
  connections: Connections,
  nodeGroups: Schema.optionalKey(Schema.Array(NodeGroup)),
  tags: Schema.Array(Tag),
  isArchived: Schema.Boolean,
  active: Schema.Boolean,
  activeVersionId: Schema.NullOr(Schema.String),
  meta: Meta,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  versionId: Schema.String,
  versionCounter: NonNegativeInt,
}).annotate({ identifier: "RelayAuthoring.Document", ...preserve })
export interface Document extends Schema.Schema.Type<typeof Document> {}

// The immutable body the `versions` table holds: one per publish (older stores also wrote one per save).
export const Version = Schema.Struct({ ...Document.fields, workflowId: Schema.String }).annotate({
  identifier: "RelayAuthoring.Version",
  ...preserve,
})
export interface Version extends Schema.Schema.Type<typeof Version> {}
```

Lines 136–144; byte offsets [6221, 6645); 424 bytes; span SHA256 `f9b4b7b6eb72358b4c1021bbd8b081726cee5211bd525327c6a165849b302f52`.

```ts
// A skill resolved into a WP at compile time. Content and sha256 come from Orchestra's skill catalog.
export const SkillBinding = Schema.Struct({
  wp: Schema.String,
  skill: Schema.String,
  sha256: Hex64,
  mode: Schema.Literals(["combine", "replace"]),
  content: Schema.String,
}).annotate({ identifier: "RelayAuthoring.SkillBinding" })
export interface SkillBinding extends Schema.Schema.Type<typeof SkillBinding> {}
```

## Q082 — packages/schema/src/relay-external.ts

Decoded ledger-to-display projection, not chain integrity verification.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `789689060f9a2e572a6c0c4d039a2125dcf94b12`; full-source SHA256 `2196fe995cbc77faa580352b798c3d5d33286af9b9b83af9b3b790705dc89b58`; 7028 source bytes.

Lines 6–24; byte offsets [139, 1403); 1264 bytes; span SHA256 `806e973360283d90ab490eea6afee889f2271ea7de4e54c20c71f12e2227db72`.

```ts
// External runs: a LangGraph process gated by the Python library writes `<project>/.relay/runs/<runID>/`. The ledger
// is the only source of truth; `run.json` is a convenience snapshot that no reader trusts. Bodies are written in the
// order their structs list, optional fields only when set, then the chain suffix `gen` (always 0), `prev`, `seq`,
// `mac` (always `sha256`) and `h`, exactly as `LedgerChain.append` does.

export const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/

// One run per LangGraph `thread_id`. The writer names the run folder: the thread ID when it matches `RUN_ID`, else
// `t_` plus the first 32 hex characters of its SHA-256. Readers take the run ID from the folder name.

// Run-scoped events use LangGraph's reserved node names, which no user node can take, and attempt 0.
export const RUN_NODE = "__start__"
export const END_NODE = "__end__"

// The idempotency key `thread_id/node/attempt/kind`. `kind` is the event name, except `check.result:<check id>`, so
// every check of one attempt has its own key. The writer skips a body whose key is already on the ledger.
export function key(input: { thread_id: string; node: string; attempt: number; kind: string }) {
  return `${input.thread_id}/${input.node}/${input.attempt}/${input.kind}`
}
```

Lines 101–125; byte offsets [4076, 5270); 1194 bytes; span SHA256 `9466f1077db5edd01ac1b7de32ed551a209d86b1b409d5ee9c560e87a4d0642b`.

```ts
/**
 * Rebuilds the run in folder `runID` from decoded ledger bodies, in ledger order. Undefined unless the first body is `run.start`.
 *
 * Status: `parked` while the last approval.request has no decision, else `completed` when the last body is
 * `sprint-complete`, `failed` when it is `escalate`, else `running`: a resume after a terminal event appends to the
 * same run and makes it live again.
 */
export function runFromLedger(runID: string, bodies: ReadonlyArray<Body>): Run | undefined {
  const start = bodies[0]
  if (start === undefined || start.event !== "run.start") return undefined
  const last = bodies.at(-1)!
  const scoped = bodies.filter((body): body is Scoped => "attempt" in body)
  const request = scoped.findLast((body) => body.event === "approval.request")
  const escalated = last.event === "escalate" ? last : undefined
  const status: Run["status"] =
    request !== undefined &&
    !scoped.some(
      (body) => body.event === "approval.decision" && body.node === request.node && body.attempt === request.attempt,
    )
      ? "parked"
      : last.event === "sprint-complete"
        ? "completed"
        : escalated
          ? "failed"
          : "running"
```

Lines 155–172; byte offsets [6095, 7028); 933 bytes; span SHA256 `a213d4afefa570b484a6073ce5fd5c9cca144370dded2059c44be6b2b445fdcb`.

```ts
// A node's latest attempt decides its checks, status and note; its first start and latest end bound it.
function stepOf(node: string, bodies: ReadonlyArray<Scoped>, escalated: boolean): RunStep {
  const attempts = Math.max(...bodies.map((body) => body.attempt))
  const latest = bodies.filter((body) => body.attempt === attempts)
  const end = latest.findLast((body) => body.event === "step.end")
  const decision = latest.findLast((body) => body.event === "approval.decision")
  return {
    wp: node,
    status: escalated ? "escalated" : end?.outcome === "pass" ? "passed" : end ? "failed" : "running",
    attempts,
    startedAt: bodies.find((body) => body.event === "step.start")?.at,
    endedAt: end?.at,
    checks: latest.flatMap((body) =>
      body.event === "check.result" ? [{ id: body.id, verdict: body.verdict, output: body.output }] : [],
    ),
    note: decision?.note === "" ? undefined : decision?.note,
  }
}
```

## Q083 — packages/schema/src/relay-hook.ts

Strict structural export delegates graph validation and install authority.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `bbb8d99e0cd45965a82be8bc7ab228feb949e9d2`; full-source SHA256 `cab62a5613add88d07db99b340c5112c1942594d081687fd2b851dd890022388`; 8249 source bytes.

Lines 11–13; byte offsets [365, 659); 294 bytes; span SHA256 `ae4ce11db9f0dc5ef2e47ef8c0ada431f2454944a8aee621953ab684af8ed749`.

```ts
// `relay.hook.v1`: the published hook export (relay_authoring/hooks.py `compile_hook`) and the installs that pin it.
// Both are strict: an unknown key is an error, so a crafted export cannot smuggle fields past install.
const strict = { parseOptions: { onExcessProperty: "error" } } as const
```

Lines 125–157; byte offsets [5585, 6998); 1413 bytes; span SHA256 `1faa90cf414fb30e6b4bd15b75108f179d196b48308f4bf9450f512dd2733838`.

```ts
/**
 * The export. Structure only: the graph rules (one trigger, every node reachable, acyclic, ports in range, Block and
 * Approve only `before`) are `compile_hook`'s and the install writer's, with their own refusal messages.
 * `installed: false` is never install state; Orchestra's install record is.
 */
export const V1 = Schema.Struct({
  schema: Schema.Literal("relay.hook.v1"),
  name: NonEmptyNulFree,
  nodes: Schema.Array(Node),
  connections: Schema.Array(Connection),
  binding: Schema.Literal("host-required"),
  installed: Schema.Literal(false),
}).annotate({ identifier: "RelayHook.V1", ...strict })
export type V1 = typeof V1.Type

/**
 * One pinned install in `<Global.data>/<projectID>/profile/hooks.json`. `sha256` = sha256(json.compact(snapshot)).
 * `version` is the document versionId; `installedBy` the principal; `installedAt` epoch milliseconds.
 */
export const Install = Schema.Struct({
  installID: NonEmptyNulFree,
  document: Schema.String,
  version: Schema.String,
  sha256: Hex64,
  order: NonNegativeInt,
  enabled: Schema.Boolean,
  // Present while the hook document is unpublished: the install stays, but it does not fire until a publish.
  unpublished: Schema.optionalKey(Schema.Literal(true)),
  installedBy: Schema.String,
  installedAt: NonNegativeInt,
  snapshot: V1,
}).annotate({ identifier: "RelayHook.Install", ...strict })
export type Install = typeof Install.Type
```

Lines 165–172; byte offsets [7182, 7574); 392 bytes; span SHA256 `8f9642924f405e84d6c647c15665ae988ce18c5878e846d5579462e7a26ba274`.

```ts
/**
 * The durable decision of one matched hook action, written before any receipt. `trigger` is `<operation>.<timing>`.
 * `subject` is the path or sha256(command). `tool` and `callID` are absent for session triggers. `replier` is the
 * principal that answered an Approve.
 */
export const Decided = define({
  type: "relay.hook.decided",
  durable: { version: 1, aggregate: "sessionID" },
```

## Q084 — packages/schema/src/relay-ledger.ts

Original-byte verification boundary and non-authorizing allow outcomes.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7f4d6dc91d39f3df30ff9f4ee097ec77d4e758f5`; full-source SHA256 `e3aa70aef1e489b4957f2aa48b3da06fc5ce9edd0ae01f444ce16a19638d2291`; 14458 source bytes.

Lines 7–25; byte offsets [161, 1240); 1079 bytes; span SHA256 `c027166db95120098d9b5a358fb77030b96f602d0d3770b15091173185b62fa4`.

```ts
// One line of a Relay ledger (ledger.jsonl). Field names and key order are the Python writers', byte for byte:
// each body is written in the order its struct lists, optional fields only when set, and the chain suffix
// (`gen, prev, seq, mac, h`) is appended by `relay_chain_append`, with `h` as the final root member.
//
// These structs carry no excess-property annotation. Readers choose: `onExcessProperty: "error"` proves a line has
// exactly the known shape, `"preserve"` keeps lines from older writers readable. Integrity is never decided here:
// the verifier checks the original signed bytes and never reserializes a decoded line.

export const Mac = Schema.Literals(["sha256", "hmac-sha256"])
export type Mac = typeof Mac.Type

// Legacy lines may lack `gen` and `mac`; a missing `mac` verifies as plain sha256.
export const Chain = Schema.Struct({
  gen: Schema.optionalKey(NonNegativeInt),
  prev: Schema.Union([Schema.Literal("GENESIS"), Hex64]),
  seq: NonNegativeInt,
  mac: Schema.optionalKey(Mac),
  h: Hex64,
}).annotate({ identifier: "RelayLedger.Chain" })
```

Lines 263–280; byte offsets [10342, 10903); 561 bytes; span SHA256 `879b10bed4dabc204516308d8355ac027d397c4d278e4f94f35045ef87b5e335`.

```ts
/**
 * What one matched hook action decided. Per action: block → `blocked`; approve → `approved|rejected|cancelled`;
 * verify → `passed|failed|unavailable`; repair → `repair-required`; remind → `reminded`; record → `recorded`;
 * allow → `allowed` (Allow grants nothing; it only records that no restrictive action fired on that path).
 */
export const HookOutcome = Schema.Literals([
  "blocked",
  "approved",
  "rejected",
  "cancelled",
  "passed",
  "failed",
  "unavailable",
  "repair-required",
  "reminded",
  "recorded",
  "allowed",
])
```

Lines 349–367; byte offsets [13456, 14071); 615 bytes; span SHA256 `be1c257f52b8c88fcd535d0aa7d8947f0d0f9513c311e7e85acf90e4ffb6fd51`.

```ts
// Every line kind the TS engine writes or reads. The arm envelope precedes the CLI envelope: both share event names,
// and only the arm form carries `arm`, `round` and `repeat`. The daemon's ask notes are not ported and do not decode.
export const Entry = Schema.Union([
  ArmEnvelopeLine,
  GateEnvelopeLine,
  ChecklistItemLine,
  RegressionItemLine,
  CapRiskLine,
  HumanReleaseLine,
  UnknownKindLine,
  InjectLine,
  InjectMissingLine,
  BlockedClaimLine,
  WpDispatchedLine,
  RunCancelledLine,
  GateRecoveredLine,
  HookDecisionLine,
  HookLifecycleLine,
]).annotate({ identifier: "RelayLedger.Entry" })
```

## Q085 — packages/schema/src/relay-run.ts

Supervisor-owned run events are distinct from Relay arm ledger.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `37c6b62baef5ccff525369651cb2098733f0183d`; full-source SHA256 `b3d1ba52e5615e08d8472f9958b44b22f6c322310cc6bbb739a71e41d1aef3b0`; 3879 source bytes.

Lines 14–20; byte offsets [469, 896); 427 bytes; span SHA256 `8efb377153e96318ec77e24b4af31180d32f39ae411ade2ee9e656304ed16baf`.

```ts
// Durable workflow-run events, aggregated by run. The supervisor writes them; the arm ledger stays Relay's.
const durable = { version: 1, aggregate: "runID" } as const

/**
 * A run was admitted against a published document version. `token` is the arm (`run-<runID>`); `params` are the
 * values exposed to checks as environment variables (`base_ref`, `repo_root`, `wp_dir`, …); `actor` is the principal
 * that started it.
```

Lines 41–55; byte offsets [1355, 1789); 434 bytes; span SHA256 `58333fcb8199db7ffd4c58dd83b68fd0a07d16ed0d787797784a25718be0df8b`.

```ts
// A WP attempt reserved its Session and prompt before either exists, so a crash never dispatches twice.
export const Reserved = define({
  type: "relay.wp.reserved",
  durable,
  schema: {
    runID: Schema.String,
    wp: Schema.String,
    index: NonNegativeInt,
    sessionID: SessionID,
    promptID: SessionMessage.ID,
    prompt: Prompt,
    permissions: Permission.Ruleset,
  },
})
export type Reserved = typeof Reserved.Type
```

Lines 91–109; byte offsets [2684, 3703); 1019 bytes; span SHA256 `bdc1b8413f622443f8f266cf0032470ad4e7256b9c69c89c3ba55ba5e3fa8fec`.

```ts
// Lifecycle transitions. `principal` is who acted (release and cancel); `audit` is the `relay verify` result that
// `completed` requires to be PASS.
const lifecycle = {
  runID: Schema.String,
  principal: optional(Schema.String),
  reason: optional(Schema.String),
  audit: optional(RelayLedger.AuditResult),
}

export const Parked = define({ type: "relay.run.parked", durable, schema: lifecycle })
export type Parked = typeof Parked.Type
export const Released = define({ type: "relay.run.released", durable, schema: lifecycle })
export type Released = typeof Released.Type
export const CancelRequested = define({ type: "relay.run.cancel-requested", durable, schema: lifecycle })
export type CancelRequested = typeof CancelRequested.Type
export const Cancelled = define({ type: "relay.run.cancelled", durable, schema: lifecycle })
export type Cancelled = typeof Cancelled.Type
export const Completed = define({ type: "relay.run.completed", durable, schema: lifecycle })
export type Completed = typeof Completed.Type
```

## Q086 — packages/schema/src/relay-sprint.ts

Preserved original plan fields and deliberately limited control validation.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ef5f26e66e7e45db4b018a98bd33107fe34cfeca`; full-source SHA256 `27a4d8fd186535ba617e23d3f41430de0ae90b48b54a79b843fc1a7546b599f6`; 5527 source bytes.

Lines 7–14; byte offsets [167, 694); 527 bytes; span SHA256 `c6b0b7667b2198d0e37697bbce617a8d9eb228c1e50d18e001d2a589a39f0fc4`.

```ts
// Relay plan files (sprint.json). Field names are the Python Relay's, byte for byte. Relay files are validated,
// never re-encoded: the engine keeps the original bytes, so every struct here preserves unknown keys
// (`type`, `model`, `rubric`, `output_contract`, … are ignored by the runtime but stay on disk).
const preserve = { parseOptions: { onExcessProperty: "preserve" } } as const
const knowledge = Schema.Array(AtlasKnowledge.Reference).check(
  Schema.isMaxLength(AtlasKnowledge.MAX_UNITS),
  Schema.isUnique(),
)
```

Lines 27–50; byte offsets [1238, 2664); 1426 bytes; span SHA256 `9db00d4ebe730ecdd5188c9e8949390e6f668bf57fcd5f7ad7ba2cc96519c5d3`.

```ts
/**
 * One checklist control. `cmd`, `judge` and `paths` stay unrefined on purpose: a non-string or NUL-carrying value is
 * not a load error but a named runtime failure (`unavailable(invalid-command)`, `judge:unavailable(invalid-criterion)`,
 * `judge:unavailable(invalid-scope)`), exactly as `relay_run_checklist` records it.
 */
export const Control = Schema.Struct({
  id: NonEmptyNulFree,
  assert: Schema.optionalKey(Schema.NullOr(Schema.String)),
  cmd: Schema.optionalKey(Schema.NullOr(Schema.String)),
  judge: Schema.optionalKey(Schema.NullOr(Schema.String)),
  blocking: Schema.optionalKey(Schema.Boolean),
  diff: Schema.optionalKey(Schema.Boolean),
  context: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
  origin: Schema.optionalKey(Schema.String),
  policy: Schema.optionalKey(Schema.String),
  // TS-only, additive: an Arsenal host-check control, graded by a registered host callback instead of bash (§6).
  host_check: Schema.optionalKey(Id),
}).annotate({ identifier: "RelaySprint.Control", ...preserve })
export interface Control extends Schema.Schema.Type<typeof Control> {}

// `human` is accepted by the compiler and lint but unsupported by the arm: evaluating it records `unknown-kind`.
export const Kind = Schema.Literals(["execute", "gate", "review", "inject", "human"])
export type Kind = typeof Kind.Type
```

Lines 94–109; byte offsets [4765, 5527); 762 bytes; span SHA256 `fa26f42e22bbdb7dc6cb64bf4b213104793ba0f1bec9ce87b17f09bdd2980d70`.

```ts
/**
 * A Relay plan. Defaults are applied by the engine, never written back: absent `retry_budget` means 3, absent `gen`
 * means 0, and a `gen` that is not a nonnegative integer also resolves to 0 when stamped into the ledger.
 */
export const Sprint = Schema.Struct({
  brief: Schema.optionalKey(Schema.String),
  gen: Schema.optionalKey(Schema.Number),
  // Compared with bash `-ge`, so only integers ever ran.
  retry_budget: Schema.optionalKey(Schema.Int),
  macros: Schema.optionalKey(Schema.Array(Macro)),
  knowledge: optional(knowledge),
  work_packages: Schema.Array(WorkPackage),
}).annotate({ identifier: "RelaySprint.Sprint", ...preserve })
export interface Sprint extends Schema.Schema.Type<typeof Sprint> {}

export const DEFAULT_RETRY_BUDGET = 3
```

## Q087 — packages/schema/src/guardrail.ts

Rules, findings and engine acquisition/report errors are DTOs.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1f9e89fb3ec9259b12d268e17103bd19a2658bee`; full-source SHA256 `ccb59e972d3536ebcc8f498604f5b97f66b50402ef23e493c1087b57766e0455`; 3766 source bytes.

Lines 5–7; byte offsets [75, 379); 304 bytes; span SHA256 `76f7bf9b85f4039d970c9e93a1255c708fed618b61576469d6dce8bb4e69c40e`.

```ts
// Guardrail: declarative CI guard rules (script/guards) judged against a change. These shapes mirror the
// engine's `--rules` and `--json` output, which is the contract the app screen is built on.
export const Severity = Schema.Literals(["gate", "warn"]).annotate({ identifier: "Guardrail.Severity" })
```

Lines 21–27; byte offsets [648, 1055); 407 bytes; span SHA256 `6765663844c2e3abd74bb43c1725029385e563c80615fc352ac36d1b8c9f2200`.

```ts
export const RuleKind = Schema.Literals(["added-lines", "changed-paths", "line-balance"]).annotate({
  identifier: "Guardrail.RuleKind",
})
export type RuleKind = typeof RuleKind.Type

// How a finding is cleared: fix the code, add a `guardrail-ignore` line, or get an approver's label.
export const ClearedBy = Schema.Literals(["fix", "ignore", "approval"]).annotate({ identifier: "Guardrail.ClearedBy" })
```

Lines 77–100; byte offsets [2684, 3766); 1082 bytes; span SHA256 `5b362199f243e04fb2f8cd7d4968867b47ca425117c27442feb29a081fc5c6c8`.

```ts
export const Report = Schema.Struct({
  base: Schema.NullOr(Schema.String),
  bootstrap: Schema.Boolean,
  rules: Schema.Int,
  files: Schema.Int,
  // Gate findings first, then by path and line.
  findings: Schema.Array(Finding),
  errors: Schema.Array(RunError),
  approved: Schema.Array(Schema.String),
  touchesGuards: Schema.Boolean,
}).annotate({ identifier: "Guardrail.Report" })
export interface Report extends Schema.Schema.Type<typeof Report> {}

export const RunInput = Schema.Struct({
  // Target branch to judge the change against; the engine defaults to origin/dev.
  base: Schema.optional(Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))),
}).annotate({ identifier: "Guardrail.RunInput" })
export interface RunInput extends Schema.Schema.Type<typeof RunInput> {}

// The engine could not be started at all, as opposed to running and reporting `errors`.
export const EngineErrorKind = Schema.Literals(["no-engine", "no-bun", "failed", "unreadable"]).annotate({
  identifier: "Guardrail.EngineErrorKind",
})
export type EngineErrorKind = typeof EngineErrorKind.Type
```

## Q088 — packages/schema/src/elf.ts

Pure ELF64-LE byte admission and libc dependency check.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `18147b545a3acecee29244bfa5c7ca26e4c9c323`; full-source SHA256 `8a9e55857aaabcc07c109dbf34fdfa9cfa80004ba7a8af0feee1eb5fe1578e5e`; 5321 source bytes.

Lines 3–15; byte offsets [33, 849); 816 bytes; span SHA256 `e9e3ac03407f23ff42a6658e5b9aa7a7ef86a228078422eb4ac0ad8ebddc8d08`.

```ts
// Pure ELF64 byte admission shared by producers and packaged runtime loaders.
// No filesystem, process, platform detection or module loading at this boundary.
export function inspect(bytes: Uint8Array, label = "ELF bytes") {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const span = (offset: number, size: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > bytes.length)
      throw new Error(`ELF_TRUNCATED: ${label}`)
    return offset
  }
  span(0, 64)
  if (![127, 69, 76, 70, 2, 1, 1].every((value, i) => bytes[i] === value) || view.getUint16(54, true) !== 56 ||
      ![2, 3].includes(view.getUint16(16, true)) || view.getUint32(20, true) !== 1)
    throw new Error(`ELF64_UNSUPPORTED: ${label}`)
```

Lines 72–89; byte offsets [4280, 5321); 1041 bytes; span SHA256 `f7080eeb70a12cc419199b57876ce0d42908498e193fe58490583effaa58dcda`.

```ts
  if ((tables.length || sizes.length || needed.length) && (tables.length !== 1 || sizes.length !== 1))
    throw new Error(`ELF_STRING_TABLE_INVALID: ${label}`)
  const table = tables.length ? mapped(tables[0]!, sizes[0]!) : undefined
  const dependencies = needed.map((n) => {
    if (table === undefined || n >= sizes[0]!) throw new Error(`ELF_STRING_TABLE_INVALID: ${label}`)
    return strings(table + Number(n), Number(sizes[0]! - n))
  })
  return { machine: view.getUint16(18, true), interpreter, needed: dependencies }
}

export function requireLibc(bytes: Uint8Array, expected: "musl" | "glibc", label = "ELF bytes") {
  const elf = inspect(bytes, label)
  const musl = elf.needed.some((name) => /^(?:libc\.musl-(?:x86_64|aarch64)\.so\.1|ld-musl-(?:x86_64|aarch64)\.so\.1|libc\.so)$/.test(name))
  const glibc = elf.needed.includes("libc.so.6")
  if (expected === "musl" ? !musl || glibc : !glibc || musl)
    throw new Error(`ELF_LIBC_MISMATCH: ${label}: expected ${expected}; needed ${JSON.stringify(elf.needed)}`)
  return elf
}
```

## Q089 — packages/schema/src/index.ts

Public shared-module reexport inventory, not runtime logic.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cfd60052ec047b947dd7c9cb9bc534cc02b9d1c5`; full-source SHA256 `75954b80578c1daf1edd4736ae6447b08d928dc8a076ac85ac09997202b068dc`; 1554 source bytes.

Lines 1–39; byte offsets [0, 1554); 1554 bytes; span SHA256 `75954b80578c1daf1edd4736ae6447b08d928dc8a076ac85ac09997202b068dc`.

```ts
export { Agent } from "./agent"
export { Actions } from "./actions"
export { AgentFile } from "./agent-file"
export { Behavior } from "./behavior"
export { Board } from "./board"
export { Capability } from "./capability"
export { Command } from "./command"
export { Connection } from "./connection"
export { Credential } from "./credential"
export { Event } from "./event"
export { FileSystem } from "./filesystem"
export { Formatter } from "./formatter"
export { Integration } from "./integration"
export { LLM } from "./llm"
export { Location } from "./location"
export { Lsp } from "./lsp"
export { MaestroEvent } from "./maestro-event"
export { Model } from "./model"
export { Permission } from "./permission"
export { PermissionSaved } from "./permission-saved"
export { Project } from "./project"
export { ProjectCopy } from "./project-copy"
export { Provider } from "./provider"
export { Reference } from "./reference"
export { Research } from "./research"
export { ResearchEvent } from "./research-event"
export { Revert } from "./revert"
export { ScheduledTask } from "./scheduled-task"
export { Session } from "./session"
export { SessionInput } from "./session-input"
export { SessionMessage } from "./session-message"
export { Skill } from "./skill"
export { Pty } from "./pty"
export { PtyTicket } from "./pty-ticket"
export { Question } from "./question"
export { Workspace } from "./workspace"
export { Prompt, Source, FileAttachment, AgentAttachment } from "./prompt"
export { PromptInput } from "./prompt-input"
export * from "./schema"
```

## Q090 — packages/schema/src/plugin.ts

Plugin identity and added event.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c23f79582e37f4d2924d5b6cf869fa0ad0f5f629`; full-source SHA256 `ad81fb523930347085140255dcc3e4ca9fab954e97e25118677909bfec7b5739`; 344 source bytes.

Lines 6–13; byte offsets [113, 344); 231 bytes; span SHA256 `b238909b6e6c1c8d927741f4ecf715f9233b30e6ae98f2f1445e052c2517c27a`.

```ts
export const ID = Schema.String.pipe(Schema.brand("Plugin.ID"))
export type ID = typeof ID.Type

const Added = define({
  type: "plugin.added",
  schema: { id: ID },
})
export const Event = { Added, Definitions: inventory(Added) }
```

## Q091 — packages/schema/src/server-event.ts

Server connected event.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `138d0cf5f699b775af573b32d99e924af4a54a4f`; full-source SHA256 `65c69eab6d48f601b4a97d07d89ef3ce19c096d745719b34c0abc23d6f75b047`; 215 source bytes.

Lines 3–7; byte offsets [47, 215); 168 bytes; span SHA256 `24173b3b7080cbd6c59f0d3c088819eb50c8f4e2595abd1dc826bcf3572ab323`.

```ts
import { Event } from "./event"

export const Connected = Event.define({ type: "server.connected", schema: {} })

export const Definitions = Event.inventory(Connected)
```

## Q092 — packages/schema/src/ide-event.ts

IDE installed event.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ca4218602143882beaff4dc3f2990497a6f025e9`; full-source SHA256 `d3d3562379982a87a1a68c8a847901318607139d6a7dca81c1512212502653c8`; 270 source bytes.

Lines 6–13; byte offsets [106, 270); 164 bytes; span SHA256 `4b00dfcab55cf3a534eeda828bc32e14cc5fe18cb45fc77bf12b63ce4dbfbb49`.

```ts
export const Installed = Event.define({
  type: "ide.installed",
  schema: {
    ide: Schema.String,
  },
})

export const Definitions = Event.inventory(Installed)
```

## Q093 — packages/schema/src/tui-event.ts

Open command names and positive toast duration decoding default.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `28952dcfa3197d670e072f542ab758c45cc4be70`; full-source SHA256 `69c3aaa24eb98f069364fe34250b1a37e38d075345a848ec4945c4827e90e74f`; 1625 source bytes.

Lines 9–16; byte offsets [230, 489); 259 bytes; span SHA256 `a4ccdc645c79eedac907e4e5815754b2b93ae3fa5f64db1a8ae94884eefbae51`.

```ts
const DEFAULT_TOAST_DURATION = 5000

export const PromptAppend = Event.define({ type: "tui.prompt.append", schema: { text: Schema.String } })

export const CommandExecute = Event.define({
  type: "tui.command.execute",
  schema: {
    command: Schema.Union([
```

Lines 30–49; byte offsets [843, 1349); 506 bytes; span SHA256 `09042c17a1e6f51f9341ab2b5a7ae9d07819977e78db9011ddcca874d879b895`.

```ts
        "prompt.clear",
        "prompt.submit",
        "agent.cycle",
      ]),
      Schema.String,
    ]),
  },
})

export const ToastShow = Event.define({
  type: "tui.toast.show",
  schema: {
    title: optional(Schema.String),
    message: Schema.String,
    variant: Schema.Literals(["info", "success", "warning", "error"]),
    duration: PositiveInt.pipe(Schema.withDecodingDefault(Effect.succeed(DEFAULT_TOAST_DURATION))).annotate({
      description: "Duration in milliseconds",
    }),
  },
})
```

Lines 51–58; byte offsets [1350, 1625); 275 bytes; span SHA256 `b98e09e3da78827111f12b106bd9181dfa16e92ef4f59f0ede9c8aeeb6a4de60`.

```ts
export const SessionSelect = Event.define({
  type: "tui.session.select",
  schema: {
    sessionID: SessionID.annotate({ description: "Session ID to navigate to" }),
  },
})

export const Definitions = Event.inventory(PromptAppend, CommandExecute, ToastShow, SessionSelect)
```

## Q094 — packages/schema/src/installation-event.ts

Installation updated/update-available notifications.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `69ecf670846871ca50cbefe66de442fe0faea754`; full-source SHA256 `f9b2331c830a0aa2aabeb753174e69898db02dd405996114e9c25654b7b748ec`; 448 source bytes.

Lines 6–20; byte offsets [124, 448); 324 bytes; span SHA256 `2c655181c31bf76ab73e55600621775058d1b8ba9c2420c3621df70d429f6e0f`.

```ts
export const Updated = Event.define({
  type: "installation.updated",
  schema: {
    version: Schema.String,
  },
})

export const UpdateAvailable = Event.define({
  type: "installation.update-available",
  schema: {
    version: Schema.String,
  },
})

export const Definitions = Event.inventory(Updated, UpdateAvailable)
```

## Q095 — packages/sdk-next/src/tool.ts

Complete Core tool value/type reexport facade.

Pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3250ee802f6aeb08799db7b124140ca1aa274292`; full-source SHA256 `230c88017a69b9dee4e9cdbdcde6f2d5cfc9b62bebc4a5a3d347762a74688b1c`; 164 source bytes.

Lines 1–2; byte offsets [0, 164); 164 bytes; span SHA256 `230c88017a69b9dee4e9cdbdcde6f2d5cfc9b62bebc4a5a3d347762a74688b1c`.

```ts
export { Failure, RegistrationError, make } from "@orchestra/core/tool/tool"
export type { AnyTool, Content, Context, Definition } from "@orchestra/core/tool/tool"
```
