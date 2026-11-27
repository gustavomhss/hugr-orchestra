import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ReviewTools } from "@orchestra/core/review/tools"
import { SessionSchema } from "@orchestra/core/session"
import { authoredSkills, call, run, type Ctx } from "./fixture/lucy-pr-entry"

// Registered Maestro PR request, real source binding and registered CODE settlement inside its child.
// The existing provider fixture is control flow only, not an LLM or durable Session-execution claim.
const skills = await authoredSkills()

test(process.platform === "win32"
  ? "standalone Maestro PR keeps the private-store Windows refusal"
  : "Maestro PR children can search captured code only while the request is open", () => {
  const state: { ctx?: Ctx; child?: string; observed?: string } = {}
  return Effect.runPromise(run(skills, {
    beforeResume: (sessionID) => Effect.gen(function* () {
      const ctx = state.ctx
      if (!ctx) return yield* Effect.die("PR callback has no fixture context")
      state.child = sessionID
      const source = yield* ReviewTools.readCode(sessionID).pipe(Effect.scoped, Effect.orDie)
      expect(source.source.commit).toBe(ctx.head)
      yield* Effect.promise(() => Bun.write(`${ctx.directory}/src/a`, "export const laterWorktree = 3\n"))
      const result = yield* call(ctx.registry, "lucy", SessionSchema.ID.make(sessionID), { pattern: "value" }, "code_search")
      expect(result.type).toBe("text")
      state.observed = result.text
      expect(result.text).toContain("export const value = 2")
      expect(result.text).not.toContain("laterWorktree")
    }),
  }, (ctx) => Effect.gen(function* () {
    state.ctx = ctx
    const result = yield* ctx.invoke("maestro", { kind: "pr", baseRef: ctx.base, headRef: ctx.head, tier: "quick" })
    if (process.platform === "win32") {
      expect(result.type).toBe("error")
      expect(result.text).toContain("unsupported")
      expect(ctx.touches.children).toEqual([])
      return
    }
    expect(result.type).toBe("text")
    expect(state.observed).toBeDefined()
    if (!state.child) return yield* Effect.die("PR did not run a review child")
    const closed = yield* call(ctx.registry, "lucy", SessionSchema.ID.make(state.child), { pattern: "value" }, "code_search")
    expect(closed.type).toBe("error")
    expect(closed.text).toContain("review-code-binding-missing")
  })))
})
