import { expect } from "bun:test"
import { readFile, readdir, readlink, realpath } from "node:fs/promises"
import { join } from "node:path"
import { sha256 } from "./distribution-native"

type Identity = { pid: number; parent: number; start: string; executable: string; cwd: string; argv: string[] }

async function identity(pid: number): Promise<Identity | undefined> {
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
export async function observeInstalledTool(payload: string, database: string, cwd: string, command: string) {
  const native = await realpath(join(payload, "bin/orchestra"))
  const supervisor = await realpath(join(payload, "bin/hugr-omni-supervisor"))
  const digest = sha256(await readFile(supervisor))
  const observed: Array<{ native: Identity; supervisor: Identity; shell: Identity; digest: string }> = []
  const state = { stopped: false }
  const control = await identity(process.pid)
  expect(control?.pid).toBe(process.pid)
  expect(control?.executable).toBe(await realpath(process.execPath))
  const scan = (async () => {
    while (!state.stopped) {
      const pids = (await readdir("/proc")).filter((name) => /^\d+$/.test(name)).map(Number)
      const rows = (await Promise.all(pids.map(identity))).filter((row): row is Identity => row !== undefined)
      const byPID = new Map(rows.map((row) => [row.pid, row]))
      for (const shell of rows.filter((row) => row.argv.includes(command) && row.cwd === cwd)) {
        const parent = byPID.get(shell.parent)
        if (parent?.executable !== supervisor) continue
        const cli = byPID.get(parent.parent)
        if (cli?.executable !== native) continue
        const env = await readFile(`/proc/${cli.pid}/environ`, "utf8").catch((error: unknown) => {
          if (error && typeof error === "object" && "code" in error && ["ENOENT", "ESRCH"].includes(String(error.code))) return ""
          throw error
        })
        if (!env.split("\0").includes(`ORCHESTRA_DB=${database}`)) continue
        expect(sha256(await readFile(`/proc/${parent.pid}/exe`))).toBe(digest)
        if (!observed.some((row) => row.supervisor.pid === parent.pid && row.supervisor.start === parent.start))
          observed.push({ native: cli, supervisor: parent, shell, digest })
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
      // No raw-PID signaling: command scope owns cleanup. Confirm captured identities
      // exited; a recycled PID is not the same process.
      const deadline = Date.now() + 10_000
      while (true) {
        const live = (await Promise.all(observed.flatMap((row) => [row.native, row.supervisor, row.shell])
          .map(async (old) => {
            const current = await identity(old.pid)
            return current?.start === old.start ? current : undefined
          }))).filter((row): row is Identity => row !== undefined)
        if (live.length === 0) return observed
        if (Date.now() >= deadline) throw new Error(`INSTALLED_TOOL_CHAIN_SURVIVED: ${JSON.stringify(live)}`)
        await Bun.sleep(100)
      }
    },
  }
}
