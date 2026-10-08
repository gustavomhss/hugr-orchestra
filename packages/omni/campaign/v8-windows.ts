// V8 must execute on Windows; importing/run() on macOS reports unrun, never Windows green.
// CI wrapper in orchestra/test: import { run } from '../../omni/campaign/v8-windows.ts'; expect((await run()).pass).toBe(true)
// Run alongside util/process.test.ts: the preload's process-local control cannot see this harness's child counters.
// The wrapper builds the actual CLI once on Windows using CI's restored release native artifacts.
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { OmniProc } from "../../core/src/pty/omni.ts"
import { BUN, ROOT, cleanup, cli, fileTree, isolated, kill9, remaining, supervised, until, win } from "./lib.ts"
import { appRuntime, authorized, deliveryEnv, effectModules, evidence, execute, record, startServer } from "./delivery-fixtures.ts"

type Cell = { name: string; pass: boolean; [key: string]: unknown }
const METACHARS = ["space", "quote", "ampersand", "pipe", "parentheses", "caret", "percent"] as const
const HOST_NAMES = ["cmd.exe", ".cmd-tool", "npx-positive", ...METACHARS.map((name) => `npx-metachar/${name}`), "powershell-shell", "ConPTY-close"]

export async function run() {
  authorized()
  if (!win) return record("v8-windows", { pass: false, status: "unrun", reason: "Requires real Windows cmd.exe, PowerShell, npx.cmd and ConPTY" })
  const scratch = isolated("v8", {})
  const tree = fileTree(scratch.home, 2)
  const descriptor = path.join(scratch.home, "conpty-fixture.json")
  writeFileSync(descriptor, JSON.stringify(tree))
  try {
    const env = { ...deliveryEnv(scratch.env), ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1",
      ...(process.env.HUGR_OMNI_ADDON ? { HUGR_OMNI_ADDON: process.env.HUGR_OMNI_ADDON } : {}),
      ...(process.env.HUGR_OMNI_SUPERVISOR ? { HUGR_OMNI_SUPERVISOR: process.env.HUGR_OMNI_SUPERVISOR } : {}),
    }
    // Keep the nonce out of harness argv: the independent process-table oracle must see only the actual tree.
    const observed = await execute(BUN, [import.meta.filename, "--host", scratch.home, scratch.project, descriptor], env, ROOT, 180_000, [scratch.home, tree.nonce])
    const line = observed.stdout.split("\n").find((line) => line.startsWith("V8_HOST_RESULT "))
    const cells = line ? JSON.parse(line.slice("V8_HOST_RESULT ".length)) as Cell[] : []
    cells.push(await powershellBash(scratch, env))
    const names = [...HOST_NAMES, "powershell-bash"].toSorted()
    return record("v8-windows", { pass: !observed.timedOut && observed.code === 0 && JSON.stringify(cells.map((cell) => cell.name).toSorted()) === JSON.stringify(names) && cells.every((cell) => cell.pass),
      status: "executed-windows", cells, observed, evidence: evidence("v8-windows", { home: scratch.home, observed, cells }) })
  } catch (error) {
    return record("v8-windows", { pass: false, error: String(error), evidence: evidence("v8-failure", String(error)) })
  } finally {
    await cleanup(scratch.home, [tree.nonce])
  }
}

/** User bash route, using the real server's configured PowerShell and spawner; no model/provider request. */
async function powershellBash(scratch: ReturnType<typeof isolated>, env: Record<string, string>) {
  const tree = fileTree(scratch.home, 1)
  const hosts: Awaited<ReturnType<typeof startServer>>[] = []
  try {
    const server = await startServer(cli(), ["serve", "--port", "0", "--hostname", "127.0.0.1"], {
      ...env, ORCHESTRA_CONFIG_CONTENT: JSON.stringify({ shell: "powershell.exe", formatter: false, lsp: false, plugin: [],
        permission: { "*": "allow" }, share: "disabled" }),
    }, scratch.project)
    hosts.push(server)
    const post = async (route: string, body: unknown) => {
      const response = await fetch(new URL(route, server.url), { method: "POST", signal: AbortSignal.timeout(15_000),
        headers: { "content-type": "application/json", "x-orchestra-directory": encodeURIComponent(scratch.project) },
        body: JSON.stringify(body) })
      if (!response.ok) throw new Error(`PowerShell bash ${route}: ${response.status} ${await response.text()}`)
      return response.json()
    }
    const session = await post("/session", {}) as { id: string }
    const pending = fetch(new URL(`/session/${session.id}/shell`, server.url), {
      method: "POST", signal: AbortSignal.timeout(45_000),
      headers: { "content-type": "application/json", "x-orchestra-directory": encodeURIComponent(scratch.project) },
      body: JSON.stringify({ agent: "maestro", model: { providerID: "test", modelID: "test-model" }, command: `& ${tree.line}` }),
    }).then(async (response) => ({ status: response.status, text: await response.text() }),
      (error: unknown) => ({ status: 0, text: String(error) }))
    await until(25_000, "PowerShell bash nonce tree", async () => (await remaining(tree.nonce)) === tree.size ? true : undefined)
    const control = supervised(tree.nonce)
    await post(`/session/${session.id}/abort`, {})
    const result = await pending
    const left = await remaining(tree.nonce)
    return { name: "powershell-bash", ...result, supervised: control, left,
      pass: control && result.status === 200 && result.text.includes(tree.ready) && left === 0 }
  } catch (error) {
    return { name: "powershell-bash", pass: false, error: String(error), server: hosts.map((host) => host.out()) }
  } finally {
    try {
      for (const host of hosts) kill9(host.identity)
    } finally {
      await cleanup(scratch.home, [tree.nonce])
    }
  }
}

