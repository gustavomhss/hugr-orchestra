# B-v3 — compact additional decisive evidence

All source at `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Commit/blob/full-source SHA256 and original line/byte/span identities are bound in source-excerpts.json; exact code below is unchanged. L1 only; unjudged.

Scope: B1/B2 and the 24 bounded domains in review-domain-disposition.md. C01–C47/S01–S38 are referenced, not reprinted. Extensive native selections remain in delegates/ and support/full-review-supplement.md. The separate complete-branch-context.md contains just the two complete B2 branches, with exactly three reused closing/release lines from C34.

## Artifact → decisive evidence

| Artifact | Evidence |
| --- | --- |
| s1.api.server-edge | V01 + existing C29; D10/D11/D22 ownership boundaries |
| s1.api.session-contract | V02–V04 + existing C21/S16; complete source comparison, no A synthesis |
| s1.api.stream-contract | V05 (production allocation/capacity), V06 + C34 (finally) |
| s1.api.client-projection | V06 + C34 (binary return and finally) |
| s1.api.schema-contracts | Q001–Q094 through the domain/member map |
| s1.api.sdk-composition | Q095 complete Core tool facade |
| s1.api.surface-disposition | Domain/member map of all Q/P/G57 selections |
| s1.api.boundaries; s1.api.codegen | Bodies unchanged; original C/S evidence retained |

## V01 — packages/server/src/middleware/schema-error.ts

Git blob `d39702b74b11b1ee8e0072903bf1f9f19310da33`; source SHA256 `cec3dac0a0706af6daa39233b37c453e99b57a234a40ddcd27ef01cb0777ec08`; 918 bytes at the common source pin.

Lines 7–9; 69 exact bytes; span SHA256 `fa69ba79485ddbfa718b665cd4ccd3c5e0ff312cd402996a7daa54aa96bf8fc2`.

```ts
const REASON_LIMIT = 1024

function truncateReason(reason: string) {
```

## V02 — packages/protocol/src/groups/session.ts

Git blob `5830f50001c8dc01227a920f04276054c0e29570`; source SHA256 `2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f`; 29273 bytes at the common source pin.

Lines 95–101; 250 exact bytes; span SHA256 `cf503ff243149f3e48fd7346791e8024e86a47c1a40af480d1cd010bdfa345e9`.

```ts
const SessionActive = Schema.Struct({
  type: Schema.Literal("running"),
}).annotate({ identifier: "SessionActive" })

const SessionHistoryLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(100))

export const SessionHistoryQuery = Schema.Struct({
```

Lines 182–184; 160 exact bytes; span SHA256 `98b16737318ead0c102d04fb5b0e4eb508a6f7b1ea1ce7416e6471859b697e77`.

```ts
            "Retrieve foreground Session drains currently owned by this Orchestra process. Sessions absent from the result are inactive.",
        }),
      ),
```

## V03 — packages/core/src/session.ts

Git blob `402a192a69bcad6a4b08c695657e24ff5e335f93`; source SHA256 `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; 34126 bytes at the common source pin.

Lines 24–24; 47 exact bytes; span SHA256 `5457629f46d24238d8726925a3d6f4fb50bd94e677767897f86a54bbd5b3f937`.

```ts
import { SessionStore } from "./session/store"
```

Lines 270–275; 285 exact bytes; span SHA256 `df939f08aca17e11845f2578ab0701a18b1c2182b8cb2df7621314ed05d3177a`.

```ts
    const events = yield* EventV2.Service
    const projects = yield* ProjectV2.Service
    const execution = yield* SessionExecution.Service
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const global = yield* Global.Service
```

Lines 469–472; 219 exact bytes; span SHA256 `bd4a0e8879df3ea7ae057e1264edcb68fe8b2a4496b551b1616e98e993e43544`.

```ts
      message: Effect.fn("V2Session.message")(function* (input) {
        const stored = yield* store.message(input.messageID)
        return stored?.sessionID === input.sessionID ? stored.message : undefined
      }),
```

## V04 — packages/core/src/session/store.ts

Git blob `1e44d051f1a51b816bfeb96ce46dbc0747d07aff`; source SHA256 `2532e550ec0d74f7b07c33560651db176479d6b9d827fdc19d1d1198ba0628de`; 4422 bytes at the common source pin.

Lines 26–28; 173 exact bytes; span SHA256 `9023adf6ade79ac0bd2833135a68cc191272e6ae8d87c7b9b01349c5d688e7e6`.

```ts
  readonly message: (
    messageID: SessionMessage.ID,
  ) => Effect.Effect<{ readonly sessionID: SessionSchema.ID; readonly message: SessionMessage.Message } | undefined>
```

Lines 33–41; 313 exact bytes; span SHA256 `3c87f7e3edf143bee29e26f76817fce6e84a75d1dbaf7a4d6f0fb2ecfc043bb7`.

```ts
export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionStore") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)

    return Service.of({
```

Lines 73–86; 515 exact bytes; span SHA256 `ae2e87c7b31bb3b078d40b630a6f57e0c6e0795a2a7f66c34ac5ac30d5cc1502`.

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

Git blob `d644f36bdd6aa93cd538f560dab63337c2436022`; source SHA256 `ca51a6d6bd47e97cda8d43b629e4a590cbe21e1a263b6146d3609d30bceae427`; 2924 bytes at the common source pin.

Lines 26–26; 39 exact bytes; span SHA256 `f00e06379de81d7dd2a0aa5169f7e64cbc9c5ebaf656d48a61b19230012c7eff`.

```ts
export const subscriberCapacity = 4096
```

Lines 46–53; 416 exact bytes; span SHA256 `8c984251b7babb044dc6ffd690bdf2cf5547b845489c747c92ed0ebabb96bf54`.

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

Git blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; source SHA256 `f032a64d8223ac1b584ba17cf39e7f8da9e0be05f88682425692304a3a8ba20b`; 146714 bytes at the common source pin.

Lines 595–596; 92 exact bytes; span SHA256 `cfdbe7e8532a18804f63fc69ed464838f3bf6e0f995523fd853112b75494b690`.

```ts
    if (descriptor.binary) {
      return new Uint8Array(await response.arrayBuffer()) as A
```

Lines 648–652; 93 exact bytes; span SHA256 `cccd73c17978507efca4988b43ca354d6a2156930a8ced55a6b7abcf79a75d9f`.

```ts
        }
      } finally {
        try {
          await reader.cancel()
        } catch {}
```

## G57-E001 — packages/server/src/capability-content-ticket.ts

Git blob `ac3409c69b8d5b283a316198498048cf7d817279`; source SHA256 `e054ec3a19e8dedf9bbf380636f9f0592c17e6a770e7b0eb53be0404ef661444`; 2187 bytes at the common source pin.

Lines 9–18; 395 exact bytes; span SHA256 `ec043ae9b75e374eba8f38c9d1bc75b45615cfba8b2b460a409fb47c02b39270`.

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

## G57-E003 — packages/server/src/capability-content-ticket.ts

Git blob `ac3409c69b8d5b283a316198498048cf7d817279`; source SHA256 `e054ec3a19e8dedf9bbf380636f9f0592c17e6a770e7b0eb53be0404ef661444`; 2187 bytes at the common source pin.

Lines 33–48; 667 exact bytes; span SHA256 `f0c684357aab9ef5de8a5c1613c9852cbc42ab827dd172343dbdc9ddf0aa8dea`.

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

Git blob `2ccb45657ac106cc605a715ce4d37b405f322746`; source SHA256 `0fe9c21339044189df48ee9d6e300f9131e6b89ddc7f46921fb35bf46cbe9876`; 695 bytes at the common source pin.

Lines 7–12; 365 exact bytes; span SHA256 `24e5715599f6812a6a789e167c2b482427c80eaffbd06acd02b3f37dd9a14968`.

```ts
/** Trusted host construction only; request payloads cannot replace production origins or identity checks. */
export class Service extends Context.Service<Service, CapabilityConnectionSetupContract.Verifier>()(
  "@orchestra/ServerCapabilityVerification",
) {}

export const layer = Layer.effect(Service, CapabilityConnectionVerification.make().pipe(Effect.orDie))
```

## G57-E005 — packages/server/src/cors.ts

Git blob `767f94807b1c6437467f6f1e35bd784fbd004b16`; source SHA256 `d4f02ba7c886b1a0cc3f53863398b4e78eed59c9a94915bad38fa5ee24461dbb`; 2765 bytes at the common source pin.

Lines 10–31; 823 exact bytes; span SHA256 `a6e221fb53a544a2aafc5fdc21174b57f2dd6361dcbc8655671881bcab318b29`.

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

Git blob `767f94807b1c6437467f6f1e35bd784fbd004b16`; source SHA256 `d4f02ba7c886b1a0cc3f53863398b4e78eed59c9a94915bad38fa5ee24461dbb`; 2765 bytes at the common source pin.

Lines 35–41; 252 exact bytes; span SHA256 `c2260571780e009040a05fa65b20b7faa74a5fe17f0fa87e3ae13c8c38db9160`.

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

Git blob `767f94807b1c6437467f6f1e35bd784fbd004b16`; source SHA256 `d4f02ba7c886b1a0cc3f53863398b4e78eed59c9a94915bad38fa5ee24461dbb`; 2765 bytes at the common source pin.

Lines 55–66; 560 exact bytes; span SHA256 `70105d4a9b67a02ef889e53ec7d25b09103a3e10ad1542f887b53930e947890f`.

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

Git blob `7aa3bf6ff8d82ac41e35acb9ffbc4ec44acb07b7`; source SHA256 `e7fc29a45370ba8c4456e5c27ee0aaea2c4460b386be04ad5fcf3b91531f73d8`; 2229 bytes at the common source pin.

Lines 9–13; 253 exact bytes; span SHA256 `a7c39da2e3edc36f9bc02fa0b21b9be1dd96d5194b70eadebca879795b9ed615`.

```ts
    .handle("actions.binding.list", () => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.list()
    })))
    .handle("actions.binding.create", (ctx) => result(Effect.gen(function* () {
```

## G57-E009 — packages/server/src/handlers/actions-binding.ts

Git blob `7aa3bf6ff8d82ac41e35acb9ffbc4ec44acb07b7`; source SHA256 `e7fc29a45370ba8c4456e5c27ee0aaea2c4460b386be04ad5fcf3b91531f73d8`; 2229 bytes at the common source pin.

Lines 21–29; 698 exact bytes; span SHA256 `934d85291f277399a8e3d72964d322f2c8656b3a269342be0caa3b1a0d5f6b15`.

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

## G57-E011 — packages/server/src/handlers/actions-common.ts

Git blob `2b0ee980a3993effc238c54b685c3dbd90a184ba`; source SHA256 `fb84f207b325f69b222a5b45ba819f93c517acb3d1ad1b6c4c3e6a56198f8c5f`; 900 bytes at the common source pin.

Lines 7–20; 641 exact bytes; span SHA256 `7806f4fbbf4531f92ac81a5c2c3fd807cc7943cc98ab1dd32b0041a3809693b6`.

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

Git blob `3ac7250773470110baf53e02423c05e23fc18105`; source SHA256 `85f341e3e2cf019a10e584f4ed56c4ca8e450586d3a86ac38d14b527097e2774`; 1296 bytes at the common source pin.

Lines 9–12; 237 exact bytes; span SHA256 `b5b1f4b547c069d7829071d1bf83f8e3fd591be12e518a0790ba4d7b01a6b70c`.

```ts
    .handle("actions.job.retry", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.retry", ctx.payload, { jobID: ctx.params.jobID })
    })))
```

## G57-E013 — packages/server/src/handlers/actions-operation.ts

Git blob `6a321cd67a6b8f063fab15e3447713086d1af6ab`; source SHA256 `9109722eed624929e576c90f906b1ad9ba3fa7becbcfba04d6b8071f62ae6408`; 993 bytes at the common source pin.

Lines 9–12; 203 exact bytes; span SHA256 `43243c8522862c41e5d6cfab70f3baaf43ad42b602a9d59cbb3f591e8681f3d2`.

```ts
    .handle("actions.operation.prepare", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.prepare(bindingRef(ctx), ctx.payload)
    })))
```

## G57-E014 — packages/server/src/handlers/actions-pipeline.ts

Git blob `5f7dff4cabd0fede451fd7ec25a9028617a919c5`; source SHA256 `f31f6d4929009eb9d6d72d4d882dfa100fab8185d707f970e8fc738d35e18ea6`; 887 bytes at the common source pin.

Lines 9–15; 520 exact bytes; span SHA256 `145ff21e032966841d27c0448f1d17169a9758d015cfee52c5c22ca0aab566bb`.

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

Git blob `aa2fea3cc2877ce7ce42632768ec2afc7b23bf9d`; source SHA256 `a3da138d4f5f6321c18bc790da67debf1df622c9fd86563bfc80b683fe054797`; 1957 bytes at the common source pin.

Lines 10–21; 778 exact bytes; span SHA256 `15b254acfd5b4746edc908402e1d6bd393c9408e27c1de2bf14b4f94fc4fad24`.

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

## G57-E017 — packages/server/src/handlers/actions-run.ts

Git blob `598f6f3e0647fe53f6632bf78b66673b75bbbd24`; source SHA256 `6177fd44ef1e567f825c12a96e95bb304ee6183a0643267bc43f7d48be37881f`; 2973 bytes at the common source pin.

Lines 9–13; 367 exact bytes; span SHA256 `97f9cb26011be5fff022dcfd5431bab544c5694382505dbba59728a160d25aa4`.

```ts
    .handle("actions.run.list", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.runs(bindingRef(ctx), {
        workflowID: ctx.query.workflowID, cursor: ctx.query.cursor, limit: ctx.query.limit,
        ref: ctx.query.ref, event: ctx.query.event, status: ctx.query.status, commit: ctx.query.commit,
```

## G57-E020 — packages/server/src/handlers/actions-source.ts

Git blob `319bb830d248814d20a27a94de91520be213d5c8`; source SHA256 `9194ce2bd2796955ba7d51c8c42af63c6b6f151679786067468bb736172a7dfa`; 1390 bytes at the common source pin.

Lines 9–12; 202 exact bytes; span SHA256 `b83ecb54fc81dd7349b73f5e9d5118840232c51b6c60e4024954172f14ac65b0`.

```ts
    .handle("actions.source.base", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.sourceBase(bindingRef(ctx), ctx.query.ref)
    })))
```

## G57-E022 — packages/server/src/handlers/actions-workflow.ts

Git blob `09f777cf05508ebc344e81f47a8ccb61f2285051`; source SHA256 `5242b8c6457eec826e492f2cfa421058478822e83be41110cf50e8647da7cd28`; 1705 bytes at the common source pin.

Lines 9–12; 287 exact bytes; span SHA256 `39b2c3e3af0f7bff0efdd12b809edd15fd1e582c38490d93eefbfb4b9aa91a0c`.

```ts
    .handle("actions.workflow.list", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.workflows(bindingRef(ctx), {
        cursor: ctx.query.cursor, limit: ctx.query.limit, query: ctx.query.query, state: ctx.query.state,
```

## G57-E024 — packages/server/src/handlers/agent.ts

Git blob `640c9a2368bbe9d60c5921545fc52e9a9c649ed9`; source SHA256 `5ea8a0c52977d04e833edd5e6f8198062b494c1f5f0df50d06fbddc5b7650950`; 5780 bytes at the common source pin.

Lines 20–29; 496 exact bytes; span SHA256 `5ebeec8714c0bcf7089f3efbd351410147cc260a0f2094542c916db4ae3f48ac`.

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

## G57-E026 — packages/server/src/handlers/agent.ts

Git blob `640c9a2368bbe9d60c5921545fc52e9a9c649ed9`; source SHA256 `5ea8a0c52977d04e833edd5e6f8198062b494c1f5f0df50d06fbddc5b7650950`; 5780 bytes at the common source pin.

Lines 75–88; 756 exact bytes; span SHA256 `73e2fd2ca8016c097acb691272aabf229bbb6f7e15bebbc5297413c11e515ffd`.

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

Git blob `640c9a2368bbe9d60c5921545fc52e9a9c649ed9`; source SHA256 `5ea8a0c52977d04e833edd5e6f8198062b494c1f5f0df50d06fbddc5b7650950`; 5780 bytes at the common source pin.

Lines 129–144; 625 exact bytes; span SHA256 `4fbc37bff8efc28c4ef7a098672190f921d318068a79e30b4a701f3d0fc515d1`.

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

Git blob `692afb828dc5c896339adfebbb5e33ef39876347`; source SHA256 `5eacbbeeea4ae154b77523f0f3bb14bd6921816ad4ebbb7ee5145050ab874267`; 5875 bytes at the common source pin.

Lines 21–36; 739 exact bytes; span SHA256 `a75be9a510646e61b0529796e81dce750ae9d95ed8e05beb6ab2b2fafb1f8d0c`.

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

## G57-E031 — packages/server/src/handlers/behavior.ts

Git blob `8388d785f544120e4e9f36bce79d68f64b412b40`; source SHA256 `285b610ffb742ebc0e1f19a24b6eb0c0303552d1fe351cef6c6152bd8cc5d8a2`; 772 bytes at the common source pin.

Lines 8–18; 488 exact bytes; span SHA256 `0e21a39e32df48b81abbe9de086ef3e8c3d20530508ab5a9432cbbe011752f72`.

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

