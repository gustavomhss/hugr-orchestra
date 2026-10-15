// Benchmark harness: context continuity (v4 working memory + masking) against the legacy compaction, on real traces.
// Usage: BENCH_DIR=<scratch> BENCH_TRACE=<name> [BENCH_MODEL=file] [BENCH_SEED=n] bun script/continuity-bench/versus.ts <arm> <dry|run|probe>
//   arm: continuity | legacy
// $BENCH_DIR/traces/<name>/ holds config.json, trace.db (a copy, never the live DB) and probes.json.
// Both arms replay the same trace message by message and act where production would:
// - legacy: the compaction this branch replaced. At each assistant message whose context reaches the usable window,
//   compact as SessionCompaction.process did (summary of the head, recent tail kept, auto-continue message);
// - continuity: at each finished step past trigger x window, masking of old tool output (service.ts) and a memory pass
//   (fork.ts) when masking alone does not free enough; past the hard limit, the blocking path of compact().
// The context size is the same estimate for both arms: trace overhead plus Token.estimate of the model messages.
// The probe asks every question in one request over exactly what the model would see at the end of the trace.
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Stream } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Token } from "@/util/token"
import { run, snapshot } from "@/continuity/fork"
import { create as contexts } from "@/continuity/context"
import { child } from "@/continuity/alias"
import { DEFAULT_TRIGGER, hardLimit, isSafe, PREPARE_MARGIN } from "@/continuity/trigger"
import { apply as applyMasks, candidates, estimate, urgent } from "@/continuity/masking"
import type { MemoryArtifact } from "@/continuity/memory-types"
import { buildPrompt } from "@orchestra/core/session/compaction"
import PROMPT_COMPACTION from "@/agent/prompt/compaction.txt"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { create as transport, numbered } from "./transport"
import { select, serialize, completedCompactions } from "./legacy"

const DIR = process.env.BENCH_DIR!
const TRACE = process.env.BENCH_TRACE!
const ARM = process.argv[2] as "continuity" | "legacy"
const MODE = process.argv[3] ?? "dry"
if (!DIR || !TRACE || !["continuity", "legacy"].includes(ARM) || !["dry", "run", "probe"].includes(MODE))
  throw new Error("usage: BENCH_DIR=… BENCH_TRACE=… versus.ts <continuity|legacy> <dry|run|probe>")
const TRANSPORT = MODE === "dry" ? "dry" : process.env.BENCH_MODEL === "file" ? "file" : "api"
const SEED = Number(process.env.BENCH_SEED ?? "1")
if (!Number.isInteger(SEED) || SEED < 1) throw new Error(`BENCH_SEED must be a positive integer, got ${process.env.BENCH_SEED}`)

type Config = {
  session: string
  /** Last message index replayed (inclusive); the probe asks at this point. */
  last: number
  context: number
  output: number
  /** System prompt and tools of the traced agent, from the trace's first request. */
  overhead: number
  /** Continuity head cap; defaults to the service formula min(32k, inputLimit / 2). */
  head?: number
  /** Model used to shape requests and limits (any catalog model; the window and output come from this config). */
  model: { providerID: string; modelID: string }
}
const TRIGGER = DEFAULT_TRIGGER
const BASE = path.join(DIR, "traces", TRACE)
const config = JSON.parse(readFileSync(path.join(BASE, "config.json"), "utf8")) as Config
const HEAD = config.head ?? Math.min(32_000, Math.floor((config.context - config.output) / 2))
const ROOT = path.join(BASE, `seed-${SEED}`)
const OUT = path.join(ROOT, "evidence", MODE === "dry" ? `${ARM}-dry` : ARM)
mkdirSync(OUT, { recursive: true })
const SID = SessionID.make(config.session)

// ---- trace ----
const db = new Database(path.join(BASE, "trace.db"))
const rows = db.query("select id, data from message where session_id = ? order by time_created, id").all(config.session) as { id: string; data: string }[]
// Compactions the traced session ran for real are left out: each arm makes its own.
const messages = rows.slice(0, config.last + 1).map((row) => ({
  info: { ...JSON.parse(row.data), id: row.id, sessionID: config.session },
  parts: (db.query("select id, message_id, data from part where message_id = ? order by id").all(row.id) as { id: string; message_id: string; data: string }[])
    .map((part) => ({ ...JSON.parse(part.data), id: part.id, sessionID: config.session, messageID: part.message_id })),
})).filter((message) => (message.info as { summary?: unknown }).summary !== true && !message.parts.some((part: { type: string; metadata?: Record<string, unknown> }) =>
  part.type === "compaction" || part.metadata?.compaction_continue)) as unknown as SessionV1.WithParts[]
