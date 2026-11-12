import { expect, test } from "bun:test"
import { Cause, Schema } from "effect"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { dieFailures } from "../src/effect/cause"
import { failureCause, rememberFailureCause } from "../src/scheduled-task/failure-cause"

test("H8 safety: dieFailures keeps every identity, annotation and interrupt in order", () => {
  const first = new Error("first typed failure")
  const second = new Error("second typed failure")
  const alien = new Error("independent defect")
  const failure = Cause.makeFailReason(first).annotate(new Map([["h8-source", "first"]]))
  const other = Cause.makeFailReason(second).annotate(new Map([["h8-source", "second"]]))
  const defect = Cause.makeDieReason(alien).annotate(new Map([["h8-source", "defect"]]))
  const interrupt = Cause.makeInterruptReason(181).annotate(new Map([["h8-source", "interrupt"]]))
  const original = Cause.fromReasons([failure, other, defect, interrupt])
  const converted = dieFailures(original)
  expect(converted.reasons.map((reason) => reason._tag)).toEqual(["Die", "Die", "Die", "Interrupt"])
  const one = converted.reasons[0]
  const two = converted.reasons[1]
  expect(one?._tag === "Die" && one.defect === first).toBe(true)
  expect(two?._tag === "Die" && two.defect === second).toBe(true)
  expect(one?.annotations).toEqual(failure.annotations)
  expect(two?.annotations).toEqual(other.annotations)
  expect(converted.reasons[2]).toBe(defect)
  expect(converted.reasons[3]).toBe(interrupt)
  expect(original.reasons).toEqual([failure, other, defect, interrupt])
})

test("H8 safety: private failed-outcome and RunError provenance uses exact object identity without wire fields", () => {
  const original = Cause.die(new Error("original dispatch failure"))
  const outcome = { type: "failed" as const, error: "historical-looking text" }
  expect(rememberFailureCause(outcome, original)).toBe(outcome)
  expect(failureCause(outcome)).toBe(original)
  expect(failureCause({ ...outcome })).toBeUndefined()
  const failed = new ScheduledTask.RunError({ reason: outcome.error })
  const keys = Object.keys(failed)
  expect(rememberFailureCause(failed, original)).toBe(failed)
  expect(failureCause(failed)).toBe(original)
  expect(Object.keys(failed)).toEqual(keys)
  expect(Schema.encodeSync(ScheduledTask.RunError)(failed)).toEqual({ _tag: "ScheduledTask.RunError", reason: outcome.error })
  expect(failureCause(new ScheduledTask.RunError({ reason: outcome.error }))).toBeUndefined()
  expect(failureCause({ ...failed })).toBeUndefined()
})
