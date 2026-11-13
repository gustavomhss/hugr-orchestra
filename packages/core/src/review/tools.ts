export * as ReviewTools from "./tools"

import { Effect, Schema, Scope } from "effect"
import { optional } from "@orchestra/schema/schema"
import type { PermissionV2 } from "../permission"
import { AppProcess } from "../process"
import { ReviewHistory } from "../review-toolkit/history"
import type { ReviewItem } from "../review-toolkit/item"
import { ReviewProbe } from "../review-toolkit/probe"
import { Tool } from "../tool/tool"
import { ReviewSeatTools } from "./seat-tools"

// The review seat's host tools (lucy build plan K6, K7). Each call is the review seat's own and runs only inside a
// review: the fan-out binds the Session to its review before the Session's first turn and releases it when the review
// ends. A model caller only pages `review_analyze`; its `run` stays with the host (fan-out step 2).

export const names = {
  analyze: ReviewSeatTools.REVIEW[0],
  probe: ReviewSeatTools.REVIEW[1],
  history: ReviewSeatTools.REVIEW[2],
} as const

export const Output = Schema.Struct({ title: Schema.String, output: Schema.String, review: Schema.optional(Schema.Unknown) })

export const AnalyzeInput = Schema.Struct({
  // `run` is named so a model call to it is refused by name, not as a malformed input.
  op: Schema.Literals(["page", "run"]),
  lens: optional(Schema.NonEmptyString.check(Schema.isMaxLength(128))),
  filter: optional(Schema.Struct({
    rule: optional(Schema.NonEmptyString.check(Schema.isMaxLength(256))),
    path: optional(Schema.NonEmptyString.check(Schema.isMaxLength(8192))),
    class: optional(Schema.NonEmptyString.check(Schema.isMaxLength(128))),
  })),
  cursor: optional(Schema.NonEmptyString.check(Schema.isMaxLength(1024))),
})
export type AnalyzeInput = typeof AnalyzeInput.Type

export type Page = {
  readonly lens: string
  readonly filter?: AnalyzeInput["filter"]
  readonly cursor?: string
}

export type PageResult = { readonly items: ReadonlyArray<ReviewItem.ToolItem>; readonly cursor?: string }

export type CodeSource = { readonly directory: string; readonly worktree: string; readonly commit?: string }

/** What a review Session may reach, set by the fan-out for the Session's stage. */
export type Binding = {
  /** The repository `review_history` reads. */
  readonly repository: string
  readonly codeSource?: Effect.Effect<CodeSource, Tool.Failure, Scope.Scope>
  /** Lens children: the Session's lens and `ReviewAnalyze.page` (review-toolkit/analyze.ts) over the review's retained run. */
  readonly analyze?: {
    readonly lens: string
    /** The Quick lead hunts more than one lens in its one Session; it may page any of these. */
    readonly lenses?: ReadonlyArray<string>
    readonly page: (input: Page) => Effect.Effect<PageResult, Tool.Failure>
  }
  /** Verifiers: the review's probe context (offered options, cap, ledger, scratch copies). */
  readonly probe?: ReviewProbe.Context
  /** A verifier whose scratch copy could not be made. Absent means this Session is not a verifier. */
  readonly probeUnavailable?: string
  /** Retains a raw output under its citation uri. */
  readonly retain?: (artifact: { readonly uri: string; readonly text: string }) => Effect.Effect<void>
}

export type Services = {
  /** The caller check of the hosting module: the caller must be the native `owner` seat. */
  readonly gate: (context: Tool.Context, owner: string, refusal: string) => Effect.Effect<void, Tool.Failure>
  readonly permission: PermissionV2.Interface
  readonly processes: AppProcess.Interface
}

// Process-local, as the review's Sessions are: a review runs in the process that drains its Sessions.
const bindings = new Map<string, Binding>()

/** Binds a review Session for the life of the scope. */
export const bind = (sessionID: string, binding: Binding) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      if (bindings.has(sessionID)) return yield* new Tool.Failure({ message: `review Session ${sessionID} is already bound` })
      bindings.set(sessionID, binding)
    }),
    () =>
      Effect.sync(() => {
        if (bindings.get(sessionID) === binding) bindings.delete(sessionID)
      }),
  )

