import { expect, test } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { ReviewTools } from "@orchestra/core/review/tools"
import { SessionSchema } from "@orchestra/core/session"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, sourceText, stage } from "./fixture/lucy-engagement"
import { blobRoot, blobs, decoded } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { code, completed, History, request, script } from "./fixture/lucy-history"

test("H07 a suspended scoped history call cannot retain or succeed after close and rebind of the same Session", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const oldScope = yield* Scope.make()
    const newScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(oldScope, Exit.void))
    yield* Effect.addFinalizer(() => Scope.close(newScope, Exit.void))
    const retained: string[] = []
    let calls = 0
    const result = (marker: string) => ({ historyID: "a".repeat(64), text: marker, uri: "history:scope-test",
      argv: [], raw: marker, truncated: false })
    // Extra properties on a structurally assignable variable compile on the old Binding.
    // The old implementation ignores this handler; its real Git output causes the first causal assertion RED.
    const original = { repository: root.directory,
      history: () => Effect.gen(function* () {
        calls++
        if (calls === 1) return result("SCOPED-HISTORY-POSITIVE")
        yield* Deferred.succeed(entered, undefined)
        yield* Deferred.await(release)
        return result("LATE-OLD-HISTORY")
      }),
      retain: ({ text }: { readonly uri: string; readonly text: string }) => Effect.sync(() => { retained.push(text) }),
    }
    yield* ReviewTools.bind(host.parent.id, original).pipe(Effect.provideService(Scope.Scope, oldScope))
    const input = { op: "show", path: sourcePath }
    const positive = yield* host.call("review_history", input, "lucy")
    expect(positive.type, positive.text).toBe("text")
    expect(positive.text).toBe("SCOPED-HISTORY-POSITIVE")
    expect(retained).toEqual(["SCOPED-HISTORY-POSITIVE"])
    const pending = yield* host.call("review_history", input, "lucy").pipe(Effect.forkChild)
    expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)),
      Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
    yield* Scope.close(oldScope, Exit.void)
    const replacement = { repository: root.directory,
      history: () => Effect.succeed(result("NEW-HISTORY-POSITIVE")),
      retain: ({ text }: { readonly uri: string; readonly text: string }) => Effect.sync(() => { retained.push(text) }),
    }
    yield* ReviewTools.bind(host.parent.id, replacement).pipe(Effect.provideService(Scope.Scope, newScope))
    yield* Deferred.succeed(release, undefined)
    const late = yield* Fiber.join(pending)
    expect(late.type, late.text).toBe("error")
    expect(retained).toEqual(["SCOPED-HISTORY-POSITIVE"])
    const fresh = yield* host.call("review_history", input, "lucy")
    expect(fresh.type, fresh.text).toBe("text")
    expect(fresh.text).toBe("NEW-HISTORY-POSITIVE")
    expect(retained).toEqual(["SCOPED-HISTORY-POSITIVE", "NEW-HISTORY-POSITIVE"])
  }))))
}, 120_000)

for (const terminal of ["expired", "cancelled"] as const) {
  test(`H07 ${terminal}: original engagement lifetime closes history and cannot retain a later output`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const entered = yield* Deferred.make<string>()
      const cleaned = yield* Deferred.make<void>()
      const provider = script([code, { id: "show", name: "review_history", input: { op: "show", path: sourcePath } }])
      const returned = new Set<string>()
      const input = { ...request("history-" + terminal, "diligence"), timeBoxMinutes: 1 }
      const original = yield* root.open((host) => Effect.gen(function* () {
        yield* host.prepareIndex()
        const pending = yield* host.invoke(input).pipe(Effect.forkChild)
        expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)),
          Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
        const sessionID = yield* Deferred.await(entered)
        yield* completed(host, sessionID, code.id)
        const call = yield* completed(host, sessionID, "show")
        const value = Schema.decodeUnknownSync(History)(JSON.parse(call.text), { onExcessProperty: "error" })
        expect(value.text).toBe(sourceText)
        expect(value.anchorCommit).toBe(root.head)
        if (terminal === "expired") {
          yield* TestClock.adjust("59 seconds")
          expect(pending.pollUnsafe()).toBeUndefined()
          yield* TestClock.adjust("1 second")
          yield* Fiber.join(pending)
        } else yield* Fiber.interrupt(pending)
        expect(yield* Deferred.isDone(cleaned)).toBe(true)
        expect((yield* host.execution.active).size).toBe(0)
        const output = yield* host.invoke(input)
        const report = decoded(output)
        expect(report.status).toBe(terminal)
        expect(report.budget.deadlineAt - report.budget.startedAt).toBe(60_000)
        const before = yield* blobs(blobRoot(root, host))
        const late = yield* host.call("review_history", { op: "show", path: sourcePath }, "lucy", SessionSchema.ID.make(sessionID))
        expect(late.type, late.text).toBe("error")
        expect(yield* blobs(blobRoot(root, host))).toEqual(before)
        return { output, budget: report.budget, calls: root.requests.length }
      }), variantAdapter((log, modelRequest) => {
        if (stage(log.text) !== "entry") return provider.stream(log, modelRequest)
        if (!returned.has(log.sessionID)) {
          returned.add(log.sessionID)
          return provider.stream(log, modelRequest)
        }
        return Stream.unwrap(Deferred.succeed(entered, log.sessionID).pipe(Effect.andThen(Effect.never),
          Effect.ensuring(Deferred.succeed(cleaned, undefined))))
      }))
      yield* root.open((host) => Effect.gen(function* () {
        const replay = yield* host.invoke(input)
        expect(replay.text).toBe(original.output.text)
        expect(decoded(replay).budget).toEqual(original.budget)
        expect(root.requests.length).toBe(original.calls)
      }))
    })).pipe(Effect.provide(TestClock.layer())))
  }, 150_000)
}

