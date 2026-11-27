import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { ReviewTools } from "@orchestra/core/review/tools"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { authoredSkills, run } from "./fixture/lucy-pr-entry"

// The registered PR request must own scratch cleanup, independently of the fixture's outer scope.
// beforeResume observes the actual binding and Git snapshot; Session execution remains the fixture's control-flow double.
const skills = await authoredSkills()

test(process.platform === "win32"
  ? "Windows refuses the public PR before source reads or child execution"
  : "the public PR owns captured source through short reads and releases it before returning", () =>
  Effect.runPromise(Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const observed: { sessionID: string; source: ReviewTools.CodeSource }[] = []
    yield* run(skills, {
      beforeResume: (sessionID) => Effect.gen(function* () {
        const first = yield* Effect.scoped(ReviewTools.readCode(sessionID)).pipe(Effect.orDie)
        expect(first.source.directory).not.toBe(first.source.worktree)
        expect(existsSync(first.source.directory)).toBe(true)
        expect(yield* Effect.promise(() => fs.readFile(path.join(first.source.directory, "src/a"), "utf8"))).toBe("export const value = 2\n")

        const second = yield* Effect.scoped(ReviewTools.readCode(sessionID)).pipe(Effect.orDie)
        expect(second.source).toEqual(first.source)
        expect(existsSync(first.source.directory)).toBe(true)
        expect(yield* Effect.promise(() => fs.readFile(path.join(second.source.directory, "src/a"), "utf8"))).toBe("export const value = 2\n")
        observed.push({ sessionID, source: second.source })
      }),
    }, (ctx) => Effect.gen(function* () {
      const settled = yield* ctx.invoke("maestro", { kind: "pr", baseRef: ctx.base, headRef: ctx.head, tier: "quick" })
      if (process.platform === "win32") {
        expect(settled).toEqual({ type: "error", text: "pr-facts-unsupported: private replay store requires supported Unix" })
        expect(observed).toEqual([])
        expect(ctx.touches.children).toEqual([])
        expect(ctx.touches.prompts).toEqual([])
        expect(ctx.touches.resumes).toBe(0)
        return
      }

      expect(ReviewResultV2.parse(settled.text)?.scope.head).toBe(ctx.head)
      expect(observed.length).toBeGreaterThan(0)
      expect(observed.length).toBe(ctx.touches.resumes)
      expect(new Set(observed.map((read) => read.source.directory)).size).toBe(1)
      // This is still inside run()'s outer scope: only the public request has settled.
      expect(existsSync(ctx.directory)).toBe(true)
      for (const read of observed) {
        expect(read.source.worktree).toBe(ctx.directory)
        expect(read.source.commit).toBe(ctx.head)
        expect(existsSync(read.source.directory)).toBe(false)
        const closed = yield* Effect.scoped(ReviewTools.readCode(read.sessionID)).pipe(Effect.flip)
        expect(closed.message).toBe(`review-code-binding-missing: ${read.sessionID}`)
      }
    }))
  })),
)
