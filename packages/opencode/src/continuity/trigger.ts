import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { ConfigV1 } from "@opencode-ai/core/v1/config/config"

export const DEFAULT_TRIGGER = 0.7

// Background memory starts this far below the trigger; masking alone that reaches it skips the fork.
export const PREPARE_MARGIN = 0.15

export type Settings = { enabled: boolean; trigger: number }

/** Resolve user settings; an invalid trigger falls back to the default. */
export function settings(config: Pick<ConfigV1.Info, "continuity">): Settings {
  const trigger = config.continuity?.trigger
  return {
    enabled: config.continuity?.enabled !== false,
    trigger: typeof trigger === "number" && Number.isFinite(trigger) && trigger > 0 && trigger < 1 ? trigger : DEFAULT_TRIGGER,
  }
}

export function tokenCount(tokens: SessionV1.Assistant["tokens"]) {
  if (tokens.total !== undefined && Number.isFinite(tokens.total) && tokens.total >= 0) return tokens.total
  const safe = (value: number) => Number.isFinite(value) && value > 0 ? value : 0
  // Session.getUsage separates cache from input and reasoning from output.
  return Math.min(Number.MAX_VALUE,
    safe(tokens.input) + safe(tokens.cache.read) + safe(tokens.cache.write) + safe(tokens.output) + safe(tokens.reasoning),
  )
}

/** Start when usage reaches the configured fraction of the model context window. */
export function shouldStart(input: { tokens: number; active: boolean; context: number; trigger: number }) {
  if (input.active || !Number.isFinite(input.context) || input.context <= 0) return false
  return input.tokens >= input.context * input.trigger
}

export function isSafe(message: SessionV1.Assistant) {
  const terminal = message.finish === "stop" || message.finish === "end_turn" ||
    (message.finish === "tool-calls" && message.structured !== undefined)
  return !message.summary && !message.error && message.time.completed !== undefined && terminal
}