const agents = new Map((db.query("select id, agent from session where parent_id = ?").all(config.session) as { id: string; agent: string }[]).map((row) => [row.id, row.agent]))

const model = transport({ dir: DIR, exchange: path.join(ROOT, "exchange"), ledger: `ledger-${TRACE}-seed-${SEED}.jsonl`,
  version: `${TRACE}-${ARM}`, transport: TRANSPORT, reserve: config.output })

const limited = (provider: Provider.Interface): Provider.Interface => ({ ...provider, getModel: () =>
  provider.getModel(config.model.providerID as never, config.model.modelID as never).pipe(Effect.map((item) =>
    ({ ...item, limit: { ...item.limit, context: config.context, output: config.output, input: undefined } }))) }) as Provider.Interface

type Services = { provider: Provider.Interface; llm: LLM.Interface }
const save = (name: string, value: unknown) =>
  writeFileSync(path.join(OUT, name), typeof value === "string" ? value : JSON.stringify(value, null, 2))
const load = <T>(name: string) => JSON.parse(readFileSync(path.join(OUT, name), "utf8")) as T
const done = (name: string) => existsSync(path.join(OUT, `${name}.json`))

const size = (services: Services, view: SessionV1.WithParts[], system: string[]) => Effect.gen(function* () {
  const shaped = yield* services.provider.getModel("" as never, "" as never)
  const sent = yield* MessageV2.toModelMessagesEffect(view, shaped)
  return config.overhead + Token.estimate(system.join("\n")) + estimate(sent)
})

// ---- replay ----
const user = messages.findLast((message) => message.info.role === "user")!.info as SessionV1.User

/** The three messages SessionCompaction.create and process add: the compaction request, the summary, the auto-continue. */
function compactionMessages(parent: SessionV1.WithParts, tail: MessageID | undefined, summary: string) {
  const now = (parent.info.time as { created: number }).created
  const base = { sessionID: SID, agent: user.agent, model: user.model }
  const ask = MessageID.ascending()
  const answer = MessageID.ascending()
  const resume = MessageID.ascending()
  return [
    { info: { ...base, id: ask, role: "user", time: { created: now } },
      parts: [{ id: PartID.ascending(), sessionID: SID, messageID: ask, type: "compaction", auto: true, tail_start_id: tail }] },
    { info: { id: answer, sessionID: SID, role: "assistant", parentID: ask, mode: "compaction", agent: "compaction", summary: true,
        path: { cwd: "/", root: "/" }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: config.model.modelID, providerID: config.model.providerID, time: { created: now, completed: now }, finish: "stop" },
      parts: [{ id: PartID.ascending(), sessionID: SID, messageID: answer, type: "text", text: summary }] },
    { info: { ...base, id: resume, role: "user", time: { created: now } },
      parts: [{ id: PartID.ascending(), sessionID: SID, messageID: resume, type: "text", synthetic: true, metadata: { compaction_continue: true },
        text: "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed." }] },
  ] as unknown as SessionV1.WithParts[]
}

