import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { gzipSync, gunzipSync } from "node:zlib"
import { rmSync } from "node:fs"
import { createDiskStore } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { checkpointStore, mineEnvironment } from "./checkpoint-runner.mjs"
import { checkpointRemote } from "./checkpoint-remote.mjs"
import { decodeChain, encodeEnvelope, gitBlob, restoreChain, sha256, snapshotFiles, validateEnvelope } from "./checkpoint.mjs"

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "genesis-checkpoint-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function chainFor(t) {
  const root = fixture(t)
  const original = controlStore(root)
  mkdirSync(join(root, "evidence"))
  writeFileSync(join(root, "evidence/plan-advisory.json"), '{"sites":[{"rank":1,"path":"src/control.ts"}]}\n')
  const snapshot = { version: 1, identity: controlIdentity, sequence: 1, previous: null, kind: "snapshot",
    boundary: "staging", files: snapshotFiles(root, join(root, "evidence")) }
  const records = [encodeEnvelope(snapshot, join(root, "first"), {})]
  const request = randomUUID()
  const dispatch = { version: 1, identity: controlIdentity, sequence: 2, previous: sha256(records[0]), kind: "dispatch",
    request, promptSha256: sha256("unexported prompt"), promptBytes: 17 }
  records.push(encodeEnvelope(dispatch, join(root, "second"), {}))
  const completion = { ...dispatch, sequence: 3, previous: sha256(records[1]), kind: "completion", exitCode: 0,
    stdout: Buffer.from("original completion bytes\n").toString("base64"), stderr: "" }
  records.push(encodeEnvelope(completion, join(root, "third"), {}))
  return { root, original, records, snapshot }
}

test("real DiskStore snapshot restores every original claim/answer byte and independent completion", (t) => {
  const f = chainFor(t)
  const out = join(f.root, "restored")
  const chain = restoreChain(f.records, controlIdentity, out)
  assert.equal(chain.completions.length, 1)
  assert.equal(chain.inFlight.length, 0)
  const restored = createDiskStore(join(out, "atlas/cas"))
  const staging = restored.commitStaging((projection) => ({ out: projection }))
  assert(staging.settled)
  assert.deepEqual(staging.out.current.get(f.original.row.nodeKey), f.original.row)
  for (const receipt of Object.values(f.original.row.claimEvidenceByClaim)) {
    for (const ref of [receipt.factRef, receipt.answerRef]) {
      assert.deepEqual(restored.get(ref), f.original.store.get(ref))
      assert.deepEqual(readFileSync(join(out, `atlas/cas/${ref.slice(0, 2)}/${ref}`)), readFileSync(join(f.root, `.atlas/cas/${ref.slice(0, 2)}/${ref}`)))
    }
  }
  assert.deepEqual(readFileSync(join(out, "atlas/staging.json")), readFileSync(join(f.root, ".atlas/staging.json")))
  assert.equal(Buffer.from(chain.completions[0].stdout, "base64").toString(), "original completion bytes\n")
  const partial = decodeChain(f.records.slice(0, 2), controlIdentity)
  assert.equal(partial.inFlight.length, 1)
  assert.equal(partial.completions.length, 0)
})

test("snapshot acknowledgement is mandatory before a real staging commit returns", (t) => {
  const root = fixture(t)
  const original = controlStore(root)
  const observed = []
  const store = checkpointStore(original.store, () => {
    observed.push("external ack")
    assert(original.store.commitStaging((p) => ({ out: p.current.size })).out > 0)
  })
  assert(store.commitStaging((p) => ({ out: p })).settled)
  observed.push("returned")
  assert.deepEqual(observed, ["external ack", "returned"])
  store.commitStaging((projection) => ({ out: true, next: { ...projection, current: new Map([
    ...projection.current, ["e".repeat(64), { ...original.row, nodeKey: "e".repeat(64) }],
  ]) } }))
  assert.deepEqual(observed, ["external ack", "returned", "external ack"], "a changed Map must require another external acknowledgement")
  const failed = checkpointStore(original.store, () => { throw new Error("upload refused") })
  assert.throws(() => failed.commitStaging((p) => ({ out: p })), /upload refused/)
  // Remove the actual checkpoint call; the same ordering assertion must then fail.
  const source = checkpointStore.toString()
  const needle = 'checkpoint("staging")'
  assert.equal(source.split(needle).length, 2)
  const mutant = Function("assert", "sha256", `return ${source.replace(needle, "void 0")}`)(assert, sha256)
  const events = []
  mutant(original.store, () => events.push("external ack")).commitStaging((p) => ({ out: p }))
  events.push("returned")
  assert.throws(() => assert.deepEqual(events, observed), assert.AssertionError)
})

