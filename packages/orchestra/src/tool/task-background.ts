export * as TaskBackground from "./task-background"

import { Deferred, Effect, Exit, FileSystem, Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import type { EventV2 } from "@orchestra/core/event"
import type { KeyedMutex } from "@orchestra/core/effect/keyed-mutex"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import type { ArsenalCompletion } from "@/maestro/arsenal-completion"
import type { BackendResult } from "@/maestro/backend-result"
import type { SeatWork } from "@/maestro/backend-work"
import { UpstreamSettlement } from "@/maestro/upstream-settlement"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import type { TaskPromptOps } from "./task"
import type { Tool } from "./tool"

export type Metadata = {
  parentSessionId: SessionID
  sessionId: SessionID
  model: SessionV1.User["model"]
  background?: boolean
  jobId?: string
  completion?: NonNullable<
    Effect.Success<ReturnType<Effect.Success<typeof ArsenalCompletion.make>["verifiedCompletion"]>>
  >
  workResult?: BackendResult.WorkResult
}

export type ExecuteResult = Tool.ExecuteResult<Metadata>

export interface Input {
  readonly background: BackgroundJob.Interface
  readonly sessions: Session.Interface
  readonly database: Database.Interface
  readonly events: EventV2.Interface
  readonly fs: FileSystem.FileSystem
  readonly scope: Scope.Scope
  readonly lock: KeyedMutex.KeyedMutex<string>
  readonly ctx: Tool.Context
  readonly ops: TaskPromptOps
  readonly childSessionID: SessionID
  readonly taskID: string
  readonly description: string
  readonly metadata: Metadata
  readonly work: Pick<ReturnType<typeof SeatWork.track>, "hostEnded" | "attach">
  readonly variant?: string
  readonly renderOutput: (input: {
    id: string
    state: "running" | "completed" | "error"
    summary?: string
    text: string
  }) => string
}

const BACKGROUND_STARTED = [
  "The teammate is working in the background. Its result arrives as a new message when it finishes.",
  "Do not wait, poll or ask it for status, and leave its files and topics to it.",
  "Continue with other work, or tell the owner what you started and end your turn.",
].join("\n")
const BACKGROUND_UPDATED = [
  "The added context was sent to the teammate, which is still working in the background. Its result arrives as a new message when it finishes.",
  "Do not wait, poll or ask it for status, and leave its files and topics to it.",
  "Continue with other work, or tell the owner what you sent and end your turn.",
].join("\n")

/** Per-dispatch capture, background admission and durable return delivery; registry and execution remain existing services. */
export const make = Effect.fn("TaskBackground.make")(function* (input: Input) {
  const dispatchDone = yield* Deferred.make<UpstreamSettlement.Capture | undefined>()
  const dispatch: { capture?: UpstreamSettlement.Capture; notified: boolean } = { notified: false }

  const inject = Effect.fn("TaskTool.injectBackgroundResult")(function* (captured: UpstreamSettlement.Capture | undefined) {
    if (!captured) return // Setup failure/interruption has no returned assistant and cannot mint a receipt.
    const state = captured.workResult?.terminal.reason === "failed" || captured.workResult?.terminal.reason === "interrupted"
      ? "error" : captured.state
    const currentParent = yield* input.sessions.get(input.ctx.sessionID)
    const deliver = UpstreamSettlement.make({
      sessionID: input.ctx.sessionID,
      messageID: input.ctx.messageID,
      callID: input.ctx.callID ?? "",
      childSessionID: input.childSessionID,
      taskID: input.taskID,
      ops: input.ops,
      capture: captured,
      request: {
        messageID: MessageID.ascending(),
        sessionID: input.ctx.sessionID,
        agent: currentParent.agent ?? input.ctx.agentID ?? input.ctx.agent,
        variant: input.variant,
        parts: [
          {
            type: "text",
            synthetic: true,
            metadata: {
              source: { type: "task-return", task_id: input.childSessionID, state },
              ...(captured.workResult ? { workResult: captured.workResult } : {}),
            },
            text: input.renderOutput({
              id: input.taskID,
              state,
              summary: state === "completed"
                ? `Background task completed: ${input.description}`
                : `Background task failed: ${input.description}`,
              text: captured.text,
            }),
          },
        ],
      },
    })
    // One bounded exact-admission reconciliation; wake errors never repeat provider execution.
    yield* deliver().pipe(
      Effect.catchCause(() => deliver()),
      Effect.provideService(Database.Service, input.database),
      Effect.provideService(EventV2Bridge.Service, input.events),
      Effect.provideService(Session.Service, input.sessions),
    )
  })

  const notify = Effect.fn("TaskTool.notifyBackgroundResult")(function* () {
    if (dispatch.notified) return
    dispatch.notified = true
    yield* Deferred.await(dispatchDone).pipe(
      Effect.flatMap(inject),
      Effect.catchCause(() => Effect.logWarning("Background Task delivery HOLD", {
        sessionID: input.ctx.sessionID,
        messageID: input.ctx.messageID,
        callID: input.ctx.callID,
      })),
      Effect.forkIn(input.scope, { startImmediately: true }),
    )
  })

  const schedule = Effect.fn("TaskBackground.schedule")(function* (
    run: Effect.Effect<string, unknown, FileSystem.FileSystem>,
  ) {
    const dispatched = run.pipe(
      Effect.provideService(FileSystem.FileSystem, input.fs),
      Effect.onExit((exit) => {
        const captured = dispatch.capture
        const settled: UpstreamSettlement.Capture | undefined = captured && Exit.isFailure(exit) ? {
          ...captured,
          state: "error",
          ...(captured.workResult ? {
            workResult: {
              ...captured.workResult,
              terminal: {
                reason: Exit.hasInterrupts(exit) ? "interrupted" : "failed",
                hostDetail: "Task host ended after returned assistant",
              },
            },
          } : {}),
        } : captured
        return Deferred.succeed(dispatchDone, settled)
      }),
    )
    // Keep extend/start atomic for this child. Otherwise start can join another caller without running this dispatch.
    return yield* input.lock.withLock(`background:${input.childSessionID}`)(Effect.gen(function* () {
      if (yield* input.background.extend({ id: input.childSessionID, run: dispatched }))
        return { extended: true as const }
      const info = yield* input.background.start({
        id: input.childSessionID,
        type: "task",
        title: input.description,
        metadata: input.metadata,
        onPromote: Effect.all([
          input.ctx.metadata({
            title: input.description,
            metadata: { ...input.metadata, background: true, jobId: input.childSessionID },
          }),
          notify(),
        ], { discard: true }),
        run: dispatched.pipe(Effect.onInterrupt(() => input.ops.cancel(input.childSessionID))),
      })
      return { extended: false as const, info }
    }))
  })

  // Running responses carry host state, never a worker return or a settlement receipt.
  const result = Effect.fn("TaskBackground.result")(function* (
    jobID: string,
    extended = false,
  ): Effect.fn.Return<ExecuteResult> {
    yield* input.work.hostEnded("running", extended ? "Background task updated" : "Background task started").pipe(
      Effect.provideService(Database.Service, input.database),
    )
    return {
      title: input.description,
      metadata: input.work.attach({ ...input.metadata, background: true, jobId: jobID }),
      output: input.renderOutput({
        id: input.taskID,
        state: "running",
        summary: extended ? "Background task updated" : "Background task started",
        text: extended ? BACKGROUND_UPDATED : BACKGROUND_STARTED,
      }),
    }
  })

  return {
    capture: (value: UpstreamSettlement.Capture) => {
      dispatch.capture = structuredClone(value)
    },
    schedule,
    notify,
    result,
  }
})
