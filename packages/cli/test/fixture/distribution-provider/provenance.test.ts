import { expect, test } from "bun:test"
import { ownedProcessCensus, parseProcessStat, readOwnedProcesses, requireAddonMappings, requireExecutableStat, withProviderCleanup } from "../distribution-provider-provenance"

const daemon = { pid: 100, parent: 1, start: "200" }
const child = { pid: 101, parent: 100, start: "210" }
const shell = { pid: 102, parent: 101, start: "220" }
const opaque = { pid: 1037, parent: 1, start: "100" }
const census = [opaque, shell, daemon, child]

test("kernel stat parser shares parent and birth parsing despite nested command parentheses", () => {
  const text = `100 (serve (worker)) S 1 ${Array(17).fill("0").join(" ")} 200 0`
  expect(parseProcessStat(100, text)).toEqual(daemon)
  for (const changed of ["bad stat", text.replace("100 (", "999 ("), text.replace(" 200 0", " broken 0")])
    expect(() => parseProcessStat(100, changed)).toThrow("PROVIDER_PROC_STAT_INVALID")
})

test("ownership census excludes unrelated opaque PID before any identity read", async () => {
  const read: number[] = []
  const identities = await readOwnedProcesses(daemon, census, async (pid) => {
    read.push(pid)
    if (pid === opaque.pid) throw new Error("EACCES: permission denied, readlink '/proc/1037/cwd'")
    return census.find((row) => row.pid === pid)
  })
  expect(read).toEqual([100, 101, 102])
  expect(identities).toEqual([daemon, child, shell])
})

test("owned child permission failures and identity birth/ancestry drift remain hard failures", async () => {
  await expect(readOwnedProcesses(daemon, census, async (pid) => {
    if (pid === child.pid) throw new Error("EACCES: owned cwd")
    return census.find((row) => row.pid === pid)
  })).rejects.toThrow("PROVIDER_OWNED_PROC_READ_FAILED: daemon=100/200 pid=101; Error: EACCES: owned cwd")
  for (const changed of [{ ...child, start: "999" }, { ...child, parent: 1 }, { ...child, pid: 999 }])
    await expect(readOwnedProcesses(daemon, census, async (pid) => pid === child.pid ? changed : census.find((row) => row.pid === pid)))
      .rejects.toThrow("PROVIDER_PROC_OWNED_BIRTH_OR_ANCESTRY_CHANGED")
  await expect(readOwnedProcesses(daemon, census, async () => undefined)).rejects.toThrow("PROVIDER_PROC_OWNED_BIRTH_OR_ANCESTRY_CHANGED")
})

test("missing/reused daemon, impossible birth ancestry, duplicate PIDs and owned cycles refuse", () => {
  for (const changed of [[], [child], [{ ...daemon, start: "999" }, child]])
    expect(() => ownedProcessCensus(daemon, changed)).toThrow("PROVIDER_PROC_DAEMON_BIRTH_MISMATCH")
  expect(() => ownedProcessCensus(daemon, [daemon, { ...child, start: "100" }])).toThrow("PROVIDER_PROC_ANCESTRY_BIRTH_MISMATCH")
  expect(() => ownedProcessCensus(daemon, [daemon, daemon])).toThrow("PROVIDER_PROC_CENSUS_PID_AMBIGUOUS")
  expect(() => ownedProcessCensus(daemon, [{ ...daemon, parent: child.pid }, child])).toThrow("PROVIDER_PROC_ANCESTRY_CYCLE")
  expect(ownedProcessCensus(daemon, [daemon, { pid: 900, parent: 901, start: "1" }, { pid: 901, parent: 900, start: "1" }])).toEqual([daemon])
})

