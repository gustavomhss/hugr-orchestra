export * as CaseCapabilities from "./case-capabilities"

import path from "node:path"
import { lstat, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { Schema } from "effect"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Provider } from "@/provider/provider"
import { RequestSource } from "@/continuity/request-source"
import { MessageID } from "@/session/schema"

export const File = Schema.Struct({ path: Schema.NonEmptyString, sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)) })
export const Manifest = Schema.Struct({ version: Schema.Literal(1), cases: Schema.Record(Schema.String, Schema.Struct({
  descriptor: File, source: File, horizon: File, model: File, providerID: Schema.NonEmptyString, modelID: Schema.NonEmptyString,
  boundaryMessageID: Schema.NonEmptyString,
})) })
export const Descriptor = Schema.Struct({ caseID: Schema.NonEmptyString, sourceHistoryPath: Schema.NonEmptyString, sourceHistorySHA256: Schema.NonEmptyString,
  horizonPath: Schema.NonEmptyString, horizonSHA256: Schema.NonEmptyString,
  model: Schema.Struct({ providerID: Schema.NonEmptyString, modelID: Schema.NonEmptyString, reasoningEffort: Schema.optional(Schema.String) }) })

export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")

/** No open path parameters after bootstrap. Canonical approved path is checked before payload bytes are read. */
export async function read(capability: typeof File.Type) {
  if (!path.isAbsolute(capability.path) || path.resolve(capability.path) !== capability.path ||
    (await lstat(capability.path)).isSymbolicLink() || await realpath(capability.path) !== capability.path)
    throw new Error("complete-replay-capability-path")
  const bytes = await Bun.file(capability.path).bytes()
  if (hash(bytes) !== capability.sha256) throw new Error("complete-replay-capability-hash")
  return Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(new TextDecoder().decode(bytes))
}

export async function load(input: { manifest: typeof File.Type; caseID: string }) {
  const manifest = Schema.decodeUnknownSync(Manifest, { onExcessProperty: "error" })(await read(input.manifest))
  const approved = manifest.cases[input.caseID]
  if (!approved) throw new Error("complete-replay-case-unapproved")
  const descriptor = Schema.decodeUnknownSync(Descriptor)(await read(approved.descriptor))
  if (descriptor.caseID !== input.caseID || descriptor.sourceHistoryPath !== approved.source.path || descriptor.sourceHistorySHA256 !== approved.source.sha256 ||
    descriptor.horizonPath !== approved.horizon.path || descriptor.horizonSHA256 !== approved.horizon.sha256 ||
    descriptor.model.providerID !== approved.providerID || descriptor.model.modelID !== approved.modelID)
    throw new Error("complete-replay-descriptor-mismatch")
  const horizon = Schema.decodeUnknownSync(Schema.Struct({ boundaryMessageID: Schema.NonEmptyString }))(await read(approved.horizon))
  if (horizon.boundaryMessageID !== approved.boundaryMessageID) throw new Error("complete-replay-horizon-mismatch")
  const model = Schema.decodeUnknownSync(Provider.Model)(await read(approved.model)) as Provider.Model
  if (model.providerID !== approved.providerID || model.id !== approved.modelID || !(model.limit.context > 0) || !(model.limit.output > 0) ||
    !(Math.min(model.limit.input ?? Infinity, model.limit.context - model.limit.output) > 0)) throw new Error("complete-replay-model-mismatch")
  const messages = Schema.decodeUnknownSync(Schema.Array(SessionV1.WithParts))(await read(approved.source)) as SessionV1.WithParts[]
  const boundaryIndex = messages.findIndex((message) => message.info.id === horizon.boundaryMessageID)
  if (boundaryIndex < 0) throw new Error("complete-replay-boundary-missing")
  const user = RequestSource.latest(messages.slice(0, boundaryIndex + 1))?.info
  if (!user || user.role !== "user" || user.model.providerID !== model.providerID || user.model.modelID !== model.id) throw new Error("complete-replay-source-model-mismatch")
  return { messages, model, boundary: MessageID.make(horizon.boundaryMessageID) }
}
