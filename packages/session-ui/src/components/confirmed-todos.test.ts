import { describe, expect, test } from "bun:test"
import { confirmedTodos } from "./confirmed-todos"

const todos = [
  { content: "Confirmed task", status: "completed", priority: "high" },
  { content: "Next task", status: "in_progress", priority: "medium" },
]

describe("confirmedTodos", () => {
  test("prefers confirmed metadata over output and proposed input", () => {
    const state = {
      status: "completed",
      input: { todos: [{ content: "Proposal", status: "pending" }] },
      metadata: { todos },
      output: JSON.stringify([]),
    }
    expect(confirmedTodos(state)).toBe(todos)
  })

  test("reads the legacy output array and structured output object", () => {
    expect(confirmedTodos({ status: "completed", output: JSON.stringify(todos) })).toEqual(todos)
    expect(confirmedTodos({ status: "completed", output: JSON.stringify({ todos }) })).toEqual(todos)
  })

  test("keeps a confirmed empty snapshot even when output differs", () => {
    expect(confirmedTodos({ status: "completed", metadata: { todos: [] }, output: JSON.stringify(todos) })).toEqual([])
  })

  test.each(["pending", "running", "error", undefined])("ignores confirmation data with status %s", (status) => {
    expect(confirmedTodos({ status, metadata: { todos }, output: JSON.stringify(todos) })).toBeUndefined()
  })

  test("never falls back to proposed input", () => {
    const state = { status: "completed", input: { todos }, output: "Updated todos" }
    expect(confirmedTodos(state)).toBeUndefined()
  })

  test.each([
    "",
    "not JSON",
    "null",
    "{}",
    JSON.stringify([null]),
    JSON.stringify([{ content: 42, status: "completed" }]),
    JSON.stringify([{ content: "Task", status: "unknown" }]),
    JSON.stringify({ todos: "invalid" }),
  ])("rejects invalid confirmed output %s", (output) => {
    expect(confirmedTodos({ status: "completed", output })).toBeUndefined()
  })

  test("uses valid output when metadata has an invalid checklist", () => {
    expect(confirmedTodos({ status: "completed", metadata: { todos: [null] }, output: JSON.stringify(todos) })).toEqual(
      todos,
    )
  })

  test("accepts all supported todo statuses without requiring unused priority", () => {
    const list = ["pending", "in_progress", "completed", "cancelled"].map((status) => ({ content: status, status }))
    expect(confirmedTodos({ status: "completed", metadata: { todos: list } })).toEqual(list)
  })
})
