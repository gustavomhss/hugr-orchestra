import { afterEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore, ModelCommandError } from "@atlas/adapter-io"
import { makeRunController } from "@atlas/genesis"
import type { Candidate, Fact, GenesisReport, HistorySource, SiteProposer } from "@atlas/genesis"
import { asHash } from "@atlas/kernel"
import { buildControllerDeps, driveMinePass } from "../src/mine.js"
import type { MineDeps } from "../src/mine.js"
import { depsOf, factFor, FRONTIER, injectedHistory, NO_MODEL_ENV, readStaging, ZERO_SIGNALS } from "./mine-fixtures.js"

// Inert disclosure markers, not credentials. None belongs in either evidence projection.
const privateText = {
  history: "private-history-message-for-evidence-probe",
  owner: "private-owner-for-evidence-probe",
  claim: "private-model-claim-for-evidence-probe",
  answer: "private-answer-envelope-for-evidence-probe",
  prompt: "private-prompt-for-evidence-probe",
  fault: "private-stderr-for-evidence-probe",
  whyNot: "private-abstention-reason-for-evidence-probe",
  model: "private-model-command-for-evidence-probe",
}
const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-mine-failure-evidence-"))
  dirs.push(root)
  const evidence = join(root, "operator-evidence")
  mkdirSync(evidence)
  const reads: string[] = []
  const history: HistorySource = { ...injectedHistory, signals: (site) => {
    reads.push(site.qualifiedPath)
    return { ...ZERO_SIGNALS, owners: [privateText.owner], messages: [privateText.history] }
  } }
  return { root, evidence, reads, history, store: createDiskStore(join(root, ".atlas", "cas")) }
}

function options(f: ReturnType<typeof fixture>, proposer: SiteProposer, ceiling = 4): MineDeps {
  return {
    ...depsOf({ history: f.history, store: f.store, proposer, budget: { ceiling }, gate: {
      emit: (seed, cand) => {
        const fact = { ...factFor(cand, seed.claim), ...(seed.rawAnswer !== undefined ? { rawAnswer: seed.rawAnswer } : {}) }
        return { emitted: true, fact }
      },
    } }),
    frontier: {},
    env: { ...NO_MODEL_ENV, ATLAS_MINE_EVIDENCE_DIR: f.evidence },
  }
}

// Only allowlisted projections: no ranking/scoring, counter reconstruction, or error rendering here.
function planProjection(sites: readonly Candidate[], arm = "advisory") {
  return { schemaVersion: 1, arm, revisionSelector: "HEAD", sites: sites.map((cand) => ({
    rank: cand.rank, ppr: cand.ppr, kind: cand.site.kind,
    path: cand.site.qualifiedPath, subtreeHash: cand.site.subtreeHash,
  })) }
}

function reportProjection(report: GenesisReport, arm = "advisory") {
  return {
    schemaVersion: 1, arm, llmCalls: report.llmCalls, modelCalls: report.modelCalls,
    budgetSpent: report.budgetSpent, answersStored: report.answersStored ?? null,
    admittedClaims: report.admittedClaims ?? null, stagedRows: report.seeded.length,
    seededFactIdentity: "reported-id",
    seededFactIds: report.seeded.map((fact) => fact.id), interrupted: report.resumeToken !== undefined,
    coverage: report.coverage === undefined ? null : { planned: report.coverage.planned,
      sites: report.coverage.sites.map((row) => ({
        rank: row.rank, kind: row.site.kind, path: row.site.qualifiedPath, outcome: row.outcome,
        facts: row.outcome === "seeded" ? row.facts : [], cause: row.outcome === "unvisited" ? row.cause : null,
        factIdentity: row.outcome === "seeded" ? row.factIdentity ?? "reported-id" : null,
      })),
    },
  }
}

function readEvidence(path: string): string {
  expect(existsSync(path), `missing opt-in evidence: ${path}`).toBe(true)
  const text = readFileSync(path, "utf8")
  Object.values(privateText).forEach((marker) => expect(text).not.toContain(marker))
  return text
}

