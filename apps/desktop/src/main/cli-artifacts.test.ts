import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliTreeSitterTarget, copyCliTreeSitter, nativeCliTarget, readCliManifest, verifyCliArtifact } from "./cli-artifacts"
import { requireElfLibc, requireTreeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { writeTreeSitterBundle } from "./cli-tree-sitter.fixture"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orchestra-artifact-test-"))
  roots.push(root)
  const bytes = Buffer.from("owned executable bytes")
  const manifest = {
    schema: 1 as const,
    version: "1.18.27",
    artifacts: [
      {
        target: "linux-x64-baseline",
        file: "orchestra-linux-x64-baseline",
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ],
  }
  await writeFile(join(root, manifest.artifacts[0]!.file), bytes)
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest))
  return { root, manifest }
}

test("owned manifest verifies real bytes and version", async () => {
  const input = await fixture()
  expect(await readCliManifest(input.root)).toEqual(input.manifest)
  expect(await verifyCliArtifact(input.root, "linux-x64-baseline")).toEqual({
    path: join(input.root, input.manifest.artifacts[0]!.file),
    version: "1.18.27",
  })
})

test("owned manifest rejects tampered cache bytes on every call", async () => {
  const input = await fixture()
  await verifyCliArtifact(input.root, "linux-x64-baseline")
  await writeFile(join(input.root, input.manifest.artifacts[0]!.file), "foreign executable")
  await expect(verifyCliArtifact(input.root, "linux-x64-baseline")).rejects.toThrow("digest")
})

test.each([
  ["darwin", "arm64", "darwin-arm64"],
  ["darwin", "x64", "darwin-x64-baseline"],
  ["win32", "arm64", "windows-arm64"],
  ["win32", "x64", "windows-x64-baseline"],
  ["linux", "arm64", "linux-arm64"],
  ["linux", "x64", "linux-x64-baseline"],
])("owned native target %s/%s", (platform, arch, expected) => {
  expect(nativeCliTarget(platform, arch)).toBe(expected)
})

test.each(["linux-x64-baseline", "linux-arm64", "linux-x64-baseline-musl", "linux-arm64-musl"])(
  "synthetic %s parser fixture has parsed libc dependencies and same-CPU wrong libc refuses copy",
  async (target) => {
    const root = await mkdtemp(join(tmpdir(), "orchestra-parser-abi-test-"))
    roots.push(root)
    const source = join(root, "source")
    const output = join(root, "output")
    const tuple = cliTreeSitterTarget(target)
    await writeTreeSitterBundle(source, target)
    copyCliTreeSitter(source, output, target)
    requireTreeSitterBundle(output, tuple)
    const binding = `tree-sitter/prebuilds/linux-${tuple.arch}/tree-sitter.node`
    const expected = tuple.abi === "musl" ? "musl" : "glibc"
    expect(requireElfLibc(join(output, binding), expected).needed).toEqual([expected === "glibc" ? "libc.so.6" :
      `libc.musl-${tuple.arch === "x64" ? "x86_64" : "aarch64"}.so.1`])
    const foreign = join(root, "foreign")
    await writeTreeSitterBundle(foreign, target.endsWith("-musl") ? target.slice(0, -5) : `${target}-musl`)
    await copyFile(join(foreign, binding), join(source, binding))
    expect(() => copyCliTreeSitter(source, join(root, "refused"), target)).toThrow("ELF_LIBC_MISMATCH")
    requireTreeSitterBundle(output, tuple)
  },
)

test.each([
  ["linux", "ia32"],
  ["darwin", "riscv64"],
  ["freebsd", "x64"],
])("rejects unsupported target %s/%s", (platform, arch) => {
  expect(() => nativeCliTarget(platform, arch)).toThrow("Unsupported")
})

test.each([
  { schema: 2 },
  { version: "" },
  { version: "  " },
  { artifacts: [] },
  { artifacts: [{ target: "linux-x64-baseline", file: "../orchestra", sha256: "0".repeat(64) }] },
  { artifacts: [{ target: "linux-x64-baseline", file: "sub\\orchestra", sha256: "0".repeat(64) }] },
  { artifacts: [{ target: "linux-x64-baseline", file: "orchestra", sha256: "A".repeat(64) }] },
  { artifacts: [{ target: "unknown", file: "orchestra", sha256: "0".repeat(64) }] },
])("owned manifest rejects malformed descriptor %#", async (change) => {
  const input = await fixture()
  await writeFile(join(input.root, "manifest.json"), JSON.stringify({ ...input.manifest, ...change }))
  await expect(readCliManifest(input.root)).rejects.toThrow()
})

test("owned manifest rejects duplicate targets and filenames", async () => {
  const input = await fixture()
  await writeFile(
    join(input.root, "manifest.json"),
    JSON.stringify({ ...input.manifest, artifacts: [...input.manifest.artifacts, ...input.manifest.artifacts] }),
  )
  await expect(readCliManifest(input.root)).rejects.toThrow("Duplicate")
  await writeFile(
    join(input.root, "manifest.json"),
    JSON.stringify({
      ...input.manifest,
      artifacts: [...input.manifest.artifacts, { ...input.manifest.artifacts[0], target: "linux-arm64" }],
    }),
  )
  await expect(readCliManifest(input.root)).rejects.toThrow("Duplicate")
})

test("owned artifact rejects missing descriptors, missing targets and nonregular files", async () => {
  const input = await fixture()
  await expect(verifyCliArtifact(input.root, "linux-arm64")).rejects.toThrow("missing")
  await rm(join(input.root, input.manifest.artifacts[0]!.file))
  await mkdir(join(input.root, input.manifest.artifacts[0]!.file))
  await expect(verifyCliArtifact(input.root, "linux-x64-baseline")).rejects.toThrow("regular")
  await rm(join(input.root, "manifest.json"))
  await expect(readCliManifest(input.root)).rejects.toThrow()
})

test("owned artifact rejects symlink binary and symlink descriptor", async () => {
  const input = await fixture()
  await writeFile(join(input.root, "outside"), "owned executable bytes")
  await rm(join(input.root, input.manifest.artifacts[0]!.file))
  await symlink(join(input.root, "outside"), join(input.root, input.manifest.artifacts[0]!.file))
  await expect(verifyCliArtifact(input.root, "linux-x64-baseline")).rejects.toThrow("regular")
  await rm(join(input.root, "manifest.json"))
  await writeFile(join(input.root, "descriptor"), JSON.stringify(input.manifest))
  await symlink(join(input.root, "descriptor"), join(input.root, "manifest.json"))
  await expect(readCliManifest(input.root)).rejects.toThrow("regular")
})

test("owned manifest rejects symlink roots", async () => {
  const input = await fixture()
  const link = `${input.root}-link`
  roots.push(link)
  await symlink(input.root, link, process.platform === "win32" ? "junction" : "dir")
  await expect(readCliManifest(link)).rejects.toThrow("real directory")
})
