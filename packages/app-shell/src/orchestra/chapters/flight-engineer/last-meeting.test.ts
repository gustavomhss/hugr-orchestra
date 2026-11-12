import { expect, test } from "bun:test"
import { homeLastClaim, settleLastMeeting } from "./last-meeting"

test("a failed last-meeting read is reported, does not replace the meeting, and does not reject", async () => {
  const error = new Error("list failed")
  const applied: string[] = []
  const reported: unknown[] = []
  const ok = await settleLastMeeting({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a last-meeting read applies and does not report", async () => {
  const applied: string[] = []
  const ok = await settleLastMeeting({
    read: Promise.resolve("standup"),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual(["standup"])
})

test("a missing last-meeting read is not a failure", async () => {
  const ok = await settleLastMeeting({
    read: undefined,
    current: () => true,
    apply: () => {
      throw new Error("applied")
    },
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(false)
})

test("a stale last-meeting read is not this request", async () => {
  const error = new Error("stale")
  const applied: string[] = []
  const reported: unknown[] = []
  const failed = await settleLastMeeting({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleLastMeeting({
    read: Promise.resolve("later"),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a failed read with no meeting is not shown as no meetings yet", () => {
  expect(homeLastClaim({ meeting: false, confirmed: false, failed: true })).toBe("failed")
  expect(homeLastClaim({ meeting: false, confirmed: false, failed: false })).toBe("unknown")
  expect(homeLastClaim({ meeting: false, confirmed: true, failed: false })).toBe("none")
  expect(homeLastClaim({ meeting: true, confirmed: true, failed: true })).toBe("meeting")
})
