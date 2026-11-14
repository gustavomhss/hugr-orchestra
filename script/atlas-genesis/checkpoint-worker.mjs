// Dedicated IO thread: the synchronous miner cannot service HTTP/fetch while blocked in its real pool.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { parentPort, workerData } from "node:worker_threads"
import { setTimeout } from "node:timers/promises"
import { checkpointScan, encodeEnvelope, sha256, snapshotFiles, validateIdentity } from "./checkpoint.mjs"
import { checkpointDelay, checkpointRemote } from "./checkpoint-remote.mjs"
import { checkpointFailure } from "./checkpoint-failure.mjs"

const config = workerData
validateIdentity(config.identity)
const done = new Int32Array(config.sab)
assert(Boolean(config.continuation) === Boolean(config.identity.continuation), "checkpoint: missing continuation source or identity")
const source = await continuationSource()
const remote = checkpointRemote({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN })
await remote.initialize()
let sequence = 0
let previous = null
let failed = false
let tail = Promise.resolve()
const requests = new Map()
const known = new Map()
const plans = new Map()
let activeArm = null
let lastWrite = performance.now() - 8000

function publish(value) {
  const next = tail.then(async () => {
    assert(!failed, "checkpoint: writer stopped after prior failure")
    const files = value.kind === "snapshot" ? value.files.map((file) => known.has(file.sha256)
      ? { path: file.path, sha256: file.sha256 } : file) : undefined
    const envelope = { ...value, ...(files ? { files } : {}), version: 1, identity: config.identity, sequence: sequence + 1, previous }
    const bytes = encodeEnvelope(envelope, join(config.directory, `event-${sequence + 1}`), checkpointScan(process.env, config.nonce), known)
    await setTimeout(checkpointDelay(lastWrite, performance.now()))
    lastWrite = performance.now()
    const receipt = await remote.append(config.identity, sequence + 1, bytes)
    previous = sha256(bytes)
    sequence += 1
    if (value.kind === "snapshot") for (const file of value.files) known.set(file.sha256, file.bytes)
    if (value.kind === "snapshot" && value.boundary.startsWith("arm-start:")) activeArm = value.boundary.slice("arm-start:".length)
    return receipt
  })
  tail = next.catch((error) => {
    failed = true
    console.error(`atlas-checkpoint-failure ${JSON.stringify(checkpointFailure(error, "publish"))}`)
  })
  return next
}

parentPort.on("message", async (message) => {
  try {
    if (source && message.kind === "snapshot" && ["arm-end:advisory", "final"].includes(message.boundary)) {
      const summary = source.summary()
      assert(summary.replayed === config.continuation.expectedSourceReceipt.completions && summary.retried === 1 && summary.inFlight === 0,
        "checkpoint: source continuation incomplete at arm boundary")
    }
    const receipt = await publish(message)
    parentPort.postMessage({ receipt })
    Atomics.store(done, 0, 1)
  } catch (error) {
    console.error(`atlas-checkpoint-failure ${JSON.stringify(checkpointFailure(error, "snapshot"))}`)
    parentPort.postMessage({ error: "checkpoint: external snapshot failed; mining must stop" })
    Atomics.store(done, 0, -1)
  }
  Atomics.notify(done, 0)
})

