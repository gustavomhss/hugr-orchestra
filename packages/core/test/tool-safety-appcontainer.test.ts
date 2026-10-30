import { describe, expect } from "bun:test"
import os from "node:os"
import path from "node:path"
import { createServer } from "node:net"
import { cp, link, readFile, stat, writeFile, mkdir } from "node:fs/promises"
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
    expect(ToolSafetyAppContainer.quote('a b\\\\"c')).toBe('"a b\\\\\\\\\\"c"')
    expect(ToolSafetyAppContainer.quote("a b" + "\\".repeat(200_000) + "x")).toBe('"a b' + "\\".repeat(200_000) + 'x"')
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

    // Project config inside a write root is guarded read-only for the command, not refused: the launcher gets a
    // --guard for that path and a --journal so the protection can be recovered after an abort. (Enforcement, the
    // attack matrix and restoration are exercised in "guards project config" below.)
    const guardedProfile = { ...profile, protectedWrites: [path.join(f.workspace, "out", "keep.txt")] }
    const guardedCommand = yield* f.wrap(f.ps(script), guardedProfile)
    if (guardedCommand._tag !== "StandardCommand") throw new Error("expected one command")
    expect(guardedCommand.args[guardedCommand.args.indexOf("--guard") + 1]).toBe(path.join(f.workspace, "out", "keep.txt"))
    expect(guardedCommand.args).toContain("--journal")

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

windows("a command whose environment lacks LOCALAPPDATA still launches confined", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    // Callers may pass a narrowed environment; Windows needs LOCALAPPDATA to build an AppContainer's (error 203 without it).
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "LOCALAPPDATA"))
    const command = yield* f.wrap(ChildProcess.make(f.pwsh, ["-NoProfile", "-Command", "'confined'"], { cwd: f.workspace, env, extendEnv: false, stdin: "ignore" }),
      { requireSandbox: true })
    expect(command._tag === "StandardCommand" && command.args[0]).toBe("--appcontainer")
    const result = yield* f.processes.run(command, { timeout: "60 seconds" })
    expect(result.exitCode, result.stderr.toString()).toBe(0)
    expect(result.stdout.toString().trim()).toBe("confined")
  }), 120_000,
)

// Attempts every way the container could change a guarded path, and the normal writes that must still work. Each line
// records its own outcome so the assertions read against a single object; `& cmd` proves a cmd.exe child in the root.
const attacks = (w: string) => `
$r = [ordered]@{}
function t($k, $b) { try { & $b; $r[$k] = 'ok' } catch { $r[$k] = 'denied' } }
t 'fileWrite'     { Set-Content -LiteralPath '${path.join(w, "orchestra.json")}' -Value hacked -ErrorAction Stop }
t 'fileAppend'    { Add-Content -LiteralPath '${path.join(w, "orchestra.json")}' -Value more -ErrorAction Stop }
t 'fileAds'       { Set-Content -LiteralPath '${path.join(w, "orchestra.json")}' -Stream evil -Value x -ErrorAction Stop }
t 'fileAcl'       { \$a = Get-Acl -LiteralPath '${path.join(w, "orchestra.json")}'; \$a.SetAccessRuleProtection(\$false,\$true); Set-Acl -LiteralPath '${path.join(w, "orchestra.json")}' -AclObject \$a -ErrorAction Stop }
t 'fileDelete'    { Remove-Item -LiteralPath '${path.join(w, "orchestra.json")}' -Force -ErrorAction Stop }
t 'fileRename'    { Rename-Item -LiteralPath '${path.join(w, "orchestra.json")}' -NewName moved.json -ErrorAction Stop }
t 'fileRenameOver'{ [IO.File]::Move('${path.join(w, "evil.txt")}', '${path.join(w, "orchestra.json")}', \$true) }
t 'fileHardlink'  { New-Item -ItemType HardLink -Path '${path.join(w, "hl.json")}' -Value '${path.join(w, "orchestra.json")}' -ErrorAction Stop | Out-Null }
t 'dirNewChild'   { Set-Content -LiteralPath '${path.join(w, ".orchestra", "new.json")}' -Value x -ErrorAction Stop }
t 'dirWriteChild' { Set-Content -LiteralPath '${path.join(w, ".orchestra", "orchestra.json")}' -Value hacked -ErrorAction Stop }
t 'dirDelete'     { Remove-Item -LiteralPath '${path.join(w, ".orchestra")}' -Recurse -Force -ErrorAction Stop }
t 'dirRename'     { Rename-Item -LiteralPath '${path.join(w, ".orchestra")}' -NewName .orch-old -ErrorAction Stop }
t 'guardJunction' { New-Item -ItemType Junction -Path '${path.join(w, "tui.jsonc")}' -Value '${path.join(w, "sub")}' -ErrorAction Stop | Out-Null }
t 'phCreateName'  { Set-Content -LiteralPath '${path.join(w, "tui.json")}' -Value x -ErrorAction Stop }
t 'phDelete'      { Remove-Item -LiteralPath '${path.join(w, "tui.json")}' -Recurse -Force -ErrorAction Stop }
t 'phRename'      { Rename-Item -LiteralPath '${path.join(w, "tui.json")}' -NewName tui-old -ErrorAction Stop }
t 'phWriteChild'  { Set-Content -LiteralPath '${path.join(w, "tui.json", "x.txt")}' -Value x -ErrorAction Stop }
t 'okRootFile'    { cmd /c 'echo hi> "${path.join(w, "out.txt")}"' ; if (\$LASTEXITCODE) { throw } }
t 'okSubdir'      { New-Item -ItemType Directory -Path '${path.join(w, "sub2")}' -ErrorAction Stop | Out-Null }
t 'okEditData'    { Set-Content -LiteralPath '${path.join(w, "data.txt")}' -Value edited -ErrorAction Stop }
$r | ConvertTo-Json -Compress
`

