# Compact exact review evidence

All source below is from commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This is an economic projection of the preserved full `review-evidence.md`, SHA-256 `e83ac99c3f78c23dfb5f6c1c597796e6fa8857b4b9f73f3003e613094a4729c9`. Ranges are inclusive. Code-fence contents are copied unchanged; gaps between ranges are explicit. No source was rewritten and no test was executed. The full source manifest and full evidence archive remain available for follow-up.

## Artifact → exact source map

- `s1.api.boundaries`: C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12.
- `s1.api.client-projection`: C06, C10, C17, C34, C35, C36, C37, C38, C39, C42, C43.
- `s1.api.codegen`: C01, C06, C08, C40, C41, C42, C43, C44.
- `s1.api.schema-contracts`: C02, C13, C14, C15, C16, C17, C18, C19, C20.
- `s1.api.sdk-composition`: C07, C12, C45, C46, C47.
- `s1.api.server-edge`: C05, C09, C24, C25, C26, C27, C28, C29, C30, C31, C32, C47.
- `s1.api.session-contract`: C16, C21, C22, C23, C24.
- `s1.api.stream-contract`: C18, C19, C20, C33, C34.
- `s1.api.surface-disposition`: P1.

## P1 — population and fidelity observations

The source manifest has 291 captures: 289 of 472 assigned files plus root AGENTS and Core host. All 252 assigned handwritten production src/*.ts modules are preserved; the literal surface index has 253 modules including Core host. Read register: 97 full source reads, 2 representative generated reads, 190 literal surface-indexed sources, 2 captured without semantic reading. The other 183 assigned paths remain inventory-only. The local checks validate source bytes, inventory identity, coverage bijection, excerpt/body hashes and transport shape; they do not validate the product or grant semantic acceptance.

Required generated input `packages/client/src/generated/types.ts`: 462732 bytes, Git blob `fca4633666a639d550065312a13e48c6ce221d12`, SHA-256 `2763d389d2694a6737719865cbabbbdfee937d81a86497b783c246cdaf76ef0f`. The protocol's current 256,000-byte observer limit remains an unresolved binding boundary. This is captured-but-unread source, not an accepted semantic type inventory. The two output manifests in the full archive establish 40 Promise output names and 14 Effect output names; generated members are not all semantically read.

The three source discrepancies are kept visible: README raw-file omission versus generated binary fs.read; handwritten upload path versus the inspected two-operation Actions transfer group/handler; V2 identifiers versus unversioned guide intent. No regeneration, bundler, HTTP request, model turn, judge acceptance or runtime binding is asserted.

## C01 — `AGENTS.md`

Git blob `ef3b523b0c00aed722582b870c1919188edc4c4f`.

Lines 1–2:

```
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
```

## C02 — `packages/schema/AGENTS.md`

Git blob `88ff8b244e3fca3c8b23950514b7eff3cf37e85b`.

Lines 3–3:

```
`@orchestra/schema` owns browser-safe wire and storage contracts shared by protocol, server, core, and generated SDKs. Keep runtime behavior, service layers, side effects, and host-local implementation details in the domain package that owns them.
```

Lines 14–14:

```
- Contracts are unversioned: use names like `Session`, `Permission`, `Question`, and identifiers like `Permission.Request`.
```

Lines 28–28:

```
- Core may compose Schema contracts with runtime behavior into a deliberate domain facade, but the facade must re-export the exact canonical Schema value. Do not create a second schema identity.
```

Lines 41–41:

```
- Use the package `optional(...)` helper for optional object properties, including nested structs and event payloads, so encoded objects omit `undefined` keys.
```

## C03 — `packages/schema/package.json`

Git blob `ecf66e31d4fe2d72b2e503a978cedaf09db0080f`.

Lines 122–124:

```
  "dependencies": {
    "effect": "catalog:"
  },
```

## C04 — `packages/protocol/package.json`

Git blob `517e462e6c645c726c26b9027d03ee55d6bc2dfc`.

Lines 69–72:

```
  "dependencies": {
    "@orchestra/schema": "workspace:*",
    "effect": "catalog:"
  },
```

## C05 — `packages/server/package.json`

Git blob `1e2d83907eaac06d0da1571ac7ceab9f528102b7`.

Lines 36–45:

```
  "dependencies": {
    "@orchestra/core": "workspace:*",
    "@orchestra/llm": "workspace:*",
    "@orchestra/protocol": "workspace:*",
    "@orchestra/rag-studio": "workspace:*",
    "@orchestra/relay": "workspace:*",
    "@orchestra/schema": "workspace:*",
    "drizzle-orm": "catalog:",
    "effect": "catalog:"
  },
```

## C06 — `packages/client/package.json`

Git blob `4cd0244e98ff18b5e65d3c2808196705095b6691`.

Lines 7–10:

```
  "exports": {
    ".": "./src/index.ts",
    "./effect": "./src/effect.ts",
    "./contract": "./src/contract.ts"
```

Lines 13–14:

```
    "generate": "bun run script/build.ts",
    "check:generated": "bun run generate && git diff --exit-code -- src/generated src/generated-effect",
```

Lines 18–29:

```
  "dependencies": {
    "@orchestra/schema": "workspace:*",
    "@orchestra/protocol": "workspace:*"
  },
  "peerDependencies": {
    "effect": "4.0.0-beta.83"
  },
  "peerDependenciesMeta": {
    "effect": {
      "optional": true
    }
  },
```

## C07 — `packages/sdk-next/package.json`

Git blob `7b96125b9aa768181cc99c19028659e6d9e72da3`.

Lines 7–9:

```
  "exports": {
    ".": "./src/index.ts"
  },
```

Lines 14–21:

```
  "dependencies": {
    "@orchestra/client": "workspace:*",
    "@orchestra/core": "workspace:*",
    "@orchestra/protocol": "workspace:*",
    "@orchestra/schema": "workspace:*",
    "@orchestra/server": "workspace:*",
    "effect": "catalog:"
  },
```

## C08 — `tooling/httpapi-codegen/package.json`

Git blob `72c383d240c98fbc21e463cb60b3b3533fbd7553`.

Lines 13–16:

```
  "dependencies": {
    "effect": "catalog:",
    "prettier": "3.6.2"
  },
```

## C09 — `packages/protocol/src/api.ts`

Git blob `40b5b5bd266b8a9bd3893f74d5429bf535dc01d7`.

Lines 59–59:

```
// Protocol owns middleware placement, while Server injects concrete keys so Core service identities stay downstream.
```

Lines 73–79:

```
    .add(LocationGroup.middleware(locationMiddleware))
    .add(AgentGroup.middleware(locationMiddleware))
    .add(makeSessionGroup(sessionLocationMiddleware))
    .add(makeResearchArtifactGroup(sessionLocationMiddleware))
    .add(MessageGroup.middleware(sessionLocationMiddleware))
    .add(ModelGroup.middleware(locationMiddleware))
    .add(ProviderGroup.middleware(locationMiddleware))
```

Lines 121–126:

```
    // Last-applied middleware runs first: authenticate before caller-selected Location construction.
    .add(makeCapabilityOperatorGroup(locationMiddleware))
    .add(makeCapabilityConnectionsGroup(locationMiddleware))
    .add(makeCapabilityArtifactsGroup(locationMiddleware))
    .add(makeCapabilitySchedulesGroup(locationMiddleware))
    .add(CapabilityContentGroup)
```

Lines 134–135:

```
    .middleware(Authorization)
    .middleware(SchemaErrorMiddleware)
```

## C10 — `packages/client/src/contract.ts`

Git blob `1dccaeb657cc106b7a8cba93f5f5c34a8faf8680`.

Lines 1–5:

```
import { makeDefaultApi } from "@orchestra/protocol/api"
import { InvalidRequestError, SessionNotFoundError } from "@orchestra/protocol/errors"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

class LocationMiddleware extends HttpApiMiddleware.Service<LocationMiddleware>()(
```

Lines 10–19:

```
class SessionLocationMiddleware extends HttpApiMiddleware.Service<SessionLocationMiddleware>()(
  "@orchestra/client/SessionLocationMiddleware",
  { error: [InvalidRequestError, SessionNotFoundError] },
) {}

export const ClientApi = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})

```

Lines 119–126:

```
export const omitEndpoints = new Set([
  "pty.connect",
  "pty.connectToken",
  "actions.transfer.read",
  "actions.transfer.upload",
  "capability.artifact.content",
  "capability.content.read",
])
```

## C11 — `packages/server/src/api.ts`

Git blob `e1ab621208cf063ff1ce846ded0205e9b8dae93e`.

Lines 1–8:

```
import { makeDefaultApi } from "@orchestra/protocol/api"
import { LocationMiddleware } from "./location"
import { SessionLocationMiddleware } from "./middleware/session-location"

export const Api = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})
```

## C12 — `packages/core/src/host.ts`

Git blob `a0fc5bc9a36e50315b0ddddf4de3566555711250`.

Lines 40–56:

```
const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]

/** Flatten contributions in order; synchronous because it only validates data. */
export function merge(contributions: ReadonlyArray<Contribution>) {
  const duplicate = repeated(contributions.map((item) => item.id))
  if (duplicate) throw new Error(`Host contribution id is not unique: ${duplicate}`)
  const replacements = contributions.flatMap((item) => item.replacements ?? [])
  const nodes = contributions.flatMap((item) => item.nodes ?? [])
  const locationNodes = contributions.flatMap((item) => item.locationNodes ?? [])
  const claimed = [...replacements.map(([source]) => source), ...nodes].find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
  const node = repeated(nodes.map((item) => item.name))
  if (node) throw new Error(`Host contribution node is not unique: ${node}`)
  // A contributed Location node may not shadow a built-in one either; changing a built-in is a replacement.
  const builtIn = new Set(locationServices.dependencies.map((item) => item.name))
  const location = repeated(locationNodes.map((item) => item.name)) ?? locationNodes.find((item) => builtIn.has(item.name))?.name
  if (location) throw new Error(`Host contribution Location node is not unique: ${location}`)
```

## C13 — `packages/schema/src/schema.ts`

Git blob `d19a39b9708cfcaeedc1d7c62503afbadfee5dd7`.

Lines 6–16:

```
export const RelativePath = Schema.String.pipe(Schema.brand("RelativePath"))
export type RelativePath = typeof RelativePath.Type

export const AbsolutePath = Schema.String.pipe(Schema.brand("AbsolutePath"))
export type AbsolutePath = typeof AbsolutePath.Type

export const optional = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== undefined)),
```

Lines 25–30:

```
export const DateTimeUtcFromMillis = Schema.Finite.pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transform((value) => DateTime.makeUnsafe(value)),
    encode: SchemaGetter.transform((value) => DateTime.toEpochMillis(value)),
  }),
)
```

## C14 — `packages/schema/src/session-id.ts`

Git blob `3603ebe703b7b350018626a74e794f94e33079a3`.

Lines 5–12:

```
export const SessionID = Schema.String.check(Schema.isStartsWith("ses")).pipe(
  Schema.brand("SessionID"),
  statics((schema) => {
    const create = () => schema.make("ses_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
```

## C15 — `packages/schema/src/session.ts`

Git blob `8319d3369ebf6ac5952dd390b3ff8844e995b280`.

Lines 20–35:

```
export const Info = Schema.Struct({
  id: ID,
  parentID: ID.pipe(optional),
  projectID: Project.ID,
  agent: Agent.ID.pipe(optional),
  model: Model.Ref.pipe(optional),
  subagentModels: SessionSubagentModels.Policy.pipe(optional),
  cost: Schema.Finite,
  tokens: Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    reasoning: Schema.Finite,
    cache: Schema.Struct({
      read: Schema.Finite,
      write: Schema.Finite,
    }),
```

Lines 49–53:

```
  id: ID,
  time: Schema.Finite,
  direction: Schema.Literals(["previous", "next"]),
}).annotate({ identifier: "Session.ListAnchor" })
export interface ListAnchor extends Schema.Schema.Type<typeof ListAnchor> {}
```

## C16 — `packages/schema/src/session-input.ts`

Git blob `b024750506e151e7f14f559f979e5c52d46e3833`.

Lines 15–25:

```
export interface Admitted extends Schema.Schema.Type<typeof Admitted> {}
export const Admitted = Schema.Struct({
  admittedSeq: NonNegativeInt,
  id: SessionMessage.ID,
  sessionID: SessionID,
  prompt: Prompt,
  promptContext: PromptContext.Info.pipe(optional),
  delivery: Delivery,
  timeCreated: DateTimeUtcFromMillis,
  promotedSeq: NonNegativeInt.pipe(optional),
}).annotate({ identifier: "SessionInput.Admitted" })
```

## C17 — `packages/schema/src/location.ts`

Git blob `c01ce36372a698a289b1591466d4b01b323543d9`.

Lines 9–25:

```
export const Ref = Schema.Struct({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
}).annotate({ identifier: "Location.Ref" })

export class Info extends Schema.Class<Info>("Location.Info")({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
  project: Schema.Struct({
    id: ProjectID,
    directory: AbsolutePath,
  }),
}) {}

export function response<S extends Schema.Top>(data: S) {
  return Schema.Struct({ location: Info, data })
}
```

## C18 — `packages/schema/src/event.ts`

Git blob `21d0aceeaeb06247f4b2f2ceaeee53f81e1b9cf6`.

Lines 55–64:

```
  const data = Schema.Struct(input.schema).pipe((schema) =>
    input.dataIdentifier ? schema.annotate({ identifier: input.dataIdentifier }) : schema,
  )
  return Schema.Struct({
    id: ID,
    metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
    type: Schema.Literal(input.type),
    durable: optional(Schema.Struct({ aggregateID: Schema.String, seq: Schema.Int, version: Schema.Int })),
    location: optional(Location.Ref),
    data,
```

Lines 76–78:

```
export function inventory<const Definitions extends ReadonlyArray<Definition>>(...definitions: Definitions) {
  return Object.freeze(definitions)
}
```

Lines 88–94:

```
      if (definition.durable && existing.durable && definition.durable.version !== existing.durable.version) {
        if (definition.durable.version > existing.durable.version) result.set(definition.type, definition)
        return result
      }
      if (definition !== existing) throw new Error(`Duplicate latest event definition for ${definition.type}`)
      return result
    }, new Map<string, Definition>()),
```

Lines 105–108:

```
      if (!definition.durable) return result
      const key = versionedType(definition.type, definition.durable.version)
      if (result.has(key)) throw new Error(`Duplicate durable event definition for ${key}`)
      result.set(key, definition)
```

## C19 — `packages/schema/src/session-event.ts`

Git blob `e314b7942bd0d7d56328a27d2cc11a0fa53da481`.

Lines 42–55:

```

const options = {
  durable: {
    aggregate: "sessionID",
    version: 1,
  },
} as const
const stepSettlementOptions = {
  durable: {
    aggregate: "sessionID",
    version: 2,
  },
} as const

```

Lines 219–229:

```

  export const Ended = Event.define({
    type: "session.next.step.ended",
    ...stepSettlementOptions,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      finish: Schema.String,
      cost: Schema.Finite,
      /** Absent in historical events: billing availability was not captured. */
      usageKnown: Schema.Boolean.pipe(optional),
```

Lines 269–280:

```
  // Stream fragments are live-only; Text.Ended is the replayable full-value boundary.
  export const Delta = Event.define({
    type: "session.next.text.delta",
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      textID: Schema.String,
      delta: Schema.String,
    },
  })
  export type Delta = typeof Delta.Type

```

Lines 511–546:

```
export const DurableDefinitions = Event.inventory(
  Created,
  Renamed,
  Deleted,
  AgentSwitched,
  ModelSwitched,
  SubagentModelsChanged,
  PermissionChanged,
  ArchiveChanged,
  Moved,
  Prompted,
  PromptAdmitted,
  ContextUpdated,
  Synthetic,
  Shell.Started,
  Shell.Ended,
  Step.Started,
  Step.Ended,
  Step.Failed,
  Text.Started,
  Text.Ended,
  Tool.Input.Started,
  Tool.Input.Ended,
  Tool.Called,
  Tool.Progress,
  Tool.Success,
  Tool.Failed,
  Reasoning.Started,
  Reasoning.Ended,
  Retried,
  Compaction.Started,
  Compaction.Ended,
  RevertEvent.Staged,
  RevertEvent.Cleared,
  RevertEvent.Committed,
)
```

Lines 567–583:

```
  Text.Started,
  Text.Delta,
  Text.Ended,
  Reasoning.Started,
  Reasoning.Delta,
  Reasoning.Ended,
  Tool.Input.Started,
  Tool.Input.Delta,
  Tool.Input.Ended,
  Tool.Called,
  Tool.Progress,
  Tool.Success,
  Tool.Failed,
  Retried,
  Compaction.Started,
  Compaction.Delta,
  Compaction.Ended,
```

## C20 — `packages/schema/src/event-manifest.ts`

Git blob `12c988bd667a781e53928fc86cf2e1af99c185cc`.

Lines 58–70:

```
export const ServerDefinitions = Event.inventory(
  ...foundationDefinitions,
  ...featureDefinitions,
  ...SessionTodo.Event.Definitions,
  // The server's HEAD watcher announces a branch switch.
  ...VcsEvent.Definitions,
)

export const Definitions = Event.inventory(
  ...foundationDefinitions,
  ...InstallationEvent.Definitions,
  ...featureDefinitions,
  ...SessionTodo.Event.Definitions,
```

Lines 76–83:

```
  ...SessionCompactionEvent.Definitions,
  ...VcsEvent.Definitions,
  ...WorkspaceEvent.Definitions,
  ...WorktreeEvent.Definitions,
  ...ServerEvent.Definitions,
)
export const Latest = Event.latest(Definitions)
export { Durable }
```

## C21 — `packages/protocol/src/groups/session.ts`

Git blob `5830f50001c8dc01227a920f04276054c0e29570`.

Lines 102–109:

```
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(SessionHistoryLimit), Schema.optional),
  after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
})

export const ProcessNode = Schema.Struct({
  pid: Schema.Int,
  parentPid: Schema.optional(Schema.Int),
  name: Schema.optional(Schema.String),
```

Lines 157–165:

```
      HttpApiEndpoint.post("session.create", "/api/session", {
        payload: Schema.Struct({
          id: Session.ID.pipe(Schema.optional),
          agent: Agent.ID.pipe(Schema.optional),
          model: Model.Ref.pipe(Schema.optional),
          location: Location.Ref.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Session.Info }),
        error: SessionNotFoundError,
```

Lines 175–181:

```
      HttpApiEndpoint.get("session.active", "/api/session/active", {
        success: Schema.Struct({ data: Schema.Record(Session.ID, SessionActive) }),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.active",
          summary: "List active sessions",
          description:
```

Lines 333–343:

```
      HttpApiEndpoint.post("session.prompt", "/api/session/:sessionID/prompt", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          prompt: PromptInput.Prompt,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError],
      })
```

Lines 349–350:

```
            description: "Durably admit one session input and schedule agent-loop execution unless resume is false.",
          }),
```

Lines 617–626:

```
      HttpApiEndpoint.get("session.history", "/api/session/:sessionID/history", {
        params: { sessionID: Session.ID },
        query: SessionHistoryQuery,
        success: Schema.Struct({
          data: Schema.Array(SessionEvent.Durable),
          hasMore: Schema.Boolean,
        }).annotate({ identifier: "SessionHistory" }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
```

Lines 632–633:

```
              "Read one finite page of public durable Session events after an exclusive aggregate sequence. Newly committed events may appear on later pages.",
          }),
```

Lines 637–650:

```
      HttpApiEndpoint.get("session.events", "/api/session/:sessionID/event", {
        params: { sessionID: Session.ID },
        query: {
          after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
        },
        success: HttpApiSchema.StreamSse({ data: SessionEvent.Durable }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.events",
            summary: "Subscribe to session events",
            description: "Replay durable events after an aggregate sequence, then continue with new durable events.",
```

Lines 655–660:

```
      HttpApiEndpoint.post("session.interrupt", "/api/session/:sessionID/interrupt", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
```

## C22 — `packages/server/src/handlers/session.ts`

Git blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`.

Lines 68–84:

```
        Effect.catchTag("Session.PromptConflictError", (error) =>
          Effect.fail(
            new ConflictError({
              message: `Prompt message ID conflicts with an existing durable record: ${error.messageID}`,
              resource: error.messageID,
            }),
          ),
        ),
        // A hook refused the prompt before admission; nothing was recorded, and the hook's words say why.
        Effect.catchTag("Session.PromptBlockedError", (error) =>
          Effect.fail(new ConflictError({ message: error.detail, resource: error.sessionID })),
        ),
      )

    const policyResult = <A>(effect: Effect.Effect<A, SessionSubagentModels.Error>) => effect.pipe(
      Effect.catchTag("SessionSubagentModels.NotFoundError", (error) =>
        new SessionNotFoundError({ sessionID: error.sessionID, message: `Session not found: ${error.sessionID}` }),
```

Lines 247–263:

```
        "session.prompt",
        Effect.fn(function* (ctx) {
          return {
            data: yield* admit({
              sessionID: ctx.params.sessionID,
              id: ctx.payload.id,
              prompt: ctx.payload.prompt,
              delivery: ctx.payload.delivery,
              resume: ctx.payload.resume,
            }),
          }
        }),
      )
      .handle(
        "session.command",
        Effect.fn(function* (ctx) {
          const resolved = yield* SlashCommand.render(ctx.payload.command, ctx.payload.arguments ?? "").pipe(
```

Lines 640–653:

```
        "session.events",
        Effect.fn((ctx) =>
          Effect.succeed(
            session.events({ sessionID: ctx.params.sessionID, after: ctx.query.after }).pipe(Stream.orDie),
          ),
        ),
      )
      .handle(
        "session.interrupt",
        Effect.fn(function* (ctx) {
          yield* session.interrupt(ctx.params.sessionID)
          return HttpApiSchema.NoContent.make()
        }),
      )
```

## C23 — `packages/server/src/handlers/message.ts`

Git blob `76f2a2583525f1a8e45be6f0121c4870d0ea9f7a`.

Lines 34–46:

```
        if (ctx.query.cursor && ctx.query.order !== undefined)
          return yield* new InvalidCursorError({ message: "Cursor cannot be combined with order" })
        const decoded = yield* Effect.try({
          try: () => (ctx.query.cursor ? cursor.decode(ctx.query.cursor) : undefined),
          catch: () => new InvalidCursorError({ message: "Invalid cursor" }),
        })
        const order = decoded?.order ?? ctx.query.order ?? "desc"
        const messages = yield* session
          .messages({
            sessionID: ctx.params.sessionID,
            limit: ctx.query.limit ?? DefaultMessagesLimit,
            order,
            cursor: decoded ? { id: decoded.id, direction: decoded.direction } : undefined,
```

Lines 73–77:

```
          cursor: {
            previous: first ? cursor.encode(first, order, "previous") : undefined,
            next: last ? cursor.encode(last, order, "next") : undefined,
          },
        }
```

## C24 — `packages/server/src/middleware/session-location.ts`

Git blob `86d49275ece013a3a1af6a75ed6a5e31d195781b`.

Lines 34–59:

```
          Effect.mapError(
            () =>
              new InvalidRequestError({
                message: "Invalid session ID",
                field: "sessionID",
              }),
          ),
        )
        const row = yield* db
          .select({ directory: SessionTable.directory, workspaceID: SessionTable.workspace_id })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID))
          .get()
          .pipe(Effect.orDie)
        if (!row)
          return yield* new SessionNotFoundError({
            sessionID,
            message: `Session not found: ${sessionID}`,
          })

        const location = Location.Ref.make({
          directory: AbsolutePath.make(row.directory),
          workspaceID: row.workspaceID ? WorkspaceV2.ID.make(row.workspaceID) : undefined,
        })
        return yield* effect.pipe(Effect.provide(bootLocation(locations.get(location), location)))
      }),
```

## C25 — `packages/protocol/src/errors.ts`

Git blob `040460309fbd868f937b7511ddd378942c0c2ac9`.

Lines 3–17:

```
export class InvalidRequestError extends Schema.TaggedErrorClass<InvalidRequestError>()(
  "InvalidRequestError",
  {
    message: Schema.String,
    kind: Schema.optional(Schema.String),
    field: Schema.optional(Schema.String),
  },
  { httpApiStatus: 400 },
) {}

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}
```

Lines 19–44:

```
export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()(
  "ConflictError",
  {
    message: Schema.String,
    resource: Schema.optional(Schema.String),
  },
  { httpApiStatus: 409 },
) {}

export class ServiceUnavailableError extends Schema.TaggedErrorClass<ServiceUnavailableError>()(
  "ServiceUnavailableError",
  {
    message: Schema.String,
    service: Schema.optional(Schema.String),
  },
  { httpApiStatus: 503 },
) {}

export class UnknownError extends Schema.TaggedErrorClass<UnknownError>()(
  "UnknownError",
  {
    message: Schema.String,
    ref: Schema.optional(Schema.String),
  },
  { httpApiStatus: 500 },
) {}
```

Lines 55–63:

```
export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
  "SessionNotFoundError",
  {
    sessionID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

```

Lines 98–103:

```
export class ForbiddenError extends Schema.TaggedErrorClass<ForbiddenError>()(
  "ForbiddenError",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

```

## C26 — `packages/server/src/auth.ts`

Git blob `0569716157d6ae03d1343ba7d08ca697f1fbdb75`.

Lines 29–33:

```
        return Config.of(
          yield* EffectConfig.all({
            password: EffectConfig.string("ORCHESTRA_SERVER_PASSWORD").pipe(EffectConfig.option),
            username: EffectConfig.string("ORCHESTRA_SERVER_USERNAME").pipe(EffectConfig.withDefault("orchestra")),
          }),
```

Lines 40–49:

```
export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  return (
    Option.isSome(config.password) &&
    credentials.username === config.username &&
    Redacted.value(credentials.password) === config.password.value
  )
```

## C27 — `packages/server/src/middleware/authorization.ts`

Git blob `d1624034dd309e5740a3d642357155f405f5839b`.

Lines 13–13:

```
const AUTH_TOKEN_QUERY_PATH = /^\/api\/(?:event|session\/[^/]+\/event|pty\/[^/]+\/connect)$/
```

Lines 34–39:

```
  const url = new URL(request.url, "http://localhost")
  const token = AUTH_TOKEN_QUERY_PATH.test(url.pathname) ? url.searchParams.get(AUTH_TOKEN_QUERY) : null
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
```

Lines 45–57:

```
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        // Browsers cannot set headers on WebSocket upgrades, so a ticketed PTY connect skips
        // credential checks here; the connect handler consumes and validates the ticket.
        const url = new URL(request.url, "http://localhost")
        if (hasPtyConnectTicketURL(url)) return yield* effect
        // Media elements cannot send headers either; the content handler verifies the HMAC ticket.
        if (hasCapabilityContentTicketURL(url)) return yield* effect
        const credential = yield* credentialFromRequest(request)
        if (ServerAuth.authorized(credential, config)) return yield* effect
```

Lines 61–61:

```
        return yield* new UnauthorizedError({ message: "Authentication required" })
```

## C28 — `packages/server/src/middleware/capability-authorization.ts`

Git blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`.

Lines 27–47:

```
          if (ServerAuth.required(config)) {
            const credential = decodeBasic(request.headers.authorization ?? "")
            if (!credential || !ServerAuth.authorized(credential, config)) {
              return yield* new UnauthorizedError({ message: "Authentication required" })
            }
            return operator.configured
          }

          const bearer = /^Bearer ([A-Za-z0-9_-]{43})(?![\s\S])/.exec(request.headers.authorization ?? "")
          if (!bearer) return yield* new UnauthorizedError({ message: "Authentication required" })
          return yield* operator.authenticate(bearer[1])
        })

        const idempotencyKey = request.headers["idempotency-key"]
        if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(idempotencyKey)) {
          return yield* new ForbiddenError({ message: "Request denied" })
        }

        // Only Core's private request frame carries authority. Caller-supplied IDs are not grants.
        return yield* operator.withRequest(authority, { requestID: randomUUID(), idempotencyKey },
          Effect.provideService(effect, RequestAuthority, authority))
```

Lines 80–85:

```
export function capabilityError(error: Capability.Failure) {
  if (error.code === "authentication_required" || error.code === "authentication_revoked") {
    return new UnauthorizedError({ message: "Authentication required" })
  }
  return new ForbiddenError({ message: "Request denied" })
}
```

## C29 — `packages/server/src/middleware/schema-error.ts`

Git blob `d39702b74b11b1ee8e0072903bf1f9f19310da33`.

Lines 10–19:

```
  if (reason.length <= REASON_LIMIT) return reason
  return reason.slice(0, REASON_LIMIT) + `... (${reason.length - REASON_LIMIT} more chars)`
}

export const schemaErrorLayer = HttpApiMiddleware.layerSchemaErrorTransform(SchemaErrorMiddleware, (error) => {
  const reason = truncateReason(error.cause.message)
  return Effect.logWarning("schema rejection").pipe(
    Effect.annotateLogs({ kind: error.kind, reason }),
    Effect.andThen(Effect.fail(new InvalidRequestError({ message: reason, kind: error.kind }))),
  )
```

## C30 — `packages/server/src/location.ts`

Git blob `1881a570a893ec8c55aa436598db44ad19edde04`.

Lines 33–40:

```
export function ref(request: HttpServerRequest.HttpServerRequest) {
  const query = new URL(request.url, "http://localhost").searchParams
  const workspaceID = query.get("location[workspace]") || request.headers["x-orchestra-workspace"]
  const directory = query.get("location[directory]") || process.cwd()
  return Location.Ref.make({
    directory: AbsolutePath.make(directory),
    workspaceID: workspaceID ? WorkspaceV2.ID.make(workspaceID) : undefined,
  })
```

Lines 67–81:

```
    )
    if (missing)
      return yield* new InvalidRequestError({
        message: `Directory not found: ${location.directory}`,
        kind: "location_not_found",
        field: "location.directory",
      })
    // A defect is a bug, not a bad request: it stays a 500, now logged above.
    if (!Cause.hasFails(cause)) return yield* Effect.failCause(cause)
    return yield* new InvalidRequestError({
      message: `Location could not start: ${location.directory}`,
      kind: "location_unavailable",
      field: "location.directory",
    })
  })
```

## C31 — `packages/server/src/handlers/pty.ts`

Git blob `8510e41f51ddc8738229a529fdbc9382324ff94e`.

Lines 120–128:

```
          // mint tickets without passing the server's origin policy.
          if (
            request.headers[PTY_CONNECT_TOKEN_HEADER] !== PTY_CONNECT_TOKEN_HEADER_VALUE ||
            !isAllowedRequestOrigin(request.headers.origin, request.headers.host, cors)
          )
            return yield* new ForbiddenError({ message: "Invalid PTY connect token request" })
          const pty = yield* Pty.Service
          yield* pty.get(ctx.params.ptyID).pipe(
            Effect.catchTag(
```

Lines 135–138:

```
            ),
          )
          return yield* response(tickets.issue({ ptyID: ctx.params.ptyID, ...(yield* ticketScope) }))
        }),
```

Lines 149–160:

```

          const url = new URL(ctx.request.url, "http://localhost")
          const ticket = url.searchParams.get(PTY_CONNECT_TICKET_QUERY)
          if (ticket) {
            const valid = isAllowedRequestOrigin(ctx.request.headers.origin, ctx.request.headers.host, cors)
              ? yield* tickets.consume({ ticket, ptyID: ctx.params.ptyID, ...(yield* ticketScope) })
              : false
            if (!valid) return HttpServerResponse.empty({ status: 403 })
          }
          const parsedCursor = url.searchParams.get("cursor")
          const cursorNumber = parsedCursor === null ? undefined : Number(parsedCursor)
          const cursor =
```

Lines 178–179:

```
          // TODO: Integrate graceful-shutdown socket tracking before clients migrate to this route.
          const outbox = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
```

## C32 — `packages/server/src/handlers/capability-artifacts.ts`

Git blob `f7f3110dbfa6af4e9ad992b560fcfa63ccc2ba9d`.

Lines 61–76:

```
    return handlers.handleRaw("capability.content.read", ({ params, headers }) => {
      const claim = tickets.verify(params.ticket)
      // Expired and unknown tickets are indistinguishable: an empty 401.
      if (claim === undefined) return Effect.succeed(HttpServerResponse.empty({ status: 401 }))
      // Re-run the content read under the minting authority; Core rejects it once revoked or expired.
      return operators.withRequest(claim.authority, { requestID: randomUUID() },
        management.content(claim.sessionID, claim.ref)).pipe(
        Effect.map((content) => contentResponse(content.artifact, content.data, headers.range)),
        Effect.catchIf((error): error is Capability.Failure => error instanceof Capability.Failure,
          () => Effect.succeed(HttpServerResponse.empty({ status: 401 }))),
        // The minting authority could read it, so unavailable now means the artifact or its reference is gone.
        Effect.catchIf((error): error is CapabilityArtifacts.Failure =>
          error instanceof CapabilityArtifacts.Failure && error.code === "artifact_unavailable",
          () => Effect.succeed(HttpServerResponse.empty({ status: 404 }))),
        artifactResponse)
    })
```

## C33 — `packages/server/src/handlers/event.ts`

Git blob `d644f36bdd6aa93cd538f560dab63337c2436022`.

Lines 13–24:

```
export const eventFrames = (encode: (data: unknown) => string = encodeEvent) => {
  const frames = new WeakMap<object, string>()
  return (data: object): Sse.Event => {
    const cached = frames.get(data)
    const json = cached ?? encode(data)
    if (cached === undefined) frames.set(data, json)
    return { _tag: "Event", event: "message", id: undefined, data: json }
  }
}

// The renderer reads this stream on its main thread. On a loaded machine it can fall seconds behind while a model
// streams token deltas, and a subscriber that overflows is cut and must resync everything. The capacity is large
```

Lines 28–45:

```
export const eventStream = (events: EventV2.Interface, frame = eventFrames()) => {
  const connected = {
    id: EventV2.ID.create(),
    type: "server.connected",
    data: {},
  }
  const output = Stream.unwrap(
    Effect.gen(function* () {
      // Acquiring the bounded stream installs its listener before readiness is observable.
      const live = yield* EventV2.allBounded(events, subscriberCapacity)
      return Stream.make(connected).pipe(Stream.concat(live))
    }),
  ).pipe(Stream.map(frame), Stream.pipeThroughChannel(Sse.encode()))
  // A comment frame keeps idle connections open and tells the client the server is alive.
  const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  return output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText)
}

```

Lines 54–64:

```
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
          },
        }),
      ),
    )
  }),
)
```

## C34 — `packages/client/src/generated/client.ts`

Git blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`.

