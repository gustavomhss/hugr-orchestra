// Remote only: the workflow builds Atlas before node --test script/atlas-genesis/*.test.mjs.
// All CAS, identity, grounding, projection and union operations below use the real compiled modules.
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { restoreRetainedCandidates } from "./retained-candidates.mjs"
import { createDiskStore, foldAstUnits, initAst } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { id } from "../../modules/atlas/packages/kernel/dist/src/index.js"
import { nodeKey, primaryAnchorId, upsert } from "../../modules/atlas/packages/knowledge/dist/src/index.js"
import { build } from "../../modules/atlas/packages/index/dist/src/index.js"

const OLD = "1".repeat(40)
const NEW = "2".repeat(40)
await initAst()

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "atlas-retained-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repo = join(root, "repo")
  mkdirSync(join(repo, "src"), { recursive: true })
  Array.from({ length: 8 }, (_, i) => writeFileSync(join(repo, `src/f${i}.ts`), `export const value${i} = ${i}\n`))
  const factOf = (spec) => {
    const file = `src/f${spec.file ?? 0}.ts`
    const tree = build(foldAstUnits({ path: file, content: readFileSync(join(repo, file), "utf8"), children: [] }), { documents: [] }).spatial
    return {
      kind: "advisory", id: file, tier: "T2", authoring: "ADVISORY", scope: "atlas:mined",
      claimNorm: spec.claim, claims: [], freshness: "FRESH",
      obviousness: { rank: "obvious", by: "harness-predicate" },
      grounding: { entries: [{ path: file, anchor: { kind: "file", qualifiedPath: file, subtreeHash: tree.subtreeHash } }] },
      ...(spec.slot === undefined ? {} : { predicateSlot: spec.slot }),
      ...(spec.extra === undefined ? {} : { extra: spec.extra }),
    }
  }
  // Fixture production, not a second restore: admit rows with the actual knowledge upsert and disk commit.
  const seed = (store, specs, legacy = false) => {
    const facts = specs.map(factOf)
    const committed = store.commitStaging((snapshot) => {
      const next = facts.reduce((projection, fact) => {
        const factRef = String(id(fact))
        const answerRef = String(id(`answer: ${fact.claimNorm}`))
        return upsert(projection, {
          nodeKey: String(nodeKey({ ...fact, slot: fact.predicateSlot })), contentHash: factRef,
          family: fact.kind, claimNorm: fact.claimNorm, scope: "atlas:mined", tier: "T2",
          primaryAnchor: fact.grounding.entries[0].path, answerRef,
          ...(fact.predicateSlot === undefined ? {} : { slot: fact.predicateSlot }),
          ...(legacy ? {} : { claimEvidenceByClaim: { [fact.claimNorm]: { factRef, answerRef } } }),
        }).store
      }, snapshot)
      return { out: undefined, next, put: facts.flatMap((fact) => [`answer: ${fact.claimNorm}`, fact]) }
    })
    assert.equal(committed.settled, true)
    return facts
  }
  const source = (name, revision, specs, legacy = false) => {
    const artifactRoot = join(root, name)
    const store = createDiskStore(join(artifactRoot, "atlas/cas"), () => revision)
    const facts = seed(store, specs, legacy)
    return { input: { artifactRoot, sourceRevision: revision }, store, facts }
  }
  const disk = createDiskStore(join(repo, ".atlas/cas"), () => NEW)
  return { root, repo, disk, source, seed }
}

function snapshot(store) {
  const read = store.commitStaging((p) => ({ out: p }))
  assert.equal(read.settled, true)
  return read.out
}

function files(root) {
  const walk = (path, prefix = "") => readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name
    return entry.isDirectory() ? walk(join(path, entry.name), name + "/")
      : [[name, createHash("sha256").update(readFileSync(join(path, entry.name))).digest("hex")]]
  })
  return Object.fromEntries(walk(root).sort(([a], [b]) => a.localeCompare(b)))
}

function changeWire(source, update) {
  const root = join(source.input.artifactRoot, "atlas")
  for (const name of readdirSync(root).filter((n) => /^staging(?:\.\d+)?\.json$/.test(n))) {
    const wire = JSON.parse(readFileSync(join(root, name), "utf8"))
    update(wire)
    writeFileSync(join(root, name), JSON.stringify(wire))
  }
}

function rekey(source, fact) {
  const view = { ...fact, slot: fact.predicateSlot }
  changeWire(source, (wire) => {
    wire.current[0][0] = String(nodeKey(view))
    wire.current[0][1].nodeKey = String(nodeKey(view))
    wire.current[0][1].primaryAnchor = String(primaryAnchorId(view))
  })
}

