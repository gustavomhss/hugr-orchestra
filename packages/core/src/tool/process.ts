export * as ProcessTool from "./process"

import { Effect, Layer, Schema } from "effect"
import { ToolFailure } from "@orchestra/llm"
import { SessionProcess } from "../session-process"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { makeLocationNode } from "../effect/app-node"

export const nameGet = "process_get"
export const nameWait = "process_wait"
export const nameCancel = "process_cancel"

const InputGet = Schema.Struct({
  id: Schema.String.annotate({ description: "Background process ID" }),
})

const InputWait = Schema.Struct({
  id: Schema.String.annotate({ description: "Background process ID" }),
  timeout: Schema.Number.pipe(Schema.optional).annotate({ description: "Timeout in milliseconds" }),
})

const InputCancel = Schema.Struct({
  id: Schema.String.annotate({ description: "Background process ID" }),
})

const OutputProcess = Schema.Struct({
  id: Schema.String,
  pid: Schema.Number,
  title: Schema.String,
  started: Schema.Number,
  output: Schema.String,
  written: Schema.Number,
})

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const sessionProcess = yield* SessionProcess.Service

    yield* tools.register({
      [nameGet]: Tool.make({
        description: "Get a background process started by the bash tool.",
        input: InputGet,
        output: OutputProcess,
        execute: (input, context) =>
          Effect.gen(function* () {
            const info = yield* sessionProcess.get(context.sessionID, input.id)
            if (!info) return yield* Effect.fail(new Error(`Process not found: ${input.id}`))
            return {
              id: info.id,
              pid: info.pid,
              title: info.title,
              started: info.started,
              output: info.output,
              written: info.written,
            }
          }).pipe(Effect.mapError((error) => new ToolFailure({ message: error.message }))),
      }),
      [nameWait]: Tool.make({
        description: "Wait for a background process to finish.",
        input: InputWait,
        output: Schema.Struct({
          id: Schema.String,
          timedOut: Schema.Boolean,
          output: Schema.String.pipe(Schema.optional),
        }),
        execute: (input, context) =>
          Effect.gen(function* () {
            const result = yield* sessionProcess.wait(context.sessionID, input.id, input.timeout)
            return {
              id: input.id,
              timedOut: result.timedOut,
              output: result.info?.output,
            }
          }),
      }),
      [nameCancel]: Tool.make({
        description: "Cancel a background process.",
        input: InputCancel,
        output: Schema.Struct({ cancelled: Schema.Boolean }),
        execute: (input, context) =>
          Effect.gen(function* () {
            const cancelled = yield* sessionProcess.cancel(context.sessionID, input.id)
            return { cancelled }
          }),
      }),
    }).pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/process",
  layer,
  deps: [ToolRegistry.node, SessionProcess.node],
})
