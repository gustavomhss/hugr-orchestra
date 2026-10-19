export * as ExecutionHost from "./execution-host"

import type { LLMError, LLMEvent, ToolDefinition } from "@orchestra/llm"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, type Stream } from "effect"
import type { AgentV2 } from "../../agent"
import type { Database } from "../../database/database"
import { makeLocationNode } from "../../effect/app-node"
import type { ModelV2 } from "../../model"
import type { PermissionV2 } from "../../permission"
import type { ToolRegistry } from "../../tool/registry"
import type { SessionMessage } from "../message"
import type { SessionSchema } from "../schema"
import { SessionTable } from "../sql"

/**
 * What the runner hands an execution host for one provider turn. An agent whose `engine` names a registered host runs
 * that turn through `stream(turn)` instead of `llm.stream(request)`; persistence stays in the runner.
 */
export interface Turn {
  readonly session: SessionSchema.Info
  readonly agent: AgentV2.Info
  /** `session.model ?? agent.model`; the host resolves no credential. */
  readonly model: ModelV2.Ref | undefined
  /** Agent system text, the Context Epoch baseline and workflow instructions, in that order. */
  readonly system: ReadonlyArray<string>
  /** Projected history the runner reloaded for this turn. */
  readonly history: ReadonlyArray<SessionMessage.Message>
  /** The agent's permission-filtered Orchestra tools, for the host to offer its engine. */
  readonly tools: ReadonlyArray<ToolDefinition>
  /**
   * Runs an Orchestra tool the engine invoked: the runner records the call (provider-executed, executor "orchestra"),
   * settles it through the Location registry and records the result. The host never emits these calls itself.
   */
  readonly execute: (call: { readonly id: string; readonly name: string; readonly input: unknown }) => Effect.Effect<ToolRegistry.Settlement>
  /** V2 permission for a call the engine runs itself; an ask waits for the owner's reply, a deny or decline fails. */
  readonly authorize: (input: {
    readonly callID: string
    readonly tool: string
    readonly action: string
    readonly resources: ReadonlyArray<string>
  }) => Effect.Effect<void, PermissionV2.Error | PermissionV2.DeclinedError>
  /** The host's durable state, `session.metadata[host.stateKey]`. */
  readonly state: {
    readonly get: Effect.Effect<unknown>
    readonly update: (fn: (value: unknown) => unknown) => Effect.Effect<void>
  }
}

/**
 * Stream rules: exactly one `step-start` and one `step-finish`; every `tool-call` is `providerExecuted` and settles
 * with its `tool-result` or `tool-error` in the same stream; provider failures are `provider-error` events, never
 * retried; interruption runs the stream's finalizer. A host owns its context window: the runner skips compaction and
 * overflow recovery for its turns.
 */
export interface Interface {
  readonly id: string
  readonly stateKey: string
  readonly stream: (turn: Turn) => Stream.Stream<LLMEvent, LLMError>
}

export interface Registry {
  readonly get: (engine: string) => Interface | undefined
}

export class Service extends Context.Service<Service, Registry>()("@orchestra/v2/ExecutionHost") {}

/** Default: no host. A product registers its hosts by replacing this node (Host.Contribution.replacements). */
export const layer = Layer.succeed(Service, Service.of({ get: () => undefined }))

export const of = (hosts: ReadonlyArray<Interface>) =>
  Service.of({ get: (engine) => hosts.find((host) => host.id === engine) })

export const node = makeLocationNode({ service: Service, layer, deps: [] })

/** Read-modify-write of one `session.metadata` key; other keys are kept. The Session's drain serializes writers. */
export function state(db: Database.Interface["db"], sessionID: SessionSchema.ID, key: string): Turn["state"] {
  const read = db
    .select({ metadata: SessionTable.metadata })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => row?.metadata ?? {}),
    )
  return {
    get: read.pipe(Effect.map((metadata) => metadata[key])),
    update: (fn) =>
      read.pipe(
        Effect.flatMap((metadata) =>
          db
            .update(SessionTable)
            .set({ metadata: { ...metadata, [key]: fn(metadata[key]) } })
            .where(eq(SessionTable.id, sessionID))
            .run()
            .pipe(Effect.orDie),
        ),
        Effect.asVoid,
      ),
  }
}