const refused = (code) => (error) => {
  assert.equal(error.name, "RetainedCandidatesError")
  assert.equal(error.code, code)
  assert.equal(error.receipt.settled, false)
  assert.equal(error.receipt.refusal, code)
  return true
}

test("old two plus newer seven union without replacing destination pointers; source bytes and projection survive", async (t) => {
  const f = fixture(t)
  const old = f.source("old", OLD, [{ claim: "old zero", file: 0 }, { claim: "old one", file: 1 }], true)
  const specs = Array.from({ length: 7 }, (_, file) => ({ claim: `new ${file}`, file }))
  const newer = f.source("new", NEW, specs)
  f.seed(f.disk, specs)
  const before = snapshot(f.disk)
  const originalOld = files(old.input.artifactRoot)
  const originalNew = files(newer.input.artifactRoot)
  const projection = join(f.repo, ".atlas/projection.json")
  writeFileSync(projection, "projection must not be read or written\n")
  const out = await restoreRetainedCandidates(f.repo, [old.input, newer.input])
  assert.equal(out.settled, true)
  assert.equal(out.retainedKeyCount, 7)
  assert.equal(out.retainedClaims, 9)
  assert.deepEqual(out.sources.map((s) => [s.sourceRevision, s.rowCount]), [[OLD, 2], [NEW, 7]])
  const after = snapshot(f.disk)
  assert.equal(after.current.size, 7)
  for (const [key, prior] of before.current) {
    const row = after.current.get(key)
    assert.equal(row.contentHash, prior.contentHash)
    assert.equal(row.answerRef, prior.answerRef)
    assert.equal(row.derivedAt, NEW)
    assert.ok(prior.claims.every((claim) => row.claims.includes(claim)))
    for (const claim of row.claims) {
      const receipt = row.claimEvidenceByClaim[claim]
      assert.equal(f.disk.get(receipt.factRef).claimNorm, claim)
      assert.equal(f.disk.get(receipt.answerRef), `answer: ${claim}`)
    }
  }
  assert.ok(out.sources[0].decisions.every((d) => d.decision === "union" && d.claimsAdded === 1))
  assert.ok(out.sources[1].decisions.every((d) => d.decision === "unchanged"))
  assert.deepEqual(files(old.input.artifactRoot), originalOld)
  assert.deepEqual(files(newer.input.artifactRoot), originalNew)
  assert.equal(readFileSync(projection, "utf8"), "projection must not be read or written\n")
  const durable = files(join(f.repo, ".atlas"))
  const again = await restoreRetainedCandidates(f.repo, [old.input, newer.input])
  assert.ok(again.sources.flatMap((s) => s.decisions).every((d) => d.decision === "unchanged"))
  assert.deepEqual(files(join(f.repo, ".atlas")), durable, "idempotence includes sidecar generation bytes")
})

test("new keys retain original revisions and full legacy row; actual slot mint and multi-claim carrier survive", async (t) => {
  const f = fixture(t)
  const old = f.source("old", OLD, [{ claim: "first" }], true)
  const newer = f.source("new", NEW, [{ claim: "second" }, { claim: "slot claim", slot: "gotcha" }])
  const original = [...snapshot(old.store).current.values()][0]
  await restoreRetainedCandidates(f.repo, [old.input, newer.input])
  const rows = snapshot(f.disk).current
  const row = rows.get(original.nodeKey)
  assert.deepEqual(row, {
    ...original, claims: ["first", "second"],
    claimEvidenceByClaim: {
      first: { factRef: original.contentHash, answerRef: original.answerRef },
      second: { factRef: String(id(newer.facts[0])), answerRef: String(id("answer: second")) },
    },
  })
  const slotted = [...rows.values()].find((r) => r.slot === "gotcha")
  assert.equal(slotted.nodeKey, String(nodeKey({ ...newer.facts[1], slot: "gotcha" })))
  assert.equal(slotted.derivedAt, NEW)
  assert.notEqual(slotted.nodeKey, original.nodeKey)
  const multiple = f.source("multiple", NEW, [{ file: 2, claim: "a" }, { file: 2, claim: "b" }])
  await restoreRetainedCandidates(f.repo, [multiple.input])
  const retained = snapshot(f.disk).current.get([...snapshot(multiple.store).current.keys()][0])
  assert.deepEqual(retained.claims, ["a", "b"])
  assert.deepEqual(Object.keys(retained.claimEvidenceByClaim), ["a", "b"])
})

test("same normalized claim with different factRef refuses the entire source, not a last-writer choice", async (t) => {
  const f = fixture(t)
  f.seed(f.disk, [{ claim: "shared" }])
  const bad = f.source("conflict", OLD, [{ file: 7, claim: "would be new" }, { claim: "shared", extra: "different fact bytes" }])
  const before = files(join(f.repo, ".atlas"))
  await assert.rejects(restoreRetainedCandidates(f.repo, [bad.input]), refused("claim-fact-conflict"))
  assert.deepEqual(files(join(f.repo, ".atlas")), before, "no new CAS or rows on a source conflict")
})