windows("guards project config: existing files and placeholders stay read-only, then restore; normal writes work", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.promise(async () => {
      await writeFile(path.join(f.workspace, "orchestra.json"), "{}")
      await writeFile(path.join(f.workspace, "evil.txt"), "evil")
      await writeFile(path.join(f.workspace, "data.txt"), "orig")
      await mkdir(path.join(f.workspace, ".orchestra"))
      await writeFile(path.join(f.workspace, ".orchestra", "orchestra.json"), "{}")
      await mkdir(path.join(f.workspace, "sub"))
    })
    // The whole workspace is the write root, so the config names in it are auto-guarded by SandboxProjectConfig.
    const profile = { requireSandbox: true, writeRoots: [f.workspace] } satisfies ToolSafety.Profile
    const command = yield* f.wrap(f.ps(attacks(f.workspace)), profile)
    if (command._tag !== "StandardCommand") throw new Error("expected one command")
    // tui.json does not exist, so it is guarded by a placeholder directory.
    expect(command.args.slice(command.args.indexOf("--guard"))).toContain(path.join(f.workspace, "tui.json"))

    const result = output(yield* f.processes.run(command, { timeout: "90 seconds" }))
    expect(result).toEqual({
      fileWrite: "denied", fileAppend: "denied", fileAds: "denied", fileAcl: "denied", fileDelete: "denied",
      fileRename: "denied", fileRenameOver: "denied", fileHardlink: "denied",
      dirNewChild: "denied", dirWriteChild: "denied", dirDelete: "denied", dirRename: "denied", guardJunction: "denied",
      phCreateName: "denied", phDelete: "denied", phRename: "denied", phWriteChild: "denied",
      okRootFile: "ok", okSubdir: "ok", okEditData: "ok",
    })
    // Nothing the attacks tried actually changed.
    expect(yield* f.fs.readFileString(path.join(f.workspace, "orchestra.json"))).toBe("{}")
    expect(yield* f.fs.readFileString(path.join(f.workspace, ".orchestra", "orchestra.json"))).toBe("{}")
    expect(yield* f.fs.exists(path.join(f.workspace, "moved.json"))).toBe(false)
    // Normal writes landed.
    expect(yield* f.fs.exists(path.join(f.workspace, "out.txt"))).toBe(true)
    expect(yield* f.fs.exists(path.join(f.workspace, "sub2"))).toBe(true)
    expect((yield* f.fs.readFileString(path.join(f.workspace, "data.txt"))).trim()).toBe("edited")

    // Restored after the command: placeholders gone, and the host can write the config again (inheritance back, no
    // leftover read-only ACE).
    for (const name of ["tui.json", "orchestra.jsonc", "tui.jsonc"])
      expect(yield* f.fs.exists(path.join(f.workspace, name))).toBe(false)
    yield* Effect.promise(() => Bun.spawn([f.pwsh, "-NoProfile", "-Command",
      `Set-Content -NoNewline -LiteralPath '${path.join(f.workspace, "orchestra.json")}' -Value host`]).exited)
    expect(yield* f.fs.readFileString(path.join(f.workspace, "orchestra.json"))).toBe("host")
  }), 180_000,
)

