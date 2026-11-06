// Bounded contributor recipe. No model calls, second store, policy creation or automatic ratifier.
// Run with Bun; the host supplies an isolated repo, existing policy and explicit environment credentials.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { asNodeKey, id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { OwnershipArtifact, OwnershipInput, OwnershipManifest, OwnershipReceipt, OwnershipResult, OwnershipReview } from "@atlas/knowledge"
import { build } from "@atlas/index"
import { composeRuntime } from "../packages/adapter-io/src/compose.js"
import { isContainedIn } from "../packages/adapter-io/src/containment.js"
import { walkFileTree } from "../packages/adapter-io/src/fs.js"
import { ownershipClaim } from "../packages/adapter-io/src/ownership-access.js"
import { ownershipInput } from "../packages/adapter-io/src/ownership-input.js"
import { readScipOrEmpty } from "../packages/adapter-io/src/scip.js"
import { createDiskStore } from "../packages/adapter-io/src/store.js"

type Output = { file: string; bodySha256: string; inputs?: { path: string; receipt?: string; sha256?: string }[] }
type Nav = { handle: string; path: string; sha256: string }
type Candidate = {
  kind: "ownership-pilot-candidate"; version: 1; scope: string; baseline: string; contract: Hash
  entries: { key: string; artifact: Omit<OwnershipArtifact, "receipt">; inputs: readonly OwnershipInput[]; dependencies: OwnershipReceipt["dependencies"] }[]
  roots: OwnershipManifest["roots"]
}

const repo = resolve(Bun.argv[3] ?? "")
const mode = Bun.argv[2]
if (!Bun.argv[3] || !["prepare", "publish", "read", "index"].includes(mode ?? ""))
  throw new Error("Usage: ownership-pilot.ts prepare|publish|read|index <isolated-repo> <research-root|approval-file|query-json>")
const store = createDiskStore(join(repo, ".atlas", "cas"))
const current = (key: string) => ownershipInput(repo, key)
const candidatePath = join(repo, ".atlas", "ownership-pilot-candidate.json")
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const load = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T
const bind = (keys: readonly string[]) => [...new Set(keys)].map((key) => {
  const version = current(key)
  if (version === undefined) throw new Error(`ownership-input-unavailable: ${key}`)
  return { key, version }
})

