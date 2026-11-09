// @atlas/adapter-io — src/ownership-rebuild.ts (G2.2 F1)
//
// Incremental rebuild executor. Accepts a verified baseline, an explicit recipe registry and host
// observation access; calls `planOwnershipUpdate` internally; returns a complete validated private
// candidate OR an `OwnershipRefusal` (HOLD). It never accepts `affected` from the caller, never
// publishes, and never mutates the projection. Activation / recovery / migration stay in F3.
// Contract: modules/atlas/docs/design/genesis-g2.2-contract.md §2 (Astra decision 2026-11-09).

import type { Hash } from "@atlas/contracts"
import type { StoreApi } from "@atlas/kernel"
import { planOwnershipUpdate, readOwnership } from "@atlas/knowledge"
import type { OwnershipArtifact, OwnershipContract, OwnershipInput, OwnershipInputObservation, OwnershipManifest, OwnershipReceipt, OwnershipRefusal, OwnershipResult } from "@atlas/knowledge"

/** Captured inputs and resolved prerequisite results handed to one recipe invocation. The recipe
 *  consumes ONLY these captured values — bytes and lists included — never a live reopened host
 *  path (TC-05). `bytes` carries the captured file contents for present `file:` bindings;
 *  `lists` carries the captured effective membership for `members:` bindings. */
export interface OwnershipRecipeInput {
  readonly captured: ReadonlyMap<string, OwnershipInputObservation>
  readonly bytes: ReadonlyMap<string, Uint8Array>
  readonly lists: ReadonlyMap<string, readonly string[]>
  readonly dependencies: ReadonlyMap<string, Hash>
}

/** Deterministic recipe output: the reviewed body plus optional result decorations. Evaluation is
 *  a separate post-production step (`evaluate` below) — a `blocked` validity is a HOLD, never a
 *  candidate. */
export interface OwnershipRecipeOutput {
  readonly body: string
  readonly authorityBasis?: string
  readonly validity?: "supported" | "blocked"
  readonly gaps?: readonly string[]
  readonly evidence?: readonly string[]
}

/** One artifact's explicitly declared recipe + identity of the implementation that may run. */
export interface OwnershipRecipe {
  /** Artifact key this recipe rebuilds. */
  readonly key: string
  /** Recipe implementation input, e.g. `file:recipe-a.ts`; its observed version binds the
   *  implementation identity into the receipt. */
  readonly recipeInputKey: string
  /** Implementation identity executed; must equal the version bound from the baseline declaration
   *  (RB-07/RB-16) — scalar, because F1 keeps recipes fixed. */
  readonly recipeVersion: string
  /** Obligatory input keys the baseline receipt must bind (contract §2.2). A receipt omitting one
   *  is a HOLD (RB-14); the executor never invents a binding for an invisible dependency. */
  readonly declaredInputs: readonly string[]
  /** Fixed mandatory inputs (subset of `declaredInputs`; defaults to all declared inputs).
   *  Declared inputs outside this list are removable dynamic set members (§1.4). */
  readonly mandatoryInputs?: readonly string[]
  /** Prerequisite artifact keys whose result binding the baseline receipt must carry (RB-15).
   *  Must match the baseline receipt edges exactly — omitting or adding an edge is a graph change. */
  readonly required: readonly string[]
  /** Deterministic transform of the captured inputs + resolved prerequisite results. */
  readonly run: (input: OwnershipRecipeInput) => OwnershipRecipeOutput
}

/** Post-production evaluation of one rebuilt artifact. Implemented outside the executor so the
 *  candidate cannot fabricate approvals: it returns persisted review refs bound to the current
 *  inputs/dependencies/result, or a HOLD. */
export type OwnershipEvaluationResult = OwnershipRefusal | {
  readonly kind: "ready"
  readonly reviews: readonly Hash[]
}

