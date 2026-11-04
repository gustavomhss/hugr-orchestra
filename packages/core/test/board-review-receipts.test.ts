import { expect, test } from "bun:test"
import { BoardReviewReceipts } from "../src/board/review-receipts"

const receipt = (seq: number, verdict: "APPROVE" | "FIX_FIRST" | "REJECT", stage = "code") => ({
  id: `evt_${seq}`,
  seq,
  validationRecordID: "evt_validation",
  stage,
  verdict,
  method: "review-v2/code/quick",
  findings: [{ path: "src/a.ts", line: 2, message: "wrong", severity: "P1", status: "open" }],
})

test("a stage's newest FIX_FIRST is open, a newer APPROVE closes it, and a note with no receipt is not a refusal", () => {
  const linked = BoardReviewReceipts.links(["bno_review_evt_validation_code", "bno_review_evt_plan_plan", "other"])
  expect(linked).toEqual([
    { validation: "evt_validation", stage: "code" },
    { validation: "evt_plan", stage: "plan" },
  ])
  const held = BoardReviewReceipts.newest(linked, [receipt(1, "FIX_FIRST"), receipt(2, "APPROVE")])
  expect(BoardReviewReceipts.refusal(held)).toBeUndefined()
  expect(BoardReviewReceipts.toReview(held[0])).toMatchObject({
    kind: "code",
    verdict: "APPROVE",
    id: "evt_2",
    open: false,
    counts: { P0: 0, P1: 1, P2: 0, P3: 0 },
  })
  const open = BoardReviewReceipts.newest(linked, [receipt(1, "APPROVE"), receipt(3, "REJECT")])
  expect(BoardReviewReceipts.refusal(open)).toBe("ReviewOpen: code REJECT (evt_3)")
  expect(BoardReviewReceipts.refusal(BoardReviewReceipts.newest(linked, []))).toBeUndefined()
})
