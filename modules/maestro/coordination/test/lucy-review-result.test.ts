import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { ReviewResultV2 } from "../src/v2/governance/review-result"

const digestA = "a".repeat(64)
const digestB = "b".repeat(64)

const routing: ReviewRouting.Record = {
  version: "route-v1",
  catalog: digestA,
  profile: { id: "code", source: "request" },
  tier: {
    id: "standard",
    source: "risk",
    requested: "deep",
    signals: ["path: db/migrations/0042.sql", "changedLines: 512"],
  },
  overlays: [
    { id: "data-migration", source: "path", signal: "db/migrations/0042.sql" },
    { id: "concurrency", source: "content", signal: "src/jobs/drain.ts:41 Deferred", confirmed: "src/jobs/drain.ts:41-44" },
    { id: "performance", source: "content", signal: "src/jobs/drain.ts:60 for await", declined: "bounded to one batch, line 58" },
  ],
  languages: [{ id: "js-ts", source: "path", signal: "bun.lock" }],
  lenses: [
    { id: "correctness-logic", node: "lucy-lens-correctness-logic", because: "profile", source: "catalog" },
    { id: "correctness-concurrency", node: "lucy-lens-correctness-concurrency", because: "overlay:concurrency", source: "catalog" },
  ],
  packs: [
    { id: "gitleaks", lane: "no-build", status: "ran", source: "catalog" },
    { id: "tsgo", lane: "build", status: "skipped", reason: "build lane off (D6)", source: "catalog" },
  ],
  budget: {
    lensChildren: 4,
    samples: 1,
    verifiers: 4,
    itemsPerLens: 15,
    loadsPerSession: 3,
    candidatesPerChild: 8,
    candidatesPerVerifier: 4,
    toolCallsPerSession: 30,
    probeAttempts: 2,
  },
  deviations: [],
}

const card = {
  outcome: "done",
  verdict: "FIX_FIRST",
  profile: "code",
  tier: "standard",
  overlays: ["concurrency"],
  routing,
  scope: { base: "1".repeat(40), head: "2".repeat(40), files: 7, changedLines: 212 },
  findings: [
    {
      id: "F1",
      path: "src/jobs/drain.ts",
      line: 41,
      endLine: 48,
      severity: "P1",
      confidence: "high",
      lens: "correctness-concurrency",
      class: "concurrency.atomicity",
      node: "lucy-lens-correctness-concurrency",
      rungs: ["quote", "probe:regress"],
      rule: "lost update: read, yield, write from the stale read",
      trigger: "two wakes during one drain both see idle and both start a drain",
      evidence: { kind: "probe", option: "probe:regress", command: "bun test drain", result: "fails on head, passes with the fix" },
      suggestedTest: "test('one drain', ...)",
      status: "open",
    },
  ],
  questions: [{ question: "Is the batch bound enforced upstream?", reason: "not verified: budget" }],
  checks: [{ id: "gitleaks", lane: "no-build", status: "pass" }],
  coverage: { examined: ["src/jobs/drain.ts"], notExamined: [{ item: "tsgo", reason: "not-built" }] },
  handoffs: [{ lane: "security", reason: "new outbound host", covered: false }],
  blockers: [],
  risks: [],
  nextActions: [],
}

const reply = (value: unknown) => `FIX_FIRST: one confirmed P1.\n\n\`\`\`review-result\n${JSON.stringify(value, null, 2)}\n\`\`\``

describe("review-result card", () => {
  test("decodes a full card with the routing record embedded", () => {
    expect(ReviewResultV2.parse(reply(card))).toEqual(card as ReviewResultV2.Card)
  })

  test.each([
    ["an excess top-level property", { ...card, extra: true }],
    ["an excess routing property", { ...card, routing: { ...routing, extra: true } }],
    ["an excess finding property", { ...card, findings: [{ ...card.findings[0], extra: true }] }],
    ["an unknown severity", { ...card, findings: [{ ...card.findings[0], severity: "P4" }] }],
    ["a finding without evidence", { ...card, findings: [{ ...card.findings[0], evidence: undefined }] }],
    ["a model entry without its quote", { ...card, routing: { ...routing, overlays: [{ id: "docs", source: "model" }] } }],
    ["a verdict on a blocked review", { ...card, outcome: "blocked" }],
    ["an unknown outcome", { ...card, outcome: "maybe" }],
  ])("refuses %s", (_, value) => {
    expect(ReviewResultV2.parse(reply(value))).toBeUndefined()
  })

  test("refuses a missing, repeated or malformed block", () => {
    expect(ReviewResultV2.parse("APPROVE, no card.")).toBeUndefined()
    expect(ReviewResultV2.parse(`${reply(card)}\n${reply(card)}`)).toBeUndefined()
    expect(ReviewResultV2.parse("```review-result\n{not json\n```")).toBeUndefined()
  })

  test("decodes a blocked card without a verdict", () => {
    const blocked = { ...card, outcome: "blocked", verdict: undefined, blockers: [{ kind: "entry", reason: "no acceptance" }] }
    expect(ReviewResultV2.parse(reply(blocked))?.outcome).toBe("blocked")
  })
})

