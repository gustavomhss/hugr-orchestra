// Continuation envelope codec. Remote, after the Atlas build:
// node --test script/atlas-genesis/checkpoint-continuation-codec.test.mjs
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { test } from "node:test"
import { gzipSync, gunzipSync } from "node:zlib"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { decodeChain, encodeEnvelope, restoreChain, sha256, snapshotFiles } from "./checkpoint.mjs"

const pending = "be07949d-5cdc-48f1-9309-bddd4b32cd2b"
const continuationFields = ["sourceRun", "sourceAttempt", "sourceRevision", "sourceLastSequence", "sourceLastEnvelopeSha256",
  "sourceDispatches", "sourceCompletions", "sourceInFlightRequest", "sourceInFlightPromptSha256", "proofRun", "proofHead",
  "orchestratorRevision", "policySha256"]

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "genesis-origin-codec-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  controlStore(root)
  mkdirSync(join(root, "evidence"))
  writeFileSync(join(root, "evidence/plan-advisory.json"), '{"sites":[{"rank":1,"path":"src/control.ts"}]}\n')
  const policy = Buffer.from('{"frozen":"continuation-policy"}\n')
  writeFileSync(join(root, "evidence/continuation.json"), policy)
  const retryPrompt = Buffer.from("original unresolved prompt\n")
  const identity = { ...controlIdentity, continuation: {
    sourceRun: "42012088507", sourceAttempt: "1", sourceRevision: controlIdentity.revision, sourceLastSequence: 295,
    sourceLastEnvelopeSha256: "e".repeat(64), sourceDispatches: 104, sourceCompletions: 103,
    sourceInFlightRequest: pending, sourceInFlightPromptSha256: sha256(retryPrompt), proofRun: "42056319550",
    proofHead: "d".repeat(40), orchestratorRevision: "b".repeat(40), policySha256: sha256(policy),
  } }
  const snapshot = { version: 1, identity, kind: "snapshot", boundary: "staging", files: snapshotFiles(root, join(root, "evidence")) }
  const policyFile = snapshot.files.find((file) => file.path === "evidence/continuation.json")
  assert.equal(policyFile.sha256, identity.continuation.policySha256)
  const replayPrompt = Buffer.from("original complete prompt\n")
  const freshPrompt = Buffer.from("later fresh prompt\n")
  const stdout = Buffer.from("original completion bytes\n").toString("base64")
  const linked = (kind, request, prompt, origin) => ({ version: 1, identity, kind, request, arm: "advisory",
    promptSha256: sha256(prompt), promptBytes: prompt.length, origin })
  const replay = linked("dispatch", randomUUID(), replayPrompt, { kind: "replay", sourceRun: identity.continuation.sourceRun,
    sourceAttempt: identity.continuation.sourceAttempt, sourceRequest: randomUUID() })
  const retry = linked("dispatch", randomUUID(), retryPrompt, { kind: "retry", sourceRun: identity.continuation.sourceRun,
    sourceAttempt: identity.continuation.sourceAttempt, sourceRequest: pending })
  const fresh = linked("dispatch", randomUUID(), freshPrompt, { kind: "fresh" })
  const done = (dispatch) => ({ ...dispatch, kind: "completion", origin: { ...dispatch.origin }, exitCode: 0, stdout, stderr: "" })
  const events = [snapshot, replay, done(replay), retry, done(retry), fresh, done(fresh)]
  const records = []
  for (const [index, event] of events.entries()) records.push(encodeEnvelope({ ...event, sequence: index + 1,
    previous: index === 0 ? null : sha256(records[index - 1]) }, join(root, `event-${index}`), {}))
  return { root, identity, policy, events, records }
}

function pack(events) {
  const records = []
  for (const [index, event] of events.entries()) records.push(gzipSync(JSON.stringify({ ...event, sequence: index + 1,
    previous: index === 0 ? null : sha256(records[index - 1]) })))
  return records
}

function stamp(events, identity) {
  return events.map((event) => ({ ...event, identity }))
}

function assertRefusal(f, error, events, identity, encode = 0) {
  assert.throws(() => decodeChain(pack(events), identity), error)
  const alone = (event) => ({ ...event, sequence: 1, previous: null })
  if (encode === "ok") {
    const token = randomUUID()
    for (const [index, event] of events.entries()) assert.doesNotThrow(() => encodeEnvelope(alone(event), join(f.root, `accepted-${token}-${index}`), {}))
    return
  }
  assert.throws(() => encodeEnvelope(alone(events[encode]), join(f.root, `refused-${randomUUID()}`), {}), error)
}

