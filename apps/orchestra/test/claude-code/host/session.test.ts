import { expect, test } from "bun:test"
import { ClaudeHost } from "@/claude-code/host/session"

// The host's session plumbing (meta-harness PLAN.md §4.1): the 1:1 session id, the long-lived input, steer priority.

test("Claude Code's session id is a stable v5 UUID derived 1:1 from the Orchestra session id", () => {
  const a = ClaudeHost.claudeSessionID("ses_0123456789abcdef")
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(ClaudeHost.claudeSessionID("ses_0123456789abcdef")).toBe(a)
  expect(ClaudeHost.claudeSessionID("ses_0123456789abcdeg")).not.toBe(a)
})

test("SDK steering input carries next priority; a turn's prompt carries no priority", () => {
  const steer = ClaudeHost.userInput("Use Postgres instead", "next")
  expect(steer).toMatchObject({ type: "user", message: { role: "user", content: "Use Postgres instead" }, parent_tool_use_id: null, priority: "next" })
  expect(steer.uuid).toBeString()
  expect("priority" in ClaudeHost.userInput("Start")).toBe(false)
})

test("the session input stays open between turns and ends only on release", async () => {
  const input = ClaudeHost.inbox()
  const seen: string[] = []
  const reader = (async () => {
    for await (const message of input) seen.push(String(message.message.content))
  })()
  input.push(ClaudeHost.userInput("first"))
  await Bun.sleep(5)
  expect(seen).toEqual(["first"])
  input.push(ClaudeHost.userInput("second", "next"))
  await Bun.sleep(5)
  expect(seen).toEqual(["first", "second"])
  input.end()
  await reader
  expect(seen).toEqual(["first", "second"])
})
