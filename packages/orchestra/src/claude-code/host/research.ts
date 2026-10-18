export * as ClaudeHostResearch from "./research"

import { Cause, Context, Duration, Effect, Exit, Fiber, Option, Schema, Scope } from "effect"
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { Research } from "@orchestra/schema/research"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchExecution } from "@/research/allowance"
import { ResearchTools } from "@/research/binding"
import { ResearchSeatTools } from "@/research/seat-tools"
import { MessageID, type SessionID } from "@/session/schema"
import type { Tool } from "@/tool/tool"
import { ClaudeCodeTools } from "../tools"
import type { ClaudeHostJoin } from "./join"

export const NativeStop = Context.Reference<
  ((sessionID: SessionID, dispatchCallID: string) => Effect.Effect<void, unknown>) | undefined
>("@orchestra/ClaudeHostResearch/NativeStop", { defaultValue: () => undefined })

export class TerminalClosed extends Schema.TaggedErrorClass<TerminalClosed>()("ClaudeHostResearch.TerminalClosed", {
  sessionID: Schema.String,
  message: Schema.String,
}) {}

export class NativeStopError extends Schema.TaggedErrorClass<NativeStopError>()("ClaudeHostResearch.NativeStopError", {
  sessionID: Schema.String,
  dispatchCallID: Schema.String,
  reason: Schema.Literals([
    "unavailable",
    "join_missing",
    "join_conflict",
    "query_closed",
    "request_failed",
    "request_interrupted",
  ]),
  message: Schema.String,
}) {}

export type StopStatus =
  | { readonly status: "not_requested" | "requesting" | "acknowledged" }
  | { readonly status: "failed"; readonly error: NativeStopError }

/** Resolve the SDK's task_started identity each time; a control receipt never proves provider completion. */
export const nativeStop = (live: {
  readonly join: ClaudeHostJoin.Join
  readonly query: Pick<Query, "stopTask">
  readonly closed?: boolean
}) =>
  Effect.fn("ClaudeHostResearch.nativeStop")(function* (sessionID: SessionID, dispatchCallID: string) {
    for (let round = 0; round < 500; round++) {
      if (live.closed || !live.query)
        return yield* new NativeStopError({
          sessionID,
          dispatchCallID,
          reason: "query_closed",
          message: "NATIVE_RESEARCH_STOP_QUERY_CLOSED: native child stop is unavailable",
        })
      const joined = live.join.get(dispatchCallID)
      if (!joined)
        return yield* new NativeStopError({
          sessionID,
          dispatchCallID,
          reason: "join_missing",
          message: "NATIVE_RESEARCH_STOP_JOIN_MISSING: no admitted child join",
        })
      if (joined.hold || joined.child !== sessionID || joined.seat !== ResearchSeatTools.SEAT)
        return yield* new NativeStopError({
          sessionID,
          dispatchCallID,
          reason: "join_conflict",
          message: `NATIVE_RESEARCH_STOP_JOIN_CONFLICT: ${joined.hold ?? "child Session or seat differs"}`,
        })
      const taskID = joined.taskID
      if (taskID)
        return yield* Effect.tryPromise({
          try: () => live.query.stopTask(taskID),
          catch: (error) =>
            new NativeStopError({
              sessionID,
              dispatchCallID,
              reason: "request_failed",
              message: `NATIVE_RESEARCH_STOP_REQUEST_FAILED: ${String(error)}`,
            }),
        }).pipe(Effect.uninterruptible)
      yield* Effect.sleep("20 millis")
    }
    return yield* new NativeStopError({
      sessionID,
      dispatchCallID,
      reason: "join_missing",
      message: "NATIVE_RESEARCH_STOP_JOIN_MISSING: task_started did not provide a native task id within 10 seconds",
    })
  })

/** A native built-in call of the research seat whose output PostToolUse retains (J1.7). */
export type Captured = {
  readonly sessionID: SessionID
  readonly callID: string
  /** Claude Code's tool name: one of ResearchSeatTools.CAPTURED. */
  readonly tool: string
  readonly response: unknown
  /** The mirrored call's part: the invocation Research binding verifies. */
  readonly part: { readonly messageID: string; readonly tool: string }
}

