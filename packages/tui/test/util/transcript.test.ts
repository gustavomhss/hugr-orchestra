import { describe, expect, test } from "bun:test"
import { formatAssistantHeader, formatMessage, formatPart, formatTranscript } from "../../src/util/transcript"
import type { Provider, SessionMessage, SessionMessageAssistant, SessionMessageAssistantTool } from "../../src/types"


const providers: Provider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    source: "api",
    env: [],
    options: {},
    models: {
      "claude-sonnet-4-20250514": {
        id: "claude-sonnet-4-20250514",
        providerID: "anthropic",
        api: {
          id: "claude-sonnet-4-20250514",
          url: "https://example.com/claude-sonnet-4-20250514",
          npm: "@ai-sdk/anthropic",
        },
        name: "Claude Sonnet 4",
        capabilities: {
          temperature: true,
          reasoning: true,
          attachment: true,
          toolcall: true,
          input: {
            text: true,
            audio: false,
            image: true,
            video: false,
            pdf: true,
          },
          output: {
            text: true,
            audio: false,
            image: false,
            video: false,
            pdf: false,
          },
          interleaved: false,
        },
        cost: {
          input: 0,
          output: 0,
          cache: {
            read: 0,
            write: 0,
          },
        },
        limit: {
          context: 200_000,
          output: 8_192,
        },
        status: "active",
        options: {},
        headers: {},
        release_date: "2025-05-14",
      },
    },
  },
]

const assistant = (
  id: string,
  created: number,
  content: SessionMessageAssistant["content"],
  extra: Partial<SessionMessageAssistant> = {},
): SessionMessageAssistant => ({
  id,
  type: "assistant",
  agent: "maestro",
  model: { id: "claude-sonnet-4-20250514", providerID: "anthropic" },
  content,
  cost: 0.001,
  tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created, completed: created + 5400 },
  ...extra,
})

const user = (id: string, created: number, text: string): SessionMessage => ({
  id,
  type: "user",
  text,
  time: { created },
})

const tool = (state: SessionMessageAssistantTool["state"]): SessionMessageAssistantTool => ({
  type: "tool",
  id: "call_1",
  name: "bash",
  provider: { executed: false },
  state,
  time: { created: 1000 },
})

