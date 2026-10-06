// Benchmark harness for continuity working memory v4 (see specs/context-continuity-benchmark-v3-v4.md).
// Usage: BENCH_DIR=<scratch> [BENCH_MODEL=file] [BENCH_SEED=n] bun script/continuity-bench/v4.ts <dry|passes|drift|probe>
// Reads a copy of the trace DB at $BENCH_DIR/trace.db and writes evidence under $BENCH_DIR/evidence/v4.
// Steps are resumable: a step whose evidence exists is loaded, not re-run. See transport.ts for the transports.
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Stream } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, SessionID } from "@/session/schema"
import { Token } from "@/util/token"
import { run, snapshot } from "@/continuity/fork"
import { create as contexts } from "@/continuity/context"
import { child } from "@/continuity/alias"
import { shouldStart, tokenCount } from "@/continuity/trigger"
import type { MemoryArtifact } from "@/continuity/memory-types"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { create as transport, numbered } from "./transport"

const VERSION = "v4"
const DIR = process.env.BENCH_DIR!
const MODE = process.argv[2] ?? "dry"
const TRANSPORT = MODE === "dry" ? "dry" : process.env.BENCH_MODEL === "file" ? "file" : "api"
const SESSION = "ses_f1511c48bffeDAL863Z2Lw4p1b"
const CONTEXT = 55_000 // 0.7 x 55k = 38.5k: crossed at message 35 of 90 (about 40% of the trace)
const OUTPUT = 12_000 // inputLimit = 55k - 12k = 43k; at 16k, v3 pass 1 (39.7k est.) would skip on its input limit
const TRIGGER = 0.7
const HEAD_BUDGET = 32_000 // the service cap; see the report for why not min(32k, inputLimit / 2)
const OVERHEAD = 13_000 // Maestro system + tools, from the trace's first request (13,156 input tokens)
const MAIN = [36, 62, 89] // boundary message indices (assistant turns with finish=stop)
const DRIFT = [77, 89] // from main pass 2: two extra passes, so 55-80 is covered by two passes instead of one
// Seed 1 keeps the original layout; seed N >= 2 has its own exchange, evidence and ledger, and never reads seed 1's.
const SEED = Number(process.env.BENCH_SEED ?? "1")
if (!Number.isInteger(SEED) || SEED < 1) throw new Error(`BENCH_SEED must be a positive integer, got ${process.env.BENCH_SEED}`)
const ROOT = SEED === 1 ? DIR : path.join(DIR, `seed-${SEED}`)
const OUT = path.join(ROOT, "evidence", VERSION)
mkdirSync(OUT, { recursive: true })

// ---- trace ----
const db = new Database(path.join(DIR, "trace.db"))
const rows = db.query("select id, data from message where session_id = ? order by time_created, id").all(SESSION) as { id: string; data: string }[]
const messages = rows.map((row) => ({
  info: { ...JSON.parse(row.data), id: row.id, sessionID: SESSION },
  parts: (db.query("select id, message_id, data from part where message_id = ? order by id").all(row.id) as { id: string; message_id: string; data: string }[])
    .map((part) => ({ ...JSON.parse(part.data), id: part.id, sessionID: SESSION, messageID: part.message_id })),
})) as unknown as SessionV1.WithParts[]
const agents = new Map((db.query("select id, agent from session where parent_id = ?").all(SESSION) as { id: string; agent: string }[]).map((row) => [row.id, row.agent]))

const model = transport({ dir: DIR, exchange: path.join(ROOT, "exchange"), ledger: SEED === 1 ? "ledger.jsonl" : `ledger-seed-${SEED}.jsonl`,
  version: VERSION, transport: TRANSPORT, reserve: OUTPUT })

function limited(provider: Provider.Interface): Provider.Interface {
  return { ...provider, getModel: (providerID: any, modelID: any) => provider.getModel(providerID, modelID).pipe(
    Effect.map((model) => ({ ...model, limit: { ...model.limit, context: CONTEXT, output: OUTPUT } }))) } as Provider.Interface
}

