import { describe, expect, test } from "bun:test"
import { FORMATS, PERMISSIONS, QUESTIONS, isDemoRequest, message, parse, permission, question, settle, user, waitingMessage } from "../../src/context/demo"

describe("demo slash commands", () => {
  test("parses /fmt, /permission and /question with their defaults, and leaves other prompts alone", () => {
    expect(parse("/fmt table")).toEqual({ type: "fmt", kind: "table" })
    expect(parse("/permission")).toEqual({ type: "permission", kind: "edit" })
    expect(parse("/permission bash")).toEqual({ type: "permission", kind: "bash" })
    expect(parse("/question")).toEqual({ type: "question", kind: "multi" })
    expect(parse("/fmt nope")?.type).toBe("invalid")
    expect(parse("/permission nope")?.type).toBe("invalid")
    expect(parse("/question nope")?.type).toBe("invalid")
    expect(parse("fix the bug")).toBeUndefined()
    expect(parse("/help")).toBeUndefined()
  })

  test("every /fmt kind yields a completed assistant message with content", () => {
    const options = { now: 5, sequence: 1, cwd: "/work", agent: "build" }
    for (const kind of FORMATS) {
      const built = message(kind, options)
      expect(built).toMatchObject({ type: "assistant", agent: "build", time: { created: 5, completed: 5 } })
      expect(built.content.length).toBeGreaterThan(0)
    }
    expect(message("bash", options).content[0]).toMatchObject({ type: "tool", name: "bash" })
    expect(message("error", options).content[0]).toMatchObject({ state: { status: "error" } })
    expect(user("/fmt mix", { now: 5, sequence: 1 })).toMatchObject({ type: "user", text: "/fmt mix" })
  })

  test("permission and question requests carry ids the SDK answers locally", () => {
    for (const kind of PERMISSIONS) expect(isDemoRequest(permission("ses_1", kind, 1).id)).toBe(true)
    for (const kind of QUESTIONS) expect(question("ses_1", kind, 1).questions.length).toBeGreaterThan(0)
    expect(isDemoRequest("per_real")).toBe(false)
  })
})

describe("demo request replies settle their tool call", () => {
  const options = { now: 5, sequence: 9, cwd: "/work", agent: "build" }
  const waitFor = (id: string, tool: string) =>
    waitingMessage({ id, tool, input: { filePath: "a" }, done: { title: tool, output: "Allowed" } }, options)

  test("the request's tool points at a running call", () => {
    const pending = waitFor("demo_per_1", "edit")
    expect(pending.message.content[0]).toMatchObject({ type: "tool", name: "edit", state: { status: "running" } })
    expect(pending.tool).toEqual({ messageID: pending.message.id, callID: pending.message.content[0].id })
    settle("demo_per_1", { type: "error", error: "x" })
  })

  test("an accepted permission completes the call, a rejected one fails it with its message", () => {
    const pending = waitFor("demo_per_2", "bash")
    const accepted = settle("demo_per_2", { type: "completed" }, 8)
    expect(accepted?.messageID).toBe(pending.message.id)
    expect(accepted?.tool.state).toEqual({
      status: "completed", input: { filePath: "a" }, content: [{ type: "text", text: "Allowed" }], structured: { title: "bash" }, metadata: undefined,
    })
    expect(accepted?.tool.time).toEqual({ created: 5, ran: 5, completed: 8 })
    expect(settle("demo_per_2", { type: "completed" })).toBeUndefined()
    waitFor("demo_per_3", "bash")
    expect(settle("demo_per_3", { type: "error", error: "permission rejected" }, 8)?.tool.state).toMatchObject({
      status: "error", error: { type: "unknown", message: "permission rejected" },
    })
  })

  test("an answered question completes with its answers, a rejected one fails", () => {
    waitFor("demo_que_1", "question")
    expect(settle("demo_que_1", { type: "completed", answers: [["Alpha"]] })?.tool.state).toMatchObject({
      status: "completed", metadata: { answers: [["Alpha"]] },
    })
    waitFor("demo_que_2", "question")
    expect(settle("demo_que_2", { type: "error", error: "question rejected" })?.tool.state).toMatchObject({
      status: "error", error: { message: "question rejected" },
    })
  })
})
