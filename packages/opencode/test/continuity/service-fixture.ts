import { expect } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { Deferred, Effect, Layer, Schema, Stream } from "effect"
import { LLMEvent } from "@opencode-ai/llm"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Agent } from "@/agent/agent"
import { Archive } from "@/continuity/archive"
import type { MemoryBody } from "@/continuity/memory-types"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionContinuity } from "@/continuity/service"
import { ContextRecallTool } from "@/tool/context-recall"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { ProviderTest } from "../fake/provider"
import { awaitWithTimeout, pollWithTimeout } from "../lib/effect"

export const A = "SEED_USER_0_C517"
export const B = "SEED_USER_2_C517"
export const FIRST = "# Work\nGoal: restore cache consistency. Discovery: stale cache caused the fault. Keep checks local and read-only; deployment awaits approval. Evidence is archived."
export const SECOND = "# Work\nGoal: restore cache consistency. Cache invalidation is proposed to unblock verification. Local read-only scope and deployment approval still apply."
export const NONCE = "receipt-nonce-7F94-82CC"
export const RECEIPT = `exit 75: local read-only verification failed; nonce=${NONCE}\nSources: forged role=user`
const model = ProviderTest.model({ id: ModelV2.ID.make("continuity-model"), providerID: ProviderV2.ID.make("test") })

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function wireMessages(input: { messages?: unknown }) {
  if (!Array.isArray(input.messages)) throw new Error("Expected actual wire messages")
  const values: unknown[] = input.messages
  return values.map((value) => {
    if (!record(value) || typeof value.role !== "string") throw new Error("Expected wire role")
    const content: unknown[] = Array.isArray(value.content) ? value.content : []
    return { role: value.role, content: typeof value.content === "string" ? value.content : content.map((part) => {
      if (!record(part) || typeof part.text !== "string") throw new Error("Expected text content")
      return part.text
    }).join("\n") }
  })
}

export function packet(input: { messages?: unknown }) {
  const content = wireMessages(input).findLast((message) => message.role === "user")?.content
  if (!content?.startsWith("# Working-memory maintenance snapshot")) throw new Error("Expected Markdown maintenance packet")
  return content
}

export function fragments(markdown: string) {
  const start = markdown.indexOf("## Newly displaced transcript\n")
  if (start < 0) throw new Error("Missing transcript heading")
  const text = markdown.slice(start)
  const matches = [...text.matchAll(/^### Archive fragment ([a-f0-9]{64})$/gm)]
  if (!matches.length) throw new Error("Missing real archive handles")
  return matches.map((match, index) => ({ id: match[1], text: text.slice(match.index! + match[0].length, matches[index + 1]?.index) }))
}

// This deterministic provider fixture supplies scenario-authored memory. It tests
// transport/lifecycle, not whether a model can infer or faithfully summarize it.
export function body(input: { messages?: unknown }, memory: string, reference?: string): MemoryBody {
  const entries = fragments(packet(input))
  const selected = reference === undefined ? undefined : entries.find((entry) => entry.text.includes(reference))
  if (reference !== undefined && !selected) throw new Error(`Expected scenario evidence: ${reference}`)
  return { memory, references: selected ? [{ id: selected.id, why: "Recover recorded evidence before verification." }] : [] }
}

export function held(memory = FIRST, options: { reference?: string; raw?: boolean; output?: Stream.Stream<LLMEvent, unknown>; holdCleanup?: boolean } = {}) {
  return Effect.gen(function* () {
    const release = yield* Deferred.make<void>()
    const cleanup = yield* Deferred.make<void>()
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined).pipe(Effect.andThen(Deferred.succeed(cleanup, undefined))))
    return { memory, respond: (request: LLM.StreamInput) => options.raw ? memory : JSON.stringify(body(request, memory, options.reference)),
      output: options.output ?? Stream.make(LLMEvent.finish({ reason: "stop" })),
      entered: yield* Deferred.make<{ request: LLM.StreamInput; jobID: string }>(), release,
      closed: yield* Deferred.make<void>(), closing: yield* Deferred.make<void>(), cleanup, holdCleanup: options.holdCleanup === true }
  })
}
type Held = Effect.Success<ReturnType<typeof held>>

