// Hosted actual --dir app; source and packaged bytes pinned before any lifecycle claim.
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { ROOT, win } from "../../../omni/campaign/lib"

export const logs = path.join(ROOT, "packages/desktop/.omni-desktop-evidence")
export const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex")
export const base = "fcddb1a7a152ea4f7276c9b9a269da7b383c91ba"

async function command(args: string[], env = process.env) {
  const child = Bun.spawn(args, { cwd: path.join(ROOT, "packages/desktop"), env, stdout: "inherit", stderr: "inherit", timeout: 900_000 })
  if (await child.exited !== 0) throw new Error(`desktop build failed: ${args.join(" ")}`)
}

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: ROOT })
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`)
  return result.stdout.toString().trim()
}

export async function build() {
  if (!process.env.CI || !process.env.GITHUB_SHA) throw new Error("desktop matrix requires hosted CI; owner app execution forbidden")
  mkdirSync(logs, { recursive: true })
  const sourceSHA = git("rev-parse", "HEAD")
  const dirty = git("status", "--porcelain", "--untracked-files=no")
  if (sourceSHA !== (process.env.DESKTOP_PR_HEAD || process.env.GITHUB_SHA) || dirty) throw new Error(`desktop source pin/clean checkout mismatch: ${sourceSHA}; ${dirty}`)
  if (git("merge-base", base, sourceSHA) !== base) throw new Error("desktop baseline not ancestor of exact checkout")
  const files = git("ls-files", "-z").split("\0").filter((file) => /^(packages\/|script\/|patches\/|bun.lock$|package.json$|\.github\/actions\/)/.test(file))
  if (!files.includes("packages/orchestra/script/build-node.ts") || !files.includes("packages/omni/Cargo.lock")) throw new Error("source manifest incomplete")
  const sourceHashes = Object.fromEntries(files.map((file) => [file, digest(path.join(ROOT, file))]))
  const addon = process.env.HUGR_OMNI_ADDON
  const supervisor = process.env.HUGR_OMNI_SUPERVISOR
  if (!addon || !supervisor || [addon, supervisor].some((file) => !existsSync(file) || !path.resolve(file).startsWith(path.join(ROOT, "packages/omni/target/release") + path.sep))) throw new Error("desktop needs exact-source release native artifacts")
  const platform = win ? "win32-x64-msvc" : `${process.platform}-${process.arch}${process.platform === "linux" ? "-gnu" : ""}`
  const native = path.join(logs, "native", platform)
  mkdirSync(native, { recursive: true })
  copyFileSync(addon, path.join(native, "hugr_omni.node"))
  copyFileSync(supervisor, path.join(native, path.basename(supervisor)))
  const at = new Date().toISOString()
  writeFileSync(path.join(logs, "inputs.json"), JSON.stringify({ base, sourceSHA, sourceTree: git("rev-parse", "HEAD^{tree}"), prBase: process.env.DESKTOP_PR_BASE, prHead: process.env.DESKTOP_PR_HEAD,
    at, sourceHashes, addonSha256: digest(addon), supervisorSha256: digest(supervisor) }, null, 2))
  // Hosted ARM Mac's default 2 GiB V8 limit cannot transform this actual server bundle (measured OOM).
  // Builder only: none of these options reach the app fixture's isolated environment.
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096", ORCHESTRA_CHANNEL: "beta", ORCHESTRA_FAST_BUILD: "1", CSC_IDENTITY_AUTO_DISCOVERY: "false", OMNI_ARTIFACTS: native }
  await command([process.execPath, "scripts/prebuild.ts"], env)
  await command([process.execPath, "x", "electron-vite", "build"], env)
  await command([process.execPath, "x", "electron-builder", "--dir", process.platform === "darwin" ? "--mac" : win ? "--win" : "--linux", "--config", "test/omni-smoke/unsigned.config.ts"], env)
  const desktop = path.join(ROOT, "packages/desktop")
  const unpacked = path.join(desktop, "dist", process.platform === "darwin" ? process.arch === "arm64" ? "mac-arm64" : "mac" : win ? "win-unpacked" : "linux-unpacked")
  const bundle = process.platform === "darwin" ? path.join(unpacked, "HuGR Orchestra Beta.app/Contents") : unpacked
  const resources = path.join(bundle, process.platform === "darwin" ? "Resources" : "resources")
  const executable = path.join(bundle, process.platform === "darwin" ? "MacOS/HuGR Orchestra Beta" : win ? "HuGR Orchestra Beta.exe" : "ai.hugr.orchestra.beta")
  if (!existsSync(executable) || digest(path.join(resources, "omni/hugr_omni.node")) !== digest(addon) || digest(path.join(resources, "omni", path.basename(supervisor))) !== digest(supervisor)) throw new Error("packaged Resources/omni differs from release inputs")
  const require = createRequire(createRequire(import.meta.url).resolve("electron-builder"))
  const asar = require("@electron/asar") as { extractFile(archive: string, file: string): Buffer }
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
  const outputs = walk(path.join(desktop, "out"))
  if (!outputs.some((file) => file.replaceAll("\\", "/").endsWith("/main/sidecar.js")) || !outputs.some((file) => file.replaceAll("\\", "/").endsWith("/main/index.js")) || !outputs.some((file) => file.endsWith(".wasm"))) throw new Error("actual Node/sidecar bundle assets incomplete")
  const bundleHashes = Object.fromEntries(outputs.map((file) => {
    const relative = path.relative(desktop, file).replaceAll("\\", "/")
    const packaged = createHash("sha256").update(asar.extractFile(path.join(resources, "app.asar"), relative)).digest("hex")
    if (packaged !== digest(file)) throw new Error(`app.asar byte mismatch: ${relative}`)
    return [relative, packaged]
  }))
  if (files.some((file) => digest(path.join(ROOT, file)) !== sourceHashes[file])) throw new Error("tracked source changed during actual app build")
  const manifest = { base, sourceSHA, sourceTree: git("rev-parse", "HEAD^{tree}"), prBase: process.env.DESKTOP_PR_BASE, prHead: process.env.DESKTOP_PR_HEAD,
    at, completedAt: new Date().toISOString(), run: process.env.GITHUB_RUN_ID, os: process.platform, arch: process.arch, platform,
    executable, resources, executableSha256: digest(executable), archiveSha256: digest(path.join(resources, "app.asar")), bundleHashes,
    sourceHashes, addonSha256: digest(addon), supervisorSha256: digest(supervisor),
    scope: "unsigned actual electron-builder --dir app; signing/notarization unproved (no owner keys); not published", nativeProvenance: "omni-binaries exact-source cache key; release build on miss" }
  writeFileSync(path.join(logs, "build.json"), JSON.stringify(manifest, null, 2))
  console.log("DESKTOP_BUILD " + JSON.stringify({ ...manifest, sourceHashes: undefined, bundleHashes: undefined }))
  return manifest
}

export function provenance() {
  const manifest = JSON.parse(readFileSync(path.join(logs, "build.json"), "utf8")) as Awaited<ReturnType<typeof build>>
  if (manifest.sourceSHA !== (process.env.DESKTOP_PR_HEAD || process.env.GITHUB_SHA) || digest(manifest.executable) !== manifest.executableSha256 || digest(path.join(manifest.resources, "app.asar")) !== manifest.archiveSha256 || digest(path.join(manifest.resources, "omni/hugr_omni.node")) !== manifest.addonSha256 || digest(path.join(manifest.resources, "omni", win ? "hugr-omni-supervisor.exe" : "hugr-omni-supervisor")) !== manifest.supervisorSha256) throw new Error("actual app provenance mismatch")
  return manifest
}

if (import.meta.main) await build()
