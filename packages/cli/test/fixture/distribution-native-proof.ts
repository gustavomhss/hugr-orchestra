import { expect } from "bun:test"
import { lstatSync, readFileSync } from "node:fs"
import { chmod, lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises"
import { join, sep } from "node:path"
import { Effect, Schema } from "effect"
import { Skill } from "../../../schema/src/skill"
import { Location } from "../../../schema/src/location"
import { AbsolutePath } from "../../../schema/src/schema"
import { PackagedSkills } from "@orchestra/core/packaged-skills"
import { assertVersion, command, successful, snapshot, skillIdentity } from "./distribution-native"
import type { Oracle, Sandbox } from "./distribution-native"
import { corroborateProcess, installedCompanionProbe } from "./distribution-native-process"
import type { WindowsIdentity } from "./distribution-windows-process"
import type { Omni } from "@orchestra/core/omni"

const Registration = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)),
  pid: Schema.Int.check(Schema.isGreaterThan(0)), version: Schema.String, url: Schema.String,
})
type Receipt = typeof Registration.Type
type Lease = { launcher: string; executable: string; box: Sandbox; version: string; attempted: boolean; receipt?: Receipt; identity?: WindowsIdentity; tree?: Omni.Child; failure?: Error }
const leases = new Set<Lease>()

export async function stopServices() {
  // Attempt every owned lease even when one cleanup fails. Failures keep their leases.
  const results = await Promise.allSettled([...leases].map(stop))
  const failures = results.flatMap((result) => result.status === "rejected"
    ? [result.reason instanceof Error ? result.reason : new Error("NATIVE_DAEMON_CLEANUP_UNKNOWN_FAILURE")] : [])
  if (failures.length) throw new AggregateError(failures, "NATIVE_DAEMON_CLEANUP_FAILED")
}

// Last-resort exit cleanup cannot await promises. No fixture deletion here.
// This synchronous command never needs the in-process npm registry.
export function emergencyStop() {
  for (const lease of leases) {
    if (!lease.attempted) continue
    process.exitCode = 1 // An outstanding lease has not proved cleanup.
    const current = Effect.runSync(Effect.try({
      try: () => {
        const file = join(lease.box.env.XDG_STATE_HOME, "orchestra/server.json")
        const info = lstatSync(file)
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
          throw new Error("NATIVE_DAEMON_REGISTRATION_NOT_OWNED_FILE")
        return decodeReceipt(readFileSync(file, "utf8"))
      },
      catch: () => new Error("NATIVE_DAEMON_EMERGENCY_RECEIPT_UNAVAILABLE"),
    }).pipe(Effect.option))
    if (current._tag === "None" || current.value.version !== lease.version ||
        (lease.receipt && !sameReceipt(current.value, lease.receipt))) continue
    lease.receipt = current.value
    // launcher was canonicalized and confined to this host-owned isolated box.
    // Best effort only: success does not prove exit and cannot release the lease.
    Effect.runSync(Effect.try({
      // Windows sync fallback uses the owned installed PE, since CMD shims need
      // async AppProcess shell handling. This cannot qualify cleanup or exit.
      try: () => Bun.spawnSync([process.platform === "win32" ? lease.executable : lease.launcher, "service", "stop"], {
        cwd: lease.box.cwd, env: lease.box.env, stdout: "ignore", stderr: "ignore", timeout: 20_000,
      }),
      catch: () => new Error("NATIVE_DAEMON_EMERGENCY_STOP_FAILED"),
    }).pipe(Effect.option))
  }
}

async function stop(lease: Lease) {
  // A later status/cleanup retry must not erase a prior unproved detached start
  // or surviving PID and allow afterAll to delete the diagnostic fixture.
  if (lease.failure) throw lease.failure
  return stopOwned(lease).catch(async (error: unknown) => {
    lease.failure = error instanceof Error ? error : new Error("NATIVE_DAEMON_CLEANUP_UNKNOWN_FAILURE")
    // Failure recovery stops only this fixture's retained native Job, never a
    // bare registration PID. It cannot satisfy public-stop/exit qualification;
    // keep the failure, lease and diagnostic files even after owned-tree cleanup.
    const tree = lease.tree
    if (tree) {
      await tree.stop({ graceMs: 2_000 }).then(async () => {
        if ((await tree.processes()).length !== 0) throw new Error("NATIVE_DAEMON_RECOVERY_TREE_NOT_EMPTY")
        console.error(`NATIVE_DAEMON_TREE_RECOVERY ${JSON.stringify({ rootPID: tree.pid, empty: true })}`)
      }).catch((failure: unknown) => {
        lease.failure = new AggregateError([lease.failure, failure], "NATIVE_DAEMON_OWNED_TREE_CLEANUP_FAILED")
      })
    }
    throw lease.failure
  })
}

