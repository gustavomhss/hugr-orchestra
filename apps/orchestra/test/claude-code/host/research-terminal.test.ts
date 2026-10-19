import { expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ClaudeHostJoin } from "@orchestra/engine-claude-code/host/join"
import { ClaudeHostResearch } from "@/claude-code/host/research"
import { ResearchExecution } from "@/research/allowance"
import { ResearchTerminalFixture } from "./research-terminal-fixture"

// Unit-only terminal/control tests. Native Jimmy remains NATIVE_RESEARCH_PROVIDER_ADMISSION_UNAVAILABLE HOLD.
const it = ResearchTerminalFixture.it
const closed = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit))
    expect(Cause.squash(exit.cause)).toMatchObject({
      _tag: "ClaudeHostResearch.TerminalClosed",
      message: expect.stringContaining("RESEARCH_TERMINAL_CLOSED"),
    })
}

it.instance(
  "unit deadline uses the captured callback once for the exact child, aborts MCP, keeps parent and other child live",
  () =>
    Effect.gen(function* () {
      const fixture = yield* ResearchTerminalFixture.setup()
      yield* fixture.timed(
        Effect.gen(function* () {
          const child = yield* fixture.admit()
          const signal = fixture.research.signal(child.sessionID)
          const mcp = yield* fixture.research
            .execute(child.sessionID, ResearchTerminalFixture.mcp(signal))
            .pipe(Effect.forkScoped({ startImmediately: true }))
          const parentGate = yield* Deferred.make<string>()
          const parent = yield* fixture.research
            .execute(fixture.parent.id, Deferred.await(parentGate))
            .pipe(Effect.forkScoped({ startImmediately: true }))
          yield* fixture.advance("300 seconds")
          yield* fixture.research
            .enter(child.sessionID, child.callID)
            .pipe(
              Effect.provideService(ClaudeHostResearch.NativeStop, () =>
                Effect.die("make must capture its original callback"),
              ),
            )
          expect(fixture.research.signal(child.sessionID)).toBe(signal)
          const other = yield* fixture.admit("unit-other")
          yield* fixture.advance("299 seconds")
          expect(fixture.requested).toEqual([])
          expect(signal?.aborted).toBe(false)
          yield* fixture.advance("1 second")
          expect(yield* fixture.controlSettled(child.sessionID)).toMatchObject({
            closed: true,
            nativeStop: { status: "acknowledged" },
          })
          expect(fixture.requested).toEqual([{ sessionID: child.sessionID, callID: child.callID }])
          expect(fixture.stopped).toEqual([child.taskID])
          expect(signal?.aborted).toBe(true)
          expect(yield* Fiber.join(mcp)).toBe("MCP aborted")
          expect(yield* fixture.research.stopReason(child.sessionID)).toContain("budget_exhausted")
          expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
          expect(yield* fixture.research.execute(fixture.parent.id, Effect.succeed("parent still live"))).toBe(
            "parent still live",
          )
          yield* Deferred.succeed(parentGate, "parent continued")
          expect(yield* Fiber.join(parent)).toBe("parent continued")
          expect(fixture.research.signal(other.sessionID)?.aborted).toBe(false)
          expect(yield* fixture.research.status(other.sessionID)).toMatchObject({ closed: false, deadlineActive: true })
          yield* fixture.research.tool(other.sessionID, "other-view", "research_view")
          expect(yield* fixture.research.execute(other.sessionID, Effect.succeed("other still live"))).toBe(
            "other still live",
          )
          yield* fixture.research.settle(child.sessionID)
          yield* fixture.research.settle(child.sessionID)
          yield* fixture.advance("1 second")
          expect(fixture.stopped).toEqual([child.taskID])
        }),
      )
    }),
)