Git blob `9b11b400cbcc5da7dfcd6dbd9a04a09425868bde`; source SHA256 `dfeb5365d7c500527e66e3c455a70e1e5fa1bf09c1b55f9ceceb739d65aa0ee5`; 3794 bytes at the common source pin.

Lines 9–15; 450 exact bytes; span SHA256 `74414fe87c1e6186f615815b04da30d03f42acf423967cc67a5b96ad05452faf`.

```ts
    const board = yield* Board.Service

    return handlers
      .handle("board.list", (ctx) => board.summaries({ archived: ctx.query.archived }))
      .handle("board.get", (ctx) => board.snapshot(ctx.params.key).pipe(mapNotFound))
      .handle("board.issue", (ctx) => board.issuePage(ctx.params.key, ctx.params.number).pipe(mapNotFound))
      .handle("board.activity", (ctx) => board.activity(ctx.params.key, ctx.query.since).pipe(mapNotFound))
```

Lines 22–23; 230 exact bytes; span SHA256 `1534817d65bc2a05ac3578b12b515f10c4ccabf062c5adfac5b55d7941cc00e8`.

```ts
      .handle("board.note", (ctx) => board.note(ctx.params.key, ctx.params.number, ctx.payload).pipe(mapErrors))
      .handle("board.attach", (ctx) => board.attach(ctx.params.key, ctx.params.number, ctx.payload).pipe(mapErrors))
```

## G57-E033 — packages/server/src/handlers/board.ts

Git blob `9b11b400cbcc5da7dfcd6dbd9a04a09425868bde`; source SHA256 `dfeb5365d7c500527e66e3c455a70e1e5fa1bf09c1b55f9ceceb739d65aa0ee5`; 3794 bytes at the common source pin.

Lines 45–57; 571 exact bytes; span SHA256 `970a696500ace3ca831fbc2f4b9c4431b7529365f29d8601e60fd303d6c2678c`.

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

Git blob `9ca64346ea1c6511674199f2bf4fe05eca666f4a`; source SHA256 `fb21aa9975ceb975bedb3fe16cc85b367cd9a3f27691ea7eb9541f93574cbb91`; 4883 bytes at the common source pin.

Lines 20–36; 1078 exact bytes; span SHA256 `46b7455a774e49c4ce428915276457a299a1a7b46b932a75e104f8fd9c9c6666`.

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

Git blob `9ca64346ea1c6511674199f2bf4fe05eca666f4a`; source SHA256 `fb21aa9975ceb975bedb3fe16cc85b367cd9a3f27691ea7eb9541f93574cbb91`; 4883 bytes at the common source pin.

Lines 41–57; 1608 exact bytes; span SHA256 `86097ede2aafd1f32127d144d8920317fde5e8664ce26a4abc9fee002daf2d7e`.

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

Git blob `9ca64346ea1c6511674199f2bf4fe05eca666f4a`; source SHA256 `fb21aa9975ceb975bedb3fe16cc85b367cd9a3f27691ea7eb9541f93574cbb91`; 4883 bytes at the common source pin.

Lines 61–69; 549 exact bytes; span SHA256 `c181d92df2250de572a2be896ba7e597801562a48ab6ea54deddcd05b62fd5fc`.

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

Git blob `e3054b31517cb6aac79153ea7926e3fa0f9831cb`; source SHA256 `c5e69c65cb5066136993dc01ddac5e9b3fd929b2903a0fb4c99976addfea53ee`; 1561 bytes at the common source pin.

Lines 16–27; 873 exact bytes; span SHA256 `0ac9ce8eddebf873d67836bffaefb9d5491752df984ac8acc174ef1629f158c8`.

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

Git blob `73da4c80420f4ae1339eaf45194497f5006caf5e`; source SHA256 `45b4fdc1b7c9d35d5d995523414dad446f968e667b73680ee2ca47ed883ab8f3`; 2833 bytes at the common source pin.

Lines 14–31; 1254 exact bytes; span SHA256 `50644a1079cdd49500baf3d38b5d87a122bd383dbe4fb4776c07ca3b1d9af1f0`.

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

Git blob `73da4c80420f4ae1339eaf45194497f5006caf5e`; source SHA256 `45b4fdc1b7c9d35d5d995523414dad446f968e667b73680ee2ca47ed883ab8f3`; 2833 bytes at the common source pin.

Lines 35–48; 852 exact bytes; span SHA256 `200ed405e716f57302311a552940b9f6d94dc6838b5db490757cbbdd814b149a`.

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

Git blob `c08e4f1218f1c7a33170069b8b116605ea598246`; source SHA256 `14ecfafbebb9e6bc79db2be87e5f9d64fd753d64f1166c8d1b41506ed60fcd33`; 349 bytes at the common source pin.

Lines 6–8; 162 exact bytes; span SHA256 `a25fc3fa1091bd410ab0c745afdfc3ea74b1e68ae61ebb618c5ca6240a773cb6`.

```ts
export const CommandHandler = HttpApiBuilder.group(Api, "server.command", (handlers) =>
  handlers.handle("command.list", () => response(SlashCommand.list())),
)
```

## G57-E041 — packages/server/src/handlers/config.ts

Git blob `7c646dd72c47b4d58656a6111fbf0778f90b379d`; source SHA256 `8f0a504c3e526069e47d3a750a3b284da708a7383f25cc6a854e540b032808f9`; 2094 bytes at the common source pin.

Lines 14–29; 765 exact bytes; span SHA256 `b684b3c5a4dbe30762ac04516ded2d3efb6c3c90e81b364eb2149f5e41a4267d`.

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

Git blob `7c646dd72c47b4d58656a6111fbf0778f90b379d`; source SHA256 `8f0a504c3e526069e47d3a750a3b284da708a7383f25cc6a854e540b032808f9`; 2094 bytes at the common source pin.

Lines 31–44; 563 exact bytes; span SHA256 `b774e1a31885495a1a607acaa0ce56d68353ec1e49fd70f6cba1980e45d729f9`.

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

Git blob `08007dd56e73cfeec007509e073613c1e528c2af`; source SHA256 `ed4d52333c3fdb307c1419728b290231ad91581223c05b652b75251d16b4ab4e`; 1289 bytes at the common source pin.

Lines 13–17; 287 exact bytes; span SHA256 `bbd7f5e4a1c797eadc2c6c196d04b963a1675f1f785d81ea733bfecfc39831bf`.

```ts
        const integrations = yield* Integration.Service
        yield* integrations.connection
          .update(ctx.params.credentialID, { label: ctx.payload.label })
          .pipe(Effect.catchTag("Credential.InheritedError", inherited))
        return HttpApiSchema.NoContent.make()
```

## G57-E044 — packages/server/src/handlers/credential.ts

Git blob `08007dd56e73cfeec007509e073613c1e528c2af`; source SHA256 `ed4d52333c3fdb307c1419728b290231ad91581223c05b652b75251d16b4ab4e`; 1289 bytes at the common source pin.

Lines 23–33; 424 exact bytes; span SHA256 `8b2e4f4f113a9867d267ad569900f4feddba4d2a70535f4b8859ba603e3867d8`.

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

Git blob `b6bb087654048fec526a9980c595105ecc921989`; source SHA256 `463e3f34b673e5e7ffcf645245508750699e457df8ef5d5c3d9f6720241ce1dc`; 372 bytes at the common source pin.

Lines 6–8; 198 exact bytes; span SHA256 `9c2e5bb80574796d7489f8a8e338414abb4407e4fda08f2c6b5e4c668835bc78`.

```ts
export const FormatterHandler = HttpApiBuilder.group(Api, "server.formatter", (handlers) =>
  handlers.handle("formatter.status", () => response(Format.Service.use((format) => format.status()))),
)
```

## G57-E046 — packages/server/src/handlers/guardrail.ts

Git blob `b3348283ee22836d8ff08f2237574fd5b82931bc`; source SHA256 `d9669d237611181456858a8d0880392578f3b2432c1d5e0932fb70e6ecbbe9a5`; 1098 bytes at the common source pin.

Lines 11–24; 505 exact bytes; span SHA256 `f4599527536b1fe0beb2a87737ae5ba57deca4e2e1a88764121324b3d203196b`.

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

Git blob `b3348283ee22836d8ff08f2237574fd5b82931bc`; source SHA256 `d9669d237611181456858a8d0880392578f3b2432c1d5e0932fb70e6ecbbe9a5`; 1098 bytes at the common source pin.

Lines 30–32; 160 exact bytes; span SHA256 `7fd86c567b39c1973ab76774e42bec7dbd207821b96d96bd0d40a3461ead5da3`.

```ts
function apiError(error: Guardrail.EngineError) {
  return new GuardrailError({ name: "GuardrailError", data: { kind: error.kind, message: error.message } })
}
```

## G57-E048 — packages/server/src/handlers/health.ts

Git blob `2de8e84ad6fe8833aaf3843ff0d292de49bd825a`; source SHA256 `a45c1f389238590e7545fc35f83d5b48baa6f74062e028e95b11e6766c44ab3d`; 421 bytes at the common source pin.

Lines 6–9; 225 exact bytes; span SHA256 `bf9e4ac49cb84d1fa8185b1eedd51b4d19be9f0e2c02ea1bd9800e135a3e8a94`.

```ts
export const HealthHandler = HttpApiBuilder.group(Api, "server.health", (handlers) =>
  handlers.handle("health.get", () =>
    Effect.succeed({ healthy: true as const, pid: process.pid, version: InstallationVersion }),
  ),
```

## G57-E049 — packages/server/src/handlers/installation.ts

Git blob `5f877ca7ccfc706ed9ca1e1c8cc9ac6971c698c2`; source SHA256 `3d5b63f50f030e884075152534e35400ae6ad91bf0f187a45bf1d13fce699842`; 1039 bytes at the common source pin.

Lines 9–22; 623 exact bytes; span SHA256 `5ce3aec66c54c120fae7cedd01d04c18749b45e5eecca41d631e9fc55eb89c8d`.

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

## G57-E051 — packages/server/src/handlers/integration.ts

Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 bytes at the common source pin.

Lines 42–51; 514 exact bytes; span SHA256 `9f7fba6bd86178840df24d0962f7ff7a46335e32a7182b0e60cd9f265d40a8c5`.

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

## G57-E054 — packages/server/src/handlers/integration.ts

Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 bytes at the common source pin.

Lines 114–122; 281 exact bytes; span SHA256 `041f257b5e002445a08c7f2a390f225153b2769a81e9d794747ad6d9569ad547`.

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
```

## G57-E055 — packages/server/src/handlers/integration.ts

Git blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; source SHA256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; 5677 bytes at the common source pin.

Lines 140–148; 325 exact bytes; span SHA256 `2dffc512f694beaa24168a0aa903bca90e32fdf5087c5d64dd0f3b6818ada5d1`.

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
```

## G57-E056 — packages/server/src/handlers/lean.ts

Git blob `3e1eb7e0e5e2215e28b9eed247e0f24d0477d97a`; source SHA256 `9b731bdeefe1059a653dbe03f2279f1a0f4e77de0eb162943ab32dd14bf2ed4f`; 2301 bytes at the common source pin.

Lines 17–30; 756 exact bytes; span SHA256 `1e6ba47741adb3d1e178f50a799cca48c5eea78c7f663921228d0b8320d0d442`.

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

## G57-E058 — packages/server/src/handlers/location.ts

Git blob `fd37ae5eefd249b1f06db4a3057b6bd8970615e7`; source SHA256 `9c6224360c8bcfcfb3973f2b200c4bb8b9c57d2b32ef55c912a4784ed7a09a4e`; 1318 bytes at the common source pin.

Lines 12–29; 710 exact bytes; span SHA256 `1be68340f9fd8b83e3dcc268a0bf5cb4b59e290f3b10d52cee64a8134e0f8424`.

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

Git blob `fd37ae5eefd249b1f06db4a3057b6bd8970615e7`; source SHA256 `9c6224360c8bcfcfb3973f2b200c4bb8b9c57d2b32ef55c912a4784ed7a09a4e`; 1318 bytes at the common source pin.

Lines 32–32; 82 exact bytes; span SHA256 `8958595698280cd9a29a5a902393859ded9c5624187c46472748156fc5bb37b9`.

```ts
      .handle("location.paths", () => Effect.succeed({ home: Global.Path.home }))
```

## G57-E060 — packages/server/src/handlers/lsp.ts

Git blob `08ad1abc8064d1f0868db1d74d67a3d653a8a19c`; source SHA256 `f8fc0e69a5aa0c7b35238aa3b1a901784be77bfc7f22008a7768cfab239cac18`; 339 bytes at the common source pin.

Lines 6–8; 171 exact bytes; span SHA256 `762aa9c685615fc0cf855851d1ab178ed025f00b4cfd0c43eb6ee0e25f27c860`.

```ts
export const LspHandler = HttpApiBuilder.group(Api, "server.lsp", (handlers) =>
  handlers.handle("lsp.status", () => response(LSP.Service.use((lsp) => lsp.status()))),
)
```

## G57-E061 — packages/server/src/handlers/mcp.ts

Git blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`; source SHA256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`; 3425 bytes at the common source pin.

Lines 10–16; 462 exact bytes; span SHA256 `9df2cfea5a3ce737c9f1efdbf37cb3fe8c3aa6691320dbf1c0b6b59e7f2b6186`.

```ts
    .handle("mcp.list", () => response(Mcp.Service.use((mcp) => mcp.list())))
    .handle("mcp.resource.catalog", () => response(Mcp.Service.use((mcp) => mcp.resources())))
    .handle("mcp.config", () => response(Mcp.Service.use((mcp) => mcp.config())))
    .handle("mcp.entries", () =>
      response(Mcp.Service.use((mcp) => mcp.entries()).pipe(Effect.mapError(invalid))),
    )
    .handle("mcp.tools", () => response(Mcp.Service.use((mcp) => mcp.tools())))
```

## G57-E064 — packages/server/src/handlers/mcp.ts

Git blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`; source SHA256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`; 3425 bytes at the common source pin.

Lines 89–95; 292 exact bytes; span SHA256 `dba614cca85d50fe2416cdd516304b77b4adcab1ea237bddd64e396b007d98c2`.

```ts
function notFound(error: Mcp.NotFoundError) {
  return Effect.fail(new McpServerNotFoundError({ server: error.name, message: `MCP server not found: ${error.name}` }))
}

function invalid(error: Mcp.ConfigError | Mcp.AuthError) {
  return new InvalidRequestError({ message: error.message })
}
```

## G57-E065 — packages/server/src/handlers/meeting.ts

Git blob `345c7592ea9625f0fcef9bf993693d1d1a017fae`; source SHA256 `c4100cefe2683ebbb91a21b6658f9eb26069eb4e53e1fd9ba31f330499c00566`; 3570 bytes at the common source pin.

Lines 19–34; 753 exact bytes; span SHA256 `db33bdf2d54dd98ab2efbe8c6d305259867dc667cc9bf25ebdbb61a5962ff936`.

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

Git blob `345c7592ea9625f0fcef9bf993693d1d1a017fae`; source SHA256 `c4100cefe2683ebbb91a21b6658f9eb26069eb4e53e1fd9ba31f330499c00566`; 3570 bytes at the common source pin.

Lines 86–98; 430 exact bytes; span SHA256 `035a0801d725110c8389e2a9d6a8e2ae3357af6ad7e8ea6027a561d2c5b7eb91`.

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

Git blob `e14f733c5cb7fdb9095fd041916b87a1e83a20d3`; source SHA256 `eccfedcd75825cfc8f02ec07e9f30af8c573a23f60ae9b41e58d777e21cf5438`; 3702 bytes at the common source pin.

Lines 10–12; 153 exact bytes; span SHA256 `bfc12f2481884786274f9bf899fbb2909df01346877d02524dd91897c8e2ef3f`.

```ts
function missingRequest(id: PermissionV2.ID) {
  return new PermissionNotFoundError({ requestID: id, message: `Permission request not found: ${id}` })
}
```

## G57-E069 — packages/server/src/handlers/permission.ts

Git blob `e14f733c5cb7fdb9095fd041916b87a1e83a20d3`; source SHA256 `eccfedcd75825cfc8f02ec07e9f30af8c573a23f60ae9b41e58d777e21cf5438`; 3702 bytes at the common source pin.

Lines 60–76; 967 exact bytes; span SHA256 `be6d7fbc61ad66537ff803d97c9885fff4a966a18464f993c1680c6ca42feffd`.

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

## G57-E072 — packages/server/src/handlers/project-copy.ts

Git blob `fa6258457253f29e7edb555079aac1565c2a9409`; source SHA256 `4dda2be957852dec674c9b87ab10d95d13f86eba9bd053c915739defb755ad90`; 4761 bytes at the common source pin.

Lines 50–60; 410 exact bytes; span SHA256 `bc659fc0d6efc86ebc718186f5492983ca249529fb3ae65b9142f233f6f2f648`.

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

## G57-E075 — packages/server/src/handlers/project.ts

Git blob `0c4bdacc001ec83007a4ad52f643f01e47d21164`; source SHA256 `2729612650a620155d83aa017ce98b15dfe1d36c5fff8a9da72bff14ad030b95`; 2178 bytes at the common source pin.