describe("routing digest", () => {
  test("is stable across key order and ignores deviations, model entries and the tier raise", () => {
    const base = ReviewRouting.digest(routing)
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    const reordered = JSON.parse(JSON.stringify({ deviations: [], budget: routing.budget, ...routing }))
    expect(ReviewRouting.digest(reordered)).toBe(base)
    expect(
      ReviewRouting.digest({
        ...routing,
        tier: { ...routing.tier, raise: { id: "deep", source: "model", quote: "src/a.ts:3 auth check" } },
        overlays: [...routing.overlays, { id: "docs", source: "model", quote: "README.md:1" }],
        deviations: [{ kind: "load-refused", stage: "hunt", detail: "lucy-lens-security outside allow" }],
      }),
    ).toBe(base)
    expect(ReviewRouting.tier({ ...routing, tier: { ...routing.tier, raise: { id: "deep", source: "model", quote: "x" } } })).toBe(
      "deep",
    )
  })

  test("changes with any host choice", () => {
    const base = ReviewRouting.digest(routing)
    expect(ReviewRouting.digest({ ...routing, catalog: digestB })).not.toBe(base)
    expect(ReviewRouting.digest({ ...routing, overlays: routing.overlays.slice(1) })).not.toBe(base)
    expect(ReviewRouting.digest({ ...routing, budget: { ...routing.budget, verifiers: 3 } })).not.toBe(base)
  })
})

describe("review receipt", () => {
  const decode = Schema.decodeUnknownSync(MaestroEvent.Review.ReceivedV2.data)
  const legacy = {
    sessionID: "ses_1",
    projectID: "prj_1",
    validationRecordID: "evt_v",
    workCardHash: "c".repeat(64),
    routedMemberID: "backend",
    rosterHash: "d".repeat(64),
    grantHash: "e".repeat(64),
    reviewPolicyHash: "f".repeat(64),
    actor: { version: "rfc8785-v1", bytes: "{}", sha256: "0".repeat(64) },
    reviewerID: "lucy",
    reviewMethodVersion: "v1",
    artifact: {
      workCardHash: "c".repeat(64),
      sha256: "1".repeat(64),
      baseSHA: "a1",
      headSHA: "b2",
      worktree: "/repo",
      changedPaths: ["src/a.ts"],
    },
    verdict: "FIX_FIRST",
    findings: [{ path: "src/a.ts", line: 3, message: "wrong" }],
  }

  test("decodes a receipt recorded before the routed review", () => {
    expect(decode(legacy)).toEqual(legacy)
    expect(Schema.decodeUnknownSync(MaestroEvent.Review.Received.data)({ ...legacy, artifact: { ...legacy.artifact, bytes: "diff" } }).findings).toEqual(
      legacy.findings,
    )
  })

  test("decodes a review-v2 receipt with the full finding record, digests and item outcomes", () => {
    const receipt = {
      ...legacy,
      reviewMethodVersion: ReviewResultV2.method({ profile: "code", tier: "standard" }),
      stage: "code",
      findings: [{ ...card.findings[0], message: "lost update", cause: { path: "src/jobs/drain.ts", line: 44 } }],
      routingDigest: ReviewRouting.digest(routing),
      catalogDigest: digestA,
      items: [{ pack: "gitleaks", rule: "generic-api-key", fingerprint: "fp1", outcome: "refuted" }],
    }
    expect(decode(receipt)).toEqual(receipt)
    expect(() => decode({ ...receipt, items: [{ ...receipt.items[0], outcome: "maybe" }] })).toThrow()
    expect(() => decode({ ...receipt, routingDigest: "short" })).toThrow()
  })
})

