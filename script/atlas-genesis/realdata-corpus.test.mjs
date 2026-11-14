import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import corpus from "./realdata-corpus-v1.json" with { type: "json" }

const artifactPath = "modules/atlas/harness/probes/adjudicate/xrepo-zod-a1-verdicts.tsv"
const artifactBlob = "3ed2bf6bff4551384c4ffdd2ca3662a6b26663b3"
const artifact = readFileSync(new URL(`../../${artifactPath}`, import.meta.url))
const lines = artifact.toString("utf8").split("\n")
if (lines.at(-1) === "") lines.pop()
assert.deepEqual(lines.shift().split("\t"), ["sha", "path", "j1", "j2", "j3", "majority", "claim"])
const historical = lines.map((line) => {
  const fields = line.split("\t")
  assert.equal(fields.length, 7, "historical TSV row must have seven fields")
  return { id: fields[0], path: fields[1], claim: fields[6] }
}).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// This same assertion body validates the real manifest and every in-memory mutant.
// It checks frozen inputs, not truth, model quality, or remote source-blob membership.
function assertCorpus(input) {
  assert.equal(createHash("sha1").update(`blob ${artifact.length}\0`).update(artifact).digest("hex"), artifactBlob)
  assert.equal(historical.length, 76)
  assert.equal(new Set(historical.map((entry) => entry.id)).size, 76)
  assert.deepEqual(Object.keys(input).sort(), ["claims", "inputArtifact", "license", "repository", "revision", "schemaVersion", "sources"])
  assert.equal(input.schemaVersion, 1)
  assert.equal(input.repository, "colinhacks/zod")
  assert.equal(input.revision, "ca42965df46b2f7e2747db29c40a26bcb32a51d5")
  assert.deepEqual(input.inputArtifact, { path: artifactPath, gitBlob: artifactBlob })
  assert.deepEqual(input.license, { path: "LICENSE", gitBlob: "2c93bb52b93391e665d01947afadde0d98e0ede5" })
  assert(Array.isArray(input.claims))
  assert.equal(input.claims.length, 76)
  assert.equal(new Set(input.claims.map((entry) => entry.id)).size, 76)
  assert.deepEqual(input.claims, historical.map((entry, index) => ({
    ...entry, partition: index < 24 ? "calibration" : "heldout",
  })))
  input.claims.forEach((entry) => {
    assert.deepEqual(Object.keys(entry).sort(), ["claim", "id", "partition", "path"], "blinded entries allow no label/provenance fields")
    assert.match(entry.id, /^[0-9a-f]{16}$/)
    assert.equal(typeof entry.claim, "string")
    assert(entry.claim.length > 0)
  })
  assert.equal(input.claims.filter((entry) => entry.partition === "calibration").length, 24)
  assert.equal(input.claims.filter((entry) => entry.partition === "heldout").length, 52)
  assert(Array.isArray(input.sources))
  assert(input.sources.length > 0, "source pins must not be empty")
  assert.equal(new Set(input.sources.map((source) => source.path)).size, input.sources.length)
  assert.deepEqual(input.sources.map((source) => source.path), [...new Set(historical.map((entry) => entry.path))].sort())
  input.sources.forEach((source) => {
    assert.deepEqual(Object.keys(source).sort(), ["gitBlob", "path"])
    assert.match(source.gitBlob, /^[0-9a-f]{40}$/)
  })
  input.claims.forEach((entry) => {
    assert.equal(input.sources.filter((source) => source.path === entry.path).length, 1, `one source pin required for ${entry.id}`)
  })
}

test("fixed real-claim input matches the committed TSV and has blinded, disjoint 24/52 partitions", () => {
  assertCorpus(corpus)
})

const mutations = [
  { name: "drop a claim", change: (input) => input.claims.pop() },
  { name: "alter a literal claim", change: (input) => { input.claims[0].claim += " altered" } },
  { name: "alter a path to another pinned source", change: (input) => { input.claims[0].path = input.claims[1].path } },
  { name: "alter a historical ID", change: (input) => { input.claims[0].id = "0000000000000000" } },
  { name: "reorder claims", change: (input) => input.claims.reverse() },
  { name: "lose a source pin", change: (input) => input.sources.pop() },
  { name: "empty the source list", change: (input) => { input.sources = [] } },
  { name: "duplicate a source pin", change: (input) => input.sources.push({ ...input.sources[0] }) },
  { name: "malform a source hash", change: (input) => { input.sources[0].gitBlob = "not-a-git-blob" } },
  { name: "change a partition", change: (input) => { input.claims[0].partition = "heldout" } },
  { name: "swap partitions while preserving counts", change: (input) => {
    input.claims[0].partition = "heldout"
    input.claims[24].partition = "calibration"
  } },
  { name: "overlap partitions by duplicating an ID", change: (input) => { input.claims[24].id = input.claims[0].id } },
  { name: "change the repository", change: (input) => { input.repository = "another/repo" } },
  { name: "change the revision", change: (input) => { input.revision = "0".repeat(40) } },
  { name: "change the input blob", change: (input) => { input.inputArtifact.gitBlob = "0".repeat(40) } },
  { name: "change the schema version", change: (input) => { input.schemaVersion = 2 } },
  { name: "lose license provenance", change: (input) => { delete input.license } },
  { name: "change the license blob", change: (input) => { input.license.gitBlob = "0".repeat(40) } },
  ...["vote", "votes", "j1", "j2", "j3", "majority", "label", "gold", "model", "provenance"].map((key) => ({
    name: `leak ${key} into a blinded claim`, change: (input) => { input.claims[0][key] = "leaked" },
  })),
]

mutations.forEach((mutation) => {
  test(`corpus assertions reject: ${mutation.name}`, () => {
    assertCorpus(corpus) // Positive control: the oracle must accept the original before rejecting its mutant.
    const changed = structuredClone(corpus)
    mutation.change(changed)
    assert.throws(() => assertCorpus(changed), { name: "AssertionError" })
  })
})