Lines 557–566:

```
    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
    return {
      url,
      init: {
        method: descriptor.method,
        signal: requestOptions?.signal,
        headers,
        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),
      } satisfies RequestInit,
    }
```

Lines 573–594:

```
    } catch (cause) {
      throw new ClientError("Transport", { cause })
    }
  }

  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {
    if (descriptor.declaredStatuses.includes(response.status)) throw await json(response)
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })
  }

  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {
    const response = await execute(descriptor, requestOptions)
    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)
    if (descriptor.empty) {
      try {
        await response.body?.cancel()
      } catch {}
      return undefined as A
    }
```

Lines 597–609:

```
    }
    return (await json(response)) as A
  }

  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({
    async *[Symbol.asyncIterator]() {
      const response = await execute(descriptor, requestOptions)
      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)
      if (!isContentType(response, "text/event-stream")) {
        try {
          await response.body?.cancel()
        } catch {}
        throw new ClientError("UnsupportedContentType")
```

Lines 621–627:

```
            throw new ClientError("Transport", { cause })
          }
          buffer += decoder.decode(next.value, { stream: !next.done })
          if (buffer.length > 1_048_576) throw new ClientError("MalformedResponse")
          const trailingCarriageReturn = !next.done && buffer.endsWith("\r")
          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)
          buffer = buffer.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
```

