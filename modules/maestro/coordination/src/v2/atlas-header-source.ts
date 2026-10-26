export * as MaestroAtlasHeaderV2 from "./atlas-header-source"

import { readBoundHeader } from "@orchestra/atlas-boundary/native-header"
import type { BoundHeader } from "@orchestra/atlas-boundary/native-header"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { Location } from "@orchestra/core/location"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { Effect, Layer, Schema } from "effect"
import { MaestroAtlasSourceV2 } from "./atlas-source"
import { MaestroSeats } from "./seats-service"

export const key = SystemContext.Key.make("maestro/atlas-header")

/**
 * A native Atlas seat's running header (Awareness, Orientation and its own top-12 project rules) as one System Context
 * source of every provider turn the seat executes; other agents get nothing. Storage is the execution worktree's root.
 * The read never writes and never fails the turn: an unreadable or partial store renders the explicit degraded marker
 * The earlier runtime renders, which the charter tells the specialist to act on. A changed header is admitted whole as the update, so the
 * model always holds the current one.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* SystemContextRegistry.Service
    const seats = yield* MaestroSeats.Service
    const location = yield* Location.Service
    yield* registry.register({
      key,
      load: Effect.gen(function* () {
        const turn = yield* SystemContextRegistry.Turn
        const member = turn && MaestroAtlasSourceV2.owner(turn.agent, seats)
        if (!member) return SystemContext.empty
        return SystemContext.make({
          key,
          codec: Schema.toCodecJson(Schema.String),
          load: render(member, {
            projectID: location.project.id,
            root: location.vcs?.type === "git" ? location.project.directory : location.directory,
          }),
          baseline: (header) => header,
          update: (_previous, header) => header,
        })
      }),
    })
  }),
)

export const render = Effect.fn("MaestroAtlasHeaderV2.render")(function* (
  member: MaestroAtlasSourceV2.Owner,
  storage: { readonly projectID: string; readonly root: string },
) {
  // The legacy backend owner id derives from the roster, which loads lazily like the seats it describes.
  const legacy =
    member === "backend"
      ? yield* Effect.tryPromise(() => import("../roster")).pipe(
          Effect.map((roster) => [roster.LEGACY_BACKEND_ID]),
          Effect.orElseSucceed((): string[] => []),
        )
      : []
  return yield* Effect.try({
    try: () => format(readBoundHeader({ storage, memoryOwner: member, legacyOwners: legacy }), member),
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      Effect.logWarning("atlas header unavailable", { root: storage.root, cause }).pipe(
        Effect.as(degraded(member, firstLine(cause))),
      ),
    ),
  )
})

/** The Atlas header text, byte for byte as earlier sessions recorded it. */
export function format(bound: BoundHeader, member: MaestroAtlasSourceV2.Owner) {
  if (!bound.header) return degraded(member, "the project rules store could not be read")
  const facets = Object.entries(bound.header.awareness).map(([name, facet]) =>
    facet.state === "UN-SEEDED" ? `- ${name}: unseeded` : `- ${name} (${facet.state}): ${facet.content}`,
  )
  // An empty Orientation field is a missing source, not a current milestone (F3 cl. 7).
  const orientation = Object.entries(bound.header.orientation).filter(([, value]) => value !== "")
  const rules = bound.header.rules.map((rule) => `- [${rule.scope}] ${rule.rule}`)
  const partial = bound.state.rules === "partial"
  return [
    `<atlas-header member="${member}" rules="${rules.length}" rule-words="${bound.bound.rulesWords}"${partial ? ' degraded="rules-partial"' : ""}>`,
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

export function degraded(member: MaestroAtlasSourceV2.Owner, reason: string) {
  return `<atlas-header member="${member}" degraded="unavailable">Degraded: Atlas memory is unavailable (${reason}); no project rules are loaded.</atlas-header>`
}

function firstLine(cause: unknown) {
  return (cause instanceof Error ? cause.message : String(cause)).split("\n")[0]!.slice(0, 160)
}

export const node = makeLocationNode({
  name: "maestro/atlas-header",
  layer,
  deps: [Location.node, SystemContextRegistry.node, MaestroSeats.node],
})
