import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { finalize } from "./finalize-latest-yml"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const RELEASE_DATE = "2026-10-27T00:00:00.000Z"
const sha512 = (bytes: string) => createHash("sha512").update(bytes).digest("base64")

// One feed entry in the shape electron-builder writes: url, sha512 and size, indented under `files:`.
function entry(url: string, bytes: string) {
  return [`  - url: ${url}`, `    sha512: ${sha512(bytes)}`, `    size: ${Buffer.byteLength(bytes)}`].join("\n")
}

// A single-build feed as electron-builder writes it, with the top-level path and sha512 mirroring its first file.
function feed(version: string, url: string, bytes: string, releaseDate = RELEASE_DATE) {
  return [
    `version: ${version}`,
    "files:",
    entry(url, bytes),
    `path: ${url}`,
    `sha512: ${sha512(bytes)}`,
    `releaseDate: '${releaseDate}'`,
    "",
  ].join("\n")
}

async function fixture(version = "1.2.3") {
  const root = await mkdtemp(join(tmpdir(), "finalize-latest-yml-"))
  roots.push(root)
  const input = {
    dir: join(root, "latest-yml"),
    out: join(root, "feed"),
    payloads: join(root, "dist"),
    version,
  }
  await Promise.all([mkdir(input.dir), mkdir(input.out), mkdir(input.payloads)])
  return input
}

async function writeBuild(input: { dir: string }, target: string, name: string, content: string) {
  await mkdir(join(input.dir, `latest-yml-${target}`), { recursive: true })
  await writeFile(join(input.dir, `latest-yml-${target}`, name), content)
}

// Every build writes its payload next to its feed; the feed records the bytes the payload really has.
const PAYLOADS = {
  winX64: { url: "Orchestra-1.2.3-x64.exe", bytes: "windows x64 installer" },
  winArm64: { url: "Orchestra-1.2.3-arm64.exe", bytes: "windows arm64 installer" },
  linuxX64: { url: "Orchestra-1.2.3-x86_64.AppImage", bytes: "linux x64 appimage" },
  linuxArm64: { url: "Orchestra-1.2.3-arm64.AppImage", bytes: "linux arm64 appimage" },
  macX64: { url: "Orchestra-1.2.3-x64.dmg", bytes: "mac x64 disk image" },
  macArm64: { url: "Orchestra-1.2.3-arm64.dmg", bytes: "mac arm64 disk image" },
}

async function writeAllBuilds(input: { dir: string; payloads: string; version: string }) {
  for (const payload of Object.values(PAYLOADS)) await writeFile(join(input.payloads, payload.url), payload.bytes)
  await writeBuild(input, "x86_64-pc-windows-msvc", "latest.yml", feed(input.version, PAYLOADS.winX64.url, PAYLOADS.winX64.bytes))
  await writeBuild(input, "aarch64-pc-windows-msvc", "latest.yml", feed(input.version, PAYLOADS.winArm64.url, PAYLOADS.winArm64.bytes))
  await writeBuild(input, "x86_64-unknown-linux-gnu", "latest-linux.yml", feed(input.version, PAYLOADS.linuxX64.url, PAYLOADS.linuxX64.bytes))
  await writeBuild(input, "aarch64-unknown-linux-gnu", "latest-linux-arm64.yml", feed(input.version, PAYLOADS.linuxArm64.url, PAYLOADS.linuxArm64.bytes))
  // The x64 mac feed is older; the merged feed takes its release date from the arm64 feed.
  await writeBuild(input, "x86_64-apple-darwin", "latest-mac.yml", feed(input.version, PAYLOADS.macX64.url, PAYLOADS.macX64.bytes, "2026-10-26T00:00:00.000Z"))
  await writeBuild(input, "aarch64-apple-darwin", "latest-mac.yml", feed(input.version, PAYLOADS.macArm64.url, PAYLOADS.macArm64.bytes))
}

