import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { ContextRecallTool } from "@/tool/context-recall"
import { Tool } from "@/tool/tool"
import { it, setup } from "./todo-fixture"

const Memory = Schema.Struct({ status: Schema.Literal("unavailable"), recallExtent: Schema.String,
  recall: Schema.Struct({ message_id: Schema.String, part_id: Schema.String }) })
const Page = Schema.Struct({ status: Schema.String, content: Schema.optional(Schema.String) })
const Document = Schema.Struct({ parts: Schema.Array(Schema.Struct({ input: Schema.Unknown,
  output: Schema.optional(Schema.String), metadata: Schema.Record(Schema.String, Schema.Unknown) })) })

it.instance("unavailable native tasks supply an exact own recall request with truthful metadata extent", () => Effect.gen(function* () {
  const f = yield* setup()
  const mirror = f.make(yield* f.user(f.chat.id))
  const part = yield* f.native(mirror, "TaskUpdate", { taskId: "native-A", status: "completed" }, undefined)
  if (part.state.status !== "completed") throw new Error("Missing genuine unavailable native owner")
  expect(part.state.metadata.claudeCodeTodo).toMatchObject({ reason: "NATIVE_TODO_STRUCTURED_RESULT_MISSING" })
  const text = yield* f.memory(f.chat.id)
  const section = text?.split("## Todos\n")[1]?.split("\n\n")[0]
  if (!section) throw new Error("Missing explicit unavailable task context")
  const record = Schema.decodeUnknownSync(Schema.fromJsonString(Memory))(section)
  expect(record.recall).toEqual({ message_id: part.messageID, part_id: part.id })
  expect(record.recallExtent).toContain("excluded from context_recall metadata")
  const definition = yield* ContextRecallTool
  const tool = yield* Tool.init(definition)
  const abort = new AbortController()
  yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
  const asked: string[] = []
  const context = (sessionID: typeof f.chat.id, messageID: typeof part.messageID): Tool.Context => ({
    sessionID, messageID, agent: "maestro", abort: abort.signal, messages: [],
    metadata: () => Effect.void,
    ask: (input) => Effect.sync(() => { asked.push(input.patterns[0]) }),
  })
  const own = Schema.decodeUnknownSync(Schema.fromJsonString(Page))(
    (yield* tool.execute(record.recall, context(f.chat.id, part.messageID))).output)
  expect(own.status).toBe("found")
  if (!own.content) throw new Error("Real own recall returned no document")
  const document = Schema.decodeUnknownSync(Schema.fromJsonString(Document))(own.content)
  expect(document.parts).toHaveLength(1)
  expect(document.parts[0]).toMatchObject({ input: part.state.input, output: part.state.output, metadata: {} })
  expect(own.content).not.toContain("claudeCodeTodo")
  expect(own.content).not.toContain("NATIVE_TODO_STRUCTURED_RESULT_MISSING")
  expect(text).toContain("NATIVE_TODO_STRUCTURED_RESULT_MISSING")
  const foreign = yield* setup()
  const foreignMirror = foreign.make(yield* foreign.user(foreign.chat.id))
  const foreignPart = yield* foreign.native(foreignMirror, "TaskList", {}, { tasks: [] })
  const denied = Schema.decodeUnknownSync(Schema.fromJsonString(Page))(
    (yield* tool.execute(record.recall, context(foreign.chat.id, foreignPart.messageID))).output)
  expect(denied.status).toBe("unavailable")
  expect(denied.content).toBeUndefined()
  expect(asked).toEqual([f.chat.id, foreign.chat.id])
  yield* mirror.finish(0)
  yield* foreignMirror.finish(0)
}))
