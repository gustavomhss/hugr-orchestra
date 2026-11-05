// Remote-only mechanics tests. All claims, source, reference labels and model answers here are synthetic.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { gitBlob, loadCorpus, markdown, measure, prepare, score, summarize, validateReference } from "./realdata-evaluate.mjs"

const REVISION = "1".repeat(40)
const IDS = Array.from({ length: 6 }, (_, i) => i.toString(16).padStart(16, "0"))
const TEXT = '// Synthetic fixture, not a gold label\nexport const first = 1\n\n  export const last = "界"\n'

function fixture(t, text = TEXT) {
  const root = mkdtempSync(join(tmpdir(), "atlas-realdata-evaluate-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const sources = join(root, "source")
  const out = join(root, "out")
  mkdirSync(join(sources, "src"), { recursive: true })
  writeFileSync(join(sources, "src/fixture.ts"), text)
  writeFileSync(join(sources, "LICENSE"), "Synthetic mechanics-test license\n")
  const manifest = {
    schemaVersion: 1, repository: "synthetic/mechanics-only", revision: REVISION,
    license: { path: "LICENSE", gitBlob: gitBlob(readFileSync(join(sources, "LICENSE"))) },
    sources: [{ path: "src/fixture.ts", gitBlob: gitBlob(Buffer.from(text)) }],
    claims: IDS.map((id, i) => ({ id, path: "src/fixture.ts", claim: `Synthetic claim ${i}`, partition: i < 2 ? "calibration" : "heldout" })),
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest))
  const reference = (id) => ({
    revision: REVISION, producer: { id, method: "synthetic test fixture, not source-reviewed gold" },
    claims: manifest.claims.map((claim, i) => ({
      id: claim.id, partition: claim.partition,
      verdict: ["true", "false", "true", "unverifiable", "unverifiable", "false"][i],
      nonObvious: [true, false, true, false, false, true][i],
      citations: [{ path: "src/fixture.ts", startLine: 1, endLine: 1, quote: text.match(/[^\n]*\n|[^\n]+$/)[0] }],
    })),
  })
  const a = reference("synthetic-a")
  const b = reference("synthetic-b")
  b.claims[1].verdict = "true"
  b.claims[3].verdict = "false"
  b.claims[3].nonObvious = true
  const referenceA = join(root, "synthetic-reference-a.json")
  const referenceB = join(root, "synthetic-reference-b.json")
  const writeReferences = () => {
    writeFileSync(referenceA, JSON.stringify(a))
    writeFileSync(referenceB, JSON.stringify(b))
  }
  writeReferences()
  const evaluate = () => score(out, sources, referenceA, referenceB, manifestBytes)
  return { root, sources, out, manifest, manifestBytes, a, b, referenceA, referenceB, writeReferences, evaluate }
}

const refused = (code) => (error) => {
  assert.equal(error.name, "RealdataEvaluationError")
  assert.equal(error.code, code)
  return true
}

function outputs(f) {
  writeFileSync(join(f.out, `${IDS[0]}.out`), '{"verdict":"true","nonObvious":true,"reason":"synthetic"}\n')
  writeFileSync(join(f.out, `${IDS[1]}.out`), '{"verdict":"false","nonObvious":false,"reason":"synthetic"}')
  writeFileSync(join(f.out, `${IDS[2]}.out`), "This is not a one-line verdict.\n")
  // IDS[3] deliberately has no output.
  writeFileSync(join(f.out, `${IDS[4]}.out`), '{"verdict":"unverifiable","nonObvious":false,"reason":"synthetic"}')
  writeFileSync(join(f.out, `${IDS[5]}.out`), '{"verdict":"true","nonObvious":false,"reason":"synthetic"}')
}

test("Git blob hashing has fixed known empty and nonempty controls, including byte-length encoding", () => {
  assert.equal(gitBlob(Buffer.alloc(0)), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")
  assert.equal(gitBlob(Buffer.from("test content\n")), "d670460b4b4aece5915caf5c68d12f560a9fe3e4")
  const bytes = Buffer.from("界🙂é")
  assert.equal(bytes.length, 9)
  assert.notEqual(gitBlob(bytes), createHash("sha1").update(bytes).digest("hex"))
  assert.notEqual(gitBlob(bytes), createHash("sha1").update(`blob ${bytes.toString("utf8").length}\0`).update(bytes).digest("hex"))
})

test("prepare pins every claim, license, source, split, corpus, template, helper and actual full prompt without references", (t) => {
  const f = fixture(t)
  writeFileSync(f.referenceA, "invalid JSON: prepare must not read references")
  writeFileSync(f.referenceB, "invalid JSON: prepare must not read references")
  const sample = prepare(f.out, f.sources, f.manifestBytes)
  assert.equal(sample.corpusSha256, createHash("sha256").update(f.manifestBytes).digest("hex"))
  assert.equal(sample.promptHash, createHash("sha256").update(readFileSync(new URL("./judge-prompt.md", import.meta.url))).digest("hex"))
  assert.equal(sample.evaluatorSha256, createHash("sha256").update(readFileSync(new URL("./realdata-evaluate.mjs", import.meta.url))).digest("hex"))
  assert.equal(sample.helperSha256.source, createHash("sha256").update(readFileSync(new URL("./judge-source.mjs", import.meta.url))).digest("hex"))
  assert.equal(sample.helperSha256.judge, createHash("sha256").update(readFileSync(new URL("./judge.mjs", import.meta.url))).digest("hex"))
  assert.equal(sample.revision, REVISION)
  assert.deepEqual(sample.split, { calibration: IDS.slice(0, 2), heldout: IDS.slice(2) })
  assert.deepEqual(sample.fileGitBlobs, { LICENSE: f.manifest.license.gitBlob, "src/fixture.ts": f.manifest.sources[0].gitBlob })
  assert.deepEqual(sample.claims.map((c) => c.id), IDS)
  for (const pin of sample.claims) {
    const prompt = readFileSync(join(f.out, `${pin.id}.prompt`), "utf8")
    assert.match(prompt, /4:   export const last = "界"\n5: /)
    assert.match(prompt, /<<<DATA [a-f0-9]+\n/)
    assert.doesNotMatch(prompt, /synthetic-a|synthetic-b|reference-a|reference-b/)
    assert.equal(pin.sha256, createHash("sha256").update(prompt).digest("hex"))
  }
  assert.deepEqual(JSON.parse(readFileSync(join(f.out, "sample.json"), "utf8")), sample)
})

test("actual score includes every missing/malformed output, class support, disagreement and consensus denominator", (t) => {
  const f = fixture(t)
  prepare(f.out, f.sources, f.manifestBytes)
  outputs(f)
  const report = f.evaluate()
  assert.equal(report.absoluteGold, false)
  assert.equal(report.blinding, "instructional, not access-isolated")
  assert.equal(report.independentProposerJudge, false)
  assert.deepEqual(report.references.a.producer, f.a.producer)
  assert.deepEqual(report.references.b.producer, f.b.producer)
  assert.deepEqual(report.records.map((r) => r.id), IDS)
  assert.deepEqual(report.records.map((r) => r.referenceA), f.a.claims)
  assert.deepEqual(report.records.map((r) => r.referenceB), f.b.claims)
  const calibration = report.partitions.calibration
  assert.equal(calibration.denominator, 2)
  assert.equal(calibration.versusA.truthAgreement.value, 1)
  assert.equal(calibration.versusB.truthAgreement.value, 0.5)
  assert.deepEqual(calibration.consensusSubset.ids, [IDS[0]])
  const heldout = report.partitions.heldout
  assert.equal(heldout.denominator, 4)
  assert.deepEqual(heldout.failures, { count: 2, rate: { matches: 2, denominator: 4, value: 0.5, notEstimable: false }, missing: 1, malformed: 1 })
  assert.deepEqual(heldout.versusA.confusion, {
    true: { true: 0, false: 0, unverifiable: 1 },
    false: { true: 1, false: 0, unverifiable: 0 },
    unverifiable: { true: 0, false: 0, unverifiable: 2 },
  })
  assert.equal(heldout.versusA.truthAgreement.value, 0.5)
  assert.equal(heldout.versusA.successfulTruthAgreement.value, 0.25)
  assert.equal(heldout.versusA.nonObviousAgreement.value, 0.25)
  assert.equal(heldout.versusB.truthAgreement.value, 0.25)
  assert.deepEqual(Object.values(heldout.versusA.classes).map((c) => c.support), [1, 1, 2])
  assert.deepEqual(heldout.versusA.nonObviousSupports, { referenceTrue: 2, referenceFalse: 2, predictedTrue: 0, predictedFalse: 2, failedUnknown: 2 })
  assert.deepEqual(heldout.referenceAgreement.disagreements, [{ id: IDS[3], truth: true, nonObvious: true }])
  assert.deepEqual(heldout.consensusSubset.ids, [IDS[2], IDS[4], IDS[5]])
  assert.equal(heldout.consensusSubset.denominator, 3)
  assert.equal(heldout.consensusSubset.excluded, 1)
  assert.equal(heldout.consensusSubset.metrics.truthAgreement.value, 1 / 3)
  assert.equal(report.records[2].prediction.failure, "malformed-output")
  assert.equal(report.records[3].prediction.failure, "missing-output")
  assert.equal(report.records[3].prediction.nonObvious, null)
  assert.equal(report.records[3].outputSha256, null)
  assert.deepEqual(JSON.parse(readFileSync(join(f.out, "evaluation.json"), "utf8")), report)
  assert.match(markdown(report), /heldout \| 4 \| 2 \| 2\/4/)
  assert.match(markdown(report), /not absolute gold/)
  assert.match(markdown(report), /not access-isolated/)
})

test("confusion positive and negative controls are exact; absent classes and empty subsets are not estimable", () => {
  const a = new Map([
    ["a", { verdict: "true", nonObvious: true }],
    ["b", { verdict: "false", nonObvious: false }],
    ["c", { verdict: "unverifiable", nonObvious: true }],
  ])
  const perfect = [...a].map(([id, label]) => ({ id, partition: "calibration", prediction: { ...label, failed: false } }))
  assert.equal(measure(perfect, a).truthAgreement.value, 1)
  assert.equal(measure(perfect, a).nonObviousAgreement.value, 1)
  assert.deepEqual(measure(perfect, a).confusion, {
    true: { true: 1, false: 0, unverifiable: 0 }, false: { true: 0, false: 1, unverifiable: 0 }, unverifiable: { true: 0, false: 0, unverifiable: 1 },
  })
  const wrong = perfect.map((r, i) => ({ ...r, prediction: { verdict: ["false", "unverifiable", "true"][i], nonObvious: !r.prediction.nonObvious, failed: false } }))
  assert.equal(measure(wrong, a).truthAgreement.value, 0)
  assert.equal(measure(wrong, a).nonObviousAgreement.value, 0)
  const b = new Map([...a].map(([id, label]) => [id, { ...label, nonObvious: !label.nonObvious }]))
  const partitions = summarize(perfect, a, b)
  assert.equal(partitions.calibration.consensusSubset.denominator, 0)
  assert.deepEqual(partitions.calibration.consensusSubset.metrics.truthAgreement, { matches: 0, denominator: 0, value: null, notEstimable: true })
  assert.equal(partitions.heldout.denominator, 0)
  assert.equal(partitions.heldout.failures.rate.value, null)
  assert.equal(partitions.heldout.failures.rate.notEstimable, true)
  const oneClass = measure(perfect.slice(0, 1), a)
  assert.equal(oneClass.classes.false.recall.value, null)
  assert.equal(oneClass.classes.false.recall.notEstimable, true)
  assert.equal(oneClass.classes.false.precision.value, null)
  assert.equal(oneClass.classes.false.precision.notEstimable, true)
})

for (const [name, mutate, code] of [
  ["missing ID", (r) => r.claims.pop(), "reference-id-coverage"],
  ["unknown ID with unchanged count", (r) => { r.claims[0].id = "f".repeat(16) }, "reference-id-coverage"],
  ["duplicate ID with unchanged count", (r) => { r.claims[0].id = r.claims[1].id }, "reference-id-coverage"],
  ["altered quote", (r) => { r.claims[0].citations[0].quote += "invented" }, "citation-quote"],
  ["altered partition", (r) => { r.claims[0].partition = "heldout" }, "reference-partition"],
  ["altered revision", (r) => { r.revision = "2".repeat(40) }, "reference-revision"],
  ["no citations", (r) => { r.claims[0].citations = [] }, "reference-citations"],
  ["range beyond source", (r) => { r.claims[0].citations[0].endLine = 999 }, "citation-range"],
  ["foreign citation file", (r) => { r.claims[0].citations[0].path = "../foreign.ts" }, "citation-source"],
  ["invalid pseudo label", (r) => { r.claims[0].verdict = "plausible" }, "reference-label"],
]) test(`input mutation ${name} is rejected by the same reference validator and actual score`, (t) => {
  const f = fixture(t)
  const corpus = loadCorpus(f.sources, f.manifestBytes)
  assert.equal(validateReference(f.a, corpus).size, IDS.length)
  prepare(f.out, f.sources, f.manifestBytes)
  f.evaluate() // Positive control: missing outputs still give a complete, measurable result.
  mutate(f.a)
  assert.throws(() => validateReference(f.a, corpus), refused(code))
  f.writeReferences()
  assert.throws(f.evaluate, refused(code))
})

test("inclusive LF/CRLF citations accept precisely the keepends slice or one omitted terminal newline", (t) => {
  for (const newline of ["\n", "\r\n"]) {
    const f = fixture(t, ["header", "  indented", "", "tail", ""].join(newline))
    const corpus = loadCorpus(f.sources, f.manifestBytes)
    const span = ["  indented", "", "tail", ""].join(newline)
    const citation = f.a.claims[0].citations[0]
    citation.startLine = 2
    citation.endLine = 4
    for (const quote of [span, span.slice(0, -newline.length)]) {
      citation.quote = quote
      assert.equal(validateReference(f.a, corpus).size, IDS.length)
    }
    for (const quote of [span.trim(), span.replace("indented", "indented "), span.replace(newline + newline, newline), span + newline]) {
      citation.quote = quote
      assert.throws(() => validateReference(f.a, corpus), refused("citation-quote"))
    }
    if (newline === "\r\n") {
      citation.quote = span.slice(0, -1)
      assert.throws(() => validateReference(f.a, corpus), refused("citation-quote"))
    }
  }
})

for (const file of ["src/fixture.ts", "LICENSE"]) test(`source-byte mutation of ${file} refuses both preparation and scoring`, (t) => {
  const f = fixture(t)
  prepare(f.out, f.sources, f.manifestBytes)
  f.evaluate()
  writeFileSync(join(f.sources, file), readFileSync(join(f.sources, file), "utf8") + "altered byte span")
  assert.throws(() => prepare(join(f.root, "must-not-exist"), f.sources, f.manifestBytes), refused("source-gitblob-mismatch"))
  assert.equal(existsSync(join(f.root, "must-not-exist")), false)
  assert.throws(f.evaluate, refused("source-gitblob-mismatch"))
})

test("missing source and excessive source remain named helper refusals, never fabricated evidence", (t) => {
  const f = fixture(t)
  unlinkSync(join(f.sources, "src/fixture.ts"))
  assert.throws(() => prepare(f.out, f.sources, f.manifestBytes), { name: "JudgeSourceReadError", code: "JUDGE_SOURCE_UNAVAILABLE" })
  assert.equal(existsSync(f.out), false)
  // Larger than either the original helper bound or the lead's uniform 256000-byte successor.
  writeFileSync(join(f.sources, "src/fixture.ts"), "x".repeat(256001))
  assert.throws(() => prepare(f.out, f.sources, f.manifestBytes), { name: "JudgeSourceTooLargeError", code: "JUDGE_SOURCE_TOO_LARGE" })
  assert.equal(existsSync(f.out), false)
})

test("sample, partition and prompt-byte drift cannot be scored against a different preparation", (t) => {
  const f = fixture(t)
  const sample = prepare(f.out, f.sources, f.manifestBytes)
  f.evaluate()
  const metadata = join(f.out, "sample.json")
  const original = JSON.stringify(sample)
  sample.split.heldout.pop()
  writeFileSync(metadata, JSON.stringify(sample))
  assert.throws(f.evaluate, refused("sample-pin-mismatch"))
  writeFileSync(metadata, original)
  writeFileSync(join(f.out, `${IDS[0]}.prompt`), "invented source")
  assert.throws(f.evaluate, refused("prompt-bytes-mismatch"))
})

test("a repeated producer is not silently described as two independent references", (t) => {
  const f = fixture(t)
  prepare(f.out, f.sources, f.manifestBytes)
  f.b.producer.id = f.a.producer.id
  f.writeReferences()
  assert.throws(f.evaluate, refused("distinct-reference-producers-required"))
})

test("preparation refuses stale output directories instead of scoring historical calls as new evidence", (t) => {
  const f = fixture(t)
  mkdirSync(f.out)
  writeFileSync(join(f.out, `${IDS[0]}.out`), "historical output")
  assert.throws(() => prepare(f.out, f.sources, f.manifestBytes), refused("prepare-requires-empty-output-directory"))
  assert.equal(existsSync(join(f.out, "sample.json")), false)
  assert.equal(readFileSync(join(f.out, `${IDS[0]}.out`), "utf8"), "historical output")
})

test("an absent source root is a named refusal, not an empty successful corpus", (t) => {
  const f = fixture(t)
  assert.throws(() => prepare(f.out, join(f.root, "absent"), f.manifestBytes), refused("source-unavailable"))
  assert.equal(existsSync(f.out), false)
})
