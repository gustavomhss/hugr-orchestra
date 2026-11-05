export * as DependencyShadow from "./dependency-shadow"

import path from "path"
import { fileURLToPath } from "url"
import { lstat, link, mkdir, open, opendir, readlink, realpath, symlink } from "fs/promises"
import { Effect } from "effect"
import { FSUtil } from "../../fs-util"
import { denied } from "./assets"

// Owned shadow of node_modules / .venv / target. Not a live directory graft, and not a
// claim that absolute imports or editable loaders become historical.

const NAMES = ["node_modules", ".venv", "target"] as const
const ENTRIES = 100_000
const PATH_BYTES = 32 * 1024 * 1024
const CONCURRENCY = 8
const LINK_HOPS = 40
const LOADER_BYTES = 64 * 1024

class Refusal extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

const refuse = (reason: string): never => {
  throw new Refusal(reason)
}

const codeOf = (error: unknown) => {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code
  if (error instanceof Error) return error.message
  return "unknown"
}

export const project = Effect.fn("DependencyShadow.project")(function* (input: {
  readonly repo: string
  readonly root: string
  readonly reviewed: ReadonlyArray<string>
}) {
  return yield* Effect.tryPromise({
    try: () => projectGraph(input),
    catch: (error) => error instanceof Refusal
      ? denied(error.reason)
      : denied(`snapshot-dependency-layout-unsupported: ${codeOf(error)}`),
  })
})

type Source = { readonly relative: string; readonly absolute: string }
type Budget = { entries: number; pathBytes: number }
type Reviewed = { readonly files: ReadonlySet<string>; readonly dirs: ReadonlySet<string> }
type Planned =
  | { readonly kind: "dir"; readonly relative: string }
  | { readonly kind: "file"; readonly relative: string; readonly source: string }
  | { readonly kind: "link"; readonly relative: string; readonly target: string; readonly directory: boolean }

async function projectGraph(input: { repo: string; root: string; reviewed: ReadonlyArray<string> }) {
  const snapshot = await realpath(input.root)
  const reviewed = indexReviewed(input.reviewed)
  const sources = await dependencySources(input.repo, input.reviewed)
  const budget: Budget = { entries: 0, pathBytes: 0 }
  const planned: Planned[] = []
  for (const source of sources) await walk(source, input.repo, snapshot, reviewed, sources, budget, planned)
  await rejectConflicts(snapshot, planned)
  await publish(snapshot, planned)
  return canonicalRoots(snapshot, sources, planned)
}

async function dependencySources(repo: string, reviewed: ReadonlyArray<string>) {
  const dirs = new Set<string>([""])
  for (const file of reviewed) {
    if (path.posix.basename(file) !== "package.json") continue
    if (file.split("/").some((part) => (NAMES as readonly string[]).includes(part))) continue
    const dir = path.posix.dirname(file)
    dirs.add(dir === "." ? "" : dir)
  }
  const seen = new Set<string>()
  const sources: Source[] = []
  for (const dir of dirs) {
    for (const name of NAMES) {
      const relative = dir ? `${dir}/${name}` : name
      const stat = await lstat(place(repo, relative)).catch(() => undefined)
      // A symlink root is not a directory graft. Do not follow it into a live tree.
      if (!stat?.isDirectory()) continue
      const id = `${stat.dev}:${stat.ino}`
      if (seen.has(id)) continue
      seen.add(id)
      sources.push({ relative, absolute: await realpath(place(repo, relative)) })
    }
  }
  return sources
}

