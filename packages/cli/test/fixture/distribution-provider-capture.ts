import { Schema } from "effect"
import { join } from "node:path"
import { model } from "./distribution-provider-ollama"

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

// Every admitted response body comes from upstream Ollama. No replay, scripted
// completion, tool-call injection or response rewriting. Headers are never logged.
export function captureInference(endpoint: string, evidence: string) {
  const records: Array<{ request: typeof WireRequest.Type; requestJSON: string; response: string; status: number }> = []
  const pending = new Set<Promise<void>>()
  const controllers = new Set<AbortController>()
  const failures: unknown[] = []
  const state = { stage: "unarmed", turns: 0 }
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      const route = new URL(request.url)
      if (state.stage === "unarmed" || request.method !== "POST" || route.pathname !== "/v1/chat/completions" || route.search)
        throw new Error("PROVIDER_CAPTURE_UNEXPECTED_REQUEST")
      if (++state.turns > 4) throw new Error("PROVIDER_CAPTURE_TURN_LIMIT")
      const stage = state.stage
      const turn = state.turns
      const json = await request.text()
      if (Buffer.byteLength(json) > 1024 * 1024) throw new Error("PROVIDER_CAPTURE_REQUEST_TOO_LARGE")
      const decoded = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(WireRequest)))(json)
      if (decoded.model !== model) throw new Error("PROVIDER_CAPTURE_MODEL_MISMATCH")
      await Bun.write(join(evidence, `${stage}-turn-${turn}-request.json`), JSON.stringify({
        upstream: endpoint, method: "POST", path: route.pathname, request: decoded, requestJSON: json,
      }, null, 2) + "\n")
      const controller = new AbortController()
      controllers.add(controller)
      const upstream = await fetch(endpoint + route.pathname, {
        method: "POST", headers: { "content-type": "application/json" }, body: json,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(240_000)]), redirect: "error",
      }).catch((error: unknown) => {
        controllers.delete(controller)
        throw error
      })
      if (!upstream.body) {
        controllers.delete(controller)
        throw new Error("PROVIDER_CAPTURE_UPSTREAM_BODY_MISSING")
      }
      const [client, capture] = upstream.body.tee()
      const record = { request: decoded, requestJSON: json, response: "", status: upstream.status }
      records.push(record)
      const task = (async () => {
        const reader = capture.getReader()
        const chunks: Uint8Array[] = []
        const size = { bytes: 0 }
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size.bytes += chunk.value.byteLength
          if (size.bytes > 8 * 1024 * 1024) {
            await reader.cancel()
            throw new Error("PROVIDER_CAPTURE_RESPONSE_TOO_LARGE")
          }
          chunks.push(chunk.value)
        }
        record.response = Buffer.concat(chunks).toString("utf8")
        await Bun.write(join(evidence, `${stage}-turn-${turn}.json`), JSON.stringify({
          upstream: endpoint, method: "POST", path: route.pathname, ...record,
        }, null, 2) + "\n")
      })().catch((error: unknown) => { failures.push(error) }).finally(() => {
        controllers.delete(controller)
        pending.delete(task)
      })
      pending.add(task)
      // Forward exact status, content type and bytes. No upstream auth required.
      return new Response(client, { status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/octet-stream" } })
    },
    error(error) {
      failures.push(error)
      // A rejected request is a transport failure, never a model completion.
      return new Response(null, { status: 502 })
    },
  })
  return {
    url: server.url.origin + "/v1",
    arm(stage: string) {
      if (pending.size) throw new Error("PROVIDER_CAPTURE_PREVIOUS_RESPONSE_PENDING")
      if (!/^[a-z0-9-]+$/.test(stage)) throw new Error("PROVIDER_CAPTURE_STAGE_INVALID")
      records.length = 0
      failures.length = 0
      state.stage = stage
      state.turns = 0
    },
    async drain() {
      await Promise.all([...pending])
      if (failures.length) throw new AggregateError(failures, "PROVIDER_CAPTURE_FAILED")
      if (records.length === 0) throw new Error("PROVIDER_CAPTURE_NO_INFERENCE")
      return [...records]
    },
    async stop() {
      controllers.forEach((controller) => controller.abort())
      await server.stop(true)
      await Promise.all([...pending])
    },
  }
}

export type InferenceCapture = ReturnType<typeof captureInference>