async function host(home: string, project: string, tree: ReturnType<typeof fileTree>) {
  if (!win) throw new Error("V8 host requires Windows")
  const { Effect, ChildProcess } = await effectModules()
  const { AppProcess } = await import("../../core/src/process.ts")
  const { Omni } = await import("../../core/src/omni.ts")
  const { PtyOmni } = await import("../../core/src/pty/omni.ts")
  const runtime = await appRuntime()
  const cells: Cell[] = []
  const terminal = { proc: undefined as OmniProc | undefined }
  try {
    await runtime.context()
    const command = async (file: string, args: string[], options: { shell?: string } = {}) => {
      const before = Omni.snapshot()
      const result = await runtime.runPromise(Effect.gen(function* () {
        const app = yield* AppProcess.Service
        return yield* app.run(ChildProcess.make(file, args, { cwd: project, ...options }), { timeout: "20 seconds" })
      }))
      const after = Omni.snapshot()
      return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: result.exitCode,
        spawns: after.spawns - before.spawns, delegations: after.delegations - before.delegations }
    }
    const cmd = await command("cmd.exe", ["/d", "/s", "/c", "echo V8_CMD_OK"])
    cells.push({ name: "cmd.exe", ...cmd, pass: cmd.exitCode === 0 && cmd.stdout.trim() === "V8_CMD_OK" && cmd.spawns === 1 && cmd.delegations === 0 })

    const argv = path.join(home, "argv.cjs")
    writeFileSync(argv, 'console.log("V8_ARGV " + JSON.stringify(process.argv.slice(2)))\n')
    const batch = path.join(home, "real-tool.cmd")
    writeFileSync(batch, `@echo off\r\n"${BUN}" "${argv}" %*\r\n`)
    const benign = await command(batch, ["plain", "with space"])
    cells.push({ name: ".cmd-tool", ...benign, pass: benign.exitCode === 0 && benign.stdout.trim() === 'V8_ARGV ["plain","with space"]' && benign.spawns === 1 && benign.delegations === 0 })

    // Local npm package, installed by real npm.cmd in offline mode; real npx.cmd resolves the generated shim.
    const pkg = path.join(home, "argv-package")
    mkdirSync(pkg)
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "v8-argv", version: "1.0.0", bin: { "v8-argv": "argv.cjs" } }))
    writeFileSync(path.join(pkg, "argv.cjs"), '#!/usr/bin/env node\nconsole.log("V8_ARGV " + JSON.stringify(process.argv.slice(2)))\n')
    const install = await command("npm.cmd", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", pkg])
    if (install.exitCode !== 0 || install.spawns !== 1 || install.delegations !== 0)
      throw new Error(`V8 offline npm fixture setup failed: ${JSON.stringify(install)}`)
    const npx = await command("npx.cmd", ["--offline", "--no-install", "v8-argv", "plain"])
    cells.push({ name: "npx-positive", ...npx, pass: npx.exitCode === 0 && npx.stdout.trim() === 'V8_ARGV ["plain"]' && npx.spawns === 1 && npx.delegations === 0 })
    process.env.V8_SECRET = "EXPANSION_IS_A_FAILURE"
    for (const name of METACHARS) {
      const sentinel = path.join(project, `V8_INJECTED_${name}`)
      const payload = { space: "with space", quote: 'a"b', ampersand: `x&echo PWNED>${sentinel}`, pipe: `x|echo PWNED>${sentinel}`,
        parentheses: "(a)", caret: "a^b", percent: "%V8_SECRET%" }[name]
      const before = Omni.snapshot()
      const observed = await command("npx.cmd", ["--offline", "--no-install", "v8-argv", payload]).then(
        (result) => ({ result, refusal: undefined }),
        (error: unknown) => ({ error: String(error), refusal: typedRefusal(error) }),
      )
      const after = Omni.snapshot()
      const spawns = after.spawns - before.spawns
      const delegations = after.delegations - before.delegations
      const exact = "result" in observed && observed.result.exitCode === 0 && observed.result.stdout.trim() === `V8_ARGV ${JSON.stringify([payload])}`
      cells.push({ name: `npx-metachar/${name}`, payload, ...observed, spawns, delegations, injected: existsSync(sentinel),
        pass: !existsSync(sentinel) && spawns === 1 && delegations === 0 && (exact || observed.refusal?.code === "INVALID_ARGUMENT") })
    }

    const ps = await command("Write-Output", ["'V8_PS_OK'"], { shell: "powershell.exe" })
    cells.push({ name: "powershell-shell", ...ps, pass: ps.exitCode === 0 && ps.stdout.trim() === "V8_PS_OK" && ps.spawns === 1 && ps.delegations === 0 })

    const binding = await Omni.load()
    const before = Omni.snapshot()
    const native = binding.spawn("cmd.exe", ["/d", "/q"], { pty: { cols: 120, rows: 30 }, cwd: project, inheritEnv: false, env: Omni.childEnv() })
    const output = { text: "", ended: false, exited: false, stopped: false, error: "", eofMs: 0, exitMs: 0, stopMs: 0, started: 0 }
    const eof = Promise.withResolvers<void>()
    const exited = Promise.withResolvers<void>()
    const observedOutput = { async *[Symbol.asyncIterator]() {
      try {
        for await (const chunk of native.output) yield chunk
        output.ended = true
        output.eofMs = performance.now() - output.started
        eof.resolve()
      } catch (error) {
        output.error = String(error)
        eof.resolve()
        throw error
      }
    } }
    // Observe the native consumer's real EOF while exercising Orchestra's actual adapter; no second consumer.
    const proc = PtyOmni.adapt(new Proxy(native, { get(target, key) {
      if (key === "output") return observedOutput
      if (key === "stop") return async (options?: { graceMs?: number }) => {
        const result = await target.stop(options).catch((error: unknown) => { output.error = String(error); throw error })
        output.stopped = true
        output.stopMs = performance.now() - output.started
        return result
      }
      const value = Reflect.get(target, key, target)
      return typeof value === "function" ? value.bind(target) : value
    } }))
    terminal.proc = proc
    proc.onData((data) => (output.text += data))
    proc.onExit(() => { output.exited = true; output.exitMs = performance.now() - output.started; exited.resolve() })
    proc.write(tree.line + "\r")
    await until(20_000, "ConPTY nonce tree alive", async () => (await remaining(tree.nonce)) === tree.size ? true : undefined)
    const control = supervised(tree.nonce)
    const started = performance.now()
    output.started = started
    const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined }
    try {
      await Promise.race([Promise.all([proc.stop(), eof.promise, exited.promise]), new Promise<never>((_, reject) => {
        timer.id = setTimeout(() => reject(new Error("ConPTY stop + EOF + onExit watchdog expired after 6000 ms")), 6000)
      })])
    } finally {
      clearTimeout(timer.id)
    }
    const ms = performance.now() - started
    const left = await remaining(tree.nonce)
    const reachable = await proc.child.processes()
    const after = Omni.snapshot()
    cells.push({ name: "ConPTY-close", ms, left, reachable, supervised: control, output,
      boundary: "native EOF observation through PtyOmni.adapt", spawns: after.spawns - before.spawns, nativePid: native.pid,
      pass: control && ms <= 6000 && output.ended && output.exited && output.stopped && !output.error &&
        output.eofMs <= 6000 && output.exitMs <= 6000 && output.stopMs <= 6000 && left === 0 && reachable.length === 0 && after.delegations === before.delegations })
  } catch (error) {
    cells.push({ name: "host-error", pass: false, error: String(error) })
  } finally {
    try {
      await terminal.proc?.stop(0)
    } finally {
      try {
        await runtime.dispose()
      } finally {
        await cleanup(home, [tree.nonce])
      }
    }
  }
  console.log(`V8_HOST_RESULT ${JSON.stringify(cells)}`)
  process.exit(JSON.stringify(cells.map((cell) => cell.name).toSorted()) === JSON.stringify(HOST_NAMES.toSorted()) && cells.every((cell) => cell.pass) ? 0 : 1)
}

function typedRefusal(error: unknown): { code: "INVALID_ARGUMENT"; message: string } | undefined {
  const seen = new Set<unknown>()
  const visit = (value: unknown): { code: "INVALID_ARGUMENT"; message: string } | undefined => {
    if (!value || typeof value !== "object" || seen.has(value)) return
    seen.add(value)
    if ("name" in value && value.name === "OmniError" && "code" in value && value.code === "INVALID_ARGUMENT" && "message" in value && typeof value.message === "string")
      return { code: "INVALID_ARGUMENT", message: value.message }
    return ("cause" in value ? visit(value.cause) : undefined) ?? ("reason" in value ? visit(value.reason) : undefined)
  }
  return visit(error)
}

if (import.meta.main) {
  if (process.argv.includes("--host")) await host(process.argv[3], process.argv[4], await Bun.file(process.argv[5]).json() as ReturnType<typeof fileTree>)
  else {
    const result = await run()
    process.exit(result.pass ? 0 : 1)
  }
}
