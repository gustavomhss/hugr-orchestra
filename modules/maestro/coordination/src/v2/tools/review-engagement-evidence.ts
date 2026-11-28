export * as MaestroReviewEvidenceTools from "./review-engagement-evidence"

import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import type { Database } from "@orchestra/core/database/database"
import type { FSUtil } from "@orchestra/core/fs-util"
import type { Global } from "@orchestra/core/global"
import type { PermissionV2 } from "@orchestra/core/permission"
import type { SessionStore } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEngagementArtifactsV2 } from "../workflow/review-engagement-artifacts"
import { ReviewFixArtifactsV2 } from "../workflow/review-fix-artifacts"
import type { MaestroToolGate } from "./gate"
import { ReviewEngagementStoreV2 } from "./review-engagement-store"

export const name = "maestro_read_review_evidence"
const failure = (reason: string, detail: string) => new Tool.Failure({
  message: `${reason}: ${detail}`, metadata: { reason },
})

/** A report ID identifies retained bytes only inside the actual parent Session's namespace. */
export function tools(input: {
  readonly gate: MaestroToolGate.Gate
  readonly permission: PermissionV2.Interface
  readonly store: SessionStore.Interface
  readonly database: Database.Interface
  readonly fs: FSUtil.Interface
  readonly global: Global.Interface
}) {
  return {
    [name]: Tool.make({
      description: "Read retained evidence of an independent Lucy engagement owned by this Maestro Session. Use manifest with reportID, then read with the returned artifactID and optional continuation cursor. Pages contain up to 4096 original bytes as base64. This tool grants no execution authority.",
      input: ReviewEngagementArtifactsV2.Input,
      output: Schema.String,
      execute: (params, context) => Effect.gen(function* () {
        yield* Effect.yieldNow
        yield* input.gate(context, AgentV2.defaultID, "Engagement evidence requires Maestro").pipe(
          Effect.mapError(() => failure("engagement-evidence-forbidden", "the actual caller must be Maestro")),
        )
        yield* input.permission.assert({
          action: name, resources: [`session:${context.sessionID}`], sessionID: context.sessionID,
          agent: context.agent,
          source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
        }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Engagement evidence was not permitted", error })))
        const parent = yield* input.store.get(context.sessionID)
        if (!parent) return yield* failure("engagement-evidence-not-found", "no authorized terminal report")
        const store = ReviewEngagementStoreV2.make(input.database)
        const terminal = yield* store.lookup(parent, params.reportID)
        const artifacts = yield* ReviewEngagementArtifactsV2.make({ database: input.database, fs: input.fs,
          global: input.global, readMessage: input.store.message })
        if (terminal) return yield* artifacts.resolve(terminal, params)
        const fix = yield* store.lookupFix(parent, params.reportID)
        if (!fix) return yield* failure("engagement-evidence-not-found", "no authorized terminal report")
        const evidence = yield* ReviewFixArtifactsV2.load(artifacts, fix)
        return yield* ReviewEngagementArtifactsV2.resolveEvidence(params, evidence)
      }).pipe(Effect.timeoutOrElse({ duration: "60 seconds", orElse: () =>
        Effect.fail(failure("engagement-evidence-timeout", "bounded evidence read elapsed")) })),
    }),
  }
}

