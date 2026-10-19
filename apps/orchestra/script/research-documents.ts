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
await Promise.all(["source", "home", "tmp", "config", "managed", "xdg-data", "xdg-cache", "xdg-config", "xdg-state"].map(async (dir) => {
  const target = path.join(runRoot, dir)
  if (!(await fs.lstat(target)).isDirectory() || await fs.realpath(target) !== target)
    throw new Error("Document export requires retained non-symlink isolated directories")
}))
await Promise.all(["native.db", "evaluation.json", "preparation.json"].map(async (file) => {
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
const { ResearchRetained } = await import("./research-retained")
const projection = Schema.decodeUnknownSync(Schema.Struct({
  schema: Schema.Literal("jimmy-pilot-evaluation-v2"), stage: Schema.Literal("provisional-pilot"),
  terminal: Schema.Literal("task-returned"), caseID: Schema.String, parentSessionID: Schema.String,
  timeoutMs: Schema.Number, deadlineSignaled: Schema.Boolean,
  identity: Schema.Struct({ sources: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Research.Digest, bytes: Schema.Int })) }),
  continuation: Schema.optional(Schema.Struct({ schema: Schema.Literal("jimmy-native-continuation-v1"),
    checkpoint: Schema.optional(Schema.Struct({ binding: Research.Binding, sources: Schema.Array(Schema.Struct({ receipt: Research.SourceReceipt })) })) })),
  output: Schema.Struct({ metadata: Schema.Struct({ workResult: Schema.Struct({ documents: Schema.optional(Schema.Array(Research.DocumentReceipt)) }) }) }),
}))(await Bun.file(path.join(root, "evaluation.json")).json())
const declared = projection.output.metadata.workResult.documents ?? []
const frozen = Schema.decodeUnknownSync(Schema.Struct({ identity: Schema.Struct({ sources: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Research.Digest, bytes: Schema.Int })) }) }))(await Bun.file(path.join(root, "preparation.json")).json())
if (!isDeepStrictEqual(projection.identity.sources, frozen.identity.sources)) throw new Error("Grader source identities differ from retained preparation")
if (projection.identity.sources.some((file) => !path.resolve(runRoot, "source", file.path).startsWith(path.join(runRoot, "source") + path.sep)))
  throw new Error("Grader disclosed source paths must stay inside the isolated source")
if (new Set(declared.map((receipt) => `${receipt.ref.id}:${receipt.ref.revision}`)).size !== declared.length ||
  declared.some((receipt) => receipt.binding.authoritySessionID !== projection.parentSessionID ||
    receipt.binding.directory !== path.join(runRoot, "source") || receipt.bytes > Research.Limits.documentBytes))
  throw new Error("Evaluation document has duplicate or foreign pilot placement")
const { ResearchArtifacts } = await import("@orchestra/core/research/artifacts")
const { AppNodeBuilder } = await import("@orchestra/core/effect/app-node-builder")
const { Global } = await import("@orchestra/core/global")
const exported = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const artifacts = yield* ResearchArtifacts.Service
  const documents = yield* Effect.forEach(declared, ResearchRetained.read)
  const checkpoint = projection.continuation?.checkpoint
  const candidates = [...(checkpoint?.sources.map((source) => ({ binding: checkpoint.binding, ref: source.receipt.ref })) ?? []),
    ...(projection.caseID === "R14" ? declared.flatMap((document) => Object.values(document.citations).map((evidence) => ({ binding: document.binding, ref: evidence.source }))) : [])]
  if (candidates.some((item) => candidates.some((other) => item.ref.artifact.id === other.ref.artifact.id && item.ref.artifact.revision === other.ref.artifact.revision && !isDeepStrictEqual(item, other))))
    return yield* new Research.Error({ code: "reference_invalid", message: "Grader evidence has conflicting bindings or source revisions" })
  const sources = candidates
    .filter((item, index, list) => list.findIndex((other) => other.ref.artifact.id === item.ref.artifact.id && other.ref.artifact.revision === item.ref.artifact.revision) === index)
  const evidence = yield* Effect.forEach(sources, (source) => Effect.gen(function* () {
    const page = yield* artifacts.read(source.binding, source.ref.artifact, undefined, "task")
    const receipt = page.receipt
    if (!("origin" in receipt) || receipt.origin.kind !== "file" || receipt.ref.digest !== source.ref.digest ||
      receipt.ref.representation !== source.ref.representation || receipt.binding.authoritySessionID !== projection.parentSessionID ||
      receipt.binding.directory !== path.join(runRoot, "source") ||
      !projection.identity.sources.some((file) => path.join(runRoot, "source", file.path) === receipt.origin.uri))
      return yield* new Research.Error({ code: "reference_invalid", message: "Grader evidence must be admitted disclosed input; skill, prompt and outside-file bodies are excluded" })
    return yield* ResearchRetained.authenticate(receipt, { source: path.join(runRoot, "source"), data: root, sources: frozen.identity.sources })
  }))
  return { documents, evidence }
}).pipe(Effect.provide(AppNodeBuilder.build(ResearchArtifacts.node, [[Global.node, Global.layerWith({ data: root })]])))))
await fs.writeFile(path.join(root, "documents.json"), JSON.stringify({ schema: "jimmy-evaluation-documents-v2", caseID: projection.caseID,
  timeoutMs: projection.timeoutMs, deadlineSignaled: projection.deadlineSignaled,
  exporter: { bun: Bun.version, runnerSha256: createHash("sha256").update(new Uint8Array(await Bun.file(import.meta.path).arrayBuffer())).digest("hex") },
  stage: "provisional-pilot", qualityGrade: "not-run", outcome: exported.documents.length ? "exported" : "no-declared-documents",
  ...exported }), { flag: "wx", mode: 0o600 })
console.log(JSON.stringify({ artifact: path.join(root, "documents.json"), documents: exported.documents.length }))
