export * as ReviewScopedProbeV2 from "./review-scoped-probe"

import { Effect } from "effect"
import type { GitCli } from "@orchestra/core/git-cli"
import { AppProcess } from "@orchestra/core/process"
import { ReviewScopedTypecheck } from "@orchestra/core/review-toolkit/scoped-typecheck"
import type { Tool } from "@orchestra/core/tool/tool"
import type { ReviewEvidenceCollectorV2 } from "./review-engagement-artifact-collector"
import type { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"
import { ReviewEngagementSourceV2 } from "./review-engagement-source"
import { ReviewScopedProbeEvidenceV2 } from "./review-scoped-probe-evidence"

type Candidate = { readonly id: string; readonly path: string; readonly line: number; readonly endLine?: number }
type Witness = { readonly candidate: string; readonly uri: string; readonly command: string; readonly status: "fail";
  readonly diagnostics: ReviewScopedProbeEvidenceV2.Proof["diagnostics"] }
export type Run = (candidate: Candidate) => Effect.Effect<Witness | undefined, Tool.Failure>

export function make(input: { readonly git: GitCli.Interface; readonly worktree: string; readonly source: ReviewEngagementEvidenceV2.Prepared;
  readonly collector: Pick<ReviewEvidenceCollectorV2.Collector, "scopedProbe">; readonly processes: AppProcess.Interface }) {
  // Bound compilation across all independent verifier batches in an engagement.
  let attempts = 0
  const run = (candidate: string, path: string) => Effect.gen(function* () {
    const file = input.source.files.find((file) => file.path === path)
    if (process.platform !== "linux" || process.arch !== "x64" || !file || file.size === 0 || file.size > 65536 ||
      !path.endsWith(".ts") || path.endsWith(".d.ts") || attempts >= 4) return undefined
    attempts++
    const bytes = yield* ReviewEngagementSourceV2.blob(input.git, input.worktree, file)
    const observation = yield* ReviewScopedTypecheck.run({ path, oid: file.oid, bytes }).pipe(
      Effect.provideService(AppProcess.Service, input.processes))
    if (observation.status === "not-run") return undefined
    return ReviewScopedProbeEvidenceV2.make(candidate, input.source, path, bytes, observation)
  })
  const initial: Run = (candidate) => Effect.gen(function* () {
    const proof = yield* run(candidate.id, candidate.path)
    if (!proof || proof.status !== "fail" || !proof.diagnostics.some((item) =>
      item.line >= candidate.line && item.line <= (candidate.endLine ?? candidate.line))) return undefined
    yield* input.collector.scopedProbe(proof)
    return { candidate: candidate.id, uri: ReviewScopedProbeEvidenceV2.uri(proof.proofID),
      command: ReviewScopedProbeEvidenceV2.command, status: "fail", diagnostics: proof.diagnostics }
  })
  return { initial, run }
}