test("continuation roundtrip preserves replay, retry and fresh origins", (t) => {
  const f = fixture(t)
  const out = join(f.root, "restored")
  const chain = restoreChain(f.records, f.identity, out)
  assert.equal(chain.completions.length, 3)
  assert.equal(chain.inFlight.length, 0)
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(out, "recovery.json"), "utf8"))),
    ["identity", "snapshotSequence", "dispatched", "completed", "inFlight"])
  for (const completion of chain.completions) {
    const saved = JSON.parse(readFileSync(join(out, "responses", `${completion.request}.json`), "utf8"))
    assert.deepEqual(saved.origin, completion.origin)
    assert.deepEqual(saved.origin, f.events.find((event) => event.request === completion.request && event.kind === "completion").origin)
  }
  for (const record of f.records.slice(1)) assert.deepEqual(JSON.parse(gunzipSync(record)).origin,
    f.events[f.records.indexOf(record)].origin)
  assert.equal(readFileSync(join(out, "evidence/continuation.json")).equals(f.policy), true)
  assert.equal(readFileSync(join(out, "atlas/staging.json")).equals(readFileSync(join(f.root, ".atlas/staging.json"))), true)
})

test("old identity chain still roundtrips, including a dispatch before its snapshot", (t) => {
  const root = mkdtempSync(join(tmpdir(), "genesis-origin-old-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  controlStore(root)
  mkdirSync(join(root, "evidence"))
  writeFileSync(join(root, "evidence/plan-advisory.json"), '{"sites":[{"rank":1,"path":"src/control.ts"}]}\n')
  const snapshot = { version: 1, identity: controlIdentity, kind: "snapshot", boundary: "staging",
    files: snapshotFiles(root, join(root, "evidence")) }
  assert.equal(snapshot.files.some((file) => file.path === "evidence/continuation.json"), false)
  const request = randomUUID()
  const dispatch = { version: 1, identity: controlIdentity, kind: "dispatch", request, promptSha256: sha256("unexported prompt"),
    promptBytes: 17 }
  const completion = { ...dispatch, kind: "completion", exitCode: 0, stdout: Buffer.from("original completion bytes\n").toString("base64"),
    stderr: "" }
  const events = [snapshot, dispatch, completion]
  const records = []
  for (const [index, event] of events.entries()) records.push(encodeEnvelope({ ...event, sequence: index + 1,
    previous: index === 0 ? null : sha256(records[index - 1]) }, join(root, `old-${index}`), {}))
  const out = join(root, "restored")
  const chain = restoreChain(records, controlIdentity, out)
  assert.equal(chain.completions.length, 1)
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(out, "responses", `${request}.json`), "utf8")), "origin"), false)
  assert.equal(readFileSync(join(out, "atlas/staging.json")).equals(readFileSync(join(root, ".atlas/staging.json"))), true)
  const early = decodeChain(pack([dispatch, snapshot]), controlIdentity)
  assert.equal(early.inFlight.length, 1)
  assert.equal(early.inFlight[0].origin, undefined)
  assert.equal(early.envelopes.some((envelope) => envelope.kind === "snapshot"), true)
})

test("an acknowledged continuation policy may be referenced without retransmission", (t) => {
  const f = fixture(t)
  const known = new Map(f.events[0].files.map((file) => [file.sha256, file.bytes]))
  const next = { ...f.events[0], files: f.events[0].files.map((file) => ({ path: file.path, sha256: file.sha256 })) }
  const packed = encodeEnvelope({ ...next, sequence: f.records.length + 1, previous: sha256(f.records.at(-1)) },
    join(f.root, "incremental"), {}, known)
  assert.equal(gunzipSync(packed).toString().includes('"bytes"'), false)
  const restored = decodeChain([...f.records, packed], f.identity).envelopes.at(-1).files
    .find((file) => file.path === "evidence/continuation.json")
  assert.equal(restored.sha256, f.identity.continuation.policySha256)
  assert.equal(restored.bytes, f.events[0].files.find((file) => file.path === "evidence/continuation.json").bytes)
})

test("a known policy reference with the wrong hash is not a payload miss", (t) => {
  const f = fixture(t)
  const known = new Map(f.events[0].files.map((file) => [file.sha256, file.bytes]))
  const staging = f.events[0].files.find((file) => file.path === "atlas/staging.json")
  const files = f.events[0].files.map((file) => ({ path: file.path, sha256: file.path === "evidence/continuation.json" ? staging.sha256 : file.sha256 }))
  assert.throws(() => encodeEnvelope({ ...f.events[0], files, sequence: 1, previous: null }, join(f.root, "wrong-policy-ref"), {}, known),
    /continuation policy hash mismatch/)
})

