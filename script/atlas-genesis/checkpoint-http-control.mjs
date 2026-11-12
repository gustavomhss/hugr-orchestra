// Local negative-only transport fixture, served from another thread while ModelClient blocks its caller.
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { parentPort } from "node:worker_threads"

createServer(async (request, response) => {
  for await (const _chunk of request) { /* Consume the actual request before returning the fixture fault. */ }
  if (request.url === "/dispatch") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ request: randomUUID() }))
    return
  }
  response.writeHead(503).end("intentional upload failure\n")
}).listen(0, "127.0.0.1", function () {
  parentPort.postMessage(`http://127.0.0.1:${this.address().port}`)
})
