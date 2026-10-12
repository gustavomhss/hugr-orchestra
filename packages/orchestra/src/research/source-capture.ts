export * as ResearchSourceCapture from "./source-capture"

import { Cause, Context, Effect, Exit, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchTools } from "./binding"
import { ResearchExecution } from "./allowance"
import { Tool } from "@/tool/tool"
import { ToolSafety } from "@orchestra/core/tool-safety"

const DISPLAY_NOTICE = "Native tool display only; this receipt does not prove original-source completeness, absence, or runtime behavior."

// Issued by the native registry, never decoded from model arguments or plugin metadata.
export const Current = Context.Reference<((input: ResearchRecords.CaptureInput) => Effect.Effect<Research.SourceReceipt>) | undefined>(
  "@orchestra/ResearchSourceCapture/Current", { defaultValue: () => undefined },
)

export const make = Effect.gen(function* () {
  const records = yield* ResearchRecords.Service
  const execution = yield* ResearchExecution.Service
  const run = yield* ResearchTools.make
  const withCapture = <E, R>(ctx: Tool.Context, name: string, effect: Effect.Effect<Tool.ExecuteResult, E, R>, args: unknown = {}) => {
    if (ctx.agentID !== "jimmy" || !ctx.callID || !["read", "webfetch", "lsp", "websearch", "atlas_context", "research_capture"].includes(name)) return effect
    return Effect.gen(function* () {
      if (yield* Current) return yield* effect
      const previous = yield* run(ctx, name, (binding, context) => records.beginAcquisition(binding, context,
        ResearchLedger.digest(ResearchLedger.canonical([name, args])),
      ), false).pipe(Effect.orDie)
      if (previous?.source) {
        const ref = previous.source
        yield* ctx.ask({ permission: "research_view", patterns: ["jimmy"], always: [], metadata: { replay: true } })
        const page = yield* run(ctx, name, (binding) => records.view(binding, { action: "source", ref }), false).pipe(Effect.orDie)
        if (!("receipt" in page) || !("origin" in page.receipt))
          return yield* Effect.die(new Research.Error({ code: "source_unavailable", message: "Historical acquisition is not a retained source" }))
        return { title: "Retained source replay", output: `${page.text}\n\nHistorical retained representation; no live source was reacquired.\n${JSON.stringify({ ref: previous.source, cursor: page.cursor })}${page.receipt.origin.kind === "tool-output" ? `\n${DISPLAY_NOTICE}` : ""}`,
          metadata: { researchSource: page.receipt, truncated: !page.complete, ...(page.cursor ? { researchCursor: page.cursor } : {}), researchReplay: true } }
      }
      const state: { receipt?: Research.SourceReceipt } = {}
      return yield* effect.pipe(Effect.provideService(Current, (input) => run(ctx, name, (binding, context) =>
        execution.captureBytes(ctx.sessionID, `${ctx.messageID}:${ctx.callID}:${input.representation}`,
          typeof input.content === "string" ? Buffer.byteLength(input.content, "utf8") : input.content.byteLength,
          ToolSafety.inspect(typeof input.content === "string" ? input.content : Buffer.from(input.content).toString("utf8")).pipe(
            Effect.andThen(records.capture(binding, context, input)),
          )), false,
      ).pipe(Effect.tap((receipt) => Effect.sync(() => { state.receipt = receipt })), Effect.orDie)),
      Effect.onExit((exit) => {
        const error = Exit.isFailure(exit) ? exit.cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
          : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error || error instanceof ToolSafety.Denied) : undefined
        const interrupted = Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)
        return run(ctx, name, (binding, context) => records.attempt(binding, context, {
          outcome: Exit.isSuccess(exit) && state.receipt?.complete ? "captured" : error instanceof Research.Error && error.code === "publication_uncertain"
            ? "uncertain" : state.receipt ? "partial" : "unavailable",
          stage: error instanceof Research.Error && ["publication_uncertain", "budget_exhausted", "conflict"].includes(error.code)
            ? "retention" : state.receipt ? "representation" : "acquisition",
          reason: interrupted ? "interrupted" : error instanceof Research.Error ? error.code : error instanceof ToolSafety.Denied ? error.reason
            : Exit.isFailure(exit) ? "acquisition_failed" : state.receipt?.complete ? "complete" : state.receipt ? "bounded_projection" : "no_supported_source",
          ...(state.receipt ? { source: state.receipt.ref } : {}),
          returned: Exit.isSuccess(exit),
        }), false).pipe(Effect.orDie)
      }))
    })
  }
  const retain = <M extends Tool.ExecuteResult["metadata"]>(ctx: Tool.Context, name: string, result: Tool.ExecuteResult<M>) => {
    if (ctx.agentID !== "jimmy" || !ctx.callID || !["read", "webfetch", "lsp", "websearch", "atlas_context"].includes(name))
      return Effect.succeed(result)
    const admitted = Schema.decodeUnknownOption(Research.SourceReceipt)(result.metadata.researchSource)
    if (admitted._tag === "Some") return Effect.succeed({
      ...result,
      output: `${result.output}\n\nRetained source evidence: ${JSON.stringify(admitted.value.ref)}\nLocators address retained representation from line 1; original coordinates are recorded separately.${admitted.value.origin.kind === "tool-output" ? `\n${DISPLAY_NOTICE}` : ""}`,
    })
    return Effect.gen(function* () {
      const capture = yield* Current
      const input = {
        origin: { kind: "tool-output", uri: `native:${ctx.sessionID}/${ctx.messageID}/${ctx.callID}/${name}` },
        representation: "text", mediaType: "text/plain", content: result.output,
        complete: result.metadata.truncated !== true,
      } satisfies ResearchRecords.CaptureInput
      const receipt = capture ? yield* capture(input) : yield* run(ctx, name, (binding, context) => execution.captureBytes(ctx.sessionID,
        `${ctx.messageID}:${ctx.callID}:text`, Buffer.byteLength(result.output, "utf8"), records.capture(binding, context, input)), false)
      return {
        ...result,
        output: `${result.output}\n\nRetained output evidence: ${JSON.stringify(receipt.ref)}\nThis is the native tool's returned representation, not proof of original-source completeness or runtime behavior.`,
        metadata: { ...result.metadata, researchSource: receipt },
      }
    }).pipe(Effect.orDie)
  }
  return { withCapture, retain }
})
