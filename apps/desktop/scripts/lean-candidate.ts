#!/usr/bin/env bun
import path from "node:path"
import { chmod, copyFile, lstat, mkdir, mkdtemp, readlink, readdir, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { omniTargets } from "@orchestra/script/omni"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"
import { leanNotices, leanOutput, leanPin, sha256 } from "./lean-notices"
import { nativeCliTarget, signatureCheck } from "../src/main/cli-artifacts"

const desktop = path.resolve(import.meta.dirname, "..")
const root = path.resolve(desktop, "../..")
const output = path.join(desktop, "dist-candidate")
const manifestPath = path.join(output, "lean-candidate-build.json")
const appRelativePath = "mac/HuGR Lean Candidate.app"
const pty = "@lydell/node-pty-darwin-x64"
const heapBudgetMiB = 8192
const omniFiles = ["hugr_omni.node", "hugr-omni-supervisor"]
// The candidate is a native Intel build: its CLI bundle ships the pinned x64 macOS rg, signed (ad hoc) by staging.
const ripgrepKey = "x64-darwin"
const ripgrepDirectory = "cli/ripgrep-darwin-x64-baseline"

type CommandResult = {
  exitCode: number | null; signal: string | null; stdout: string; stderr: string; timedOut: boolean; error?: string
}

export function assertIntelRunner(
  probes: { vendor: CommandResult; machine: CommandResult; translated: CommandResult },
  platform = process.platform, arch = process.arch,
) {
  const success = (probe: CommandResult, value: string) =>
    !probe.timedOut && !probe.error && !probe.signal && probe.exitCode === 0 &&
    probe.stdout.trim() === value && probe.stderr === ""
  const absent = !probes.translated.timedOut && !probes.translated.error && !probes.translated.signal &&
    probes.translated.exitCode === 1 && probes.translated.stdout === "" &&
    probes.translated.stderr.trim() === "sysctl: unknown oid 'sysctl.proc_translated'"
  if (
    platform !== "darwin" || arch !== "x64" || !success(probes.vendor, "GenuineIntel") ||
    !success(probes.machine, "x86_64") || !(success(probes.translated, "0") || absent)
  ) throw new Error(`Candidate Intel runner probe rejected: ${JSON.stringify({ platform, arch, probes })}`)
  return probes
}

// Every command owns a process group. Deadlines cover child exit and pipe drainage, not just spawn.
export function runCandidateCommand(
  args: string[], env = process.env, cwd = desktop, timeoutMs = 20 * 60_000, echo = true,
): Promise<CommandResult> {
  if (!args.length || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid candidate command/deadline")
  return new Promise((resolve) => {
    const child = spawn(args[0]!, args.slice(1), { cwd, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] })
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    let timedOut = false, error: string | undefined, settled = false
    let escalation: ReturnType<typeof setTimeout> | undefined, drainage: ReturnType<typeof setTimeout> | undefined
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return
      try {
        if (process.platform === "win32") child.kill(signal)
        if (process.platform !== "win32") process.kill(-child.pid, signal)
      } catch (failure) {
        if (!(failure instanceof Error && "code" in failure && failure.code === "ESRCH")) {
          error = String(failure)
          process.stderr.write(`${error}\n`)
        }
      }
    }
    const finish = (exitCode: number | null, signal: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(deadline); clearTimeout(escalation); clearTimeout(drainage)
      process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt)
      kill("SIGKILL")
      resolve({ exitCode, signal, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), timedOut, error })
    }
    const stop = () => {
      kill("SIGTERM")
      escalation ??= setTimeout(() => {
        kill("SIGKILL")
        drainage = setTimeout(() => {
          error ??= "Candidate child pipes remained open after SIGKILL"
          child.stdout.destroy(); child.stderr.destroy()
          finish(child.exitCode, child.signalCode)
        }, 1000)
      }, 1000)
    }
    const interrupt = () => { error = "Candidate command interrupted"; stop() }
    process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt)
    const deadline = setTimeout(() => { timedOut = true; stop() }, timeoutMs)
    child.stdout.on("data", (bytes: Buffer) => { stdout.push(bytes); if (echo) process.stdout.write(bytes) })
    child.stderr.on("data", (bytes: Buffer) => { stderr.push(bytes); process.stderr.write(bytes) })
    child.once("error", (failure) => { error = failure.message; process.stderr.write(`${failure.stack ?? failure}\n`) })
    child.once("close", finish)
  })
}

