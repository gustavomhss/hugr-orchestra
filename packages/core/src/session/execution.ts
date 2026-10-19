export * as SessionExecution from "./execution"

import { Context, Effect, Layer, type Option } from "effect"
import { LayerNode } from "../effect/layer-node"
import { Node } from "../effect/app-node"
import { SessionRunner } from "./runner/index"
import { SessionSchema } from "./schema"
import type { SessionRunCoordinator } from "./run-coordinator"

export type ResumeOptions = SessionRunCoordinator.RunOptions

export interface Interface {
  /** Snapshots active execution owned by this process. */
  readonly active: Effect.Effect<ReadonlySet<SessionSchema.ID>>
  /** Starts execution while idle or joins independently. Opt-in cancellation belongs only to the starter. */
  readonly resume: (sessionID: SessionSchema.ID, options?: ResumeOptions) => Effect.Effect<void, SessionRunner.RunError>
  /** Registers newly recorded work. Repeated wakeups may coalesce. */
  readonly wake: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  /** Interrupt active work owned by this process. Idle interruption is a no-op. */
  readonly interrupt: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  /**
   * Runs one Session operation as its active execution, never beside a drain. `None` means the Session was busy; with
   * `wait` it runs once the active execution settles instead.
   */
  readonly exclusive: <A, E>(
    sessionID: SessionSchema.ID,
    effect: Effect.Effect<A, E>,
    options?: { readonly wait?: boolean },
  ) => Effect.Effect<Option.Option<A>, E>
}

/** Routes execution from a Session ID to the runner owned by that Session's Location. */
export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionExecution") {}

export const node = LayerNode.unbound(Service, Node.tags.values.global)

/** Low-level compatibility layer for callers that only need durable Session recording. */
export const noopLayer = Layer.succeed(
  Service,
  Service.of({
    active: Effect.succeed(new Set()),
    resume: () => Effect.void,
    wake: () => Effect.void,
    interrupt: () => Effect.void,
    exclusive: (_, effect) => Effect.asSome(effect),
  }),
)
