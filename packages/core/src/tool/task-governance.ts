export * as TaskGovernance from "./task-governance"

import type { ToolFailure } from "@orchestra/llm"
import type { Permission } from "@orchestra/schema/permission"
import type { PromptInput } from "@orchestra/schema/prompt-input"
import { Context, Effect, Layer, type Schema } from "effect"
import type { AgentV2 } from "../agent"
import { makeLocationNode } from "../effect/app-node"
import type { SessionMessage } from "../session/message"
import type { SessionSchema } from "../session/schema"
import type { Tool } from "./tool"

/** Extra Task input fields. They decode without services, so Task stays an ordinary tool. */
export type InputFields = { readonly [key: string]: Schema.Codec<unknown, unknown, never, never> }

/** What a governance decided for one Task call. Every field is optional; an empty admission is plain Task. */
export interface Admission {
  /** Child Session ID when the caller did not name one with `task_id`; it must be stable across exact retries. */
  readonly childID?: SessionSchema.ID
  /**
   * The child Session's own permission rules, in place of the inherited `TaskTool.inheritedPermissions` (which they
   * must start from, so a child never widens its parent's denies); applied only when they differ from the recorded ones.
   */
  readonly permissions?: Permission.Ruleset
  /** The prompt admitted to the child in place of the caller's `prompt` text. */
  readonly prompt?: PromptInput.Prompt
  /** Admit and wake the child, then return without waiting for its reply. */
  readonly background?: boolean
  /** Opaque value the governance hands itself from `admit` to `settle`. */
  readonly receipt?: unknown
}

/**
 * Decides how Task delegates in one Location. Hooks run inside Task's own checks: they may refuse with a
 * `ToolFailure` or shape the delegation through an `Admission`, but they never replace target, model, depth,
 * placement, or approval checks, and they must not publish Session events of their own.
 */
export interface Interface {
  /** Fields added to Task's input schema, recorded with the call and decoded on every retry. */
  readonly input: InputFields
  /** Runs once per Task execution after the target is known and before approval or child creation. */
  readonly admit: (input: {
    readonly parent: SessionSchema.Info
    readonly target: AgentV2.Info
    readonly input: { readonly [key: string]: unknown }
    readonly context: Tool.Context
  }) => Effect.Effect<Admission, ToolFailure>
  /** Runs before every provider turn of a Session, before any pending input is promoted; a failure stops the turn. */
  readonly beforeTurn: (session: SessionSchema.Info) => Effect.Effect<void, ToolFailure>
  /** Turns a foreground child's completed reply into the Task result. */
  readonly settle: (input: {
    readonly child: SessionSchema.Info
    readonly reply: SessionMessage.Assistant
    readonly admission: Admission
    readonly context: Tool.Context
  }) => Effect.Effect<{ readonly text: string; readonly structured?: { readonly [key: string]: unknown } }, ToolFailure>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/TaskGovernance") {}

/** Plain Task: no extra input, an empty admission, no turn gate, and the reply's text parts as the result. */
export const allowAll: Interface = {
  input: {},
  admit: () => Effect.succeed({}),
  beforeTurn: () => Effect.void,
  settle: (input) =>
    Effect.succeed({
      text: input.reply.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"),
    }),
}

export const node = makeLocationNode({ service: Service, layer: Layer.succeed(Service, allowAll), deps: [] })