async function walk(
  source: Source,
  repo: string,
  snapshot: string,
  reviewed: Reviewed,
  sources: readonly Source[],
  budget: Budget,
  planned: Planned[],
) {
  account(budget, source.relative)
  planned.push({ kind: "dir", relative: source.relative })
  const queue = [source.absolute]
  const relatives = new Map<string, string>([[source.absolute, source.relative]])
  while (queue.length > 0) {
    const dir = queue.shift()
    if (!dir) break
    const relative = relatives.get(dir)
    if (relative === undefined) refuse(`snapshot-dependency-path-outside: ${source.relative}`)
    const handle = await opendir(dir)
    try {
      while (true) {
        const entry = await handle.read()
        if (!entry) break
        const childRelative = `${relative}/${entry.name}`
        const childSource = path.join(dir, entry.name)
        account(budget, childRelative)
        const stat = await lstat(childSource).catch((error) => refuse(`snapshot-dependency-layout-unsupported: ${childRelative} ${codeOf(error)}`))
        if (stat.isDirectory()) {
          planned.push({ kind: "dir", relative: childRelative })
          relatives.set(childSource, childRelative)
          queue.push(childSource)
          continue
        }
        if (stat.isSymbolicLink()) {
          const classified = await classifyLink({ source: childSource, relative: childRelative, repo, snapshot, sources, reviewed })
          planned.push({ kind: "link", relative: childRelative, target: classified.target, directory: classified.directory })
          continue
        }
        if (stat.isFile()) {
          await rejectLoader(childSource, childRelative, repo, sources)
          planned.push({ kind: "file", relative: childRelative, source: childSource })
          continue
        }
        refuse(`snapshot-dependency-layout-unsupported: ${childRelative}`)
      }
    } finally {
      await handle.close()
    }
  }
}

function account(budget: Budget, relative: string) {
  budget.entries += 1
  budget.pathBytes += Buffer.byteLength(relative, "utf8")
  if (budget.entries > ENTRIES || budget.pathBytes > PATH_BYTES)
    refuse(`snapshot-dependency-cap: ${relative} entries=${budget.entries} pathBytes=${budget.pathBytes}`)
}

async function classifyLink(input: {
  source: string
  relative: string
  repo: string
  snapshot: string
  sources: readonly Source[]
  reviewed: Reviewed
}) {
  const original = await readlink(input.source)
  let cursor = input.source
  const seen = new Set<string>()
  let hops = 0
  while (true) {
    const stat = await lstat(cursor).catch(() => undefined)
    if (!stat?.isSymbolicLink()) break
    hops += 1
    if (hops > LINK_HOPS) refuse(`snapshot-dependency-link-depth: ${input.relative} hops=${hops}`)
    const id = `${stat.dev}:${stat.ino}`
    if (seen.has(id)) refuse(`snapshot-dependency-cycle: ${input.relative}`)
    seen.add(id)
    const text = hops === 1 ? original : await readlink(cursor)
    const next = path.resolve(path.dirname(cursor), text)
    // Every hop must land in a projected dependency root or this repository. Absolute external
    // directories, sibling worktrees, and chains that pass through them are not a supported closure.
    if (!insideSupported(next, input.repo, input.sources)) refuse(`snapshot-dependency-path-outside: ${input.relative}`)
    cursor = next
  }
  const target = cursor
  const stat = await lstat(target).catch(() => undefined)
  const directory = stat?.isDirectory() ?? false
  if (!insideSupported(target, input.repo, input.sources)) refuse(`snapshot-dependency-path-outside: ${input.relative}`)
  const inSource = input.sources.some((source) => FSUtil.contains(source.absolute, target))
  if (inSource) {
    const repoRelative = fromRoot(input.repo, target)
    if (repoRelative === undefined) refuse(`snapshot-dependency-path-outside: ${input.relative}`)
    return { directory, target: relativeLink(place(input.snapshot, input.relative), place(input.snapshot, repoRelative)) }
  }
  const repoRelative = fromRoot(input.repo, target) ?? ""
  if (!covers(input.reviewed, repoRelative)) refuse(`snapshot-dependency-workspace-missing: ${repoRelative || input.relative}`)
  const dest = repoRelative === "" ? input.snapshot : place(input.snapshot, repoRelative)
  return { directory, target: relativeLink(place(input.snapshot, input.relative), dest) }
}

