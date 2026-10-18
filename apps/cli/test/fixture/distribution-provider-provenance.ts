export type ImageFile = { path: string; dev: string; ino: string; size: string; mode: string; mtime: string; ctime: string }
export type ProcessBirth = { pid: number; parent: number; start: string }
export const procObservationScope = "visible /proc/stat parent/birth census; scanner identities only exact daemon PID/birth descendants"

export function parseProcessStat(pid: number, text: string): ProcessBirth {
  const close = text.lastIndexOf(")")
  const fields = text.slice(close + 2).trim().split(/\s+/)
  if (!text.startsWith(`${pid} (`) || close < text.indexOf("(") || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[19]) ||
      !Number.isSafeInteger(Number(fields[1]))) throw new Error("PROVIDER_PROC_STAT_INVALID")
  return { pid, parent: Number(fields[1]), start: fields[19] }
}

export function ownedProcessCensus(daemon: ProcessBirth, census: readonly ProcessBirth[]) {
  const byPID = new Map(census.map((row) => [row.pid, row]))
  if (byPID.size !== census.length) throw new Error("PROVIDER_PROC_CENSUS_PID_AMBIGUOUS")
  const root = byPID.get(daemon.pid)
  if (!root || root.start !== daemon.start) throw new Error(`PROVIDER_PROC_DAEMON_BIRTH_MISMATCH: ${daemon.pid}/${daemon.start}; ${procObservationScope}`)
  const owned = [root]
  for (const parent of owned) {
    for (const child of census.filter((row) => row.parent === parent.pid)) {
      if (owned.some((row) => row.pid === child.pid)) throw new Error("PROVIDER_PROC_ANCESTRY_CYCLE")
      if (BigInt(child.start) < BigInt(parent.start)) throw new Error("PROVIDER_PROC_ANCESTRY_BIRTH_MISMATCH")
      owned.push(child)
    }
  }
  return owned
}

export async function readOwnedProcesses<T extends ProcessBirth>(daemon: ProcessBirth, census: readonly ProcessBirth[], read: (pid: number) => Promise<T | undefined>) {
  return (await Promise.all(ownedProcessCensus(daemon, census).map(async (row) => {
    const current = await read(row.pid).catch((cause: unknown) => {
      throw new Error(`PROVIDER_OWNED_PROC_READ_FAILED: daemon=${daemon.pid}/${daemon.start} pid=${row.pid}; ${String(cause)}`, { cause })
    })
    if (!current && row.pid !== daemon.pid) return // A descendant may exit between census and identity.
    if (!current || current.pid !== row.pid || current.start !== row.start || current.parent !== row.parent)
      throw new Error(`PROVIDER_PROC_OWNED_BIRTH_OR_ANCESTRY_CHANGED: ${row.pid}/${row.start}`)
    return current
  }))).filter((row): row is Awaited<T> => row !== undefined)
}

export async function withProviderCleanup<T>(work: () => Promise<T>, cleanup: readonly (() => Promise<unknown>)[]) {
  const outcome = await Promise.resolve().then(work).then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
  const errors: unknown[] = outcome.ok ? [] : [outcome.error]
  for (const action of cleanup) await Promise.resolve().then(action).catch((error: unknown) => { errors.push(error) })
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors,
    `PROVIDER_PROOF_CLEANUP_FAILED: ${errors.map((error) => error instanceof Error ? error.message : String(error)).join("; ")}`)
  if (!outcome.ok) throw outcome.error
  return outcome.value
}

// Pure validation of kernel observations. Acquisition, PID-birth checks around
// the entire observation, hashes and public authenticated cleanup stay owned by
// distribution-provider-process/daemon, rather than being simulated here.
export function requireAddonMappings(text: string, expected: ImageFile) {
  const rows = text.trim().split("\n").map((line) => {
    const match = /^([a-f0-9]+)-([a-f0-9]+) ([rwxps-]{4}) ([a-f0-9]+) ([a-f0-9]+):([a-f0-9]+) (\d+)\s*(.*)$/.exec(line)
    if (!match) throw new Error("PROVIDER_PROC_MAPS_ROW_INVALID")
    return { start: match[1], end: match[2], flags: match[3], offset: match[4], major: match[5], minor: match[6], ino: match[7], path: match[8] }
  }).filter((row) => row.path.includes("hugr_omni.node"))
  if (!rows.length) throw new Error("PROVIDER_INSTALLED_ADDON_MAPPING_MISSING")
  const device = BigInt(expected.dev)
  const major = (device >> 8n & 0xfffn) | (device >> 32n & 0xfffff000n)
  const minor = (device & 0xffn) | (device >> 12n & 0xffffff00n)
  for (const row of rows) {
    if (row.path.endsWith(" (deleted)")) throw new Error("PROVIDER_INSTALLED_ADDON_MAPPING_DELETED")
    if (row.path !== expected.path || BigInt(row.ino) !== BigInt(expected.ino) ||
        BigInt(`0x${row.major}`) !== major || BigInt(`0x${row.minor}`) !== minor)
      throw new Error("PROVIDER_INSTALLED_ADDON_MAPPING_IDENTITY_MISMATCH")
  }
  if (!rows.some((row) => row.flags.includes("x"))) throw new Error("PROVIDER_INSTALLED_ADDON_MAPPING_NOT_EXECUTABLE")
  return rows
}

export function requireExecutableStat(link: string, opened: ImageFile & { regular: boolean }, expected: ImageFile) {
  if (link.endsWith(" (deleted)")) throw new Error("PROVIDER_INSTALLED_EXECUTABLE_DELETED")
  if (link !== expected.path || opened.dev !== expected.dev || opened.ino !== expected.ino || opened.size !== expected.size ||
      opened.mode !== expected.mode || opened.mtime !== expected.mtime || opened.ctime !== expected.ctime || !opened.regular)
    throw new Error("PROVIDER_INSTALLED_EXECUTABLE_IDENTITY_MISMATCH")
}
