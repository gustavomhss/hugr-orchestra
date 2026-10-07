// Dump a trace prefix as the continuity transcript, for writing probes and gold answers.
import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Transcript } from "@/continuity/transcript"
const base = path.join(process.env.BENCH_DIR!, "traces", process.argv[2])
const config = JSON.parse(readFileSync(path.join(base, "config.json"), "utf8"))
const db = new Database(path.join(base, "trace.db"))
const rows = db.query("select id, data from message where session_id = ? order by time_created, id").all(config.session) as any[]
const messages = rows.slice(0, config.last + 1).map((row) => ({ info: { ...JSON.parse(row.data), id: row.id, sessionID: config.session },
  parts: (db.query("select id, message_id, data from part where message_id = ? order by id").all(row.id) as any[])
    .map((part) => ({ ...JSON.parse(part.data), id: part.id, sessionID: config.session, messageID: part.message_id })) }))
  .filter((message) => message.info.summary !== true)
const text = messages.map((message, index) => `\n# [message ${index}]\n${Transcript.transcript([message as any])}`).join("\n")
writeFileSync(path.join(base, "transcript.md"), text)
console.log(process.argv[2], messages.length, "messages", Math.round(text.length / 4), "tokens")
