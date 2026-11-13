import { expect, test } from "bun:test"
import { pipelineClaim, settlePipelineRead } from "./pipeline"

test("a failed pipeline read is reported, does not invent off, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: string[] = []
  const reported: unknown[] = []
  const ok = await settlePipelineRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a pipeline read applies and does not report", async () => {
  const applied: string[] = []
  const ok = await settlePipelineRead({
    read: Promise.resolve(""),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([""])
})

test("a missing pipeline read is not a failure", async () => {
  const ok = await settlePipelineRead({
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

test("a stale pipeline read is not this request", async () => {
  const error = new Error("stale")
  const applied: string[] = []
  const reported: unknown[] = []
  const failed = await settlePipelineRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settlePipelineRead({
    read: Promise.resolve("model"),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a pipeline the read has not confirmed is not off", () => {
  expect(pipelineClaim(false, "")).toBe("unknown")
  expect(pipelineClaim(false, "model")).toBe("unknown")
  expect(pipelineClaim(true, "")).toBe("off")
  expect(pipelineClaim(true, "model")).toBe("named")
})
