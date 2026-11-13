import { createMemoryEmit } from "../src/memory-emit.js"
import { createDurableMemory } from "../src/memory-store.js"
import { exportContext } from "../src/context-log.js"
import { declareTerritory } from "../src/territory-write.js"
import { appendReview } from "../src/review-log.js"
import { appendCardEvent, appendAttempt } from "../src/card-log.js"
import { appendBoardEvent, appendLogbookEntry, appendMilestone } from "../src/record-log.js"
import { createRequire } from "node:module"
import { asHash } from "@atlas/kernel"
import type { Cas } from "@atlas/kernel"
import { readCas, writeCasObjects, sameCas } from "../src/okf-store.js"
import { openSurface } from "../src/surface/index.js"
import { readStoreFiles, readReasoning, pendingFacts } from "../src/surface/read-store.js"
import { assembleHandler } from "../src/wire.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { defaultPolicy } from "../src/policy.js"
import { evaluationRuntimeIdentity, evaluationRuntimePackages } from "../src/evaluation-runtime-identity.js"
import { readEvaluationStateFile } from "../src/evaluation-state-io.js"
import { nativePath } from "../src/genesis-native-format.js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { readdirSync, readFileSync, existsSync, linkSync, symlinkSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { asNodeKey, createStore, id } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import { OWNERSHIP_ADMISSION_CRITERIA } from "@atlas/knowledge"
import { composeRuntime } from "../src/compose.js"
import { createDiskStore } from "../src/store.js"
import { loadEvaluationAccess, assertEvaluationComposition, genericOwnershipVisible, phaseFilteredStore } from "../src/ownership-evaluation-policy.js"
import { ownershipAttachmentRefusal } from "../src/ownership-attachment.js"
import { rebuildOwnershipUpdate } from "../src/ownership-rebuild.js"
import { chargeEvaluationRead } from "../src/evaluation-read-budget.js"
import { validateEvaluationBinding } from "../src/genesis-evaluation-binding.js"
import type { EvaluationBinding } from "../src/genesis-evaluation-binding.js"
import type { PreparedEvaluation } from "../src/genesis-evaluation.js"

// Read-only simulated dependency drift: no live dependency file is edited by this test.
const simulatedRuntimeDrift = vi.hoisted(() => ({ path: "" }))
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return { ...actual, readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
    const value = actual.readFileSync(...args)
    if (String(args[0]) !== simulatedRuntimeDrift.path) return value
    return typeof value === "string" ? value + "\n" : Buffer.concat([value, Buffer.from("\n")])
  } }
})

// Synthetic CI fixtures only. No real candidate, reviewer decision, campaign admission or publication.
const roots: string[] = []
const originalActor = process.env.ATLAS_ACTOR
function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "atlas-evaluation-boundary-"))
  roots.push(root)
  mkdirSync(join(root, ".atlas", "cas"), { recursive: true })
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  if (originalActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = originalActor
})

