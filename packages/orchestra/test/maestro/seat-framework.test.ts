import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { Seats } from "@/maestro/seats"
import { define } from "@/maestro/seats/seat"
import { add } from "../../script/seat"
import { seatSkillsModule } from "../../script/seat-skills"
import { tmpdir } from "../fixture/fixture"

describe("native seat framework", () => {
  test("definitions correspond to registered files, charters and skill artifacts", async () => {
    const dir = path.resolve(import.meta.dirname, "../../src/maestro/seats")
    const definitions = (await fs.readdir(dir)).filter((file) => file.endsWith(".ts") && !["index.ts", "seat.ts"].includes(file))
    expect(definitions.length).toBeGreaterThan(0)
    expect(definitions.toSorted()).toEqual(Object.values(Seats.all).map((seat) => `${seat.id}.ts`).toSorted())
    for (const seat of Object.values(Seats.all)) {
      expect(seat.prompt).toContain(`Return card: ${seat.returnCard}`)
      expect(seat.prompt).toContain("Forbidden:")
      if (seat.skills.length === 0) continue
      const root = Seats.skillSource(seat.id)
      const dirs = (await fs.readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).toSorted()
      expect(dirs).toEqual(seat.skills.toSorted())
      for (const skill of seat.skills) expect(matter(await Bun.file(path.join(root, skill, "SKILL.md")).text()).data.name).toBe(skill)
    }
    expect(Seats.all.backend.skills.toSorted()).toEqual(BackendToolkitManifest.ENTRY_SKILLS.toSorted())
    expect(await seatSkillsModule()).toContain('"backend": {')
  })

  test("unsupported ownership and malformed definitions fail before registration", () => {
    const backend = Seats.all.backend
    expect(() => define({ ...backend, id: "sample-seat" })).toThrow("Atlas Memory supports only the backend owner: sample-seat")
    expect(() => define({ ...backend, id: "sample-seat", atlasMemory: false })).toThrow("The backend toolkit supports only the backend seat: sample-seat")
    expect(() => define({ ...backend, id: "../escape" })).toThrow("Invalid native seat id")
    expect(() => define({ ...backend, skills: ["foreign-work"] })).toThrow("Entry skills must be unique and seat-scoped")
    expect(() => define({ ...backend, returnCard: "unsafe.*" })).toThrow("Work result requires a fenced return-card tag")
  })

  test("scaffold refuses collisions and invalid ids without overwriting artifacts", async () => {
    await using tmp = await tmpdir()
    const packageRoot = path.join(tmp.path, "packages/orchestra")
    await fs.mkdir(path.join(packageRoot, "src/agent/prompt"), { recursive: true })
    await fs.mkdir(path.join(packageRoot, "src/maestro/seats"), { recursive: true })
    const index = path.join(packageRoot, "src/maestro/seats/index.ts")
    const before = await Bun.file(path.resolve(import.meta.dirname, "../../src/maestro/seats/index.ts")).text()
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

  test("second seat runs from source and embedded skills; isolated backend-only mutation fails", async () => {
    await using tmp = await tmpdir()
    const packageRoot = path.resolve(import.meta.dirname, "../..")
    const originalTask = await Bun.file(path.join(packageRoot, "src/tool/task.ts")).text()
    const config = path.join(tmp.path, "bunfig.toml")
    // Explicit preload order matters: package bunfig's default test/preload.ts can import RuntimeFlags and cache the
    // registry before the synthetic source snapshot exists. Retain the normal guard, solid loader and projectors.
    await Bun.write(config, "[test]\npreload = " + JSON.stringify([
      path.resolve(packageRoot, "../../script/test-guard.ts"),
      Bun.resolveSync("@opentui/solid/preload", packageRoot),
      path.join(packageRoot, "test/maestro/fixtures/second-seat-registry.ts"),
      path.join(packageRoot, "test/preload.ts"),
    ]) + "\n")
    for (const mode of ["source", "embedded", "mutation", "restored"] as const) {
      const child = Bun.spawn([
        process.execPath, "test", `--config=${config}`, "./test/maestro/fixtures/second-seat-runtime.ts", "--timeout", "90000",
      ], {
        cwd: packageRoot, stdout: "pipe", stderr: "pipe",
        env: { ...process.env, HUGR_SAMPLE_SEAT_NAME: "Environment Seat", ORCHESTRA_SEAT_EMBEDDED: mode === "embedded" ? "1" : "0", ORCHESTRA_SEAT_MUTATION: mode === "mutation" ? "backend-only-task" : "" },
      })
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      if (mode === "mutation") {
        expect(exit, stderr).not.toBe(0)
        expect(stderr).toContain("second-seat result binding")
        expect(stderr).toMatch(/\b1 fail\b/)
        expect(await Bun.file(path.join(packageRoot, "src/tool/task.ts")).text()).toBe(originalTask)
        console.log(JSON.stringify({ seatMutation: { binding: "native definition lookup -> backend-only lookup", exit, oracle: "second-seat result binding", failed: true, originalTaskBytesMatch: true } }))
        continue
      }
      if (exit !== 0) throw new Error(`second seat ${mode} failed (${exit}):\n${stdout}\n${stderr}`)
      expect(stdout, stderr).toContain(`"mode":"${mode === "restored" ? "source" : mode}"`)
      expect(stdout).toContain('"parsed":true,"resumedReadOnly":true')
      expect(stderr).toMatch(/\b1 pass\b/)
      expect(stderr).not.toMatch(/\b[1-9]\d* skip\b/)
      expect(await Bun.file(path.join(packageRoot, "src/tool/task.ts")).text()).toBe(originalTask)
      console.log(JSON.stringify({ secondSeatCheck: { mode, exit, oracle: "second-seat result binding" } }))
    }
  }, 360000)
})
