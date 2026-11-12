export * as ScheduleAuthorityFixture from "./capability-schedule-authority"

import { join } from "node:path"
import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { LLMClient, LLMEvent } from "@orchestra/llm"
import { Capability } from "@orchestra/schema/capability"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { CapabilityScheduleOperator } from "@orchestra/core/capability/schedule/management"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { locationServices } from "@orchestra/core/location-services"
import { ReferenceGuidance } from "@orchestra/core/reference/guidance"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { AbsolutePath } from "@orchestra/core/schema"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { ScheduledTaskRunTable, ScheduledTaskTable } from "@orchestra/core/scheduled-task/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { InboxHandoff } from "@orchestra/core/inbox"
import { MeetingHandoff } from "@orchestra/core/session/meeting-handoff"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { TaskTool } from "@orchestra/core/tool/task"
import { TeamMessageTool } from "@orchestra/core/tool/team-message"
import { Tools } from "@orchestra/core/tool/tools"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetyProfile } from "@orchestra/core/tool-safety-profile"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, LayerMap, Queue, Stream } from "effect"
import { tmpdir } from "./tmpdir"

export type Phase = "placed" | "writer-enter" | "writer-after-sql" | "created-commit" | "prompt-hook" | "prompt-commit" | "settle-enter"
export type Operation = "pause" | "resume" | "remove" | "run"

export const hourly = { name: "Authority acceptance", prompt: "Report status", cadence: { kind: "interval" as const, minutes: 60 }, timezone: "UTC" }

