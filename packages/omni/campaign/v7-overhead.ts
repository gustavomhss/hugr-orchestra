// V7: 1000 samples per arm, sequential AB/BA pairs, 25 warmup pairs. Two persistent, separately flagged hosts.
// Only AppProcess.run is timed (including Effect execution); HTTP, checks, counters and warmup are outside samples.
// Readiness: ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v7-overhead.ts --control
// Quiet timing: ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v7-overhead.ts --quiet
import os from "node:os"
import { BUN, ROOT, cleanup, isolated, kill9, load, serve } from "./lib.ts"
import { appRuntime, authorized, effectModules, evidence, record } from "./delivery-fixtures.ts"

type Sample = { ms: number; stdout: string; spawns: number; delegations: number; mode: string; pid: number }

export async function run(options: { controlOnly?: boolean; quiet?: boolean } = {}) {
  authorized()
  const scratch = isolated("v7", {})
  const rows: { pair: number; arm: string; sample: Sample; load: string }[] = []
  const hosts: Awaited<ReturnType<typeof serve>>[] = []
  const quiet = () => process.platform === "win32" || os.loadavg()[0] <= os.availableParallelism() * 0.5
  try {
    if (!options.controlOnly && (!options.quiet || !quiet()))
      throw new Error(`V7 timing requires --quiet and load1 <= 0.5 * CPUs; current load=${load()}`)
    // Both arms use the same real git checkout and caller. Only the process-start flag differs.
    for (const flag of ["0", "1"])
      hosts.push(await serve(BUN, [import.meta.filename, "--host"], {
        ...scratch.env,
        OPENCODE_EXPERIMENTAL_OMNI_SPAWNER: flag,
        ...(flag === "1" && process.env.HUGR_OMNI_ADDON ? { HUGR_OMNI_ADDON: process.env.HUGR_OMNI_ADDON } : {}),
        ...(flag === "1" && process.env.HUGR_OMNI_SUPERVISOR ? { HUGR_OMNI_SUPERVISOR: process.env.HUGR_OMNI_SUPERVISOR } : {}),
      }, ROOT))
    const sample = async (arm: number) => {
      const response = await fetch(new URL(`/sample?cwd=${encodeURIComponent(ROOT)}`, hosts[arm].url), {
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`V7 host ${arm}: ${await response.text()}`)
      const result = await response.json() as Sample
      if (!Number.isFinite(result.ms) || result.ms <= 0 || !/^[0-9a-f]{40}\n$/.test(result.stdout))
        throw new Error(`V7 invalid real git result: ${JSON.stringify(result)}`)
      if (result.spawns !== arm || result.delegations !== 0 || result.mode !== (arm ? "on" : "off"))
        throw new Error(`V7 wrong backend: arm=${arm} ${JSON.stringify(result)}`)
      return result
    }
    const warmup = options.controlOnly ? 1 : 25
    for (let pair = 0; pair < warmup; pair++) {
      await sample(pair % 2)
      await sample(1 - pair % 2)
    }
    const count = options.controlOnly ? 3 : 1000
    for (let pair = 0; pair < count; pair++) {
      if (!options.controlOnly && !quiet()) throw new Error(`V7 machine became busy at pair ${pair}: ${load()}`)
      for (const arm of [pair % 2, 1 - pair % 2])
        rows.push({ pair, arm: arm ? "omni" : "legacy", sample: await sample(arm), load: load() })
    }
    if (new Set(rows.map((row) => row.sample.stdout)).size !== 1) throw new Error("V7 git HEAD changed during run")
    if (new Set(rows.map((row) => row.sample.pid)).size !== 2) throw new Error("V7 arms did not use separate hosts")
    const counts = Object.fromEntries(["legacy", "omni"].map((arm) => [arm, {
      completed: rows.filter((row) => row.arm === arm).length,
      spawns: rows.filter((row) => row.arm === arm).reduce((sum, row) => sum + row.sample.spawns, 0),
      delegations: rows.filter((row) => row.arm === arm).reduce((sum, row) => sum + row.sample.delegations, 0),
    }]))
    if (options.controlOnly) return record("v7-overhead", {
      pass: true, status: "instrumentation-ready", timingKpiRun: false, counts,
      evidence: evidence("v7-control", rows.map((row) => ({ ...row, sample: { ...row.sample, ms: undefined } }))),
    })
    const p50 = (arm: string) => {
      const values = rows.filter((row) => row.arm === arm).map((row) => row.sample.ms).toSorted((a, b) => a - b)
      if (values.length !== 1000) throw new Error(`V7 ${arm} has ${values.length} samples, expected 1000`)
      return (values[499] + values[500]) / 2
    }
    const base = p50("legacy")
    const omni = p50("omni")
    const limit = Math.max(base * 1.10, base + 2)
    return record("v7-overhead", { pass: omni <= limit, timingKpiRun: true, warmup, counts,
      p50Ms: { legacy: base, omni, limit }, evidence: evidence("v7-samples", rows) })
  } catch (error) {
    return record("v7-overhead", { pass: false, timingKpiRun: false, error: String(error),
      evidence: evidence("v7-failure", { rows, hosts: hosts.map((host) => host.out()) }) })
  } finally {
    for (const host of hosts) kill9(host.pid)
    await cleanup(scratch.home, [])
  }
}

async function host() {
  const { Effect, ChildProcess } = await effectModules()
  const { AppProcess } = await import("../../core/src/process.ts")
  const { Flag } = await import("../../core/src/flag/flag.ts")
  const { Omni } = await import("../../core/src/omni.ts")
  const runtime = await appRuntime()
  // Build services before reporting readiness: lazy startup is never a measured sample.
  await runtime.context()
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const cwd = new URL(request.url).searchParams.get("cwd")
    if (cwd !== ROOT) return new Response("Unexpected git cwd", { status: 400 })
    const before = Omni.snapshot()
    const command = ChildProcess.make("git", ["rev-parse", "HEAD"], { cwd })
    const effect = Effect.gen(function* () {
      const app = yield* AppProcess.Service
      return yield* app.run(command, { timeout: "10 seconds" })
    })
    const started = performance.now()
    const result = await runtime.runPromise(effect)
    const ms = performance.now() - started
    const after = Omni.snapshot()
    if (result.exitCode !== 0 || result.stderr.length || result.stdoutTruncated)
      return new Response(JSON.stringify(result), { status: 500 })
    return Response.json({ ms, stdout: result.stdout.toString(), mode: Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER,
      spawns: after.spawns - before.spawns, delegations: after.delegations - before.delegations, pid: process.pid })
  } })
  console.log(`listening on http://127.0.0.1:${server.port}`)
}

if (import.meta.main) {
  if (process.argv.includes("--host")) await host()
  else {
    const result = await run({ controlOnly: process.argv.includes("--control"), quiet: process.argv.includes("--quiet") })
    process.exit(result.pass ? 0 : 1)
  }
}