describe("method version", () => {
  const allowed = { profiles: ["plan", "code", "rereview"], tiers: ["quick", "standard", "deep"] }

  test("builds and parses review-v2/<profile>/<tier> against the allowed sets", () => {
    expect(ReviewResultV2.method({ profile: "plan", tier: "quick" })).toBe("review-v2/plan/quick")
    expect(ReviewResultV2.parseMethod("review-v2/code/standard", allowed)).toEqual({ profile: "code", tier: "standard" })
    expect(ReviewResultV2.parseMethod("review-v2/audit/standard", allowed)).toBeUndefined()
    expect(ReviewResultV2.parseMethod("review-v2/code/ultra", allowed)).toBeUndefined()
    expect(ReviewResultV2.parseMethod("review-v1/code/standard", allowed)).toBeUndefined()
    expect(ReviewResultV2.parseMethod("review-v2/code/standard/x", allowed)).toBeUndefined()
  })

  test("maps profiles to settlement stages", () => {
    expect(ReviewResultV2.stage("plan")).toBe("plan")
    expect(ReviewResultV2.stage("release")).toBe("code")
    expect(ReviewResultV2.stage("rereview", "code")).toBe("code")
    expect(ReviewResultV2.stage("audit")).toBeUndefined()
  })
})

describe("stage schemas", () => {
  const candidate = (severity: MaestroEvent.Review.Severity, line: number) => ({
    class: "logic.off-by-one",
    node: "lucy-lens-correctness-logic",
    path: "src/a.ts",
    line,
    severity,
    trigger: "an empty list",
    quote: "for (i = 0; i <= n; i++)",
  })

  test("caps a lens return by severity rank and records the drop", () => {
    const value = ReviewResultV2.parseLens({
      lens: "correctness-logic",
      candidates: [candidate("P3", 1), candidate("P0", 2), candidate("P2", 3)],
      observations: [1, 2, 3, 4].map((line) => ({ class: "tests.missing", path: "src/b.ts", line, text: "no test" })),
      hunks: [{ path: "src/a.ts", startLine: 1, endLine: 9 }],
      items: [{ fingerprint: "fp1", pursued: true }],
    })
    if (!value) throw new Error("lens return did not decode")
    const capped = ReviewResultV2.capLens(value, 2, "ses_child")
    expect(capped.value.candidates.map((item) => item.severity)).toEqual(["P0", "P2"])
    expect(capped.value.observations).toHaveLength(3)
    expect(capped.deviations.map((item) => [item.kind, item.stage, item.session])).toEqual([
      ["cap-dropped", "hunt", "ses_child"],
      ["cap-dropped", "hunt", "ses_child"],
    ])
    expect(capped.deviations[0].detail).toContain("src/a.ts:1")
    expect(ReviewResultV2.parseLens({ ...value, extra: 1 })).toBeUndefined()
  })

  test("caps an entry record's added overlays and context sheet", () => {
    const record = ReviewResultV2.parseEntry({
      status: "eligible",
      context: {
        intent: [{ text: "x".repeat(3000), line: "card:1" }],
        acceptance: [{ text: "y".repeat(2000), line: "card:2" }],
        invariants: "nothing found",
        assumptions: [],
      },
      overlays: {
        confirmed: [{ id: "concurrency", quote: "src/a.ts:4" }],
        declined: [],
        added: ["docs", "api", "data"].map((id) => ({ id, quote: "src/a.ts:1" })),
      },
      raise: { tier: "deep", quote: "src/auth.ts:3" },
      slices: [],
    })
    if (!record || record.status !== "eligible") throw new Error("entry record did not decode")
    const capped = ReviewResultV2.capEntry(record)
    if (capped.value.status !== "eligible") throw new Error("entry record changed status")
    expect(capped.value.overlays.added.map((item) => item.id)).toEqual(["docs", "api"])
    expect(capped.value.context.acceptance).toEqual([])
    expect(capped.value.context.invariants).toBe("nothing found")
    expect(capped.deviations).toHaveLength(2)
    expect(ReviewResultV2.parseEntry({ status: "blocked", blocker: { kind: "intent", reason: "no acceptance" } })).toBeDefined()
    expect(ReviewResultV2.parseEntry({ status: "blocked" })).toBeUndefined()
  })

  test("decodes verifier end states strictly and caps results", () => {
    const value = ReviewResultV2.parseVerifier({
      class: "logic.off-by-one",
      results: [
        {
          candidate: "c1",
          state: "confirmed",
          rung: "quote",
          evidence: { kind: "quote", path: "src/a.ts", startLine: 1, endLine: 2 },
          history: [{ option: "quote", outcome: "settled" }],
        },
        { candidate: "c2", state: "question", reason: "not verified: budget", history: [] },
        { candidate: "c3", state: "dropped", refutation: "guarded at line 9", history: [] },
      ],
    })
    if (!value) throw new Error("verifier return did not decode")
    expect(ReviewResultV2.capVerifier(value, 2).value.results.map((item) => item.candidate)).toEqual(["c1", "c2"])
    expect(
      ReviewResultV2.parseVerifier({ class: "x", results: [{ candidate: "c1", state: "confirmed", rung: "quote", history: [] }] }),
    ).toBeUndefined()
  })
})
