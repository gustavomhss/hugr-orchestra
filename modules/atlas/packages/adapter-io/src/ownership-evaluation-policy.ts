import type { ComposedRuntime } from "./compose-runtime.js"
import { readEvaluationStateFile } from "./evaluation-state-io.js"
import { chargeEvaluationRead } from "./evaluation-read-budget.js"
import type { EvaluationReadBudget } from "./evaluation-read-budget.js"
import { existsSync, lstatSync, readdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Hash } from "@atlas/contracts"
import type { OwnershipEvaluationContext } from "@atlas/knowledge"
import { nativeRoot, decodeNativeUtf8, nativeCasDirectory } from "./genesis-native-io.js"
import { nativeRecord, nativeKeys, nativeDigest, nativeText, nativeStrings } from "./genesis-native-format.js"
import { createDiskStore } from "./store.js"
import type { DiskStore } from "./store.js"
import { id } from "@atlas/kernel"

export interface EvaluationAccess {
  readonly context: OwnershipEvaluationContext
  readonly scope: string
  readonly root: string
  readonly verify: () => void
  readonly charge: (operation: "read" | "index" | "body", bytes?: number) => void
  readonly assert: (operation: "admit" | "read" | "index" | "evaluation-maintenance") => void
}
const marker = ".atlas/evaluation-store.json"
const policyFile = ".atlas/evaluation-policy.json"
const issued = new WeakSet<EvaluationAccess>()