function policyFixture() {
  const root = temporaryRoot()
  const stat = lstatSync(root)
  const store = createDiskStore(join(root, ".atlas/cas"))
  const evaluationPlan = store.put({ schema: "genesis-evaluation-plan/v1", consumer_ids: ["case"], consumer_modes: { case: "routine" }, read_limits: { routine: { index_calls: 2, read_calls: 2, body_bytes_total: 16 } } })
  const obligationSet = store.put({ obligations: "synthetic" })
  const evaluationCandidate = store.put({ kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation", repo_root: root, scope: "test.scope", evaluation: { phase: "evaluation", evaluationPlan, obligationSet } })
  const shared = { root, evaluationPlan, obligationSet, evaluationCandidate, generation: id({ generation: "synthetic" }), scope: "test.scope" }
  const marker = { schema: "ownership-evaluation-store/v1", ...shared, device: stat.dev, inode: stat.ino, original_root: `${root}-original`, initialized_cas_only: true }
  const policy = { schema: "ownership-evaluation-policy/v1", ...shared, actor: "fixture-operator", operations: ["read", "index", "admit"], consumer: { id: "case", mode: "routine" } }
  process.env.ATLAS_ACTOR = policy.actor
  const save = () => {
    writeFileSync(join(root, ".atlas/evaluation-store.json"), JSON.stringify(marker))
    writeFileSync(join(root, ".atlas/evaluation-policy.json"), JSON.stringify(policy))
  }
  save()
  return { root, marker, policy, save }
}

function bindingFixture(): { prepared: PreparedEvaluation; binding: EvaluationBinding } {
  const contract = id({ contract: "synthetic admission" }), result = id({ result: "synthetic" })
  const inputs = [{ key: "file:input", version: "v1" }], dependencies: [] = []
  const inputsId = id({ inputs, dependencies })
  const candidate: PreparedEvaluation["candidate"] = {
    kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation", plan_path: "plan.json", runtime_identity: { runtime: "synthetic" },
    evaluation: { phase: "evaluation", evaluationPlan: id({ plan: "synthetic" }), obligationSet: id({ obligations: "synthetic" }) },
    original_candidate: id({ original: "synthetic" }), original_contract: id({ original: "contract" }),
    repo_root: "/synthetic/not-used", observed_head: null, source_revision: "synthetic-not-git", scope: "test.scope", session: "TEST",
    reference_commit_verification: "external-capture-evidence-required", transport: { path: "package.json", sha256: "a".repeat(64), body: id({ package: "synthetic" }) },
    implementation: {}, references: [], observations: [], roots: { entry: "entry" }, required_artifact_keys: ["entry"],
    entries: [{ key: "entry", artifact: { kind: "ownership-artifact", version: 1, key: "entry", scope: "test.scope", title: "Synthetic", layer: 1, need: "entry", result, navigation: [] },
      inputs, dependencies, inputs_id: inputsId, contract, semanticEvidence: [id({ semantic: "fixture-a" }), id({ semantic: "fixture-b" })] }],
  }
  const prepared: PreparedEvaluation = { schema: "genesis-native-prepared/v2", candidate_id: id(candidate), candidate }
  const binding: EvaluationBinding = { schema: "genesis-evaluation-binding/v1", purpose: "isolated-evaluation-admission", candidate_id: prepared.candidate_id,
    reviewers: ["synthetic-reviewer-a", "synthetic-reviewer-b"], decisions: ["a", "b"].map((suffix, index) => ({
      reviewer: `synthetic-reviewer-${suffix}`, decision_id: `sha256:${suffix.repeat(64)}`, purpose: "isolated-evaluation-admission", candidate_id: prepared.candidate_id, verdict: "PASS",
      entries: [{ key: "entry", contract, result, inputs: inputsId, criteria: OWNERSHIP_ADMISSION_CRITERIA.map((criterion) => ({ id: criterion, verdict: "PASS" })) }],
      request_ref: { payload_path: `requests/${index}.txt`, sha256: "c".repeat(64) }, response_ref: { payload_path: `responses/${index}.txt`, sha256: suffix.repeat(64) },
    })) }
  return { prepared, binding }
}

describe("evaluation boundaries, synthetic CI only", () => {
  it("enforces the phase at the direct assembler entry, before creating any legs", () => {
    const f = policyFixture()
    const config = { repoPath: f.root, casPath: join(f.root, ".atlas/cas"), scipPath: join(f.root, ".atlas/index.scip"),
      seams: { heuristic: { isCandidate: () => false }, gate: { gateHolds: () => "HOLDS" as const },
        classifier: { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) }, driftFacts: [], resolveAnchorAt: () => undefined } }
    expect(() => assembleHandler(config)).toThrow("evaluation-operational-composition-refused")
    f.policy.operations = ["read", "index"]; f.save()
    const evaluation = loadEvaluationAccess(f.root)
    const handler = assembleHandler({ ...config, evaluation })
    const composed = composeRuntime(f.root, evaluation)
    expect(() => composed.promote).toThrow("evaluation-operation-denied")
    expect(() => composed.transition).toThrow("evaluation-operation-denied")
    expect(() => composed.testVacuity).toThrow("evaluation-operation-denied")
    expect(() => composed.anchors).toThrow("evaluation-operation-denied")
    expect(Object.getOwnPropertyDescriptor(composed, "anchors")).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(composed, "promote")).toBeUndefined()
    const descriptors = Object.getOwnPropertyDescriptors(composed)
    expect(Object.keys(descriptors).sort()).toEqual(["check", "handler", "ownership"])
    expect(Object.getPrototypeOf(composed)).toBeNull()
    const reflectedCheck = descriptors.check!.get!.call(composed) as (...args: unknown[]) => unknown
    expect(() => reflectedCheck({ kind: "advisory" }, id({ at: "reflection" }))).toThrow("evaluation-policy-drift-or-denied")

    expect(handler.handle("atlas-link", { a: "a", b: "b" }).ok).toBe(false)
    expect(handler.handle("atlas-query", { scope: "test.scope" }).ok).toBe(false)
    const emit = createGovernedEmit({ store: createDiskStore(config.casPath), gate: config.seams.gate, policy: defaultPolicy(), actor: "fixture-operator", evaluation })
    for (const kind of ["negation", "transition", "test-vacuity"])
      expect(emit.emit({ kind } as GroundedFact, id({ at: "synthetic" }))).toEqual({ emitted: false, rejected: "evaluation-operation-denied" })
  })

  it("detects simulated kernel code drift outside adapter and knowledge", () => {
    const before = evaluationRuntimeIdentity()
    try {
      simulatedRuntimeDrift.path = createRequire(import.meta.url).resolve("@atlas/kernel")
      expect(evaluationRuntimeIdentity()).not.toEqual(before)
    } finally { simulatedRuntimeDrift.path = "" }
  })

  it("binds mandatory runtime packages beyond adapter/knowledge and their dependency manifests", () => {
    const identity = evaluationRuntimeIdentity()
    for (const name of evaluationRuntimePackages) {
      expect(identity[`${name}/package.json`]).toMatch(/^[0-9a-f]{64}$/)
      expect(Object.keys(identity).some((key) => key.startsWith(`${name}/`) && key !== `${name}/package.json`)).toBe(true)
    }
    expect(identity["runtime/engine"]).toMatch(/^[0-9a-f]{64}$/)
  })

  it("reads only bounded internal state names without allowing state as package input", () => {
    const f = policyFixture()
    expect(new TextDecoder().decode(readEvaluationStateFile(f.root, "evaluation-store.json"))).toBe(JSON.stringify(f.marker))
    expect(() => nativePath(".atlas/evaluation-store.json")).toThrow("native-path")
    for (const name of ["../evaluation-store.json", ".atlas/evaluation-store.json", "policy.json", "evaluation-budget-xyz.json", "/evaluation-store.json"])
      expect(() => readEvaluationStateFile(f.root, name)).toThrow("evaluation-state-name")
    writeFileSync(join(f.root, ".atlas/evaluation-policy.json"), "x".repeat(16385))
    expect(() => readEvaluationStateFile(f.root, "evaluation-policy.json")).toThrow("native-file-limit")
  })

  it("refuses a symlink or hardlink internal state file before reading it", () => {
    const f = policyFixture(), file = join(f.root, ".atlas/evaluation-policy.json")
    rmSync(file)
    symlinkSync(join(f.root, ".atlas/evaluation-store.json"), file)
    expect(() => readEvaluationStateFile(f.root, "evaluation-policy.json")).toThrow("evaluation-state-alias")
    rmSync(file)
    linkSync(join(f.root, ".atlas/evaluation-store.json"), file)
    expect(() => readEvaluationStateFile(f.root, "evaluation-policy.json")).toThrow("evaluation-state-alias")
  })

  it("rejects unknown policy keys and unknown versions", () => {
    const f = policyFixture()
    writeFileSync(join(f.root, ".atlas/evaluation-policy.json"), JSON.stringify({ ...f.policy, allowProduction: true }))
    expect(() => loadEvaluationAccess(f.root)).toThrow("native-fields")
    writeFileSync(join(f.root, ".atlas/evaluation-policy.json"), JSON.stringify({ ...f.policy, schema: "ownership-evaluation-policy/v999" }))
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-policy-version")
  })

  it("rejects incorrect root identity even when policy repeats it", () => {
    const f = policyFixture()
    f.marker.inode += 1
    f.save()
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-root-identity")
  })

  it("rejects mutable state hardlinks", () => {
    const f = policyFixture()
    linkSync(join(f.root, ".atlas/evaluation-policy.json"), join(f.root, ".atlas/policy-alias.json"))
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-state-alias")
  })

  it("rejects a scope wildcard, wrong actor and operational permission", () => {
    const f = policyFixture()
    f.marker.scope = "*"; f.policy.scope = "*"; f.save()
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-policy-actor-scope")
    f.marker.scope = "test.scope"; f.policy.scope = "test.scope"; f.save()
    process.env.ATLAS_ACTOR = "not-the-fixture-operator"
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-policy-actor-scope")
    process.env.ATLAS_ACTOR = f.policy.actor
    f.policy.operations.push("production-activate"); f.save()
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-policy-operations")
  })

  it("refuses default composition with an evaluation marker before any operational read", () => {
    const f = policyFixture()
    expect(() => assertEvaluationComposition(f.root)).toThrow("evaluation-operational-composition-refused")
    expect(() => composeRuntime(f.root)).toThrow("evaluation-operational-composition-refused")
  })

  it("cannot manufacture an issued composition context by matching fields", () => {
    const f = policyFixture()
    const issued = loadEvaluationAccess(f.root)
    expect(() => assertEvaluationComposition(f.root, { ...issued })).toThrow("evaluation-unverified-context")
  })

  it("rechecks policy content and operation permission on each capability use", () => {
    const f = policyFixture()
    const access = loadEvaluationAccess(f.root)
    expect(() => access.assert("read")).not.toThrow()
    expect(() => access.assert("evaluation-maintenance")).toThrow("evaluation-policy-drift-or-denied")
    f.policy.operations = ["read"]; f.save()
    expect(() => access.assert("read")).toThrow("evaluation-policy-drift-or-denied")
  })

  it("filters raw ownership CAS and evaluation carrier claims from generic reads", () => {
    const root = temporaryRoot(), store = createDiskStore(join(root, ".atlas/cas"))
    const body = store.put({ kind: "ownership-body", version: 1, bytes: [115, 101, 99, 114, 101, 116] })
    const carrier = store.put({ kind: "advisory", claimNorm: "Evaluation-only ownership manifest for test.scope: synthetic", grounding: { entries: [] } })
    expect(genericOwnershipVisible(store.get(body))).toBe(false)
    expect(genericOwnershipVisible(store.get(carrier))).toBe(false)
    const filtered = phaseFilteredStore(store)
    expect(filtered.get(body)).toBeUndefined()
    expect(filtered.get(carrier)).toBeUndefined()
    expect(store.get(body)).toBeDefined() // bytes retained, not deleted as a substitute for authority checks
  })

  it("direct composed node lookup does not leak raw ownership CAS by content address", () => {
    const root = temporaryRoot(), store = createDiskStore(join(root, ".atlas/cas"))
    const body = store.put({ kind: "ownership-body", version: 1, bytes: [...new TextEncoder().encode("PRIVATE-EVALUATION-CANARY")] })
    const runtime = composeRuntime(root)
    const result = runtime.handler.resolveNode(asNodeKey(body), "cli")
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain("PRIVATE-EVALUATION-CANARY")
    expect(JSON.stringify(result)).not.toContain('"bytes"')
  })

  it("operational attachment refuses evaluation claims even without an ownership field", () => {
    const root = temporaryRoot(), store = createDiskStore(join(root, ".atlas/cas"))
    const node: GroundedFact = { kind: "advisory", id: asNodeKey("synthetic"), tier: "T2", scope: "test.scope", predicateSlot: "ownership",
      claimNorm: "Evaluation-only ownership manifest for test.scope: synthetic", grounding: { entries: [] }, freshness: "FRESH", claims: [], authoring: "ADVISORY" }
    expect(ownershipAttachmentRefusal(node, store, () => "v1")).toBe("evaluation-operational-attachment-refused")
  })

  it("legacy rebuild explicitly refuses v2 instead of downgrading receipts", () => {
    const store = createStore(), manifest = store.put({ kind: "ownership-manifest", version: 2 })
    const result = rebuildOwnershipUpdate({ store, manifest, scope: "test.scope", observe: () => ({ kind: "unavailable" }),
      readCapturedBytes: () => undefined, listMembers: () => [], recipes: new Map(), contract: id({ contract: "synthetic" }),
      evaluate: () => { throw new Error("must not evaluate legacy path") } })
    expect(result).toMatchObject({ kind: "hold", reason: "ownership-phase" })
  })

  it("checks a synthetic exact two-decision binding without granting runtime authority", () => {
    const f = bindingFixture()
    expect(validateEvaluationBinding(f.binding, f.prepared)).toBe(f.binding)
  })

  it("rejects zero, one and duplicate decision/reviewer sets", () => {
    const f = bindingFixture()
    for (const binding of [{ ...f.binding, decisions: [] }, { ...f.binding, decisions: f.binding.decisions.slice(0, 1) },
      { ...f.binding, reviewers: [f.binding.reviewers[0]!, f.binding.reviewers[0]!] },
      { ...f.binding, decisions: [f.binding.decisions[0]!, f.binding.decisions[0]!] }]) {
      expect(() => validateEvaluationBinding(binding, f.prepared)).toThrow()
    }
  })

  it("rejects stale candidate, omitted entries, altered contract/input/result and operational criterion PASS", () => {
    const f = bindingFixture(), first = f.binding.decisions[0]!, entry = first.entries[0]!
    const entries = [[], [{ ...entry, contract: "d".repeat(64) }], [{ ...entry, inputs: "d".repeat(64) }],
      [{ ...entry, result: "d".repeat(64) }], [{ ...entry, criteria: [{ id: "AC-02", verdict: "PASS" }] }]]
    expect(() => validateEvaluationBinding({ ...f.binding, candidate_id: "e".repeat(64) }, f.prepared)).toThrow("evaluation-binding-identity")
    for (const changed of entries) expect(() => validateEvaluationBinding({ ...f.binding, decisions: [{ ...first, entries: changed }, f.binding.decisions[1]!] }, f.prepared)).toThrow()
  })

  it("rejects HOLD or copied provenance as new binding decisions", () => {
    const f = bindingFixture(), first = f.binding.decisions[0]!, second = f.binding.decisions[1]!
    expect(() => validateEvaluationBinding({ ...f.binding, decisions: [{ ...first, verdict: "HOLD" }, second] }, f.prepared)).toThrow("evaluation-binding-decision")
    expect(() => validateEvaluationBinding({ ...f.binding, decisions: [first, { ...second, decision_id: first.decision_id, response_ref: first.response_ref }] }, f.prepared)).toThrow("evaluation-binding-provenance")
  })

  it("enforces a durable finite budget across new capability instances", () => {
    const f = policyFixture()
    loadEvaluationAccess(f.root).charge("read")
    loadEvaluationAccess(f.root).charge("read")
    expect(() => loadEvaluationAccess(f.root).charge("read")).toThrow("evaluation-budget-exhausted")
    loadEvaluationAccess(f.root).charge("body", 16)
    expect(() => loadEvaluationAccess(f.root).charge("body", 1)).toThrow("evaluation-budget-exhausted")
  })

  it("budget lock contention refuses without retry and invalid byte counts refuse", () => {
    const root = temporaryRoot(), candidate = "a".repeat(64), generation = "b".repeat(64)
    const consumer = { id: "case", mode: "routine", limits: { read_calls: 1, index_calls: 1, body_bytes_total: 8 } }
    const key = id({ candidate, generation, consumer: consumer.id, mode: consumer.mode })
    mkdirSync(join(root, ".atlas", `evaluation-budget-${key}.json.lock`))
    expect(() => chargeEvaluationRead(root, candidate, generation, consumer, "read")).toThrow()
    rmSync(join(root, ".atlas", `evaluation-budget-${key}.json.lock`), { recursive: true })
    expect(() => chargeEvaluationRead(root, candidate, generation, consumer, "body", -1)).toThrow("evaluation-budget-bytes")
  })

})

