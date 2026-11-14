// Test-only acknowledgement fixture. It does not replace the actual protected shell under test.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { appendFileSync } from "node:fs"
import { createServer } from "node:http"
import { parentPort, workerData } from "node:worker_threads"

createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const payload = JSON.parse(Buffer.concat(chunks))
  assert.equal(request.headers.authorization, "Bearer synthetic-continuation-capability")
  appendFileSync(workerData.log, JSON.stringify({ operation: request.url, payload }) + "\n")
  if (request.url === "/dispatch") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ request: randomUUID(),
      ...(workerData.replay ? { completion: workerData.completion } : {}) }))
    return
  }
  response.writeHead(workerData.refuseCompletion ? 503 : 200).end("{}\n")
}).listen(0, "127.0.0.1", function () {
  parentPort.postMessage(`http://127.0.0.1:${this.address().port}`)
})
