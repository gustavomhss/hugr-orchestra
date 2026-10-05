// Real stdio MCP peer for testing backend envelopes through the existing client.
import { appendFileSync } from "node:fs"

const mode = process.argv[2]
const marker = process.argv[3]
const secret = "private backend detail /secret/path token=private"
const error = mode?.endsWith("object")
  ? { message: secret }
  : mode?.endsWith("array")
    ? [secret]
    : mode?.endsWith("zero")
      ? 0
      : secret
const envelope = mode?.includes("error") ? { error } : { ok: false, error: secret }
const success = {
  success: false,
  data: { error: secret, errors: [secret], ok: false, success: false },
}
const state = { buffer: "" }
process.stdin.setEncoding("utf8")
process.stdin.on("end", () => process.exit(0))
process.stdin.on("data", (chunk: string) => {
  state.buffer += chunk
  const complete = state.buffer.split("\n")
  state.buffer = complete.pop() ?? ""
  complete
    .filter((line) => line.trim())
    .forEach((line) => {
      const request = JSON.parse(line) as { id?: number; method: string; params?: { protocolVersion?: string } }
      if (marker && ["initialize", "tools/call"].includes(request.method)) {
        appendFileSync(marker, request.method + "\n")
      }
      if (request.method === "initialize") {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "composer-envelope", version: "1" },
            },
          }) + "\n",
        )
        return
      }
      if (request.method !== "tools/call") return
      if (mode === "disconnect") process.exit(0)
      const payload = mode?.includes("success")
        ? success
        : mode?.startsWith("empty-")
          ? { error: JSON.parse(mode.slice("empty-".length)), data: "ok" }
          : envelope
      const result =
        mode === "flagged"
          ? { isError: true, content: [{ type: "text", text: secret }] }
          : mode?.startsWith("structured") || mode?.startsWith("empty-")
            ? { content: [{ type: "text", text: "result" }], structuredContent: payload }
            : { content: [{ type: "text", text: mode === "plain" ? "ok" : JSON.stringify(payload) }] }
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n")
    })
})
