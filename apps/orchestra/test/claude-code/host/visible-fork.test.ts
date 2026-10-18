import { expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Effect, Exit } from "effect"
import { Agent } from "@/agent/agent"
import { ClaudeHostBoundary } from "@/claude-code/host/boundary"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { ClaudeHost } from "@/claude-code/host/session"
import { Config } from "@/config/config"
import { Archive } from "@/continuity/archive"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { readAdmission } from "@/maestro/admission-record"
import { readPlanRevision } from "@/maestro/plan-revision"
import { SessionRevert } from "@/session/revert"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Todo } from "@/session/todo"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { testEffect } from "../../lib/effect"
import { CompactionFixture } from "./compaction-fixture"

// Real Session, revert, lifecycle owner and compaction readers. No query or model turn is needed.
const it = testEffect(TestAppNodeBuilder.build(
  LayerNode.group([ClaudeHost.node, SessionRevert.node, SessionProjector.node, Archive.node, Session.node,
    FSUtil.node, Todo.node, Agent.node, Database.node, EventV2Bridge.node, Config.node, Git.node, filesystem]),
  [[RuntimeFlags.node, RuntimeFlags.layer({})]],
))

const make = Effect.fnUntraced(function* (native = true) {
  const f = yield* CompactionFixture.make()
  if (!f.user || !f.assistant) throw new Error("Missing source messages")
  const firstUser = f.user
  const firstAssistant = f.assistant
  const turns = yield* Effect.forEach(["kept", "reverted", "future"], (label, index) => Effect.gen(function* () {
    const user = index === 0 ? firstUser : yield* f.nextUser()
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: user.id,
      type: "text", text: `${label} request 🦴\r\nexact trailing blanks  ` })
    const assistant = index === 0 ? firstAssistant : yield* f.nextAssistant(user)
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: assistant.id,
      type: "text", text: `${label} answer` })
    return { user, assistant }
  }))
  const kept = yield* f.plan("KEPT-PLAN", turns[0].user, turns[0].assistant)
  const future = yield* f.plan("FUTURE-PLAN", turns[1].user, turns[1].assistant)
  yield* f.sessions.setMetadata({ sessionID: f.chat.id, metadata: native ? { claudeCode: {
    sessionId: "native-source", chain: "native-future", starts: {
      [turns[1].user.id]: "native-kept", [turns[2].user.id]: "native-future",
    }, ends: { [turns[0].user.id]: "native-kept", [turns[1].user.id]: "native-future" },
  } } : {} })
  const history = yield* f.sessions.messages({ sessionID: f.chat.id })
  expect(history.map((message) => message.info.id)).toEqual(turns.flatMap((turn) => [turn.user.id, turn.assistant.id]))
  expect(history.every((message, index) => index === 0 || message.info.time.created > history[index - 1].info.time.created)).toBe(true)
  return { ...f, turns, kept, future, history }
})

for (const boundary of ["omitted", "at-cut", "future", "unknown", "earlier"] as const)
  it.instance(`pending revert fork uses one exclusive visible boundary (${boundary})`, () => Effect.gen(function* () {
    const f = yield* make()
    const revert = yield* SessionRevert.Service
    yield* revert.revert({ sessionID: f.chat.id, messageID: f.turns[1].user.id })
    const before = yield* f.sessions.get(f.chat.id)
    expect(before.revert?.messageID).toBe(f.turns[1].user.id)
    const fork = yield* f.sessions.fork({ sessionID: f.chat.id, messageID:
      boundary === "omitted" ? undefined : boundary === "at-cut" ? f.turns[1].user.id :
      boundary === "future" ? f.turns[2].user.id : boundary === "unknown" ? MessageID.ascending() : f.turns[0].user.id })
    const copied = yield* f.sessions.messages({ sessionID: fork.id })
    expect(fork.id).not.toBe(f.chat.id)
    expect(fork.revert).toBeUndefined()
    expect(yield* f.sessions.get(f.chat.id)).toEqual(before)
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(f.history)
    expect(copied.map((message) => message.info.role)).toEqual(boundary === "earlier" ? [] : ["user", "assistant"])
    expect(fork.metadata?.claudeCode?.forkFrom).toEqual(boundary === "earlier" ? undefined : {
      sessionId: "native-source", at: "native-kept",
    })
    expect(fork.metadata?.claudeCode?.chain).toBe(boundary === "earlier" ? undefined : "native-kept")
    const view = yield* ClaudeHostMemory.retained(fork.id)
    expect(view.history).toEqual(copied)
    expect(view.lineage?.kind).toBe("fork")
    const memory = yield* ClaudeHostMemory.read({ sessionID: fork.id, pending: [], grants: [] })
    if (boundary === "earlier") return expect(memory).toBeUndefined()
    expect(copied[0].info.id).not.toBe(f.turns[0].user.id)
    expect(copied[1].info.id).not.toBe(f.turns[0].assistant.id)
    if (copied[1].info.role !== "assistant" || f.history[1].info.role !== "assistant") throw new Error("Missing copied assistant")
    expect(copied[0].info).toEqual({ ...f.history[0].info, id: copied[0].info.id, sessionID: fork.id })
    expect(copied[1].info).toEqual({ ...f.history[1].info, id: copied[1].info.id, sessionID: fork.id,
      parentID: copied[0].info.id })
    copied.forEach((message, index) => {
      expect(message.parts).toHaveLength(f.history[index].parts.length)
      message.parts.forEach((part, partIndex) => {
        expect(part.id).not.toBe(f.history[index].parts[partIndex].id)
        expect(part).toEqual({ ...f.history[index].parts[partIndex], id: part.id,
          messageID: message.info.id, sessionID: fork.id })
      })
    })
    const reference = ClaudeHostBoundary.reference(view, { projectID: f.chat.projectID, sessionID: f.chat.id,
      admissionMessageID: f.turns[0].user.id, producerMessageID: f.turns[0].assistant.id })
    expect(reference.historical).toBe(true)
    expect(reference.admission).toEqual(copied[0])
    expect(reference.producer).toEqual(copied[1])
    expect(yield* readPlanRevision(f.kept.revision.id)).toEqual(f.kept.revision)
    expect(yield* readAdmission({ sessionID: f.chat.id, messageID: f.turns[0].user.id,
      methodVersion: "admit-request-v1" })).toMatchObject({ outcome: "READY_TO_DRAFT" })
    expect(memory).toContain(JSON.stringify(f.kept.revision))
    expect(memory).not.toContain(f.future.revision.id)
    expect(() => ClaudeHostBoundary.reference(view, { ...reference.source,
      producerMessageID: f.turns[1].assistant.id })).toThrow("NATIVE_SOURCE_MESSAGES_UNPROVABLE")
  }))