if (mode === "prepare") {
  const research = resolve(Bun.argv[4] ?? "")
  const read = (path: string) => {
    const absolute = resolve(research, path)
    if (!isContainedIn(research, absolute)) throw new Error(`research path outside export: ${path}`)
    return readFileSync(absolute)
  }
  const json = <T>(path: string): T => JSON.parse(read(path).toString("utf8")) as T
  const freeze = json<{ sourceRevision: string; sources: { path: string; sourceSha256: string }[] }>("layer-1/source-freeze-v1.json")
  const supplement = json<{ sources: { path: string; sourceSha256: string }[] }>("layer-4-sol/operational-supplement-v1.manifest.json")
  const sources = [...new Map([...freeze.sources, ...supplement.sources].map((source) => [source.path, source])).values()]
  sources.forEach((source) => {
    if (current(`file:${source.path}`) === undefined || sha(readFileSync(join(repo, source.path))) !== source.sourceSha256)
      throw new Error(`accepted-source-drift: ${source.path}`)
  })
  const recipe = readFileSync(import.meta.path)
  if (sha(readFileSync(join(repo, "ownership-pilot-recipe.ts"))) !== sha(recipe))
    throw new Error("pilot recipe copy differs from executing recipe")
  const common = ["file:ownership-pilot-recipe.ts", "members:packages/core/src/session"]
  const criteria = ["runtime-import-binding"]
  const contract = store.put({ kind: "ownership-contract", version: 1, criteria })
  const candidate: Candidate = {
    kind: "ownership-pilot-candidate", version: 1, scope: "session-input", baseline: freeze.sourceRevision, contract,
    entries: [], roots: { entry: "L4:entry", ownership: "L4:ownership", maintenance: "L4:maintenance", operational: "L4:operational", flow: "L3:integrated-flow", component: "L2:component-admission", evidence: "L1:authority" },
  }
  const add = (key: string, path: string, expected: string, layer: OwnershipArtifact["layer"], need: OwnershipArtifact["need"], inputs: readonly string[], dependencyKeys: readonly string[], navigation: readonly string[], acceptance: string) => {
    const bytes = read(path)
    if (sha(bytes) !== expected) throw new Error(`accepted-body-drift: ${path}`)
    const result: OwnershipResult = {
      kind: "ownership-result", version: 1, body: store.put({ kind: "ownership-body", version: 1, bytes: Array.from(bytes) }),
      authority: { scope: candidate.scope, basis: `bounded research only; ${acceptance}; runtime binding needs a NEW approval` },
      validity: "supported", gaps: ["Not repository-wide ownership or execution-host/crash-recovery coverage"], evidence: [path, `sha256:${expected}`, `baseline:${candidate.baseline}`, acceptance],
    }
    const dependencies = dependencyKeys.map((dependency) => {
      const found = candidate.entries.find((entry) => entry.key === dependency)
      if (!found) throw new Error(`missing required predecessor: ${dependency}`)
      return { key: dependency, result: found.artifact.result }
    })
    candidate.entries.push({ key, artifact: { kind: "ownership-artifact", version: 1, key, scope: candidate.scope, title: key, layer, need, result: store.put(result), navigation }, inputs: bind([...common, ...inputs]), dependencies })
  }
  const l1 = json<{ outputs: Output[] }>("layer-1/L1-review-manifest-v3.json")
  const keys = ["L1:authority", "L1:entry-execution", "L1:identity", "L1:promotion-reuse"]
  l1.outputs.forEach((output, index) => {
    const inputs = (output.inputs ?? sources).map((source) => {
      if (!source.path.startsWith("/")) {
        if (!sources.some((known) => known.path === source.path) &&
          (!("sha256" in source) || current(`file:${source.path}`) === undefined || sha(readFileSync(join(repo, source.path))) !== source.sha256))
          throw new Error(`historical metadata drift: ${source.path}`)
        return `file:${source.path}`
      }
      if (!("receipt" in source) || source.receipt !== "historical-scoped-reconciliation")
        throw new Error(`unsupported external evidence relocation: ${source.path}`)
      const bytes = read("layer-1/historical-scoped-reconciliation.json")
      if (sha(bytes) !== source.sha256) throw new Error("historical evidence relocation digest mismatch")
      mkdirSync(join(repo, "pilot-evidence"), { recursive: true })
      writeFileSync(join(repo, "pilot-evidence", "historical-scoped-reconciliation.json"), bytes)
      return "file:pilot-evidence/historical-scoped-reconciliation.json"
    })
    add(keys[index]!, `layer-1/${output.file}`, output.bodySha256, 1, "evidence", inputs, [], [], "f92380d8f484b3bffe83e7e2c13e922e46d3a9aa62ac7f5b6264bf22cbef1d85")
  })
  const nav = json<{ entries: Nav[] }>("layer-4-sol/navigation.json").entries
  const navPath = (entry: Nav) => entry.path.replace(/^modules\/atlas\/docs\/design\/genesis-ownership-results\//, "")
  const l2 = nav.filter((entry) => entry.handle.startsWith("L2:"))
  l2.forEach((entry) => add(entry.handle, navPath(entry), entry.sha256, 2, "component", [], keys, [], "d6ab29da4eccd7283a4d4a40ece0a719b7f932bc64098d4a065e19b5914a4cce"))
  const l3 = nav.filter((entry) => entry.handle.startsWith("L3:"))
  l3.forEach((entry) => add(entry.handle, navPath(entry), entry.sha256, 3, "flow", [], l2.map((entry) => entry.handle), keys, "ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d"))
  const op = nav.find((entry) => entry.handle === "L3-supplement:operational-interface")
  if (!op || l1.outputs.length !== 4 || l2.length !== 4 || l3.length !== 4) throw new Error("incomplete accepted pilot navigation")
  add(op.handle, navPath(op), op.sha256, 3, "evidence", supplement.sources.map((source) => `file:${source.path}`), [], [], "111a3fdcd25b1679dafd624b84c8c750c95b666e9aea87e5b0829f348899bf48")
  const l4 = json<{ outputs: (Output & { seat: string })[] }>("layer-4-sol/L4-sol-review-manifest-v2.json")
  l4.outputs.forEach((output) => {
    if (!["entry", "ownership", "maintenance", "operational"].includes(output.seat)) throw new Error("unknown L4 seat")
    const need = output.seat as "entry" | "ownership" | "maintenance" | "operational"
    add(`L4:${need}`, `layer-4-sol/${output.file}`, output.bodySha256, 4, need, [], [...l3.map((entry) => entry.handle), ...(need === "operational" ? [op.handle] : [])], nav.map((entry) => entry.handle), "02a230276d5e6f484242c6f2b83b8f6e83ec962a781015388c141451b1389cb4")
  })
  if (l4.outputs.length !== 4) throw new Error("incomplete L4 corpus")
  // Source path citations are readable evidence too; they are not exposed as a raw filesystem escape hatch.
  writeFileSync(candidatePath, JSON.stringify(candidate, null, 2) + "\n", { flag: "wx" })
  console.log(JSON.stringify({ kind: "unpublished-candidate", manifestID: id(candidate), candidate, limitation: "conservative full-predecessor dependencies; no claim of minimal semantic invalidation" }))
}

if (mode === "publish") {
  const candidate = load<Candidate>(candidatePath)
  const approvalBytes = readFileSync(Bun.argv[4]!)
  const approvals = JSON.parse(approvalBytes.toString("utf8")) as { sessionID: string; messageID: string; manifestID: string; verdict: string; criteria: { id: string; verdict: string }[] }[]
  const reviewers = ["ses_e528fd6ffffekMvs6EMxxspiWI", "ses_e528fcc3cffe2Z5cb1QzbTWQPQ"]
  if (approvals.length !== 2 || !reviewers.every((reviewer) => approvals.some((approval) => approval.sessionID === reviewer)) || approvals.some((approval) => approval.manifestID !== id(candidate) || approval.verdict !== "PASS" || !approval.messageID || !approval.criteria.some((criterion) => criterion.id === "runtime-import-binding" && criterion.verdict === "PASS")))
    throw new Error("missing exact new runtime-binding approvals; research decisions cannot substitute")
  const provenance = store.put({ kind: "ownership-body", version: 1, bytes: Array.from(approvalBytes) })
  const entries = candidate.entries.map((entry) => {
    const inputs = id({ inputs: entry.inputs, dependencies: entry.dependencies })
    const reviews = approvals.map((approval) => {
      const review: OwnershipReview = { kind: "ownership-review", version: 1, reviewer: approval.sessionID, contract: candidate.contract, inputs, result: entry.artifact.result, criteria: ["runtime-import-binding"], verdict: "pass", provenance: `NEW runtime binding approval ${approval.messageID}; exact candidate ${id(candidate)}; preserved approvals ${provenance}; lead record adapter, not original producer text` }
      return store.put(review)
    })
    const receipt: OwnershipReceipt = { kind: "ownership-receipt", version: 1, contract: candidate.contract, inputs: entry.inputs, dependencies: entry.dependencies, reviews }
    return { key: entry.key, artifact: store.put({ ...entry.artifact, receipt: store.put(receipt) }) }
  })
  const manifest: OwnershipManifest = { kind: "ownership-manifest", version: 1, scope: candidate.scope, entries, roots: candidate.roots }
  const ownership = store.put(manifest)
  const axes = build(walkFileTree(repo), readScipOrEmpty(join(repo, ".atlas", "index.scip")))
  const node = {
    kind: "advisory" as const, id: asNodeKey(String(id({ ownership }))), tier: "T2" as const, scope: candidate.scope,
    claimNorm: ownershipClaim(candidate.scope), predicateSlot: "ownership" as const, ownership,
    grounding: { entries: [{ anchor: { kind: "repo" as const, qualifiedPath: axes.spatial.key, subtreeHash: axes.spatial.subtreeHash }, path: "." }] },
    freshness: "FRESH" as const, claims: [], authoring: "ADVISORY" as const,
  }
  const runtime = composeRuntime(repo)
  const check = runtime.check(node, id({ baseline: candidate.baseline }))
  if (!check.wouldEmit) throw new Error(JSON.stringify(check))
  console.log(JSON.stringify({ manifestID: id(candidate), ownership, verdict: runtime.handler.handle("atlas-emit", { node, at: id({ baseline: candidate.baseline }) }) }))
}

if (mode === "read" || mode === "index") {
  const request = JSON.parse(Bun.argv[4] ?? "{}")
  const runtime = composeRuntime(repo)
  console.log(JSON.stringify(mode === "read" ? runtime.ownership.read(request) : runtime.ownership.index(request.scope, request.need)))
}
