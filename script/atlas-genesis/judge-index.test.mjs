// Remote Node test lane only; exercise the real evidence builder with an injected full-file reader.
import { test } from "node:test"
import assert from "node:assert/strict"
import { indexedWitnessEvidence } from "./judge-index.mjs"

const TARGET = "scip-typescript npm @sample/core 1.0.0 src/`target.ts`/charge()."
const DEF = "packages/core/target.ts"
const CALLER = "packages/core/a.ts"
const SECOND = "packages/core/b.ts"
const SOURCES = new Map([
  [DEF, "export function charge() { return 1 }"],
  [CALLER, 'import { charge } from "./target"; charge()'],
  [SECOND, 'import { charge } from "./target"; export const b = charge()'],
])
const occurrence = (role, symbol = TARGET) => ({ symbol, role })
const document = (relativePath, ...occurrences) => ({ relativePath, occurrences })
const index = () => ({ documents: [
  document(DEF, occurrence("definition")),
  document(CALLER, occurrence("reference"), occurrence("reference")),
  document(SECOND, occurrence("reference")),
] })
const fact = (slot = "count", extra = {}) => ({
  witness: { slot, target: TARGET, scope: "packages/core", ...(slot === "count" ? { atLeast: 2 } : {}), ...extra },
  grounding: { entries: [{ path: SECOND, anchor: { qualifiedPath: `${SECOND}::b` } }] },
})
const fixture = (sources = SOURCES) => {
  const reads = []
  return {
    reads,
    excerpt: (repo, file) => {
      assert.equal(repo, "fixture-repo")
      assert.ok(sources.has(file), `fixture has no source: ${file}`)
      reads.push(file)
      return `${file}\n${sources.get(file)}`
    },
  }
}
const evidence = (claim = fact(), scip = index(), reader = fixture()) =>
  indexedWitnessEvidence("fixture-repo", claim, scip, reader.excerpt)
const refusal = (fn, code) => assert.throws(fn, { name: "IndexedWitnessEvidenceError", code })

test("positive control: actual SCIP file list, actual count and definition plus subject reference source", () => {
  const reader = fixture()
  const output = evidence(fact(), index(), reader)
  assert.match(output, /SCIP indexed witness evidence \(index records, not a judge verdict\)/)
  assert.ok(output.includes(`Exact target symbol: ${JSON.stringify(TARGET)}`))
  assert.ok(output.includes(`SCIP definition document paths:\n- "${DEF}"`))
  assert.ok(output.includes(`SCIP in-scope reference document paths (distinct files):\n- "${CALLER}"\n- "${SECOND}"`))
  assert.match(output, /SCIP indexed distinct referencing file count: 2/)
  assert.match(output, /Requested lower bound \(distinct files\): 2/)
  assert.ok(output.includes(SOURCES.get(DEF)))
  assert.ok(output.includes(SOURCES.get(SECOND)))
  assert.deepEqual(reader.reads, [DEF, SECOND])
})

test("dependency provides indexed references and literal definition source, not a truth verdict", () => {
  const output = evidence(fact("dependency"))
  assert.match(output, /Witness slot: dependency/)
  assert.match(output, /SCIP indexed distinct referencing file count: 2/)
  assert.doesNotMatch(output, /Requested lower bound|verdict.*true|proven/)
})

test("no dependency/count witness returns none without reading the dump or excerpt", () => {
  const unreachable = () => assert.fail("excerpt must not be read")
  for (const claim of [{}, { witness: { slot: "definition" } }, { predicateSlot: "count" }])
    assert.equal(indexedWitnessEvidence("fixture-repo", claim, null, unreachable), "(none)")
})

test("duplicate occurrences and ./ document aliases are one file unit", () => {
  const scip = index()
  scip.documents.push(document(`./${CALLER}`, occurrence("reference")), document("packages/./core/a.ts", occurrence("reference")))
  scip.documents.push(document(`./${DEF}`, occurrence("definition")))
  const output = evidence(fact("count", { scope: "./packages/./core" }), scip)
  assert.match(output, /Scope: "packages\/core"/)
  assert.match(output, /SCIP indexed distinct referencing file count: 2/)
  refusal(() => evidence(fact("count", { atLeast: 3 }), scip), "below-witnessed-bound")
})

