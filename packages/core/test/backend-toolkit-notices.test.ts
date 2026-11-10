import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import type { NativeEngine } from "../src/backend-toolkit/manifest"
import { PinnedArtifact } from "../src/pinned-artifact"
import { detect, type TargetId } from "../src/backend-toolkit/target"
import { it } from "./lib/effect"

const BINARY = new Uint8Array([0x00, 0x01, 0xff, 0x10])
const LICENSE = "Copyright fixture\nThird-party notices stay plaintext.\n"
const symlinkCase = process.platform === "win32" ? it.live.skip : it.live

const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "native-notices-")))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const hits: Record<string, number> = {}
  const files = new Map<string, Blob>([
    ["/tool", blob(BINARY)],
    ["/license.txt", blob(new TextEncoder().encode(LICENSE))],
  ])
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => {
        const pathname = new URL(request.url).pathname
        hits[pathname] = (hits[pathname] ?? 0) + 1
        await Bun.sleep(100)
        const body = files.get(pathname)
        return body ? new Response(body) : new Response("missing", { status: 404 })
      },
    })),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const port = server.port
  if (typeof port !== "number") throw new Error("loopback port missing")
  return { root, hits, port }
})

function blob(bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return new Blob([copy])
}

function host() {
  const detected = detect()
  if (!("target" in detected)) throw new Error(`BLOCKED: test host has no toolkit target: ${detected.unsupported}`)
  return detected.target
}

function engine(id: string, version: string, port: number, notices?: NativeEngine["notices"]): NativeEngine {
  const artifact = {
    url: `http://127.0.0.1:${port}/tool`,
    integrity: `sha256-${createHash("sha256").update(BINARY).digest("base64")}` as const,
    format: "raw" as const,
    entries: [{ from: "tool", to: "tool", executable: true }],
  }
  return { id, version, license: "MIT", upstream: "fixture/engine", targets: pins(artifact, "tool"), ...(notices ? { notices } : {}) }
}

function pins(artifact: PinnedArtifact.Artifact, executable: string): NativeEngine["targets"] {
  const pin = { artifact, executable }
  return {
    "darwin-arm64": pin,
    "darwin-x64": pin,
    "linux-arm64": pin,
    "linux-x64": pin,
    "win32-x64": pin,
  }
}

function notice(port: number, filename = "license.txt", integrity?: `sha256-${string}`): NonNullable<NativeEngine["notices"]>[number] {
  return {
    url: `http://127.0.0.1:${port}/license.txt`,
    integrity: integrity ?? (`sha256-${createHash("sha256").update(LICENSE).digest("base64")}` as const),
    filename,
  }
}

const scoped = (root: string, manifest: Record<string, NativeEngine>) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(Effect.provideService(BackendToolkit.Root, root), Effect.provideService(BackendToolkit.Manifest, manifest))

const present = (file: string) => Effect.promise(() => access(file).then(() => true, () => false))

function installDir(root: string, id: string, version: string, target: TargetId) {
  return path.join(root, "engines", id, `${version}-${target}`)
}

it.live("a native install publishes the binary and notice together, and concurrent ensures fetch each artifact once", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const manifest = { buf: engine("buf", "1", f.port, [notice(f.port)]) }
    const run = scoped(f.root, manifest)
    const directory = installDir(f.root, "buf", "1", target)
    const [first, second] = yield* Effect.all([
      BackendToolkit.ensure("buf").pipe(run),
      BackendToolkit.ensure("buf").pipe(run),
    ], { concurrency: 2 })
    expect(first).toEqual({ executable: path.join(directory, "tool") })
    expect(second).toEqual(first)
    expect(yield* PinnedArtifact.installed(directory)).toBe(true)
    expect(yield* Effect.promise(() => readFile(path.join(directory, "notices", "license.txt"), "utf8"))).toBe(LICENSE)
    const installed = yield* Effect.promise(() => readFile(path.join(directory, "tool")))
    expect(installed.byteLength).toBe(BINARY.byteLength)
    for (let index = 0; index < installed.byteLength; index++) {
      const actual = installed[index]
      const expected = BINARY[index]
      if (actual === undefined || expected === undefined) throw new Error("binary byte missing")
      expect(actual).toBe(expected)
    }
    expect(f.hits["/tool"]).toBe(1)
    expect(f.hits["/license.txt"]).toBe(1)
    expect(yield* BackendToolkit.status("buf").pipe(run)).toEqual([
      { engine: "buf", version: "1", target, status: "ready", directory, executable: path.join(directory, "tool") },
    ])
  }), 30_000,
)

