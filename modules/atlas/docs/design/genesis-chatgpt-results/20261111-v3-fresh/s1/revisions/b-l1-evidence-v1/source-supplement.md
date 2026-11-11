# Evidência adicional exata para o candidato L1 B

Base: `output/producers/b/review-dossier.md`, SHA-256 `6c0face0fd44960dbc7bae233ec90607956af5a6a8b40fc50a8fc2a82dc5ce86`. Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Todos os trechos vêm de bytes previamente capturados. Somente linhas ausentes do compacto congelado são acrescentadas; saltos de linhas são explícitos. A seleção não eleva a profundidade registrada em coverage e não representa execução.

## Correção factual autorizada

O corpo-base session-contract atribuía logging ao ramo de comando MCP. O trecho de handlers/session.ts 267–273 mapeia as duas falhas para UnknownError sem chamada de log nesse ramo. A nova versão separada em corrected/session-contract.md remove essa garantia. O resto do dossiê-base permanece congelado. Esta constatação não afirma ausência de logs em todo o servidor.

## Mapa de artefato para fonte adicional

- `s1.api.boundaries`: S01, S02, S03, S04, S05, S06, S38.
- `s1.api.schema-contracts`: S05, S06, S07, S08, S09, S10, S11, S12, S13, S14.
- `s1.api.session-contract`: S15, S16, S17, S18.
- `s1.api.server-edge`: S19, S20, S21, S22, S23, S24.
- `s1.api.stream-contract`: S13, S14, S36.
- `s1.api.client-projection`: S25, S26, S27, S28, S29, S30, S34, S35.
- `s1.api.codegen`: S31, S32, S33.
- `s1.api.sdk-composition`: S22, S37.
- `s1.api.surface-disposition`: S32, S33.

## S01 — `docs/architecture/phase-plans/70-90-briefs/EXP-SCHEMA.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0723a992ae4efdeec7c236c34c98d3348943fabe`; arquivo SHA-256 `be6cc13b66cf15b792850aef0a3c073f452d29a92b5404a37b196c556575a30f`; 4217 bytes.

Finalidade: Historical source baseline is distinct from current capture pin.

Linhas 7–7; trecho SHA-256 `ce38dc5574b3ea44d59412722278aa158b7d6bfab5e30f037122a295e8151905`:

```
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
```


## S02 — `docs/architecture/phase-plans/70-90-briefs/EXP-PROTOCOL.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ec98f67b2646c04b3c71e0bef28f5fc121a0fe43`; arquivo SHA-256 `a8b24da0ea4c35e85a72da05899d2f73b788ee0557a570f2754de8704db0d52e`; 4259 bytes.

Finalidade: Historical source baseline.

Linhas 7–7; trecho SHA-256 `ce38dc5574b3ea44d59412722278aa158b7d6bfab5e30f037122a295e8151905`:

```
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
```


## S03 — `docs/architecture/phase-plans/70-90-briefs/EXP-SERVER.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `85b089a295aaaff6c0df459d7c0eb50b63b04465`; arquivo SHA-256 `c71baa9e20d0e0c137206f7c7f76fd9dca0e1b0c0b92a782c0bd29d7b50b7195`; 4217 bytes.

Finalidade: Historical source baseline.

Linhas 7–7; trecho SHA-256 `ce38dc5574b3ea44d59412722278aa158b7d6bfab5e30f037122a295e8151905`:

```
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
```


## S04 — `docs/architecture/phase-plans/70-90-briefs/RN-SDK.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `debd73947ef46953ef83a743f7568d3b7e36d5e0`; arquivo SHA-256 `87c154f22a75842a8ef39db898485e329ca0256b042810479e82bfdcf0700278`; 4933 bytes.

Finalidade: Historical source baseline.

Linhas 9–9; trecho SHA-256 `ce38dc5574b3ea44d59412722278aa158b7d6bfab5e30f037122a295e8151905`:

```
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
```


## S05 — `packages/schema/AGENTS.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `88ff8b244e3fca3c8b23950514b7eff3cf37e85b`; arquivo SHA-256 `ca79ab26b6eb07d1ed35a76851852d69475ec554dad7624714d3e47c15dce057`; 5640 bytes.

Finalidade: Direct event entrypoints, readonly contracts and loose ID compatibility are intent.

Linhas 10–10; trecho SHA-256 `384f27267d7eb6b6aff56d935b53ea4fff6dbb242b591e77addfe50a51b608e9`:

```
- The root barrel exports canonical current domain contracts. Specialized event modules, manifests, and infrastructure modules use direct entrypoints instead of becoming first-class root exports.
```

Linhas 60–60; trecho SHA-256 `2d76a82dc4dfdf0b253b4240ddad70afa6ce50114adc263bcd357542a88dc6a7`:

```
- Public Schema contracts are readonly by default.
```

Linhas 76–76; trecho SHA-256 `432f56ce8eeb42a3707822dc39a4965d7205e508dd36db3059fba2123d3ca2b8`:

```
- Do not tighten legacy loose ID validators without an explicit compatibility and migration decision; existing callers and tests may rely on accepted non-canonical IDs.
```


## S06 — `packages/schema/src/model.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `10fa175e247bfcbaa968e41fd7d61bd57945896a`; arquivo SHA-256 `cd7717a4699cb24ce617f66352e77981281d0ff1af2b0f52dac8bbfd6d150e84`; 3005 bytes.

Finalidade: Observed V2 brand and identifier.

Linhas 8–9; trecho SHA-256 `767fee334d65ec25055a13a0f4106a0990d9a534a012b5e422da58ffb1680d0f`:

```
export const ID = Schema.String.pipe(Schema.brand("ModelV2.ID"))
export type ID = typeof ID.Type
```

Linhas 85–87; trecho SHA-256 `affba08f4928b026d538a052179c81931a0000c91ae72e0644065fb12be69a4b`:

```
  }),
})
  .annotate({ identifier: "ModelV2.Info" })
```


## S07 — `packages/schema/src/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `8319d3369ebf6ac5952dd390b3ff8844e995b280`; arquivo SHA-256 `79fb348dc00ce9e06fc01fb595df8c05730bb3cbdd604b55c7b57e6d8321cdfa`; 1672 bytes.

Finalidade: Session time/cost/token fields omitted from compact range.

Linhas 36–48; trecho SHA-256 `66797a0bb5f23c3e28a1e798bcb0c385bdaef465a11e2affa7085b3e636ed7f4`:

```
  }),
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
    archived: DateTimeUtcFromMillis.pipe(optional),
  }),
  title: Schema.String,
  location: Location.Ref,
  subpath: RelativePath.pipe(optional),
  revert: Revert.State.pipe(optional),
}).annotate({ identifier: "SessionV2.Info" })

export const ListAnchor = Schema.Struct({
```


## S08 — `packages/schema/src/prompt.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `376700cc7a6ccc0613da1ff470b00aeba803a74e`; arquivo SHA-256 `d1fc8764053e3c6b07791cd7f1f319e9c8b9a5942af04432c53a622af0f486a6`; 1865 bytes.

Finalidade: Canonical attachment includes mime; Prompt files use this schema.

Linhas 12–20; trecho SHA-256 `aea921a15c843ef971263b477f20eea2097a7d42ac9b22f6ff45677c11271e7d`:

```
export interface FileAttachment extends Schema.Schema.Type<typeof FileAttachment> {}
export const FileAttachment = Schema.Struct({
  uri: Schema.String,
  mime: Schema.String,
  name: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  source: Source.pipe(optional),
})
  .annotate({ identifier: "Prompt.FileAttachment" })
```

Linhas 40–45; trecho SHA-256 `3a650651d304655ceb9ec6a8d16476250130344cdd0c7ce2d8611703a2973442`:

