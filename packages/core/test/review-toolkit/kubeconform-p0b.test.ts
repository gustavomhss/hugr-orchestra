// Temporary Linux-only hosted measurement. Never merge into the normal multihost Core suite.
// Foreign distributions are read as data; this file never launches a kubeconform executable.
import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Cause, Effect, Exit, Schema } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { BackendToolkitManifest } from "../../src/backend-toolkit/manifest"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { PinnedArtifact } from "../../src/pinned-artifact"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { scan } from "../../script/toolkit-floors"
import sources from "../fixture/kubeconform-p0b.sources.json"
import sourceInventory from "../fixture/kubeconform-p0a.sources.json"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const repository = path.resolve(import.meta.dir, "../../../..")
const evidenceRoot = path.join(repository, "test-ci-evidence/kubeconform-p0b")
const previousRoot = path.join(repository, "docs/specs/lucy/evidence/kubeconform-p0a/run-46103282827/artifact")
const strict = { onExcessProperty: "error" } as const
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex")
const text = (data: Uint8Array) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data)
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n"
const Target = Schema.Literals(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"])
type Target = typeof Target.Type
const Module = Schema.Struct({
  Path: Schema.String, Version: Schema.optional(Schema.String), Sum: Schema.optional(Schema.String),
  Replace: Schema.optional(Schema.Unknown),
})
const BuildInfo = Schema.Struct({
  GoVersion: Schema.String, Path: Schema.String, Main: Module, Deps: Schema.Array(Module),
  Settings: Schema.Array(Schema.Struct({ Key: Schema.String, Value: Schema.optional(Schema.String) })),
})
type BuildInfo = typeof BuildInfo.Type
const Notice = Schema.Struct({ member: Schema.String, bytes: Schema.Number, sha256: Schema.String, artifact: Schema.String })
type Notice = typeof Notice.Type
const Previous = Schema.Struct({
  schema: Schema.Literal("kubeconform-p0a-measurement-v1"), scope: Schema.String,
  platform: Schema.Literal("linux"), arch: Schema.Literal("x64"), workflowSHA: Schema.String,
  source: Schema.Unknown, release: Schema.Unknown,
  executable: Schema.Struct({ sha256: Schema.String, bytes: Schema.Number, version: Schema.String, floor: Schema.Unknown }),
  reader: Schema.Unknown, buildInfo: BuildInfo, sourceModules: Schema.Array(Schema.Unknown),
  distributedNotices: Schema.Array(Notice), compilerNotices: Schema.Array(Schema.Unknown),
  sourceInventoryFiles: Schema.Array(Schema.Unknown), installedProductionNoticesDeclared: Schema.Boolean,
  vcsMatchesSource: Schema.NullOr(Schema.Boolean), signatureAttestationVerified: Schema.Boolean,
  noticeDistributionClosed: Schema.Boolean, analysisQualified: Schema.Boolean,
})
type Origin =
  | { kind: "this-run"; workflowSHA: string; runID: string; attempt: string }
  | { kind: "p0a2"; source: string; snapshot: string; runID: number; artifactID: number }
type Observation = {
  target: Target
  origin: Origin
  archive: { url: string; sha256: string; bytes: number }
  executable: { sha256: string; bytes: number }
  buildInfoArtifact: { path: string; sha256: string; bytes: number }
  buildInfo: BuildInfo
  distributedNotices: readonly Notice[]
}
type Operation =
  | { kind: "reader-version" }
  | { kind: "build-info"; file: string }
  | { kind: "list"; format: "tar.gz" | "zip"; archive: string }
  | { kind: "executable-member" | "notice-member"; format: "tar.gz" | "zip"; archive: string; member: string }

async function retain(relative: string, data: Uint8Array | string) {
  const file = path.join(evidenceRoot, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, data)
}

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

function assertBytes(data: Uint8Array, pin: { bytes: number; sha256: string; gitBlob?: string }) {
  expect(data.byteLength).toBe(pin.bytes)
  expect(hash(data)).toBe(pin.sha256)
  if (pin.gitBlob !== undefined)
    expect(createHash("sha1").update(`blob ${data.byteLength}\0`).update(data).digest("hex")).toBe(pin.gitBlob)
}

function safeMember(name: string) {
  const parts = name.replace(/\/$/, "").split("/")
  return name.length > 0 && !/[\x00-\x1f\x7f\\:*?\[\]]/.test(name) &&
    !name.startsWith("/") && parts.every((part) => part !== "" && part !== "." && part !== "..")
}

function header(bytes: Buffer): Record<string, string | number | boolean> {
  if (bytes.length < 64) return { format: "short", bytes: bytes.length }
  if (bytes.readUInt32BE(0) === 0x7f454c46) return {
    format: "elf", class: bytes[4] === 2 ? 64 : 32, endianness: bytes[5] === 1 ? "little" : "big",
    machine: bytes[5] === 1 ? bytes.readUInt16LE(18) : bytes.readUInt16BE(18),
  }
  if (bytes.readUInt32LE(0) === 0xfeedfacf) return {
    format: "macho", class: 64, endianness: "little", magic: bytes.readUInt32LE(0),
    cpuType: bytes.readUInt32LE(4), fileType: bytes.readUInt32LE(12), universalPermitted: false,
  }
  if (bytes.readUInt16LE(0) === 0x5a4d) {
    const offset = bytes.readUInt32LE(0x3c)
    if (offset >= 64 && offset <= bytes.length - 26 && bytes.readUInt32LE(offset) === 0x4550) return {
      format: "pe", class: bytes.readUInt16LE(offset + 24) === 0x20b ? 64 : 32,
      machine: bytes.readUInt16LE(offset + 4), optionalMagic: bytes.readUInt16LE(offset + 24),
    }
  }
  return { format: "unsupported", magic: bytes.subarray(0, 8).toString("hex") }
}

function environment(value: string | undefined, name: string) {
  if (!value) throw new Error(`P0B requires hosted ${name}`)
  return value
}

function unresolved(observation: Observation) {
  const info = observation.buildInfo
  const problems: Array<{ target: Target; component: string; reason: string }> = []
  const reject = (component: string, reason: string) => problems.push({ target: observation.target, component, reason })
  const settings = Object.fromEntries(info.Settings.map((item) => [item.Key, item.Value]))
  const target = sources.targets.find((item) => item.target === observation.target)
  if (!target) throw new Error(`P0B missing frozen target ${observation.target}`)
  if (new Set(info.Settings.map((item) => item.Key)).size !== info.Settings.length) reject("settings", "duplicate-key")
  for (const [key, value] of Object.entries(target.expectedBuildSettings))
    if (settings[key] !== value) reject(key, `expected:${value};observed:${settings[key] ?? "missing"}`)
  if (info.Path !== "github.com/yannh/kubeconform/cmd/kubeconform") reject("main", "package-path-mismatch")
  if (info.Main.Path !== "github.com/yannh/kubeconform" || info.Main.Version !== sources.upstream.tag)
    reject("main", "module-or-release-mismatch")
  if (info.Main.Replace !== undefined) reject("main", "replacement-unmapped")
  if (info.Main.Sum !== undefined) reject("main", "binary-sum-has-no-reviewed-source-pin")
  if (settings["vcs.revision"] !== undefined && settings["vcs.revision"] !== sources.upstream.commit)
    reject("main", "vcs-revision-mismatch")
  if (settings["vcs.modified"] !== undefined && settings["vcs.modified"] !== "false") reject("main", "vcs-modified")
  if (!sources.knownCompilerSources.some((item) => item.version === info.GoVersion))
    reject(info.GoVersion, "compiler-source-unmapped")
  if (info.Deps.length === 0) reject("dependencies", "no-embedded-module-inventory")
  if (new Set(info.Deps.map((item) => item.Path)).size !== info.Deps.length) reject("dependencies", "duplicate-module")
  for (const dependency of info.Deps) {
    const identity = `${dependency.Path}@${dependency.Version ?? "missing"}`
    const candidate = sourceInventory.modules.find((item) => item.path === dependency.Path && item.version === dependency.Version)
    if (dependency.Replace !== undefined) reject(identity, "replacement-unmapped")
    if (!candidate) { reject(identity, "module-source-unmapped"); continue }
    if (dependency.Sum !== undefined && dependency.Sum !== candidate.sourceSum) reject(identity, "binary-source-sum-mismatch")
    if (candidate.noticePaths.length === 0 || candidate.noticePaths.some((file) =>
      !sourceInventory.files.some((item) => item.kind === "notice" && item.path === file))) reject(identity, "notice-source-unmapped")
  }
  return problems
}

it.live("P0B kubeconform 0.8.0: real four-target prefetch and static five-distribution notice inventory", () => {
  const observations: Observation[] = []
  const prefetched: Target[] = []
  return Effect.gen(function* () {
    expect(process.platform).toBe("linux")
    expect(process.arch).toBe("x64")
    expectSpawn(import.meta.path)
    const origin: Origin = {
      kind: "this-run", workflowSHA: environment(process.env.GITHUB_SHA, "GITHUB_SHA"),
      runID: environment(process.env.GITHUB_RUN_ID, "GITHUB_RUN_ID"),
      attempt: environment(process.env.GITHUB_RUN_ATTEMPT, "GITHUB_RUN_ATTEMPT"),
    }
    const temp = yield* Effect.acquireRelease(Effect.promise(tmpdir), (item) => Effect.promise(() => item[Symbol.asyncDispose]()))
    const toolkitRoot = path.join(temp.path, "toolkit")
    const probe = path.join(temp.path, "probe")
    yield* Effect.promise(() => mkdir(probe))
    yield* Effect.promise(() => rm(evidenceRoot, { recursive: true, force: true }))
    const inputBytes = yield* Effect.promise(() => readFile(new URL("../fixture/kubeconform-p0b.sources.json", import.meta.url)))
    yield* Effect.promise(() => retain("sources.json", inputBytes))
    yield* Effect.promise(() => retain("provenance.json", json({
      schema: "kubeconform-p0b-provenance-v1", origin, inventorySha256: hash(inputBytes),
      parent: sources.inventoryAnchor.measurementParent, parentTree: sources.inventoryAnchor.measurementParentTree,
      platform: process.platform, arch: process.arch, upstream: sources.upstream,
      ...sources.claimLimits, nativeQualificationChanged: false,
    })))
    for (const pin of sources.inventoryAnchor.unchangedFiles) {
      const data = yield* Effect.promise(() => readFile(path.join(repository, pin.path)))
      expect(hash(data)).toBe(pin.sha256)
      expect(createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex")).toBe(pin.gitBlob)
    }

    // Reuse actual retained P0A2 bytes. The historical planning baseline is never the new workflow identity.
    for (const pin of sources.previousLinuxEvidence.files) {
      const data = yield* Effect.promise(() => readFile(path.join(repository, pin.path)))
      assertBytes(data, pin)
      yield* Effect.promise(() => retain(`prior-linux/${path.basename(pin.path)}`, data))
    }
    const inventoryBytes = yield* Effect.promise(() => readFile(path.join(repository, sources.sourceInventoryReference.path)))
    expect(hash(inventoryBytes)).toBe(sources.sourceInventoryReference.sha256)
    expect(Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(text(inventoryBytes))).toEqual(sourceInventory)
    const previous = Schema.decodeUnknownSync(Schema.fromJsonString(Previous))(
      text(yield* Effect.promise(() => readFile(path.join(previousRoot, "measurement.json")))), strict)
    const previousInfoBytes = yield* Effect.promise(() => readFile(path.join(previousRoot, "build-info.json")))
    const previousInfo = Schema.decodeUnknownSync(Schema.fromJsonString(BuildInfo))(text(previousInfoBytes), strict)
    expect(previous.workflowSHA).toBe(sources.previousLinuxEvidence.snapshot)
    expect(previous.source).toEqual(sources.upstream)
    expect(previous.buildInfo).toEqual(previousInfo)
    expect(previous.executable.version).toBe("v0.8.0\n")
    const linux = sources.targets.find((item) => item.target === "linux-x64")
    if (!linux) throw new Error("P0B has no prior Linux target")
    if (linux.executableSha256 === null || linux.executableBytes === null) throw new Error("P0B prior Linux identity is missing")
    expect(previous.executable.sha256).toBe(linux.executableSha256)
    expect(previous.executable.bytes).toBe(linux.executableBytes)
    expect(previous.release).toEqual({
      target: linux.target, url: linux.archive.url, bytes: linux.archive.bytes,
      sha256: linux.archive.sha256, integrity: linux.archive.integrity, member: linux.member,
    })
    for (const notice of previous.distributedNotices) {
      expect(safeMember(notice.artifact)).toBe(true)
      const data = yield* Effect.promise(() => readFile(path.join(previousRoot, notice.artifact)))
      expect(data.length).toBeLessThanOrEqual(128 * 1024)
      assertBytes(data, notice)
      yield* Effect.promise(() => retain(`prior-linux/${notice.artifact}`, data))
    }
    observations.push({
      target: "linux-x64", origin: { kind: "p0a2", source: sources.previousLinuxEvidence.source,
        snapshot: sources.previousLinuxEvidence.snapshot, runID: sources.previousLinuxEvidence.runID,
        artifactID: sources.previousLinuxEvidence.artifactID },
      archive: { url: linux.archive.url, sha256: linux.archive.sha256, bytes: linux.archive.bytes },
      executable: { sha256: previous.executable.sha256, bytes: previous.executable.bytes },
      buildInfoArtifact: { path: "prior-linux/build-info.json", sha256: hash(previousInfoBytes), bytes: previousInfoBytes.length },
      buildInfo: previousInfo, distributedNotices: previous.distributedNotices.map((notice) => ({
        ...notice, artifact: `prior-linux/${notice.artifact}`,
      })),
    })

    const reader = BackendToolkitManifest.RUNTIMES.go
    expect(reader.version).toBe(sources.reader.version)
    expect(sources.reader.url).toBe(reader.targets["linux-x64"].artifact.url)
    expect(sources.reader.integrity).toBe(reader.targets["linux-x64"].artifact.integrity)
    const readerRoot = path.join(temp.path, "go-reader")
    yield* PinnedArtifact.install(readerRoot, [reader.targets["linux-x64"].artifact])
    const readerExe = path.join(readerRoot, reader.targets["linux-x64"].executable)
    const readerBytes = yield* Effect.promise(() => readFile(readerExe))
    expect(hash(readerBytes)).toBe(sources.reader.expectedExecutableSha256)
    const env = {
      PATH: "/usr/bin:/bin", HOME: probe, USERPROFILE: probe, APPDATA: probe, LOCALAPPDATA: probe,
      TMPDIR: probe, TMP: probe, TEMP: probe, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", GOROOT: readerRoot,
      GOENV: "off", GOTOOLCHAIN: "local", GOWORK: "off", GOPROXY: "off", GOSUMDB: "off",
      GOCACHE: path.join(probe, "go-cache"), GOMODCACHE: path.join(probe, "go-modules"),
    }
    // The command set is closed: the Linux reader, tar and unzip. A target executable is only a reader argument.
    const run = (name: string, operation: Operation) => {
      const command = operation.kind === "reader-version" || operation.kind === "build-info" ? readerExe
        : operation.format === "zip" ? "unzip" : "tar"
      const args = operation.kind === "reader-version" ? ["version"]
        : operation.kind === "build-info" ? ["version", "-m", "-json", operation.file]
        : operation.kind === "list" ? [operation.format === "zip" ? "-Z1" : "-tzf", operation.archive]
        : [operation.format === "zip" ? "-p" : "-xOf", operation.archive, operation.member]
      const maxBytes = operation.kind === "reader-version" ? 4096 : operation.kind === "build-info" ? 256 * 1024
        : operation.kind === "list" ? 64 * 1024 : operation.kind === "executable-member" ? 64 * 1024 * 1024 : 128 * 1024
      return ResearchProcess.run({ command, args, cwd: probe, env, timeoutMs: 30_000, maxBytes,
        maxRssBytes: 256 * 1024 * 1024 }).pipe(Effect.tap((outcome) => Effect.promise(async () => {
        await retain(`process/${name}.json`, json({
          operation, command, args, exitCode: outcome.exitCode, durationMs: outcome.durationMs,
          timedOut: outcome.timedOut, overflow: outcome.overflow, memoryExceeded: outcome.memoryExceeded, failure: outcome.failure,
          stdout: { bytes: outcome.stdout.bytes, retainedBytes: outcome.stdout.data.length,
            truncated: outcome.stdout.truncated, sha256: hash(outcome.stdout.data) },
          stderr: { bytes: outcome.stderr.bytes, retainedBytes: outcome.stderr.data.length,
            truncated: outcome.stderr.truncated, sha256: hash(outcome.stderr.data) },
        }))
        await retain(`process/${name}.stderr`, outcome.stderr.data)
        if (operation.kind !== "executable-member") await retain(`process/${name}.stdout`, outcome.stdout.data)
      })))
    }
    const version = yield* run("go-reader-version", { kind: "reader-version" })
    assertNative(version)
    expect(text(version.stdout.data)).toBe("go version go1.25.14 linux/amd64\n")
    yield* Effect.promise(() => retain("reader.json", json({ ...sources.reader,
      executableSha256: hash(readerBytes), executableBytes: readerBytes.length, observedVersion: text(version.stdout.data) })))
    for (const pin of sources.reader.files) {
      const data = yield* Effect.promise(() => readFile(path.join(readerRoot, pin.path)))
      assertBytes(data, pin)
      yield* Effect.promise(() => retain(`reader-notices/${pin.path}`, data))
    }

    const pin = BackendToolkitManifest.ENGINES.kubeconform
    expect(pin.version).toBe("0.8.0")
    const foreign = sources.targets.filter((item) => item.target !== "linux-x64")
    expect(foreign.map((item) => item.target)).toEqual(["darwin-arm64", "darwin-x64", "linux-arm64", "win32-x64"])
    for (const record of foreign) {
      const target = Schema.decodeUnknownSync(Target)(record.target)
      const selected = pin.targets[target]
      const format = Schema.decodeUnknownSync(Schema.Literals(["tar.gz", "zip"]))(record.archive.format)
      expect(record.archive.url).toBe(selected.artifact.url)
      expect(record.archive.integrity).toBe(selected.artifact.integrity)
      expect(selected.artifact.format).toBe(format)
      expect(selected.artifact.entries).toHaveLength(1)
      expect(record.member).toBe(selected.artifact.entries[0].from)
      expect(record.member).toBe(selected.artifact.entries[0].to)
      expect(selected.artifact.entries[0].executable).toBe(true)
      expect(record.executableSha256).toBeNull()
      expect(record.executableBytes).toBeNull()
      // Exactly four genuine cross-target calls; no Target, Machine, Manifest, downloader or process replacement.
      prefetched.push(target)
      const states = yield* BackendToolkit.prefetch(["kubeconform"], target).pipe(Effect.provideService(BackendToolkit.Root, toolkitRoot))
      yield* Effect.promise(() => retain(`targets/${target}/prefetch.json`, json(states)))
      expect(states).toHaveLength(1)
      const state = states[0]
      if (!state || state.status !== "ready") throw new Error(`P0B prefetch unavailable: ${target}: ${JSON.stringify(states)}`)
      expect(state.engine).toBe("kubeconform")
      expect(state.version).toBe("0.8.0")
      expect(state.target).toBe(target)
      const executable = yield* Effect.promise(() => realpath(state.executable))
      expect(executable).toBe(path.join(toolkitRoot, "engines/kubeconform", `0.8.0-${target}`, record.member))
      expect(state.executable).toBe(executable)
      const metadata = yield* Effect.promise(() => lstat(executable))
      expect(metadata.isFile()).toBe(true)
      expect(metadata.isSymbolicLink()).toBe(false)
      expect(metadata.nlink).toBe(1)
      expect(metadata.size).toBeGreaterThan(0)
      expect(metadata.size).toBeLessThanOrEqual(64 * 1024 * 1024)
      const binary = yield* Effect.promise(() => readFile(executable))
      expect(binary.length).toBe(metadata.size)
      const identity = { sha256: hash(binary), bytes: binary.length }
      const observedHeader = header(binary)
      yield* Effect.promise(() => retain(`targets/${target}/executable.json`, json({ ...identity, header: observedHeader })))
      expect(observedHeader).toMatchObject(record.expectedHeader)
      const floor = scan(record.member, binary)
      yield* Effect.promise(() => retain(`targets/${target}/floor.json`, json({ observed: floor, declared: pin.floor[target] })))
      if (!floor) throw new Error(`P0B unsupported floor format: ${target}`)
      expect(record.expectedHeader.format).toBe(floor.format)
      expect(floor.needs).toEqual(pin.floor[target])

      const archiveRoot = path.join(temp.path, "archives", target)
      const raw: PinnedArtifact.Artifact = { url: selected.artifact.url, integrity: selected.artifact.integrity, format: "raw",
        entries: [{ from: record.archive.name, to: record.archive.name }] }
      yield* PinnedArtifact.install(archiveRoot, [raw])
      const archive = path.join(archiveRoot, record.archive.name)
      const archiveBytes = yield* Effect.promise(() => readFile(archive))
      assertBytes(archiveBytes, record.archive)
      yield* Effect.promise(() => retain(`targets/${target}/archive.json`, json(record.archive)))
      const list = yield* run(`${target}/archive-members`, { kind: "list", format, archive })
      assertNative(list)
      const listing = text(list.stdout.data)
      expect(listing.endsWith("\n")).toBe(true)
      const members = listing.slice(0, -1).split("\n")
      expect(members.every(safeMember)).toBe(true)
      expect(new Set(members).size).toBe(members.length)
      expect(members.filter((name) => name === record.member)).toHaveLength(1)
      yield* Effect.promise(() => retain(`targets/${target}/members.txt`, list.stdout.data))
      const member = yield* run(`${target}/archive-executable`, { kind: "executable-member", format, archive, member: record.member })
      assertNative(member)
      assertBytes(member.stdout.data, identity)
      const notices: Notice[] = []
      for (const name of members.filter((name) => !name.endsWith("/") &&
        /^(?:LICENSE|LICENCE|COPYING|NOTICE|PATENTS|COPYRIGHT)(?:[._-].*)?$/i.test(path.posix.basename(name)))) {
        const outcome = yield* run(`${target}/notice-${notices.length}`, { kind: "notice-member", format, archive, member: name })
        assertNative(outcome)
        expect(outcome.stdout.data.length).toBeGreaterThan(0)
        const artifact = `targets/${target}/notices/${notices.length}.txt`
        yield* Effect.promise(() => retain(artifact, outcome.stdout.data))
        notices.push({ member: name, bytes: outcome.stdout.data.length, sha256: hash(outcome.stdout.data), artifact })
      }
      yield* Effect.promise(() => retain(`targets/${target}/notices.json`, json(notices)))
      const info = yield* run(`${target}/build-info`, { kind: "build-info", file: executable })
      yield* Effect.promise(() => retain(`targets/${target}/build-info.json`, info.stdout.data))
      assertNative(info)
      const decoded = Schema.decodeUnknownSync(Schema.fromJsonString(BuildInfo))(text(info.stdout.data), strict)
      assertBytes(yield* Effect.promise(() => readFile(executable)), identity)
      expect(hash(yield* Effect.promise(() => readFile(readerExe)))).toBe(sources.reader.expectedExecutableSha256)
      const observation: Observation = {
        target, origin, archive: { url: record.archive.url, sha256: hash(archiveBytes), bytes: archiveBytes.length },
        executable: identity, buildInfo: decoded, distributedNotices: notices,
        buildInfoArtifact: { path: `targets/${target}/build-info.json`, sha256: hash(info.stdout.data), bytes: info.stdout.data.length },
      }
      observations.push(observation)
      yield* Effect.promise(() => retain(`targets/${target}/observation.json`, json(observation)))
    }
    expect(prefetched).toEqual(["darwin-arm64", "darwin-x64", "linux-arm64", "win32-x64"])
    expect(sources.targets.map((item) => item.target).sort()).toEqual(observations.map((item) => item.target).sort())
    // Discovery is retained before refusing an unfamiliar compiler/module, never fetched by a constructed version URL.
    const missing = observations.flatMap(unresolved)
    yield* Effect.promise(() => retain("discovery.json", json({
      schema: "kubeconform-p0b-discovery-v1", observations, unresolved: missing, complete: false,
    })))
    expect(missing).toEqual([])

    const sourceFiles: Array<{ path: string; artifact: string; sha256: string; bytes: number; gitBlob: string }> = []
    for (const source of sourceInventory.files) {
      const data = yield* Effect.promise(() => readFile(path.join(previousRoot, "source", source.path)))
      assertBytes(data, source)
      const artifact = `source/${source.path}`
      yield* Effect.promise(() => retain(artifact, data))
      sourceFiles.push({ path: source.path, artifact, sha256: hash(data), bytes: data.length, gitBlob: source.gitBlob })
    }
    const compilerFiles: Array<{ version: string; path: string; artifact: string; sha256: string; bytes: number }> = []
    for (const compiler of sources.knownCompilerSources) {
      expect(compiler.version).toBe(sourceInventory.compiler.version)
      expect(compiler.sourceCommit).toBe(sourceInventory.compiler.sourceCommit)
      expect(compiler.files).toEqual(sourceInventory.compiler.files)
      for (const source of compiler.files) {
        const data = yield* Effect.promise(() => readFile(path.join(previousRoot, "compiler-notices", source.path)))
        assertBytes(data, source)
        const artifact = `compiler-notices/${compiler.version}/${source.path}`
        yield* Effect.promise(() => retain(artifact, data))
        compilerFiles.push({ version: compiler.version, path: source.path, artifact, sha256: hash(data), bytes: data.length })
      }
    }
    const compilers = sources.knownCompilerSources.flatMap((compiler) => {
      const targets = observations.filter((item) => item.buildInfo.GoVersion === compiler.version).map((item) => item.target).sort()
      return targets.length === 0 ? [] : [{ ...compiler, observedOn: targets, otherTargets: undefined,
        notices: compilerFiles.filter((file) => file.version === compiler.version) }]
    })
    const modules = sourceInventory.modules.flatMap((module) => {
      const members = observations.flatMap((item) => item.buildInfo.Deps
        .filter((dependency) => dependency.Path === module.path && dependency.Version === module.version)
        .map((dependency) => ({ target: item.target, binarySum: dependency.Sum ?? null })))
      return members.length === 0 ? [] : [{ ...module, targets: members.map((item) => item.target).sort(), observedSums: members,
        noticeSources: module.noticePaths.map((file) => ({
          ...sourceInventory.files.find((source) => source.path === file), artifact: `source/${file}`,
          sourceRepository: sources.upstream.repo, sourceCommit: sources.upstream.commit,
        })) }]
    })
    const origins = [
      { component: "kubeconform", version: sources.upstream.tag, targets: observations.map((item) => item.target).sort(),
        sourceRepository: sources.upstream.repo, sourceCommit: sources.upstream.commit,
        files: sourceInventory.files.filter((file) => file.kind === "notice" && file.path === "LICENSE")
          .map((file) => ({ ...file, artifact: `source/${file.path}` })) },
      ...modules.map((module) => ({ component: module.path, version: module.version, targets: module.targets, files: module.noticeSources })),
      ...compilers.map((compiler) => ({ component: "Go compiler", version: compiler.version, targets: compiler.observedOn,
        sourceRepository: "golang/go", sourceCommit: compiler.sourceCommit,
        files: compiler.files.map((file) => ({ ...file, artifact: `compiler-notices/${compiler.version}/${file.path}` })) })),
    ]
    yield* Effect.promise(() => retain("notice-origins.json", json({ sources: origins,
      distributions: observations.map((item) => ({ target: item.target, origin: item.origin, archive: item.archive, notices: item.distributedNotices })) })))
    yield* Effect.promise(() => retain("measurement.json", json({
      schema: "kubeconform-p0b-measurement-v1", complete: true,
      scope: "four foreign static reads plus exact prior Linux P0A2; no foreign native execution",
      origin, inventorySha256: hash(inputBytes), previousLinuxEvidence: sources.previousLinuxEvidence,
      reader: { version: text(version.stdout.data), executableSha256: hash(readerBytes), sourceCommit: sources.reader.sourceCommit,
        notices: sources.reader.files.map((file) => ({ ...file, artifact: `reader-notices/${file.path}` })) },
      prefetched, observations, compilers, modules, sourceFiles, noticeOrigins: "notice-origins.json",
      unresolved: missing, installedProductionNoticesDeclared: "notices" in pin,
      ...sources.claimLimits, nativeQualificationChanged: false,
    })))
    console.info("[kubeconform P0B]", json({ targets: observations.map((item) => item.target),
      foreignPrefetches: prefetched.length, compilers: compilers.map((item) => item.version), linkedModuleVersions: modules.length,
      foreignTargetsExecuted: false, analysisQualified: false, noticeDistributionClosed: false }).trim())
  }).pipe(Effect.onExit((exit) => Exit.isFailure(exit)
    ? Effect.promise(() => retain("failure.json", json({
      schema: "kubeconform-p0b-failure-v1", complete: false, cause: Cause.pretty(exit.cause), prefetched, observations,
      unresolved: observations.flatMap(unresolved), ...sources.claimLimits,
    }))) : Effect.void))
}, 600_000)
