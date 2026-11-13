export * as ReviewLocalShfmt from "./local-shfmt"

import path from "path"
import { Effect } from "effect"
import type { FSUtil } from "../fs-util"
import type { AppProcess } from "../process"
import { ReviewLocalCheckResult } from "./local-check-result"
import { ReviewLocalCheckScope } from "./local-check-scope"
import type { ReviewLocalCheckTypes } from "./local-check-types"
import { ReviewLocalReadProcess } from "./local-read-process"
import { ReviewLocalTools } from "./local-tools"

/** A base-authorized raw formatting check; never acquires tools or promotes output into findings. */
export function run(input: ReviewLocalCheckTypes.Input, execute: typeof ReviewLocalReadProcess.run = ReviewLocalReadProcess.run): Effect.Effect<ReviewLocalCheckTypes.Result, never, FSUtil.Service | AppProcess.Service> {
  return Effect.gen(function* () {
    if (process.platform !== "linux" || process.arch !== "x64") return { status: "not-run" as const, reason: "read-sandbox-unsupported-host" }
    if (input.configured.projectionDigest !== input.baseProjectionDigest) return { status: "not-run" as const, reason: "policy-projection-mismatch" }
    const selection = ReviewLocalCheckScope.select({ ...input, tool: "shfmt" })
    if (!selection.ok) return { status: "not-run" as const, reason: selection.reason }
    const located = yield* ReviewLocalTools.locate("shfmt")
    if (!located.ok) return { status: "not-run" as const, reason: located.reason }
    const ran = yield* execute({ executable: located.identity.executable, args: [...selection.flags, ...selection.files.map((file) => path.join(input.projection.root, file))], root: input.projection.root })
    if ("denied" in ran) return { status: "not-run" as const, reason: ran.denied, identity: located.identity, selection }
    return { ...ReviewLocalCheckResult.settle("shfmt", ran.outcome), identity: located.identity, selection, outcome: ran.outcome }
  })
}
