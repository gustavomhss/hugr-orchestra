export * as JudgeConfig from "./config"

import { Context, Effect, Layer, Option, Redacted } from "effect"
import { GateDiff } from "../gate/diff"
import { JudgeApi } from "./api"
import type { JudgeBallot } from "./ballot"
import { JudgeStub } from "./stub"

// The host explicitly binds the Orchestra model call. The Messages backend uses its own key.

export interface Config {
  readonly backend: "stub" | "api" | "orchestra"
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
  readonly worktree?: WorktreeEvidence
}

/** References from an approved workflow, rather than bytes supplied by its author. */
export interface WorktreeEvidence {
  readonly directory: string
  readonly paths: ReadonlyArray<string>
  readonly scopePaths?: ReadonlyArray<string>
  readonly gitDiff?: Effect.Effect<Option.Option<string>>
}

export interface Response extends JudgeBallot.Response {
  readonly artifact?: string
}

export interface Interface {
  readonly requiresWorktreeEvidence?: boolean
  readonly judge: (input: Input) => Effect.Effect<Response>
}

export interface CheckedEvidence {
  readonly files: ReadonlyArray<File>
  readonly artifact?: string
}

export type NativeCall = JudgeApi.NativeCall
export interface Native {
  readonly call: NativeCall
  readonly read: (input: WorktreeEvidence) => Effect.Effect<CheckedEvidence, string>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/relay/Judge") {}

// Replaces `pick_backend`: the backend comes from config alone, so a provider key in the environment can neither turn
// the stub into an API call nor become the API's key.
export const layer = (config: Config, native?: Native) =>
  Layer.succeed(
    Service,
    Service.of({
      requiresWorktreeEvidence: config.backend === "orchestra",
      judge: (input) => {
        if (config.backend === "api") return JudgeApi.judge(config, input)
        if (config.backend === "orchestra") return judgeWorktree(config, input, native)
        return unconfigured(config, input)
      },
    }),
  )

function judgeWorktree(config: Config, input: Input, native?: Native) {
  const denied = (reason: string) => ({
    verdict: "fail",
    available: false,
    backend: `api-error:${config.model}`,
    reason,
  } as const)
  if (!native || !input.worktree)
    return Effect.succeed(denied("the Orchestra judge requires an owner-bound OAuth connection and worktree evidence"))
  const worktree = input.worktree
  return Effect.gen(function* () {
    const evidence = yield* native.read(worktree)
    const diff = worktree.gitDiff ? yield* worktree.gitDiff : undefined
    if (diff && Option.isNone(diff)) return denied("computed Git diff is unavailable")
    const result = yield* JudgeApi.judge(config, {
      criterion: input.criterion,
      files: diff ? [...evidence.files, { name: GateDiff.NAME, text: diff.value.replace(/\r\n?/g, "\n") }] : evidence.files,
    }, native.call)
    return evidence.artifact === undefined ? result : { ...result, artifact: evidence.artifact }
  }).pipe(Effect.catch((reason) => Effect.succeed(denied(reason))))
}

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
