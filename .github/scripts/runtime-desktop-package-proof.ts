#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { machine, tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"
import { nativeCliTarget, readCliManifest, verifyCliArtifact } from "../../packages/desktop/src/main/cli-artifacts"

// Controlled, build-owned namespace (PRODUCER-BOUNDARY.md); not hostile-writer protection.
// This proves packaged resources and native --version, not Electron/service/WSL startup.
class ProofFailure extends Error {}
function fail(name: string): never {
  throw new ProofFailure(name)
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const within = (root: string, file: string) => {
  const path = relative(root, file)
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
}

await main().catch((error: unknown) => {
  console.error(error instanceof ProofFailure ? error.message : "DESKTOP_PACKAGE_PROOF_FAILED")
  process.exitCode = 1
})

async function main() {
  const args = (await Promise.resolve().then(() => parseArgs({
    options: { resources: { type: "string" }, channel: { type: "string" }, report: { type: "string" } },
    strict: true, allowPositionals: false,
  })).catch(() => fail("PROOF_ARGUMENTS_INVALID"))).values
  if (!args.resources) fail("PACKAGED_RESOURCES_MISSING")
  if (!["dev", "beta", "prod"].includes(args.channel ?? "")) fail("CHANNEL_MISSING_OR_INVALID")
  if (!args.report || !isAbsolute(args.report) || args.report.split(/[\\/]/).includes(".."))
    fail("FRESH_ABSOLUTE_REPORT_PATH_REQUIRED")
  const report = args.report
  await lstat(report).then(() => fail("REPORT_ALREADY_EXISTS"), (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") fail("REPORT_PATH_UNAVAILABLE")
  })
  await realpath(dirname(report)).catch(() => fail("REPORT_PARENT_MISSING"))
  if (!["darwin", "win32", "linux"].includes(process.platform)) fail("NATIVE_HOST_PLATFORM_UNSUPPORTED")
  if (!["arm64", "x64"].includes(process.arch)) fail("NATIVE_HOST_CPU_UNSUPPORTED")
  const target = nativeCliTarget(process.platform, process.arch)
  const cpu = machine().toLowerCase()
  if (!(process.arch === "x64" ? ["x86_64", "amd64", "x64"] : ["aarch64", "arm64"]).includes(cpu))
    fail("NATIVE_HOST_CPU_MISMATCH")
  if (process.platform === "darwin") {
    const { dlopen, ptr, read } = await import("bun:ffi")
    const system = dlopen("/usr/lib/libSystem.B.dylib", {
      sysctlbyname: { args: ["ptr", "ptr", "ptr", "ptr", "u64"], returns: "i32" },
      __error: { args: [], returns: "ptr" },
    })
    const translated = Buffer.alloc(4)
    const size = Buffer.alloc(8)
    size.writeBigUInt64LE(4n)
    try {
      const status = system.symbols.sysctlbyname(ptr(Buffer.from("sysctl.proc_translated\0")), ptr(translated), ptr(size), null, 0n)
      // Apple's native-host recipe treats ENOENT as native, not a skipped inspection.
      if (status === -1 ? read.i32(system.symbols.__error()!) !== 2 : status !== 0 || translated.readInt32LE(0) !== 0)
        fail("NATIVE_HOST_CPU_UNAVAILABLE")
    } finally { system.close() }
  }
  const desktop = resolve(import.meta.dir, "../../packages/desktop")
  const resources = await realpath(args.resources).catch(() => fail("PACKAGED_RESOURCES_MISSING"))
  if (!(await lstat(args.resources)).isDirectory()) fail("PACKAGED_RESOURCES_NOT_REAL_DIRECTORY")
  if (resources === await realpath(join(desktop, "resources")).catch(() => undefined)) fail("SOURCE_AS_PACKAGE_REJECTED")
  if (resources.split(/[\\/]/).some((part) => part.endsWith(".asar"))) fail("CLI_RESOURCES_INSIDE_ASAR")
  if (within(resources, join(await realpath(dirname(report)), report.split(/[\\/]/).at(-1)!)))
    fail("REPORT_OVERLAPS_PACKAGE")
  const source: unknown = await Bun.file(join(desktop, "package.json")).json().catch(() => fail("DESKTOP_PACKAGE_FACTS_MISSING"))
  if (!source || typeof source !== "object" || !("name" in source) || source.name !== "@orchestra/desktop" ||
    !("main" in source) || typeof source.main !== "string" || !source.main)
    fail("DESKTOP_PACKAGE_FACTS_INVALID")
  const previous = process.env.ORCHESTRA_CHANNEL
  process.env.ORCHESTRA_CHANNEL = args.channel
  const config = await import("../../packages/desktop/electron-builder.config").finally(() => {
    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    if (previous !== undefined) process.env.ORCHESTRA_CHANNEL = previous
  }).catch(() => fail("CHANNEL_CONTRACT_UNAVAILABLE"))
  if (!config.default.appId || typeof config.default.extraMetadata?.desktopName !== "string")
    fail("CHANNEL_CONTRACT_UNAVAILABLE")
  // Production authority: ORCHESTRA_VERSION ?? packages/orchestra/package.json.version.
  const expectedVersion = config.default.extraMetadata?.version
  if (typeof expectedVersion !== "string" || !expectedVersion.trim() || expectedVersion !== expectedVersion.trim() ||
    /[\x00-\x1f]/.test(expectedVersion)) fail("PRODUCTION_PACKAGE_VERSION_INVALID")
  const archive = join(resources, "app.asar")
  await regular(archive, "PACKAGED_APP_ARCHIVE_MISSING_OR_NOT_REGULAR")
  const archiveSize = (await lstat(archive)).size
  const asar: unknown = await Promise.resolve().then(() => {
    const require = createRequire(join(desktop, "package.json"))
    const builder = createRequire(require.resolve("electron-builder"))
    return createRequire(builder.resolve("app-builder-lib"))("@electron/asar")
  }).catch(() => fail("PACKAGED_ASAR_READER_UNAVAILABLE"))
  if (!asar || typeof asar !== "object" || !("statFile" in asar) || typeof asar.statFile !== "function" ||
    !("extractFile" in asar) || typeof asar.extractFile !== "function" ||
    !("getRawHeader" in asar) || typeof asar.getRawHeader !== "function") fail("PACKAGED_ASAR_READER_API_INVALID")
  const statFile = asar.statFile
  const extractFile = asar.extractFile
  const getRawHeader = asar.getRawHeader
  const header: unknown = await Promise.resolve().then(() => getRawHeader(archive))
    .catch(() => fail("PACKAGED_ASAR_HEADER_UNREADABLE"))
  if (!Number.isSafeInteger(archiveSize) || archiveSize < 0 || !header || typeof header !== "object" ||
    !("headerSize" in header) || typeof header.headerSize !== "number" || !Number.isSafeInteger(header.headerSize) ||
    header.headerSize < 0) fail("PACKAGED_ASAR_HEADER_EXTENT_INVALID")
  const payloadBase = 8 + header.headerSize
  if (!Number.isSafeInteger(payloadBase) || payloadBase > archiveSize) fail("PACKAGED_ASAR_HEADER_EXTENT_INVALID")
  const metadataEntry = requirePackedEntry(await Promise.resolve().then(() => statFile(archive, "package.json", false))
    .catch(() => fail("PACKAGED_METADATA_MISSING_OR_ARCHIVE_INVALID")), "PACKAGED_METADATA_NOT_OWNED_REGULAR", payloadBase, archiveSize)
  const metadataBytes: unknown = await Promise.resolve().then(() => extractFile(archive, "package.json", false))
    .catch(() => fail("PACKAGED_METADATA_UNREADABLE"))
  if (!Buffer.isBuffer(metadataBytes) || metadataBytes.length !== metadataEntry.size) fail("PACKAGED_METADATA_BYTES_INVALID")
  const metadata: unknown = await Promise.resolve().then(() => JSON.parse(metadataBytes.toString("utf8")))
    .catch(() => fail("PACKAGED_METADATA_INVALID_JSON"))
  if (!metadata || typeof metadata !== "object" || !("name" in metadata) || metadata.name !== source.name)
    fail("PACKAGED_DESKTOP_IDENTITY_MISMATCH")
  if (!("desktopName" in metadata)) fail("PACKAGED_CHANNEL_METADATA_MISSING")
  if (metadata.desktopName !== config.default.extraMetadata!.desktopName) fail("PACKAGED_CHANNEL_MISMATCH")
  if (!("version" in metadata) || metadata.version !== expectedVersion) fail("PACKAGED_DESKTOP_VERSION_MISMATCH")
  if (!("main" in metadata) || metadata.main !== source.main) fail("PACKAGED_MAIN_IDENTITY_MISMATCH")
  const main = source.main.replace(/^\.\//, "")
  requirePackedEntry(await Promise.resolve().then(() => statFile(archive, main, false))
    .catch(() => fail("PACKAGED_MAIN_OUTPUT_MISSING")), "PACKAGED_MAIN_OUTPUT_MISSING_OR_NOT_REGULAR", payloadBase, archiveSize)
  const archiveSha256 = digest(await readFile(archive))
  const directory = join(resources, "cli")
  await regular(join(directory, "manifest.json"), "CLI_MANIFEST_MISSING_OR_NOT_REGULAR")
  const manifestSha256 = digest(await readFile(join(directory, "manifest.json")))
  const manifest = await readCliManifest(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") fail("CLI_ARTIFACT_OUTPUT_MISSING")
    fail("CLI_MANIFEST_INVALID_OR_UNCONFINED")
  })
  if (manifest.version !== expectedVersion) fail("CLI_MANIFEST_VERSION_MISMATCH")
  const required = [target, ...(process.platform === "win32" ? ["linux-x64-baseline", "linux-arm64"] : [])]
  if (required.some((name) => !manifest.artifacts.some((entry) => entry.target === name))) fail("REQUIRED_CLI_TARGET_MISSING")
  const artifacts = await Promise.all(manifest.artifacts.map(async (entry) => {
    const verified = await verifyCliArtifact(directory, entry.target).catch((error: unknown) => {
      if (error instanceof Error && error.message.startsWith("CLI artifact digest mismatch:")) fail("CLI_ARTIFACT_DIGEST_MISMATCH")
      fail("CLI_ARTIFACT_MISSING_OR_UNCONFINED")
    })
    if (entry.file !== `orchestra-${entry.target}${entry.target.startsWith("windows-") ? ".exe" : ""}`)
      fail("CLI_ARTIFACT_OWNED_NAME_MISMATCH")
    await executableHeader(verified.path, entry.target)
    return { target: entry.target, file: entry.file, sha256: entry.sha256 }
  }))
  const sandbox = await mkdtemp(join(await realpath(tmpdir()), "orchestra-desktop-package-proof-"))
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ["systemroot", "windir"].includes(key.toLowerCase()))),
    HOME: sandbox, USERPROFILE: sandbox, APPDATA: join(sandbox, "config"), LOCALAPPDATA: join(sandbox, "data"),
    XDG_DATA_HOME: join(sandbox, "data"), XDG_STATE_HOME: join(sandbox, "state"),
    XDG_CONFIG_HOME: join(sandbox, "config"), XDG_CACHE_HOME: join(sandbox, "cache"),
    TMPDIR: join(sandbox, "tmp"), TMP: join(sandbox, "tmp"), TEMP: join(sandbox, "tmp"),
    ORCHESTRA_TEST_HOME: sandbox, ORCHESTRA_DB: join(sandbox, "proof.sqlite"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
  }
  await (async () => {
    await Promise.all(["data", "state", "config", "cache", "tmp"].map((name) => mkdir(join(sandbox, name))))
    const output = await open(join(sandbox, "version.stdout"), "wx", 0o600)
    await (async () => {
      const native = artifacts.find((entry) => entry.target === target)!
      const child = await Promise.resolve().then(() => Bun.spawn([join(directory, native.file), "--version"], {
        env, cwd: sandbox, stdin: "ignore", stdout: output.fd, stderr: "ignore",
      })).catch(() => fail("NATIVE_VERSION_LAUNCH_FAILED"))
      const stopped = new AbortController()
      const stop = (reason: string) => { stopped.abort(reason); child.kill("SIGKILL") }
      const abort = () => stop("NATIVE_VERSION_EXECUTION_INTERRUPTED")
      process.once("SIGINT", abort)
      process.once("SIGTERM", abort)
      process.once("exit", abort)
      const deadline = setTimeout(() => stop("NATIVE_VERSION_EXECUTION_TIMEOUT"), 15_000)
      const exit = await child.exited.finally(() => {
        clearTimeout(deadline)
        process.removeListener("SIGINT", abort)
        process.removeListener("SIGTERM", abort)
        process.removeListener("exit", abort)
      })
      if (stopped.signal.aborted) fail(String(stopped.signal.reason))
      if (exit !== 0) fail("NATIVE_VERSION_EXECUTION_FAILED")
      if ((await output.stat()).size > 1024) fail("NATIVE_VERSION_OUTPUT_INVALID")
      const version = (await readFile(join(sandbox, "version.stdout"), "utf8")).trim()
      if (version !== expectedVersion) fail("NATIVE_COMPILED_VERSION_MISMATCH")
    })().finally(() => output.close())
  })().finally(() => rm(sandbox, { recursive: true, force: true }))
  await Promise.all(artifacts.map(async (entry) => {
    if (digest(await readFile(join(directory, entry.file))) !== entry.sha256) fail("CLI_ARTIFACT_CHANGED_DURING_PROOF")
  }))
  if (digest(await readFile(archive)) !== archiveSha256) fail("PACKAGED_ARCHIVE_CHANGED_DURING_PROOF")
  if (digest(await readFile(join(directory, "manifest.json"))) !== manifestSha256) fail("CLI_MANIFEST_CHANGED_DURING_PROOF")
  await writeFile(report, JSON.stringify({
    schema: 1, channel: args.channel, expectedAppId: config.default.appId, packageName: metadata.name,
    desktopName: metadata.desktopName, version: expectedVersion, resources, platform: process.platform, arch: process.arch,
    target, requiredTargets: required, archiveSha256, metadataSha256: digest(metadataBytes), manifestSha256, artifacts,
    hostCPUVerified: true, packagedMetadataVerified: true, outsideAsar: true,
    artifactDigestsVerified: true, nativeCompiledVersionVerified: true,
  }) + "\n", { flag: "wx", mode: 0o600 }).catch(() => fail("REPORT_EXCLUSIVE_CREATION_FAILED"))
}

