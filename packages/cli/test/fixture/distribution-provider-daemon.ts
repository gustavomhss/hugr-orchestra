import { expect } from "bun:test"
import { lstat, readFile, realpath } from "node:fs/promises"
import { dirname, join, sep } from "node:path"
import { Schema } from "effect"
import { command, sha256, successful } from "./distribution-native"
import type { Sandbox } from "./distribution-native"
import { identity, installedAddon, requireExited } from "./distribution-provider-process"

const Registration = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/)),
  pid: Schema.Int.check(Schema.isGreaterThan(0)), version: Schema.String, url: Schema.String,
})
const leases = new Set<ReturnType<typeof providerDaemon>>()

// Own registration before detached start. Only public authenticated stop may
// signal the server; /proc is identity/exit observation, never a raw-PID kill.
export function providerDaemon(launcher: string, payload: string, version: string, box: Sandbox, evidence: string) {
  const state: {
    attempted: boolean; receipt?: typeof Registration.Type;
    process?: NonNullable<Awaited<ReturnType<typeof identity>>>;
    chain: NonNullable<Awaited<ReturnType<typeof identity>>>[];
    stop?: Promise<void>;
    requests: number;
  } = { attempted: false, chain: [], requests: 0 }
  const registration = async () => {
    const file = join(box.env.XDG_STATE_HOME, "orchestra/server.json")
    const info = await lstat(file).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    if (!info) return
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error("PROVIDER_DAEMON_REGISTRATION_NOT_OWNED")
    const receipt = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Registration)))(await readFile(file, "utf8"))
    const endpoint = new URL(receipt.url)
    if (receipt.version !== version || receipt.pid === process.pid || endpoint.protocol !== "http:" ||
        endpoint.hostname !== "127.0.0.1" || !endpoint.port || endpoint.pathname !== "/" ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("PROVIDER_DAEMON_RECEIPT_INVALID")
    if (state.receipt && JSON.stringify(receipt) !== JSON.stringify(state.receipt)) throw new Error("PROVIDER_DAEMON_REGISTRATION_CHANGED")
    const found = await identity(receipt.pid)
    if (!found || found.executable !== await realpath(join(payload, "bin/orchestra")) || !found.argv.includes("serve") ||
        !found.argv.includes("--register")) throw new Error("PROVIDER_DAEMON_INSTALLED_IDENTITY_MISMATCH")
    const env = (await readFile(`/proc/${receipt.pid}/environ`, "utf8")).split("\0")
    expect(env).toContain(`ORCHESTRA_DB=${box.env.ORCHESTRA_DB}`)
    expect(env).toContain("ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict")
    expect(env.filter((entry) => /^HUGR_OMNI_/i.test(entry))).toEqual([])
    if (state.process && state.process.start !== found.start) throw new Error("PROVIDER_DAEMON_PROCESS_IDENTITY_CHANGED")
    state.receipt = receipt
    state.process = found
    return receipt
  }
  const lease = {
    async start() {
      if (state.attempted) throw new Error("PROVIDER_DAEMON_START_ALREADY_ATTEMPTED")
      if (!(await realpath(launcher)).startsWith((await realpath(dirname(box.directory))) + sep))
        throw new Error("PROVIDER_DAEMON_LAUNCHER_OUTSIDE_OWNED_BOX")
      if (await registration()) throw new Error("PROVIDER_DAEMON_PREEXISTING_REGISTRATION")
      expect(await successful([launcher, "service", "status"], box, 15_000)).toBe("stopped")
      state.attempted = true
      const started = await command([launcher, "service", "start"], box, 30_000).finally(async () => {
        const deadline = Date.now() + 5_000
        while (!await registration() && Date.now() < deadline) await Bun.sleep(50)
      })
      if (!state.receipt || !state.process) throw new Error("PROVIDER_DAEMON_DETACHED_START_UNOWNED")
      expect(started.code).toBe(0)
      expect(started.stdout.trim()).toBe(state.receipt.url)
      // Capture public password only in memory. Never log it, headers, argv or
      // service output that contains it; api transport uses its private file.
      const password = await successful([launcher, "service", "password"], box, 15_000)
      if (!/^[A-Za-z0-9_-]{43}$/.test(password)) throw new Error("PROVIDER_DAEMON_PASSWORD_INVALID")
      if (await readFile(join(box.env.XDG_STATE_HOME, "orchestra/password"), "utf8") !== password)
        throw new Error("PROVIDER_DAEMON_PASSWORD_FILE_MISMATCH")
      const denied = await fetch(new URL("/api/health", state.receipt.url), { redirect: "error", signal: AbortSignal.timeout(10_000) })
      expect([401, 403]).toContain(denied.status)
      const health = await this.api("GET", "/api/health")
      expect(Schema.decodeUnknownSync(Schema.Struct({ healthy: Schema.Boolean }))(health).healthy).toBe(true)
      await Bun.write(join(evidence, "daemon.json"), JSON.stringify({ ...state.receipt, process: state.process,
        nativeSHA256: sha256(await readFile(`/proc/${state.process.pid}/exe`)), strict: true,
        addon: await installedAddon(payload, state.process),
        publicArgv: [[launcher, "service", "start"], [launcher, "service", "password"]] }, null, 2))
      return state.process
    },
    async api(method: string, path: string, body?: unknown) {
      await registration()
      if (!state.receipt) throw new Error("PROVIDER_DAEMON_API_WITHOUT_OWNED_REGISTRATION")
      const args = [launcher, "api", method, path, ...(body === undefined ? [] : ["--data", JSON.stringify(body)])]
      const result = await command(args, box, 30_000)
      await Bun.write(join(evidence, `api-${String(++state.requests).padStart(4, "0")}.json`), JSON.stringify({
        argv: args, code: result.code, stdout: result.stdout, stderr: result.stderr,
      }, null, 2))
      if (result.code !== 0) throw new Error(`PROVIDER_PUBLIC_API_COMMAND_FAILED: ${method} ${path} code=${result.code}`)
      // cli.api does not fail on HTTP errors. Validate every JSON success envelope
      // at the caller; non-JSON or error bodies must never count as admission.
      return result.stdout.trim() ? Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.stdout.trim()) : undefined
    },
    capture(identities: typeof state.chain) { state.chain.push(...identities) },
    stop() {
      state.stop ??= (async () => {
        if (!state.attempted) { leases.delete(lease); return }
        const receipt = await registration()
        if (!receipt || !state.process) throw new Error("PROVIDER_DAEMON_STOP_OWNERSHIP_UNPROVEN")
        const captured = state.process
        const stopped = await command([launcher, "service", "stop"], box, 30_000)
        await requireExited([captured, ...state.chain])
        expect(stopped.code).toBe(0)
        expect(await successful([launcher, "service", "status"], box, 15_000)).toBe("stopped")
        await Bun.write(join(evidence, "daemon-cleanup.json"), JSON.stringify({ receipt, process: captured,
          chain: state.chain, publicArgv: [launcher, "service", "stop"], authenticatedPublicStop: true, capturedIdentitiesExited: true }, null, 2))
        leases.delete(lease)
      })()
      return state.stop
    },
  }
  leases.add(lease)
  return lease
}

export async function stopProviderDaemons() {
  const results = await Promise.allSettled([...leases].map((lease) => lease.stop()))
  const failures = results.filter((result) => result.status === "rejected")
  if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "PROVIDER_DAEMON_CLEANUP_FAILED")
}
