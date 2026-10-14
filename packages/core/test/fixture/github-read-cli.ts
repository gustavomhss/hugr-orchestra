// Protocol fixture only. W1 production capture/decoder handles these raw bytes.
import path from "node:path"
import { Schema } from "effect"

const routes = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Struct({
  status: Schema.optionalKey(Schema.Int), code: Schema.optionalKey(Schema.Int), padding: Schema.optionalKey(Schema.Int),
  raw: Schema.optionalKey(Schema.String), data: Schema.optionalKey(Schema.Json),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})))(await Bun.file(path.join(process.argv[2], "routes.json")).json())
const route = routes[process.argv.at(-1) ?? ""]
if (!route) throw new Error(`Unrecorded subprocess route: ${process.argv.at(-1)}`)
process.stdout.write(`HTTP/2.0 ${route.status ?? 200} Status\r\nContent-Type: application/json\r\n${Object.entries(route.headers ?? {}).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n`)
process.stdout.write(route.raw ?? JSON.stringify(route.data ?? null))
if (route.padding) process.stdout.write(" ".repeat(route.padding))
process.exitCode = route.code ?? 0