for (const native of [false, true])
  it.instance(`ordinary fork keeps full history or an exclusive explicit prefix (native=${native})`, () => Effect.gen(function* () {
    const f = yield* make(native)
    const full = yield* f.sessions.fork({ sessionID: f.chat.id })
    expect((yield* f.sessions.messages({ sessionID: full.id })).map((message) => message.parts.map((part) =>
      part.type === "text" ? part.text : part.type))).toEqual(f.history.map((message) => message.parts.map((part) =>
      part.type === "text" ? part.text : part.type)))
    const prefix = yield* f.sessions.fork({ sessionID: f.chat.id, messageID: f.turns[1].user.id })
    expect((yield* f.sessions.messages({ sessionID: prefix.id })).map((message) => message.info.role)).toEqual(["user", "assistant"])
    if (!native) return
    expect(full.metadata?.claudeCode?.forkFrom).toEqual({ sessionId: "native-source" })
    expect(prefix.metadata?.claudeCode?.forkFrom).toEqual({ sessionId: "native-source", at: "native-kept" })
  }))

it.instance("non-native pending revert also excludes its invisible tail", () => Effect.gen(function* () {
  const f = yield* make(false)
  const revert = yield* SessionRevert.Service
  yield* revert.revert({ sessionID: f.chat.id, messageID: f.turns[1].user.id })
  const fork = yield* f.sessions.fork({ sessionID: f.chat.id })
  expect((yield* f.sessions.messages({ sessionID: fork.id })).map((message) => message.info.role)).toEqual(["user", "assistant"])
}))

it.instance("partial revert and missing revert boundary refuse before fork publication", () => Effect.gen(function* () {
  const f = yield* make(false)
  const revert = yield* SessionRevert.Service
  const second = yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id,
    messageID: f.turns[1].user.id, type: "text", text: "part-level cut" })
  yield* revert.revert({ sessionID: f.chat.id, messageID: f.turns[1].user.id, partID: second.id })
  const partial = yield* f.sessions.get(f.chat.id)
  expect(partial.revert?.partID).toBe(second.id)
  const before = yield* f.sessions.list({})
  const refused = yield* f.sessions.fork({ sessionID: f.chat.id }).pipe(Effect.exit)
  expect(Exit.isFailure(refused)).toBe(true)
  expect(String(refused)).toContain("SESSION_FORK_PARTIAL_REVERT_UNSUPPORTED")
  expect(yield* f.sessions.list({})).toEqual(before)
  yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: MessageID.ascending() }, summary: undefined })
  const missing = yield* f.sessions.get(f.chat.id)
  const unresolved = yield* f.sessions.fork({ sessionID: f.chat.id }).pipe(Effect.exit)
  expect(Exit.isFailure(unresolved)).toBe(true)
  expect(String(unresolved)).toContain("SESSION_FORK_REVERT_BOUNDARY_UNAVAILABLE")
  expect(yield* f.sessions.get(f.chat.id)).toEqual(missing)
  expect((yield* f.sessions.list({})).map((session) => session.id)).toEqual(before.map((session) => session.id))
}))
