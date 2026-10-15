export * as PromptContinuity from "./prompt-continuity"

import { Deferred, Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import { createHash } from "node:crypto"
import { asSchema, type Tool } from "ai"
import type { PermissionV1 } from "@orchestra/core/v1/permission"
import type { Session } from "./session"
import type { SessionProcessor } from "./processor"
import type { LLM } from "./llm"
import { RequestSource } from "@/continuity/request-source"
import { SessionV1 } from "@orchestra/core/v1/session"
import { MessageV2 } from "./message-v2"
import { MessageID, SessionID } from "./schema"
import type { Agent } from "@/agent/agent"
import type { Provider } from "@/provider/provider"

/** Undurable allocation descriptor: persistence follows caller and outgoing-payload admission. */
export function assistant(user: SessionV1.User, agent: Agent.Info, model: Provider.Model, sessionID: SessionID, cwd: string, root: string): SessionV1.Assistant {
  return { id: MessageID.ascending(), parentID: user.id, role: "assistant", mode: agent.id ?? agent.name, agent: agent.id ?? agent.name,
    variant: user.model.variant, path: { cwd, root }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: model.id, providerID: model.providerID, time: { created: Date.now() }, sessionID }
}

export const select = Effect.fn("PromptContinuity.select")(function* (messages: SessionV1.WithParts[], sessions: Session.Interface, sessionID: SessionID) {
  const logical = MessageV2.latest(messages)
  const sourceHistory = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
  const originalRequest = structuredClone(RequestSource.latest(sourceHistory))
  const user = originalRequest?.info
  return { ...logical, user: user?.role === "user" ? user : undefined, originalRequest, sourceHistory, logicalUser: logical.user }
})

export const fault = Effect.fn("PromptContinuity.fault")(function* (message: SessionV1.Assistant, error: NonNullable<SessionV1.Assistant["error"]>,
  sessions: Session.Interface, publish: (error: NonNullable<SessionV1.Assistant["error"]>) => Effect.Effect<unknown>) {
  message.error = error
  message.finish = "error"
  message.time.completed = Date.now()
  yield* sessions.updateMessage(message)
  yield* publish(error)
})

export const interrupted = Effect.fn("PromptContinuity.interrupted")(function* (message: SessionV1.Assistant, allocated: boolean, sessions: Session.Interface) {
  if (!allocated || message.time.completed) return
  message.error ??= MessageV2.fromError(new DOMException("Aborted", "AbortError"), { providerID: message.providerID, aborted: true })
  message.time.completed = Date.now()
  yield* sessions.updateMessage(message)
})

/**
 * Identity of what a caller's request carries besides memory and history: agent, resolved model, the owner's request
 * options, tool definitions, system and reminders, and session permissions (the agent's are part of the agent).
 * Undefined when any part cannot be read, so nothing is reused against an unchecked context.
 */
export const identity = (input: { agent: Agent.Info; model: Provider.Model; user: SessionV1.User; permission?: PermissionV1.Ruleset;
  system: string[]; reminders: unknown[]; tools: Record<string, Tool> }) =>
  Effect.tryPromise(async () => createHash("sha256").update(JSON.stringify({ agent: input.agent, model: input.model,
    user: { model: input.user.model, format: input.user.format, system: input.user.system, tools: input.user.tools },
    permission: input.permission, system: input.system, reminders: input.reminders,
    tools: await Promise.all(Object.entries(input.tools).toSorted(([a], [b]) => a.localeCompare(b)).map(async ([name, tool]) =>
      ({ name, type: tool.type, description: tool.description, schema: await asSchema(tool.inputSchema).jsonSchema }))),
  })).digest("hex")).pipe(Effect.orElseSucceed(() => undefined))

/** Tools are initialized before a durable assistant/processor exists; callbacks bind only after admission. */
export function proxy(message: SessionProcessor.Handle["message"]) {
  return Effect.gen(function* () {
    const ready = yield* Deferred.make<SessionProcessor.Handle>()
    const processor: Pick<SessionProcessor.Handle, "message" | "updateToolCall" | "completeToolCall"> = { message,
      updateToolCall: (...args) => Deferred.await(ready).pipe(Effect.flatMap((handle) => handle.updateToolCall(...args))),
      completeToolCall: (...args) => Deferred.await(ready).pipe(Effect.flatMap((handle) => handle.completeToolCall(...args))) }
    return { processor, bind: (handle: SessionProcessor.Handle) => Deferred.succeed(ready, handle) }
  })
}

/** Check complete outgoing payload and then re-read caller identity before durable assistant allocation. */
export const check = Effect.fn("PromptContinuity.check")(function* (request: LLM.StreamInput, sessions: Session.Interface, llm: LLM.Interface) {
  const budget = yield* (llm.preflight ? llm.preflight(request) : Effect.fail(new Error("LLM preflight service missing"))).pipe(Effect.result)
  const actual = RequestSource.latest(yield* sessions.messages({ sessionID: request.user.sessionID }).pipe(Effect.orDie))
  const session = yield* sessions.get(request.user.sessionID).pipe(Effect.orDie)
  if (!isDeepStrictEqual(session.permission, request.permission)) return { kind: "stale" as const }
  if (actual?.info.id !== request.user.id) return { kind: "stale" as const }
  if (budget._tag === "Failure") return { kind: "failed" as const, error: MessageV2.fromError(budget.failure, { providerID: request.model.providerID }) }
  return { kind: "ready" as const, plan: budget.success }
})
