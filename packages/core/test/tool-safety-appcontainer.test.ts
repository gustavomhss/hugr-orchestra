import { describe, expect } from "bun:test"
import path from "node:path"
import { createServer } from "node:net"
import { cp, readFile, writeFile, mkdir } from "node:fs/promises"
import which from "which"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyAppContainer } from "../src/tool-safety-appcontainer"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const windows = process.platform === "win32" ? it.live : it.live.skip

describe("quote", () => {
  it.live("round-trips the arguments the launcher's command line carries", () => Effect.sync(() => {
    expect(ToolSafetyAppContainer.quote("plain")).toBe("plain")
    expect(ToolSafetyAppContainer.quote("")).toBe('""')
    expect(ToolSafetyAppContainer.quote("a b")).toBe('"a b"')
    expect(ToolSafetyAppContainer.quote('say "hi"')).toBe('"say \\"hi\\""')
    expect(ToolSafetyAppContainer.quote("C:\\dir with space\\")).toBe('"C:\\dir with space\\\\"')
  }))
})

const fixture = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "acw-" }).pipe(Effect.flatMap(fs.realPath))
  const outside = yield* fs.makeTempDirectoryScoped({ prefix: "acs-" }).pipe(Effect.flatMap(fs.realPath))
  const pwsh = which.sync("pwsh", { nothrow: true })
  if (!pwsh) throw new Error("BLOCKED: pwsh unavailable")
  const counts: Record<number, number> = {}
  const listen = Effect.acquireRelease(
    Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve) => {
      const server = createServer((socket) => {
        const port = server.address()
        if (port && typeof port !== "string") counts[port.port] = (counts[port.port] ?? 0) + 1
        socket.on("error", () => socket.destroy())
        socket.pipe(socket)
      })
      server.listen(0, "127.0.0.1", () => resolve(server))
    })),
    (server) => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
  ).pipe(Effect.map((server) => {
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("TCP fixture failed to bind")
    return address.port
  }))
  const wrap = (command: ChildProcess.StandardCommand, profile?: ToolSafety.Profile) =>
    ToolSafetySandbox.wrap(command).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: workspace }),
    )
  const ps = (script: string, env?: Record<string, string>) =>
    ChildProcess.make(pwsh, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { cwd: workspace, env, stdin: "ignore" })
  return { fs, processes, workspace, outside, pwsh, counts, listen, wrap, ps }
})

// Every probe reports its own outcome; the unconfined run of the same script is the positive control.
const probe = (input: { workspace: string; outside: string; port: number }) => `
$r = [ordered]@{}
try { Set-Content -LiteralPath '${path.join(input.workspace, "out", "ok.txt")}' -Value ok -ErrorAction Stop; $r.writeRoot = 'ok' } catch { $r.writeRoot = 'denied' }
try { Set-Content -LiteralPath out/relative.txt -Value ok -ErrorAction Stop; $r.writeRelative = (cmd /c cd).Trim() } catch { $r.writeRelative = 'denied' }
try { Set-Content -LiteralPath '${path.join(input.workspace, "nope.txt")}' -Value no -ErrorAction Stop; $r.writeOutside = 'ok' } catch { $r.writeOutside = 'denied' }
try { $r.readWorkspace = (Get-Content -LiteralPath '${path.join(input.workspace, "readme.txt")}' -Raw -ErrorAction Stop).Trim() } catch { $r.readWorkspace = 'denied' }
try { $r.readOutside = (Get-Content -LiteralPath '${path.join(input.outside, "secret.txt")}' -Raw -ErrorAction Stop).Trim() } catch { $r.readOutside = 'denied' }
try { $c = [Net.Sockets.TcpClient]::new(); $r.tcp = if ($c.ConnectAsync('127.0.0.1', ${input.port}).Wait(3000)) { 'connected' } else { 'timeout' } } catch { $r.tcp = 'refused' }
try { [Net.Dns]::GetHostAddresses('example.com') | Out-Null; $r.dns = 'resolved' } catch { $r.dns = 'failed' }
$r | ConvertTo-Json -Compress
`

const output = (result: { stdout: Buffer; stderr: Buffer; exitCode: number }) => {
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  return JSON.parse(result.stdout.toString().trim())
}