// @electron/asar v3.4.1 src/asar.ts and src/filesystem.ts: false disables link following;
// packed files have size/offset, omit unpacked or set it false; directories/links are separate variants.
// src/disk.ts reads at 8 + headerSize + offset, but ignores read count: stat/Buffer length is not payload evidence.
function requirePackedEntry(entry: unknown, name: string, payloadBase: number, archiveSize: number) {
  if (!entry || typeof entry !== "object" || "link" in entry || "files" in entry ||
    ("unpacked" in entry && entry.unpacked !== false) || !("size" in entry) || typeof entry.size !== "number" ||
    !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > 0xffffffff ||
    !("offset" in entry) || typeof entry.offset !== "string" || !/^(0|[1-9]\d*)$/.test(entry.offset) ||
    !Number.isSafeInteger(Number(entry.offset))) fail(name)
  const start = payloadBase + Number(entry.offset)
  const end = start + entry.size
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end > archiveSize) fail(`${name}_PAYLOAD_EXTENT_INVALID`)
  return entry
}

async function regular(file: string, name: string) {
  const stat = await lstat(file).catch(() => fail(name))
  if (!stat.isFile() || await realpath(file) !== resolve(file)) fail(name)
}

async function executableHeader(file: string, target: string) {
  const handle = await open(file, "r")
  await (async () => {
    const header = Buffer.alloc(64)
    if ((await handle.read(header, 0, 64, 0)).bytesRead !== 64) fail("EXECUTABLE_HEADER_TRUNCATED")
    const arm64 = target.includes("arm64")
    if (target.startsWith("linux-")) {
      if (header.readUInt32BE(0) !== 0x7f454c46 || header[4] !== 2 || header[5] !== 1 || header[6] !== 1 ||
        ![2, 3].includes(header.readUInt16LE(16))) fail("EXECUTABLE_FORMAT_NOT_ELF64")
      if (header.readUInt16LE(18) !== (arm64 ? 183 : 62)) fail("EXECUTABLE_CPU_MISMATCH")
      return
    }
    if (target.startsWith("darwin-")) {
      if (header.readUInt32LE(0) !== 0xfeedfacf || header.readUInt32LE(12) !== 2) fail("EXECUTABLE_FORMAT_NOT_MACHO64")
      if (header.readUInt32LE(4) !== (arm64 ? 0x0100000c : 0x01000007)) fail("EXECUTABLE_CPU_MISMATCH")
      return
    }
    if (header.readUInt16LE(0) !== 0x5a4d) fail("EXECUTABLE_FORMAT_NOT_PE")
    const offset = header.readUInt32LE(60)
    if (offset < 64 || offset > 1_048_576 || offset + 26 > (await handle.stat()).size) fail("PE_HEADER_OFFSET_INVALID")
    const pe = Buffer.alloc(26)
    if ((await handle.read(pe, 0, 26, offset)).bytesRead !== 26 || pe.readUInt32LE(0) !== 0x4550 ||
      pe.readUInt16LE(24) !== 0x20b || !(pe.readUInt16LE(22) & 2)) fail("EXECUTABLE_FORMAT_NOT_PE64")
    if (pe.readUInt16LE(4) !== (arm64 ? 0xaa64 : 0x8664)) fail("EXECUTABLE_CPU_MISMATCH")
  })().finally(() => handle.close())
}