async function rejectLoader(source: string, relative: string, repo: string, sources: readonly Source[]) {
  const name = path.posix.basename(relative)
  const kind = name.endsWith(".egg-link") ? "egg-link"
    : name.endsWith(".pth") ? "pth"
    : name === "direct_url.json" ? "direct-url"
    : name.startsWith("__editable__") && name.endsWith(".py") ? "finder"
    : undefined
  if (!kind) return
  const text = await readBounded(source, relative)
  if (kind === "direct-url") {
    rejectDirectUrl(text, relative, repo, sources)
    return
  }
  if (kind === "finder") {
    if (textPointsAtSource(text, repo, sources)) refuse(`snapshot-dependency-layout-unsupported: ${relative}`)
    return
  }
  if (linesPointAtSource(text, source, repo, sources)) refuse(`snapshot-dependency-layout-unsupported: ${relative}`)
}

async function readBounded(source: string, relative: string) {
  const handle = await open(source, "r")
  try {
    const buf = Buffer.alloc(LOADER_BYTES + 1)
    const read = await handle.read(buf, 0, buf.length, 0)
    if (read.bytesRead > LOADER_BYTES) refuse(`snapshot-dependency-layout-unsupported: ${relative}`)
    return buf.subarray(0, read.bytesRead).toString("utf8")
  } finally {
    await handle.close()
  }
}

function rejectDirectUrl(text: string, relative: string, repo: string, sources: readonly Source[]) {
  let parsed: { url?: unknown; dir_info?: { editable?: unknown } }
  try {
    parsed = JSON.parse(text) as { url?: unknown; dir_info?: { editable?: unknown } }
  } catch {
    return
  }
  if (!parsed || typeof parsed !== "object" || parsed.dir_info?.editable !== true) return
  if (typeof parsed.url !== "string" || !parsed.url.startsWith("file:"))
    refuse(`snapshot-dependency-layout-unsupported: ${relative}`)
  let file: string
  try {
    file = fileURLToPath(parsed.url)
  } catch {
    refuse(`snapshot-dependency-layout-unsupported: ${relative}`)
  }
  if (pointsAtSource(file, repo, sources)) refuse(`snapshot-dependency-layout-unsupported: ${relative}`)
}

function linesPointAtSource(text: string, source: string, repo: string, sources: readonly Source[]) {
  return text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("import ")) return false
    const raw = trimmed.startsWith("\"") && trimmed.endsWith("\"") ? trimmed.slice(1, -1) : trimmed
    return pointsAtSource(path.resolve(path.dirname(source), raw), repo, sources)
  })
}

function textPointsAtSource(text: string, repo: string, sources: readonly Source[]) {
  const relatives = sources.flatMap((source) => {
    const relative = fromRoot(repo, source.absolute)
    return relative ? [relative] : []
  })
  let from = 0
  while (from < text.length) {
    const at = text.indexOf(repo, from)
    if (at < 0) return false
    const rest = text.slice(at + repo.length)
    const dependency = relatives.some((relative) => rest.startsWith(`/${relative}`) || rest.startsWith(`${path.sep}${relative}`))
    if (!dependency) return true
    from = at + repo.length
  }
  return false
}

function insideSupported(target: string, repo: string, sources: readonly Source[]) {
  if (FSUtil.contains(repo, target)) return true
  return sources.some((source) => FSUtil.contains(source.absolute, target))
}

function pointsAtSource(target: string, repo: string, sources: readonly Source[]) {
  if (!FSUtil.contains(repo, target)) return false
  return !sources.some((source) => FSUtil.contains(source.absolute, target))
}

async function rejectConflicts(snapshot: string, planned: readonly Planned[]) {
  for (const entry of planned) {
    const dest = place(snapshot, entry.relative)
    if (await lstat(dest).then(() => true, () => false)) refuse(`snapshot-dependency-layout-unsupported: ${entry.relative}`)
    let parent = path.dirname(dest)
    while (parent !== snapshot && FSUtil.contains(snapshot, parent)) {
      const stat = await lstat(parent).catch(() => undefined)
      if (stat?.isSymbolicLink()) refuse(`snapshot-dependency-path-outside: ${entry.relative}`)
      if (!stat) break
      parent = path.dirname(parent)
    }
  }
}