it.instance(
  "unit settlement closes admission and aborts outstanding MCP; retries and late enter cannot restart the deadline",
  () =>
    Effect.gen(function* () {
      const fixture = yield* ResearchTerminalFixture.setup()
      yield* fixture.timed(
        Effect.gen(function* () {
          const child = yield* fixture.admit()
          const ran: string[] = []
          const late = fixture.research.execute(
            child.sessionID,
            Effect.sync(() => ran.push("late execution")),
          )
          const mcp = yield* fixture.research
            .execute(child.sessionID, ResearchTerminalFixture.mcp(fixture.research.signal(child.sessionID)))
            .pipe(Effect.forkScoped({ startImmediately: true }))
          yield* fixture.advance("599 seconds")
          yield* fixture.research.settle(child.sessionID)
          yield* fixture.research.settle(child.sessionID)
          expect(yield* Fiber.join(mcp)).toBe("MCP aborted")
          expect(yield* fixture.research.status(child.sessionID)).toMatchObject({
            closed: true,
            deadlineActive: false,
            nativeStop: { status: "not_requested" },
          })
          closed(yield* Effect.exit(late))
          closed(yield* Effect.exit(fixture.research.tool(child.sessionID, "late-tool", "research_view")))
          closed(yield* Effect.exit(fixture.research.enter(child.sessionID, child.callID)))
          expect(ran).toEqual([])
          expect(yield* ResearchTerminalFixture.charges(child.sessionID)).toEqual([])
          yield* fixture.advance("1200 seconds")
          expect(fixture.requested).toEqual([])
          expect(fixture.stopped).toEqual([])
          expect(yield* fixture.research.stopReason(child.sessionID)).toBeUndefined()
        }),
      )
    }),
)

it.instance(
  "unit query close aborts every issued signal, joins timers, and refuses admission even for previously unissued children",
  () =>
    Effect.gen(function* () {
      const fixture = yield* ResearchTerminalFixture.setup()
      yield* fixture.timed(
        Effect.gen(function* () {
          const children = yield* Effect.forEach(["close-one", "close-two"], fixture.admit)
          const calls = yield* Effect.forEach(children, (child) =>
            fixture.research
              .execute(child.sessionID, ResearchTerminalFixture.mcp(fixture.research.signal(child.sessionID)))
              .pipe(Effect.forkScoped({ startImmediately: true })),
          )
          yield* fixture.research.close
          yield* fixture.research.close
          expect(yield* Effect.forEach(calls, Fiber.join)).toEqual(["MCP aborted", "MCP aborted"])
          yield* Effect.forEach(children, (child) =>
            Effect.gen(function* () {
              expect(fixture.research.signal(child.sessionID)?.aborted).toBe(true)
              expect(yield* fixture.research.status(child.sessionID)).toMatchObject({
                closed: true,
                deadlineActive: false,
              })
              closed(yield* Effect.exit(fixture.research.enter(child.sessionID, child.callID)))
              closed(yield* Effect.exit(fixture.research.tool(child.sessionID, "closed-tool", "research_view")))
              closed(yield* Effect.exit(fixture.research.execute(child.sessionID, Effect.die("closed execution ran"))))
            }),
          )
          const unissued = yield* fixture.sessions.create({ agent: "jimmy", parentID: fixture.parent.id })
          closed(yield* Effect.exit(fixture.research.enter(unissued.id, "after-query-close")))
          yield* fixture.advance("2 hours")
          expect(fixture.requested).toEqual([])
          expect(fixture.stopped).toEqual([])
        }),
      )
    }),
)

for (const terminal of ["deadline", "settlement", "query-close"] as const) {
  it.instance(
    `unit late observed accounting after ${terminal} retains terminal state without fresh provider admission`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* ResearchTerminalFixture.setup()
        yield* fixture.timed(
          Effect.gen(function* () {
            const child = yield* fixture.admit()
            if (terminal === "deadline") {
              yield* fixture.advance("600 seconds")
              yield* fixture.controlSettled(child.sessionID)
            }
            if (terminal === "settlement") yield* fixture.research.settle(child.sessionID)
            if (terminal === "query-close") yield* fixture.research.close
            const reason = yield* fixture.research.stopReason(child.sessionID)
            const before = yield* fixture.research.status(child.sessionID)
            const frame = ResearchTerminalFixture.assistant(child.callID, "unit-late-observation")
            yield* fixture.research.observe(fixture.join, frame)
            yield* fixture.research.observe(fixture.join, frame)
            expect(yield* ResearchTerminalFixture.charges(child.sessionID)).toMatchObject([
              {
                kind: "provider",
                dispatchCallID: child.callID,
                operation: "provider:claude-host:unit-late-observation",
                amount: 1,
              },
            ])
            expect(yield* ResearchTerminalFixture.charges(child.sessionID)).toHaveLength(1)
            expect(yield* fixture.research.status(child.sessionID)).toEqual(before)
            expect(yield* fixture.research.stopReason(child.sessionID)).toBe(reason)
            expect(fixture.research.signal(child.sessionID)?.aborted).toBe(true)
            closed(
              yield* Effect.exit(
                fixture.research.execute(child.sessionID, Effect.die("late observation reopened execution")),
              ),
            )
            closed(yield* Effect.exit(fixture.research.tool(child.sessionID, "late-observed-tool", "research_view")))
            closed(yield* Effect.exit(fixture.research.enter(child.sessionID, child.callID)))
          }),
        )
      }),
  )
}

