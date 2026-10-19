export * as PackagedSkills from "./packaged-skills"

import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

declare const ORCHESTRA_PACKAGED_SKILLS: unknown

export type Trees = Readonly<Record<string, Readonly<Record<string, string>>>>

export class PackagingError extends Error {
  override name = "PackagedSkillsError"
}

/** Undefined only in source execution. A defined but empty/malformed build must fail. */
export function embedded(): unknown {
  return typeof ORCHESTRA_PACKAGED_SKILLS === "undefined" ? undefined : ORCHESTRA_PACKAGED_SKILLS
}

/** SHA-256 of sorted combined relative paths and their exact UTF-8 content hashes. */
export function digest(trees: unknown) {
  return treeDigest(validate(trees))
}

/**
 * Stable, user-owned cooperative namespace: the mkdir lock serializes cooperating writers.
 * This does not claim immunity to a hostile writer replacing paths during filesystem operations.
 * Old versions are immutable and retained; only our own stage and lock are cleaned up.
 */
export async function materialize(input: {
  cache: string
  version: string
  trees?: unknown
  lockTimeoutMs?: number
}) {
  const trees = input.trees === undefined ? embedded() : input.trees
  if (trees === undefined) return []
  const files = validate(trees)
  const version = input.version.replace(/[^A-Za-z0-9._-]/g, "-")
  if (!version || !/[A-Za-z0-9]/.test(version)) throw new PackagingError("Invalid packaged skill version")
  const timeout = input.lockTimeoutMs ?? 10_000
  if (!Number.isFinite(timeout) || timeout < 0) throw new PackagingError("Invalid packaged skill lock timeout")
  await fs.mkdir(input.cache, { recursive: true })
  const namespace = path.join(await fs.realpath(input.cache), "packaged-skills")
  await fs.mkdir(namespace).catch((cause: unknown) => {
    if (!hasCode(cause, "EEXIST")) throw cause
  })
  await requireDirectory(namespace)
  const target = path.join(
    namespace,
    `${version.slice(0, 60)}-${createHash("sha256").update(input.version, "utf8").digest("hex")}-${treeDigest(files)}`,
  )
  // Published trees are immutable: verified readers need not wait for a writer's leftover lock.
  if (await stat(target)) {
    await verify(target, files)
    return roots(await fs.realpath(target), files)
  }
  const lock = `${target}.lock`
  await acquire(lock, timeout)
  const stage: { path?: string } = {}
  try {
    if (await stat(target)) {
      await verify(target, files)
      return roots(await fs.realpath(target), files)
    }
    stage.path = await fs.mkdtemp(`${target}.stage-`)
    // Sequential writes keep cleanup from racing writes still in flight after a failure.
    for (const file of files) {
      const destination = path.join(stage.path, ...file.path.split("/"))
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, file.text, { encoding: "utf8", flag: "wx" })
    }
    await verify(stage.path, files)
    // Refuse an unexpected destination rather than letting rename replace it.
    if (await stat(target)) throw new PackagingError(`Packaged skill destination appeared: ${target}`)
    await fs.rename(stage.path, target)
    stage.path = undefined
    await verify(target, files)
    return roots(await fs.realpath(target), files)
  } finally {
    try {
      if (stage.path) await fs.rm(stage.path, { recursive: true, force: true })
    } finally {
      await fs.rmdir(lock)
    }
  }
}