async function stopOwned(lease: Lease) {
  if (!lease.attempted) { leases.delete(lease); return }
  // Capture before health-dependent stop/status can remove server.json. A failed
  // start may have registered without ever returning an endpoint to the caller.
  await captureReceipt(lease)
  if (!lease.receipt) throw new Error("NATIVE_DAEMON_RECEIPT_MISSING_AFTER_DETACHED_START")
  const receipt = lease.receipt
  const current = await registration(lease.box)
  if (current && !sameReceipt(current, receipt)) throw new Error("NATIVE_DAEMON_REGISTRATION_CHANGED_BEFORE_STOP")
  if (process.platform === "win32") {
    const identity = await corroborateProcess(receipt.pid, lease.executable, lease.box)
    if (!identity || !lease.identity || identity.startTime !== lease.identity.startTime)
      throw new Error(`NATIVE_DAEMON_IDENTITY_CHANGED_BEFORE_STOP: ${JSON.stringify({ pid: receipt.pid,
        expected: lease.identity ?? null, observed: identity ?? null })}`)
  }
  const result = await command([lease.launcher, "service", "stop"], lease.box, 20_000)
    .then((value) => ({ value }), () => ({ value: undefined }))
  // Even a failed/no-op stop must prove the captured PID exited. Never signal a
  // raw PID here: only the authenticated public service command may stop it.
  await exited(receipt.pid, lease.identity)
  if (!result.value || result.value.code !== 0) throw new Error("NATIVE_DAEMON_STOP_COMMAND_FAILED")
  expect(await successful([lease.launcher, "service", "status"], lease.box, 15_000)).toBe("stopped")
  if (lease.tree) {
    // Public stop already proved the exact daemon exited. Closing the retained
    // harness job now releases its native ownership, including any helper tails.
    await lease.tree.stop({ graceMs: 2_000 })
    expect(await lease.tree.processes()).toEqual([])
    console.error(`NATIVE_DAEMON_TREE_RELEASED ${JSON.stringify({ rootPID: lease.tree.pid, daemonPID: receipt.pid })}`)
  }
  leases.delete(lease)
}

async function registration(box: Sandbox) {
  const file = join(box.env.XDG_STATE_HOME, "orchestra/server.json")
  const info = await lstat(file).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw new Error("NATIVE_DAEMON_REGISTRATION_STAT_FAILED")
  })
  if (!info) return undefined
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
    throw new Error("NATIVE_DAEMON_REGISTRATION_NOT_OWNED_FILE")
  return decodeReceipt(await readFile(file, "utf8").catch(() => { throw new Error("NATIVE_DAEMON_REGISTRATION_READ_FAILED") }))
}

function decodeReceipt(text: string) {
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Registration)))(text)
  if (decoded._tag === "None") throw new Error("NATIVE_DAEMON_REGISTRATION_INVALID")
  const receipt = decoded.value
  if (!Number.isSafeInteger(receipt.pid) || receipt.pid === process.pid)
    throw new Error("NATIVE_DAEMON_REGISTRATION_PID_INVALID")
  const endpoint = URL.parse(receipt.url)
  if (!endpoint || endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/")
    throw new Error("NATIVE_DAEMON_REGISTRATION_ENDPOINT_INVALID")
  return receipt
}

function sameReceipt(left: Receipt, right: Receipt) {
  return left.id === right.id && left.pid === right.pid && left.version === right.version && left.url === right.url
}

