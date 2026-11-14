// Frozen descriptive evaluation, not absolute gold or a tuning/selection procedure.
// Reference format: {revision, producer:{id,...}, claims:[{id,partition,verdict,nonObvious,
// citations:[{path,startLine,endLine,quote}]}]}. Quotes cover complete inclusive line ranges.
// prepare <out> --sources <root>
// score <out> --sources <root> --reference-a <file> --reference-b <file>
import { createHash, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseVerdict, renderPrompt } from "./judge.mjs"
import { requireSourceExcerpt, safeRepoPath } from "./judge-source.mjs"

const CLASSES = ["true", "false", "unverifiable"]
const PARTITIONS = ["calibration", "heldout"]
const MANIFEST = new URL("./realdata-corpus-v1.json", import.meta.url)
const TEMPLATE = new URL("./judge-prompt.md", import.meta.url)
const SHA1 = /^[0-9a-f]{40}$/
const ID = /^[0-9a-f]{16}$/
const NONCE = /^[0-9a-f]{24}$/
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const fail = (code, details = {}) => {
  throw Object.assign(new Error(`realdata-evaluate:${code}: ${JSON.stringify(details)}`), {
    name: "RealdataEvaluationError", code, details,
  })
}
const requireValue = (condition, code, details) => { if (!condition) fail(code, details) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** SHA-1 of Git's byte-length-prefixed blob, not SHA-1 of the file alone. */
export function gitBlob(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
}

/** Tests may inject manifest bytes; the CLI always reads the committed, full-size manifest. */
export function loadCorpus(sources, manifestBytes) {
  const bytes = manifestBytes ?? readFileSync(MANIFEST)
  const manifest = JSON.parse(bytes.toString("utf8"))
  requireValue(manifest.schemaVersion === 1 && typeof manifest.repository === "string" && SHA1.test(manifest.revision), "manifest-shape")
  requireValue(Array.isArray(manifest.claims) && manifest.claims.length > 0 && Array.isArray(manifest.sources), "manifest-shape")
  requireValue(new Set(manifest.claims.map((c) => c.id)).size === manifest.claims.length, "duplicate-claim-id")
  const pins = [manifest.license, ...manifest.sources]
  requireValue(pins.every((p) => p && safeRepoPath(p.path) && !/[\0\r\n]/.test(p.path) && !p.path.split("/").includes(".") && SHA1.test(p.gitBlob)), "manifest-source-shape")
  requireValue(new Set(pins.map((p) => p.path)).size === pins.length, "duplicate-source-path")
  requireValue(manifest.claims.every((c) => ID.test(c.id) && typeof c.claim === "string" && c.claim.length > 0 && PARTITIONS.includes(c.partition) && manifest.sources.some((p) => p.path === c.path)), "manifest-claim-shape")
  const split = Object.fromEntries(PARTITIONS.map((partition) => [partition, manifest.claims.filter((c) => c.partition === partition).map((c) => c.id)]))
  if (manifestBytes === undefined)
    requireValue(manifest.claims.length === 76 && split.calibration.length === 24 && split.heldout.length === 52, "frozen-partition-size")
  const files = new Map(pins.map((pin) => {
    // This reader refuses absent/unsafe/oversize source, rather than presenting a refusal as evidence.
    try {
      const numbered = requireSourceExcerpt(sources, pin.path)
      const raw = readFileSync(join(sources, pin.path))
      requireValue(gitBlob(raw) === pin.gitBlob, "source-gitblob-mismatch", { path: pin.path, expected: pin.gitBlob, actual: gitBlob(raw) })
      return [pin.path, { gitBlob: pin.gitBlob, text: raw.toString("utf8"), numbered }]
    } catch (error) {
      if (["RealdataEvaluationError", "JudgeSourceReadError", "JudgeSourceTooLargeError"].includes(error.name)) throw error
      fail("source-unavailable", { path: pin.path, cause: error.message })
    }
  }))
  const template = readFileSync(TEMPLATE, "utf8")
  return {
    manifest, files, template,
    pins: {
      schemaVersion: 1, repository: manifest.repository, revision: manifest.revision,
      corpusSha256: sha256(bytes), promptHash: sha256(template),
      evaluatorSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      helperSha256: {
        judge: sha256(readFileSync(new URL("./judge.mjs", import.meta.url))),
        source: sha256(readFileSync(new URL("./judge-source.mjs", import.meta.url))),
      },
      split, fileGitBlobs: Object.fromEntries(pins.map((p) => [p.path, p.gitBlob])),
    },
  }
}

function claimPrompt(corpus, claim, nonce) {
  requireValue(typeof nonce === "string" && NONCE.test(nonce), "prompt-nonce-shape", { id: claim.id })
  const fields = {
    kind: "advisory", subject: claim.path, claim: claim.claim,
    source: corpus.files.get(claim.path).numbered, related: "(none)",
  }
  requireValue(Object.values(fields).every((text) => !text.includes(nonce)), "prompt-nonce-collision", { id: claim.id })
  return renderPrompt(corpus.template, fields, nonce)
}

/** No reference paths, annotations or historical model labels are read by preparation. */
export function prepare(out, sources, manifestBytes) {
  const corpus = loadCorpus(sources, manifestBytes)
  const prompts = corpus.manifest.claims.map((claim) => {
    const nonce = randomBytes(12).toString("hex")
    const text = claimPrompt(corpus, claim, nonce)
    return { id: claim.id, partition: claim.partition, path: claim.path, nonce, text, sha256: sha256(text) }
  })
  // Validate the complete corpus before exposing any prompts or sample metadata.
  requireValue(!existsSync(out) || readdirSync(out).length === 0, "prepare-requires-empty-output-directory")
  mkdirSync(out, { recursive: true })
  for (const prompt of prompts) writeFileSync(join(out, `${prompt.id}.prompt`), prompt.text)
  const sample = { ...corpus.pins, claims: prompts.map(({ text, ...pin }) => pin) }
  writeFileSync(join(out, "sample.json"), JSON.stringify(sample, null, 2) + "\n")
  return sample
}

/** Bind prepared input to the pre-execution freeze before spending any subscription requests. */
export function validateFreeze(sample, freeze) {
  requireValue(freeze?.version === 2 && /^[0-9a-f]{64}$/.test(freeze.corpusSha256) &&
    /^[0-9a-f]{64}$/.test(freeze.judgePromptSha256), "freeze-shape")
  requireValue(sample?.corpusSha256 === freeze.corpusSha256, "freeze-corpus-mismatch")
  requireValue(sample?.promptHash === freeze.judgePromptSha256, "freeze-prompt-mismatch")
}

/** Exact ID/partition coverage and verbatim pinned-source citations, not semantic validation of labels. */
export function validateReference(reference, corpus) {
  requireValue(reference && reference.revision === corpus.manifest.revision, "reference-revision")
  requireValue(reference.producer && typeof reference.producer.id === "string" && reference.producer.id.length > 0, "reference-producer")
  requireValue(Array.isArray(reference.claims) && reference.claims.length === corpus.manifest.claims.length, "reference-id-coverage")
  const labels = new Map(reference.claims.map((label) => [label.id, label]))
  requireValue(labels.size === corpus.manifest.claims.length && corpus.manifest.claims.every((claim) => labels.has(claim.id)), "reference-id-coverage")
  for (const claim of corpus.manifest.claims) {
    const label = labels.get(claim.id)
    requireValue(label.partition === claim.partition, "reference-partition", { id: claim.id })
    requireValue(CLASSES.includes(label.verdict) && typeof label.nonObvious === "boolean", "reference-label", { id: claim.id })
    requireValue(Array.isArray(label.citations) && label.citations.length > 0, "reference-citations", { id: claim.id })
    for (const citation of label.citations) {
      const source = corpus.files.get(citation.path)
      requireValue(source !== undefined && corpus.manifest.sources.some((pin) => pin.path === citation.path), "citation-source", { id: claim.id })
      const lines = source.text.match(/[^\n]*\n|[^\n]+$/g) ?? []
      requireValue(Number.isInteger(citation.startLine) && Number.isInteger(citation.endLine) && citation.startLine >= 1 && citation.endLine >= citation.startLine && citation.endLine <= lines.length, "citation-range", { id: claim.id })
      const span = lines.slice(citation.startLine - 1, citation.endLine).join("")
      requireValue(typeof citation.quote === "string" && (citation.quote === span || citation.quote === span.replace(/\r?\n$/, "")), "citation-quote", { id: claim.id, path: citation.path })
    }
  }
  return labels
}

const ratio = (matches, denominator) => ({ matches, denominator, value: denominator === 0 ? null : matches / denominator, notEstimable: denominator === 0 })

/** Confusion rows are reference classes; columns are model classes, including failed→unverifiable. */
export function measure(records, reference) {
  const confusion = Object.fromEntries(CLASSES.map((truth) => [truth, Object.fromEntries(CLASSES.map((predicted) => [predicted, 0]))]))
  for (const record of records) confusion[reference.get(record.id).verdict][record.prediction.verdict] += 1
  const classes = Object.fromEntries(CLASSES.map((label) => {
    const support = CLASSES.reduce((sum, predicted) => sum + confusion[label][predicted], 0)
    const predicted = CLASSES.reduce((sum, truth) => sum + confusion[truth][label], 0)
    return [label, { support, predicted, precision: ratio(confusion[label][label], predicted), recall: ratio(confusion[label][label], support) }]
  }))
  const truthMatches = records.filter((r) => r.prediction.verdict === reference.get(r.id).verdict)
  return {
    denominator: records.length, confusion, classes,
    nonObviousSupports: {
      referenceTrue: records.filter((r) => reference.get(r.id).nonObvious).length,
      referenceFalse: records.filter((r) => !reference.get(r.id).nonObvious).length,
      predictedTrue: records.filter((r) => r.prediction.nonObvious === true).length,
      predictedFalse: records.filter((r) => r.prediction.nonObvious === false).length,
      failedUnknown: records.filter((r) => r.prediction.nonObvious === null).length,
    },
    truthAgreement: ratio(truthMatches.length, records.length),
    successfulTruthAgreement: ratio(truthMatches.filter((r) => !r.prediction.failed).length, records.length),
    nonObviousAgreement: ratio(records.filter((r) => r.prediction.nonObvious === reference.get(r.id).nonObvious).length, records.length),
  }
}

export function summarize(records, a, b) {
  return Object.fromEntries(PARTITIONS.map((partition) => {
    const rows = records.filter((r) => r.partition === partition)
    const disagreements = rows.flatMap((r) => {
      const truth = a.get(r.id).verdict !== b.get(r.id).verdict
      const nonObvious = a.get(r.id).nonObvious !== b.get(r.id).nonObvious
      return truth || nonObvious ? [{ id: r.id, truth, nonObvious }] : []
    })
    const consensus = rows.filter((r) => a.get(r.id).verdict === b.get(r.id).verdict && a.get(r.id).nonObvious === b.get(r.id).nonObvious)
    const failed = rows.filter((r) => r.prediction.failed)
    return [partition, {
      denominator: rows.length,
      failures: { count: failed.length, rate: ratio(failed.length, rows.length), missing: failed.filter((r) => r.prediction.failure === "missing-output").length, malformed: failed.filter((r) => r.prediction.failure === "malformed-output").length },
      versusA: measure(rows, a), versusB: measure(rows, b),
      referenceAgreement: {
        truth: ratio(rows.filter((r) => a.get(r.id).verdict === b.get(r.id).verdict).length, rows.length),
        nonObvious: ratio(rows.filter((r) => a.get(r.id).nonObvious === b.get(r.id).nonObvious).length, rows.length),
        disagreements,
      },
      consensusSubset: { criteria: "both truth and nonObvious agree", ids: consensus.map((r) => r.id), denominator: consensus.length, excluded: rows.length - consensus.length, metrics: measure(consensus, a) },
    }]
  }))
}

const LIMITATIONS = [
  "Two source-review references are fallible, not absolute gold; citation validation does not prove label correctness.",
  "Blinding is instructional, not access-isolated. Same-model Grok proposer/judge: no independent-model claim.",
  "Calibration and heldout are reported separately; no tuning, parameter search or heldout-based selection is performed.",
  "Failed calls remain in every denominator and map to unverifiable in confusion/truth agreement; successfulTruthAgreement excludes them from matches only.",
  "Failed calls have null nonObvious and count as disagreement, not an invented false label. Zero-denominator metrics are not estimable.",
  "One pinned repository and this fixed claim mix do not establish general accuracy; absent classes cannot establish class performance.",
]

export function score(out, sources, referenceA, referenceB, manifestBytes) {
  const corpus = loadCorpus(sources, manifestBytes)
  const sampleBytes = readFileSync(join(out, "sample.json"))
  const sample = JSON.parse(sampleBytes.toString("utf8"))
  for (const [key, expected] of Object.entries(corpus.pins)) requireValue(same(sample[key], expected), "sample-pin-mismatch", { key })
  requireValue(Array.isArray(sample.claims) && sample.claims.length === corpus.manifest.claims.length, "sample-id-coverage")
  corpus.manifest.claims.forEach((claim, i) => {
    const pin = sample.claims[i]
    requireValue(pin.id === claim.id && pin.partition === claim.partition && pin.path === claim.path, "sample-claim-mismatch", { id: claim.id })
    const expected = Buffer.from(claimPrompt(corpus, claim, pin.nonce))
    const actual = readFileSync(join(out, `${claim.id}.prompt`))
    requireValue(sha256(actual) === pin.sha256, "prompt-bytes-mismatch", { id: claim.id })
    requireValue(actual.equals(expected), "prompt-reconstruction-mismatch", { id: claim.id })
  })
  const bytesA = readFileSync(referenceA)
  const bytesB = readFileSync(referenceB)
  const refA = JSON.parse(bytesA.toString("utf8"))
  const refB = JSON.parse(bytesB.toString("utf8"))
  const a = validateReference(refA, corpus)
  const b = validateReference(refB, corpus)
  requireValue(refA.producer.id !== refB.producer.id, "distinct-reference-producers-required")
  const records = corpus.manifest.claims.map((claim) => {
    const path = join(out, `${claim.id}.out`)
    const exists = existsSync(path)
    const bytes = exists ? readFileSync(path) : undefined
    const parsed = bytes === undefined ? null : parseVerdict(bytes.toString("utf8"))
    return {
      id: claim.id, partition: claim.partition,
      outputSha256: bytes === undefined ? null : sha256(bytes),
      prediction: parsed === null
        ? { verdict: "unverifiable", nonObvious: null, reason: "no valid one-line verdict", failed: true, failure: exists ? "malformed-output" : "missing-output" }
        : { ...parsed, failed: false },
      referenceA: a.get(claim.id), referenceB: b.get(claim.id),
    }
  })
  const report = {
    ...corpus.pins, sampleSha256: sha256(sampleBytes), absoluteGold: false,
    blinding: "instructional, not access-isolated", independentProposerJudge: false,
    references: { a: { sha256: sha256(bytesA), producer: refA.producer }, b: { sha256: sha256(bytesB), producer: refB.producer } },
    partitions: summarize(records, a, b), limitations: LIMITATIONS, records,
  }
  writeFileSync(join(out, "evaluation.json"), JSON.stringify(report, null, 2) + "\n")
  return report
}

export function markdown(report) {
  const show = (metric) => metric.notEstimable ? `not estimable (n=${metric.denominator})` : `${metric.matches}/${metric.denominator} (${(100 * metric.value).toFixed(1)}%)`
  return [
    "### Frozen judge versus two source-review references (not absolute gold)", "",
    `Corpus \`${report.corpusSha256}\`; revision \`${report.revision}\`; prompt \`${report.promptHash}\`.`, "",
    "| Split | n | Failed | Truth vs A | Truth vs B | Non-obvious vs A | Non-obvious vs B | Consensus subset n |",
    "| --- | ---: | ---: | --- | --- | --- | --- | ---: |",
    ...PARTITIONS.map((name) => {
      const p = report.partitions[name]
      return `| ${name} | ${p.denominator} | ${p.failures.count} | ${show(p.versusA.truthAgreement)} | ${show(p.versusB.truthAgreement)} | ${show(p.versusA.nonObviousAgreement)} | ${show(p.versusB.nonObviousAgreement)} | ${p.consensusSubset.denominator} |`
    }), "", "Class supports, 3×3 confusion matrices, reference disagreements and explicit subset denominators are in evaluation.json.",
    "", ...report.limitations.map((text) => `- ${text}`),
  ].join("\n")
}

function main(argv) {
  const [command, out, ...options] = argv
  requireValue(["prepare", "score"].includes(command) && typeof out === "string", "usage")
  requireValue(options.length % 2 === 0, "usage")
  const flags = new Map()
  for (let i = 0; i < options.length; i += 2) {
    requireValue(["--sources", ...(command === "score" ? ["--reference-a", "--reference-b"] : [])].includes(options[i]) && !flags.has(options[i]) && !options[i + 1].startsWith("--"), "usage")
    flags.set(options[i], options[i + 1])
  }
  requireValue(flags.has("--sources"), "sources-required")
  if (command === "prepare") {
    const sample = prepare(out, flags.get("--sources"))
    console.log(`Prepared ${sample.claims.length} pinned prompts (${sample.split.calibration.length} calibration / ${sample.split.heldout.length} heldout); no references read.`)
    return
  }
  requireValue(flags.has("--reference-a") && flags.has("--reference-b"), "two-references-required")
  console.log(markdown(score(out, flags.get("--sources"), flags.get("--reference-a"), flags.get("--reference-b"))))
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(process.argv.slice(2)) }
  catch (error) { console.error(`${error.name}: ${error.message}`); process.exitCode = 1 }
}