function validate(trees: unknown) {
  if (!record(trees) || Object.keys(trees).length === 0) throw new PackagingError("Empty or invalid packaged skill trees")
  const files = Object.entries(trees).flatMap(([id, tree]) => {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(id) || !safeSegment(id) || !record(tree) || Object.keys(tree).length === 0)
      throw new PackagingError(`Invalid packaged skill seat: ${id}`)
    const entries = Object.entries(tree).map(([file, text]) => {
      if (!file.split("/").every(safeSegment)) throw new PackagingError(`Invalid packaged skill path: ${id}/${file}`)
      if (typeof text !== "string" || Buffer.from(text, "utf8").toString("utf8") !== text)
        throw new PackagingError(`Invalid packaged skill UTF-8 text: ${id}/${file}`)
      if (path.posix.basename(file) === "SKILL.md" && !text.trim())
        throw new PackagingError(`Empty packaged SKILL.md: ${id}/${file}`)
      return { path: `${id}/${file}`, text }
    })
    if (!entries.some((file) => path.posix.basename(file.path) === "SKILL.md"))
      throw new PackagingError(`Missing packaged SKILL.md: ${id}`)
    return entries
  }).toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const names = new Map<string, string>()
  const directories = new Set<string>()
  files.forEach((file) => {
    file.path.split("/").forEach((_, index, parts) => {
      const name = parts.slice(0, index + 1).join("/")
      const previous = names.get(name.toLowerCase())
      if (previous !== undefined && previous !== name) throw new PackagingError(`Aliased packaged skill path: ${name}`)
      names.set(name.toLowerCase(), name)
      if (index < parts.length - 1) directories.add(name)
    })
  })
  if (files.some((file) => directories.has(file.path))) throw new PackagingError("Packaged skill file/directory conflict")
  return files
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function safeSegment(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== ".." && !value.endsWith(".") &&
    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)
}

function treeDigest(files: readonly { path: string; text: string }[]) {
  const hash = createHash("sha256")
  files.forEach((file) => hash.update(`${file.path}\0${createHash("sha256").update(file.text, "utf8").digest("hex")}\n`))
  return hash.digest("hex")
}

function roots(target: string, files: readonly { path: string }[]) {
  return [...new Set(files.map((file) => file.path.split("/")[0]))].map((id) => path.join(target, id))
}

function hasCode(cause: unknown, code: string) {
  return cause !== null && typeof cause === "object" && "code" in cause && cause.code === code
}

async function stat(file: string) {
  return fs.lstat(file).catch((cause: unknown) => {
    if (hasCode(cause, "ENOENT")) return undefined
    throw cause
  })
}

async function requireDirectory(directory: string) {
  const info = await fs.lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new PackagingError(`Invalid packaged skill directory: ${directory}`)
}

async function acquire(lock: string, timeout: number) {
  const deadline = Date.now() + timeout
  for (;;) {
    const acquired = await fs.mkdir(lock).then(() => true, (cause: unknown) => {
      if (hasCode(cause, "EEXIST")) return false
      // Windows fails mkdir with EPERM while another starter's lock is pending delete.
      if (process.platform === "win32" && hasCode(cause, "EPERM")) return false
      throw cause
    })
    if (acquired) return
    // Its owner may release between our failed mkdir and lstat; disappearance means retry.
    const info = await stat(lock)
    if (info && (!info.isDirectory() || info.isSymbolicLink()))
      throw new PackagingError(`Invalid packaged skill lock: ${lock}`)
    if (Date.now() >= deadline) throw new PackagingError(`Timed out waiting for packaged skill lock: ${lock}`)
    await new Promise((resolve) => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))))
  }
}

async function verify(root: string, files: readonly { path: string; text: string }[]) {
  const expected = new Map(files.map((file) => [file.path, Buffer.from(file.text, "utf8")]))
  const directories = new Set(files.flatMap((file) => file.path.split("/").slice(0, -1)
    .map((_, index) => file.path.split("/").slice(0, index + 1).join("/"))))
  const seen = new Set<string>()
  const visit = async (directory: string, relative: string): Promise<void> => {
    await requireDirectory(directory)
    for (const name of await fs.readdir(directory)) {
      const file = relative ? `${relative}/${name}` : name
      const target = path.join(directory, name)
      const info = await fs.lstat(target)
      if (info.isSymbolicLink()) throw new PackagingError(`Symlink in packaged skill tree: ${file}`)
      if (info.isDirectory()) {
        if (!directories.delete(file)) throw new PackagingError(`Unexpected packaged skill directory: ${file}`)
        await visit(target, file)
        continue
      }
      if (!info.isFile() || info.nlink !== 1) throw new PackagingError(`Non-regular or hardlinked packaged skill file: ${file}`)
      const bytes = expected.get(file)
      if (!bytes || !(await fs.readFile(target)).equals(bytes)) throw new PackagingError(`Packaged skill bytes differ: ${file}`)
      seen.add(file)
    }
  }
  await visit(root, "")
  if (seen.size !== expected.size || directories.size > 0) throw new PackagingError(`Incomplete packaged skill tree: ${root}`)
}
