#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, open, readdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"
import { namedTargets } from "./targets"

export async function exportArtifacts(input: { dist: string; out: string; version: string; targets: string[] }) {
  if (!input.version.trim() || input.version !== input.version.trim() || /[\x00-\x1f]/.test(input.version))
    throw new Error("Invalid artifact version")
  if (
    !input.targets.length ||
    new Set(input.targets).size !== input.targets.length ||
    input.targets.some((target) => !namedTargets.some((item) => item.target === target))
  )
    throw new Error("Unsupported or duplicate artifact target")
  if ([input.dist, input.out].some((path) => !path || path.split(/[\\/]/).includes("..")))
    throw new Error("Ambiguous artifact path traversal")
  const dist = resolve(input.dist)
  const out = resolve(input.out)
  if (
    [relative(dist, out), relative(out, dist)].some(
      (path) => path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)),
    )
  )
    throw new Error("Artifact source/output overlap")
  await requireDirectory(dist)
  await requireDirectory(dirname(out), true)
  // Capture every validated source before creating staging or changing output.
  const sources = await Promise.all(
    input.targets.map(async (target) => {
      const item = namedTargets.find((item) => item.target === target)!
      const source = join(dist, `cli-${target}`)
      const metadata: unknown = JSON.parse((await readRegular(join(source, "package.json"))).toString("utf8"))
      if (!metadata || typeof metadata !== "object" || !("version" in metadata) || metadata.version !== input.version)
        throw new Error(`Artifact version mismatch: ${target}`)
      if (
        !("name" in metadata) ||
        metadata.name !== `@orchestra/cli-${target}` ||
        !("os" in metadata) ||
        !Array.isArray(metadata.os) ||
        metadata.os.length !== 1 ||
        metadata.os[0] !== item.os ||
        !("cpu" in metadata) ||
        !Array.isArray(metadata.cpu) ||
        metadata.cpu.length !== 1 ||
        metadata.cpu[0] !== item.arch
      )
        throw new Error(`Artifact package tuple mismatch: ${target}`)
      const extension = item.os === "win32" ? ".exe" : ""
      const bytes = await readRegular(join(source, "bin", `orchestra${extension}`))
      return {
        target,
        file: `orchestra-${target}${extension}`,
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }
    }),
  )
  const manifest = {
    schema: 1 as const,
    version: input.version,
    artifacts: sources.map((source) => ({ target: source.target, file: source.file, sha256: source.sha256 })),
  }
  // Immutable retry reads and verifies every byte before doing any filesystem writes.
  if (await verifyPublication(out, manifest)) return manifest
  await mkdir(dirname(out), { recursive: true })
  const staging = await mkdtemp(join(dirname(out), ".cli-export-"))
  return Promise.allSettled(
    sources.map(async (source) => {
      const file = join(staging, source.file)
      await writeFile(file, source.bytes, { flag: "wx" })
      if (!source.target.startsWith("windows-")) await chmod(file, 0o755)
      if (
        createHash("sha256")
          .update(await readRegular(file))
          .digest("hex") !== source.sha256
      )
        throw new Error(`Copied artifact digest mismatch: ${source.target}`)
      return { target: source.target, file: source.file, sha256: source.sha256 }
    }),
  )
    .then(async (results) => {
      const failed = results.find((result) => result.status === "rejected")
      if (failed?.status === "rejected") throw failed.reason
      await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" })
      await requireDirectory(dirname(out))
      // No-replace is enforced by the OS, not an exists-then-rename race.
      await publishDirectory(staging, out).catch(async (error) => {
        if (await verifyPublication(out, manifest)) return
        throw error
      })
      return manifest
    })
    .finally(() => rm(staging, { recursive: true, force: true }))
}

