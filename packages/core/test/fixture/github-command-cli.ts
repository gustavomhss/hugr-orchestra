import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"

const args = process.argv.slice(3)
const routes = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Struct({
  status: Schema.optionalKey(Schema.Int), code: Schema.optionalKey(Schema.Int), raw: Schema.optionalKey(Schema.String),
  data: Schema.optionalKey(Schema.Json), headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})))(await Bun.file(path.join(process.argv[2], "routes.json")).json())
const selected = routes[`${args[args.indexOf("--method") + 1]} ${args.at(-1)}`]
if (!selected) throw new Error("Unrecorded native command route")
const stdin = await new Response(Bun.stdin.stream()).text()
await fs.appendFile(path.join(process.argv[2], "calls.jsonl"), JSON.stringify({ args, stdin }) + "\n")
process.stdout.write(`HTTP/2.0 ${selected.status ?? 200} Status\r\nContent-Type: application/json\r\n${Object.entries(selected.headers ?? {}).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n`)
process.stdout.write(selected.raw ?? (selected.data === undefined ? "" : JSON.stringify(selected.data)))
process.exitCode = selected.code ?? 0