async function publish(snapshot: string, planned: readonly Planned[]) {
  const dirs = planned.filter((entry) => entry.kind === "dir").sort((left, right) => left.relative.split("/").length - right.relative.split("/").length)
  for (const entry of dirs) {
    if (entry.kind !== "dir") continue
    await mkdir(place(snapshot, entry.relative)).catch((error) => refuse(`snapshot-dependency-layout-unsupported: ${entry.relative} ${codeOf(error)}`))
  }
  await pooled(planned.filter((entry) => entry.kind === "file"), async (entry) => {
    if (entry.kind !== "file") return
    await link(entry.source, place(snapshot, entry.relative)).catch((error) =>
      refuse(`snapshot-dependency-hardlink-failed: ${entry.relative} ${codeOf(error)}`))
  })
  await pooled(planned.filter((entry) => entry.kind === "link"), async (entry) => {
    if (entry.kind !== "link") return
    await placeLink(snapshot, entry)
  })
}

async function placeLink(snapshot: string, entry: { relative: string; target: string; directory: boolean }) {
  const dest = place(snapshot, entry.relative)
  const resolved = path.resolve(path.dirname(dest), entry.target)
  if (!FSUtil.contains(snapshot, resolved)) refuse(`snapshot-dependency-path-outside: ${entry.relative}`)
  try {
    await symlink(entry.target, dest, process.platform === "win32" ? (entry.directory ? "dir" : "file") : undefined)
  } catch (error) {
    if (process.platform !== "win32" || !entry.directory || !FSUtil.contains(snapshot, resolved))
      refuse(`snapshot-dependency-layout-unsupported: ${entry.relative} ${codeOf(error)}`)
    await symlink(resolved, dest, "junction").catch((junction) =>
      refuse(`snapshot-dependency-layout-unsupported: ${entry.relative} ${codeOf(junction)}`))
  }
}

async function canonicalRoots(snapshot: string, sources: readonly Source[], planned: readonly Planned[]) {
  const roots: string[] = []
  for (const source of sources) {
    const canonical = await realpath(place(snapshot, source.relative))
    if (!FSUtil.contains(snapshot, canonical)) refuse(`snapshot-dependency-path-outside: ${source.relative}`)
    roots.push(canonical)
  }
  for (const entry of planned) {
    if (entry.kind !== "file") continue
    const canonical = await realpath(place(snapshot, entry.relative))
    if (!roots.some((root) => FSUtil.contains(root, canonical))) refuse(`snapshot-dependency-path-outside: ${entry.relative}`)
  }
  return roots
}

async function pooled<T>(items: readonly T[], run: (item: T) => Promise<void>) {
  if (items.length === 0) return
  let index = 0
  let failed = false
  const worker = async () => {
    while (!failed && index < items.length) {
      const current = index
      index += 1
      try {
        await run(items[current])
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  const settled = await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()))
  const rejection = settled.find((item) => item.status === "rejected")
  if (rejection?.status === "rejected") throw rejection.reason
}

function indexReviewed(reviewed: ReadonlyArray<string>): Reviewed {
  const files = new Set(reviewed)
  const dirs = new Set<string>([""])
  for (const file of reviewed) {
    const parts = file.split("/")
    parts.pop()
    let acc = ""
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      dirs.add(acc)
    }
  }
  return { files, dirs }
}

function covers(reviewed: Reviewed, relative: string) {
  return relative === "" || reviewed.files.has(relative) || reviewed.dirs.has(relative)
}

function place(root: string, relative: string) {
  return relative === "" ? root : path.join(root, ...relative.split("/"))
}

function fromRoot(root: string, target: string) {
  const relative = path.relative(root, target)
  if (relative === "") return ""
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined
  return relative.split(path.sep).join("/")
}

function relativeLink(fromFile: string, toFile: string) {
  const relative = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/")
  return relative === "" ? "." : relative
}
