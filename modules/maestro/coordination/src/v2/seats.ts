export * as MaestroSeatsV2 from "./seats"

import path from "path"
import { Effect, Layer, Option } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { BoardTools } from "@orchestra/core/board/tools"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import type { Host } from "@orchestra/core/host"
import type { PermissionV2 } from "@orchestra/core/permission"
import { PluginV2 } from "@orchestra/core/plugin"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { SkillV2 } from "@orchestra/core/skill"
import { ArsenalNative } from "../arsenal-native"
import { MaestroGovernanceV2 } from "./governance"
import { Seats } from "../seats"
import { MaestroAtlasHeaderV2 } from "./atlas-header-source"
import { MaestroAtlasRestoreV2 } from "./atlas-restore"
import { MaestroResearchInquiryV2 } from "./research-inquiry-source"
import { MaestroSeats } from "./seats-service"
import { MaestroSkillSourcesV2 } from "./skill-sources"
import { MaestroToolsV2 } from "./tools"
import { MaestroAtlasToolV2 } from "./tools/atlas"
import { MaestroResearchTools } from "./tools/research"
import { MaestroWorkflowHostV2 } from "./workflow/host"

export const pluginID = PluginV2.ID.make("maestro/seats")

/**
 * Projects every native seat of the roster into the Location's V2 agents as a subagent (a direct seat as a primary
 * agent) with its charter and task-tool description, and its native profile as the last rules, so configuration cannot
 * widen it (findLast wins). Maestro itself
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
        if (skillRoot) {
          yield* skills.transform(MaestroSkillSourcesV2.playbooks(skillRoot.SeatSkillRoot.playbooks))
          yield* skills.transform(MaestroSkillSourcesV2.seats(skillRoot.SeatSkillRoot.roots))
        }
        yield* agents.transform(
          Effect.fn(function* (draft) {
            const members = roster ? roster.roster.filter((member) => seats.has(member.memberId)) : []
            for (const member of members) {
              const id = AgentV2.ID.make(member.memberId)
              const resolved = label(member.memberId, member.displayName, draft.get(id)?.name, draft.list())
              if (resolved.problem)
                yield* Effect.logWarning(
                  `Invalid configuration ${resolved.path}: label ${resolved.problem}. Using "${member.displayName}".`,
                )
              draft.update(id, (agent) => {
                const root = skillRoot?.SeatSkillRoot.roots[member.memberId]
                agent.name = resolved.label
                agent.system ??= roster?.renderPrompt(member, resolved.label)
                agent.description ??= Seats.all[member.memberId].description
                agent.mode = Seats.all[member.memberId].direct ? "primary" : "subagent"
                agent.permissions.push(
                  ...floor(roster?.nativeProfiles[member.memberId]),
                  // A seat reads its own skill tree but never edits it; inside the Location it is ordinary source.
                  ...(root ? [{ action: "edit", resource: path.join(root, "*"), effect: "deny" as const }] : []),
                )
              })
            }
            draft.list().forEach((agent) => draft.update(agent.id, (item) => item.permissions.push(...visibility(agent.id))))
          }),
        )
      }),
    )
  }),
)

/**
 * A native seat's display label, as on the earlier runtime: its label variable (`HUGR_BACKEND_NAME`, `HUGR_UPSTREAM_NAME`), else
 * `agent.<id>.name`, else the roster default. The label is presentation only; the id stays the address. An invalid label
 * keeps the default and names the problem.
 */
export function label(id: string, fallback: string, configured: string | undefined, others: ReadonlyArray<AgentV2.Info>) {
  const variable = Seats.find(id)?.labelEnv
  const value = variable ? process.env[variable] : undefined
  const source =
    value !== undefined
      ? { path: variable, value }
      : configured !== undefined
        ? { path: `agent.${id}.name`, value: configured }
        : undefined
  if (!source) return { label: fallback }
  const trimmed = source.value.trim()
  const problem = labelProblem(trimmed, others.filter((agent) => agent.id !== id))
  if (problem) return { label: fallback, path: source.path, problem }
  return { label: trimmed }
}

const reservedLabels = new Set(["build", "plan", "general", "explore", "maestro", "title", "summary", "compaction"])

// A label stays unambiguous against every other agent's id and label.
function labelProblem(label: string, others: ReadonlyArray<AgentV2.Info>) {
  if (!label) return "empty"
  if ([...label].length > 40) return "longer than 40 characters"
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(label)) return "contains a control character or line break"
  const folded = fold(label)
  if (reservedLabels.has(folded)) return "reserved agent id"
  if (others.some((agent) => (agent.name !== undefined && fold(agent.name) === folded) || fold(agent.id) === folded))
    return "already used by another agent"
}

function fold(value: string) {
  return value.normalize("NFC").toLowerCase()
}

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
 * Which agents may use each Maestro and Atlas Memory tool (the earlier runtime's per-agent tool filter). Every other agent is denied the
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
  { tools: Object.values(MaestroResearchTools.names), agents: [ResearchSeatTools.SEAT] },
  {
    tools: ["atlas_memory_recall", "atlas_memory_emit"],
    agents: Object.values(Seats.all).filter((seat) => seat.atlasMemory).map((seat) => seat.id),
  },
]

/**
 * The rules denying an agent the tools it may not use, every other seat's entry skills and, unless it is Maestro, the
 * playbooks.
 */
export function visibility(id: string): PermissionV2.Ruleset {
  return [
    ...owners
      .filter((owner) => !owner.agents.includes(id))
      .flatMap((owner) => owner.tools.map((tool) => ({ action: tool, resource: "*", effect: "deny" as const }))),
    ...Object.values(Seats.all)
      .filter((seat) => seat.id !== id)
      .flatMap((seat) => seat.skills.map((name) => ({ action: "skill", resource: name, effect: "deny" as const }))),
    ...(id === AgentV2.defaultID ? [] : MaestroSkillSourcesV2.denied),
  ]
}

export const node = makeLocationNode({
  name: "maestro/seats",
  layer,
  deps: [PluginV2.node, AgentV2.node, SkillV2.node, MaestroSeats.node],
})

/** Maestro on V2: native seats as agents, Maestro's native and Atlas tools, the Atlas header and resume, the research seat's inquiry snapshot, the Arsenal's native safety owner and Maestro's Task governance in every Location, plus the workflow completion host and Maestro's board tools. */
export const contribution: Host.Contribution = {
  id: "maestro",
  replacements: [...ArsenalNative.nativeRegistryReplacements, ...MaestroGovernanceV2.replacements],
  nodes: [MaestroWorkflowHostV2.node, BoardTools.node],
  locationNodes: [
    MaestroSeats.node,
    node,
    MaestroToolsV2.node,
    MaestroAtlasToolV2.node,
    MaestroAtlasHeaderV2.node,
    MaestroAtlasRestoreV2.node,
    MaestroResearchInquiryV2.node,
  ],
}
