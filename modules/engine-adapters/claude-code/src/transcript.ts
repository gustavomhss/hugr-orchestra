export * as ClaudeCodeTranscript from "./transcript"

export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

