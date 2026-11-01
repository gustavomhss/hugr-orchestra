import { describe, expect, test } from "bun:test"
import { logUnhandledRejection } from "./unhandled-rejection"

function capture(reason: unknown) {
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => void logged.push(args)
  const state = { prevented: false }
  try {
    logUnhandledRejection({ reason, preventDefault: () => void (state.prevented = true) })
  } finally {
    console.error = original
  }
  return { logged, prevented: state.prevented }
}

describe("logUnhandledRejection", () => {
  test("writes a plain-object rejection as one readable string and cancels the browser's own print", () => {
    const result = capture({ _tag: "SessionNotFoundError", message: "no session" })
    expect(result.prevented).toBe(true)
    expect(result.logged).toEqual([['Unhandled promise rejection: {"_tag":"SessionNotFoundError","message":"no session"}']])
  })

  test("says nothing about a cancelled request", () => {
    const result = capture(new DOMException("aborted", "AbortError"))
    expect(result.logged).toEqual([])
  })
})
