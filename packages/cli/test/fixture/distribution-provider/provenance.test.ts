import { expect, test } from "bun:test"
import { requireAddonMappings, requireExecutableStat } from "../distribution-provider-provenance"

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
