export * as ClaudeCodeTranscript from "./transcript"

import type { SessionV1 } from "@orchestra/schema/session-v1"

export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The text Claude Code receives for the owner's undelivered messages: their text parts and hook reminders, in order. */
export function hostPrompt(messages: readonly SessionV1.WithParts[]) {
  return messages.flatMap((message) => message.info.role === "user" ? [
    ...message.parts.flatMap((part) => part.type === "text" && !part.ignored ? [part.text] : []),
    ...(message.info.promptContext?.reminders ?? []).map((note) => `Hook reminder:\n${note}`),
  ] : []).join("\n\n").trim()
}
