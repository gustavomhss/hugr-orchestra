// A minimal language server over stdio: answers initialize and shutdown, ignores notifications, exits on `exit`.
let buffer = Buffer.alloc(0)

function send(message) {
  const json = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`)
}

function handle(message) {
  if (message.method === "exit") process.exit(0)
  if (message.id === undefined || message.method === undefined) return
  if (message.method === "initialize") return send({ jsonrpc: "2.0", id: message.id, result: { capabilities: {} } })
  send({ jsonrpc: "2.0", id: message.id, result: null })
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const end = buffer.indexOf("\r\n\r\n")
    if (end === -1) return
    const length = Number(/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, end).toString("utf8"))?.[1] ?? 0)
    if (buffer.length < end + 4 + length) return
    handle(JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString("utf8")))
    buffer = buffer.subarray(end + 4 + length)
  }
})