it.instance("unit deadline, settlement and late accounting failure preserve the first exhausted reason", () =>
  Effect.gen(function* () {
    const fixture = yield* ResearchTerminalFixture.setup()
    const execution = yield* ResearchExecution.Service
    const allowances = yield* ResearchAllowance.Service
    yield* fixture.timed(
      Effect.gen(function* () {
        const child = yield* fixture.admit()
        const frame = yield* fixture.research.execute(child.sessionID, ResearchExecution.Current)
        if (!frame) return yield* Effect.die("Missing real issued research allowance")
        yield* fixture.research.execute(
          child.sessionID,
          execution.captureBytes(child.sessionID, "unit-full-reservation", frame.allowance.byteLimit, Effect.void),
        )
        const exhausted = yield* Effect.exit(
          fixture.research.execute(
            child.sessionID,
            execution.captureBytes(child.sessionID, "unit-over-reservation", 1, Effect.die("over-budget capture ran")),
          ),
        )
        expect(Exit.isFailure(exhausted)).toBe(true)
        const reason = yield* fixture.research.stopReason(child.sessionID)
        expect(reason).toContain("Research bytes allowance exhausted")
        // Fill the actual unit ledger so the later observation exercises its failure path, without invoking a provider.
        yield* Effect.forEach(
          Array.from({ length: frame.allowance.providerLimit }, (_, index) => index),
          (index) => allowances.charge(frame.allowance, "provider", `unit-observed:${index}`),
        )
        yield* fixture.advance("600 seconds")
        yield* fixture.controlSettled(child.sessionID)
        expect(yield* fixture.research.stopReason(child.sessionID)).toBe(reason)
        yield* fixture.research.settle(child.sessionID)
        const state = yield* fixture.research.status(child.sessionID)
        yield* fixture.research.observe(
          fixture.join,
          ResearchTerminalFixture.assistant(child.callID, "unit-unchargeable-late"),
        )
        expect(yield* fixture.research.status(child.sessionID)).toEqual(state)
        expect(yield* fixture.research.stopReason(child.sessionID)).toBe(reason)
        expect(
          (yield* ResearchTerminalFixture.charges(child.sessionID)).filter((charge) => charge.kind === "provider"),
        ).toHaveLength(frame.allowance.providerLimit)
        closed(yield* Effect.exit(fixture.research.enter(child.sessionID, child.callID)))
        closed(
          yield* Effect.exit(
            fixture.research.execute(child.sessionID, Effect.die("accounting failure reopened execution")),
          ),
        )
        expect(fixture.stopped).toEqual([child.taskID])
      }),
    )
  }),
)

for (const unavailable of [false, true]) {
  it.instance(
    `unit native stop ${unavailable ? "unavailable" : "failure"} stays inspectable and exact retries never claim success`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* ResearchTerminalFixture.setup({
          unavailable,
          stop: async () => {
            throw new Error("unit SDK stop refused")
          },
        })
        yield* fixture.timed(
          Effect.gen(function* () {
            const child = yield* fixture.admit()
            yield* fixture.advance("600 seconds")
            const state = yield* fixture.controlSettled(child.sessionID)
            expect(state).toMatchObject({
              closed: true,
              nativeStop: {
                status: "failed",
                error: {
                  _tag: "ClaudeHostResearch.NativeStopError",
                  reason: unavailable ? "unavailable" : "request_failed",
                  message: expect.stringContaining(
                    unavailable ? "NATIVE_RESEARCH_STOP_UNAVAILABLE" : "unit SDK stop refused",
                  ),
                },
              },
            })
            expect(fixture.stopped).toEqual(unavailable ? [] : [child.taskID])
            expect(yield* fixture.research.stopReason(child.sessionID)).toContain("budget_exhausted")
            yield* fixture.research.settle(child.sessionID)
            yield* fixture.research.settle(child.sessionID)
            closed(yield* Effect.exit(fixture.research.enter(child.sessionID, child.callID)))
            yield* fixture.advance("600 seconds")
            expect(yield* fixture.research.status(child.sessionID)).toEqual(state)
            expect(fixture.stopped).toEqual(unavailable ? [] : [child.taskID])
            expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
          }),
        )
      }),
  )
}

