import { expect, test } from "bun:test"
import { ClaudeCodeSDK } from "../src/sdk"

// Claude mode adds to Claude Code's own prompt and never replaces it: the one seam every engine query goes through
// (turns, Maestro, seats) refuses anything but the preset.

type Options = Parameters<typeof ClaudeCodeSDK.processLifetime>[0]

test("every Claude Code query must carry the claude_code preset; custom, string, array or missing prompts are refused", () => {
  for (const systemPrompt of [{ type: "custom", prompt: "Maestro" }, "Maestro", ["Maestro"], undefined,
    { type: "preset", preset: "other" }])
    expect(() => ClaudeCodeSDK.processLifetime({ systemPrompt } as unknown as Options))
      .toThrow("must keep the claude_code system prompt preset")
  const systemPrompt = { type: "preset" as const, preset: "claude_code" as const, append: "Maestro's prompt" }
  expect(ClaudeCodeSDK.processLifetime({ systemPrompt }).options.systemPrompt).toEqual(systemPrompt)
})

test("a billing refusal repeats Anthropic's message verbatim and never reads as an overflow", () => {
  const detail = "API Error: 400 Third-party apps now draw from your extra usage, not your plan limits."
  expect(ClaudeCodeSDK.billingRejection(detail)).toBe(`Anthropic returned: ${detail}`)
  expect(ClaudeCodeSDK.billingRejection("prompt is too long")).toBeUndefined()
})
