import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"

// Maintenance prunes and reorganizes early and often, so the context stays well under the window.
export const DEFAULT_TRIGGER = 0.4

// Past this fraction the context is in bad shape: a pass runs before the next model request. Not configurable.
// A model whose output reservation leaves less room lowers it to its input limit.
export const HARD_LIMIT = 0.7

// Background memory starts this far below the trigger; masking alone that reaches it skips the fork.
export const PREPARE_MARGIN = 0.15

// Below the trigger, old tool output is stubbed each time the context grows by this fraction of the window.
// Batches keep the cached prefix stable between them; each batch rewrites only output that just left the tail.
export const PRUNE_STEP = 0.05

export type Settings = { enabled: boolean; trigger: number }

/** Resolve user settings; an invalid trigger falls back to the default. */
export function settings(config: Pick<ConfigV1.Info, "continuity">): Settings {
  const trigger = config.continuity?.trigger
  return {
    enabled: config.continuity?.enabled !== false,
    trigger: typeof trigger === "number" && Number.isFinite(trigger) && trigger > 0 && trigger < HARD_LIMIT ? trigger : DEFAULT_TRIGGER,
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

/** The input limit of a model request: the window minus the output the provider reserves. */
export function inputLimit(model: Provider.Model) {
  return Math.min(model.limit.input ?? Infinity, model.limit.context - ProviderTransform.maxOutputTokens(model))
}

/** Context size at which maintenance must finish before the next model request. */
export function hardLimit(model: Provider.Model) {
  return Math.max(0, Math.floor(Math.min(HARD_LIMIT * model.limit.context, inputLimit(model))))
}

/** A finished step: the end of a turn, or a tool-call step whose tools have run. */
export function isSafe(message: SessionV1.Assistant) {
  const finished = message.finish === "stop" || message.finish === "end_turn" || message.finish === "tool-calls"
  return !message.summary && !message.error && message.time.completed !== undefined && finished
}
