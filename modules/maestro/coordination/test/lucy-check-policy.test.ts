import { expect, test } from "bun:test"
import { Schema } from "effect"
import type { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRouting } from "@orchestra/core/review/routing"
import type { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewChecksV2 } from "../src/v2/workflow/review-checks"

const budget = {
  lensChildren: 0, samples: 1, verifiers: 0, itemsPerLens: 1, loadsPerSession: 1,
  candidatesPerChild: 1, candidatesPerVerifier: 1, toolCallsPerSession: 1, probeAttempts: 1,
} as const

function routing(packs: ReviewRouting.Pack[]): ReviewRouting.Record {
  return {
    version: "route-v1",
    catalog: "a".repeat(64),
    profile: { id: "code", source: "request" },
    tier: { id: "standard", source: "risk", signals: [] },
    overlays: [],
    languages: [],
    lenses: [],
    packs,
    budget,
    deviations: [],
  }
}

function pack(id: string, status: ReviewRouting.Pack["status"], source: "catalog" | "path" = "catalog"): ReviewRouting.Pack {
  return { id, source, lane: "repo", status, ...(status === "routed" ? {} : { reason: status }) }
}

function analyzer(patch: Partial<ReviewAnalyze.Check> & Pick<ReviewAnalyze.Check, "id" | "status">): ReviewAnalyze.Check {
  return {
    pack: "repo",
    version: "1",
    lane: "lint",
    workspaceExecuted: false,
    ...patch,
  }
}

function probe(status: "pass" | "fail" | "not-run", uri = "u1", reason?: string) {
  return {
    candidate: "c1",
    option: "probe:test",
    result: { status, reason, durationMs: 1, excerpt: "", uri, tree: "t" },
  }
}

function card(facts: ReviewChecksV2.Facts, patch: Partial<ReviewResultV2.Card> = {}): ReviewResultV2.Card {
  const blocked = facts.blockers.length > 0
  return {
    outcome: blocked ? "blocked" : "done",
    ...(blocked ? {} : { verdict: "APPROVE" as const }),
    profile: "code",
    tier: "standard",
    overlays: [],
    routing: routing([]),
    scope: { base: "base", head: "head", files: 1, changedLines: 1 },
    findings: [],
    questions: [],
    checks: facts.checks,
    coverage: { examined: [], notExamined: [] },
    handoffs: [],
    blockers: facts.blockers,
    risks: [],
    nextActions: [],
    ...patch,
  }
}

const collect = (
  packs: ReviewRouting.Pack[],
  checks: ReviewAnalyze.Check[] = [],
  settings?: { review: { acceptedUnavailable: string[] } },
  extra: Partial<Pick<Parameters<typeof ReviewChecksV2.collect>[0], "entryBlockers" | "probes" | "catalog">> = {},
) => ReviewChecksV2.collect({ routing: routing(packs), checks, settings, catalog: ReviewCatalog.current, ...extra })

test("accepts an exact id, not a pack name or a similarly named gate", () => {
  const checks = [analyzer({ id: "lint", status: "not-run", reason: "absent" })]
  const exact = collect([pack("repo", "routed")], checks, { review: { acceptedUnavailable: ["lint"] } })
  expect(exact.checks[0]).toMatchObject({ status: "check-unavailable", accepted: true })
  expect(exact.blockers).toEqual([])
  expect(() => ReviewChecksV2.validate(card(exact), exact)).not.toThrow()

  const lane = collect([pack("repo", "routed")], checks, { review: { acceptedUnavailable: ["lint-lane"] } })
  expect(lane.checks[0]?.accepted).toBe(false)
  const byLane = collect(
    [pack("repo", "routed")],
    [analyzer({ id: "lint", lane: "lint-lane", status: "not-run", reason: "absent" })],
    { review: { acceptedUnavailable: ["lint-lane"] } },
  )
  expect(byLane.checks[0]).toMatchObject({ accepted: true })
  expect(byLane.blockers).toEqual([])

  const packName = collect([pack("repo", "routed")], checks, { review: { acceptedUnavailable: ["repo"] } })
  expect(packName.checks[0]?.accepted).toBe(false)
  expect(packName.blockers[0]?.kind).toBe("check-unavailable")
})

