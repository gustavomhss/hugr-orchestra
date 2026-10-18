import { expect } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { Cause, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventTable } from "@orchestra/core/event/sql"
import { Global } from "@orchestra/core/global"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { MessageTable, PartTable } from "@orchestra/core/session/sql"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { AppLayer } from "@/effect/app-runtime"
import { EventV2Bridge } from "@/event-v2-bridge"
import { ArsenalApproval } from "@/maestro/arsenal-approval"
import { Permission } from "@/permission"
import { SessionPrompt } from "@/session/prompt"
import { MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { InstanceState } from "@/effect/instance-state"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

const it = testEffect(Layer.merge(AppLayer, TestLLMServer.layer))
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
// Production bootstrap reads config before the test body, so install the provider first.
const testModel = (directory: string) => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  yield* Effect.promise(() => Bun.write(path.join(directory, "orchestra.json"), JSON.stringify({
    permission: { "*": "allow" },
    agent: { maestro: { permission: { "*": "allow" } } },
    provider: { test: {
      name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
      models: { "test-model": {
        id: "test-model", name: "Test", attachment: false, reasoning: false, temperature: false,
        tool_call: true, release_date: "2025-01-01", limit: { context: 100000, output: 10000 },
        cost: { input: 0, output: 0 }, options: {},
      } },
      options: { apiKey: "test-key", baseURL: llm.url },
    } },
  })))
})