test("continuation completions still pass the existing credential scan", (t) => {
  const f = fixture(t)
  const secret = "continuation-control-credential-123456"
  const completion = JSON.parse(gunzipSync(f.records[2]))
  completion.stdout = Buffer.from(secret).toString("base64")
  assert.throws(() => encodeEnvelope(completion, join(f.root, "secret"), { secrets: secret }), /credential scan refused/)
})

for (const field of continuationFields) {
  test(`continuation codec refuses a missing ${field}`, (t) => {
    const f = fixture(t)
    const identity = structuredClone(f.identity)
    delete identity.continuation[field]
    assertRefusal(f, /invalid continuation fields/, stamp(f.events, identity), identity)
  })
}

test("continuation codec refuses an extra continuation field and a non-object", (t) => {
  const f = fixture(t)
  const extra = structuredClone(f.identity)
  extra.continuation.note = "extra"
  assertRefusal(f, /invalid continuation fields/, stamp(f.events, extra), extra)
  const broken = structuredClone(f.identity)
  broken.continuation = null
  assert.throws(() => decodeChain(pack(stamp([f.events[0]], broken)), broken), /invalid continuation/)
  assert.throws(() => encodeEnvelope({ ...f.events[0], identity: broken, sequence: 1, previous: null }, join(f.root, "null-continuation"), {}),
    /invalid continuation/)
})

for (const [field, value, error] of [
  ["sourceRun", "0", /invalid continuation sourceRun/],
  ["sourceAttempt", "01", /invalid continuation sourceAttempt/],
  ["proofRun", "", /invalid continuation proofRun/],
  ["sourceLastSequence", 0, /invalid continuation sourceLastSequence/],
  ["sourceDispatches", "104", /invalid continuation sourceDispatches/],
  ["sourceCompletions", 1.5, /invalid continuation sourceCompletions/],
  ["sourceLastSequence", Number.MAX_SAFE_INTEGER + 1, /invalid continuation sourceLastSequence/],
  ["sourceRevision", "a".repeat(39), /invalid continuation sourceRevision/],
  ["proofHead", "aa8b55fe75", /invalid continuation proofHead/],
  ["orchestratorRevision", "B".repeat(40), /invalid continuation orchestratorRevision/],
  ["sourceLastEnvelopeSha256", "e".repeat(63), /invalid continuation sourceLastEnvelopeSha256/],
  ["sourceInFlightPromptSha256", "g".repeat(64), /invalid continuation sourceInFlightPromptSha256/],
  ["policySha256", "E".repeat(64), /invalid continuation policySha256/],
  ["sourceInFlightRequest", "------------------------------------", /invalid continuation request/],
  ["sourceDispatches", 105, /continuation population mismatch/],
  ["sourceCompletions", 104, /continuation population mismatch/],
  ["sourceRevision", "c".repeat(40), /continuation revision mismatch/],
]) {
  test(`continuation codec refuses ${field}=${JSON.stringify(value)}`, (t) => {
    const f = fixture(t)
    const identity = structuredClone(f.identity)
    identity.continuation[field] = value
    assertRefusal(f, error, stamp(f.events, identity), identity)
  })
}

test("continuation codec refuses a snapshot without the policy document or with the wrong policy hash", (t) => {
  const f = fixture(t)
  const missing = f.events.map((event, index) => index === 0 ? { ...event,
    files: event.files.filter((file) => file.path !== "evidence/continuation.json") } : event)
  assertRefusal(f, /missing continuation policy/, missing, f.identity)
  const mismatched = structuredClone(f.identity)
  mismatched.continuation.policySha256 = "a".repeat(64)
  assertRefusal(f, /continuation policy hash mismatch/, stamp(f.events, mismatched), mismatched)
})

test("only evidence/continuation.json joins the snapshot path set", (t) => {
  const f = fixture(t)
  const events = f.events.map((event, index) => index === 0 ? { ...event, files: [...event.files,
    { path: "evidence/continuation.json.evil", sha256: "ab".repeat(32), bytes: Buffer.from("no").toString("base64") }] } : event)
  assertRefusal(f, /invalid or duplicate path/, events, f.identity)
})

