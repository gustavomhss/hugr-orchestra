// Operator bridge to the existing Atlas implementation. It does not publish or approve knowledge.
// Changed-input production is deliberately unavailable here; only a real separately reviewed
// native production can supply it. An unchanged run must invoke neither callback.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createDiskStore } from "../runtime-r2/modules/atlas/packages/adapter-io/src/store.ts"
import { observeOwnershipInput } from "../runtime-r2/modules/atlas/packages/adapter-io/src/ownership-input.ts"
import { rebuildOwnershipUpdate } from "../runtime-r2/modules/atlas/packages/adapter-io/src/ownership-rebuild.ts"
import { planOwnershipUpdate } from "../runtime-r2/modules/atlas/packages/knowledge/src/ownership/update-plan.ts"

const [rootArg, packageArg, preparedArg, publicationArg, mode = "plan"] = process.argv.slice(2)
if (!rootArg || !packageArg || !preparedArg || !publicationArg || !["plan", "unchanged"].includes(mode))
  throw new Error("atlas-maintenance-inspect.mjs <isolated-root> <package-file> <prepared-file> <publication-response> plan|unchanged")
const root = resolve(rootArg)
const pack = JSON.parse(readFileSync(packageArg, "utf8"))
const prepared = JSON.parse(readFileSync(preparedArg, "utf8"))
const publication = JSON.parse(readFileSync(publicationArg, "utf8"))
if (prepared.candidate.scope !== pack.scope || publication.candidate_id !== prepared.candidate_id || !publication.ownership)
  throw new Error("exact-native-baseline-required")
const store = createDiskStore(resolve(root, ".atlas/cas"))
const observe = (key) => observeOwnershipInput(root, key)
const plan = planOwnershipUpdate(store, publication.ownership, pack.scope, observe)
const invocations = { recipe: [], evaluate: [] }
const recipes = new Map(pack.artifacts.map((artifact) => {
  const entry = prepared.candidate.entries.find((entry) => entry.key === artifact.key)
  if (!entry) throw new Error(`missing-entry: ${artifact.key}`)
  const recipePath = artifact.recipe_ref.payload_path ?? artifact.recipe_ref.path
  const recipeInputKey = `file:${recipePath}`
  const bound = entry.inputs.find((input) => input.key === recipeInputKey)
  if (!bound) throw new Error(`missing-recipe-input: ${artifact.key}`)
  return [artifact.key, {
    key: artifact.key, recipeInputKey, recipeVersion: bound.version,
    declaredInputs: entry.inputs.map((input) => input.key),
    required: entry.dependencies.map((dependency) => dependency.key),
    run: () => {
      invocations.recipe.push(artifact.key)
      return { body: "", validity: "blocked", gaps: ["Changed inputs require a separately preserved native production and exact same-pair review; this inspection bridge does not supply either."] }
    },
  }]
}))
const result = mode === "unchanged" ? rebuildOwnershipUpdate({
  store, manifest: publication.ownership, scope: pack.scope, observe,
  readCapturedBytes: (key) => key.startsWith("file:") ? readFileSync(resolve(root, key.slice(5))) : undefined,
  listMembers: () => { throw new Error("No membership input is authorized by this captured-source materialization") },
  recipes, contract: prepared.candidate.contract,
  evaluate: (input) => {
    invocations.evaluate.push(input.key)
    return { kind: "hold", reason: "ownership-review", evidence: [input.key, "real-current-native-review-required"] }
  },
}) : null
console.log(JSON.stringify({
  schema: "s1-01-own-maintenance-observation/v1", mode,
  source_runtime_candidate: "7102f2e3a1a9a3822bcd0ae054b36ecffe9da553",
  baseline_native_candidate: prepared.candidate_id, baseline_manifest: publication.ownership,
  baseline_publication_kind: publication.kind, baseline_publication_stage: publication.stage ?? null,
  governed_publication_claim: false, private_existing_engine_only: true,
  plan, result, invocations,
  interpretation_calls: invocations.recipe.length === 0 ? 0 : "NONE_ISSUED_BY_THIS_BRIDGE",
  limits: ["A private accepted CAS manifest is not a governed publication or a successful served consumer read.", "Changed-input planning is not a completed rebuild.", "No fabricated native reviewer or policy is created."],
}))
