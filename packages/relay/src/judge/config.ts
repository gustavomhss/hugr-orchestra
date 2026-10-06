export * as JudgeConfig from "./config"

import { Context, Effect, Redacted } from "effect"
import type { JudgeBallot } from "./ballot"

// The judge as the gate core sees it. Its settings come from Orchestra config `relay.judge.*`, never from provider
// auth or the process environment (WP4). There is no CLI backend: it spawned a third-party CLI.

export interface Config {
  readonly backend: "stub" | "api"
  readonly model: string
  readonly baseURL?: string
  readonly apiKey?: Redacted.Redacted<string>
  // At least 1.
  readonly votes: number
  // Characters read per context file before truncation.
  readonly maxContext: number
  // API reply budget.
  readonly maxTokens: number
  // Forces the stub's verdict.
  readonly stub?: "pass" | "fail"
}

export const defaults = {
  backend: "stub",
  model: "claude-sonnet-4-6",
  votes: 1,
  maxContext: 120_000,
  maxTokens: 8192,
} as const satisfies Config

// One context file. `text` is absent when the file is missing or unreadable.
export interface File {
  readonly name: string
  readonly text?: string
}

export interface Input {
  readonly criterion: string
  readonly files: ReadonlyArray<File>
}

export interface Interface {
  readonly judge: (input: Input) => Effect.Effect<JudgeBallot.Response>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/relay/Judge") {}
