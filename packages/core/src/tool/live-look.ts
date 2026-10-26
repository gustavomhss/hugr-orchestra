export * as LiveLookTool from "./live-look"

import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { ToolText } from "./text"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "live_look"

// The server holds no screen. The desktop follows the live seat's session, sees this call in its event stream,
// captures one frame and admits it as the seat's next input (docs/specs/live-seat).
export const Input = Schema.Struct({
  question: Schema.optional(Schema.String).annotate({ description: "What to look for on the owner's screen" }),
})

export const Output = Schema.Struct({ requested: Schema.Boolean })
export type Output = typeof Output.Type

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description: ToolText.liveLook,
          input: Input,
          output: Output,
          toModelOutput: () => [
            {
              type: "text",
              text: "A frame of the owner's screen was requested. End this turn without text; the frame arrives as your next input, labelled [On screen].",
            },
          ],
          execute: (_, context) =>
            Effect.gen(function* () {
              if (context.agent !== "live")
                return yield* new ToolFailure({ message: `${context.agent} cannot see the owner's screen` })
              yield* permission
                .assert({
                  action: name,
                  resources: ["screen"],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                })
                .pipe(Effect.mapError(() => new ToolFailure({ message: "Not allowed to look at the screen" })))
              return { requested: true }
            }),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/live-look",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node],
})