export function readCode(
  sessionID: string,
): Effect.Effect<{ readonly source: CodeSource; readonly retain?: Binding["retain"] }, Tool.Failure, Scope.Scope> {
  return Effect.fail(new Tool.Failure({ message: `review-code-binding-missing: ${sessionID}` }))
}

export function tools(services: Services) {
  const bound = Effect.fn("ReviewTools.bound")(function* (name: string, context: Tool.Context) {
    yield* services.gate(context, ReviewSeatTools.SEAT, `${name} runs only as the review seat`)
    yield* services.permission
      .assert({
        action: name,
        resources: [ReviewSeatTools.SEAT],
        save: [ReviewSeatTools.SEAT],
        sessionID: context.sessionID,
        agent: context.agent,
        source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
      })
      .pipe(Effect.mapError((error) => new Tool.Failure({ message: `${name} was not permitted`, error })))
    const binding = bindings.get(context.sessionID)
    if (!binding) return yield* new Tool.Failure({ message: `${name} runs only inside a review` })
    return binding
  })

  return {
    [names.analyze]: Tool.make({
      description:
        "Page the analyzer items of your lens from this review's host-run analysis: `op: \"page\"`, your `lens`, an optional `filter` (rule, path, class) and the `cursor` of the previous page.",
      input: AnalyzeInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const binding = yield* bound(names.analyze, context)
          if (input.op === "run") return yield* new Tool.Failure({ message: "review_analyze run is host-only" })
          if (!binding.analyze) return yield* new Tool.Failure({ message: "review_analyze pages only in a lens Session" })
          const owned = binding.analyze.lenses
          const requested = input.lens ?? binding.analyze.lens
          if (owned ? !owned.includes(requested) : input.lens !== undefined && input.lens !== binding.analyze.lens)
            return yield* new Tool.Failure({ message: `review_analyze pages only your lens: ${(owned ?? [binding.analyze.lens]).join(", ")}` })
          const page = yield* binding.analyze.page({
            lens: owned ? requested : binding.analyze.lens,
            ...(input.filter ? { filter: input.filter } : {}),
            ...(input.cursor ? { cursor: input.cursor } : {}),
          })
          return { title: `${requested} items`, output: JSON.stringify(page), review: page }
        }),
    }),
    [names.probe]: Tool.make({
      description:
        "Run one probe option the brief offers for a candidate, in the review's scratch copy: the `candidate`, the `option` id and its `target`: hunk, test, script, integer property (language, law, source, seed, cases), interleave scenario (language, source, schedule), or Rust mutants (path, startLine, endLine).",
      input: ReviewProbe.Input,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const binding = yield* bound(names.probe, context)
          if (!binding.probe)
            return yield* new Tool.Failure({ message: binding.probeUnavailable ?? "review_probe runs only in a verifier Session" })
          const probed = yield* ReviewProbe.run(input, binding.probe).pipe(
            Effect.provideService(AppProcess.Service, services.processes),
            Effect.mapError((error) => new Tool.Failure({ message: "review_probe could not run", error })),
          )
          if (binding.retain) yield* binding.retain(probed.artifact)
          return {
            title: `${input.option} ${probed.result.status}`,
            output: JSON.stringify(probed.result),
            review: { result: probed.result, ...(probed.evidence ? { evidence: probed.evidence } : {}) },
          }
        }),
    }),
    [names.history]: Tool.make({
      description:
        "Read the reviewed repository's git history, read-only: `op` is `log`, `blame`, `pickaxe` or `show`, with the `path`, `range`, `pattern` or `rev` that op takes.",
      input: ReviewHistory.Input,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const binding = yield* bound(names.history, context)
          const read = yield* ReviewHistory.run(input, { repository: binding.repository, executionSessionID: context.sessionID }).pipe(
            Effect.provideService(AppProcess.Service, services.processes),
            Effect.mapError((error) => new Tool.Failure({ message: `review_history ${error.code}: ${error.reason}`, error })),
          )
          if (binding.retain) yield* binding.retain({ uri: read.uri, text: read.raw })
          return { title: `git ${input.op}`, output: read.text, review: { uri: read.uri, truncated: read.truncated } }
        }),
    }),
  }
}