/** Local policy is not authenticated identity. This capability is only issued after strict host validation. */
export function loadEvaluationAccess(repoPath: string): EvaluationAccess {
  const root = nativeRoot(repoPath)
  const capture = () => {
    const state = nativeRecord(JSON.parse(decodeNativeUtf8(readEvaluationStateFile(root, "evaluation-store.json"))), "evaluation store")
    nativeKeys(state, ["schema", "root", "device", "inode", "evaluationPlan", "obligationSet", "evaluationCandidate", "generation", "scope", "original_root", "initialized_cas_only"], "evaluation store")
    const policy = nativeRecord(JSON.parse(decodeNativeUtf8(readEvaluationStateFile(root, "evaluation-policy.json"))), "evaluation policy")
    nativeKeys(policy, ["schema", "root", "evaluationPlan", "obligationSet", "evaluationCandidate", "generation", "scope", "actor", "operations", "consumer"], "evaluation policy")
    if (state.schema !== "ownership-evaluation-store/v1" || policy.schema !== "ownership-evaluation-policy/v1") throw new Error("evaluation-policy-version")
    if (state.initialized_cas_only !== true || typeof state.original_root !== "string" || state.original_root === root || root.startsWith(state.original_root + "/") || state.original_root.startsWith(root + "/")) throw new Error("evaluation-bootstrap-root")
    const live = createDiskStore(nativeCasDirectory(root))
    const projection = live.loadProjection()
    if (projection !== undefined) for (const row of projection.current.values()) {
      const fact = live.get(row.contentHash as Hash)
      if (fact === null || typeof fact !== "object" || !("claimNorm" in fact) || fact.claimNorm !== `Evaluation-only ownership manifest for ${state.scope}: ${state.evaluationCandidate}`) throw new Error("evaluation-operational-state-present")
    }
    const staged = live.commitStaging((p) => ({ out: p.current.size }))
    if (!staged.settled || staged.out !== 0) throw new Error("evaluation-staging-present")
    const stat = lstatSync(root)
    if (state.root !== root || state.device !== stat.dev || state.inode !== stat.ino) throw new Error("evaluation-root-identity")
    for (const key of ["root", "evaluationPlan", "obligationSet", "evaluationCandidate", "generation", "scope"])
      if (state[key] !== policy[key]) throw new Error("evaluation-policy-binding")
    for (const key of ["evaluationPlan", "obligationSet", "evaluationCandidate", "generation"]) nativeDigest(state[key], 64, key)
    const scope = nativeText(state.scope, "scope")
    if (scope.includes("*") || nativeText(policy.actor, "actor") !== process.env.ATLAS_ACTOR) throw new Error("evaluation-policy-actor-scope")
    const operations = nativeStrings(policy.operations, "operations")
    if (operations.length === 0 || new Set(operations).size !== operations.length || operations.some((x) => !["admit", "read", "index", "evaluation-maintenance"].includes(x))) throw new Error("evaluation-policy-operations")
    const consumer = policy.consumer === null ? undefined : nativeRecord(policy.consumer, "consumer")
    const candidate = nativeRecord(live.get(state.evaluationCandidate as Hash), "candidate")
    if (id(candidate) !== state.evaluationCandidate) throw new Error("evaluation-candidate-integrity")
    const plan = nativeRecord(live.get(state.evaluationPlan as Hash), "plan")
    if (id(plan) !== state.evaluationPlan) throw new Error("evaluation-plan-integrity")
    let readBudget: EvaluationReadBudget | undefined
    if (consumer !== undefined) {
      nativeKeys(consumer, ["id", "mode"], "consumer")
      const modes = nativeRecord(plan.consumer_modes, "consumer modes")
      if (typeof consumer.id !== "string" || !Array.isArray(plan.consumer_ids) || !plan.consumer_ids.includes(consumer.id) || modes[consumer.id] !== consumer.mode) throw new Error("evaluation-consumer-plan")
      const limits = nativeRecord(nativeRecord(plan.read_limits, "read limits")[String(consumer.mode)], "consumer limits")
      nativeKeys(limits, ["index_calls", "read_calls", "body_bytes_total"], "consumer limits")
      for (const n of Object.values(limits)) if (!Number.isSafeInteger(n) || Number(n) < 1) throw new Error("evaluation-consumer-limit")
      readBudget = { id: consumer.id, mode: String(consumer.mode), limits: limits as unknown as EvaluationReadBudget["limits"] }
    }
    if ((operations.includes("read") || operations.includes("index")) && readBudget === undefined) throw new Error("evaluation-consumer-required")
    assertIsolatedTree(join(root, ".atlas"))
    return { state, operations, readBudget, identity: JSON.stringify({ state, policy }) }
  }
  const initial = capture()
  const context: OwnershipEvaluationContext = {
    evaluation: { phase: "evaluation", evaluationPlan: initial.state.evaluationPlan as Hash, obligationSet: initial.state.obligationSet as Hash },
    evaluationCandidate: initial.state.evaluationCandidate as Hash, generation: initial.state.generation as Hash,
  }
  const verify = () => { if (capture().identity !== initial.identity) throw new Error("evaluation-policy-drift") }
  const charge = (operation: "read" | "index" | "body", bytes?: number) => {
    verify()
    if (!initial.operations.includes(operation === "body" ? "read" : operation)) throw new Error("evaluation-operation-denied")
    if (initial.readBudget === undefined) throw new Error("evaluation-consumer-required")
    chargeEvaluationRead(root, String(initial.state.evaluationCandidate), String(initial.state.generation), initial.readBudget, operation, bytes)
  }
  const access: EvaluationAccess = Object.freeze({ root, verify, charge, context: Object.freeze(context), scope: String(initial.state.scope), assert: (operation: "admit" | "read" | "index" | "evaluation-maintenance") => {
    const now = capture()
    if (now.identity !== initial.identity || !now.operations.includes(operation)) throw new Error("evaluation-policy-drift-or-denied")
  } })
  Object.freeze(context.evaluation)
  issued.add(access)
  return access
}

export function assertEvaluationComposition(root: string, access?: EvaluationAccess): void {
  if (access === undefined) {
    if (existsSync(join(root, marker)) || existsSync(join(root, policyFile))) throw new Error("evaluation-operational-composition-refused")
    return
  }
  if (!issued.has(access) || access.root !== nativeRoot(root)) throw new Error("evaluation-unverified-context")
  access.verify()
}

function assertIsolatedTree(path: string): void {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink() || realpathSync(path) !== path || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) throw new Error("evaluation-state-alias")
  if (stat.isDirectory()) for (const name of readdirSync(path)) assertIsolatedTree(join(path, name))
}

