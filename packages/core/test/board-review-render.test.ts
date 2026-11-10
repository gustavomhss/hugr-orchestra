import { describe, expect, test } from "bun:test"
import { recordPort } from "@orchestra/atlas-boundary/record"
import type { BoardRecord } from "../src/board/record"

// Exercise the shipped boundary, not a source-only substitute. The operator must regenerate
// modules/atlas/boundary/src/generated/record.{js,d.ts} before this regression can pass.
const privateCost = {
  modelSpend: "PRIVATE_MODEL_SPEND_SENTINEL_69127",
  tokens: "PRIVATE_TOKEN_SENTINEL_80453",
}

const record: BoardRecord.PrRecord = {
  intent: "Render linked review evidence.",
  change: { text: "Keep receipt metadata in the PR record.", start: ["src/review.ts"] },
  decisions: [],
  notCovered: "Provider execution.",
  risk: { level: "low", breaks: "Record formatting.", notice: "Read the PR body.", undo: "Revert the renderer change." },
  followUps: [],
  facts: { files: 1, added: 2, removed: 0, packages: ["core"], ownUnits: [] },
  evidence: {
    doneWhen: [],
    reviews: [
      {
        kind: "linked review",
        verdict: "FIX_FIRST",
        id: "review-`receipt`\nline",
        stage: "co`de\r\nstage",
        method: "quo`te\rmethod",
        counts: { P0: 0, P1: 2, P2: 3, P3: 4 },
        open: true,
        findings: [
          { at: "src/open.ts:10", text: "Still needs correction." },
          { at: "src/closed.ts:20", text: "Already corrected.", closed: "fixed in revision 2" },
        ],
        ...privateCost,
      },
      {
        kind: "legacy review",
        verdict: "APPROVE",
        findings: [{ at: "src/legacy.ts:30", text: "Legacy correction.", closed: "verified on rereview" }],
      },
    ],
    checks: [],
    used: "unseen",
  },
  cost: { attempts: [], ciRuns: 0, ciMinutes: 0, wallMs: 0, ...privateCost },
  lineage: { card: "render-receipts", dependsOn: [], seats: ["backend"] },
  integration: { state: "not queued" },
  ...privateCost,
}

describe("Atlas PR review receipt rendering", () => {
  test("the actual record port renders all linked metadata and preserves finding status", () => {
    const body = recordPort.pr(record)
    expect(body).toContain(
      "- linked review: FIX_FIRST; id: `review-'receipt' line`; stage: `co'de stage`; method: `quo'te method`; P0: 0, P1: 2, P2: 3, P3: 4; status: open",
    )
    expect(body).not.toContain("review-`receipt`")
    expect(body).toContain("  - `src/open.ts:10` Still needs correction. (open)")
    expect(body).toContain("  - `src/closed.ts:20` Already corrected. (closed: fixed in revision 2)")
    expect(body.split("\n\n").find((line) => line.startsWith("- legacy review:"))).toBe("- legacy review: APPROVE")
    expect(body).toContain("  - `src/legacy.ts:30` Legacy correction. (closed: verified on rereview)")
  })

  test("an explicit false receipt state renders closed without changing finding states", () => {
    const body = recordPort.pr({
      ...record,
      evidence: {
        ...record.evidence,
        reviews: record.evidence.reviews.map((review, index) => index === 0 ? { ...review, open: false } : review),
      },
    })
    expect(body).toContain("P0: 0, P1: 2, P2: 3, P3: 4; status: closed")
    expect(body).not.toContain("status: open")
    expect(body).toContain("  - `src/open.ts:10` Still needs correction. (open)")
    expect(body).toContain("  - `src/closed.ts:20` Already corrected. (closed: fixed in revision 2)")
    expect(body.split("\n\n").find((line) => line.startsWith("- legacy review:"))).toBe("- legacy review: APPROVE")
  })

  test("private model spend and token data never enter the GitHub body", () => {
    const body = recordPort.pr(record)
    expect(body).toContain("- linked review: FIX_FIRST")
    expect(body).toContain("- legacy review: APPROVE")
    expect(body).not.toContain(privateCost.modelSpend)
    expect(body).not.toContain(privateCost.tokens)
    expect(body).not.toContain("modelSpend")
    expect(body).not.toContain("tokens")
  })
})