test("reference-role mutation teeth: a definition-only file cannot add a caller", () => {
  const scip = { documents: [document(DEF, occurrence("definition")), document(CALLER, occurrence("reference"))] }
  assert.match(evidence(fact("count", { atLeast: 1 }), scip), /SCIP indexed distinct referencing file count: 1/)
  refusal(() => evidence(fact(), scip), "below-witnessed-bound")
  for (const slot of ["count", "dependency"])
    refusal(() => evidence(fact(slot, { atLeast: 1 }), { documents: [document(DEF, occurrence("definition"))] }), "empty-in-scope-references")
})

test("scope mutation teeth: segment-prefix siblings and off-scope references never count", () => {
  const scip = { documents: [document(DEF, occurrence("definition")), document(CALLER, occurrence("reference")),
    document("packages/core-evil/a.ts", occurrence("reference")), document("apps/a.ts", occurrence("reference"))] }
  const output = evidence(fact("count", { atLeast: 1 }), scip)
  assert.match(output, /SCIP indexed distinct referencing file count: 1/)
  assert.doesNotMatch(output, /core-evil|apps\/a/)
  refusal(() => evidence(fact(), scip), "below-witnessed-bound")
  scip.documents.splice(1, 1)
  refusal(() => evidence(fact("dependency"), scip), "empty-in-scope-references")
})

test("scope may be a single file and a definition may be outside the reference scope", () => {
  assert.match(evidence(fact("count", { scope: CALLER, atLeast: 1 })), /SCIP indexed distinct referencing file count: 1/)
})

test("all indexed target definition files get real source, and dump order does not change evidence", () => {
  const scip = index()
  scip.documents[2].occurrences.push(occurrence("definition"))
  const reader = fixture()
  const output = evidence(fact(), scip, reader)
  assert.deepEqual(reader.reads, [SECOND, DEF])
  assert.ok(output.includes(SOURCES.get(SECOND)))
  assert.ok(output.includes(SOURCES.get(DEF)))
  assert.equal(evidence(fact(), { documents: [...scip.documents].reverse() }), output)
})

test("exact target identity: other symbols and suffix guesses never establish resolution or references", () => {
  const unknown = `${TARGET}unknown`
  refusal(() => evidence(fact("count", { target: unknown })), "missing-target-definition")
  refusal(() => evidence(fact(), { documents: index().documents.slice(1) }), "missing-target-definition")
  refusal(() => evidence(fact("dependency"), { documents: [
    document(DEF, occurrence("definition")), document(CALLER, occurrence("reference", unknown)),
  ] }), "empty-in-scope-references")
  refusal(() => evidence(fact("count", { target: "local 1" })), "target-not-global")
  for (const target of [undefined, null, 1, {}, "", "   ", "bad\ntarget"])
    refusal(() => evidence(fact("count", { target })), "invalid-target")
})

