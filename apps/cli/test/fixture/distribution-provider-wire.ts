import { Schema } from "effect"

export const WireCall = Schema.Struct({
  id: Schema.String,
  function: Schema.Struct({ name: Schema.String, arguments: Schema.String }),
})
export const WireRequest = Schema.Struct({
  model: Schema.String,
  messages: Schema.Array(Schema.Struct({
    role: Schema.String,
    content: Schema.optional(Schema.Unknown),
    tool_call_id: Schema.optional(Schema.String),
    tool_calls: Schema.optional(Schema.Array(WireCall)),
  })),
  tools: Schema.optional(Schema.Array(Schema.Struct({
    type: Schema.String,
    function: Schema.Struct({ name: Schema.String }),
  }))),
})

const Frame = Schema.Struct({
  choices: Schema.Array(Schema.Struct({
    delta: Schema.Struct({
      content: Schema.optional(Schema.NullOr(Schema.String)),
      tool_calls: Schema.optional(Schema.Array(Schema.Struct({
        index: Schema.Int,
        id: Schema.optional(Schema.String),
        function: Schema.optional(Schema.Struct({
          name: Schema.optional(Schema.String), arguments: Schema.optional(Schema.String),
        })),
      }))),
    }),
    finish_reason: Schema.optional(Schema.NullOr(Schema.String)),
  })),
})

export function decodeCaptureRequest(payload: Uint8Array, model: string) {
  const json = new TextDecoder("utf-8", { fatal: true }).decode(payload)
  const request = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(WireRequest)))(json)
  if (request.model !== model) throw new Error("PROVIDER_CAPTURE_MODEL_MISMATCH")
  return { json, request }
}

export function streamedCompletion(text: string) {
  const calls = new Map<number, { id: string; name: string; arguments: string }>()
  const content: string[] = []
  const finishes: string[] = []
  const frames = text.split(/\r?\n/).filter((line) => line.startsWith("data: "))
  if (frames.length === 0 || !frames.includes("data: [DONE]")) throw new Error("OLLAMA_SSE_INCOMPLETE")
  frames.filter((line) => line !== "data: [DONE]").forEach((line) => {
    const frame = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Frame)))(line.slice(6))
    frame.choices.forEach((choice) => {
      if (choice.delta.content) content.push(choice.delta.content)
      if (choice.finish_reason) finishes.push(choice.finish_reason)
      choice.delta.tool_calls?.forEach((part) => {
        const call = calls.get(part.index) ?? { id: "", name: "", arguments: "" }
        call.id += part.id ?? ""
        call.name += part.function?.name ?? ""
        call.arguments += part.function?.arguments ?? ""
        calls.set(part.index, call)
      })
    })
  })
  return { content: content.join(""), calls: [...calls.values()], finishes }
}