windows("concurrent commands share one protection and restore only when the last holder exits", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.promise(() => writeFile(path.join(f.workspace, "orchestra.json"), "{}"))
    const profile = { requireSandbox: true, writeRoots: [f.workspace] } satisfies ToolSafety.Profile
    const probe = `try { Set-Content -LiteralPath '${path.join(f.workspace, "orchestra.json")}' -Value x -ErrorAction Stop; 'ok' } catch { 'denied' }`
    // A holds the guard while B runs and finishes; B's exit must not un-protect the config while A is still live.
    const long = yield* f.wrap(f.ps(`$res = ${probe}; Set-Content -LiteralPath '${path.join(f.workspace, "a.txt")}' -Value $res; Start-Sleep 8`), profile)
    const handle = yield* f.processes.spawn(long)
    yield* Effect.promise(async () => {
      for (const _ of Array.from({ length: 80 })) {
        if ((await readFile(path.join(f.workspace, "a.txt"), "utf8").catch(() => "")).trim()) return
        await Bun.sleep(100)
      }
    })
    const b = yield* f.processes.run(yield* f.wrap(f.ps(probe), profile), { timeout: "60 seconds" })
    expect(b.exitCode, b.stderr.toString()).toBe(0)
    expect(b.stdout.toString().trim()).toBe("denied")
    expect((yield* Effect.promise(() => readFile(path.join(f.workspace, "a.txt"), "utf8"))).trim()).toBe("denied")
    yield* handle.exitCode
    // Both gone: the last release restored the config, so the host can write it again.
    yield* Effect.promise(() => Bun.spawn([f.pwsh, "-NoProfile", "-Command",
      `Set-Content -NoNewline -LiteralPath '${path.join(f.workspace, "orchestra.json")}' -Value host`]).exited)
    expect(yield* f.fs.readFileString(path.join(f.workspace, "orchestra.json"))).toBe("host")
  }), 120_000,
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

windows("refuses a guard that equals or contains a write root", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    // A guard equal to the write root cannot be both writable and read-only; it must be refused, not silently kept
    // writable by the filter.
    const profile = { requireSandbox: true, writeRoots: [f.workspace], protectedWrites: [f.workspace] } satisfies ToolSafety.Profile
    expect((yield* Effect.flip(f.wrap(f.ps("'x'"), profile))).reason).toBe("sandbox-appcontainer-guard-over-write-root")
  }), 60_000,
)

windows("journals guard protection under the per-user location so instances share it", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.promise(() => writeFile(path.join(f.workspace, "orchestra.json"), "{}"))
    const command = yield* f.wrap(f.ps("'x'"), { requireSandbox: true, writeRoots: [f.workspace] })
    if (command._tag !== "StandardCommand") throw new Error("expected one command")
    // The test runner's environment may lack LOCALAPPDATA; the journal then still lands under the user's default.
    expect(command.args[command.args.indexOf("--journal") + 1]).toBe(
      path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "orchestra", "appcontainer-guard"))
  }), 60_000,
)

windows("pins a guarded path's parent directories so the container cannot rename or delete them", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const nested = path.join(f.workspace, "nested")
    yield* Effect.promise(async () => {
      await mkdir(nested)
      await writeFile(path.join(nested, "orchestra.json"), "{}")
    })
    const script = `
$r = [ordered]@{}
function t($k, $b) { try { & $b; $r[$k] = 'ok' } catch { $r[$k] = 'denied' } }
t 'renameParent' { Rename-Item -LiteralPath '${nested}' -NewName gone -ErrorAction Stop }
t 'deleteParent' { Remove-Item -LiteralPath '${nested}' -Recurse -Force -ErrorAction Stop }
t 'okSibling'    { New-Item -ItemType Directory -Path '${path.join(f.workspace, "sib")}' -ErrorAction Stop | Out-Null }
$r | ConvertTo-Json -Compress
`
    // Native placement is the nested dir, so SandboxProjectConfig guards nested\orchestra.json; the command runs from
    // the write root, so the shell itself does not hold nested open.
    const command = yield* ToolSafetySandbox.wrap(f.ps(script)).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: [f.workspace] }),
      Effect.provideService(ToolSafety.NativeContext, { directory: nested }))
    if (command._tag !== "StandardCommand") throw new Error("expected one command")
    expect(output(yield* f.processes.run(command, { timeout: "60 seconds" }))).toEqual({
      renameParent: "denied", deleteParent: "denied", okSibling: "ok",
    })
    expect(yield* f.fs.exists(nested)).toBe(true)
  }), 120_000,
)

