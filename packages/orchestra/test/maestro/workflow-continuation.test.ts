import { afterAll, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Result, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { RelayWorkflowCurrentStep } from "@orchestra/core/relay-workflow-currentstep"
import { RelayWorkflowEvaluator } from "@orchestra/core/relay-workflow-evaluator"
import { RelayWorkflowTransition } from "@orchestra/core/relay-workflow-transition"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { CodeReview } from "@/maestro/code-review"
import { WorkflowBinding } from "@/maestro/workflow-binding"
import { cleanup, entries, read, repo, run, scratch, write, type Env, type Requirements } from "../../../../modules/relay/test/arm-harness"

// The continuation of a step held for a code review, on a real two-gate workflow arm with its HMAC ledger: the second
// gate grades the final cold review. Only the code review is a stand-in; the arm, ledger and transition are real.
afterAll(cleanup)
const key = "workflow-continuation-test-key"
const token = "tok"
const review = { id: "review", host_check: "cold-review" }

async function fixture() {
  const env = await scratch()
  await repo(env, [{ "tracked.txt": "initial" }])
  const sprint = JSON.stringify({ gen: 1, retry_budget: 3, work_packages: [
    { id: "first", checklist: [{ id: "price-test", cmd: "true" }] },
    { id: "second", instructions: "Implement the fix", checklist: [review] },
  ] })
  const binding = Schema.decodeUnknownSync(RelayArm.WorkflowBinding)({
    definition: {
      publication: { projectID: "project", documentID: "doc", activeVersionID: "version",
        immutableVersionBodyChecksum: "1".repeat(64), livePublicationChecksum: "2".repeat(64) },
      materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: RelayWorkflowBinding.digest(Buffer.from(sprint)),
        byteLength: Buffer.byteLength(sprint) }, resolvedSkills: [], parameters: {}, writePaths: [env.work],
    }, planRevisionID: "evt_revision", executionSessionID: "ses_worker", authoritySessionID: "ses_owner", logicalTaskID: "task",
  })
  await write(env.arm, { "sprint.json": sprint, "meta.json": JSON.stringify({ workdir: env.work, workflow: binding,
    project_id: binding.definition.publication.projectID, session_id: binding.executionSessionID }),
    position: "first", counter: "0\n", state: "active" })
  return { env, binding }
}

// The host's armed provider, as in core's evaluator test, with the cold-review control bound to a callback that passes
// unless `review` is "fail" (a FIX_FIRST receipt): the pre-settle check in settleWorkflow is what holds or admits the grade.
function transition(env: Env, binding: RelayArm.WorkflowBinding, settlement: RelayArm.WorkflowSettlement,
  review: "pass" | "fail" = "pass") {
  const input: RelayWorkflowTransition.Input = { token, binding, settlement, revalidate: () => Effect.void,
    hostChecks: new Map([["cold-review", (check: RelayArm.HostCheckInput) => Effect.succeed({ name: check.check.id,
      status: review, provenance: { source: "host-check" as const, projectID: "project", sessionID: "ses_owner",
        eventID: "event-review" } })]]) }
  return run(env, Effect.gen(function* () {
    const ports = yield* Effect.context<Requirements>()
    const evaluator: RelayWorkflowTransition.Evaluator = {
      evaluate: (plain, boundary) => RelayWorkflowEvaluator.native.evaluate({ ...plain, binding, settlement }, boundary)
        .pipe(Effect.provide(ports)),
      reconcile: (pending, checkpoint) => RelayWorkflowEvaluator.native.reconcile(pending, checkpoint).pipe(Effect.provide(ports)),
    }
    return yield* RelayWorkflowTransition.transition(input).pipe(
      Effect.provideService(RelayWorkflowTransition.NativeEvaluator, evaluator), Effect.result,
    )
  }), { key })
}

const current = (env: Env, binding: RelayArm.WorkflowBinding) => run(env, RelayWorkflowCurrentStep.read(token, binding), { key })

const settlementAt = (assistantMessageID: string, view: RelayArm.WorkflowPosition) =>
  Schema.decodeUnknownSync(RelayArm.WorkflowSettlement)({ assistantMessageID,
    expected: { position: view.position, attempt: view.attempt, ledgerSeq: view.ledgerSeq } })

const dispositions = async (env: Env) => (await entries(env)).flatMap((entry) => {
  if (entry.event !== "workflow-disposition") return []
  const evaluation = entry.evaluation as { outcome: string; wp: string }
  return [`${evaluation.wp}:${evaluation.outcome}`]
})

