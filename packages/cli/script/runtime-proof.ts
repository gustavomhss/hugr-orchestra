#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { machine, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { nativeCliTarget, readCliManifest, verifyCliArtifact } from "../../desktop/src/main/cli-artifacts"
import { namedTargets } from "./targets"

const cli = resolve(import.meta.dirname, "..")
const args = parseArgs({
  options: {
    target: { type: "string" },
    resources: { type: "string" },
    report: { type: "string" },
    host: { type: "boolean" },
    "check-report": { type: "boolean" },
  },
  strict: true,
  allowPositionals: false,
}).values

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "RUNTIME_PROOF_FAILED")
  process.exitCode = 1
})

async function main() {
  const item = namedTargets.find((item) => item.target === args.target)
  if (!item) throw new Error("TARGET_MISSING_OR_UNKNOWN")
  if (process.versions.bun !== "1.3.14") throw new Error("BUN_VERSION_MISMATCH: require 1.3.14")
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
      // Apple's sysctlbyname recipe: ENOENT (2) means native, not missing infrastructure.
      if (status === -1 ? read.i32(system.symbols.__error()!) !== 2 : status !== 0 || translated.readInt32LE(0) !== 0)
        throw new Error("NATIVE_HOST_CPU_UNAVAILABLE: Rosetta or failed native-host inspection")
    } finally {
      system.close()
    }
  }
  const cpu = machine().toLowerCase()
  if (
    item.os !== process.platform || item.arch !== process.arch ||
    !(item.arch === "x64" ? ["x86_64", "amd64", "x64"] : ["aarch64", "arm64"]).includes(cpu) ||
    item.target !== nativeCliTarget(process.platform, process.arch)
  )
    throw new Error(`NATIVE_HOST_CPU_UNAVAILABLE: ${item.target}`)
  if (args.host && args["check-report"]) throw new Error("MODE_CONFLICT")
  if (args.host) return
  if (!args.report) throw new Error("REPORT_PATH_MISSING")
  const pkg: unknown = await Bun.file(join(cli, "package.json")).json().catch(() => {
    throw new Error("SOURCE_VERSION_MISSING_OR_INVALID")
  })
  if (!pkg || typeof pkg !== "object" || !("version" in pkg) || typeof pkg.version !== "string" || !pkg.version)
    throw new Error("SOURCE_VERSION_MISSING")
  const version = pkg.version
  const report = resolve(args.report)
  if (item.target === "windows-arm64" && !args.resources) throw new Error("WINDOWS_ARM64_RESOURCES_REQUIRED")
  const incoming = args.resources ? await resource(resolve(args.resources), item.target, version) : undefined
  const binary = incoming?.path ?? join(cli, "dist", `cli-${item.target}`, "bin", `orchestra${item.os === "win32" ? ".exe" : ""}`)
  await regular(binary)
  await executableHeader(binary, item.os, item.arch)
  const sha256 = createHash("sha256").update(await readFile(binary)).digest("hex")
  if (args["check-report"]) {
    await regular(report)
    const value: unknown = await Bun.file(report).json().catch(() => { throw new Error("PROOF_REPORT_INVALID_JSON") })
    if (
      !value || typeof value !== "object" || Object.keys(value).length !== 6 ||
      !("target" in value) || value.target !== item.target ||
      !("version" in value) || value.version !== version || !("sha256" in value) ||
      typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) ||
      !("healthy" in value) || value.healthy !== true ||
      !("wrongPasswordRejected" in value) || value.wrongPasswordRejected !== true ||
      !("unauthenticatedRejected" in value) || value.unauthenticatedRejected !== true
    )
      throw new Error("PROOF_REPORT_INVALID")
    if (sha256 !== value.sha256)
      throw new Error("PROOF_REPORT_DIGEST_MISMATCH")
    return
  }
  if (await Bun.file(report).exists()) throw new Error("PROOF_REPORT_ALREADY_EXISTS")
  if (!incoming) {
    const metadata = join(cli, "dist", `cli-${item.target}`, "package.json")
    await regular(metadata)
    const value: unknown = await Bun.file(metadata).json().catch(() => { throw new Error("PRODUCER_MANIFEST_INVALID_JSON") })
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== version)
      throw new Error("PRODUCER_VERSION_MISMATCH")
  }
  const sandbox = await mkdtemp(join(await realpath(tmpdir()), "orchestra-runtime-proof-"))
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      ["path", "systemroot", "windir", "comspec", "pathext", "lang", "lc_all"].includes(key.toLowerCase()),
    )),
    HOME: sandbox,
    USERPROFILE: sandbox,
    ORCHESTRA_TEST_HOME: sandbox,
    APPDATA: join(sandbox, "config"),
    LOCALAPPDATA: join(sandbox, "data"),
    XDG_DATA_HOME: join(sandbox, "data"),
    XDG_STATE_HOME: join(sandbox, "state"),
    XDG_CONFIG_HOME: join(sandbox, "config"),
    XDG_CACHE_HOME: join(sandbox, "cache"),
    TMPDIR: join(sandbox, "tmp"),
    TMP: join(sandbox, "tmp"),
    TEMP: join(sandbox, "tmp"),
    ORCHESTRA_DB: join(sandbox, "proof.sqlite"),
    ORCHESTRA_INHERIT_CREDENTIALS: "0",
    ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
  }
  // CLI stdout/stderr, especially service password, never reach logs or reports.
  const run = async (command: string[]) => {
    const child = Bun.spawn([binary, ...command], { env, cwd: sandbox, stdout: "pipe", stderr: "pipe" })
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000)
    const result = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      .finally(() => clearTimeout(timeout))
    if (result[0] !== 0) throw new Error(`CLI_COMMAND_FAILED: ${command.join(" ")}`)
    return result[1].trim()
  }
  let cleaned = false
  let cleaning: Promise<void> | undefined
  const cleanup = () => (cleaning ??= (async () => {
    await run(["service", "stop"])
    if (await run(["service", "status"]) !== "stopped") throw new Error("DAEMON_CLEANUP_FAILED")
    await rm(sandbox, { recursive: true, force: true })
    cleaned = true
  })())
  // Async finalization handles normal failure/signals; exit hook covers abrupt exit.
  process.once("exit", () => {
    if (!cleaned)
      spawnSync(binary, ["service", "stop"], {
        env, cwd: sandbox, stdio: "ignore", timeout: 15_000, killSignal: "SIGKILL",
      })
  })
  const abort = (reason: string) => {
    console.error(reason)
    void cleanup().then(() => process.exit(1), () => process.exit(1))
  }
  process.once("SIGINT", () => abort("RUNTIME_PROOF_INTERRUPTED"))
  process.once("SIGTERM", () => abort("RUNTIME_PROOF_TERMINATED"))
  const deadline = setTimeout(() => abort("RUNTIME_PROOF_TIMEOUT"), 90_000)
  const result = await (async () => {
    await Promise.all(["data", "state", "config", "cache", "tmp"].map((name) => mkdir(join(sandbox, name))))
    if (!incoming) {
      const { exportArtifacts } = await import("./export-artifacts")
      const dist = await realpath(join(cli, "dist")).catch(() => { throw new Error("BUILD_OUTPUT_MISSING") })
      const directory = join(sandbox, "resources")
      await exportArtifacts({ dist, out: directory, version, targets: [item.target] })
      if ((await resource(directory, item.target, version)).sha256 !== sha256)
        throw new Error("RESOURCE_DESCRIPTOR_MISMATCH")
    }
    if (await run(["--version"]) !== version) throw new Error("COMPILED_VERSION_MISMATCH")
    if (await run(["service", "status"]) !== "stopped") throw new Error("SANDBOX_NOT_IDLE")
    const endpoint = new URL(await run(["service", "start"]))
    if (
      endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port ||
      endpoint.username || endpoint.password || endpoint.pathname !== "/" || endpoint.search || endpoint.hash
    )
      throw new Error("DAEMON_ENDPOINT_NOT_ISOLATED_LOOPBACK")
    if (await run(["service", "status"]) !== `running ${endpoint.origin}`) throw new Error("DAEMON_STATUS_MISMATCH")
    const password = await run(["service", "password"])
    if (!/^[A-Za-z0-9_-]{43}$/.test(password)) throw new Error("DAEMON_PASSWORD_INVALID")
    const request = (credential?: string) =>
      fetch(new URL("/api/health", endpoint), {
        headers: credential === undefined ? {} : {
          Authorization: `Basic ${Buffer.from(`orchestra:${credential}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(5_000),
        redirect: "error",
      }).catch(() => { throw new Error("HEALTH_REQUEST_FAILED") })
    const health = await request(password)
    const body: unknown = await health.json().catch(() => { throw new Error("HEALTH_BODY_INVALID_JSON") })
    if (!health.ok || !body || typeof body !== "object" || !("healthy" in body) || body.healthy !== true)
      throw new Error("AUTHENTICATED_HEALTH_FAILED")
    if (![401, 403].includes((await request(`${password}-wrong`)).status)) throw new Error("WRONG_PASSWORD_ACCEPTED")
    if (![401, 403].includes((await request()).status)) throw new Error("UNAUTHENTICATED_HEALTH_ACCEPTED")
    await regular(env.ORCHESTRA_DB)
    return {
      target: item.target,
      version,
      sha256,
      healthy: true,
      wrongPasswordRejected: true,
      unauthenticatedRejected: true,
    }
  })().finally(async () => {
    await cleanup().finally(() => clearTimeout(deadline))
  })
  await writeFile(report, JSON.stringify(result) + "\n", { flag: "wx" })
  console.log(JSON.stringify(result))
}