it("OKF rejects copied evaluation object before any destination writes", () => {
  const root = mkdtempSync(join(tmpdir(), "evaluation-okf-"))
  try {
    const source = createDiskStore(join(root, "source", ".atlas", "cas"))
    const ordinary = { kind: "legacy-fixture", value: "ordinary" }
    const evaluation = { kind: "ownership-artifact", version: 2, evaluation: { phase: "evaluation" } }
    const a = source.put(ordinary), b = source.put(evaluation)
    const target = join(root, "target", ".atlas", "cas")
    const cas: Cas = new Map(); cas.set(a, ordinary); cas.set(b, evaluation)
    expect(() => writeCasObjects(cas, target)).toThrow("evaluation-operational-import-refused")
    expect(existsSync(target)).toBe(false)
    expect(() => readCas(join(root, "source", ".atlas", "cas"))).toThrow("evaluation-operational-export-refused")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it("OKF preserves v1 ownership bytes and ordinary store replay", () => {
  const root = mkdtempSync(join(tmpdir(), "legacy-okf-"))
  try {
    const store = createDiskStore(join(root, "a", ".atlas", "cas"))
    store.put({ kind: "ownership-knowledge", version: 1, body: "legacy body" })
    const cas = readCas(join(root, "a", ".atlas", "cas"))
    expect(writeCasObjects(cas, join(root, "b", ".atlas", "cas"))).toBe(cas.size)
    expect(sameCas(cas, readCas(join(root, "b", ".atlas", "cas")))).toBe(true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it("surface rejects copied evaluation CAS and cached StoreFiles after marker creation", () => {
  const root = mkdtempSync(join(tmpdir(), "evaluation-surface-"))
  try {
    const atlas = join(root, ".atlas"), cas = join(atlas, "cas")
    mkdirSync(cas, { recursive: true })
    const files = readStoreFiles(root)
    const surface = openSurface(root)
    writeFileSync(join(atlas, "evaluation-store.json"), "{}")
    expect(() => surface.snapshot()).toThrow("evaluation-operational-cas-refused")
    expect(() => readReasoning(files, "123456789abc")).toThrow("evaluation-operational-cas-refused")
    rmSync(join(atlas, "evaluation-store.json"))
    createDiskStore(cas).put({ kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation" })
    expect(() => openSurface(root)).toThrow("evaluation-operational-export-refused")
    expect(() => pendingFacts(files)).toThrow("evaluation-operational-export-refused")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it("surface refuses copied claim carrier even without CAS object or store marker", () => {
  const root = mkdtempSync(join(tmpdir(), "evaluation-carrier-"))
  try {
    const atlas = join(root, ".atlas")
    mkdirSync(atlas)
    writeFileSync(join(atlas, "projection.json"), JSON.stringify({current:[["x", { contentHash: asHash("a".repeat(64)), claims:["Evaluation-only ownership manifest for scope"] }]],cas:[]}))
    expect(() => readStoreFiles(root)).toThrow("evaluation-operational-surface-refused")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it("direct memory door rejects initialized evaluation root without projection and after restart", () => {
  const root = mkdtempSync(join(tmpdir(), "memory-phase-"))
  try {
    const atlas = join(root, ".atlas")
    mkdirSync(join(atlas, "cas"), { recursive: true })
    writeFileSync(join(atlas, "evaluation-store.json"), "{}")
    let scanned = false
    for (let restart = 0; restart < 2; restart++) {
      const store = createDurableMemory(root)
      const door = createMemoryEmit({store, actor:"seat", scanner:{name:"synthetic-clean",scan:()=>{scanned=true;return false}}})
      expect(door.emit({rule:"Keep scope explicit",scope:"project",frecency:1})).toMatchObject({ok:false,refusal:"evaluation-phase"})
    }
    expect(scanned).toBe(false)
    expect(existsSync(join(atlas,"members"))).toBe(false)
    expect(existsSync(join(atlas,"projection.json"))).toBe(false)
  } finally { rmSync(root,{recursive:true,force:true}) }
})

it("cached memory door rechecks marker after scanner and writes no log", () => {
  const root = mkdtempSync(join(tmpdir(), "memory-phase-change-"))
  try {
    const atlas = join(root,".atlas")
    mkdirSync(atlas)
    const store = createDurableMemory(root)
    const door = createMemoryEmit({store,actor:"seat",scanner:{name:"synthetic-clean",scan:()=>{writeFileSync(join(atlas,"evaluation-store.json"),"{}");return false}}})
    expect(door.emit({rule:"Keep scope explicit",scope:"project",frecency:1})).toMatchObject({ok:false,refusal:"evaluation-phase"})
    expect(existsSync(join(atlas,"members"))).toBe(false)
  } finally { rmSync(root,{recursive:true,force:true}) }
})
// Also integrate using existing valid fixture record/channel/binding:
// - createDurableMemory(root).append(record) directly refuses before append, even with empty CAS/projection.
// - createDurableOrientation(root).append(channel,label) refuses, no orientation log.
// - proposeProjectRule(binding,validEntry,at) => evaluation-phase before scan/review append.
// - decideProjectRule(binding,{proposalId,verdict:'discarded',by},at) => evaluation-phase; review unchanged.
// - ordinary unmarked memory positive emit/read restart remains unchanged.
// - symlink members directory resolving into marked .atlas is refused by emit's realpath guard.

it("public writers refuse initialized evaluation store before payload parsing or mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "public-writers-phase-"))
  try {
    const atlas = join(root, ".atlas")
    mkdirSync(join(atlas,"cas"), {recursive:true})
    const marker = join(atlas,"evaluation-store.json")
    writeFileSync(marker,"{}\n")
    for (let restart = 0; restart < 2; restart++) {
      const calls = [
        () => exportContext(root,"seat","session",undefined as never,{commit:true,at:"2026-11-13"}),
        () => appendReview(root,undefined as never),
        () => appendCardEvent(root,"card",undefined as never,{redact:false}),
        () => appendAttempt(root,"card",1,undefined as never,{redact:false,at:"2026-11-13"}),
        () => appendBoardEvent(root,undefined as never,{redact:false}),
        () => appendMilestone(root,{card:"card",pr:1}),
      ]
      for (const call of calls) expect(call).toThrow("evaluation-operational-store-refused")
      expect(declareTerritory(root,undefined as never)).toEqual({ok:false,reason:"evaluation-operational-store-refused"})
      expect(appendLogbookEntry(root,undefined as never,{redact:false})).toEqual({valid:false,reasons:["evaluation-operational-store-refused"]})
      expect(readdirSync(root)).toEqual([".atlas"])
      expect(readdirSync(atlas).sort()).toEqual(["cas","evaluation-store.json"])
      expect(readdirSync(join(atlas,"cas"))).toEqual([])
      expect(readFileSync(marker,"utf8")).toBe("{}\n")
    }
  } finally { rmSync(root,{recursive:true,force:true}) }
})
// Repeat with only evaluation-policy.json, malformed/dangling marker, and a canonical-path alias.
// Required complementary CI controls: ordinary unmarked roots + existing valid fixtures remain writable;
// compare all bytes before/after refusal and repeat factories after a real process restart.