test("protected identity actually binds the real miner's budget and selected arms", () => {
  const inherited = { ATLAS_MINE_BUDGET: "999", ATLAS_MINE_SLOT: "semantic", UNRELATED: "preserved" }
  const single = mineEnvironment({ ...controlIdentity, budget: "1", arms: ["definition"] }, inherited)
  assert.equal(single.ATLAS_MINE_BUDGET, "1")
  assert.equal(single.ATLAS_MINE_SLOT, "definition")
  assert.equal(single.UNRELATED, "preserved")
  const defaults = mineEnvironment(controlIdentity, inherited)
  assert.equal(defaults.ATLAS_MINE_BUDGET, "200")
  assert.equal(Object.hasOwn(defaults, "ATLAS_MINE_SLOT"), false)
  assert.deepEqual(inherited, { ATLAS_MINE_BUDGET: "999", ATLAS_MINE_SLOT: "semantic", UNRELATED: "preserved" })
})

test("incremental snapshots refer only to previously acknowledged, hash-checked bytes", (t) => {
  const f = chainFor(t)
  const known = new Map(f.snapshot.files.map((file) => [file.sha256, file.bytes]))
  const next = { ...f.snapshot, sequence: 4, previous: sha256(f.records[2]),
    files: f.snapshot.files.map((file) => ({ path: file.path, sha256: file.sha256 })) }
  const packed = encodeEnvelope(next, join(f.root, "fourth"), {}, known)
  assert(!gunzipSync(packed).toString().includes('"bytes"'))
  assert.equal(decodeChain([...f.records, packed], controlIdentity).envelopes.at(-1).files[0].bytes, f.snapshot.files[0].bytes)
  assert.throws(() => validateEnvelope(next, controlIdentity), /missing prior payload/)
})

