import { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { EventV2 } from "@orchestra/core/event"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Deferred, Effect, Fiber, Ref, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LogicalTask } from "@/maestro/logical-task"
import { WorkResultDecision } from "@/maestro/work-result-decision"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import type { Tool } from "@/tool/tool"

export const decisionFixture = Effect.fn("WorkResultDecisionTest.fixture")(function* (options: {
  verification?: Schema.Schema.Type<typeof MaestroEvent.WorkResult.Decided.data>["verificationState"]
  terminal?: "ended" | "blocked" | "failed" | "interrupted" | "running"
  nested?: boolean
} = {}) {
  const sessions = yield* Session.Service
  const root = yield* sessions.create({ agent: "maestro", title: "result-decision authority" })
  const parent = options.nested ? yield* sessions.create({ parentID: root.id, agent: "general" }) : root
  const child = yield* sessions.create({ parentID: parent.id, agent: "backend" })
  const binding = yield* LogicalTask.ensure({
    executionSessionID: child.id, authoritySessionID: root.id, projectID: root.projectID,
    memberID: "backend", source: "host",
  })
  const message = yield* sessions.updateMessage({
    id: MessageID.ascending(), sessionID: parent.id, parentID: MessageID.ascending(), role: "assistant",
    agent: "maestro", mode: "maestro", modelID: ModelV2.ID.make("test"), providerID: ProviderV2.ID.make("test"),
    path: { cwd: parent.directory, root: parent.directory }, time: { created: Date.now() },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })
  const result = {
    schema: "backend-work-result-v1", taskId: binding.taskId, memberId: "backend",
    authoritySessionId: root.id, executionSessionId: child.id,
    mode: options.verification && options.verification !== "not-host-verified" ? "delegated-armed" : "delegated",
    acceptance: { state: "pending" }, verification: { state: options.verification ?? "not-host-verified" },
    terminal: { reason: options.terminal ?? "ended" }, card: { parsed: true }, outcome: "done",
    changes: [], checks: [], blockers: [], risks: [], nextActions: [], memory: { reads: [], writes: [] },
  }
  const part: SessionV1.ToolPart = {
    type: "tool", tool: "task", id: PartID.ascending(), sessionID: parent.id, messageID: message.id,
    callID: `call_${PartID.ascending()}`,
    state: { status: "completed", input: { subagent_type: "backend" }, title: "backend result", output: "done",
      time: { start: 1, end: 2 }, metadata: { sessionId: child.id, workResult: result } },
  }
  yield* sessions.updatePart(part)
  const target: Schema.Schema.Type<typeof WorkResultDecision.Parameters> = {
    parentSessionID: parent.id, messageID: message.id, partID: part.id, decision: "accepted",
  }
  const context: Tool.Context = {
    sessionID: root.id, messageID: message.id, agent: "maestro", agentID: "maestro", callID: "decision_call",
    abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void, ask: () => Effect.void,
  }
  return { root, parent, child, binding, part, result, target, context,
    input: { sessionID: root.id, agentID: "maestro", target } }
})

// Both calls must finish their pre-publication reads before either invokes the real durable publisher.
export function raceDecisions<A, E, R>(effects: readonly Effect.Effect<A, E, R>[]) {
  return Effect.gen(function* () {
    const actual = yield* EventV2Bridge.Service
    const arrived = yield* Ref.make(0)
    const ready = yield* Deferred.make<void>()
    const publish: EventV2.Interface["publish"] = (definition, data, options) => Effect.gen(function* () {
      if (definition.type !== MaestroEvent.WorkResult.Decided.type) return yield* actual.publish(definition, data, options)
      if ((yield* Ref.updateAndGet(arrived, (count) => count + 1)) === effects.length)
        yield* Deferred.succeed(ready, undefined)
      yield* Deferred.await(ready).pipe(Effect.timeout("5 seconds"))
      return yield* actual.publish(definition, data, options)
    }).pipe(Effect.orDie)
    return yield* Effect.all(effects.map(Effect.exit), { concurrency: "unbounded" }).pipe(
      Effect.provideService(EventV2Bridge.Service, EventV2Bridge.Service.of({ ...actual, publish })),
    )
  })
}

// Pause outside Core's publish transaction; a separate fiber commits a real storage mutation, then releases it.
export function mutateBeforeDecision<A, E, R, E2, R2>(decision: Effect.Effect<A, E, R>, mutation: Effect.Effect<unknown, E2, R2>) {
  return Effect.gen(function* () {
    const actual = yield* EventV2Bridge.Service
    const reached = yield* Deferred.make<void>()
    const resume = yield* Deferred.make<void>()
    const publish: EventV2.Interface["publish"] = (definition, data, options) => Effect.gen(function* () {
      if (definition.type !== MaestroEvent.WorkResult.Decided.type) return yield* actual.publish(definition, data, options)
      yield* Deferred.succeed(reached, undefined)
      yield* Deferred.await(resume).pipe(Effect.timeout("5 seconds"))
      return yield* actual.publish(definition, data, options)
    }).pipe(Effect.orDie)
    const pending = yield* decision.pipe(
      Effect.provideService(EventV2Bridge.Service, EventV2Bridge.Service.of({ ...actual, publish })),
      Effect.exit, Effect.forkChild,
    )
    yield* Deferred.await(reached).pipe(Effect.timeout("5 seconds"))
    yield* mutation.pipe(Effect.timeout("5 seconds"))
    yield* Deferred.succeed(resume, undefined)
    return yield* Fiber.join(pending)
  })
}