```
export interface Prompt extends Schema.Schema.Type<typeof Prompt> {}
export const Prompt = Schema.Struct({
  text: Schema.String,
  files: Schema.Array(FileAttachment).pipe(optional),
  agents: Schema.Array(AgentAttachment).pipe(optional),
})
```


## S09 — `packages/schema/src/prompt-input.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f2a0d460dfdd10275fc7b7c3e13c49ec80151e64`; arquivo SHA-256 `f8c6363251babacd5dfc0c5e5e7413e0efd44bd6f56612a380286f61df23ba46`; 900 bytes.

Finalidade: Admission attachment omits mime and has its own Prompt schema.

Linhas 7–26; trecho SHA-256 `c0524f7c2a9aa1fb76a53bd8d047a0c71575fffe646313859b1089357bd41610`:

```
export interface FileAttachment extends Schema.Schema.Type<typeof FileAttachment> {}
export const FileAttachment = Schema.Struct({
  uri: Schema.String,
  name: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  source: Source.pipe(optional),
})
  .annotate({ identifier: "PromptInput.FileAttachment" })
  .pipe(
    statics((schema) => ({
      create: (input: FileAttachment) => schema.make(input),
    })),
  )

export interface Prompt extends Schema.Schema.Type<typeof Prompt> {}
export const Prompt = Schema.Struct({
  text: Schema.String,
  files: Schema.Array(FileAttachment).pipe(optional),
  agents: Schema.Array(AgentAttachment).pipe(optional),
}).annotate({ identifier: "PromptInput" })
```


## S10 — `packages/schema/src/session-delivery.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `9b678dabf9f910b173f2b2cfddebacbd11922264`; arquivo SHA-256 `6c711801312cf2512c46695e44dfcba86f0e9cf9b8485aed4b435adcdba23528`; 192 bytes.

Finalidade: steer/queue delivery union.

Linhas 5–6; trecho SHA-256 `0be4c3a7cb1b519597225862af79e95c4d7ca7038e6f6ce2fc25739206f5bdd9`:

```
export const Delivery = Schema.Literals(["steer", "queue"])
export type Delivery = typeof Delivery.Type
```


## S11 — `packages/schema/src/session-message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `62aeee3e61a1a2c3dcb0b6de15711357093f7e79`; arquivo SHA-256 `abcc5bf88ad6763156d9bea5499a9d552567cfc84a6d7005722c0d7d692aaec8`; 8356 bytes.

Finalidade: Message ID prefix, tool states/provider facts and message union.

Linhas 13–16; trecho SHA-256 `599941f16e9b32002e105b963b4a52237d8109c3fd3c188ffebc96d0a6757c5a`:

```
export const ID = Schema.String.check(Schema.isStartsWith("msg_")).pipe(
  Schema.brand("Session.Message.ID"),
  statics((schema) => ({ create: () => schema.make("msg_" + ascending()) })),
)
```

Linhas 122–142; trecho SHA-256 `e6031a2c7103220a688fb6ec009b1d21f83ba52b0a2eae67cc3ed1474cf1b94e`:

```
export const ToolState = Schema.Union([ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError]).pipe(
  Schema.toTaggedUnion("status"),
)
export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError

export interface AssistantTool extends Schema.Schema.Type<typeof AssistantTool> {}
export const AssistantTool = Schema.Struct({
  type: Schema.Literal("tool"),
  id: Schema.String,
  name: Schema.String,
  provider: Schema.Struct({
    executed: Schema.Boolean,
    metadata: ProviderMetadata.pipe(optional),
    resultMetadata: ProviderMetadata.pipe(optional),
  }).pipe(optional),
  state: ToolState,
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    ran: DateTimeUtcFromMillis.pipe(optional),
    completed: DateTimeUtcFromMillis.pipe(optional),
    pruned: DateTimeUtcFromMillis.pipe(optional),
```

Linhas 206–219; trecho SHA-256 `95baeeff5b60a91771ab0b5faa621f558fd3ee75c549b3a061c95a532807ad2d`:

```
export const Message = Schema.Union([
  AgentSwitched,
  ModelSwitched,
  User,
  Synthetic,
  System,
  Shell,
  Assistant,
  Compaction,
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Session.Message" })
export type Message = AgentSwitched | ModelSwitched | User | Synthetic | System | Shell | Assistant | Compaction
export type Type = Message["type"]
```


## S12 — `packages/schema/src/event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `21d0aceeaeb06247f4b2f2ceaeee53f81e1b9cf6`; arquivo SHA-256 `0542c9dedbd6f769cd95bb8624ff9449067b56b66c52d818bb7f11b78bcb75de`; 4331 bytes.

Finalidade: Event ID prefix.

Linhas 9–12; trecho SHA-256 `285f55762328ab3e680377f4a1391f93ec549a64f614d8845879c7b6b8056620`:

```
export const ID = Schema.String.check(Schema.isStartsWith("evt_")).pipe(
  Schema.brand("Event.ID"),
  statics((schema) => ({ create: () => schema.make("evt_" + ascending()) })),
)
```


## S13 — `packages/schema/src/session-event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e314b7942bd0d7d56328a27d2cc11a0fa53da481`; arquivo SHA-256 `790f1b779fda44be41138208c7b855fcf2e5ab3ff84070307155d7025b6b855d`; 15257 bytes.

Finalidade: Failed step version option and live-only/full-value boundaries.

Linhas 245–254; trecho SHA-256 `4e84df92065d96c0cc1f618ccc0d0910e424cabf2cc35b481176c99bd3b5ce1c`:

```
  export const Failed = Event.define({
    type: "session.next.step.failed",
    ...stepSettlementOptions,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      error: UnknownError,
    },
  })
  export type Failed = typeof Failed.Type
```

Linhas 307–329; trecho SHA-256 `b710cb8516432e9162662c2b973f6ff5cb100e516fa0f1b5eb7a3fa2d8cd939b`:

```
  // Stream fragments are live-only; Reasoning.Ended is the replayable full-value boundary.
  export const Delta = Event.define({
    type: "session.next.reasoning.delta",
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      reasoningID: Schema.String,
      delta: Schema.String,
    },
  })
  export type Delta = typeof Delta.Type

  export const Ended = Event.define({
    type: "session.next.reasoning.ended",
    ...options,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      reasoningID: Schema.String,
      text: Schema.String,
      providerMetadata: ProviderMetadata.pipe(optional),
    },
  })
```

Linhas 351–369; trecho SHA-256 `cea3e9eaf3c19545116f117a926d2fcf0ca79f160f90776838c8726045020d77`:

```
    // Stream fragments are live-only; Input.Ended is the replayable raw-input boundary.
    export const Delta = Event.define({
      type: "session.next.tool.input.delta",
      schema: {
        ...ToolBase,
        delta: Schema.String,
      },
    })
    export type Delta = typeof Delta.Type

    export const Ended = Event.define({
      type: "session.next.tool.input.ended",
      ...options,
      schema: {
        ...ToolBase,
        text: Schema.String,
      },
    })
    export type Ended = typeof Ended.Type
```

Linhas 472–494; trecho SHA-256 `c1070bb34e7b006a3d16c93ea580cab317e17d1b5f0ce6ac0ec8b50e0ac4fa8b`:

```

  export const Delta = Event.define({
    type: "session.next.compaction.delta",
    schema: {
      ...Base,
      messageID: SessionMessage.ID,
      text: Schema.String,
    },
  })
  export type Delta = typeof Delta.Type

  export const Ended = Event.define({
    type: "session.next.compaction.ended",
    ...options,
    schema: {
      ...Base,
      messageID: SessionMessage.ID,
      reason: Started.data.fields.reason,
      text: Schema.String,
      recent: Schema.String,
    },
  })
  export type Ended = typeof Ended.Type
```


