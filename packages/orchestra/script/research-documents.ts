// Export only admitted, digest-checked research documents for the independent evaluator; no model calls or oracle reads.
import path from "node:path"
import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Effect, Schema } from "effect"

if (Object.keys(process.env).some((key) => key.toUpperCase().startsWith("GIT_")))
  throw new Error("Document export requires an unredirected Git environment; inherited GIT_* variables are not allowed")

if (!process.argv[2]) throw new Error("Usage: research-documents <isolated-pilot-state-root>")
const root = await fs.realpath(process.argv[2])
if (path.basename(root) !== "state") throw new Error("Document export requires an isolated pilot state directory")
const runRoot = path.dirname(root)
await Promise.all(["home", "tmp", "config", "managed", "xdg-data", "xdg-cache", "xdg-config", "xdg-state"].map(async (dir) => {
  const target = path.join(runRoot, dir)
  if (!(await fs.lstat(target)).isDirectory() || await fs.realpath(target) !== target)
    throw new Error("Document export requires retained non-symlink isolated directories")
}))
await Promise.all(["native.db", "evaluation.json"].map(async (file) => {
  const stat = await fs.lstat(path.join(root, file))
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Document export requires retained regular pilot files")
}))
if (await fs.lstat(path.join(root, "documents.json")).then(() => true, (error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return false
  throw error
})) throw new Error("Document export cannot overwrite an earlier export")
Object.keys(process.env).filter((key) => key.toUpperCase().startsWith("ORCHESTRA_") || key.toUpperCase().startsWith("OTEL_")).forEach((key) => { delete process.env[key] })
Object.assign(process.env, {
  HOME: path.join(runRoot, "home"), USERPROFILE: path.join(runRoot, "home"), ORCHESTRA_TEST_HOME: path.join(runRoot, "home"),
  XDG_DATA_HOME: path.join(runRoot, "xdg-data"), XDG_CACHE_HOME: path.join(runRoot, "xdg-cache"),
  XDG_CONFIG_HOME: path.join(runRoot, "xdg-config"), XDG_STATE_HOME: path.join(runRoot, "xdg-state"),
  TMPDIR: path.join(runRoot, "tmp"), TMP: path.join(runRoot, "tmp"), TEMP: path.join(runRoot, "tmp"),
  ORCHESTRA_CONFIG_DIR: path.join(runRoot, "config"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
})
process.env.ORCHESTRA_DB = path.join(root, "native.db")
const { Research } = await import("@orchestra/schema/research")
const projection = Schema.decodeUnknownSync(Schema.Struct({
  schema: Schema.Literal("jimmy-pilot-evaluation-v2"), stage: Schema.Literal("provisional-pilot"),
  terminal: Schema.Literal("task-returned"), caseID: Schema.String, parentSessionID: Schema.String,
  timeoutMs: Schema.Number, deadlineSignaled: Schema.Boolean,
  output: Schema.Struct({ metadata: Schema.Struct({ workResult: Schema.Struct({ documents: Schema.optional(Schema.Array(Research.DocumentReceipt)) }) }) }),
}))(await Bun.file(path.join(root, "evaluation.json")).json())
const declared = projection.output.metadata.workResult.documents ?? []
if (new Set(declared.map((receipt) => `${receipt.ref.id}:${receipt.ref.revision}`)).size !== declared.length ||
  declared.some((receipt) => receipt.binding.authoritySessionID !== projection.parentSessionID ||
    receipt.binding.directory !== path.join(runRoot, "source") || receipt.bytes > Research.Limits.documentBytes))
  throw new Error("Evaluation document has duplicate or foreign pilot placement")
const { ResearchArtifacts } = await import("@orchestra/core/research/artifacts")
const { AppNodeBuilder } = await import("@orchestra/core/effect/app-node-builder")
const { Global } = await import("@orchestra/core/global")
const documents = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const artifacts = yield* ResearchArtifacts.Service
  return yield* Effect.forEach(declared, (receipt) => Effect.gen(function* () {
    const pages: string[] = []
    const cursors = new Set<string>()
    // Native UTF-8 paging can back up at most three bytes from pageBytes before the next code point.
    const pageLimit = Math.max(1, Math.ceil(receipt.bytes / (Research.Limits.pageBytes - 3)))
    const drain = (cursor?: string): Effect.Effect<void, Research.Error> => Effect.gen(function* () {
      if (pages.length >= pageLimit)
        return yield* new Research.Error({ code: "over_cap", message: "Evaluation document page request budget exhausted" })
      if (cursor !== undefined && cursors.has(cursor))
        return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation document cursor did not advance" })
      if (cursor !== undefined) cursors.add(cursor)
      const page = yield* artifacts.read(receipt.binding, receipt.artifact, cursor, "task")
      const bytes = Buffer.byteLength(page.text)
      const total = pages.reduce((sum, text) => sum + Buffer.byteLength(text), bytes)
      if (!isDeepStrictEqual(page.receipt, receipt) || !isDeepStrictEqual(page.ref, receipt.artifact) || page.representation !== "markdown" ||
        bytes > Research.Limits.pageBytes || (receipt.bytes > 0 && bytes === 0) || total > receipt.bytes ||
        page.complete !== (page.cursor === undefined) ||
        (page.cursor !== undefined && (!page.cursor.length || cursors.has(page.cursor) || total >= receipt.bytes)) ||
        (page.cursor === undefined && total !== receipt.bytes))
        return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation document page differs from admitted representation or did not advance" })
      pages.push(page.text)
      if (page.cursor !== undefined) yield* drain(page.cursor)
    })
    yield* drain()
    const text = pages.join("")
    if (Buffer.byteLength(text) !== receipt.bytes || createHash("sha256").update(text).digest("hex") !== receipt.digest)
      return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation document export differs from admitted bytes" })
    return { receipt, text, verified: true }
  }))
}).pipe(Effect.provide(AppNodeBuilder.build(ResearchArtifacts.node, [[Global.node, Global.layerWith({ data: root })]])))))
await fs.writeFile(path.join(root, "documents.json"), JSON.stringify({ schema: "jimmy-evaluation-documents-v2", caseID: projection.caseID,
  timeoutMs: projection.timeoutMs, deadlineSignaled: projection.deadlineSignaled,
  exporter: { bun: Bun.version, runnerSha256: createHash("sha256").update(new Uint8Array(await Bun.file(import.meta.path).arrayBuffer())).digest("hex") },
  stage: "provisional-pilot", qualityGrade: "not-run", outcome: documents.length ? "exported" : "no-declared-documents", documents }), { flag: "wx", mode: 0o600 })
console.log(JSON.stringify({ artifact: path.join(root, "documents.json"), documents: documents.length }))
