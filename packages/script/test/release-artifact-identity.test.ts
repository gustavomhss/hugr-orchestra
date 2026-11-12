import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises"
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
  const content = (path: string) => {
    if (!path.endsWith(".yml")) return "verified bytes"
    const payload = path.endsWith("latest-mac.yml")
      ? "orchestra-desktop-mac-x64.zip"
      : path.endsWith("latest-linux.yml")
        ? "orchestra-desktop-linux-x86_64.AppImage"
        : "orchestra-desktop-win-x64.exe"
    return `version: ${releaseVersion}\nfiles: ${JSON.stringify([
      {
        url: `https://github.com/gustavomhss/hugr-orchestra/releases/download/desktop-v${releaseVersion}/${payload}`,
        size: Buffer.byteLength("verified bytes"),
        sha512: createHash("sha512").update("verified bytes").digest("base64"),
      },
    ])}\n`
  }
  for (const name of names) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), content(name))
  }
  const files = names.map((path) => ({
    path,
    size: Buffer.byteLength(content(path)),
    sha256: createHash("sha256").update(content(path)).digest("hex"),
  }))
  if (releaseVersion !== version) {
    for (const file of files) {
      const name = file.path.replace(version, releaseVersion)
      await rename(join(root, file.path), join(root, name))
      file.path = name
    }
  }
  const receipt = {
    schemaVersion: 1,
    ...expected,
    version: releaseVersion,
    validation: { result: "pass", appVersion: releaseVersion, cliVersion: releaseVersion },
    files,
  }
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
  for (const validation of [
    undefined,
    { result: "fail" },
    { ...receipt.validation, appVersion: "0.3.5" },
    { ...receipt.validation, cliVersion: "0.3.5" },
  ])
    await expect(verifyReleaseArtifacts(root, { ...receipt, validation }, expected)).rejects.toThrow()
})

test("rejects another update-feed version even when receipt bytes match", async () => {
  const { root, receipt } = await fixture()
  const bytes = "version: 0.3.5\n"
  const path = "feed/latest.yml"
  await writeFile(join(root, path), bytes)
  const files = receipt.files.map((file) =>
    file.path === path
      ? { ...file, size: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") }
      : file,
  )
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

for (const change of [
  "relative",
  "foreign-repo",
  "foreign-host",
  "wrong-version",
  "query",
  "fragment",
  "credentials",
  "encoded-separator",
  "size",
  "sha512",
  "legacy-override",
  "package-override",
]) {
  test(`real artifact verifier refuses accurately hashed candidate feed ${change}`, async () => {
    const { root, receipt } = await fixture()
    const path = "feed/latest.yml"
    const feed = Bun.YAML.parse(await readFile(join(root, path), "utf8")) as {
      version: string
      files: { url: string; size: number; sha512: string }[]
      path?: string
      sha512?: string
      packages?: unknown
    }
    const entry = feed.files[0]!
    if (change === "relative") entry.url = "orchestra-desktop-win-x64.exe"
    if (change === "foreign-repo") entry.url = entry.url.replace("gustavomhss/hugr-orchestra", "foreign/repo")
    if (change === "foreign-host") entry.url = entry.url.replace("github.com", "unapproved.invalid")
    if (change === "wrong-version") entry.url = entry.url.replace("desktop-v0.3.6", "desktop-v0.3.5")
    if (change === "query") entry.url += "?token=fixture"
    if (change === "fragment") entry.url += "#override"
    if (change === "credentials") entry.url = entry.url.replace("https://", "https://user:fixture@")
    if (change === "encoded-separator")
      entry.url = entry.url.replace("orchestra-desktop-win", "%2forchestra-desktop-win")
    if (change === "size") entry.size += 1
    if (change === "sha512") entry.sha512 = createHash("sha512").update("different actual payload").digest("base64")
    if (change === "legacy-override") {
      feed.path = "unapproved.exe"
      feed.sha512 = entry.sha512
    }
    if (change === "package-override")
      feed.packages = { x64: { path: "https://unapproved.invalid/payload.7z", sha512: entry.sha512 } }
    const bytes =
      [
        `version: ${feed.version}`,
        ...Object.entries(feed)
          .filter(([key]) => key !== "version")
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
      ].join("\n") + "\n"
    await writeFile(join(root, path), bytes)
    const files = receipt.files.map((file) =>
      file.path === path
        ? { ...file, size: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") }
        : file,
    )
    await expect(verifyReleaseArtifacts(root, { ...receipt, files }, expected)).rejects.toThrow()
  })
}

for (const approved of [false, true]) {
  test(`real artifact verifier accepts embedded blockMapSize with an optional approved sidecar, sidecar=${approved}`, async () => {
    const { root, receipt } = await fixture()
    const path = "feed/latest.yml"
    const feed = Bun.YAML.parse(await readFile(join(root, path), "utf8")) as {
      version: string
      files: { url: string; size: number; sha512: string; blockMapSize?: number }[]
    }
    const blockmap = "approved adjacent blockmap"
    feed.files[0]!.blockMapSize = Buffer.byteLength(blockmap)
    const bytes = [`version: ${feed.version}`, `files: ${JSON.stringify(feed.files)}`].join("\n") + "\n"
    await writeFile(join(root, path), bytes)
    const files = receipt.files.map((entry) =>
      entry.path === path
        ? { ...entry, size: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") }
        : entry,
    )
    if (approved) {
      const name = "desktop/orchestra-desktop-win-x64.exe.blockmap"
      await writeFile(join(root, name), blockmap)
      files.push({
        path: name,
        size: Buffer.byteLength(blockmap),
        sha256: createHash("sha256").update(blockmap).digest("hex"),
      })
    }
    await expect(verifyReleaseArtifacts(root, { ...receipt, files }, expected)).resolves.toBeUndefined()
  })
}