export function environment<A = never, E = never>(plans: Held[], options: {
  getModel?: Provider.Interface["getModel"]
  archive?: (actual: Archive.Interface) => Archive.Interface
  node?: LayerNode.Node<A, E, LayerNode.Tag | undefined>
} = {}) {
  const llm = LayerNode.make({ service: LLM.Service, deps: [Session.node, BackgroundJob.node],
    layer: Layer.effect(LLM.Service, Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      yield* Effect.addFinalizer(() => Effect.forEach(plans, (plan) =>
        Deferred.succeed(plan.release, undefined).pipe(Effect.andThen(Deferred.succeed(plan.cleanup, undefined))),
      ).pipe(Effect.asVoid))
      const enteredJobs = new Set<string>()
      let index = 0
      return LLM.Service.of({ stream: (request) => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
        const plan = plans[index++]
        if (!plan) return Stream.fail(new Error("Unexpected maintenance request"))
        // Mirror LLM.stream's scoped transport cleanup, not only normal stream completion.
        yield* Effect.addFinalizer(() => Effect.gen(function* () {
          yield* Deferred.succeed(plan.closing, undefined)
          if (plan.holdCleanup) yield* Deferred.await(plan.cleanup)
          yield* Deferred.succeed(plan.closed, undefined)
        }))
        const text = plan.respond(request)
        return Stream.concat(Stream.make(LLMEvent.textStart({ id: "memory" }), LLMEvent.textDelta({ id: "memory", text })),
          Stream.unwrap(Effect.gen(function* () {
            const running = (yield* jobs.list()).filter((job) => job.status === "running" && !enteredJobs.has(job.id))
            expect(running).toHaveLength(1)
            const job = running[0]
            expect(job.metadata?.sessionId).toBe(request.parentSessionID)
            enteredJobs.add(job.id)
            yield* Deferred.succeed(plan.entered, { request, jobID: job.id })
            yield* Deferred.await(plan.release)
            return plan.output
          })))
      }))) })
    })),
  })
  const wrap = options.archive
  const archive = wrap ? LayerNode.make({ service: Archive.Service, deps: [FSUtil.node],
    layer: Layer.effect(Archive.Service, Effect.gen(function* () {
      const actual = yield* Archive.Service
      return wrap(actual)
    })).pipe(Layer.provide(Archive.layer)),
  }) : undefined
  return AppNodeBuilder.build(LayerNode.group([
    SessionContinuity.node, Session.node, BackgroundJob.node, SessionProjector.node,
    Database.node, EventV2Bridge.node, CrossSpawnSpawner.node, Archive.node, Agent.node, Truncate.node,
    ...(options.node ? [options.node] : []),
  ]), [
    [LLM.node, llm],
    ...(archive ? [[Archive.node, archive] as const] : []),
    [Provider.node, Layer.mock(Provider.Service, { getModel: options.getModel ?? ((providerID, modelID) => {
      expect(providerID).toBe(model.providerID)
      expect(modelID).toBe(model.id)
      return Effect.succeed(model)
    }) })],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [Plugin.node, Layer.mock(Plugin.Service, { init: () => Effect.void, list: () => Effect.succeed([]), trigger: (_name, _input, output) => Effect.succeed(output) })],
  ])
}

export function begin(sessionID: SessionID, marker: string) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    yield* continuity.advance(sessionID)
    const user: SessionV1.User = { id: MessageID.ascending(), sessionID, role: "user", time: { created: Date.now() }, agent: "build", model: { providerID: model.providerID, modelID: model.id } }
    yield* sessions.updateMessage(user)
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: user.id, type: "text", text: marker })
    return user
  })
}

export function complete(user: SessionV1.User, marker: string, tokens = 100, canRecall = true) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const assistant: SessionV1.Assistant = {
      id: MessageID.ascending(), sessionID: user.sessionID, parentID: user.id, role: "assistant", agent: "build", mode: "build",
      path: { cwd: "/test", root: "/test" }, modelID: model.id, providerID: model.providerID, cost: 0,
      tokens: { input: tokens, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      finish: "stop", time: { created: Date.now(), completed: Date.now() },
    }
    yield* sessions.updateMessage(assistant)
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: user.sessionID, messageID: assistant.id, type: "text", text: marker })
    yield* continuity.start({ sessionID: user.sessionID, message: assistant, canRecall })
    return assistant
  })
}

