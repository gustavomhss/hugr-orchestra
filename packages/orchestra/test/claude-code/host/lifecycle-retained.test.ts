import { expect } from "bun:test"
import path from "node:path"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect, Exit } from "effect"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeHostAdmission } from "@/claude-code/host/admission"
import { ClaudeHostBoundary } from "@/claude-code/host/boundary"
import { recordAdmission, readAdmission } from "@/maestro/admission-record"
import { recordPlanRevision, readPlanRevision } from "@/maestro/plan-revision"
import { LogicalTask } from "@/maestro/logical-task"
import { MessageID, PartID } from "@/session/schema"
import { SessionRevert } from "@/session/revert"
import { Todo } from "@/session/todo"
import { TestInstance } from "../../fixture/fixture"
import { ClaudeEngineFixture } from "../engine-fixture"

const produce = Effect.fnUntraced(function* (f: Effect.Success<ReturnType<typeof ClaudeEngineFixture.setup>>,
  user: SessionV1.User, assistant: SessionV1.Assistant, goal: string) {
  yield* recordAdmission({ sessionID: f.chat.id, messageID: user.id, methodVersion: "admit-request-v1", assessment: {
    kind: "work", goal, known: [], proposals: [], unknowns: [], uncertainty: "none", activeWorkEffect: "none", reason: "Explicit work request." } })
  const revision = yield* recordPlanRevision({ sessionID: f.chat.id, admissionMessageID: user.id, methodVersion: "plan-v1",
    goal: { value: goal, source: "stakeholder" }, acceptance: [{ value: `${goal}-ACCEPT`, source: "stakeholder" }],
    scope: [], constraints: [], reviewRequirement: { value: "Cold review", source: "maestro" },
    contextRequirement: "PENDING", assumptions: [], risks: [] })
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: assistant.id,
    type: "tool", tool: "maestro_record_plan_revision", callID: `plan-${goal}`, state: { status: "completed",
      input: { admissionMessageID: user.id }, output: revision.id, title: goal,
      metadata: { planRevisionID: revision.id, revisionHash: revision.revisionHash }, time: { start: 1, end: 2 } } })
  return revision
})