it.live("a wrong notice hash publishes no install and no completion marker", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const bad = `sha256-${createHash("sha256").update("other-license").digest("base64")}` as const
    const manifest = { buf: engine("buf", "1", f.port, [notice(f.port, "license.txt", bad)]) }
    const failed = yield* BackendToolkit.ensure("buf").pipe(scoped(f.root, manifest), Effect.flip)
    const directory = installDir(f.root, "buf", "1", target)
    expect(failed.reason).toBe("toolkit-not-ready:failed:buf:integrity-mismatch")
    expect(yield* PinnedArtifact.installed(directory)).toBe(false)
    expect(yield* present(directory)).toBe(false)
    expect(yield* present(path.join(directory, ".complete"))).toBe(false)
    expect(yield* present(path.join(directory, "notices", "license.txt"))).toBe(false)
  }), 30_000,
)

it.live("a missing or modified notice stays not ready and the completed install is not rewritten", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const noticed = (id: string) => engine(id, "1", f.port, [notice(f.port)])
    const run = scoped(f.root, { buf: noticed("buf"), sqlc: noticed("sqlc") })
    yield* BackendToolkit.ensure("buf").pipe(run)
    yield* BackendToolkit.ensure("sqlc").pipe(run)
    const missingDir = installDir(f.root, "buf", "1", target)
    const modifiedDir = installDir(f.root, "sqlc", "1", target)
    const fetches = f.hits["/license.txt"]
    yield* Effect.promise(() => rm(path.join(missingDir, "notices", "license.txt")))
    expect((yield* BackendToolkit.status("buf").pipe(run))[0]?.status).toBe("absent")
    const missing = yield* BackendToolkit.ensure("buf").pipe(run, Effect.flip)
    expect(missing.reason).toBe("toolkit-not-ready:failed:buf:notice-missing")
    expect(yield* PinnedArtifact.installed(missingDir)).toBe(true)
    yield* Effect.promise(() => writeFile(path.join(modifiedDir, "notices", "license.txt"), "changed license\n"))
    expect((yield* BackendToolkit.status("sqlc").pipe(run))[0]?.status).toBe("absent")
    const modified = yield* BackendToolkit.ensure("sqlc").pipe(run, Effect.flip)
    expect(modified.reason).toBe("toolkit-not-ready:failed:sqlc:notice-modified")
    expect(yield* PinnedArtifact.installed(modifiedDir)).toBe(true)
    expect(f.hits["/license.txt"]).toBe(fetches)
  }), 30_000,
)

symlinkCase("final-notice-symlink", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const run = scoped(f.root, { buf: engine("buf", "1", f.port, [notice(f.port)]) })
    yield* BackendToolkit.ensure("buf").pipe(run)
    const directory = installDir(f.root, "buf", "1", target)
    const noticeFile = path.join(directory, "notices", "license.txt")
    const outside = path.join(f.root, "outside-license.txt")
    yield* Effect.promise(async () => {
      await writeFile(outside, LICENSE)
      await rm(noticeFile)
      await symlink(outside, noticeFile)
    })
    expect(yield* Effect.promise(() => readFile(outside, "utf8"))).toBe(LICENSE)
    expect((yield* Effect.promise(() => lstat(noticeFile))).isSymbolicLink()).toBe(true)
    expect((yield* BackendToolkit.status("buf").pipe(run))[0]?.status).not.toBe("ready")
    const failed = yield* BackendToolkit.ensure("buf").pipe(run, Effect.flip)
    expect(failed.reason).toBe("toolkit-not-ready:failed:buf:notice-symlink")
    expect(yield* PinnedArtifact.installed(directory)).toBe(true)
    expect(f.hits["/license.txt"]).toBe(1)
  }), 30_000,
)

