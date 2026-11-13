import { expect, test } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { access, link, mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import type { NativeEngine } from "../src/backend-toolkit/manifest"
import { noticeArtifacts, noticeReadiness } from "../src/backend-toolkit/native-notices"
import { detect } from "../src/backend-toolkit/target"
import { expectSpawn } from "./fixture/omni-expect"
import { it } from "./lib/effect"

const ALPHA = "Alpha copyright\n"
const BETA = "Beta copyright\n"
const TAR = Buffer.from("H4sIAAAAAAAC/+3TMQqDQBBA0alzCi8QnA2SrVUsAiGNJ5AgGiK46Frk9lmsxNQxBP9rZphmqu+eTXy95MWtLI6pfIcG5ySZZ7CeqqfFPt+tVSORygam0VdDeCn7lHauraJ7717Do2n9QbArbtF/9qv+jf3o3yj9byGrPfkDAAAAAAAAAAAAAAD8sTchPX8jACgAAA==", "base64")
const ZIP = Buffer.from("UEsDBBQAAAAAABWcbF2pmUMVEAAAABAAAAANAAAAcGtnL0xJQ0VOU0UtQUFscGhhIGNvcHlyaWdodApQSwMEFAAAAAAAFZxsXbvdJwcPAAAADwAAAA0AAABwa2cvTElDRU5TRS1CQmV0YSBjb3B5cmlnaHQKUEsBAhQDFAAAAAAAFZxsXamZQxUQAAAAEAAAAA0AAAAAAAAAAAAAAIABAAAAAHBrZy9MSUNFTlNFLUFQSwECFAMUAAAAAAAVnGxdu90nBw8AAAAPAAAADQAAAAAAAAAAAAAAgAE7AAAAcGtnL0xJQ0VOU0UtQlBLBQYAAAAAAgACAHYAAAB1AAAAAAA=", "base64")
const SYMLINK = Buffer.from("H4sIAAAAAAAC/+3SMQrCQBCF4a09xV7ATXYNbm1CCkFsPEHQEINFlmQCensXK4l1FMn/NW+6GXgTbk1y2Bfl8VSud2oeabTNsldG0/ycrds4r7QzJulGGdpLbeQu8xw3DlL1cb1apvDWf/6r/q2f/IL3NlX6K50svP+8lkqfu/Do2+YqKwUAAAAAAAAAAAAAAADgfzwBwmG0lwAoAAA=", "base64")
const LAYOUT = { executable: "tool", entries: ["tool"], caseFold: false }
const digest = (text: string | Uint8Array): `sha256-${string}` => `sha256-${createHash("sha256").update(text).digest("base64")}`

function notices(url: string, format: "tar.gz" | "zip" = "tar.gz", archive = TAR): NonNullable<NativeEngine["notices"]> {
  return [
    { url, integrity: digest(ALPHA), filename: "alpha.txt", archive: { format, integrity: digest(archive), member: "pkg/LICENSE-A" } },
    { url, integrity: digest(BETA), filename: "beta.txt", archive: { format, integrity: digest(archive), member: "pkg/LICENSE-B" } },
  ]
}

const fixture = (archive = TAR) => Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(tmpdir(), "notice-archive-")).then((made) => realpath(made))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const hits: Record<string, number> = {}
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname
      hits[pathname] = (hits[pathname] ?? 0) + 1
      if (pathname === "/licenses") return new Response(new Uint8Array(archive))
      if (pathname === "/tool") return new Response("fixture executable bytes")
      return new Response("missing", { status: 404 })
    },
  })), (server) => Effect.promise(() => server.stop(true)))
  return { root, hits, url: `http://127.0.0.1:${server.port}` }
})

function engine(url: string, source: NativeEngine["notices"]): NativeEngine {
  const pin = { executable: "tool", artifact: {
    url: `${url}/tool`, integrity: digest("fixture executable bytes"), format: "raw" as const,
    entries: [{ from: "tool", to: "tool", executable: true }],
  } }
  return { id: "fixture", version: "1", license: "MIT", upstream: "fixture/notice", notices: source, targets: {
    "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin,
  } }
}

const withEngine = (root: string, manifest: NativeEngine) => <A, E, R>(work: Effect.Effect<A, E, R>) => work.pipe(
  Effect.provideService(BackendToolkit.Root, root),
  Effect.provideService(BackendToolkit.Manifest, { fixture: manifest }),
)

for (const [format, archive] of [["tar.gz", TAR], ["zip", ZIP]] as const) {
  it.live(`${format} notices install once, retain every member, and recheck each cached file`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* fixture(archive)
    const source = notices(`${f.url}/licenses`, format, archive)
    const run = withEngine(f.root, engine(f.url, source))
    const result = yield* run(BackendToolkit.ensure<string>("fixture"))
    const directory = path.dirname(result.executable)
    expect(f.hits["/licenses"]).toBe(1)
    expect(yield* Effect.promise(() => readFile(path.join(directory, "notices/alpha.txt"), "utf8"))).toBe(ALPHA)
    expect(yield* Effect.promise(() => readFile(path.join(directory, "notices/beta.txt"), "utf8"))).toBe(BETA)
    expect(yield* noticeReadiness(directory, source, LAYOUT)).toBeUndefined()
    for (const [filename, text] of [["alpha.txt", ALPHA], ["beta.txt", BETA]]) {
      yield* Effect.promise(() => writeFile(path.join(directory, "notices", filename), "changed"))
      expect(yield* noticeReadiness(directory, source, LAYOUT)).toBe("notice-modified")
      expect((yield* run(BackendToolkit.status<string>("fixture")))[0].status).not.toBe("ready")
      yield* Effect.promise(() => writeFile(path.join(directory, "notices", filename), text))
    }
    expect(yield* noticeReadiness(directory, source, LAYOUT)).toBeUndefined()
    const outside = path.join(f.root, "outside.txt")
    yield* Effect.promise(() => writeFile(outside, ALPHA))
    yield* Effect.promise(() => rm(path.join(directory, "notices/alpha.txt")))
    yield* Effect.promise(() => link(outside, path.join(directory, "notices/alpha.txt")))
    expect(yield* noticeReadiness(directory, source, LAYOUT)).toBe("notice-linked")
  }), 30_000)
}