test("an acquisition error stays unaccepted and blocks a required check", () => {
  const facts = collect(
    [pack("repo", "routed")],
    [analyzer({ id: "lint", status: "acquisition-error", reason: "unreadable" })],
    { review: { acceptedUnavailable: ["lint", "lint"] } },
  )
  expect(facts.checks[0]).toMatchObject({ status: "acquisition-error" })
  expect(facts.checks[0]?.accepted).toBeUndefined()
  expect(facts.blockers).toEqual([
    { kind: "acquisition-error", reason: "unreadable", ref: JSON.stringify(["repo", "lint", "lint"]) },
  ])
  expect(() => ReviewChecksV2.validate(card(facts, { outcome: "done", verdict: "APPROVE" }), facts)).toThrow("checks-blocked")
  expect(() => ReviewChecksV2.validate(card(facts), facts)).not.toThrow()
})

test("a required pack with no host check is synthesized; a skipped fallback is not required", () => {
  const fallback = analyzer({ id: "optional", pack: "fallback", status: "fail", reason: "red", lane: "repo" })
  const facts = collect(
    [pack("repo", "routed"), pack("fallback", "skipped"), pack("path-pack", "not-run", "path")],
    [fallback],
  )
  expect(facts.checks.map((check) => check.id).toSorted()).toEqual(["optional", "path-pack", "repo"])
  expect(facts.checks.find((check) => check.id === "repo")).toMatchObject({
    status: "check-unavailable",
    version: "unknown",
    reason: "required pack produced no host check",
    workspaceExecuted: false,
  })
  expect(facts.required).toContain(JSON.stringify(["repo", "repo", "repo"]))
  expect(facts.required).toContain(JSON.stringify(["path-pack", "repo", "path-pack"]))
  expect(facts.required).not.toContain(JSON.stringify(["fallback", "repo", "optional"]))
  expect(() => ReviewChecksV2.validate(card(facts, { outcome: "done", verdict: "APPROVE" }), facts)).toThrow("checks-blocked")
  const ignored = collect([], [analyzer({ id: "optional", pack: "fallback", status: "fail", reason: "red", lane: "repo" })])
  expect(ignored.required).toEqual([])
  expect(ignored.blockers).toEqual([])
  expect(() => ReviewChecksV2.validate(card(ignored), ignored)).not.toThrow()
})

test("duplicate entry blockers become one host blocker, and a repeated card copy is rejected", () => {
  const entry = { kind: "entry", reason: "no acceptance", code: "E1", ref: "gate" }
  const facts = collect([], [], undefined, { entryBlockers: [entry, { ...entry }] })
  expect(facts.blockers).toEqual([entry])
  expect(() => ReviewChecksV2.validate(card(facts), facts)).not.toThrow()
  expect(() => ReviewChecksV2.validate(card(facts, { blockers: [entry, entry] }), facts)).toThrow("checks-blocked")
  const distinct = collect([], [], undefined, {
    entryBlockers: [
      { kind: "entry", reason: "no acceptance", ref: "a" },
      { kind: "entry", reason: "no acceptance", ref: "b" },
    ],
  })
  expect(distinct.blockers).toEqual([
    { kind: "entry", reason: "no acceptance", ref: "a" },
    { kind: "entry", reason: "no acceptance", ref: "b" },
  ])
})

test("the same check id in another pack or lane is not the same host check", () => {
  const facts = collect(
    [pack("repo", "routed"), pack("other", "routed")],
    [
      analyzer({ id: "lint", pack: "repo", lane: "lint", status: "pass" }),
      analyzer({ id: "lint", pack: "other", lane: "lint", status: "pass" }),
      analyzer({ id: "lint", pack: "repo", lane: "types", status: "pass" }),
    ],
  )
  expect(facts.checks.map((check) => [check.pack, check.lane, check.id])).toEqual([
    ["other", "lint", "lint"],
    ["repo", "lint", "lint"],
    ["repo", "types", "lint"],
  ])
})

