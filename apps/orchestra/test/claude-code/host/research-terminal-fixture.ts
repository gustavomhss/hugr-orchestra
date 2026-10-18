export * as ResearchTerminalFixture from "./research-terminal-fixture"

import { Clock, Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { ClaudeHostJoin } from "@orchestra/engine-claude-code/host/join"
import { ClaudeHostResearch } from "@/claude-code/host/research"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { pollWithTimeout, testEffect } from "../../lib/effect"

// Unit-only: real native binding/ledger services, direct research admission, no Agent hook or model execution.
export const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      Session.node,
      SessionProjector.node,
      ResearchExecution.node,
      ResearchAllowance.node,
      Database.node,
      EventV2Bridge.node,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })]],
  ),
)

export const setup = Effect.fn("ResearchTerminalFixture.setup")(function* (options?: {
  unavailable?: boolean
  pendingJoin?: boolean
  stop?: (taskID: string) => Promise<void>
}) {
  const sessions = yield* Session.Service
  const clock = yield* TestClock.make()
  const liveClock = yield* Clock.clockWith(Effect.succeed)
  const parent = yield* sessions.create({ agent: "maestro", title: "Unit research authority" })
  const join = ClaudeHostJoin.make()
  const requested: { sessionID: SessionID; callID: string }[] = []
  const stopped: string[] = []
  const parentControl = { interrupts: 0, closes: 0 }
  const live = {
    closed: false,
    join,
    query: {
      stopTask: async (taskID: string) => {
        stopped.push(taskID)
        await options?.stop?.(taskID)
      },
      interrupt: async () => {
        parentControl.interrupts++
      },
      close: () => {
        parentControl.closes++
      },
    },
  }
  const stop = ClaudeHostResearch.nativeStop(live)
  const research = yield* ClaudeHostResearch.make.pipe(
    Effect.provideService(
      ClaudeHostResearch.NativeStop,
      options?.unavailable
        ? undefined
        : (sessionID, callID) =>
            Effect.suspend(() => {
              requested.push({ sessionID, callID })
              return stop(sessionID, callID)
            }),
    ),
  )
  yield* Effect.addFinalizer(() => research.close)
  const admit = Effect.fn("ResearchTerminalFixture.admit")(function* (callID = "unit-dispatch") {
    const child = yield* sessions.create({ agent: "jimmy", title: "Direct unit research binding", parentID: parent.id })
    yield* LogicalTask.ensure({
      executionSessionID: child.id,
      authoritySessionID: parent.id,
      projectID: child.projectID,
      memberID: "jimmy",
      source: "host",
    })
    join.dispatched(callID, { child: child.id, seat: "jimmy" })
    const taskID = `unit-task-${callID}`
    if (!options?.pendingJoin) join.taskStarted({ toolUseID: callID, taskID })
    yield* research.enter(child.id, callID)
    return { sessionID: child.id, callID, taskID }
  })
  const controlSettled = (sessionID: SessionID) =>
    pollWithTimeout(
      research
        .status(sessionID)
        .pipe(
          Effect.map((state) =>
            !state.deadlineActive &&
            (state.nativeStop.status === "acknowledged" || state.nativeStop.status === "failed")
              ? state
              : undefined,
          ),
        ),
      "native stop control did not settle",
    ).pipe(Effect.provideService(Clock.Clock, liveClock))
  return {
    sessions,
    parent,
    join,
    research,
    live,
    requested,
    stopped,
    parentControl,
    admit,
    controlSettled,
    advance: clock.adjust,
    timed: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provideService(Clock.Clock, clock)),
  }
})

/** Observe the actual issued MCP cancellation signal without a live MCP transport. */
export const mcp = (signal: AbortSignal | undefined) =>
  Effect.callback<string>((resume) => {
    if (!signal) return resume(Effect.die("Missing research MCP signal"))
    const abort = () => resume(Effect.succeed("MCP aborted"))
    if (signal.aborted) return abort()
    signal.addEventListener("abort", abort, { once: true })
    return Effect.sync(() => signal.removeEventListener("abort", abort))
  })

export const charges = Effect.fn("ResearchTerminalFixture.charges")(function* (sessionID: SessionID) {
  const database = yield* Database.Service
  const rows = yield* database.db
    .select()
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, sessionID))
    .all()
    .pipe(Effect.orDie)
  return rows
    .filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
    .map((row) => Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(row.data))
})

// A complete declaration-shaped observation, not evidence of pre-provider admission or native Jimmy readiness.
export const assistant = (callID: string, id: string): SDKAssistantMessage => ({
  type: "assistant",
  parent_tool_use_id: callID,
  session_id: "unit-host",
  uuid: crypto.randomUUID(),
  message: {
    id,
    type: "message",
    role: "assistant",
    model: "unit-model",
    content: [{ type: "text", text: "Late observation", citations: null }],
    container: null,
    context_management: null,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation: null,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: null,
      service_tier: null,
    },
  },
})