// Child tools receive build plumbing only, never release/signing credentials or the caller's NODE_OPTIONS.
export function candidateEnv(version: string) {
  const env = Object.fromEntries([
    "PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SHELL", "CI", "GITHUB_ACTIONS", "GITHUB_SHA",
    "SDKROOT", "DEVELOPER_DIR",
  ].flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]!]]))
  return Object.assign(env, { ORCHESTRA_CHANNEL: "prod", ORCHESTRA_VERSION: version, CSC_IDENTITY_AUTO_DISCOVERY: "false" })
}

// Build-only heap budget: the electron-vite build exceeds Node's default ~2 GiB old space on the Intel runner.
// It describes the build process only, never the packaged app's runtime memory.
export function electronViteEnv(env: Record<string, string>) {
  return { ...env, NODE_OPTIONS: `--max-old-space-size=${heapBudgetMiB}` }
}

export function assertBuildResources(memory: CommandResult, heap: CommandResult) {
  const bytes = (probe: CommandResult) =>
    !probe.timedOut && !probe.error && !probe.signal && probe.exitCode === 0 && /^\d+$/.test(probe.stdout.trim())
      ? Number(probe.stdout.trim()) : undefined
  const memoryBytes = bytes(memory), heapLimitBytes = bytes(heap)
  if (
    memoryBytes === undefined || heapLimitBytes === undefined ||
    memoryBytes < 10 * 1024 ** 3 || heapLimitBytes < heapBudgetMiB * 1024 ** 2
  ) throw new Error(`Candidate build heap budget rejected: ${JSON.stringify({ memory, heap })}`)
  return { memoryBytes, heapLimitBytes, heapBudgetMiB }
}

// The candidate ships omni like a prod build: exact-source release binaries from the omni-binaries action, never a
// silent OMNI_ENABLED=false fallback, since omni is on by default and the packaged app must find Resources/omni.
export function omniSource(env: Record<string, string | undefined> = process.env) {
  const addon = env.HUGR_OMNI_ADDON, supervisor = env.HUGR_OMNI_SUPERVISOR
  if (
    !addon || !supervisor || !path.isAbsolute(addon) || !path.isAbsolute(supervisor) ||
    path.dirname(addon) !== path.dirname(supervisor) || path.basename(supervisor) !== "hugr-omni-supervisor" ||
    env.OMNI_ENABLED === "false" || (env.OMNI_ARTIFACTS !== undefined && env.OMNI_ARTIFACTS !== path.dirname(addon))
  ) throw new Error(`Candidate omni binaries rejected: ${JSON.stringify({ addon, supervisor,
    OMNI_ENABLED: env.OMNI_ENABLED, OMNI_ARTIFACTS: env.OMNI_ARTIFACTS })}`)
  return { directory: path.dirname(addon), addon, supervisor }
}

async function verifyOmni(directory: string, expected: { path: string; bytes: number; sha256: string }[]) {
  return Promise.all(omniFiles.map(async (name, index) => {
    const target = path.join(directory, name)
    if (!(await Bun.file(target).exists())) throw new Error(`Missing candidate omni binary: ${target}`)
    const bytes = Buffer.from(await Bun.file(target).arrayBuffer())
    assertMachOX64(bytes, name)
    if (name === "hugr-omni-supervisor" && !((await lstat(target)).mode & 0o111)) {
      throw new Error(`Candidate omni supervisor not executable: ${target}`)
    }
    const file = { path: name, bytes: bytes.length, sha256: sha256(bytes) }
    if (JSON.stringify(expected[index]) !== JSON.stringify(file)) {
      throw new Error(`Candidate omni binary differs: ${name}`)
    }
    return file
  }))
}

function requireSuccess(result: CommandResult, args: string[]) {
  if (result.exitCode !== 0 || result.signal || result.timedOut || result.error) {
    throw new Error(`Candidate command failed: ${JSON.stringify({ args, ...result })}`)
  }
  return result.stdout
}

