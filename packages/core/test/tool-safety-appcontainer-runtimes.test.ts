import { expect } from "bun:test"
import path from "node:path"
import { createServer } from "node:net"
import { rm, writeFile } from "node:fs/promises"
import which from "which"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyAppContainer } from "../src/tool-safety-appcontainer"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const windows = process.platform === "win32" ? it.live : it.live.skip

// Each runtime by the name the shell resolves from PATH, as a command in a developer's shell would.
const RUNTIMES = {
  bun: ["-e", "console.log('bun-ok')"],
  node: ["-e", "console.log('node-ok')"],
  python: ["-c", "print('python-ok')"],
  go: ["version"],
  git: ["--version"],
}

const ps = (text: string) => `'${text.replaceAll("'", "''")}'`

windows("developer runtimes run in a confined pwsh, which still writes only its roots, reads no secrets and has no network", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "acr-" }).pipe(Effect.flatMap(fs.realPath))
    const pwsh = which.sync("pwsh")
    const bun = which.sync("bun")
    // A secret beside the user's own files in a test home (ORCHESTRA_TEST_HOME), never the real home: home is never a
    // toolchain folder, so nothing grants it.
    const home = yield* fs.makeTempDirectoryScoped({ prefix: "acr-home-" }).pipe(Effect.flatMap(fs.realPath))
    const secret = path.join(home, "secret.txt")
    yield* Effect.acquireRelease(Effect.sync(() => {
      const previous = process.env.ORCHESTRA_TEST_HOME
      process.env.ORCHESTRA_TEST_HOME = home
      return previous
    }), (previous) => Effect.sync(() => {
      if (previous === undefined) delete process.env.ORCHESTRA_TEST_HOME
      if (previous !== undefined) process.env.ORCHESTRA_TEST_HOME = previous
    }))
    yield* Effect.promise(() => writeFile(secret, "secret"))
    const counts = { connections: 0 }
    const server = createServer((socket) => { counts.connections++; socket.destroy() })
    const port = yield* Effect.acquireRelease(
      Effect.promise(() => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        resolve(address && typeof address !== "string" ? address.port : 0)
      }))),
      () => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
    )
    const outside = path.join(path.dirname(bun), `orchestra-acr-${process.pid}.txt`)
    const script = [
      ...Object.entries(RUNTIMES).map(([name, args]) =>
        `$t = [Diagnostics.Stopwatch]::StartNew(); $out = & ${name} ${args.map(ps).join(" ")} 2>&1 | Out-String; [ordered]@{ name = '${name}'; code = $LASTEXITCODE; out = "$out".Trim(); ms = $t.ElapsedMilliseconds } | ConvertTo-Json -Compress`),
      // A toolchain folder is readable, never writable.
      `try { Set-Content -LiteralPath ${ps(outside)} -Value no -ErrorAction Stop; $w = 'ok' } catch { $w = 'denied' }; [ordered]@{ name = 'toolchain-write'; out = $w } | ConvertTo-Json -Compress`,
      `$out = & bun -e ${ps(`try { require('fs').readFileSync(${JSON.stringify(secret)}, 'utf8'); console.log('read') } catch (e) { console.log(e.code) }`)} 2>&1 | Out-String; [ordered]@{ name = 'secret'; out = "$out".Trim() } | ConvertTo-Json -Compress`,
      `$out = & node -e ${ps(`const s = require('net').connect(${port}, '127.0.0.1'); s.on('connect', () => { console.log('connected'); process.exit() }); s.on('error', (e) => { console.log(e.code); process.exit() }); setTimeout(() => { console.log('timeout'); process.exit() }, 3000)`)} 2>&1 | Out-String; [ordered]@{ name = 'network'; out = "$out".Trim() } | ConvertTo-Json -Compress`,
      `try { [IO.File]::Open('NUL', 'Open', 'ReadWrite').Close(); $n = 'ok' } catch { $n = 'denied' }; [ordered]@{ name = 'nul'; out = $n } | ConvertTo-Json -Compress`,
      "$global:LASTEXITCODE = 0",
    ].join("\n")
    const profile = { requireSandbox: true, writeRoots: [workspace], sandbox: { enabled: true, scratch: true } } satisfies ToolSafety.Profile
    const run = (command: ChildProcess.StandardCommand) => Effect.scoped(Effect.gen(function* () {
      const wrapped = yield* ToolSafetySandbox.wrap(command).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, profile),
        Effect.provideService(ToolSafety.NativeContext, { directory: workspace }),
      )
      const started = Date.now()
      const result = yield* processes.run(wrapped, { timeout: "300 seconds" })
      console.log(`confined run: ${Date.now() - started} ms`)
      return { wrapped, result }
    }))
    // The first confined command on a host starts the toolchain grants beside it without waiting for them.
    const first = yield* run(ChildProcess.make(pwsh, ["-NoProfile", "-NonInteractive", "-Command", "'first'"], { cwd: workspace, stdin: "ignore" }))
    expect(first.result.stdout.toString().trim()).toBe("first")
    yield* ToolSafetyAppContainer.settled
    const confined = yield* run(ChildProcess.make(pwsh, ["-NoProfile", "-NonInteractive", "-Command", script], { cwd: workspace, stdin: "ignore" }))
    expect(confined.wrapped._tag === "StandardCommand" && confined.wrapped.args[0]).toBe("--appcontainer")
    expect(confined.result.exitCode, confined.result.stderr.toString()).toBe(0)
    const cells = Object.fromEntries(confined.result.stdout.toString().trim().split(/\r?\n/).map((line) => JSON.parse(line) as { name: string; code?: number; out: string })
      .map((cell) => [cell.name, cell]))
    expect(cells.bun).toMatchObject({ code: 0, out: "bun-ok" })
    expect(cells.node).toMatchObject({ code: 0, out: "node-ok" })
    expect(cells.python).toMatchObject({ code: 0, out: "python-ok" })
    expect(cells.go).toMatchObject({ code: 0, out: expect.stringMatching(/^go version go\S+ windows\//) })
    // An AppContainer may not open the null device (\Device\Null grants no AppContainer SID, and no capability
    // reaches it), and git opens /dev/null as it starts: git fails inside the jail, never runs outside it.
    expect(cells.nul.out).toBe("denied")
    expect(cells.git).toMatchObject({ code: 128, out: expect.stringContaining("could not open '/dev/null'") })
    expect(cells["toolchain-write"].out).toBe("denied")
    expect(cells.secret.out).toMatch(/^(?:EPERM|EACCES)$/)
    expect(cells.network.out).toMatch(/^(?:EACCES|ECONNREFUSED|ENETUNREACH|ETIMEDOUT|timeout)$/)
    expect(counts.connections).toBe(0)
    expect(yield* fs.exists(outside)).toBe(false)

    // Positive control: the same probes unconfined write the toolchain folder, read the secret and connect.
    const control = yield* processes.run(ChildProcess.make(pwsh, ["-NoProfile", "-NonInteractive", "-Command", script], { cwd: workspace, stdin: "ignore" }),
      { timeout: "300 seconds" })
    yield* Effect.promise(() => rm(outside, { force: true }))
    const controls = Object.fromEntries(control.stdout.toString().trim().split(/\r?\n/).map((line) => JSON.parse(line) as { name: string; out: string })
      .map((cell) => [cell.name, cell.out]))
    expect(controls).toMatchObject({ "toolchain-write": "ok", secret: "read", network: "connected", nul: "ok", git: expect.stringMatching(/^git version /) })
    expect(counts.connections).toBe(1)
  }), 900_000,
)
