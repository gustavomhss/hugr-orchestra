export * as ReviewAnalysisV2 from "./review-analysis"

import { Effect } from "effect"
import { AppProcess } from "@orchestra/core/process"
import type { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import type { ReviewReleaseEvidence } from "@orchestra/core/review-toolkit/release-evidence"
import type { SessionSchema } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import type { ReviewFanoutV2 } from "../workflow/review-fanout"
import { ReviewBindingV2 } from "./review-binding"

/** The host's analyze step (fan-out step 2), at the reviewed revisions. */
export type Analyze = (
  input: ReviewFanoutV2.AnalyzeInput & {
    readonly worktree: string
    readonly release?: ReviewReleaseEvidence.Captured
    readonly base: string
    readonly head: string
    readonly sessionID: SessionSchema.ID
    readonly catalog: ReviewCatalog.Catalog
    readonly evidence?: ReviewAnalyze.Evidence
    readonly changes?: ReadonlyArray<{ readonly path: string; readonly added: ReadonlyArray<{ readonly line: number }> }>
  },
) => Effect.Effect<ReviewFanoutV2.Analysis, Tool.Failure>

/** D6 ceiling. The opened project may enter the build lane. An external target must pass false and stay at repo. */
export function analyzeLane(trusted: boolean) {
  return trusted ? "build" as const : "repo" as const
}

export const step = (processes: AppProcess.Interface): Analyze => (input) => {
  const changed: Record<string, { start: number; end: number }[]> = {}
  for (const change of input.changes ?? []) {
    const lines = change.added.map((line) => line.line)
    if (lines.length === 0) continue
    changed[change.path] = [{ start: Math.min(...lines), end: Math.max(...lines) }]
  }
  // This call reviews the project the owner opened. An external target must not reuse it with trusted true.
  const trusted = true
  return ReviewAnalyze.run({
    worktree: input.worktree,
    base: input.base,
    head: input.head,
    tier: input.executionTier ?? ReviewRouting.tier(input.routing),
    profile: input.routing.profile.id,
    ...(input.release === undefined ? {} : { release: input.release }),
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    store: ReviewBindingV2.analysisStore(input.cache),
    changed,
    trusted,
    catalog: input.catalog,
    lane: analyzeLane(trusted),
    packs: input.packs.map((pack) => pack.id),
    scope: input.repositoryFiles === undefined ? "diff" : "files",
    files: [...input.files],
    ...(input.repositoryFiles === undefined ? {} : { repositoryFiles: input.repositoryFiles }),
  }).pipe(
    Effect.provideService(AppProcess.Service, processes),
    Effect.mapError((error) => {
      const reason = error instanceof ReviewAnalyze.Failed ? error.reason : String(error)
      return new Tool.Failure({ message: `ReviewAnalyzeFailed: ${reason}`,
        ...(reason.startsWith("engagement-") ? { metadata: { reason } } : {}) })
    }),
  )
}

