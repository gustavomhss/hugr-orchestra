// Immutable logical-history replay. Dry mode captures the actual production request; never reads gold or calls a provider.
import path from "node:path"
import { mkdir, chmod } from "node:fs/promises"
import { Effect, Schema, Stream } from "effect"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { completeSnapshot, run } from "@/continuity/fork"
import { HARD_LIMIT } from "@/continuity/trigger"
import { decode } from "@/continuity/memory"
import { create } from "@/continuity/context"
import type { MemoryArtifact } from "@/continuity/memory-types"
import { DryRequestCaptured } from "@/continuity/dry-transport"
import { LLMEvent } from "@orchestra/llm"
import { RequestSource } from "@/continuity/request-source"
import { CaseCapabilities } from "./case-capabilities"

export function replay(input: { messages: SessionV1.WithParts[]; boundary?: MessageID; model: Provider.Model; previous?: MemoryArtifact;
  llm?: LLM.Interface; response?: string }) {
  return Effect.gen(function* () {
    const sessionID = input.messages[0]?.info.sessionID
    if (!sessionID) throw new Error("complete-replay-empty-source")
    if (!input.model) throw new Error("complete-replay-model-required")
    const captured = completeSnapshot(sessionID, input.messages, input.previous, true, input.boundary)
    if (!captured) {
      const unsafe = input.messages.filter((message) => message.info.role === "assistant" && (message.info.time.completed === undefined || !message.info.error &&
        !["stop", "end_turn", "tool-calls"].includes(message.info.finish ?? ""))).map((message) => ({ id: message.info.id,
          completed: message.info.role === "assistant" && message.info.time.completed !== undefined, finish: message.info.role === "assistant" ? message.info.finish : undefined,
          error: message.info.role === "assistant" && !!message.info.error }))
      throw new Error(`complete-replay-unmet-completed-prefix:${JSON.stringify({ unsafe })}`)
    }
    const user = RequestSource.latest(captured.covered ?? captured.head)?.info
    if (!user || user.role !== "user" || user.model.providerID !== input.model.providerID || user.model.modelID !== input.model.id)
      throw new Error("complete-replay-source-model-mismatch")
    const requests: LLM.StreamInput[] = []
    const pass = yield* run(captured, { provider: replayProvider(input.model),
      llm: input.llm ?? { stream: (request) => {
        if (!requests.includes(request)) return Stream.fail(new Error("complete-replay-construction-order"))
        return input.response ? Stream.make(LLMEvent.textDelta({ id: "saved-output", text: input.response }), LLMEvent.finish({ reason: "stop" })) :
          Stream.fail(new DryRequestCaptured())
      } } },
      { history: input.messages, delegations: {}, member: false }, { onRequest: (request) => Effect.sync(() => { requests.push(request) }) })
    const artifact = pass.artifact
    const contexts = create()
    if (artifact) contexts.set({ sessionID, boundary: artifact.boundary, text: artifact.text, artifact })
    const view = contexts.prepare(sessionID, input.messages)
    return { representation: "immutable reconstructed logical history; NOT exact historic provider wire", requests,
      model: { providerID: input.model.providerID, id: input.model.id, limit: input.model.limit },
      usage: input.llm ? "evaluator transport owns actual usage telemetry" : { input: null, output: null, cached: null, providerCalls: 0 },
      snapshot: { complete: true, boundary: captured.boundary, coveredThrough: captured.boundary, sources: captured.covered?.map((message) => message.info.id) },
      result: pass.failure === "dry-captured" && requests.length > 0 ? { status: "dry-request-captured" } : pass,
      artifact, system: view.system,
      retainedNativeIDs: view.messages.map((message) => message.info.id), coverage: view.coverage }
  })
}

/** Replay may resolve only the approved provider/model pair, never substitute it for another request. */
export function replayProvider(model: Provider.Model): Pick<Provider.Interface, "getModel"> {
  return { getModel: (providerID, modelID) => providerID === model.providerID && modelID === model.id ? Effect.succeed(model) :
    Effect.fail(new Provider.ModelNotFoundError({ providerID, modelID })) }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const value = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined }
  const capabilities = value("--capabilities")
  const digest = value("--capabilities-sha256")
  const caseID = value("--case")
  const out = value("--output")
  if (args.length % 2 || args.filter((_, index) => index % 2 === 0).some((name) => !["--mode", "--capabilities", "--capabilities-sha256", "--case", "--output"].includes(name)) ||
    !capabilities || !digest || !caseID || !out || value("--mode") !== "dry")
    throw new Error("complete-replay-capabilities-model-required: --mode dry --capabilities <canonical manifest> --capabilities-sha256 <approved digest> --case <approved ID> --output <private directory>")
  const input = await CaseCapabilities.load({ manifest: Schema.decodeUnknownSync(CaseCapabilities.File)({ path: capabilities, sha256: digest }), caseID })
  const result = await Effect.runPromise(replay({ ...input, boundary: MessageID.make(input.boundary) }))
  await mkdir(path.resolve(out), { recursive: true, mode: 0o700 })
  await chmod(path.resolve(out), 0o700)
  await Bun.write(path.join(path.resolve(out), "request.json"), JSON.stringify(result.requests, null, 2), { mode: 0o600 })
  await Bun.write(path.join(path.resolve(out), "metadata.json"), JSON.stringify({ ...result, requests: undefined }, null, 2), { mode: 0o600 })
  const captured = "status" in result.result && result.result.status === "dry-request-captured"
  console.log(JSON.stringify({ mode: "dry", status: captured ? "captured" : "failed", result: result.result, requests: result.requests.length,
    boundary: result.snapshot.boundary, sourceCount: result.snapshot.sources?.length, providerCalls: 0 }))
  if (!captured) process.exitCode = 1
}
