import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { link, lstat, open, readdir, rm } from "node:fs/promises"
import { basename, dirname, join, parse, resolve, sep } from "node:path"
import { omniTargets } from "@orchestra/script/omni"
import { NATIVE_MACHINES, treeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { artifactNative } from "./artifact-fs"
import { namedTargets } from "./targets"

export type DistributionManifest = {
  schema: "orchestra-distribution-v1"
  version: string
  target: string
  files: { path: string; sha256: string; executable: boolean }[]
}
type Captured = Map<string, { bytes: Buffer; executable: boolean }>

// Shares the stable, exclusively producer-owned namespace boundary documented in
// specs/runtime-closure/PRODUCER-BOUNDARY.md, including owned-path cleanup.
export async function prepareDistribution(input: { dist: string; out: string; version: string; target: string }): Promise<DistributionManifest> {
  requireTarget(input.target, input.version)
  if (process.platform === "win32") {
    const { requireOrdinaryWindowsPath } = await import("./artifact-windows-root")
    requireOrdinaryWindowsPath(input.dist)
    requireOrdinaryWindowsPath(input.out)
  }
  if ([input.dist, input.out].some((path) => !path || path.includes("\0") || path.split(/[\\/]/).includes("..")))
    throw new Error("Unsafe distribution location")
  const source = resolve(input.dist, `cli-${input.target}`)
  const output = resolve(input.out)
  if (source === output || source.startsWith(output + sep) || output.startsWith(source + sep))
    throw new Error("Distribution source/output overlap")
  const captured = await capture(source)
  if ([...captured.keys()].some((file) => file !== "package.json" && !file.startsWith("bin/")))
    throw new Error("Unexpected build root file")
  requirePayload(captured, input.target, input.version)
  const manifest: DistributionManifest = {
    schema: "orchestra-distribution-v1", version: input.version, target: input.target,
    files: [...captured].map(([path, file]) => ({ path, sha256: hash(file.bytes), executable: file.executable })),
  }
  captured.set("distribution.json", { bytes: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"), executable: false })
  captured.set("checksums.sha256", { bytes: Buffer.from(checksums(captured)), executable: false })
  const native = await artifactNative()
  const handles: ReturnType<typeof native.root>[] = []
  const state = { stage: "", published: false }
  try {
    const walk = (path: string, missing = false) => {
      const root = parse(path).root
      const ancestors = [native.root(root)]
      handles.push(ancestors[0]!)
      const parts = path.slice(root.length).split(sep).filter(Boolean)
      for (const name of parts) {
        try {
          const directory = native.directory(ancestors.at(-1)!, name)
          handles.push(directory)
          ancestors.push(directory)
        } catch (error) {
          if (missing && error && typeof error === "object" && "code" in error && error.code === "ENOENT")
            return { ancestors, missing: true }
          throw error
        }
      }
      return { ancestors, missing: false }
    }
    const origin = walk(source)
    const destination = walk(output, true)
    // Nofollow identity checks catch case aliases, including missing suffixes,
    // before any output ancestor is created in the stable producer-owned namespace.
    if (destination.ancestors.some((entry) => entry.identity === origin.ancestors.at(-1)!.identity) ||
      (!destination.missing && origin.ancestors.some((entry) => entry.identity === destination.ancestors.at(-1)!.identity)))
      throw new Error("Distribution source/output overlap")
    const absolute = dirname(output)
    const root = parse(absolute).root
    const start = native.root(root)
    handles.push(start)
    const parent = absolute.slice(root.length).split(sep).filter(Boolean).reduce((parent, name) => {
      const directory = native.directory(parent, name, { create: true })
      handles.push(directory)
      return directory
    }, start)
    if (await exists(output)) {
      await requireSame(output, manifest, captured)
      return manifest
    }
    const name = `.distribution-${randomUUID()}`
    const stage = native.directory(parent, name, { create: true, exclusive: true, removable: true })
    handles.push(stage)
    state.stage = join(absolute, name)
    const retained = handles.length
    const directories = new Map([["", stage]])
    for (const [file, value] of captured) {
      const parts = file.split("/")
      const directory = parts.slice(0, -1).reduce((parent, part, index) => {
        const key = parts.slice(0, index + 1).join("/")
        const existing = directories.get(key)
        if (existing) return existing
        const child = native.directory(parent, part, { create: true, exclusive: true, removable: true })
        handles.push(child)
        directories.set(key, child)
        return child
      }, stage)
      native.write(directory, parts.at(-1)!, value.bytes, value.executable)
    }
    await requireSame(state.stage, manifest, captured)
    handles.forEach((handle) => handle.validateRoot?.())
    // All writes and integrity checks are complete. Windows directory rename
    // requires descendant handles closed, but the DELETE-capable stage stays pinned.
    while (handles.length > retained) {
      native.closeDirectory(handles.at(-1)!)
      handles.pop()
    }
    try {
      native.publish(parent, name, stage, basename(output))
      state.published = true
    } catch (cause) {
      if (!(await exists(output))) throw cause
      await requireSame(output, manifest, captured)
    }
    return manifest
  } finally {
    const errors: unknown[] = []
    handles.reverse().forEach((handle) => {
      try { native.closeDirectory(handle) } catch (error) { errors.push(error) }
    })
    try { native.close() } catch (error) { errors.push(error) }
    if (errors.length) throw new AggregateError(errors, "Distribution directory closure failed")
    // No closed handle is reused for cleanup; only this invocation's unpublished
    // stage path is removed, after every handle closes under the producer boundary.
    if (state.stage && !state.published) await rm(state.stage, { recursive: true, force: true })
  }
}

export async function verifyDistribution(directory: string, expected?: { version?: string; target?: string }): Promise<DistributionManifest> {
  return verifyCaptured(await capture(directory), expected)
}

export async function archiveDistribution(input: { directory: string; file: string }): Promise<{ version: string; target: string; file: string; sha256: string }> {
  const captured = await capture(input.directory)
  const manifest = verifyCaptured(captured)
  // Bun normalizes tar modes; installers must restore executable flags from the descriptor.
  const archive = new Bun.Archive(Object.fromEntries([...captured].map(([path, value]) => [path, value.bytes])), { compress: "gzip" })
  const bytes = Buffer.from(await archive.bytes())
  const file = resolve(input.file)
  if (!input.file || input.file.includes("\0") || input.file.split(/[\\/]/).includes("..")) throw new Error("Unsafe archive location")
  if (file === resolve(input.directory) || file.startsWith(resolve(input.directory) + sep)) throw new Error("Archive/payload overlap")
  if (process.platform === "win32") {
    const { requireOrdinaryWindowsPath } = await import("./artifact-windows-root")
    requireOrdinaryWindowsPath(input.file)
  }
  await requireAncestors(dirname(file))
  const origin = await lstat(input.directory, { bigint: true })
  const parent = dirname(file)
  const root = parse(parent).root
  // A case alias must not let archive staging mutate the verified payload.
  for (const ancestor of [root, ...parent.slice(root.length).split(sep).filter(Boolean)
    .map((_, index, parts) => join(root, ...parts.slice(0, index + 1)))]) {
    const info = await lstat(ancestor, { bigint: true })
    if (info.dev === origin.dev && info.ino === origin.ino) throw new Error("Archive/payload overlap")
  }
  const stage = join(dirname(file), `.distribution-archive-${randomUUID()}`)
  const handle = await open(stage, "wx", 0o644)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    // link is atomic and refuses even an empty existing destination. No rename fallback.
    await link(stage, file)
  } finally {
    await handle.close()
    await rm(stage, { force: true })
  }
  return { version: manifest.version, target: manifest.target, file: input.file, sha256: hash(bytes) }
}

function verifyCaptured(captured: Captured, expected?: { version?: string; target?: string }): DistributionManifest {
  const value = JSON.parse(captured.get("distribution.json")?.bytes.toString("utf8") ?? "null") as DistributionManifest
  if (!value || Object.keys(value).sort().join(",") !== "files,schema,target,version" || value.schema !== "orchestra-distribution-v1")
    throw new Error("Invalid distribution descriptor")
  requireTarget(value.target, value.version)
  if ((expected?.version !== undefined && expected.version !== value.version) || (expected?.target !== undefined && expected.target !== value.target))
    throw new Error("Distribution version/target mismatch")
  if (!Array.isArray(value.files) || !value.files.length) throw new Error("Invalid distribution files")
  const paths = value.files.map((entry) => {
    if (!entry || Object.keys(entry).sort().join(",") !== "executable,path,sha256" || typeof entry.executable !== "boolean" || !/^[a-f0-9]{64}$/.test(entry.sha256))
      throw new Error("Invalid distribution file entry")
    requirePath(entry.path)
    if (entry.path !== "package.json" && !entry.path.startsWith("bin/")) throw new Error("Invalid payload path")
    const actual = captured.get(entry.path)
    if (!actual || hash(actual.bytes) !== entry.sha256 || actual.executable !== entry.executable)
      throw new Error(`Distribution file mismatch: ${entry.path}`)
    return entry.path
  })
  if (new Set(paths).size !== paths.length || paths.join("\n") !== [...paths].sort().join("\n") || captured.size !== paths.length + 2)
    throw new Error("Distribution file set mismatch")
  if (captured.get("distribution.json")?.executable || captured.get("checksums.sha256")?.executable || captured.get("checksums.sha256")?.bytes.toString("utf8") !== checksums(captured))
    throw new Error("Distribution checksum table mismatch")
  requirePayload(captured, value.target, value.version)
  return value
}

function requirePayload(captured: Captured, target: string, version: string) {
  const tuple = requireTarget(target, version)
  const metadata = JSON.parse(captured.get("package.json")?.bytes.toString("utf8") ?? "null")
  if (!metadata || metadata.name !== `@orchestra/cli-${target}` || metadata.version !== version || JSON.stringify(metadata.os) !== JSON.stringify([tuple.os]) || JSON.stringify(metadata.cpu) !== JSON.stringify([tuple.arch]))
    throw new Error("Distribution package tuple/version mismatch")
  const omni = omniTargets[target]
  if (!omni) throw new Error("Missing omni target row")
  const executable = `bin/orchestra${tuple.os === "win32" ? ".exe" : ""}`
  const supervisor = `bin/hugr-omni-supervisor${tuple.os === "win32" ? ".exe" : ""}`
  const bundle = treeSitterBundle(tuple).map((file) => `bin/tree-sitter/${file}`)
  const required = [executable, ...bundle, ...(omni.enabled ? ["bin/hugr_omni.node", supervisor] : [])]
  required.forEach((file) => {
    if (!captured.has(file)) throw new Error(`Missing distribution companion: ${file}`)
  })
  if (tuple.os !== "win32" && (!captured.get(executable)?.executable || (omni.enabled && !captured.get(supervisor)?.executable)))
    throw new Error("Missing executable mode")
  for (const [file, value] of captured) {
    if (file.startsWith("bin/hugr") && (!omni.enabled || !["bin/hugr_omni.node", supervisor].includes(file)))
      throw new Error(`Unexpected omni companion: ${file}`)
    if (file.startsWith("bin/tree-sitter/") && !bundle.includes(file)) throw new Error(`Unexpected tree-sitter companion: ${file}`)
    if (file.endsWith(".node") && !nativeHeader(value.bytes, tuple.os, NATIVE_MACHINES[`${tuple.os}-${tuple.arch}`]!))
      throw new Error(`Native binding target mismatch: ${file}`)
  }
}

function nativeHeader(data: Buffer, os: string, machine: number) {
  if (os === "linux") return data.length >= 20 && data.readUInt32BE(0) === 0x7f454c46 && data[4] === 2 && data[5] === 1 && data.readUInt16LE(18) === machine
  if (os === "win32") {
    if (data.length < 64 || data.readUInt16LE(0) !== 0x5a4d) return false
    const offset = data.readUInt32LE(0x3c)
    return offset + 6 <= data.length && data.readUInt32BE(offset) === 0x50450000 && data.readUInt16LE(offset + 4) === machine
  }
  if (data.length < 8) return false
  if ([0xfeedface, 0xfeedfacf].includes(data.readUInt32LE(0))) return data.readUInt32LE(4) === machine
  if (![0xcafebabe, 0xcafebabf].includes(data.readUInt32BE(0))) return false
  const size = data.readUInt32BE(0) === 0xcafebabe ? 20 : 32
  const count = data.readUInt32BE(4)
  return count > 0 && count <= (data.length - 8) / size && Array.from({ length: count }, (_, index) => data.readUInt32BE(8 + index * size)).includes(machine)
}

// Stable producer-owned namespace only; bounded identity checks do not defeat authorized concurrent rewrites.
async function capture(directory: string): Promise<Captured> {
  await requireAncestors(directory)
  const files: Captured = new Map()
  const walk = async (relative: string) => {
    const full = join(directory, relative)
    const before = await lstat(full)
    if (!before.isDirectory()) throw new Error(`Not a real directory: ${full}`)
    const names = (await readdir(full)).sort()
    for (const name of names) {
      const path = relative ? `${relative}/${name}` : name
      requirePath(path)
      const location = join(directory, path)
      const info = await lstat(location)
      if (info.isDirectory()) { await walk(path); continue }
      if (!info.isFile() || info.nlink !== 1 || info.size === 0) throw new Error(`Not a nonempty unlinked regular file: ${path}`)
      const handle = await open(location, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
      try {
        const pinned = await handle.stat()
        if (!same(info, pinned)) throw new Error(`File identity changed: ${path}`)
        const bytes = await handle.readFile()
        if (!same(pinned, await handle.stat()) || !same(pinned, await lstat(location)) || bytes.length !== pinned.size)
          throw new Error(`File changed during capture: ${path}`)
        files.set(path, { bytes, executable: Boolean(pinned.mode & 0o111) })
      } finally { await handle.close() }
    }
    if (!same(before, await lstat(full)) || names.join("\n") !== (await readdir(full)).sort().join("\n"))
      throw new Error(`Directory changed during capture: ${full}`)
    if (relative && !names.length) throw new Error(`Empty payload directory: ${relative}`)
  }
  await walk("")
  return new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
}

async function requireAncestors(path: string) {
  if (!path || path.includes("\0") || path.split(/[\\/]/).includes("..")) throw new Error("Unsafe distribution location")
  if (process.platform === "win32") {
    const { requireOrdinaryWindowsPath } = await import("./artifact-windows-root")
    requireOrdinaryWindowsPath(path)
  }
  const absolute = resolve(path)
  const root = parse(absolute).root
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean).map((_, index, parts) => join(root, ...parts.slice(0, index + 1))))
    if (!(await lstat(part)).isDirectory()) throw new Error(`Not a real directory: ${part}`)
}

function same(a: Awaited<ReturnType<typeof lstat>>, b: Awaited<ReturnType<typeof lstat>>) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs
}
function requirePath(path: string) {
  if (typeof path !== "string" || !/^[\x20-\x7e]+$/.test(path) || /[\\:<>"|?*]/.test(path) || path.split("/").some((part) => !part || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part)))
    throw new Error("Unsafe distribution path")
}
function requireTarget(target: string, version: string) {
  const tuple = namedTargets.find((item) => item.target === target)
  if (!tuple || typeof version !== "string" || !version || !/^[\x21-\x7e]+$/.test(version)) throw new Error("Invalid distribution target/version")
  return tuple
}
function hash(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex") }
function checksums(files: Captured) {
  return [...files].filter(([path]) => path !== "checksums.sha256").sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, value]) => `${hash(value.bytes)}  ${path}\n`).join("")
}
async function exists(path: string) {
  return lstat(path).then(() => true, (error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
    throw error
  })
}
async function requireSame(directory: string, manifest: DistributionManifest, expected: Captured) {
  const actual = await capture(directory)
  if (JSON.stringify(verifyCaptured(actual)) !== JSON.stringify(manifest) || actual.size !== expected.size || [...expected].some(([path, file]) => !actual.get(path)?.bytes.equals(file.bytes) || actual.get(path)?.executable !== file.executable))
    throw new Error("Distribution publication conflict")
}