export function make() {
  return Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
    const directory = AbsolutePath.make(join(tmp.path, "work"))
    const data = join(tmp.path, "data")
    yield* Effect.promise(() => mkdir(directory))
    yield* Effect.promise(() => mkdir(data, { recursive: true }))
    const ref = Location.Ref.make({ directory })
    const entered = yield* Deferred.make<Phase>()
    const release = yield* Deferred.make<void>()
    const providerEntries = yield* Queue.unbounded<SessionV2.ID>()
    const state = {
      phase: undefined as Phase | undefined,
      hits: [] as Phase[],
      insideTransaction: false,
      pending: [] as Fiber.Fiber<unknown, unknown>[],
      publicationCauses: [] as Cause.Cause<never>[],
      afterPublishFailure: undefined as Error | undefined,
      promptAttempted: false,
      settleFailure: undefined as Cause.Cause<never> | undefined,
      onPromptCommit: Effect.void,
      projected: { sessions: 0, inputs: 0 },
      commitCauses: [] as Cause.Cause<never>[],
      commitPresent: false,
      afterCommitFailure: undefined as Cause.Cause<never> | undefined,
      transactionFailure: undefined as Cause.Cause<never> | undefined,
      sqlFinalizer: false,
      sqlFailure: undefined as unknown,
      promptCommitted: false,
      provider: [] as SessionV2.ID[],
      onProvider: Effect.void,
      clock: 1_000,
      hookReturns: 0,
    }
    const checkpoint = (phase: Phase) => Effect.gen(function* () {
      if (state.phase !== phase) return
      state.phase = undefined
      state.insideTransaction = yield* real.inTransaction ?? Effect.succeed(false)
      state.hits.push(phase)
      yield* Deferred.succeed(entered, phase)
      yield* Deferred.await(release)
    })
    const real = Context.get(yield* Layer.build(Database.layerFromPath(join(tmp.path, "authority.sqlite"))), Database.Service)
    // The actual SQL adapter owns BEGIN/COMMIT/ROLLBACK. Both gates run inside its callback, never around a fake transaction.
    const transaction: typeof real.db.transaction = (body, options) => real.db.transaction((tx) => Effect.gen(function* () {
      const settlement = state.promptAttempted
      if (options?.behavior === "immediate") {
        yield* checkpoint(settlement ? "settle-enter" : "writer-enter")
      }
      const value = yield* body(tx).pipe(Effect.onExit((exit) => {
        if (!state.sqlFinalizer || Exit.isSuccess(exit)) return Effect.void
        state.sqlFinalizer = false
        // Genuine SQLite refusal in a finalizer; the real adapter must still roll back the original transaction.
        return real.db.$client.unsafe("INSERT INTO h8_missing_storage_table VALUES (1)").withoutTransform.pipe(
          Effect.asVoid,
          Effect.tapError((error) => Effect.sync(() => { state.sqlFailure = error })),
          Effect.catchCause((cause) => Effect.failCause(Cause.fromReasons(cause.reasons.map((reason) =>
            reason.annotate(new Map([["h8-storage", "actual-sql-finalizer"]])))))),
        )
      }))
      if (settlement && state.settleFailure) return yield* Effect.failCause(state.settleFailure)
      if (state.transactionFailure) {
        const failure = state.transactionFailure
        state.transactionFailure = undefined
        return yield* Effect.failCause(failure)
      }
      return value
    }), options)
    // Preserve each real query builder. Pause after its actual SQL effect, before the writer resumes and runs its last check.
    function observedWrite<T extends object>(query: T): T {
      return new Proxy(query, { get: (target, key) => {
        const method: unknown = Reflect.get(target, key, target)
        if (typeof method !== "function") return method
        return (...args: unknown[]) => {
          const result: unknown = Reflect.apply(method, target, args)
          if (key === "run") {
            if (!Effect.isEffect(result)) throw new Error("Expected the actual SQLite run effect")
            return result.pipe(Effect.tap(() => checkpoint("writer-after-sql")))
          }
          return typeof result === "object" && result !== null && !Effect.isEffect(result) ? observedWrite(result) : result
        }
      } })
    }
    const database: Database.Interface = { ...real, db: new Proxy(real.db, {
      get: (target, key) => {
        if (key === "transaction") return transaction
        const method: unknown = Reflect.get(target, key, target)
        if ((key === "update" || key === "delete") && typeof method === "function")
          return (...args: unknown[]) => {
            const query: unknown = Reflect.apply(method, target, args)
            if (typeof query !== "object" || query === null) throw new Error("Expected the actual SQLite write builder")
            return observedWrite(query)
          }
        return method
      },
    }) }
    const databaseLayer = Layer.succeed(Database.Service, database)
    const realEvents = Context.get(yield* Layer.build(AppNodeBuilder.build(EventV2.node, [[Database.node, databaseLayer]])), EventV2.Service)
    const events = EventV2.Service.of({ ...realEvents,
      publish: (definition, input, options) => {
        const phase = definition.type === SessionEvent.Created.type ? "created-commit"
          : definition.type === SessionEvent.PromptAdmitted.type ? "prompt-commit" : undefined
        if (!phase) return realEvents.publish(definition, input, options)
        return realEvents.publish(definition, input, { ...options, commit: (seq) => Effect.gen(function* () {
          if (phase === "prompt-commit") state.promptAttempted = true
          state.projected = {
            sessions: (yield* real.db.select().from(SessionTable).all().pipe(Effect.orDie)).length,
            inputs: (yield* real.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).length,
          }
          state.commitPresent = options?.commit !== undefined
          yield* checkpoint(phase)
          if (phase === "prompt-commit") yield* state.onPromptCommit
          const committed = options?.commit ? options.commit(seq) : Effect.void
          yield* committed.pipe(
            Effect.tapCause((cause) => Effect.sync(() => { state.commitCauses.push(cause) })),
            Effect.onExit(() => state.afterCommitFailure ? Effect.failCause(state.afterCommitFailure) : Effect.void),
          )
        }) }).pipe(
          Effect.tapCause((cause) => Effect.sync(() => { state.publicationCauses.push(cause) })),
          Effect.tap(() => phase === "prompt-commit" ? Effect.gen(function* () {
            state.promptCommitted = true
            if (state.afterPublishFailure) return yield* Effect.die(state.afterPublishFailure)
          }) : Effect.void),
        )
      },
    })
    const native = ToolRegistry.nativeNode
    if (!Layer.isLayer(native.implementation)) return yield* Effect.die("Expected the concrete native registry Layer")
    // Actual native registry/profile loader/hook evaluation, with a barrier AFTER the real prompt hook returns.
    // The native descriptor exposes an erased implementation type; its real Layer exports this registry service.
    const nativeLayer = native.implementation as Layer.Layer<ToolRegistry.Service | Tools.Service>
    const implementation = nativeLayer.pipe(
      Layer.provide(Layer.effect(ToolSafety.RuntimeProfileLoader, Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const global = yield* Global.Service
        const location = yield* Location.Service
        return ToolSafetyProfile.makeLoader(fs, { directory: location.directory,
          stateDirectory: MaestroArsenal.stateDirectory(global.data, location.project.id), projectID: location.project.id })
      }))),
      Layer.flatMap((context) => {
        const actual = Context.get(context, ToolRegistry.Service)
        // Each exported Context gets one observer; never stack wrappers on the shared native service object.
        return Layer.succeedContext(Context.add(context, ToolRegistry.Service, ToolRegistry.Service.of({
          ...actual,
          session: (input) => actual.session(input).pipe(
            Effect.tap(() => input.operation === "prompt" ? Effect.sync(() => { state.hookReturns++ }).pipe(
              Effect.andThen(checkpoint("prompt-hook"))) : Effect.void),
          ),
        })))
      }),
    )
    const dependencies = [...native.dependencies, FSUtil.node, Global.node, Location.node]
    const registry = { ...native, implementation, dependencies }
    const nativeTools = { ...ToolRegistry.nativeToolsNode, implementation, dependencies }
    const host: ExecutionHost.Interface = { id: "claude-code", stateKey: "authorityAcceptance",
      describeModel: () => Effect.succeed({ status: "ready" }),
      stream: (turn) => Stream.unwrap(Effect.gen(function* () {
        state.provider.push(turn.session.id)
        yield* Queue.offer(providerEntries, turn.session.id)
        yield* state.onProvider
        return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
      })),
    }
    const graph = LayerNode.group([locationServices, Database.node, Global.node, FSUtil.node, EventV2.node, SessionProjector.node,
      SessionStore.node, SessionV2.node, SessionExecutionLocal.node, ScheduledTask.node])
    const ready = yield* Deferred.make<Context.Context<LayerNode.Output<typeof graph>>>()
    // One Location and one graph: the Local coordinator resolves the same runner/DB/Event/projectors, not another application.
    const locations = Layer.effect(LocationServiceMap.Service, LayerMap.make((_: Location.Ref) =>
      Layer.effectContext(Deferred.await(ready).pipe(Effect.map((context) =>
        context as Context.Context<LayerNode.Output<typeof locationServices>>)))))
    const context = yield* Layer.build(AppNodeBuilder.build(graph, [
      [Database.node, databaseLayer], [EventV2.node, Layer.succeed(EventV2.Service, events)],
      [Location.node, Location.boundNode(ref)], [LocationServiceMap.node, locations],
      [SessionExecution.node, SessionExecutionLocal.node], [ToolRegistry.node, registry],
      [ToolRegistry.toolsNode, nativeTools],
      // This focused host does not expose the separate Task/handoff tool fleet; none is part of the H8 path.
      [TaskTool.node, Layer.empty], [TeamMessageTool.node, Layer.empty],
      [MeetingHandoff.node, Layer.succeed(MeetingHandoff.Service, { handoff: () => Effect.die("No meeting handoff in the H8 focused host") })],
      [InboxHandoff.node, Layer.succeed(InboxHandoff.Service, { handoff: () => Effect.die("No inbox handoff in the H8 focused host") })],
      [Global.node, Global.layerWith({ data, home: join(tmp.path, "home"), tmp: join(tmp.path, "tmp") })],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
      [Snapshot.node, Snapshot.noopLayer],
      [SystemContextRegistry.node, AppNodeBuilder.build(SystemContextRegistry.node)],
      [SkillGuidance.node, Layer.succeed(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
      [ReferenceGuidance.node, Layer.succeed(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
      [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.die("Hosted acceptance must not resolve model credentials"))],
      [ExecutionHost.node, Layer.succeed(ExecutionHost.Service, ExecutionHost.of([host]))],
      [LayerNodePlatform.llmClient, Layer.succeed(LLMClient.Service, LLMClient.Service.of({
        prepare: () => Effect.die("Hosted acceptance does not prepare LLM requests"),
        stream: () => Stream.die("Hosted acceptance must enter its real execution host"),
        generate: () => Effect.die("Hosted acceptance does not generate LLM requests"),
      }))],
    ]))
    yield* Deferred.succeed(ready, context)
    // Release a held uninterruptible SQL callback and join it BEFORE disposing the actual execution graph.
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined).pipe(
      Effect.andThen(Effect.forEach(state.pending, Fiber.await, { discard: true })),
    ))
    const fork = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.exit, Effect.forkChild,
      Effect.tap((fiber) => Effect.sync(() => { state.pending.push(fiber) })))
    const sessions = Context.get(context, SessionV2.Service)
    const execution = Context.get(context, SessionExecution.Service)
    const tasks = Context.get(context, ScheduledTask.Service)
    const location = Context.get(context, Location.Service)
    const agents = Context.get(context, AgentV2.Service)
    yield* agents.transform((draft) => draft.update(AgentV2.defaultID, (agent) => {
      agent.engine = "claude-code"
      agent.mode = "primary"
      agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
    }))
    const ownerSession = yield* sessions.create({ agent: AgentV2.defaultID, location: ref })
    const owner = { projectID: ownerSession.projectID, location: ref, sessionID: ownerSession.id, agentID: AgentV2.defaultID }
    const placement = { projectID: owner.projectID, location: ref }
    const operators = yield* CapabilityOperator.make({ principal: "schedule-authority-acceptance",
      scope: { placements: [placement], actions: ["schedule.list", "schedule.pause", "schedule.resume", "schedule.delete", "schedule.run"] }, now: () => state.clock, ttlMillis: 100 })
    const issued = yield* operators.issue({ origin: "sdk" })
    const api = CapabilityScheduleOperator.make({ operators, schedules: { ...tasks.capability,
      placed: (at) => tasks.capability.placed(at).pipe(Effect.tap(() => checkpoint("placed"))),
    } })
    const request = <A, E, R>(effect: Effect.Effect<A, E, R>, key = "manual-once") => operators.withRequest(issued.authority,
      { requestID: `request-${key}`, idempotencyKey: key }, effect)
    const call = (operation: Operation, id: ScheduledTask.ID, key?: string) => {
      const effect: Effect.Effect<unknown, CapabilityScheduleOperator.Error> = api[operation](placement, id)
      return request(effect, key)
    }
    const rows = Effect.gen(function* () {
      return { tasks: yield* real.db.select().from(ScheduledTaskTable).all(),
        runs: yield* real.db.select().from(ScheduledTaskRunTable).all(),
        sessions: yield* real.db.select().from(SessionTable).all(),
        inputs: yield* real.db.select().from(SessionInputTable).all() }
    })
    const installHook = Effect.gen(function* () {
      const snapshot = { schema: "relay.hook.v1", name: "H8 prompt checkpoint",
        nodes: [{ id: "event", name: "Prompt", type: RelayHook.NodeType.trigger, position: [0, 0],
          parameters: { operation: "prompt", timing: "before" } },
          { id: "reminder", name: "Reminder", type: RelayHook.NodeType.remind, position: [1, 0],
            parameters: { message: "H8 actual prompt hook ran" } }],
        connections: [{ from: "event", port: 0, to: "reminder" }], binding: "host-required", installed: false }
      return yield* RelayHookInstall.install({ data, projectID: location.project.id, document: "h8-prompt",
        version: "v1", snapshot, sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), principal: "user:test" })
    }).pipe(Effect.provide(context))
    return { state, entered, release, fork, checkpoint, context, database, events, sessions, execution, tasks, operators, issued,
      api, owner, placement, request, call, rows, installHook, providerEntries,
      createTask: () => tasks.capability.create(owner, hourly),
      revoke: operators.revoke(issued.authority), expire: Effect.sync(() => { state.clock = 1_100 }),
      arm: (phase: Phase) => Effect.sync(() => { state.phase = phase; state.promptCommitted = false; state.promptAttempted = false }),
    }
  })
}

export function denial(exit: { readonly _tag: "Success" } | { readonly _tag: "Failure"; readonly cause: Cause.Cause<unknown> }) {
  if (exit._tag !== "Failure" || exit.cause.reasons.length !== 1) return undefined
  const reason = exit.cause.reasons[0]
  return reason?._tag === "Fail" && reason.error instanceof Capability.Failure ? reason.error : undefined
}