test("own __proto__, constructor and prototype claims roundtrip without changing Object.prototype", async (t) => {
  const f = fixture(t)
  const objectPrototype = Object.getOwnPropertyDescriptors(Object.prototype)
  const legacy = f.source("legacy", OLD, [{ claim: "__proto__" }], true)
  const carrier = f.source("carrier", NEW, [{ claim: "constructor" }, { claim: "prototype" }])
  // An own constructor JSON field is data, not a change to the object's actual prototype.
  changeWire(carrier, (wire) => { wire.constructor = { ordinaryJson: true } })
  await restoreRetainedCandidates(f.repo, [legacy.input, carrier.input])
  const row = [...snapshot(f.disk).current.values()][0]
  assert.deepEqual(row.claims, ["__proto__", "constructor", "prototype"])
  assert.equal(Object.getPrototypeOf(row.claimEvidenceByClaim), Object.prototype)
  for (const claim of row.claims) {
    assert.equal(Object.hasOwn(row.claimEvidenceByClaim, claim), true)
    const receipt = row.claimEvidenceByClaim[claim]
    assert.equal(f.disk.get(receipt.factRef).claimNorm, claim)
    assert.equal(f.disk.get(receipt.answerRef), `answer: ${claim}`)
  }
  const durable = files(join(f.repo, ".atlas"))
  const again = await restoreRetainedCandidates(f.repo, [legacy.input, carrier.input])
  assert.ok(again.sources.flatMap((source) => source.decisions).every((d) => d.decision === "unchanged"))
  assert.deepEqual(files(join(f.repo, ".atlas")), durable)
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), objectPrototype)
})

test("CAS IDs exclude freshness: matching hash with differing destination bytes refuses without overwrite", async (t) => {
  const f = fixture(t)
  const old = f.source("old", OLD, [{ claim: "one" }])
  const changed = { ...old.facts[0], freshness: "DRIFTED" }
  assert.equal(id(changed), id(old.facts[0]), "positive control: metadata-excluded collision is real")
  assert.equal(f.disk.put(changed), id(old.facts[0]))
  const before = files(join(f.repo, ".atlas"))
  await assert.rejects(restoreRetainedCandidates(f.repo, [old.input]), refused("cas-byte-conflict"))
  assert.deepEqual(files(join(f.repo, ".atlas")), before)
})

for (const [name, mutate, code] of [
  ["source revision", (s) => changeWire(s, (w) => { w.current[0][1].derivedAt = NEW }), "source-revision-mismatch"],
  ["foreign identity", (s) => changeWire(s, (w) => { w.identity = "foreign" }), "identity-mismatch"],
  ["unexpected source descriptor prototype", (s) => Object.setPrototypeOf(s.input, { untrusted: true }), "unsafe-prototype"],
  ["slot mismatch", (s) => changeWire(s, (w) => { w.current[0][1].slot = "gotcha" }), "node-key-mismatch"],
  ["non-candidate tier", (s) => changeWire(s, (w) => { w.current[0][1].tier = "T0" }), "row-identity"],
  ["forged node key", (s) => changeWire(s, (w) => { w.current[0][0] = "f".repeat(64); w.current[0][1].nodeKey = "f".repeat(64) }), "node-key-mismatch"],
  ["claim/fact mismatch", (s) => changeWire(s, (w) => { w.current[0][1].claims = ["invented"] }), "claim-fact-mismatch"],
  ["carrier missing own claim", (s) => changeWire(s, (w) => { w.current[0][1].claimEvidenceByClaim = {} }), "claim-evidence-keys"],
  ["carrier has extra claim", (s) => changeWire(s, (w) => { w.current[0][1].claimEvidenceByClaim.extra = w.current[0][1].claimEvidenceByClaim.one }), "claim-evidence-keys"],
  ["null carrier is not legacy", (s) => changeWire(s, (w) => { w.current[0][1].claimEvidenceByClaim = null }), "claim-evidence-shape"],
  ["carrier fact mismatch", (s) => changeWire(s, (w) => { w.current[0][1].claimEvidenceByClaim.one.factRef = "0".repeat(64) }), "missing-or-unsafe-file"],
]) test(`refuses ${name} using actual source store`, async (t) => {
  const f = fixture(t)
  const source = f.source("source", OLD, [{ claim: "one" }])
  mutate(source)
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused(code))
  assert.equal(snapshot(f.disk).current.size, 0)
})

test("legacy multi-claim rows cannot invent individual evidence", async (t) => {
  const f = fixture(t)
  const source = f.source("source", OLD, [{ claim: "one" }, { claim: "two" }])
  changeWire(source, (w) => { delete w.current[0][1].claimEvidenceByClaim })
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("legacy-multiclaim"))
})

