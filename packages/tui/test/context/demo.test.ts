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

  test("every /fmt kind yields a completed assistant message with parts", () => {
    const options = { now: 5, sequence: 1, cwd: "/work", agent: "build" }
    for (const kind of FORMATS) {
      const built = message("ses_1", "demo_usr_1", kind, options)
      expect(built.info).toMatchObject({ role: "assistant", sessionID: "ses_1", parentID: "demo_usr_1" })
      expect(built.parts.length).toBeGreaterThan(0)
      expect(built.parts.every((part) => part.messageID === built.info.id)).toBe(true)
    }
    expect(message("s", "p", "bash", options).parts[0]).toMatchObject({ type: "tool", tool: "bash" })
    expect(message("s", "p", "error", options).parts[0]).toMatchObject({ state: { status: "error" } })
    expect(user("s", "/fmt mix", { now: 5, sequence: 1, agent: "build" }).info.role).toBe("user")
  })

  test("permission and question requests carry ids the SDK answers locally", () => {
    for (const kind of PERMISSIONS) expect(isDemoRequest(permission("ses_1", kind, 1).id)).toBe(true)
    for (const kind of QUESTIONS) expect(question("ses_1", kind, 1).questions.length).toBeGreaterThan(0)
    expect(isDemoRequest("per_real")).toBe(false)
  })
})

describe("demo request replies settle their tool part", () => {
  const options = { now: 5, sequence: 9, cwd: "/work", agent: "build" }
  const waitFor = (id: string, tool: string) =>
    waitingMessage("ses_1", "demo_usr_9", { id, tool, input: { filePath: "a" }, done: { title: tool, output: "Allowed" } }, options)

  test("the request's tool points at a running part", () => {
    const pending = waitFor("demo_per_1", "edit")
    expect(pending.parts[0]).toMatchObject({ type: "tool", tool: "edit", state: { status: "running" } })
    expect(pending.tool).toEqual({ messageID: pending.info.id, callID: (pending.parts[0] as { callID: string }).callID })
    settle("demo_per_1", { type: "error", error: "x" })
  })

  test("an accepted permission completes the part, a rejected one fails it with V1's message", () => {
    waitFor("demo_per_2", "bash")
    expect(settle("demo_per_2", { type: "completed" }, 8)?.state).toEqual({
      status: "completed", input: { filePath: "a" }, output: "Allowed", title: "bash", metadata: {}, time: { start: 5, end: 8 },
    })
    expect(settle("demo_per_2", { type: "completed" })).toBeUndefined()
    waitFor("demo_per_3", "bash")
    expect(settle("demo_per_3", { type: "error", error: "permission rejected" }, 8)?.state).toMatchObject({
      status: "error", error: "permission rejected", time: { start: 5, end: 8 },
    })
  })

  test("an answered question completes with its answers, a rejected one fails", () => {
    waitFor("demo_que_1", "question")
    expect(settle("demo_que_1", { type: "completed", answers: [["Alpha"]] })?.state).toMatchObject({
      status: "completed", metadata: { answers: [["Alpha"]] },
    })
    waitFor("demo_que_2", "question")
    expect(settle("demo_que_2", { type: "error", error: "question rejected" })?.state).toMatchObject({ status: "error", error: "question rejected" })
  })
})
