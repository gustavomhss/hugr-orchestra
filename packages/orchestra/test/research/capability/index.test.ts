import { describe, expect } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchRegistry } from "@/tool/research-registry"
import { CapabilitySupport } from "./support"

// JE-AC-X5 and JE-AC-E7 for code_query: with no Engine layer the index is not ready, and the tool says so with a typed
// Research.Error. It never answers with an empty result, because an empty result reads as "nothing found" (J2.12, J6.10).
// Mutation control: replace the `index_unavailable` failure in src/tool/code-query.ts with a successful empty answer.
describe("JE-AC-X5 the code index is unavailable, never empty", () => {
  CapabilitySupport.it.instance("every code_query op fails index_unavailable when no Engine is provided", () => Effect.gen(function* () {
    const fixture = yield* CapabilitySupport.dispatch()
    const research = yield* ResearchRegistry.make
    const query = (yield* research.init).find((tool) => tool.id === "code_query")
    if (!query) throw new Error("code_query is not registered")
    const inputs = [
      { op: "definition", name: "assemble" },
      { op: "references", name: "assemble" },
      { op: "callers", name: "assemble", path: "packages/orchestra/src/maestro/discovery-result.ts" },
      { op: "imports", path: "packages/orchestra/src/maestro/discovery-result.ts" },
      { op: "symbols", path: "packages/orchestra/src" },
      { op: "map" },
    ]
    for (const input of inputs) {
      const exit = yield* fixture.invoke(query, "code_query", input, true).pipe(Effect.exit)
      // The tool defines its failure as a defect (Tool.define's contract); the defect is the typed Research.Error.
      expect([input.op, Exit.isFailure(exit)]).toEqual([input.op, true])
      const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
      expect([input.op, error instanceof Research.Error && error.code]).toEqual([input.op, "index_unavailable"])
      expect(error instanceof Research.Error && error.message).toContain("toolkit-not-ready")
    }
    yield* fixture.sessions.remove(fixture.authority.id)
  }))
})
