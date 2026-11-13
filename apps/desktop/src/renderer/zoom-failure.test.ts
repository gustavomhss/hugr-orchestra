import { afterEach, expect, test } from "bun:test"
import { createZoomSession, noteFailedZoom, settleZoom } from "./zoom-failure"

const logged: unknown[] = []
const original = console.error

afterEach(() => {
  console.error = original
  logged.length = 0
})

test("a failed current zoom reverts, is reported, and does not reject", async () => {
  const error = new Error("zoom failed")
  const applied: number[] = []
  const reverted: number[] = []
  const reported: unknown[] = []
  const ok = await settleZoom({
    write: Promise.reject(error),
    current: () => true,
    apply: () => applied.push(1),
    revert: () => reverted.push(1),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reverted).toEqual([1])
  expect(reported).toEqual([error])
})

test("a stale failed zoom is not this request", async () => {
  const error = new Error("stale")
  const applied: number[] = []
  const reverted: number[] = []
  const reported: unknown[] = []
  const ok = await settleZoom({
    write: Promise.reject(error),
    current: () => false,
    apply: () => applied.push(1),
    revert: () => reverted.push(1),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reverted).toEqual([])
  expect(reported).toEqual([])
})

test("a current zoom applies and does not report", async () => {
  const reported: unknown[] = []
  const applied: number[] = []
  const ok = await settleZoom({
    write: Promise.resolve(),
    current: () => true,
    apply: () => applied.push(1),
    revert: () => {
      throw new Error("reverted")
    },
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([1])
  expect(reported).toEqual([])
})

test("a stale successful zoom does not apply", async () => {
  const applied: number[] = []
  const ok = await settleZoom({
    write: Promise.resolve(),
    current: () => false,
    apply: () => applied.push(1),
    revert: () => {
      throw new Error("reverted")
    },
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
})

test("an echoed success clears the failure so the next outage is shown", async () => {
  const error = new Error("zoom failed")
  const reported: unknown[] = []
  let applied = 1
  let mode: "fail" | "hold" | "ok" = "fail"
  let release = () => undefined
  const session = createZoomSession({
    write: () => {
      if (mode === "fail") return Promise.reject(error)
      if (mode === "ok") return Promise.resolve()
      return new Promise<void>((done) => {
        release = done
      })
    },
    report: (cause) => reported.push(cause),
    apply: (factor) => {
      applied = factor
    },
    revert: (factor) => {
      applied = factor
    },
  })

  await session.ask(1.2)
  expect(reported).toEqual([error])
  expect(applied).toBe(1)

  mode = "hold"
  const writing = session.ask(1.4)
  session.echo(1.4)
  release()
  await writing
  expect(applied).toBe(1.4)
  expect(reported).toEqual([error])

  mode = "fail"
  await session.ask(1.6)
  expect(reported).toEqual([error, error])
  expect(applied).toBe(1.4)
})

test("a success that does not echo still clears the failure", async () => {
  const error = new Error("zoom failed")
  const reported: unknown[] = []
  let fail = true
  const session = createZoomSession({
    write: () => (fail ? Promise.reject(error) : Promise.resolve()),
    report: (cause) => reported.push(cause),
    apply: () => undefined,
    revert: () => undefined,
  })

  await session.ask(1.2)
  fail = false
  await session.ask(1.4)
  fail = true
  await session.ask(1.6)
  expect(reported).toEqual([error, error])
})

test("the first failed zoom is shown and a repeat is only logged", () => {
  console.error = (...args) => {
    logged.push(args[0])
  }
  const error = new Error("zoom failed")
  const reported: unknown[] = []
  const report = (cause: unknown) => reported.push(cause)
  const shown = noteFailedZoom({ error, shown: false, report })
  noteFailedZoom({ error, shown, report })
  expect(shown).toBe(true)
  expect(reported).toEqual([error])
  expect(logged).toEqual([error, error])
})
