// Pure admission of measured configuration and independently frozen recovery receipts, never credentials.
import { isDeepStrictEqual } from "node:util"

const identityFields = ["sourceRun", "sourceRevision", "retryRequest", "budget", "arms", "indexRun", "retainedRuns", "wrapperSha256", "profileSha256"]
const settings = ["grokVersion", "model", "maxTurns", "commandTimeoutMs", "poolWidth", "authMode"]
const seedFields = ["initialEnvelopeSha256", "initialStagingSha256", "originalPlanSha256"]
const proofFields = ["repository", "workflow", "event", "branch", "run", "attempt", "head"]
const artifactFields = ["id", "name", "digest"]

export function requireContinuationPolicy(observed, expectedSourceReceipt, expectedProofReceipt) {
  shape(expectedSourceReceipt, ["identity", "inFlightRequest", "initialEnvelopeSha256", "initialStagingSha256", "planSha256",
    "grokVersion", "model", "maxTurns", "commandTimeoutMs"], "expectedSourceReceipt", false)
  shape(expectedSourceReceipt.identity, [], "expectedSourceReceipt.identity", false)
  shape(expectedProofReceipt, [...proofFields, "artifact"], "expectedProofReceipt")
  shape(expectedProofReceipt.artifact, artifactFields, "expectedProofReceipt.artifact")
  shape(observed, [...identityFields, ...settings, ...seedFields, "orchestratorRevision", "proof"], "observed")
  shape(observed.proof, [...proofFields, "status", "conclusion", "artifact"], "observed.proof")
  shape(observed.proof.artifact, [...artifactFields, "expired"], "observed.proof.artifact")
  for (const field of ["arms", "retainedRuns"]) if (!Array.isArray(observed[field])) refuse(`observed.${field} shape`)
  for (const field of ["maxTurns", "commandTimeoutMs", "poolWidth"]) if (typeof observed[field] !== "number") refuse(`observed.${field} shape`)
  for (const field of [...identityFields, ...settings, ...seedFields, "orchestratorRevision"].filter((field) => !["arms", "retainedRuns"].includes(field))) {
    if (observed[field] === null || typeof observed[field] === "object") refuse(`observed.${field} shape`)
  }
  const wanted = { sourceRun: expectedSourceReceipt.identity.run, sourceRevision: expectedSourceReceipt.identity.revision,
    retryRequest: expectedSourceReceipt.inFlightRequest, budget: expectedSourceReceipt.identity.budget,
    arms: expectedSourceReceipt.identity.arms, indexRun: expectedSourceReceipt.identity.indexRun,
    retainedRuns: expectedSourceReceipt.identity.retainedRuns, wrapperSha256: expectedSourceReceipt.identity.wrapperSha256,
    profileSha256: expectedSourceReceipt.identity.profileSha256 }
  for (const field of identityFields) if (!isDeepStrictEqual(observed[field], wanted[field])) refuse(`observed.${field}`)
  if (observed.grokVersion !== expectedSourceReceipt.grokVersion) refuse("observed.grokVersion")
  if (observed.model !== expectedSourceReceipt.model) refuse("observed.model")
  if (observed.maxTurns !== expectedSourceReceipt.maxTurns) refuse("observed.maxTurns")
  if (observed.commandTimeoutMs !== expectedSourceReceipt.commandTimeoutMs) refuse("observed.commandTimeoutMs")
  if (observed.poolWidth !== 8) refuse("observed.poolWidth")
  if (observed.authMode !== "subscription") refuse("observed.authMode")
  for (const field of seedFields) {
    if (observed[field] !== expectedSourceReceipt[field === "originalPlanSha256" ? "planSha256" : field]) refuse(`observed.${field}`)
  }
  if (typeof observed.orchestratorRevision !== "string" || !/^[0-9a-f]{40}$/.test(observed.orchestratorRevision)) refuse("observed.orchestratorRevision")
  for (const field of proofFields.filter((field) => field !== "head")) {
    if (observed.proof[field] !== expectedProofReceipt[field]) refuse(`observed.proof.${field}`)
  }
  if (observed.proof.head !== expectedProofReceipt.head) refuse("observed.proof.head")
  if (observed.proof.status !== "completed") refuse("observed.proof.status")
  if (observed.proof.conclusion !== "success") refuse("observed.proof.conclusion")
  for (const field of artifactFields) if (observed.proof.artifact[field] !== expectedProofReceipt.artifact[field]) refuse(`observed.proof.artifact.${field}`)
  if (observed.proof.artifact.expired !== false) refuse("observed.proof.artifact.expired")
  return freeze(structuredClone({ ...observed, version: 1, source: expectedSourceReceipt, proofReceipt: expectedProofReceipt }))
}

function shape(value, fields, name, exact = true) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse(`${name} shape`)
  for (const field of fields) if (!Object.hasOwn(value, field)) refuse(`missing ${name}.${field}`)
  if (!exact) return
  for (const field of Reflect.ownKeys(value)) if (typeof field !== "string" || !fields.includes(field)) {
    refuse(`extra ${name}.${typeof field === "symbol" ? "symbol" : field}`)
  }
}

function freeze(value) {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

function refuse(reason) {
  throw new Error(`continuation policy: ${reason}`)
}
