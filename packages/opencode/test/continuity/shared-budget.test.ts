import { expect, test } from "bun:test"
import { estimateCitation, estimateExact, estimateHostBase } from "@/continuity/artifact"
import { pricing } from "@/continuity/render"
import { Token } from "@/util/token"
import { body, catalogue, envelope, note, run, source } from "./artifact-fixture"
import { readExactFrames, readerDescriptor, readRenderedSources } from "./fixtures"

test("shared semantic cost is charged once while exact scalar paths remain directly named", () => {
  const units = Array.from({ length: 30 }, (_, index) => source({ id: `S${index + 1}`, role: "tool", kind: "json",
    value: `Opaque-${index}`, order: index, actor: "worker", scope: "/project/".repeat(40), recoverable: false,
    locator: { ...source().locator, path: ["state", "output", `field-${index}`] } }))
  const costs = pricing(units)
  expect(costs.sharedTokens).toBe(pricing(units.slice(0, 1)).sharedTokens)
  const selected = body({ exact: units.map((unit) => ({ source: unit.id, reason: "identifier" })) })
  const result = run(selected, catalogue(units), 6000)
  if (!result.ok) throw new Error(result.reason)
  const forecast = estimateHostBase(envelope) + costs.sharedTokens + units.reduce((sum, unit) => sum + estimateExact(unit, costs)!, 0)
  const separate = estimateHostBase(envelope) + units.reduce((sum, unit) => sum + estimateExact(unit)!, 0)
  expect(forecast).toBeGreaterThanOrEqual(Token.estimate(result.artifact.text))
  expect(forecast).toBeLessThan(separate)
  const frames = readExactFrames(result.artifact.text)
  expect(frames.map((frame) => frame.value)).toEqual(units.map((unit) => unit.value!))
  expect(readRenderedSources(result.artifact.text)).toEqual(units.map(({ value, ...unit }) => readerDescriptor(unit)))
  const records = result.artifact.text.split("\n").filter((line) => line.startsWith('{"frame":')).map((line) => JSON.parse(line))
  expect(records.map((record) => record.path)).toEqual(units.map((unit) => unit.locator.path))
  expect(records.map(({ source, reason }) => ({ source, reason }))).toEqual(selected.exact)
  expect(JSON.parse(result.artifact.text.split("\n").at(-1)!)).toEqual({ status: selected.status,
    notes: selected.notes, reference_only: selected.reference_only, issues: selected.issues })
  const forged = result.artifact.text.replace('"path":["state","output","field-0"]', '"path":["state","input","field-0"]')
  expect(forged).not.toBe(result.artifact.text)
  expect(() => readExactFrames(forged)).toThrow("exact path/provenance mismatch")
})

test("catalogue-priced forecast bounds every small mixed selection including retrieval and escaped metadata", () => {
  const units = Array.from({ length: 5 }, (_, index) => source({ id: `S${index + 1}`, role: "tool", order: index,
    actor: index % 2 ? "worker\u2028" : null, scope: index % 2 ? "local\nread-only" : "scope\u2029", exit: index % 2 ? 0 : null,
    locator: { ...source().locator, path: ["state", "output", "Case/Field", index] } }))
  const costs = pricing(units)
  for (let mask = 1; mask < 32; mask++) {
    const active = units.filter((_, index) => (mask & 1 << index) !== 0)
    const exact = active.filter((_, index) => index % 2 === 0)
    const cited = active.filter((unit) => !exact.includes(unit))
    const selected = body({ exact: exact.map((unit) => ({ source: unit.id, reason: "evidence" })),
      notes: [note({ sources: active.map((unit) => unit.id), text: "Recorded scope only.\u2028\u2029" })],
      reference_only: active.map((unit) => ({ source: unit.id, purpose: "Original\u2028record", retrieve_when: "debugging\u2029" })) })
    const result = run(selected, catalogue(units), 6000)
    if (!result.ok) throw new Error(result.reason)
    const forecast = estimateHostBase(envelope) + costs.sharedTokens + exact.reduce((sum, unit) => sum + estimateExact(unit, costs)!, 0) +
      cited.reduce((sum, unit) => sum + estimateCitation(unit, costs), 0) +
      Token.estimate(JSON.stringify(selected.notes).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029") +
        JSON.stringify(selected.reference_only).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029"))
    expect(forecast).toBeGreaterThanOrEqual(Token.estimate(result.artifact.text))
    expect(costs.index).toBeGreaterThanOrEqual(result.artifact.sources.length * 11 - 1)
  }
})