test("cleanup preserves primary error plus every failure and still runs all teardown", async () => {
  const primary = new Error("http.body cannot overlay protocol-owned field(s): temperature, max_tokens")
  const monitor = new Error("EACCES: permission denied, readlink '/proc/1037/cwd'")
  const restore = new Error("restore failed")
  const steps: string[] = []
  const error = await withProviderCleanup(async () => { throw primary }, [
    async () => { steps.push("monitor"); throw monitor }, async () => { steps.push("daemon") },
    async () => { steps.push("restore"); throw restore }, async () => { steps.push("chmod") },
  ]).catch((error: unknown) => error)
  expect(steps).toEqual(["monitor", "daemon", "restore", "chmod"])
  expect(error).toBeInstanceOf(AggregateError)
  if (!(error instanceof AggregateError)) throw new Error("AGGREGATE_MISSING")
  expect(error.errors).toEqual([primary, monitor, restore])
  expect(error.message).toContain(primary.message)
  expect(error.message).toContain(monitor.message)
  expect(await withProviderCleanup(async () => { throw primary }, []).catch((error: unknown) => error)).toBe(primary)
  expect(await withProviderCleanup(async () => "ok", [async () => { steps.push("done") }])).toBe("ok")
})

const file = { path: "/owned/npm/bin/hugr_omni.node", dev: "2049", ino: "123", size: "100", mode: "33261", mtime: "1", ctime: "2" }
const maps = `1000-2000 r--p 00000000 08:01 123 ${file.path}\n2000-3000 r-xp 00001000 08:01 123 ${file.path}\n`

test("installed addon requires exact canonical path plus mapped device/inode and executable segment", () => {
  expect(requireAddonMappings(maps, file).map((row) => row.flags)).toEqual(["r--p", "r-xp"])
  for (const changed of [maps.replaceAll(file.path, "/checkout/bin/hugr_omni.node"), maps.replaceAll("08:01", "08:02"),
    maps.replaceAll("123 ", "124 ")]) {
    expect(() => requireAddonMappings(changed, file)).toThrow(new Error("PROVIDER_INSTALLED_ADDON_MAPPING_IDENTITY_MISMATCH"))
  }
  expect(() => requireAddonMappings(maps.replaceAll(file.path, `${file.path} (deleted)`), file))
    .toThrow(new Error("PROVIDER_INSTALLED_ADDON_MAPPING_DELETED"))
  expect(() => requireAddonMappings(maps.replace("r-xp", "r--p"), file))
    .toThrow(new Error("PROVIDER_INSTALLED_ADDON_MAPPING_NOT_EXECUTABLE"))
})

test("empty, malformed and addon-free maps cannot pass vacuously", () => {
  expect(() => requireAddonMappings("", file)).toThrow(new Error("PROVIDER_PROC_MAPS_ROW_INVALID"))
  expect(() => requireAddonMappings("unparsed map", file)).toThrow(new Error("PROVIDER_PROC_MAPS_ROW_INVALID"))
  expect(() => requireAddonMappings("1000-2000 r-xp 00000000 08:01 123 /other/lib.so", file))
    .toThrow(new Error("PROVIDER_INSTALLED_ADDON_MAPPING_MISSING"))
})

test("installed executable rejects deleted, switched inode/device, stat drift or nonregular image", () => {
  const opened = { ...file, regular: true }
  expect(() => requireExecutableStat(file.path, opened, file)).not.toThrow()
  expect(() => requireExecutableStat(`${file.path} (deleted)`, opened, file)).toThrow(new Error("PROVIDER_INSTALLED_EXECUTABLE_DELETED"))
  expect(() => requireExecutableStat("/same-basename/hugr_omni.node", opened, file)).toThrow(new Error("PROVIDER_INSTALLED_EXECUTABLE_IDENTITY_MISMATCH"))
  for (const key of ["dev", "ino", "size", "mode", "mtime", "ctime"] as const) {
    expect(() => requireExecutableStat(file.path, { ...opened, [key]: "wrong" }, file))
      .toThrow(new Error("PROVIDER_INSTALLED_EXECUTABLE_IDENTITY_MISMATCH"))
  }
  expect(() => requireExecutableStat(file.path, { ...opened, regular: false }, file))
    .toThrow(new Error("PROVIDER_INSTALLED_EXECUTABLE_IDENTITY_MISMATCH"))
})