/** Only facts may leave generic doors. Ownership CAS objects require their authoritative reader chain. */
export function genericOwnershipVisible(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return !("evaluation" in v) && !(typeof v.claimNorm === "string" && v.claimNorm.startsWith("Evaluation-only ownership manifest for ")) && !(typeof v.kind === "string" && v.kind.startsWith("ownership-"))
}

/** Shared generic-read view; ownership readers retain the original provenance-filtered store. */
export function phaseFilteredStore(store: DiskStore): DiskStore {
  return { ...store, get: (hash) => { const value = store.get(hash); return genericOwnershipVisible(value) ? value : undefined },
    loadProjection: () => {
      const projection = store.loadProjection()
      if (projection === undefined) return undefined
      const current = new Map([...projection.current].filter(([, row]) => genericOwnershipVisible(store.get(row.contentHash as Hash))))
      return { ...projection, current }
    },
  }
}

export const evaluationPolicyUrl = import.meta.url

/** Explicit setup step, never called by prepare/read/admit. Refuses any prior active/staged state. */
export function initializeEvaluationStore(repoPath: string, candidateHash: Hash, generation: Hash): void {
  const root = nativeRoot(repoPath), directory = join(root, ".atlas")
  if (readdirSync(directory).some((name) => name !== "cas")) throw new Error("evaluation-bootstrap-nonempty-state")
  assertIsolatedTree(directory)
  const store = createDiskStore(nativeCasDirectory(root)), candidate = nativeRecord(store.get(candidateHash), "candidate")
  if (id(candidate) !== candidateHash || candidate.kind !== "genesis-evaluation-candidate" || candidate.version !== 2 || candidate.repo_root !== root) throw new Error("evaluation-bootstrap-candidate")
  const evaluation = nativeRecord(candidate.evaluation, "evaluation")
  const plan = nativeRecord(store.get(evaluation.evaluationPlan as Hash), "plan")
  const isolation = nativeRecord(plan.isolation, "isolation")
  if (isolation.root !== root || typeof isolation.original_root !== "string" || isolation.original_root === root || root.startsWith(isolation.original_root + "/") || isolation.original_root.startsWith(root + "/")) throw new Error("evaluation-bootstrap-root")
  nativeDigest(generation, 64, "generation")
  const stat = lstatSync(root)
  const descriptor = { schema: "ownership-evaluation-store/v1", root, device: stat.dev, inode: stat.ino, evaluationPlan: evaluation.evaluationPlan, obligationSet: evaluation.obligationSet,
    evaluationCandidate: candidateHash, generation, scope: candidate.scope, original_root: isolation.original_root, initialized_cas_only: true }
  writeFileSync(join(root, marker), JSON.stringify(descriptor) + "\n", { flag: "wx" })
}

/** Closed evaluation operation surface; no inherited operational capabilities. */
export function constrainEvaluationRuntime(runtime: ComposedRuntime, repoPath: string, evaluation?: EvaluationAccess): ComposedRuntime {
  if (evaluation === undefined) return runtime
  // Evaluation grants only its budgeted ownership port and governed admission/check path.
  // Future operational methods are denied by default, not silently inherited by evaluation consumers.
  const facade = Object.create(null) as ComposedRuntime
  Object.defineProperties(facade, {
    ownership: { enumerable: true, get: () => { assertEvaluationComposition(repoPath, evaluation); return runtime.ownership } },
    handler: { enumerable: true, get: () => { assertEvaluationComposition(repoPath, evaluation); return runtime.handler } },
    check: { enumerable: true, get: () => (...args: Parameters<ComposedRuntime["check"]>) => {
      assertEvaluationComposition(repoPath, evaluation)
      evaluation.assert("admit")
      return runtime.check(...args)
    } },
  })
  Object.preventExtensions(facade)
  return new Proxy(facade, {
    get(target, property, receiver) {
      if (!Object.hasOwn(target, property)) throw new Error("evaluation-operation-denied")
      return Reflect.get(target, property, receiver)
    },
    set() { throw new Error("evaluation-operation-denied") },
    defineProperty() { throw new Error("evaluation-operation-denied") },
    deleteProperty() { throw new Error("evaluation-operation-denied") },
    setPrototypeOf() { throw new Error("evaluation-operation-denied") },
  })
}
