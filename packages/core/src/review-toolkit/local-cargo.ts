export * as ReviewLocalCargo from "./local-cargo"

import { Effect } from "effect"
import type { FSUtil } from "../fs-util"
import type { AppProcess } from "../process"
import { ReviewLocalCargoInput } from "./local-cargo-input"
import { ReviewLocalCheckResult } from "./local-check-result"
import { ReviewLocalCheckScope } from "./local-check-scope"
import type { ReviewLocalCheckTypes } from "./local-check-types"
import { ReviewLocalReadProcess } from "./local-read-process"
import { ReviewLocalTools } from "./local-tools"

/** A base-authorized raw dependency check; never acquires tools or promotes output into findings. */
export function run(input: ReviewLocalCheckTypes.Input, execute: typeof ReviewLocalReadProcess.run = ReviewLocalReadProcess.run): Effect.Effect<ReviewLocalCheckTypes.Result, never, FSUtil.Service | AppProcess.Service> {
  return Effect.gen(function* () {
    if (process.platform !== "linux" || process.arch !== "x64") return { status: "not-run" as const, reason: "read-sandbox-unsupported-host" }
    if (input.configured.projectionDigest !== input.baseProjectionDigest) return { status: "not-run" as const, reason: "policy-projection-mismatch" }
    const selection = ReviewLocalCheckScope.select({ ...input, tool: "cargo-machete" })
    if (!selection.ok) return { status: "not-run" as const, reason: selection.reason }
    const located = yield* ReviewLocalTools.locate("cargo-machete")
    if (!located.ok) return { status: "not-run" as const, reason: located.reason }
    const preflight = yield* ReviewLocalCargoInput.check(input.projection)
    if (preflight) return { ...preflight, identity: located.identity, selection }
    const ran = yield* execute({ executable: located.identity.executable, args: [...selection.flags], root: input.projection.root })
    if ("denied" in ran) return { status: "not-run" as const, reason: ran.denied, identity: located.identity, selection }
    return { ...ReviewLocalCheckResult.settle("cargo-machete", ran.outcome), identity: located.identity, selection, outcome: ran.outcome }
  })
}