for (const filename of ["alpha.txt", "beta.txt"]) {
  it.live(`wrong ${filename} digest never publishes a completed install`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* fixture()
    const source = notices(`${f.url}/licenses`).map((notice) => notice.filename === filename
      ? { ...notice, integrity: digest("different") } : notice)
    const result = yield* withEngine(f.root, engine(f.url, source))(BackendToolkit.ensure<string>("fixture")).pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    const host = detect()
    if (!("target" in host)) throw new Error(host.unsupported)
    expect(yield* Effect.promise(() => access(path.join(f.root, "engines/fixture", `1-${host.target}/.complete`)).then(() => true, () => false))).toBe(false)
  }), 30_000)
}

it.live("wrong archive digest is rejected before any notice is published", () => Effect.gen(function* () {
  const f = yield* fixture()
  const source = notices(`${f.url}/licenses`).map((notice) => ({ ...notice, archive: { ...notice.archive!, integrity: digest("wrong archive") } }))
  const result = yield* withEngine(f.root, engine(f.url, source))(BackendToolkit.ensure<string>("fixture")).pipe(Effect.result)
  expect(result._tag).toBe("Failure")
  const host = detect()
  if (!("target" in host)) throw new Error(host.unsupported)
  expect(yield* Effect.promise(() => access(path.join(f.root, "engines/fixture", `1-${host.target}/.complete`)).then(() => true, () => false))).toBe(false)
}))

it.live("invalid archive declarations are refused before fetching any bytes", () => Effect.gen(function* () {
  const f = yield* fixture()
  const source = notices(`${f.url}/licenses`).map((notice) => ({ ...notice, archive: { ...notice.archive!, member: "../outside" } }))
  const result = yield* withEngine(f.root, engine(f.url, source))(BackendToolkit.ensure<string>("fixture")).pipe(Effect.result)
  expect(result._tag).toBe("Failure")
  expect(f.hits).toEqual({})
}))

it.live("archived symbolic links never publish a completed install", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const f = yield* fixture(SYMLINK)
  const result = yield* withEngine(f.root, engine(f.url, notices(`${f.url}/licenses`, "tar.gz", SYMLINK)))(BackendToolkit.ensure<string>("fixture")).pipe(Effect.result)
  expect(result._tag).toBe("Failure")
  const host = detect()
  if (!("target" in host)) throw new Error(host.unsupported)
  expect(yield* Effect.promise(() => access(path.join(f.root, "engines/fixture", `1-${host.target}/.complete`)).then(() => true, () => false))).toBe(false)
}), 30_000)

test("archive notices group exact downloads without conflating archive and member hashes", () => {
  const source = notices("https://example.com/source.crate")
  expect(noticeArtifacts(source, LAYOUT)).toEqual([{
    url: source[0].url, integrity: digest(TAR), format: "tar.gz", entries: [
      { from: "pkg/LICENSE-A", to: "notices/alpha.txt" },
      { from: "pkg/LICENSE-B", to: "notices/beta.txt" },
    ],
  }])
  expect(noticeArtifacts([source[0], { ...source[1], archive: { ...source[1].archive!, integrity: digest("other archive") } }], LAYOUT)).toHaveLength(2)
  expect(noticeArtifacts([source[0], { ...source[1], url: "https://example.com/other.crate" }], LAYOUT)).toHaveLength(2)
  expect(noticeArtifacts([source[0], { ...source[1], archive: { ...source[1].archive!, format: "zip" } }], LAYOUT)).toHaveLength(2)
})

test("unsafe member names, duplicate destinations and duplicate member moves are rejected", () => {
  const source = notices("https://example.com/source.crate")
  for (const member of ["../LICENSE", "/LICENSE", "C:/LICENSE", "pkg/../LICENSE", "pkg\\LICENSE", "pkg//LICENSE", "."]) {
    expect(noticeArtifacts([{ ...source[0], archive: { ...source[0].archive!, member } }], LAYOUT), member).toBe("notice-invalid")
  }
  expect(noticeArtifacts([source[0], source[0]], LAYOUT)).toBe("notice-invalid")
  expect(noticeArtifacts([source[0], { ...source[0], filename: "other.txt" }], LAYOUT)).toBe("notice-invalid")
  expect(noticeArtifacts([{ ...source[0], archive: { ...source[0].archive!, integrity: "sha256-bad" } }], LAYOUT)).toBe("notice-invalid")
  expect(noticeArtifacts(source, { ...LAYOUT, entries: ["notices"] })).toBe("notice-invalid")
})

test("existing raw notices retain their artifact contract", () => {
  expect(noticeArtifacts([{ url: "https://example.com/LICENSE", integrity: digest(ALPHA), filename: "license.txt" }], LAYOUT)).toEqual([{
    url: "https://example.com/LICENSE", integrity: digest(ALPHA), format: "raw", entries: [{ from: "LICENSE", to: "notices/license.txt" }],
  }])
})