async function regular(file: string) {
  const stat = await lstat(file).catch(() => { throw new Error(`REQUIRED_FILE_MISSING: ${file}`) })
  if (!stat.isFile()) throw new Error(`OUTPUT_NOT_REGULAR: ${file}`)
}

async function resource(directory: string, target: string, version: string) {
  await regular(join(directory, "manifest.json"))
  const manifest = await readCliManifest(directory)
  if (manifest.version !== version) throw new Error("PRODUCER_VERSION_MISMATCH")
  const artifact = await verifyCliArtifact(directory, target)
  if (manifest.artifacts.length !== 1) throw new Error("RESOURCE_DESCRIPTOR_MISMATCH")
  return { ...artifact, sha256: manifest.artifacts[0].sha256 }
}

// Inspect fixed headers only; PE's indirect header offset is bounded before reading.
async function executableHeader(file: string, os: string, arch: string) {
  const handle = await open(file, "r")
  await (async () => {
    const header = Buffer.alloc(64)
    if ((await handle.read(header, 0, 64, 0)).bytesRead !== 64) throw new Error("EXECUTABLE_HEADER_TRUNCATED")
    if (os === "linux") {
      if (
        header.readUInt32BE(0) !== 0x7f454c46 || header[4] !== 2 || header[5] !== 1 || header[6] !== 1 ||
        ![2, 3].includes(header.readUInt16LE(16))
      ) throw new Error("EXECUTABLE_FORMAT_NOT_ELF64")
      if (header.readUInt16LE(18) !== (arch === "x64" ? 62 : 183)) throw new Error("EXECUTABLE_CPU_MISMATCH")
      return
    }
    if (os === "darwin") {
      if (header.readUInt32LE(0) !== 0xfeedfacf || header.readUInt32LE(12) !== 2)
        throw new Error("EXECUTABLE_FORMAT_NOT_MACHO64")
      if (header.readUInt32LE(4) !== (arch === "x64" ? 0x01000007 : 0x0100000c)) throw new Error("EXECUTABLE_CPU_MISMATCH")
      return
    }
    if (header.readUInt16LE(0) !== 0x5a4d) throw new Error("EXECUTABLE_FORMAT_NOT_PE")
    const offset = header.readUInt32LE(60)
    if (offset < 64 || offset > 1_048_576 || offset + 26 > (await handle.stat()).size)
      throw new Error("PE_HEADER_OFFSET_INVALID")
    const pe = Buffer.alloc(26)
    if (
      (await handle.read(pe, 0, 26, offset)).bytesRead !== 26 || pe.readUInt32LE(0) !== 0x4550 ||
      pe.readUInt16LE(24) !== 0x20b || !(pe.readUInt16LE(22) & 2)
    ) throw new Error("EXECUTABLE_FORMAT_NOT_PE64")
    if (pe.readUInt16LE(4) !== (arch === "x64" ? 0x8664 : 0xaa64)) throw new Error("EXECUTABLE_CPU_MISMATCH")
  })().finally(() => handle.close())
}