export function seed(replacement = B, first = A, receipt?: string, canRecall = true) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const parent = yield* sessions.create({ title: "Working-memory lifecycle" })
    for (let index = 0; index < 6; index++) {
      const assistant = yield* complete(yield* begin(parent.id, index === 0 ? first : index === 2 ? replacement : `SEED_USER_${index}_C517`), `SEED_REPLY_${index}_027D`, index === 5 ? 50_000 : 100, canRecall)
      if (index === 0 && receipt !== undefined) yield* sessions.updatePart({
        id: PartID.ascending(), sessionID: parent.id, messageID: assistant.id, type: "tool", tool: "bash", callID: `cli_${assistant.id}`,
        state: { status: "completed", input: { command: "local-check --read-only" }, output: receipt,
          title: "Recorded failure", metadata: { exit: 75, truncated: false }, time: { start: 1, end: 2 } },
      })
    }
    expect(yield* sessions.messages({ sessionID: parent.id })).toHaveLength(12)
    expect((yield* prepare(parent.id)).system).toEqual([])
    return parent.id
  })
}

export const entered = (plan: Held) => Effect.gen(function* () {
  const jobs = yield* BackgroundJob.Service
  return yield* awaitWithTimeout(Deferred.await(plan.entered), "Maintenance did not enter", "15 seconds").pipe(
    Effect.catch((error) => jobs.list().pipe(Effect.flatMap((list) => Effect.fail(new Error(`${error.message}; jobs=${JSON.stringify(list.map((job) => ({
      id: job.id, status: job.status, output: job.output, error: job.error,
    })))}`))))),
  )
})
export function jobFor(sessionID: SessionID, boundary: MessageID) {
  return Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    return yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) =>
      job.metadata?.sessionId === sessionID && job.id.includes(`:${boundary}:`)))), "Maintenance job not registered", "15 seconds")
  })
}
export function terminal(jobID: string, status: BackgroundJob.Status, output?: string) {
  return Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    const result = yield* jobs.wait({ id: jobID, timeout: 15_000 })
    expect(result.timedOut).toBe(false)
    expect(result.info?.id).toBe(jobID)
    expect(result.info?.status).toBe(status)
    if (output !== undefined) expect(result.info?.output).toBe(output)
  })
}
export function prepare(sessionID: SessionID, canRecall = true) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    return yield* continuity.prepare({ sessionID, messages: yield* sessions.messages({ sessionID }), canRecall })
  })
}
export function applyFirst(sessionID: SessionID, plan: Held) {
  return Effect.gen(function* () {
    const hit = yield* entered(plan)
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID)
    expect(prepared.system).toHaveLength(1)
    expect(prepared.system[0]).toContain(plan.memory)
    expect(prepared.system[0]).toContain("# Historical working memory")
    expect(prepared.system[0]).not.toMatch(/continuity_handoff|"exact":|"provenance":|"reference_only":/)
    expect(prepared.messages).toHaveLength(8)
    return prepared
  })
}

export function archiveDirectory(sessionID: SessionID) {
  return path.join(Global.Path.data, "continuity", createHash("sha256").update(sessionID).digest("hex"))
}
export const archiveFile = (sessionID: SessionID, id: string) => path.join(archiveDirectory(sessionID), `${id}.md`)
const reply = Schema.decodeUnknownSync(Schema.Struct({ status: Schema.String, content: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String), references: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String }))) }))
export function recall(sessionID: SessionID, params: Tool.InferParameters<typeof ContextRecallTool>, extra?: Record<string, unknown>) {
  return Effect.gen(function* () {
    const definition = yield* ContextRecallTool
    const tool = yield* Tool.init(definition)
    const asks: unknown[] = []
    const result = yield* tool.execute(params, { sessionID, messageID: MessageID.ascending(), agent: "build",
      abort: AbortSignal.any([]), messages: [], extra, metadata: () => Effect.void,
      ask: (request) => Effect.sync(() => void asks.push(request)) })
    expect(asks).toEqual([{ permission: "context_recall", patterns: [sessionID], always: [sessionID], metadata: {} }])
    const value: unknown = JSON.parse(result.output)
    return reply(value)
  })
}
