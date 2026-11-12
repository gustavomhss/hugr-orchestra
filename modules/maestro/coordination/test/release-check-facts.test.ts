import { expect, test } from "bun:test"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import type { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import type { ReviewRouting } from "@orchestra/core/review/routing"
import type { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewChecksV2 } from "../src/v2/workflow/review-checks"

const ids = ["release:provenance", "release:signing", "release:updater", "release:sbom", "release:notes"]
const routing: ReviewRouting.Record = {
  version: "route-v1", catalog: "a".repeat(64), profile: { id: "release", source: "request" },
  tier: { id: "standard", source: "risk", signals: [] }, overlays: [], languages: [], lenses: [], packs: [], deviations: [],
  budget: { lensChildren: 0, samples: 1, verifiers: 0, itemsPerLens: 1, loadsPerSession: 1, candidatesPerChild: 1,
    candidatesPerVerifier: 1, toolCallsPerSession: 1, probeAttempts: 1 },
}
const checks = (status: ReviewAnalyze.Status): ReviewAnalyze.Check[] => [...ids, "release:behavioural-eval"].map((id) => ({
  id, pack: "release", version: "review-v2", lane: "no-build", workspaceExecuted: false,
  status: id === "release:behavioural-eval" ? "not-run" : status,
  reason: id === "release:behavioural-eval" ? "owner-permission" : "fixture-evidence",
}))
const collect = (rows = checks("pass"), accepted: string[] = [], profile = "release") => ReviewChecksV2.collect({
  routing: { ...routing, profile: { id: profile, source: "request" } }, checks: rows,
  catalog: ReviewCatalog.current, settings: { review: { acceptedUnavailable: accepted } },
})
const card = (facts: ReviewChecksV2.Facts): ReviewResultV2.Card => ({
  outcome: facts.blockers.length ? "blocked" : "done", ...(facts.blockers.length ? {} : { verdict: "APPROVE" as const }),
  profile: "release", tier: "standard", overlays: [], routing, scope: { base: "base", head: "head", files: 1, changedLines: 1 },
  findings: [], questions: [], checks: facts.checks, coverage: { examined: [], notExamined: [] },
  handoffs: [], blockers: facts.blockers, risks: [], nextActions: [],
})

test("release requires the five independent proofs, never behavioral eval", () => {
  const facts = collect()
  expect(facts.required).toHaveLength(5)
  for (const id of ids) expect(facts.required).toContain(JSON.stringify(["release", "no-build", id]))
  expect(facts.required.some((id) => id.includes("behavioural-eval"))).toBe(false)
  expect(facts.checks.find((row) => row.id === "release:behavioural-eval")?.reason).toBe("owner-permission")
  expect(facts.blockers).toEqual([])
  expect(() => ReviewChecksV2.authorize("APPROVE", facts)).not.toThrow()
  expect(() => ReviewChecksV2.validate(card(facts), facts)).not.toThrow()
})

test("omitted or wrong-pack proof is an unwaivable acquisition error", () => {
  for (const id of ids) {
    for (const rows of [checks("pass").filter((row) => row.id !== id), checks("pass").map((row) => row.id === id ? { ...row, pack: "forged" } : row)]) {
      const facts = collect(rows, ids)
      expect(facts.checks.find((row) => row.id === id && row.pack === "release")).toMatchObject({
        status: "acquisition-error", reason: "missing-release-check",
      })
      expect(facts.blockers.some((row) => row.kind === "acquisition-error")).toBe(true)
      expect(() => ReviewChecksV2.authorize("APPROVE", facts)).toThrow("checks-blocked")
    }
  }
})

test("every supplied failed proof blocks regardless of accepted unavailability", () => {
  for (const id of ids) {
    const facts = collect(checks("pass").map((row) => row.id === id ? { ...row, status: "fail" } : row), ids)
    expect(facts.blockers.some((row) => row.kind === "release-proof" && row.ref?.includes(id))).toBe(true)
    expect(() => ReviewChecksV2.authorize("APPROVE", facts)).toThrow("checks-blocked")
    expect(() => ReviewChecksV2.validate({ ...card(facts), outcome: "done", verdict: "APPROVE", blockers: [] }, facts)).toThrow("checks-blocked")
  }
})

test("only actual unavailable proofs may be explicitly accepted, errors never are", () => {
  const absent = collect(checks("not-run"))
  expect(absent.blockers.filter((row) => row.kind === "check-unavailable")).toHaveLength(5)
  expect(() => ReviewChecksV2.authorize("APPROVE", absent)).toThrow("checks-blocked")
  const accepted = collect(checks("not-run"), ids)
  expect(accepted.blockers).toEqual([])
  expect(accepted.checks.filter((row) => row.accepted === true)).toHaveLength(5)
  expect(() => ReviewChecksV2.authorize("APPROVE", accepted)).not.toThrow()
  const error = collect(checks("pass").map((row) => row.id === ids[0] ? { ...row, status: "acquisition-error" } : row), ids)
  expect(error.blockers.some((row) => row.kind === "acquisition-error")).toBe(true)
  expect(() => ReviewChecksV2.authorize("APPROVE", error)).toThrow("checks-blocked")
})

test("receipt validation refuses omission or forgery of host checks", () => {
  const facts = collect()
  expect(() => ReviewChecksV2.validate({ ...card(facts), checks: facts.checks.filter((row) => row.id !== ids[0]) }, facts)).toThrow("checks-mismatch")
  expect(() => ReviewChecksV2.validate({ ...card(facts), checks: facts.checks.map((row) => row.id === ids[0] ? { ...row, reason: "forged" } : row) }, facts)).toThrow("checks-mismatch")
})

test("ordinary reviews do not acquire release requirements or new native-failure semantics", () => {
  const ordinary = collect([], [], "code")
  expect(ordinary.required).toEqual([])
  expect(ordinary.blockers).toEqual([])
  const native = collect([{ id: "native", pack: "native", version: "1", lane: "no-build", status: "fail", workspaceExecuted: false }], [], "code")
  expect(native.blockers).toEqual([])
  expect(() => ReviewChecksV2.authorize("APPROVE", native)).not.toThrow()
})