test("a forged accepted, status, or omitted lane does not match the collected check", () => {
  const facts = collect(
    [pack("repo", "routed")],
    [analyzer({ id: "lint", status: "not-run", reason: "absent" })],
    { review: { acceptedUnavailable: ["lint"] } },
  )
  const host = facts.checks[0]
  if (!host) throw new Error("missing collected check")
  expect(host).toMatchObject({ status: "check-unavailable", accepted: true, lane: "lint" })
  expect(() => ReviewChecksV2.validate(card(facts, { checks: [{ ...host, accepted: false }] }), facts)).toThrow("checks-mismatch")
  expect(() => ReviewChecksV2.validate(card(facts, { checks: [{ ...host, status: "pass" }] }), facts)).toThrow("checks-mismatch")
  const { lane: _lane, ...withoutLane } = host
  expect(() => ReviewChecksV2.validate(card(facts, { checks: [withoutLane] }), facts)).toThrow("checks-mismatch")
})

test("keeps entry blockers and rejects a fabricated APPROVE", () => {
  const entry = [{ kind: "entry", reason: "no acceptance", code: "E1" }]
  const facts = collect([], [], undefined, { entryBlockers: entry })
  expect(facts.blockers).toEqual(entry)
  expect(facts.required).toEqual([])
  expect(() => ReviewChecksV2.validate(card(facts), facts)).not.toThrow()
  expect(() => ReviewChecksV2.validate(card(facts, { outcome: "done", verdict: "APPROVE", blockers: [] }), facts)).toThrow("checks-blocked")
  expect(() => ReviewChecksV2.validate(card(facts, { blockers: [...entry, ...entry] }), facts)).toThrow("checks-blocked")
  expect(() => ReviewChecksV2.validate(card(facts, { blockers: [...entry, { kind: "model", reason: "extra" }] }), facts)).not.toThrow()
})

test("dedupes equivalent host checks and rejects a conflicting identity", () => {
  const check = analyzer({ id: "lint", status: "pass" })
  const facts = collect([pack("repo", "routed")], [check, { ...check }])
  expect(facts.checks).toHaveLength(1)
  expect(() => collect([pack("repo", "routed")], [check, { ...check, reason: "other" }])).toThrow("checks-mismatch")
})

test("a card must repeat the host checks exactly, in any order", () => {
  const facts = collect([pack("repo", "routed")], [analyzer({ id: "lint", status: "pass" }), analyzer({ id: "types", status: "pass" })])
  expect(() => ReviewChecksV2.validate(card(facts, { checks: [...facts.checks].reverse() }), facts)).not.toThrow()
  expect(() => ReviewChecksV2.validate(card(facts, { checks: facts.checks.slice(1) }), facts)).toThrow("checks-mismatch")
  expect(() => ReviewChecksV2.validate(card(facts, { checks: [...facts.checks, facts.checks[0]!] }), facts)).toThrow("checks-mismatch")
  expect(() => ReviewChecksV2.validate(card(facts, { checks: [{ ...facts.checks[0]!, version: "changed" }, facts.checks[1]!] }), facts)).toThrow("checks-mismatch")
  expect(() => ReviewChecksV2.validate(card(facts, {
    checks: [...facts.checks, { id: "invented", pack: "repo", lane: "lint", version: "1", status: "pass", workspaceExecuted: false }],
  }), facts)).toThrow("checks-mismatch")
})

test("zero required checks can APPROVE; a required repository command fail cannot", () => {
  const empty = collect([])
  expect(empty).toEqual({ checks: [], required: [], repository: [], blockers: [] })
  expect(() => ReviewChecksV2.validate(card(empty), empty)).not.toThrow()
  const failed = collect([pack("repo", "routed")], [analyzer({ id: "lint", status: "fail", reason: "red" })])
  expect(failed.blockers).toEqual([])
  expect(() => ReviewChecksV2.validate(card(failed, { verdict: "FIX_FIRST" }), failed)).not.toThrow()
  expect(() => ReviewChecksV2.validate(card(failed, { verdict: "APPROVE" }), failed)).toThrow("checks-blocked")
})

