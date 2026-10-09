// Offline lead preparation only: approved descriptor/catalog hashes authorize reads; no provider or auth service.
import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath } from "node:fs/promises"
import { Schema } from "effect"
import { ModelsDev } from "@orchestra/core/models-dev"
import { Provider } from "@/provider/provider"
import { CaseCapabilities } from "./case-capabilities"

export async function prepare(input: { catalog: typeof CaseCapabilities.File.Type; descriptors: readonly (typeof CaseCapabilities.File.Type)[]; output: string }) {
  const catalog = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(await CaseCapabilities.read(input.catalog))
  const root = path.resolve(input.output)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const stat = await lstat(root)
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(root) !== root || (stat.mode & 0o077) !== 0)
    throw new Error("complete-replay-output-path")
  const cases = Object.fromEntries(await Promise.all(input.descriptors.map(async (file) => {
    const descriptor = Schema.decodeUnknownSync(CaseCapabilities.Descriptor)(await CaseCapabilities.read(file))
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(descriptor.caseID)) throw new Error("complete-replay-case-filename")
    const raw = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String, name: Schema.String, env: Schema.Array(Schema.String),
      npm: Schema.optional(Schema.String), api: Schema.optional(Schema.String), models: Schema.Record(Schema.String, Schema.Unknown) }))(catalog[descriptor.model.providerID])
    if (!raw.models[descriptor.model.modelID]) throw new Error("complete-replay-model-missing")
    const selected = Schema.decodeUnknownSync(ModelsDev.Model)(raw.models[descriptor.model.modelID])
    const provider = Schema.decodeUnknownSync(ModelsDev.Provider)({ ...raw, models: { [descriptor.model.modelID]: selected } })
    const actual = Provider.fromModelsDevProvider(provider).models[descriptor.model.modelID]
    if (!actual) throw new Error("complete-replay-model-missing")
    const model = { ...actual, options: { ...actual.options, ...(descriptor.model.reasoningEffort ? { reasoningEffort: descriptor.model.reasoningEffort } : {}) } }
    const modelText = JSON.stringify(model)
    const modelPath = path.resolve(root, `${descriptor.caseID}-model.json`)
    const horizon = Schema.decodeUnknownSync(Schema.Struct({ boundaryMessageID: Schema.NonEmptyString }))(await CaseCapabilities.read({ path: descriptor.horizonPath, sha256: descriptor.horizonSHA256 }))
    await writePrivate(root, modelPath, modelText)
    return [descriptor.caseID, { descriptor: file, source: { path: descriptor.sourceHistoryPath, sha256: descriptor.sourceHistorySHA256 },
      horizon: { path: descriptor.horizonPath, sha256: descriptor.horizonSHA256 }, model: { path: modelPath, sha256: CaseCapabilities.hash(modelText) },
      providerID: model.providerID, modelID: model.id, boundaryMessageID: horizon.boundaryMessageID }]
  })))
  const manifest = JSON.stringify(Schema.decodeUnknownSync(CaseCapabilities.Manifest)({ version: 1, cases }), null, 2)
  await writePrivate(root, path.join(root, "capabilities.json"), manifest)
  return { capabilities: path.join(root, "capabilities.json"), sha256: CaseCapabilities.hash(manifest), providerCalls: 0 }
}

async function writePrivate(root: string, file: string, text: string) {
  if (path.dirname(file) !== root || await realpath(root) !== root) throw new Error("complete-replay-output-path")
  // Exclusive creation refuses existing symlinks, special files and files of any permissions.
  const handle = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
  await handle.writeFile(text).finally(() => handle.close())
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const at = (name: string) => args[args.indexOf(name) + 1]
  const output = at("--output")
  if (!output || !args.includes("--catalog") || !args.includes("--catalog-sha256") || !args.includes("--descriptor") || !args.includes("--descriptor-sha256"))
    throw new Error("usage: --catalog <canonical cache> --catalog-sha256 <approved SHA> --descriptor <canonical path> --descriptor-sha256 <approved SHA> [repeat descriptor/hash pair] --output <private directory>")
  const descriptors = args.flatMap((name, index) => name === "--descriptor" ? [args[index + 1]] : [])
  const hashes = args.flatMap((name, index) => name === "--descriptor-sha256" ? [args[index + 1]] : [])
  if (descriptors.length !== hashes.length) throw new Error("complete-replay-descriptor-hash-required")
  console.log(JSON.stringify(await prepare({ catalog: { path: at("--catalog"), sha256: at("--catalog-sha256") },
    descriptors: descriptors.map((file, index) => ({ path: file, sha256: hashes[index] })), output })))
}