describe("mine failure evidence — ranked plan before spend, settled report before refusal", () => {
  it("writes the exact full four-site plan before proposer entry without hydrating the ceiling tail", () => {
    const f = fixture()
    const entries: { rank: number; plan: string | null; reads: string[] }[] = []
    const deps = options(f, { propose: (cand) => {
      const file = join(f.evidence, "plan-advisory.json")
      // Record only: an assertion thrown in a proposer could be swallowed as an interruption.
      entries.push({ rank: cand.rank, plan: existsSync(file) ? readFileSync(file, "utf8") : null, reads: [...f.reads] })
      return { abstain: privateText.whyNot }
    } }, 1)
    const ranked = buildControllerDeps(f.root, deps).plan(f.root, "HEAD").sites
    expect(ranked).toHaveLength(4)
    expect(new Set(ranked.map((cand) => cand.site.qualifiedPath))).toEqual(new Set(FRONTIER.map((site) => site.qualifiedPath)))
    expect(f.reads).toEqual([])
    const report = driveMinePass(f.root, deps).report
    expect(report).toMatchObject({ llmCalls: 1, modelCalls: 1, budgetSpent: 1 })
    expect(report.coverage!.sites.map((row) => [row.rank, row.outcome, row.outcome === "unvisited" ? row.cause : null]))
      .toEqual([[1, "abstained", null], [2, "unvisited", "ceiling"], [3, "unvisited", "ceiling"], [4, "unvisited", "ceiling"]])
    expect(entries).toHaveLength(1)
    expect(entries[0]!.reads).toEqual([ranked[0]!.site.qualifiedPath])
    expect(f.reads).toEqual([ranked[0]!.site.qualifiedPath])
    expect(entries[0]!.rank).toBe(ranked[0]!.rank)
    expect(entries[0]!.plan, "ranked plan must already exist at first proposer entry").not.toBeNull()
    expect(JSON.parse(entries[0]!.plan!)).toEqual(planProjection(ranked))
    expect(JSON.parse(readEvidence(join(f.evidence, "plan-advisory.json")))).toEqual(planProjection(ranked))
    expect(JSON.parse(readEvidence(join(f.evidence, "report-advisory.json")))).toEqual(reportProjection(report))
  })

  it("preserves two seeded facts and the third-site identity before rethrowing the original ModelCommandError", () => {
    const fault = new ModelCommandError("timeout", `ETIMEDOUT: ${privateText.fault}; prompt=${privateText.prompt}`)
    const scripted = (attempts: number[]): SiteProposer => ({ propose: (cand) => {
      attempts.push(cand.rank)
      if (attempts.length === 3) throw fault
      return { cand, claim: `${privateText.claim}:${cand.rank}`, rawAnswer: `${privateText.answer}:${cand.rank}` }
    } })
    // Existing controller is the report oracle, not a parallel implementation of its spend/coverage logic.
    const reference = fixture()
    const referenceAttempts: number[] = []
    const actualReport = makeRunController(buildControllerDeps(reference.root, options(reference, scripted(referenceAttempts))))
      .genesis(reference.root, "HEAD", { ceiling: 4 })
    expect(actualReport).toMatchObject({ modelCalls: 3, llmCalls: 2, budgetSpent: 2, answersStored: 2 })
    expect(actualReport.seeded).toHaveLength(2)
    expect(actualReport.coverage!.sites.map((row) => [row.outcome, row.outcome === "unvisited" ? row.cause : null]))
      .toEqual([["seeded", null], ["seeded", null], ["interrupted", null], ["unvisited", "after-interrupt"]])
    const f = fixture()
    const attempts: number[] = []
    const deps = { ...options(f, scripted(attempts)), modelIdentity: privateText.model }
    const ranked = buildControllerDeps(f.root, deps).plan(f.root, "HEAD").sites
    let caught: unknown
    let atRethrow: { plan: boolean; report: string | null } | undefined
    try {
      driveMinePass(f.root, deps)
    } catch (error) {
      caught = error
      const file = join(f.evidence, "report-advisory.json")
      atRethrow = { plan: existsSync(join(f.evidence, "plan-advisory.json")),
        report: existsSync(file) ? readFileSync(file, "utf8") : null }
    }
    expect(caught).toBe(fault)
    expect(attempts).toEqual([1, 2, 3])
    expect(attempts).toEqual(referenceAttempts)
    expect(f.reads).toEqual(ranked.slice(0, 3).map((cand) => cand.site.qualifiedPath))
    const staged = [...readStaging(f.store).current.values()]
    expect(staged).toHaveLength(2)
    expect(staged.map((row) => (f.store.get(asHash(row.contentHash)) as Fact).id).sort())
      .toEqual(actualReport.seeded.map((fact) => fact.id).sort())
    expect(atRethrow?.plan, "plan must survive the model refusal").toBe(true)
    expect(atRethrow?.report, "settled report must be durable before the original error reaches the caller").not.toBeNull()
    expect(JSON.parse(atRethrow!.report!)).toEqual(reportProjection(actualReport))
    expect(JSON.parse(readEvidence(join(f.evidence, "plan-advisory.json")))).toEqual(planProjection(ranked))
    expect(readEvidence(join(f.evidence, "report-advisory.json"))).toBe(atRethrow!.report)
  })

  it("uses explicit dependency filenames without overwriting advisory evidence", () => {
    const f = fixture()
    const deps = options(f, { propose: () => null }, 1)
    const ranked = buildControllerDeps(f.root, deps).plan(f.root, "HEAD").sites
    const advisory = driveMinePass(f.root, { ...deps, slot: "advisory" }).report
    const before = { plan: readEvidence(join(f.evidence, "plan-advisory.json")),
      report: readEvidence(join(f.evidence, "report-advisory.json")) }
    expect(JSON.parse(before.report)).toEqual(reportProjection(advisory))
    const dependency = driveMinePass(f.root, { ...deps, slot: "dependency" }).report
    expect(readEvidence(join(f.evidence, "plan-advisory.json"))).toBe(before.plan)
    expect(readEvidence(join(f.evidence, "report-advisory.json"))).toBe(before.report)
    expect(JSON.parse(readEvidence(join(f.evidence, "plan-dependency.json")))).toEqual(planProjection(ranked, "dependency"))
    expect(JSON.parse(readEvidence(join(f.evidence, "report-dependency.json")))).toEqual(reportProjection(dependency, "dependency"))
    expect(readdirSync(f.evidence).sort()).toEqual(["plan-advisory.json", "plan-dependency.json", "report-advisory.json", "report-dependency.json"])
  })

  it("leaves the evidence directory empty and the actual report unchanged when the opt-in is unset", () => {
    const reference = fixture()
    const referenceDeps = { ...options(reference, { propose: () => null }, 1), env: NO_MODEL_ENV }
    const expected = makeRunController(buildControllerDeps(reference.root, referenceDeps))
      .genesis(reference.root, "HEAD", { ceiling: 1 })
    const f = fixture()
    const report = driveMinePass(f.root, { ...options(f, { propose: () => null }, 1), env: NO_MODEL_ENV }).report
    expect(report).toEqual(expected)
    expect(report).toMatchObject({ llmCalls: 1, modelCalls: 1, budgetSpent: 1 })
    expect(report.coverage!.planned).toBe(4)
    expect(f.reads).toEqual([report.coverage!.sites[0]!.site.qualifiedPath])
    expect(readdirSync(f.evidence)).toEqual([])
    expect(readdirSync(reference.evidence)).toEqual([])
  })

  it("preserves the original model fault when a report-only file already exists", () => {
    const f = fixture()
    const file = join(f.evidence, "report-advisory.json")
    writeFileSync(file, "prior report must survive")
    const fault = new ModelCommandError("timeout", privateText.fault)
    let caught: unknown
    try {
      driveMinePass(f.root, options(f, { propose: () => { throw fault } }, 1))
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(fault)
    expect(existsSync(join(f.evidence, "plan-advisory.json"))).toBe(true)
    expect(readFileSync(file, "utf8")).toBe("prior report must survive")
  })

  it("refuses a report-write failure on an otherwise successful pass instead of silently succeeding", () => {
    const f = fixture()
    const file = join(f.evidence, "report-advisory.json")
    writeFileSync(file, "prior report must survive")
    let caught: unknown
    try {
      driveMinePass(f.root, options(f, { propose: () => null }, 1))
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ code: "EEXIST" })
    expect(readFileSync(file, "utf8")).toBe("prior report must survive")
  })

  it("uses the existing trimmed case-insensitive arm resolver for environment-selected evidence", () => {
    const f = fixture()
    const deps = options(f, { propose: () => null }, 1)
    const report = driveMinePass(f.root, { ...deps, env: { ...deps.env, ATLAS_MINE_SLOT: " Dependency " } }).report
    expect(JSON.parse(readEvidence(join(f.evidence, "report-dependency.json")))).toEqual(reportProjection(report, "dependency"))
    expect(readdirSync(f.evidence).sort()).toEqual(["plan-dependency.json", "report-dependency.json"])
  })
})