const server = createServer(async (request, response) => {
  try {
    assert(request.method === "POST" && request.headers.authorization === `Bearer ${config.nonce}`, "checkpoint: unauthorized local request")
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      assert(size <= 16 * 1024 * 1024, "checkpoint: request too large")
      chunks.push(chunk)
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (request.url === "/dispatch") {
      assert(!failed, "checkpoint: writer stopped")
      if (config.snapshot) {
        const files = snapshotFiles(config.snapshot.repo, config.snapshot.evidence)
        const planFiles = files.filter((file) => file.path.startsWith("evidence/plan-"))
        assert(planFiles.length > 0, "checkpoint: dispatch has no durable plan")
        assert(!source || planFiles.some((file) => file.path === `evidence/plan-${activeArm}.json`),
          "checkpoint: continuation active arm has no plan")
        const fingerprint = sha256(JSON.stringify(planFiles.map((file) => [file.path, file.sha256])))
        if (!plans.has(fingerprint)) plans.set(fingerprint, publish({ kind: "snapshot", boundary: "before-dispatch-plan", files }))
         await plans.get(fingerprint) // The real evidence.plan() wrote these bytes before spawning the pool.
        if (source) {
          assert.equal(planFiles.find((file) => file.path === "evidence/plan-advisory.json")?.sha256,
            config.continuation.expectedSourceReceipt.planSha256, "checkpoint: original continuation plan mismatch")
        }
      }
      assert(config.identity.mode !== "production" || config.identity.arms.includes(activeArm), "checkpoint: no active production arm")
      assert(!source || config.snapshot, "checkpoint: continuation requires a durable plan source")
      const ticket = source?.take({ arm: activeArm, promptSha256: value.promptSha256, promptBytes: value.promptBytes })
      const dispatch = { request: ticket?.request ?? randomUUID(), arm: activeArm,
        promptSha256: value.promptSha256, promptBytes: value.promptBytes, ...(ticket ? { origin: ticket.origin } : {}) }
      await publish({ kind: "dispatch", ...dispatch })
      if (ticket?.completion) {
        await publish({ kind: "completion", ...dispatch, ...ticket.completion })
        source.confirm(dispatch.request)
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ request: dispatch.request, completion: ticket.completion }))
        return
      }
      requests.set(dispatch.request, dispatch)
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ request: dispatch.request }))
      return
    }
    assert(request.url === "/completion", "checkpoint: unknown local operation")
    const dispatch = requests.get(value.request)
    assert(dispatch, "checkpoint: completion has no acknowledged dispatch")
    const receipt = await publish({ kind: "completion", request: value.request,
      arm: dispatch.arm,
       promptSha256: dispatch.promptSha256, promptBytes: dispatch.promptBytes,
      ...(dispatch.origin ? { origin: dispatch.origin } : {}),
       exitCode: value.exitCode, stdout: value.stdout, stderr: value.stderr })
    source?.confirm(value.request)
    requests.delete(value.request)
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(receipt))
  } catch (error) {
    console.error(`atlas-checkpoint-failure ${JSON.stringify(checkpointFailure(error, "http"))}`)
    failed = true
    response.writeHead(503).end("checkpoint refused\n") // Never echo untrusted payloads or credentials.
  }
})

async function continuationSource() {
  if (!config.continuation) return undefined
  const expected = config.continuation.expectedSourceReceipt
  const frozen = config.identity.continuation
  for (const [actual, wanted] of [[frozen.sourceRun, expected.identity.run], [frozen.sourceAttempt, expected.identity.attempt],
    [frozen.sourceRevision, expected.identity.revision], [frozen.sourceLastSequence, expected.lastSequence],
    [frozen.sourceLastEnvelopeSha256, expected.lastEnvelopeSha256], [frozen.sourceDispatches, expected.dispatches],
    [frozen.sourceCompletions, expected.completions], [frozen.sourceInFlightRequest, expected.inFlightRequest],
    [frozen.sourceInFlightPromptSha256, expected.inFlightPromptSha256]]) {
    assert.deepEqual(actual, wanted, "checkpoint: continuation identity differs from frozen source")
  }
  const records = readdirSync(config.continuation.recordsDirectory).filter((name) => /^\d{8}\.json\.gz$/.test(name)).sort()
    .map((name) => readFileSync(join(config.continuation.recordsDirectory, name)))
  const { createContinuation } = await import("./checkpoint-continuation.mjs")
  return createContinuation(records, expected, config.continuation.retryRequest)
}
server.requestTimeout = 180000
server.listen(0, "127.0.0.1", () => {
  parentPort.postMessage({ url: `http://127.0.0.1:${server.address().port}` })
  Atomics.store(done, 0, 1)
  Atomics.notify(done, 0)
})