Lines 639–647:

```
              try {
                yield JSON.parse(data) as A
              } catch (cause) {
                throw new ClientError("MalformedResponse", { cause })
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
          if (next.done) return
```

Lines 653–660:

```
        reader.releaseLock()
      }
    },
  })

  return {
    health: {
      get: (requestOptions?: RequestOptions) =>
```

Lines 1562–1572:

```
          },
          requestOptions,
        ),
      list: (input?: FilesListInput, requestOptions?: RequestOptions) =>
        request<FilesListOutput>(
          {
            method: "GET",
            path: `/api/fs/list`,
            query: { location: input?.["location"], path: input?.["path"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
```

Lines 4082–4104:

```
  params.append(key, String(value))
}

async function json(response: Response): Promise<unknown> {
  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnsupportedContentType")
  }
  let text: string
  try {
    text = await response.text()
  } catch (cause) {
    throw new ClientError("Transport", { cause })
  }
  if (text === "") throw new ClientError("MalformedResponse")
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new ClientError("MalformedResponse", { cause })
  }
}
```

## C35 — `packages/client/README.md`

Git blob `6b5cf80aff0f077666ffcadbf177671a3bc4032f`.

Lines 29–35:

```
`script/build.ts` compiles `ClientApi` from `src/contract.ts`, which composes Protocol with client-local middleware tags, group and method names, and an omission set. Raw file reads and PTY WebSocket operations are omitted; their transports are separate. Tests compare the projection with Server's concrete API.

`src/generated` and `src/generated-effect` are generator output. After changing the public Protocol or Server `HttpApi`, run from this directory:

```sh
bun run generate
bun run check:generated   # fails if committed output drifted
```

## C36 — `packages/client/src/generated-effect/client-error.ts`

Git blob `b8731eec8a26bd7bb8a76d16c67666e6db5af3d1`.

Lines 1–12:

```
import { Schema } from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClientError } from "effect/unstable/http"