test("an authorized continuation settles only the held step, spends nothing on the hold and still needs the review", async () => {
  const { env, binding } = await fixture()
  const first = await transition(env, binding, settlementAt("msg_first", { position: "first", attempt: 0, ledgerSeq: -1 }))
  expect(Result.isSuccess(first) && first.success.outcome).toBe("advance")
  const held = await current(env, binding)
  expect(held).toMatchObject({ wp: "second", state: "active" })
  const ledger = await read(path.join(env.arm, "ledger.jsonl"))
  const retry = await read(path.join(env.arm, "retry_first"))

  // One settlement of the second gate through the real settleWorkflow; `reviewed` is whether a code-stage APPROVE
  // covers the working tree as it is now.
  const records: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowReviewHeld.data>[] = []
  const reviews = { count: 0 }
  const settle = (assistantMessageID: string, reviewed: boolean) => {
    const settlement = settlementAt(assistantMessageID, held)
    return Effect.runPromise(ArsenalCompletion.settleWorkflow({
      checklist: [review],
      binding: { sessionID: "ses_owner", taskID: "ses_worker", callID: "call", directory: env.work, projectID: "project",
        planID: "evt_revision", token, stateDirectory: "", ownedPaths: [] },
      coldReview: () => Effect.gen(function* () {
        reviews.count++
        if (!reviewed) return yield* new RelayWorkflowBinding.Held({ reason: CodeReview.REQUIRED })
        return { status: "pass" as const }
      }),
      held: Effect.sync(() => {
        records.push({ executionSessionID: binding.executionSessionID, token,
          assistantMessageID: settlement.assistantMessageID, expected: settlement.expected })
      }),
      transition: Effect.promise(() => transition(env, binding, settlement)),
    }).pipe(Effect.result))
  }
  const resume = (lastAssistantID: string) => WorkflowBinding.continuesHeldStep({
    reservedID: binding.executionSessionID, resumedID: binding.executionSessionID,
    bound: { executionSessionID: binding.executionSessionID, token }, view: held, held: records, lastAssistantID,
    phase: "continuation",
  })
  const unchanged = async () => {
    expect(await read(path.join(env.arm, "ledger.jsonl"))).toBe(ledger)
    expect(await current(env, binding)).toEqual(held)
  }

  // The workers' reply to the second gate, before any code review: the hold is recorded and the arm is not touched.
  const hold = await settle("msg_second", false)
  expect(Result.isFailure(hold) && hold.failure).toMatchObject({ reason: CodeReview.REQUIRED })
  await unchanged()
  expect(resume("msg_second")).toBe(true)

  // The continued reply after a review of an older tree: the cold review runs again before any grade and holds again.
  const stale = await settle("msg_second_continued", false)
  expect(Result.isFailure(stale) && stale.failure).toMatchObject({ reason: CodeReview.REQUIRED })
  expect(reviews.count).toBe(2)
  await unchanged()

  // Reviewed now: the continuation grades the second gate at the held position, attempt and ledger sequence.
  const graded = await settle("msg_second_reviewed", true)
  expect(Result.isSuccess(graded) && Result.isSuccess(graded.success) && graded.success.success.outcome).toBe("complete")
  expect(reviews.count).toBe(3)
  const after = await read(path.join(env.arm, "ledger.jsonl"))
  // The ledger only grew past the hold point, the first gate kept its one disposition and its retry budget, and the
  // binding (with its writePaths) still matches the arm.
  expect(after.startsWith(ledger) && after.length > ledger.length).toBe(true)
  expect(await dispositions(env)).toEqual(["first:advance", "second:complete"])
  expect(await read(path.join(env.arm, "retry_first"))).toBe(retry)
  expect(await current(env, binding)).toMatchObject({ state: "complete" })
  // The arm is complete, so no recorded hold continues anything any more.
  expect(WorkflowBinding.continuesHeldStep({ reservedID: binding.executionSessionID, resumedID: binding.executionSessionID,
    bound: { executionSessionID: binding.executionSessionID, token }, view: await current(env, binding), held: records,
    lastAssistantID: "msg_second_reviewed", phase: "continuation" })).toBe(false)
})