for (const mode of ["fork", "revert"] as const)
  ClaudeEngineFixture.it.instance(`${mode} preserves trusted historical plan lineage and excludes future producers after native init`, () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const f = yield* ClaudeEngineFixture.setup()
      const host = yield* ClaudeHost.Service
      const revert = yield* SessionRevert.Service
      const todos = yield* Todo.Service
      ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("kept", "future"),
        async function* (input, params) {
          for await (const message of ClaudeEngineFixture.replies("continued")(input, params))
            yield { ...message as Record<string, unknown>, session_id: params.options?.sessionId ?? "sdk-1" }
        })
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("retained admission") })
      const first = (yield* f.sessions.messages({ sessionID: f.chat.id })).find((message) => message.info.role === "user")
      const kept = (yield* f.sessions.messages({ sessionID: f.chat.id })).findLast((message) => message.info.role === "assistant")
      if (first?.info.role !== "user" || kept?.info.role !== "assistant") throw new Error("Missing kept producer")
      const original = yield* produce(f, first.info, kept.info, "KEPT-PLAN")
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("future admission") })
      const later = (yield* f.sessions.messages({ sessionID: f.chat.id })).findLast((message) => message.info.role === "user")
      const future = (yield* f.sessions.messages({ sessionID: f.chat.id })).findLast((message) => message.info.role === "assistant")
      if (later?.info.role !== "user" || future?.info.role !== "assistant") throw new Error("Missing future producer")
      const excluded = yield* produce(f, later.info, future.info, "FUTURE-PLAN")
      const child = yield* f.sessions.create({ parentID: f.chat.id, agent: "backend", title: "FUTURE-TASK" })
      yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: f.chat.id,
        projectID: f.chat.projectID, memberID: "backend", source: "user", taskId: "FUTURE-TASK" })
      yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: future.info.id,
        type: "tool", tool: "Agent", callID: "future-task", state: { status: "completed", input: {}, output: "FUTURE-TASK",
          title: "Future task", metadata: { sessionId: child.id }, time: { start: 1, end: 2 } } })
      yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: future.info.id,
        type: "tool", tool: "TodoWrite", callID: "future-todos", state: { status: "completed", input: {}, output: "saved",
          title: "Future todos", metadata: { todos: [{ content: "FUTURE-TODO", status: "pending", priority: "high" }] }, time: { start: 1, end: 2 } } })
      yield* todos.update({ sessionID: f.chat.id, todos: [{ content: "FUTURE-SIDE-TODO", status: "pending", priority: "high" }] })
      const target = mode === "fork"
        ? yield* f.sessions.fork({ sessionID: f.chat.id, messageID: later.info.id })
        : yield* revert.revert({ sessionID: f.chat.id, messageID: later.info.id })
      yield* f.prompt.prompt({ sessionID: target.id, ...ClaudeEngineFixture.say("continue retained view") })
      const session = yield* f.sessions.get(target.id)
      const view = ClaudeHostBoundary.retained(session, yield* f.sessions.messages({ sessionID: target.id }))
      expect(session.revert).toBeUndefined()
      expect(session.metadata?.claudeCode?.resumeAt).toBeUndefined()
      expect(view.cut).toBe(true)
      expect(view.lineage?.kind).toBe(mode)
      expect(JSON.stringify(view.history)).not.toContain("FUTURE-TASK")
      expect(JSON.stringify(view.history)).not.toContain("FUTURE-TODO")
      expect(JSON.stringify(view.history)).not.toContain(excluded.id)
      expect(JSON.stringify(view.history)).toContain(original.id)
      // The table remains ahead of the retained view: cut=true forbids its fallback, including with no snapshot.
      if (mode === "revert") expect(JSON.stringify(yield* todos.get(target.id))).toContain("FUTURE-SIDE-TODO")
      const reference = ClaudeHostBoundary.reference(view, { projectID: f.chat.projectID, sessionID: f.chat.id,
        admissionMessageID: first.info.id, producerMessageID: kept.info.id })
      expect(reference.historical).toBe(mode === "fork")
      expect(reference.producer.parts.some((part) => part.type === "tool" && part.state.status === "completed" &&
        part.state.input.admissionMessageID === original.admissionMessageID)).toBe(true)
      expect(ClaudeHostBoundary.origins(view, reference.producer.info.id)).toContainEqual({
        projectID: f.chat.projectID, sessionID: f.chat.id, messageID: kept.info.id })
      expect(yield* readPlanRevision(original.id)).toEqual(original)
      expect(yield* readAdmission({ sessionID: original.sessionID, messageID: original.admissionMessageID,
        methodVersion: "admit-request-v1" })).toMatchObject({ outcome: "READY_TO_DRAFT" })
      expect(() => ClaudeHostBoundary.reference(view, { ...reference.source, producerMessageID: future!.info.id }))
        .toThrow("NATIVE_SOURCE_MESSAGES_UNPROVABLE")
      expect(() => ClaudeHostBoundary.reference(view, { ...reference.source, projectID: "foreign-project" }))
        .toThrow(ClaudeHostBoundary.UnprovableNativeLineage)
      if (mode === "fork") {
        expect(reference.admission.info.id).not.toBe(first.info.id)
        const nested = yield* f.sessions.fork({ sessionID: target.id })
        const nestedView = ClaudeHostBoundary.retained(nested, yield* f.sessions.messages({ sessionID: nested.id }))
        expect(ClaudeHostBoundary.reference(nestedView, reference.source).historical).toBe(true)
        const stripped = { ...session, metadata: { claudeCode: { sessionId: session.metadata?.claudeCode?.sessionId } } }
        expect(() => ClaudeHostBoundary.reference(ClaudeHostBoundary.retained(stripped, view.history), reference.source))
          .toThrow("NATIVE_SOURCE_MESSAGES_UNPROVABLE")
      }
      yield* host.release(f.chat.id)
      yield* host.release(target.id)
    }), 30_000)

ClaudeEngineFixture.it.instance("forking an uncleared revert refuses the unretained clone map by name", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const f = yield* ClaudeEngineFixture.setup()
    yield* ClaudeHost.Service
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("kept", "future"))
    yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("keep") })
    yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("cut") })
    const later = (yield* f.sessions.messages({ sessionID: f.chat.id })).findLast((message) => message.info.role === "user")
    if (!later) throw new Error("Missing revert boundary")
    const revert = yield* SessionRevert.Service
    yield* revert.revert({ sessionID: f.chat.id, messageID: later.info.id })
    const result = yield* f.sessions.fork({ sessionID: f.chat.id }).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    expect(String(result)).toContain("NATIVE_FORK_MESSAGES_UNPROVABLE")
  }), 30_000)

for (const engine of ["claude-code", "orchestra"] as const)
  ClaudeEngineFixture.it.instance(`direct jimmy ${engine} turn refuses only the unsupported native admission before query`, () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const f = yield* ClaudeEngineFixture.setup()
      const instance = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(instance.directory, "orchestra.json"), JSON.stringify({
        agent: { jimmy: { engine, model: "anthropic/claude-haiku-4-5-20251001" } },
      })))
      const user = yield* f.sessions.updateMessage({ id: MessageID.ascending(), sessionID: f.chat.id, role: "user",
        agent: "jimmy", model: { providerID: "anthropic", modelID: "claude-haiku-4-5-20251001" } as SessionV1.User["model"], time: { created: Date.now() } })
      const host = yield* ClaudeHost.Service
      const result = yield* host.turn({ sessionID: f.chat.id, user }).pipe(Effect.exit)
      expect(ClaudeEngineFixture.state.queries).toEqual([])
      if (engine === "orchestra") return expect(result).toEqual(Exit.succeed(false))
      expect(Exit.isFailure(result)).toBe(true)
      expect(String(result)).toContain(ClaudeHostAdmission.UnsupportedNativeAdmission.name)
      expect(String(result)).toContain("NATIVE_JIMMY_ADMISSION_UNSUPPORTED")
    }), 30_000)
