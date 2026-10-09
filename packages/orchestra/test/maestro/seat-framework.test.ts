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
    expect(() => define({ ...backend, profileKey: "review" })).toThrow("Invalid native seat profile key")
    expect(() => define({ ...backend, profileKey: "../escape" })).toThrow("Invalid native seat profile key")
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

  test("second seat runs from source and a genuine Bun bundle; both isolated mutations fail", async () => {
    await using tmp = await tmpdir()
    const packageRoot = path.resolve(import.meta.dirname, "../..")
    const originals = await Promise.all(["src/tool/task.ts", "src/maestro/seats/index.ts", "src/maestro/seat-skill-root.ts"].map(async (file) => ({ file, bytes: await Bun.file(path.join(packageRoot, file)).text() })))
    // Keep artifacts under the package so Bun resolves both isolated (Linux) and hoisted (Windows) dependencies.
    // Source snapshots remain separate and parent-owned; no authored source or installed module is overwritten.
    await using artifacts = {
      path: await fs.mkdtemp(path.join(packageRoot, ".second-seat-proof-")),
      async [Symbol.asyncDispose]() { await fs.rm(this.path, { recursive: true, force: true }) },
    }
    const sourceConfig = path.join(tmp.path, "source.toml")
    const buildConfig = path.join(tmp.path, "build.toml")
    const compiledConfig = path.join(tmp.path, "compiled.toml")
    // Explicit preload order matters: package bunfig's default test/preload.ts can import RuntimeFlags and cache the
    // registry before the synthetic source snapshot exists. Retain the normal guard, solid loader and projectors.
    const bootstrap = [
      path.resolve(packageRoot, "../../script/test-guard.ts"),
      Bun.resolveSync("@opentui/solid/preload", packageRoot),
    ]
    await Bun.write(sourceConfig, "[test]\npreload = " + JSON.stringify([...bootstrap, path.join(packageRoot, "test/maestro/fixtures/second-seat-registry.ts"), path.join(packageRoot, "test/preload.ts")]) + "\n")
    await Bun.write(buildConfig, "[test]\npreload = " + JSON.stringify([...bootstrap, path.join(packageRoot, "test/maestro/fixtures/second-seat-registry.ts")]) + "\n")
    await Bun.write(compiledConfig, "[test]\npreload = " + JSON.stringify(bootstrap) + "\n")
    for (const mode of ["source", "compiled", "omit-embedded-map", "backend-only-task", "restored-source", "restored-compiled"] as const) {
      const snapshot = path.join(tmp.path, mode, "snapshot")
      const outdir = path.join(artifacts.path, mode, "bundle")
      const compiled = ["compiled", "omit-embedded-map", "restored-compiled"].includes(mode)
      const env: NodeJS.ProcessEnv = { ...process.env, HUGR_SAMPLE_SEAT_NAME: "Environment Seat", ORCHESTRA_SEAT_SNAPSHOT: snapshot, ORCHESTRA_SEAT_BUNDLE_DIR: outdir, ORCHESTRA_SEAT_COMPILED: compiled ? "1" : "0", ORCHESTRA_SEAT_MUTATION: mode }
      try {
        if (compiled) {
          const build = await runProofChild(packageRoot, buildConfig, "./test/maestro/fixtures/second-seat-bundle.ts", env)
          if (build.exit !== 0) throw new Error(`second seat ${mode} build failed (${build.exit}):\n${build.stdout}\n${build.stderr}`)
          expect(build.stderr).toMatch(/\b1 pass\b/)
          expect(build.stderr).not.toMatch(/\b[1-9]\d* skip\b/)
          expect(build.stdout).toContain('"sourceTreeRemoved":true')
          const proof = await Bun.file(path.join(outdir, "proof.json")).json()
          env.ORCHESTRA_SEAT_SKILL_BYTES = proof.skillBytes
        }
        const result = await runProofChild(packageRoot, compiled ? compiledConfig : sourceConfig,
          compiled ? path.join(outdir, "second-seat.test.js") : "./test/maestro/fixtures/second-seat-runtime.ts", env)
        const diagnostics = `${result.stdout}\n${result.stderr}`
        expect(result.stderr, diagnostics).not.toMatch(/\b[1-9]\d* skip\b/)
        if (mode === "backend-only-task" || mode === "omit-embedded-map") {
          const oracle = mode === "backend-only-task" ? "second-seat result binding" : "Cannot import compiled seat skill module"
          expect(result.exit, diagnostics).not.toBe(0)
          expect(diagnostics).toContain(oracle)
          expect(result.stderr, diagnostics).toMatch(/\b1 fail\b/)
          console.log(JSON.stringify({ seatMutation: { mutation: mode, exit: result.exit, oracle, failed: true } }))
        }
        if (mode !== "backend-only-task" && mode !== "omit-embedded-map") {
          if (result.exit !== 0) throw new Error(`second seat ${mode} failed (${result.exit}):\n${diagnostics}`)
          expect(result.stdout).toContain(`"mode":"${compiled ? "compiled" : "source"}"`)
          expect(result.stdout).toContain('"parsed":true,"resumedReadOnly":true,"realPermission":true,"delegateDenied":true,"foreignSkillDenied":true,"inRootEditDenied":true,"exactSkillBytes":true')
          expect(result.stderr).toMatch(/\b1 pass\b/)
          console.log(JSON.stringify({ secondSeatCheck: { mode, exit: result.exit, oracle: "second-seat result binding" } }))
        }
        for (const original of originals) expect(await Bun.file(path.join(packageRoot, original.file)).text(), original.file).toBe(original.bytes)
      } finally {
        await fs.rm(path.join(tmp.path, mode), { recursive: true, force: true })
        await fs.rm(path.join(artifacts.path, mode), { recursive: true, force: true })
      }
    }
  }, 1200000)
})

async function runProofChild(cwd: string, config: string, fixture: string, env: NodeJS.ProcessEnv) {
  const child = Bun.spawn([process.execPath, "test", `--config=${config}`, fixture, "--timeout", "90000"], { cwd, stdout: "pipe", stderr: "pipe", env })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  const state = { timedOut: false }
  const deadline = setTimeout(() => {
    state.timedOut = true
    child.kill("SIGKILL")
  }, 120000)
  try {
    const exit = await child.exited
    const output = { exit, stdout: await stdout, stderr: await stderr }
    if (state.timedOut) throw new Error(`Second-seat child deadline exceeded (${fixture}):\n${output.stdout}\n${output.stderr}`)
    return output
  } finally {
    clearTimeout(deadline)
    if (child.exitCode === null) child.kill("SIGKILL")
    await child.exited
    await Promise.all([stdout, stderr])
  }
}
