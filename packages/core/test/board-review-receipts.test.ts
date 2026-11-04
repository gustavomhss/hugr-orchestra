import { expect, test } from "bun:test"
import { BoardReviewReceipts } from "../src/board/review-receipts"

const receipt = (seq: number, verdict: "APPROVE" | "FIX_FIRST" | "REJECT", stage = "code", validationRecordID = "evt_validation") => ({
  id: `evt_${validationRecordID}_${stage}_${seq}`,
  seq,
  validationRecordID,
  stage,
  verdict,
  method: "review-v2/code/quick",
  findings: verdict === "APPROVE" ? [] : [{ path: "src/a.ts", line: 2, message: "wrong", severity: "P1", status: "open" }],
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
    id: "evt_evt_validation_code_2",
    open: false,
    counts: { P0: 0, P1: 0, P2: 0, P3: 0 },
  })
  const open = BoardReviewReceipts.newest(linked, [receipt(1, "APPROVE"), receipt(3, "REJECT")])
  expect(BoardReviewReceipts.refusal(open)).toBe("ReviewOpen: code REJECT (evt_evt_validation_code_3)")
  expect(BoardReviewReceipts.refusal(BoardReviewReceipts.newest(linked, []))).toBeUndefined()
})

test("later completed requests supersede the same stage across validations, without comparing their sequences", () => {
  const linked = BoardReviewReceipts.links(["bno_review_evt_old_code", "bno_review_evt_new_code", "bno_review_evt_pending_code"])
  const held = BoardReviewReceipts.newest(linked, [receipt(900, "FIX_FIRST", "code", "evt_old"), receipt(2, "APPROVE", "code", "evt_new")])
  expect(held.map((item) => item.receipt.id)).toEqual(["evt_evt_new_code_2"])
  expect(BoardReviewReceipts.refusal(held)).toBeUndefined()
  expect(BoardReviewReceipts.refusal(BoardReviewReceipts.newest(linked, [receipt(900, "FIX_FIRST", "code", "evt_old")]))).toContain("code FIX_FIRST")
})

test("plan and code remain independent on the same validation, and receipt order is aggregate sequence order", () => {
  const linked = BoardReviewReceipts.links(["bno_review_evt_validation_plan", "bno_review_evt_validation_code"])
  const held = BoardReviewReceipts.newest(linked, [receipt(4, "APPROVE"), receipt(2, "REJECT"), receipt(1, "FIX_FIRST", "plan")])
  expect(held.map((item) => [item.receipt.stage, item.receipt.verdict])).toEqual([["plan", "FIX_FIRST"], ["code", "APPROVE"]])
  expect(BoardReviewReceipts.refusal(held)).toBe("ReviewOpen: plan FIX_FIRST (evt_evt_validation_plan_1)")
})

test("a legacy severity-less finding counts as P1 without losing finding closure or receipt metadata", () => {
  const linked = BoardReviewReceipts.links(["bno_review_evt_validation_plan"])
  const held = BoardReviewReceipts.newest(linked, [{
    ...receipt(1, "REJECT", "plan"),
    findings: [
      { path: "src/a.ts", line: 2, message: "legacy" },
      ...["P0", "P1", "P2", "P3"].map((severity) => ({ path: "src/a.ts", line: 3, message: severity, severity, status: "resolved" })),
    ],
  }])
  expect(BoardReviewReceipts.toReview(held[0])).toEqual({
    kind: "plan", stage: "plan", verdict: "REJECT", id: "evt_evt_validation_plan_1", method: "review-v2/code/quick", open: true,
    counts: { P0: 1, P1: 2, P2: 1, P3: 1 },
    findings: [
      { at: "src/a.ts:2", text: "legacy" },
      ...["P0", "P1", "P2", "P3"].map((severity) => ({ at: "src/a.ts:3", text: severity, closed: "resolved" })),
    ],
  })
})