symlinkCase("notices-parent-directory-symlink", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const run = scoped(f.root, { buf: engine("buf", "1", f.port, [notice(f.port)]) })
    yield* BackendToolkit.ensure("buf").pipe(run)
    const directory = installDir(f.root, "buf", "1", target)
    const outside = path.join(f.root, "outside")
    const notices = path.join(directory, "notices")
    yield* Effect.promise(async () => {
      await mkdir(outside)
      await writeFile(path.join(outside, "license.txt"), LICENSE)
      await rm(notices, { recursive: true })
      await symlink(outside, notices, "dir")
    })
    expect(yield* Effect.promise(() => readFile(path.join(outside, "license.txt"), "utf8"))).toBe(LICENSE)
    expect((yield* Effect.promise(() => lstat(notices))).isSymbolicLink()).toBe(true)
    expect((yield* BackendToolkit.status("buf").pipe(run))[0]?.status).not.toBe("ready")
    const failed = yield* BackendToolkit.ensure("buf").pipe(run, Effect.flip)
    expect(failed.reason).toBe("toolkit-not-ready:failed:buf:notice-symlink")
    expect(yield* PinnedArtifact.installed(directory)).toBe(true)
    expect(f.hits["/license.txt"]).toBe(1)
  }), 30_000,
)

it.live("malformed notice metadata fails before any fetch and leaves the cache untouched", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const loose = (notices: unknown) => notices as NativeEngine["notices"]
    const url = `http://127.0.0.1:${f.port}/license.txt`
    const cases: NativeEngine["notices"][] = [
      [notice(f.port, "License.txt")],
      [notice(f.port, "../license.txt")],
      [notice(f.port, "notices/license.txt")],
      [notice(f.port), notice(f.port)],
      [notice(f.port, "license.txt", "sha256-not-a-digest")],
      [{ url, integrity: "sha512-aa" as `sha256-${string}`, filename: "license.txt" }],
      loose([{ url, filename: "license.txt" }]),
      loose([{ url, filename: "license.txt", integrity: null }]),
      loose([{ url, filename: "license.txt", integrity: 1 }]),
      loose([null]),
    ]
    for (const [index, notices] of cases.entries()) {
      const id = `bad${index}`
      const before = { ...f.hits }
      const failed = yield* BackendToolkit.ensure<string>(id).pipe(
        scoped(f.root, { [id]: engine(id, "1", f.port, notices) }),
        Effect.flip,
      )
      expect(failed.reason).toBe(`toolkit-not-ready:failed:${id}:notice-invalid`)
      expect(f.hits).toEqual(before)
      expect(yield* present(path.join(f.root, "engines"))).toBe(false)
    }
  }), 30_000,
)

it.live("an engine with no declared notices still becomes ready without a notice directory", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const run = scoped(f.root, { sqlc: engine("sqlc", "1", f.port) })
    const directory = installDir(f.root, "sqlc", "1", target)
    expect(yield* BackendToolkit.ensure("sqlc").pipe(run)).toEqual({ executable: path.join(directory, "tool") })
    expect(yield* PinnedArtifact.installed(directory)).toBe(true)
    expect(yield* present(path.join(directory, "notices"))).toBe(false)
    expect(f.hits).toEqual({ "/tool": 1 })
    expect((yield* BackendToolkit.status("sqlc").pipe(run))[0]?.status).toBe("ready")
  }), 30_000,
)

