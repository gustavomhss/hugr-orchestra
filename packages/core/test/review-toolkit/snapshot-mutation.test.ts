import { expect, test } from "bun:test"
import path from "node:path"
import { Effect, Fiber } from "effect"
import { withSnapshotMutation } from "../../src/review-toolkit/snapshot-mutation"
import { tmpdir } from "../fixture/tmpdir"

test("the mutation bracket awaits an in-flight change and its undo before the enclosing finalizer", async () => {
  await using fixture = await tmpdir()
  const file = path.join(fixture.path, "copy.txt")
  await Bun.write(file, "reviewed")
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const started = Promise.withResolvers<void>()
        const continueWrite = Promise.withResolvers<void>()
        const written = Promise.withResolvers<void>()
        const released: string[] = []
        const change = Effect.promise(async () => {
          started.resolve()
          await continueWrite.promise
          await Bun.write(file, "temporary")
          written.resolve()
        })
        const worker = yield* withSnapshotMutation(
          change,
          Effect.promise(async () => {
            await Bun.write(file, "reviewed")
            released.push("undo")
          }),
          Effect.never,
        ).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              released.push("outer-finalizer")
            }),
          ),
          Effect.forkChild,
        )
        yield* Effect.promise(() => started.promise)
        const interrupt = yield* Fiber.interrupt(worker).pipe(Effect.forkChild)
        yield* Effect.yieldNow
        continueWrite.resolve()
        yield* Effect.promise(() => written.promise)
        yield* Fiber.join(interrupt)
        expect(released).toEqual(["undo", "outer-finalizer"])
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("reviewed")
      }),
    ),
  )
})
