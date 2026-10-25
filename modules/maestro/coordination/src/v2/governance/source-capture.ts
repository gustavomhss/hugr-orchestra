export * as SourceCaptureV2 from "./source-capture"

import path from "node:path"
import { ToolOutput } from "@orchestra/llm"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { EventTable } from "@orchestra/core/event/sql"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import type { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { SessionSchema } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { ToolSafety } from "@orchestra/core/tool-safety"
import type { Tool } from "@orchestra/core/tool/tool"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { ResearchDispatchV2 } from "./research"

// Acquisition receipts. Every research-seat call of a tool
// that acquires a source opens an acquisition request, replays a retried call from what it retained instead of
// reacquiring, and settles one attempt receipt. A retained tool's output that captured no source of its own is captured
// as the tool's returned representation.

export type Services = ResearchDispatchV2.Services & {
  readonly records: ResearchRecords.Interface
  /** The research seat's own skill tree; reading it is method, not a source (J1.8). */
  readonly skillRoot?: string
}

const RETAINED: ReadonlySet<string> = new Set(ResearchSeatTools.RETAINED)

const DISPLAY_NOTICE =
  "Native tool display only; this receipt does not prove original-source completeness, absence, or runtime behavior."

// A call's own captures, latest representation first: a derived representation is the source V1 kept for the attempt.
const REPRESENTATIONS = ["structured-json", "markdown", "html", "text", "received"] as const

export function acquire(services: Services) {
  return <E, R>(input: ToolSafety.Invocation, effect: Effect.Effect<ToolSafety.Settlement, E, R>) =>
    Effect.gen(function* () {
      if (
        services.canonical(input.agent ?? "") !== ResearchSeatTools.SEAT ||
        !input.assistantMessageID ||
        !Schema.is(SessionSchema.ID)(input.sessionID) ||
        !(RETAINED.has(input.tool) || input.tool === "research_capture") ||
        skillRead(services, input)
      )
        return yield* effect
      const session = yield* services.store.get(input.sessionID)
      const admitted = session ? yield* ResearchDispatchV2.allowance(services, session).pipe(Effect.mapError(hold)) : undefined
      if (!admitted) return yield* effect
      const binding = admitted.allowance.binding
      const context = {
        sessionID: input.sessionID,
        agent: AgentV2.ID.make(input.agent ?? ResearchSeatTools.SEAT),
        assistantMessageID: SessionMessage.ID.make(input.assistantMessageID),
        toolCallID: input.callID,
      }
      const previous = yield* services.records
        .beginAcquisition(binding, context, ResearchLedger.digest(ResearchLedger.canonical([input.tool, input.args])))
        .pipe(Effect.mapError(hold))
      if (previous?.source) {
        const page = yield* services.records.view(binding, { action: "source", ref: previous.source }).pipe(Effect.mapError(hold))
        if (!("receipt" in page) || !("origin" in page.receipt))
          return yield* hold(new Research.Error({ code: "source_unavailable", message: "Historical acquisition is not a retained source" }))
        const text = `${page.text}\n\nHistorical retained representation; no live source was reacquired.\n${JSON.stringify({ ref: previous.source, cursor: page.cursor })}${page.receipt.origin.kind === "tool-output" ? `\n${DISPLAY_NOTICE}` : ""}`
        const output = ToolOutput.make({ title: "Retained source replay", researchSource: page.receipt, researchReplay: true }, [{ type: "text", text }])
        return { result: ToolOutput.toResultValue(output), output } satisfies ToolSafety.Settlement
      }
      const state: { receipt?: Research.SourceReceipt } = {}
      return yield* effect.pipe(
        Effect.flatMap((settlement) =>
          Effect.gen(function* () {
            state.receipt = yield* captured(services, binding, context)
            if (settlement.result.type === "error" || !RETAINED.has(input.tool)) return settlement
            if (state.receipt)
              return evidence(settlement, `Retained source evidence: ${JSON.stringify(state.receipt.ref)}${state.receipt.origin.kind === "tool-output" ? `\n${DISPLAY_NOTICE}` : ""}`)
            const content = body(settlement)
            yield* services.allowances
              .reserveBytes(admitted.allowance, `bytes:${input.assistantMessageID}:${input.callID}:text`, Buffer.byteLength(content, "utf8"))
              .pipe(Effect.mapError(hold))
            yield* ToolSafety.inspect(content)
            state.receipt = yield* services.records
              .capture(binding, context, {
                origin: { kind: "tool-output", uri: `native:${input.sessionID}/${input.assistantMessageID}/${input.callID}/${input.tool}` },
                representation: "text",
                mediaType: "text/plain",
                content,
                complete: !settlement.outputPaths?.length,
              })
              .pipe(Effect.mapError(hold))
            return evidence(
              settlement,
              `Retained output evidence: ${JSON.stringify(state.receipt.ref)}\nThis is the native tool's returned representation, not proof of original-source completeness or runtime behavior.`,
            )
          }),
        ),
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            const receipt = state.receipt ?? (yield* captured(services, binding, context))
            const reason = Exit.isFailure(exit) ? failed(exit.cause) : refused(exit.value)
            const returned = Exit.isSuccess(exit) && exit.value.result.type !== "error"
            yield* services.records.attempt(binding, context, {
              outcome: returned && receipt?.complete ? "captured" : reason === "publication_uncertain" ? "uncertain" : receipt ? "partial" : "unavailable",
              stage: reason && ["publication_uncertain", "budget_exhausted", "conflict"].includes(reason)
                ? "retention"
                : receipt ? "representation" : "acquisition",
              reason: reason ?? (receipt?.complete ? "complete" : receipt ? "bounded_projection" : "no_supported_source"),
              ...(receipt ? { source: receipt.ref } : {}),
              returned,
            })
          }).pipe(Effect.orDie),
        ),
      )
    })
}

