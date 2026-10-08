import { expect, test } from "bun:test"
import { Omni } from "@orchestra/core/omni"
import { appRuntime, effectModules } from "../../omni/campaign/delivery-fixtures.ts"
import { prepare } from "../../omni/campaign/matrix-build.ts"

test("V3/V4/V5/V6 real OS functional matrix and targeted red mutations", async () => {
  expect(process.env.CI).toBeTruthy()
  expect(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER).toBe("strict")
  // Parent counter measured before launching any campaign child; real AppProcess flow, no copied implementation.
  const { Effect, ChildProcess } = await effectModules()
  const { AppProcess } = await import("@orchestra/core/process")
  const runtime = await appRuntime()
  const before = Omni.snapshot()
  try {
    const git = await runtime.runPromise(Effect.gen(function* () {
      const app = yield* AppProcess.Service
      return yield* app.run(ChildProcess.make("git", ["--version"]), { timeout: "10 seconds" })
    }))
    expect(git.exitCode).toBe(0)
    expect(git.stdout.toString()).toContain("git version")
    expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
    console.log("MATRIX_PARENT_NATIVE_CONTROL " + JSON.stringify({ before, after: Omni.snapshot(), stdout: git.stdout.toString() }))
  } finally { await runtime.dispose() }
  const provenance = await prepare()
  const v3 = await import("../../omni/campaign/v3-supervisor.ts")
  const v4 = await import("../../omni/campaign/v4-lsp.ts")
  const v5 = await import("../../omni/campaign/v5-mcp.ts")
  const v6 = await import("../../omni/campaign/v6-terminal.ts")
  const failure = (error: unknown) => ({ pass: false, error: String(error) })
  const owner = await v3.run({ mutation: "wrong-owner" }).catch(failure)
  const marker = await v5.run({ mutation: "missing-marker" }).catch(failure)
  const replay = await v6.run({ mutation: "missing-replay" }).catch(failure)
  console.log("MATRIX_MUTATIONS_RED " + JSON.stringify({ os: process.platform, owner, marker, replay }))
  // Restored actual cells execute after mutations. No retries; retain every failed observation.
  const results = { v3: await v3.run().catch(failure), v4: await v4.run().catch(failure),
    v5: await v5.run().catch(failure), v6: await v6.run().catch(failure) }
  console.log("FUNCTIONAL_MATRIX " + JSON.stringify({ sourceSHA: provenance.sourceSHA, os: process.platform,
    arch: process.arch, at: new Date().toISOString(), results: Object.fromEntries(Object.entries(results).map(([cell, result]) => [cell, {
      pass: result.pass, error: "error" in result ? result.error : undefined,
      errors: "errors" in result ? result.errors : undefined, checks: "checks" in result ? result.checks : undefined,
    }])) }))
  expect(owner.pass).toBe(false)
  expect("error" in owner && owner.error).toContain("wrong-owner positive control rejected")
  expect(marker.pass).toBe(false)
  expect("error" in marker && marker.error).toContain("last stderr line in Orchestra debug log")
  expect(replay.pass).toBe(false)
  expect("errors" in replay && replay.errors.some((error) => error.includes("reconnection replay differs"))).toBe(true)
  expect("handshakes" in results.v4 && results.v4.handshakes).toHaveLength(22)
  Object.values(results).forEach((result) => expect(result.pass).toBe(true))
}, 900_000)