## S14 — `packages/schema/src/durable-event-manifest.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e9c9f78dd4defc0bf2299ac2f9214d45fd67ead9`; arquivo SHA-256 `2a0b5b89a473f63224587645033ec95124e684d31669ffe54d7de719bfa0cf1f`; 635 bytes.

Finalidade: Durable manifest includes Maestro, RelayHook and Research.

Linhas 1–20; trecho SHA-256 `2a0b5b89a473f63224587645033ec95124e684d31669ffe54d7de719bfa0cf1f`:

```
export * as DurableEventManifest from "./durable-event-manifest"

import { Event } from "./event"
import { MaestroEvent } from "./maestro-event"
import { RelayHook } from "./relay-hook"
import { ResearchEvent } from "./research-event"
import { SessionEvent } from "./session-event"

export const SessionDurable = {
  definitions: Event.durable(SessionEvent.DurableDefinitions),
  schema: SessionEvent.Durable,
} as const

export const Durable = Event.durable([
  ...SessionEvent.DurableDefinitions,
  ...MaestroEvent.Definitions,
  ...MaestroEvent.DurableOnlyDefinitions,
  ...RelayHook.Definitions,
  ...ResearchEvent.Definitions,
])
```


## S15 — `packages/protocol/src/groups/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5830f50001c8dc01227a920f04276054c0e29570`; arquivo SHA-256 `2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f`; 29273 bytes.

Finalidade: Session list envelope and archive/remove declared responsibilities.

Linhas 137–147; trecho SHA-256 `e35490e735fa576f0345f675fbfd285c9824f72dde566350de4fdf1216457bb8`:

```
      HttpApiEndpoint.get("session.list", "/api/session", {
        query: SessionsQuery,
        success: Schema.Struct({
          data: Schema.Array(Session.Info),
          cursor: Schema.Struct({
            previous: SessionsCursor.pipe(Schema.optional),
            next: SessionsCursor.pipe(Schema.optional),
          }),
        }).annotate({ identifier: "SessionsResponse" }),
        error: [InvalidCursorError, InvalidRequestError],
      }).annotateMerge(
```

Linhas 202–220; trecho SHA-256 `86021fc5546a04f4e243efe3e699ed3a36f2a0ef706d80595893478d3fd32a7d`:

```
      HttpApiEndpoint.post("session.archive", "/api/session/:sessionID/archive", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ archived: Schema.Boolean }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.archive",
            summary: "Archive or restore session",
            description: "Change session visibility without stopping execution or removing session history.",
          }),
      ),
    )
    .add(
      HttpApiEndpoint.post("session.rename", "/api/session/:sessionID/rename", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ title: Schema.NonEmptyString }),
```

Linhas 240–252; trecho SHA-256 `d3cd4428747bd469d503279c1bc7683d99c59d46bd2f54b9b1bfab82db69f22e`:

```
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.remove",
            summary: "Delete session",
            description: "Interrupt the session, then permanently delete it with its child sessions and history.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.getSubagentModels", "/api/session/:sessionID/subagent-models", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: SessionSubagentModels.Policy }),
        error: [SessionNotFoundError, ServiceUnavailableError],
```


## S16 — `packages/server/src/handlers/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`; arquivo SHA-256 `8acca2bd207b45968d1540300fe7395a755249bd08ad1168d80a63863ded5b9e`; 27133 bytes.

Finalidade: Default page sizes, session list cursor behavior and create cwd fallback; Operation/policy/context mappings; command UnknownError branch without logging.

Linhas 24–25; trecho SHA-256 `4acb67e61ceb0c96913305feacfe39a826c799929d0b82ef491dafebaa5afa7e`:

```
const DefaultSessionsLimit = 50
const DefaultSessionHistoryLimit = 50
```

Linhas 35–46; trecho SHA-256 `769adafecb1aa7fb2d204333b0757272c04ace71418c73f68ade8bb21b6d7511`:

```
const operationErrors = {
  "Session.NotFoundError": (error: SessionV2.NotFoundError) =>
    Effect.fail(new SessionNotFoundError({ sessionID: error.sessionID, message: `Session not found: ${error.sessionID}` })),
  "Session.BusyError": (error: SessionV2.BusyError) =>
    Effect.fail(new ConflictError({ message: `Session is busy: ${error.sessionID}`, resource: error.sessionID })),
  // A model or history failure while compacting or generating reaches the caller in its own words.
  "Session.RunFailedError": (error: SessionV2.RunFailedError) => Effect.fail(new UnknownError({ message: error.message })),
}
const missingOrBusy = {
  "Session.NotFoundError": operationErrors["Session.NotFoundError"],
  "Session.BusyError": operationErrors["Session.BusyError"],
}
```

Linhas 85–91; trecho SHA-256 `d76cdf093e7ac133411fd4023c28beca26783d4476a19102d60779c0bb71f607`:

```
      ),
      Effect.catchTags({
        "SessionSubagentModels.StorageError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy storage is unavailable" }),
        "SessionSubagentModels.InvalidChainError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy ancestry is invalid" }),
        "SessionSubagentModels.ModelDeniedError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy could not be evaluated" }),
      }),
    )
```

Linhas 107–164; trecho SHA-256 `e701424f4b6d0e60f0d3b53fe2b499acb005a4623217612463ba2ac3fc53273b`:

```
        "session.list",
        Effect.fn(function* (ctx) {
          const query =
            ctx.query.cursor !== undefined
              ? yield* SessionsCursor.parse(ctx.query.cursor).pipe(
                  Effect.mapError(() => new InvalidCursorError({ message: "Invalid cursor" })),
                )
              : ctx.query
          const sessions = yield* session.list({
            ...query,
            workspaceID: query.workspace,
            limit: ctx.query.limit ?? DefaultSessionsLimit,
          })
          const first = sessions[0]
          const last = sessions.at(-1)
          return {
            data: sessions,
            cursor: {
              previous: first
                ? SessionsCursor.make({
                    ...query,
                    anchor: {
                      id: first.id,
                      time: DateTime.toEpochMillis(first.time.created),
                      direction: "previous",
                    },
                  })
                : undefined,
              next: last
                ? SessionsCursor.make({
                    ...query,
                    anchor: {
                      id: last.id,
                      time: DateTime.toEpochMillis(last.time.created),
                      direction: "next",
                    },
                  })
                : undefined,
            },
          }
        }),
      )
      .handle(
        "session.create",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session
              .create({
                id: ctx.payload.id,
                agent: ctx.payload.agent,
                model: ctx.payload.model,
                location: ctx.payload.location ?? { directory: AbsolutePath.make(process.cwd()) },
              })
              .pipe(typedNotFound),
          }
        }),
      )
      .handle(
```

Linhas 264–303; trecho SHA-256 `93dfb563f9b3ff7dc9aef42b32bffb218dcba8f91affc6252f7770b2ea39af3c`:

```
            Effect.flatMap(SlashCommand.resolve),
            Effect.provideService(AppProcess.Service, appProcess),
            Effect.provideService(FSUtil.Service, fs),
            Effect.catchTags({
              "SlashCommand.NotFoundError": (error) =>
                Effect.fail(new InvalidRequestError({ message: `Command not found: ${error.name}`, field: "command" })),
              "Mcp.NotFoundError": (error) =>
                Effect.fail(new UnknownError({ message: `MCP server is not connected: ${error.name}` })),
              "Mcp.RequestError": (error) => Effect.fail(new UnknownError({ message: error.message })),
            }),
          )
          // A command's own agent and model are the Session's from this prompt on, as the app's own choice would be.
          if (resolved.agent)
            yield* session.switchAgent({ sessionID: ctx.params.sessionID, agent: resolved.agent }).pipe(typedNotFound)
          if (resolved.model)
            yield* session.switchModel({ sessionID: ctx.params.sessionID, model: resolved.model }).pipe(typedNotFound)
          return {
            data: yield* admit({
              sessionID: ctx.params.sessionID,
              id: ctx.payload.id,
              prompt: {
                text: resolved.prompt.text,
                files: [...resolved.prompt.files, ...(ctx.payload.files ?? [])],
                agents: [...resolved.prompt.agents, ...(ctx.payload.agents ?? [])],
              },
              delivery: ctx.payload.delivery,
              resume: ctx.payload.resume,
            }),
          }
        }),
      )
      .handle(
        "session.compact",
        Effect.fn(function* (ctx) {
          const compacted = yield* session
            .compact({ sessionID: ctx.params.sessionID })
            .pipe(Effect.catchTags(operationErrors))
          return { data: { compacted } }
        }),
      )
```