/** Full request. The baseline is authoritative for reuse; no new global cache. */
export interface OwnershipRebuildRequest {
  readonly store: StoreApi
  readonly manifest: Hash
  readonly scope: string
  readonly observe: (key: string) => OwnershipInputObservation
  /** Captured bytes for one key from the same capture that produced its observation (host: the
   *  descriptor bytes hashed into the version). Undefined for non-file bindings. */
  readonly readCapturedBytes: (key: string) => Uint8Array | undefined
  /** Effective member list per `members:` dir (without prefix), for consuming new/removed members
   *  (RB-03/RB-04, contract §2.3 step 3). Captured once per rebuild; execution consumes the capture. */
  readonly listMembers: (dir: string) => readonly string[]
  readonly recipes: ReadonlyMap<string, OwnershipRecipe>
  readonly contract: Hash
  /** Current evaluation for one rebuilt artifact (contract §2.3 step 8). */
  readonly evaluate: (input: {
    readonly key: string
    readonly scope: string
    readonly inputs: readonly OwnershipInput[]
    readonly dependencies: readonly { readonly key: string; readonly result: Hash }[]
    readonly result: Hash
  }) => OwnershipEvaluationResult
}

export type OwnershipRebuildResult =
  | OwnershipRefusal
  | {
      readonly kind: "candidate"
      readonly manifest: Hash
      /** Affected artifacts in dependency order (planner order). */
      readonly affected: readonly string[]
      /** Artifacts whose recipe actually executed, in execution order. */
      readonly calls: readonly string[]
    }

const copyObservation = (observation: OwnershipInputObservation): OwnershipInputObservation =>
  observation.kind === "present" ? { kind: "present", version: observation.version } : { kind: observation.kind }

