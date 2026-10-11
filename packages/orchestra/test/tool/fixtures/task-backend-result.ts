import { expect } from "bun:test"
import { SessionV1 } from "@orchestra/core/v1/session"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionMessageUpdater } from "@orchestra/core/session/message-updater"
import { MessageTable, PartTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { SessionProjector } from "@orchestra/core/session/projector"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { DateTime, Deferred, Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Agent } from "../../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { PromptIdentity } from "@/session/prompt-identity"
import { MessageID, PartID } from "../../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../../src/tool/task"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Git } from "@/git"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { testEffect, awaitWithTimeout } from "../../lib/effect"

// Shared harness for task-backend-result*.test.ts: a real TaskTool dispatch against seeded sessions, foreground and background.

export const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

export const layer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  TestAppNodeBuilder.build(
    LayerNode.group([
      filesystem,
      Agent.node,
      BackgroundJob.node,
      EventV2Bridge.node,
      Git.node,
      Config.node,
      CrossSpawnSpawner.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      Truncate.node,
      ToolRegistry.node,
      Database.node,
      RuntimeFlags.node,
      Ripgrep.node,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

export const it = testEffect(layer())
export const background = testEffect(layer({ experimentalBackgroundSubagents: true }))

export const card = {
  outcome: "done",
  changes: [{ path: "/repo/internal/reservation/repo.go", change: "modified" }],
  checks: [
    {
      checkId: "unit",
      command: "go test ./internal/reservation/...",
      cwd: "/repo",
      status: "pass",
      exitCode: 0,
    },
  ],
  blockers: [],
  risks: ["Lock timeout fixed at 5s as specified; no test covers contention."],
  nextActions: [],
}

export const blocked = {
  ...card,
  outcome: "blocked",
  changes: [],
  checks: [],
  blockers: [{ kind: "packet", reason: "No write paths in the packet; the orchestrator must name them." }],
}

export const fenced = (value: unknown) => "```backend-result\n" + JSON.stringify(value, null, 2) + "\n```"
export const final = (value: unknown) => `Done. Changed the repository query and ran the unit check.\n\n${fenced(value)}`

export const seed = Effect.fn("TaskBackendResultTest.seed")(function* () {
  const session = yield* Session.Service
  const chat = yield* session.create({ title: "Backend result" })
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "maestro",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "maestro",
    agent: "maestro",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* session.updateMessage(assistant)
  return { chat, assistant }
})

export function ops(text: string, childMessageIDs: string[], error?: NonNullable<SessionV1.Assistant["error"]>): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        const id = MessageID.ascending()
        childMessageIDs.push(id)
        return {
          info: {
            id,
            role: "assistant" as const,
            parentID: input.messageID ?? MessageID.ascending(),
            sessionID: input.sessionID,
            mode: input.agent ?? "backend",
            agent: input.agent ?? "backend",
            cost: 0,
            path: { cwd: "/tmp", root: "/tmp" },
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: ref.modelID,
            providerID: ref.providerID,
            time: { created: Date.now() },
            finish: "stop",
            error,
          },
          parts: [{ id: PartID.ascending(), messageID: id, sessionID: input.sessionID, type: "text" as const, text }],
        }
      }),
  }
}

export const dispatch = Effect.fn("TaskBackendResultTest.dispatch")(function* (
  text: string,
  options?: {
    subagent?: string
    error?: NonNullable<SessionV1.Assistant["error"]>
    caller?: { agent: string; agentID: string }
    background?: boolean
    prompt?: TaskPromptOps["prompt"]
  },
) {
  const { chat, assistant } = yield* seed()
  const def = yield* (yield* TaskTool).init()
  const streamed: Record<string, unknown>[] = []
  const childMessageIDs: string[] = []
  const promptOps = ops(text, childMessageIDs, options?.error)
  const exit = yield* def
    .execute(
      {
        description: "implement repo query",
        prompt: "packet",
        subagent_type: options?.subagent ?? "backend",
        ...(options?.background ? { background: true } : {}),
      },
      {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: options?.caller?.agent ?? "maestro",
        agentID: options?.caller?.agentID ?? "maestro",
        abort: new AbortController().signal,
        extra: { promptOps: options?.prompt ? { ...promptOps, prompt: options.prompt } : promptOps },
        messages: [],
        metadata: (input) =>
          Effect.sync(() => {
            if (input.metadata) streamed.push(input.metadata)
          }),
        ask: () => Effect.void,
      },
    )
    .pipe(Effect.exit)
  return { exit, streamed, childMessageID: childMessageIDs[0], chat }
})

export const workResult = (metadata: object) => ("workResult" in metadata ? metadata.workResult : undefined)

