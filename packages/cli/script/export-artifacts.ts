#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"
import { namedTargets } from "./targets"

export async function exportArtifacts(input: { dist: string; out: string; version: string; targets: string[] }) {
  if (!input.version.trim() || input.version !== input.version.trim() || /[\x00-\x1f]/.test(input.version))
    throw new Error("Invalid artifact version")
  if (!input.targets.length || new Set(input.targets).size !== input.targets.length ||
    input.targets.some((target) => !namedTargets.some((item) => item.target === target)))
    throw new Error("Unsupported or duplicate artifact target")
  if ([input.dist, input.out].some((path) => !path || path.split(/[\\/]/).includes("..")))
    throw new Error("Ambiguous artifact path traversal")
  const dist = resolve(input.dist)
  const out = resolve(input.out)
  if ([relative(dist, out), relative(out, dist)].some(
    (path) => path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)),
  )) throw new Error("Artifact source/output overlap")
  await requireDirectory(dist)
  await requireDirectory(out, true)
  // Capture every validated source before creating staging or changing output.
  const sources = await Promise.all(input.targets.map(async (target) => {
    const item = namedTargets.find((item) => item.target === target)!
    const source = join(dist, `cli-${target}`)
    const metadata: unknown = JSON.parse((await readRegular(join(source, "package.json"))).toString("utf8"))
    if (!metadata || typeof metadata !== "object" || !("version" in metadata) || metadata.version !== input.version)
      throw new Error(`Artifact version mismatch: ${target}`)
    if (!("name" in metadata) || metadata.name !== `@orchestra/cli-${target}` ||
      !("os" in metadata) || !Array.isArray(metadata.os) || metadata.os.length !== 1 || metadata.os[0] !== item.os ||
      !("cpu" in metadata) || !Array.isArray(metadata.cpu) || metadata.cpu.length !== 1 || metadata.cpu[0] !== item.arch)
      throw new Error(`Artifact package tuple mismatch: ${target}`)
    const extension = item.os === "win32" ? ".exe" : ""
    const bytes = await readRegular(join(source, "bin", `orchestra${extension}`))
    return { target, file: `orchestra-${target}${extension}`, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }
  }))
  await mkdir(dirname(out), { recursive: true })
  const staging = await mkdtemp(join(dirname(out), ".cli-export-"))
  return Promise.allSettled(sources.map(async (source) => {
    const file = join(staging, source.file)
    await writeFile(file, source.bytes, { flag: "wx" })
    if (!source.target.startsWith("windows-")) await chmod(file, 0o755)
    if (createHash("sha256").update(await readRegular(file)).digest("hex") !== source.sha256)
      throw new Error(`Copied artifact digest mismatch: ${source.target}`)
    return { target: source.target, file: source.file, sha256: source.sha256 }
  })).then(async (results) => {
    const failed = results.find((result) => result.status === "rejected")
    if (failed?.status === "rejected") throw failed.reason
    const manifest = { schema: 1, version: input.version, artifacts: results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []) }
    await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" })
    await requireDirectory(out, true)
    const previous = `${staging}-previous`
    // Portable directory replacement uses two renames, with rollback on publish failure.
    const moved = await rename(out, previous).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false
      throw error
    })
    await rename(staging, out).catch(async (error) => {
      if (moved) await rename(previous, out)
      throw error
    })
    if (moved) await rm(previous, { recursive: true, force: true })
    return manifest
  }).finally(() => rm(staging, { recursive: true, force: true }))
}

// Check every ancestor, including roots and new output's existing parents.
async function requireDirectory(directory: string, missing = false): Promise<void> {
  if (dirname(directory) !== directory) await requireDirectory(dirname(directory), missing)
  const stat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (missing && error.code === "ENOENT") return undefined
    throw error
  })
  if (stat && !stat.isDirectory()) throw new Error(`Artifact directory must be real: ${directory}`)
}

async function readRegular(file: string) {
  await requireDirectory(dirname(file))
  const stat = await lstat(file)
  if (!stat.isFile()) throw new Error(`Artifact must be a confined regular file: ${file}`)
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  return handle.stat().then(async (opened) => {
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino)
      throw new Error(`Artifact changed while opening: ${file}`)
    return handle.readFile()
  }).finally(() => handle.close())
}

if (import.meta.main) {
  const args = parseArgs({ options: {
    dist: { type: "string" }, out: { type: "string" }, version: { type: "string" }, target: { type: "string", multiple: true },
  }, strict: true, allowPositionals: false })
  if (!args.values.dist || !args.values.out || !args.values.version)
    throw new Error("Usage: export-artifacts.ts --dist <directory> --out <directory> --version <version> --target <target> [--target <target> ...]")
  await exportArtifacts({ dist: args.values.dist, out: args.values.out, version: args.values.version, targets: args.values.target ?? [] })
}