Lines 15–23; 390 exact bytes; span SHA256 `cabaec48ce06ca02822505a289991d86fd18620bec24352d89a1f32130650a57`.

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
```

## G57-E076 — packages/server/src/handlers/project.ts

Git blob `0c4bdacc001ec83007a4ad52f643f01e47d21164`; source SHA256 `2729612650a620155d83aa017ce98b15dfe1d36c5fff8a9da72bff14ad030b95`; 2178 bytes at the common source pin.

Lines 31–45; 749 exact bytes; span SHA256 `27a65e2d63c21424c19aa9d7d3616a0bee9123de7ddec9b2fff9e7eca329e787`.

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

Git blob `20ab373169610e127ba50ef1313412c89e64783e`; source SHA256 `40f69e4bd3fdb357a0241bca3525cba3a3c677dd1dc277d2335204fb4fedc162`; 1248 bytes at the common source pin.

Lines 11–24; 529 exact bytes; span SHA256 `b635e804e37cebfa3d6dcf1aaacf7d6d4d322fccf8261d7e3554e106358890cb`.

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

Git blob `20ab373169610e127ba50ef1313412c89e64783e`; source SHA256 `40f69e4bd3fdb357a0241bca3525cba3a3c677dd1dc277d2335204fb4fedc162`; 1248 bytes at the common source pin.

Lines 30–40; 270 exact bytes; span SHA256 `03e382a527efe16cd3f741962031c9cc6c31f715b6aa8cacf605134a89be87ba`.

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

Git blob `22b11e9cff3f9b2ba716af11d7873410c601a2b3`; source SHA256 `856f65aac9d6a9f2d96a7eba706922832eda1e4d7c671210ad0efca92f8ca555`; 2443 bytes at the common source pin.

Lines 14–23; 500 exact bytes; span SHA256 `34637205a9a351918dfa04e601a2f3fad668cedc4d42bbeec3e632cecb1460f4`.

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

## G57-E081 — packages/server/src/handlers/question.ts

Git blob `22b11e9cff3f9b2ba716af11d7873410c601a2b3`; source SHA256 `856f65aac9d6a9f2d96a7eba706922832eda1e4d7c671210ad0efca92f8ca555`; 2443 bytes at the common source pin.

Lines 40–48; 454 exact bytes; span SHA256 `3e40673c59cce43fb8b70e1e145de8f06a3963b4793cf70f2db00f25fe671739`.

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
```

## G57-E082 — packages/server/src/handlers/rag-studio-session.ts

Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 bytes at the common source pin.

Lines 18–29; 678 exact bytes; span SHA256 `ae109519ac495c2c77dba5dc57a6ccd0dc3c650c70be59b8a5174b7ea577ca55`.

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

## G57-E084 — packages/server/src/handlers/rag-studio-session.ts

Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 bytes at the common source pin.

Lines 61–75; 437 exact bytes; span SHA256 `0560000f7881cf5087d190623bcaf504dd08d9cfae183299e5b87f9396040a71`.

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

Git blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; source SHA256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; 9807 bytes at the common source pin.

Lines 132–135; 288 exact bytes; span SHA256 `067a86a30defc0061da4ffa3532d22aa7ed04e19748258b33f336149520fc339`.

```ts
    yield* Effect.promise(() => withStore(store, () => Promise.all(sources.map((row) => noteBytes(row.id)))))
    const result = yield* Effect.promise(() => withStore(store, () => run(store, locationId)))
    yield* save(db, store, locationId, revisionIds, questionIds)
    return result
```

## G57-E088 — packages/server/src/handlers/rag-studio.ts

Git blob `b91a9e061bb8f818a34756ea7e26e9f27dace4a7`; source SHA256 `3a3143d5b3243ac78bc87bd5f9dbb56ae9ab080730dd9ac7060700809de4ef0e`; 4883 bytes at the common source pin.

Lines 30–46; 650 exact bytes; span SHA256 `61e92fecf3b4dac59bc3c8f4e3c2784b810abcd41f3a295549e8a60e53bbbce5`.

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

Git blob `b91a9e061bb8f818a34756ea7e26e9f27dace4a7`; source SHA256 `3a3143d5b3243ac78bc87bd5f9dbb56ae9ab080730dd9ac7060700809de4ef0e`; 4883 bytes at the common source pin.

Lines 55–67; 673 exact bytes; span SHA256 `a3ed5ab87ea96d0509f3c18c80d92b66e03734186861c6855a53d66be0547bf1`.

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

## G57-E092 — packages/server/src/handlers/reference.ts

Git blob `ce39a2f3aa082549fd456f42773c2c4e59a2d69c`; source SHA256 `521ea525989df9cb283c92f78fefef28aec0dd4873a0dc223b83297dd42b411b`; 383 bytes at the common source pin.

Lines 6–8; 203 exact bytes; span SHA256 `71d2d2ec8b7904ed3020cb519870c3f66b8980fbb7094505f8a34c2001f05b7b`.

```ts
export const ReferenceHandler = HttpApiBuilder.group(Api, "server.reference", (handlers) =>
  handlers.handle("reference.list", () => response(Reference.Service.use((reference) => reference.list()))),
)
```

## G57-E094 — packages/server/src/handlers/relay-document.ts

Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 bytes at the common source pin.

Lines 71–89; 1125 exact bytes; span SHA256 `37824a19fa6d8b66729e6fcf1d83ae2b90c5c027e7aa5b6d2794855a158725c6`.

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

## G57-E096 — packages/server/src/handlers/relay-document.ts

Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 bytes at the common source pin.

Lines 158–164; 247 exact bytes; span SHA256 `2e096890e752a3f4a0ba1636e9b5f1e1c00a04efceffc37d432e0145fad5fd2a`.

```ts
      .handle("relay.document.check", () =>
        Effect.fail(
          new RelayForbiddenError({
            code: "maestro-execution-required",
            message: "Executable workflow checks are owned by Maestro.",
          }),
        ),
```

## G57-E099 — packages/server/src/handlers/relay-document.ts

Git blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; source SHA256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; 15511 bytes at the common source pin.

Lines 291–310; 1134 exact bytes; span SHA256 `c55c2cfc3b4b0b5f70a9954f471662d687c948310b171458a53fe613780fe238`.

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

## G57-E101 — packages/server/src/handlers/relay-hook.ts

Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 bytes at the common source pin.

Lines 45–55; 476 exact bytes; span SHA256 `e9233f06c05e267c266972e74beb812d038a6d817507e42fc212f631a0b2178a`.

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

## G57-E104 — packages/server/src/handlers/relay-hook.ts

Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 bytes at the common source pin.

Lines 153–157; 338 exact bytes; span SHA256 `a960138d6d42ef9046e3fb181c576b562081fdb898f8f0c95d6405a2ebb40acf`.

```ts
// hooks.json is keyed by `Global.data` and the project ID, and Relay's data root is `<Global.data>/relay/<projectID>`.
const binding = Effect.gen(function* () {
  const relay = yield* Relay.Service
  const location = yield* Location.Service
  return { data: path.dirname(path.dirname(relay.paths.root)), projectID: location.project.id }
```

## G57-E106 — packages/server/src/handlers/relay-hook.ts

Git blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; source SHA256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; 9689 bytes at the common source pin.

Lines 191–202; 459 exact bytes; span SHA256 `c2b7e81fd29d02ee7203647395c1be410557e0eb15f4e29b273ad2d0008955da`.

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

## G57-E109 — packages/server/src/handlers/relay-run.ts

Git blob `9af748eb25d441d8ed3766b09ef9a610a915b731`; source SHA256 `a31caef959e54e26071c0d7d325f685fef6b12c176ab90fa3e7aee4c3f15cbb8`; 5917 bytes at the common source pin.

Lines 39–48; 513 exact bytes; span SHA256 `83ae04f31e1ab014e8ce4c68482c7b04723e5bb57b34f52b58e8d0a04446bf12`.

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
```

## G57-E111 — packages/server/src/handlers/relay-run.ts

Git blob `9af748eb25d441d8ed3766b09ef9a610a915b731`; source SHA256 `a31caef959e54e26071c0d7d325f685fef6b12c176ab90fa3e7aee4c3f15cbb8`; 5917 bytes at the common source pin.

Lines 94–108; 694 exact bytes; span SHA256 `337ea37d284d296c9864b6b57f7219cc9a585273037af25d699e81a1721b6e6b`.

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

## G57-E113 — packages/server/src/handlers/research-artifact.ts

Git blob `fe08e43a395c59631633353043bbd724adf03451`; source SHA256 `8a95ff6157c4b15afe8fbd69c37b1d250b635f5ac2819ba4170de070f1c45b38`; 2411 bytes at the common source pin.

Lines 16–32; 1552 exact bytes; span SHA256 `42241b2e4b5b7318a9dd358bea92724986b29d88bde5c61ef7e565c2b703f975`.

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

Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 bytes at the common source pin.

Lines 18–19; 116 exact bytes; span SHA256 `eb59935a4244fdc2a51fb4ffd2eb2c3e23364c2755a0944a1ff873825f85bd98`.

```ts
          const location = yield* Location.Service
          return yield* response(tasks.list(location.directory))