async function captureReceipt(lease: Lease) {
  if (!lease.attempted) return
  const deadline = Date.now() + (lease.receipt ? 0 : 5_000)
  do {
    const receipt = await registration(lease.box)
    if (receipt) {
      if (receipt.version !== lease.version) throw new Error("NATIVE_DAEMON_REGISTRATION_VERSION_MISMATCH")
      if (lease.receipt && !sameReceipt(receipt, lease.receipt))
        throw new Error("NATIVE_DAEMON_REGISTRATION_CHANGED")
      if (!lease.receipt) {
        lease.identity = await corroborateProcess(receipt.pid, lease.executable, lease.box)
        if (process.platform === "win32") {
          if (!lease.tree) throw new Error("NATIVE_DAEMON_START_TREE_NOT_ADOPTED")
          const members = await lease.tree.processes()
          const rootExit = await lease.tree.wait()
          console.error(`NATIVE_DAEMON_OWNED_TREE ${JSON.stringify({ rootPID: lease.tree.pid, daemonPID: receipt.pid,
            creationTime: lease.identity?.startTime, rootExit, members })}`)
          expect(rootExit.exitCode).toBe(0)
          if (!members.some((member) => member.pid === receipt.pid))
            throw new Error("NATIVE_DAEMON_PID_OUTSIDE_OWNED_START_TREE")
        }
      }
      lease.receipt = receipt
      return
    }
    if (lease.receipt || Date.now() >= deadline) return
    await Bun.sleep(50)
  } while (Date.now() <= deadline)
}

async function exited(pid: number, identity?: WindowsIdentity) {
  const deadline = Date.now() + 15_000
  do {
    if (process.platform === "win32") {
      if (!identity) throw new Error("NATIVE_DAEMON_WINDOWS_IDENTITY_MISSING")
      const { windowsIdentity } = await import("./distribution-windows-process")
      const current = await windowsIdentity(pid)
      console.error(`NATIVE_DAEMON_EXIT_OBSERVATION ${JSON.stringify({ pid, expected: identity, observed: current ?? null })}`)
      if (!current || current.startTime !== identity.startTime) return
      if (current.executable.toLowerCase() !== identity.executable.toLowerCase())
        throw new Error("NATIVE_DAEMON_WINDOWS_EXECUTABLE_CHANGED")
      if (Date.now() >= deadline) throw new Error(`NATIVE_DAEMON_PID_SURVIVED_STOP: pid=${pid}`)
      await Bun.sleep(100)
      continue
    }
    const running = await Promise.resolve().then(() => { process.kill(pid, 0); return true })
      .catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN"
        throw new Error(`NATIVE_DAEMON_PID_CHECK_FAILED: pid=${pid} code=${code}`)
      })
    if (!running) return
    if (Date.now() >= deadline) throw new Error(`NATIVE_DAEMON_PID_SURVIVED_STOP: pid=${pid}`)
    await Bun.sleep(50)
  } while (Date.now() <= deadline)
  throw new Error(`NATIVE_DAEMON_PID_EXIT_UNPROVEN: pid=${pid}`)
}

export async function symbols(launcher: string, box: Sandbox) {
  const ts = JSON.parse(await successful([launcher, "debug", "symbols", join(box.cwd, "sample.ts")], box))
  expect(ts.coverage).toMatchObject({ complete: true })
  expect(ts.symbols.map((symbol: { kind: string; name: string }) => `${symbol.kind} ${symbol.name}`)).toEqual([
    "interface Shape", "class Square", "function load",
  ])
  expect(ts.imports).toEqual([{ from: "node:fs/promises", names: ["readFile"] }])
  const py = JSON.parse(await successful([launcher, "debug", "symbols", join(box.cwd, "sample.py")], box))
  expect(py.coverage).toMatchObject({ complete: true })
  expect(py.symbols.map((symbol: { name: string }) => symbol.name)).toEqual(["join"])
  expect(py.imports).toEqual([{ from: "os", names: ["path"] }])
}