export function assertCandidateHost(platform = process.platform, arch = process.arch, ci = process.env.CI) {
  if (platform !== "darwin" || arch !== "x64") {
    throw new Error(`Lean candidate requires native darwin/x64; got ${platform}/${arch}`)
  }
  if (ci !== "true" || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("Lean candidate build/package requires GitHub Actions CI")
  }
}

export async function inventory(directory: string): Promise<{ path: string; bytes: number; sha256: string; link?: string }[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return (await inventory(file)).map((item) => ({ ...item, path: `${entry.name}/${item.path}` }))
    if (entry.isSymbolicLink()) {
      const link = await readlink(file)
      const bytes = Buffer.from(link)
      return [{ path: entry.name, bytes: bytes.length, sha256: sha256(bytes), link }]
    }
    if (!entry.isFile()) throw new Error(`Unsupported candidate material: ${file}`)
    const bytes = new Uint8Array(await Bun.file(file).arrayBuffer())
    return [{ path: entry.name, bytes: bytes.length, sha256: sha256(bytes) }]
  }))
  return files.flat().sort((a, b) => a.path.localeCompare(b.path, "en"))
}

export async function verifyMaterials(directory: string) {
  const archive = new Uint8Array(await Bun.file(path.resolve(desktop, "../../packages/core/vendor", leanPin.artifact)).arrayBuffer())
  if (sha256(archive) !== leanPin.sha256) throw new Error("Unapproved Lean archive")
  const files = await new Bun.Archive(archive).files()
  const names = [...files.keys()].filter((file) =>
    file === "package/LICENSE" || file === "package/NOTICE" ||
    file.startsWith("package/licenses/") || file.endsWith("/SOURCES.md"),
  ).sort()
  if (names.length !== 52) throw new Error(`Lean material inventory expected 52; got ${names.length}`)
  const manifest = await Bun.file(path.join(directory, "hugr-lean/manifest.json")).json()
  for (const [key, value] of Object.entries(leanPin)) {
    if (manifest[key] !== value) throw new Error(`Lean notice pin mismatch: ${key}`)
  }
  const materials = await Promise.all(names.map(async (name) => {
    const file = name.slice("package/".length)
    const expected = sha256(new Uint8Array(await files.get(name)!.arrayBuffer()))
    const target = path.join(directory, "hugr-lean", file)
    if (!(await Bun.file(target).exists())) throw new Error(`Missing Lean material: ${file}`)
    const bytes = new Uint8Array(await Bun.file(target).arrayBuffer())
    if (!bytes.length || sha256(bytes) !== expected) throw new Error(`Lean material hash mismatch: ${file}`)
    return { path: file, sha256: expected }
  }))
  if (JSON.stringify(manifest.materials) !== JSON.stringify(materials)) {
    throw new Error("Lean notice manifest inventory mismatch")
  }
  const actual = (await inventory(path.join(directory, "hugr-lean"))).map((item) => item.path).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...materials.map((item) => item.path), "manifest.json"].sort())) {
    throw new Error("Lean material directory inventory mismatch")
  }
  return { ...leanPin, materials }
}

/**
 * The build record's pin of the CLI bundle's rg: its manifest checked against release.ts, whether staging signed it
 * (macOS always does, ad hoc here, so its signature is checked with codesign), and the digest of each shipped file.
 */
export async function ripgrepRecord(directory: string) {
  const checked = await RipgrepBundle.verify(directory, ripgrepKey, {
    signed: "required",
    signature: async (file) => {
      const check = signatureCheck("darwin-x64-baseline", file)!
      const result = await runCandidateCommand([check.command, ...check.args], process.env, desktop, 30_000, false)
      return result.exitCode === 0 && !result.signal && !result.timedOut && check.valid(result.stdout)
    },
  })
  return { key: ripgrepKey, ...checked, files: await inventory(directory) }
}

export function assertMachOX64(bytes: Buffer, name: string) {
  if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== 0x01000007) {
    throw new Error(`Expected x64 Mach-O: ${name}`)
  }
}

async function command(args: string[], env: NodeJS.ProcessEnv, cwd = desktop) {
  requireSuccess(await runCandidateCommand(args, env, cwd), args)
}

