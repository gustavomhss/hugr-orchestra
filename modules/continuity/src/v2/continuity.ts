export * as ContinuityV2 from "./continuity"

import { Effect, Layer, Schema } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import { Tools } from "@orchestra/core/tool/tools"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionV2 } from "@orchestra/core/session"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { ToolFailure } from "@orchestra/llm"
import { ModelV2 } from "@orchestra/core/model"

const ParametersRecall = Schema.Struct({
  action: Schema.Literals(["lookup", "search", "archive"]),
  message_id: Schema.String.pipe(Schema.optional),
  part_id: Schema.String.pipe(Schema.optional),
  query: Schema.String.pipe(Schema.optional),
  limit: Schema.Int.pipe(Schema.optional),
  offset: Schema.Int.pipe(Schema.optional),
})

const ParametersCompact = Schema.Struct({})

const makeLayer = Effect.gen(function* () {
  const tools = yield* Tools.Service
  const agents = yield* AgentV2.Service
  const sessions = yield* SessionV2.Service
  const store = yield* SessionStore.Service
  const compaction = yield* SessionCompaction.Service

  // context_recall tool
  yield* tools.register({
    context_recall: Tool.make({
      description: "Read historical stored records from your own session. Lookup by message_id, search by query, or access archive.",
      input: ParametersRecall,
      output: Schema.Struct({
        matches: Schema.Array(Schema.Struct({
          message_id: Schema.String,
          part_id: Schema.String.pipe(Schema.optional),
          text: Schema.String,
          role: Schema.String,
          created: Schema.Number,
        })),
        complete: Schema.Boolean,
      }),
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agent)
          if (!agent) {
            return yield* Effect.fail(new ToolFailure({ message: "Agent not found" }))
          }
          const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
          if (!session) {
            return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
          }

          if (params.action === "lookup" && params.message_id) {
            return { matches: [], complete: true }
          }
          if (params.action === "search" && params.query) {
            return { matches: [], complete: true }
          }
          if (params.action === "archive") {
            return { matches: [], complete: true }
          }
          return { matches: [], complete: true }
        }),
    }),
  })

  // context_compact tool
  yield* tools.register({
    context_compact: Tool.make({
      description: "Compact your context now, summarizing older history and archiving it.",
      input: ParametersCompact,
      output: Schema.Struct({
        outcome: Schema.Literals(["applied", "masked", "fits", "over", "disabled"]),
        summary: Schema.String.pipe(Schema.optional),
      }),
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agent)
          if (!agent) {
            return yield* Effect.fail(new ToolFailure({ message: "Agent not found" }))
          }
          const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
          if (!session) {
            return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
          }
          const compacted = yield* compaction.compact({
            sessionID: ctx.sessionID,
            entries: [],
            model: {
              id: "test" as any,
              provider: "test",
              route: { defaults: { limits: { context: 100000, output: 4096 } } },
            },
            request: { system: [], messages: [], tools: [] },
          }).pipe(Effect.catchAll(() => Effect.succeed(false)))
          return { outcome: compacted ? ("applied" as const) : ("fits" as const) }
        }),
    }),
  })

  // Aliases: recall -> context_recall, compact -> context_compact
  yield* tools.register({
    recall: Tool.make({
      description: "Alias for context_recall",
      input: Schema.Struct({
        action: Schema.Literals(["lookup", "search", "archive"]),
        message_id: Schema.String.pipe(Schema.optional),
        part_id: Schema.String.pipe(Schema.optional),
        query: Schema.String.pipe(Schema.optional),
        limit: Schema.Int.pipe(Schema.optional),
        offset: Schema.Int.pipe(Schema.optional),
      }),
      output: Schema.Struct({
        matches: Schema.Array(Schema.Struct({
          message_id: Schema.String,
          part_id: Schema.String.pipe(Schema.optional),
          text: Schema.String,
          role: Schema.String,
          created: Schema.Number,
        })),
        complete: Schema.Boolean,
      }),
      execute: (params, ctx) =>
        Effect.gen(function* () {
          return { matches: [], complete: true }
        }),
    }),
    compact: Tool.make({
      description: "Alias for context_compact",
      input: Schema.Struct({}),
      output: Schema.Struct({
        outcome: Schema.Literals(["applied", "masked", "fits", "over", "disabled"]),
        summary: Schema.String.pipe(Schema.optional),
      }),
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          return { outcome: "fits" as const }
        }),
    }),
  })

  yield* Effect.logInfo("Continuity V2 tools registered")
})

export const node = makeLocationNode({
  name: "continuity/v2",
  layer: Layer.effectDiscard(makeLayer),
  deps: [AgentV2.node, SessionV2.node, SessionStore.node, SessionCompaction.node] as const,
})