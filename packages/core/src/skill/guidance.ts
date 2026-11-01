export * as SkillGuidance from "./guidance"

import { makeLocationNode } from "../effect/app-node"
import { Context, Effect, Layer, Schema } from "effect"
import { AgentV2 } from "../agent"
import { PermissionV2 } from "../permission"
import { SkillV2 } from "../skill"
import { SystemContext } from "../system-context/index"

const Summary = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
})
type Summary = typeof Summary.Type

// Bounds the advertised list so a large skill catalog cannot crowd the system prompt. Skills past the budget keep
// only their names; the skill tool still loads them by exact name.
const DESCRIPTION_LIMIT = 300
const LIST_BUDGET = 12_000

const render = (skills: ReadonlyArray<Summary>) => {
  const entries = skills.map((skill) =>
    [
      "  <skill>",
      `    <name>${skill.name}</name>`,
      `    <description>${clip(skill.description)}</description>`,
      "  </skill>",
    ].join("\n"),
  )
  const shown = entries.reduce(
    (fit, entry) =>
      fit.full || fit.used + entry.length > LIST_BUDGET
        ? { ...fit, full: true }
        : { used: fit.used + entry.length, count: fit.count + 1, full: false },
    { used: 0, count: 0, full: false },
  ).count
  const rest = skills.slice(shown).map((skill) => skill.name)
  return [
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
    ...(skills.length === 0
      ? ["No skills are currently available."]
      : [
          "<available_skills>",
          ...entries.slice(0, shown),
          "</available_skills>",
          ...(rest.length === 0
            ? []
            : [
                `${rest.length} more skills are available but not described here. Load one by its exact name with the skill tool when its name matches the task: ${rest.join(", ")}`,
              ]),
        ]),
  ].join("\n")
}

const clip = (text: string) =>
  text.length <= DESCRIPTION_LIMIT ? text : `${text.slice(0, DESCRIPTION_LIMIT - 1).trimEnd()}…`

export interface Interface {
  readonly load: (agent: AgentV2.Selection) => Effect.Effect<SystemContext.SystemContext>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SkillGuidance") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skills = yield* SkillV2.Service

    return Service.of({
      load: Effect.fn("SkillGuidance.load")(function* (selection) {
        const agent = selection.info
        if (!agent) return SystemContext.empty
        const all = yield* skills.list()
        const permitted = SkillV2.available(all, agent).filter((skill) => !SkillV2.nested(all, skill))
        if (permitted.length === 0 && PermissionV2.evaluate("skill", "*", agent.permissions).effect === "deny")
          return SystemContext.empty
        const available = permitted
          .flatMap((skill) =>
            skill.description === undefined ? [] : [{ name: skill.name, description: skill.description }],
          )
          .toSorted((a, b) => a.name.localeCompare(b.name))
        return SystemContext.make({
          key: SystemContext.Key.make("core/skill-guidance"),
          codec: Schema.toCodecJson(Schema.Array(Summary)),
          load: Effect.succeed(available),
          baseline: render,
          update: (_previous, current) =>
            [
              "The available skills have changed. This list supersedes the previous available skills list.",
              render(current),
            ].join("\n"),
          removed: () => "Skill guidance is no longer available. Do not use any previously listed skill.",
        })
      }),
    })
  }),
)

export const locationLayer = layer

export const node = makeLocationNode({ service: Service, layer, deps: [SkillV2.node] })
