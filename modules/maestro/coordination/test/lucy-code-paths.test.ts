import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ReviewTools } from "@orchestra/core/review/tools"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { decoded, prepared, retained, run, seed, sourcePath, sourceText } from "./fixture/lucy-code-tools"

test("registered review locate applies negative paths to prepared-index ranges before retaining source lines", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* prepared(made)
  yield* ReviewTools.bind(made.sessionID, made.binding)
  const index = decoded(yield* made.call("code_query", { op: "symbols", name: "capturedValue" }))
  expect(index.result.hits).toContainEqual(expect.objectContaining({ range: expect.objectContaining({ path: sourcePath }) }))
  const control = decoded(yield* made.call("code_locate", { symbols: ["capturedValue"], paths: ["src/**"] }))
  expect(control.result.ranges).toContainEqual(expect.objectContaining({ path: sourcePath }))
  expect(yield* retained(made, control.evidence)).toContain(sourceText.trim())

  for (const paths of [["src/**", `!${sourcePath}`], [`!${sourcePath}`]]) {
    const lexical = decoded(yield* made.call("code_search", { pattern: "capturedValue", paths }))
    expect(lexical.result.matches).toEqual([])
    const excluded = decoded(yield* made.call("code_locate", { symbols: ["capturedValue"], paths }))
    expect(excluded.result.ranges).toEqual([])
    expect(yield* retained(made, excluded.evidence)).not.toContain(sourceText.trim())
  }
})))

test("registered review search keeps exclusions narrowing even after a later positive path", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* ReviewTools.bind(made.sessionID, made.binding)
  const control = decoded(yield* made.call("code_search", { pattern: "capturedValue", paths: ["src/**"] }))
  expect(control.result.matches).toContainEqual(expect.objectContaining({ path: sourcePath, text: sourceText.trim() }))
  const excluded = decoded(yield* made.call("code_search", {
    pattern: "capturedValue", paths: ["src/**", `!${sourcePath}`, sourcePath],
  }))
  expect(excluded.result.matches).toEqual([])
  expect(yield* retained(made, excluded.evidence)).not.toContain(sourceText.trim())
})))
