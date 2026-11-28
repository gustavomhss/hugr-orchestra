// DRAFT for lead authorization; copy only to packages/core/test/review-toolkit/kubeconform-p0a.test.ts.
// Existing preparation measurement only. No Lucy runner, schema validation or analysis qualification.
// Companion source inventory belongs at packages/core/test/fixture/kubeconform-p0a.sources.json.
import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { BackendToolkitManifest } from "../../src/backend-toolkit/manifest"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { PinnedArtifact } from "../../src/pinned-artifact"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { scan } from "../../script/toolkit-floors"
import sources from "../fixture/kubeconform-p0a.sources.json"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex")
const strict = { onExcessProperty: "error" } as const
const Module = Schema.Struct({
  Path: Schema.String, Version: Schema.optional(Schema.String), Sum: Schema.optional(Schema.String),
  Replace: Schema.optional(Schema.Unknown),
})
const BuildInfo = Schema.Struct({
  GoVersion: Schema.String, Path: Schema.String, Main: Module, Deps: Schema.Array(Module),
  Settings: Schema.Array(Schema.Struct({ Key: Schema.String, Value: Schema.optional(Schema.String) })),
})
const text = (data: Uint8Array) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data)
const evidenceRoot = path.resolve(import.meta.dir, "../../../../test-ci-evidence/kubeconform-p0a")

function assertNative(outcome: ResearchProcess.Outcome) {
  expect(outcome.failure).toBeUndefined()
  expect(outcome.timedOut).toBe(false)
  expect(outcome.overflow).toBe(false)
  expect(outcome.memoryExceeded).toBe(false)
  expect(outcome.stdout.truncated).toBe(false)
  expect(outcome.stderr.truncated).toBe(false)
  expect(outcome.stdout.bytes).toBe(outcome.stdout.data.length)
  expect(outcome.stderr.bytes).toBe(outcome.stderr.data.length)
  expect(outcome.exitCode).toBe(0)
  expect(outcome.stderr.data.length).toBe(0)
}

async function retain(relative: string, data: Uint8Array | string) {
  const file = path.join(evidenceRoot, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, data)
}

async function fetched(url: string, maxBytes: number) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`P0A source response ${response.status}: ${url}`)
  const data = new Uint8Array(await response.arrayBuffer())
  if (data.byteLength > maxBytes) throw new Error(`P0A source response exceeds bound: ${url}`)
  return data
}

