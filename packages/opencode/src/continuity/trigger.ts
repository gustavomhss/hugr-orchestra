import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { threshold } from "./model"

export function tokenCount(tokens: SessionV1.Assistant["tokens"]) {
  if (tokens.total !== undefined && Number.isFinite(tokens.total) && tokens.total >= 0) return tokens.total
  const safe = (value: number) => Number.isFinite(value) && value > 0 ? value : 0
  // Session.getUsage separates cache from input and reasoning from output.
  return Math.min(Number.MAX_VALUE,
    safe(tokens.input) + safe(tokens.cache.read) + safe(tokens.cache.write) + safe(tokens.output) + safe(tokens.reasoning),
  )
}

export function shouldStart(input: { tokens: number; active: boolean }) {
  return input.tokens >= threshold && !input.active
}

export function isSafe(message: SessionV1.Assistant) {
  const terminal = message.finish === "stop" || message.finish === "end_turn" ||
    (message.finish === "tool-calls" && message.structured !== undefined)
  return !message.summary && !message.error && message.time.completed !== undefined && terminal
}
