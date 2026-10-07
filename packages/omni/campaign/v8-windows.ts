// V8 must execute on Windows; importing/run() on macOS reports unrun, never Windows green.
// CI wrapper: import { run } from '../../../omni/campaign/v8-windows.ts'; expect((await run()).pass).toBe(true)
// The wrapper belongs in opencode/test and is deliberately outside this work package's write-set.
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { OmniProc } from "../../core/src/pty/omni.ts"
import { BUN, ROOT, cleanup, fileTree, isolated, remaining, supervised, until, win } from "./lib.ts"
import { appRuntime, authorized, effectModules, evidence, execute, record } from "./delivery-fixtures.ts"

type Cell = { name: string; pass: boolean; [key: string]: unknown }

export async function run() {
  authorized()
  if (!win) return record("v8-windows", { pass: false, status: "unrun", reason: "Requires real Windows cmd.exe, PowerShell, npx.cmd and ConPTY" })
  const scratch = isolated("v8", {})
  try {
    const env = { ...scratch.env, OPENCODE_EXPERIMENTAL_OMNI_SPAWNER: "1",
      ...(process.env.HUGR_OMNI_ADDON ? { HUGR_OMNI_ADDON: process.env.HUGR_OMNI_ADDON } : {}),
      ...(process.env.HUGR_OMNI_SUPERVISOR ? { HUGR_OMNI_SUPERVISOR: process.env.HUGR_OMNI_SUPERVISOR } : {}),
    }
    const observed = await execute(BUN, [import.meta.filename, "--host", scratch.home, scratch.project], env, ROOT, 120_000)
    const line = observed.stdout.split("\n").find((line) => line.startsWith("V8_HOST_RESULT "))
    const cells = line ? JSON.parse(line.slice("V8_HOST_RESULT ".length)) as Cell[] : []
    return record("v8-windows", { pass: !observed.timedOut && observed.code === 0 && cells.length === 6 && cells.every((cell) => cell.pass),
      status: "executed-windows", cells, evidence: evidence("v8-windows", { home: scratch.home, observed, cells }) })
  } catch (error) {
    return record("v8-windows", { pass: false, error: String(error), evidence: evidence("v8-failure", String(error)) })
  } finally {
    await cleanup(scratch.home, [])
  }
}

async function host(home: string, project: string) {
  if (!win) throw new Error("V8 host requires Windows")
  const { Effect, ChildProcess } = await effectModules()
  const { AppProcess } = await import("../../core/src/process.ts")
  const { Omni } = await import("../../core/src/omni.ts")
  const { PtyOmni } = await import("../../core/src/pty/omni.ts")
  const runtime = await appRuntime()
  const cells: Cell[] = []
  const tree = fileTree(home, 2)
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
    const sentinel = path.join(project, "V8_INJECTED")
    const payload = ["with space", 'a"b', `x&echo PWNED>${sentinel}`, "a|b", "(a)", "a^b", "%V8_SECRET%"]
    process.env.V8_SECRET = "EXPANSION_IS_A_FAILURE"
    const metachar = await command("npx.cmd", ["--offline", "--no-install", "v8-argv", ...payload]).then(
      (result) => ({ ...result, clearRefusal: result.exitCode !== 0 && /invalid.argument|unsupported|not supported|refus/i.test(result.stderr) }),
      (error: unknown) => ({ error: String(error), clearRefusal: /invalid.argument|unsupported|not supported|refus/i.test(String(error)) }),
    )
    const exact = "stdout" in metachar && metachar.exitCode === 0 && metachar.stdout.trim() === `V8_ARGV ${JSON.stringify(payload)}` && metachar.spawns === 1 && metachar.delegations === 0
    cells.push({ name: "npx-metachar", payload, ...metachar, injected: existsSync(sentinel),
      pass: !existsSync(sentinel) && (exact || metachar.clearRefusal) })

    const ps = await command("Write-Output", ["'V8_PS_OK'"], { shell: "powershell.exe" })
    cells.push({ name: "powershell-shell", ...ps, pass: ps.exitCode === 0 && ps.stdout.trim() === "V8_PS_OK" && ps.spawns === 1 && ps.delegations === 0 })

    const backend = await PtyOmni.load()
    const before = Omni.snapshot()
    const proc = backend.spawn("cmd.exe", ["/d", "/q"], { name: "xterm-256color", cwd: project, env: Omni.childEnv(), cols: 120, rows: 30 })
    terminal.proc = proc
    const output = { text: "", exited: false }
    proc.onData((data) => (output.text += data))
    proc.onExit(() => (output.exited = true))
    proc.write(tree.line + "\r")
    await until(20_000, "ConPTY nonce tree alive", async () => (await remaining(tree.nonce)) === tree.size ? true : undefined)
    const control = supervised(tree.nonce)
    const started = performance.now()
    const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined }
    try {
      await Promise.race([proc.stop(), new Promise<never>((_, reject) => {
        timer.id = setTimeout(() => reject(new Error("ConPTY close watchdog expired after 6500 ms")), 6500)
      })])
    } finally {
      clearTimeout(timer.id)
    }
    const ms = performance.now() - started
    const left = await remaining(tree.nonce)
    const reachable = await proc.child.processes()
    const after = Omni.snapshot()
    cells.push({ name: "ConPTY-close", ms, left, reachable, supervised: control, output: output.text,
      pass: control && ms <= 6000 && left === 0 && reachable.length === 0 && after.spawns - before.spawns === 1 && after.delegations === before.delegations })
  } catch (error) {
    cells.push({ name: "host-error", pass: false, error: String(error) })
  } finally {
    await terminal.proc?.stop(0)
    await runtime.dispose()
    await cleanup(home, [tree.nonce])
  }
  console.log(`V8_HOST_RESULT ${JSON.stringify(cells)}`)
  process.exit(cells.length === 6 && cells.every((cell) => cell.pass) ? 0 : 1)
}

if (import.meta.main) {
  if (process.argv.includes("--host")) await host(process.argv[3], process.argv[4])
  else {
    const result = await run()
    process.exit(result.pass ? 0 : 1)
  }
}
