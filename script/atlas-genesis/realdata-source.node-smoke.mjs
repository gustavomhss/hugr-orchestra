// Remote-only independent source verification. Not included in the offline *.test.mjs bundle.
// Fetch immutable public bytes, never model answers, and never turn network failures into missing data.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import corpus from "./realdata-corpus-v1.json" with { type: "json" }

function requireTreePins(commit, tree, pins) {
  assert(commit && typeof commit === "object" && commit.tree && typeof commit.tree.sha === "string",
    "realdata-source: missing commit/tree identity")
  assert(tree && typeof tree === "object", "realdata-source: missing tree response")
  assert.equal(commit.sha, "ca42965df46b2f7e2747db29c40a26bcb32a51d5", "realdata-source: wrong commit")
  assert.equal(tree.sha, commit.tree.sha, "realdata-source: commit/tree mismatch")
  assert.equal(tree.truncated, false, "realdata-source: truncated tree")
  assert(Array.isArray(tree.tree) && tree.tree.length > 0, "realdata-source: missing tree entries")
  assert(Array.isArray(pins) && pins.length > 0, "realdata-source: missing source pins")
  assert.equal(new Set(pins.map((pin) => pin.path)).size, pins.length, "realdata-source: duplicate source pins")
  pins.forEach((pin) => {
    const entry = tree.tree.find((entry) => entry.path === pin.path)
    assert(entry && entry.type === "blob" && entry.mode === "100644", `realdata-source: missing/nonregular ${pin.path}`)
    assert.equal(entry.sha, pin.gitBlob, `realdata-source: wrong blob for ${pin.path}`)
  })
}

function requireBlob(bytes, expected) {
  assert.equal(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"), expected,
    "realdata-source: fetched bytes do not match pinned Git blob")
}

async function request(url) {
  const response = await fetch(url, { headers: { "User-Agent": "orchestra-atlas-genesis" }, signal: AbortSignal.timeout(30_000) })
  assert(response.ok, `realdata-source: request failed (${response.status}): ${url}`)
  return response
}

test("pinned real-data sources match the immutable commit tree and every fetched Git blob", async () => {
  assert.equal(corpus.repository, "colinhacks/zod")
  assert.equal(corpus.revision, "ca42965df46b2f7e2747db29c40a26bcb32a51d5")
  const api = `https://api.github.com/repos/${corpus.repository}/git`
  const commit = await (await request(`${api}/commits/${corpus.revision}`)).json()
  const tree = await (await request(`${api}/trees/${corpus.revision}?recursive=1`)).json()
  const pins = [...corpus.sources, corpus.license]
  requireTreePins(commit, tree, pins)
  // The exact same validator must reject each claimed metadata failure class.
  assert.throws(() => requireTreePins(commit, { ...tree, truncated: true }, pins), /truncated tree/)
  assert.throws(() => requireTreePins({}, tree, pins), /missing commit\/tree identity/)
  assert.throws(() => requireTreePins(commit, null, pins), /missing tree response/)
  assert.throws(() => requireTreePins(commit, { ...tree, tree: [] }, pins), /missing tree entries/)
  assert.throws(() => requireTreePins(commit, tree, []), /missing source pins/)
  assert.throws(() => requireTreePins(commit, tree, [pins[0], pins[0]]), /duplicate source pins/)
  assert.throws(() => requireTreePins(commit, tree, [{ ...pins[0], path: "missing-positive-control.ts" }]), /missing\/nonregular/)
  assert.throws(() => requireTreePins(commit, tree, [{ ...pins[0], gitBlob: "0".repeat(40) }]), /wrong blob/)
  const nonregular = { ...tree, tree: tree.tree.map((entry) => entry.path === pins[0].path ? { ...entry, mode: "120000" } : entry) }
  assert.throws(() => requireTreePins(commit, nonregular, pins), /missing\/nonregular/)
  requireBlob(Buffer.from("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a")
  assert.throws(() => requireBlob(Buffer.from("changed\n"), "ce013625030ba8dba906f756967f9e9ca394464a"), /fetched bytes/)
  // Bound external request concurrency without sharing output files or relying on tool rate limits.
  for (let offset = 0; offset < pins.length; offset += 4) {
    await Promise.all(pins.slice(offset, offset + 4).map(async (pin) => {
      const path = pin.path.split("/").map(encodeURIComponent).join("/")
      const response = await request(`https://raw.githubusercontent.com/${corpus.repository}/${corpus.revision}/${path}`)
      requireBlob(Buffer.from(await response.arrayBuffer()), pin.gitBlob)
    }))
  }
  console.log(`realdata-source: verified ${pins.length} immutable regular-file blobs, including license`)
})