Linhas 587–612; trecho SHA-256 `ceac9319054b03cf92ae28e299944b059650eee8e6abec38c8021d70399ff779`:

```
        "session.context",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session.context(ctx.params.sessionID).pipe(
              Effect.catchTag("Session.NotFoundError", (error) =>
                Effect.fail(
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
                ),
              ),
              Effect.catchTag("Session.MessageDecodeError", (error) => {
                const ref = `err_${crypto.randomUUID().slice(0, 8)}`
                return Effect.logError("failed to decode session message").pipe(
                  Effect.annotateLogs({ ref, sessionID: error.sessionID, messageID: error.messageID }),
                  Effect.andThen(
                    Effect.fail(
                      new UnknownError({ message: "Unexpected server error. Check server logs for details.", ref }),
                    ),
                  ),
                )
              }),
            ),
          }
        }),
```

Linhas 686–698; trecho SHA-256 `243834a2eeb6d79c846784bc8fef6bc01cef9210122c8dc83df362c29e8cc8e5`:

```
        "session.message",
        Effect.fn(function* (ctx) {
          const message = yield* session.message(ctx.params)
          if (message) return { data: message }
          return yield* new MessageNotFoundError({
            sessionID: ctx.params.sessionID,
            messageID: ctx.params.messageID,
            message: `Message not found: ${ctx.params.messageID}`,
          })
        }),
      )
  }),
)
```


## S17 — `packages/protocol/src/groups/message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `60705d39526291ae4e58471447eedbe1af994e32`; arquivo SHA-256 `c62fa47f9fc136ecf8692c81af59704a29e3f9635ab679d1a441afc092cbb660`; 2213 bytes.

Finalidade: Message limit 1–200 and page envelope.

Linhas 7–36; trecho SHA-256 `90bf844ba976e925498fc0277dae157371451668c60bee37a6a2d00c7c98f47b`:

```
export const SessionMessagesQuery = Schema.Struct({
  limit: Schema.optional(
    Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(200)),
  ).annotate({
    description: "Maximum number of messages to return. When omitted, the endpoint returns its default page size.",
  }),
  order: Schema.optional(Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")])).annotate({
    description: "Message order for the first page. Use desc for newest first or asc for oldest first.",
  }),
  cursor: Schema.optional(
    Schema.String.annotate({
      description:
        "Opaque pagination cursor returned as cursor.previous or cursor.next in the previous response. Do not combine with order.",
    }),
  ),
}).annotate({ identifier: "SessionMessagesQuery" })

export const MessageGroup = HttpApiGroup.make("server.message")
  .add(
    HttpApiEndpoint.get("session.messages", "/api/session/:sessionID/message", {
      params: { sessionID: Session.ID },
      query: SessionMessagesQuery,
      success: Schema.Struct({
        data: Schema.Array(SessionMessage.Message),
        cursor: Schema.Struct({
          previous: Schema.String.pipe(Schema.optional),
          next: Schema.String.pipe(Schema.optional),
        }),
      }).annotate({ identifier: "SessionMessagesResponse" }),
      error: [InvalidCursorError, SessionNotFoundError, UnknownError],
```


## S18 — `packages/server/src/handlers/message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `76f2a2583525f1a8e45be6f0121c4870d0ea9f7a`; arquivo SHA-256 `d94cf0944d4fe32aa66cda511d0d49da8ca2aa0135a19791433e334e0415e5cc`; 3210 bytes.

Finalidade: Default page size and opaque cursor codec.

Linhas 8–23; trecho SHA-256 `defe10fa58b401135c9f774e95baed9aef966107ec51241a1d4bb35c4cedd145`:

```
const DefaultMessagesLimit = 50

const Cursor = Schema.Struct({
  id: SessionMessage.ID,
  order: Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")]),
  direction: Schema.Union([Schema.Literal("previous"), Schema.Literal("next")]),
})

const decodeCursor = Schema.decodeUnknownSync(Cursor)

const cursor = {
  encode(message: SessionMessage.Message, order: "asc" | "desc", direction: "previous" | "next") {
    return Buffer.from(JSON.stringify({ id: message.id, order, direction })).toString("base64url")
  },
  decode(input: string) {
    return decodeCursor(JSON.parse(Buffer.from(input, "base64url").toString("utf8")))
```


## S19 — `packages/protocol/src/errors.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `040460309fbd868f937b7511ddd378942c0c2ac9`; arquivo SHA-256 `a720613efbc90a62f91101e65199fab2570686ee5711cec235ec4fec2b1879d3`; 3003 bytes.

Finalidade: Remaining 404 and invalid-cursor schemas.

Linhas 46–54; trecho SHA-256 `80b6d3746c95cb8e767a9988f49dadfe0a2477bb1abdd201a796e118517831e6`:

```
export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "ProviderNotFoundError",
  {
    providerID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

```

Linhas 65–97; trecho SHA-256 `b944a2dfe1c830127e7cf45e847ee99364ad1850048c24185158473421fb25ed`:

```
  "MessageNotFoundError",
  {
    sessionID: Schema.String,
    messageID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "InvalidCursorError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class PermissionNotFoundError extends Schema.TaggedErrorClass<PermissionNotFoundError>()(
  "PermissionNotFoundError",
  {
    requestID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class QuestionNotFoundError extends Schema.TaggedErrorClass<QuestionNotFoundError>()(
  "QuestionNotFoundError",
  {
    requestID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

```

Linhas 105–120; trecho SHA-256 `0d81c948090a4699a027cd8cea7c82a9f4f4acf177070e5a9d46c8322c0e7d3f`:

```
  "PtyNotFoundError",
  {
    ptyID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class McpServerNotFoundError extends Schema.TaggedErrorClass<McpServerNotFoundError>()(
  "McpServerNotFoundError",
  {
    server: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}
```


## S20 — `packages/server/src/middleware/capability-authorization.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`; arquivo SHA-256 `437afc6342984a2cabf7cd72c01ea77c4422fb61761d1a24b2a8bf867f798c88`; 4035 bytes.

Finalidade: Cause preservation and canonical Basic decoding.

Linhas 49–60; trecho SHA-256 `530ac19c5666271e33c6450c12c2630aad1799be007f1568a74bf22e2dd453d5`:

```
        // Keep every defect, interrupt and failure annotation, including mixed lifecycle causes.
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.fromReasons(
              cause.reasons.flatMap((reason) => {
                if (reason._tag !== "Fail") return [reason]
                return Cause.fail(
                  reason.error instanceof Capability.Failure ? capabilityError(reason.error) : reason.error,
                ).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
              }),
            ),
          ),
```

Linhas 68–78; trecho SHA-256 `98d726712f6f0f0b2a76517214c7ee840cafdb1122fd1cc3fc12140da8830f85`:

```
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})(?![\s\S])/i.exec(header)
  if (!match) return undefined
  const decoded = Encoding.decodeBase64String(match[1])
  if (Result.isFailure(decoded) || Encoding.encodeBase64(decoded.success) !== match[1]) return undefined
  const separator = decoded.success.indexOf(":")
  if (separator === -1) return undefined
  return {
    username: decoded.success.slice(0, separator),
    password: Redacted.make(decoded.success.slice(separator + 1)),
  }
}
```


