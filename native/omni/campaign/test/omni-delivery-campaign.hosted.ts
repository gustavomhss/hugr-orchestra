// Dedicated hosted proof: excluded from ordinary Bun suffix discovery, selected by its exact path.
import { expect, test } from "bun:test"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { existsSync } from "node:fs"
import path from "node:path"
import { CLI_APP, ROOT, cli } from "../lib.ts"
import { run } from "../v8-windows.ts"
import { appRuntime, effectModules } from "../delivery-fixtures.ts"

// Explicit Windows-only request. A wrong runner is red, never an unexecuted Windows green.
test("V8 Windows actual delivery campaign and V9 shipped-artifact rejection", async () => {
  expectSpawn(import.meta.path)
  expect(process.platform).toBe("win32")
  expect(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER).toBe("1")
  expect(existsSync(process.env.HUGR_OMNI_ADDON ?? "")).toBe(true)
  expect(existsSync(process.env.HUGR_OMNI_SUPERVISOR ?? "")).toBe(true)
  const { Effect, ChildProcess } = await effectModules()
  const { AppProcess } = await import("@orchestra/core/process")
  const runtime = await appRuntime()
  try {
    const result = await runtime.runPromise(Effect.gen(function* () {
      const app = yield* AppProcess.Service
      return yield* app.run(ChildProcess.make("git", ["--version"]), { timeout: "10 seconds" })
    }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain("git version")
  } finally {
    await runtime.dispose()
  }
  if (!existsSync(path.join(CLI_APP, "dist"))) {
    const build = Bun.spawn([process.execPath, "script/build.ts", "--single", "--skip-install"], {
      cwd: CLI_APP, stdout: "inherit", stderr: "inherit", timeout: 180_000,
      env: { ...process.env, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0" },
    })
    expect(await build.exited).toBe(0)
  }
  expect(existsSync(cli())).toBe(true)
  const v8 = await run()
  console.log("WINDOWS_V8_PROOF " + JSON.stringify(v8))
  // Run V9 in a separate process so its compiled fallback mutation remains isolated from this test's runtime.
  const v9 = Bun.spawn([process.execPath, path.join(ROOT, "native/omni/campaign/v9-broken-artifacts.ts"), "--quiet", "--mutation", "--diagnose"], {
    cwd: ROOT, stdout: "pipe", stderr: "pipe", timeout: 120_000,
  })
  const [stdout, stderr, code] = await Promise.all([new Response(v9.stdout).text(), new Response(v9.stderr).text(), v9.exited])
  console.log("WINDOWS_V9_PROOF " + stdout + stderr)
  expect(v8.pass).toBe(true)
  expect(code).toBe(0)
  const line = stdout.split("\n").find((line) => line.startsWith("CAMPAIGN_VERDICT "))
  expect(line).toBeDefined()
  expect(JSON.parse(line!.slice("CAMPAIGN_VERDICT ".length)).pass).toBe(true)
}, 480_000)
