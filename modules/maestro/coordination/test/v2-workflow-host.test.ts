import { expect, test } from "bun:test"
import { Effect, Layer, Option, type Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Relay } from "@orchestra/core/relay"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import type { RelayArm } from "@orchestra/schema/relay-arm"
import { SessionMessage } from "@orchestra/core/session/message"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroWorkflowHostV2 } from "../src/v2/workflow/host"
import { WorkflowRecordsV2 } from "../src/v2/workflow/records"
import { WorkflowReviewV2 } from "../src/v2/workflow/review"
import { WorkflowSettlementV2 } from "../src/v2/workflow/settlement"
import { governanceLayer, worktree } from "./fixture/v2-governance"

// The V2 workflow completion host: how one settlement is graded around the code review, how the authorized resume grades
// a held step, the host checks as the arm calls them, the owner-approved release of a parked arm and the durable records.

const run = <A, E>(body: () => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body().pipe(Effect.provide(governanceLayer(directory)))
      }),
    ),
  )

const held = (reason: string, receiptID?: string) => Effect.fail(new RelayWorkflowBinding.Held({ reason, receiptID }))
const reviewed = [{ host_check: "cold-review" }]
const evaluation = (outcome: RelayArm.Evaluation["outcome"]) => ({ outcome }) as RelayArm.Evaluation
const token = "tok_host"
const position = { position: "wp-1", attempt: 1, ledgerSeq: 3 }

const settle = (coldReview: Effect.Effect<unknown, unknown>, graded?: string) => {
  const calls: string[] = []
  const settled = WorkflowSettlementV2.settle({
    checklist: reviewed,
    coldReview,
    held: Effect.sync(() => void calls.push("held")),
    graded: Effect.succeed(graded),
    transition: Effect.sync(() => {
      calls.push("transition")
      return "moved"
    }),
  })
  return Effect.map(Effect.result(settled), (result) => ({ result, calls }))
}

test("the host is a global node of Maestro's V2 contribution", () => {
  expect(MaestroSeatsV2.contribution.nodes).toContain(MaestroWorkflowHostV2.node)
})

test("a settlement without a code receipt records its hold and never reaches the arm", async () => {
  const out = await Effect.runPromise(settle(held(WorkflowReviewV2.REQUIRED)))
  expect(out.calls).toEqual(["held"])
  expect(out.result._tag === "Failure" && out.result.failure.reason).toBe(WorkflowReviewV2.REQUIRED)
})

test("a receipt the resume already graded holds as unaddressed; a new receipt and a pass reach the arm", async () => {
  const same = await Effect.runPromise(settle(held(WorkflowReviewV2.NOT_APPROVED, "rev_1"), "rev_1"))
  expect(same.calls).toEqual(["held"])
  expect(same.result._tag === "Failure" && same.result.failure.reason).toBe(WorkflowReviewV2.UNADDRESSED)
  const fresh = await Effect.runPromise(settle(held(WorkflowReviewV2.NOT_APPROVED, "rev_2"), "rev_1"))
  expect(fresh.calls).toEqual(["transition"])
  const passed = await Effect.runPromise(settle(Effect.void))
  expect(passed.calls).toEqual(["transition"])
  const unreviewed = await Effect.runPromise(
    WorkflowSettlementV2.settle({
      checklist: [{}],
      coldReview: held(WorkflowReviewV2.REQUIRED),
      held: Effect.die("unreached"),
      graded: undefined,
      transition: Effect.succeed("moved"),
    }),
  )
  expect(unreviewed).toBe("moved")
})

test("the authorized resume grades a FIX_FIRST once, holds a REJECT and records the findings at the next attempt", async () => {
  const grade = (verdict: string | undefined, outcome: RelayArm.Evaluation["outcome"] = "gate-fail") => {
    const recorded: Array<[string, RelayArm.WorkflowPosition]> = []
    return Effect.runPromise(
      Effect.result(
        WorkflowSettlementV2.gradeReviewedHold({
          coldReview: held(WorkflowReviewV2.NOT_APPROVED, "rev_1"),
          verdict: () => Effect.succeed(verdict),
          settle: Effect.succeed(evaluation(outcome)),
          next: Effect.succeed(position),
          record: (receiptID, expected) => Effect.sync(() => void recorded.push([receiptID, expected])),
        }),
      ),
    ).then((result) => ({ result, recorded }))
  }
  const fixFirst = await grade("FIX_FIRST")
  expect(fixFirst.recorded).toEqual([["rev_1", position]])
  const rejected = await grade("REJECT")
  expect(rejected.recorded).toEqual([])
  expect(rejected.result._tag === "Failure" && rejected.result.failure.reason).toBe("WORKFLOW_CODE_REVIEW_REJECTED")
  const missing = await grade(undefined)
  expect(missing.result._tag === "Failure" && missing.result.failure.reason).toBe("WORKFLOW_COLD_REVIEW_MISSING")
  const advanced = await grade("FIX_FIRST", "advance")
  expect(advanced.result._tag).toBe("Success")
  expect(advanced.recorded).toEqual([])
  const busy = await grade("FIX_FIRST", "busy")
  expect(busy.result._tag === "Failure" && busy.result.failure.reason).toBe("WORKFLOW_TRANSITION_BUSY")
})

