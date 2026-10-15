export type ImageFile = { path: string; dev: string; ino: string; size: string; mode: string; mtime: string; ctime: string }

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
