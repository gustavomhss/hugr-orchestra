import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { BoundHeader } from "@orchestra/atlas-boundary/native-header"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { Effect, Layer } from "effect"
import { MaestroAtlasHeaderV2 } from "../src/v2/atlas-header-source"
import { MaestroSeats } from "../src/v2/seats-service"

// The V2 running header renders the earlier runtime's text byte for byte (goldens below are the earlier runtime's `format` output for the same bound
// header) and reaches only the Atlas Memory seats' turns.

const facet = (state: "seeded" | "UN-SEEDED" | "drifted", content = "") => ({ content, grounding: [], state })
const seeded = {
  awareness: {
    mission: facet("seeded", "Ship governed work"),
    constitution: facet("UN-SEEDED"),
    terrain: facet("drifted", "Monorepo"),
    ontology: facet("UN-SEEDED"),
    taste: facet("seeded", "Small diffs"),
  },
  orientation: { goal: "Parity", last: "", current: "M2", state: "" },
  rules: [
    { rule: "Use Bun APIs", scope: "repo", frecency: 1 },
    { rule: "No mocks", scope: "test", frecency: 1 },
  ],
}
const states = {
  awareness: { mission: "seeded", constitution: "UN-SEEDED", terrain: "drifted", ontology: "UN-SEEDED", taste: "seeded" },
} as const

describe("V2 Atlas header format", () => {
  test("a complete header matches the earlier runtime's bytes", () => {
    const bound: BoundHeader = {
      header: seeded,
      state: { ...states, rules: "complete" },
      bound: { rulesWords: 5, method: "whitespace-words" },
    }
    expect(MaestroAtlasHeaderV2.format(bound, "backend")).toBe(
      [
        '<atlas-header member="backend" rules="2" rule-words="5">',
        "Awareness:",
        "- mission (seeded): Ship governed work",
        "- constitution: unseeded",
        "- terrain (drifted): Monorepo",
        "- ontology: unseeded",
        "- taste (seeded): Small diffs",
        "Orientation: goal: Parity; current: M2",
        "Project rules:",
        "- [repo] Use Bun APIs",
        "- [test] No mocks",
        "</atlas-header>",
      ].join("\n"),
    )
  })

  test("partial rules, an empty store and a missing header keep the earlier runtime's degraded forms", () => {
    const partial: BoundHeader = {
      header: { ...seeded, orientation: { goal: "", last: "", current: "", state: "" }, rules: [] },
      state: { ...states, rules: "partial" },
      bound: { rulesWords: 0, method: "whitespace-words" },
    }
    expect(MaestroAtlasHeaderV2.format(partial, "jimmy")).toBe(
      [
        '<atlas-header member="jimmy" rules="0" rule-words="0" degraded="rules-partial">',
        "Degraded: some stored project rules could not be read; this list may be incomplete.",
        "Awareness:",
        "- mission (seeded): Ship governed work",
        "- constitution: unseeded",
        "- terrain (drifted): Monorepo",
        "- ontology: unseeded",
        "- taste (seeded): Small diffs",
        "Orientation: none recorded",
        "Project rules: none recorded",
        "</atlas-header>",
      ].join("\n"),
    )
    expect(
      MaestroAtlasHeaderV2.format(
        { state: { ...states, rules: "unavailable" }, bound: { rulesWords: 0, method: "whitespace-words" } },
        "archie",
      ),
    ).toBe(
      '<atlas-header member="archie" degraded="unavailable">Degraded: Atlas memory is unavailable (the project rules store could not be read); no project rules are loaded.</atlas-header>',
    )
  })
})

describe("V2 Atlas header source", () => {
  const load = async (turn?: SystemContextRegistry.TurnInfo) => {
    const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "maestro-atlas-header-")))
    const layer = AppNodeBuilder.build(LayerNode.group([SystemContextRegistry.node, MaestroAtlasHeaderV2.node]), [
      [
        Location.node,
        Layer.succeed(
          Location.Service,
          Location.Service.of({
            directory: AbsolutePath.make(directory),
            project: { id: Project.ID.make("prj_atlas_header"), directory: AbsolutePath.make(directory) },
          }),
        ),
      ],
      [MaestroSeats.node, Layer.succeed(MaestroSeats.Service, MaestroSeats.make(["backend", "lucy"]))],
    ]) as Layer.Layer<SystemContextRegistry.Service>
    return Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* SystemContextRegistry.Service
        return (yield* SystemContext.initialize(yield* registry.load(turn))).baseline
      }).pipe(Effect.scoped, Effect.provide(layer)),
    )
  }

  test("an Atlas Memory seat's turn carries its header; other turns carry none", async () => {
    expect(await load({ sessionID: "ses_header", agent: "backend" })).toStartWith('<atlas-header member="backend"')
    for (const agent of ["maestro", "lucy", "general"])
      expect(await load({ sessionID: "ses_header", agent })).not.toContain("<atlas-header")
    expect(await load()).not.toContain("<atlas-header")
  })
})
