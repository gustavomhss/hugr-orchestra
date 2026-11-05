import { createHash } from "node:crypto"
import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { Probe } from "../../src/research-toolkit/probe/types"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { expectSpawn } from "../fixture/omni-expect"
import { testEffect } from "../lib/effect"

// Construction-only CI capture of `bun run generate` in packages/client. Not a production feature and not a
// claim that the generated tree is unchanged. A missing or incomplete generator manifest is a named failure.

const it = testEffect(LayerNode.compile(AppProcess.node))
const FILE_CAP = 4 * 1024 * 1024
const TOTAL_CAP = 32 * 1024 * 1024
const GENERATE_BYTES = 8 * 1024 * 1024
const DIAGNOSTIC_TAIL = 32 * 1024
const MARKER = ".httpapi-codegen.json"
const REQUIRED = ["client.ts", "index.ts"] as const
const ROOTS = ["src/generated", "src/generated-effect"] as const

it.live("capture Client generation from the remote schema head", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const root = path.resolve(import.meta.dir, "../../../..")
  const client = path.resolve(root, "packages/client")
  const clientStat = yield* Effect.promise(() => lstat(client))
  if (clientStat.isSymbolicLink() || !clientStat.isDirectory()) fail("client-missing")
  const headBytes = yield* ResearchProcess.git(root, ["rev-parse", "HEAD"])
  const head = headBytes.toString("utf8").trim()
  if (!/^[0-9a-f]{40}$/.test(head)) fail("source-head-invalid")
  const generated = yield* ResearchProcess.run({
    command: process.execPath,
    args: ["run", "generate"],
    cwd: client,
    env: ResearchProcess.environment(),
    timeoutMs: 120_000,
    maxBytes: GENERATE_BYTES,
    maxRssBytes: Probe.Limits.rssBytes,
  })
  if (generated.failure) diagnose("spawn-error", generated)
  if (generated.timedOut) diagnose("timeout", generated)
  if (generated.overflow || generated.stdout.truncated || generated.stderr.truncated) diagnose("truncation", generated)
  if (generated.memoryExceeded) diagnose("memory-exceeded", generated)
  if (generated.exitCode !== 0) diagnose("nonzero", generated)
  const captured = yield* Effect.promise(() => capture(client))
  process.stdout.write(`CLIENT_GENERATED_SOURCE_V1 ${JSON.stringify({ head })}\n`)
  for (const file of captured) {
    process.stdout.write(`CLIENT_GENERATED_V1 ${JSON.stringify({
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      base64: file.base64,
    })}\n`)
  }
  process.stdout.write(`CLIENT_GENERATED_MANIFEST_V1 ${JSON.stringify({
    files: captured.map((file) => ({ path: file.path, sha256: file.sha256, bytes: file.bytes })),
  })}\n`)
}), 180_000)

async function capture(client: string) {
  const paths = (await Promise.all(ROOTS.map((root) => filesForRoot(client, root)))).flat().sort()
  let total = 0
  const sized = []
  for (const relative of paths) {
    const absolute = contained(client, relative)
    const info = await lstat(absolute)
    if (info.isSymbolicLink()) fail(`symlink: ${relative}`)
    if (!info.isFile()) fail(`not-regular: ${relative}`)
    if (info.size > FILE_CAP) fail("file-cap")
    total += info.size
    if (total > TOTAL_CAP) fail("total-cap")
    sized.push({ relative, absolute, size: info.size })
  }
  const files = []
  let readTotal = 0
  for (const file of sized) {
    const data = await readFile(file.absolute)
    if (data.length > FILE_CAP || data.length !== file.size) fail("file-cap")
    readTotal += data.length
    if (readTotal > TOTAL_CAP) fail("total-cap")
    files.push({
      path: file.relative,
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data.length,
      base64: data.toString("base64"),
    })
  }
  return files
}

async function filesForRoot(client: string, root: string) {
  const marker = `${root}/${MARKER}`
  const markerPath = contained(client, marker)
  const markerInfo = await lstat(markerPath).catch(() => undefined)
  if (!markerInfo || markerInfo.isSymbolicLink() || !markerInfo.isFile()) fail(`missing-manifest: ${root}`)
  if (markerInfo.size > FILE_CAP) fail("file-cap")
  const declared = manifestNames(await readFile(markerPath, "utf8"), root)
  const expected = new Set([marker, ...declared.map((name) => `${root}/${name}`)])
  const found = new Set(await filesUnder(client, root))
  for (const name of expected) if (!found.has(name)) fail(`missing-file: ${name}`)
  for (const name of found) if (!expected.has(name)) fail(`extra-file: ${name}`)
  for (const name of declared) {
    const absolute = contained(client, `${root}/${name}`)
    const info = await lstat(absolute)
    if (info.isSymbolicLink()) fail(`symlink: ${root}/${name}`)
    if (!info.isFile()) fail(`not-regular: ${root}/${name}`)
  }
  return [...expected]
}

function manifestNames(text: string, root: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail(`malformed-manifest: ${root}`)
  }
  if (!Array.isArray(parsed)) fail(`malformed-manifest: ${root}`)
  if (parsed.length === 0) fail(`empty-manifest: ${root}`)
  const seen = new Set<string>()
  const names = []
  for (const entry of parsed) {
    if (!containedName(entry)) fail(`malformed-manifest: ${root}`)
    if (seen.has(entry)) fail(`duplicate-manifest: ${root}`)
    seen.add(entry)
    names.push(entry)
  }
  if (REQUIRED.some((name) => !seen.has(name))) fail(`missing-declared: ${root}`)
  return names
}

function containedName(entry: unknown): entry is string {
  if (typeof entry !== "string" || entry.length === 0 || entry === MARKER || entry.includes("\\")) return false
  if (path.posix.isAbsolute(entry) || path.win32.isAbsolute(entry)) return false
  return entry.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
}

async function filesUnder(client: string, relativeRoot: string) {
  const root = contained(client, relativeRoot)
  const rootInfo = await lstat(root)
  if (rootInfo.isSymbolicLink()) fail(`symlink: ${relativeRoot}`)
  if (!rootInfo.isDirectory()) fail(`missing: ${relativeRoot}`)
  const found: string[] = []
  const pending = [root]
  while (pending.length > 0) {
    const dir = pending.pop()
    if (!dir) break
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "." || entry.name === ".." || entry.name.includes("/") || entry.name.includes("\\")) fail("traversal")
      const relative = path.posix.join(path.relative(client, dir).split(path.sep).join("/"), entry.name)
      const child = contained(client, relative)
      if (entry.isSymbolicLink()) fail(`symlink: ${relative}`)
      const info = await lstat(child)
      if (info.isSymbolicLink()) fail(`symlink: ${relative}`)
      if (info.isDirectory()) {
        pending.push(child)
        continue
      }
      if (!info.isFile()) fail(`not-regular: ${relative}`)
      found.push(relative)
    }
  }
  return found
}

function contained(client: string, relative: string) {
  const absolute = path.resolve(client, relative)
  const fromClient = path.relative(client, absolute)
  if (fromClient.startsWith("..") || path.isAbsolute(fromClient)) fail("traversal")
  return absolute
}

function diagnose(reason: string, outcome: ResearchProcess.Outcome): never {
  fail(`${reason}\n--- stdout ---\n${tail(outcome.stdout)}\n--- stderr ---\n${tail(outcome.stderr)}`)
}

function tail(captured: ResearchProcess.Captured) {
  return captured.data.subarray(Math.max(0, captured.data.length - DIAGNOSTIC_TAIL)).toString("utf8")
}

function fail(reason: string): never {
  throw new Error(reason)
}
