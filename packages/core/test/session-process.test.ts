import { describe, expect, test } from "bun:test"
import { SessionProcess } from "@orchestra/core/session-process"
import { SessionV2 } from "@orchestra/core/session"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Schedule } from "effect"
import { it } from "./lib/effect"

const layer = LayerNode.compile(SessionProcess.node)

describe("SessionProcess", () => {
  it.live("launches, lists, and cancels a background process", () =>
    Effect.gen(function* () {
      const processes = yield* SessionProcess.Service
      const sessionID = "ses_session_process_test"
      const launched = yield* processes.launch({ sessionID, command: "sleep 30", title: "sleep" })
      expect(launched.processID).toBe(launched.id)

      const listed = yield* processes.list(sessionID)
      expect(listed).toHaveLength(1)
      expect(listed[0]?.id).toBe(launched.id)

      const got = yield* processes.get(sessionID, launched.id)
      expect(got?.id).toBe(launched.id)

      const cancelled = yield* processes.cancel(sessionID, launched.id)
      expect(cancelled).toBe(true)
      expect(yield* processes.list(sessionID)).toHaveLength(0)

      yield* processes.stopSession(sessionID)
    }).pipe(Effect.provide(layer)),
  )

  it.live("delivers a finished process's notice once the busy Session settles", () =>
    Effect.gen(function* () {
      const processes = yield* SessionProcess.Service
      const sessionID = "ses_session_process_busy"
      const delivered: string[] = []
      const state = { busy: true, waits: 0 }
      // Only the two calls the registry makes; the first synthetic lands mid-turn and is refused.
      const sessions = {
        synthetic: (input: { sessionID: SessionV2.ID; text: string }) =>
          Effect.suspend(() =>
            state.busy
              ? Effect.fail(new SessionV2.BusyError({ sessionID: input.sessionID }))
              : Effect.sync(() => delivered.push(input.text)),
          ),
        wait: () =>
          Effect.sync(() => {
            state.waits++
            state.busy = false
          }),
      } as unknown as SessionV2.Interface
      const launched = yield* processes
        .launch({ sessionID, command: "exit 3", title: "fails" })
        .pipe(Effect.provideService(SessionV2.Service, sessions))
      yield* processes.wait(sessionID, launched.id)
      yield* Effect.suspend(() => (delivered.length ? Effect.void : Effect.fail("pending"))).pipe(
        Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 250 }),
      )
      expect(delivered).toHaveLength(1)
      expect(delivered[0]).toContain('Background process "fails" failed: exit 3')
      expect(state.waits).toBe(1)
    }).pipe(Effect.provide(layer)),
  )

  it.live("withholds a background process's output once it shows a recognized secret", () =>
    Effect.gen(function* () {
      const processes = yield* SessionProcess.Service
      const sessionID = "ses_session_process_secret"
      // Built at runtime so the repository never holds a secret-shaped literal.
      const token = "gh" + "p_" + "y".repeat(40)
      const delivered: string[] = []
      const sessions = {
        synthetic: (input: { text: string }) => Effect.sync(() => delivered.push(input.text)),
        wait: () => Effect.void,
      } as unknown as SessionV2.Interface
      // The pause keeps the token ahead of the exit, so every read below sees it in the ring.
      const launched = yield* processes
        .launch({ sessionID, command: `printf '%s\\n' ${token}; sleep 0.3`, title: "leaks" })
        .pipe(Effect.provideService(SessionV2.Service, sessions))
      const waited = yield* processes.wait(sessionID, launched.id)
      yield* Effect.suspend(() => (delivered.length ? Effect.void : Effect.fail("pending"))).pipe(
        Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 250 }),
      )
      const got = yield* processes.get(sessionID, launched.id)
      const texts = [delivered[0] ?? "", waited.info?.output ?? "", got?.output ?? ""]
      texts.forEach((text) => {
        expect(text).not.toContain(token)
        expect(text).toContain("output withheld")
      })
    }).pipe(Effect.provide(layer)),
  )

  it.live("includes output printed right before exit in the finished notice", () =>
    Effect.gen(function* () {
      const processes = yield* SessionProcess.Service
      const sessionID = "ses_session_process_drain"
      const delivered: string[] = []
      const sessions = {
        synthetic: (input: { text: string }) => Effect.sync(() => delivered.push(input.text)),
        wait: () => Effect.void,
      } as unknown as SessionV2.Interface
      // A large burst then the marker with no pause: the exit lands while the pipe still holds the tail.
      const launched = yield* processes
        .launch({ sessionID, command: "head -c 2000000 /dev/zero | tr '\\0' x; printf drain-marker", title: "burst" })
        .pipe(Effect.provideService(SessionV2.Service, sessions))
      const waited = yield* processes.wait(sessionID, launched.id)
      yield* Effect.suspend(() => (delivered.length ? Effect.void : Effect.fail("pending"))).pipe(
        Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 250 }),
      )
      expect(delivered[0]).toContain("drain-marker")
      expect(waited.info?.output).toContain("drain-marker")
    }).pipe(Effect.provide(layer)),
  )

  it.live("forgets the oldest finished processes beyond the kept count", () =>
    Effect.gen(function* () {
      const processes = yield* SessionProcess.Service
      const sessionID = "ses_session_process_evict"
      const launched = yield* Effect.forEach(
        Array.from({ length: SessionProcess.FINISHED_KEPT + 1 }),
        () =>
          processes
            .launch({ sessionID, command: "true", title: "done" })
            .pipe(Effect.tap((info) => processes.wait(sessionID, info.id))),
      )
      const first = launched[0]!.id
      yield* Effect.suspend(() =>
        processes.get(sessionID, first).pipe(Effect.flatMap((info) => (info ? Effect.fail("kept") : Effect.void))),
      ).pipe(Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 250 }))
      expect(yield* processes.get(sessionID, first)).toBeUndefined()
      expect(yield* processes.get(sessionID, launched.at(-1)!.id)).toBeDefined()
    }).pipe(Effect.provide(layer)),
  )
})