it.instance("installed V1 prompt approval awaits real Asked queue; once/always/reject/interrupt preserve admission boundary", () =>
  Effect.gen(function* () {
    const llm = yield* TestLLMServer
    const sessions = yield* Session.Service
    const prompts = yield* SessionPrompt.Service
    const permissions = yield* Permission.Service
    const events = yield* EventV2Bridge.Service
    const database = yield* Database.Service
    const session = yield* sessions.create({ agent: "maestro", title: "Prompt approval" })
    const snapshot = {
      schema: "relay.hook.v1", name: "Prompt approval", binding: "host-required", installed: false,
      nodes: [
        { id: "prompt", name: "Prompt", type: RelayHook.NodeType.trigger, position: [0, 0],
          parameters: { operation: "prompt", timing: "before" } },
        { id: "approve", name: "Approve", type: RelayHook.NodeType.approve, position: [1, 0],
          parameters: { message: "Owner must decide." } },
        { id: "first", name: "First", type: RelayHook.NodeType.remind, position: [2, 0],
          parameters: { message: "First." } },
        { id: "second", name: "Second", type: RelayHook.NodeType.remind, position: [3, 0],
          parameters: { message: "Second." } },
      ],
      connections: [
        { from: "prompt", port: 0, to: "approve" },
        { from: "approve", port: 0, to: "first" },
        { from: "first", port: 0, to: "second" },
      ],
    }
    const binding = { data: Global.Path.data, projectID: session.projectID, principal: "user:test" }
    yield* Effect.acquireRelease(
      RelayHookInstall.install({ ...binding, document: snapshot.name, version: "v1", snapshot,
        sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") }),
      (installed) => RelayHookInstall.uninstall({ ...binding, installID: installed.install.installID }).pipe(Effect.orDie, Effect.asVoid),
    )
    const asked: Array<Schema.Schema.Type<typeof Permission.Event.Asked.data>> = []
    yield* events.listen((event) => Effect.sync(() => {
      if (event.type === Permission.Event.Asked.type)
        asked.push(Schema.decodeUnknownSync(Permission.Event.Asked.data)(event.data))
    }))
    const admissionState = Effect.gen(function* () {
      return {
        session: yield* sessions.get(session.id),
        messages: yield* database.db.select().from(MessageTable).all(),
        parts: yield* database.db.select().from(PartTable).all(),
        admissions: (yield* database.db.select().from(EventTable).all()).filter((row) => row.type === "session.v1.prompt.admitted.1"),
        calls: yield* llm.calls,
      }
    })
    yield* Effect.forEach(["once", "always", "reject", "interrupt", "once"] as const, (reply, index) =>
      Effect.gen(function* () {
        const before = yield* admissionState
        const request = { sessionID: session.id, messageID: MessageID.ascending(), model,
          noReply: index !== 4,
          parts: [{ type: "text" as const, text: `Prompt ${index}` }] }
        const pending = yield* prompts.prompt(request).pipe(Effect.forkScoped)
        const card = yield* pollWithTimeout(permissions.list().pipe(Effect.map((items) =>
          items.find((item) => item.metadata.messageID === request.messageID))), "Real prompt Asked queue missing")
        expect(asked).toHaveLength(index + 1)
        expect(asked[index]).toEqual(card)
        expect(card).toMatchObject({ sessionID: session.id, patterns: ["prompt"], always: [],
          metadata: { nativeSafety: true, action: "relay_hook", trigger: "prompt.before",
            messageID: request.messageID, projectID: session.projectID,
            message: "Hook 'Prompt approval' asks for approval: Owner must decide." } })
        expect(card.metadata).not.toHaveProperty("callID")
        expect(card.permission).toStartWith("arsenal-safety:")
        expect(new Set(asked.map((item) => item.permission)).size).toBe(index + 1)
        expect(yield* admissionState).toEqual(before)
        expect(yield* PromptAdmission.find(database.db, request.messageID)).toBeUndefined()
        if (reply === "interrupt") {
          yield* Fiber.interrupt(pending)
          const exit = yield* Fiber.await(pending)
          expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
        }
        if (reply !== "interrupt") {
          if (index === 4) yield* llm.text(`Accepted ${index}`)
          yield* permissions.reply({ requestID: card.id, reply })
          const exit = yield* Fiber.await(pending)
          if (reply !== "reject") yield* exit
          expect(Exit.isSuccess(exit)).toBe(reply !== "reject")
          if (reply === "reject") expect(exit).toMatchObject({ _tag: "Failure" })
        }
        expect(yield* permissions.list()).toEqual([])
        const decisions = (yield* database.db.select().from(EventTable).all())
          .filter((row) => row.type === "relay.hook.decided.1")
          .map((row) => Schema.decodeUnknownSync(RelayHook.Decided.data)(row.data))
          .filter((decision) => String(decision.messageID) === request.messageID)
        expect(decisions.map((decision) => decision.outcome)).toEqual(
          reply === "interrupt" ? ["cancelled"] : reply === "reject" ? ["rejected"] : ["approved", "reminded", "reminded"],
        )
        decisions.forEach((decision) => expect(decision).not.toHaveProperty("callID"))
        if (reply === "reject" || reply === "interrupt") {
          expect(yield* admissionState).toEqual(before)
          expect(yield* PromptAdmission.find(database.db, request.messageID)).toBeUndefined()
          return
        }
        const receipt = yield* PromptAdmission.find(database.db, request.messageID)
        expect(receipt?.snapshot.info).toMatchObject({ id: request.messageID, role: "user",
          promptContext: { reminders: ["Hook 'Prompt approval': First.", "Hook 'Prompt approval': Second."] } })
        expect(yield* llm.calls).toBe(before.calls + (index === 4 ? 1 : 0))
        if (index === 4) expect(JSON.stringify(yield* llm.inputs)).toContain(`Prompt ${index}`)
      }),
    )
  }), { git: true, init: testModel },
)

it.instance("V1 no-call exception rejects every invalid prompt tuple and placement before native Asked", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const permissions = yield* Permission.Service
    const events = yield* EventV2Bridge.Service
    const host = yield* ArsenalApproval.makeApprovalHost
    const session = yield* sessions.create()
    const asked: string[] = []
    yield* events.listen((event) => Effect.sync(() => {
      if (event.type === Permission.Event.Asked.type) asked.push(event.type)
    }))
    const request: ToolSafety.Approval = {
      action: "relay_hook", trigger: "prompt.before", messageID: MessageID.ascending(), resources: ["prompt"],
      invocation: { sessionID: session.id, projectID: session.projectID, directory: session.directory,
        tool: "", callID: "", args: {} },
    }
    const invalid: ToolSafety.Approval[] = [
      { ...request, action: "push" },
      { ...request, trigger: undefined },
      { ...request, trigger: "prompt.after" },
      { ...request, trigger: "session-start.after" },
      { ...request, messageID: undefined },
      { ...request, messageID: "" },
      { ...request, messageID: "   " },
      { ...request, messageID: "not-a-message" },
      { ...request, messageID: "msg_bad\0" },
      { ...request, resources: [] },
      { ...request, resources: ["prompt", "prompt"] },
      { ...request, resources: ["other"] },
      { ...request, invocation: { ...request.invocation, tool: "bash", args: { command: "echo hi" } } },
      { ...request, invocation: { ...request.invocation, projectID: "wrong-project" } },
      { ...request, invocation: { ...request.invocation, directory: `${session.directory}/wrong` } },
      { ...request, invocation: { ...request.invocation, sessionID: "ses_missing" } },
    ]
    yield* Effect.forEach(invalid, (input) => Effect.gen(function* () {
      const result: unknown = yield* host.ask(input).pipe(Effect.result, Effect.timeout("2 seconds"))
      expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "ToolSafety.Denied" } })
      expect(yield* permissions.list()).toEqual([])
      expect(asked).toEqual([])
    }))
    // Positive control: this same host and listener must see a valid request in the real queue.
    const pending = yield* host.ask(request).pipe(Effect.forkScoped)
    const card = yield* pollWithTimeout(permissions.list().pipe(Effect.map((items) => items[0])), "Control ask missing")
    expect(asked).toEqual([Permission.Event.Asked.type])
    yield* permissions.reply({ requestID: card.id, reply: "once" })
    yield* Fiber.join(pending)
    expect(yield* permissions.list()).toEqual([])
  }), { git: true },
)

