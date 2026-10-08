import { expect, test } from "bun:test"
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { ORCHESTRA, cli } from "../../omni/campaign/lib.ts"
import { appRuntime, effectModules } from "../../omni/campaign/delivery-fixtures.ts"
import { Omni } from "@orchestra/core/omni"
import { run } from "../../omni/campaign/v1-background.ts"

test("Windows compiled CLI V1 adoption, V2 serve/TUI crash, V10 console quit and oracle mutations", async () => {
  expect(process.platform).toBe("win32")
  expect(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER).toBe("1")
  process.env.OMNI_CAMPAIGN_BUILD_SHA = process.env.GITHUB_SHA
  expect(existsSync(process.env.HUGR_OMNI_ADDON ?? "")).toBe(true)
  expect(existsSync(process.env.HUGR_OMNI_SUPERVISOR ?? "")).toBe(true)
  const { Effect, ChildProcess } = await effectModules()
  const { AppProcess } = await import("@orchestra/core/process")
  const runtime = await appRuntime()
  const before = Omni.snapshot()
  try {
    const result = await runtime.runPromise(Effect.gen(function* () {
      const app = yield* AppProcess.Service
      return yield* app.run(ChildProcess.make("git", ["--version"]), { timeout: "10 seconds" })
    }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain("git version")
    expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
  } finally {
    await runtime.dispose()
  }
  const artifacts = path.join(ORCHESTRA, "dist-lifecycle-artifacts")
  mkdirSync(path.join(artifacts, "win32-x64-msvc"), { recursive: true })
  copyFileSync(process.env.HUGR_OMNI_ADDON!, path.join(artifacts, "win32-x64-msvc", "hugr_omni.node"))
  copyFileSync(process.env.HUGR_OMNI_SUPERVISOR!, path.join(artifacts, "win32-x64-msvc", "hugr-omni-supervisor.exe"))
  const build = Bun.spawn([process.execPath, "script/build.ts", "--single", "--skip-install", "--skip-embed-web-ui"], {
    cwd: ORCHESTRA, stdout: "inherit", stderr: "inherit", timeout: 240_000,
    env: { ...process.env, OMNI_ARTIFACTS: artifacts, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0" },
  })
  expect(await build.exited).toBe(0)
  expect(existsSync(cli())).toBe(true)
  const v2 = await import("../../omni/campaign/v2-kill.ts")
  const failure = (error: unknown) => ({ pass: false, error: String(error), phase: "unhandled campaign/cleanup failure" })
  const results = { v1: await run().catch(failure), v2Serve: await v2.run("serve").catch(failure), v2Tui: await v2.run("tui").catch(failure), v10Tui: await v2.run("tui", "quit").catch(failure), v10Serve: await v2.run("serve", "quit").catch(failure) }
  console.log("WINDOWS_LIFECYCLE_PROOF " + JSON.stringify(results))
  const mutants = []
  for (const mutation of ["omit-adoption", "skip-inner-owner", "forced-kill-graceful"]) {
    process.env.OMNI_CAMPAIGN_MUTATION = mutation
    try {
      const result = mutation === "omit-adoption" ? await run() : await v2.run("tui", mutation === "forced-kill-graceful" ? "quit" : "kill")
      mutants.push({ mutation, result })
      expect(result.pass).toBe(false)
      if (mutation === "omit-adoption") {
        expect("error" in result && result.error).toContain("exact tree adopted after tool completion")
      }
      if (mutation === "skip-inner-owner") {
        expect("controls" in result && result.controls?.pty2.fixtureIds).toHaveLength(3)
        expect("controls" in result && result.controls?.pty2.pass).toBe(false)
        expect("controls" in result && result.controls?.pty2.protectedMembers.every((member) => member.supervisors.length === 0)).toBe(true)
      }
      if (mutation === "forced-kill-graceful") {
        expect("input" in result && result.input).toBe("TerminateProcess")
        expect("shutdown" in result && result.shutdown?.pass).toBe(false)
        expect("observed" in result && result.observed?.last.counts.every((count) => count === 0)).toBe(true)
      }
    } finally {
      delete process.env.OMNI_CAMPAIGN_MUTATION
    }
  }
  console.log("WINDOWS_LIFECYCLE_MUTATIONS " + JSON.stringify(mutants))
  Object.values(results).forEach((result) => expect(result.pass).toBe(true))
}, 900_000)