test("merges per-build feeds into the published feeds with the recorded sha512 and size of each payload", async () => {
  const input = await fixture()
  await writeAllBuilds(input)

  const written = await finalize(input)
  expect(Object.keys(written).sort()).toEqual(["latest-linux-arm64.yml", "latest-linux.yml", "latest-mac.yml", "latest.yml"])

  // Windows and macOS merge arm64 first, take version and release date from the arm64 feed.
  expect(await readFile(join(input.out, "latest.yml"), "utf8")).toBe(
    [
      "version: 1.2.3",
      "files:",
      entry(PAYLOADS.winArm64.url, PAYLOADS.winArm64.bytes),
      entry(PAYLOADS.winX64.url, PAYLOADS.winX64.bytes),
      `releaseDate: '${RELEASE_DATE}'`,
      "",
    ].join("\n"),
  )
  expect(await readFile(join(input.out, "latest-mac.yml"), "utf8")).toBe(
    [
      "version: 1.2.3",
      "files:",
      entry(PAYLOADS.macArm64.url, PAYLOADS.macArm64.bytes),
      entry(PAYLOADS.macX64.url, PAYLOADS.macX64.bytes),
      `releaseDate: '${RELEASE_DATE}'`,
      "",
    ].join("\n"),
  )
  // Linux feeds pass through unchanged apart from being re-serialized.
  expect(await readFile(join(input.out, "latest-linux.yml"), "utf8")).toBe(
    ["version: 1.2.3", "files:", entry(PAYLOADS.linuxX64.url, PAYLOADS.linuxX64.bytes), `releaseDate: '${RELEASE_DATE}'`, ""].join("\n"),
  )
  expect(await readFile(join(input.out, "latest-linux-arm64.yml"), "utf8")).toBe(
    ["version: 1.2.3", "files:", entry(PAYLOADS.linuxArm64.url, PAYLOADS.linuxArm64.bytes), `releaseDate: '${RELEASE_DATE}'`, ""].join("\n"),
  )
})

test("the recorded sha512 is the base64 digest of the payload bytes on disk", async () => {
  const input = await fixture()
  await writeAllBuilds(input)
  await finalize(input)

  const onDisk = await readFile(join(input.payloads, PAYLOADS.macArm64.url))
  const digest = createHash("sha512").update(onDisk).digest("base64")
  expect(await readFile(join(input.out, "latest-mac.yml"), "utf8")).toContain(`    sha512: ${digest}\n    size: ${onDisk.length}\n`)
})

test("refuses a payload whose bytes differ from the recorded size or sha512", async () => {
  const input = await fixture()
  await writeAllBuilds(input)
  // Same length, different bytes: only the sha512 check can catch it.
  await writeFile(join(input.payloads, PAYLOADS.linuxX64.url), "linux x64 APPIMAGE")
  await expect(finalize(input)).rejects.toThrow(`${PAYLOADS.linuxX64.url} differs from the size or sha512`)

  // Longer bytes: the size check catches it before the digest matters.
  await writeFile(join(input.payloads, PAYLOADS.linuxX64.url), `${PAYLOADS.linuxX64.bytes} and more`)
  await expect(finalize(input)).rejects.toThrow(`${PAYLOADS.linuxX64.url} differs from the size or sha512`)
  expect(await Bun.file(join(input.out, "latest-linux.yml")).exists()).toBe(false)
})

test("refuses a feed that names a payload no build produced", async () => {
  const input = await fixture()
  await writeAllBuilds(input)
  await rm(join(input.payloads, PAYLOADS.winX64.url))
  await expect(finalize(input)).rejects.toThrow(`latest.yml names ${PAYLOADS.winX64.url}, which no build produced`)
})

test("refuses a build whose feed carries a different version than ORCHESTRA_VERSION", async () => {
  const input = await fixture("1.2.3")
  await writeAllBuilds(input)
  await writeBuild(input, "aarch64-unknown-linux-gnu", "latest-linux-arm64.yml", feed("1.2.2", PAYLOADS.linuxArm64.url, PAYLOADS.linuxArm64.bytes))
  await expect(finalize(input)).rejects.toThrow("latest-linux-arm64.yml carries version 1.2.2, expected 1.2.3")
})

test("refuses an empty latest-yml directory instead of publishing an empty feed", async () => {
  const input = await fixture()
  await expect(finalize(input)).rejects.toThrow(`No latest*.yml found under ${input.dir}`)
})

test("the script entry point refuses to run without LATEST_YML_DIR", async () => {
  const input = await fixture()
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined),
  )
  delete env.LATEST_YML_DIR
  Object.assign(env, { LATEST_YML_OUT: input.out, LATEST_PAYLOAD_DIR: input.payloads, ORCHESTRA_VERSION: input.version })
  const proc = Bun.spawn({
    cmd: [process.execPath, join(import.meta.dir, "finalize-latest-yml.ts")],
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
  expect(code).not.toBe(0)
  expect(stderr).toContain("LATEST_YML_DIR is required")
})