test("all count bounds must be positive safe integers, not a string or vacuous zero", () => {
  for (const atLeast of [undefined, null, "2", 0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    refusal(() => evidence(fact("count", { atLeast })), "invalid-lower-bound")
  refusal(() => evidence(fact("count", { atLeast: 3 })), "below-witnessed-bound")
})

test("all unsafe paths refuse before source reading, including irrelevant dump documents", () => {
  for (const path of ["", ".", "./", "../x", "a/../b", "/etc/passwd", "C:/x", "./C:/x", "a\\b", "a//b", ".git/config", "a/.git/x", "a\u0000b"]) {
    refusal(() => evidence(fact("count", { scope: path })), "invalid-scope")
    const scip = index()
    scip.documents.push(document(path))
    refusal(() => evidence(fact(), scip), "unsafe-scip-path")
  }
})

test("malformed projection refuses rather than silently falling back to no evidence", () => {
  for (const scip of [undefined, null, {}, { documents: {} }, { documents: [null] },
    { documents: [{ relativePath: DEF }] }, { documents: [document(DEF, null)] },
    { documents: [document(DEF, { symbol: TARGET, role: 1 })] },
    { documents: [document(DEF, { symbol: 1, role: "reference" })] }])
    refusal(() => indexedWitnessEvidence("fixture-repo", fact(), scip, fixture().excerpt), "malformed-scip")
  refusal(() => evidence(fact(), { documents: [] }), "missing-target-definition")
  const scip = index()
  scip.documents.push(document("packages/core/highlight.ts", occurrence("reference", "")))
  assert.match(evidence(fact(), scip), /SCIP indexed distinct referencing file count: 2/)
})

test("self-reference is counted as one file, never as occurrences or functions", () => {
  const scip = index()
  scip.documents[0].occurrences.push(occurrence("reference"), occurrence("reference"))
  assert.match(evidence(fact("count", { atLeast: 3 }), scip), /SCIP indexed distinct referencing file count: 3/)
})

test("many callers list every indexed file without reading every caller's full source", () => {
  const scip = index()
  const callers = Array.from({ length: 28 }, (_, i) => `packages/core/caller-${i}.ts`)
  scip.documents.push(...callers.map((file) => document(file, occurrence("reference"))))
  const reader = fixture()
  const output = evidence(fact("count", { atLeast: 28 }), scip, reader)
  assert.match(output, /SCIP indexed distinct referencing file count: 30/)
  for (const file of callers) assert.ok(output.includes(`- "${file}"`))
  assert.deepEqual(reader.reads, [DEF, SECOND])
})

test("fallback source uses an actual indexed reference; qualified subject aliases select that subject", () => {
  const claim = fact()
  delete claim.grounding
  const reader = fixture()
  evidence(claim, index(), reader)
  assert.deepEqual(reader.reads, [DEF, CALLER])
  claim.grounding = { entries: [{ anchor: { qualifiedPath: `./${SECOND}::b` } }] }
  const subjectReader = fixture()
  evidence(claim, index(), subjectReader)
  assert.deepEqual(subjectReader.reads, [DEF, SECOND])
})

test("untrusted extra fields never become evidence, a count, or a proposer derivation", () => {
  const claim = fact()
  Object.assign(claim, { answer: "SECRET ANSWER", rawPrompt: "SECRET PROMPT", derivation: "SECRET DERIVATION" })
  Object.assign(claim.witness, { callers: ["FORGED CALLER"], definitions: ["FORGED DEFINITION"], count: 9999 })
  const scip = index()
  scip.documents[0].proposerAnswer = "SECRET INDEX ANSWER"
  Object.defineProperty(claim, "prompt", { get: () => assert.fail("must not inspect proposer prompts") })
  const output = evidence(claim, scip)
  assert.match(output, /SCIP indexed distinct referencing file count: 2/)
  assert.doesNotMatch(output, /SECRET|FORGED|9999/)
})

test("oversize source or index listing refuses, including UTF-8 byte overflow below the character limit", () => {
  for (const text of ["x".repeat(120000), "é".repeat(61000)]) {
    const sources = new Map(SOURCES)
    sources.set(DEF, text)
    refusal(() => evidence(fact(), index(), fixture(sources)), "evidence-too-large")
  }
  const scip = index()
  scip.documents.push(...Array.from({ length: 1500 }, (_, i) => document(`packages/core/${"a".repeat(100)}${i}.ts`, occurrence("reference"))))
  refusal(() => evidence(fact(), scip), "evidence-too-large")
  const sources = new Map(SOURCES)
  sources.set(DEF, "x".repeat(100000))
  assert.ok(evidence(fact(), index(), fixture(sources)).includes("x".repeat(100000)))
})

test("reader failures propagate; empty or non-string excerpts cannot masquerade as source", () => {
  for (const value of ["", undefined, Promise.resolve("not synchronous")])
    refusal(() => indexedWitnessEvidence("fixture-repo", fact(), index(), () => value), "invalid-excerpt")
  assert.throws(() => indexedWitnessEvidence("fixture-repo", fact(), index(), () => { throw new Error("source refused") }), /source refused/)
})