test("a failed probe is recorded and does not veto APPROVE; a refusal does not become a pass", () => {
  const failed = collect([], [], undefined, { probes: [probe("fail", "u1", "red")] })
  expect(failed.checks[0]).toMatchObject({
    id: "probe:c1:probe:test:u1",
    pack: "review-probe",
    lane: "probe:test",
    version: "review-v2",
    status: "fail",
    workspaceExecuted: true,
  })
  expect(failed.blockers).toEqual([])
  expect(failed.required).toEqual([JSON.stringify(["review-probe", "probe:test", "probe:c1:probe:test:u1"])])
  expect(() => ReviewChecksV2.validate(card(failed), failed)).not.toThrow()

  const refused = collect([], [], undefined, { probes: [probe("not-run", "u1", "scratch refused")] })
  expect(refused.checks[0]).toMatchObject({ status: "check-unavailable", accepted: false, workspaceExecuted: false })
  expect(refused.checks[0]?.status).not.toBe("pass")
  expect(refused.blockers[0]?.kind).toBe("check-unavailable")
  const passedOff = card(refused, {
    checks: [{ ...refused.checks[0]!, status: "pass", accepted: undefined }],
    outcome: "done",
    verdict: "APPROVE",
    blockers: [],
  })
  expect(() => ReviewChecksV2.validate(passedOff, refused)).toThrow("checks-mismatch")
})

test("repository gates come from the execution catalog snapshot, not the global catalog or the pack id", () => {
  const source = ReviewCatalog.current.packs[0]
  if (!source) throw new Error("missing catalog pack")
  const command = { ...source, id: "repo-custom", backend: "repo" as const }
  const named = { ...source, id: "repo", backend: "pinned" as const }
  const native = { ...source, id: "gitleaks", backend: "pinned" as const }
  const execution = { ...ReviewCatalog.current, packs: [command, named, native] }
  const identity = (packId: string, id = "lint") => JSON.stringify([packId, "lint", id])
  const custom = collect(
    [pack("repo-custom", "routed")],
    [analyzer({ id: "lint", pack: "repo-custom", status: "fail", reason: "exit 1" })],
    undefined,
    { catalog: execution },
  )
  expect(custom.repository).toEqual([identity("repo-custom")])
  expect(custom.checks[0]?.status).toBe("fail")
  expect(() => ReviewChecksV2.authorize("APPROVE", custom)).toThrow("checks-blocked")
  expect(() => ReviewChecksV2.validate(card(custom, { verdict: "APPROVE" }), custom)).toThrow("checks-blocked")
  const saved = custom.repository
  const pinnedName = collect(
    [pack("repo", "routed")],
    [analyzer({ id: "lint", pack: "repo", status: "fail", reason: "debt" })],
    undefined,
    { catalog: execution },
  )
  expect(pinnedName.repository).toEqual([])
  expect(pinnedName.checks[0]?.status).toBe("fail")
  expect(() => ReviewChecksV2.authorize("APPROVE", pinnedName)).not.toThrow()
  const mixed = collect(
    [pack("repo-custom", "routed"), pack("gitleaks", "routed")],
    [
      analyzer({ id: "scan", pack: "repo-custom", status: "pass" }),
      analyzer({ id: "scan", pack: "gitleaks", status: "fail", reason: "P2 diagnostic" }),
    ],
    undefined,
    { catalog: execution },
  )
  expect(mixed.repository).toEqual([JSON.stringify(["repo-custom", "lint", "scan"])])
  expect(mixed.checks.find((check) => check.pack === "gitleaks")?.status).toBe("fail")
  expect(() => ReviewChecksV2.authorize("APPROVE", mixed)).not.toThrow()
  expect(() => ReviewChecksV2.validate(card(mixed), mixed)).not.toThrow()
  const optional = collect(
    [pack("repo-custom", "skipped")],
    [analyzer({ id: "lint", pack: "repo-custom", status: "fail", reason: "exit 1" })],
    undefined,
    { catalog: execution },
  )
  expect(optional.required).not.toContain(identity("repo-custom"))
  expect(optional.repository).toEqual([identity("repo-custom")])
  expect(() => ReviewChecksV2.authorize("APPROVE", optional)).not.toThrow()
  const again = collect(
    [pack("repo-custom", "routed")],
    [analyzer({ id: "lint", pack: "repo-custom", status: "fail", reason: "exit 1" }), analyzer({ id: "lint", pack: "repo-custom", status: "fail", reason: "exit 1" })],
    undefined,
    { catalog: { ...execution, packs: [named] } },
  )
  expect(custom.repository).toEqual(saved)
  expect(again.repository).toEqual([])
  expect(() => ReviewChecksV2.authorize("APPROVE", custom)).toThrow("checks-blocked")
  const { repository: _repository, ...legacy } = custom
  expect(() => Schema.decodeUnknownSync(ReviewChecksV2.Facts)(legacy)).toThrow()
})