async function git(...args: string[]) {
  const command = ["git", ...args]
  return requireSuccess(await runCandidateCommand(command, process.env, root, 30_000, false), command).trim()
}

async function identity() {
  // dist-candidate is intentionally generated but not ignored by the production tree.
  if (await git("status", "--porcelain", "--untracked-files=normal", "--", ".", ":(exclude)apps/desktop/dist-candidate")) {
    throw new Error("Candidate requires clean committed source tree")
  }
  const sourceCommit = await git("rev-parse", "HEAD")
  if (process.env.GITHUB_SHA !== sourceCommit) throw new Error(`Candidate checkout differs from GITHUB_SHA: ${sourceCommit}`)
  const sourceTree = await git("rev-parse", "HEAD^{tree}")
  const pkg = await Bun.file(path.join(desktop, "package.json")).json()
  const versions = await Promise.all(["electron", "electron-builder", "electron-vite"].map(async (name) => {
    const metadata = await Bun.file(Bun.resolveSync(`${name}/package.json`, desktop)).json()
    return [name, metadata.version] as const
  }))
  const nodeVersion = requireSuccess(await runCandidateCommand(["node", "--version"], process.env, desktop, 15_000, false), ["node", "--version"]).trim()
  if (!nodeVersion.startsWith("v24.")) {
    throw new Error(`Candidate requires Node24; got ${nodeVersion}`)
  }
  if (Bun.version !== "1.3.14") throw new Error(`Candidate requires Bun 1.3.14; got ${Bun.version}`)
  if (
    versions.find(([name]) => name === "electron")?.[1] !== pkg.devDependencies.electron ||
    versions.find(([name]) => name === "electron-builder")?.[1] !== pkg.devDependencies["electron-builder"]
  ) throw new Error("Candidate Electron/electron-builder dependency mismatch")
  return {
    sourceCommit, sourceTree, treeDigest: sha256(Buffer.from(await git("ls-tree", "-r", "HEAD"))),
    platform: process.platform, arch: process.arch,
    tools: { bun: Bun.version, node: nodeVersion, ...Object.fromEntries(versions) },
  }
}

