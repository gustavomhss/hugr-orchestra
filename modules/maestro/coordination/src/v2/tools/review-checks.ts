export * as MaestroReviewCheckTools from "./review-checks"

import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import type { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { ReviewLocalTools } from "@orchestra/core/review-toolkit/local-tools"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { Tool } from "@orchestra/core/tool/tool"
import type { MaestroToolGate } from "./gate"

export const name = "maestro_prepare_review_checks"
const Input = Schema.Struct({ tools: Schema.Array(Schema.Literals(["shfmt", "cargo-machete"])).check(Schema.isMinLength(1), Schema.isMaxLength(2)) })

/** Explicit owner preparation, kept outside every analysis path and in this host process. */
export function tools(input: {
  readonly gate: MaestroToolGate.Gate
  readonly permission: PermissionV2.Interface
  readonly processes: AppProcess.Interface
}) {
  return {
    [name]: Tool.make({
      description: "Prepare the pinned shfmt and/or cargo-machete local review checks and their read sandbox. Maestro only, on an explicit owner request. This asks for one-time permission before downloads, licence notices and version probes. Linux x64 analysis only; repeat explicitly after a host restart.",
      input: Input,
      output: Schema.String,
      execute: (params, context) => Effect.gen(function* () {
        yield* input.gate(context, AgentV2.defaultID, "Review check preparation requires Maestro")
        if (process.platform !== "linux" || process.arch !== "x64") return JSON.stringify({ status: "not-run", reason: "read-sandbox-unsupported-host", tools: [] })
        const requested = [...new Set(params.tools)]
        yield* input.permission.askExplicit({
          action: "review_checks_prepare",
          resources: ["review-check:read-sandbox", ...requested.map((tool) => `review-check:${tool}`)],
          sessionID: context.sessionID,
          agent: context.agent,
          source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
        }).pipe(Effect.mapError((error) => new Tool.Failure({ message: String(error) })))
        const runtime = yield* ToolSafetySandboxRuntime.ready()
        if ("reason" in runtime) return JSON.stringify({ status: "not-run", reason: runtime.reason, tools: [] })
        const prepared = yield* Effect.forEach(requested, (tool) => ReviewLocalTools.prepare(tool).pipe(Effect.map((result) => ({ tool, ...result }))), { concurrency: 1 })
        return JSON.stringify({ status: prepared.every((result) => result.ok) ? "ready" : "not-run", tools: prepared })
      }).pipe(Effect.provideService(AppProcess.Service, input.processes)),
    }),
  }
}
