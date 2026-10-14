import { expect } from "bun:test"
import { readFile, readdir, readlink, realpath } from "node:fs/promises"
import { join } from "node:path"
import { sha256 } from "./distribution-native"

type Identity = { pid: number; parent: number; start: string; executable: string; cwd: string; argv: string[] }

export async function identity(pid: number): Promise<Identity | undefined> {
  return Promise.all([
    readFile(`/proc/${pid}/stat`, "utf8"), readlink(`/proc/${pid}/exe`), readlink(`/proc/${pid}/cwd`),
    readFile(`/proc/${pid}/cmdline`, "utf8"),
  ]).then(([stat, executable, cwd, argv]) => {
    const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)
    if (!/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[19])) throw new Error("PROVIDER_PROC_STAT_INVALID")
    return { pid, parent: Number(fields[1]), start: fields[19], executable, cwd, argv: argv.split("\0").filter(Boolean) }
  }).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && ["ENOENT", "ESRCH"].includes(String(error.code))) return undefined
    throw error
  })
}

// Observe installed supervisor -> shell, plus supervisor's installed native CLI
// parent and isolated DB environment. Host harness's supervisor cannot satisfy it.
export async function observeInstalledTool(payload: string, database: string, cwd: string, command: string, daemon: Identity) {
  const ownerUID = process.getuid?.()
  if (ownerUID === undefined) throw new Error("PROVIDER_PROC_OWNER_UID_UNAVAILABLE")
  const native = await realpath(join(payload, "bin/orchestra"))
  const nativeDigest = sha256(await readFile(native))
  const supervisor = await realpath(join(payload, "bin/hugr-omni-supervisor"))
  const digest = sha256(await readFile(supervisor))
  const observed: Array<{ native: Identity; supervisor: Identity; shell: Identity; digest: string; nativeDigest: string }> = []
  const state = { stopped: false }
  const control = await identity(process.pid)
  expect(control?.pid).toBe(process.pid)
  expect(control?.executable).toBe(await realpath(process.execPath))
  expect(daemon.executable).toBe(native)
  expect((await identity(daemon.pid))?.start).toBe(daemon.start)
  const scan = (async () => {
    while (!state.stopped) {
      const pids = (await readdir("/proc")).filter((name) => /^\d+$/.test(name)).map(Number)
      // Other users' processes (including root-owned Docker daemon) are outside
      // this observer's reach. Do not turn their ptrace restrictions into a miss
      // on our own readable chain; unexpected failures on owned-user PIDs fail.
      const rows = (await Promise.all(pids.map(async (pid) => {
        const status = await readFile(`/proc/${pid}/status`, "utf8").catch((error: unknown) => {
          if (error && typeof error === "object" && "code" in error && ["ENOENT", "ESRCH"].includes(String(error.code))) return undefined
          throw error
        })
        if (status === undefined) return
        const uid = /^Uid:\s+(\d+)/m.exec(status)?.[1]
        if (!uid) throw new Error("PROVIDER_PROC_UID_INVALID")
        if (Number(uid) !== ownerUID) return
        return identity(pid)
      }))).filter((row): row is Identity => row !== undefined)
      const byPID = new Map(rows.map((row) => [row.pid, row]))
      for (const shell of rows.filter((row) => row.argv.includes(command) && row.cwd === cwd)) {
        const parent = byPID.get(shell.parent)
        if (parent?.executable !== supervisor) continue
        const cli = byPID.get(parent.parent)
        if (cli?.executable !== native || cli.pid !== daemon.pid || cli.start !== daemon.start) continue
        if (observed.some((row) => row.supervisor.pid === parent.pid && row.supervisor.start === parent.start)) continue
        const env = await readFile(`/proc/${cli.pid}/environ`, "utf8").catch((error: unknown) => {
          if (error && typeof error === "object" && "code" in error && ["ENOENT", "ESRCH"].includes(String(error.code))) return ""
          throw error
        })
        if (!env.split("\0").includes(`ORCHESTRA_DB=${database}`)) continue
        expect(env.split("\0")).toContain("ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict")
        expect(env.split("\0").filter((entry) => /^HUGR_OMNI_/i.test(entry))).toEqual([])
        expect(sha256(await readFile(`/proc/${parent.pid}/exe`))).toBe(digest)
        expect(sha256(await readFile(`/proc/${cli.pid}/exe`))).toBe(nativeDigest)
        observed.push({ native: cli, supervisor: parent, shell, digest, nativeDigest })
      }
      await Bun.sleep(20)
    }
  })()
  // Attach immediately: a proc permission/read failure must not become an unhandled
  // rejection while provider inference is still in flight.
  const result = scan.then(() => ({ error: undefined }), (error: unknown) => ({ error }))
  return {
    async stop(required: boolean) {
      state.stopped = true
      const failure = (await result).error
      if (failure) throw failure
      if (required && observed.length === 0) throw new Error("INSTALLED_SUPERVISOR_TOOL_CHAIN_UNOBSERVED")
      // Daemon/supervisor intentionally stay live here. Public authenticated
      // service stop below owns teardown, then checks every captured identity.
      return observed
    },
  }
}

export async function requireExited(identities: readonly Identity[]) {
  const deadline = Date.now() + 15_000
  while (true) {
    const live = (await Promise.all(identities.map(async (old) => {
      const current = await identity(old.pid)
      return current?.start === old.start ? current : undefined
    }))).filter((row): row is Identity => row !== undefined)
    if (live.length === 0) return
    if (Date.now() >= deadline) throw new Error(`INSTALLED_TOOL_CHAIN_SURVIVED: ${JSON.stringify(live)}`)
    await Bun.sleep(100)
  }
}
