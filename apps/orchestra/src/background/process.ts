export * as BackgroundProcess from "./process"

// The host side of O1(b) (WP11): one OmniBackground registry over the instance-scoped BackgroundJob service, shared by
// the shell tool (which hands it adopted trees) and the session process routes (which list and stop them).
//
// When the trees stop:
// - Session.remove publishes session.deleted, and this layer stops that session's trees;
// - instance or server disposal closes the BackgroundJob scope, which ends every job and so stops its tree;
// - the user stops one from the UI;
// - a host crash is the supervisor's job: it kills everything.
// User cancel (Esc) does not stop them (R2-5).

import { Context, Effect, Layer, Option } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Flag } from "@orchestra/core/flag/flag"
import { OmniAdoption } from "@orchestra/core/omni-adoption"
import { OmniBackground } from "@orchestra/core/omni-background"
import { SessionV1 } from "@orchestra/core/v1/session"
import { BackgroundJob } from "./job"
import { EventV2Bridge } from "@/event-v2-bridge"

export interface Interface extends OmniBackground.Interface {
  /**
   * Lets a tool's spawn be adopted by this registry: with the omni flag on, provides OmniAdoption `{sessionID,
   * policy: "tool"}` and the registry; with it off, changes nothing.
   */
  readonly adoptable: (
    sessionID: string,
    lease?: Pick<OmniAdoption.RegisterInput, "onAdopt" | "finalize">,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/BackgroundProcess") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const registry = OmniBackground.make(yield* BackgroundJob.Service)
    const events = yield* EventV2Bridge.Service

    // Listeners run inside the publisher's fiber, so Session.remove's instance context reaches the job service.
    const off = yield* events.listen((event) => {
      const data: unknown = event.data
      if (event.type !== SessionV1.Event.Deleted.type) return Effect.void
      if (typeof data !== "object" || data === null || !("sessionID" in data)) return Effect.void
      if (typeof data.sessionID !== "string") return Effect.void
      const sessionID = data.sessionID
      return registry
        .stopSession(sessionID)
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("could not stop the background processes of a removed session", { sessionID, cause }),
          ),
        )
    })
    yield* Effect.addFinalizer(() => off)

    // The flag is read when the effect runs, like the spawner reads it.
    const adoptable: Interface["adoptable"] = (sessionID, lease) => (effect) =>
      Effect.suspend(() =>
        Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off"
          ? effect
          : effect.pipe(
              Effect.provideService(OmniAdoption.Service, { sessionID, policy: "tool" }),
              Effect.provideService(OmniAdoption.Registry, lease
                ? { register: (child, input) => registry.register(child, { ...input, ...lease }) }
                : registry),
            ),
      )

    return Service.of({ ...registry, adoptable })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [BackgroundJob.node, EventV2Bridge.node] })

/**
 * The shell tool's hook: `adoptable(sessionID)` from the service when the tool's layer has it, and a no-op otherwise
 * (tests that build the tool by hand).
 */
export const adoptable = Effect.map(
  Effect.serviceOption(Service),
  (service) =>
    (sessionID: string, lease?: Pick<OmniAdoption.RegisterInput, "onAdopt" | "finalize">): (<A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>) =>
      Option.isSome(service) ? service.value.adoptable(sessionID, lease) : (effect) => effect,
)