export class ClientError extends Schema.TaggedErrorClass<ClientError>()("ClientError", {
  cause: Schema.Defect(),
}) {}

export const mapClientError = <E>(error: E) =>
  HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error)
    ? new ClientError({ cause: error })
    : error
```

## C37 — `packages/client/src/actions-transfer.ts`

Git blob `0d8607699a560ae9fb671f8bc37bc9d1b473424e`.

Lines 64–67:

```
     * Stream uploads require a fetch implementation supporting request streams (duplex: "half").
     * Browsers may require HTTPS/HTTP2 and may not expose a reply until upload completes.
     * A failed capability probe has code "UnsupportedStreaming". A caller-owned Blob skips the
     * probe; no stream-to-Blob fallback occurs. Constructor detection is not a browser runtime proof.
```

Lines 122–126:

```
          // Browsers must read duplex and must not coerce a stream to text. Bun's constructor
          // need not read duplex here; Bun's streaming fetch is covered by the real HTTP fixture.
          if (supported.headers.has("content-type") || (!duplexRead && typeof Reflect.get(globalThis, "Bun") === "undefined"))
            throw new ActionsTransferError("Transport", {
              code: "UnsupportedStreaming",
```

Lines 149–153:

```
  const fetch = options.fetch ?? globalThis.fetch
  const url = new URL(
    `/api/actions/transfer/${encodeURIComponent(binding.id)}${body === undefined ? "" : "/upload"}`,
    options.baseUrl,
  )
```

Lines 172–174:

```
    // A provider/signed redirect must not receive the configured Orchestra credentials.
    redirect: "manual",
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
```

## C38 — `packages/client/src/actions-transfer-error.ts`

Git blob `314b2dc47f3e63182dec1324c1c31f3839dc12d9`.

Lines 37–48:

```
/** Error bodies only: at most 16 KiB retained, with a five-second read deadline. */
export async function actionsTransferResponseError(response: Response): Promise<never> {
  const details = { status: response.status, retryAfter: retryAfter(response.headers.get("retry-after")) }
  const captured = await capture(response).catch((cause: unknown) => {
    throw new ActionsTransferError("Transport", { ...details, cause })
  })
  if (captured.truncated) throw new ActionsTransferError("MalformedResponse", { ...details, truncated: true })
  if (!/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get("content-type") ?? ""))
    throw new ActionsTransferError("UnexpectedStatus", details)
  const data = parse(captured.bytes)
  if (!isErrorData(data)) throw new ActionsTransferError("MalformedResponse", details)
  throw new ActionsTransferError("UnexpectedStatus", { ...details, data })
```

Lines 51–65:

```
async function capture(response: Response) {
  const bytes = new Uint8Array(16_384)
  if (!response.body) return { bytes: bytes.subarray(0, 0), truncated: false }
  const reader = response.body.getReader()
  let length = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Actions error response read timed out")), 5_000)
  })
  try {
    while (true) {
      const next = await Promise.race([reader.read(), deadline])
      if (next.done) return { bytes: bytes.subarray(0, length), truncated: false }
      if (next.value.byteLength > bytes.length - length) return { bytes: bytes.subarray(0, length), truncated: true }
      bytes.set(next.value, length)
```

Lines 68–73:

```
  } finally {
    clearTimeout(timer)
    // Do not let a broken peer extend the capture deadline through cancellation.
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
```

## C39 — `packages/protocol/src/groups/actions-transfer.ts`

Git blob `e39a1a8900b6808f0a80be14af702b14c3dc3c44`.

Lines 10–17:

```
export const ActionsTransferGroup = HttpApiGroup.make("server.actionsTransfer")
  .add(HttpApiEndpoint.get("actions.transfer.info", "/api/actions/transfer/:bindingID/info", {
    params: BindingParams, query: TransferQuery, success: Location.response(Actions.TransferInfo), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.transfer.read", "/api/actions/transfer/:bindingID", {
    params: BindingParams, query: TransferQuery,
    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## C40 — `packages/client/script/build.ts`

Git blob `99ae2184b9c13f6175d7ba8e3025068bee07ee4f`.

Lines 1–12:

```
import { NodeFileSystem } from "@effect/platform-node"
import { compile, emitEffectImported, emitPromise, write } from "@orchestra/httpapi-codegen"
import { ClientApi, endpointNames, groupNames, omitEndpoints } from "../src/contract"
import { Effect } from "effect"
import { fileURLToPath } from "url"

const contract = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })
const splitGroups = new Set([
  "research",
  "schedules",
  "actionsBindings",
  "actionsOperations",
```

Lines 28–48:

```
          outputTypes: {
            "sessions.events": {
              name: "SessionEventEncoded",
              import: 'import type { SessionEventEncoded } from "../wire"',
            },
            "events.subscribe": {
              name: "OrchestraEventEncoded",
              import: 'import type { OrchestraEventEncoded } from "@orchestra/protocol/groups/event"',
            },
          },
        }),
        fileURLToPath(new URL("../src/generated", import.meta.url)),
      ),
      write(
        emitEffectImported(contract, { module: "../contract", api: "ClientApi" }, { splitGroups }),
        fileURLToPath(new URL("../src/generated-effect", import.meta.url)),
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
```

## C41 — `tooling/httpapi-codegen/src/index.ts`

Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`.

Lines 75–82:

```
export function compile<Id extends string, Groups extends HttpApiGroup.Any>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly groupNames?: Readonly<Record<string, string>>
    readonly endpointNames?: Readonly<Record<string, string>>
    readonly omitEndpoints?: ReadonlySet<string>
  },
): Contract {
```

Lines 89–99:

```
      if (options?.omitEndpoints?.has(endpoint.name)) return
      const groupName = options?.groupNames?.[group.identifier] ?? group.identifier
      const name = `${groupName}.${endpoint.name}`
      const required = Array.from(middleware).find((item) => item.requiredForClient)
      if (required !== undefined) {
        throw new GenerationError({ reason: `Client middleware requires adapter: ${required.key}` })
      }

      const successSchemas = Array.from(endpoint.success)
      if (successSchemas.length === 0) successSchemas.push(HttpApiSchema.NoContent)
      if (successSchemas.length > 1) throw new GenerationError({ reason: `Multiple success schemas: ${name}` })
```

Lines 105–123:

```
      if (sourcePayloads.length > 1) {
        throw new GenerationError({ reason: `Multiple payload schemas: ${name}` })
      }
      const payloads = sourcePayloads.map((schema) => normalizeTransport(schema, "payload", endpoint, name)!)
      const success = normalizeTransport(successSchemas[0], "success", endpoint, name)!
      const errorSchemas = Array.from(errors).flatMap(([status, schemas]) =>
        schemas.map((schema) => ({ status, ...normalizeTransport(schema, "error", endpoint, name)! })),
      )
      const inputs = [
        ...inputFields(params?.schema, "params", name),
        ...inputFields(query?.schema, "query", name),
        ...inputFields(headers?.schema, "headers", name),
        ...payloads.flatMap((item) => inputFields(item.schema, "payload", name)),
      ]
      const names = new Set<string>()
      for (const field of inputs) {
        if (names.has(field.name)) throw new GenerationError({ reason: `Input field collision: ${field.name}` })
        names.add(field.name)
      }
```

Lines 150–159:

```
        input: inputs,
        unwrapData: isDataEnvelope(success.schema),
        binary: resolveHttpApiEncoding(success.schema.ast)?._tag === "Uint8Array",
        successes: [success.schema],
        errors: errorSchemas.map((item) => ({ status: item.status, schema: item.schema })),
        effectPortable,
        operation: {
          group: groupName,
          name: options?.endpointNames?.[endpoint.name] ?? clientEndpointName(endpoint.name),
          input: inputs.map(({ name, source }) => ({ name, source })),
```

Lines 212–219:

```
    groups,
  }
}

export function emitEffect(contract: Contract): Output {
  const endpoint = contract.groups.flatMap((group) => group.endpoints).find((endpoint) => !endpoint.effectPortable)
  if (endpoint !== undefined) {
    throw new GenerationError({
```

Lines 318–343:

```
function assertPromiseEndpoint(endpoint: Endpoint) {
  const name = `${endpoint.group}.${endpoint.endpoint.name}`
  const payload = endpoint.payloads[0]
  const payloadEncoding = payload === undefined ? undefined : resolveHttpApiEncoding(payload.ast)
  if (
    payload !== undefined &&
    (payloadEncoding?._tag ?? (HttpMethod.hasBody(endpoint.endpoint.method) ? "Json" : "FormUrlEncoded")) !== "Json"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise payload encoding: ${name}` })
  }
  const success = endpoint.successes[0]
  const successEncoding = resolveHttpApiEncoding(success.ast)?._tag ?? "Json"
  if (isStreamSchema(success)) {
    if (
      success._tag !== "StreamSse" ||
      success.sseMode !== "data" ||
      !SchemaAST.isNever(Schema.toType(success.error).ast)
    ) {
      throw new GenerationError({ reason: `Unsupported Promise stream: ${name}` })
    }
  } else if (
    !HttpApiSchema.isNoContent(success.ast) &&
    successEncoding !== "Json" &&
    successEncoding !== "Uint8Array"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise success encoding: ${name}` })
```

Lines 698–704:

```
    for (const file of files) {
      if (!isSafeOutputPath(file.path)) yield* new GenerationError({ reason: `Unsafe output path: ${file.path}` })
      const path = file.path.toLowerCase()
      if (normalizedPaths.has(path)) yield* new GenerationError({ reason: `Duplicate output path: ${file.path}` })
      normalizedPaths.add(path)
      paths.add(file.path)
    }
```

Lines 714–719:

```
    if (previous.some((path) => !isSafeOutputPath(path))) {
      yield* new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })
    }
    yield* Effect.forEach(
      previous.filter((path) => !paths.has(path)),
      (path) => fs.remove(join(directory, path), { force: true }),
```

Lines 727–739:

```
          Effect.flatMap((info) =>
            info?.type === "SymbolicLink"
              ? new GenerationError({ reason: `Unsafe output path: ${file.path}` })
              : Effect.void,
          ),
        ),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(files, (file) => fs.writeFileString(join(directory, file.path), file.content), {
      concurrency: 8,
      discard: true,
    })
    yield* fs.writeFileString(manifest, JSON.stringify(files.map((file) => file.path).sort(), null, 2) + "\n")
```

Lines 743–745:

```
function isSafeOutputPath(path: string) {
  return path !== manifestName && !isAbsolute(path) && path !== "." && path !== ".." && !/[\\/]/.test(path)
}
```

Lines 757–763:

```
function inputFields(schema: Schema.Top | undefined, source: InputField["source"], operation: string) {
  if (schema === undefined) return []
  const ast = Schema.toType(schema).ast
  if (!SchemaAST.isObjects(ast) || ast.indexSignatures.length > 0) {
    throw new GenerationError({ reason: `Input schema must be a struct: ${operation}.${source}` })
  }
  return ast.propertySignatures.map((field) => {
```

Lines 946–955:

```
function isDataEnvelope(schema: Schema.Top) {
  if (isStreamSchema(schema) || HttpApiSchema.isNoContent(schema.ast)) return false
  const ast = Schema.toType(schema).ast
  return (
    SchemaAST.isObjects(ast) &&
    ast.indexSignatures.length === 0 &&
    ast.propertySignatures.length === 1 &&
    ast.propertySignatures[0]?.name === "data"
  )
}
```

## C42 — `tooling/httpapi-codegen/src/imported-effect.ts`

Git blob `6434e356b20197746aa9f0bbd5727ab80dcdd831`.

Lines 58–64:

```
  const imports =
    projection === undefined
      ? `import { ${api} } from ${JSON.stringify(options.module)}`
      : `import { HttpApi, HttpApiClient${"endpoints" in options ? ", HttpApiGroup" : ""} } from "effect/unstable/httpapi"\nimport { ${projection.imports.join(", ")} } from ${JSON.stringify(options.module)}`
  const httpApiImport = projection === undefined ? 'import { HttpApiClient } from "effect/unstable/httpapi"\n' : ""
  const usesStream = groups.some((group) => group.endpoints.some((item) => item.operation.success === "stream"))
  const mapper = `const mapClientError = <E>(error: E) => HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error) ? new ClientError({ cause: error }) : error`
```

## C43 — `tooling/httpapi-codegen/src/effect-headers.ts`

Git blob `e2e2c1da3504df7c8080aa2a9efe31d00816f92c`.

Lines 8–12:

```
  const formHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-type"))
  return HttpApiClient.make(${api}, {
    baseUrl: options.baseUrl,
    transformClient: (client) => HttpClient.mapRequest(client, (request) =>
      HttpClientRequest.setHeaders(request, { ...(request.body._tag === "FormData" ? formHeaders : headers), ...request.headers })),
```

Lines 21–29:

```
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input)).flatMap(([name, descriptor]) => {
    if (!/^[!#$%&'*+.^_|~0-9A-Za-z\\x60-]+$/.test(name) || !("value" in descriptor) ||
      typeof descriptor.value !== "string" || /[\\r\\n]/.test(descriptor.value)) {
      throw new TypeError("Invalid client headers")
    }
    return descriptor.enumerable ? [[name, descriptor.value] as const] : []
  })
  try {
    return Object.freeze(Object.fromEntries(new Headers(Object.fromEntries(entries))))
```

## C44 — `tooling/httpapi-codegen/src/layout.ts`

Git blob `b14d3a3f669e096c4e72d1fd2ad65ed8c483826f`.

Lines 98–103:

```
    printWidth: 120,
  })
  if (!file.boundedTypes || physicalLines(formatted) <= 400) return [{ path: file.path, content: formatted }]
  const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [formatted, {}])
  if (!isNode(ast) || !Array.isArray(ast.body)) {
    throw new GenerationError({ reason: `Invalid bounded type layout: ${file.path}` })
```

Lines 151–161:

```
    const candidate = await print(render([...current, node], provisional))
    if (physicalLines(candidate) <= 350) {
      current.push(node)
      continue
    }
    const single = await print(render([node], provisional))
    if (physicalLines(single) > 400) {
      throw new GenerationError({
        reason: `Promise declaration exceeds 400 lines: ${file.path}:${declarationName(node)}`,
      })
    }
```

Lines 188–190:

```
  const oversized = files.find((part) => physicalLines(part.content) > 400)
  if (oversized) throw new GenerationError({ reason: `Promise type layout exceeds 400 lines: ${oversized.path}` })
  return files
```

## C45 — `packages/sdk-next/src/orchestra.ts`

Git blob `0a8009ba9ac8d51b0a0c27363786176479dc8532`.

Lines 14–30:

```
export const create = Effect.fn("Orchestra.create")(function* () {
  const scope = yield* Scope.Scope
  const memoMap = yield* Layer.makeMemoMap
  const context = yield* Layer.buildWithMemoMap(
    AppNodeBuilder.build(LayerNode.group([ApplicationTools.node, PermissionSaved.node, ClaudeCodeAccount.node])),
    memoMap,
    scope,
  )
  const tools = Context.get(context, ApplicationTools.Service)
  const permissions = Context.get(context, PermissionSaved.Service)
  const account = Context.get(context, ClaudeCodeAccount.Service)
  const operator = yield* CapabilityOperator.make({ principal: Principal.account(),
    scope: { placements: "instance", actions: ["*"] } }).pipe(Effect.orDie)
  const web = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        createEmbeddedRoutes({ operator }).pipe(
```

Lines 38–52:

```
        ),
        { disableLogger: true, memoMap },
      ),
    ),
    (web) => Effect.promise(web.dispose),
  )
  const transport = yield* makeOperatorTransport(web.handler, operator).pipe(Effect.orDie)
  const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
  )
  return {
    ...client,
    tools: { register: tools.register },
  }
```

## C46 — `packages/sdk-next/src/operator-transport.ts`

Git blob `ef67f666b8ef7a94c270058903d1f8ecf34abbf0`.

Lines 8–27:

```
  const first = yield* operator.issue({ origin: "sdk" })
  const current = { credential: first }
  const renewal = Semaphore.makeUnsafe(1)
  const fetch = Object.assign((input: RequestInfo | URL, init?: RequestInit) => Effect.runPromise(Effect.gen(function* () {
    const request = new Request(input, init)
    // Preserve explicit per-request credentials. Only our captured default is eligible for host renewal.
    if (request.headers.get("authorization") !== `Bearer ${first.bearer}`) return yield* Effect.promise(() => handler(request))
    const credential = yield* renewal.withPermit(Effect.gen(function* () {
      const authenticated = yield* operator.authenticate(current.credential.bearer).pipe(Effect.exit)
      if (Exit.isSuccess(authenticated)) return current.credential
      if (!authenticated.cause.reasons.length || !authenticated.cause.reasons.every((reason) => reason._tag === "Fail" &&
        reason.error._tag === "Capability.Failure" && reason.error.code === "authentication_required"))
        return yield* Effect.failCause(authenticated.cause)
      current.credential = yield* operator.issue({ origin: "sdk" })
      return current.credential
    }))
    request.headers.set("authorization", `Bearer ${credential.bearer}`)
    return yield* Effect.promise(() => handler(request))
  })), { preconnect: () => undefined }) satisfies typeof globalThis.fetch
  return { fetch, headers: Object.freeze({ Authorization: `Bearer ${first.bearer}` }) }
```

## C47 — `packages/server/src/routes.ts`

Git blob `75b0f9753e4c879767ef186f5003519e2b681025`.

Lines 104–105:

```
export function createEmbeddedRoutes(options: Pick<Options, "host" | "operator" | "verifier"> = {}) {
  return makeRoutes(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() }), options)
```

Lines 112–112:

```
  const merged = Host.merge(options.host ?? [])
```