const delegations = (history: SessionV1.WithParts[]) => Object.fromEntries(
  [...new Set(history.flatMap((message) => message.parts.flatMap((part) => child(part) ?? [])))]
    .map((id) => [id, { member: agents.get(id), status: undefined }]))

const save = (name: string, value: unknown) =>
  writeFileSync(path.join(OUT, name), typeof value === "string" ? value : JSON.stringify(value, null, 2))
const load = <T>(name: string) => JSON.parse(readFileSync(path.join(OUT, name), "utf8")) as T

const pass = (services: { provider: Provider.Interface; llm: LLM.Interface }, boundary: number, previous: MemoryArtifact | undefined, name: string) =>
  Effect.gen(function* () {
    if (existsSync(path.join(OUT, `${name}.json`))) {
      const done = load<{ applied: boolean }>(`${name}.json`)
      console.log(`${name}: done (applied=${done.applied})`)
      return done.applied ? load<MemoryArtifact>(`${name}.artifact.json`) : previous
    }
    const history = messages.slice(0, boundary + 1)
    const last = history[boundary].info as SessionV1.Assistant
    const crossed = shouldStart({ tokens: tokenCount(last.tokens), active: false, context: CONTEXT, trigger: TRIGGER })
    const captured = snapshot(SessionID.make(SESSION), history, previous, true, HEAD_BUDGET)
    if (!captured) throw new Error(`no snapshot at ${boundary}`)
    const head = [history.indexOf(captured.head[0]), history.indexOf(captured.head.at(-1)!)]
    model.begin(name)
    const before = model.calls.length
    const result = yield* run(captured, services, { history, delegations: delegations(history), member: false },
      { trigger: TRIGGER, overhead: OVERHEAD })
    const { artifact, ...summary } = result
    const calls = model.calls.slice(before)
    const info = { name, transport: TRANSPORT, boundary, head, tailStart: history.indexOf(captured.tail[0]), crossed,
      contextTokens: tokenCount(last.tokens), ...summary, applied: !!artifact, items: artifact?.items.length,
      memoryTokens: artifact ? Token.estimate(artifact.text) : undefined,
      calls: calls.map((call) => ({ label: call.label, estimate: call.estimate, usage: call.usage })) }
    calls.forEach((call, index) => save(`${name}.reply${index + 1}.txt`, call.text))
    if (artifact) {
      save(`${name}.memory.md`, artifact.text)
      save(`${name}.artifact.json`, artifact)
    }
    save(`${name}.json`, info)
    console.log(JSON.stringify(info))
    return artifact ?? previous
  })

// ---- probes ----
const READER = [
  "You are Maestro, the lead agent of this session, resuming work. Your earlier history is summarized in the working-memory",
  "block of the system prompt; the messages after it are the most recent part of the session, verbatim. Tools are unavailable",
  "for this reply. Answer the user's questions from this context only. Quote exact strings (IDs, commands, errors, user words)",
  "exactly when you have them. If the context does not contain an answer, say so instead of guessing. Be concise.",
].join(" ")

