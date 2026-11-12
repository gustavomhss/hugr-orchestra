import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { verifyReleaseArtifacts } from "../src/release-artifact-identity"

const version = "0.3.6"
const expected = { version, sourceSha: "a".repeat(40), cliRunId: 1, desktopRunId: 2, qualificationRunId: 3 }
const targets = [
  "linux-x64-baseline",
  "linux-arm64",
  "darwin-arm64",
  "darwin-x64-baseline",
  "windows-x64-baseline",
  "windows-arm64",
  "linux-x64-baseline-musl",
  "linux-arm64-musl",
]
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(releaseVersion = version) {
  const root = await mkdtemp(join(tmpdir(), "release-identity-"))
  roots.push(root)
  const names = [
    ...targets.map((target) => `cli/orchestra-${version}-${target}.tar.gz`),
    ...targets.map((target) => `cli/npm-packs/humanguardrail-cli-${target}-${version}.tgz`),
    `cli/npm-packs/humanguardrail-cli-${version}.tgz`,
    "cli/install.sh",
    "cli/SHA256SUMS",
    ...[
      "mac-arm64.dmg",
      "mac-x64.dmg",
      "mac-arm64.zip",
      "mac-x64.zip",
      "win-x64.exe",
      "win-arm64.exe",
      "linux-x86_64.AppImage",
      "linux-amd64.deb",
      "linux-x86_64.rpm",
    ].map((suffix) => `desktop/orchestra-desktop-${suffix}`),
    "feed/latest.yml",
    "feed/latest-mac.yml",
    "feed/latest-linux.yml",
    "feed/SHA256SUMS",
  ]
  for (const name of names) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), name.endsWith(".yml") ? `version: ${releaseVersion}\n` : "verified bytes")
  }
  const files = names.map((path) => ({
    path,
    size: Buffer.byteLength(path.endsWith(".yml") ? `version: ${releaseVersion}\n` : "verified bytes"),
    sha256: createHash("sha256").update(path.endsWith(".yml") ? `version: ${releaseVersion}\n` : "verified bytes").digest("hex"),
  }))
  if (releaseVersion !== version) {
    for (const file of files) {
      const name = file.path.replace(version, releaseVersion)
      await rename(join(root, file.path), join(root, name))
      file.path = name
    }
  }
  const receipt = { schemaVersion: 1, ...expected, version: releaseVersion, validation: { result: "pass", appVersion: releaseVersion, cliVersion: releaseVersion }, files }
  return { root, receipt }
}

test("accepts the complete exact-byte CLI and desktop publication set", async () => {
  const { root, receipt } = await fixture()
  await expect(verifyReleaseArtifacts(root, receipt, expected)).resolves.toBeUndefined()
})

test("rejects another source, version, producer or qualification run", async () => {
  const { root, receipt } = await fixture()
  for (const change of [
    { sourceSha: "b".repeat(40) },
    { version: "0.3.7" },
    { cliRunId: 9 },
    { desktopRunId: 9 },
    { qualificationRunId: 9 },
  ]) {
    await expect(verifyReleaseArtifacts(root, { ...receipt, ...change }, expected)).rejects.toThrow()
  }
})

test("rejects malformed receipt schemas and expected identities", async () => {
  const { root, receipt } = await fixture()
  for (const invalid of [
    null,
    [],
    {},
    { ...receipt, schemaVersion: 2 },
    { ...receipt, files: null },
    { ...receipt, files: [null] },
  ]) {
    await expect(verifyReleaseArtifacts(root, invalid, expected)).rejects.toThrow()
  }
  for (const change of [
    { sourceSha: "a".repeat(39) },
    { sourceSha: "z".repeat(40) },
    { cliRunId: 0 },
    { desktopRunId: -1 },
    { qualificationRunId: 1.5 },
    { cliRunId: NaN },
  ]) {
    await expect(verifyReleaseArtifacts(root, { ...receipt, ...change }, { ...expected, ...change })).rejects.toThrow()
  }
  const unstable = await fixture("0.3.6-beta.1")
  await expect(
    verifyReleaseArtifacts(unstable.root, unstable.receipt, { ...expected, version: "0.3.6-beta.1" }),
  ).rejects.toThrow()
})

test("rejects missing or failed runtime validation", async () => {
  const { root, receipt } = await fixture()
  for (const validation of [undefined, { result: "fail" }, { ...receipt.validation, appVersion: "0.3.5" }, { ...receipt.validation, cliVersion: "0.3.5" }])
    await expect(verifyReleaseArtifacts(root, { ...receipt, validation }, expected)).rejects.toThrow()
})