async function companionFailures(launcher: string, payload: string, box: Sandbox, version: string) {
  const addon = join(payload, "bin/hugr_omni.node")
  const original = await readFile(addon)
  const addonMode = (await lstat(addon)).mode & 0o777
  for (const kind of ["missing", "corrupt"] as const) {
    try {
      if (kind === "missing") await rm(addon)
      if (kind === "corrupt") await writeFile(addon, "not a native addon")
      const result = await command([launcher, "--version"], box, 15_000)
      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain("hugr-omni CLI preflight failed:")
    } finally { await writeFile(addon, original); await chmod(addon, addonMode) }
    await assertVersion(launcher, version, box)
  }
  const supervisor = join(payload, `bin/hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`)
  const supervisorBytes = await readFile(supervisor)
  const supervisorMode = (await lstat(supervisor)).mode & 0o777
  await companionSuccess(payload, box)
  // NTFS executable permission is PE/loader-based, not Unix chmod bits.
  for (const kind of (process.platform === "win32" ? ["missing", "corrupt"] as const : ["missing", "corrupt", "non-executable"] as const)) {
    try {
      if (kind === "missing") await rm(supervisor)
      if (kind === "corrupt") await writeFile(supervisor, "not an executable supervisor")
      if (kind === "non-executable") await chmod(supervisor, supervisorMode & ~0o111)
      const result = await installedCompanionProbe(payload, box)
      expect(result.code, `Installed supervisor ${kind} must fail`).not.toBe(0)
      expect(result.stderr).toContain("INSTALLED_COMPANION_PROBE_FAILED:")
      expect(result.stderr).toContain("supervisor")
      expect(result.stdout).not.toContain('"oracle":"installed-companion"')
    } finally { await writeFile(supervisor, supervisorBytes); await chmod(supervisor, supervisorMode) }
    await companionSuccess(payload, box)
  }
  const parser = join(payload, "bin/tree-sitter/tree-sitter-typescript/prebuilds",
    `${process.platform}-${process.arch}`, "tree-sitter-typescript.node")
  const binding = await readFile(parser)
  const parserMode = (await lstat(parser)).mode & 0o777
  for (const kind of ["missing", "corrupt"] as const) {
    try {
      if (kind === "missing") await rm(parser)
      if (kind === "corrupt") await writeFile(parser, "not a parser binding")
      const result = JSON.parse(await successful([launcher, "debug", "symbols", join(box.cwd, "sample.ts")], box))
      expect(result).toMatchObject({ symbols: [], imports: [], coverage: { complete: false, reason: "parser-unavailable" } })
      expect(result.coverage.detail).toStartWith("native symbol extraction unavailable: ")
      expect(result.coverage.detail).toContain("tree-sitter")
      expect(result.coverage.detail).not.toContain("parser-worker")
    } finally { await writeFile(parser, binding); await chmod(parser, parserMode) }
    await symbols(launcher, box)
  }
}

async function companionSuccess(payload: string, box: Sandbox) {
  const result = await installedCompanionProbe(payload, box)
  expect(result.code, result.stderr).toBe(0)
  const receipt = JSON.parse(result.stdout)
  expect(receipt).toMatchObject({ oracle: "installed-companion", exitCode: 7, stdout: "installed-companion-child\n" })
  expect(receipt.paths).toEqual({
    addon: join(await realpath(payload), "bin/hugr_omni.node"),
    supervisor: join(await realpath(payload), `bin/hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`),
  })
  expect(receipt.counters.spawns).toBeGreaterThan(0)
  expect(receipt.counters.delegations).toBe(0)
}

