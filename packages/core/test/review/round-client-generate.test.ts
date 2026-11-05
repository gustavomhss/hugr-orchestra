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
// claim that the generated tree is unchanged. The lead reconstructs bytes from the CI log.

const it = testEffect(LayerNode.compile(AppProcess.node))
const FILE_CAP = 4 * 1024 * 1024
const TOTAL_CAP = 32 * 1024 * 1024
const GENERATE_BYTES = 8 * 1024 * 1024
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
  if (generated.failure) fail("spawn-error")
  if (generated.timedOut) fail("timeout")
  if (generated.overflow || generated.stdout.truncated || generated.stderr.truncated) fail("truncation")
  if (generated.memoryExceeded) fail("memory-exceeded")
  if (generated.exitCode !== 0) fail("nonzero")
  const captured = yield* Effect.promise(() => capture(client))
  let total = 0
  for (const file of captured) {
    if (file.bytes > FILE_CAP) fail("file-cap")
    total += file.bytes
    if (total > TOTAL_CAP) fail("total-cap")
  }
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
  const paths = (await Promise.all(ROOTS.map((root) => filesUnder(client, root)))).flat().sort()
  const files = []
  for (const relative of paths) {
    const absolute = contained(client, relative)
    const info = await lstat(absolute)
    if (info.isSymbolicLink()) fail(`symlink: ${relative}`)
    if (!info.isFile()) fail(`not-regular: ${relative}`)
    const data = await readFile(absolute)
    files.push({
      path: relative,
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data.length,
      base64: data.toString("base64"),
    })
  }
  return files
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
      const child = contained(client, path.posix.join(path.relative(client, dir).split(path.sep).join("/"), entry.name))
      if (entry.isSymbolicLink()) fail(`symlink: ${path.relative(client, child)}`)
      const info = await lstat(child)
      if (info.isSymbolicLink()) fail(`symlink: ${path.relative(client, child)}`)
      if (info.isDirectory()) {
        pending.push(child)
        continue
      }
      if (!info.isFile()) fail(`not-regular: ${path.relative(client, child)}`)
      found.push(path.relative(client, child).split(path.sep).join("/"))
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

function fail(reason: string): never {
  throw new Error(reason)
}
