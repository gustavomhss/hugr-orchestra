#!/usr/bin/env bun
import path from "node:path"
import { lstat, readlink, readdir, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { leanPin, sha256 } from "../../orchestra/script/lean-notices"

const desktop = path.resolve(import.meta.dirname, "..")
const root = path.resolve(desktop, "../..")
const output = path.join(desktop, "dist-candidate")
const backend = path.resolve(desktop, "../orchestra/dist/node")
const manifestPath = path.join(output, "lean-candidate-build.json")
const appRelativePath = "mac/HuGR Lean Candidate.app"
const pty = "@lydell/node-pty-darwin-x64"

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
  const archive = new Uint8Array(await Bun.file(path.resolve(desktop, "../core/vendor", leanPin.artifact)).arrayBuffer())
  if (sha256(archive) !== leanPin.sha256) throw new Error("Unapproved Lean archive")
  const files = await new Bun.Archive(archive).files()
  const names = [...files.keys()].filter((file) =>
    file === "package/LICENSE" || file === "package/NOTICE" ||
    file.startsWith("package/licenses/") || file.endsWith("/SOURCES.md"),
  ).sort()
  if (names.length !== 49) throw new Error(`Lean material inventory expected 49; got ${names.length}`)
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

export function assertMachOX64(bytes: Buffer, name: string) {
  if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== 0x01000007) {
    throw new Error(`Expected x64 Mach-O: ${name}`)
  }
}

async function command(args: string[], env: NodeJS.ProcessEnv, cwd = desktop) {
  const child = Bun.spawn(args, { cwd, env, stdout: "inherit", stderr: "inherit" })
  const code = await child.exited
  if (code !== 0) throw new Error(`Candidate command failed (${code}): ${args.join(" ")}`)
}

async function git(...args: string[]) {
  const child = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "inherit" })
  const text = await new Response(child.stdout).text()
  if ((await child.exited) !== 0) throw new Error(`Candidate git command failed: ${args.join(" ")}`)
  return text.trim()
}

async function identity() {
  // dist-candidate is intentionally generated but not ignored by the production tree.
  if (await git("status", "--porcelain", "--untracked-files=normal", "--", ".", ":(exclude)packages/desktop/dist-candidate")) {
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
  const node = Bun.spawn(["node", "--version"], { stdout: "pipe", stderr: "inherit" })
  const nodeVersion = (await new Response(node.stdout).text()).trim()
  if ((await node.exited) !== 0 || !nodeVersion.startsWith("v24.")) {
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
    throw new Error("Usage: bun run packages/desktop/scripts/lean-candidate.ts build|package")
  }
  assertCandidateHost()
  const hardware = Bun.spawn(["/usr/sbin/sysctl", "-n", "hw.optional.arm64"], { stdout: "pipe", stderr: "inherit" })
  const arm = (await new Response(hardware.stdout).text()).trim()
  if ((await hardware.exited) !== 0 || arm !== "0") {
    throw new Error("Lean candidate requires native Intel hardware (hw.optional.arm64=0)")
  }
  const source = await identity()
  const pkg = await Bun.file(path.join(desktop, "package.json")).json()
  // Child tools receive build plumbing only, never release/signing credentials.
  const env = Object.fromEntries([
    "PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SHELL", "CI", "GITHUB_ACTIONS", "GITHUB_SHA",
    "SDKROOT", "DEVELOPER_DIR",
  ].flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]!]]))
  Object.assign(env, { ORCHESTRA_CHANNEL: "prod", ORCHESTRA_VERSION: pkg.version, CSC_IDENTITY_AUTO_DISCOVERY: "false" })
  if (action === "build") {
    await rm(manifestPath, { force: true })
    await rm(path.join(desktop, "out"), { recursive: true, force: true })
    await rm(backend, { recursive: true, force: true })
    await command(["bun", "run", "prebuild"], env)
    await command(["bun", "run", "electron-vite", "build", "--config", "electron.vite.candidate.config.ts"], env)
    const materials = await verifyMaterials(path.join(backend, "licenses"))
    const renderer = await inventory(path.join(desktop, "out/renderer"))
    const main = await inventory(path.join(desktop, "out/main"))
    const preload = await inventory(path.join(desktop, "out/preload"))
    for (const [directory, file] of [
      [backend, "node.js"], [path.join(desktop, "out/main"), "index.js"],
      [path.join(desktop, "out/main"), "sidecar.js"], [path.join(desktop, "out/preload"), "index.js"],
      [path.join(desktop, "out/renderer"), "index.html"],
    ]) {
      if (!(await Bun.file(path.join(directory!, file!)).exists())) {
        throw new Error(`Missing candidate build output: ${directory}/${file}`)
      }
    }
    const wasm = (await inventory(backend)).filter((item) => item.path.endsWith(".wasm"))
    if (!wasm.length) throw new Error("Missing backend WASM sidecar material")
    for (const file of wasm) {
      if (!main.some((item) => item.path === `chunks/${file.path}` && item.sha256 === file.sha256)) {
        throw new Error(`Missing/mismatched sidecar WASM: ${file.path}`)
      }
    }
    if (!renderer.some((item) => /\.woff2?$/.test(item.path))) throw new Error("Missing production renderer fonts")
    if (JSON.stringify(await identity()) !== JSON.stringify(source)) throw new Error("Candidate source changed during build")
    await Bun.write(manifestPath, JSON.stringify({
      schemaVersion: 1, status: "built", accepted: false, ...source, appRelativePath,
      appId: "ai.hugr.orchestra.lean.candidate", productName: "HuGR Lean Candidate",
      backend: await inventory(backend), renderer, main, preload, materials,
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
    ["backend", backend], ["renderer", path.join(desktop, "out/renderer")],
    ["main", path.join(desktop, "out/main")], ["preload", path.join(desktop, "out/preload")],
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
  for (const icon of ["icon.png", "icon.ico", "dock.png"]) {
    const original = new Uint8Array(await Bun.file(path.join(desktop, "resources/icons", icon)).arrayBuffer())
    const packaged = new Uint8Array(await Bun.file(path.join(resources, "icons", icon)).arrayBuffer())
    if (sha256(packaged) !== sha256(original)) throw new Error(`Packaged icon mismatch: ${icon}`)
  }
  if (JSON.stringify(await identity()) !== JSON.stringify(source)) throw new Error("Candidate source changed during packaging")
  await Bun.write(manifestPath, JSON.stringify({
    ...manifest, status: "packaged", accepted: false, materials,
    nativePty: { name: pty, version: metadata.version, binaries },
    packaged: await inventory(path.join(output, appRelativePath)),
    nativeResources: {
      tracked: Boolean(await git("ls-tree", "HEAD", "packages/desktop/native")),
      scope: "Production native filters preserved; legacy mac_window addon is not a Lean dependency.",
    },
  }, null, 2) + "\n")
}

if (import.meta.main) await candidate(process.argv[2] ?? "")