windows("a pwsh command runs confined: write roots only, no reads outside grants, no network", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const port = yield* f.listen
    yield* Effect.promise(async () => {
      await mkdir(path.join(f.workspace, "out"))
      await writeFile(path.join(f.workspace, "readme.txt"), "visible")
      await writeFile(path.join(f.workspace, "out", "keep.txt"), "kept")
      await writeFile(path.join(f.outside, "secret.txt"), "secret")
    })
    const profile = { requireSandbox: true, writeRoots: [path.join(f.workspace, "out")] } satisfies ToolSafety.Profile
    const script = probe({ workspace: f.workspace, outside: f.outside, port })
    const command = yield* f.wrap(f.ps(script), profile)
    if (command._tag !== "StandardCommand") throw new Error("expected one command")
    expect(command.args[0]).toBe("--appcontainer")
    expect<string | undefined>(command.command).toBe(yield* ToolSafetyAppContainer.Launcher)
    expect(output(yield* f.processes.run(command, { timeout: "60 seconds" }))).toEqual({
      writeRoot: "ok", writeRelative: expect.not.stringMatching(/^(?:[A-Za-z]:\\|denied)$/), writeOutside: "denied", readWorkspace: "visible",
      readOutside: "denied", tcp: expect.stringMatching(/^(?:timeout|refused)$/), dns: "failed",
    })
    expect(f.counts[port] ?? 0).toBe(0)
    expect(yield* f.fs.exists(path.join(f.workspace, "nope.txt"))).toBe(false)
    // Relative paths and native children start in the command's directory, not at the drive root.
    expect(yield* f.fs.exists(path.join(f.workspace, "out", "relative.txt"))).toBe(true)

    // A deny ACE for the profile's SID does not hold inside an inherited grant, so a protected path there is a policy
    // the jail cannot express: refused, or unconfined and reported when the profile allows the fallback.
    const protectedProfile = { ...profile, protectedWrites: [path.join(f.workspace, "out", "keep.txt")] }
    expect((yield* Effect.flip(f.wrap(f.ps(script), protectedProfile))).reason).toBe("sandbox-appcontainer-deny-inside-grant-unenforceable")
    const report: { fact?: ToolSafety.ShellFact } = {}
    const fallback = yield* f.wrap(f.ps(script), { ...protectedProfile, sandbox: { enabled: true, unconfinedFallback: true } }).pipe(
      Effect.provideService(ToolSafety.ShellReport, report))
    expect(fallback._tag === "StandardCommand" && fallback.command).toBe(f.pwsh)
    expect(report.fact).toEqual({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: "sandbox-appcontainer-deny-inside-grant-unenforceable" } })

    // Idempotent: the same grant set reuses its profile and adds no second ACE. Reversible: --revoke removes them.
    const aces = Effect.promise(async () => {
      const child = Bun.spawn([f.pwsh, "-NoProfile", "-Command",
        `@('${f.workspace}', '${path.join(f.workspace, "out")}') | % { @((Get-Acl -LiteralPath $_).GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]) | ? { $_.IdentityReference.Value -like 'S-1-15-2-*' }).Count }`])
      return (await new Response(child.stdout).text()).trim().split(/\s+/).map(Number)
    })
    expect(yield* aces).toEqual([1, 1])
    output(yield* f.processes.run(yield* f.wrap(f.ps(script), profile), { timeout: "60 seconds" }))
    expect(yield* aces).toEqual([1, 1])
    const grants = command.args.slice(0, command.args.indexOf("--app"))
    const revoked = yield* f.processes.run(ChildProcess.make(command.command, [...grants, "--revoke"]), { timeout: "60 seconds" })
    expect(revoked.exitCode, revoked.stderr.toString()).toBe(0)
    expect(yield* aces).toEqual([0, 0])

    // Positive control: the same script unconfined reaches everything the jail denied.
    const control = output(yield* f.processes.run(f.ps(script), { timeout: "60 seconds" }))
    expect(control).toMatchObject({ writeOutside: "ok", readOutside: "secret", tcp: "connected" })
    expect(f.counts[port]).toBe(1)
  }), 180_000,
)

