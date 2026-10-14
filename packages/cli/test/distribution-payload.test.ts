import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, link, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { prepareNpmDistribution } from "../script/distribution-npm"
import { archiveDistribution, prepareDistribution, verifyDistribution } from "../script/distribution-payload"
import { requireDistributionHost } from "./fixture/distribution-host"
import { binding, payloadFixture, payloadSnapshot, tuple } from "./fixture/distribution-payload"

requireDistributionHost()

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const fixture = (parent?: string) => payloadFixture(roots, parent)

test("complete payload retains the full bin tree, verifies and reuses exact publication", async () => {
  const value = await fixture()
  const source = await payloadSnapshot(value.source)
  const manifest = await prepareDistribution(value.input)
  expect(manifest.files).toEqual(source.filter((entry) => entry.kind === "file")
    .map((entry) => ({ path: entry.path, sha256: entry.sha256, executable: Boolean(entry.mode & 0o111) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  expect(await payloadSnapshot(value.source)).toEqual(source)
  expect(manifest.schema).toBe("orchestra-distribution-v1")
  expect(manifest.files.map((file) => file.path)).toEqual(manifest.files.map((file) => file.path).sort())
  expect(manifest.files.find((file) => file.path === "bin/extra/note.txt")).toBeDefined()
  expect(manifest.target).toBe(tuple.target)
  expect(manifest.files.filter((file) => file.executable).map((file) => file.path)).toEqual(process.platform === "win32" ? [] : [`bin/${tuple.supervisor}`, `bin/${tuple.executable}`])
  expect(await verifyDistribution(value.input.out, { version: "1.2.3", target: tuple.target })).toEqual(manifest)
  expect(await prepareDistribution(value.input)).toEqual(manifest)
  for (const file of manifest.files) {
    expect(await readFile(join(value.input.out, file.path))).toEqual(await readFile(join(value.source, file.path)))
    expect(Boolean((await lstat(join(value.source, file.path))).mode & 0o111)).toBe(file.executable)
    expect(Boolean((await lstat(join(value.input.out, file.path))).mode & 0o111)).toBe(file.executable)
  }
  const table = await readFile(join(value.input.out, "checksums.sha256"), "utf8")
  expect(table).toContain("  distribution.json\n")
  expect(table).not.toContain("  checksums.sha256\n")
})

test("npm wrapper preserves host-native executable flags and reuses exact publication", async () => {
  const value = await fixture()
  const manifest = await prepareDistribution(value.input)
  const input = { payloads: [value.input.out], out: join(value.root, "npm") }
  const result = await prepareNpmDistribution(input)
  const wrapper = join(result.wrapper, "bin", "orchestra.cjs")
  expect(Boolean((await lstat(wrapper)).mode & 0o111)).toBe(process.platform !== "win32")
  const actual = await readFile(wrapper)
  const source = await readFile(join(import.meta.dirname, "../bin/orchestra.cjs"))
  expect(actual.subarray(0, actual.indexOf(10) + 1).toString("utf8")).toBe("#!/usr/bin/env node\n")
  expect(actual.subarray(actual.indexOf(10) + 1)).toEqual(source.subarray(source.indexOf(10) + 1))
  expect(result.platforms).toEqual([tuple.target])
  expect(await prepareNpmDistribution(input)).toEqual(result)
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
})

for (const missing of ["hugr_omni.node", tuple.supervisor, `tree-sitter/tree-sitter/prebuilds/${tuple.os}-${tuple.arch}/tree-sitter.node`, "tree-sitter/tree-sitter-python/LICENSE"]) {
  test(`missing mandatory companion refuses preparation: ${missing}`, async () => {
    const value = await fixture()
    // Removing the sole core prebuild file leaves empty ancestors, which capture
    // rejects before companion validation. Remove its prebuild root instead.
    await rm(missing.endsWith("/tree-sitter.node")
      ? join(value.source, "bin/tree-sitter/tree-sitter/prebuilds")
      : join(value.source, "bin", missing), { recursive: true })
    await expect(prepareDistribution(value.input)).rejects.toThrow(`Missing distribution companion: bin/${missing}`)
    expect(await Bun.file(join(value.source, "package.json")).exists()).toBe(true)
  })
}

test("wrong version, package tuple and closed target refuse preparation", async () => {
  const value = await fixture()
  await expect(prepareDistribution({ ...value.input, version: "9.9.9" })).rejects.toThrow("tuple/version")
  await expect(prepareDistribution({ ...value.input, target: "linux-riscv64" })).rejects.toThrow("target/version")
  await writeFile(join(value.source, "package.json"), JSON.stringify({ name: "wrong", version: "1.2.3", os: [tuple.os], cpu: [tuple.arch] }))
  await expect(prepareDistribution(value.input)).rejects.toThrow("tuple/version")
  await writeFile(join(value.source, "package.json"), JSON.stringify({ name: `@orchestra/cli-${tuple.target}`, os: [tuple.os], cpu: [tuple.arch] }))
  await expect(prepareDistribution(value.input)).rejects.toThrow("tuple/version")
})

test("native headers reject wrong CPU and wrong image format", async () => {
  const value = await fixture()
  const path = join(value.source, "bin/hugr_omni.node")
  const manifest = await prepareDistribution(value.input)
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
  const out = join(value.root, "invalid-header", "prepared")
  await writeFile(path, binding(tuple.foreignMachine))
  await expect(prepareDistribution({ ...value.input, out })).rejects.toThrow("Native binding target mismatch: bin/hugr_omni.node")
  const bytes = Buffer.alloc(64)
  bytes.writeUInt32LE(0xfeedfacf)
  bytes.writeUInt32LE(tuple.machine, 4)
  await writeFile(path, tuple.os === "win32" ? binding(tuple.machine, "little", "linux") : bytes)
  await expect(prepareDistribution({ ...value.input, out })).rejects.toThrow("Native binding target mismatch: bin/hugr_omni.node")
  await expect(lstat(dirname(out))).rejects.toMatchObject({ code: "ENOENT" })
  await writeFile(path, binding())
  expect(await prepareDistribution(value.input)).toEqual(manifest)
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
})

// Linux tuple admission requires Unix executable flags; NTFS cannot qualify this target.
test.skipIf(process.platform === "win32")("POSIX producer: Linux bindings accept ELF64 little-endian and reject matching-machine big-endian (requires Unix mode storage)", async () => {
  const value = await fixture()
  const path = join(value.source, "bin/hugr_omni.node")
  const manifest = await prepareDistribution(value.input)
  expect(await readFile(join(value.input.out, "bin/hugr_omni.node"))).toEqual(binding(62, "little"))
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
  await writeFile(path, binding(62, "big"))
  const out = join(value.root, "big-endian", "prepared")
  await expect(prepareDistribution({ ...value.input, out })).rejects.toThrow("Native binding target mismatch: bin/hugr_omni.node")
  await expect(lstat(dirname(out))).rejects.toMatchObject({ code: "ENOENT" })
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
})

test("unexpected native companion refuses preparation", async () => {
  const value = await fixture()
  await writeFile(join(value.source, "bin/hugr-other.node"), binding())
  await expect(prepareDistribution(value.input)).rejects.toThrow("Unexpected omni companion")
})

for (const kind of ["symlink", "directory-link", "hardlink", "empty"] as const) {
  test(`rejects ${kind} source members`, async () => {
    const value = await fixture()
    const path = join(value.source, "bin", "bad")
    if (kind === "symlink") await symlink(tuple.executable, path)
    if (kind === "directory-link") await symlink(join(value.source, "bin", "tree-sitter"), path, process.platform === "win32" ? "junction" : "dir")
    if (kind === "hardlink") await link(join(value.source, "bin", tuple.executable), path)
    if (kind === "empty") await writeFile(path, "")
    await expect(prepareDistribution(value.input)).rejects.toThrow()
  })
}

// Backslash is a Windows separator, not a representable unsafe filename. Descriptor coverage below is portable.
test.skipIf(process.platform === "win32")("POSIX source filename: rejects literal backslash (not applicable to Windows separators)", async () => {
  const value = await fixture()
  await writeFile(join(value.source, "bin", "bad\\name"), "invalid path")
  await expect(prepareDistribution(value.input)).rejects.toThrow("Unsafe distribution path")
})

test("rejects traversal and source/output overlap", async () => {
  const value = await fixture()
  await expect(prepareDistribution({ ...value.input, out: join(value.source, "nested") })).rejects.toThrow("overlap")
  await expect(prepareDistribution({ ...value.input, out: `${value.root}/sub/../prepared` })).rejects.toThrow("Unsafe")
})

const caseRoot = process.env.ORCHESTRA_ARTIFACT_TEST_ROOT ?? (process.platform !== "linux" ? tmpdir() : undefined)
// Windows must exercise native case aliases, even when a declared root is invalid.
test.skipIf(process.platform === "linux" && !caseRoot)(caseRoot
  ? "declared case-insensitive volume rejects source/output aliases before any writes"
  : "BLOCKED: case-alias overlap needs ORCHESTRA_ARTIFACT_TEST_ROOT on a deterministic case-insensitive volume", async () => {
  if (!caseRoot) throw new Error("Case-insensitive distribution test volume required")
  const value = await fixture(caseRoot)
  const alias = join(value.root, "DIST", `cli-${tuple.target}`.toUpperCase())
  // A declared volume must prove actual alias identity; case-sensitive roots fail, never skip.
  const lower = await lstat(value.source, { bigint: true })
  const upper = await lstat(alias, { bigint: true })
  expect(lower.ino).not.toBe(0n)
  expect(upper.ino).not.toBe(0n)
  expect({ dev: upper.dev, ino: upper.ino }).toEqual({ dev: lower.dev, ino: lower.ino })
  const manifest = await prepareDistribution(value.input)
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
  const before = await readdir(value.source)
  const entries = await readdir(join(value.source, "bin", "extra"))
  const note = await readFile(join(value.source, "bin", "extra", "note.txt"))
  for (const out of [alias, join(value.root, "DIST"), join(alias, "bin", "extra", "prepared"), join(alias, "never-created", "nested", "prepared")]) {
    await expect(prepareDistribution({ ...value.input, out })).rejects.toThrow("Distribution source/output overlap")
    expect(await readdir(value.source)).toEqual(before)
    expect(await readdir(join(value.source, "bin", "extra"))).toEqual(entries)
    expect(await readFile(join(value.source, "bin", "extra", "note.txt"))).toEqual(note)
    await expect(lstat(join(value.source, "never-created"))).rejects.toMatchObject({ code: "ENOENT" })
  }
  const archive = join(value.root, "PREPARED", "bin", "extra", "overlap.tar.gz")
  await expect(archiveDistribution({ directory: value.input.out, file: archive })).rejects.toThrow("Archive/payload overlap")
  await expect(lstat(archive)).rejects.toMatchObject({ code: "ENOENT" })
  expect(await readdir(value.source)).toEqual(before)
  expect(await readdir(join(value.source, "bin", "extra"))).toEqual(entries)
  expect(await readFile(join(value.source, "bin", "extra", "note.txt"))).toEqual(note)
  await expect(lstat(join(value.source, "never-created"))).rejects.toMatchObject({ code: "ENOENT" })
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
  // Exact reuse recaptures the entire source, proving archive rejection did not change it.
  expect(await prepareDistribution(value.input)).toEqual(manifest)
})

test("disjoint missing output ancestors are created; linked output ancestors are refused before writes", async () => {
  const value = await fixture()
  const out = join(value.root, "new", "nested", "prepared")
  const manifest = await prepareDistribution({ ...value.input, out })
  expect(await verifyDistribution(out)).toEqual(manifest)
  const alias = join(value.root, "linked")
  await symlink(value.source, alias, process.platform === "win32" ? "junction" : "dir")
  const before = await readdir(value.source)
  await expect(prepareDistribution({ ...value.input, out: join(alias, "never-created", "prepared") })).rejects.toThrow()
  expect(await readdir(value.source)).toEqual(before)
  await expect(lstat(join(value.source, "never-created"))).rejects.toMatchObject({ code: "ENOENT" })
})

test("empty and populated existing destinations are never replaced", async () => {
  const value = await fixture()
  await mkdir(value.input.out)
  await expect(prepareDistribution(value.input)).rejects.toThrow()
  await writeFile(join(value.input.out, "owned.txt"), "keep")
  await expect(prepareDistribution(value.input)).rejects.toThrow()
  expect(await readFile(join(value.input.out, "owned.txt"), "utf8")).toBe("keep")
})

test("conflicting payload preserves previously published files", async () => {
  const value = await fixture()
  await prepareDistribution(value.input)
  const previous = await readFile(join(value.input.out, "distribution.json"))
  await writeFile(join(value.source, "bin/extra/note.txt"), "changed source")
  await expect(prepareDistribution(value.input)).rejects.toThrow("conflict")
  expect(await readFile(join(value.input.out, "distribution.json"))).toEqual(previous)
  expect(await readFile(join(value.input.out, "bin/extra/note.txt"), "utf8")).toContain("inert fixture")
})

for (const kind of ["companion", "missing", "extra", "mode", "table", "descriptor-path", "descriptor-backslash"] as const) {
  test(`verification rejects ${kind} tampering`, async () => {
    const value = await fixture()
    const source = await payloadSnapshot(value.source)
    await prepareDistribution(value.input)
    if (kind === "companion") await writeFile(join(value.input.out, "bin/hugr_omni.node"), "tampered")
    if (kind === "missing") await rm(join(value.input.out, "bin/hugr_omni.node"))
    if (kind === "extra") await writeFile(join(value.input.out, "unowned"), "extra")
    if (kind === "mode") {
      const path = `bin/${tuple.executable}`
      if (process.platform !== "win32") await chmod(join(value.input.out, path), 0o644)
      if (process.platform === "win32") {
        const manifest = await verifyDistribution(value.input.out)
        const file = manifest.files.find((file) => file.path === path)!
        const stored = Boolean((await lstat(join(value.input.out, path))).mode & 0o111)
        expect(file.executable).toBe(stored)
        file.executable = !stored
        await writeFile(join(value.input.out, "distribution.json"), JSON.stringify(manifest))
        expect(Boolean((await lstat(join(value.input.out, path))).mode & 0o111)).toBe(stored)
      }
    }
    if (kind === "table") await writeFile(join(value.input.out, "checksums.sha256"), "wrong")
    if (kind === "descriptor-path" || kind === "descriptor-backslash") {
      const manifest = await verifyDistribution(value.input.out)
      manifest.files[0]!.path = kind === "descriptor-path" ? "../escape" : "bin/bad\\name"
      await writeFile(join(value.input.out, "distribution.json"), JSON.stringify(manifest))
    }
    const error = kind === "mode" ? `Distribution file mismatch: bin/${tuple.executable}`
      : kind === "companion" ? "Distribution file mismatch: bin/hugr_omni.node"
      : kind === "missing" ? "Distribution file mismatch: bin/hugr_omni.node"
      : kind === "extra" ? "Distribution file set mismatch"
      : kind === "table" ? "Distribution checksum table mismatch"
      : "Unsafe distribution path"
    const before = await payloadSnapshot(value.root)
    await expect(prepareDistribution(value.input)).rejects.toThrow(error)
    expect(await payloadSnapshot(value.root)).toEqual(before)
    expect(await payloadSnapshot(value.source)).toEqual(source)
    await expect(verifyDistribution(value.input.out)).rejects.toThrow(error)
    await expect(archiveDistribution({ directory: value.input.out, file: join(value.root, "invalid.tar.gz") })).rejects.toThrow(error)
    expect(await payloadSnapshot(value.root)).toEqual(before)
  })
}

test("archive has rootless regular payload contents and exact hash; existing archive stays intact", async () => {
  const value = await fixture()
  const manifest = await prepareDistribution(value.input)
  const file = join(value.root, "payload.tar.gz")
  const result = await archiveDistribution({ directory: value.input.out, file })
  const bytes = await readFile(file)
  expect(result).toEqual({ version: "1.2.3", target: tuple.target, file, sha256: createHash("sha256").update(bytes).digest("hex") })
  expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
  const members = await new Bun.Archive(bytes).files()
  expect([...members.keys()].sort()).toEqual([...manifest.files.map((entry) => entry.path), "distribution.json", "checksums.sha256"].sort())
  for (const [path, member] of members) expect(Buffer.from(await member.arrayBuffer())).toEqual(await readFile(join(value.input.out, path)))
  const tar = Buffer.from(Bun.gunzipSync(bytes))
  const entries: string[] = []
  for (let offset = 0; offset + 512 <= tar.length && tar[offset] !== 0;) {
    const header = tar.subarray(offset, offset + 512)
    expect([0, 48]).toContain(header[156])
    entries.push(header.subarray(0, 100).toString("utf8").replace(/\0.*$/, ""))
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim(), 8)
    expect(Number.isFinite(size)).toBe(true)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  expect(entries.sort()).toEqual([...members.keys()].sort())
  await expect(archiveDistribution({ directory: value.input.out, file })).rejects.toThrow()
  expect(await readFile(file)).toEqual(bytes)
  const empty = join(value.root, "empty.tar.gz")
  await writeFile(empty, "")
  await expect(archiveDistribution({ directory: value.input.out, file: empty })).rejects.toThrow()
  expect((await readFile(empty)).length).toBe(0)
})
