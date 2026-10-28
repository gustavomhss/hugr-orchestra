import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { packagedSkills } from "../script/packaged-skills"
import { Seats } from "@orchestra/maestro/seats"
import { SeatSkillContent } from "@orchestra/maestro/seat-skill-content"

test("CLI build producer includes every canonical seat, entry and reference byte", async () => {
  const trees = await packagedSkills()
  const seats = Object.values(Seats.all).filter((seat) => seat.skills.length > 0)
  expect(seats.length).toBeGreaterThan(0)
  const shared = Seats.shared()
  expect(Object.keys(trees).toSorted())
    .toEqual([...seats.map((seat) => seat.id), ...(shared.length > 0 ? ["team"] : [])].toSorted())
  const sources = [
    ...seats.map((seat) => [seat.id, Seats.skillSource(seat.id), seat.skills.filter((skill) => !skill.startsWith("team-"))] as const),
    ...(shared.length > 0 ? [["team", Seats.sharedSource(), shared] as const] : []),
  ]
  for (const [id, source, skills] of sources) {
    const expected = await SeatSkillContent.read(id, source, skills)
    expect(Object.keys(expected).length).toBeGreaterThan(0)
    expect(trees[id]).toEqual(expected)
    // Every root is a node; nodes below a root are part of its tree.
    expect(Object.keys(trees[id]).filter((file) => file.split("/").length === 2 && path.posix.basename(file) === "SKILL.md").toSorted())
      .toEqual(skills.map((skill) => `${skill}/SKILL.md`).toSorted())
  }
  // Positive reference control: entry-only snapshots must not satisfy this proof.
  expect(Object.keys(trees.backend).filter((file) => file.includes("/references/")).length).toBeGreaterThan(0)
  const cache = await fs.mkdtemp(path.join(tmpdir(), "orchestra-cli-skills-"))
  try {
    const result = await Bun.build({
      entrypoints: [path.resolve(import.meta.dirname, "../../../packages/core/src/packaged-skills.ts")],
      target: "bun",
      format: "esm",
      minify: true,
      define: { ORCHESTRA_PACKAGED_SKILLS: JSON.stringify(trees) },
    })
    expect(result.success, JSON.stringify(result.logs)).toBe(true)
    expect(result.outputs).toHaveLength(1)
    const module = path.join(cache, "compiled-skills.mjs")
    await Bun.write(module, result.outputs[0])
    const compiled: typeof import("@orchestra/core/packaged-skills") = await import(module)
    expect(compiled.embedded()).toEqual(trees)
    const roots = await compiled.materialize({ cache, version: "closure-proof" })
    expect(roots).toHaveLength(sources.length)
    for (const root of roots) {
      for (const [file, text] of Object.entries(trees[path.basename(root)])) {
        expect(await fs.readFile(path.join(root, ...file.split("/")))).toEqual(Buffer.from(text, "utf8"))
      }
    }
  } finally {
    await fs.rm(cache, { recursive: true, force: true })
  }
})