const ReadOutput = Schema.Struct({ type: Schema.Literal("text"), file: Schema.Struct({
  filePath: Schema.String, content: Schema.String, numLines: Schema.Int, startLine: Schema.Int, totalLines: Schema.Int }) })
const GrepOutput = Schema.Struct({ filenames: Schema.Array(Schema.String), content: Schema.optional(Schema.String),
  appliedLimit: Schema.optional(Schema.Number) })
const GlobOutput = Schema.Struct({ filenames: Schema.Array(Schema.String), truncated: Schema.Boolean })
const WebSearchOutput = Schema.Struct({ query: Schema.String, results: Schema.Array(Schema.Unknown) })

/**
 * The retained representation of a native built-in's structured `tool_response` (SDK 0.3.289, recorded in
 * jimmy-capture.test.ts). Read keeps original-file lines; Grep, Glob and WebSearch are tool output. Any other shape is
 * refused, so the caller withholds the output instead of retaining a guess.
 */
export function retained(input: Pick<Captured, "sessionID" | "callID" | "tool" | "response">) {
  const uri = `native:${input.sessionID}/${input.callID}/${input.tool}`
  const output = (content: string, complete: boolean, json = false) => ({ source: { origin: { kind: "tool-output", uri },
    representation: json ? "structured-json" : "text", mediaType: json ? "application/json" : "text/plain", content, complete,
  } satisfies ResearchRecords.CaptureInput, lines: undefined })
  if (input.tool === "Read") return Schema.decodeUnknownOption(ReadOutput)(input.response).pipe(Option.map((read) => ({
    source: { origin: { kind: "file", uri: read.file.filePath }, representation: "text", mediaType: "text/plain",
      content: read.file.content, complete: read.file.numLines === read.file.totalLines } satisfies ResearchRecords.CaptureInput,
    lines: { start: read.file.startLine, end: read.file.startLine + Math.max(read.file.numLines, 1) - 1 },
  })))
  if (input.tool === "Grep") return Schema.decodeUnknownOption(GrepOutput)(input.response).pipe(Option.map((grep) =>
    output(grep.content ?? grep.filenames.join("\n"), grep.appliedLimit === undefined)))
  if (input.tool === "Glob") return Schema.decodeUnknownOption(GlobOutput)(input.response).pipe(Option.map((glob) =>
    output(glob.filenames.join("\n"), !glob.truncated)))
  if (input.tool === "WebSearch") return Schema.decodeUnknownOption(WebSearchOutput)(input.response).pipe(Option.map((search) =>
    output(JSON.stringify(search), true, true)))
  return Option.none()
}

/** The ledger reason of a native Read whose span this dispatch already retained with the same bytes. */
export const DUPLICATE = "duplicate_read"