test("a native diagnostic fail stays fail and does not veto APPROVE", () => {
  expect(ReviewCatalog.current.packs.filter((entry) => entry.backend === "repo").map((entry) => entry.id)).toEqual(["repo"])
  const repo = collect([pack("repo", "routed")], [analyzer({ id: "lint", pack: "repo", status: "fail", reason: "exit 1" })])
  expect(repo.checks[0]?.status).toBe("fail")
  expect(() => ReviewChecksV2.authorize("APPROVE", repo)).toThrow("checks-blocked")
  expect(() => ReviewChecksV2.validate(card(repo, { verdict: "APPROVE" }), repo)).toThrow("checks-blocked")
  const similar = collect([pack("repo-native", "routed")], [analyzer({ id: "lint", pack: "repo-native", status: "fail", reason: "red" })])
  expect(() => ReviewChecksV2.authorize("APPROVE", similar)).not.toThrow()
  for (const id of ["squawk", "gitleaks", "ast-grep", "future-scanner"]) {
    const facts = collect([pack(id, "routed")], [analyzer({ id: "scan", pack: id, status: "fail", reason: "P2 diagnostic" })])
    expect(facts.checks[0]).toMatchObject({ pack: id, status: "fail" })
    expect(facts.blockers).toEqual([])
    expect(() => ReviewChecksV2.authorize("APPROVE", facts)).not.toThrow()
    expect(() => ReviewChecksV2.validate(card(facts, { verdict: "APPROVE" }), facts)).not.toThrow()
    expect(() => ReviewChecksV2.validate(card(facts, { checks: [{ ...facts.checks[0]!, status: "pass" }] }), facts)).toThrow("checks-mismatch")
  }
  const debt = collect([pack("gitleaks", "routed")], [analyzer({ id: "scan", pack: "gitleaks", status: "fail", reason: "pre-existing debt" })])
  expect(debt.checks[0]?.status).toBe("fail")
  expect(() => ReviewChecksV2.authorize("APPROVE", debt)).not.toThrow()
  const unavailable = collect(
    [pack("squawk", "routed")],
    [analyzer({ id: "scan", pack: "squawk", status: "not-run", reason: "absent" })],
  )
  expect(unavailable.blockers[0]?.kind).toBe("check-unavailable")
  expect(() => ReviewChecksV2.authorize("APPROVE", unavailable)).toThrow("checks-blocked")
  const acquisition = collect(
    [pack("gitleaks", "routed")],
    [analyzer({ id: "scan", pack: "gitleaks", status: "acquisition-error", reason: "unreadable" })],
  )
  expect(acquisition.checks[0]?.accepted).toBeUndefined()
  expect(() => ReviewChecksV2.authorize("FIX_FIRST", acquisition)).toThrow("checks-blocked")
})

test("authorize refuses every receipt verdict on host blockers, and only APPROVE on a required repository command fail", () => {
  const blocked = collect([], [], undefined, { entryBlockers: [{ kind: "entry", reason: "no acceptance" }] })
  expect(() => ReviewChecksV2.validate(card(blocked), blocked)).not.toThrow()
  for (const verdict of ["APPROVE", "FIX_FIRST", "REJECT"]) {
    expect(() => ReviewChecksV2.authorize(verdict, blocked)).toThrow("checks-blocked")
  }
  const failed = collect([pack("repo", "routed")], [analyzer({ id: "lint", status: "fail", reason: "red" })])
  expect(() => ReviewChecksV2.authorize("APPROVE", failed)).toThrow("checks-blocked")
  expect(() => ReviewChecksV2.authorize("FIX_FIRST", failed)).not.toThrow()
  const probeFail = collect([], [], undefined, { probes: [probe("fail", "u1", "red")] })
  expect(() => ReviewChecksV2.authorize("APPROVE", probeFail)).not.toThrow()
  const accepted = collect(
    [pack("repo", "routed")],
    [analyzer({ id: "lint", status: "not-run", reason: "absent" })],
    { review: { acceptedUnavailable: ["lint"] } },
  )
  expect(accepted.blockers).toEqual([])
  expect(() => ReviewChecksV2.authorize("APPROVE", accepted)).not.toThrow()
})
