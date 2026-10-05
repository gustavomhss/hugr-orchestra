import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { ConfigAgentFile } from "@opencode-ai/core/config/agent-file"
import { ConfigMarkdown } from "@opencode-ai/core/config/markdown"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"

describe("ConfigAgentFile", () => {
  test("renders a file the V1 agent schema accepts and parses back to the same fields", () => {
    const input = {
      description: 'Reviews: the "diff"',
      mode: "subagent" as const,
      model: "example/reasoner",
      steps: 7,
      system: "Read the diff.\nThen answer.",
      permission: { bash: { "git *": "allow" as const, "*": "ask" as const }, edit: "deny" as const },
    }
    const content = ConfigAgentFile.render(undefined, input)
    expect(ConfigAgentFile.parse(content)).toEqual(input)
    const markdown = ConfigMarkdown.parse(content)
    const decoded = Schema.decodeUnknownOption(ConfigAgentV1.Info)({ ...markdown.data, prompt: markdown.content.trim() })
    expect(Option.getOrThrow(decoded)).toMatchObject({
      description: input.description,
      mode: "subagent",
      steps: 7,
      prompt: input.system,
      permission: input.permission,
    })
  })

  test("replaces editor-owned keys, keeps the rest and folds legacy spellings", () => {
    const existing = "---\ncolor: '#336699'\ntemperature: 0.2\nmaxSteps: 3\ntools:\n  write: false\n  bash: true\n---\nOld\n"
    expect(ConfigAgentFile.parse(existing)).toEqual({
      steps: 3,
      system: "Old",
      permission: { edit: "deny", bash: "allow" },
    })
    const next = ConfigAgentFile.render(existing, { mode: "primary", permission: {} })
    expect(ConfigMarkdown.parse(next).data).toEqual({ color: "#336699", temperature: 0.2, mode: "primary" })
    expect(ConfigAgentFile.parse(next)).toEqual({ mode: "primary" })
  })

  test("ignores values the agent schema would reject", () => {
    expect(
      ConfigAgentFile.parse("---\nmode: boss\nsteps: 0\npermission:\n  bash: maybe\n  edit:\n    '*': nope\n---\n"),
    ).toEqual({})
  })

  test("accepts only plain names", () => {
    expect(["build", "code-review", "agent_2"].every(ConfigAgentFile.validName)).toBe(true)
    expect(["", "../x", ".hidden", "a b", "a/b", "-x"].some(ConfigAgentFile.validName)).toBe(false)
  })
})
