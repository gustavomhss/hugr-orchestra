export * as ResearchExecution from "./allowance"

import { Context, Effect, Layer, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"
import { LogicalTask } from "@/maestro/logical-task"
import { canonicalMemberId } from "@/maestro/roster"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import type { LLM } from "@/session/llm"

export type Frame = { readonly allowance: Research.Allowance; readonly purpose?: "maintenance" }
// Exported only for native deferred maintenance to retain its initiating dispatch. A model input cannot issue a frame.
export const Current = Context.Reference<Frame | undefined>("@orchestra/ResearchExecution/Current", { defaultValue: () => undefined })
const issued = new WeakSet<Frame>()

export interface Interface {
  readonly enter: <A, E, R>(sessionID: string, dispatchCallID: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Research.Error, R>
  readonly withAttribution: <A, E, R>(sessionID: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Research.Error, R>
  readonly provider: <A, E, R>(input: LLM.StreamInput, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Research.Error, R>
  readonly tool: <A, E, R>(sessionID: string, callID: string, toolID: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Research.Error, R>
  readonly captureBytes: <A, E, R>(sessionID: string, callID: string, bytes: number, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Research.Error, R>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ResearchExecution") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const database = yield* Database.Service
    const allowances = yield* ResearchAllowance.Service
    const logical = (sessionID: string) => LogicalTask.read(sessionID).pipe(Effect.provideService(Database.Service, database),
      Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Native logical Task binding is invalid" })))

    const placement = Effect.fn("ResearchExecution.placement")(function* (sessionID: string) {
      const task = yield* logical(sessionID)
      const session = yield* sessions.get(SessionID.make(sessionID)).pipe(Effect.mapError(() =>
        new Research.Error({ code: "binding_missing", message: "Native execution Session is not retained" })))
      if (task?.memberID !== "jimmy" && canonicalMemberId(session.agent) !== "jimmy") return undefined
      if (!task) return yield* new Research.Error({ code: "binding_missing", message: "Discovery execution has no native logical Task binding" })
      const root = yield* InstanceState.context
      const authority = yield* sessions.get(SessionID.make(task.authoritySessionID)).pipe(Effect.mapError(() =>
        new Research.Error({ code: "binding_missing", message: "Native authority Session is not retained" })))
      if (task.memberID !== "jimmy" || canonicalMemberId(session.agent) !== "jimmy" ||
        task.executionSessionID !== session.id || task.projectID !== session.projectID ||
        authority.projectID !== session.projectID || root.project.id !== session.projectID ||
        session.directory !== root.directory || (session.parentID !== undefined && session.parentID !== task.authoritySessionID))
        return yield* new Research.Error({ code: "binding_mismatch", message: "Discovery Task, Session, authority or native instance placement differs" })
      return yield* Schema.decodeUnknownEffect(Research.Binding)({
        projectID: Project.ID.make(session.projectID), memberID: "jimmy", taskId: task.taskId,
        executionSessionID: session.id, authoritySessionID: authority.id,
        directory: AbsolutePath.make(root.directory), worktree: AbsolutePath.make(root.worktree === "/" ? root.directory : root.worktree),
      }).pipe(Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid native research placement" })))
    })

    const frame = Effect.fn("ResearchExecution.frame")(function* (sessionID: string) {
      const current = yield* Current
      if (current && !issued.has(current))
        return yield* new Research.Error({ code: "binding_mismatch", message: "Research attribution frame was not issued by the native host" })
      if (current?.allowance.binding.executionSessionID === sessionID) return current
      const binding = yield* placement(sessionID)
      if (binding) return yield* new Research.Error({ code: "binding_missing", message: "Discovery execution requires its actual parent dispatch allowance" })
      return undefined
    })

    const enter: Interface["enter"] = (sessionID, dispatchCallID, effect) => Effect.gen(function* () {
      const binding = yield* placement(sessionID)
      if (!binding) return yield* effect
      if (!dispatchCallID.trim())
        return yield* new Research.Error({ code: "binding_missing", message: "Discovery dispatch call identity is missing" })
      const allowance = yield* allowances.bind(binding, dispatchCallID)
      const current: Frame = Object.freeze({ allowance: Object.freeze({ ...allowance, binding: Object.freeze({ ...allowance.binding }) }) })
      issued.add(current)
      return yield* effect.pipe(Effect.provideService(Current, current))
    })

    const withAttribution: Interface["withAttribution"] = (sessionID, effect) => Effect.gen(function* () {
      const current = yield* frame(sessionID)
      if (!current) return yield* effect.pipe(Effect.provideService(Current, undefined))
      const maintenance: Frame = Object.freeze({ allowance: current.allowance, purpose: "maintenance" })
      issued.add(maintenance)
      return yield* effect.pipe(Effect.provideService(Current, maintenance))
    })

    const provider: Interface["provider"] = (input, effect) => Effect.gen(function* () {
      const current = yield* Current
      if (current && !issued.has(current))
        return yield* new Research.Error({ code: "binding_mismatch", message: "Research attribution frame was not issued by the native host" })
      const parent = current?.allowance.binding.executionSessionID
      const attributable = current && (input.sessionID === parent ||
        (input.purpose === "context-maintenance" && input.parentSessionID === parent)) ? current : undefined
      if (attributable) {
        // The host mints one operation identity per actual invocation, not per user message/model-authored field.
        // Re-running a provider request is new work; re-entering the same Task dispatch never resets its ledger.
        yield* allowances.charge(attributable.allowance, "provider",
          `provider:${attributable.purpose ?? input.purpose ?? input.agent.id ?? input.agent.name}:${EventV2.ID.create()}`)
        return yield* effect
      }
      const task = yield* logical(input.sessionID)
      const maintenance = input.purpose === "context-maintenance" && input.parentSessionID
        ? yield* logical(input.parentSessionID) : undefined
      if (task?.memberID === "jimmy" || maintenance?.memberID === "jimmy" || input.agent.id === "jimmy")
        return yield* new Research.Error({ code: "binding_missing", message: "Discovery provider invocation is missing native dispatch attribution" })
      return yield* effect
    })

    const tool: Interface["tool"] = (sessionID, callID, toolID, effect) => Effect.gen(function* () {
      const current = yield* frame(sessionID)
      if (!current) return yield* effect
      if (!callID.trim() || !toolID.trim())
        return yield* new Research.Error({ code: "binding_missing", message: "Native research tool call identity is missing" })
      yield* allowances.charge(current.allowance, "tool", `tool:${callID}:${toolID}`)
      return yield* effect
    })

    const captureBytes: Interface["captureBytes"] = (sessionID, callID, bytes, effect) => Effect.gen(function* () {
      const current = yield* frame(sessionID)
      if (!current) return yield* effect
      if (!callID.trim()) return yield* new Research.Error({ code: "binding_missing", message: "Native byte admission call identity is missing" })
      yield* allowances.reserveBytes(current.allowance, `bytes:${callID}`, bytes)
      return yield* effect
    })

    return Service.of({ enter, withAttribution, provider, tool, captureBytes })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [Session.node, Database.node, ResearchAllowance.node] })