it.live("an invalid parent notice is refused before its dependency is fetched", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const child = engine("sqlc", "1", f.port)
    const parent = { ...engine("buf", "1", f.port, [notice(f.port, "License.txt")]), dependencies: ["sqlc"] }
    const unrelated = engine("gitleaks", "1", f.port, [notice(f.port, "../license.txt")])
    const manifest = { buf: parent, sqlc: child, gitleaks: unrelated }
    const failed = yield* BackendToolkit.ensure("buf").pipe(scoped(f.root, manifest), Effect.flip)
    expect(failed.reason).toBe("toolkit-not-ready:failed:buf:notice-invalid")
    expect(f.hits).toEqual({})
    expect(yield* present(installDir(f.root, "sqlc", "1", target))).toBe(false)
    expect(yield* present(installDir(f.root, "buf", "1", target))).toBe(false)
    expect(yield* BackendToolkit.ensure("sqlc").pipe(scoped(f.root, manifest))).toEqual({
      executable: path.join(installDir(f.root, "sqlc", "1", target), "tool"),
    })
    expect(f.hits).toEqual({ "/tool": 1 })
  }), 30_000,
)

it.live("duplicate notices on a completed install are not ready", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const installed = engine("buf", "1", f.port, [notice(f.port)])
    yield* BackendToolkit.ensure("buf").pipe(scoped(f.root, { buf: installed }))
    const directory = installDir(f.root, "buf", "1", target)
    const duplicated = { ...installed, notices: [notice(f.port), notice(f.port)] }
    const run = scoped(f.root, { buf: duplicated })
    const fetches = f.hits["/license.txt"]
    expect((yield* BackendToolkit.status("buf").pipe(run))[0]?.status).toBe("absent")
    const failed = yield* BackendToolkit.ensure("buf").pipe(run, Effect.flip)
    expect(failed.reason).toBe("toolkit-not-ready:failed:buf:notice-invalid")
    expect(yield* PinnedArtifact.installed(directory)).toBe(true)
    expect(f.hits["/license.txt"]).toBe(fetches)
  }), 30_000,
)

it.live("a notice destination that collides with the executable or an artifact entry is refused before fetch", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const base = engine("buf", "1", f.port, [notice(f.port)])
    const occupy = (executable: string, entryTo: string) => {
      const artifact: PinnedArtifact.Artifact = {
        ...base.targets["linux-x64"].artifact,
        entries: [{ from: "tool", to: entryTo, executable: true }],
      }
      return { ...base, targets: pins(artifact, executable) }
    }
    for (const [index, occupied] of [
      occupy("notices/license.txt", "tool"),
      occupy("tool", "notices"),
      occupy("tool", "notices/license.txt"),
    ].entries()) {
      const id = `collide${index}`
      const before = { ...f.hits }
      const failed = yield* BackendToolkit.ensure<string>(id).pipe(
        scoped(f.root, { [id]: { ...occupied, id } }),
        Effect.flip,
      )
      expect(failed.reason).toBe(`toolkit-not-ready:failed:${id}:notice-invalid`)
      expect(f.hits).toEqual(before)
      expect(yield* present(installDir(f.root, id, "1", target))).toBe(false)
    }
    const folded = target === "win32-x64" || target.startsWith("darwin-")
    const caseId = "casefold"
    const before = { ...f.hits }
    const caseEngine = { ...occupy("Notices/license.txt", "Notices/license.txt"), id: caseId }
    if (folded) {
      const failed = yield* BackendToolkit.ensure<string>(caseId).pipe(scoped(f.root, { [caseId]: caseEngine }), Effect.flip)
      expect(failed.reason).toBe(`toolkit-not-ready:failed:${caseId}:notice-invalid`)
      expect(f.hits).toEqual(before)
      return
    }
    expect(yield* BackendToolkit.ensure<string>(caseId).pipe(scoped(f.root, { [caseId]: caseEngine }))).toEqual({
      executable: path.join(installDir(f.root, caseId, "1", target), "Notices/license.txt"),
    })
  }), 30_000,
)