test("a host check that fails is an acquisition error, never a pass, and keeps its exit code otherwise", async () => {
  const input = { token, gateID: "wp-1", check: { id: "review", hostCheck: "cold-review" }, revision: "abc" }
  const binding = { projectID: "global", sessionID: "ses_authority" }
  const failed = await Effect.runPromise(WorkflowSettlementV2.adapt(Effect.fail("boom"), binding)(input))
  expect(failed.status).toBe("acquisition-error")
  expect(failed.provenance.revision).toBe("abc")
  const passed = await Effect.runPromise(
    WorkflowSettlementV2.adapt(Effect.succeed({ status: "pass" as const, exitCode: 0 }), binding)(input),
  )
  expect(passed).toMatchObject({ name: "review", status: "pass", exitCode: 0, provenance: { sessionID: "ses_authority" } })
})

test("only the owner's approval releases a parked arm", async () => {
  const release = (parked: boolean, approve: Effect.Effect<void, unknown>) => {
    const released: string[] = []
    return Effect.runPromise(
      Effect.gen(function* () {
        const relay = yield* Relay.Service
        const result = yield* Effect.result(
          WorkflowSettlementV2.release({ relay, token, reason: "flaky runner", approve: () => approve }),
        )
        return result._tag === "Failure" ? result.failure.message : "released"
      }).pipe(
        Effect.provide(
          Layer.mock(Relay.Service, {
            parked: () => Effect.succeed(parked ? Option.some({ wp: "wp-1", failing: ["tests"] }) : Option.none()),
            release: (_, reason) => Effect.sync(() => void released.push(reason)),
          }),
        ),
      ),
    ).then((error) => ({ error, released }))
  }
  expect((await release(false, Effect.void)).error).toBe("COMPLETION_RELEASE_NOT_PARKED")
  const rejected = await release(true, Effect.fail("no"))
  expect(rejected.error).toBe("COMPLETION_RELEASE_REJECTED")
  expect(rejected.released).toEqual([])
  const approved = await release(true, Effect.void)
  expect(approved.error).toBe("released")
  expect(approved.released).toEqual(["owner: flaky runner"])
})

test("a retried hold or grade records once, and the newest grade of a step names its review", () =>
  run(() =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const services = { db: database.db, events }
      const settlement = { assistantMessageID: SessionMessage.ID.make("msg_reply"), expected: position }
      const step = { executionSessionID: "ses_child", token, position: "wp-1" }
      expect(yield* WorkflowRecordsV2.graded(database.db, step)).toBeUndefined()
      yield* WorkflowRecordsV2.recordReviewHeld(services, { executionSessionID: "ses_child", token, settlement })
      yield* WorkflowRecordsV2.recordReviewHeld(services, { executionSessionID: "ses_child", token, settlement })
      expect(yield* WorkflowRecordsV2.reviewHolds(database.db, "ses_child")).toHaveLength(1)
      const findings = { executionSessionID: "ses_child", token, assistantMessageID: settlement.assistantMessageID, expected: position }
      yield* WorkflowRecordsV2.recordReviewFindings(services, { ...findings, reviewID: "rev_1" })
      yield* WorkflowRecordsV2.recordReviewFindings(services, { ...findings, reviewID: "rev_1" })
      yield* WorkflowRecordsV2.recordReviewFindings(services, { ...findings, reviewID: "rev_2", expected: { ...position, attempt: 2 } })
      expect(yield* WorkflowRecordsV2.findingsRecords(database.db, "ses_child")).toHaveLength(2)
      expect(yield* WorkflowRecordsV2.graded(database.db, step)).toBe("rev_2")
      expect(yield* WorkflowRecordsV2.graded(database.db, { ...step, position: "wp-2" })).toBeUndefined()
      // An unknown review id names no findings to carry.
      expect(yield* WorkflowRecordsV2.stepFindings(database.db, step)).toBeUndefined()
    }),
  ))