export async function candidate(action: string) {
  if (action !== "build" && action !== "package") {
    throw new Error("Usage: bun run apps/desktop/scripts/lean-candidate.ts build|package")
  }
  assertCandidateHost()
  const runnerProbes = assertIntelRunner({
    vendor: await runCandidateCommand(["/usr/sbin/sysctl", "-n", "machdep.cpu.vendor"], process.env, desktop, 15_000),
    machine: await runCandidateCommand(["/usr/bin/uname", "-m"], process.env, desktop, 15_000),
    translated: await runCandidateCommand(["/usr/sbin/sysctl", "-n", "sysctl.proc_translated"], process.env, desktop, 15_000),
  })
  const source = await identity()
  const pkg = await Bun.file(path.join(desktop, "package.json")).json()
  const env = candidateEnv(pkg.version)
  if (action === "build") {
    const viteEnv = electronViteEnv(env)
    const buildResources = assertBuildResources(
      await runCandidateCommand(["/usr/sbin/sysctl", "-n", "hw.memsize"], env, desktop, 15_000),
      await runCandidateCommand(["node", "-p", "require('v8').getHeapStatistics().heap_size_limit"], viteEnv, desktop, 15_000),
    )
    await rm(manifestPath, { force: true })
    await rm(path.join(desktop, "out"), { recursive: true, force: true })
    await rm(leanOutput, { recursive: true, force: true })
    await command(["bun", "./scripts/copy-icons.ts", "prod"], env)
    await command(["bun", "./scripts/copy-metainfo.ts", "prod"], env)
    await leanNotices(leanOutput)
    const omniBuild = omniSource()
    await command(["bun", "-e", 'await (await import("./scripts/stage-omni.ts")).stageOmni("prod")'],
      { ...env, OMNI_ARTIFACTS: omniBuild.directory })
    // Cargo names the macOS addon libhugr_omni_node.dylib; stage-omni ships it as hugr_omni.node.
    const omni = await verifyOmni(path.join(desktop, "resources/omni"), await Promise.all(
      [omniBuild.addon, omniBuild.supervisor].map(async (file, index) => {
        const bytes = Buffer.from(await Bun.file(file).arrayBuffer())
        return { path: omniFiles[index]!, bytes: bytes.length, sha256: sha256(bytes) }
      })))
    // The base config's beforePack and afterPack refuse a package without the owned CLI in resources/cli, which the
    // production prebuild stages with buildCliToResources. That build reads omni from OMNI_ARTIFACTS/<omni id>/ under
    // the shipped names, so the same verified release pair is laid out there for the native target only.
    const cliOmni = await mkdtemp(path.join(tmpdir(), "lean-candidate-cli-omni-"))
    try {
      const omniId = path.join(cliOmni, omniTargets[nativeCliTarget(process.platform, process.arch)]!.id)
      await mkdir(omniId)
      await copyFile(omniBuild.addon, path.join(omniId, omniFiles[0]!))
      await copyFile(omniBuild.supervisor, path.join(omniId, omniFiles[1]!))
      await chmod(path.join(omniId, omniFiles[1]!), 0o755)
      await verifyOmni(omniId, omni)
      await command(["bun", "-e", 'await (await import("./scripts/utils.ts")).buildCliToResources()'],
        { ...env, OMNI_ARTIFACTS: cliOmni })
    } finally {
      await rm(cliOmni, { recursive: true, force: true })
    }
    // buildCliToResources staged the pinned rg with the CLI; the record pins it, signature checked.
    const ripgrep = await ripgrepRecord(path.join(desktop, "resources", ripgrepDirectory))
    await command(["bun", "run", "electron-vite", "build", "--config", "electron.vite.candidate.config.ts"], viteEnv)
    const materials = await verifyMaterials(path.join(leanOutput, "licenses"))
    const renderer = await inventory(path.join(desktop, "out/renderer"))
    const main = await inventory(path.join(desktop, "out/main"))
    const preload = await inventory(path.join(desktop, "out/preload"))
    for (const [directory, file] of [
      [path.join(desktop, "out/main"), "index.js"], [path.join(desktop, "out/preload"), "index.js"],
      [path.join(desktop, "out/renderer"), "index.html"],
    ]) {
      if (!(await Bun.file(path.join(directory!, file!)).exists())) {
        throw new Error(`Missing candidate build output: ${directory}/${file}`)
      }
    }
    if (!renderer.some((item) => /\.woff2?$/.test(item.path))) throw new Error("Missing production renderer fonts")
    if (JSON.stringify(await identity()) !== JSON.stringify(source)) throw new Error("Candidate source changed during build")
    await Bun.write(manifestPath, JSON.stringify({
      schemaVersion: 1, status: "built", accepted: false, ...source, appRelativePath,
      appId: "ai.hugr.orchestra.lean.candidate", productName: "HuGR Lean Candidate",
      renderer, main, preload, materials, runnerProbes,
      buildResources, omni, ripgrep, resources: await inventory(path.join(desktop, "resources")),
    }, null, 2) + "\n")
    return
  }
  const manifest = await Bun.file(manifestPath).json()
  for (const key of ["sourceCommit", "sourceTree", "treeDigest", "platform", "arch", "tools"] as const) {
    if (JSON.stringify(manifest[key]) !== JSON.stringify(source[key])) {
      throw new Error(`Candidate build identity mismatch: ${key}`)
    }
  }
  for (const [key, directory] of [
    ["renderer", path.join(desktop, "out/renderer")],
    ["main", path.join(desktop, "out/main")], ["preload", path.join(desktop, "out/preload")],
    ["resources", path.join(desktop, "resources")],
  ]) {
    if (JSON.stringify(manifest[key!]) !== JSON.stringify(await inventory(directory!))) {
      throw new Error(`Candidate build material changed: ${key}`)
    }
  }
  const packageRoot = path.resolve(path.dirname(Bun.resolveSync(pty, desktop)), "..")
  const metadata = await Bun.file(path.join(packageRoot, "package.json")).json()
  if (metadata.name !== pty || metadata.version !== "1.2.0-beta.12") {
    throw new Error("Candidate native PTY source version mismatch")
  }
  const nativePackage = await inventory(packageRoot)
  await Bun.write(manifestPath, JSON.stringify({ ...manifest, status: "packaging", accepted: false }, null, 2) + "\n")
  await rm(path.join(output, "mac"), { recursive: true, force: true })
  await command([
    "bun", "run", "electron-builder", "--config", "electron-builder.candidate.config.ts",
    "--mac", "--x64", "--dir", "--publish", "never",
  ], env)
  const resources = path.join(output, appRelativePath, "Contents/Resources")
  if (!(await Bun.file(path.join(resources, "app.asar")).exists())) throw new Error("Missing packaged app.asar")
  const builderRequire = createRequire(Bun.resolveSync("electron-builder/package.json", desktop))
  const require = createRequire(builderRequire.resolve("app-builder-lib/package.json"))
  const asar: { extractFile(archive: string, file: string): Buffer } = require("@electron/asar")
  for (const key of ["main", "preload", "renderer"] as const) {
    for (const file of manifest[key] as Awaited<ReturnType<typeof inventory>>) {
      const name = `out/${key}/${file.path}`
      const bytes = asar.extractFile(path.join(resources, "app.asar"), name)
      if (!bytes.length || sha256(bytes) !== file.sha256) {
        throw new Error(`Packaged ${key} differs from build: ${name}`)
      }
    }
  }
  const materials = await verifyMaterials(path.join(resources, "licenses"))
  const packagedMetadata = JSON.parse(
    asar.extractFile(path.join(resources, "app.asar"), `node_modules/${pty}/package.json`).toString(),
  )
  if (packagedMetadata.name !== pty || packagedMetadata.version !== metadata.version) {
    throw new Error("Packaged native PTY version mismatch")
  }
  for (const file of nativePackage.filter((file) => file.path.endsWith(".js"))) {
    const name = `node_modules/${pty}/${file.path}`
    if (sha256(asar.extractFile(path.join(resources, "app.asar"), name)) !== file.sha256) {
      throw new Error(`Packaged native PTY module differs from source: ${file.path}`)
    }
  }
  const binaries = nativePackage.filter((file) =>
    file.path.endsWith(".node") || path.basename(file.path) === "spawn-helper",
  )
  if (
    !binaries.some((file) => file.path.endsWith(".node")) ||
    !binaries.some((file) => path.basename(file.path) === "spawn-helper")
  ) throw new Error("Missing native PTY .node/spawn-helper")
  for (const file of binaries) {
    const target = path.join(resources, "app.asar.unpacked/node_modules", pty, file.path)
    if (!(await Bun.file(target).exists())) throw new Error(`Missing packaged native PTY: ${file.path}`)
    const bytes = Buffer.from(await Bun.file(target).arrayBuffer())
    if (sha256(bytes) !== file.sha256) throw new Error(`Packaged PTY differs from source: ${file.path}`)
    assertMachOX64(bytes, file.path)
    if (path.basename(file.path) === "spawn-helper" && !((await lstat(target)).mode & 0o111)) {
      throw new Error(`Packaged PTY helper not executable: ${file.path}`)
    }
  }
  await verifyOmni(path.join(resources, "omni"), manifest.omni)
  // The packaged rg is the one the build recorded, byte for byte, and still passes its pin and signature checks.
  if (JSON.stringify(await ripgrepRecord(path.join(resources, ripgrepDirectory))) !== JSON.stringify(manifest.ripgrep)) {
    throw new Error("Packaged ripgrep differs from the build record")
  }
  for (const icon of ["icon.png", "icon.ico", "dock.png"]) {
    const original = new Uint8Array(await Bun.file(path.join(desktop, "resources/icons", icon)).arrayBuffer())
    const packaged = new Uint8Array(await Bun.file(path.join(resources, "icons", icon)).arrayBuffer())
    if (sha256(packaged) !== sha256(original)) throw new Error(`Packaged icon mismatch: ${icon}`)
  }
  if (JSON.stringify(await identity()) !== JSON.stringify(source)) throw new Error("Candidate source changed during packaging")
  await Bun.write(manifestPath, JSON.stringify({
    ...manifest, status: "packaged", accepted: false, materials, runnerProbes,
    nativePty: { name: pty, version: metadata.version, binaries },
    packaged: await inventory(path.join(output, appRelativePath)),
  }, null, 2) + "\n")
}

if (import.meta.main) await candidate(process.argv[2] ?? "")