it.live("P0A kubeconform 0.8.0 Linux x64: real provisioner, executable bytes, -v and linked source inventory", () =>
  Effect.gen(function* () {
    expect(process.platform).toBe("linux")
    expect(process.arch).toBe("x64")
    expectSpawn(import.meta.path)
    const temp = yield* Effect.acquireRelease(Effect.promise(tmpdir), (item) => Effect.promise(() => item[Symbol.asyncDispose]()))
    const root = path.join(temp.path, "toolkit")
    const probe = path.join(temp.path, "probe")
    yield* Effect.promise(() => mkdir(probe))
    yield* Effect.promise(() => retain("provenance.json", JSON.stringify({
      schema: "kubeconform-p0a-provenance-v1", upstream: sources.upstream, baseline: sources.baseline,
      workflowSHA: process.env.GITHUB_SHA, runID: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
      platform: process.platform, arch: process.arch, analysisQualified: false,
    }, null, 2) + "\n"))
    yield* Effect.promise(() => retain("sources.json", JSON.stringify(sources, null, 2) + "\n"))

    const pin = BackendToolkitManifest.ENGINES.kubeconform
    const artifact = pin.targets["linux-x64"].artifact
    expect(pin.version).toBe("0.8.0")
    expect(sources.release.url).toBe(artifact.url)
    expect(sources.release.integrity).toBe(artifact.integrity)
    expect(artifact.entries).toEqual([{ from: "kubeconform", to: "kubeconform", executable: true }])

    // Real existing installation; no Manifest, Target, Machine or downloader replacement.
    const ready = yield* BackendToolkit.ensure("kubeconform").pipe(Effect.provideService(BackendToolkit.Root, root))
    const executable = yield* Effect.promise(() => realpath(ready.executable))
    const state = yield* BackendToolkit.status("kubeconform").pipe(Effect.provideService(BackendToolkit.Root, root))
    expect(state).toEqual([expect.objectContaining({
      engine: "kubeconform", version: "0.8.0", target: "linux-x64", status: "ready", executable,
    })])
    expect(executable).toBe(path.join(root, "engines/kubeconform/0.8.0-linux-x64/kubeconform"))
    const metadata = yield* Effect.promise(() => lstat(executable))
    expect(metadata.isFile()).toBe(true)
    expect(metadata.isSymbolicLink()).toBe(false)
    expect(metadata.nlink).toBe(1)
    expect(metadata.size).toBeGreaterThan(0)
    expect(metadata.size).toBeLessThanOrEqual(64 * 1024 * 1024)
    const binary = yield* Effect.promise(() => readFile(executable))
    const executableSHA256 = hash(binary)
    const floor = scan("kubeconform", binary) // Pure existing scanner; never calls the toolkit-floors CLI.
    expect(floor?.format).toBe("elf")
    expect(floor?.needs).toEqual(pin.floor["linux-x64"])
    expect(binary.readUInt16LE(18)).toBe(62) // ELF EM_X86_64.
    yield* Effect.promise(() => retain("executable.json", JSON.stringify({
      sha256: executableSHA256, bytes: binary.length, magic: binary.subarray(0, 4).toString("hex"),
      machine: binary.readUInt16LE(18), floor, enginePin: { version: pin.version, ...sources.release },
    }, null, 2) + "\n"))

    const env = {
      PATH: "/usr/bin:/bin", HOME: probe, USERPROFILE: probe, APPDATA: probe, LOCALAPPDATA: probe,
      TMPDIR: probe, TMP: probe, TEMP: probe, LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
      GOENV: "off", GOTOOLCHAIN: "local", GOWORK: "off", GOPROXY: "off", GOSUMDB: "off",
      GOCACHE: path.join(probe, "go-cache"), GOMODCACHE: path.join(probe, "go-modules"),
    }
    const run = (name: string, command: string, args: readonly string[], maxBytes: number, extraEnv: Record<string, string> = {}) =>
      ResearchProcess.run({ command, args, cwd: probe, env: { ...env, ...extraEnv },
        timeoutMs: 30_000, maxBytes, maxRssBytes: 256 * 1024 * 1024 }).pipe(Effect.tap((outcome) =>
        Effect.promise(() => retain(`process/${name}.json`, JSON.stringify({
          command, args, exitCode: outcome.exitCode, durationMs: outcome.durationMs,
          timedOut: outcome.timedOut, overflow: outcome.overflow, memoryExceeded: outcome.memoryExceeded,
          failure: outcome.failure,
          stdout: { bytes: outcome.stdout.bytes, retainedBytes: outcome.stdout.data.length, truncated: outcome.stdout.truncated, sha256: hash(outcome.stdout.data) },
          stderr: { bytes: outcome.stderr.bytes, retainedBytes: outcome.stderr.data.length, truncated: outcome.stderr.truncated, sha256: hash(outcome.stderr.data) },
        }, null, 2) + "\n")),
      ))

    const version = yield* run("kubeconform-version", executable, ["-v"], 4096)
    yield* Effect.promise(() => retain("kubeconform-version.stdout", version.stdout.data))
    yield* Effect.promise(() => retain("kubeconform-version.stderr", version.stderr.data))
    assertNative(version)
    expect(text(version.stdout.data)).toBe("v0.8.0\n")
    expect(hash(yield* Effect.promise(() => readFile(executable)))).toBe(executableSHA256)

    // Retain the exact archive through the existing verifier too. This second download permits member inventory
    // without changing production extraction entries. Only notice bytes and metadata are uploaded, never binaries.
    const archiveRoot = path.join(temp.path, "release-archive")
    const raw: PinnedArtifact.Artifact = { url: artifact.url, integrity: artifact.integrity, format: "raw",
      entries: [{ from: "kubeconform-linux-amd64.tar.gz", to: "release.tar.gz" }] }
    yield* PinnedArtifact.install(archiveRoot, [raw])
    const archivePath = path.join(archiveRoot, "release.tar.gz")
    const archiveBytes = yield* Effect.promise(() => readFile(archivePath))
    expect(hash(archiveBytes)).toBe(sources.release.sha256)
    expect(archiveBytes.length).toBe(sources.release.bytes)
    const list = yield* run("archive-members", "tar", ["-tzf", archivePath], 64 * 1024)
    assertNative(list)
    yield* Effect.promise(() => retain("release-members.txt", list.stdout.data))
    const members = text(list.stdout.data).split("\n").filter(Boolean)
    expect(members).toContain(sources.release.member)
    expect(members.every((name) => !name.startsWith("/") && !name.includes("\0") &&
      !name.split("/").some((part) => part === ".."))).toBe(true)
    const member = yield* run("archive-executable", "tar", ["-xOf", archivePath, sources.release.member], 64 * 1024 * 1024)
    assertNative(member)
    expect(member.stdout.data.length).toBe(binary.length)
    expect(hash(member.stdout.data)).toBe(executableSHA256)

    const distributedNotices: Array<{ member: string; bytes: number; sha256: string; artifact: string }> = []
    for (const name of members.filter((name) => /^(?:LICENSE|LICENCE|COPYING|NOTICE|PATENTS|COPYRIGHT)(?:[._-].*)?$/i.test(path.posix.basename(name)))) {
      const body = yield* run(`release-notice-${distributedNotices.length}`, "tar", ["-xOf", archivePath, name], 128 * 1024)
      assertNative(body)
      expect(body.stdout.data.length).toBeGreaterThan(0)
      const artifact = `release-notices/${distributedNotices.length}.txt`
      yield* Effect.promise(() => retain(artifact, body.stdout.data))
      distributedNotices.push({ member: name, bytes: body.stdout.data.length, sha256: hash(body.stdout.data), artifact })
    }
    yield* Effect.promise(() => retain("release-notices.json", JSON.stringify(distributedNotices, null, 2) + "\n"))

    // Source files are pinned to the resolved upstream commit and independently checked against their Git blob.
    // This is a retained source inventory, not a claim that production already installs these notices.
    const noticeRoot = path.join(temp.path, "upstream-source")
    const sourceArtifacts = sources.files.map((source): PinnedArtifact.Artifact => ({
      url: source.url, integrity: `sha256-${Buffer.from(source.sha256, "hex").toString("base64")}`, format: "raw",
      entries: [{ from: path.posix.basename(source.path), to: source.path }],
    }))
    yield* PinnedArtifact.install(noticeRoot, sourceArtifacts)
    for (const source of sources.files) {
      const bytes = yield* Effect.promise(() => readFile(path.join(noticeRoot, source.path)))
      expect(bytes.length).toBe(source.bytes)
      expect(hash(bytes)).toBe(source.sha256)
      const gitBlob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
      expect(gitBlob).toBe(source.gitBlob)
      yield* Effect.promise(() => retain(`source/${source.path}`, bytes))
    }

    // Existing pinned Go is the inspection tool, not kubeconform's compiler/runtime identity.
    const reader = BackendToolkitManifest.RUNTIMES.go
    expect(reader.version).toBe(sources.reader.version)
    expect(reader.targets["linux-x64"].artifact.url).toBe(sources.reader.url)
    expect(sources.reader.integrity).toBe(reader.targets["linux-x64"].artifact.integrity)
    const readerRoot = path.join(temp.path, "go-reader")
    yield* PinnedArtifact.install(readerRoot, [reader.targets["linux-x64"].artifact])
    const readerExe = path.join(readerRoot, reader.targets["linux-x64"].executable)
    const readerBytes = yield* Effect.promise(() => readFile(readerExe))
    const readerVersion = yield* run("go-reader-version", readerExe, ["version"], 4096, { GOROOT: readerRoot })
    assertNative(readerVersion)
    expect(text(readerVersion.stdout.data)).toBe("go version go1.25.14 linux/amd64\n")
    yield* Effect.promise(() => retain("reader-version.stdout", readerVersion.stdout.data))
    for (const source of sources.reader.files) {
      const bytes = yield* Effect.promise(() => readFile(path.join(readerRoot, source.path)))
      expect(hash(bytes)).toBe(source.sha256)
      yield* Effect.promise(() => retain(`reader-notices/${source.path}`, bytes))
    }
    const info = yield* run("build-info", readerExe, ["version", "-m", "-json", executable], 256 * 1024, { GOROOT: readerRoot })
    yield* Effect.promise(() => retain("build-info.json", info.stdout.data))
    yield* Effect.promise(() => retain("build-info.stderr", info.stderr.data))
    assertNative(info)
    const decoded = Schema.decodeUnknownSync(Schema.fromJsonString(BuildInfo))(text(info.stdout.data), strict)
    expect(decoded.Path).toBe("github.com/yannh/kubeconform/cmd/kubeconform")
    expect(decoded.Main.Path).toBe("github.com/yannh/kubeconform")
    expect(decoded.Main.Replace).toBeUndefined()
    expect(decoded.GoVersion).toMatch(/^go1\.[0-9]+\.[0-9]+$/)
    expect(decoded.Deps.length).toBeGreaterThan(0)
    const settings = Object.fromEntries(decoded.Settings.map((item) => [item.Key, item.Value]))
    expect(settings.GOOS).toBe("linux")
    expect(settings.GOARCH).toBe("amd64")
    expect(settings.CGO_ENABLED).toBe("0")
    const linked = decoded.Deps.map((dependency) => {
      expect(dependency.Replace).toBeUndefined()
      const candidate = sources.modules.find((module) => module.path === dependency.Path && module.version === dependency.Version)
      expect(candidate).toBeDefined()
      if (!candidate) throw new Error(`unmapped linked module: ${dependency.Path}@${dependency.Version}`)
      expect(candidate.noticePaths.length).toBeGreaterThan(0)
      if (dependency.Sum !== undefined) expect(dependency.Sum).toBe(candidate.sourceSum)
      return { ...dependency, sourceCandidate: candidate }
    })

    // The first native measurement observed go1.26.3 before its unauthenticated tag lookup received HTTP 403.
    // Resolve that observed tag once through the primary source; the hosted run downloads only its pinned notices.
    expect(decoded.GoVersion).toBe(sources.compiler.version)
    yield* Effect.promise(() => retain("compiler-source-pin.json", JSON.stringify(sources.compiler, null, 2) + "\n"))
    const compilerNotices: Array<{ path: string; url: string; commit: string; bytes: number; sha256: string }> = []
    for (const source of sources.compiler.files) {
      const bytes = yield* Effect.promise(() => fetched(source.url, 128 * 1024))
      expect(bytes.length).toBeGreaterThan(0)
      expect(bytes.length).toBe(source.bytes)
      expect(hash(bytes)).toBe(source.sha256)
      const gitBlob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
      expect(gitBlob).toBe(source.gitBlob)
      yield* Effect.promise(() => retain(`compiler-notices/${source.path}`, bytes))
      compilerNotices.push({ path: source.path, url: source.url, commit: sources.compiler.sourceCommit, bytes: bytes.length, sha256: hash(bytes) })
    }

    const warm = yield* BackendToolkit.ensure("kubeconform").pipe(Effect.provideService(BackendToolkit.Root, root))
    expect(warm.executable).toBe(executable)
    expect(hash(yield* Effect.promise(() => readFile(executable)))).toBe(executableSHA256)
    const report = {
      schema: "kubeconform-p0a-measurement-v1",
      scope: "existing Linux x64 preparation and source inventory only",
      platform: process.platform, arch: process.arch, workflowSHA: process.env.GITHUB_SHA,
      source: sources.upstream, release: sources.release,
      executable: { sha256: executableSHA256, bytes: binary.length, version: text(version.stdout.data), floor },
      reader: { ...sources.reader, executableSha256: hash(readerBytes), version: text(readerVersion.stdout.data) },
      buildInfo: decoded, sourceModules: linked, distributedNotices, compilerNotices,
      sourceInventoryFiles: sources.files, installedProductionNoticesDeclared: "notices" in pin,
      vcsMatchesSource: settings["vcs.revision"] === undefined ? null : settings["vcs.revision"] === sources.upstream.commit,
      signatureAttestationVerified: false, noticeDistributionClosed: false, analysisQualified: false,
    }
    yield* Effect.promise(() => retain("measurement.json", JSON.stringify(report, null, 2) + "\n"))
    console.info("[kubeconform P0A]", JSON.stringify({
      executableSHA256, executableBytes: binary.length, version: text(version.stdout.data).trim(),
      compiler: decoded.GoVersion, linkedModules: linked.length, sourceNotices: sources.files.filter((item) => item.kind === "notice").length,
      releaseNotices: distributedNotices.length, compilerNotices: compilerNotices.length,
      analysisQualified: false, noticeDistributionClosed: false,
    }))
  }), 600_000)