test("a FIX_FIRST resume spends one retry per review round on the real arm, and a spent budget holds", async () => {
  const { env, binding } = await fixture()
  await transition(env, binding, settlementAt("msg_first", { position: "first", attempt: 0, ledgerSeq: -1 }))
  const held = await current(env, binding)
  expect(held).toMatchObject({ wp: "second", state: "active", attempt: 0 })
  const ledger = await read(path.join(env.arm, "ledger.jsonl"))

  // One resume of a step held at `view`: the cold review names a not-approved receipt whose verdict is `verdict`, and the
  // held reply is graded through the real transition, where the cold-review control fails.
  // Keyed by the attempt, as the durable record is (WorkflowBinding.recordReviewFindings).
  const records = new Map<number, { receiptID: string; expected: RelayArm.WorkflowPosition }>()
  const grade = (reply: string, view: RelayArm.WorkflowPosition, verdict: "FIX_FIRST" | "REJECT") => Effect.runPromise(
    ArsenalCompletion.gradeReviewedHold({
      coldReview: () => Effect.fail(new RelayWorkflowBinding.Held({ reason: CodeReview.NOT_APPROVED, receiptID: `evt_review_${reply}` })),
      binding: { sessionID: "ses_owner", taskID: "ses_worker", callID: "call", directory: env.work, projectID: "project",
        planID: "evt_revision", token, stateDirectory: "", ownedPaths: [] },
      verdict: () => Effect.succeed(verdict),
      settle: Effect.promise(() => transition(env, binding, settlementAt(reply, view), "fail")).pipe(
        Effect.flatMap((result) => Result.isSuccess(result) ? Effect.succeed(result.success) : Effect.fail(result.failure))),
      next: Effect.promise(() => current(env, binding)),
      record: (receiptID, expected) => Effect.sync(() => {
        records.set(expected.attempt, { receiptID,
          expected: { position: expected.position, attempt: expected.attempt, ledgerSeq: expected.ledgerSeq } })
      }),
    }).pipe(Effect.result))

  // REJECT grades nothing: the arm and its ledger are untouched and no attempt carries findings.
  const rejected = await grade("msg_second", held, "REJECT")
  expect(Result.isFailure(rejected) && rejected.failure).toMatchObject({ reason: "WORKFLOW_CODE_REVIEW_REJECTED" })
  expect(await read(path.join(env.arm, "ledger.jsonl"))).toBe(ledger)
  expect(await current(env, binding)).toEqual(held)
  expect([...records.values()]).toEqual([])

  // FIX_FIRST grades the held reply once: the same step moves to its next attempt, which alone is recorded to carry the
  // findings. The arm still reads with the approved binding (its writePaths included): nothing re-bound the dispatch.
  expect(Result.isSuccess(await grade("msg_second", held, "FIX_FIRST"))).toBe(true)
  const retried = await current(env, binding)
  expect(retried).toMatchObject({ wp: "second", position: held.position, attempt: 1, state: "active",
    instructions: "Implement the fix" })
  expect(retried.ledgerSeq).toBeGreaterThan(held.ledgerSeq)
  expect([...records.values()]).toEqual([{ receiptID: "evt_review_msg_second",
    expected: { position: held.position, attempt: 1, ledgerSeq: retried.ledgerSeq } }])
  // Grading the same held reply again replays its saved disposition and spends nothing more.
  expect(Result.isSuccess(await grade("msg_second", held, "FIX_FIRST"))).toBe(true)
  expect(await current(env, binding)).toEqual(retried)
  expect(records.size).toBe(1)

  // Each later round (a new reply held at the new attempt, then a FIX_FIRST of it) spends exactly one more retry until
  // the budget of 3 is spent; the next round parks the arm and holds, recording nothing.
  expect(Result.isSuccess(await grade("msg_round_2", retried, "FIX_FIRST"))).toBe(true)
  const third = await current(env, binding)
  expect(third.attempt).toBe(2)
  expect(Result.isSuccess(await grade("msg_round_3", third, "FIX_FIRST"))).toBe(true)
  const last = await current(env, binding)
  expect(last.attempt).toBe(3)
  const spent = await grade("msg_round_4", last, "FIX_FIRST")
  expect(Result.isFailure(spent) && spent.failure).toMatchObject({ reason: "WORKFLOW_TRANSITION_ESCALATE" })
  expect(await current(env, binding)).toMatchObject({ state: "awaiting-human" })
  expect([...records.keys()]).toEqual([1, 2, 3])
  expect((await dispositions(env)).filter((entry) => entry === "second:gate-fail")).toHaveLength(3)
})
