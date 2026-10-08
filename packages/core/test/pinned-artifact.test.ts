import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "fs/promises"
import { tmpdir } from "os"
import which from "which"
import { Effect } from "effect"
import { PinnedArtifact } from "../src/pinned-artifact"
import { it } from "./lib/effect"

const fixture = Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "pinned-artifact-")))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  // An archive shaped like an npm package: an executable stored without its exec bit, plus a plain file.
  yield* Effect.promise(async () => {
    await mkdir(path.join(directory, "archive", "package", "bin"), { recursive: true })
    await writeFile(path.join(directory, "archive", "package", "bin", "tool"), "#!/bin/sh\necho tool\n", { mode: 0o644 })
    await writeFile(path.join(directory, "archive", "package", "README.md"), "readme")
  })
  const tar = Bun.spawnSync(["tar", "-czf", "tool.tgz", "-C", "archive", "package"], { cwd: directory })
  if (tar.exitCode !== 0) throw new Error(`BLOCKED: tar unavailable: ${tar.stderr.toString()}`)
  const genuine = new Uint8Array(yield* Effect.promise(() => readFile(path.join(directory, "tool.tgz"))))
  const raw = new TextEncoder().encode("#!/bin/sh\necho raw\n")
  const files: Record<string, Uint8Array<ArrayBuffer>> = {
    "/tool.tgz": genuine,
    "/tampered.tgz": new Uint8Array([...genuine.slice(0, -1), genuine[genuine.length - 1] ^ 1]),
    "/tool.zip": new Uint8Array(yield* Effect.promise(() => readFile(path.join(import.meta.dir, "fixture", "pinned-artifact", "tool.zip")))),
    "/buf-Test-arm64": raw,
  }
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch: (request) => {
          const body = files[new URL(request.url).pathname]
          return body ? new Response(body) : new Response("missing", { status: 404 })
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const installs = path.join(directory, "installs")
  const sri = (bytes: Uint8Array, algorithm: "sha256" | "sha512" = "sha512") =>
    `${algorithm}-${createHash(algorithm).update(bytes).digest("base64")}` as const
  const tgz = (name = "tool.tgz", entries: PinnedArtifact.Artifact["entries"] = [
    { from: "package/bin/tool", to: "bin/tool", executable: true },
    { from: "package/README.md", to: "README.md" },
  ]): PinnedArtifact.Artifact => ({
    url: `http://127.0.0.1:${server.port}/${name}`,
    integrity: sri(genuine),
    format: "tar.gz",
    entries,
  })
  // Nothing is left beside a refused install: no target directory and no staging directory.
  const leftovers = () => Effect.promise(() => readdir(installs).catch(() => []))
  return { directory, installs, server, genuine, raw, files, sri, tgz, leftovers }
})

const refused = (directory: string, artifacts: ReadonlyArray<PinnedArtifact.Artifact>) =>
  PinnedArtifact.install(directory, artifacts).pipe(Effect.flip, Effect.map((error) => error.cause))

const mode = (file: string) => Effect.promise(() => stat(file)).pipe(Effect.map((info) => info.mode & 0o777))

it.live("a tar.gz install lays out its entries, marks executables 0755 and writes .complete last", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.installs, "tool-1")
    expect(yield* PinnedArtifact.installed(target)).toBe(false)
    expect(yield* PinnedArtifact.install(target, [f.tgz()])).toBe(target)
    expect(yield* PinnedArtifact.installed(target)).toBe(true)
    expect((yield* Effect.promise(() => readdir(target))).sort()).toEqual([".complete", "README.md", "bin"])
    expect(yield* Effect.promise(() => readFile(path.join(target, "README.md"), "utf8"))).toBe("readme")
    if (process.platform !== "win32") {
      expect(yield* mode(path.join(target, "bin", "tool"))).toBe(0o755)
      expect(yield* mode(path.join(target, "README.md"))).toBe(0o644)
    }
    expect(yield* f.leftovers()).toEqual(["tool-1"])
  }), 30_000,
)

it.live("one flipped byte is refused before anything is extracted", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.installs, "tool-1")
    expect(yield* refused(target, [f.tgz("tampered.tgz")])).toBe("integrity-mismatch")
    expect(yield* PinnedArtifact.installed(target)).toBe(false)
    expect(yield* f.leftovers()).toEqual([])
  }), 30_000,
)

it.live("a raw download is the executable itself", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.installs, "buf")
    yield* PinnedArtifact.install(target, [{
      url: `http://127.0.0.1:${f.server.port}/buf-Test-arm64`,
      integrity: f.sri(f.raw, "sha256"),
      format: "raw",
      entries: [{ from: "buf-Test-arm64", to: "buf", executable: true }],
    }])
    expect(new Uint8Array(yield* Effect.promise(() => readFile(path.join(target, "buf"))))).toEqual(f.raw)
    if (process.platform !== "win32") expect(yield* mode(path.join(target, "buf"))).toBe(0o755)
    expect(yield* PinnedArtifact.installed(target)).toBe(true)
  }), 30_000,
)

// PowerShell Expand-Archive alone can take most of half a minute on a loaded Windows runner.
it.live("a zip extracts with the platform extractor, or names the one that is missing", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.installs, "zipped")
    const artifact: PinnedArtifact.Artifact = {
      url: `http://127.0.0.1:${f.server.port}/tool.zip`,
      integrity: f.sri(f.files["/tool.zip"]),
      format: "zip",
      entries: [{ from: "bin/tool", to: "tool", executable: true }],
    }
    const extractor = process.platform === "win32" ? "powershell" : "unzip"
    if (!which.sync(extractor, { nothrow: true })) {
      expect(yield* refused(target, [artifact])).toBe(`extractor-missing:${extractor}`)
      expect(yield* f.leftovers()).toEqual([])
      return
    }
    yield* PinnedArtifact.install(target, [artifact])
    expect(yield* Effect.promise(() => readFile(path.join(target, "tool"), "utf8"))).toBe("#!/bin/sh\necho zipped\n")
    if (process.platform !== "win32") expect(yield* mode(path.join(target, "tool"))).toBe(0o755)
  }), 120_000,
)

it.live("a missing download, an unsupported digest and an escaping entry are refused with their cause", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.installs, "tool-1")
    expect(yield* refused(target, [f.tgz("absent.tgz")])).toBe("download:404")
    const md5 = { ...f.tgz(), integrity: "md5-AAAAAAAAAAAAAAAAAAAAAA==" as PinnedArtifact.Artifact["integrity"] }
    expect(yield* refused(target, [md5])).toBe("integrity-unsupported")
    expect(yield* refused(target, [f.tgz("tool.tgz", [{ from: "package/README.md", to: "../x" }])])).toBe("layout")
    expect(yield* refused(target, [f.tgz("tool.tgz", [{ from: "package/absent", to: "absent" }])])).toBe("layout")
    // The escaping entry would have landed beside the target as `x`.
    expect(yield* f.leftovers()).toEqual([])
  }), 30_000,
)

it.live("two concurrent installs of the same directory both succeed and leave one install", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.installs, "tool-1")
    const results = yield* Effect.all([PinnedArtifact.install(target, [f.tgz()]), PinnedArtifact.install(target, [f.tgz()])], {
      concurrency: 2,
    })
    expect(results).toEqual([target, target])
    expect(yield* PinnedArtifact.installed(target)).toBe(true)
    expect(yield* f.leftovers()).toEqual(["tool-1"])
  }), 30_000,
)
