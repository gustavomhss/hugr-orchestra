import { expect } from "bun:test"
import { lstat, readFile, readdir, readlink } from "node:fs/promises"
import { join } from "node:path"
import { verifyDistribution } from "../../script/distribution-payload"
import { sha256, snapshot } from "./distribution-native"

// Unlike the shared payload snapshot, this checks exact modes and symlink text,
// and includes empty directories. Only ENOENT denotes an absent tree.
export async function aurInventory(directory: string) {
  const entries = new Map<string, { kind: string; mode: number; sha256?: string; link?: string }>()
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
  const original = await aurInventory(expected.payload)
  if (!actual || !original || original.size === 0) throw new Error("AUR_PAYLOAD_INVENTORY_EMPTY")
  expect(actual, "AUR_FULL_PAYLOAD_MODES_OR_INVENTORY_CHANGED").toEqual(original)
  for (const file of expected.manifest.files)
    expect(actual.get(file.path)?.mode, `AUR_PAYLOAD_MODE: ${file.path}`).toBe(file.executable ? 0o755 : 0o644)
  for (const path of ["distribution.json", "checksums.sha256"]) expect(actual.get(path)?.mode).toBe(0o644)
}

// This consumes the FINAL makepkg archive after its real tidy pipeline, not pkg/.
export async function aurFinalPackage(extracted: string, payload: AurPayload) {
  await aurPayload(join(extracted, "usr/lib/orchestra"), payload)
  const original = await aurInventory(payload.payload)
  const actual = await aurInventory(extracted)
  if (!original || !actual || actual.size === 0) throw new Error("AUR_FINAL_PACKAGE_INVENTORY_EMPTY")
  for (const metadata of [".PKGINFO", ".BUILDINFO", ".MTREE"]) {
    expect(actual.get(metadata), `AUR_PACKAGE_METADATA_REQUIRED: ${metadata}`)
      .toMatchObject({ kind: "file", mode: 0o644 })
    actual.delete(metadata)
  }
  const expected = new Map([
    ...["", "usr", "usr/bin", "usr/lib"].map((path) => [path, { kind: "directory", mode: 0o755 }] as const),
    ...[...original].map(([path, entry]) => [`usr/lib/orchestra${path ? `/${path}` : ""}`, entry] as const),
    ["usr/bin/orchestra", { kind: "symlink", mode: 0o777, link: "/usr/lib/orchestra/bin/orchestra" }] as const,
  ])
  expect(actual, "AUR_FINAL_PACKAGE_FULL_INVENTORY_BYTES_MODES_LINK").toEqual(expected)
  const info = await readFile(join(extracted, ".PKGINFO"), "utf8")
  expect(info.split("\n")).toContain("pkgname = orchestra-bin")
  expect(info.split("\n")).toContain(`pkgver = ${payload.version}-1`)
  expect(info.split("\n")).toContain(`arch = ${process.arch === "x64" ? "x86_64" : "aarch64"}`)
}
