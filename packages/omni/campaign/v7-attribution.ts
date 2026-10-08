// Diagnostic companion to V7; timings never replace the real AppProcess acceptance gate.
import os from "node:os"
import path from "node:path"
import { inspect } from "node:util"
import { BUN, ROOT, cleanup, isolated, kill9, load, until } from "./lib.ts"
import { appRuntime, authorized, deliveryEnv, effectModules, evidence, startServer } from "./delivery-fixtures.ts"

type Sample = { ms: number; stdout: string; spawns: number; delegations: number; pid: number; stages?: Record<string, number> }

export async function settle() {
  await until(600_000, "V7 quiet host (unchanged load1 <= 0.5 * CPUs)", () =>
    os.loadavg()[0] <= os.availableParallelism() * 0.5 ? true : undefined)
}

export async function run(trace = false) {
  authorized()
  await settle()
  const scratch = isolated("v7-attribution", {})
  const rows: { pair: number; arm: string; sample: Sample; load: string }[] = []
  const traceFile = path.join(scratch.home, "native.strace")
  const host = await startServer(trace ? "strace" : BUN,
    trace ? ["-f", "-ttt", "-T", "-o", traceFile, BUN, import.meta.filename, "--host"] : [import.meta.filename, "--host"],
    { ...deliveryEnv(scratch.env), ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1",
      HUGR_OMNI_ADDON: process.env.HUGR_OMNI_ADDON ?? "",
      HUGR_OMNI_SUPERVISOR: process.env.HUGR_OMNI_SUPERVISOR ?? "" }, ROOT)
  try {
    const sample = async (arm: string): Promise<Sample> => {
      const response = await fetch(new URL(`/${arm}`, host.url), { signal: AbortSignal.timeout(20_000) })
      if (!response.ok) throw new Error(await response.text())
      const result = await response.json() as Sample
      if (!Number.isFinite(result.ms) || result.ms <= 0 || !/^[0-9a-f]{40}\n$/.test(result.stdout))
        throw new Error(`Invalid attribution sample: ${JSON.stringify(result)}`)
      if (result.spawns !== (arm === "app" ? 1 : 0) || result.delegations !== 0)
        throw new Error(`Wrong attribution backend: ${JSON.stringify(result)}`)
      return result
    }
    const arms = trace ? ["staged"] : ["app", "bare", "staged"]
    for (let pair = 0; pair < (trace ? 0 : 25); pair++)
      for (const arm of pair % 2 ? arms.toReversed() : arms) await sample(arm)
    for (let pair = 0; pair < (trace ? 1 : 1000); pair++) {
      if (os.loadavg()[0] > os.availableParallelism() * 0.5) throw new Error(`Busy attribution host: ${load()}`)
      for (const arm of pair % 2 ? arms.toReversed() : arms)
        rows.push({ pair, arm, sample: await sample(arm), load: load() })
    }
    const p50 = (values: number[]) => {
      const sorted = values.toSorted((a, b) => a - b)
      if (sorted.length !== (trace ? 1 : 1000)) throw new Error(`Incomplete attribution: ${sorted.length}`)
      return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
    }
    const summary = Object.fromEntries(arms.map((arm) => {
      const samples = rows.filter((row) => row.arm === arm).map((row) => row.sample)
      return [arm, { count: samples.length, p50Ms: p50(samples.map((sample) => sample.ms)),
        stages: Object.fromEntries(Object.keys(samples[0].stages ?? {}).map((key) =>
          [key, p50(samples.map((sample) => sample.stages?.[key] ?? NaN))])) }]
    }))
    if (trace) {
      const lines = (await Bun.file(traceFile).text()).split("\n")
      const start = lines.find((line) => line.includes('execve("') && line.includes("hugr-omni-supervisor"))
      if (!start) throw new Error("strace did not observe the real native supervisor")
      const pid = start.trim().split(/\s+/)[0]
      const native = lines.filter((line) => line.trim().split(/\s+/)[0] === pid)
      console.log("V7_NATIVE_TRACE " + JSON.stringify({ pid, lines: native, evidence: evidence("v7-native-trace", native) }))
    }
    console.log("V7_ATTRIBUTION " + JSON.stringify({ trace, summary, evidence: evidence("v7-attribution", rows) }))
    return summary
  } finally {
    if (trace && rows[0]) kill9(rows[0].sample.pid)
    kill9(host.pid)
    await cleanup(scratch.home, [])
  }
}

async function host() {
  const { Effect, ChildProcess } = await effectModules()
  const { AppProcess } = await import("../../core/src/process.ts")
  const { Omni } = await import("../../core/src/omni.ts")
  const { OmniSpawner } = await import("../../core/src/omni-spawner.ts")
  const runtime = await appRuntime()
  await runtime.context()
  const omni = await Omni.load()
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    error: (error) => new Response(inspect(error, { depth: 10 }), { status: 500 }),
    async fetch(request) {
      const arm = new URL(request.url).pathname.slice(1)
      const before = Omni.snapshot()
      const command = ChildProcess.make("git", ["rev-parse", "HEAD"], { cwd: ROOT })
      const options = { cwd: ROOT, env: OmniSpawner.environment(command.options), inheritEnv: false, text: false,
        maxOutputBytes: Number.MAX_SAFE_INTEGER, timeoutMs: 10_000, signal: new AbortController().signal }
      const effect = Effect.gen(function* () {
        const app = yield* AppProcess.Service
        return yield* app.run(command, { timeout: "10 seconds" })
      })
      const stages: Record<string, number> = {}
      const started = performance.now()
      const result = arm === "app" ? await runtime.runPromise(effect)
        : arm === "bare" ? await omni.run("git", ["rev-parse", "HEAD"], options)
        : await (async () => {
          const child = omni.spawn("git", ["rev-parse", "HEAD"], { ...options, stdin: "closed", backpressure: true })
          stages.spawn = performance.now() - started
          const chunks: Uint8Array[] = []
          const output = (async () => {
            for await (const item of child.output) {
              if (item.stream !== "stdout" || item.lostBefore || typeof item.data === "string") throw new Error("Unexpected staged output")
              chunks.push(item.data)
            }
            stages.eof = performance.now() - started
          })()
          try {
            const exit = await child.wait()
            stages.exit = performance.now() - started
            await output
            const stopping = performance.now()
            await child.stop()
            stages.stop = performance.now() - stopping
            return { ...exit, stdout: Buffer.concat(chunks), stderr: Buffer.alloc(0) }
          } finally {
            await child.stop()
          }
        })()
      const ms = performance.now() - started
      const after = Omni.snapshot()
      if (result.exitCode !== 0 || result.stderr.length) throw new Error(`Attribution command failed: ${inspect(result)}`)
      return Response.json({ ms, stdout: Buffer.from(result.stdout).toString(), stages,
        spawns: after.spawns - before.spawns, delegations: after.delegations - before.delegations, pid: process.pid })
    },
  })
  console.log(`listening on http://127.0.0.1:${server.port}`)
}

if (import.meta.main) {
  if (process.argv.includes("--host")) await host()
  else await run(process.argv.includes("--trace"))
}
