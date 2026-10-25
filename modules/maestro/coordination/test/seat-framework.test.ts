import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { Seats } from "@orchestra/maestro/seats"
import { define } from "@orchestra/maestro/seats/seat"
import { add } from "../script/seat"
import { seatSkillsModule } from "@orchestra/maestro/seat-skills-module"
import { tmpdir } from "./fixture/tmpdir"

describe("native seat framework", () => {
  test("definitions correspond to registered files, charters and skill artifacts", async () => {
    const dir = path.resolve(import.meta.dirname, "../../../../modules/maestro/coordination/src/seats")
    const definitions = (await fs.readdir(dir)).filter((file) => file.endsWith(".ts") && !["index.ts", "seat.ts"].includes(file))
    expect(definitions.length).toBeGreaterThan(0)
    expect(definitions.toSorted()).toEqual(Object.values(Seats.all).map((seat) => `${seat.id}.ts`).toSorted())
    for (const seat of Object.values(Seats.all)) {
      expect(seat.prompt).toContain(`Return card: ${seat.returnCard}`)
      expect(seat.prompt.replaceAll("\r\n", "\n")).toBe(
        (await Bun.file(path.join(dir, "prompt", `${seat.id}.txt`)).text()).replaceAll("\r\n", "\n"),
      )
      if (seat.skills.length === 0) continue
      const root = Seats.skillSource(seat.id)
      const dirs = (await fs.readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).toSorted()
      expect(dirs).toEqual(seat.skills.toSorted())
      for (const skill of seat.skills) expect(matter(await Bun.file(path.join(root, skill, "SKILL.md")).text()).data.name).toBe(skill)
    }
    expect(Seats.all.backend.skills.toSorted()).toEqual(BackendToolkitManifest.ENTRY_SKILLS.toSorted())
    expect(Seats.all.jimmy).toMatchObject({
      id: "jimmy",
      profile: "discovery",
      returnCard: "jimmy-result",
      workResult: "discovery-work-result-v1",
      skills: ["jimmy-reference"],
      writeRoots: false,
      strictResume: true,
      atlasMemory: true,
      toolkit: false,
    })
    expect(await seatSkillsModule()).toContain('"backend": {')
  })

  test("unsupported ownership and malformed definitions fail before registration", () => {
    const backend = Seats.all.backend
    expect(() => define({ ...backend, id: "sample-seat" })).toThrow("Atlas Memory supports only backend, jimmy and archie owners: sample-seat")
    expect(() => define({ ...backend, id: "sample-seat", atlasMemory: false })).toThrow("The backend toolkit supports only the backend seat: sample-seat")
    expect(() => define({ ...backend, id: "../escape" })).toThrow("Invalid native seat id")
    expect(() => define({ ...backend, skills: ["foreign-work"] })).toThrow("Entry skills must be unique and seat-scoped")
    expect(() => define({ ...backend, returnCard: "unsafe.*" })).toThrow("Work result requires a fenced return-card tag")
    expect(() => define({ ...backend, profileKey: "review" })).toThrow("Invalid native seat profile key")
    expect(() => define({ ...backend, profileKey: "../escape" })).toThrow("Invalid native seat profile key")
  })

  test("Atlas Memory remains closed to approved native owners", () => {
    for (const id of ["backend", "jimmy", "archie"] as const) {
      expect(define(Seats.all[id])).toBe(Seats.all[id])
      expect(Seats.all[id].atlasMemory).toBe(true)
    }
    for (const seat of Object.values(Seats.all).filter((seat) => !["backend", "jimmy", "archie"].includes(seat.id))) {
      expect(() => define({ ...seat, atlasMemory: true })).toThrow(`Atlas Memory supports only backend, jimmy and archie owners: ${seat.id}`)
    }
  })

  test("upstream identity preserves bounded authoring and backend-only toolkit", () => {
    const upstream = Seats.all.archie
    expect(Seats.find("archie")).toBe(upstream)
    expect(upstream).toMatchObject({
      id: "archie",
      profile: "execution",
      profileKey: "upstream",
      labelEnv: "HUGR_UPSTREAM_NAME",
      skills: ["archie-plan", "archie-work-package"],
      returnCard: "upstream-result",
      workResult: "upstream-work-result-v1",
      writeRoots: true,
      strictResume: true,
      atlasMemory: true,
      toolkit: false,
    })
    expect(Seats.skillSource(upstream.id)).toBe(path.resolve(import.meta.dirname, "../../../../modules/specialists/archie/skills"))
    expect(upstream.prompt).toContain("Load archie-plan for authoring and archie-work-package")
    expect(define(upstream)).toBe(upstream)
    expect(() => define({ ...upstream, toolkit: true })).toThrow("The backend toolkit supports only the backend seat: archie")
  })

  test("scaffold refuses collisions and invalid ids without overwriting artifacts", async () => {
    await using tmp = await tmpdir()
    const packageRoot = path.join(tmp.path, "modules/maestro/coordination")
    await fs.mkdir(path.join(packageRoot, "src/seats/prompt"), { recursive: true })
    await fs.mkdir(path.join(packageRoot, "src/seats"), { recursive: true })
    // Seat skill trees live in packages/, beside modules/ in the real layout.
    await fs.mkdir(path.join(tmp.path, "packages"), { recursive: true })
    const index = path.join(packageRoot, "src/seats/index.ts")
    const before = await Bun.file(path.resolve(import.meta.dirname, "../../../../modules/maestro/coordination/src/seats/index.ts")).text()
    await Bun.write(index, before)
    for (const id of ["../escape", "Backend", "maestro", "execution", "constructor", "bad_underscore", "foo.ts", ""]) {
      await expect(add(id, "role", packageRoot)).rejects.toThrow("Invalid native seat id")
      expect(await Bun.file(index).text()).toBe(before)
    }
    const created = await add("sample-seat", "synthetic packet execution", packageRoot)
    expect(await Bun.file(created.definition).text()).toContain('id: "sample-seat"')
    expect(await Bun.file(created.prompt).text()).toContain("Return card: sample-seat-result")
    expect(matter(await Bun.file(path.join(created.tree, "skills/sample-seat-work/SKILL.md")).text()).data.name).toBe("sample-seat-work")
    const registered = await Bun.file(index).text()
    expect(registered).toContain('import seatSampleSeat from "./sample-seat"')
    expect(registered).toContain("[seatSampleSeat.id]: seatSampleSeat")
    await expect(add("sample-seat", "different role", packageRoot)).rejects.toThrow("Seat scaffold collision")
    expect(await Bun.file(index).text()).toBe(registered)
    expect(await Bun.file(created.prompt).text()).toContain("synthetic packet execution")
  })

})