/** Replays the trace as prompt.ts runs it, with continuity (continuity arm) or the replaced legacy compaction. */
const replay = (services: Services) => Effect.gen(function* () {
  const shaped = yield* services.provider.getModel("" as never, "" as never)
  const usable = config.context - Math.min(config.output, 32_000)
  const hard = hardLimit(shaped)
  const tailBudget = Math.max(2048, Math.floor(0.15 * config.context))
  const enabled = ARM === "continuity"
  let artifact: MemoryArtifact | undefined
  const masks = new Map<string, string>()
  const all: SessionV1.WithParts[] = []
  const log: unknown[] = []
  let passes = 0
  let compactions = 0
  // continuity.prepare: memory as system text and the native tail (when the memory still anchors in the history), then masks.
  const view = (history: SessionV1.WithParts[]) => {
    if (!enabled) return { messages: history, raw: history, system: [] as string[] }
    const store = contexts()
    if (artifact) store.set({ sessionID: SID, boundary: artifact.boundary, tailStart: artifact.tailStart, text: artifact.text, artifact })
    const prepared = store.prepare(SID, history)
    return { messages: applyMasks(prepared.messages, masks), raw: prepared.messages, system: prepared.system }
  }

  const pass = (index: number, history: SessionV1.WithParts[], current: ReturnType<typeof view>, tokens: number) => Effect.gen(function* () {
    // service.ts: mask first; the archive reference stands in for the fragment ID the archive would return.
    let freed = 0
    for (const candidate of candidates(current.raw, masks)) {
      masks.set(candidate.part.id, `arc_${candidate.messageID}`)
      freed += candidate.saved
    }
    if (freed > 0 && tokens - freed <= config.context * (TRIGGER - PREPARE_MARGIN)) return log.push({ index, tokens, action: "masked", freed })
    const previous = current.system.length ? artifact : undefined
    const captured = snapshot(SID, history, previous, true, HEAD, tailBudget)
    if (!captured) return log.push({ index, tokens, action: "no-snapshot", freed })
    const name = `pass${++passes}`
    if (done(name)) {
      const saved = load<{ applied: boolean }>(`${name}.json`)
      if (saved.applied) artifact = load<MemoryArtifact>(`${name}.artifact.json`)
      return log.push(saved)
    }
    model.begin(name)
    const before = model.calls.length
    const delegations = Object.fromEntries([...new Set(history.flatMap((message) => message.parts.flatMap((part) => child(part) ?? [])))]
      .map((id) => [id, { member: agents.get(id), status: undefined }]))
    const { artifact: next, ...summary } = yield* run(captured, services, { history, delegations, member: false },)
    model.calls.slice(before).forEach((call, position) => save(`${name}.reply${position + 1}.txt`, call.text))
    if (next) {
      save(`${name}.memory.md`, next.text)
      save(`${name}.artifact.json`, next)
      artifact = next
    }
    const entry = { index, tokens, action: name, freed, head: [history.indexOf(captured.head[0]), history.indexOf(captured.head.at(-1)!)],
      calls: model.calls.length - before, ...summary, applied: !!next, memoryTokens: next ? Token.estimate(next.text) : undefined }
    save(`${name}.json`, entry)
    log.push(entry)
    console.log(JSON.stringify(entry))
  })

  const compact = (index: number, message: SessionV1.WithParts, history: SessionV1.WithParts[], tokens: number) => Effect.gen(function* () {
    // SessionCompaction.process: hide earlier compaction pairs, keep the recent tail, summarize the rest.
    const prior = completedCompactions(history)
    const hidden = new Set(prior.flatMap((item) => [item.userIndex, item.assistantIndex]))
    const previousSummary = prior.at(-1)?.summary
    const selected = yield* select({ messages: history.filter((_, position) => !hidden.has(position)), cfg: {}, model: shaped })
    const conversation = selected.head.map(serialize).filter(Boolean).join("\n\n")
    const name = `compact${++compactions}`
    let summary: string
    if (done(name)) summary = load<{ summary: string }>(`${name}.json`).summary
    else {
      model.begin(name)
      const sessionID = SessionID.descending()
      const agent = { name: "compaction", mode: "primary" as const, permission: [], prompt: PROMPT_COMPACTION, options: {} }
      const input: LLM.StreamInput = {
        user: { id: MessageID.ascending(), sessionID, role: "user", agent: "compaction", model: { ...user.model }, time: { created: Date.now() } } as SessionV1.User,
        sessionID, agent, model: shaped, system: [], tools: {},
        messages: [{ role: "user", content: [{ type: "text", text: buildPrompt({ previousSummary, context: [conversation] }) }] }],
      }
      let text = ""
      yield* services.llm.stream(input).pipe(Stream.runForEach((event: any) => Effect.sync(() => {
        if (event.type === "text-delta") text += event.text
      })))
      summary = text.trim()
      const entry = { index, tokens, action: name, head: selected.head.length, tail: selected.tail_start_id, summary,
        summaryTokens: Token.estimate(summary), previous: previousSummary !== undefined }
      save(`${name}.json`, entry)
      save(`${name}.summary.md`, summary)
      console.log(JSON.stringify({ ...entry, summary: undefined }))
    }
    all.push(...compactionMessages(message, selected.tail_start_id, summary))
    log.push({ index, tokens, action: name })
  })

  for (const [index, message] of messages.entries()) {
    all.push(message)
    const info = message.info as SessionV1.Assistant
    if (info.role !== "assistant" || info.error) continue
    const history = MessageV2.filterCompacted(all.toReversed())
    const current = view(history)
    const tokens = yield* size(services, current.messages, current.system)
    if (!enabled) {
      if (tokens >= usable) yield* compact(index, message, history, tokens)
      continue
    }
    // A finished step past the trigger starts maintenance (service.ts start).
    if (isSafe(info) && artifact?.boundary !== info.id && tokens >= config.context * TRIGGER)
      yield* pass(index, history, current, tokens)
    if (tokens < hard) continue
    // compact(): past the hard limit the next request waits; one more pass unless memory already covers this step,
    // then every old result the archive can restore is masked.
    let after = view(history)
    let pressure = yield* size(services, after.messages, after.system)
    if (pressure >= hard && artifact?.boundary !== info.id) {
      yield* pass(index, history, after, pressure)
      after = view(history)
      pressure = yield* size(services, after.messages, after.system)
    }
    if (pressure < hard) continue
    let freed = 0
    for (const candidate of urgent(after.raw, masks)) {
      masks.set(candidate.part.id, `arc_${candidate.messageID}`)
      freed += candidate.saved
    }
    after = view(history)
    const left = yield* size(services, after.messages, after.system)
    log.push({ index, tokens: pressure, action: left < hard ? "urgent-masked" : "over", freed, left })
  }
  save("masks.json", [...masks])
  const final = view(MessageV2.filterCompacted(all.toReversed()))
  save("timeline.json", { log, passes, compactions, finalTokens: yield* size(services, final.messages, final.system) })
  return { view: final.messages, system: final.system }
})

