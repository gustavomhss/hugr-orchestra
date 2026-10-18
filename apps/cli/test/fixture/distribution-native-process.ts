import { readlink, realpath } from "node:fs/promises"
import { basename, dirname, resolve, join } from "node:path"
import { Cause, Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { OmniAdoption } from "@orchestra/core/omni-adoption"

type Box = { cwd: string; env: Record<string, string | undefined> }

export async function corroborateProcess(pid: number, executable: string, box: Box) {
  if (process.platform === "win32") {
    const { windowsIdentity } = await import("./distribution-windows-process")
    const identity = await windowsIdentity(pid)
    const expected = await realpath(executable)
    const diagnostic = { pid, expectedExecutable: expected, observed: identity ?? null }
    console.error(`NATIVE_DAEMON_IDENTITY ${JSON.stringify(diagnostic)}`)
    if (!identity) throw new Error(`NATIVE_DAEMON_PID_ABSENT: ${JSON.stringify(diagnostic)}`)
    if (identity.executable.toLowerCase() !== expected.toLowerCase())
      throw new Error(`NATIVE_DAEMON_EXECUTABLE_MISMATCH: ${JSON.stringify(diagnostic)}`)
    return identity
  }
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
export async function command(args: string[], box: Box, timeout = 90_000, owner?: OmniAdoption.Interface) {
  if (!args[0]) throw new Error("NATIVE_COMMAND_EMPTY")
  if (owner && (process.platform !== "win32" || args.length !== 3 || args[1] !== "service" || args[2] !== "start"))
    throw new Error("NATIVE_COMMAND_ADOPTION_REQUIRES_WINDOWS_SERVICE_START")
  const invocation = await commandInvocation(args)
  const started = performance.now()
  // Start/stop get metadata only; password and eval get no diagnostics. Raw cause
  // remains restricted to nonsecret version/symbols/status commands.
  const safeCause = (args.length === 2 && args[1] === "--version") ||
    (args.length === 4 && args[1] === "debug" && args[2] === "symbols") ||
    (args.length === 3 && args[1] === "service" && args[2] === "status")
  const diagnostic = process.platform === "win32" && (
    safeCause || (args.length === 3 && args[1] === "service" && ["start", "stop"].includes(args[2]))
  ) ? { stage: args.slice(1), launcher: args[0], program: invocation.args[0],
    arguments: invocation.args.slice(1), shell: invocation.shell, cwd: box.cwd, timeoutMs: timeout,
    ownership: owner ? "daemon-lease" : "command-scope" } : undefined
  if (diagnostic) console.error(`NATIVE_COMMAND_START ${JSON.stringify(diagnostic)}`)
  const result = await Effect.runPromise(Effect.gen(function* () {
    const service = yield* AppProcess.Service
    return yield* service.run(ChildProcess.make(invocation.args[0], invocation.args.slice(1), {
      cwd: box.cwd, env: box.env, extendEnv: false,
      shell: invocation.shell,
      stdin: "ignore", stdout: "pipe", stderr: "pipe", forceKillAfter: "2 seconds",
    }), { timeout, maxOutputBytes: 16 * 1024 * 1024, maxErrorBytes: 256 * 1024 })
  }).pipe(
    // Windows detached children stay in omni's non-breakaway Job. The explicit
    // daemon lease adopts that exact tree when start's command scope succeeds.
    (effect) => owner ? effect.pipe(
      Effect.provideService(OmniAdoption.Service, { sessionID: box.cwd, policy: "tool" }),
      Effect.provideService(OmniAdoption.Registry, owner),
    ) : effect,
    Effect.provide(LayerNode.compile(AppProcess.node)),
    Effect.timeoutOrElse({ duration: timeout + 10_000,
      orElse: () => Effect.fail(new Error("NATIVE_COMMAND_SCOPE_TIMEOUT")),
    }),
    Effect.scoped,
    // Do not expose daemon stdout/password or a native error containing its output.
    Effect.catchCause((cause) => Effect.fail(new Error(`NATIVE_COMMAND_PROCESS_OR_TIMEOUT_FAILURE: ${args[0]}${diagnostic
      ? `\n${JSON.stringify({ ...diagnostic, elapsedMs: Math.round(performance.now() - started) })}${safeCause ? `\n${Cause.pretty(cause)}` : ""}`
      : basename(args[0]) === "brew" ? ` ${args.slice(1).join(" ")}\n${Cause.pretty(cause)}` : ""}`))),
  ))
  if (diagnostic) console.error(`NATIVE_COMMAND_EXIT ${JSON.stringify({ ...diagnostic,
    elapsedMs: Math.round(performance.now() - started), code: result.exitCode,
    stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length })}`)
  if (result.stdoutTruncated || result.stderrTruncated)
    throw new Error(`NATIVE_COMMAND_OUTPUT_TRUNCATED: ${args[0]}`)
  return { code: result.exitCode, stdout: result.stdout.toString("utf8"), stderr: result.stderr.toString("utf8") }
}

// npm uses its real Node CLI. Pass public CMD shims and argv unquoted: omni's
// native Windows batch route supplies system cmd.exe and Rust std batch quoting
// (/e:ON /v:OFF /d /c), with the CMD/Node/PE tree inside its owned job. shell:true
// selects a different verbatim /s /c path and bypasses this batch argv encoder.
async function commandInvocation(args: string[]) {
  if (!args[0]) throw new Error("NATIVE_COMMAND_EMPTY")
  if (process.platform !== "win32") return { args: [args[0], ...args.slice(1)] as const, shell: false }
  if (args[0] === "npm" || /\.cjs$/i.test(args[0])) {
    const { WindowsProcessQuery } = await import("../../../../packages/core/test/fixture/windows-process-query")
    const node = WindowsProcessQuery.nodeExecutable()
    const script = args[0] === "npm" ? await realpath(join(dirname(node), "node_modules/npm/bin/npm-cli.js")) : args[0]
    return { args: [node, script, ...args.slice(1)] as const, shell: false }
  }
  return { args: [args[0], ...args.slice(1)] as const, shell: false }
}

// Fresh process for EVERY case: Core and native binding singletons cannot hide a
// replaced supervisor. Canonical Core imports, exact installed companions, no
// HUGR_* overrides or companion fallback. This is an independent companion oracle,
// not a claim about the public CLI's child-spawn path.
export async function installedCompanionProbe(payload: string, box: Box) {
  const core = await realpath(resolve(import.meta.dirname, "../../../../packages/core"))
  const effect = await realpath(Bun.resolveSync("effect", core))
  const childProcess = await realpath(Bun.resolveSync("effect/unstable/process", core))
  const omni = await realpath(join(core, "src/omni.ts"))
  const appProcess = await realpath(join(core, "src/process.ts"))
  const layerNode = await realpath(join(core, "src/effect/layer-node.ts"))
  // Canonicalize parent, not the mutated supervisor (missing is a negative case).
  const bin = await realpath(join(payload, "bin"))
  const paths = { addon: join(bin, "hugr_omni.node"), supervisor: join(bin, `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`) }
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
        cwd: process.cwd(), env: ${JSON.stringify(process.platform === "win32" ? Object.fromEntries(Object.entries(box.env)
          .filter(([key]) => ["SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TMP", "TEMP"].includes(key.toUpperCase()))) : {})}, extendEnv: false,
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
