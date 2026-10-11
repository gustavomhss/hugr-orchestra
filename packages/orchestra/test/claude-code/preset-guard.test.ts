import { expect, test } from "bun:test"
import { ClaudeCodeSDK } from "@/claude-code/sdk"

// Anthropic bills a query whose system prompt replaces Claude Code's preset as a third-party app on extra usage. The
// one seam every engine query goes through (turns, Maestro, seats, maintenance) refuses anything but the preset.

type Options = Parameters<typeof ClaudeCodeSDK.processLifetime>[0]

test("every Claude Code query must carry the claude_code preset; custom, string, array or missing prompts are refused", () => {
  for (const systemPrompt of [{ type: "custom", prompt: "Maestro" }, "Maestro", ["Maestro"], undefined,
    { type: "preset", preset: "other" }])
    expect(() => ClaudeCodeSDK.processLifetime({ systemPrompt } as unknown as Options))
      .toThrow("must keep the claude_code system prompt preset")
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: ClaudeCodeSDK.preset("Maestro's prompt") })
  expect(lifetime.options.systemPrompt).toEqual({ type: "preset", preset: "claude_code", append: "Maestro's prompt", snapshot: true })
})

test("a third-party billing refusal is named as such, never as an overflow", () => {
  const detail = "API Error: 400 Third-party apps now draw from your extra usage, not your plan limits."
  expect(ClaudeCodeSDK.billingRejection(detail)).toContain("billed it as a third-party app")
  expect(ClaudeCodeSDK.billingRejection(detail)).toContain("not retried")
  expect(ClaudeCodeSDK.billingRejection("prompt is too long")).toBeUndefined()
})