```

## G57-E115 — packages/server/src/handlers/schedule.ts

Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 bytes at the common source pin.

Lines 24–35; 580 exact bytes; span SHA256 `623c7b57c1b67bc130e75e6c0e1b0c5c3ccf44bcbb668f3b779a96342a13230e`.

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

## G57-E118 — packages/server/src/handlers/schedule.ts

Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 bytes at the common source pin.

Lines 65–69; 374 exact bytes; span SHA256 `b439373a2b426d73f0086f4dbc8346ff92eaabec25acb24ecb4866ecf3112416`.

```ts
          const location = yield* Location.Service
          return yield* response(tasks.run(location.directory, ctx.params.scheduleID)).pipe(
            Effect.catchTags({
              "ScheduledTask.NotFoundError": (error) => Effect.fail(notFound(error)),
              "ScheduledTask.RunError": (error) => Effect.fail(new ScheduleRunError({ message: error.reason })),
```

## G57-E119 — packages/server/src/handlers/schedule.ts

Git blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; source SHA256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; 3217 bytes at the common source pin.

Lines 77–82; 305 exact bytes; span SHA256 `1a96f3c6e911776ae6f0450fd13dc5386a36fab32fcf16ab6c32df44b9c71d30`.

```ts
function notFound(error: ScheduledTask.NotFoundError) {
  return new ScheduleNotFoundError({ scheduleID: error.id, message: `Scheduled task not found: ${error.id}` })
}

function invalid(error: ScheduledTask.InvalidError) {
  return new InvalidRequestError({ message: error.message, field: error.field })
```

## G57-E120 — packages/server/src/handlers/skill.ts

Git blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; source SHA256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`; 1871 bytes at the common source pin.

Lines 16–27; 487 exact bytes; span SHA256 `acebf103e69b833e49cc424cd63bd8fbd23eda9c1215f05b9fc43fadf74a03ea`.

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

Git blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; source SHA256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`; 1871 bytes at the common source pin.

Lines 33–38; 385 exact bytes; span SHA256 `855ab66097572e1045a59afa8dab8b511021ed250d7c27cdc84750ea1cc89b6c`.

```ts
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        return yield* response(skill.remove(location.directory, ctx.query.path).pipe(Effect.as(true))).pipe(
          Effect.catchTag("SkillWriteError", (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message, kind: error.reason, field: "path" })),
          ),
```

## G57-E122 — packages/server/src/handlers/skill.ts

Git blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; source SHA256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`; 1871 bytes at the common source pin.

Lines 44–47; 241 exact bytes; span SHA256 `d555ff9c2d9392b7f1290818fed6f2ecbe6e1256a09a313b1254f8201428674e`.

```ts
function writeError(error: SkillFile.WriteError) {
  if (error.reason === "conflict") return new ConflictError({ message: error.message, resource: "skill" })
  return new InvalidRequestError({ message: error.message, kind: error.reason })
}
```

## G57-E123 — packages/server/src/handlers/trust.ts

Git blob `c6ca8337aaaee3a64bc2b9dac74764edd9ee1975`; source SHA256 `8ad52039bad0345cbe1926be946a4d1642230f07abb536c5d5324df7741116f2`; 2409 bytes at the common source pin.

Lines 14–29; 577 exact bytes; span SHA256 `593c078180a0520d9b188325f83dc2e72c0b8228d18761a0ff862b028fa14b4b`.

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

Git blob `c6ca8337aaaee3a64bc2b9dac74764edd9ee1975`; source SHA256 `8ad52039bad0345cbe1926be946a4d1642230f07abb536c5d5324df7741116f2`; 2409 bytes at the common source pin.

Lines 41–49; 434 exact bytes; span SHA256 `2629d39a3a9e782a76b011000a8edc734715df3f92abce00bb72b9ce0e29cc10`.

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

Git blob `c6ca8337aaaee3a64bc2b9dac74764edd9ee1975`; source SHA256 `8ad52039bad0345cbe1926be946a4d1642230f07abb536c5d5324df7741116f2`; 2409 bytes at the common source pin.

Lines 55–60; 269 exact bytes; span SHA256 `5c17336c4f340ada38121470b22d95fd57ff630a212c605146fcb6706d9b603a`.

```ts
          yield* ConfigTrust.revoke(ctx.payload.directory).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(Global.Service, global),
          )
          yield* applyTrust()
          return HttpApiSchema.NoContent.make()
```

## G57-E127 — packages/server/src/handlers/vcs.ts

Git blob `18356095e244f41eefe459a2213ae2263577d1a3`; source SHA256 `11eea74dd0da6ececd8e46f2a55d63f7ee318f5098ed4a931b4879e565e5efed`; 3540 bytes at the common source pin.

Lines 27–39; 570 exact bytes; span SHA256 `c49b4cb4bbde65a98303bc584f80ea64f8caf064b8c3aaf693f4b8ab79ed4608`.

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

## G57-E129 — packages/server/src/handlers/vcs.ts

Git blob `18356095e244f41eefe459a2213ae2263577d1a3`; source SHA256 `11eea74dd0da6ececd8e46f2a55d63f7ee318f5098ed4a931b4879e565e5efed`; 3540 bytes at the common source pin.

Lines 76–86; 581 exact bytes; span SHA256 `22c623402f267d4c64e28023074744c1e160b80e7e22c3f5af4108e15801ab1a`.

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

Git blob `36a1723eea73686796fe3917b42bfbfad6ed6386`; source SHA256 `061a54b7023425c5b0f9d78a9b41fcd84995a6553e2826725ff64245bcbc1199`; 731 bytes at the common source pin.

Lines 8–15; 422 exact bytes; span SHA256 `b441eb328177b6b7e3febfc43dbbb94ddc57c5e9173efe9c9919bb13c53a23b1`.

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

Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 bytes at the common source pin.

Lines 43–63; 885 exact bytes; span SHA256 `d852f461f0aa913b51915c0f14d7ca993dcd7c67f2f2f091c356591553ac739c`.

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

## G57-E134 — packages/server/src/relay-documents.ts

Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 bytes at the common source pin.

Lines 166–173; 347 exact bytes; span SHA256 `6a404a8d83f3ee9cb5bd6bacfaf2bdfcd02de6442c781338257e1a688d3b8327`.

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

Git blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; source SHA256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; 11105 bytes at the common source pin.

Lines 181–200; 889 exact bytes; span SHA256 `70a32136db33d86cc5e3346a35e9dcbdd785f432a31e98ffe956a90804cc4c4e`.

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

## G57-E139 — packages/server/src/web-ui.ts

Git blob `6bdd0f2213ecb53ca74ac935c0a16da1198fae77`; source SHA256 `2b473ed1ba3f6de98f602a6f47af37715dc827f989b7b7233df1355568bd83dc`; 2660 bytes at the common source pin.

Lines 30–46; 1010 exact bytes; span SHA256 `2cb86f05c6efb2bff17a36a18524cfd61e28d16afd3859445b27eea4338af2e3`.

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

Git blob `6bdd0f2213ecb53ca74ac935c0a16da1198fae77`; source SHA256 `2b473ed1ba3f6de98f602a6f47af37715dc827f989b7b7233df1355568bd83dc`; 2660 bytes at the common source pin.

Lines 52–55; 139 exact bytes; span SHA256 `437e0e7d0865a189025860a4727760fb4ae0363efb57266023a0b8abab098cdc`.

```ts
async function exists(file: string) {
  const stat = await Bun.file(file).stat().catch(() => undefined)
  return stat?.isFile() ?? false
}
```

## P01 — packages/protocol/src/groups/actions-binding.ts

Git blob `5d3c0a1f4956c97c285775ccb68b97a83b476048`; source SHA256 `0d24cd6645aae01e92a368d82bf69bf2b1d4dcf833b6e5da526dfb3138554f20`; 2530 bytes at the common source pin.

Lines 15–20; 490 exact bytes; span SHA256 `c4c141200481cd561aacfb11c2d6228a7c7c603e3776bb3b25b15564a7241580`.

```ts
  .add(HttpApiEndpoint.get("actions.binding.get", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, success: Location.response(Actions.Binding), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.patch("actions.binding.update", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, payload: Actions.BindingInput,
    success: Location.response(Actions.Binding), error: ActionsApiError,
```

## P02 — packages/protocol/src/groups/actions-common.ts

Git blob `3421cc6bf4002e1d60b06e0b38ea4341079e9bd1`; source SHA256 `431d715398a557a4df1ec6a00abcd786fd6633a9f96136d4237348ec106aa102`; 712 bytes at the common source pin.

Lines 6–17; 529 exact bytes; span SHA256 `4170aec08e5819add3a3471fc259213840ce74ef3a123c33c258984fb68520cb`.

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

Git blob `df7b4e04595cf59cc202f4e771549a5b26deb47b`; source SHA256 `60c097d3b0f689bb0b7ae78c3e52085ac699e417283542355b2101853096650a`; 1671 bytes at the common source pin.

Lines 10–18; 655 exact bytes; span SHA256 `5f0fc8844cfb284f6f4d23509f33e55689da1edd6c48b2313c9d876f0f1864b2`.

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

Git blob `3f10d378e05334b87044f4682bddb955829e89c4`; source SHA256 `41181bc92b6c8e8a66cafc591e3cd096ad2819841fbeed165717039b58c629af`; 1441 bytes at the common source pin.

Lines 10–21; 1007 exact bytes; span SHA256 `396cb7f5042d568cc3a08374482b775021bdc292a785b7c409152db235aa3430`.

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

Git blob `9dbbab41ae7934a392b1bf1c84a724242d6327d5`; source SHA256 `9a0403bf24c224895b323679c5b2518c03719e4f2d0242d40b0f04b6c81237be`; 1190 bytes at the common source pin.

Lines 10–18; 739 exact bytes; span SHA256 `03b61cbdaa5eff073dcc75fa2c8ac8099acb731dd89a5ce98ef210834b9d373a`.

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

Git blob `ca49542c3a6106b748d9826cbc4d2a86a2f38cec`; source SHA256 `5f2536f77880ab6ed56d0391392131dec166a4876d0793efd414917fcce10cf8`; 1315 bytes at the common source pin.

Lines 8–19; 959 exact bytes; span SHA256 `4ccd615a6760b05ab1f6672a1af1a9f78656de5a85bc0a20409381f63ebcf212`.

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

Git blob `1763c6e768e40c91ca59839c587a1a5360b48ba4`; source SHA256 `76d65f1b75a0c5273b918c399b68af7ac00f880f0bfbbcec864c0424a89774ef`; 3262 bytes at the common source pin.

Lines 8–23; 1277 exact bytes; span SHA256 `3c9f1205e1bfd45e7e6740222d74a47e7f93285359a4db1ef51f2ec57084e04b`.

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

Git blob `31d9a2c3441371883b3bb054dabd95c476d909ec`; source SHA256 `7a76272f1ec26e5ccb90705420c9ebca86f255fee55b88a3def300a538cbb0ed`; 2143 bytes at the common source pin.

Lines 8–22; 1223 exact bytes; span SHA256 `8e4f5588a9e4888ac9d190024a7b0f52788456bc5d2ce8f1ef79709c605529a7`.

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

## P09 — packages/protocol/src/groups/actions-workflow.ts

Git blob `a3551a8dd9adc2227c9ab239a6e54ac27c1e491b`; source SHA256 `5337f5dd0f397fe53807f54897ca49a59e37f5b2bb6d936323dbc7e4cb025c93`; 2172 bytes at the common source pin.

Lines 8–17; 877 exact bytes; span SHA256 `56cce89d7f88ca70d76848a64a121de12fd0f8f33245bd86e45c56067ed67b38`.

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

## P10 — packages/protocol/src/groups/agent.ts

Git blob `edc5df027602a83e1a85a90f89c8f93939d7a7c0`; source SHA256 `29757d8e109a561bff05d195979a69048c7a02c6ee20227dde48606da91d3948`; 3599 bytes at the common source pin.

Lines 9–26; 793 exact bytes; span SHA256 `63d2d8954515b0747ebcca7fbfdc24cc48cc26145244ab6c322543e4efea81dc`.

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

Lines 77–91; 696 exact bytes; span SHA256 `7af440988fe52c379b88c17bc76056cee22de38af9ad6f65ccab441d95f4e035`.

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

Git blob `1ad5dee72e17105d118eef8974cc283b68ea64ce`; source SHA256 `561bc5cfa8116287a20513d4f31c3294aaf92a12deb78ac1248e9835d26b072d`; 13026 bytes at the common source pin.

Lines 39–48; 499 exact bytes; span SHA256 `55f2f403bd332bb74d6209f82b78132a113ad1a0975f20e8c1f21273b59c9b2f`.

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

Lines 122–150; 1041 exact bytes; span SHA256 `41fcdf4fa9dc2672badeea6f02e162c288a7edf5afb00e8fd4b4447e46d590a7`.

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

## P12 — packages/protocol/src/groups/behavior.ts

Git blob `425a3a163de79e880f5ff12271f799d1d2c4ead0`; source SHA256 `fb98fbb62ede3de878e903ef0c9a7a5c5ba1418ef1c4cc9fdf589682f5848753`; 1255 bytes at the common source pin.

Lines 9–23; 679 exact bytes; span SHA256 `82b2f559e0c9b4982f1aaadbeab5e01360148e9853439fef081b520a0a492dc8`.

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

Git blob `23b0f0389ec8ff9fa55c88ddeb85c7d3e740b57d`; source SHA256 `f8d139d54bacba1df58ea757058c5cf6ed2773cbec0f75bf6db2e7a2d8ef8bb6`; 10513 bytes at the common source pin.

Lines 6–23; 694 exact bytes; span SHA256 `5d773443792b819dce6309e7de825c480e987430ea94aa4b85a20629890ce4e2`.

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

Lines 102–116; 646 exact bytes; span SHA256 `308d39ae61343eb5c018c81fa1519029bb71ab9569d61209b6db7ac6ac3badbd`.

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

## P14 — packages/protocol/src/groups/capability-connections.ts

Git blob `6359c2f9200522ae1745e2b551e3065d3660a4e9`; source SHA256 `9587fa37465609a08572e0e213014f59b5fceace360e792d64a2398081f7e993`; 4481 bytes at the common source pin.

Lines 9–32; 1059 exact bytes; span SHA256 `9dbc75048f854aa4a7bb8742b3a1e25a923e0ef5a0996b02577be0ca47fa6864`.

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

Lines 91–95; 289 exact bytes; span SHA256 `206156cace9e290e490a2fa45e3f560557d6f2ae7c81214d1a623986d31ba886`.

```ts
  .annotateEndpointsMerge(locationQueryOpenApi)

export const makeCapabilityConnectionsGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityConnectionsGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
```

## P15 — packages/protocol/src/groups/capability-operator.ts

Git blob `8cc30598b00b048918bff67b8dfd9e4c17e0e6af`; source SHA256 `86cb90696da816a6d4c39c08582be0c5aafd287ad40d38e8c8f1e9c008ed2126`; 888 bytes at the common source pin.

Lines 6–16; 631 exact bytes; span SHA256 `64e2ef25a0d8975d2822e0c6dd13b8c3e335cf766e59be43ce1649a5b7f6bfd2`.

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

Git blob `dd5dbd141492f84ecd5a54b16b27c334ebf31b0d`; source SHA256 `75201f38d78719bbd9649437ce55fa7ef18760fb0fb15c102a80739c98bc0b55`; 2701 bytes at the common source pin.

Lines 9–14; 353 exact bytes; span SHA256 `ae28d67c0b39430c6f0e1fb1fbebfa7776cfc03d9e3fe38e8409737030667e61`.

```ts
const path = "/api/capability/schedules"
const item = `${path}/:scheduleID`
const params = { scheduleID: ScheduledTask.ID }
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })
// Agent-created schedules only: create and edit stay with the owning agent's schedule_manage tool.
const errors = [ConflictError, UnknownError]
```

Lines 24–43; 1397 exact bytes; span SHA256 `7be63c32b2c96569019db1d174c35ad9fc0bfbd6ac9e48c1dd321e67cd24bcc9`.

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

Git blob `6d028268790e99a5e5d0150d2cd143216fd56a56`; source SHA256 `bbd3ed5066f29c4d150539240d44350acd8f4c63035e15c0a57539e3bd31ee56`; 907 bytes at the common source pin.

Lines 9–19; 405 exact bytes; span SHA256 `c0facfa4506979785d07d99a61354db54b975945e44d766e1545ade89c739543`.

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

Git blob `45c90cf87ab5a587c378aa2e61c2d97996835a0d`; source SHA256 `f86c534fc957edb9bc4a19d38e89a09c9482d06a63a6e79935c297d070ed01b6`; 3736 bytes at the common source pin.

Lines 15–40; 1354 exact bytes; span SHA256 `4946d8ea65309197d10a8397ad108f40eb8f830e3773aef4488d273552efdc67`.

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

Lines 56–65; 482 exact bytes; span SHA256 `9eecb3a62e5a77dea741cdf0e6830a65fdb23e9ab29e29e133cf76618f84f4c2`.

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

Git blob `23c549e2806d9c5a1d5187ce6d341640cc35ae8a`; source SHA256 `9c1a5962a9ea3e8fce8f5c7aeb85cefde7bc30891d00230d7fc6c3c649fb67b0`; 1439 bytes at the common source pin.

Lines 8–18; 391 exact bytes; span SHA256 `c2d8d39b8672bc3d2fb7dcdfdcce666e61965e814d01653e679c203eef9a36ef`.

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

Lines 26–36; 414 exact bytes; span SHA256 `de20f781c8865794c5d7d5131f68c25886fb717326554587baa0985501876895`.

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

Git blob `ad4fd15e9908fd1efce2277980d689ee07706782`; source SHA256 `563e0c55f2624483d03cc0cfdc61897d07e9f69de7a33a6b4eddf8495c4d3caa`; 949 bytes at the common source pin.

Lines 9–19; 459 exact bytes; span SHA256 `7912b6390ae70233d3a4b6feb3fa717512f8c81efef8be540727c91f2ffa2196`.

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

Git blob `a9c3d5c6643d271619f61f68444dca1fc5adcbc6`; source SHA256 `58b6a155fb294fc1f8ec6b592023e3df0461c154e32f0e0fbc368815eaa89ad4`; 1960 bytes at the common source pin.

Lines 7–24; 633 exact bytes; span SHA256 `1a370b6a4d12deaf710a1e29707ce4eb87bd407facd6abc59e03e1141684d3f6`.

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

## P22 — packages/protocol/src/groups/health.ts

Git blob `be777a5f8d482fcb5f3b06c1a21077e2fc452bb5`; source SHA256 `a7d0a532d850330d45e04d672088dffc9df36a504bf09c95b2e78ac8b9a7f701`; 592 bytes at the common source pin.

Lines 5–15; 396 exact bytes; span SHA256 `a9124d29a00ed84e523d53df54691d35c0c07392cc61be24d7f02834df8a3034`.

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

Git blob `ea13ec670bb99929cc76dcfdccc0c481870dcc0b`; source SHA256 `710926457a0a8785e2a08032ff0a1b344e3a2b885e0eef89a4b54363ab189610`; 776 bytes at the common source pin.

Lines 5–15; 593 exact bytes; span SHA256 `d893a4f1986f7389093aaa604ef8cb9a419acf892466e5951b3e15d5fc4adebc`.

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

Git blob `14d98becffeda67939dbf5d87f0b63cfbd2e70ba`; source SHA256 `07d62144b0b00aa08f1c43fb3a52388b6fd1dee07881d3d0d22a701b9fc0f57f`; 7681 bytes at the common source pin.

Lines 41–54; 635 exact bytes; span SHA256 `b5ffddadfeb9f3d28fa6c6e7bbe840353cbcfbaf82393ce6e4b001b60eb019ee`.

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

Lines 100–112; 640 exact bytes; span SHA256 `70250569854cade9b220c4b33ab0be07a5d1ffb26cce20e4569eb2ae498101ab`.

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

Lines 169–181; 638 exact bytes; span SHA256 `e26089cb97e61399722454e141fbcd184fd536fd394cc3558e0897251bac0edc`.

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

Git blob `b83fcad1267819111ceeb2a83c165664440379b7`; source SHA256 `204a60d3ebec15a9da53f9f18d6e2612334b35dad29b90022ba1adc11614b32e`; 2253 bytes at the common source pin.

Lines 9–14; 237 exact bytes; span SHA256 `4371e8ef85c8965b46abbeefa7c1f3759dac5c73579fd50c9a7065ef92c98391`.

```ts
export const LeanGroup = HttpApiGroup.make("server.lean")
  .add(
    HttpApiEndpoint.get("lean.get", "/api/lean", {
      query: LocationQuery,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
```

Lines 26–37; 518 exact bytes; span SHA256 `cd0b437fcb2655ff553b335f44939ed90f085e8c8569072c0853dc6c516927a0`.

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

## P26 — packages/protocol/src/groups/location.ts

Git blob `7f5c91563ac986c182e397173db9e5aa4653296f`; source SHA256 `b99aa362106a3dff080f713552d9db82059fb42e2379ba825b9edb55e7e86442`; 1760 bytes at the common source pin.

Lines 5–12; 250 exact bytes; span SHA256 `579b2612769b55d44b8ea742480d0386580ab7bbc68e1cac6f371ee31edb4fa4`.

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

Lines 33–54; 779 exact bytes; span SHA256 `a87efc5b49b2ce6afc4456577c1af5f299edd51de82215a4049ee0f2742c28dd`.

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

Git blob `af1abb1824158a7d1b9f4bad3f035d2f7d3859e6`; source SHA256 `2f8262ae4f8259bf778ad2a97aef3a83dfa507b58aa3e2d55fecc1e71d9bca7c`; 877 bytes at the common source pin.

Lines 9–19; 417 exact bytes; span SHA256 `bc12bb00627060cf08b312793a8b13d14037738c0c75a7eee911ac0a873706ed`.

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

Git blob `6b2d1fbbd2dabfff14404e2fcd5e04715bf338f6`; source SHA256 `40d05cb2bff6ec512c5952ffc719a68744649a6d1c89be05be9dd1e76f0904ca`; 7750 bytes at the common source pin.

Lines 39–53; 548 exact bytes; span SHA256 `64ef02999d4dedea1c5b9afd12d54e177b18aaf46b7176776533d789e94fb524`.

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

Lines 173–188; 650 exact bytes; span SHA256 `a177c415687966d59341a2e014bdb2c771140f3ab3773940ac6d005dd2fd534c`.

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

Git blob `1a098d8e8f58b0705fcf0c3921f8a98c08a19340`; source SHA256 `2aeb305bf54748eb641ce1b691bab954d95fb2fbf1571ce0f937e58f54a6a9e1`; 6192 bytes at the common source pin.

Lines 7–25; 783 exact bytes; span SHA256 `b0b3b13da057fe00d4295c02801aa252adbf5c7bdc846e40a5d9e7cc4da36a8d`.

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

Lines 38–49; 510 exact bytes; span SHA256 `eba42e087705ae6d3ba576d2b54e6be401f9c537d7ef78908177105812c8db2c`.

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

## P30 — packages/protocol/src/groups/permission.ts

Git blob `a34d8726146a5cdc1b989b583a4943290584d34b`; source SHA256 `9cef92dd60326651b2ee4b6d5946e4381ea6791076c017da532122b9be0fa1ab`; 5828 bytes at the common source pin.

Lines 60–84; 1208 exact bytes; span SHA256 `65db8f5d7aa44e8c772b6927157fcd957e7dd11ea9a5b72779300ce60d6d4ad8`.

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

Lines 104–128; 1116 exact bytes; span SHA256 `2a81535fd993c0f17c77f2f3a35d92a48e73fe93cbe17435c3eca6c3f652d382`.

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

Git blob `6e9c31ffda7a581a06f82e23b82185ffa31dd77b`; source SHA256 `b7be27f97fe517482a62e18e222aade4965880d7e4f5c60d3bb2b7f43c39c3fa`; 2589 bytes at the common source pin.

Lines 10–31; 722 exact bytes; span SHA256 `cd5011b19bb948f7268501aec893479d439f7a00c9cb18c33e44cab395b7070b`.

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

Lines 36–43; 277 exact bytes; span SHA256 `47dba7d7dcff111a307eadd8fa1a8139c5a015ffc62ea1d7a858ed9cb21332d9`.

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

Git blob `46e212ecd9aa4c7eed43bec02f78e87a75d65b65`; source SHA256 `da3a028185367a5d87bb1ef19b0a9a387e38dc491713326c569b97d10cc37445`; 2606 bytes at the common source pin.

Lines 10–26; 640 exact bytes; span SHA256 `c1d9270c66c1bcfff85d168cd75f8a44ddf9cb4d576e6ed220a070ef1b87d1c8`.

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

Lines 51–61; 371 exact bytes; span SHA256 `2fd8be10bdb5f18067bcd40668e61bb0c3948c6f953557d08bffeb2359c81d99`.

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

Git blob `3b4883efab40b49a172f80ba54b4f9ee5594a6b8`; source SHA256 `2d6ffaa70170cc87e6950f8050bcd80113dfcc9fe588d8142e451afa6671de45`; 2260 bytes at the common source pin.

Lines 8–21; 503 exact bytes; span SHA256 `2af0ab411774ade2945489bd9cdbe7d9a8edfb01675b88cff86d86250bb87abf`.

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

Lines 25–37; 547 exact bytes; span SHA256 `88a90dc7e01b18b1324b915b03d064f068e53ed0107559287f74046eb88128f8`.

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

## P34 — packages/protocol/src/groups/question.ts

Git blob `c946dfc26741746eab179ba8061391ead76a182b`; source SHA256 `e128a5558fb90cd1492b3d4621be4359e66af7f9b6ca662373975d64b6b8e31b`; 3616 bytes at the common source pin.

Lines 33–62; 1396 exact bytes; span SHA256 `19986a817f61f373b32b13e2c9b0dddfdfb79d1d8725148c4b99edb356652ada`.

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

Lines 67–78; 595 exact bytes; span SHA256 `7fa724d8a1537715ba985bdd2ba3103ced99ebb1eb6d3f937b62e1012484da42`.

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

Git blob `d0abf2ac581e1e560e6cc3769bdf6b5afd51ea36`; source SHA256 `765710e476d9aad6c06abcd7b9b610e34e57a57b0e1ede116a33b64b7151da10`; 6080 bytes at the common source pin.

Lines 11–18; 426 exact bytes; span SHA256 `d24e635648231783086ed5648066efa8032daf8f6b2e5e9a364200168d8533a6`.

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

Lines 83–104; 852 exact bytes; span SHA256 `08f019046472b3673679b4c32815992ee7e3d0023019e7d0ec8875546205609a`.

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

## P36 — packages/protocol/src/groups/reference.ts

Git blob `0820aea4331c4617c4f4d5ef60bc94575e72ca6a`; source SHA256 `10cda63b26f6a8c899e61cd1da3bae24b0698efb7050af7d01abf1a9beb9b977`; 946 bytes at the common source pin.

Lines 9–18; 416 exact bytes; span SHA256 `d95db4735e0cad21512fea668506ccbe06cb3b187b182388e67dd3de6bf66035`.

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

Git blob `03680e54451165bb46ea12a5466322dd20357d89`; source SHA256 `4ee493b253f003a5cee6225b6acef9c9ab6b68af4d6c3775fcda126b555a5539`; 17770 bytes at the common source pin.

Lines 15–41; 878 exact bytes; span SHA256 `dde27683dd38bd563320e4a7dd5493af50ead5a7e5abd4ddab94d456b5d8c80d`.

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

Lines 306–319; 623 exact bytes; span SHA256 `a0d862634d8177f3f6f9cd7704f51c80b1c46949bfec493a0e11496dc905772d`.

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

Lines 353–366; 615 exact bytes; span SHA256 `aee49894ce839b55a86193e9c0a558a038edc91962075125d4a6ae365869f3d7`.

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

## P38 — packages/protocol/src/groups/relay-hook.ts

Git blob `dfc36c1b3b2cdf2b597e770b32c8bd4e0ce719ff`; source SHA256 `889c86dde2a4af1076f93147d98591d6682ef2eba09b8144861892f3298afb5d`; 7034 bytes at the common source pin.

Lines 17–47; 1427 exact bytes; span SHA256 `3801189ced9016c4243585416602b353056c58311ddd4c802af6e8d55b7106ad`.

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

Lines 126–138; 494 exact bytes; span SHA256 `62bfba7eb516a9891ce0244432cae1a88098e05ac13119ee5f4aa0f516f944ef`.

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

## P39 — packages/protocol/src/groups/relay-run.ts

Git blob `98e60955b216d71887830cda06f8d07cd442fa98`; source SHA256 `7237bae800ad36fc21c77f3df21d5480fc11760e4f9b432e0c0f60dc06294834`; 4378 bytes at the common source pin.

Lines 8–10; 249 exact bytes; span SHA256 `07bbbd4659bd8dedb3955bdcd0ed215ca12ca35c84160ce895e3714cd4235543`.

```ts
// External runs (Relay for LangGraph), read-only: each `<location>/.relay/runs/<runID>/ledger.jsonl` rebuilt into the
// run the app's Executions screen renders. The ledger is self-reported by the external process, so its audit is never
// a pass.
```

Lines 43–47; 264 exact bytes; span SHA256 `8e33823875ab9050fdc40ace1812d433adc85016f9bfd35cf3b599f7493c4fe6`.

```ts
export const RelayExternalAudit = Schema.Struct({
  status: Schema.Literals(["pass", "fail", "pending"]),
  code: Schema.String,
  rows: Schema.Array(Schema.Struct({ label: Schema.String, value: Schema.String })),
}).annotate({ identifier: "RelayExternalAudit" })
```

Lines 98–112; 617 exact bytes; span SHA256 `51bd47964e1c94fbc20fe505d31e8be0f627df5c7afa7bcad391d4388cb73d71`.

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

Git blob `517434f6b238a90ee46da5790343c4c0f58b4cd5`; source SHA256 `d890554a5de05935339e01dcb74076a0cabd96d080d07b07bdd8151cf5978402`; 1650 bytes at the common source pin.

Lines 9–24; 1186 exact bytes; span SHA256 `8503ea154df3c7d0846e1720fb60df48778b2940ffb89cf37d720b5212d1dae2`.

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

Git blob `0ca32d9e0c312fa279dbf98b1c3470252451876a`; source SHA256 `d901c49c299f7005f864dc21c0b7e1a99d4479888d10454a653dc7483c3f63c8`; 3793 bytes at the common source pin.

Lines 8–21; 386 exact bytes; span SHA256 `59654c9144c3debaad5a127c86f2bc9c193055b8a2e7addb6919abd6d65abbfd`.

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

Lines 91–104; 618 exact bytes; span SHA256 `07059a71abb28daa8a0387c83c54c1dda5e677d8b023ba7278d72c3a098d6b1b`.

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

Git blob `28b28134f9b9c751f9564737ea46034a9b36761e`; source SHA256 `290c280836fb40fbd5d963492088a4ff60c7b1d1d6315125e1317d6f58ce756f`; 2259 bytes at the common source pin.

Lines 29–42; 639 exact bytes; span SHA256 `b64ea5757b735aab98d937eee72c87b739e52ba5482d4a7a8060a36d2770cd31`.

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

Lines 46–56; 473 exact bytes; span SHA256 `7dedcf2fc8fa8c1b0bdf3b43776e040717e1027af02f054be579e04bd980ef6d`.

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

Git blob `6edc0294a84214180849fb00e25ce7f5a10ea381`; source SHA256 `5c605bf5836bc45630538c2b037e173b4062bc2d0991b6f0434d68b746bc4589`; 1986 bytes at the common source pin.

Lines 5–7; 173 exact bytes; span SHA256 `4e0b008d068d9574343bdc012cb1a064cbb3ec345ba71e1f724d9ad388eaa851`.

```ts
const DirectoryPayload = Schema.Struct({ directory: Schema.String })

// Trust is a user decision stored in the global config, so these routes are not scoped to a Location.
```

Lines 22–45; 1051 exact bytes; span SHA256 `e6b9f9d63a2aa59f71be99af147d70b0f37a848d6a7dee19bce7661e10665083`.

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

Git blob `394f864cc464cbaaa7c11c565c12fb738702c1a4`; source SHA256 `ed0bc013c50e318eaba1e8dc8417ff97aad0f4508dc16b67c2c58edac280b6e3`; 3386 bytes at the common source pin.

Lines 40–55; 673 exact bytes; span SHA256 `c33a53c68329ba83ccbf561a6648116ce6e737e567e02bf38a79452f0d7cc516`.

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

## Q001 — packages/schema/src/agent-file.ts

Git blob `1fd3774ad15a772b5895ffd4351fc55206cb30c4`; source SHA256 `2a50259000db39a4e081479ef7ff288a5dd2c7045dec0abcc851eaf169160a31`; 1931 bytes at the common source pin.

Lines 16–35; 978 exact bytes; span SHA256 `238860281c09be06bc856da282d75ed19154291a3a4e76e27b25347f92143f44`.

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

Git blob `6d20c9672dd5d72fcca1ef86593199673b742acb`; source SHA256 `af5eb18c92b031ccac8b44c48d260e2f5edb4913c0e789763ecbda21922266eb`; 2654 bytes at the common source pin.

Lines 28–41; 539 exact bytes; span SHA256 `70ab2d730e6ffcc53a957ccc7caaa1a1aec3c1bfd439494012715de244f252b1`.

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

Lines 55–59; 257 exact bytes; span SHA256 `a4b0e7364b8c6448fd41a90d0bd0c9e0b61c1817caae4e320749874c175658a1`.

```ts
  /** The pinned engine set the agent's commands run with: the backend toolkit or the research toolkit. */
  toolkit: Schema.Literals(["backend", "research"]).pipe(optional),
  permissions: Permission.Ruleset,
})
  .annotate({ identifier: "AgentV2.Info" })
```

## Q003 — packages/schema/src/behavior.ts

Git blob `7209e235841eed521f721c61423b297fa0e18bd7`; source SHA256 `bf9bdbd85d7365262fd1781f114a74d5add66685907cd297a28168503eb98890`; 935 bytes at the common source pin.

Lines 5–22; 862 exact bytes; span SHA256 `7c8f9b38d2db0ceef23e40d85418933d899a3c8c16515d01f3f9438eac58793f`.

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

Git blob `2bdf3a95c501408ecca807a9b315c79c121216b7`; source SHA256 `b12f94549d912d81a91c6209a285ef37ec1897fe204d162d0372724d857c32aa`; 497 bytes at the common source pin.

Lines 8–15; 293 exact bytes; span SHA256 `51590ddbd094e810d330cb511d01d68f1b156a3abf973532978058cdddd3bee3`.

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

Git blob `44101dd87671745c56151d74417a9e6ba6ade97d`; source SHA256 `2fe451dc9d1c854d6aeaa64a61a25df3d1c4886de36ac3217a04f99a8d14a527`; 1091 bytes at the common source pin.

Lines 6–28; 992 exact bytes; span SHA256 `19beaaf037b0025a217f96cc90ec84ec59a536605277a4b2e840447fdfe9eb28`.

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

Git blob `b763d2d57ae72b3c0cb76b3aedc962026fc7472c`; source SHA256 `69688305977b38a3e717bbbbb602a60f544da7a9ead0fa70843cb2b4f3fed5fd`; 374 bytes at the common source pin.

Lines 5–9; 290 exact bytes; span SHA256 `69aa450031ac19d7dc3d96fc753cdd4db82fb81f4d20731747fb0fdf2a6f188c`.

```ts
/** Host-owned, ordered rendered reminders. Neutral text, never permission or tool overrides. */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  reminders: Schema.Array(Schema.String),
}).annotate({ identifier: "PromptContext.Info" })
```

## Q007 — packages/schema/src/skill.ts

Git blob `6289f4503125ae14390871cc26bed114012f6b33`; source SHA256 `0e808d17b84e5435dcdf6e89ef41a6f9830f158772212d2dcf154b5e63de46b5`; 2822 bytes at the common source pin.

Lines 20–42; 1044 exact bytes; span SHA256 `0a9f51e51050e1f19b1d1eb11547156e45dbe979cd04ecee2fff587460000997`.

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

## Q008 — packages/schema/src/session-subagent-models.ts

Git blob `8f233c6e13ea9bc37a13a5bb29ea17983eb6862c`; source SHA256 `60f09a057cae28c883bf0f32f65cec0809c92d8305f59fe78c07cb5dfecfd9ae`; 624 bytes at the common source pin.

Lines 6–15; 491 exact bytes; span SHA256 `dbfae21facf6fc06ca929955e4e616aff3fd5f074bf034e61cfd8579636a3376`.

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

Git blob `17e4e4060b246d488c16cad4404a4bed956d8457`; source SHA256 `21d4bd4fae0f63d6c254b85160a5dbe2e9f5d136a7460ed715f57adc9fcffb43`; 2906 bytes at the common source pin.

Lines 28–40; 510 exact bytes; span SHA256 `73edde76c148576c6fd4899d6d43b8cfd0b98141b78f73abcc56c59dc55b8ad1`.

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

Lines 67–78; 721 exact bytes; span SHA256 `8b973f7bed0de9f680af114bdf38747d8de7c0edc2e8536f87ab74532744cec8`.

```ts
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

Git blob `969a6dc25cad87bff7309ad7444f5c997ad0913b`; source SHA256 `58cd2074b989e82b8060e71614abdd83f2e7db3779c68709b05a8780deebbd6b`; 633 bytes at the common source pin.

Lines 14–20; 239 exact bytes; span SHA256 `737744085502ff596628cd806a5bbf6415133fd6609d9bcb519430cf2f0d5508`.

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

Git blob `aba5ebfbaf275cfb715cc0ef4b07623e165e4fe0`; source SHA256 `7eb21fc310e3325445eb988b95f21e0b14f8715ba6426cb94c484a5e70eb5913`; 3142 bytes at the common source pin.

Lines 46–68; 943 exact bytes; span SHA256 `c363c27bbda681f7042b84acde8047aba8ce0821c00236ff9420a04eb54ec10a`.

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

Git blob `05222d539819ee243c17cb4fd03e8ee6a1eeab69`; source SHA256 `145a30ba642db86d826e6309d0b0d66c3ec7ba04e891170d228b6cd1b340a47a`; 880 bytes at the common source pin.

Lines 17–24; 348 exact bytes; span SHA256 `1277a1dc14b98258d6928be46ec6a616d6724f75ba03d3dc31d59b0e71d310e8`.

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

Git blob `acf49caf59b4553975536c74901855163ad08961`; source SHA256 `e9048f045b803a4a9f1fcd8de2e87a39ecc5287b7265be64dc0b7ba8dfb7de76`; 1932 bytes at the common source pin.

Lines 33–47; 884 exact bytes; span SHA256 `1da1678e1bfa9dfca66ee59cee96541050fdb448bf383d0432c76d19c412dd92`.

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

Git blob `ed1169ea6757ee981fc425219b2e82442db7c8b0`; source SHA256 `068bfba573c403c25442eec7ba816883f62e313099717943f2c1992822659d78`; 314 bytes at the common source pin.

Lines 6–13; 170 exact bytes; span SHA256 `c8ef839487562652867c1db3cfbc8cd52435ce6103ba939d197accb8714c3321`.

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

Git blob `7f6a72bf000617eb14ee8bedebd9dc0800260510`; source SHA256 `7b6e41ea6760ce94f5e817a574bf071608ad7e38639dcb520974d3e4de9aa1e0`; 821 bytes at the common source pin.

Lines 7–25; 656 exact bytes; span SHA256 `ec74f8083114e61f48187a8610f6137f87e90f198468cd10e44e474f13a9ad64`.

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

Git blob `9812a673fb06d00a262de2a6dba6d674ecd52365`; source SHA256 `3eeb8c682210921b6dac49f0d785d9088a48503c4539d590f5c3b0e848d78b27`; 838 bytes at the common source pin.

Lines 1–30; 838 exact bytes; span SHA256 `3eeb8c682210921b6dac49f0d785d9088a48503c4539d590f5c3b0e848d78b27`.

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

Git blob `8d2f061517475e03cad1259e33af5576b174dbc6`; source SHA256 `47aad330577133240b3c33938363fa980d32cd00de9564b8fccdcad05c110e7d`; 251 bytes at the common source pin.

Lines 1–8; 251 exact bytes; span SHA256 `47aad330577133240b3c33938363fa980d32cd00de9564b8fccdcad05c110e7d`.

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

Git blob `e43e9673f6395fae50aa7f8fc1e727d2af8b7fb4`; source SHA256 `8756530476173c3888135b3ac76bb14069d61c3d4074464f2a307a0d078d19c9`; 594 bytes at the common source pin.

Lines 5–19; 485 exact bytes; span SHA256 `c0740b72e4a82d3dca63cea60380f1ef6b13c64ea911fdc008661253966c4f29`.

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

Git blob `ce35bf3b245234f33d9322ec0d9b8fd4acfd803e`; source SHA256 `a21abd037393a1a7b6f5d7c24629eef97e720582f79ac9b36b2ed80e18ef02c3`; 235 bytes at the common source pin.

Lines 1–9; 235 exact bytes; span SHA256 `a21abd037393a1a7b6f5d7c24629eef97e720582f79ac9b36b2ed80e18ef02c3`.

```ts
export * as Workspace from "./workspace"

import { WorkspaceEvent } from "./workspace-event"
import { WorkspaceID } from "./workspace-id"

export const ID = WorkspaceID
export type ID = WorkspaceID

export const Event = WorkspaceEvent
```

## Q020 — packages/schema/src/project.ts

Git blob `7e73530a6d5624127c9086d3b6e783ca8072461b`; source SHA256 `d12577c05384e8415203a81ff3041246497cdb158427e06158dc134d271dfb97`; 1619 bytes at the common source pin.

Lines 31–44; 484 exact bytes; span SHA256 `e9674657478d02e25f982e111e25ebf5d1d054d96c1f86735cd2e64d944a60e2`.

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

Git blob `e6cbde86499bcc38afa52c55f5381ce337d110b9`; source SHA256 `c89b1c2017873d66d2c744ef6234ac4a2d89e49308e99576652bdf96b27df496`; 312 bytes at the common source pin.

Lines 1–10; 312 exact bytes; span SHA256 `c89b1c2017873d66d2c744ef6234ac4a2d89e49308e99576652bdf96b27df496`.

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

Git blob `850b87bcb35654013ad247ebf0fe0c0b03943739`; source SHA256 `d77bbd07f3974a5b2e77a3fff7bd2613b4613e0ca7ab3ed91c5f2073d1156856`; 1113 bytes at the common source pin.

Lines 8–30; 916 exact bytes; span SHA256 `f63519a1ffd1d91bdc423306ebf7b6d624bca8244229e2c2210a343901261c32`.

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

Git blob `82e15e077190630ba023e6a16907ccc4555e2e6c`; source SHA256 `f9ef09253b0c964ccfa1e0c767a051a40236a120c9418056b58dfe7645cbba30`; 866 bytes at the common source pin.

Lines 7–32; 703 exact bytes; span SHA256 `b261beabe1a82406e33158db882909ed14754001c27bab663e9f8b0a166daf83`.

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

Git blob `c42ea5821e1325a08fba6d00c62f9651f99adb58`; source SHA256 `c225902e262ec6e9a7dbf10d1191d134d9163153a6eea85d3b1c95e38e3c544b`; 468 bytes at the common source pin.

Lines 7–22; 316 exact bytes; span SHA256 `2906b438452c5b0c38f5984e94bdd8c00bbc122506f177ec00792cf1be60eaa5`.

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

Git blob `45226df28ee3f809b2bd5aa2daa289ca2d565eb6`; source SHA256 `a55485c32b27c93c1dba5a523c33748394207759dbe1460e98066b639b0c842b`; 453 bytes at the common source pin.

Lines 6–13; 343 exact bytes; span SHA256 `7269c2542328e0a7380d22c72aec1b67aea9fbb6c8194bf22424187fc3d5143c`.

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

Git blob `5e4da777cae846e639f0288e48996acf43ae71ec`; source SHA256 `60e6e5d4836f867ba0514bf13843a7d3ba17ef243826f151deb48a74034183d8`; 361 bytes at the common source pin.

Lines 1–13; 361 exact bytes; span SHA256 `60e6e5d4836f867ba0514bf13843a7d3ba17ef243826f151deb48a74034183d8`.

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

Git blob `1998c1b9fd688f93f81201cdec8fa8d860d8ed87`; source SHA256 `c6972ac22f347c2ac25e56250e77a8d17d44d2a353d6a1680cca2c1bbca364d3`; 1323 bytes at the common source pin.

Lines 15–40; 880 exact bytes; span SHA256 `e5603d52f9a6fa4e7fd5a6db5bfb363f6360bce02dda076ebfc568c3890c6a08`.

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

Git blob `d1955f25a4e504ade467921f39b479fd2044881a`; source SHA256 `16ab2066e433f2b36f2931fcf4be859e50f8c6e1ca9d6960f2ca42b81c81bc58`; 3279 bytes at the common source pin.

Lines 3–15; 491 exact bytes; span SHA256 `2a1645f9810082cd8893fcfb505a00102a4cb238949a8033d0ea5142d71fbec5`.

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

Lines 80–96; 694 exact bytes; span SHA256 `484fcb693305a0c10b8a10d6ff61658d27dab79d00855167cd3d45fce2200c71`.

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

Git blob `1c0d720dc4bea65255037b339a143c5bc050b06f`; source SHA256 `8473a92a20bd47063c4335f2c13e6c0be8273b2777ca99d6c3b887d2588651af`; 332 bytes at the common source pin.

Lines 7–14; 190 exact bytes; span SHA256 `8e10619b2eb2d22187cc123b2012f139aa2cea10623870215fea04ac3aefc67e`.

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

Git blob `84b623a2742f9de3ea1cea82342e6f32b10cb532`; source SHA256 `74ce167e60cbd14c318640a2bba84d9a2dbeb3c75991745b228880f19a890bd7`; 1407 bytes at the common source pin.

Lines 12–39; 1000 exact bytes; span SHA256 `0f7a97b9e9196b7f4c95053a1b119587b5a29e1c78fca387b5adfd91ecff9e58`.

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

Git blob `a5c8a3fe10572520b9769a5c7ccd1547063fdd33`; source SHA256 `77dfc18af22bcd70c8f5fc15add1a209f37b205bf7440270013ffb8657c403a9`; 3172 bytes at the common source pin.

Lines 6–8; 268 exact bytes; span SHA256 `b918c6e765617097dec2e1efd43229bfee150218374c799bfcc422d2a89e0970`.

```ts
// Pull requests on the repository's GitHub or GitLab remote, read and opened through the host CLI
// (gh or glab) that the user already signed in to on the server.
export const Host = Schema.Literals(["github", "gitlab"]).annotate({ identifier: "PullRequest.Host" })
```

Lines 32–56; 941 exact bytes; span SHA256 `150387c58df465eb68f99c4a6dc137b82b0c25102c7b8200adc8887562599075`.

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

Git blob `269364bded85901e4c30b79da012f19d31d68f31`; source SHA256 `bd5898f125d058bfa934f14bb255022099b9654e6b10e5efaa767fcd34d94b7e`; 2161 bytes at the common source pin.

Lines 22–38; 789 exact bytes; span SHA256 `580c8935665ba2043d76ae12fbf694bfd6515dd83917e40bc6b47bfa86cb03cf`.

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

Lines 40–61; 739 exact bytes; span SHA256 `088ad6f92edd9a6c95c36aa8ac00dcab3540e94e163c03eba404f9119bad278a`.

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

Git blob `9b258575a902bd62826e5f30214d236cfa36e8b5`; source SHA256 `189a6e91a7bc12ba4ccb1355b2aba8673f0fbf4fca1da62264fe799c0bca97ee`; 346 bytes at the common source pin.

Lines 6–10; 231 exact bytes; span SHA256 `248d92c1665a19c1fffab3f711cf88138e5e78ae119cdcf39138bd08c157bedd`.

```ts
export const ConnectToken = Schema.Struct({
  ticket: Schema.String,
  expires_in: PositiveInt,
}).annotate({ identifier: "PtyTicket.ConnectToken" })
export interface ConnectToken extends Schema.Schema.Type<typeof ConnectToken> {}
```

## Q034 — packages/schema/src/provider.ts

Git blob `51ff4b37913d568e9c59aef54e64041d9db14de8`; source SHA256 `f72afc446470bd4ac6fadce7f880539590604052c3cb003f39a415f2adcc1834`; 2352 bytes at the common source pin.

Lines 27–43; 668 exact bytes; span SHA256 `f98ee713325e1bedebfe4d8d5983fd004e841593028710665cf65b40641ab7bc`.

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

## Q035 — packages/schema/src/credential.ts

Git blob `e54e2f680b7b3179a28996078d670def3012c3dd`; source SHA256 `141f051d45fbb49d08b72154d5ddc4d398b87f18b106b948e67fa05a72e4bef6`; 1263 bytes at the common source pin.

Lines 16–35; 751 exact bytes; span SHA256 `927235d2bc9138a487a2bd17023c520b65c47415f26ca379cf9fcaca6768b5ee`.

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

Git blob `2590dfe9f691c0410a419326e03587e554e6ac88`; source SHA256 `7f905d10763d397041dc8112e1761a27b8ebd976b0dc0a38ecfeb3dec84b5294`; 326 bytes at the common source pin.

Lines 1–7; 326 exact bytes; span SHA256 `7f905d10763d397041dc8112e1761a27b8ebd976b0dc0a38ecfeb3dec84b5294`.

```ts
import { Schema } from "effect"

export const IntegrationID = Schema.String.pipe(Schema.brand("Integration.ID"))
export type IntegrationID = typeof IntegrationID.Type

export const IntegrationMethodID = Schema.String.pipe(Schema.brand("Integration.MethodID"))
export type IntegrationMethodID = typeof IntegrationMethodID.Type
```

## Q037 — packages/schema/src/integration.ts

Git blob `a7db6b20885bba9a3d72cfd3da3e9938f0656968`; source SHA256 `e11e093e3b692f2bcbcfd6cbdbe10e5cc99e4f7f1a5a1a828bfc76a54a476dad`; 4597 bytes at the common source pin.

Lines 52–78; 1139 exact bytes; span SHA256 `9f326f68a9f0661e0b31e5e817f3663e7024377ea86c47f852f3457d806f5d4f`.

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

Lines 123–131; 522 exact bytes; span SHA256 `8c71b9f2342fef80382001a679684587efbb2b142f123f0469a2cae1984f44da`.

```ts
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

Git blob `2bacb977a870b5515d4745b16e3748c7b4d79e93`; source SHA256 `37d3914dab08b851c9c5a0c0dd7e1a3c77ab6224a8802a0a00fbb178565ecaab`; 787 bytes at the common source pin.

Lines 7–22; 583 exact bytes; span SHA256 `2bfef5330ba393c4a78c91d80d142dfcee090607678e9ee390ca9af9bbadfb5c`.

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

Git blob `54abb5b1280b8e119173d6503e29fee25e49940e`; source SHA256 `4dd398e781bd2bc9df86c02e7fcca429d16906c30cdea3d08a54842c220213eb`; 213 bytes at the common source pin.

Lines 1–6; 213 exact bytes; span SHA256 `4dd398e781bd2bc9df86c02e7fcca429d16906c30cdea3d08a54842c220213eb`.

```ts
export * as Catalog from "./catalog"

import { define, inventory } from "./event"

const Updated = define({ type: "catalog.updated", schema: {} })
export const Event = { Updated, Definitions: inventory(Updated) }
```

## Q040 — packages/schema/src/models-dev.ts

Git blob `4432bc4591ec656439ecd148300ccbb2bd0becd5`; source SHA256 `fc63c12f2ae068ffb32a233cf554af7e942725e0dfa77236fe497b8dde76adbd`; 234 bytes at the common source pin.

Lines 1–9; 234 exact bytes; span SHA256 `fc63c12f2ae068ffb32a233cf554af7e942725e0dfa77236fe497b8dde76adbd`.

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

Git blob `5ef3ad45be47a75d78c7ef9c68b0f3ab34c7dfcb`; source SHA256 `b9b3ad22fb2f1bd41c5aa6de956e97178b2e5adb0e6b130bf1a188096ca1c6af`; 2067 bytes at the common source pin.

Lines 6–19; 723 exact bytes; span SHA256 `39ce0c484cb42bcb127d9c91c34044362dd41a324df30f7144da934796d486c2`.

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
```

Lines 26–45; 923 exact bytes; span SHA256 `314cbfd37979c9e51aed8b96b428d8833a6edcf1140dedc27578c5254faf2128`.

```ts
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
```

## Q042 — packages/schema/src/mcp.ts

Git blob `bef08e6425d75218a6359c0c499ab7cb190dadf8`; source SHA256 `4570efac1d90606a3d3df17348041e13faecf78396d2fbfb942b7e6fe393a3fa`; 4396 bytes at the common source pin.

Lines 6–35; 1302 exact bytes; span SHA256 `f0cdb62fe1d70d9725be9ee69a0ee431a14dacfd6a23ff511c6ef70199875e20`.

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

Lines 69–75; 335 exact bytes; span SHA256 `abf6e403ef0e5a50ddd86c3e7f1d7564d6e598df17f553926803766241f2a6a7`.

```ts
// What a remote server's debug probe saw: stored sign-in state, the answer to an unauthenticated initialize request,
// and, when that answer was 401, how the OAuth discovery went. Secrets are masked.
export const Debug = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
  oauth: Schema.Boolean,
  tokens: Schema.Struct({
```

Lines 100–106; 403 exact bytes; span SHA256 `0d04d9adcf10830d341fa1e154bcb5656c85b52c65ea8bb86a10b0d2fc745bf0`.

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

Git blob `4cdf2a29a859779944ec1698016738dc29e82bb8`; source SHA256 `17c983ad6c701bad096db8123e8e309c3a488bd58b8667a0454cf6a07a463ba2`; 595 bytes at the common source pin.

Lines 6–28; 489 exact bytes; span SHA256 `f2ddb078876c06fe539d51e80303d4cba62b1d316aa4155d117d24a70bc16bea`.

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

Git blob `8aaa0b33b04c37f18dec6f0f3f4cf37cebdc3358`; source SHA256 `4916e2ca1bce6b4b4ad78aca908fdd18d39dd6f2e19cba6f4a986cac01c1cbfa`; 301 bytes at the common source pin.

Lines 5–12; 238 exact bytes; span SHA256 `96937101423f21878c7c7d13b6d29bfbf23e98e7f873ff67ff3a54f04279c84a`.

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

Git blob `b6908469663afaba35adca0e94f468c1b530a9aa`; source SHA256 `ae7b29bb4d79ad13f5be53d43bdfcca87b32156caefab05bdb66e4fb9fd57fea`; 200 bytes at the common source pin.

Lines 5–7; 126 exact bytes; span SHA256 `44a89882f9f2b90a73a7bdabc32406df45315a3677c586d9dc0cfa8c36464b77`.

```ts
export const Updated = Event.define({ type: "lsp.updated", schema: {} })

export const Definitions = Event.inventory(Updated)
```

## Q046 — packages/schema/src/formatter.ts

Git blob `21bac081022f90f7304307665daf2c9b021a06b9`; source SHA256 `164190a5fcad45f47b010690e46ab672243b653c6f5e03f755db2f9c130e0e84`; 294 bytes at the common source pin.

Lines 5–11; 219 exact bytes; span SHA256 `e9fc980c84d91190961b80711f47703fd6aef2fcf31c37f6e48bc992a43d773a`.

```ts
export const Status = Schema.Struct({
  name: Schema.String,
  extensions: Schema.Array(Schema.String),
  enabled: Schema.Boolean,
}).annotate({ identifier: "FormatterStatus" })

export type Status = typeof Status.Type
```

## Q047 — packages/schema/src/actions.ts

Git blob `3b9c5cc47c6e043e9e5d6f013a8201c4258abe0b`; source SHA256 `ff0507ebbb63a8a1ab74bc11187cb70bd19d51ed2ec8cb741eaf0155d03f6b07`; 1071 bytes at the common source pin.

Lines 1–18; 1071 exact bytes; span SHA256 `ff0507ebbb63a8a1ab74bc11187cb70bd19d51ed2ec8cb741eaf0155d03f6b07`.

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

Git blob `273b77520f81c755f62979b9609f45917e72e062`; source SHA256 `1d3361dd26b49e366b7c59d14a589f6684a16b36bfec0b761e62481fc15f6f14`; 4175 bytes at the common source pin.

Lines 49–51; 209 exact bytes; span SHA256 `2c4e81d727ea3b5b17f161668fffebaf03f190622395b8554791f89cbfd5504f`.

```ts
export const BindingRef = Schema.Struct({ id: BindingID, revision: PositiveInt })
  .annotate({ identifier: "Actions.BindingRef" })
export interface BindingRef extends Schema.Schema.Type<typeof BindingRef> {}
```

Lines 62–85; 1212 exact bytes; span SHA256 `7b6fc2070a54974604c4f616792acb1fdd21aa1c7387233f508b5530c0821e5a`.

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

Git blob `da7b1bdfb6bd5f7dd8fd368adb5eb5402c37c6fe`; source SHA256 `6ad34b7a3cbc4eb4c1ce500f6f665894c0a7792d4d12177cdd1e055592812f0f`; 3857 bytes at the common source pin.

Lines 17–45; 1324 exact bytes; span SHA256 `4e494651dd662b1bbbb7065d48fe91e7347a575b78510061825fb104f7975ffd`.

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

Lines 77–79; 216 exact bytes; span SHA256 `5b04d7c25711e6e3f4072f389b96a3bb95cd334f5141fc0c4a9adb0c6d3c322b`.

```ts
export const ExecuteInput = Schema.Struct({ id: OperationID, input: Schema.Json })
  .annotate({ identifier: "Actions.ExecuteInput" })
export interface ExecuteInput extends Schema.Schema.Type<typeof ExecuteInput> {}
```

## Q050 — packages/schema/src/actions/resource.ts

Git blob `1346f69568a3796c88a55ed9d06ed4cc762aa93b`; source SHA256 `5579f778bc5055f362058bf0e9386e6098af2f2cba3700ef68de1381aab6f576`; 2429 bytes at the common source pin.

Lines 11–23; 521 exact bytes; span SHA256 `7d31f2ddc5bb933a9a68d61f9b8fa8ebd914fe4e86da2eaf1bb36d88f7864012`.

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

Lines 42–57; 687 exact bytes; span SHA256 `50e7accaa402d5c135575beb5e809823e67a355022f1b04f65fe7481e7ed4b75`.

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

Git blob `763fc67220a5a5962794593062f4705840e7598b`; source SHA256 `46722d7902f6005986f3e2c372675e3f9e047e2dbe639e404146f151e1de3d85`; 5060 bytes at the common source pin.

Lines 55–64; 930 exact bytes; span SHA256 `4033da3f947980261ae515843f1d1a5c91bedd51a524914e505125769d69e539`.

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
```

## Q052 — packages/schema/src/actions/run.ts

Git blob `830d6f13f362e0616160da6219f3eba8a9ab83df`; source SHA256 `c91ac0507e4f4f304cea12b4681aea4f658aec6aa7fca9af478e0f38613267f8`; 3593 bytes at the common source pin.

Lines 5–18; 478 exact bytes; span SHA256 `41ff29a2ae845f749b86238aa9989e61e1e41f5d844555bc62182cab8fc85389`.

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
```

## Q053 — packages/schema/src/actions/workflow.ts

Git blob `a061e32b53f984a7e103e836fdfac97e5f6e98ce`; source SHA256 `435abb6cb694c30d00c01bb0c00c8dd9cd821df163fe8c73cb30a4f09ad18321`; 3925 bytes at the common source pin.

Lines 15–29; 604 exact bytes; span SHA256 `f2e4d2587298f8cfb7e4cdbd5bc3a1570ae641333e30f4bd51e396ec365335c1`.

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

```

## Q054 — packages/schema/src/capability.ts

Git blob `f2d1bf5a52f9995257c296edd4f606e935cac90e`; source SHA256 `c21600d2409460dc49b35ba3177154422c45fd0a21018fd81dcd2f64ea58111b`; 8631 bytes at the common source pin.

Lines 41–48; 392 exact bytes; span SHA256 `8deb3b8f712348079baac928f98c7eeffc3b0ebb17dbd1192524cd1d8eef17a6`.

```ts
// References identify data only; trusted authority bindings belong to Core.
export interface ConnectionRef extends Schema.Schema.Type<typeof ConnectionRef> {}
export const ConnectionRef = Schema.Struct({
  id: ConnectionID,
  provider: Schema.NonEmptyString,
  generation: NonNegativeInt,
}).annotate({ identifier: "Capability.ConnectionRef", parseOptions: { onExcessProperty: "error" } })

```

Lines 105–119; 691 exact bytes; span SHA256 `92dd9530b4951cf340418d5d73b9b3b321f11ed8689a8e952b4cdba32106c241`.

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

Lines 145–155; 469 exact bytes; span SHA256 `ac39a83de71c7b0d488b0b90baebadc2aa8228143ec090a8a7db54bacd3f2a71`.

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

Lines 175–187; 668 exact bytes; span SHA256 `4cbd0a3fa2a1453d21e25c7c0c1c2a22d25d1595a810d082c60125c435fb7e87`.

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
```

## Q055 — packages/schema/src/capability-artifact-management.ts

Git blob `6736a109b67917285ebe44ab80b5f3b2ed16d661`; source SHA256 `e2437a4de28ef022fb509a8d5f4da9b6a16b9311707f6a68823b82aff4812fe4`; 1822 bytes at the common source pin.

Lines 7–18; 575 exact bytes; span SHA256 `f3ef558f191e2317c07cd96a6f92032555e0561f930767a0ee0215bb515ef44d`.

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
```

Lines 23–32; 752 exact bytes; span SHA256 `29662259647d734a9f4f2adb1ead4fb0b52d7a413cee6b6c0b86991d9a2f9b0c`.

```ts
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

Git blob `8050ce6ede2c120d4f1a6193ec2fe4e702db457c`; source SHA256 `41245590c777afab845b7eeda90b03ba3c2d15505c2b225e39dd8ec0ae0123ac`; 3551 bytes at the common source pin.

Lines 7–19; 1111 exact bytes; span SHA256 `be200f113cb3241bca9649344de41fb5684e19f06c779b02bc7a8991552dc76f`.

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
```

Lines 35–45; 991 exact bytes; span SHA256 `ca52b89ebad7b2ba8c616f4fff029ccf670972d6eeb4f5ab9f9fdcf2d4f7e288`.

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

Git blob `4572fecf0427d671d605ea4839640247e898632e`; source SHA256 `5193b6097e0a8827df04a6444c5f32fcf45ca7cb454f729ae5ee6157e54c658c`; 3073 bytes at the common source pin.

Lines 41–54; 1134 exact bytes; span SHA256 `a7b487f8b3b3b3d2489fd89c9069079b155e8bd5e31282e4116a1a358b67179f`.

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

Git blob `2aa7562006a006c3f2a2a024167a15c52af83a28`; source SHA256 `32d8305b65970de0eaf5f99786ba4a3aeec3a2cc6ae731e6ce9be55aad2e3e3b`; 1596 bytes at the common source pin.

Lines 7–22; 1430 exact bytes; span SHA256 `ead3de2525b245875b62f34fd5e48b34c785ba83e5786ff9ad051dc86000582c`.

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

Git blob `264e38436fbf1550dd6228b43caba77e2944ec02`; source SHA256 `daffd3f2967e2dea8c68da404c9bbf9ed9d95ef4e3df0f274b4f7580ae9344fe`; 2901 bytes at the common source pin.

Lines 23–28; 318 exact bytes; span SHA256 `471f657287fbc45af56c6a72f3fed1e51531ead12003209dfb9e9984338cc42e`.

```ts
// A proposed work identity, not a durable Task or execution authorization.
export const Target = Schema.Struct({
  kind: Schema.Literals(["assignment", "work-package"]),
  id: UnitID,
}).annotate({ identifier: "AtlasKnowledge.Target", ...closed })
export interface Target extends Schema.Schema.Type<typeof Target> {}
```

Lines 42–53; 550 exact bytes; span SHA256 `a45cc8f2307083b4df1b547483641413e31126cfab6b2a71e0250e9b66715ecb`.

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
```

## Q060 — packages/schema/src/atlas-review.ts

Git blob `55c49f96b1b4d4ad187cef5d056e96a555c90a33`; source SHA256 `7f0c69058477f6860f34dc88ef183bc273e337f92ae8dc43aa31e8caaeef0ca8`; 3495 bytes at the common source pin.

Lines 3–8; 437 exact bytes; span SHA256 `f6eeefd6d0c07b027ee5b61a518dd30d4b74616779457f823a4a89d61f5cf31d`.

```ts
// The wire shapes of the Atlas review routes (DECISIONS.md D31, D35), transcribing
// modules/atlas/packages/adapter-io/src/surface/types-review.ts. An absent value is `null` on the wire, never omitted.
// The `AtlasEmpty` unions and the write verdict are composed in atlas-screen.ts, which owns `AtlasEmpty`; this file
// imports nothing from it, so the two modules never import each other.

const Tier = Schema.Literals(["T1", "T0"])
```

Lines 57–64; 456 exact bytes; span SHA256 `171f7161f3c056d97985a6d089c25b5990630cc91a692b3284a882984b843d7e`.

```ts
export const AtlasHoldInput = Schema.Struct({ nodeKey: Schema.String })
export const AtlasReleaseInput = Schema.Struct({ nodeKey: Schema.String })
export const AtlasProposeInput = Schema.Struct({ nodeKey: Schema.String, toTier: Tier, reason: Schema.String })
export const AtlasDecideInput = Schema.Struct({
  proposalId: Schema.String,
  verdict: Schema.Literals(["ratified", "rejected"]),
  reason: Schema.String,
  token: Schema.optional(Schema.String),
```

## Q061 — packages/schema/src/atlas-screen.ts

Git blob `e1709c1d7f25b68a8c7e2e0a86388994703112c6`; source SHA256 `98bcb28c924bf204251cbbb0d4f47d0210d10e07f138fd2186dcc9350daa3fea`; 12468 bytes at the common source pin.

Lines 5–9; 397 exact bytes; span SHA256 `76558a9fc118f94183a37b44f901dac423926cb40187a430d7f2958afe465f25`.

```ts
// The Atlas screen's wire shapes, shared by the legacy instance routes and the V2 server. They transcribe
// modules/atlas/packages/adapter-io/src/surface/types.ts and types-memory.ts field for field; a repository with no
// `.atlas/` answers `{ state: "empty" }` on every route.

export const AtlasEmpty = Schema.Struct({ state: Schema.Literal("empty") }).annotate({ identifier: "AtlasEmpty" })
```

Lines 220–227; 314 exact bytes; span SHA256 `15d324bf9c161a2198d1b35f69195327b398687d3dd0c1adeae567090d1a794c`.

```ts
/** The fields every door verdict carries (surface `AtlasVerdict`); each verdict struct adds its own `data`. */
const VerdictFields = {
  state: Schema.Literal("ok"),
  ok: Schema.Boolean,
  rejected: Schema.optional(Schema.String),
  guidance: Schema.Struct({ next: Schema.String, invariant: Schema.String }),
}

```

Lines 307–316; 512 exact bytes; span SHA256 `2d7854d8e8e882fc9dd36f85d8992973fc39d7d5a4aa49cc3c850abe70e0338e`.

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
```

## Q062 — packages/schema/src/atlas-setup.ts

Git blob `73f8ceecf7a353f7b7952c146cf8885dde18c144`; source SHA256 `e16cfab589094bedb8d609d16bb63914de5daf3e74b5d152e137c45bf620c876`; 951 bytes at the common source pin.

Lines 3–28; 918 exact bytes; span SHA256 `6338af24e581de44116793f96f548115d24abb312b1c27d888dc3d6702a49510`.

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

Git blob `a6c4f61ba821da08f9b972df0236dc5cbfc7eb5a`; source SHA256 `2bc0209c7133f1210ee4dc380742b297c280a1a1b18244eb2c0f5f2de0b0df43`; 31577 bytes at the common source pin.

Lines 11–12; 212 exact bytes; span SHA256 `6059bc8b48c41357c1c6f4c64cd1d4fdf695f342febd38c7ec5ddd78cfcda3d6`.

```ts
// The Projects board: Maestro plans projects, epics, issues and steps; the owner answers, comments, attaches,
// undoes, pauses and holds. "Project" elsewhere is the git repo, so board types are always Board.*.
```

Lines 264–274; 444 exact bytes; span SHA256 `83e74aa0bf03f7134d4f086ec2dd2c95fb1abe3346b163ac44517d6ca52c2d8d`.

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

Lines 541–544; 211 exact bytes; span SHA256 `d5b83df799ef9e6327c2ecf5569a22eaa3e32c938072e0874877ba837f0eecc4`.

```ts
const Text = Schema.Trim.check(Schema.isNonEmpty())
const Reason = Schema.Trim.check(Schema.isNonEmpty()).annotate({
  description: "Why, in one sentence. Required on every write and kept in the board log.",
})
```

Lines 687–706; 912 exact bytes; span SHA256 `48439537c412953118aa329d2db4e0b4acbe0026c23ea935c1ad67affd60d1e0`.

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
```

## Q064 — packages/schema/src/board-queue.ts

Git blob `69f607bb08fda8f0bd4530ce31655009d477abc1`; source SHA256 `393a085abeddbbcdba2cbdfff023a114f525d402cc531a3b75e94036893693d6`; 5391 bytes at the common source pin.

Lines 70–91; 1034 exact bytes; span SHA256 `a4e18c215854b075d21d588e0902dab41025a0c5409cc5f4524cb6b8dad6be09`.

```ts
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

Lines 103–109; 290 exact bytes; span SHA256 `8074aa52371a2c3cf4764d3ac6c15f835d748d50d9b4d98b91007945e1e4bb58`.

```ts
export const QueueResult = Schema.Struct({
  /** The PR head the card queued at; the bundle merges exactly this commit. */
  head: Schema.String,
  tree: Schema.String,
  state: ScopedState,
}).annotate({ identifier: "Board.QueueResult" })
export type QueueResult = typeof QueueResult.Type
```

## Q065 — packages/schema/src/hook-glob.ts

Git blob `32d8d1cf8979807b673fb0ff053d96f59bed766a`; source SHA256 `e9fff629f93c2570126b5484be65c0a966a22f010d0424352d4da4ff3c3cc33e`; 13356 bytes at the common source pin.

Lines 3–7; 572 exact bytes; span SHA256 `80cb494ad6478ac4b5ddb13dadd4a5ad172d53baf0a81731de0d977e79a2d48d`.

```ts
// Path patterns for hook conditions, matched the way Bun's glob `match` does it (src/glob/matcher.zig at Bun 1.3.14),
// so the engine keeps those semantics under Node, where the desktop server runs. This is a line-for-line port: the
// pattern and the path are compared as UTF-8 bytes, character classes compare code points, and a lone surrogate is
// U+FFFD, as Bun's string conversion makes it. packages/relay/test/hook.test.ts checks it against Bun's own matcher.
// It lives in schema so the hook engine (@orchestra/relay) and the app's hook Test share one matcher.
```

Lines 27–42; 895 exact bytes; span SHA256 `9e3b17c2fd67ede885f12f4c85b3baa2b34c9759dab208987500ae28b2e6dbb3`.

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

Lines 63–64; 61 exact bytes; span SHA256 `df639253933c9052f09099ad5b31c4a9564120dd4d35e361bc117feb1b60d281`.

```ts
const encoder = new TextEncoder()
const MAX_BRACE_DEPTH = 10
```

Lines 314–317; 229 exact bytes; span SHA256 `0022b47187f193090f3d8934abd0a05b2f7ac31c38ffe59e1e1db49d091d4b2f`.

```ts
// A browser has no `process`; there, as on POSIX, `/` is the only separator.
function separator(byte: number) {
  return byte === SLASH || (typeof process !== "undefined" && process.platform === "win32" && byte === BACKSLASH)
}
```

## Q066 — packages/schema/src/hook-match.ts

Git blob `0f64acf307d37cc37e949de4a3ed215491f5ecb5`; source SHA256 `a2352eb5488b1267dd22481416ad50cc714417a31892b64464a4d1611d012cf2`; 2866 bytes at the common source pin.

Lines 5–23; 919 exact bytes; span SHA256 `057a008539b9b97ef6d924118d572e213b6530b0c8e585548b48eb16f9a3b20a`.

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
```

## Q067 — packages/schema/src/config-maestro.ts

Git blob `31a8d9041e63515a9a28615d3e8cbe23a238d8e5`; source SHA256 `abf7bd561adfa3e070e396ad360dc11b5ea779b9d23f16e92b8e4ddacfc65caf`; 455 bytes at the common source pin.

Lines 6–15; 335 exact bytes; span SHA256 `9ddd7e2a935cdc3de0a6846b6ff6590b341e7d74362860cd5f096aac4cdf7a40`.

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

Git blob `1647502c6edd14b8afa0569d553dfea73398ea59`; source SHA256 `96129481a9ccc3a338aa9c212c581d0e1cdcee24436c81e19c2dd57d07a1b418`; 2189 bytes at the common source pin.

Lines 10–30; 771 exact bytes; span SHA256 `a8ba47bdcfeed7e09770ada00b702bc5d3e631f37fead371184e5215ee74ec56`.

```ts
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

## Q069 — packages/schema/src/maestro-event.ts

Git blob `e4792cc8bbbdf6d11b8caf503fbd09b0b2688fb2`; source SHA256 `d1d4ff601b422f55e6579f06b79805af24bdccda295fdcaa70b038afef0cdb8c`; 28276 bytes at the common source pin.

Lines 237–278; 1588 exact bytes; span SHA256 `66cc339720c960ee5bc57518b40157d2f6e01c736887a4fa08e28f523f3a9624`.

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

Lines 710–734; 1153 exact bytes; span SHA256 `6048469aed4b272474fc28b497423670535046126f7ed78f03d81b4b76256efe`.

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

Lines 766–768; 251 exact bytes; span SHA256 `4bb6d9e4fabe63cd4a87baebbd84d5489c7fb11a989686ca4f75ffb09a94a1a9`.

```ts
/** Maestro events stored and replayed by the host but never part of the public event surface. */
export const DurableOnlyDefinitions = Event.inventory(Task.WorkflowReviewHeld, Task.WorkflowRebound,
  Task.WorkflowReviewFindings, Task.ResumeAdmitted)
```

## Q070 — packages/schema/src/upstream-attribution.ts

Git blob `73fa1773f7f9578eb6099fe10fde3d69d95a2d00`; source SHA256 `47871f9b7e274c96129b216c7cf4ff92b5b4b24f56e1e866bc0c6bc687f3b3d4`; 3522 bytes at the common source pin.

Lines 28–38; 531 exact bytes; span SHA256 `44d9f53213e462b751a5461bb4258feff5576015efbd794668fecde111f6701a`.

```ts
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

Lines 62–82; 938 exact bytes; span SHA256 `3c17b64c52e986d0361337368efaf57fa741874fd01e38d348f9d231c763460f`.

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

Git blob `7244e6ac95cc935a1fb11817c6fe8647823db7e3`; source SHA256 `6216a267111c79ea0fe4737a4cf8883fb534686e4879a93ed82bbed213b0a791`; 9350 bytes at the common source pin.

Lines 8–28; 952 exact bytes; span SHA256 `f2d6cfedd53f876357a7e7494a8a566a38e5cad86bf27801570f0666d02cf041`.

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

Lines 40–48; 523 exact bytes; span SHA256 `f629c1463842e7389e2a65a55a7ad125f9b04514648dba54eaf558d752352dea`.

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

Lines 100–103; 271 exact bytes; span SHA256 `08285bdc92c101f70aa9e909a40a41c0bd227854bda86da6da56aa33b5d17b6a`.

```ts
// Consolidation runs after stop: poll the meeting until the card is not pending. Suggestions are never written to
// Atlas; the owner or Maestro decides what to do with them.
export const Card = Schema.Struct({
  status: Schema.Literals(["pending", "ready", "failed"]),
```

Lines 130–143; 527 exact bytes; span SHA256 `1b67d8ece13ea5c71973e08bc934f5c6012d3f27a4d690f286fe720894774a86`.

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

## Q072 — packages/schema/src/scheduled-task.ts

Git blob `431d1b8c178802a6724945309fde78d2144b88b6`; source SHA256 `78b2151252415cd1f1e4e9c98f85b6143fd33c46b4cb50464e936ec43f887a6e`; 4193 bytes at the common source pin.

Lines 8–18; 525 exact bytes; span SHA256 `c174cf9f231e805a971da2b933d0a979553d38b23b91ef93c8fee29c69141df5`.

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

Lines 24–42; 848 exact bytes; span SHA256 `b8a517aed81806d438f61e5288c485b71d5104d9d5733e42395ee3b93789b17f`.

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

Lines 97–101; 248 exact bytes; span SHA256 `fa606f99aeb93fce21b7cae6456d1a2a38f1d74f2c5b2d16b09f4a672b9bd2d2`.

```ts
export interface RunResult extends Schema.Schema.Type<typeof RunResult> {}
export const RunResult = Schema.Struct({
  /** Session the run's prompt was admitted into. */
  sessionID: SessionID,
}).annotate({ identifier: "ScheduledTask.RunResult" })
```

## Q073 — packages/schema/src/lean-coverage.ts

Git blob `19016bbda0d6f8838eadea8d76dc5fc7f3fcd545`; source SHA256 `6d9bb1a24099f847fe15184e8fdb1d071158a911947dd0d493a4e834d807c310`; 5011 bytes at the common source pin.

Lines 5–14; 1104 exact bytes; span SHA256 `85d92582eefe2dbd869fe2ab543f47a852f25ce5fed9df601f9d38f35e9c16c9`.

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

Lines 48–55; 482 exact bytes; span SHA256 `ab026b8272aedf47928d71daf11b1c28d343b263eecfbf9a038af21dfba81f85`.

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

Git blob `7c679f6d69fb586a71b232214e3b5178fda90c54`; source SHA256 `8bb3f0b04d3c0c74fe94774e6c62a2f56c302843d37a7404be5de7a947717f45`; 2592 bytes at the common source pin.

Lines 14–20; 316 exact bytes; span SHA256 `075b27d037b960220407ca8c0a9ceeb6693c1957793939a398c1a249ec9f4830`.

```ts
/** Exact safe integers or unavailable; tokens are always explicitly local estimates. */
export const Savings = Schema.Struct({
  bytesSaved: Schema.NullOr(Schema.Int),
  tokensSaved: Schema.NullOr(Schema.Int),
  calls: NonNegativeInt,
  tokenCalls: NonNegativeInt,
}).annotate({ identifier: "LeanProfileSavings" })
```

Lines 30–38; 286 exact bytes; span SHA256 `beb8087e6ae668e969fe1f015ee619cec52333e91bf07696806b09fa8542ff49`.

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

Lines 71–76; 354 exact bytes; span SHA256 `25d5107339ef9d2c179da84355600f134d871525390c7c85268b71d5993b1bcd`.

```ts
/** UI transport seam; production adapters implement real HTTP, never browser-owned preferences. */
export interface Transport {
  readonly read: (signal?: AbortSignal) => Promise<Info>
  readonly update: (value: Update, signal?: AbortSignal) => Promise<Info>
  readonly history: (itemID: LeanCoverage.ItemID, signal?: AbortSignal) => Promise<History>
}
```

## Q075 — packages/schema/src/lean-engine.ts

Git blob `e18ba44de9dcc2dbeb674f7fb90c2897f731bb43`; source SHA256 `9aa2cb9bcb69da5d6e6ea6a3e16a4c3d19d776e5c89a14f177baa202a044c5da`; 584 bytes at the common source pin.

Lines 1–9; 584 exact bytes; span SHA256 `9aa2cb9bcb69da5d6e6ea6a3e16a4c3d19d776e5c89a14f177baa202a044c5da`.

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

Git blob `ece2b32793cf3de837103ef42e34814b64287837`; source SHA256 `4e8243211ee2df7b02689db54c57c61134d43f347a9154c7d31fb06e0744568b`; 6213 bytes at the common source pin.

Lines 28–56; 2466 exact bytes; span SHA256 `0a0c070d146c86a105aabc8bd60c89972b2599a893f5fe71d8074429a1dbe40f`.

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

Lines 67–80; 632 exact bytes; span SHA256 `95f5e037ef01b37dceceae876b818595d03a23115d4d8122704580e3154a34fd`.

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
```

Lines 87–92; 543 exact bytes; span SHA256 `1b3e74a8bca1ca023ad1098e47ec38fd404f2a74f158229564d8fa4d40b795d0`.

```ts
function counts(value: unknown): Decision["bytes"] | undefined {
  const part = record(value, ["before", "after", "saved"])
  if (!part || typeof part.before !== "number" || typeof part.after !== "number" || typeof part.saved !== "number"
    || !Number.isSafeInteger(part.before) || part.before < 0 || !Number.isSafeInteger(part.after) || part.after < 0
    || !Number.isSafeInteger(part.saved) || part.saved !== part.before - part.after) return undefined
  return Object.freeze({ before: part.before, after: part.after, saved: part.saved })
```

## Q077 — packages/schema/src/rag-studio.ts

Git blob `b553ee9dc72cbb7d87ff01eba7cb7608a5ab89df`; source SHA256 `948d52ca2c846da8059bb297a8e564aa82e5cec5dc1edf97906eb010f71b9918`; 6596 bytes at the common source pin.

Lines 5–18; 556 exact bytes; span SHA256 `faf053113abe8ab39b0634bfda65f8474e8dc225877df61495949e626b99c46c`.

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

Lines 47–55; 328 exact bytes; span SHA256 `a5a5a621b904e73a6121f5488ac59d5eec39ef8a764b0916d4e7788e39ac9e48`.

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

Lines 80–96; 699 exact bytes; span SHA256 `5eff1caf09403aae534968b35460aa0b88a74c85c38eb02851d96c48c5ad2157`.

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

Git blob `f865f7cd4cd76eb7e89f562c155d8593b69af369`; source SHA256 `f00d57a9f6d3bb1888518816fa277be35884469d9a16050f90d5edad8f768236`; 20129 bytes at the common source pin.

Lines 17–22; 404 exact bytes; span SHA256 `332256142d6e46765f6eed03f90b0a7bf362fb8e560f219dfc04622052c23912`.

```ts
function struct<const Fields extends Schema.Struct.Fields>(name: string, fields: Fields) {
  return Schema.Struct(fields).annotate({ identifier: name, parseOptions: { onExcessProperty: "error" } })
}

const text = (limit: number) => Schema.NonEmptyString.check(Schema.isMaxLength(limit))
const list = <S extends Schema.Top>(schema: S, limit = 32) => Schema.Array(schema).check(Schema.isMaxLength(limit))
```

Lines 52–60; 257 exact bytes; span SHA256 `f46699d9880cacf3ab5a9b9e93593eed496371d05c8bd2d25859711eb8a351bd`.

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

Lines 87–94; 342 exact bytes; span SHA256 `5ac08de7e4cd1b04f7a75490cd070efc746014d057373e95ffee91cb2fe492bb`.

```ts
export const SourceRef = struct("Research.SourceRef", {
  artifact: Capability.ArtifactRef,
  representation: Representation,
  digest: Digest,
})
export type SourceRef = typeof SourceRef.Type
export const EvidenceRef = struct("Research.EvidenceRef", { source: SourceRef, locator: Locator })
export type EvidenceRef = typeof EvidenceRef.Type
```

Lines 100–119; 723 exact bytes; span SHA256 `f57cb16a9875cefd25507f82ad14745578f9c17863d940edddd7638b33583bc9`.

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
```

Lines 297–307; 600 exact bytes; span SHA256 `a7136ae1ffd9fb451cd6a18a1554cfb51d08462c4cf3be221d23ebdcacd37ab3`.

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

## Q079 — packages/schema/src/research-event.ts

Git blob `b56f5ea8ffae64cf95de91e8a9b48e932edfe241`; source SHA256 `1e50a53af6b60e2c7839aecda7984fe29ad7c416940b8bc104b98d60d6af3b03`; 2844 bytes at the common source pin.

Lines 9–39; 1086 exact bytes; span SHA256 `61d2ed59c6b8696fed396af258cc081a41affee2811805b75a55c19d570dba01`.

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

## Q080 — packages/schema/src/relay-arm.ts

Git blob `9f08a74f49e3d1de47e5679a11c61482818360d6`; source SHA256 `60622efd23c1ac59af2e93d6087369118876b74c3efa1ce693f03f7669b0421b`; 14265 bytes at the common source pin.

Lines 23–60; 1973 exact bytes; span SHA256 `d54351d6a1583a249c394724336730a98aa0ee934c8c2808f0378d91db0fcb5a`.

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

## Q081 — packages/schema/src/relay-authoring.ts

Git blob `5582a1f0bd68eed7c2b7cbc9b89fdb61f66cd3f0`; source SHA256 `dfd159dc2c26332084691ca95d6cd085d494209c3fa5cfc1032e30cd250c2458`; 8044 bytes at the common source pin.

Lines 7–10; 379 exact bytes; span SHA256 `5e59ab8e65d182697df135abbdcaaeb6e736653bf17d14b8fb4a111eaaba3e59`.

```ts
// Authoring documents in the relay_authoring shape (graph.py, store.py). A saved document may be an incomplete draft:
// node parameters stay open here and are checked by compile, which records diagnostics instead of refusing a save.
// Stored documents are Relay data, so unknown keys are preserved.
const preserve = { parseOptions: { onExcessProperty: "preserve" } } as const
```

Lines 100–125; 1104 exact bytes; span SHA256 `d7d75ae8fb1046ec714cb378141c9de4bf20eb87012a6799162ced18ace75649`.

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

## Q082 — packages/schema/src/relay-external.ts

Git blob `789689060f9a2e572a6c0c4d039a2125dcf94b12`; source SHA256 `2196fe995cbc77faa580352b798c3d5d33286af9b9b83af9b3b790705dc89b58`; 7028 bytes at the common source pin.

Lines 6–9; 425 exact bytes; span SHA256 `4690fc9ba2efe73ebe6a9490aabf95768d724b64a781de4f613fb7fe38a2f611`.

```ts
// External runs: a LangGraph process gated by the Python library writes `<project>/.relay/runs/<runID>/`. The ledger
// is the only source of truth; `run.json` is a convenience snapshot that no reader trusts. Bodies are written in the
// order their structs list, optional fields only when set, then the chain suffix `gen` (always 0), `prev`, `seq`,
// `mac` (always `sha256`) and `h`, exactly as `LedgerChain.append` does.
```

Lines 101–125; 1194 exact bytes; span SHA256 `9466f1077db5edd01ac1b7de32ed551a209d86b1b409d5ee9c560e87a4d0642b`.

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

## Q083 — packages/schema/src/relay-hook.ts

Git blob `bbb8d99e0cd45965a82be8bc7ab228feb949e9d2`; source SHA256 `cab62a5613add88d07db99b340c5112c1942594d081687fd2b851dd890022388`; 8249 bytes at the common source pin.

Lines 125–157; 1413 exact bytes; span SHA256 `1faa90cf414fb30e6b4bd15b75108f179d196b48308f4bf9450f512dd2733838`.

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

## Q084 — packages/schema/src/relay-ledger.ts

Git blob `7f4d6dc91d39f3df30ff9f4ee097ec77d4e758f5`; source SHA256 `e3aa70aef1e489b4957f2aa48b3da06fc5ce9edd0ae01f444ce16a19638d2291`; 14458 bytes at the common source pin.

Lines 7–25; 1079 exact bytes; span SHA256 `c027166db95120098d9b5a358fb77030b96f602d0d3770b15091173185b62fa4`.

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

## Q085 — packages/schema/src/relay-run.ts

Git blob `37c6b62baef5ccff525369651cb2098733f0183d`; source SHA256 `b3d1ba52e5615e08d8472f9958b44b22f6c322310cc6bbb739a71e41d1aef3b0`; 3879 bytes at the common source pin.

Lines 14–20; 427 exact bytes; span SHA256 `8efb377153e96318ec77e24b4af31180d32f39ae411ade2ee9e656304ed16baf`.

```ts
// Durable workflow-run events, aggregated by run. The supervisor writes them; the arm ledger stays Relay's.
const durable = { version: 1, aggregate: "runID" } as const

/**
 * A run was admitted against a published document version. `token` is the arm (`run-<runID>`); `params` are the
 * values exposed to checks as environment variables (`base_ref`, `repo_root`, `wp_dir`, …); `actor` is the principal
 * that started it.
```

Lines 91–109; 1019 exact bytes; span SHA256 `bdc1b8413f622443f8f266cf0032470ad4e7256b9c69c89c3ba55ba5e3fa8fec`.

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

Git blob `ef5f26e66e7e45db4b018a98bd33107fe34cfeca`; source SHA256 `27a4d8fd186535ba617e23d3f41430de0ae90b48b54a79b843fc1a7546b599f6`; 5527 bytes at the common source pin.

Lines 7–14; 527 exact bytes; span SHA256 `c6b0b7667b2198d0e37697bbce617a8d9eb228c1e50d18e001d2a589a39f0fc4`.

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

Lines 27–50; 1426 exact bytes; span SHA256 `9db00d4ebe730ecdd5188c9e8949390e6f668bf57fcd5f7ad7ba2cc96519c5d3`.

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

## Q087 — packages/schema/src/guardrail.ts

Git blob `1f9e89fb3ec9259b12d268e17103bd19a2658bee`; source SHA256 `ccb59e972d3536ebcc8f498604f5b97f66b50402ef23e493c1087b57766e0455`; 3766 bytes at the common source pin.

Lines 5–7; 304 exact bytes; span SHA256 `76f7bf9b85f4039d970c9e93a1255c708fed618b61576469d6dce8bb4e69c40e`.

```ts
// Guardrail: declarative CI guard rules (script/guards) judged against a change. These shapes mirror the
// engine's `--rules` and `--json` output, which is the contract the app screen is built on.
export const Severity = Schema.Literals(["gate", "warn"]).annotate({ identifier: "Guardrail.Severity" })
```

Lines 77–100; 1082 exact bytes; span SHA256 `5b362199f243e04fb2f8cd7d4968867b47ca425117c27442feb29a081fc5c6c8`.

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

Git blob `18147b545a3acecee29244bfa5c7ca26e4c9c323`; source SHA256 `8a9e55857aaabcc07c109dbf34fdfa9cfa80004ba7a8af0feee1eb5fe1578e5e`; 5321 bytes at the common source pin.

Lines 3–15; 816 exact bytes; span SHA256 `e9e3ac03407f23ff42a6658e5b9aa7a7ef86a228078422eb4ac0ad8ebddc8d08`.

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

Lines 72–89; 1041 exact bytes; span SHA256 `f7080eeb70a12cc419199b57876ce0d42908498e193fe58490583effaa58dcda`.

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

Git blob `cfd60052ec047b947dd7c9cb9bc534cc02b9d1c5`; source SHA256 `75954b80578c1daf1edd4736ae6447b08d928dc8a076ac85ac09997202b068dc`; 1554 bytes at the common source pin.

Lines 1–19; 714 exact bytes; span SHA256 `a001be23cc71416a4f6e62631682368688eb4a6b06655a6bc3a84de256d3f834`.

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
```

## Q090 — packages/schema/src/plugin.ts

Git blob `c23f79582e37f4d2924d5b6cf869fa0ad0f5f629`; source SHA256 `ad81fb523930347085140255dcc3e4ca9fab954e97e25118677909bfec7b5739`; 344 bytes at the common source pin.

Lines 6–13; 231 exact bytes; span SHA256 `b238909b6e6c1c8d927741f4ecf715f9233b30e6ae98f2f1445e052c2517c27a`.

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

Git blob `138d0cf5f699b775af573b32d99e924af4a54a4f`; source SHA256 `65c69eab6d48f601b4a97d07d89ef3ce19c096d745719b34c0abc23d6f75b047`; 215 bytes at the common source pin.

Lines 3–7; 168 exact bytes; span SHA256 `24173b3b7080cbd6c59f0d3c088819eb50c8f4e2595abd1dc826bcf3572ab323`.

```ts
import { Event } from "./event"

export const Connected = Event.define({ type: "server.connected", schema: {} })

export const Definitions = Event.inventory(Connected)
```

## Q092 — packages/schema/src/ide-event.ts

Git blob `ca4218602143882beaff4dc3f2990497a6f025e9`; source SHA256 `d3d3562379982a87a1a68c8a847901318607139d6a7dca81c1512212502653c8`; 270 bytes at the common source pin.

Lines 6–13; 164 exact bytes; span SHA256 `4b00dfcab55cf3a534eeda828bc32e14cc5fe18cb45fc77bf12b63ce4dbfbb49`.

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

Git blob `28952dcfa3197d670e072f542ab758c45cc4be70`; source SHA256 `69c3aaa24eb98f069364fe34250b1a37e38d075345a848ec4945c4827e90e74f`; 1625 bytes at the common source pin.

Lines 9–16; 259 exact bytes; span SHA256 `a4ccdc645c79eedac907e4e5815754b2b93ae3fa5f64db1a8ae94884eefbae51`.

```ts
const DEFAULT_TOAST_DURATION = 5000

export const PromptAppend = Event.define({ type: "tui.prompt.append", schema: { text: Schema.String } })

export const CommandExecute = Event.define({
  type: "tui.command.execute",
  schema: {
    command: Schema.Union([
```

Lines 30–49; 506 exact bytes; span SHA256 `09042c17a1e6f51f9341ab2b5a7ae9d07819977e78db9011ddcca874d879b895`.

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

## Q094 — packages/schema/src/installation-event.ts

Git blob `69ecf670846871ca50cbefe66de442fe0faea754`; source SHA256 `f9b2331c830a0aa2aabeb753174e69898db02dd405996114e9c25654b7b748ec`; 448 bytes at the common source pin.

Lines 6–20; 324 exact bytes; span SHA256 `2c655181c31bf76ab73e55600621775058d1b8ba9c2420c3621df70d429f6e0f`.

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

Git blob `3250ee802f6aeb08799db7b124140ca1aa274292`; source SHA256 `230c88017a69b9dee4e9cdbdcde6f2d5cfc9b62bebc4a5a3d347762a74688b1c`; 164 bytes at the common source pin.

Lines 1–2; 164 exact bytes; span SHA256 `230c88017a69b9dee4e9cdbdcde6f2d5cfc9b62bebc4a5a3d347762a74688b1c`.

```ts
export { Failure, RegistrationError, make } from "@orchestra/core/tool/tool"
export type { AnyTool, Content, Context, Definition } from "@orchestra/core/tool/tool"
```