test("each carrier claim must match its own respective fact, not merely a readable CAS object", async (t) => {
  const f = fixture(t)
  const source = f.source("source", OLD, [{ claim: "one" }, { claim: "two" }])
  changeWire(source, (w) => { w.current[0][1].claimEvidenceByClaim.one.factRef = String(id(source.facts[1])) })
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("claim-fact-mismatch"))
})

test("same fact with conflicting answer receipts refuses instead of silently replacing provenance", async (t) => {
  const f = fixture(t)
  f.seed(f.disk, [{ claim: "one" }])
  const source = f.source("source", OLD, [{ claim: "one" }])
  const alternate = source.store.put("different answer receipt")
  changeWire(source, (w) => {
    w.current[0][1].answerRef = alternate
    w.current[0][1].claimEvidenceByClaim.one.answerRef = alternate
  })
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("claim-answer-conflict"))
})

test("a later-source conflict reports already-settled sources, not an invented all-or-nothing rollback", async (t) => {
  const f = fixture(t)
  const first = f.source("first", OLD, [{ claim: "one" }])
  const second = f.source("second", NEW, [{ claim: "one", extra: "different fact" }])
  await assert.rejects(restoreRetainedCandidates(f.repo, [first.input, second.input]), (error) => {
    refused("claim-fact-conflict")(error)
    assert.deepEqual(error.receipt.sources.map((s) => s.sourceRevision), [OLD])
    assert.equal(error.receipt.activeSource.sourceRevision, NEW)
    assert.equal(error.receipt.retainedKeys.length, 1)
    return true
  })
  assert.equal([...snapshot(f.disk).current.values()][0].derivedAt, OLD)
})

test("missing and corrupt answer receipts are not silently skipped", async (t) => {
  const f = fixture(t)
  const source = f.source("source", OLD, [{ claim: "one" }])
  const row = [...snapshot(source.store).current.values()][0]
  const path = join(source.input.artifactRoot, "atlas/cas", row.answerRef.slice(0, 2), row.answerRef)
  writeFileSync(path, JSON.stringify("different answer"))
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("cas-integrity"))
  unlinkSync(path)
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("missing-or-unsafe-file"))
})

test("destination source drift refuses even though the CAS fact remains intact", async (t) => {
  const f = fixture(t)
  const source = f.source("source", OLD, [{ claim: "one" }])
  writeFileSync(join(f.repo, "src/f0.ts"), "export const value0 = 999\n")
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("grounding-mismatch"))
})

test("missing anchor hash cannot pass through undefined-equals-undefined", async (t) => {
  const f = fixture(t)
  const source = f.source("source", OLD, [{ claim: "one" }])
  const fact = structuredClone(source.facts[0])
  delete fact.grounding.entries[0].anchor.subtreeHash
  fact.grounding.entries[0].anchor.qualifiedPath += "::absent-symbol"
  const hash = String(id(fact))
  writeFileSync(join(source.input.artifactRoot, "atlas/cas", hash.slice(0, 2), hash), JSON.stringify(fact))
  rekey(source, fact)
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("grounding-shape"))
})

test("unsafe grounding paths and symlink CAS reads refuse", async (t) => {
  const f = fixture(t)
  const source = f.source("source", OLD, [{ claim: "one" }])
  const hash = String(id(source.facts[0]))
  const path = join(source.input.artifactRoot, "atlas/cas", hash.slice(0, 2), hash)
  const unsafe = structuredClone(source.facts[0])
  unsafe.grounding.entries[0].path = "../outside.ts"
  unsafe.grounding.entries[0].anchor.qualifiedPath = "../outside.ts"
  assert.equal(id(unsafe), hash, "grounding is independently validated, not CAS-authenticated")
  writeFileSync(path, JSON.stringify(unsafe))
  rekey(source, unsafe)
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("unsafe-path"))
  const external = join(f.root, "external")
  writeFileSync(external, JSON.stringify(source.facts[0]))
  unlinkSync(path)
  symlinkSync(external, path)
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("unsafe-path"))
})

test("empty evidence and non-immutable revision refuse rather than report an empty success", async (t) => {
  const f = fixture(t)
  await assert.rejects(restoreRetainedCandidates(f.repo, []), refused("missing-sources"))
  const source = f.source("source", OLD, [{ claim: "one" }])
  await assert.rejects(restoreRetainedCandidates(f.repo, [{ ...source.input, sourceRevision: "HEAD" }]), refused("invalid-source-revision"))
  changeWire(source, (w) => { w.current = []; w.cas = [] })
  await assert.rejects(restoreRetainedCandidates(f.repo, [source.input]), refused("empty-source"))
})