for (const invalid of ["missing", "child", "seat", "hold", "closed"] as const) {
  it.instance(`unit native stop refuses ${invalid} join/query identity without targeting a different task`, () =>
    Effect.gen(function* () {
      const fixture = yield* ResearchTerminalFixture.setup()
      yield* fixture.timed(
        Effect.gen(function* () {
          const child = yield* fixture.admit()
          if (invalid === "missing") fixture.live.join = ClaudeHostJoin.make()
          if (invalid === "child") fixture.join.dispatched(child.callID, { child: fixture.parent.id, seat: "jimmy" })
          if (invalid === "seat") fixture.join.dispatched(child.callID, { child: child.sessionID, seat: "backend" })
          if (invalid === "hold") fixture.join.taskStarted({ toolUseID: child.callID, taskID: "unit-conflicting-task" })
          if (invalid === "closed") fixture.live.closed = true
          yield* fixture.advance("600 seconds")
          expect(yield* fixture.controlSettled(child.sessionID)).toMatchObject({
            closed: true,
            nativeStop: {
              status: "failed",
              error: {
                reason:
                  invalid === "closed" ? "query_closed" : invalid === "missing" ? "join_missing" : "join_conflict",
              },
            },
          })
          expect(fixture.stopped).toEqual([])
          expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
        }),
      )
    }),
  )
}

it.instance("unit deadline waits for task_started using the bounded child Stop join", () =>
  Effect.gen(function* () {
    const fixture = yield* ResearchTerminalFixture.setup({ pendingJoin: true })
    yield* fixture.timed(
      Effect.gen(function* () {
        const child = yield* fixture.admit()
        yield* fixture.advance("600 seconds")
        expect(yield* fixture.research.status(child.sessionID)).toMatchObject({ nativeStop: { status: "requesting" } })
        expect(fixture.stopped).toEqual([])
        fixture.join.taskStarted({ toolUseID: child.callID, taskID: child.taskID })
        yield* fixture.advance("20 millis")
        expect(yield* fixture.controlSettled(child.sessionID)).toMatchObject({ nativeStop: { status: "acknowledged" } })
        expect(fixture.stopped).toEqual([child.taskID])
        expect(fixture.requested).toHaveLength(1)
      }),
    )
  }),
)

it.instance("unit missing task_started exhausts the bounded join wait with explicit failure", () =>
  Effect.gen(function* () {
    const fixture = yield* ResearchTerminalFixture.setup({ pendingJoin: true })
    yield* fixture.timed(
      Effect.gen(function* () {
        const child = yield* fixture.admit()
        yield* fixture.advance("610 seconds")
        expect(yield* fixture.controlSettled(child.sessionID)).toMatchObject({
          closed: true,
          deadlineActive: false,
          nativeStop: {
            status: "failed",
            error: { reason: "join_missing", message: expect.stringContaining("within 10 seconds") },
          },
        })
        expect(fixture.stopped).toEqual([])
        expect(fixture.requested).toHaveLength(1)
      }),
    )
  }),
)

