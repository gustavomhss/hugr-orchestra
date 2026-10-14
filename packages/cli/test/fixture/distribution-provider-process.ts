import { expect } from "bun:test"
import { lstat, readFile, readdir, readlink, realpath, stat } from "node:fs/promises"
import { join } from "node:path"
import { sha256 } from "./distribution-native"
import { parseProcessStat, procObservationScope, readOwnedProcesses, requireAddonMappings, requireExecutableStat } from "./distribution-provider-provenance"

type Identity = { pid: number; parent: number; start: string; executable: string; cwd: string; argv: string[] }

async function fileIdentity(file: string) {
  const info = await lstat(file, { bigint: true })
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) throw new Error("PROVIDER_INSTALLED_IMAGE_NOT_REGULAR")
  return { path: await realpath(file), dev: info.dev.toString(), ino: info.ino.toString(), size: info.size.toString(),
    mode: info.mode.toString(), mtime: info.mtimeNs.toString(), ctime: info.ctimeNs.toString() }
}

export async function installedAddon(payload: string, process: Identity) {
  const before = await identity(process.pid)
  if (!before || before.start !== process.start) throw new Error("PROVIDER_ADDON_PID_BIRTH_MISMATCH")
  const file = join(await realpath(payload), "bin/hugr_omni.node")
  const expected = await fileIdentity(file)
  const rows = requireAddonMappings(await readFile(`/proc/${process.pid}/maps`, "utf8"), expected)
  const afterFile = await fileIdentity(file)
  if (JSON.stringify(afterFile) !== JSON.stringify(expected)) throw new Error("PROVIDER_INSTALLED_ADDON_STAT_CHANGED")
  const after = await identity(process.pid)
  if (!after || after.start !== before.start || after.executable !== before.executable) throw new Error("PROVIDER_ADDON_PID_CHANGED_DURING_OBSERVATION")
  return { process: after, file: expected, mappings: rows }
}

async function installedExecutable(file: string, process: Identity) {
  const before = await identity(process.pid)
  if (!before || before.start !== process.start) throw new Error("PROVIDER_IMAGE_PID_BIRTH_MISMATCH")
  const expected = await fileIdentity(file)
  const link = await readlink(`/proc/${process.pid}/exe`)
  const opened = await stat(`/proc/${process.pid}/exe`, { bigint: true })
  requireExecutableStat(link, { path: link, dev: opened.dev.toString(), ino: opened.ino.toString(), size: opened.size.toString(),
    mode: opened.mode.toString(), mtime: opened.mtimeNs.toString(), ctime: opened.ctimeNs.toString(), regular: opened.isFile() }, expected)
  const digest = sha256(await readFile(`/proc/${process.pid}/exe`))
  const afterFile = await fileIdentity(file)
  const after = await identity(process.pid)
  if (JSON.stringify(afterFile) !== JSON.stringify(expected) || !after || after.start !== before.start || after.executable !== link)
    throw new Error("PROVIDER_EXECUTABLE_CHANGED_DURING_OBSERVATION")
  return { process: after, file: expected, sha256: digest }
}

export async function identity(pid: number): Promise<Identity | undefined> {
  return Promise.all([
    readFile(`/proc/${pid}/stat`, "utf8"), readlink(`/proc/${pid}/exe`), readlink(`/proc/${pid}/cwd`),
    readFile(`/proc/${pid}/cmdline`, "utf8"),
  ]).then(([stat, executable, cwd, argv]) => {
    return { ...parseProcessStat(pid, stat), executable, cwd, argv: argv.split("\0").filter(Boolean) }
  }).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && ["ENOENT", "ESRCH"].includes(String(error.code))) return undefined
    throw error
  })
}

// Observe installed supervisor -> shell, plus supervisor's installed native CLI
// parent and isolated DB environment. Host harness's supervisor cannot satisfy it.
export async function observeInstalledTool(payload: string, database: string, cwd: string, command: string, daemon: Identity) {
  const native = await realpath(join(payload, "bin/orchestra"))
  const nativeDigest = sha256(await readFile(native))
  const supervisor = await realpath(join(payload, "bin/hugr-omni-supervisor"))
  const digest = sha256(await readFile(supervisor))
  const observed: Array<{ scope: string; native: Identity; supervisor: Identity; shell: Identity; digest: string; nativeDigest: string;
    addon: Awaited<ReturnType<typeof installedAddon>>; supervisorImage: Awaited<ReturnType<typeof installedExecutable>> }> = []
  const state = { stopped: false }
  const control = await identity(process.pid)
  expect(control?.pid).toBe(process.pid)
  expect(control?.executable).toBe(await realpath(process.execPath))
  expect(daemon.executable).toBe(native)
  expect((await identity(daemon.pid))?.start).toBe(daemon.start)
  const scan = (async () => {
    while (!state.stopped) {
      const pids = (await readdir("/proc")).filter((name) => /^\d+$/.test(name)).map(Number)
      // UID is not ownership. Census lightweight kernel ancestry first; ptrace-
      // restricted exe/cwd/maps are read only after exact daemon ancestry is proven.
      const census = (await Promise.all(pids.map(async (pid) => {
        const text = await readFile(`/proc/${pid}/stat`, "utf8").catch((error: unknown) => {
          if (error && typeof error === "object" && "code" in error && ["ENOENT", "ESRCH"].includes(String(error.code))) return undefined
          throw new Error(`PROVIDER_PROC_CENSUS_READ_FAILED: daemon=${daemon.pid}/${daemon.start} pid=${pid}; ${procObservationScope}; ${String(error)}`, { cause: error })
        })
        return text === undefined ? undefined : parseProcessStat(pid, text)
      }))).filter((row): row is ReturnType<typeof parseProcessStat> => row !== undefined)
      const rows = await readOwnedProcesses(daemon, census, identity)
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
        const addon = await installedAddon(payload, cli)
        const supervisorImage = await installedExecutable(supervisor, parent)
        const nativeImage = await installedExecutable(native, cli)
        expect(supervisorImage.sha256).toBe(digest)
        expect(nativeImage.sha256).toBe(nativeDigest)
        if ((await identity(cli.pid))?.start !== cli.start || (await identity(parent.pid))?.start !== parent.start ||
            (await identity(shell.pid))?.start !== shell.start) throw new Error("PROVIDER_TOOL_CHAIN_BIRTH_CHANGED_DURING_OBSERVATION")
        observed.push({ scope: procObservationScope, native: cli, supervisor: parent, shell, digest, nativeDigest, addon, supervisorImage })
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
