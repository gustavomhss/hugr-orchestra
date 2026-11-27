export * as MaestroReviewCode from "./review-code"

import { createHash } from "node:crypto"
import { Effect } from "effect"
import { Config } from "@orchestra/core/config"
import type { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { CodeIndexQuery } from "@orchestra/core/research-toolkit/code-index/query"
import type { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { Locate } from "@orchestra/core/research-toolkit/locate"
import { CodeSearch } from "@orchestra/core/research-toolkit/search"
import { ReviewCodeSource } from "@orchestra/core/review/code-source"
import { ReviewSeatTools } from "@orchestra/core/review/seat-tools"
import { ReviewTools } from "@orchestra/core/review/tools"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { Tool } from "@orchestra/core/tool/tool"
import { Research } from "@orchestra/schema/research"
import type { MaestroToolGate } from "./gate"

export type Services = {
  readonly gate: MaestroToolGate.Gate
  readonly permission: PermissionV2.Interface
  readonly processes: AppProcess.Interface
  readonly reviewRipgrep: Ripgrep.RipgrepBinary.Interface
  readonly config: Config.Interface
}

export type Request =
  | { readonly name: "code_search"; readonly input: CodeIndex.SearchInput }
  | { readonly name: "code_query"; readonly input: CodeIndex.CodeQuery }
  | { readonly name: "code_locate"; readonly input: CodeIndex.LocateInput }

type Evidence = { readonly uri: string; readonly sha256: string }
const unavailable = (message: string) => new Research.Error({ code: "index_unavailable", message })

/** One review call owns its deadline, source projection and exact binding through retained evidence delivery. */
export const run = (services: Services, request: Request, context: Tool.Context) => Effect.gen(function* () {
  const completed = yield* Effect.scoped(Effect.gen(function* () {
    yield* services.gate(context, ReviewSeatTools.SEAT, `${request.name} runs only as the review seat`)
    yield* services.permission.assert({
      action: request.name, resources: [ReviewSeatTools.SEAT], save: [ReviewSeatTools.SEAT],
      sessionID: context.sessionID, agent: context.agent,
      source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
    }).pipe(Effect.mapError((error) => new Tool.Failure({ message: `${request.name} was not permitted`, error })))
    const access = yield* ReviewTools.readCode(context.sessionID)
    const active = access.active.pipe(Effect.mapError((error) => new Research.Error({ code: "binding_missing", message: error.message })))
    const checked = <A, R>(effect: Effect.Effect<A, Research.Error, R>) => active.pipe(Effect.andThen(effect), Effect.tap(() => active))
    const normalized = normalize(access.source.worktree, request)
    if (!normalized) return yield* new Research.Error({ code: "reference_invalid", message: "Path is outside the captured review source" })
    if (normalized.name === "code_query" && !access.source.commit)
      return yield* unavailable("The captured review has no semantic commit for a prepared index")
    if (!access.retain) return yield* new Tool.Failure({ message: "review-code-retention-unavailable" })
    const retain = access.retain
    const view = yield* checked(ReviewCodeSource.open(access.source))
    yield* ReviewCodeSource.checkPaths(view, requestedPaths(normalized))
    const source = { worktree: view.worktree, tree: view.tree, ...(view.commit ? { commit: view.commit } : {}) }
    const capture = (value: unknown): Effect.Effect<Evidence, Research.Error> => Effect.gen(function* () {
      const text = JSON.stringify(value)
      const sha256 = createHash("sha256").update(text, "utf8").digest("hex")
      const uri = `review-code:${context.sessionID}/${sha256}`
      yield* active
      yield* retain({ uri, text }).pipe(Effect.catchDefect(() =>
        Effect.fail(new Research.Error({ code: "source_unavailable", message: "review-code-retention-unavailable" }))))
      yield* active
      return { uri, sha256 }
    })
    const manifest = yield* ResearchToolkit.Manifest
    // Reading a prepared shard needs its pinned producer identity, never the producer executable or installer.
    const indexers = Object.fromEntries(Object.values(manifest).flatMap((pack) => pack?.fit.role === "indexer"
      ? pack.fit.languages.map((language) => [language, { id: pack.id, version: pack.version }] as const) : []))
    const storeRoot = yield* ResearchToolkit.Root
    const entries = yield* services.config.entries()
    const caps = ResearchToolkit.caps(Config.latest(entries, "research")?.limits)
    const state: { snapshot?: string; indexUnavailable?: string } = {}
    const query = (input: CodeIndex.CodeQuery) => checked(view.commit
      ? CodeIndexQuery.run({ root: view.worktree, git: view.git, storeRoot, indexers, readOnly: true,
        overlay: () => Effect.succeed([]) }, input)
      : Effect.fail(unavailable("The captured review has no semantic commit for a prepared index"))).pipe(
      Effect.tapError((error) => Effect.sync(() => {
        if (error.code === "index_unavailable" || error.code === "index_building") state.indexUnavailable = error.message
      })),
    )
    const projection = normalized.name === "code_query" ? undefined
      : yield* checked(ReviewCodeSource.project(view).pipe(Effect.provideService(ResearchToolkit.Caps, caps)))
    const search = (input: CodeIndex.SearchInput) => checked(CodeSearch.run(input, {
      cwd: projection!.directory, ...(view.commit ? { commit: view.commit } : {}),
    }).pipe(
      Effect.mapError((failure) => new Research.Error({
        code: failure.reason === "index_unavailable" ? "index_unavailable" : failure.reason === "pattern_invalid" ? "unsupported" : "source_unavailable",
        message: failure.message,
      })),
      Effect.map((result) => projection?.skipped.length ? { ...result, basis: { ...result.basis,
        coverage: { ...result.basis.coverage, complete: false, skipped: [...result.basis.coverage.skipped, ...projection.skipped] },
      } } : result),
      Effect.provideService(AppProcess.Service, services.processes),
      Effect.provideService(Ripgrep.RipgrepBinary.Service, services.reviewRipgrep),
    ))
    const found = normalized.name === "code_query" ? yield* query(normalized.input)
      : normalized.name === "code_search" ? yield* search(normalized.input)
      : yield* Locate.run(normalized.input, {
        search, query, read: (file) => checked(ReviewCodeSource.read(view, file)),
        retain: (snapshot) => {
          state.snapshot = snapshot
          return capture({ source, snapshot })
        },
      })
    const result = state.indexUnavailable ? { ...found, basis: { ...found.basis, coverage: {
      ...found.basis.coverage, complete: false,
      skipped: [...found.basis.coverage.skipped, { path: ".", reason: `prepared-index-unavailable: ${state.indexUnavailable}` }],
    } } } : found
    const evidence = yield* capture({ source, result, ...(state.snapshot ? { snapshot: state.snapshot } : {}) })
    const output = {
      title: normalized.name === "code_search" ? normalized.input.pattern : normalized.name,
      output: [JSON.stringify({ result, evidence }), ...(state.snapshot ? [shown(state.snapshot)] : [])].join("\n\n"),
    }
    return { active: access.active, output }
  }))
  // Projection cleanup can itself suspend. The final delivery check follows it, using the original binding identity.
  yield* completed.active
  return completed.output
}).pipe(
  Effect.catchTag("Research.Error", (error) => Effect.fail(new Tool.Failure({ message:
    error.code === "source_unavailable" ? `review-code-source-unavailable: ${error.message}`
      : error.code === "binding_missing" ? error.message : `Review CODE ${error.code}: ${error.message}` }))),
  Effect.catchDefect(() => Effect.fail(new Tool.Failure({ message: "review-code-source-unavailable: CODE read failed" }))),
  // One budget surrounds acquisition, all reads, retention and scoped cleanup; no phase starts a fresh timer.
  Effect.timeoutOrElse({ duration: "60 seconds", orElse: () => Effect.fail(new Tool.Failure({ message: "review-code-timeout" })) }),
  Effect.provideService(AppProcess.Service, services.processes),
  Effect.provideService(Ripgrep.RipgrepBinary.Service, services.reviewRipgrep),
)

function normalize(worktree: string, request: Request): Request | undefined {
  if (request.name !== "code_query") {
    const paths = request.input.paths?.map((file) => ReviewCodeSource.relative(worktree, file, true))
    if (paths?.some((file) => file === undefined)) return
    return { ...request, input: { ...request.input, ...(paths ? { paths: paths as string[] } : {}) } } as Request
  }
  const input = request.input
  const file = "path" in input && input.path !== undefined ? ReviewCodeSource.relative(worktree, input.path) : undefined
  const at = "at" in input && input.at ? ReviewCodeSource.relative(worktree, input.at.path) : undefined
  if (("path" in input && input.path !== undefined && file === undefined) || ("at" in input && input.at && at === undefined)) return
  return { name: request.name, input: { ...input,
    ...(file !== undefined ? { path: file } : {}),
    ...("at" in input && input.at ? { at: { ...input.at, path: at! } } : {}),
  } as CodeIndex.CodeQuery }
}

function requestedPaths(request: Request) {
  if (request.name !== "code_query") return request.input.paths ?? []
  return ["path" in request.input ? request.input.path : undefined, "at" in request.input ? request.input.at?.path : undefined]
    .filter((file): file is string => file !== undefined)
}

function shown(snapshot: string) {
  const budget = { left: 320 }
  return snapshot.split("\n\n").slice(1).map((block) => {
    const [head, ...lines] = block.split("\n")
    const kept = lines.slice(0, Math.min(40, budget.left))
    budget.left -= kept.length
    return [head, ...kept, ...(kept.length < lines.length ? ["(more original lines retained in the evidence)"] : [])].join("\n")
  }).join("\n\n")
}