## S21 — `packages/server/src/location.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `1881a570a893ec8c55aa436598db44ad19edde04`; arquivo SHA-256 `57032232ea6a37a046399f147479eef2ccdd21376a59c62de3fcfbfaae78953e`; 3966 bytes.

Finalidade: Cached location caveat.

Linhas 43–48; trecho SHA-256 `07d32bb610eab174f5e2e21948ba4b01541bed65f7161dcfdad3734a39f70759`:

```
/**
 * The Location's services, failing with a declared 400 when they cannot boot. A failed boot (most often a project whose
 * directory was removed) otherwise surfaces as an error no route declares, which the HttpApi answers as an empty 500 on
 * every route of that Location. Only booting is mapped: a Location already booted keeps serving from the map's cache,
 * so database-backed routes such as removing a session stay usable after its directory goes away.
 */
```


## S22 — `packages/server/src/principal.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f854d83e8c4b760f9c56282a59af87e73a7fbf51`; arquivo SHA-256 `e0932d6e27e750a1664b3a9c20818610126c810d8b41ad8e3900a1c43dd3f260`; 829 bytes.

Finalidade: OS account principal, not one identity per Basic username.

Linhas 1–20; trecho SHA-256 `e0932d6e27e750a1664b3a9c20818610126c810d8b41ad8e3900a1c43dd3f260`:

```
export * as Principal from "./principal"

import os from "os"
import { Result } from "effect"
import type { HttpServerRequest } from "effect/unstable/http"

/**
 * Who a request acts for, recorded on owner actions (publish, hook install and lifecycle; run release later). The
 * server has no per-person accounts: its Basic credential is one shared service identity (the desktop sidecar always
 * signs in with the same fixed username), so that name says nothing about who acted. The person is the OS account
 * running the server, which is the signed-in user of the machine.
 */
export function of(_request: HttpServerRequest.HttpServerRequest) {
  return account()
}

export function account() {
  const user = Result.try(() => os.userInfo().username)
  return Result.isSuccess(user) && user.success ? user.success : "local"
}
```


## S23 — `packages/server/src/handlers/model.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `51ecfd876092dd1e2752f4ead4d40d99d34d6010`; arquivo SHA-256 `5bb4dd3dceaf99373c595b30753ea69322999bcd38bc55db36ce165325f5ee9b`; 1731 bytes.

Finalidade: Catalog availability, deduplication and preferred/default model.

Linhas 14–43; trecho SHA-256 `ce03015b7eb030f157757fa76509f64da1c7e05b63fea1b9c6b3c164e89b7c80`:

```
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(
            Effect.gen(function* () {
              const available = yield* catalog.model.available()
              const extra = new Set((yield* additional(catalog)).map((provider) => provider.id))
              if (extra.size === 0) return available
              return [
                ...available,
                ...(yield* catalog.model.all()).filter(
                  (model) =>
                    extra.has(model.providerID) &&
                    model.enabled &&
                    !available.some((item) => item.providerID === model.providerID && item.id === model.id),
                ),
              ]
            }),
          )
        }),
      )
      .handle(
        "model.default",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const preferred = yield* CatalogAvailability.DefaultModel
          return yield* response(
            Effect.gen(function* () {
              return (yield* preferred(catalog)) ?? (yield* catalog.model.default()) ?? null
            }),
          )
```


## S24 — `packages/server/src/handlers/provider.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `407a5c5ce66f41da27a4f793cbe8ff3c9c9bbafd`; arquivo SHA-256 `9d0167b85aaebb4db6c802ea918c1ff38f47978c6877aadd788863201593714d`; 2475 bytes.

Finalidade: Provider list/sign-in adapter declarations.

Linhas 13–56; trecho SHA-256 `aefe20cd3e11cbd6369975a394ba57e7f2fde1d89855cbcdf575547f3ac27573`:

```
      .handle(
        "provider.list",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(Effect.gen(function* () {
            const available = yield* catalog.provider.available()
            const extra = yield* additional(catalog)
            return [...available, ...extra.filter((provider) => !available.some((item) => item.id === provider.id))]
          }))
        }),
      )
      .handle(
        "provider.claudeCode.account",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.account
        }),
      )
      .handle(
        "provider.claudeCode.login",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.startLogin.pipe(
            Effect.catchTag("ClaudeCodeAccount.LoginError", (error) =>
              Effect.fail(new ServiceUnavailableError({ message: error.message, service: "claude-code" })),
            ),
          )
        }),
      )
      .handle(
        "provider.claudeCode.loginCode",
        Effect.fn(function* (ctx) {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.sendCode(ctx.payload.code)
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const catalog = yield* Catalog.Service
          const provider = yield* catalog.provider.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
```


## S25 — `packages/client/src/generated/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; arquivo SHA-256 `f032a64d8223ac1b584ba17cf39e7f8da9e0be05f88682425692304a3a8ba20b`; 146714 bytes.

Finalidade: Header precedence and binary files.read method identity.

Linhas 539–556; trecho SHA-256 `4cb197d044088598ffa2be90e4ca124f89aea7033448127a48c5365d902d68fb`:

```
}

export interface RequestOptions {
  readonly signal?: AbortSignal
  readonly headers?: HeadersInit
}

export function make(options: ClientOptions) {
  const fetch = options.fetch ?? globalThis.fetch

  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    const url = new URL(descriptor.path, options.baseUrl)
    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {
      if (value !== undefined && value !== null) headers.set(key, String(value))
    }
    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)
```

Linhas 1548–1561; trecho SHA-256 `f2c64de57ae0b35880ae3806fbc0cfa2909b64f5cc026c0e72fa56a102885185`:

```
          requestOptions,
        ),
    },
    files: {
      read: (input: FilesReadInput, requestOptions?: RequestOptions) =>
        request<FilesReadOutput>(
          {
            method: "GET",
            path: `/api/fs/read`,
            query: { location: input["location"], path: input["path"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
            binary: true,
```


## S26 — `packages/client/src/generated-effect/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `97d52b0a17eece1a7ddf6a52904a88d047e2b51f`; arquivo SHA-256 `24114bfba58645693c8db03ffca4f04b3c6ecbb0d6a9d18f82de15addd1556f6`; 171208 bytes.

Finalidade: Actual generated adapter uses original ClientApi and validates headers.

Linhas 3410–3464; trecho SHA-256 `1124fa5bf5d87305d45327ae0e1c09f7980ba8f6db11b9cba55e17c6b90971a3`:

```
  meeting: adaptGroup48(raw["server.meeting"]),
  operator: adaptGroup49(raw["server.capability.operator"]),
  connections: adaptGroup50(raw["server.capability.connections"]),
  artifacts: adaptGroup51(raw["server.capability.artifacts"]),
  capabilitySchedules: adaptGroup52(raw["server.capability.schedules"]),
})

export const make = (options?: {
  readonly baseUrl?: URL | string
  readonly headers?: Readonly<Record<string, string>>
}) => {
  if (options?.headers === undefined) return HttpApiClient.make(ClientApi, options).pipe(Effect.map(adaptClient))
  // Snapshot and validate host configuration now, before this Effect can be executed or reused.
  const headers = snapshotHeaders(options.headers)
  if (Object.keys(headers).length === 0) return HttpApiClient.make(ClientApi, options).pipe(Effect.map(adaptClient))
  // Fetch must supply the multipart boundary; only explicit request headers may override it.
  const formHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-type"))
  return HttpApiClient.make(ClientApi, {
    baseUrl: options.baseUrl,
    transformClient: (client) =>
      HttpClient.mapRequest(client, (request) =>
        HttpClientRequest.setHeaders(request, {
          ...(request.body._tag === "FormData" ? formHeaders : headers),
          ...request.headers,
        }),
      ),
  }).pipe(Effect.map(adaptClient))
}

function snapshotHeaders(input: Readonly<Record<string, string>>) {
  if (
    typeof input !== "object" ||
    input === null ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new TypeError("Invalid client headers")
  }
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input)).flatMap(([name, descriptor]) => {
    if (
      !/^[!#$%&'*+.^_|~0-9A-Za-z\x60-]+$/.test(name) ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      /[\r\n]/.test(descriptor.value)
    ) {
      throw new TypeError("Invalid client headers")
    }
    return descriptor.enumerable ? [[name, descriptor.value] as const] : []
  })
  try {
    return Object.freeze(Object.fromEntries(new Headers(Object.fromEntries(entries))))
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError("Invalid client headers")
    throw error
  }
}
```


