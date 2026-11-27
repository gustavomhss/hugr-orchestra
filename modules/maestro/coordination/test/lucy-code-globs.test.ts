import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ReviewTools } from "@orchestra/core/review/tools"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { decoded, prepared, retained, run, seed, sourcePath, sourceText } from "./fixture/lucy-code-tools"

for (const exclusion of ["!*.ts", "!src"]) {
  test(`registered review locate preserves ripgrep exclusion ${exclusion} for indexed source ranges`, () => run(Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* seed
    yield* prepared(made)
    yield* ReviewTools.bind(made.sessionID, made.binding)
    const index = decoded(yield* made.call("code_query", { op: "symbols", name: "capturedValue" }))
    expect(index.result.hits).toContainEqual(expect.objectContaining({ range: expect.objectContaining({ path: sourcePath }) }))
    const control = decoded(yield* made.call("code_locate", { symbols: ["capturedValue"], paths: ["src/**"] }))
    expect(control.result.ranges).toContainEqual(expect.objectContaining({ path: sourcePath }))
    expect(yield* retained(made, control.evidence)).toContain(sourceText.trim())

    const paths = ["src/**", exclusion]
    const lexical = decoded(yield* made.call("code_search", { pattern: "capturedValue", paths }))
    expect(lexical.result.matches).toEqual([])
    const located = decoded(yield* made.call("code_locate", { symbols: ["capturedValue"], paths }))
    expect(located.result.ranges).toEqual([])
    expect(yield* retained(made, located.evidence)).not.toContain(sourceText.trim())
  })))
}