test("rejects another update-feed version even when receipt bytes match", async () => {
  const { root, receipt } = await fixture()
  const bytes = "version: 0.3.5\n"
  const path = "feed/latest.yml"
  await writeFile(join(root, path), bytes)
  const files = receipt.files.map((file) => file.path === path ? { ...file, size: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") } : file)
  await expect(verifyReleaseArtifacts(root, { ...receipt, files }, expected)).rejects.toThrow()
})

test("rejects tampered bytes and fabricated size or digest", async () => {
  const { root, receipt } = await fixture()
  const first = receipt.files[0]!
  await expect(
    verifyReleaseArtifacts(root, { ...receipt, files: [{ ...first, size: 15 }, ...receipt.files.slice(1)] }, expected),
  ).rejects.toThrow()
  await expect(
    verifyReleaseArtifacts(
      root,
      { ...receipt, files: [{ ...first, sha256: "0".repeat(64) }, ...receipt.files.slice(1)] },
      expected,
    ),
  ).rejects.toThrow()
  await writeFile(join(root, first.path), "changed bytes!")
  await expect(verifyReleaseArtifacts(root, receipt, expected)).rejects.toThrow()
})

test("rejects omissions, duplicates, unexpected payloads and traversal paths", async () => {
  const { root, receipt } = await fixture()
  await expect(verifyReleaseArtifacts(root, { ...receipt, files: receipt.files.slice(1) }, expected)).rejects.toThrow()
  await expect(
    verifyReleaseArtifacts(root, { ...receipt, files: [...receipt.files, receipt.files[0]] }, expected),
  ).rejects.toThrow()
  await expect(
    verifyReleaseArtifacts(
      root,
      { ...receipt, files: [{ ...receipt.files[0], path: "../secret" }, ...receipt.files.slice(1)] },
      expected,
    ),
  ).rejects.toThrow()
  await expect(
    verifyReleaseArtifacts(
      root,
      { ...receipt, files: [{ ...receipt.files[0], path: "/secret" }, ...receipt.files.slice(1)] },
      expected,
    ),
  ).rejects.toThrow()
  await writeFile(join(root, `desktop/extra-${version}.zip`), "verified bytes")
  await expect(verifyReleaseArtifacts(root, receipt, expected)).rejects.toThrow()
  await expect(
    verifyReleaseArtifacts(
      root,
      { ...receipt, files: [...receipt.files, { ...receipt.files[0]!, path: `desktop/extra-${version}.zip` }] },
      expected,
    ),
  ).rejects.toThrow()
})

test("rejects a physically missing payload even with a complete receipt", async () => {
  const { root, receipt } = await fixture()
  await rm(join(root, receipt.files[0]!.path))
  await expect(verifyReleaseArtifacts(root, receipt, expected)).rejects.toThrow()
})

test("accepts blockmaps only for actual published payload names", async () => {
  const { root, receipt } = await fixture()
  const path = "desktop/orchestra-desktop-mac-x64.zip.blockmap"
  await writeFile(join(root, path), "verified bytes")
  const files = [...receipt.files, { ...receipt.files[0]!, path }]
  await expect(verifyReleaseArtifacts(root, { ...receipt, files }, expected)).resolves.toBeUndefined()
  const unrelated = `desktop/missing-${version}.zip.blockmap`
  await writeFile(join(root, unrelated), "verified bytes")
  await expect(
    verifyReleaseArtifacts(
      root,
      { ...receipt, files: [...files, { ...receipt.files[0]!, path: unrelated }] },
      expected,
    ),
  ).rejects.toThrow()
})

test("rejects symlinked publication files and directories", async () => {
  const { root, receipt } = await fixture()
  const first = join(root, receipt.files[0]!.path)
  await rm(first)
  await symlink(join(root, "cli/install.sh"), first)
  await expect(verifyReleaseArtifacts(root, receipt, expected)).rejects.toThrow()
})

test("rejects symlinked publication directories", async () => {
  const { root, receipt } = await fixture()
  const outside = await mkdtemp(join(tmpdir(), "release-outside-"))
  roots.push(outside)
  await rename(join(root, "cli/npm-packs"), join(outside, "packs"))
  await symlink(join(outside, "packs"), join(root, "cli/npm-packs"), "dir")
  await expect(verifyReleaseArtifacts(root, receipt, expected)).rejects.toThrow()
})