for (const fault of ["payload", "missing-file", "wrong-identity", "chain", "reordered", "truncated", "traversal", "no-snapshot", "completion-without-dispatch", "swapped-carriers", "missing-carriers", "missing-sibling"]) {
  test(`restore refuses ${fault} before making a destination`, (t) => {
    const f = chainFor(t)
    const records = f.records.map((bytes) => Buffer.from(bytes))
    const first = JSON.parse(gunzipSync(records[0]))
    if (fault === "payload") first.files[0].bytes = Buffer.from("corrupt").toString("base64")
    if (fault === "missing-file") first.files = first.files.filter((file) => !file.path.startsWith("atlas/cas/"))
    if (fault === "wrong-identity") first.identity = { ...first.identity, budget: "199" }
    if (fault === "traversal") first.files[0].path = "../outside"
    if (fault === "swapped-carriers") {
      const cas = first.files.filter((file) => file.path.startsWith("atlas/cas/"))
      const swap = { bytes: cas[0].bytes, sha256: cas[0].sha256 }
      Object.assign(cas[0], { bytes: cas[1].bytes, sha256: cas[1].sha256 })
      Object.assign(cas[1], swap)
    }
    if (["missing-carriers", "missing-sibling"].includes(fault)) {
      const file = first.files.find((file) => file.path === "atlas/staging.json")
      const data = JSON.parse(Buffer.from(file.bytes, "base64"))
      const row = data.current[0][1]
      if (fault === "missing-carriers") {
        delete row.contentHash
        delete row.answerRef
        delete row.claimEvidenceByClaim
      }
      if (fault === "missing-sibling") delete row.claimEvidenceByClaim[row.claims[1]]
      file.bytes = Buffer.from(JSON.stringify(data)).toString("base64")
      file.sha256 = sha256(Buffer.from(file.bytes, "base64"))
    }
    const targeted = ["payload", "missing-file", "wrong-identity", "traversal", "swapped-carriers", "missing-carriers", "missing-sibling"].includes(fault)
    if (targeted) {
      records[0] = gzipSync(JSON.stringify(first))
      // Relink all successors: these controls must fail at their OWN guard, never a stale chain hash.
      for (let index = 1; index < records.length; index++) {
        const record = JSON.parse(gunzipSync(records[index]))
        record.previous = sha256(records[index - 1])
        records[index] = gzipSync(JSON.stringify(record))
      }
    }
    if (fault === "chain") records.splice(1, 1)
    if (fault === "reordered") records.reverse()
    if (fault === "truncated") records[0] = records[0].subarray(0, 15)
    if (fault === "no-snapshot") records.splice(0, 1)
    if (fault === "completion-without-dispatch") {
      const last = JSON.parse(gunzipSync(records[2]))
      last.request = randomUUID()
      records[2] = gzipSync(JSON.stringify(last))
    }
    const destination = join(f.root, "rejected")
    const expected = { payload: /payload hash mismatch/, "missing-file": /missing candidate receipt/,
      "wrong-identity": /identity mismatch/, chain: /missing\/reordered sequence/, reordered: /missing\/reordered sequence/,
      truncated: /unexpected end|invalid|incorrect/i, traversal: /invalid or duplicate path/,
      "no-snapshot": /missing\/reordered sequence/, "completion-without-dispatch": /unmatched completion/,
      "swapped-carriers": /CAS carrier address mismatch/, "missing-carriers": /missing fact carrier/,
      "missing-sibling": /missing individual claim carrier/ }
    assert.throws(() => restoreChain(records, controlIdentity, destination), expected[fault])
    assert.equal(existsSync(destination), false)
  })
}

test("decoded bytes are scanned before compression; symlinked snapshot input is refused", (t) => {
  const f = chainFor(t)
  const secret = "checkpoint-control-credential-123456789"
  const event = JSON.parse(gunzipSync(f.records[2]))
  event.stdout = Buffer.from(secret).toString("base64")
  assert.throws(() => encodeEnvelope(event, join(f.root, "secret"), { secrets: secret }), /credential scan refused/)
  mkdirSync(join(f.root, "outside"))
  symlinkSync(join(f.root, "outside"), join(f.root, "evidence/alias"))
  assert.throws(() => snapshotFiles(f.root, join(f.root, "evidence")), /symlink refused/)
})

test("remote acknowledgement requires a durable commit and exact independent blob readback", async () => {
  const bytes = gzipSync("remote control bytes")
  for (const fault of ["none", "upload", "readback", "wrong-upload-hash", "missing-commit"]) {
    const calls = []
    const remote = checkpointRemote({ repository: "owner/repo", token: "not-an-actual-token", request: async (url, options) => {
      calls.push(options.method ?? "GET")
      if (options.method === "PUT") return new Response(JSON.stringify({ content: { sha: fault === "wrong-upload-hash" ? "0".repeat(40) : gitBlob(bytes) },
        commit: { sha: fault === "missing-commit" ? null : "1".repeat(40) } }), { status: fault === "upload" ? 503 : 201 })
      return new Response(JSON.stringify({ encoding: "base64", content: (fault === "readback" ? Buffer.from("altered") : bytes).toString("base64") }))
    } })
    if (fault !== "none") {
      await assert.rejects(remote.append(controlIdentity, 1, bytes), /checkpoint:/)
      continue
    }
    const ack = await remote.append(controlIdentity, 1, bytes)
    assert.equal(ack.blob, gitBlob(bytes))
    assert.deepEqual(calls, ["PUT", "GET"])
  }
})
