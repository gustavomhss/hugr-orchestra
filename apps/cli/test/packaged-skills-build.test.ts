import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { packagedSkills } from "../script/packaged-skills"
import { Seats } from "../../orchestra/src/maestro/seats"
import { SeatSkillContent } from "../../orchestra/src/maestro/seat-skill-content"

test("CLI build producer includes every canonical seat, entry and reference byte", async () => {
  const trees = await packagedSkills()
  const seats = Object.values(Seats.all).filter((seat) => seat.skills.length > 0)
  expect(seats.length).toBeGreaterThan(0)
  expect(Object.keys(trees).toSorted()).toEqual(seats.map((seat) => seat.id).toSorted())
  for (const seat of seats) {
    const expected = await SeatSkillContent.read(seat.id, Seats.skillSource(seat.id), seat.skills)
    expect(Object.keys(expected).length).toBeGreaterThan(0)
    expect(trees[seat.id]).toEqual(expected)
    expect(Object.keys(trees[seat.id]).filter((file) => path.posix.basename(file) === "SKILL.md").toSorted())
      .toEqual(seat.skills.map((skill) => `${skill}/SKILL.md`).toSorted())
  }
  // Positive reference control: entry-only snapshots must not satisfy this proof.
  expect(Object.keys(trees.backend).filter((file) => file.includes("/references/")).length).toBeGreaterThan(0)
  const cache = await fs.mkdtemp(path.join(tmpdir(), "orchestra-cli-skills-"))
  try {
    const result = await Bun.build({
      entrypoints: [path.resolve(import.meta.dirname, "../../core/src/packaged-skills.ts")],
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
    expect(roots).toHaveLength(seats.length)
    for (const root of roots) {
      for (const [file, text] of Object.entries(trees[path.basename(root)])) {
        expect(await fs.readFile(path.join(root, ...file.split("/")))).toEqual(Buffer.from(text, "utf8"))
      }
    }
  } finally {
    await fs.rm(cache, { recursive: true, force: true })
  }
})