describe("transcript", () => {
  describe("formatAssistantHeader", () => {
    const baseMsg = assistant("msg_123", 1000000, [])

    test("includes metadata when enabled", () => {
      expect(formatAssistantHeader(baseMsg, true)).toBe("## Assistant (Maestro · claude-sonnet-4-20250514 · 5.4s)\n\n")
    })

    test("uses model display name when available", () => {
      expect(formatAssistantHeader(baseMsg, true, providers)).toBe("## Assistant (Maestro · Claude Sonnet 4 · 5.4s)\n\n")
    })

    test("excludes metadata when disabled", () => {
      expect(formatAssistantHeader(baseMsg, false)).toBe("## Assistant\n\n")
    })

    test("handles missing completed time", () => {
      expect(formatAssistantHeader({ ...baseMsg, time: { created: 1000000 } }, true)).toBe(
        "## Assistant (Maestro · claude-sonnet-4-20250514)\n\n",
      )
    })

    test("titlecases agent name", () => {
      expect(formatAssistantHeader({ ...baseMsg, agent: "reviewer" }, true)).toContain("Reviewer")
    })
  })

  describe("formatPart", () => {
    const options = { thinking: true, toolDetails: true, assistantMetadata: true }

    test("formats text part", () => {
      expect(formatPart({ type: "text", id: "t1", text: "Hello world" }, options)).toBe("Hello world\n\n")
    })

    test("formats reasoning when thinking enabled", () => {
      const part = { type: "reasoning" as const, id: "r1", text: "Let me think...", time: { created: 1000 } }
      expect(formatPart(part, options)).toBe("_Thinking:_\n\nLet me think...\n\n")
    })

    test("skips reasoning when thinking disabled", () => {
      const part = { type: "reasoning" as const, id: "r1", text: "Let me think...", time: { created: 1000 } }
      expect(formatPart(part, { ...options, thinking: false })).toBe("")
    })

    test("formats tool part with details", () => {
      const result = formatPart(
        tool({
          status: "completed",
          input: { command: "ls" },
          content: [{ type: "text", text: "file1.txt\nfile2.txt" }],
          structured: { title: "List files" },
        }),
        options,
      )
      expect(result).toContain("**Tool: bash**")
      expect(result).toContain("**Input:**")
      expect(result).toContain('"command": "ls"')
      expect(result).toContain("**Output:**")
      expect(result).toContain("file1.txt")
    })

    test("formats tool output containing triple backticks without breaking markdown", () => {
      const result = formatPart(
        tool({
          status: "completed",
          input: { command: "echo '```hello```'" },
          content: [{ type: "text", text: "```hello```" }],
          structured: {},
        }),
        options,
      )
      expect(result).toStartWith("**Tool: bash**\n")
      expect(result).toContain("**Input:**\n```json")
      expect(result).toContain("**Output:**\n```\n```hello```\n```")
    })

    test("formats tool part without details when disabled", () => {
      const result = formatPart(
        tool({
          status: "completed",
          input: { command: "ls" },
          content: [{ type: "text", text: "file1.txt" }],
          structured: {},
        }),
        { ...options, toolDetails: false },
      )
      expect(result).toContain("**Tool: bash**")
      expect(result).not.toContain("**Input:**")
      expect(result).not.toContain("**Output:**")
    })

    test("formats tool error", () => {
      const result = formatPart(
        tool({
          status: "error",
          input: { command: "invalid" },
          content: [],
          structured: {},
          error: { type: "unknown", message: "Command failed" },
        }),
        options,
      )
      expect(result).toContain("**Error:**")
      expect(result).toContain("Command failed")
    })
  })

  describe("formatMessage", () => {
    const options = { thinking: true, toolDetails: true, assistantMetadata: true, providers }

    test("formats user message", () => {
      const result = formatMessage(user("msg_123", 1000000, "Hello"), options)
      expect(result).toContain("## User")
      expect(result).toContain("Hello")
    })

    test("skips host-injected synthetic messages", () => {
      const message: SessionMessage = {
        id: "msg_1",
        type: "synthetic",
        sessionID: "ses_1",
        text: "Synthetic content",
        time: { created: 1 },
      }
      expect(formatMessage(message, options)).toBe("")
    })

    test("formats assistant message with metadata", () => {
      const result = formatMessage(
        assistant("msg_123", 1000000, [{ type: "text", id: "t1", text: "Hi there" }]),
        options,
      )
      expect(result).toContain("## Assistant (Maestro · Claude Sonnet 4 · 5.4s)")
      expect(result).toContain("Hi there")
    })
  })

  describe("formatTranscript", () => {
    const session = { id: "ses_abc123", title: "Test Session", time: { created: 1000000000000, updated: 1000000001000 } }

    test("formats complete transcript", () => {
      const result = formatTranscript(
        session,
        [
          user("msg_1", 1000000000000, "Hello"),
          assistant("msg_2", 1000000000100, [{ type: "text", id: "t1", text: "Hi!" }], {
            time: { created: 1000000000100, completed: 1000000000600 },
          }),
        ],
        { thinking: false, toolDetails: false, assistantMetadata: true, providers },
      )
      expect(result).toContain("# Test Session")
      expect(result).toContain("**Session ID:** ses_abc123")
      expect(result).toContain("## User")
      expect(result).toContain("Hello")
      expect(result).toContain("## Assistant (Maestro · Claude Sonnet 4 · 0.5s)")
      expect(result).toContain("Hi!")
      expect(result).toContain("---")
    })

    test("orders messages by creation time", () => {
      const result = formatTranscript(
        { id: "ses_abc123", title: "Order", time: { created: 1, updated: 2 } },
        [user("msg_a", 30, "second"), user("msg_z", 10, "first")],
        { thinking: false, toolDetails: false, assistantMetadata: false },
      )
      expect(result.indexOf("first")).toBeLessThan(result.indexOf("second"))
    })

    test("formats transcript without assistant metadata", () => {
      const result = formatTranscript(
        session,
        [assistant("msg_2", 1000000000100, [{ type: "text", id: "t1", text: "Hi!" }])],
        { thinking: false, toolDetails: false, assistantMetadata: false },
      )
      expect(result).toContain("## Assistant\n\n")
      expect(result).not.toContain("Maestro")
      expect(result).not.toContain("claude-sonnet-4-20250514")
    })
  })
})
