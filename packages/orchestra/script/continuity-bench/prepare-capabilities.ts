// Offline lead preparation only: approved descriptor/catalog hashes authorize reads; no provider or auth service.
import path from "node:path"
import { mkdir, realpath } from "node:fs/promises"
import { Schema } from "effect"
import { ModelsDev } from "@orchestra/core/models-dev"
import { Provider } from "@/provider/provider"
import { CaseCapabilities } from "./case-capabilities"

const args = process.argv.slice(2)
const at = (name: string) => args[args.indexOf(name) + 1]
const output = at("--output")
if (!output || !args.includes("--catalog") || !args.includes("--catalog-sha256") || !args.includes("--descriptor") || !args.includes("--descriptor-sha256"))
  throw new Error("usage: --catalog <canonical cache> --catalog-sha256 <approved SHA> --descriptor <canonical path> --descriptor-sha256 <approved SHA> [repeat descriptor/hash pair] --output <private directory>")
const catalog = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(await CaseCapabilities.read({ path: at("--catalog"), sha256: at("--catalog-sha256") }))
await mkdir(output, { recursive: true, mode: 0o700 })
const root = await realpath(output)
const descriptors = args.flatMap((name, index) => name === "--descriptor" ? [args[index + 1]] : [])
const hashes = args.flatMap((name, index) => name === "--descriptor-sha256" ? [args[index + 1]] : [])
if (descriptors.length !== hashes.length) throw new Error("complete-replay-descriptor-hash-required")
const cases = Object.fromEntries(await Promise.all(descriptors.map(async (file, index) => {
  const descriptor = Schema.decodeUnknownSync(CaseCapabilities.Descriptor)(await CaseCapabilities.read({ path: file, sha256: hashes[index] }))
  const raw = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String, name: Schema.String, env: Schema.Array(Schema.String),
    npm: Schema.optional(Schema.String), api: Schema.optional(Schema.String), models: Schema.Record(Schema.String, Schema.Unknown) }))(catalog[descriptor.model.providerID])
  if (!raw.models[descriptor.model.modelID]) throw new Error("complete-replay-model-missing")
  const selected = Schema.decodeUnknownSync(ModelsDev.Model)(raw.models[descriptor.model.modelID])
  const provider = Schema.decodeUnknownSync(ModelsDev.Provider)({ ...raw, models: { [descriptor.model.modelID]: selected } })
  const actual = Provider.fromModelsDevProvider(provider).models[descriptor.model.modelID]
  if (!actual) throw new Error("complete-replay-model-missing")
  const model = { ...actual, options: { ...actual.options, ...(descriptor.model.reasoningEffort ? { reasoningEffort: descriptor.model.reasoningEffort } : {}) } }
  const modelText = JSON.stringify(model)
  const modelPath = path.join(root, `${descriptor.caseID}-model.json`)
  await Bun.write(modelPath, modelText, { mode: 0o600 })
  const horizon = Schema.decodeUnknownSync(Schema.Struct({ boundaryMessageID: Schema.NonEmptyString }))(await CaseCapabilities.read({ path: descriptor.horizonPath, sha256: descriptor.horizonSHA256 }))
  return [descriptor.caseID, { descriptor: { path: file, sha256: hashes[index] }, source: { path: descriptor.sourceHistoryPath, sha256: descriptor.sourceHistorySHA256 },
    horizon: { path: descriptor.horizonPath, sha256: descriptor.horizonSHA256 }, model: { path: modelPath, sha256: CaseCapabilities.hash(modelText) },
    providerID: model.providerID, modelID: model.id, boundaryMessageID: horizon.boundaryMessageID }]
})))
const manifest = JSON.stringify(Schema.decodeUnknownSync(CaseCapabilities.Manifest)({ version: 1, cases }), null, 2)
await Bun.write(path.join(root, "capabilities.json"), manifest, { mode: 0o600 })
console.log(JSON.stringify({ capabilities: path.join(root, "capabilities.json"), sha256: CaseCapabilities.hash(manifest), providerCalls: 0 }))
