import { expect } from "bun:test"
import { chmod, lstat, mkdir, readFile, readdir, readlink, rename, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { verifyDistribution } from "../../script/distribution-payload"
import { sha256, snapshot } from "./distribution-native"

type AurEntry = { kind: string; mode: number; sha256?: string; link?: string }

// Unlike the shared payload snapshot, this checks exact modes and symlink text,
// and includes empty directories. Only ENOENT denotes an absent tree.
export async function aurInventory(directory: string) {
  const entries = new Map<string, AurEntry>()
  const root = await lstat(directory).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })
  if (!root) return undefined
  const visit = async (path: string, relative: string): Promise<void> => {
    const stat = await lstat(path)
    const mode = stat.mode & 0o7777
    if (stat.isSymbolicLink()) {
      entries.set(relative, { kind: "symlink", mode, link: await readlink(path) })
      return
    }
    if (stat.isFile()) {
      expect(stat.nlink, `AUR_HARDLINK_REFUSED: ${relative}`).toBe(1)
      expect(stat.size, `AUR_EMPTY_FILE_REFUSED: ${relative}`).toBeGreaterThan(0)
      entries.set(relative, { kind: "file", mode, sha256: sha256(await readFile(path)) })
      return
    }
    if (!stat.isDirectory()) throw new Error(`AUR_SPECIAL_FILE_REFUSED: ${relative}`)
    entries.set(relative, { kind: "directory", mode })
    for (const name of (await readdir(path)).sort())
      await visit(join(path, name), relative ? `${relative}/${name}` : name)
  }
  await visit(directory, "")
  return entries
}

export type AurPayload = {
  version: string
  payload: string
  archive: { file: string; sha256: string }
  manifest: Awaited<ReturnType<typeof verifyDistribution>>
}

export async function aurPayload(directory: string, expected: AurPayload) {
  expect(await verifyDistribution(directory, { version: expected.version, target: expected.manifest.target }))
    .toEqual(expected.manifest)
  expect(await snapshot(directory), "AUR_FULL_PAYLOAD_BYTES_OR_INVENTORY_CHANGED")
    .toEqual(await snapshot(expected.payload))
  const actual = await aurInventory(directory)
  if (!actual || actual.size === 0) throw new Error("AUR_PAYLOAD_INVENTORY_EMPTY")
  expect(actual, "AUR_FULL_PAYLOAD_MODES_OR_INVENTORY_CHANGED").toEqual(await aurExpectedPayload(expected))
}

// Producer-owned private directories are 0700. Packaging creates 0755 directories
// and restores descriptor file modes; producer permissions are not package modes.
export async function aurExpectedPayload(payload: AurPayload) {
  if (!payload.manifest.files.length) throw new Error("AUR_EXPECTED_PAYLOAD_EMPTY")
  const entries = new Map<string, AurEntry>([["", { kind: "directory", mode: 0o755 }]])
  for (const file of payload.manifest.files) {
    entries.set(file.path, { kind: "file", mode: file.executable ? 0o755 : 0o644, sha256: file.sha256 })
    const parts = file.path.split("/")
    parts.slice(0, -1).forEach((_, index) => {
      entries.set(parts.slice(0, index + 1).join("/"), { kind: "directory", mode: 0o755 })
    })
  }
  for (const path of ["distribution.json", "checksums.sha256"])
    entries.set(path, { kind: "file", mode: 0o644, sha256: sha256(await readFile(join(payload.payload, path))) })
  return entries
}

