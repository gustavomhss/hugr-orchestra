import { readlink, realpath } from "node:fs/promises"
import { basename, resolve, join } from "node:path"
import { Cause, Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"

type Box = { cwd: string; env: Record<string, string | undefined> }

export async function corroborateProcess(pid: number, executable: string, box: Box) {
  process.kill(pid, 0)
  const expected = await realpath(executable)
  if (process.platform === "linux") {
    if (await realpath(await readlink(`/proc/${pid}/exe`)) !== expected)
      throw new Error("NATIVE_DAEMON_EXECUTABLE_MISMATCH")
    return
  }
  const result = await command(["/usr/sbin/lsof", "-a", "-p", String(pid), "-d", "txt", "-Fn"], box, 15_000)
  if (result.code !== 0 || !result.stdout.split("\n").includes(`p${pid}`) ||
    !result.stdout.split("\n").includes(`n${expected}`))
    throw new Error("NATIVE_DAEMON_EXECUTABLE_UNCORROBORATED")
}

// HOST harness ownership, not evidence that the installed CLI uses its supervisor.
// Caps select AppProcess's streamed/scoped path, including tree stop and pipe drain.
export async function command(args: string[], box: Box, timeout = 90_000) {
  if (!args[0]) throw new Error("NATIVE_COMMAND_EMPTY")
  const result = await Effect.runPromise(Effect.gen(function* () {
    const service = yield* AppProcess.Service
    return yield* service.run(ChildProcess.make(args[0], args.slice(1), {
      cwd: box.cwd, env: box.env, extendEnv: false,
      stdin: "ignore", stdout: "pipe", stderr: "pipe", forceKillAfter: "2 seconds",
    }), { timeout, maxOutputBytes: 16 * 1024 * 1024, maxErrorBytes: 256 * 1024 })
  }).pipe(
    Effect.provide(LayerNode.compile(AppProcess.node)),
    Effect.timeoutOrElse({ duration: timeout + 10_000,
      orElse: () => Effect.fail(new Error("NATIVE_COMMAND_SCOPE_TIMEOUT")),
    }),
    Effect.scoped,
    // Do not expose daemon stdout/password or a native error containing its output.
    Effect.catchCause((cause) => Effect.fail(new Error(`NATIVE_COMMAND_PROCESS_OR_TIMEOUT_FAILURE: ${args[0]}${basename(args[0]) === "brew" ? ` ${args.slice(1).join(" ")}\n${Cause.pretty(cause)}` : ""}`))),
  ))
  if (result.stdoutTruncated || result.stderrTruncated)
    throw new Error(`NATIVE_COMMAND_OUTPUT_TRUNCATED: ${args[0]}`)
  return { code: result.exitCode, stdout: result.stdout.toString("utf8"), stderr: result.stderr.toString("utf8") }
}

// Fresh process for EVERY case: Core and native binding singletons cannot hide a
// replaced supervisor. Canonical Core imports, exact installed companions, no
// HUGR_* overrides or companion fallback. This is an independent companion oracle,
// not a claim about the public CLI's child-spawn path.
export async function installedCompanionProbe(payload: string, box: Box) {
  const core = await realpath(resolve(import.meta.dirname, "../../../core"))
  const effect = await realpath(join(core, "node_modules/effect/dist/index.js"))
  const childProcess = await realpath(join(core, "node_modules/effect/dist/unstable/process/index.js"))
  const omni = await realpath(join(core, "src/omni.ts"))
  const appProcess = await realpath(join(core, "src/process.ts"))
  const layerNode = await realpath(join(core, "src/effect/layer-node.ts"))
  // Canonicalize parent, not the mutated supervisor (missing is a negative case).
  const bin = await realpath(join(payload, "bin"))
  const paths = { addon: join(bin, "hugr_omni.node"), supervisor: join(bin, "hugr-omni-supervisor") }
  const script = `
import { Effect } from ${JSON.stringify(effect)}
import { ChildProcess } from ${JSON.stringify(childProcess)}
import { Omni } from ${JSON.stringify(omni)}
import { AppProcess } from ${JSON.stringify(appProcess)}
import { LayerNode } from ${JSON.stringify(layerNode)}
const paths = ${JSON.stringify(paths)}
try {
  Omni.configure(paths)
  const found = Omni.locate()
  if (found.addon !== paths.addon || found.supervisor !== paths.supervisor)
    throw new Error("INSTALLED_COMPANION_PATH_MISMATCH")
  const before = Omni.snapshot()
  const result = await Effect.runPromise(Effect.gen(function* () {
    const service = yield* AppProcess.Service
    return yield* service.run(ChildProcess.make(process.execPath,
      ["--eval", "process.stdout.write('installed-companion-child\\\\n'); process.exitCode = 7"], {
        cwd: process.cwd(), env: {}, extendEnv: false,
        stdin: "ignore", stdout: "pipe", stderr: "pipe", forceKillAfter: "2 seconds",
      }), { timeout: "10 seconds", maxOutputBytes: 4096, maxErrorBytes: 4096 })
  }).pipe(Effect.provide(LayerNode.compile(AppProcess.node)), Effect.timeout("20 seconds"), Effect.scoped))
  const after = Omni.snapshot()
  const counters = { spawns: after.spawns - before.spawns, delegations: after.delegations - before.delegations }
  if (result.exitCode !== 7 || result.stdout.toString("utf8") !== "installed-companion-child\\n" ||
      result.stderr.length !== 0 || result.stdoutTruncated || result.stderrTruncated)
    throw new Error("INSTALLED_COMPANION_CHILD_RESULT_INVALID")
  if (counters.spawns <= 0 || counters.delegations !== 0)
    throw new Error("INSTALLED_COMPANION_SPAWN_CONTROL_FAILED")
  console.log(JSON.stringify({ oracle: "installed-companion", paths, counters, exitCode: result.exitCode,
    stdout: result.stdout.toString("utf8") }))
} catch (error) {
  console.error("INSTALLED_COMPANION_PROBE_FAILED: supervisor=" + paths.supervisor + ": " + String(error))
  process.exitCode = 1
}
`
  return command([process.execPath, "--eval", script], {
    cwd: box.cwd, env: { ...box.env, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict" },
  }, 30_000)
}