## S27 — `packages/client/src/wire.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `8ff88190163e1254d4c92ea5c70ef0f9c8fc8d04`; arquivo SHA-256 `0f4373c1e09abbaa92b6769a80c2a9e9de8a1193ed99b9c9e404263c61388fdf`; 190 bytes.

Finalidade: Encoded session-event projection.

Linhas 1–4; trecho SHA-256 `0f4373c1e09abbaa92b6769a80c2a9e9de8a1193ed99b9c9e404263c61388fdf`:

```
import type { SessionEvent } from "@orchestra/schema/session-event"
import type { Schema } from "effect"

export type SessionEventEncoded = Schema.Codec.Encoded<typeof SessionEvent.Durable>
```


## S28 — `packages/client/src/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0d8607699a560ae9fb671f8bc37bc9d1b473424e`; arquivo SHA-256 `3403fb575546d15a203a063ae9e8135dac6593276bf056e63a918129fb9bd47d`; 9473 bytes.

Finalidade: Streaming successful response ownership and stream support probe.

Linhas 15–62; trecho SHA-256 `bb5c86f7916cf6976eaa68b0660d6c44ce28f0d76b71d8a2f819b1815ce8b9a2`:

```
export function makeActionsTransfer(options: ClientOptions) {
  const request = async (prepared: ReturnType<typeof prepareTransfer>): Promise<Response> => {
    const fetch = prepared.fetch
    const response = await Promise.resolve()
      .then(() => fetch(prepared.url, prepared.init))
      .catch((cause: unknown) => {
        prepared.controller.abort()
        throw new ActionsTransferError("Transport", { cause })
      })
    if (!response.ok) return actionsTransferResponseError(response).finally(() => prepared.controller.abort())
    return response
  }

  return {
    download: async (
      input: { binding: Actions.BindingRef; target: Actions.TransferInput; location?: Location },
      requestOptions?: RequestOptions,
    ): Promise<Response> => {
      try {
        requireRecord(input, ["binding", "target", "location"], "download")
        const captured = {
          ...input,
          binding: input.binding && { ...input.binding },
          target: input.target && { ...input.target },
          location: input.location && { ...input.location },
        }
        requireTarget(captured.target)
        return request(
          prepareTransfer(
            options,
            captured.binding,
            captured.location,
            {
              kind: captured.target.kind,
              id: captured.target.id,
              runID: captured.target.runID,
              attempt: captured.target.attempt,
              path: captured.target.path,
            },
            undefined,
            requestOptions,
          ),
        )
      } catch (cause) {
        if (cause instanceof ActionsTransferError) throw cause
        throw new ActionsTransferError("Transport", { cause })
      }
    },
```

Linhas 107–121; trecho SHA-256 `e55337760519469f82cf8e51cd2bf70f4b1716c9ad749508d054f34f6d8bf02f`:

```
          if (captured.body.locked) invalid("Upload stream is locked")
          let duplexRead = false
          const probe: StreamingRequestInit = {
            method: "POST",
            body: captured.body,
            get duplex(): "half" {
              duplexRead = true
              return "half"
            },
          }
          const supported = await Promise.resolve()
            .then(() => new Request(prepared.url, probe))
            .catch((cause: unknown) => {
              throw new ActionsTransferError("Transport", { code: "UnsupportedStreaming", cause })
            })
```


## S29 — `packages/client/src/actions-transfer-error.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `314b2dc47f3e63182dec1324c1c31f3839dc12d9`; arquivo SHA-256 `bef765b9b85ec33b12317a84d6266d5713793768d3f4a63deba06d47c2a66477`; 5266 bytes.

Finalidade: Outcome retained and retry-after parser.

Linhas 4–34; trecho SHA-256 `3b785b5c210bcb68f26be823ae087084c87a5db9e3c025b67da3f0b3836ef9f3`:

```
export class ActionsTransferError extends ClientError {
  readonly code?: "UnsupportedStreaming"
  readonly status?: number
  readonly data?: Actions.ErrorData
  readonly kind?: Actions.ErrorKind
  // The frozen ErrorData has no outcome schema yet. Preserve the wire value without guessing its shape.
  readonly outcome?: unknown
  readonly retryAfter?: number
  readonly truncated: boolean

  constructor(
    reason: ClientErrorReason,
    details: {
      code?: "UnsupportedStreaming"
      cause?: unknown
      status?: number
      data?: Actions.ErrorData & { outcome?: unknown }
      retryAfter?: number
      truncated?: boolean
    } = {},
  ) {
    super(reason, { cause: details.cause })
    this.code = details.code
    this.status = details.status
    this.data = details.data
    this.kind = details.data?.kind
    this.outcome = details.data?.outcome
    this.retryAfter = details.data?.retryAfter ?? details.retryAfter
    this.truncated = details.truncated ?? false
    this.message = details.data?.message ?? details.code ?? reason
  }
```

Linhas 130–136; trecho SHA-256 `ad3bd0dffb2e62ff9b5468e43df46bfd301dd08c5eafe79a7ab9450ae4adb007`:

```

function retryAfter(value: string | null) {
  if (value === null) return undefined
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number.isFinite(Number(value)) ? Number(value) : undefined
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1_000) : undefined
}
```


## S30 — `packages/server/src/handlers/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `50b7434c5595f4868cd3bd2429ec39b6441cba1c`; arquivo SHA-256 `c385e884606f956b76aea7b2e4c9f6d892ab87976342dafce06428c84449bba3`; 2203 bytes.

Finalidade: Complete inspected group contains info/read handlers, not upload.

Linhas 1–35; trecho SHA-256 `34022a182e3721bb05ab6063f3b0c5c22e891fc3f0e37d2371b2b05319f87e54`:

```
import { Actions } from "@orchestra/core/actions"
import { TransferQuery } from "@orchestra/protocol/groups/actions-transfer"
import { BindingID } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { apiError, bindingRef, result } from "./actions-common"

export const ActionsTransferHandler = HttpApiBuilder.group(Api, "server.actionsTransfer", (handlers) => Effect.succeed(
  handlers
    .handle("actions.transfer.info", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.transferInfo(bindingRef(ctx), {
        kind: ctx.query.kind, id: ctx.query.id, runID: ctx.query.runID, attempt: ctx.query.attempt, path: ctx.query.path,
      })
    })))
    .handleRaw("actions.transfer.read", (ctx) => Effect.gen(function* () {
      const url = new URL(ctx.request.url, "http://localhost")
      const query = yield* Schema.decodeUnknownEffect(TransferQuery)(Object.fromEntries(url.searchParams)).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer query" }))),
      )
      const id = yield* Schema.decodeUnknownEffect(BindingID)(decodeURIComponent(url.pathname.split("/").at(-1) ?? "")).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer binding" }))),
      )
      const actions = yield* Actions.Service
      const target = { kind: query.kind, id: query.id, runID: query.runID, attempt: query.attempt, path: query.path }
      const binding = { id, revision: query.revision }
      const info = yield* actions.transferInfo(binding, target).pipe(Effect.mapError(apiError))
      return HttpServerResponse.stream(actions.transfer(binding, target), {
        contentType: info.contentType,
        headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
          ...(info.size === undefined ? {} : { "content-length": String(info.size) }) },
      })
    })),
```


