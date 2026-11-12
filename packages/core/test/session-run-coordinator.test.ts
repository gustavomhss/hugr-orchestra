import { describe, expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Scheduler } from "effect"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

describe("SessionRunCoordinator", () => {
  for (const budget of [8, 32]) {
  for (const outcome of ["success", "failure"] as const) {
    it.effect(`returns exclusive ${outcome} after owner cleanup with a yield budget of ${budget}`, () =>
      Effect.scoped(Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const failure = new Error("failed operation")
        const coordinator = yield* SessionRunCoordinator.make<string, never>({ drain: () => Effect.void }).pipe(
          Effect.provideService(Scheduler.MaxOpsBeforeYield, budget),
        )
        yield* Effect.addFinalizer(() => Deferred.succeed(gate, undefined))
        const serial = yield* Effect.gen(function* () {
          const first = yield* coordinator.exclusive("session", Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(gate)),
            Effect.andThen(outcome === "success" ? Effect.succeed("first") : Effect.fail(failure)),
          )).pipe(Effect.exit)
          const next = yield* coordinator.exclusive("session", Effect.succeed("next"))
          return { first, next }
        }).pipe(Effect.forkChild)
        yield* Deferred.await(started)
        yield* Deferred.succeed(gate, undefined)
        const result = yield* Fiber.join(serial)
        if (outcome === "success") expect(result.first).toEqual(Exit.succeed(Option.some("first")))
        if (outcome === "failure") expect(Exit.isFailure(result.first) && Cause.hasFails(result.first.cause)).toBe(true)
        expect(result.next).toEqual(Option.some("next"))
        expect(yield* coordinator.active).toEqual(new Set())
      })),
    )
  }
  }

  it.effect("interrupts an exclusive owner before its work starts without hanging its caller or running late work", () =>
    Effect.scoped(Effect.gen(function* () {
      const tasks: Array<() => void> = []
      const loops = new Map<number, number>()
      const state = { paused: false, work: 0 }
      const scheduler: Scheduler.Scheduler = {
        executionMode: "async",
        shouldYield: (fiber) => {
          if (fiber.currentOpCount !== 1) return false
          const loop = (loops.get(fiber.id) ?? 0) + 1
          loops.set(fiber.id, loop)
          // Pause the captured owner when start releases its ready gate, before entering the supplied work.
          if (state.paused || loop !== 2) return false
          state.paused = true
          return true
        },
        makeDispatcher: () => ({
          scheduleTask: (task) => { tasks.push(task) },
          flush: () => { tasks.splice(0).forEach((task) => task()) },
        }),
      }
      const coordinator = yield* SessionRunCoordinator.make<string, never>({ drain: () => Effect.void }).pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler),
      )
      yield* Effect.addFinalizer(() => coordinator.interrupt("session"))
      const caller = yield* coordinator.exclusive("session", Effect.sync(() => ++state.work)).pipe(
        Effect.forkChild({ startImmediately: true }),
      )
      expect(state.paused).toBe(true)
      expect(tasks).toHaveLength(1)
      expect(state.work).toBe(0)
      expect((yield* coordinator.active).has("session")).toBe(true)
      yield* coordinator.interrupt("session")
      expect(yield* coordinator.active).toEqual(new Set())
      const exit = yield* Fiber.await(caller)
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      tasks.splice(0).forEach((task) => task())
      expect(state.work).toBe(0)
      expect(yield* coordinator.active).toEqual(new Set())
    })),
  )

  it.effect("joins concurrent resumes for one key", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () => Effect.sync(() => runs++).pipe(Effect.andThen(Deferred.await(gate))),
        })

        const first = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        const second = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow

        expect(runs).toBe(1)
        yield* Deferred.succeed(gate, undefined)
        yield* Effect.all([Fiber.join(first), Fiber.join(second)])
        expect(runs).toBe(1)
      }),
    ),
  )

  it.effect("joins a wake-started execution without forcing a successor", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const forces: boolean[] = []
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (_key, force) =>
            Effect.sync(() => forces.push(force)).pipe(
              Effect.andThen(Deferred.succeed(started, undefined)),
              Effect.andThen(Deferred.await(gate)),
            ),
        })

        yield* coordinator.wake("session")
        yield* Deferred.await(started)
        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(resumed)

        expect(forces).toEqual([false])
      }),
    ),
  )

  it.effect("starts execution when woken while idle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const drained = yield* Deferred.make<void>()
        const coordinator = yield* SessionRunCoordinator.make({ drain: () => Deferred.succeed(drained, undefined) })

        yield* coordinator.wake("session")
        yield* Deferred.await(drained)
      }),
    ),
  )

  it.effect("snapshots only active executions", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstStarted = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        const firstGate = yield* Deferred.make<void>()
        const secondGate = yield* Deferred.make<void>()
        const coordinator = yield* SessionRunCoordinator.make({
          drain: (key: string) =>
            Deferred.succeed(key === "first" ? firstStarted : secondStarted, undefined).pipe(
              Effect.andThen(Deferred.await(key === "first" ? firstGate : secondGate)),
            ),
        })

        expect(Array.from(yield* coordinator.active)).toEqual([])
        const first = yield* coordinator.run("first").pipe(Effect.forkChild)
        yield* Deferred.await(firstStarted)
        expect(Array.from(yield* coordinator.active)).toEqual(["first"])

        const second = yield* coordinator.run("second").pipe(Effect.forkChild)
        yield* Deferred.await(secondStarted)
        expect(Array.from(yield* coordinator.active)).toEqual(["first", "second"])

        yield* Deferred.succeed(firstGate, undefined)
        yield* Fiber.join(first)
        expect(Array.from(yield* coordinator.active)).toEqual(["second"])
        yield* Deferred.succeed(secondGate, undefined)
        yield* Fiber.join(second)
        expect(Array.from(yield* coordinator.active)).toEqual([])
      }),
    ),
  )

  it.effect("cleans active executions after failure and defect", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const failure = new Error("failed")
        const defect = new Error("defect")
        const coordinator = yield* SessionRunCoordinator.make({
          drain: (key: string) => (key === "failure" ? Effect.fail(failure) : Effect.die(defect)),
        })

        const failed = yield* coordinator.run("failure").pipe(Effect.exit)
        expect(Exit.isFailure(failed) && Cause.hasFails(failed.cause)).toBeTrue()
        expect(Array.from(yield* coordinator.active)).toEqual([])

        const died = yield* coordinator.run("defect").pipe(Effect.exit)
        expect(Exit.isFailure(died) && Cause.hasDies(died.cause)).toBeTrue()
        expect(Array.from(yield* coordinator.active)).toEqual([])
      }),
    ),
  )

  it.effect("cleans active executions when its scope closes", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const coordinator = yield* Effect.scoped(
        Effect.gen(function* () {
          const coordinator = yield* SessionRunCoordinator.make({
            drain: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
          })
          yield* coordinator.wake("session")
          yield* Deferred.await(started)
          expect(Array.from(yield* coordinator.active)).toEqual(["session"])
          return coordinator
        }),
      )

      expect(Array.from(yield* coordinator.active)).toEqual([])
    }),
  )

  it.effect("coalesces wakes received during active execution", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstStarted = yield* Deferred.make<void>()
        const firstGate = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.flatMap((run) =>
                run === 1
                  ? Deferred.succeed(firstStarted, undefined).pipe(Effect.andThen(Deferred.await(firstGate)))
                  : Deferred.succeed(secondStarted, undefined),
              ),
            ),
        })

        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Deferred.await(firstStarted)
        yield* Effect.all([coordinator.wake("session"), coordinator.wake("session"), coordinator.wake("session")], {
          concurrency: "unbounded",
        })
        yield* Deferred.succeed(firstGate, undefined)
        yield* Deferred.await(secondStarted)
        yield* Fiber.join(resumed)

        expect(runs).toBe(2)
      }),
    ),
  )

  it.effect("runs again when woken during the follow-up", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstGate = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        const secondGate = yield* Deferred.make<void>()
        const thirdStarted = yield* Deferred.make<void>()
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.flatMap((run) =>
                run === 1
                  ? Deferred.await(firstGate)
                  : run === 2
                    ? Deferred.succeed(secondStarted, undefined).pipe(Effect.andThen(Deferred.await(secondGate)))
                    : Deferred.succeed(thirdStarted, undefined),
              ),
            ),
        })

        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* coordinator.wake("session")
        yield* Deferred.succeed(firstGate, undefined)
        yield* Deferred.await(secondStarted)
        yield* coordinator.wake("session")
        yield* Deferred.succeed(secondGate, undefined)
        yield* Deferred.await(thirdStarted)
        yield* Fiber.join(resumed)

        expect(runs).toBe(3)
      }),
    ),
  )

  it.effect("does nothing when interrupted while idle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const coordinator = yield* SessionRunCoordinator.make({ drain: () => Effect.void })
        yield* coordinator.interrupt("session")
      }),
    ),
  )

  for (const discardPending of [true, false]) {
    it.effect(
      discardPending
        ? "discards wakes during an opt-in exclusive hold and settles its waiters"
        : "retains one coalesced wake during an ordinary exclusive hold and settles its waiters",
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const held = yield* Deferred.make<void>()
            const gate = yield* Deferred.make<void>()
            const joining = yield* Deferred.make<void>()
            const log: string[] = []
            const coordinator = yield* SessionRunCoordinator.make<string, never>({
              drain: (_key, force) => Effect.sync(() => log.push(`drain ${force}`)).pipe(Effect.asVoid),
            })
            // Release before the coordinator's scope finalizer waits for its owned fiber, even on assertion failure.
            yield* Effect.addFinalizer(() => Deferred.succeed(gate, undefined))
            const owner = yield* coordinator.exclusive(
              "session",
              Effect.sync(() => log.push("held")).pipe(
                Effect.andThen(Deferred.succeed(held, undefined)),
                Effect.andThen(Deferred.await(gate)),
                Effect.andThen(Effect.sync(() => log.push("released"))),
              ),
              discardPending ? { discardPending: true } : undefined,
            ).pipe(Effect.forkChild)
            yield* Deferred.await(held)
            const waiter = yield* Deferred.succeed(joining, undefined).pipe(
              Effect.andThen(coordinator.run("session")),
              Effect.forkChild,
            )
            yield* Deferred.await(joining)
            yield* Effect.yieldNow
            yield* coordinator.wake("session")
            yield* coordinator.wake("session")
            yield* coordinator.wake("session")
            expect(yield* coordinator.active).toEqual(new Set(["session"]))
            expect(log).toEqual(["held"])
            yield* Deferred.succeed(gate, undefined)
            expect((yield* Fiber.join(owner))._tag).toBe("Some")
            yield* Fiber.join(waiter)
            expect(yield* coordinator.active).toEqual(new Set())
            expect(log).toEqual(discardPending ? ["held", "released"] : ["held", "released", "drain false"])
          }),
        ),
    )
  }

  it.effect("interrupts active execution and runs one follow-up for a wake recorded during it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const interrupted = yield* Deferred.make<void>()
        const followUp = yield* Deferred.make<void>()
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.flatMap((run) =>
                run === 1
                  ? Deferred.succeed(started, undefined).pipe(
                      Effect.andThen(Effect.never),
                      Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
                    )
                  : Deferred.succeed(followUp, undefined),
              ),
            ),
        })

        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Deferred.await(started)
        yield* Effect.all([coordinator.wake("session"), coordinator.wake("session")])
        yield* coordinator.interrupt("session")
        yield* Deferred.await(interrupted)
        yield* Deferred.await(followUp)

        const exit = yield* Fiber.await(resumed)
        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBeTrue()
        yield* Effect.yieldNow
        expect(Array.from(yield* coordinator.active)).toEqual([])
        expect(runs).toBe(2)
      }),
    ),
  )

  it.effect("promotes a steer admitted mid-drain after the drain is interrupted, never leaving it pending", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const promoted = yield* Deferred.make<void>()
        const inbox: string[] = []
        const promotedInputs: string[] = []
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          // Stands in for the runner: the first drain is mid-provider-turn, later drains promote what is pending.
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.flatMap((run) =>
                run === 1
                  ? Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))
                  : Effect.sync(() => promotedInputs.push(...inbox.splice(0))).pipe(
                      Effect.andThen(Deferred.succeed(promoted, undefined)),
                    ),
              ),
            ),
        })

        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Deferred.await(started)
        // PromptAdmitted records the durable row, then wakes.
        inbox.push("steer")
        yield* coordinator.wake("session")
        yield* coordinator.interrupt("session")
        yield* Fiber.await(resumed)
        yield* Deferred.await(promoted)

        expect(promotedInputs).toEqual(["steer"])
        expect(inbox).toEqual([])
        expect(runs).toBe(2)
      }),
    ),
  )

  it.effect("drops a wake recorded during the drain when interrupted with discardPending", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const interrupted = yield* Deferred.make<void>()
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.andThen(Deferred.succeed(started, undefined)),
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
            ),
        })

        yield* coordinator.wake("session")
        yield* Deferred.await(started)
        yield* coordinator.wake("session")
        yield* coordinator.interrupt("session", { discardPending: true })
        yield* Deferred.await(interrupted)
        yield* Effect.yieldNow

        expect(Array.from(yield* coordinator.active)).toEqual([])
        expect(runs).toBe(1)
      }),
    ),
  )

  it.effect("runs a wake registered during interruption cleanup", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstStarted = yield* Deferred.make<void>()
        const cleanupStarted = yield* Deferred.make<void>()
        const cleanupGate = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.flatMap((run) =>
                run === 1
                  ? Deferred.succeed(firstStarted, undefined).pipe(
                      Effect.andThen(Effect.never),
                      Effect.onInterrupt(() =>
                        Deferred.succeed(cleanupStarted, undefined).pipe(Effect.andThen(Deferred.await(cleanupGate))),
                      ),
                    )
                  : Deferred.succeed(secondStarted, undefined),
              ),
            ),
        })

        yield* coordinator.wake("session")
        yield* Deferred.await(firstStarted)
        const interrupt = yield* coordinator.interrupt("session").pipe(Effect.forkChild)
        yield* Deferred.await(cleanupStarted)
        yield* coordinator.wake("session")
        yield* Deferred.succeed(cleanupGate, undefined)
        yield* Fiber.join(interrupt)
        yield* Deferred.await(secondStarted)

        expect(runs).toBe(2)
      }),
    ),
  )

  it.effect("starts a resume registered during interruption cleanup", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstStarted = yield* Deferred.make<void>()
        const cleanupStarted = yield* Deferred.make<void>()
        const cleanupGate = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        const forces: boolean[] = []
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (_key, force) => {
            forces.push(force)
            return forces.length === 1
              ? Deferred.succeed(firstStarted, undefined).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onInterrupt(() =>
                    Deferred.succeed(cleanupStarted, undefined).pipe(Effect.andThen(Deferred.await(cleanupGate))),
                  ),
                )
              : Deferred.succeed(secondStarted, undefined)
          },
        })

        yield* coordinator.wake("session")
        yield* Deferred.await(firstStarted)
        const interrupt = yield* coordinator.interrupt("session").pipe(Effect.forkChild)
        yield* Deferred.await(cleanupStarted)
        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Deferred.succeed(cleanupGate, undefined)
        yield* Effect.all([Fiber.join(interrupt), Fiber.join(resumed)])
        yield* Deferred.await(secondStarted)

        expect(forces).toEqual([false, true])
      }),
    ),
  )

  it.effect("starts one follow-up when a wake races with failure", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        const failure = new Error("failed")
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.flatMap((run) =>
                run === 1
                  ? Deferred.await(gate).pipe(Effect.andThen(Effect.fail(failure)))
                  : Deferred.succeed(secondStarted, undefined),
              ),
            ),
        })

        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* coordinator.wake("session")
        yield* Deferred.succeed(gate, undefined)

        expect(yield* Fiber.join(resumed).pipe(Effect.flip)).toBe(failure)
        yield* Deferred.await(secondStarted)
        expect(runs).toBe(2)
      }),
    ),
  )

  it.effect("promotes an input admitted mid-drain with exactly one successor when the drain fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const promoted = yield* Deferred.make<void>()
        const failure = new Error("provider failed")
        const inbox: string[] = []
        const promotedInputs: string[] = []
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.flatMap((run) =>
                run === 1
                  ? Deferred.succeed(started, undefined).pipe(
                      Effect.andThen(Deferred.await(gate)),
                      Effect.andThen(Effect.fail(failure)),
                    )
                  : Effect.sync(() => promotedInputs.push(...inbox.splice(0))).pipe(
                      Effect.andThen(Deferred.succeed(promoted, undefined)),
                    ),
              ),
            ),
        })

        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Deferred.await(started)
        inbox.push("queued")
        yield* coordinator.wake("session")
        yield* Deferred.succeed(gate, undefined)

        expect(yield* Fiber.join(resumed).pipe(Effect.flip)).toBe(failure)
        yield* Deferred.await(promoted)
        yield* Effect.yieldNow
        expect(promotedInputs).toEqual(["queued"])
        expect(runs).toBe(2)
        expect(Array.from(yield* coordinator.active)).toEqual([])
      }),
    ),
  )

  it.effect("does not chain successors when the successor of a failed drain fails too", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const secondFailed = yield* Deferred.make<void>()
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++runs).pipe(
              Effect.flatMap((run) =>
                run === 1
                  ? Deferred.succeed(started, undefined).pipe(
                      Effect.andThen(Deferred.await(gate)),
                      Effect.andThen(Effect.fail(new Error("first"))),
                    )
                  : Deferred.succeed(secondFailed, undefined).pipe(Effect.andThen(Effect.fail(new Error("second")))),
              ),
            ),
        })

        const resumed = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Deferred.await(started)
        yield* coordinator.wake("session")
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.await(resumed)
        yield* Deferred.await(secondFailed)
        yield* Effect.yieldNow
        yield* Effect.yieldNow

        expect(runs).toBe(2)
        expect(Array.from(yield* coordinator.active)).toEqual([])
      }),
    ),
  )

  it.effect("does not cancel execution when a joined waiter is interrupted", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()
        let runs = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () => Effect.sync(() => runs++).pipe(Effect.andThen(Deferred.await(gate))),
        })

        const first = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        const second = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Fiber.interrupt(second)
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(first)

        expect(runs).toBe(1)
      }),
    ),
  )

  it.effect("ownership-aware: cancellation belongs only to the waiter that starts the active entry", () =>
    Effect.scoped(Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const stopped = yield* Deferred.make<void>()
      const runs: boolean[] = []
      const coordinator = yield* SessionRunCoordinator.make<string, never>({
        drain: (_key, force) => Effect.sync(() => runs.push(force)).pipe(
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(stopped, undefined)),
        ),
      })
      const owner = yield* coordinator.run("session", { interruptOnCancel: true }).pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const joiner = yield* coordinator.run("session", { interruptOnCancel: true }).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Fiber.interrupt(joiner)
      expect((yield* coordinator.active).has("session")).toBe(true)
      yield* Fiber.interrupt(owner)
      yield* Deferred.await(stopped)
      expect((yield* coordinator.active).size).toBe(0)
      expect(runs).toEqual([true])
    })),
  )

  it.effect("ownership-aware: a stopped starter cannot cancel a different successor entry", () =>
    Effect.scoped(Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const cleanupStarted = yield* Deferred.make<void>()
      const cleanupGate = yield* Deferred.make<void>()
      const successorStarted = yield* Deferred.make<void>()
      const forces: boolean[] = []
      const coordinator = yield* SessionRunCoordinator.make<string, never>({
        drain: (_key, force) => {
          forces.push(force)
          if (forces.length === 1) return Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(cleanupStarted, undefined).pipe(
              Effect.andThen(Deferred.await(cleanupGate)),
            )),
          )
          return Deferred.succeed(successorStarted, undefined).pipe(Effect.andThen(Effect.never))
        },
      })
      const owner = yield* coordinator.run("session", { interruptOnCancel: true }).pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const interruption = yield* coordinator.interrupt("session").pipe(Effect.forkChild)
      yield* Deferred.await(cleanupStarted)
      yield* coordinator.wake("session")
      yield* Deferred.succeed(cleanupGate, undefined)
      yield* Fiber.join(interruption)
      const exit = yield* Fiber.await(owner)
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      expect((yield* coordinator.active).has("session")).toBe(true)
      yield* Deferred.await(successorStarted)
      expect(forces).toEqual([true, false])
      yield* coordinator.interrupt("session")
    })),
  )

  it.effect("coalesces wakes held by a successful exclusive operation into one non-forced drain", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const holdStarted = yield* Deferred.make<void>()
        const holdGate = yield* Deferred.make<void>()
        const drainStarted = yield* Deferred.make<void>()
        const drainGate = yield* Deferred.make<void>()
        const forces: boolean[] = []
        const overlaps: boolean[] = []
        let holding = false
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (_key, force) =>
            Effect.sync(() => {
              forces.push(force)
              overlaps.push(holding)
            }).pipe(
              Effect.andThen(Deferred.succeed(drainStarted, undefined)),
              Effect.andThen(Deferred.await(drainGate)),
            ),
        })
        // Register after the coordinator so LIFO teardown releases gates before awaiting its fibers.
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(holdGate, undefined).pipe(
            Effect.andThen(Deferred.succeed(drainGate, undefined)),
            Effect.asVoid,
          ),
        )
        const holdEffect = Effect.sync(() => (holding = true)).pipe(
          Effect.andThen(Deferred.succeed(holdStarted, undefined)),
          Effect.andThen(Deferred.await(holdGate)),
          Effect.as("held"),
          Effect.ensuring(Effect.sync(() => (holding = false))),
        )

        const owner = yield* coordinator.exclusive("session", holdEffect).pipe(Effect.forkChild)
        yield* Deferred.await(holdStarted)
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        expect(forces).toEqual([])
        expect((yield* coordinator.active).has("session")).toBeTrue()
        const joiner = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Deferred.succeed(holdGate, undefined)
        expect(Option.getOrThrow(yield* Fiber.join(owner))).toBe("held")
        yield* Deferred.await(drainStarted)
        expect((yield* coordinator.active).has("session")).toBe(true)
        expect(yield* Deferred.isDone(drainGate)).toBe(false)
        expect(forces).toEqual([false])
        expect(overlaps).toEqual([false])
        yield* Deferred.succeed(drainGate, undefined)
        yield* Fiber.join(joiner)
        expect(Array.from(yield* coordinator.active)).toEqual([])
        expect(forces).toEqual([false])
      }),
    ),
  )

  it.effect("retains and coalesces wakes through exclusive interruption cleanup", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const holdStarted = yield* Deferred.make<void>()
        const cleanupStarted = yield* Deferred.make<void>()
        const cleanupGate = yield* Deferred.make<void>()
        const drainStarted = yield* Deferred.make<void>()
        const drainGate = yield* Deferred.make<void>()
        const forces: boolean[] = []
        const overlaps: boolean[] = []
        let holding = false
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (_key, force) =>
            Effect.sync(() => {
              forces.push(force)
              overlaps.push(holding)
            }).pipe(
              Effect.andThen(Deferred.succeed(drainStarted, undefined)),
              Effect.andThen(Deferred.await(drainGate)),
            ),
        })
        // Register after the coordinator so LIFO teardown releases gates before awaiting its fibers.
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(cleanupGate, undefined).pipe(
            Effect.andThen(Deferred.succeed(drainGate, undefined)),
            Effect.asVoid,
          ),
        )
        const holdEffect = Effect.sync(() => (holding = true)).pipe(
          Effect.andThen(Deferred.succeed(holdStarted, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Deferred.succeed(cleanupStarted, undefined).pipe(Effect.andThen(Deferred.await(cleanupGate))),
          ),
          Effect.ensuring(Effect.sync(() => (holding = false))),
        )

        const owner = yield* coordinator.exclusive("session", holdEffect).pipe(Effect.forkChild)
        yield* Deferred.await(holdStarted)
        yield* coordinator.wake("session")
        const interrupt = yield* coordinator.interrupt("session").pipe(Effect.forkChild)
        yield* Deferred.await(cleanupStarted)
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        expect(forces).toEqual([])
        expect((yield* coordinator.active).has("session")).toBeTrue()
        yield* Deferred.succeed(cleanupGate, undefined)
        yield* Fiber.join(interrupt)
        const exit = yield* Fiber.await(owner)
        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBeTrue()
        yield* Deferred.await(drainStarted)
        expect(forces).toEqual([false])
        expect(overlaps).toEqual([false])
        const joiner = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Deferred.succeed(drainGate, undefined)
        yield* Fiber.join(joiner)
        expect(forces).toEqual([false])
        expect(Array.from(yield* coordinator.active)).toEqual([])
      }),
    ),
  )

  it.effect("discardPending drops wakes recorded during an interrupted exclusive operation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const holdStarted = yield* Deferred.make<void>()
        const cleanupStarted = yield* Deferred.make<void>()
        const cleanupGate = yield* Deferred.make<void>()
        const forces: boolean[] = []
        const overlaps: boolean[] = []
        let holding = false
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (_key, force) =>
            Effect.sync(() => {
              forces.push(force)
              overlaps.push(holding)
            }),
        })
        // Register after the coordinator so LIFO teardown releases the gate before awaiting its fibers.
        yield* Effect.addFinalizer(() => Deferred.succeed(cleanupGate, undefined).pipe(Effect.asVoid))
        const holdEffect = Effect.sync(() => (holding = true)).pipe(
          Effect.andThen(Deferred.succeed(holdStarted, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Deferred.succeed(cleanupStarted, undefined).pipe(Effect.andThen(Deferred.await(cleanupGate))),
          ),
          Effect.ensuring(Effect.sync(() => (holding = false))),
        )

        const owner = yield* coordinator.exclusive("session", holdEffect).pipe(Effect.forkChild)
        yield* Deferred.await(holdStarted)
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        const interrupt = yield* coordinator.interrupt("session", { discardPending: true }).pipe(Effect.forkChild)
        yield* Deferred.await(cleanupStarted)
        expect(forces).toEqual([])
        expect((yield* coordinator.active).has("session")).toBeTrue()
        yield* Deferred.succeed(cleanupGate, undefined)
        yield* Fiber.join(interrupt)
        const exit = yield* Fiber.await(owner)
        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBeTrue()
        expect(forces).toEqual([])
        expect(overlaps).toEqual([])
        expect(Array.from(yield* coordinator.active)).toEqual([])
      }),
    ),
  )

  it.effect("keeps a fresh cleanup wake after discardPending clears an exclusive hold's earlier wake", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const holdStarted = yield* Deferred.make<void>()
        const cleanupStarted = yield* Deferred.make<void>()
        const cleanupGate = yield* Deferred.make<void>()
        const drainStarted = yield* Deferred.make<void>()
        const drainGate = yield* Deferred.make<void>()
        const forces: boolean[] = []
        const overlaps: boolean[] = []
        let holding = false
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (_key, force) =>
            Effect.sync(() => {
              forces.push(force)
              overlaps.push(holding)
            }).pipe(
              Effect.andThen(Deferred.succeed(drainStarted, undefined)),
              Effect.andThen(Deferred.await(drainGate)),
            ),
        })
        // Register after the coordinator so LIFO teardown releases gates before awaiting its fibers.
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(cleanupGate, undefined).pipe(
            Effect.andThen(Deferred.succeed(drainGate, undefined)),
            Effect.asVoid,
          ),
        )
        const holdEffect = Effect.sync(() => (holding = true)).pipe(
          Effect.andThen(Deferred.succeed(holdStarted, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Deferred.succeed(cleanupStarted, undefined).pipe(Effect.andThen(Deferred.await(cleanupGate))),
          ),
          Effect.ensuring(Effect.sync(() => (holding = false))),
        )

        const owner = yield* coordinator.exclusive("session", holdEffect).pipe(Effect.forkChild)
        yield* Deferred.await(holdStarted)
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        const interrupt = yield* coordinator.interrupt("session", { discardPending: true }).pipe(Effect.forkChild)
        yield* Deferred.await(cleanupStarted)
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        expect(forces).toEqual([])
        expect((yield* coordinator.active).has("session")).toBeTrue()
        yield* Deferred.succeed(cleanupGate, undefined)
        yield* Fiber.join(interrupt)
        const exit = yield* Fiber.await(owner)
        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBeTrue()
        yield* Deferred.await(drainStarted)
        expect(forces).toEqual([false])
        expect(overlaps).toEqual([false])
        const joiner = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Deferred.succeed(drainGate, undefined)
        yield* Fiber.join(joiner)
        expect(forces).toEqual([false])
        expect(Array.from(yield* coordinator.active)).toEqual([])
      }),
    ),
  )

  it.effect("runs different keys concurrently", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()
        const bothStarted = yield* Deferred.make<void>()
        let active = 0
        const coordinator = yield* SessionRunCoordinator.make({
          drain: () =>
            Effect.sync(() => ++active).pipe(
              Effect.tap(() => (active === 2 ? Deferred.succeed(bothStarted, undefined) : Effect.void)),
              Effect.andThen(Deferred.await(gate)),
            ),
        })

        const first = yield* coordinator.run("first").pipe(Effect.forkChild)
        const second = yield* coordinator.run("second").pipe(Effect.forkChild)
        yield* Deferred.await(bothStarted)
        yield* Deferred.succeed(gate, undefined)
        yield* Effect.all([Fiber.join(first), Fiber.join(second)])
      }),
    ),
  )

  it.effect("trampolines synchronous self-waking execution", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const limit = 20_000
        const completed = yield* Deferred.make<void>()
        let runs = 0
        let wake: (key: string) => Effect.Effect<void> = () => Effect.void
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (key) =>
            Effect.sync(() => ++runs).pipe(
              Effect.tap((run) => (run < limit ? wake(key) : Deferred.succeed(completed, undefined))),
              Effect.asVoid,
            ),
        })
        wake = coordinator.wake

        yield* coordinator.wake("session")
        yield* Deferred.await(completed)

        expect(runs).toBe(limit)
      }),
    ),
  )
})
