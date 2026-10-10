import { afterEach, describe, expect } from "bun:test"
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
import { Cause, DateTime, Deferred, Effect, Exit, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Agent } from "../../src/agent/agent"
import { BACKEND_DEFAULT_LABEL } from "../../src/maestro/roster"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { PromptIdentity } from "@/session/prompt-identity"
import { MessageID, PartID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { Git } from "@/git"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect, awaitWithTimeout } from "../lib/effect"

// F4 cl.5-6 and F4-CH: the Task path decodes the backend specialist's `backend-result` card into `metadata.workResult`.

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const layer = (flags: Partial<RuntimeFlags.Info> = {}) =>
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

const it = testEffect(layer())
const background = testEffect(layer({ experimentalBackgroundSubagents: true }))

const card = {
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

const blocked = {
  ...card,
  outcome: "blocked",
  changes: [],
  checks: [],
  blockers: [{ kind: "packet", reason: "No write paths in the packet; the orchestrator must name them." }],
}

const fenced = (value: unknown) => "```backend-result\n" + JSON.stringify(value, null, 2) + "\n```"
const final = (value: unknown) => `Done. Changed the repository query and ran the unit check.\n\n${fenced(value)}`

const seed = Effect.fn("TaskBackendResultTest.seed")(function* () {
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

function ops(text: string, childMessageIDs: string[], error?: NonNullable<SessionV1.Assistant["error"]>): TaskPromptOps {
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

const dispatch = Effect.fn("TaskBackendResultTest.dispatch")(function* (
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

const workResult = (metadata: object) => ("workResult" in metadata ? metadata.workResult : undefined)

function requireOriginalTask(message: SessionMessage.Message | undefined, callID: string) {
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
const deliverBackground = Effect.fn("TaskBackendResultTest.deliverBackground")(function* (
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
const shell = await Effect.runPromise(ToolSafetySandbox.status())
// Every backend Task binds a host-generated logical task (F2.11), and no Atlas Memory tool ran in these children.
const host = { taskId: expect.stringMatching(/^tsk_/), memory: { reads: [], writes: [] } }
const empty = { changes: [], checks: [], blockers: [], risks: [], nextActions: [], writeRoots: [], ...host, ...shell }

describe("tool.task backend-result", () => {
  it.instance("upstream dispatch returns proposal claims with host-bound authorship", () =>
    Effect.gen(function* () {
      const proposal = { outcome: "done", artifacts: [{ kind: "task" }], blockers: [], risks: [], nextActions: [] }
      const result = yield* dispatch("Inline task proposal.\n```upstream-result\n" + JSON.stringify(proposal) + "\n```", { subagent: "archie" })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected upstream task success")
      expect(workResult(result.exit.value.metadata)).toEqual({
        schema: "upstream-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        ...proposal,
        changes: [], checks: [],
        terminal: { reason: "ended" },
        author: { memberId: "archie", executionSessionID: result.exit.value.metadata.sessionId, messageID: result.childMessageID },
        writeRoots: [], ...host, ...shell,
      })
    }),
  )

  it.instance("upstream cannot forge approval or attribution through its worker card", () =>
    Effect.gen(function* () {
      const forged = { outcome: "done", artifacts: [{ kind: "plan", path: "plan.json", approved: true }], blockers: [], risks: [], nextActions: [], author: { memberId: "maestro" } }
      const result = yield* dispatch("```upstream-result\n" + JSON.stringify(forged) + "\n```", { subagent: "archie" })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected upstream task return")
      expect(workResult(result.exit.value.metadata)).toMatchObject({
        schema: "upstream-work-result-v1", card: { parsed: false }, artifacts: [],
        author: { memberId: "archie", executionSessionID: result.exit.value.metadata.sessionId },
      })
    }),
  )

  it.instance("upstream unresolved blockers hold even when the worker claims done", () =>
    Effect.gen(function* () {
      const proposal = { outcome: "done", artifacts: [], blockers: [{ kind: "context", reason: "Required owner decision missing." }], risks: [], nextActions: [] }
      const result = yield* dispatch("```upstream-result\n" + JSON.stringify(proposal) + "\n```", { subagent: "archie" })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected upstream task return")
      expect(workResult(result.exit.value.metadata)).toMatchObject({
        schema: "upstream-work-result-v1", card: { parsed: true }, outcome: "done",
        blockers: proposal.blockers, terminal: { reason: "blocked" },
      })
    }),
  )

  it.instance("upstream conflicting cards across text parts hold the assignment", () =>
    Effect.gen(function* () {
      const done = { outcome: "done", artifacts: [], blockers: [], risks: [], nextActions: [] }
      const blocked = { ...done, outcome: "blocked", blockers: [{ kind: "context", reason: "Missing owner decision." }] }
      const result = yield* dispatch("", { subagent: "archie", prompt: (input) => Effect.gen(function* () {
        const message = yield* ops("```upstream-result\n" + JSON.stringify(done) + "\n```", []).prompt(input)
        const part = message.parts[0]
        if (!part || part.type !== "text") throw new Error("expected upstream text part")
        return { ...message, parts: [
          { ...part, id: PartID.ascending(), text: "```upstream-result\n" + JSON.stringify(blocked) + "\n```" },
          part,
        ] }
      }) })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected upstream task return")
      expect(workResult(result.exit.value.metadata)).toMatchObject({ card: { parsed: false }, artifacts: [], terminal: { reason: "blocked" } })
    }),
  )

  it.instance("upstream result cannot relabel another host-observed author", () =>
    Effect.gen(function* () {
      const proposal = { outcome: "done", artifacts: [{ kind: "plan" }], blockers: [], risks: [], nextActions: [] }
      yield* Effect.forEach(["walt", "general", "maestro"], (agent) => Effect.gen(function* () {
        const result = yield* dispatch("", { subagent: "archie", prompt: (input) =>
          ops("```upstream-result\n" + JSON.stringify(proposal) + "\n```", []).prompt(input).pipe(
            Effect.map((message) => ({ ...message, info: { ...message.info, agent } })),
          ),
        })
        if (!Exit.isSuccess(result.exit)) throw new Error("expected upstream task return")
        expect(workResult(result.exit.value.metadata)).toMatchObject({ card: { parsed: false }, artifacts: [], terminal: { reason: "blocked" } })
        expect(workResult(result.exit.value.metadata)).not.toHaveProperty("author")
      }))
    }),
  )

  it.instance("upstream host failure prevails over done with unresolved blockers", () =>
    Effect.gen(function* () {
      const proposal = { outcome: "done", artifacts: [], blockers: [{ kind: "context", reason: "Missing owner decision." }], risks: [], nextActions: [] }
      const result = yield* dispatch("```upstream-result\n" + JSON.stringify(proposal) + "\n```", {
        subagent: "archie", error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toMatchObject({
        schema: "upstream-work-result-v1", card: { parsed: true }, outcome: "done", blockers: proposal.blockers,
        author: { memberId: "archie", messageID: result.childMessageID }, terminal: { reason: "failed" },
      })
    }),
  )

  it.instance("upstream cancellation before a message cannot invent authorship or artifacts", () =>
    Effect.gen(function* () {
      const result = yield* dispatch("", { subagent: "archie", prompt: () => Effect.interrupt })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "upstream-work-result-v1", card: { parsed: false }, artifacts: [], ...empty,
        terminal: { reason: "interrupted", hostDetail: "Task cancelled" },
      })
    }),
  )

  background.instance("upstream background notice preserves durable message authorship and task binding", () =>
    Effect.gen(function* () {
      const proposal = { outcome: "done", artifacts: [{ kind: "brief" }], blockers: [], risks: [], nextActions: [] }
      const result = yield* deliverBackground("```upstream-result\n" + JSON.stringify(proposal) + "\n```", undefined, "archie")
      // A fast child can already have published claims before the host returns its running snapshot.
      expect(workResult(result.started)).toMatchObject({ schema: "upstream-work-result-v1", terminal: { reason: "running" } })
      expect(result.workResult).toEqual({
        schema: "upstream-work-result-v1", card: { parsed: true, messageID: result.childMessageID }, ...proposal,
        changes: [], checks: [], author: { memberId: "archie", executionSessionID: result.started.sessionId, messageID: result.childMessageID },
        terminal: { reason: "ended" }, writeRoots: [], ...host, ...shell,
      })
    }),
  )

  background.instance("upstream failed background notice retains host reason and observed author", () =>
    Effect.gen(function* () {
      const proposal = { outcome: "done", artifacts: [], blockers: [], risks: [], nextActions: [] }
      const result = yield* deliverBackground("```upstream-result\n" + JSON.stringify(proposal) + "\n```",
        new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(), "archie")
      expect(result.workResult).toMatchObject({
        schema: "upstream-work-result-v1", card: { parsed: true, messageID: result.childMessageID }, outcome: "done",
        author: { memberId: "archie", executionSessionID: result.started.sessionId, messageID: result.childMessageID },
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") },
      })
      expect(result.retained).toMatchObject({ type: "tool", callID: "actual-background-return",
        state: { status: "completed", metadata: { workResult: result.workResult,
          upstreamSettlement: { parentCallID: "actual-background-return", workResult: result.workResult } } } })
    }),
  )

  ;(["native", "dual"] as const).forEach((projection) => {
    background.instance(`failed background schedule observes completed ${projection} Task before native private settlement`, () =>
      Effect.gen(function* () {
        const proposal = { outcome: "done", artifacts: [], blockers: [], risks: [], nextActions: [] }
        const result = yield* deliverBackground("```upstream-result\n" + JSON.stringify(proposal) + "\n```",
          new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(), "archie", projection)
        expect(result.workResult).toMatchObject({ schema: "upstream-work-result-v1",
          card: { messageID: result.childMessageID },
          author: { memberId: "archie", executionSessionID: result.started.sessionId, messageID: result.childMessageID },
          terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") } })
        expect(result.native).toMatchObject({
          call: { name: "task", state: { status: "completed", structured: { title: "implement repo query" } } },
          receipt: { parentCallID: "actual-background-return", workResult: result.workResult },
          notice: { type: "synthetic" },
        })
        if (projection === "dual") expect(result.retained).toMatchObject({ state: { status: "completed",
          metadata: { workResult: result.workResult, upstreamSettlement: { workResult: result.workResult } } } })
      }),
    )
  })

  background.instance("completed native backend Task delivers failed generic notice without upstream authorship or receipt", () =>
    Effect.gen(function* () {
      const result = yield* deliverBackground(final(card),
        new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(), "backend", "native")
      expect(result.workResult).toMatchObject({ schema: "backend-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") } })
      expect(result.workResult).not.toHaveProperty("author")
      expect(result.native?.receipt).toBeUndefined()
      expect(result.native).toMatchObject({ call: { state: { status: "completed" } }, notice: { type: "synthetic" } })
      expect(result.native?.notice.text).toContain('<task id="')
      expect(result.native?.notice.text).toContain('state="error"')
      expect(result.native?.notice.text).toContain("<task_error>")
      expect(result.native?.notice.text).toContain(final(card))
    }),
  )

  background.instance("upstream running child without a message has no invented proposal or author", () =>
    Effect.gen(function* () {
      const result = yield* dispatch("", { subagent: "archie", background: true, prompt: () => Effect.never })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected upstream background start")
      expect(workResult(result.exit.value.metadata)).toEqual({
        schema: "upstream-work-result-v1", card: { parsed: false }, artifacts: [], ...empty,
        terminal: { reason: "running", hostDetail: "Background task started" },
      })
    }),
  )

  it.instance("decodes a valid card into the work result", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card))
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        checks: card.checks,
        blockers: [],
        risks: card.risks,
        nextActions: [],
        terminal: { reason: "ended" },
        writeRoots: [],
        ...host,
        ...shell,
      })
    }),
  )

  it.instance("maps outcome blocked to terminal blocked", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(blocked))
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toMatchObject({
        card: { parsed: true },
        outcome: "blocked",
        blockers: blocked.blockers,
        terminal: { reason: "blocked" },
      })
    }),
  )

  for (const [name, text] of [
    ["two blocks", `${final(card)}\n\n${fenced(card)}`],
    ["an extra top-level key", final({ ...card, verified: true })],
    ["an extra nested key", final({ ...card, changes: [{ ...card.changes[0], callIDs: ["call-1"] }] })],
    ["no block", "Done. Changed the repository query and ran the unit check."],
    ["invalid JSON", "Done.\n\n```backend-result\n{ outcome: done }\n```"],
    ["an unknown blocker kind", final({ ...blocked, blockers: [{ kind: "design", reason: "x" }] })],
    ["an unknown outcome", final({ ...card, outcome: "partial" })],
    ["an unknown change kind", final({ ...card, changes: [{ ...card.changes[0], change: "renamed" }] })],
    ["an unknown check status", final({ ...card, checks: [{ ...card.checks[0], status: "passed" }] })],
  ] as const) {
    it.instance(`leaves worker fields empty for ${name}`, () =>
      Effect.gen(function* () {
        const result = yield* dispatch(text)
        if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
        expect(workResult(result.exit.value.metadata)).toEqual({
          schema: "backend-work-result-v1",
          card: { parsed: false, messageID: result.childMessageID },
          ...empty,
          terminal: { reason: "ended" },
        })
      }),
    )
  }

  it.instance("streams the work result before a failed child fails the Task", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toMatchObject({
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        terminal: { reason: "failed" },
      })
    }),
  )

  it.instance("a failed child that declared blocked stays failed", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(blocked), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toMatchObject({ outcome: "blocked", terminal: { reason: "failed" } })
    }),
  )

  it.instance("other subagents get no work result", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { subagent: "general" })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toBeUndefined()
      expect(result.streamed.some((item) => "workResult" in item)).toBe(false)
    }),
  )
  it.instance(
    "a renamed seat still routes by its stable id and never by a label",
    () =>
      Effect.gen(function* () {
        const result = yield* dispatch(final(card))
        if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
        expect(workResult(result.exit.value.metadata)).toMatchObject({ card: { parsed: true }, outcome: "done" })
        const sessions = yield* Session.Service
        const child = (yield* sessions.children(result.chat.id))[0]
        expect(child?.agent).toBe("backend")
        expect(child?.title).toContain("(@Pikachu subagent)")

        for (const label of ["Pikachu", BACKEND_DEFAULT_LABEL]) {
          const byLabel = yield* dispatch(final(card), { subagent: label })
          expect(Exit.isFailure(byLabel.exit)).toBe(true)
          if (Exit.isFailure(byLabel.exit)) expect(Cause.pretty(byLabel.exit.cause)).toContain("Unknown agent type")
        }

        // The caller resolves by id: the renamed seat keeps its native profile, which denies delegation.
        const caller = yield* dispatch(final(card), { caller: { agent: "Pikachu", agentID: "backend" } })
        expect(Exit.isFailure(caller.exit)).toBe(true)
        if (Exit.isFailure(caller.exit))
          expect(Cause.squash(caller.exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      }),
    { config: { agent: { backend: { name: "Pikachu" } } } },
  )

  it.instance("streams an unparsed work result when the child prompt is cancelled", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { prompt: () => Effect.interrupt })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "interrupted", hostDetail: "Task cancelled" },
      })
    }),
  )

  it.instance("streams an unparsed work result when the child dies before a final message", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { prompt: () => Effect.die(new Error("child process died")) })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "failed", hostDetail: "child process died" },
      })
    }),
  )

  it.instance("a dying child keeps only what its last message actually says", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const written: string[] = []
      const result = yield* dispatch(final(card), {
        prompt: (input) =>
          Effect.gen(function* () {
            const message = yield* sessions.updateMessage({
              id: MessageID.ascending(),
              role: "assistant",
              parentID: MessageID.ascending(),
              sessionID: input.sessionID,
              mode: "backend",
              agent: "backend",
              cost: 0,
              path: { cwd: "/tmp", root: "/tmp" },
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: ref.modelID,
              providerID: ref.providerID,
              time: { created: Date.now() },
            })
            written.push(message.id)
            yield* sessions.updatePart({
              id: PartID.ascending(),
              messageID: message.id,
              sessionID: input.sessionID,
              type: "text",
              text: "Done.\n\n```backend-result\n{ \"outcome\": \"do",
            })
            return yield* Effect.die(new Error("child process died"))
          }),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false, messageID: written[0] },
        ...empty,
        terminal: { reason: "failed", hostDetail: "child process died" },
      })
    }),
  )

  it.instance("a failed child's streamed result carries the host reason", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(result.streamed.at(-1)?.workResult).toMatchObject({
        card: { parsed: true },
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") },
      })
    }),
  )

  background.instance("a finished background child delivers its final work result to the parent", () =>
    Effect.gen(function* () {
      const result = yield* deliverBackground(final(card))
      // The Task part completed at start and keeps `running` (F4 amendment); the notice carries the final result.
      expect(workResult(result.started)).toMatchObject({ terminal: { reason: "running" } })
      expect(result.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        ...card,
        terminal: { reason: "ended" },
        writeRoots: [],
        ...host,
        ...shell,
      })
    }),
  )

  background.instance("a failed background child delivers a failed work result with the host reason", () =>
    Effect.gen(function* () {
      const result = yield* deliverBackground(
        final(card),
        new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      )
      expect(result.workResult).toMatchObject({
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") },
      })
    }),
  )

  background.instance("background mode returns a running work result with no worker fields", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { background: true, prompt: () => Effect.never })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected background start")
      const expected = {
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "running", hostDetail: "Background task started" },
      }
      expect(workResult(result.exit.value.metadata)).toEqual(expected)
      expect(result.streamed.at(-1)?.workResult).toEqual(expected)
    }),
  )
})