// ---- probe ----
const WHERE = {
  continuity: ["the working-memory block of the system prompt", "the working memory in the system prompt and the conversation"],
  legacy: ["the summary that answers \"What did we do so far?\"", "the summary and the conversation"],
}[ARM]
const READER = [
  `You are the lead agent of this session, resuming work. Your earlier history is summarized in ${WHERE[0]};`,
  "the messages after it are the most recent part of the session, verbatim. Tools are unavailable",
  "for this reply. Answer the user's questions from this context only. Quote exact strings (IDs, commands, errors, user words)",
  "exactly when you have them. If the context does not contain an answer, say so instead of guessing. Be concise.",
].join(" ")

const probe = (services: Services, final: { view: SessionV1.WithParts[]; system: string[] }) => Effect.gen(function* () {
  if (existsSync(path.join(OUT, "probe-answers.json"))) return console.log("probe: done")
  const questions = JSON.parse(readFileSync(path.join(BASE, "probes.json"), "utf8")) as { id: string; question: string }[]
  const shaped = yield* services.provider.getModel("" as never, "" as never)
  const tail = yield* MessageV2.toModelMessagesEffect(final.view, shaped)
  const ask = [
    `Answer each of the following ${questions.length} questions independently, using only the context above (${WHERE[1]}).`,
    "Reply with a numbered list whose numbers match the questions: start",
    "each answer on a new line with its number and a period (`1.`); inside an answer use bullets, not numbers.",
    "",
    ...questions.map((item, index) => `${index + 1}. ${item.question}`),
  ].join("\n")
  const sessionID = SessionID.descending()
  const agent = { name: "reader", mode: "primary" as const, permission: [], prompt: READER, options: {} }
  const input: LLM.StreamInput = {
    user: { id: MessageID.ascending(), sessionID, role: "user", agent: agent.name, model: { ...user.model }, time: { created: Date.now() } } as SessionV1.User,
    sessionID, agent, model: shaped, system: final.system, tools: {},
    messages: [...tail, { role: "user", content: ask }],
  }
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
  const services = { provider: limited(yield* Provider.Service), llm: model.wrap(yield* LLM.Service) }
  console.log(`${TRACE} ${ARM}: transport ${TRANSPORT}; seed ${SEED}; spent before: ${model.spent()}`)
  const final = yield* replay(services)
  if (MODE === "probe") yield* probe(services, final)
  console.log(`spent after: ${model.spent()}`)
})

const directory = path.join(DIR, "instance")
mkdirSync(directory, { recursive: true })
await AppRuntime.runPromise(InstanceStore.Service.use((store) => store.provide({ directory }, program as never)) as never)
process.exit(0)
