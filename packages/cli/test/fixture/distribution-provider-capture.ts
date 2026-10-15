import { join } from "node:path"
import { model } from "./distribution-provider-ollama"
import { WireRequest, decodeCaptureRequest } from "./distribution-provider-wire"
import { captureByteCap, readCaptureBytes, requireCaptureLength } from "./distribution-provider-bytes"
export { WireCall, WireRequest, streamedCompletion } from "./distribution-provider-wire"

// Every admitted response body comes from upstream Ollama. No replay, scripted
// completion, tool-call injection or response rewriting. Headers are never logged.
export function captureInference(endpoint: string, evidence: string) {
  const records: Array<{ request: typeof WireRequest.Type; requestJSON: string; response: string; status: number }> = []
  const pending = new Set<Promise<void>>()
  const controllers = new Set<AbortController>()
  const failures: unknown[] = []
  const state = { stage: "unarmed", turns: 0 }
  // CPU inference can pause SSE beyond Bun's 10-second idle default; the request
  // retains its explicit 240-second deadline and owned teardown aborts it.
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0, maxRequestBodySize: captureByteCap, idleTimeout: 0,
    async fetch(request) {
      const route = new URL(request.url)
      if (state.stage === "unarmed" || request.method !== "POST" || route.pathname !== "/v1/chat/completions" || route.search)
        throw new Error("PROVIDER_CAPTURE_UNEXPECTED_REQUEST")
      if (++state.turns > 4) throw new Error("PROVIDER_CAPTURE_TURN_LIMIT")
      const stage = state.stage
      const turn = state.turns
      requireCaptureLength(request.headers.get("content-length"))
      const payload = await readCaptureBytes(request.body, { failure: "PROVIDER_CAPTURE_REQUEST_TOO_LARGE",
        report: (error) => failures.push(error) })
      const parsed = decodeCaptureRequest(payload, model)
      const json = parsed.json
      const decoded = parsed.request
      await Bun.write(join(evidence, `${stage}-turn-${turn}-request.json`), JSON.stringify({
        upstream: endpoint, method: "POST", path: route.pathname, request: decoded, requestJSON: json,
      }, null, 2) + "\n")
      const controller = new AbortController()
      controllers.add(controller)
      const upstream = await fetch(endpoint + route.pathname, {
        method: "POST", headers: { "content-type": "application/json" }, body: payload,
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
        record.response = (await readCaptureBytes(capture, { failure: "PROVIDER_CAPTURE_RESPONSE_TOO_LARGE", controller,
          report(error, bytes) {
            failures.push(error)
            console.error(`${error.message} ${JSON.stringify({ stage, turn, bytes, cap: captureByteCap })}`)
          },
        })).toString("utf8")
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