/** Planner → capture → reuse/revalidation → candidate (contract §2.3 steps 1..11). */
export function rebuildOwnershipUpdate(request: OwnershipRebuildRequest): OwnershipRebuildResult {
  const captured = new Map<string, OwnershipInputObservation>()
  const observing = (key: string): OwnershipInputObservation => {
    const found = captured.get(key)
    if (found !== undefined) return found
    const observed = copyObservation(request.observe(key))
    captured.set(key, observed)
    return observed
  }
  const plan = planOwnershipUpdate(request.store, request.manifest, request.scope, observing)
  if (plan.kind === "hold") return plan
  const manifest = request.store.get(request.manifest) as OwnershipManifest | undefined
  const baselineManifest = manifest
  if (baselineManifest?.kind !== "ownership-manifest") return hold("malformed-ownership", [request.manifest])
  const baselineArtifacts = new Map<string, { artifact: OwnershipArtifact; artifactRef: Hash; receipt: OwnershipReceipt; resultRef: Hash }>()
  for (const entry of baselineManifest.entries) {
    const artifact = request.store.get(entry.artifact) as OwnershipArtifact | undefined
    if (artifact?.kind !== "ownership-artifact") return hold("malformed-ownership", [entry.artifact])
    const receipt = request.store.get(artifact.receipt) as OwnershipReceipt | undefined
    if (receipt?.kind !== "ownership-receipt") return hold("malformed-ownership", [artifact.receipt])
    baselineArtifacts.set(entry.key, { artifact, artifactRef: entry.artifact, receipt, resultRef: artifact.result })
  }
  for (const entry of baselineManifest.entries) {
    const recipe = request.recipes.get(entry.key)
    if (recipe === undefined) return hold("malformed-ownership", [entry.key, "recipe"])
    const bound = baselineArtifacts.get(entry.key)?.receipt
    if (bound?.contract !== request.contract) return hold("ownership-review", [entry.key, bound?.contract ?? "no-contract"])
    const mandatory = new Set(recipe.mandatoryInputs ?? recipe.declaredInputs)
    const boundKeys = new Set((bound?.inputs ?? []).map((input) => input.key))
    for (const input of mandatory) {
      if (!boundKeys.has(input)) return hold("malformed-ownership", [entry.key, input])
    }
    for (const input of bound?.inputs ?? []) {
      if (mandatory.has(input.key) || recipe.declaredInputs.includes(input.key) || isUnderMembers(input.key, bound as OwnershipReceipt)) continue
      return hold("malformed-ownership", [entry.key, input.key])
    }
    const depKeys = new Set((bound?.dependencies ?? []).map((dependency) => dependency.key))
    const requiredSet = new Set(recipe.required)
    if (requiredSet.size !== recipe.required.length || depKeys.size !== requiredSet.size || [...requiredSet].some((dep) => !depKeys.has(dep)))
      return hold("ownership-dependency-changed", [entry.key])
    const recipeObservation = captured.get(recipe.recipeInputKey)
    if (recipeObservation?.kind !== "present" || recipeObservation.version !== recipe.recipeVersion) return hold("malformed-ownership", [entry.key, recipe.recipeInputKey])
  }
  const initialMembers = new Map<string, readonly string[]>()
  for (const entry of baselineManifest.entries) {
    const receipt = baselineArtifacts.get(entry.key)?.receipt
    for (const input of receipt?.inputs ?? []) {
      if (!input.key.startsWith("members:")) continue
      const dir = input.key.slice("members:".length)
      if (initialMembers.has(dir)) continue
      initialMembers.set(dir, [...request.listMembers(dir)].sort())
    }
  }
  for (const members of initialMembers.values()) {
    for (const path of members) {
      const memberKey = `file:${path}`
      if (!captured.has(memberKey)) captured.set(memberKey, copyObservation(request.observe(memberKey)))
    }
  }
  for (const entry of baselineManifest.entries) {
    const receipt = baselineArtifacts.get(entry.key)?.receipt
    const boundKeys = new Set((receipt?.inputs ?? []).map((input) => input.key))
    for (const input of receipt?.inputs ?? []) {
      if (!input.key.startsWith("members:")) continue
      const membersVersion = captured.get(input.key)
      if (membersVersion?.kind !== "present" || membersVersion.version !== input.version) continue
      for (const path of initialMembers.get(input.key.slice("members:".length)) ?? []) {
        const memberKey = `file:${path}`
        if (captured.get(memberKey)?.kind === "present" && !boundKeys.has(memberKey))
          return hold("malformed-ownership", [entry.key, memberKey])
      }
    }
  }
  const capturedBytes = new Map<string, Uint8Array>()
  for (const [key, observed] of captured) {
    if (observed.kind !== "present" || !key.startsWith("file:")) continue
    const live = request.readCapturedBytes(key)
    if (live !== undefined) capturedBytes.set(key, new Uint8Array(live))
  }
  const snapshotForRecipe = (): OwnershipRecipeInput => ({
    captured: new Map([...captured].map(([snapshotKey, snapshotValue]) => [snapshotKey, copyObservation(snapshotValue)] as [string, OwnershipInputObservation])),
    bytes: new Map([...capturedBytes].map(([snapshotKey, snapshotValue]) => [snapshotKey, new Uint8Array(snapshotValue)] as [string, Uint8Array])),
    lists: new Map([...initialMembers].map(([snapshotKey, snapshotValue]) => [snapshotKey, [...snapshotValue]] as [string, readonly string[]])),
    dependencies: new Map(),
  })
  const snapshotForRecipeInput = (dependencies: ReadonlyMap<string, Hash>): OwnershipRecipeInput => ({ ...snapshotForRecipe(), dependencies })
  const preflightMap = new Map<string, OwnershipInputObservation>()
  for (const key of captured.keys()) preflightMap.set(key, request.observe(key))
  for (const [key, fresh] of preflightMap) {
    if (!sameObservation(captured.get(key), fresh)) return hold("ownership-input-changed", [key])
  }
  for (const [dir, listed] of initialMembers) {
    const now = [...request.listMembers(dir)].sort()
    if (now.join("\0") !== listed.join("\0")) return hold("ownership-input-changed", [dir])
  }
  const newResults = new Map<string, Hash>()
  for (const entry of baselineManifest.entries) newResults.set(entry.key, baselineArtifacts.get(entry.key)!.resultRef)
  const candidateArtifacts = new Map<string, Hash>()
  for (const entry of baselineManifest.entries) candidateArtifacts.set(entry.key, entry.artifact)
  const calls: string[] = []
  const currentFromCaptured = (inputKey: string): string | undefined => {
    const observed = captured.get(inputKey)
    return observed?.kind === "present" ? observed.version : undefined
  }
  const contract = request.store.get(request.contract) as OwnershipContract | undefined
  if (contract?.kind !== "ownership-contract") return hold("ownership-review", [request.contract])
  if (plan.affected.length === 0) return { kind: "candidate", manifest: request.manifest, affected: [], calls: [] }
  for (const key of plan.affected) {
    const bound = baselineArtifacts.get(key)
    if (bound === undefined) return hold("malformed-ownership", [key])
    const recipe = request.recipes.get(key)
    if (recipe === undefined) return hold("malformed-ownership", [key, "recipe"])
    const candidateInputs = effectiveInputs(key, bound.receipt, recipe, captured, initialMembers)
    if ("kind" in candidateInputs) return candidateInputs
    for (const input of candidateInputs) {
      const observed = captured.get(input.key)
      if (observed === undefined) return hold("ownership-input-unavailable", [key, input.key])
      if (observed.kind === "absent" && (recipe.mandatoryInputs ?? recipe.declaredInputs).includes(input.key)) return hold("ownership-input-unavailable", [key, input.key])
      if (observed.kind === "unavailable") return hold("ownership-input-unavailable", [key, input.key])
    }
    for (const input of bound.receipt.inputs) {
      if (!input.key.startsWith("members:")) continue
      const observed = captured.get(input.key)
      if (observed?.kind !== "present" && observed?.kind !== "absent") return hold("ownership-input-unavailable", [key, input.key])
      if (observed?.kind === "absent") return hold("ownership-input-unavailable", [key, input.key])
    }
    const ownChanged = inputsChanged(bound.receipt.inputs, candidateInputs, captured)
    const depChanged = recipe.required.some((dep) => newResults.get(dep) !== bound.receipt.dependencies.find((dependency) => dependency.key === dep)?.result)
    const precise = ownChanged || depChanged
    if (!precise) continue
    for (const input of candidateInputs) {
      const fresh = request.observe(input.key)
      if (!sameObservation(captured.get(input.key), fresh)) return hold("ownership-input-changed", [key, input.key])
    }
    const dependencies = new Map<string, Hash>()
    for (const dep of recipe.required) {
      const resolved = newResults.get(dep)
      if (resolved === undefined) return hold("ownership-dependency-changed", [key, dep])
      dependencies.set(dep, resolved)
    }
    const output = recipe.run(snapshotForRecipeInput(dependencies))
    calls.push(key)
    if (output.validity === "blocked") return hold("ownership-blocked", [key, ...(output.gaps ?? [])])
    for (const input of candidateInputs) {
      const fresh = request.observe(input.key)
      if (!sameObservation(captured.get(input.key), fresh)) return hold("ownership-input-changed", [key, input.key])
    }
    const result: OwnershipResult = {
      kind: "ownership-result", version: 1,
      body: request.store.put({ kind: "ownership-body", version: 1, bytes: Array.from(new TextEncoder().encode(output.body)) }),
      authority: { scope: bound.artifact.scope, basis: output.authorityBasis ?? "fixture recipe" },
      validity: "supported", gaps: output.gaps ?? [], evidence: output.evidence ?? ["fixture, not semantic acceptance"],
    }
    const resultRef = request.store.put(result)
    const newDependencies = recipe.required.map((dep) => ({ key: dep, result: newResults.get(dep) as Hash }))
    const evaluated = request.evaluate({ key, scope: bound.artifact.scope, inputs: candidateInputs, dependencies: newDependencies, result: resultRef })
    if (evaluated.kind === "hold") return evaluated
    const newReceipt: OwnershipReceipt = {
      kind: "ownership-receipt", version: 1, contract: request.contract,
      inputs: candidateInputs, dependencies: newDependencies,
      reviews: evaluated.reviews,
    }
    const receiptRef = request.store.put(newReceipt)
    const newArtifact: OwnershipArtifact = { ...bound.artifact, result: resultRef, receipt: receiptRef }
    candidateArtifacts.set(key, request.store.put(newArtifact))
    const partialManifest: OwnershipManifest = {
      ...baselineManifest,
      entries: baselineManifest.entries.map((entry) => ({ key: entry.key, artifact: candidateArtifacts.get(entry.key) as Hash })),
    }
    const partialRef = request.store.put(partialManifest)
    const nodeRead = readOwnership(request.store, partialRef, { scope: request.scope, key, maxBytes: Number.MAX_SAFE_INTEGER }, currentFromCaptured)
    if (nodeRead.kind === "hold") return nodeRead
    newResults.set(key, resultRef)
  }
  for (const key of captured.keys()) {
    const fresh = request.observe(key)
    if (!sameObservation(captured.get(key), fresh)) return hold("ownership-input-changed", [key])
  }
  for (const [dir, listed] of initialMembers) {
    const now = [...request.listMembers(dir)].sort()
    if (now.join("\0") !== listed.join("\0")) return hold("ownership-input-changed", [dir])
  }
  const candidateManifest: OwnershipManifest = {
    ...baselineManifest,
    entries: baselineManifest.entries.map((entry) => ({ key: entry.key, artifact: candidateArtifacts.get(entry.key) as Hash })),
  }
  const candidateManifestRef = request.store.put(candidateManifest)
  for (const entry of candidateManifest.entries) {
    const read = readOwnership(request.store, candidateManifestRef, { scope: request.scope, key: entry.key, maxBytes: Number.MAX_SAFE_INTEGER }, currentFromCaptured)
    if (read.kind === "hold") return read
  }
  return { kind: "candidate", manifest: candidateManifestRef, affected: plan.affected, calls }
}