for (const operation of ["settle", "close"] as const) {
  for (const receipt of ["acknowledged", "rejected"] as const) {
    it.instance(
      `unit concurrent ${operation} retains uncancellable ${receipt} control through caller interruption`,
      () =>
        Effect.gen(function* () {
          const control = Promise.withResolvers<void>()
          const otherControl = Promise.withResolvers<void>()
          const fixture = yield* ResearchTerminalFixture.setup({
            stop: (taskID) => (taskID === "unit-task-unit-dispatch" ? control.promise : otherControl.promise),
          })
          yield* fixture.timed(
            Effect.gen(function* () {
              const child = yield* fixture.admit()
              const other = operation === "close" ? yield* fixture.admit("unit-other-control") : undefined
              yield* fixture.advance("600 seconds")
              expect(fixture.stopped).toContain(child.taskID)
              if (other) expect(fixture.stopped).toContain(other.taskID)
              const fresh = yield* fixture.admit("unit-fresh")
              const mcp = yield* fixture.research
                .execute(fresh.sessionID, ResearchTerminalFixture.mcp(fixture.research.signal(fresh.sessionID)))
                .pipe(Effect.forkScoped({ startImmediately: true }))
              const reason = yield* fixture.research.stopReason(child.sessionID)
              const cleanup = operation === "close" ? fixture.research.close : fixture.research.settle(child.sessionID)
              const first = yield* cleanup.pipe(Effect.forkScoped({ startImmediately: true }))
              const second = yield* cleanup.pipe(Effect.forkScoped({ startImmediately: true }))
              expect(yield* fixture.research.status(child.sessionID)).toMatchObject({
                closed: true,
                deadlineActive: true,
                nativeStop: { status: "requesting" },
              })
              expect(fixture.research.signal(child.sessionID)?.aborted).toBe(true)
              closed(yield* Effect.exit(fixture.research.tool(child.sessionID, "during-cleanup", "research_view")))
              closed(
                yield* Effect.exit(fixture.research.execute(child.sessionID, Effect.die("cleanup reopened execution"))),
              )
              closed(yield* Effect.exit(fixture.research.enter(child.sessionID, child.callID)))
              if (operation === "close") {
                expect(fixture.research.signal(fresh.sessionID)?.aborted).toBe(true)
                expect(yield* Fiber.join(mcp)).toBe("MCP aborted")
                const unissued = yield* fixture.sessions.create({ agent: "jimmy", parentID: fixture.parent.id })
                closed(yield* Effect.exit(fixture.research.enter(unissued.id, "during-query-close")))
              }
              if (operation === "settle") {
                expect(fixture.research.signal(fresh.sessionID)?.aborted).toBe(false)
                expect(yield* fixture.research.execute(fixture.parent.id, Effect.succeed("parent live"))).toBe(
                  "parent live",
                )
                expect(yield* fixture.research.execute(fresh.sessionID, Effect.succeed("other live"))).toBe(
                  "other live",
                )
              }
              const interruptFirst = yield* Fiber.interrupt(first).pipe(Effect.forkScoped({ startImmediately: true }))
              const interruptSecond = yield* Fiber.interrupt(second).pipe(Effect.forkScoped({ startImmediately: true }))
              yield* Effect.yieldNow
              expect(first.pollUnsafe()).toBeUndefined()
              expect(second.pollUnsafe()).toBeUndefined()
              expect(interruptFirst.pollUnsafe()).toBeUndefined()
              expect(interruptSecond.pollUnsafe()).toBeUndefined()
              expect(yield* fixture.research.status(child.sessionID)).toMatchObject({
                deadlineActive: true,
                nativeStop: { status: "requesting" },
              })
              if (receipt === "rejected") control.reject(new Error("unit late SDK stop rejection"))
              if (receipt === "acknowledged") control.resolve()
              const state = yield* fixture.controlSettled(child.sessionID)
              expect(state).toMatchObject({
                closed: true,
                deadlineActive: false,
                nativeStop:
                  receipt === "acknowledged"
                    ? { status: "acknowledged" }
                    : {
                        status: "failed",
                        error: {
                          reason: "request_failed",
                          message: expect.stringContaining("unit late SDK stop rejection"),
                        },
                      },
              })
              if (other) {
                // One finished receipt must not release either close caller or erase the other owned control.
                expect(first.pollUnsafe()).toBeUndefined()
                expect(second.pollUnsafe()).toBeUndefined()
                expect(yield* fixture.research.status(other.sessionID)).toMatchObject({
                  closed: true,
                  deadlineActive: true,
                  nativeStop: { status: "requesting" },
                })
                otherControl.resolve()
                expect(yield* fixture.controlSettled(other.sessionID)).toMatchObject({
                  nativeStop: { status: "acknowledged" },
                })
              }
              yield* Fiber.join(interruptFirst)
              yield* Fiber.join(interruptSecond)
              const exits = yield* Effect.forEach([first, second], Fiber.await)
              expect(exits.every((exit) => Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause))).toBe(true)
              // Exact retries must observe a completed shared join, rather than a cached interrupted delivery.
              yield* cleanup
              yield* cleanup
              expect(yield* fixture.research.status(child.sessionID)).toEqual(state)
              expect(yield* fixture.research.stopReason(child.sessionID)).toBe(reason)
              expect(reason).toContain("budget_exhausted")
              expect(fixture.stopped).toEqual(other ? [child.taskID, other.taskID] : [child.taskID])
              expect(fixture.requested).toHaveLength(other ? 2 : 1)
              expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
              if (operation === "settle") {
                yield* fixture.research.settle(fresh.sessionID)
                expect(yield* Fiber.join(mcp)).toBe("MCP aborted")
              }
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  control.resolve()
                  otherControl.resolve()
                }),
              ),
            ),
          )
        }),
    )
  }
}
