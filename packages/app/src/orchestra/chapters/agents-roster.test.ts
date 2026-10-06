import { describe, expect, test } from "bun:test"
import type { Agent } from "@opencode-ai/sdk/v2/client"
import { agentRoster, agentUnavailable } from "./agents-roster"

const agent = (name: string, mode: Agent["mode"], hidden = false): Agent => ({
  name,
  mode,
  hidden,
  permission: [],
  options: {},
})

describe("Agents roster", () => {
  test("excludes hidden agents and marks subagents", () => {
    expect(
      agentRoster([agent("maestro", "primary"), agent("research", "subagent"), agent("secret", "all", true)]),
    ).toEqual([
      { agent: agent("maestro", "primary"), subagent: false, chat: true },
      { agent: agent("research", "subagent"), subagent: true, chat: false },
    ])
  })

  test("only maestro opens chat, whatever the other agents' modes; an empty roster stays empty", () => {
    expect(
      agentRoster([
        agent("build", "primary"),
        agent("maestro", "primary"),
        agent("review", "all"),
        agent("research", "subagent"),
      ]).map((item) => item.chat),
    ).toEqual([false, true, false, false])
    expect(agentRoster([])).toEqual([])
  })

  test("only missing or unsupported endpoints are unavailable", () => {
    expect(agentUnavailable(new Error("missing", { cause: { status: 404 } }))).toBe(true)
    expect(agentUnavailable(new Error("unsupported", { cause: { status: 405 } }))).toBe(true)
    expect(agentUnavailable(new Error("failed", { cause: { status: 500 } }))).toBe(false)
    expect(agentUnavailable(new Error("offline"))).toBe(false)
  })
})
