export * as OmniAdoption from "./omni-adoption"

// The adoption seam for O1 (frozen in WP0). A tree still alive when its spawn scope closes is either stopped, or, when
// the caller opted in, handed to a per-session registry that keeps it running until the session ends (WP11 builds the
// registry on BackgroundJob, `type: "process"`). The spawner (WP1) and the PTY layer (WP2) call release().

import { Context, Effect, Exit, Option } from "effect"
import type { Child } from "./omni"

export type Policy = "never" | "tool"

/**
 * Present in the context of a spawn that may be adopted. Absent means nothing is ever adopted. `tool` adopts a tree
 * still alive when the bash or shell tool's scope closes successfully; `never` stops it.
 */
export class Service extends Context.Service<Service, { readonly sessionID: string; readonly policy: Policy }>()(
  "@orchestra/OmniAdoption",
) {}

export type RegisterInput = { sessionID: string; title: string }

export interface Interface {
  /** Takes ownership of a live child. It must stop the child at the latest when the session ends. */
  readonly register: (child: Child, input: RegisterInput) => Effect.Effect<void>
}

export class Registry extends Context.Service<Registry, Interface>()("@orchestra/OmniAdoptionRegistry") {}

/** The registry until WP11: it adopts nothing and stops the child at once. */
export const stub: Interface = {
  register: (child) => Effect.promise(() => child.stop()).pipe(Effect.asVoid),
}

/**
 * The release of a spawn scope. Adopts only when the scope closed with success and the adoption service is present
 * with policy `tool`; an interrupt, a failure, or no service stops the child, bounded by `graceMs`.
 */
export const release = Effect.fn("OmniAdoption.release")(function* (
  child: Child,
  exit: Exit.Exit<unknown, unknown>,
  input: { title: string; graceMs: number },
) {
  const adoption = Option.getOrUndefined(yield* Effect.serviceOption(Service))
  if (Exit.isSuccess(exit) && adoption?.policy === "tool") {
    const registry = Option.getOrElse(yield* Effect.serviceOption(Registry), () => stub)
    return yield* registry.register(child, { sessionID: adoption.sessionID, title: input.title })
  }
  yield* Effect.promise(() => child.stop({ graceMs: input.graceMs })).pipe(Effect.asVoid)
})
