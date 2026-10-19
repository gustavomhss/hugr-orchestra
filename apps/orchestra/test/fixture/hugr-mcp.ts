import { writeFileSync } from "node:fs"

type Request = {
  id?: number
  method: string
  params?: { protocolVersion?: string }
}

let buffer = ""
let calls = 0
const exitMarker = process.argv.includes("exit-after-call")
  ? process.argv[process.argv.indexOf("exit-after-call") + 1]
  : undefined

process.on("exit", () => {
  if (exitMarker) writeFileSync(exitMarker, "done")
})

process.stdin.setEncoding("utf8")
process.stdin.on("end", () => process.exit(0))
process.stdin.on("data", (chunk) => {
  buffer += chunk
  for (const line of buffer.split("\n").slice(0, -1)) {
    if (line.trim()) handle(JSON.parse(line) as Request)
  }
  buffer = buffer.slice(buffer.lastIndexOf("\n") + 1)
})

function handle(request: Request) {
  if (request.method === "initialize") {
    if (process.argv.includes("hang")) return
    write({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "hugr-test", version: "1.0.0" },
      },
    })
    return
  }
  if (request.method !== "tools/call") return
  if (process.argv.includes("hang-call")) return
  calls += 1
  write({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: `call-${calls}` }] } })
  if (exitMarker) setImmediate(() => process.exit(0))
}

function write(value: unknown) {
  process.stdout.write(JSON.stringify(value) + "\n")
}
