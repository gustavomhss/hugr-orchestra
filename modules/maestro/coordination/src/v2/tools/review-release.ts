export * as ReviewReleaseRequestV2 from "./review-release"

import { Effect } from "effect"
import { ReviewReleaseEvidence } from "@orchestra/core/review-toolkit/release-evidence"
import { Tool } from "@orchestra/core/tool/tool"

export type Input = {
  readonly profile: string
  readonly stage: "plan" | "code"
  readonly release?: ReviewReleaseEvidence.Input
  readonly previousProfile?: string
}

export const capture: (input: Input, directory: string) => Effect.Effect<ReviewReleaseEvidence.Captured | undefined, Tool.Failure> =
  Effect.fn("ReviewReleaseRequestV2.capture")(function* (input, directory) {
    if (input.release !== undefined && input.profile !== "release") return yield* new Tool.Failure({ message: "release-profile" })
    if (input.profile === "rereview" && input.previousProfile === "release") return yield* new Tool.Failure({ message: "release-rereview" })
    if (input.profile === "release" && input.stage !== "code") return yield* new Tool.Failure({ message: "release-stage" })
    if (input.profile !== "release") return undefined
    return yield* ReviewReleaseEvidence.capture(directory, input.release)
  })

export function key(base: string, captured?: ReviewReleaseEvidence.Captured) {
  if (captured === undefined) return base
  return `${base}_release_${captured.identity}`
}