windows("killing the command kills its confined process tree", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const marker = path.join(f.workspace, "pid.txt")
    const script = `$p = [Diagnostics.Process]::Start((Join-Path $PSHOME 'pwsh.exe'), '-NoProfile -Command Start-Sleep 600'); Set-Content -LiteralPath '${marker}' $p.Id; Start-Sleep 600`
    const command = yield* f.wrap(f.ps(script), { requireSandbox: true })
    const handle = yield* f.processes.spawn(command)
    const seen = { text: "" }
    yield* handle.all.pipe(Stream.decodeText(), Stream.runForEach((chunk) => Effect.sync(() => { seen.text += chunk })), Effect.ignore, Effect.forkScoped)
    const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
    const pid = yield* Effect.promise(async () => {
      for (const _ of Array.from({ length: 300 })) {
        const text = await readFile(marker, "utf8").catch(() => "")
        if (text.trim()) return Number(text.trim())
        await Bun.sleep(100)
      }
      throw new Error(`the confined root never started its descendant: ${seen.text}`)
    })
    expect(alive(pid)).toBe(true)
    yield* handle.kill({ forceKillAfter: "2 seconds" })
    const gone = yield* Effect.promise(async () => {
      for (const _ of Array.from({ length: 100 })) {
        if (!alive(pid)) return true
        await Bun.sleep(100)
      }
      return false
    })
    expect(gone).toBe(true)
  }), 120_000,
)

windows("an exact endpoint grant reaches only its upstream, through the broker, from the real Go dialer", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const [granted, other] = [yield* f.listen, yield* f.listen]
    const root = yield* f.fs.makeTempDirectoryScoped({ prefix: "act-" }).pipe(Effect.flatMap(f.fs.realPath))
    const host = BackendToolkitTarget.detect()
    if (!("target" in host)) throw new Error(`unsupported host: ${host.unsupported}`)
    const owned = yield* BackendToolkit.ensure("gocqlx-schemagen").pipe(Effect.provideService(BackendToolkit.Root, root))
    const source = path.join(path.dirname(owned.executable), "src")
    const go = path.join(root, "runtimes", "go", `${BackendToolkitManifest.RUNTIMES.go.version}-${host.target}`,
      BackendToolkitManifest.RUNTIMES.go.targets[host.target].executable)
    yield* Effect.promise(() => cp(path.join(import.meta.dirname, "fixtures/cassandra-dialer_test.go"), path.join(source, "cmd/schemagen/orchestra_dialer_test.go")))
    const binary = path.join(f.workspace, "dialer.test.exe")
    const built = Bun.spawnSync([go, "test", "-c", "-o", binary, "./cmd/schemagen"], {
      cwd: source,
      env: { ...process.env, GOFLAGS: "-mod=readonly", GOTOOLCHAIN: "local", GOWORK: "off", GOPATH: path.join(root, "cache/go"), GOCACHE: path.join(root, "cache/go-build") },
    })
    expect(built.exitCode, built.stderr.toString()).toBe(0)
    const profile = {
      requireSandbox: true, writeRoots: [f.workspace],
      sandbox: { enabled: true, allowedLoopbackEndpoints: [{ directory: f.workspace, host: "127.0.0.1" as const, port: granted }] },
    } satisfies ToolSafety.Profile
    // Through pwsh, as the shell tool runs a toolkit engine.
    const dialer = yield* f.wrap(f.ps(`& '${binary}' '-test.run=TestOrchestraBroker$' '-test.count=1' '-test.v'; exit $LASTEXITCODE`, {
      ORCHESTRA_DIALER_TEST_ADDRESS: `127.0.0.1:${granted}`, ORCHESTRA_DIALER_TEST_OTHER: `127.0.0.1:${other}`,
    }), profile)
    const result = yield* f.processes.run(dialer, { timeout: "60 seconds" })
    expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(0)
    expect(result.stdout.toString()).toContain("--- PASS: TestOrchestraBroker")
    expect([f.counts[granted], f.counts[other] ?? 0]).toEqual([1, 0])
    // Plain TCP clients stay refused under the same grant: there is no route out of the container.
    const plain = yield* f.wrap(f.ps(`$c = [Net.Sockets.TcpClient]::new(); try { if ($c.ConnectAsync('127.0.0.1', ${granted}).Wait(3000)) { 'connected' } else { 'timeout' } } catch { 'refused' }`), profile)
    const raw = yield* f.processes.run(plain, { timeout: "60 seconds" })
    expect(raw.stdout.toString().trim()).toMatch(/^(?:timeout|refused)$/)
    expect([f.counts[granted], f.counts[other] ?? 0]).toEqual([1, 0])
  }), 600_000,
)