/** One query's issued native dispatch frames; model input cannot supply research attribution. */
export const make = Effect.gen(function* () {
  const execution = yield* ResearchExecution.Service
  const allowances = yield* ResearchAllowance.Service
  const nativeStop = yield* NativeStop
  const scope = yield* Scope.make()
  const frames = new Map<SessionID, ResearchExecution.Frame>()
  const turns = new Map<SessionID, Set<string>>()
  const holds = new Map<SessionID, Research.Error>()
  const deadlines = new Map<SessionID, Fiber.Fiber<void>>()
  const aborts = new Map<SessionID, AbortController>()
  const terminal = new Set<SessionID>()
  const stops = new Map<SessionID, StopStatus>()
  // Per dispatch: the retained ref of each native Read span by its bytes' digest, and whether its inquiry closed.
  const spans = new Map<SessionID, Map<string, { readonly digest: string; readonly ref: Research.SourceRef }>>()
  const concluded = new Set<SessionID>()
  const query = { closed: false }
  const close = yield* Effect.cached(
    Scope.close(scope, Exit.void).pipe(Effect.andThen(Effect.sync(() => deadlines.clear()))),
  )
  const closed = (sessionID: SessionID) =>
    new TerminalClosed({ sessionID, message: "RESEARCH_TERMINAL_CLOSED: native research dispatch admission is closed" })

  const attributed = <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) =>
    Effect.suspend<A, E | Research.Error | TerminalClosed, R>(() => {
      if (query.closed || terminal.has(sessionID)) return Effect.fail(closed(sessionID))
      const frame = frames.get(sessionID)
      if (!frame)
        return Effect.fail(
          new Research.Error({
            code: "binding_missing",
            message: "Research dispatch was not admitted by PreToolUse[Agent]",
          }),
        )
      const hold = holds.get(sessionID)
      if (hold) return Effect.fail(hold)
      return effect.pipe(Effect.provideService(ResearchExecution.Current, frame))
    })

  // Keep the native failure code visible in hook denies and MCP error text, which otherwise render only message.
  const named =
    (sessionID: SessionID) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Research.Error, R> =>
      effect.pipe(
        Effect.catchCause((cause): Effect.Effect<never, E | Research.Error> => {
          if (Cause.hasInterrupts(cause)) return Effect.failCause(cause)
          const error = cause.reasons
            .flatMap((reason) =>
              Cause.isDieReason(reason) ? [reason.defect] : Cause.isFailReason(reason) ? [reason.error] : [],
            )
            .find((error) => error instanceof Research.Error)
          if (!(error instanceof Research.Error)) return Effect.failCause(cause)
          const failure = new Research.Error({ code: error.code, message: `${error.code}: ${error.message}` })
          if (error.code === "budget_exhausted" && holds.get(sessionID)?.code !== "budget_exhausted")
            holds.set(sessionID, failure)
          return Effect.fail(failure)
        }),
      )

  return {
    enter: (sessionID: SessionID, callID: string, tier?: Research.Depth) =>
      Effect.suspend(() => {
        if (query.closed || terminal.has(sessionID)) return Effect.fail(closed(sessionID))
        const existing = frames.get(sessionID)
        if (existing && existing.allowance.dispatchCallID !== callID)
          return Effect.fail(
            new Research.Error({
              code: "binding_mismatch",
              message: "Research Session already has a different dispatch",
            }),
          )
        return execution.enter(
          sessionID,
          callID,
          Effect.gen(function* () {
            // Admission's ledger reads may yield while settlement or query close wins the race.
            if (query.closed || terminal.has(sessionID)) return yield* closed(sessionID)
            const frame = yield* ResearchExecution.Current
            if (!frame)
              return yield* new Research.Error({
                code: "binding_missing",
                message: "Research dispatch has no native binding",
              })
            // Exact admission retries must not extend the dispatch's deadline.
            const existing = frames.get(sessionID)
            if (existing && existing.allowance.dispatchCallID !== callID)
              return yield* new Research.Error({
                code: "binding_mismatch",
                message: "Research Session already has a different dispatch",
              })
            if (existing) return
            frames.set(sessionID, frame)
            const abort = new AbortController()
            aborts.set(sessionID, abort)
            deadlines.set(
              sessionID,
              yield* Effect.sleep(Duration.seconds(frame.allowance.deadlineSeconds)).pipe(
                Effect.andThen(
                  Effect.suspend(() => {
                    if (query.closed || terminal.has(sessionID)) return Effect.void
                    terminal.add(sessionID)
                    if (holds.get(sessionID)?.code !== "budget_exhausted")
                      holds.set(
                        sessionID,
                        new Research.Error({
                          code: "budget_exhausted",
                          message:
                            `budget_exhausted: Research dispatch deadline exhausted (${frame.allowance.deadlineSeconds} seconds); retained work remains available`,
                        }),
                      )
                    abort.abort()
                    stops.set(sessionID, { status: "requesting" })
                    return (
                      nativeStop
                        ? Effect.suspend(() => nativeStop(sessionID, callID))
                        : Effect.fail(
                            new NativeStopError({
                              sessionID,
                              dispatchCallID: callID,
                              reason: "unavailable",
                              message: "NATIVE_RESEARCH_STOP_UNAVAILABLE: no native child stop callback is configured",
                            }),
                          )
                    ).pipe(
                      Effect.tap(() => Effect.sync(() => stops.set(sessionID, { status: "acknowledged" }))),
                      Effect.catchCause((cause) =>
                        Effect.sync(() => {
                          const error = Cause.squash(cause)
                          stops.set(sessionID, {
                            status: "failed",
                            error:
                              error instanceof NativeStopError
                                ? error
                                : new NativeStopError({
                                    sessionID,
                                    dispatchCallID: callID,
                                    reason: Cause.hasInterrupts(cause) ? "request_interrupted" : "request_failed",
                                    message: `NATIVE_RESEARCH_STOP_FAILED: ${Cause.pretty(cause)}`,
                                  }),
                          })
                        }),
                      ),
                      Effect.asVoid,
                      // stopTask has no cancellation API; retain its receipt and status through interruption.
                      Effect.uninterruptible,
                    )
                  }),
                ),
                Effect.ensuring(Effect.sync(() => deadlines.delete(sessionID))),
                Effect.forkIn(scope, { startImmediately: true }),
              ),
            )
          }),
          { tier },
        )
      }),
    /** Parent terminal metadata may consume this reason without interrupting the parent Query. */
    stopReason: (sessionID: SessionID) =>
      Effect.sync(() => {
        const hold = holds.get(sessionID)
        return hold?.code === "budget_exhausted"
          ? `budget_exhausted: ${hold.message.replace(/^budget_exhausted: /, "")}`
          : undefined
      }),
    signal: (sessionID: SessionID) => aborts.get(sessionID)?.signal,
    /** Local admission/control evidence only; acknowledged is not physical provider completion. */
    status: (sessionID: SessionID) =>
      Effect.sync(() => ({
        closed: query.closed || terminal.has(sessionID),
        deadlineActive: deadlines.has(sessionID),
        allowance: frames.get(sessionID)?.allowance,
        nativeStop: stops.get(sessionID) ?? { status: "not_requested" as const },
      })),
    settle: (sessionID: SessionID) =>
      Effect.suspend(() => {
        terminal.add(sessionID)
        aborts.get(sessionID)?.abort()
        const deadline = deadlines.get(sessionID)
        return deadline ? Fiber.interrupt(deadline) : Effect.void
      }).pipe(Effect.uninterruptible),
    // Mask cached delivery too, so interrupted callers cannot cache an interrupted scope-close result.
    close: Effect.suspend(() => {
      query.closed = true
      frames.forEach((_, sessionID) => terminal.add(sessionID))
      aborts.forEach((abort) => abort.abort())
      return close
    }).pipe(Effect.uninterruptible),
    /**
     * Retain a native built-in's output for the dispatch (J1.7). A Read of a span already retained with the same bytes
     * is recorded as a duplicate attempt against the earlier ref instead of a second copy, so rereads are counted.
     */
    capture: (input: Captured) =>
      attributed(input.sessionID, Effect.gen(function* () {
        const records = yield* ResearchRecords.Service
        const found = retained(input)
        if (Option.isNone(found))
          return yield* new Research.Error({ code: "unsupported", message: `${input.tool} returned an output shape Orchestra cannot retain` })
        const source = found.value.source
        const lines = found.value.lines
        const context = { sessionID: input.sessionID, messageID: MessageID.make(input.part.messageID), callID: input.callID,
          agent: ResearchSeatTools.SEAT, agentID: ResearchSeatTools.SEAT, abort: new AbortController().signal, messages: [],
          metadata: () => Effect.void, ask: () => Effect.void } satisfies Tool.Context
        const key = lines ? `${source.origin.uri}#${lines.start}-${lines.end}` : undefined
        const digest = ResearchLedger.digest(source.content)
        const prior = key ? spans.get(input.sessionID)?.get(key) : undefined
        if (prior?.digest === digest) {
          yield* ResearchTools.run(context, input.part.tool, (binding, invocation) => records.attempt(binding, invocation, {
            outcome: "captured", stage: "retention", reason: DUPLICATE, source: prior.ref, returned: true }), false)
          return { ref: prior.ref, duplicate: true }
        }
        const capture = { ...source, ...(lines ? { observed: { byteStart: yield* offset(source.origin.uri, lines.start),
          lineStart: lines.start, lineEnd: lines.end } } : {}) }
        const receipt = yield* ResearchTools.run(context, input.part.tool, (binding, invocation) => execution.captureBytes(
          input.sessionID, `${input.part.messageID}:${input.callID}:${capture.representation}`, Buffer.byteLength(capture.content, "utf8"),
          records.capture(binding, invocation, capture)), false)
        if (key) spans.set(input.sessionID, (spans.get(input.sessionID) ?? new Map()).set(key, { digest, ref: receipt.ref }))
        return { ref: receipt.ref, duplicate: false }
      })).pipe(named(input.sessionID)),
    /** The dispatch's inquiry closed (J5.5): every later call of the seat is refused. */
    conclude: (sessionID: SessionID) => Effect.sync(() => { concluded.add(sessionID) }),
    concluded: (sessionID: SessionID) => Effect.sync(() => concluded.has(sessionID)),
    tool: (sessionID: SessionID, callID: string, name: string) =>
      attributed(
        sessionID,
        execution.tool(sessionID, callID, ClaudeCodeTools.orchestra(name) ?? name, Effect.void),
      ).pipe(named(sessionID)),
    /** Registry execution charges the same tool operation idempotently and reserves bytes before retention. */
    execute: <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) =>
      Effect.suspend(() => {
        if (query.closed || terminal.has(sessionID)) return Effect.fail(closed(sessionID))
        return frames.has(sessionID) ? attributed(sessionID, effect).pipe(named(sessionID)) : effect
      }),
    /** Complete assistant blocks share the Messages API id (SDK 0.3.289); progress summaries are not model turns. */
    observe: (join: ClaudeHostJoin.Join, message: SDKMessage) =>
      Effect.gen(function* () {
        if (message.type !== "assistant" || !message.parent_tool_use_id) return
        const sessionID = join.child(message.parent_tool_use_id)
        const frame = sessionID ? frames.get(sessionID) : undefined
        if (!sessionID || !frame) return
        const seen = turns.get(sessionID) ?? new Set<string>()
        turns.set(sessionID, seen)
        if (seen.has(message.message.id) || seen.size >= frame.allowance.providerLimit) return
        yield* allowances.charge(frame.allowance, "provider", `provider:claude-host:${message.message.id}`).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              // A late ledger failure cannot undo deadline/tool/byte exhaustion or its hook stop control.
              if (holds.get(sessionID)?.code !== "budget_exhausted") holds.set(sessionID, error)
            }),
          ),
        )
        seen.add(message.message.id)
        // maxTurns bounds the SDK's agentic loop; completed IDs remain the native ledger's observable debit.
        // Hidden retries and in-flight compaction have no dispatch-specific admission hook here.
        if (seen.size >= frame.allowance.providerLimit && holds.get(sessionID)?.code !== "budget_exhausted")
          holds.set(
            sessionID,
            new Research.Error({
              code: "budget_exhausted",
              message: `budget_exhausted: Research provider allowance exhausted (${frame.allowance.providerLimit}/${frame.allowance.providerLimit}); retained work remains available`,
            }),
          )
      }),
  }
})

export type Runtime = Effect.Success<typeof make>

// The byte offset of a 1-based line in the file as it is now; Read reports lines only.
function offset(file: string, line: number) {
  if (line <= 1) return Effect.succeed(0)
  return Effect.tryPromise({
    try: () => Bun.file(file).bytes(),
    catch: () => new Research.Error({ code: "source_unavailable", message: `${file} could not be read to locate line ${line}` }),
  }).pipe(Effect.flatMap((bytes) => {
    // Each step finds the next line feed; the scan stops at the line, so it never reads past it.
    const start = Array.from({ length: line - 1 }).reduce<number>((from) => from < 0 ? from : (bytes.indexOf(10, from) + 1 || -1), 0)
    return start > 0 ? Effect.succeed(start)
      : Effect.fail(new Research.Error({ code: "source_unavailable", message: `${file} has fewer than ${line} lines now` }))
  }))
}
