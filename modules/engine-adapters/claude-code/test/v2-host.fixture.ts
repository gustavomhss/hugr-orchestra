import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionSchema } from "@orchestra/core/session"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect, Stream } from "effect"

export const frame = (value: Record<string, unknown>) => value as unknown as SDKMessage
export const usage = { input_tokens: 5, output_tokens: 4, cache_read_input_tokens: 10, cache_creation_input_tokens: 1 }
export const user = (id: string, text: string) => ({ id, type: "user", text, files: [], agents: [], time: { created: 0 } })

// The ports a Turn carries beyond the call-through basics; a test overrides the one it exercises.
export const ports = {
  question: () => Effect.die("unused"),
  memory: { recall: Effect.succeed(undefined), archive: () => Effect.void },
  steers: Stream.empty,
  consumed: () => Effect.void,
  notify: () => Effect.void,
  todos: () => Effect.void,
} satisfies Pick<ExecutionHost.Turn, "question" | "memory" | "steers" | "consumed" | "notify" | "todos">

export const turnOf = (input: Partial<ExecutionHost.Turn> = {}): ExecutionHost.Turn => ({
  session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
  agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
  model: undefined,
  system: [],
  context: [],
  history: [user("msg_1", "Go")] as unknown as ExecutionHost.Turn["history"],
  tools: [],
  execute: () => Effect.die("unused"),
  authorize: () => Effect.die("unused"),
  ...ports,
  state: { get: Effect.succeed(undefined), update: () => Effect.void },
  ...input,
})