## S31 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; arquivo SHA-256 `8a0e0c82edbddb08097d285ce523a80f70e9d98b764073941fecdefd0390b069`; 59915 bytes.

Finalidade: Input mode, collision rejection, recursive-type refusal and manifest ownership read.

Linhas 160–171; trecho SHA-256 `92bb307bd954c887721a166bedbd4af6cddec785ca715c02c2841ca1f46b692e`:

```
          inputMode: inputs.length === 0 ? "none" : inputs.every((field) => field.optional) ? "optional" : "required",
          success: isStreamSchema(success.schema)
            ? "stream"
            : HttpApiSchema.isNoContent(success.schema.ast)
              ? "void"
              : "value",
          errors: [
            ...new Set([
              ...errorSchemas.flatMap((item) => {
                const identifier = SchemaAST.resolveIdentifier(item.schema.ast)
                return identifier === undefined ? [] : [identifier]
              }),
```

Linhas 178–211; trecho SHA-256 `5a4b8e5852a7af2699102cb1e5df7165e556fdadad06a66f27c61ee3bb2546be`:

```
  })

  const modules = new Set(["client", "client-error", "index", "request", "errors", "types"])
  const groups = Array.from(
    Map.groupBy(endpoints, (endpoint) => endpoint.group),
    ([identifier, endpoints], index) => {
      if (new Set(endpoints.map((endpoint) => endpoint.sourceGroup)).size > 1) {
        throw new GenerationError({ reason: `Client group name collision: ${identifier}` })
      }
      const base = /^[A-Za-z0-9_-]+$/.test(identifier) ? identifier : `group-${index}`
      const module = uniqueModule(base, index, modules)
      modules.add(module.toLowerCase())
      modules.add(`${module}-types`.toLowerCase())
      return { identifier, sourceIdentifier: endpoints[0].sourceGroup, module, endpoints }
    },
  )
  const publicNames = new Set<string>()
  for (const group of groups) {
    const endpointNames = new Set<string>()
    for (const endpoint of group.endpoints) {
      if (endpointNames.has(endpoint.operation.name)) {
        throw new GenerationError({
          reason: `Client endpoint name collision: ${group.identifier}.${endpoint.operation.name}`,
        })
      }
      endpointNames.add(endpoint.operation.name)
    }
    const names = group.endpoints[0]?.topLevel ? group.endpoints.map((item) => item.operation.name) : [group.identifier]
    for (const name of names) {
      if (publicNames.has(name)) throw new GenerationError({ reason: `Client name collision: ${name}` })
      publicNames.add(name)
    }
  }
  return {
```

Linhas 531–551; trecho SHA-256 `80609ad8cc1430abe53c3397911671fd58258d40e0ef6e0735c11785489d3204`:

```
function structuralType(schema: Schema.Top) {
  const document = SchemaRepresentation.toCodeDocument(SchemaRepresentation.fromASTs([schema.ast]))
  if (
    document.artifacts.some(
      (artifact) =>
        artifact._tag !== "Import" || artifact.importDeclaration !== 'import type * as Brand from "effect/Brand"',
    ) ||
    Object.keys(document.references.recursives).length > 0
  ) {
    throw new GenerationError({ reason: "Referenced Promise types are not implemented" })
  }
  const references = new Map(
    document.references.nonRecursives.map((reference) => [reference.$ref, reference.code.Type]),
  )
  const expand = (type: string, seen = new Set<string>()): string => {
    for (const [reference, value] of references) {
      const pattern = `(?<![A-Za-z0-9_$.'"])${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$.'"])`
      if (!new RegExp(pattern).test(type)) continue
      if (seen.has(reference)) {
        throw new GenerationError({ reason: `Recursive Promise types are not implemented: ${reference}` })
      }
```

Linhas 707–713; trecho SHA-256 `7ba4dcceb0bb7f4c25b85d29216a848ce631654747de64ba588a5f61a88b60ae`:

```
    const manifest = join(directory, manifestName)
    const previous = (yield* fs.exists(manifest))
      ? yield* fs.readFileString(manifest).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Manifest)),
          Effect.mapError(() => new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })),
        )
      : []
```


## S32 — `packages/client/src/generated/.httpapi-codegen.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `190f92c2c10e6b0126e10ef23b217ef33688dd68`; arquivo SHA-256 `8c3b0fc3a95aed8ba5a2efe2033addb2e753444a15bc4b308f5deb618096b243`; 1086 bytes.

Finalidade: Exact Promise generated output membership, 40 names.

Linhas 1–42; trecho SHA-256 `8c3b0fc3a95aed8ba5a2efe2033addb2e753444a15bc4b308f5deb618096b243`:

```
[
  "actionsBindings-types.ts",
  "actionsBindings.ts",
  "actionsJobs-types-part-1.ts",
  "actionsJobs-types-part-2.ts",
  "actionsJobs-types.ts",
  "actionsJobs.ts",
  "actionsOperations-types-part-1.ts",
  "actionsOperations-types-part-2.ts",
  "actionsOperations-types.ts",
  "actionsOperations.ts",
  "actionsPipelines-types.ts",
  "actionsPipelines.ts",
  "actionsResources-types-part-1.ts",
  "actionsResources-types-part-2.ts",
  "actionsResources-types.ts",
  "actionsResources.ts",
  "actionsRuns-types-part-1.ts",
  "actionsRuns-types-part-2.ts",
  "actionsRuns-types-part-3.ts",
  "actionsRuns-types-part-4.ts",
  "actionsRuns-types.ts",
  "actionsRuns.ts",
  "actionsSource-types.ts",
  "actionsSource.ts",
  "actionsTransfers-types.ts",
  "actionsTransfers.ts",
  "actionsWorkflows-types-part-1.ts",
  "actionsWorkflows-types-part-2.ts",
  "actionsWorkflows-types.ts",
  "actionsWorkflows.ts",
  "client-error.ts",
  "client.ts",
  "errors.ts",
  "index.ts",
  "request.ts",
  "research-types.ts",
  "research.ts",
  "schedules-types.ts",
  "schedules.ts",
  "types.ts"
]
```


## S33 — `packages/client/src/generated-effect/.httpapi-codegen.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4caf4225fe4d24c569bcdc5b4c4310580cea4bbb`; arquivo SHA-256 `4e839ccacb669ba2392da1a5173c08c6636c0b64f86f8faa79b0051969bd7285`; 300 bytes.

Finalidade: Exact Effect generated output membership, 14 names.

Linhas 1–16; trecho SHA-256 `4e839ccacb669ba2392da1a5173c08c6636c0b64f86f8faa79b0051969bd7285`:

```
[
  "actionsBindings.ts",
  "actionsJobs.ts",
  "actionsOperations.ts",
  "actionsPipelines.ts",
  "actionsResources.ts",
  "actionsRuns.ts",
  "actionsSource.ts",
  "actionsTransfers.ts",
  "actionsWorkflows.ts",
  "client-error.ts",
  "client.ts",
  "index.ts",
  "research.ts",
  "schedules.ts"
]
```


## S34 — `packages/client/test/promise.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `a7afeff494a0f19c84eb53b90c716112b8a956f1`; arquivo SHA-256 `6327e27a858011cb7d10c752c589ff49fa6e5a3ee8e4a14ba7569fdc85b1b21f`; 14627 bytes.

Finalidade: Unexecuted intended wire timestamp assertion.

Linhas 101–115; trecho SHA-256 `824dfba3e2ecce2e5e6330b8d9c04d0a38f21edc533d401b142523da3c8c1b47`:

