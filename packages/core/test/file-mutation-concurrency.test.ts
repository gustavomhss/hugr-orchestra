import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "bun:test"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FileMutation } from "@orchestra/core/file-mutation"
import { Format } from "@orchestra/core/format"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const bytes = new TextEncoder().encode("base")

it.live("independent Locations serialize the same physical target and its directory alias", () =>
  Effect.gen(function* () {
    const tmp = yield* temporary()
    yield* Effect.promise(() => fs.symlink(tmp.path, path.join(tmp.path, "alias"), "junction"))
    yield* Effect.promise(() => Bun.write(path.join(tmp.path, "shared.txt"), bytes))
    const release = yield* Deferred.make<void>()
    const entered = yield* Deferred.make<void>()
    const leftState = { reads: 0, formats: [] as string[], hold: release, entered }
    const rightState = { reads: 0, formats: [] as string[] }
    const left = yield* services(tmp.path, leftState)
    const right = yield* services(path.join(tmp.path, "alias"), rightState)
    const target = yield* left.mutation.resolve({ path: "shared.txt" })
    const alias = yield* right.mutation.resolve({ path: "shared.txt" })
    expect(alias.canonical).toBe(target.canonical)
    expect(left.files).not.toBe(right.files)
    const first = yield* left.files
      .writeIfUnchanged({ target, expected: bytes, content: "left" })
      .pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const second = yield* right.files
      .writeIfUnchanged({ target: alias, expected: bytes, content: "right" })
      .pipe(Effect.exit, Effect.forkChild)
    // The child gets one scheduling turn to reach the mutex or its first physical read.
    yield* Effect.yieldNow
    const readsBeforeRelease = rightState.reads
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(first)
    const result = yield* Fiber.join(second)
    expect(readsBeforeRelease).toBe(0)
    expect(Exit.isFailure(result) && Cause.prettyErrors(result.cause)[0]).toMatchObject({
      _tag: "FileMutation.StaleContentError",
    })
    expect(yield* Effect.promise(() => Bun.file(target.canonical).text())).toBe("left")
    expect(leftState.formats).toEqual([target.canonical])
    expect(rightState.formats).toEqual([])
  }),
)

it.live("independent canonical targets make progress while another Location holds its write", () =>
  Effect.gen(function* () {
    const tmp = yield* temporary()
    const release = yield* Deferred.make<void>()
    const entered = yield* Deferred.make<void>()
    const left = yield* services(tmp.path, { reads: 0, formats: [], hold: release, entered })
    const rightState = { reads: 0, formats: [] as string[] }
    const right = yield* services(tmp.path, rightState)
    const firstTarget = yield* left.mutation.resolve({ path: "first.txt" })
    const otherTarget = yield* right.mutation.resolve({ path: "other.txt" })
    const first = yield* left.files.write({ target: firstTarget, content: "held" }).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    yield* right.files
      .write({ target: otherTarget, content: "independent" })
      .pipe(Effect.timeout("10 seconds"), Effect.ensuring(Deferred.succeed(release, undefined)))
    expect(yield* Effect.promise(() => Bun.file(otherTarget.canonical).text())).toBe("independent")
    expect(rightState.formats).toEqual([otherTarget.canonical])
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(first)
  }),
)

it.live("a failed conditional write releases the physical-target lock for another Location", () =>
  Effect.gen(function* () {
    const tmp = yield* temporary()
    yield* Effect.promise(() => Bun.write(path.join(tmp.path, "shared.txt"), "current"))
    const first = yield* services(tmp.path, { reads: 0, formats: [] })
    const secondState = { reads: 0, formats: [] as string[] }
    const second = yield* services(tmp.path, secondState)
    const target = yield* first.mutation.resolve({ path: "shared.txt" })
    expect(
      yield* first.files.writeIfUnchanged({ target, expected: bytes, content: "stale" }).pipe(Effect.flip),
    ).toMatchObject({ _tag: "FileMutation.StaleContentError" })
    yield* second.files.writeIfUnchanged({ target, expected: new TextEncoder().encode("current"), content: "after" })
    expect(yield* Effect.promise(() => Bun.file(target.canonical).text())).toBe("after")
    expect(secondState.formats).toEqual([target.canonical])
  }),
)

function temporary() {
  return Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )
}

function services(
  directory: string,
  state: { reads: number; formats: string[]; hold?: Deferred.Deferred<void>; entered?: Deferred.Deferred<void> },
) {
  const filesystem = Layer.effect(
    FSUtil.Service,
    Effect.gen(function* () {
      const real = yield* FSUtil.Service
      return FSUtil.Service.of({
        ...real,
        readFile: (file) =>
          Effect.sync(() => {
            state.reads++
          }).pipe(Effect.andThen(real.readFile(file))),
        writePhysical: (file, content, options) =>
          Effect.suspend(() => {
            const hold = state.hold
            state.hold = undefined
            if (!hold || !state.entered) return real.writePhysical(file, content, options)
            return Deferred.succeed(state.entered, undefined).pipe(
              Effect.andThen(Deferred.await(hold)),
              Effect.andThen(real.writePhysical(file, content, options)),
            )
          }),
      })
    }),
  ).pipe(Layer.provide(LayerNode.compile(FSUtil.node)))
  const layer = AppNodeBuilder.build(LayerNode.group([LocationMutation.node, FileMutation.node]), [
    [
      Location.node,
      Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) }))),
    ],
    [FSUtil.node, filesystem],
    [
      Format.node,
      Layer.succeed(
        Format.Service,
        Format.Service.of({
          status: () => Effect.succeed([]),
          file: (file) =>
            Effect.sync(() => {
              state.formats.push(file)
              return false
            }),
        }),
      ),
    ],
  ])
  return Effect.gen(function* () {
    const context = yield* Layer.build(Layer.fresh(layer))
    return {
      files: Context.get(context, FileMutation.Service),
      mutation: Context.get(context, LocationMutation.Service),
    }
  })
}