/** The source this call captured itself, found by the capture operation `ResearchRecords.capture` derives from it. */
const captured = Effect.fn("SourceCaptureV2.captured")(function* (
  services: Services,
  binding: Research.Binding,
  context: Tool.Context,
) {
  const rows = yield* Effect.forEach(REPRESENTATIONS, (representation) =>
    services.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.id, ResearchLedger.eventID(binding, `source:${ResearchLedger.operation(context, `capture:${representation}`)}`)))
      .get()
      .pipe(Effect.orDie),
  )
  const row = rows.find((entry) => entry !== undefined)
  if (!row) return undefined
  const data = Schema.decodeUnknownOption(ResearchEvent.SourceAdmitted.data)(row.data)
  return data._tag === "Some" ? data.value.receipt : undefined
})

function hold(error: { readonly message: string }) {
  return new ToolSafety.Denied({ reason: "research-acquisition", detail: error.message })
}

// The reason a failed call names: a refusal's own code, else an acquisition failure.
function failed(cause: Cause.Cause<unknown>) {
  if (Cause.hasInterrupts(cause)) return "interrupted"
  const error = cause.reasons
    .flatMap((reason) => (Cause.isDieReason(reason) ? [reason.defect] : Cause.isFailReason(reason) ? [reason.error] : []))
    .find((entry) => entry instanceof Research.Error || entry instanceof ToolSafety.Denied)
  if (error instanceof Research.Error) return error.code
  if (error instanceof ToolSafety.Denied) return error.reason
  return "acquisition_failed"
}

// A tool's error result keeps the research code it was denied with (`Research denied: <code>: ...`).
function refused(settlement: ToolSafety.Settlement) {
  if (settlement.result.type !== "error") return undefined
  return String(settlement.result.value).match(/^Research denied: ([a-z_]+):/)?.[1] ?? "acquisition_failed"
}

function body(settlement: ToolSafety.Settlement) {
  const text = settlement.output?.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
  if (text) return text
  if (settlement.output) return JSON.stringify(settlement.output.structured)
  return typeof settlement.result.value === "string" ? settlement.result.value : JSON.stringify(settlement.result.value)
}

function evidence(settlement: ToolSafety.Settlement, line: string) {
  const output = ToolOutput.make(settlement.output?.structured ?? {}, [
    { type: "text", text: `${body(settlement)}\n\n${line}` },
    ...(settlement.output?.content.filter((part) => part.type !== "text") ?? []),
  ])
  return { ...settlement, result: ToolOutput.toResultValue(output), output }
}

function skillRead(services: Services, input: ToolSafety.Invocation) {
  if (input.tool !== "read" || !services.skillRoot || typeof input.args !== "object" || input.args === null) return false
  if (!("path" in input.args) || typeof input.args.path !== "string") return false
  const relative = path.relative(services.skillRoot, path.resolve(services.location.directory, input.args.path))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
