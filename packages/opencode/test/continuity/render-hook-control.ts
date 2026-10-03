import assert from "node:assert/strict"
import { estimateCitation, estimateExact, render } from "@/continuity/artifact"
import { body, catalogue, note, run, source } from "./artifact-fixture"

const units = [source({ id: "S001", kind: "json", value: { exact: ["Domain-AbC/001", 0, false, null] } }),
  source({ id: "S002", role: "tool", order: 2, value: "read-only\r\nDomain-Hash-123\u2028\u2029" })]
const result = run(body({ exact: [{ source: "S001", reason: "constraint" }], notes: [note({ sources: ["S002"] })],
  reference_only: [{ source: "S002", purpose: "Original record", retrieve_when: "debugging" }] }), catalogue(units))
assert(result.ok)
const expected = result.artifact.text
const costs = [estimateCitation(units[1]), estimateExact(units[0])]
let calls = 0
assert(!Object.hasOwn(Object.prototype, "toJSON") && !Object.hasOwn(Array.prototype, "toJSON"))
Object.defineProperty(Object.prototype, "toJSON", { configurable: true, value() { calls++; return { value: "CORRUPTED" } } })
Object.defineProperty(Array.prototype, "toJSON", { configurable: true, value() { calls++; return ["forged-path"] } })
try {
  assert.equal(render(result.artifact), expected, "prototype hooks rewrote host data")
  assert.deepEqual([estimateCitation(units[1]), estimateExact(units[0])], costs, "prototype hooks rewrote cost hints")
  assert.equal(calls, 0, "renderer invoked a prototype hook")
} finally {
  Reflect.deleteProperty(Object.prototype, "toJSON")
  Reflect.deleteProperty(Array.prototype, "toJSON")
}
assert.equal(render(result.artifact), expected, "restored renderer differs")
console.log(JSON.stringify({ state: "prototype-hooks-not-invoked", positive: true, poison: true, restored: true }))
