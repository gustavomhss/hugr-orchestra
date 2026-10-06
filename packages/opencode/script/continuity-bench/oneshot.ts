// One-shot comparison: compact the same span of a real trace once with the legacy compaction and once with a
// continuity memory pass, and save both outputs side by side.
// Usage: BENCH_DIR=<scratch> BENCH_TRACE=<name> BENCH_MODEL=file bun script/continuity-bench/oneshot.ts <legacy|continuity>
import { Database } from "bun:sqlite"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Stream } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { Token } from "@/util/token"
import { run } from "@/continuity/fork"
import { child } from "@/continuity/alias"
import { buildPrompt } from "@opencode-ai/core/session/compaction"
import PROMPT_COMPACTION from "@/agent/prompt/compaction.txt"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { create as transport } from "./transport"
import { serialize } from "./legacy"

const DIR = process.env.BENCH_DIR!
const TRACE = process.env.BENCH_TRACE!
const ARM = process.argv[2] as "legacy" | "continuity"
const BASE = path.join(DIR, "traces", TRACE)
const config = JSON.parse(readFileSync(path.join(BASE, "config.json"), "utf8"))
const OUT = path.join(BASE, "oneshot")
mkdirSync(OUT, { recursive: true })
const SID = SessionID.make(config.session)
const db = new Database(path.join(BASE, "trace.db"))
const rows = db.query("select id, data from message where session_id = ? order by time_created, id").all(config.session) as any[]
const messages = rows.slice(0, config.last + 1).map((row) => ({ info: { ...JSON.parse(row.data), id: row.id, sessionID: config.session },
  parts: (db.query("select id, message_id, data from part where message_id = ? order by id").all(row.id) as any[])
    .map((part) => ({ ...JSON.parse(part.data), id: part.id, sessionID: config.session, messageID: part.message_id })) }))
  .filter((message) => message.info.summary !== true) as unknown as SessionV1.WithParts[]
const agents = new Map((db.query("select id, agent from session where parent_id = ?").all(config.session) as any[]).map((row) => [row.id, row.agent]))
// The same span for both: everything before the last user turn that leaves 8 messages native.
const cut = messages.findLastIndex((message, index) => index <= messages.length - 8 && message.info.role === "user")
const head = messages.slice(0, cut)
const tail = messages.slice(cut)
const user = messages.findLast((message) => message.info.role === "user")!.info as SessionV1.User
const model = transport({ dir: DIR, exchange: OUT, ledger: `ledger-oneshot-${TRACE}.jsonl`, version: `${TRACE}-oneshot-${ARM}`,
  transport: "file", reserve: 12_000 })

const program = Effect.gen(function* () {
  const base = yield* Provider.Service
  const provider = { ...base, getModel: () => base.getModel(config.model.providerID, config.model.modelID).pipe(
    Effect.map((item) => ({ ...item, limit: { ...item.limit, context: 200_000, output: 12_000, input: undefined } }))) } as Provider.Interface
  const llm = model.wrap(yield* LLM.Service)
  const shaped = yield* provider.getModel("" as never, "" as never)
  model.begin("compact")
  let text: string
  if (ARM === "legacy") {
    const sessionID = SessionID.descending()
    const agent = { name: "compaction", mode: "primary" as const, permission: [], prompt: PROMPT_COMPACTION, options: {} }
    let reply = ""
    yield* llm.stream({
      user: { id: MessageID.ascending(), sessionID, role: "user", agent: "compaction", model: { ...user.model }, time: { created: Date.now() } } as SessionV1.User,
      sessionID, agent, model: shaped, system: [], tools: {},
      messages: [{ role: "user", content: [{ type: "text", text: buildPrompt({ context: [head.map(serialize).filter(Boolean).join("\n\n")] }) }] }],
    } as LLM.StreamInput).pipe(Stream.runForEach((event: any) => Effect.sync(() => { if (event.type === "text-delta") reply += event.text })))
    text = reply.trim()
  } else {
    const delegations = Object.fromEntries([...new Set(messages.flatMap((message) => message.parts.flatMap((part) => child(part) ?? [])))]
      .map((id) => [id, { member: agents.get(id), status: undefined }]))
    const captured = { sessionID: SID, boundary: messages.at(-1)!.info.id, tailStart: tail[0].info.id, head, tail, canRecall: true }
    const result = yield* run(captured, { provider, llm }, { history: messages, delegations, member: false }, { trigger: 0.7, overhead: 13_000 })
    if (!result.artifact) throw new Error(`pass not applied: ${JSON.stringify({ ...result, artifact: undefined })}`)
    text = result.artifact.text
    writeFileSync(path.join(OUT, `${ARM}.pass.json`), JSON.stringify({ ...result, artifact: undefined }, null, 2))
  }
  writeFileSync(path.join(OUT, `${ARM}.md`), text)
  console.log(`${TRACE} ${ARM}: head ${head.length} messages, output ~${Token.estimate(text)} tokens`)
})

const directory = path.join(DIR, "instance")
mkdirSync(directory, { recursive: true })
await AppRuntime.runPromise(InstanceStore.Service.use((store) => store.provide({ directory }, program as never)) as never)
process.exit(0)
