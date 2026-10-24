export * as LeanRecall from "./lean-recall"

import { Effect, Layer, Schema, Option } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import { Tools } from "@orchestra/core/tool/tools"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionV2 } from "@orchestra/core/session"
import { LeanSummary } from "./lean-summary"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { ToolFailure } from "@orchestra/llm"

const Input = Schema.Struct({
  tool: Schema.Literals(["bash", "read", "webfetch", "glob", "grep"]),
  callID: Schema.String,
  partID: Schema.String,
})

const Output = Schema.Struct({
  original: Schema.String,
  summarized: Schema.Boolean,
})

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const agents = yield* AgentV2.Service
    const sessions = yield* SessionV2.Service
    const store = yield* LeanSummary.Store.Service

    yield* tools.register({
      lean_recall: Tool.make({
        description: "Recover the complete original output of a summarized tool call. Requires bash, read, webfetch, glob, or grep permissions.",
        input: Input,
        output: Output,
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

            // Check if agent has permission for the requested tool
            const hasPermission = agent.permissions.some((p) =>
              p.action === "tool" && p.effect === "allow" && (p.resource === "*" || p.resource === params.tool)
            )
            if (!hasPermission) {
              return yield* Effect.fail(new ToolFailure({ message: `Permission denied for tool: ${params.tool}` }))
            }

            // Retrieve from Lean summary store
            const owner = { projectID: session.projectID ?? "global", directory: session.location?.directory ?? "" }
            const leanStore = yield* store(owner)
            const result = yield* Effect.tryPromise(() => leanStore.get(params.callID)).pipe(
              Effect.catchAllCause(() => Effect.succeed(Option.none())),
            )

            if (Option.isNone(result)) {
              return { original: "", summarized: false }
            }

            const original = result.value
            return { original, summarized: true }
          }),
      }),
    })

    yield* Effect.logInfo("Lean Recall V2 tool registered")
  }),
)

export const node = makeLocationNode({
  name: "lean/recall",
  layer,
  deps: [AgentV2.node, SessionV2.node, LeanSummary.Store.node] as const,
})