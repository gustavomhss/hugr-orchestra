export * as JudgeConfig from "./config"

import { Context, Effect, Layer, Redacted } from "effect"
import { JudgeApi } from "./api"
import type { JudgeBallot } from "./ballot"
import { JudgeStub } from "./stub"

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

export class Service extends Context.Service<Service, Interface>()("@orchestra/relay/Judge") {}

// Replaces `pick_backend`: the backend comes from config alone, so a provider key in the environment can neither turn
// the stub into an API call nor become the API's key.
export const layer = (config: Config) =>
  Layer.succeed(
    Service,
    Service.of({
      judge: (input) => (config.backend === "api" ? JudgeApi.judge(config, input) : unconfigured(config, input)),
    }),
  )

export const NOT_CONFIGURED =
  'The relay judge is not configured (backend "stub"): set relay.judge.backend to "api" and relay.judge.apiKey in the Orchestra config to evaluate judge rules.'

// The default backend is the stub, which never evaluates a criterion, so an unforced stub failure says the judge is not
// configured instead of leaving a bare marker message. It stays a fail: an unconfigured judge never passes a rule.
const unconfigured = (config: Config, input: Input) =>
  JudgeStub.judge(input, config.stub).pipe(
    Effect.map((response) =>
      config.stub || response.verdict === "pass"
        ? response
        : { ...response, reason: `${response.reason}. ${NOT_CONFIGURED}` },
    ),
  )