const probe = (services: { provider: Provider.Interface; llm: LLM.Interface }, artifact: MemoryArtifact, questions: { id: string; question: string }[]) =>
  Effect.gen(function* () {
    if (existsSync(path.join(OUT, "probe-answers.json"))) return console.log("probe: done")
    const store = contexts()
    store.set({ sessionID: SessionID.make(SESSION), boundary: artifact.boundary, tailStart: artifact.tailStart, text: artifact.text, artifact })
    // Exactly what context.ts injects: the memory as system text and the native tail as messages.
    const prepared = store.prepare(SessionID.make(SESSION), messages)
    if (!prepared.system.length) throw new Error("memory not applied")
    const user = messages.findLast((message) => message.info.role === "user")!.info as SessionV1.User
    const reader = yield* services.provider.getModel(user.model.providerID, user.model.modelID)
    const tail = yield* MessageV2.toModelMessagesEffect(prepared.messages, reader)
    const ask = [
      `Answer each of the following ${questions.length} questions independently, using only the context above (the working`,
      "memory in the system prompt and the conversation). Reply with a numbered list whose numbers match the questions: start",
      "each answer on a new line with its number and a period (`1.`); inside an answer use bullets, not numbers.",
      "",
      ...questions.map((item, index) => `${index + 1}. ${item.question}`),
    ].join("\n")
    const sessionID = SessionID.descending()
    const agent = { name: "maestro-reader", mode: "primary" as const, permission: [], prompt: READER, options: {} }
    const input: LLM.StreamInput = {
      user: { id: MessageID.ascending(), sessionID, role: "user", agent: agent.name, model: { ...user.model }, time: { created: Date.now() } } as SessionV1.User,
      sessionID, agent, model: reader, system: prepared.system, tools: {},
      messages: [...tail, { role: "user", content: ask }],
    }
    save("probe-context.json", { tailMessages: prepared.messages.map((message) => message.info.id), memoryTokens: Token.estimate(artifact.text) })
    model.begin("probe")
    let text = ""
    yield* services.llm.stream(input).pipe(Stream.runForEach((event: any) => Effect.sync(() => {
      if (event.type === "text-delta") text += event.text
    })))
    save("probe-reply.txt", text)
    const parts = numbered(text, questions.length)
    save("probe-answers.json", questions.map((item, index) => ({ id: item.id, answer: parts[index] })))
    console.log(`probe: ${parts.filter(Boolean).length}/${questions.length} answers parsed`)
  })

const program = Effect.gen(function* () {
  const provider = limited(yield* Provider.Service)
  const llm = model.wrap(yield* LLM.Service)
  const services = { provider, llm }
  console.log(`transport ${TRANSPORT}; seed ${SEED}; spent before (all seeds): ${model.spent()}`)
  if (MODE === "dry") {
    let previous: MemoryArtifact | undefined
    for (const [index, boundary] of MAIN.entries()) previous = yield* pass(services, boundary, previous, `dry-pass${index + 1}`)
  }
  if (MODE === "passes") {
    let previous: MemoryArtifact | undefined
    for (const [index, boundary] of MAIN.entries()) previous = yield* pass(services, boundary, previous, `pass${index + 1}`)
  }
  if (MODE === "drift") {
    if (!existsSync(path.join(OUT, "pass2.json"))) throw new Error("run passes first")
    let previous = load<{ applied: boolean }>("pass2.json").applied ? load<MemoryArtifact>("pass2.artifact.json")
      : load<{ applied: boolean }>("pass1.json").applied ? load<MemoryArtifact>("pass1.artifact.json") : undefined
    for (const [index, boundary] of DRIFT.entries()) previous = yield* pass(services, boundary, previous, `drift${index + 1}`)
  }
  if (MODE === "probe") {
    // The memory in force after the last pass: a rejected pass keeps the previous memory and a longer native tail.
    const latest = ["pass3", "pass2", "pass1"].find((name) => existsSync(path.join(OUT, `${name}.artifact.json`)))
    if (!latest) throw new Error("no applied memory")
    const artifact = load<MemoryArtifact>(`${latest}.artifact.json`)
    const questions = JSON.parse(readFileSync(path.join(DIR, "probes.json"), "utf8")) as { id: string; question: string }[]
    yield* probe(services, artifact, questions)
  }
  console.log(`spent after: ${model.spent()}`)
})

const directory = path.join(DIR, "instance")
mkdirSync(directory, { recursive: true })
await AppRuntime.runPromise(InstanceStore.Service.use((store) => store.provide({ directory }, program as never)) as never)
process.exit(0)