test("continuation codec refuses missing, extra, unknown and unlinked origins", (t) => {
  const f = fixture(t)
  const at = (index, origin) => f.events.map((event, cursor) => cursor === index ? { ...event, origin } : event)
  const dropOrigin = f.events.map((event, index) => {
    if (index !== 1) return event
    const dispatch = { ...event }
    delete dispatch.origin
    return dispatch
  })
  assertRefusal(f, /missing origin/, dropOrigin, f.identity, 1)
  assertRefusal(f, /invalid origin/, at(5, { kind: "fresh", sourceRun: f.identity.continuation.sourceRun }), f.identity, 5)
  const replay = { ...f.events[1].origin }
  delete replay.sourceRequest
  assertRefusal(f, /invalid origin/, at(1, replay), f.identity, 1)
  assertRefusal(f, /invalid origin/, at(1, { ...f.events[1].origin, extra: 1 }), f.identity, 1)
  assertRefusal(f, /unknown origin/, at(1, { kind: "cached" }), f.identity, 1)
  assertRefusal(f, /origin source mismatch/, at(1, { ...f.events[1].origin, sourceRun: "9" }), f.identity, 1)
  assertRefusal(f, /origin source mismatch/, at(1, { ...f.events[1].origin, sourceAttempt: "2" }), f.identity, 1)
  assertRefusal(f, /invalid origin request/, at(1, { ...f.events[1].origin, sourceRequest: "not-a-uuid" }), f.identity, 1)
  assertRefusal(f, /retry request mismatch/, at(3, { ...f.events[3].origin, sourceRequest: randomUUID() }), f.identity, 3)
  assertRefusal(f, /retry prompt mismatch/, f.events.map((event, index) => index === 3 ? { ...event, promptSha256: sha256("different retry") } : event), f.identity, 3)
  assertRefusal(f, /replay names pending request/, at(1, { ...f.events[1].origin, sourceRequest: pending }), f.identity, 1)
  const oldDispatch = { ...f.events[1], identity: controlIdentity, origin: { kind: "fresh" } }
  const oldSnapshot = { ...f.events[0], identity: controlIdentity }
  delete oldSnapshot.origin
  assertRefusal(f, /origin without continuation/, [oldSnapshot, oldDispatch], controlIdentity, 1)
  assertRefusal(f, /origin without continuation/, [{ ...oldSnapshot, origin: { kind: "fresh" } }], controlIdentity)
})

test("decode refuses a dispatch before its policy snapshot and a completion with a different valid origin", (t) => {
  const f = fixture(t)
  assert.equal(decodeChain(pack(f.events), f.identity).completions.length, 3)
  assertRefusal(f, /policy before dispatch/, [f.events[1], f.events[0]], f.identity, "ok")
  const sourceRequest = randomUUID()
  assert.notEqual(sourceRequest, pending)
  const drifted = f.events.map((event, index) => index === 2 ? { ...event, origin: { ...event.origin, sourceRequest } } : event)
  assertRefusal(f, /completion origin mismatch/, drifted, f.identity, "ok")
})

test("removing policy ordering or completion-origin correspondence fails that oracle", async (t) => {
  const source = readFileSync(new URL("./checkpoint.mjs", import.meta.url), "utf8")
  const oracles = [
    { needle: 'if (envelope.kind === "dispatch") assert(seenContinuationPolicy, "checkpoint: policy before dispatch")',
      check: (api, f) => assert.throws(() => api.decodeChain(pack([f.events[1], f.events[0]]), f.identity), /policy before dispatch/) },
    { needle: 'if (identity.continuation) assert.deepEqual(dispatch.origin, envelope.origin, "checkpoint: completion origin mismatch")',
      check: (api, f) => {
        const sourceRequest = randomUUID()
        const events = f.events.map((event, index) => index === 2 ? { ...event, origin: { ...event.origin, sourceRequest } } : event)
        assert.throws(() => api.decodeChain(pack(events), f.identity), /completion origin mismatch/)
      } },
  ]
  for (const oracle of oracles) {
    oracle.check({ decodeChain }, fixture(t))
    assert.equal(source.split(oracle.needle).length, 2)
    const mutant = source.replace(oracle.needle, "void 0")
      .replace('from "./secret-scan.mjs"', `from ${JSON.stringify(new URL("./secret-scan.mjs", import.meta.url).href)}`)
      .replace('from "../../modules/atlas/packages/kernel/dist/src/index.js"',
        `from ${JSON.stringify(new URL("../../modules/atlas/packages/kernel/dist/src/index.js", import.meta.url).href)}`)
    const root = fixture(t).root
    writeFileSync(join(root, "mutant.mjs"), mutant, { flag: "wx" })
    const loaded = await import(pathToFileURL(join(root, "mutant.mjs")).href)
    // A different thrown error must not satisfy the oracle; the mutant has to accept the chain.
    assert.throws(() => oracle.check(loaded, fixture(t)), (error) => {
      assert.match(error.message, /Missing expected exception/)
      return true
    })
  }
})
