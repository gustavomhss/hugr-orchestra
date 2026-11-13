import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import { Context, Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { ReviewCodeBinary } from "@orchestra/core/review/code-binary"
import { ReviewGit } from "@orchestra/core/review-toolkit/git"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { executable, failure, placeholder, serve, withTmp } from "./fixture/ripgrep-release"
import { it } from "./lib/effect"

const binary = (overrides: Partial<RipgrepBinary.Options>) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      AppNodeBuilder.build(ReviewCodeBinary.node, [
        [ReviewCodeBinary.node, Layer.effect(ReviewCodeBinary.Service, ReviewCodeBinary.make(overrides))],
      ]),
    )
    return Context.get(context, ReviewCodeBinary.Service)
  })

describe("ReviewCodeBinary", () => {
  test("ReviewGit.environment stays the frozen four-field control", () => {
    expect({ frozen: Object.isFrozen(ReviewGit.environment), fields: ReviewGit.environment }).toEqual({
      frozen: true,
      fields: {
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_NO_LAZY_FETCH: "1",
        GIT_ALLOW_PROTOCOL: "",
        GIT_TERMINAL_PROMPT: "0",
      },
    })
  })

  it.live("resolves an existing rg on PATH without fetching", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const found = Bun.which(executable)
        if (!found) throw new Error(`CI provisions ${executable}; none on PATH`)
        const directory = yield* withTmp
        const release = yield* serve(() => new Response("no-fetch"))
        const located = yield* binary({
          system: () => found,
          bundled: undefined,
          directory,
          release: placeholder(release.url),
          download: false,
        })
        expect(yield* located.filepath).toBe(found)
        expect(release.counter.requests).toBe(0)
        expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
      }),
    ),
  )

  it.live("download true still refuses fetch and install", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* withTmp
        const release = yield* serve(() => new Response("no-fetch"))
        const located = yield* binary({
          system: () => undefined,
          bundled: undefined,
          directory,
          release: placeholder(release.url),
          download: true,
        })
        const error = failure(yield* Effect.exit(located.filepath))
        expect(error).toBeInstanceOf(RipgrepBinary.Unavailable)
        expect(release.counter.requests).toBe(0)
        expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
      }),
    ),
  )
})
