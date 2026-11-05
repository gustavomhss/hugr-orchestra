// Real external checkpoint/abrupt-death control. Only workflow shell launches/kills the owned producer.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createDiskStore } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { checkpointRemote } from "./checkpoint-remote.mjs"
import { encodeEnvelope, restoreChain, sha256, snapshotFiles } from "./checkpoint.mjs"

assert(process.env.GITHUB_ACTIONS === "true", "checkpoint control: remote runner required")
const [mode, directory] = process.argv.slice(2)
assert(directory, "checkpoint control: output directory required")
const remote = checkpointRemote({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN })

if (mode === "produce") {
  mkdirSync(directory, { recursive: true })
  const fixture = controlStore(join(directory, "producer"))
  const identity = { ...controlIdentity, revision: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT, control: true }
  writeFileSync(join(directory, "identity.json"), JSON.stringify(identity) + "\n", { flag: "wx" })
  writeFileSync(join(directory, "expected-row.json"), JSON.stringify(fixture.row) + "\n", { flag: "wx" })
  await remote.initialize()
  const request = randomUUID()
  const events = [
    { kind: "snapshot", boundary: "control", files: snapshotFiles(join(directory, "producer"), join(directory, "unused-evidence")) },
    { kind: "dispatch", request, promptSha256: sha256("not exported"), promptBytes: 12 },
    { kind: "completion", request, promptSha256: sha256("not exported"), promptBytes: 12, exitCode: 0,
      stdout: Buffer.from("completed control before abrupt death\n").toString("base64"), stderr: "" },
  ]
  let previous = null
  for (const [index, event] of events.entries()) {
    const bytes = encodeEnvelope({ ...event, version: 1, identity, sequence: index + 1, previous }, join(directory, `event-${index + 1}`), {})
    await remote.append(identity, index + 1, bytes)
    previous = sha256(bytes)
  }
  console.log("EXTERNAL_CHECKPOINTS_ACKNOWLEDGED")
  setInterval(() => {}, 60000) // Remain alive until the workflow kills this exact producer with SIGKILL.
} else if (mode === "restore") {
  assert.equal(readFileSync(join(directory, "death.code"), "utf8").trim(), "137", "checkpoint control: producer was not killed")
  const identity = JSON.parse(readFileSync(join(directory, "identity.json")))
  const records = await remote.read(identity)
  const chain = restoreChain(records, identity, join(directory, "restored"))
  const store = createDiskStore(join(directory, "restored/atlas/cas"))
  const expected = JSON.parse(readFileSync(join(directory, "expected-row.json")))
  const result = store.commitStaging((projection) => ({ out: projection }))
  assert(result.settled)
  assert.deepEqual(result.out.current.get(expected.nodeKey), expected)
  for (const receipt of Object.values(expected.claimEvidenceByClaim)) {
    for (const ref of [receipt.factRef, receipt.answerRef]) {
      assert(store.get(ref) !== undefined)
      assert.deepEqual(readFileSync(join(directory, `producer/.atlas/cas/${ref.slice(0, 2)}/${ref}`)),
        readFileSync(join(directory, `restored/atlas/cas/${ref.slice(0, 2)}/${ref}`)))
    }
  }
  assert.equal(chain.completions.length, 1)
  assert.equal(chain.inFlight.length, 0)
  assert.equal(Buffer.from(chain.completions[0].stdout, "base64").toString(), "completed control before abrupt death\n")
  writeFileSync(join(directory, "verified.json"), JSON.stringify({ remoteWriteReadback: true, producerKilled: true,
    restoredOriginalReceipts: true, distinctClaims: expected.claims.length, envelopes: records.length }) + "\n", { flag: "wx" })
  console.log("checkpoint control: remote chain restored after producer SIGKILL; original receipt bytes match")
} else {
  throw new Error("checkpoint control: expected produce or restore")
}