export async function qualify(input: {
  launcher: string; payload: string; version: string; box: Sandbox; oracle: Oracle; negative?: boolean
}) {
  const launcher = await realpath(input.launcher)
  if (!launcher.startsWith((await realpath(input.box.directory)) + sep))
    throw new Error("NATIVE_DAEMON_LAUNCHER_OUTSIDE_OWNED_BOX")
  const lease: Lease = { launcher, executable: join(input.payload, `bin/orchestra${process.platform === "win32" ? ".exe" : ""}`), box: input.box, version: input.version, attempted: false }
  if (process.platform === "win32") {
    lease.executable = await realpath(lease.executable)
    if (!lease.executable.toLowerCase().startsWith((await realpath(input.box.directory)).toLowerCase() + sep))
      throw new Error("NATIVE_DAEMON_EXECUTABLE_OUTSIDE_OWNED_BOX")
  }
  leases.add(lease) // Register before start: failures/timeouts must still stop.
  try {
    const before = await snapshot(input.box.namespace)
    await assertVersion(input.launcher, input.version, input.box)
    expect(await snapshot(input.box.namespace)).toEqual(before)
    if (await registration(input.box)) throw new Error("NATIVE_DAEMON_PREEXISTING_REGISTRATION")
    expect(await successful([input.launcher, "service", "status"], input.box, 15_000)).toBe("stopped")
    if (input.negative) await companionFailures(input.launcher, input.payload, input.box, input.version)
    if (!input.negative) await companionSuccess(input.payload, input.box)
    await symbols(input.launcher, input.box)
    lease.attempted = true
    const started = await (process.platform === "win32"
      ? command([input.launcher, "service", "start"], input.box, 30_000, {
        register: (tree) => Effect.gen(function* () {
          if (lease.tree) {
            yield* Effect.promise(() => tree.stop({ graceMs: 2_000 }))
            return yield* Effect.die(new Error("NATIVE_DAEMON_START_TREE_ALREADY_ADOPTED"))
          }
          lease.tree = tree
          console.error(`NATIVE_DAEMON_START_TREE_ADOPTED ${JSON.stringify({ rootPID: tree.pid, version: lease.version })}`)
        }),
      }).then((result) => {
        if (result.code !== 0) throw new Error(`NATIVE_DAEMON_START_COMMAND_FAILED: code=${result.code}`)
        return result.stdout.trim()
      })
      : successful([input.launcher, "service", "start"], input.box, 30_000))
      .finally(() => captureReceipt(lease))
    if (!lease.receipt) throw new Error("NATIVE_DAEMON_RECEIPT_MISSING_AFTER_START")
    if (started !== lease.receipt.url) throw new Error("NATIVE_DAEMON_START_RECEIPT_ENDPOINT_MISMATCH")
    const endpoint = new URL(started)
    expect(endpoint.protocol).toBe("http:")
    expect(endpoint.hostname).toBe("127.0.0.1")
    expect(endpoint.port).not.toBe("")
    expect([endpoint.username, endpoint.password, endpoint.search, endpoint.hash]).toEqual(["", "", "", ""])
    expect(endpoint.pathname).toBe("/")
    expect(await successful([input.launcher, "service", "status"], input.box, 15_000)).toBe(`running ${endpoint.origin}`)
    const password = await successful([input.launcher, "service", "password"], input.box, 15_000)
    if (!/^[A-Za-z0-9_-]{43}$/.test(password)) throw new Error("DAEMON_PASSWORD_INVALID")
    const request = (url: URL, credential?: string) => fetch(url, {
      headers: credential === undefined ? {} : { Authorization: `Basic ${Buffer.from(`orchestra:${credential}`).toString("base64")}` },
      signal: AbortSignal.timeout(15_000), redirect: "error",
    })
    const health = await request(new URL("/api/health", endpoint), password)
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ healthy: true })
    for (const credential of [undefined, `${password}-wrong`])
      expect([401, 403]).toContain((await request(new URL("/api/health", endpoint), credential)).status)
    const url = new URL("/api/skill", endpoint)
    url.searchParams.set("location[directory]", input.box.cwd)
    for (const credential of [undefined, `${password}-wrong`]) expect([401, 403]).toContain((await request(url, credential)).status)
    const response = await request(url, password)
    expect(response.status).toBe(200)
    // Exact success envelope from protocol/groups/skill + schema/location.
    const catalog = Schema.decodeUnknownSync(Location.response(Schema.Array(Skill.Info)))(await response.json())
    expect(catalog.location.directory).toBe(AbsolutePath.make(input.box.cwd))
    expect(catalog.data.length).toBeGreaterThan(0)
    const root = join(input.box.namespace, skillIdentity(input.version, input.oracle))
    const expected = input.oracle.catalog.map((skill) => ({
      name: skill.name, description: skill.description, slash: skill.slash,
      content: skill.content, location: AbsolutePath.make(join(root, skill.path)),
    })).toSorted((a, b) => a.name.localeCompare(b.name))
    expect(catalog.data.map((skill) => ({
      name: skill.name, description: skill.description, slash: skill.slash,
      content: skill.content, location: skill.location,
    })).toSorted((a, b) => a.name.localeCompare(b.name))).toEqual(expected)
    const tree = await snapshot(root)
    if (!tree) throw new Error("PACKAGED_SKILL_TREE_MISSING")
    expect([...tree.files.keys()].sort()).toEqual(input.oracle.files.map((file) => file.path).sort())
    expect(tree.directories).toEqual(input.oracle.directories)
    for (const file of input.oracle.files) {
      expect(tree.files.get(file.path)?.bytes).toEqual(file.bytes)
      expect(tree.files.get(file.path)?.executable).toBe(false)
    }
    const materialized = Object.fromEntries(Object.keys(input.oracle.trees).map((id) => [id,
      Object.fromEntries([...tree.files].filter(([file]) => file.startsWith(`${id}/`))
        .map(([file, value]) => [file.slice(id.length + 1), value.bytes.toString("utf8")])),
    ]))
    expect(PackagedSkills.digest(materialized)).toBe(input.oracle.digest)
    expect((await readdir(input.box.namespace)).filter((name) => name.includes(".stage-") || name.endsWith(".lock"))).toEqual([])
    expect((await readFile(input.box.env.ORCHESTRA_DB)).length).toBeGreaterThan(0)
    return root
  } finally { await stop(lease) }
}
