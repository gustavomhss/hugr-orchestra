export * as ReviewBindingV2 from "./review-binding"

import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { Effect, type Scope } from "effect"
import { ReviewTools } from "@orchestra/core/review/tools"
import { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import { ReviewItem } from "@orchestra/core/review-toolkit/item"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewFanoutV2 } from "../workflow/review-fanout"

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function deliverPage<T extends { readonly items: ReadonlyArray<ReviewItem.ToolItem> }>(
  result: T,
  observeItems: ((items: ReadonlyArray<ReviewItem.ToolItem>) => void) | undefined,
) {
  if (!observeItems) return Effect.succeed(result)
  try {
    observeItems(result.items)
  } catch (error) {
    if (error instanceof Error && error.message === "outcome-delivery-sealed")
      return Effect.fail(new Tool.Failure({ message: "outcome-delivery-sealed", metadata: { reason: "outcome-delivery-sealed" } }))
    return Effect.die(error)
  }
  return Effect.succeed(result)
}

const PROBE_TIMEOUT_SECONDS = 60

export const analysisStore = (cache: string) => path.join(os.tmpdir(), "orchestra-review", cache)

/** Logical citation URIs are keys, never filesystem paths supplied by a model. */
export const rawArtifactPath = (cache: string, uri: string) => path.join(analysisStore(cache), "raw", `${sha256(uri)}.json`)

/** The binding a review Session holds until the review's scope closes. Scratch copies are made once, for verifiers. */
export const reviewBinding = (held: {
  readonly worktree: string
  readonly diff: string
  readonly cache: string
  readonly lenses: string[]
  readonly ledger: ReviewProbe.Ledger
  readonly copies: Effect.Effect<
    { readonly head: ReviewScratch.Snapshot; readonly base: ReviewScratch.Snapshot },
    unknown,
    Scope.Scope
  >
  readonly headCommit?: string
}) => (bound: ReviewFanoutV2.BindInput) =>
  Effect.gen(function* () {
    if (bound.lenses) {
      for (const id of bound.lenses) if (!held.lenses.includes(id)) held.lenses.push(id)
    }
    const pageable = bound.lens !== undefined || (bound.lenses?.length ?? 0) > 0
    const needsProbe = bound.role === "verifier" && Object.values(bound.offered ?? {}).flat().some((id) => ReviewProbe.BUILT.some((built) => built === id))
    const made = needsProbe ? yield* held.copies.pipe(Effect.catch(() => Effect.succeed(undefined))) : undefined
    const codeSource = held.copies.pipe(
      Effect.mapError(() => new Tool.Failure({ message: "review-code-source-unavailable" })),
      Effect.map((made) => ({
        directory: made.head.root,
        worktree: held.worktree,
        ...(made.head.kind === "commit" && held.headCommit ? { commit: held.headCommit } : {}),
      })),
    )
    return {
      repository: held.worktree,
      codeSource,
      retain: (artifact: { readonly uri: string; readonly text: string }) => Effect.promise(async () => {
        await Bun.write(rawArtifactPath(held.cache, artifact.uri), JSON.stringify(artifact))
      }),
      ...(pageable
        ? {
            analyze: {
              lens: bound.lens ?? held.lenses[0] ?? "none",
              ...(bound.role === "lead" ? { lenses: held.lenses } : {}),
              page: (input: ReviewTools.Page) =>
                ReviewAnalyze.page({
                  store: analysisStore(held.cache),
                  uri: typeof bound.retained === "function" ? bound.retained() : bound.retained,
                  lens: input.lens,
                  ...(input.filter ? { filter: input.filter } : {}),
                  ...(input.cursor ? { cursor: input.cursor } : {}),
                }).pipe(
                  Effect.mapError((error) => new Tool.Failure({ message: `review_analyze ${error.reason}` })),
                  Effect.flatMap((result) => deliverPage(result, bound.observeItems)),
                ),
            },
          }
        : {}),
      ...(made
        ? {
            probe: {
              reviewID: held.cache,
              head: made.head,
              base: made.base,
              offered: bound.offered ?? {},
              cap: bound.cap,
              hunks: ReviewFanoutV2.hunks(held.diff),
              ledger: held.ledger,
              timeoutSeconds: PROBE_TIMEOUT_SECONDS,
              ...(bound.observeProbes ? { observe: bound.observeProbes } : {}),
            },
          }
        : {}),
      ...(needsProbe && !made ? { probeUnavailable: "review_probe could not make a scratch copy of the reviewed tree" } : {}),
    }
  })