function hold(reason: OwnershipRefusal["reason"], evidence: readonly string[]): OwnershipRefusal {
  return { kind: "hold", reason, evidence }
}

function sameObservation(a: OwnershipInputObservation | undefined, b: OwnershipInputObservation | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a?.kind !== b?.kind) return false
  if (a?.kind === "present" && b?.kind === "present") return a.version === b.version
  return a?.kind === b?.kind
}

function isUnderMembers(input: string, receipt: OwnershipReceipt): boolean {
  if (!input.startsWith("file:")) return false
  const path = input.slice("file:".length)
  return receipt.inputs.some((entry) => entry.key.startsWith("members:") && path.startsWith(`${entry.key.slice("members:".length)}/`))
}

function effectiveInputs(key: string, receipt: OwnershipReceipt, recipe: OwnershipRecipe, captured: ReadonlyMap<string, OwnershipInputObservation>, initialMembers: ReadonlyMap<string, readonly string[]>): readonly OwnershipInput[] | OwnershipRefusal {
  void key
  const mandatory = new Set(recipe.mandatoryInputs ?? recipe.declaredInputs)
  const membersDirs = receipt.inputs.filter((input) => input.key.startsWith("members:")).map((input) => input.key.slice("members:".length))
  const effective = new Map<string, string>()
  for (const path of membersDirs.flatMap((dir) => initialMembers.get(dir) ?? [])) {
    const memberKey = `file:${path}`
    const observed = captured.get(memberKey)
    if (observed?.kind === "present") effective.set(memberKey, observed.version)
    else if (observed?.kind === "absent") effective.delete(memberKey)
    else if (observed !== undefined) return hold("ownership-input-unavailable", [memberKey])
  }
  const out: OwnershipInput[] = []
  for (const input of receipt.inputs) {
    if (input.key.startsWith("file:") && isUnderMembers(input.key, receipt) && !mandatory.has(input.key)) {
      const version = effective.get(input.key)
      if (version !== undefined) out.push({ key: input.key, version })
      continue
    }
    const observed = captured.get(input.key)
    out.push(observed?.kind === "present" ? { key: input.key, version: observed.version } : input)
  }
  for (const [memberKey, version] of effective) {
    if (!out.some((input) => input.key === memberKey)) out.push({ key: memberKey, version })
  }
  return out.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

function inputsChanged(baseline: readonly OwnershipInput[], candidate: readonly OwnershipInput[], captured: ReadonlyMap<string, OwnershipInputObservation>): boolean {
  const base = new Map(baseline.map((input) => [input.key, input.version]))
  const next = new Map(candidate.map((input) => [input.key, input.version]))
  if (base.size !== next.size) return true
  for (const [key, version] of base) {
    if (next.get(key) !== version) return true
    const observed = captured.get(key)
    if (observed === undefined) return true
    if (observed.kind !== "present" || observed.version !== version) return true
  }
  for (const key of next.keys()) if (!base.has(key)) return true
  return false
}
