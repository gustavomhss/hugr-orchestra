export * as MaestroSeatsV2 from "./seats"

import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import type { Host } from "@orchestra/core/host"
import { PluginV2 } from "@orchestra/core/plugin"
import { ArsenalNative } from "../arsenal-native"
import { nativeProfiles, renderPrompt, roster } from "../roster"
import { Seats } from "../seats"

export const pluginID = PluginV2.ID.make("maestro/seats")

/**
 * Projects every native seat of the roster into the Location's V2 agents as a subagent with its charter and task-tool
 * description, and its native profile as the last rules, so configuration cannot widen it (findLast wins). Maestro itself
 * is core's default agent; configuration (`agent.<id>`) installed before this plugin keeps its prompt and description,
 * and the seat's engine, model and display label stay the owner's settings.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const agents = yield* AgentV2.Service
    yield* plugins.wait(PluginV2.ID.make("config-agent"))
    yield* plugins.ensure(pluginID, () =>
      agents
        .transform((draft) =>
          roster.forEach((member) => {
            const seat = Seats.all[member.memberId]
            if (!seat) return
            draft.update(AgentV2.ID.make(seat.id), (agent) => {
              agent.system ??= renderPrompt(member, member.displayName)
              agent.description ??= seat.description
              agent.mode = "subagent"
              agent.permissions.push(...floor(member.nativeProfile))
            })
          }),
        )
        .pipe(Effect.asVoid),
    )
  }),
)

/** A roster profile (`{ action: effect | { resource: effect } }`) as V2 rules, in the profile's order. */
export function floor(profile: string | undefined) {
  return Object.entries(nativeProfiles[profile ?? ""] ?? {}).flatMap(([action, value]) =>
    typeof value === "string"
      ? [{ action, resource: "*", effect: value }]
      : Object.entries(value).map(([resource, effect]) => ({ action, resource, effect })),
  )
}

export const node = makeLocationNode({ name: "maestro/seats", layer, deps: [PluginV2.node, AgentV2.node] })

/** Maestro on V2: native seats as agents and the Arsenal's native safety owner in every Location. */
export const contribution: Host.Contribution = {
  id: "maestro",
  replacements: ArsenalNative.nativeRegistryReplacements,
  locationNodes: [node],
}