export function requireOriginalTask(message: SessionMessage.Message | undefined, callID: string) {
  if (message?.type !== "assistant" || message.agent !== "maestro") throw new Error("actual native Task assistant missing")
  const calls = message.content.filter((part) => part.type === "tool" && part.id === callID)
  const call = calls[0]
  if (calls.length !== 1 || call?.type !== "tool" || call.name !== "task" || call.provider?.executed || !("structured" in call.state))
    throw new Error("actual native original Task call missing")
  return { call: { ...call, state: call.state },
    metadata: Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(call.state.structured.metadata) }
}

// Runs a background backend specialist Task whose child durably writes `text` as its final message, and returns the parent's
// completion notice: the existing background delivery (F4 cl.35) and the only place the final result can still land.
export const deliverBackground = Effect.fn("TaskBackendResultTest.deliverBackground")(function* (
  text: string,
  error?: NonNullable<SessionV1.Assistant["error"]>,
  subagent = "backend",
  projection: "legacy" | "native" | "dual" = "legacy",
) {
  const sessions = yield* Session.Service
  const jobs = yield* BackgroundJob.Service
  const notice = yield* Deferred.make<Parameters<TaskPromptOps["prompt"]>[0]>()
  const release = yield* Deferred.make<void>()
  const resumed = yield* Deferred.make<void>()
  const database = yield* Database.Service
  const events = yield* EventV2Bridge.Service
  const written: string[] = []
  const streamed: unknown[] = []
  const parent = yield* seed()
  const parameters = { description: "implement repo query", prompt: "packet", subagent_type: subagent, background: true }
  const callID = "actual-background-return"
  const original = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: parent.chat.id,
    messageID: parent.assistant.id, type: "tool", tool: "task", callID,
    state: { status: "running", input: parameters, time: { start: Date.now() }, metadata: {} } })
  const promptOps: TaskPromptOps = {
    cancel: () => Effect.void,
    resumeNotice: (sessionID) => Effect.gen(function* () {
      expect(sessionID).toBe(parent.chat.id)
      const row = yield* database.db.select().from(SessionMessageTable)
        .where(eq(SessionMessageTable.id, SessionMessage.ID.make(parent.assistant.id))).get().pipe(Effect.orDie)
      if (!row) throw new Error("actual native Task missing before resume")
      const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
      const metadata = requireOriginalTask(message, callID).metadata
      if (subagent === "archie") expect(metadata).toHaveProperty("upstreamSettlement")
      if (subagent !== "archie") expect(metadata).not.toHaveProperty("upstreamSettlement")
      yield* Deferred.succeed(resumed, undefined)
    }),
    resolvePromptParts: (value) => Effect.succeed([{ type: "text", text: value }]),
    prompt: (input) => Effect.gen(function* () {
      if (input.sessionID === parent.chat.id) {
        if (!input.messageID) throw new Error("actual notice identity missing")
        const messageID = input.messageID
        const identity = PromptIdentity.fromEncoded(Schema.encodeSync(SessionPrompt.PromptInput)(input))
        const previous = yield* sessions.reconcilePrompt({ sessionID: input.sessionID, messageID, identity })
        const user: SessionV1.User = { id: messageID, sessionID: input.sessionID, role: "user", agent: "maestro", model: ref,
          time: { created: Date.now() } }
        const admitted = previous ?? (yield* sessions.admitPrompt({ sessionID: input.sessionID, messageID,
          identityVersion: 1, identity, info: user, parts: input.parts.flatMap((part) => part.type === "text"
            ? [{ ...part, id: PartID.ascending(), messageID, sessionID: input.sessionID }] : []) })).message
        if (!input.noReply) {
          const stored = yield* sessions.getPart({ sessionID: parent.chat.id, messageID: parent.assistant.id, partID: original.id })
          if (subagent === "archie") expect(stored?.type === "tool" && "metadata" in stored.state && stored.state.metadata)
            .toHaveProperty("upstreamSettlement")
          yield* Deferred.succeed(notice, input)
        }
        return admitted
      }
      yield* Deferred.await(release)
      const returned = yield* ops(text, written, error).prompt(input)
      if (returned.info.role !== "assistant") throw new Error("actual background fixture assistant missing")
      const info = yield* sessions.updateMessage({
        ...returned.info,
        time: { ...returned.info.time, completed: Date.now() },
      })
      const parts = yield* Effect.forEach(returned.parts, (part) => sessions.updatePart(part))
      return { info, parts }
    }).pipe(Effect.orDie),
  }
  const tool = yield* TaskTool
  const definition = yield* tool.init()
  const result = yield* definition.execute(parameters, {
    sessionID: parent.chat.id, messageID: parent.assistant.id, callID, agent: "maestro", agentID: "maestro",
    abort: new AbortController().signal, extra: { promptOps }, messages: [], ask: () => Effect.void,
    // Match native callback: completion closes generic streaming metadata; private host observation must still persist.
    metadata: (value) => Effect.gen(function* () {
      if (value.metadata?.workResult !== undefined) streamed.push(value.metadata.workResult)
      const part = yield* sessions.getPart({ sessionID: parent.chat.id, messageID: parent.assistant.id, partID: original.id })
      if (part?.type !== "tool" || part.state.status !== "running") return
      yield* sessions.updatePart({ ...part, state: { ...part.state, ...value } })
    }),
  })
  yield* sessions.updatePart({ ...original, state: { status: "completed", input: parameters,
    title: result.title, output: result.output, metadata: result.metadata, time: { start: Date.now(), end: Date.now() } } })
  if (projection !== "legacy") {
    const base = { sessionID: parent.chat.id, assistantMessageID: SessionMessage.ID.make(parent.assistant.id), callID }
    yield* events.publish(SessionEvent.Step.Started, { ...base, agent: AgentV2.ID.make("maestro"),
      model: { id: ref.modelID, providerID: ref.providerID }, timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Input.Started, { ...base, name: "task", timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Called, { ...base, tool: "task", input: parameters,
      provider: { executed: false }, timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Success, { ...base, structured: { title: result.title, output: result.output,
      metadata: result.metadata }, content: [], provider: { executed: false }, timestamp: yield* DateTime.now })
    if (projection === "native") {
      // Seed's compatibility rows served initial TaskTool lookup; actual exit now has only the native original Task.
      yield* database.db.delete(PartTable).where(eq(PartTable.id, original.id)).run().pipe(Effect.orDie)
      yield* database.db.delete(MessageTable).where(eq(MessageTable.id, SessionV1.MessageID.make(parent.assistant.id))).run().pipe(Effect.orDie)
    }
  }
  yield* Deferred.succeed(release, undefined)
  yield* jobs.wait({ id: result.metadata.sessionId })
  const delivered = projection === "legacy"
    ? (yield* awaitWithTimeout(Deferred.await(notice), "actual background settlement did not resume parent")).parts[0]
    : undefined
  if (projection !== "legacy") yield* awaitWithTimeout(Deferred.await(resumed), "actual native private settlement did not resume parent")
  const retained = yield* sessions.getPart({ sessionID: parent.chat.id, messageID: parent.assistant.id, partID: original.id })
  const native = projection !== "legacy" ? yield* Effect.gen(function* () {
    const rows = yield* database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.session_id, parent.chat.id)).all().pipe(Effect.orDie)
    const messages = rows.map((row) => Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type }))
    const originalTask = requireOriginalTask(messages.find((message) => message.id === SessionMessage.ID.make(parent.assistant.id)), callID)
    const metadata = originalTask.metadata
    const receipt = subagent === "archie"
      ? Schema.decodeUnknownSync(SessionMessageUpdater.UpstreamSettlement)(metadata.upstreamSettlement)
      : undefined
    const notices = messages.filter((message) => message.type === "synthetic")
    if (!receipt) expect(notices).toHaveLength(1)
    const notice = receipt ? messages.find((message) => message.id === receipt.deliveryMessageID) : notices[0]
    if (notice?.type !== "synthetic") throw new Error("actual native synthetic projection missing")
    if (receipt) expect(metadata.workResult).toEqual(receipt.workResult)
    if (!receipt) expect(metadata).not.toHaveProperty("upstreamSettlement")
    return { call: originalTask.call, receipt, notice }
  }) : undefined
  return {
    started: result.metadata,
    childMessageID: written[0],
    workResult: native ? native.receipt?.workResult ?? streamed.at(-1)
      : delivered?.type === "text" ? delivered.metadata?.workResult : undefined,
    retained,
    native,
  }
})

// No writePaths in these dispatches: the host binds a read-only backend child and reports it, with the shell fact this
// host gives a child that ran no command.
export const shell = await Effect.runPromise(ToolSafetySandbox.status())
// Every backend Task binds a host-generated logical task (F2.11), and no Atlas Memory tool ran in these children.
export const host = {
  taskId: expect.stringMatching(/^tsk_/), memory: { reads: [], writes: [] },
  memberId: "backend", executionSessionId: expect.stringMatching(/^ses_/), authoritySessionId: expect.stringMatching(/^ses_/),
  mode: "delegated", acceptance: { state: "pending" }, verification: { state: "not-host-verified" },
}
// These child fixtures return/store text only: neither claimed file change nor claimed check has an actual tool call.
export const claimedEvidence = {
  changes: [{ index: 0, evidence: "unbound", callIDs: [] }],
  checks: [{ index: 0, evidence: "unbound", callIDs: [] }],
}
export const upstreamEmpty = {
  changes: [],
  checks: [],
  blockers: [],
  risks: [],
  nextActions: [],
  writeRoots: [],
  ...host, memberId: "archie",
  ...shell,
}
export const empty = { ...upstreamEmpty, ...host, workerEvidence: { changes: [], checks: [] } }
