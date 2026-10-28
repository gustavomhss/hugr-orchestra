export * as ExecutionHost from "./execution-host"

import type { LLMError, LLMEvent, ToolDefinition } from "@orchestra/llm"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, type Stream } from "effect"
import type { AgentV2 } from "../../agent"
import type { Database } from "../../database/database"
import { makeLocationNode } from "../../effect/app-node"
import type { ModelV2 } from "../../model"
import type { PermissionV2 } from "../../permission"
import type { QuestionV2 } from "../../question"
import type { ToolSafety } from "../../tool-safety"
import type { ToolRegistry } from "../../tool/registry"
import type { SkillV2 } from "../../skill"
import type { SessionMessage } from "../message"
import type { SessionSchema } from "../schema"
import type { SessionTodo } from "../todo"
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
  /** The Context Epoch baseline and workflow instructions alone: `system` without the agent's own text. */
  readonly context: ReadonlyArray<string>
  /** The agents this turn's agent may delegate to, as the task tool would accept them as targets. */
  readonly seats: ReadonlyArray<AgentV2.Info>
  /** The skills each seat in `seats` may load, by seat id, as Orchestra's skill tool would list them for that seat. */
  readonly skills: Readonly<Record<string, ReadonlyArray<SkillV2.Info>>>
  /** Projected history the runner reloaded for this turn. */
  readonly history: ReadonlyArray<SessionMessage.Message>
  /** The agent's permission-filtered Orchestra tools, for the host to offer its engine. */
  readonly tools: ReadonlyArray<ToolDefinition>
  /** The names of the Orchestra tools each seat in `seats` may call, by seat id, under the seat's and the Session's rules. */
  readonly seatTools: Readonly<Record<string, ReadonlyArray<string>>>
  /** The Orchestra tools a seat in `seats` may call and the agent may not, for the host to offer the seats' subagents only. */
  readonly seatOnly: ReadonlyArray<ToolDefinition>
  /**
   * Runs an Orchestra tool the engine invoked: the runner records the call (provider-executed, executor "orchestra"),
   * settles it through the Location registry and records the result. The host never emits these calls itself.
   */
  readonly execute: (call: { readonly id: string; readonly name: string; readonly input: unknown }) => Effect.Effect<ToolRegistry.Settlement>
  /**
   * Orchestra's decision on a call the engine runs itself: V2 permission first (an ask waits for the owner's reply, a
   * deny or decline fails), then, when `safety` names the call as Orchestra's tool would see it, the Location's
   * ToolSafety under the Session's profile: write roots, never-touch paths, protected writes, the dispatch charge and,
   * for a shell command, the sandbox the profile requires. Any refusal fails the effect and the host must deny the call.
   */
  readonly authorize: (input: {
    readonly callID: string
    readonly tool: string
    readonly action: string
    readonly resources: ReadonlyArray<string>
    /** A seat from `seats` the call runs under, when the engine made it inside that seat's subagent. */
    readonly agent?: AgentV2.ID
    /** The call as ToolSafety reads it: Orchestra's tool name (`bash`, `write`, `edit`, `read`, ...) and argument names. */
    readonly safety?: { readonly tool: string; readonly args: Readonly<Record<string, unknown>> }
  }) => Effect.Effect<Authorization, PermissionV2.Error | PermissionV2.DeclinedError | ToolSafety.Denied>
  /**
   * Asks the owner and waits for the answers: one answer (the chosen labels) per question, in order. A dismissed
   * question fails; the host denies the engine's question tool with that.
   */
  readonly question: (input: {
    readonly callID: string
    readonly questions: ReadonlyArray<QuestionV2.Info>
  }) => Effect.Effect<ReadonlyArray<QuestionV2.Answer>, QuestionV2.RejectedError>
  /**
   * The Session's working memory, for an engine that compacts its own context: `recall` renders what Orchestra
   * keeps that the engine's summary cannot (open todos) so the host can hand it back right after a compaction;
   * `archive` records the engine's own summary in the Session, as a synthetic message, without changing which
   * history later turns see.
   */
  readonly memory: {
    readonly recall: Effect.Effect<string | undefined>
    readonly archive: (input: {
      readonly summary: string
      readonly trigger: string
      readonly nativeSessionID: string
    }) => Effect.Effect<void>
  }
  /**
   * Steers admitted while this turn runs, promoted into the Session at the moment they arrive and emitted here, so the
   * host can hand them to its running engine through streaming input. The host reports each one it passed on with
   * `consumed`; a steer never reported gets a turn of its own once this one ends. Cold: it runs while subscribed.
   */
  readonly steers: Stream.Stream<Steer>
  readonly consumed: (id: string) => Effect.Effect<void>
  /**
   * An event the engine produces on its own, after the turn that started the work (a background task finishing): it
   * is recorded in the Session as a steer prompt, so it is never lost, and wakes the Session. Idempotent by `id`.
   * Unlike everything else on a Turn it outlives the turn: the host may call it after its stream has ended.
   */
  readonly notify: (input: { readonly id: string; readonly text: string }) => Effect.Effect<void>
  /**
   * Opens the child Session that mirrors a subagent the engine ran for the parent's task call `callID`, the way
   * Orchestra's task tool would have opened it: same parent, seat agent, inherited permissions and the delegated prompt
   * as its user message. The call's progress names the child, so the task row links to it. The child is a record only:
   * it is never woken, and its events come from the engine through `publish`. `finish` settles what is left open; its
   * step carries no cost, which the parent's step already counts. Reopening the same call adopts the same child.
   */
  readonly child: (input: {
    readonly callID: string
    readonly agent: AgentV2.ID
    readonly title: string
    readonly prompt: string
    /** The model the subagent runs on, when the engine knows it; the parent's model otherwise. */
    readonly model?: ModelV2.Ref
  }) => Effect.Effect<{
    readonly id: SessionSchema.ID
    readonly publish: (event: LLMEvent) => Effect.Effect<void>
    readonly finish: Effect.Effect<void>
    /** `todos` for the child Session: a subagent's own checklist. */
    readonly todos: (list: ReadonlyArray<SessionTodo.Info>) => Effect.Effect<void>
    /**
     * `execute` for an Orchestra tool the subagent invokes: recorded in the child Session and settled there under the
     * seat's rules and the child's own, as inside Orchestra's task tool. A child whose agent is not a seat refuses it.
     */
    readonly execute: Turn["execute"]
  }>
  /**
   * Replaces the Session's todo list, as Orchestra's todowrite tool would: the todo panel shows it. For an engine that
   * keeps its own checklist, called when the engine's own todo call succeeds.
   */
  readonly todos: (list: ReadonlyArray<SessionTodo.Info>) => Effect.Effect<void>
  /** The host's durable state, `session.metadata[host.stateKey]`. */
  readonly state: {
    readonly get: Effect.Effect<unknown>
    readonly update: (fn: (value: unknown) => unknown) => Effect.Effect<void>
  }
}

export interface Authorization {
  /** Fields Orchestra replaces in the call's input, merged over it by the host (`command` wrapped in the required sandbox); absent: unchanged. */
  readonly input?: Readonly<Record<string, unknown>>
  /** The web domains the Session's dispatch binds its searches to; absent: unrestricted. The host applies them. */
  readonly domains?: ReadonlyArray<string>
}

/** A steer promoted into the Session while the turn ran. */
export interface Steer {
  /** The promoted user message's id. */
  readonly id: string
  readonly text: string
}

/**
 * Stream rules: exactly one `step-start` and one `step-finish`; every `tool-call` is `providerExecuted` and settles
 * with its `tool-result` or `tool-error` in the same stream; provider failures are `provider-error` events, never
 * retried; interruption runs the stream's finalizer. A host owns its context window: the runner skips compaction and
 * overflow recovery for its turns. A `step-finish` usage may carry the `cost` (USD) and `contextWindow` the engine
 * reports, which the runner records instead of pricing the tokens. A `retract` names blocks and calls of an attempt the
 * engine superseded; the runner blanks them in the Session. Steers reach a running engine through `Turn.steers`, and
 * what the engine produces after its turn ended goes through `Turn.notify`, never as stream events.
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
