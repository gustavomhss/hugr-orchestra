// Remote-only, explicit zero-budget reconstruction: real pinned history/index, never a model or staging replay.
import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const [revision, sourceRoot, output] = process.argv.slice(2)
assert(process.argv.length === 5 && /^[0-9a-f]{40}$/.test(revision), "reconstruct-plan: immutable source revision required")
assert(process.env.RUNNER_TEMP && resolve(output).startsWith(`${resolve(process.env.RUNNER_TEMP)}/`),
  "reconstruct-plan: evidence must be under runner temp")
const { createHistorySource, createSkeletonSource, headSha, initAst, readScip } =
  await import("../../modules/atlas/packages/adapter-io/dist/src/index.js")
const { driveMinePass } = await import("../../modules/atlas/packages/cli/dist/src/mine.js")
await initAst()
assert.equal(headSha(sourceRoot), revision, "reconstruct-plan: checkout HEAD must equal the failed source revision")
const documents = readScip(resolve(sourceRoot, ".atlas/index.scip")).documents
assert(documents.length > 0, "reconstruct-plan: restored index documents are required")
// A historical fallback would ignore SCIP. Trap it instead of accepting a different ranking experiment.
const skeleton = createSkeletonSource(sourceRoot, { revIndex: { axesAt: () => {
  throw new Error("reconstruct-plan: historical files-only fallback is forbidden")
} } })
const indexedEdges = skeleton.skeleton(sourceRoot, revision).axes.edges.length
assert(indexedEdges > 0, "reconstruct-plan: the consumed skeleton must contain SCIP dependency edges")
assert.throws(() => skeleton.skeleton(sourceRoot, "historical-fallback-positive-control"),
  /historical files-only fallback is forbidden/)
let entered = 0
const pass = driveMinePass(sourceRoot, {
  rev: revision, slot: "advisory", budget: { ceiling: 0 },
  env: { PATH: process.env.PATH, HOME: process.env.RUNNER_TEMP, XDG_CONFIG_HOME: process.env.RUNNER_TEMP,
    ATLAS_MINE_PROGRESS: "1", ATLAS_MINE_EVIDENCE_DIR: output },
  history: createHistorySource(sourceRoot, revision), skeleton,
  proposer: { propose: () => { entered++; throw new Error("reconstruct-plan must never call a proposer") } },
})
assert.equal(entered, 0, "reconstruct-plan: proposer entry is forbidden")
assert.equal(pass.report.modelCalls, 0)
assert.equal(pass.report.llmCalls, 0)
assert.equal(pass.report.budgetSpent, 0)
assert.equal(pass.report.seeded.length, 0)
const plan = JSON.parse(readFileSync(resolve(output, "plan-advisory.json"), "utf8"))
assert.equal(plan.revisionSelector, revision)
assert(Array.isArray(plan.sites) && plan.sites.length >= 3, "reconstruct-plan: missing ranked frontier")
assert.equal(pass.report.coverage?.planned, plan.sites.length)
assert(pass.report.coverage.sites.every((row) => row.outcome === "unvisited" && row.cause === "ceiling"))
writeFileSync(resolve(output, "reconstruction.json"), JSON.stringify({ sourceRevision: revision,
  planned: plan.sites.length, indexedDocuments: documents.length, indexedEdges,
  modelCalls: pass.report.modelCalls, proposerEntries: entered,
  firstThree: plan.sites.slice(0, 3) }) + "\n", { flag: "wx", mode: 0o600 })
console.log(`reconstruct-plan: ${plan.sites.length} real ranked sites; zero proposer entries, model calls and writes`)
