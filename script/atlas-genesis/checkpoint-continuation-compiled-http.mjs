// No-subscription miner fixture. Remote checkpoint durability is verified separately by the real IO owner.
import assert from "node:assert/strict"
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { parentPort, workerData } from "node:worker_threads"
import { createContinuation } from "./checkpoint-continuation.mjs"
import { sha256 } from "./checkpoint.mjs"

assert.equal(workerData.control, true, "compiled continuation fixture: explicit control mode required")
const config = workerData
const records = readdirSync(config.recordsDirectory).filter((name) => /^\d{8}\.json\.gz$/.test(name)).sort()
  .map((name) => readFileSync(join(config.recordsDirectory, name)))
const source = createContinuation(records, config.expected, config.expected.inFlightRequest)
const requests = new Map()
const ledger = join(config.output, "control-ledger.jsonl")
writeFileSync(ledger, "", { flag: "wx", mode: 0o600 })
const persist = (event) => {
  appendFileSync(ledger, JSON.stringify(event) + "\n")
  writeFileSync(join(config.output, "control-summary.json"), JSON.stringify(source.summary()) + "\n", { mode: 0o600 })
}
const server = createServer(async (request, response) => {
  try {
    assert(request.method === "POST" && request.headers.authorization === `Bearer ${config.nonce}`, "control: unauthorized")
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      assert(size <= 16 * 1024 * 1024, "control: oversized request")
      chunks.push(chunk)
    }
    const value = JSON.parse(Buffer.concat(chunks))
    if (request.url === "/dispatch") {
      const ticket = source.take({ arm: "advisory", promptSha256: value.promptSha256, promptBytes: value.promptBytes })
      const receipt = { request: ticket.request, arm: ticket.arm, promptSha256: ticket.promptSha256,
        promptBytes: ticket.promptBytes, origin: ticket.origin }
      persist({ kind: "dispatch", ...receipt })
      if (ticket.completion) {
        source.confirm(ticket.request)
        persist({ kind: "completion", ...receipt, exitCode: ticket.completion.exitCode,
          stdoutSha256: sha256(Buffer.from(ticket.completion.stdout, "base64")),
          stderrSha256: sha256(Buffer.from(ticket.completion.stderr, "base64")) })
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ request: ticket.request, completion: ticket.completion }))
        return
      }
      requests.set(ticket.request, receipt)
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ request: ticket.request }))
      return
    }
    assert.equal(request.url, "/completion", "control: unknown operation")
    const receipt = requests.get(value.request)
    assert(receipt, "control: missing acknowledged dispatch")
    assert(Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255, "control: invalid command status")
    for (const field of ["stdout", "stderr"]) {
      assert(typeof value[field] === "string" && Buffer.from(value[field], "base64").toString("base64") === value[field], "control: invalid command bytes")
    }
    source.confirm(value.request)
    requests.delete(value.request)
    persist({ kind: "completion", ...receipt, exitCode: value.exitCode,
      stdoutSha256: sha256(Buffer.from(value.stdout, "base64")), stderrSha256: sha256(Buffer.from(value.stderr, "base64")) })
    response.writeHead(200).end("{}\n")
  } catch {
    writeFileSync(join(config.output, "control-failed.json"), '{"failed":true}\n', { mode: 0o600 })
    response.writeHead(503).end("compiled continuation control refused\n")
  }
})
server.requestTimeout = 180000
server.listen(0, "127.0.0.1", () => parentPort.postMessage(`http://127.0.0.1:${server.address().port}`))
