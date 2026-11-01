export * as MaestroTeamV2 from "./team-source"

import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { Effect, Layer, Schema } from "effect"
import { Seats } from "../seats"

export const key = SystemContext.Key.make("maestro/team")

/**
 * Maestro's team list, generated from the agents of the Location and the seat catalog, as one System Context source of
 * Maestro's provider turns; other agents get nothing. Each dispatchable agent is listed by id with its current display
 * name and the work that goes to it, so a new seat, a rename or a project's `agents.<id>.areas` reaches Maestro as a
 * context update in both engines, with no prompt edit.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* SystemContextRegistry.Service
    const agents = yield* AgentV2.Service
    const config = yield* Config.Service
    yield* registry.register({
      key,
      load: Effect.gen(function* () {
        const turn = yield* SystemContextRegistry.Turn
        if (turn?.agent !== AgentV2.defaultID) return SystemContext.empty
        const text = render(yield* agents.all(), areas(yield* config.entries()))
        return SystemContext.make({
          key,
          codec: Schema.toCodecJson(Schema.String),
          load: Effect.succeed(text),
          baseline: (text) => text,
          update: (_previous, text) => text,
          removed: () => "<team>No teammate can be dispatched in this Location.</team>",
        })
      }),
    })
  }),
)

/** Each agent's project areas from config `agents.<id>.areas`; a later document replaces an earlier one's list. */
export function areas(entries: readonly Config.Entry[]) {
  return new Map(
    entries.flatMap((entry) =>
      entry.type === "document"
        ? Object.entries(entry.info.agents ?? {}).flatMap(([id, agent]) => (agent.areas ? [[id, agent.areas] as const] : []))
        : [],
    ),
  )
}

export function render(agents: readonly AgentV2.Info[], owned: ReadonlyMap<string, readonly string[]>) {
  const dispatchable = agents
    .filter((agent) => agent.id !== AgentV2.defaultID && agent.mode !== "primary" && !agent.hidden)
    .toSorted((a, b) => a.id.localeCompare(b.id))
  const ready = dispatchable.filter((agent) => {
    const seat = Seats.find(agent.id)
    return !seat || Seats.staffed(seat)
  })
  const waiting = dispatchable.filter((agent) => !ready.includes(agent))
  const ids = new Set(ready.map((agent) => agent.id))
  const research = Seats.research()?.id
  const planner = Seats.planner()?.id
  const approver = Seats.approver()?.id
  return [
    "<team>",
    "Route work by this list. Each line is a teammate's id (the `subagent_type` you pass to `task`), the name the owner sees, and the work that goes to it.",
    ...ready.map((agent) => {
      const list = owned.get(agent.id) ?? []
      const work = line(Seats.find(agent.id)?.routing ?? agent.description ?? "No description.")
      return `- \`${agent.id}\` (shown as ${line(agent.name ?? agent.id)}): ${work}${list.length ? ` Areas: ${list.map((area) => `\`${line(area)}\``).join(", ")}.` : ""}`
    }),
    ...(waiting.length ? [`Not staffed yet, do not dispatch: ${waiting.map((agent) => `\`${agent.id}\``).join(", ")}.`] : []),
    "Routing:",
    ...(research && ids.has(research) ? [`- Investigation, research, debugging and fact-finding go to \`${research}\`, not to your own reads.`] : []),
    ...(planner && ids.has(planner) ? [`- Plans, decompositions and briefs go to \`${planner}\`.`] : []),
    ...(approver && ids.has(approver) ? [`- The review that gates shipping goes to \`${approver}\`.`] : []),
    "- Code in a teammate's areas goes to that teammate, with `card` and `writePaths`.",
    ...(ids.has("general") ? ["- Other code goes to the matching seat, or to `general` with `writePaths`."] : []),
    "- You verify, integrate and make micro-edits; teammates build.",
    "</team>",
  ].join("\n")
}

// Names, descriptions and areas are owner settings; keep each on one line of the list.
function line(text: string) {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, " ").trim()
}

export const node = makeLocationNode({
  name: "maestro/team",
  layer,
  deps: [SystemContextRegistry.node, AgentV2.node, Config.node],
})