windows("never deletes host content left inside a placeholder", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const placeholder = path.join(f.workspace, "tui.json") // a missing guarded name becomes a placeholder directory
    const handle = yield* f.processes.spawn(yield* f.wrap(f.ps("Start-Sleep 6"), { requireSandbox: true, writeRoots: [f.workspace] }))
    yield* Effect.promise(async () => {
      for (const _ of Array.from({ length: 80 }))
        if (await stat(placeholder).then((s) => s.isDirectory()).catch(() => false)) break
        else await Bun.sleep(100)
    })
    // The host (not the container) drops a file into the placeholder; release must not delete it.
    yield* Effect.promise(() => writeFile(path.join(placeholder, "host.txt"), "keep"))
    yield* handle.exitCode
    expect(yield* f.fs.exists(path.join(placeholder, "host.txt"))).toBe(true)
    expect(yield* f.fs.readFileString(path.join(placeholder, "host.txt"))).toBe("keep")
  }), 120_000,
)

windows("a second profile joining an existing guard is stripped to read-only too", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const config = path.join(f.workspace, "orchestra.json")
    const extra = path.join(f.workspace, "extra")
    const journal = yield* f.fs.makeTempDirectoryScoped({ prefix: "acj-" }).pipe(Effect.flatMap(f.fs.realPath))
    yield* Effect.promise(async () => {
      await writeFile(config, "{}")
      await mkdir(extra)
    })
    const supervisor = yield* ToolSafetyAppContainer.Launcher
    const build = (roots: string[], guards: string[], script: string) => ToolSafetyAppContainer.command({
      command: f.ps(script), supervisor: supervisor!, cwd: f.workspace, env: process.env, directory: f.workspace,
      roots, scratch: undefined, deny: [], guards, journal, ports: [], domains: 0,
    })
    // profileB (two write roots) gets a different SID than profileA and is granted write on the workspace, inherited
    // into orchestra.json.
    yield* f.processes.run(yield* build([f.workspace, extra], [], "'grant'"), { timeout: "60 seconds" })
    // profileA protects orchestra.json: its detach copies profileB's inherited write ACE in place.
    const held = yield* f.processes.spawn(yield* build([f.workspace], [config], "Start-Sleep 6"))
    yield* Effect.promise(() => Bun.sleep(1500))
    // profileB joins and tries to write; it must be denied, not keep the copied-in write.
    const b = yield* f.processes.run(yield* build([f.workspace, extra], [config],
      `try { Set-Content -LiteralPath '${config}' -Value hacked -ErrorAction Stop; 'ok' } catch { 'denied' }`), { timeout: "60 seconds" })
    expect(b.stdout.toString().trim()).toBe("denied")
    expect(yield* f.fs.readFileString(config)).toBe("{}")
    yield* held.exitCode
  }), 180_000,
)

windows("dedupes guards that resolve to the same file, so restore never leaves it read-only", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const real = path.join(f.workspace, "orchestra.json")
    const alias = path.join(f.workspace, "orchestra.jsonc") // hardlink: a second guarded config name, same inode
    yield* Effect.promise(async () => {
      await writeFile(real, "{}")
      await link(real, alias)
    })
    yield* f.processes.run(yield* f.wrap(f.ps("'x'"), { requireSandbox: true, writeRoots: [f.workspace] }), { timeout: "60 seconds" })
    // After restore the inode re-inherits the write-root grant (an inherited ACE, expected); what must be gone is any
    // EXPLICIT container ACE the guard added. A second guard for the same inode, if not deduped, would restore a
    // captured-while-protected state and leave one behind.
    const explicitContainerAces = yield* Effect.promise(async () => {
      const child = Bun.spawn([f.pwsh, "-NoProfile", "-Command",
        `@((Get-Acl -LiteralPath '${real}').Access | ? { -not $_.IsInherited -and $_.IdentityReference.Value -like 'S-1-15-2-*' }).Count`])
      return Number((await new Response(child.stdout).text()).trim())
    })
    expect(explicitContainerAces).toBe(0)
  }), 120_000,
)
