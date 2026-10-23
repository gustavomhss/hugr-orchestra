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

/** What governance decided for one admitted Task call. Every field is optional; an empty admission keeps today's Task. */
export interface Admission {
  /** The child Session id to create or adopt; default: the id Task derives from the call. */
  readonly childID?: SessionSchema.ID
  /** The child Session's own permission rules. */
  readonly permissions?: Permission.Ruleset
  /** The child's first prompt; default: `{ text: input.prompt }`. */
  readonly prompt?: PromptInput.Prompt
  /** Return at once instead of waiting for the child; governance settles it when the child goes idle. */
  readonly background?: boolean
  /** Opaque value handed back to `settle`. */
  readonly receipt?: unknown
}

/**
 * Location-scoped policy for Task delegation. The default admits every call unchanged; a product replaces `node`
 * through `Host.Contribution.replacements`.
 */
export interface Interface {
  /** Extra Task input fields; the default adds none. */
  readonly input: Schema.Struct.Fields
  /** Called after the target agent is resolved and before the child Session is created. */
  readonly admit: (input: {
    readonly parent: SessionSchema.Info
    readonly target: AgentV2.Info
    readonly input: Readonly<Record<string, unknown>>
    readonly context: Tool.Context
  }) => Effect.Effect<Admission, ToolFailure>
  /** Called at the start of every provider turn of any Session. */
  readonly beforeTurn: (session: SessionSchema.Info) => Effect.Effect<void, ToolFailure>
  /** Turns a foreground child's reply into the Task result; the default returns the reply's text. */
  readonly settle: (input: {
    readonly child: SessionSchema.Info
    readonly reply: SessionMessage.Assistant | undefined
    readonly admission: Admission
    readonly context: Tool.Context
  }) => Effect.Effect<{ readonly text: string; readonly structured?: Readonly<Record<string, unknown>> }, ToolFailure>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/TaskGovernance") {}

export const allowAll = Service.of({
  input: {},
  admit: () => Effect.succeed({}),
  beforeTurn: () => Effect.void,
  settle: (input) =>
    Effect.succeed({
      text: (input.reply?.content ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"),
    }),
})

export const node = makeLocationNode({ service: Service, layer: Layer.succeed(Service, allowAll), deps: [] })