```
test("sessions.get returns the wire projection", async () => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input) => {
      expect(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).toBe(
        "http://localhost:3000/api/session/ses_test",
      )
      return Response.json(session)
    },
  })

  const result = await client.sessions.get({ sessionID: "ses_test" })

  expect(result.time.created).toBe(1_717_171_717_000)
})
```


## S35 — `packages/client/test/effect.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `84ec5ea971c9599163b7a8ac45576337bdf380a8`; arquivo SHA-256 `5c92d1972ecc58f1b6c918341af29a0f6240ffa61b14f1f6b9dd74c9a2c943ac`; 9925 bytes.

Finalidade: Unexecuted intended decoded timestamp assertion.

Linhas 6–16; trecho SHA-256 `2d471da6e7791e74e4e7128d8bb3d9132bdf53aa8d689198b5c604a7218feb50`:

```
test("sessions.get returns the decoded Effect projection", async () => {
  const httpClient = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(session))),
  )
  const result = await Effect.gen(function* () {
    const client = yield* Orchestra.make({ baseUrl: "http://localhost:3000" })
    return yield* client.sessions.get({ sessionID: Session.ID.make("ses_test") })
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)

  expect(DateTime.toEpochMillis(result.time.created)).toBe(1_717_171_717_000)
})
```


## S36 — `packages/server/test/event-stream.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `fbff2eb0f6d4e4affd069c662da7c61c4ead7a2a`; arquivo SHA-256 `fb7b290eab795201302829f1e2b78a7a836b0eec42af50a03c96e3dd68681be6`; 3896 bytes.

Finalidade: Test stand-in scope and unexecuted burst/encoding assertions.

Linhas 8–16; trecho SHA-256 `2e01900552409e3105b8e8b3d4098a5bcb0ac97e543155403eb90cc43ff61ac4`:

```
// Only the event bus is a stand-in: it hands the stream's listener back so the test can publish while nothing reads.
function bus() {
  const listeners: Subscriber[] = []
  const service = {
    listen: (listener: Subscriber) =>
      Effect.sync(() => {
        listeners.push(listener)
        return Effect.void
      }),
```

Linhas 51–59; trecho SHA-256 `237d742db404e12ce0c8fabc9d28e7842a55faea8514d334025bb0dcfe238db8`:

```
          // The first pull installs the subscriber and delivers the connected event.
          let received = frames(yield* pull)
          // A slow renderer reads nothing while a model streams: the queue has to hold the whole burst.
          yield* events.publish(1000)
          while (received < 1001) received += frames(yield* pull)

          expect(received).toBe(1001)
        }),
      ),
```

Linhas 87–94; trecho SHA-256 `7691d0cca5fbd0fc06708463da43faa3c8f7883d986d09d3ceebfa5e7d055b10`:

```
          const received = yield* Effect.forEach(pulls, (pull) => frameOf(pull, id))

          expect(received[0]).toContain(id)
          expect(received[1]).toBe(received[0])
          expect(received[2]).toBe(received[0])
          expect(encoded.get(id)).toBe(1)
        }),
      ),
```


## S37 — `packages/sdk-next/test/embedded.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6fe30ce4ee65de629cbb63dbba7de447a0a2464c`; arquivo SHA-256 `a32e565a4bdaa2154208128e035c805577684b7d233f9f58b2ffe3c2f93932da`; 10581 bytes.

Finalidade: Unexecuted admission/wake/durable/missing-session/isolation assertions.

Linhas 59–75; trecho SHA-256 `2d9e6b1f442182a32ff7729350b6648f117259f022c3b1e7aac00999218af066`:

```
      const admitted = yield* orchestra.sessions.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Do not run" }),
        resume: false,
      })
      const context = yield* orchestra.sessions.context({ sessionID })
      const wake = yield* orchestra.sessions.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Promote this input" }),
      })
      const prompted = yield* orchestra.sessions.events({ sessionID }).pipe(
        Stream.filter((event) => event.type === "session.next.prompted" && event.data.messageID === wake.id),
        Stream.runHead,
        Effect.timeout("10 seconds"),
        Effect.map(Option.getOrThrow),
      )
      const wakeContext = yield* orchestra.sessions.context({ sessionID })
```

Linhas 108–123; trecho SHA-256 `f98942bc14eb5edb8b46c3a5786eb0350d70ce72bcd9d896deb2c5b1502aaa4b`:

```
      expect(admitted.sessionID).toBe(sessionID)
      expect(prompted.type).toBe("session.next.prompted")
      expect(wakeContext).toContainEqual(expect.objectContaining({ id: wake.id, type: "user" }))
      expect(context.some((message) => message.type === "model-switched")).toBe(true)
      expect(Array.from(events)).toMatchObject([
        { type: "session.next.created", durable: { seq: 0 } },
        { type: "session.next.model.switched", durable: { seq: 1 } },
      ])
      expect(message).toEqual(modelMessage)
      expect(missing.map((error) => error._tag)).toEqual([
        "SessionNotFoundError",
        "SessionNotFoundError",
        "SessionNotFoundError",
      ])
      expect(missingMessage._tag).toBe("MessageNotFoundError")
    })
```

Linhas 166–166; trecho SHA-256 `3ad4ec71e0e93efc14f38645bab8350a691d438d8541c35577a63a8277cf13af`:

```
test("independent embedded hosts do not share live notifications", async () => {
```

Linhas 187–199; trecho SHA-256 `d5d3a712a94cab7fc622f0b085ada04436b463cb2caa77b9126b534e7b0c282c`:

```

      yield* first.events.subscribe().pipe(observe(firstReady, firstEvent), Effect.forkScoped)
      yield* second.events.subscribe().pipe(observe(secondReady, secondEvent), Effect.forkScoped)
      yield* Effect.all([firstReady.await, secondReady.await], { discard: true })
      yield* first.sessions.create({
        id: sessionID,
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      yield* first.sessions.switchAgent({ sessionID, agent: Agent.ID.make("reviewer") })

      yield* firstEvent.await.pipe(Effect.timeout("2 seconds"))
      expect(Option.isNone(yield* secondEvent.await.pipe(Effect.timeoutOption("100 millis")))).toBe(true)
    })
```


## S38 — `packages/server/test/client-contract-identity.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6438c7f63dc24ec9406f56be0f451c0e9c49bf9c`; arquivo SHA-256 `122799d92aee38fdf9a64316bcf31861df53fcf9d484cdda1566f0c559a151b9`; 3077 bytes.

Finalidade: Unexecuted intended canonical identity and client/server generation checks.

Linhas 24–45; trecho SHA-256 `7df565cb46018cb7de8439d3610c5ead6870d6078757ef522a6ae79b62f1a307`:

```
test("Core and Server reuse the authoritative Schema and Protocol values", () => {
  expect(AgentV2.ID).toBe(Agent.ID)
  expect(CoreLocation.Ref).toBe(Location.Ref)
  expect(ModelV2.Ref).toBe(Model.Ref)
  expect(SessionV2.Info).toBe(Session.Info)
  expect(CoreSessionInput.Admitted).toBe(SessionInput.Admitted)
  expect(CoreSessionMessage.Message).toBe(SessionMessage.Message)
  expect(CorePrompt).toBe(Prompt)
  expect(Api.groups["server.session"].identifier).toBe("server.session")
  expect(Object.keys(ClientApi.groups)).toEqual(Object.keys(Api.groups))
  expect(Session.ID.create()).toStartWith("ses_")
  expect<string>(Project.ID.global).toBe("global")
  expect<string>(Provider.ID.anthropic).toBe("anthropic")
  expect(Workspace.ID.create()).toStartWith("wrk_")
})

test("client and Server contracts generate identically", () => {
  const server = compile(Api, { groupNames, endpointNames, omitEndpoints })
  const client = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })

  expect(emitPromise(client)).toEqual(emitPromise(server))
})
```