// The desktop's V1 Sessions fire installed `session-start` and `session-idle` hooks and record them as V2 does.
it.instance("V1 Sessions record installed session-start and session-idle hooks, which never undo the Session", () =>
  Effect.gen(function* () {
    const llm = yield* TestLLMServer
    const sessions = yield* Session.Service
    const prompts = yield* SessionPrompt.Service
    const database = yield* Database.Service
    const binding = { data: Global.Path.data, projectID: (yield* InstanceState.context).project.id, principal: "user:test" }
    const snapshot = (name: string, operation: string, steps: ReadonlyArray<readonly [string, RelayHook.NodeType]>) => ({
      schema: "relay.hook.v1", name, binding: "host-required", installed: false,
      nodes: [
        { id: "event", name: "Event", type: RelayHook.NodeType.trigger, position: [0, 0],
          parameters: { operation, timing: "after" } },
        ...steps.map(([id, type], index) => ({ id, name: id, type, position: [index + 1, 0],
          parameters: { message: `${name} ${id}.` } })),
      ],
      connections: steps.map(([id], index) => ({ from: index === 0 ? "event" : steps[index - 1]![0], port: 0, to: id })),
    })
    yield* Effect.forEach([
      snapshot("Start", "session-start", [["note", RelayHook.NodeType.record], ["fix", RelayHook.NodeType.repair]]),
      snapshot("Stop", "session-idle", [["note", RelayHook.NodeType.record]]),
    ], (item) => Effect.acquireRelease(
      RelayHookInstall.install({ ...binding, document: item.name, version: "v1", snapshot: item,
        sha256: createHash("sha256").update(JSON.stringify(item)).digest("hex") }),
      (installed) => RelayHookInstall.uninstall({ ...binding, installID: installed.install.installID }).pipe(Effect.orDie, Effect.asVoid),
    ), { discard: true })
    // They run beside the Session, so their decisions arrive after it.
    const decisions = (sessionID: string, count: number) => pollWithTimeout(
      database.db.select().from(EventTable).all().pipe(Effect.map((rows) => {
        const found = rows.filter((row) => row.type === "relay.hook.decided.1")
          .map((row) => Schema.decodeUnknownSync(RelayHook.Decided.data)(row.data))
          .filter((decision) => decision.sessionID === sessionID)
          .map((decision) => [decision.nodeID, decision.action, decision.outcome, decision.trigger])
        return found.length >= count ? found : undefined
      })), "Session hook decisions were not recorded", "20 seconds")
    const session = yield* sessions.create({ agent: "maestro", title: "Session hooks" })
    expect(yield* decisions(session.id, 2)).toEqual([
      ["note", "record", "recorded", "session-start.after"],
      ["fix", "repair", "repair-required", "session-start.after"],
    ])
    // The Repair has nothing to refuse after the event: the Session stays.
    expect((yield* sessions.get(session.id)).id).toBe(session.id)
    yield* llm.text("Done.")
    yield* prompts.prompt({ sessionID: session.id, messageID: MessageID.ascending(), model,
      parts: [{ type: "text", text: "Hello" }] })
    expect((yield* decisions(session.id, 3)).slice(2)).toEqual([["note", "record", "recorded", "session-idle.after"]])
  }), { git: true, init: testModel }, 60_000,
)
