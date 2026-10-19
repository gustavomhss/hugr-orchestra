import path from "node:path"
import { Context, Effect, Exit, Layer, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { PluginV2 } from "@orchestra/core/plugin"
import { AbsolutePath } from "@orchestra/core/schema"
import { Agent } from "@/agent/agent"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceState } from "@/effect/instance-state"
import type { InstanceContext } from "@/project/instance-context"

export const pluginID = PluginV2.ID.make("orchestra/native-upstream")

/** Capture host services once; install the native projection during supported Instance bootstrap only. */
export const make = Effect.gen(function* () {
  const nativeAgents = yield* Agent.Service
  const locations = yield* LocationServiceMap.Service
  // Keep the lease in the existing Instance entry scope, not the short bootstrap invocation scope.
  const state = yield* InstanceState.make((instance) =>
    Effect.gen(function* () {
      const native = yield* nativeAgents.get("archie").pipe(Effect.provideService(InstanceRef, instance))
      requireNative(native)
      // Native Agent state may itself open the Location for references. Finish that state before replay can reenter it.
      const scope = yield* Scope.Scope
      const ref = Location.Ref.make({
        directory: AbsolutePath.make(instance.directory),
        // Match the SessionStore's implicit-local Ref shape; omitted and explicit undefined hash differently.
        workspaceID: undefined,
      })
      // A folder's first commit gives it its own project while a Location opened under the shared "global" one may
      // still be cached. Release that one and open the folder again instead of refusing the placement.
      const probe = yield* Scope.fork(scope)
      const cached = yield* Layer.buildWithScope(locations.get(ref), probe)
      const stale = Context.get(cached, Location.Service).project.id !== instance.project.id
      if (stale) {
        yield* Scope.close(probe, Exit.void)
        yield* locations.invalidate(ref)
      }
      const context = stale ? yield* Layer.buildWithScope(locations.get(ref), scope) : cached
      yield* Effect.gen(function* () {
        const location = yield* Location.Service
        if (
          location.project.id !== instance.project.id ||
          path.resolve(location.directory) !== path.resolve(instance.directory)
        )
          return yield* Effect.die(new Error("UPSTREAM_NATIVE_PLACEMENT_MISMATCH"))
        const plugins = yield* PluginV2.Service
        const agents = yield* AgentV2.Service
        yield* plugins.wait(PluginV2.ID.make("config-agent"))
        yield* plugins.ensure(pluginID, () =>
          agents
            .transform((draft) =>
              Effect.gen(function* () {
                const native = yield* nativeAgents.get("archie").pipe(Effect.provideService(InstanceRef, instance))
                requireNative(native)
                draft.update(AgentV2.ID.make("archie"), (agent) => {
                  agent.system = native.prompt
                  agent.description = native.description
                  agent.mode = native.mode
                  agent.hidden = native.hidden ?? false
                  agent.model = native.model
                    ? {
                        id: native.model.modelID,
                        providerID: native.model.providerID,
                        variant: native.variant === undefined ? undefined : ModelV2.VariantID.make(native.variant),
                      }
                    : undefined
                  agent.request = {
                    headers: {},
                    body: native.temperature === undefined ? {} : { temperature: native.temperature },
                  }
                  // Native grants replace configured baselines in their original order; later scoped revocations still win.
                  agent.permissions = native.permission.map((rule) => ({
                    action: rule.permission,
                    resource: rule.pattern,
                    effect: rule.action,
                  }))
                })
              }),
            )
            .pipe(Effect.asVoid),
        )
      }).pipe(Effect.provide(context))
      return context
    }),
  )
  return Effect.fn("UpstreamV2.bootstrap")((instance: InstanceContext) =>
    InstanceState.get(state).pipe(Effect.provideService(InstanceRef, instance), Effect.asVoid),
  )
})

function requireNative(native: Agent.Info | undefined) {
  if (native?.id !== "archie" || native.native !== true) throw new Error("UPSTREAM_NATIVE_IDENTITY_MISSING")
}

export * as UpstreamV2 from "./upstream-v2"
