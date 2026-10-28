import fs from "fs/promises"
import os from "os"
import path from "path"
import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AbsolutePath } from "@orchestra/core/schema"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillDiscovery } from "@orchestra/core/skill/discovery"
import { nativeProfiles } from "../src/roster"
import { PlaybookContent } from "../src/playbook-content"
import { SeatSkillRoot } from "../src/seat-skill-root"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroSkillSourcesV2 } from "../src/v2/skill-sources"

const discovery = Layer.succeed(SkillDiscovery.Service, SkillDiscovery.Service.of({ pull: () => Effect.succeed([]) }))

const agent = (id: string) => ({
  ...AgentV2.Info.empty(AgentV2.ID.make(id)),
  permissions: [{ action: "*", resource: "*", effect: "allow" as const }, ...MaestroSeatsV2.visibility(id)],
})

test("Maestro lists every playbook, a same-name skill from another source wins, and other agents cannot load them", async () => {
  const other = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-v2-skills-"))
  await Promise.all(
    ["frame-request", "my-skill"].map(async (name) => {
      await fs.mkdir(path.join(other, name))
      await fs.writeFile(path.join(other, name, "SKILL.md"), `---\nname: ${name}\ndescription: Other ${name}\n---\n# ${name}`)
    }),
  )
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const skills = yield* SkillV2.Service
        // Configuration's sources register before the Maestro plugin, as in a Location.
        yield* skills.transform((draft) => draft.source({ type: "directory", path: AbsolutePath.make(other) }))
        yield* skills.transform(MaestroSkillSourcesV2.playbooks(SeatSkillRoot.playbooks))
        return { sources: yield* skills.sources(), list: yield* skills.list() }
      }),
    ).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([SkillV2.node]), [[SkillDiscovery.node, discovery]]) as Layer.Layer<SkillV2.Service>,
      ),
    ),
  ).finally(() => fs.rm(other, { recursive: true, force: true }))

  expect(result.sources.map((source) => (source.type === "directory" ? String(source.path) : ""))).toEqual([
    SeatSkillRoot.playbooks,
    other,
  ])
  const byName = new Map(result.list.map((skill) => [skill.name, skill]))
  for (const name of PlaybookContent.names) expect(byName.has(name)).toBe(true)
  expect(byName.get("frame-request")?.description).toBe("Other frame-request")
  expect(byName.get("maestro-governed")?.location).toBe(
    AbsolutePath.make(path.join(SeatSkillRoot.playbooks, "maestro-governed", "SKILL.md")),
  )

  const maestro = SkillV2.available(result.list, agent("maestro")).map((skill) => skill.name)
  expect(maestro).toEqual(expect.arrayContaining([...PlaybookContent.names, "my-skill"]))
  for (const id of ["general", "backend", "lucy"]) {
    const names = SkillV2.available(result.list, agent(id)).map((skill) => skill.name)
    expect(names).toContain("my-skill")
    for (const name of PlaybookContent.names) expect(names).not.toContain(name)
  }
})

test("each seat lists its own entry skills, read from its skill root, and no other agent lists them", async () => {
  const list = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const skills = yield* SkillV2.Service
        yield* skills.transform(MaestroSkillSourcesV2.seats(SeatSkillRoot.roots))
        return yield* skills.list()
      }),
    ).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([SkillV2.node]), [[SkillDiscovery.node, discovery]]) as Layer.Layer<SkillV2.Service>,
      ),
    ),
  )
  // As the seats layer orders them: configuration, the seat's floor, then visibility.
  const seat = (id: string) => ({
    ...AgentV2.Info.empty(AgentV2.ID.make(id)),
    permissions: [
      { action: "*", resource: "*", effect: "allow" as const },
      ...MaestroSeatsV2.floor(nativeProfiles[id]),
      ...MaestroSeatsV2.visibility(id),
    ],
  })
  const names = (id: string) => SkillV2.available(list, seat(id)).map((skill) => skill.name).toSorted()

  const backend = names("backend")
  expect(backend.length).toBeGreaterThan(0)
  expect(backend.every((name) => name.startsWith("backend-"))).toBe(true)
  expect(list.find((skill) => skill.name === "backend-api")?.location).toBe(
    AbsolutePath.make(path.join(SeatSkillRoot.roots.backend, "backend-api", "SKILL.md")),
  )
  expect(names("archie").every((name) => name.startsWith("archie-"))).toBe(true)
  for (const id of ["maestro", "general"]) expect(names(id)).toEqual([])
})