async function verifyPublication(
  directory: string,
  manifest: {
    schema: 1
    version: string
    artifacts: { target: string; file: string; sha256: string }[]
  },
) {
  const stat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!stat) return false
  return Promise.resolve()
    .then(async () => {
      if (!stat.isDirectory()) throw new Error("Publication root must be a real directory")
      const value: unknown = JSON.parse((await readRegular(join(directory, "manifest.json"))).toString("utf8"))
      if (
        !value ||
        typeof value !== "object" ||
        Object.keys(value).length !== 3 ||
        !("schema" in value) ||
        value.schema !== manifest.schema ||
        !("version" in value) ||
        value.version !== manifest.version ||
        !("artifacts" in value) ||
        !Array.isArray(value.artifacts) ||
        value.artifacts.length !== manifest.artifacts.length
      )
        throw new Error("Publication descriptor mismatch")
      const targets = new Set<string>()
      await Promise.all(
        value.artifacts.map(async (artifact: unknown) => {
          if (
            !artifact ||
            typeof artifact !== "object" ||
            Object.keys(artifact).length !== 3 ||
            !("target" in artifact) ||
            !("file" in artifact) ||
            !("sha256" in artifact)
          )
            throw new Error("Invalid publication artifact")
          const expected = manifest.artifacts.find((entry) => entry.target === artifact.target)
          if (
            !expected ||
            artifact.file !== expected.file ||
            artifact.sha256 !== expected.sha256 ||
            targets.has(expected.target)
          )
            throw new Error("Publication artifact mismatch")
          targets.add(expected.target)
          if (
            createHash("sha256")
              .update(await readRegular(join(directory, expected.file)))
              .digest("hex") !== expected.sha256
          )
            throw new Error("Publication artifact digest mismatch")
        }),
      )
      const files = await readdir(directory)
      if (
        files.length !== manifest.artifacts.length + 1 ||
        files.some((file) => file !== "manifest.json" && !manifest.artifacts.some((entry) => entry.file === file))
      )
        throw new Error("Publication contains unowned files")
      const current = await lstat(directory)
      if (!current.isDirectory() || current.dev !== stat.dev || current.ino !== stat.ino)
        throw new Error("Publication root changed during verification")
      return true
    })
    .catch((cause) => {
      throw new Error(`Artifact publication conflict: ${directory}`, { cause })
    })
}

// POSIX rename replaces an existing empty directory. Use native exclusive rename
// so even a concurrent empty/invalid destination cannot be overwritten.
export async function publishDirectory(source: string, destination: string) {
  await requireDirectory(source)
  await requireDirectory(dirname(destination))
  if (process.platform === "win32") return rename(source, destination)
  if (process.platform !== "linux" && process.platform !== "darwin")
    throw new Error(`Unsupported atomic artifact publication platform: ${process.platform}`)
  const { dlopen, ptr, read } = await import("bun:ffi")
  const from = Buffer.from(`${source}\0`)
  const to = Buffer.from(`${destination}\0`)
  if (process.platform === "linux") {
    const musl = `/lib/ld-musl-${process.arch === "arm64" ? "aarch64" : "x86_64"}.so.1`
    const library = dlopen((await Bun.file(musl).exists()) ? musl : "libc.so.6", {
      renameat2: { args: ["i32", "ptr", "i32", "ptr", "u32"], returns: "i32" },
      __errno_location: { args: [], returns: "ptr" },
    })
    const result = library.symbols.renameat2(-100, ptr(from), -100, ptr(to), 1)
    const errno = result === 0 ? 0 : read.i32(library.symbols.__errno_location()!)
    library.close()
    if (result !== 0) throw new Error(`Exclusive artifact publication failed (errno ${errno}): ${destination}`)
    return
  }
  const library = dlopen("/usr/lib/libSystem.B.dylib", {
    renamex_np: { args: ["ptr", "ptr", "u32"], returns: "i32" },
    __error: { args: [], returns: "ptr" },
  })
  const result = library.symbols.renamex_np(ptr(from), ptr(to), 4)
  const errno = result === 0 ? 0 : read.i32(library.symbols.__error()!)
  library.close()
  if (result !== 0) throw new Error(`Exclusive artifact publication failed (errno ${errno}): ${destination}`)
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
  return handle
    .stat()
    .then(async (opened) => {
      if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino)
        throw new Error(`Artifact changed while opening: ${file}`)
      return handle.readFile()
    })
    .finally(() => handle.close())
}

if (import.meta.main) {
  const args = parseArgs({
    options: {
      dist: { type: "string" },
      out: { type: "string" },
      version: { type: "string" },
      target: { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: false,
  })
  if (!args.values.dist || !args.values.out || !args.values.version)
    throw new Error(
      "Usage: export-artifacts.ts --dist <directory> --out <directory> --version <version> --target <target> [--target <target> ...]",
    )
  await exportArtifacts({
    dist: args.values.dist,
    out: args.values.out,
    version: args.values.version,
    targets: args.values.target ?? [],
  })
}
