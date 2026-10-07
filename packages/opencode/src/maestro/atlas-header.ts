import { readBoundHeader } from "@opencode-ai/atlas-boundary/native-header"
import type { BoundHeader } from "@opencode-ai/atlas-boundary/native-header"
import { Effect } from "effect"
import type { Agent } from "@/agent/agent"
import { InstanceRef } from "@/effect/instance-ref"
import { LEGACY_BACKEND_ID } from "./roster"
import { AtlasMemory } from "./atlas-memory"

const MEMBER = AtlasMemory.MEMBER

// F3 A4: the backend seat's running Atlas header (Awareness, Orientation and its own top-12 project rules) as one
// system part of every provider turn it executes (F3 cl. 6-10, F2.8). The member comes from the executing agent's
// stable id, never its label; every other agent, and the title/compaction/summary agents, get nothing. Storage is the
// execution worktree's root (owner ruling F3-D5). The read never writes and never throws into the turn: an
// unreadable or partial store renders an explicit degraded marker, which the charter tells the specialist to act on.
export const render = Effect.fn("AtlasHeader.render")(function* (agent: Pick<Agent.Info, "id" | "native">) {
  if (!AtlasMemory.supports(agent)) return undefined
  const instance = yield* InstanceRef
  if (!instance) return degraded("no project placement is bound to this turn")
  const root = instance.worktree === "/" ? instance.directory : instance.worktree
  return yield* Effect.try({
    try: () =>
      format(
        readBoundHeader({
          storage: { projectID: instance.project.id, root },
          memoryOwner: MEMBER,
          legacyOwners: [LEGACY_BACKEND_ID],
        }),
      ),
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      Effect.logWarning("atlas header unavailable", { root, cause }).pipe(Effect.as(degraded(firstLine(cause)))),
    ),
  )
})

function format(bound: BoundHeader) {
  if (!bound.header) return degraded("the project rules store could not be read")
  const facets = Object.entries(bound.header.awareness).map(([name, facet]) =>
    facet.state === "UN-SEEDED" ? `- ${name}: unseeded` : `- ${name} (${facet.state}): ${facet.content}`,
  )
  // An empty Orientation field is a missing source, not a current milestone (F3 cl. 7).
  const orientation = Object.entries(bound.header.orientation).filter(([, value]) => value !== "")
  const rules = bound.header.rules.map((rule) => `- [${rule.scope}] ${rule.rule}`)
  const partial = bound.state.rules === "partial"
  return [
    `<atlas-header member="${MEMBER}" rules="${rules.length}" rule-words="${bound.bound.rulesWords}"${partial ? ' degraded="rules-partial"' : ""}>`,
    ...(partial ? ["Degraded: some stored project rules could not be read; this list may be incomplete."] : []),
    "Awareness:",
    ...facets,
    orientation.length
      ? `Orientation: ${orientation.map(([key, value]) => `${key}: ${value}`).join("; ")}`
      : "Orientation: none recorded",
    rules.length ? "Project rules:" : "Project rules: none recorded",
    ...rules,
    "</atlas-header>",
  ].join("\n")
}

function degraded(reason: string) {
  return `<atlas-header member="${MEMBER}" degraded="unavailable">Degraded: Atlas memory is unavailable (${reason}); no project rules are loaded.</atlas-header>`
}

function firstLine(cause: unknown) {
  return (cause instanceof Error ? cause.message : String(cause)).split("\n")[0]!.slice(0, 160)
}

export * as AtlasHeader from "./atlas-header"
