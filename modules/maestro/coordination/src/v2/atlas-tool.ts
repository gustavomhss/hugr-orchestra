export * as AtlasTool from "./atlas-tool"

import { Effect, Schema } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import { Tools } from "@orchestra/core/tool/tools"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionV2 } from "@orchestra/core/session"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { ToolFailure } from "@orchestra/llm"

const Parameters = Schema.Struct({
  action: Schema.Literals(["catalog", "unit"]),
  territory: Schema.String.pipe(Schema.optional),
  unit: Schema.String.pipe(Schema.optional),
})

export const node = makeLocationNode({
  name: "maestro/tools/atlas",
  layer: Effect.gen(function* () {
    const tools = yield* Tools.Service
    const agents = yield* AgentV2.Service
    const sessions = yield* SessionV2.Service

    yield* tools.register({
      atlas_context: Tool.make({
        description: "Browse Atlas catalog or read a specific unit. Maestro only. Actions: catalog (list territories), unit (read unit content).",
        input: Parameters,
        output: Schema.Struct({
          territories: Schema.Array(Schema.String).pipe(Schema.optional),
          unit: Schema.Struct({ name: Schema.String, content: Schema.String }).pipe(Schema.optional),
        }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Atlas context requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (params.action === "catalog") {
              return { territories: ["core", "maestro", "atlas", "lean"] }
            }
            if (params.action === "unit") {
              if (!params.territory || !params.unit) {
                return yield* Effect.fail(new ToolFailure({ message: "unit action requires territory and unit" }))
              }
              return {
                unit: {
                  name: params.unit,
                  content: `# ${params.territory}/${params.unit}\n\nUnit content for ${params.territory}/${params.unit}.`,
                },
              }
            }
            return yield* Effect.fail(new ToolFailure({ message: "Invalid action" }))
          }),
      }),
    }).pipe(Effect.orDie)
  }),
  deps: [AgentV2.node, SessionV2.node],
})