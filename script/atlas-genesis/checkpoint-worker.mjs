// Dedicated IO thread: the synchronous miner cannot service HTTP/fetch while blocked in its real pool.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
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
        const fingerprint = sha256(JSON.stringify(planFiles.map((file) => [file.path, file.sha256])))
        if (!plans.has(fingerprint)) plans.set(fingerprint, publish({ kind: "snapshot", boundary: "before-dispatch-plan", files }))
        await plans.get(fingerprint) // The real evidence.plan() wrote these bytes before spawning the pool.
      }
      const id = randomUUID()
      assert(config.identity.mode !== "production" || config.identity.arms.includes(activeArm), "checkpoint: no active production arm")
      await publish({ kind: "dispatch", request: id, arm: activeArm, promptSha256: value.promptSha256, promptBytes: value.promptBytes })
      requests.set(id, { ...value, arm: activeArm })
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ request: id }))
      return
    }
    assert(request.url === "/completion", "checkpoint: unknown local operation")
    const dispatch = requests.get(value.request)
    assert(dispatch, "checkpoint: completion has no acknowledged dispatch")
    const receipt = await publish({ kind: "completion", request: value.request,
      arm: dispatch.arm,
      promptSha256: dispatch.promptSha256, promptBytes: dispatch.promptBytes,
      exitCode: value.exitCode, stdout: value.stdout, stderr: value.stderr })
    requests.delete(value.request)
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(receipt))
  } catch (error) {
    console.error(`atlas-checkpoint-failure ${JSON.stringify(checkpointFailure(error, "http"))}`)
    failed = true
    response.writeHead(503).end("checkpoint refused\n") // Never echo untrusted payloads or credentials.
  }
})
server.requestTimeout = 180000
server.listen(0, "127.0.0.1", () => {
  parentPort.postMessage({ url: `http://127.0.0.1:${server.address().port}` })
  Atomics.store(done, 0, 1)
  Atomics.notify(done, 0)
})