// This consumes the FINAL makepkg archive after its real tidy pipeline, not pkg/.
export async function aurFinalPackage(extracted: string, payload: AurPayload, recipe: string) {
  await aurPayload(join(extracted, "usr/lib/orchestra"), payload)
  const intended = await aurExpectedPayload(payload)
  const actual = await aurInventory(extracted)
  if (!actual || actual.size === 0) throw new Error("AUR_FINAL_PACKAGE_INVENTORY_EMPTY")
  for (const metadata of [".PKGINFO", ".BUILDINFO", ".MTREE"]) {
    expect(actual.get(metadata), `AUR_PACKAGE_METADATA_REQUIRED: ${metadata}`)
      .toMatchObject({ kind: "file", mode: 0o644 })
    actual.delete(metadata)
  }
  const expected = new Map<string, AurEntry>([
    ...["", "usr", "usr/bin", "usr/lib"].map((path) => [path, { kind: "directory", mode: 0o755 }] as const),
    ...[...intended].map(([path, entry]) => [`usr/lib/orchestra${path ? `/${path}` : ""}`, entry] as const),
    ["usr/bin/orchestra", { kind: "symlink", mode: 0o777, link: "/usr/lib/orchestra/bin/orchestra" }] as const,
  ])
  expect(actual, "AUR_FINAL_PACKAGE_FULL_INVENTORY_BYTES_MODES_LINK").toEqual(expected)
  const info = await readFile(join(extracted, ".PKGINFO"), "utf8")
  expect(info.split("\n")).toContain("pkgname = orchestra-bin")
  expect(info.split("\n")).toContain(`pkgver = ${payload.version}-1`)
  expect(info.split("\n")).toContain(`arch = ${process.arch === "x64" ? "x86_64" : "aarch64"}`)
  const build = (await readFile(join(extracted, ".BUILDINFO"), "utf8")).split("\n")
  expect(build, "AUR_MAKEPKG_MUST_IDENTIFY_EXACT_PRODUCTION_RECIPE")
    .toContain(`pkgbuild_sha256sum = ${sha256(recipe)}`)
  // Frozen advertised options; the final archive records makepkg's effective
  // configuration as well as proving preservation of every shipped file.
  for (const option of ["!strip", "!debug", "!lto", "libtool", "staticlibs", "!purge", "docs", "!zipman", "emptydirs"])
    expect(build, `AUR_MAKEPKG_EFFECTIVE_OPTION_REQUIRED: ${option}`).toContain(`options = ${option}`)
}

// Calibrate the real final-package oracle on the first real archive. Every
// planted class must fail, then the restored archive must pass again.
export async function aurInventoryTeeth(extracted: string, payload: AurPayload, recipe: string) {
  const file = join(extracted, "usr/lib/orchestra/package.json")
  const bytes = await readFile(file)
  const mode = (await lstat(file)).mode & 0o7777
  const check = () => aurFinalPackage(extracted, payload, recipe)
  try {
    await Bun.write(file, "tampered package bytes\n")
    await expect(check(), "AUR_INVENTORY_BYTE_MUTATION_MUST_FAIL").rejects.toThrow()
  } finally { await Bun.write(file, bytes); await chmod(file, mode) }
  try {
    await chmod(file, 0o755)
    await expect(check(), "AUR_INVENTORY_MODE_MUTATION_MUST_FAIL").rejects.toThrow()
  } finally { await chmod(file, mode) }
  try {
    await chmod(file, 0o640)
    expect(await verifyDistribution(join(extracted, "usr/lib/orchestra"), {
      version: payload.version, target: payload.manifest.target,
    }), "AUR_NONEXECUTABLE_MODE_CONTROL_MUST_PASS_DESCRIPTOR_EXECUTE_GUARD").toEqual(payload.manifest)
    await expect(check(), "AUR_INVENTORY_NONEXECUTABLE_MODE_MUTATION_MUST_FAIL").rejects.toThrow()
  } finally { await chmod(file, mode) }
  const retained = join(extracted, "../oracle-retained-package.json")
  try {
    await rename(file, retained)
    await expect(check(), "AUR_INVENTORY_MISSING_FILE_MUST_FAIL").rejects.toThrow()
  } finally { await rename(retained, file) }
  const extra = join(extracted, "usr/lib/orchestra/unexpected-file")
  try {
    await Bun.write(extra, "unshipped file\n")
    await expect(check(), "AUR_INVENTORY_EXTRA_FILE_MUST_FAIL").rejects.toThrow()
  } finally { await rm(extra) }
  const empty = join(extracted, "usr/lib/orchestra/empty-extra")
  try {
    await mkdir(empty)
    await expect(check(), "AUR_INVENTORY_EMPTY_DIRECTORY_MUST_FAIL").rejects.toThrow()
  } finally { await rm(empty, { recursive: true }) }
  const launcher = join(extracted, "usr/bin/orchestra")
  try {
    await rm(launcher)
    await symlink("/usr/lib/orchestra/bin/wrong", launcher)
    await expect(check(), "AUR_INVENTORY_WRONG_LINK_MUST_FAIL").rejects.toThrow()
  } finally { await rm(launcher); await symlink("/usr/lib/orchestra/bin/orchestra", launcher) }
  const metadata = join(extracted, ".PKGINFO")
  const stored = join(extracted, "../oracle-retained-PKGINFO")
  try {
    await rename(metadata, stored)
    await expect(check(), "AUR_INVENTORY_MISSING_PACKAGE_METADATA_MUST_FAIL").rejects.toThrow()
  } finally { await rename(stored, metadata) }
  await check()
  console.info("AUR final-package oracle controls: bytes/executable-mode/nonexecutable-mode/missing/extra/empty-directory/link/metadata rejected; restored archive accepted")
}
