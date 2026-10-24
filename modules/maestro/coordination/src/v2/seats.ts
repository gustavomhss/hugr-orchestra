export * as MaestroSeatsV2 from "./seats"

import path from "path"
import { Effect, Layer, Option } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import type { Host } from "@orchestra/core/host"
import type { PermissionV2 } from "@orchestra/core/permission"
import { PluginV2 } from "@orchestra/core/plugin"
import { SkillV2 } from "@orchestra/core/skill"
import { ArsenalNative } from "../arsenal-native"
import { MaestroGovernanceV2 } from "./governance"
import { Seats } from "../seats"
import { MaestroAtlasHeaderV2 } from "./atlas-header-source"
import { MaestroAtlasRestoreV2 } from "./atlas-restore"
import { MaestroSeats } from "./seats-service"
import { MaestroSkillSourcesV2 } from "./skill-sources"
import { MaestroToolsV2 } from "./tools"
import { MaestroAtlasToolV2 } from "./tools/atlas"

export const pluginID = PluginV2.ID.make("maestro/seats")

/**
 * Projects every native seat of the roster into the Location's V2 agents as a subagent with its charter and task-tool
 * description, and its native profile as the last rules, so configuration cannot widen it (findLast wins). Maestro itself
 * is core's default agent; configuration (`agent.<id>`) installed before this plugin keeps its prompt and description,
 * and the seat's engine, model and display label stay the owner's settings. Every agent then gets the `visibility`
 * denials, and Maestro its playbooks as skills.
 *
 * The roster loads lazily: it materializes the seats' skill trees and the playbooks, which only an Orchestra build
 * packages. Where they are missing (the standalone CLI binary today) the seats and playbooks are skipped with a warning
 * and the Location still opens; the denials apply regardless.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const agents = yield* AgentV2.Service
    const skills = yield* SkillV2.Service
    const seats = yield* MaestroSeats.Service
    const loaded = yield* Effect.tryPromise(() => Promise.all([import("../roster"), import("../seat-skill-root")])).pipe(
      Effect.option,
    )
    if (loaded._tag === "None") yield* Effect.logWarning("native seats unavailable: the seat roster could not load")
    const modules = Option.getOrUndefined(loaded)
    const roster = modules?.[0]
    const skillRoot = modules?.[1]
    yield* plugins.wait(PluginV2.ID.make("config-agent"))
    yield* plugins.ensure(pluginID, () =>
      Effect.gen(function* () {
        if (skillRoot) yield* skills.transform(MaestroSkillSourcesV2.playbooks(skillRoot.SeatSkillRoot.playbooks))
        yield* agents.transform((draft) => {
          if (roster)
            roster.roster
              .filter((member) => seats.has(member.memberId))
              .forEach((member) =>
                draft.update(AgentV2.ID.make(member.memberId), (agent) => {
                  const root = skillRoot?.SeatSkillRoot.roots[member.memberId]
                  agent.system ??= roster.renderPrompt(member, member.displayName)
                  agent.description ??= Seats.all[member.memberId].description
                  agent.mode = "subagent"
                  agent.permissions.push(
                    ...floor(roster.nativeProfiles[member.memberId]),
                    // A seat reads its own skill tree but never edits it; inside the Location it is ordinary source.
                    ...(root ? [{ action: "edit", resource: path.join(root, "*"), effect: "deny" as const }] : []),
                  )
                }),
              )
          draft.list().forEach((agent) => draft.update(agent.id, (item) => item.permissions.push(...visibility(agent.id))))
        })
      }),
    )
  }),
)

type RuleEffect = "allow" | "deny" | "ask"

/** A roster profile (`{ action: effect | { resource: effect } }`) as V2 rules, in the profile's order. */
export function floor(profile: Readonly<Record<string, RuleEffect | Readonly<Record<string, RuleEffect>>>> | undefined) {
  return Object.entries(profile ?? {}).flatMap(([action, value]) =>
    typeof value === "string"
      ? [{ action, resource: "*", effect: value }]
      : Object.entries(value).map(([resource, effect]) => ({ action, resource, effect })),
  )
}

/**
 * Which agents may use each Maestro and Atlas Memory tool (V1's per-agent tool filter). Every other agent is denied the
 * tool by rule, whether or not it is registered in this Location, and configuration cannot allow it back.
 */
export const owners: readonly { readonly tools: readonly string[]; readonly agents: readonly string[] }[] = [
  {
    tools: [
      "maestro_record_result_decision",
      "maestro_record_admission",
      "maestro_present_approval",
      "maestro_record_approval",
      "maestro_record_plan_revision",
      "maestro_catalog_context",
      "maestro_workflows",
      "maestro_record_context",
      "maestro_request_review",
      "maestro_record_validation",
      "maestro_grant_authorization",
    ],
    agents: [AgentV2.defaultID],
  },
  // The upstream seat's own floor limits it to the pure authoring operations.
  { tools: ["maestro_arsenal_catalog", "maestro_arsenal_describe", "maestro_arsenal_execute"], agents: [AgentV2.defaultID, "archie"] },
  { tools: ["maestro_record_review"], agents: ["lucy"] },
  {
    tools: ["atlas_memory_recall", "atlas_memory_emit"],
    agents: Object.values(Seats.all).filter((seat) => seat.atlasMemory).map((seat) => seat.id),
  },
]

/** The rules denying an agent the tools it may not use and, unless it is Maestro, the playbooks. */
export function visibility(id: string): PermissionV2.Ruleset {
  return [
    ...owners
      .filter((owner) => !owner.agents.includes(id))
      .flatMap((owner) => owner.tools.map((tool) => ({ action: tool, resource: "*", effect: "deny" as const }))),
    ...(id === AgentV2.defaultID ? [] : MaestroSkillSourcesV2.denied),
  ]
}

export const node = makeLocationNode({
  name: "maestro/seats",
  layer,
  deps: [PluginV2.node, AgentV2.node, SkillV2.node, MaestroSeats.node],
})

/** Maestro on V2: native seats as agents, Maestro's native and Atlas tools, the Atlas header and resume, the Arsenal's native safety owner and Maestro's Task governance in every Location. */
export const contribution: Host.Contribution = {
  id: "maestro",
  replacements: [...ArsenalNative.nativeRegistryReplacements, ...MaestroGovernanceV2.replacements],
  locationNodes: [
    MaestroSeats.node,
    node,
    MaestroToolsV2.node,
    MaestroAtlasToolV2.node,
    MaestroAtlasHeaderV2.node,
    MaestroAtlasRestoreV2.node,
  ],
}
