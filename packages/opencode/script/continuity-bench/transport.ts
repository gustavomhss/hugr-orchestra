// Model transports for the continuity benchmark harnesses (identical copy in the v3 and v4 harnesses).
// - dry:  a stub that replies {"ops":[]} and costs nothing.
// - file: BENCH_MODEL=file. A call writes <exchange>/<version>-<step>.request.{md,json} and exits with
//         code 3; on a re-run, <exchange>/<version>-<step>.reply.txt is used as the model's reply.
// - api:  the app's real LLM service.
// Every call is charged to the seed's ledger in $BENCH_DIR (one line per step label); the guard refuses a call
// that could push the sum of all seeds' ledgers past the cap. File replies have no API usage, so input and output are chars/4 estimates.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Stream } from "effect"
import type { LLM } from "@/session/llm"
import { Token } from "@/util/token"

export const CAP = 1_800_000
export type Transport = "dry" | "file" | "api"
export type Call = { label: string; text: string; usage: unknown; estimate: number }

export function create(input: { dir: string; exchange: string; ledger: string; version: string; transport: Transport; reserve: number }) {
  const ledger = path.join(input.dir, input.ledger)
  const exchange = input.exchange
  mkdirSync(exchange, { recursive: true })
  const read = (file: string) => existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { label: string; total: number }) : []
  const entries = () => read(ledger)
  // The cap covers every seed: seed 1's ledger.jsonl plus each ledger-seed-N.jsonl.
  const spent = () => readdirSync(input.dir).filter((name) => /^ledger(-seed-[0-9]+)?\.jsonl$/.test(name))
    .flatMap((name) => read(path.join(input.dir, name))).reduce((sum, entry) => sum + entry.total, 0)
  // A file reply is re-read on every re-run; it is charged once. An API call is charged every time it runs.
  const charge = (entry: Record<string, unknown> & { label: string; total: number }, once: boolean) => {
    if (once && entries().some((item) => item.label === entry.label)) return
    appendFileSync(ledger, JSON.stringify({ time: new Date().toISOString(), version: input.version, ...entry }) + "\n")
  }
  const calls: Call[] = []
  let step = "unlabelled"
  let count = 0
  let inflight = 0

  /** Start a step; its first call is `<step>`, a second call (the v4 retry) is `<step>-retry`. */
  const begin = (name: string) => { step = name; count = 0 }

  const wrap = (llm: LLM.Interface): LLM.Interface => ({
    stream: (request) => Stream.unwrap(Effect.sync(() => {
      const name = count++ === 0 ? step : `${step}-retry`
      const label = `${input.version}/${name}`
      const sent = materialize(request)
      const markdown = render(sent, `${input.version}-${name}`)
      const estimate = Token.estimate(markdown)
      const reserve = estimate + input.reserve
      const already = input.transport === "file" && entries().some((entry) => entry.label === label)
      if (!already && input.transport !== "dry" && spent() + inflight + reserve > CAP)
        throw new Error(`BUDGET_GUARD: spent ${spent()} + inflight ${inflight} + reserve ${reserve} > ${CAP}`)
      const call: Call = { label, text: "", usage: undefined, estimate }
      if (input.transport === "dry") {
        call.text = "{\"ops\":[]}"
        calls.push(call)
        return Stream.fromIterable([{ type: "text-delta", text: call.text }, { type: "finish", reason: "stop" }] as any[])
      }
      if (input.transport === "file") {
        const base = path.join(exchange, `${input.version}-${name}`)
        if (!existsSync(`${base}.reply.txt`)) {
          writeFileSync(`${base}.request.md`, markdown)
          writeFileSync(`${base}.request.json`, JSON.stringify(sent, null, 2))
          console.log(`REQUEST ${base}.request.md (~${estimate} tokens). Write the reply to ${base}.reply.txt and re-run.`)
          process.exit(3)
        }
        // Surrounding whitespace is an artifact of writing a file, not part of a model reply.
        call.text = readFileSync(`${base}.reply.txt`, "utf8").trim()
        const output = Token.estimate(call.text)
        call.usage = { inputTokens: estimate, outputTokens: output }
        charge({ label, transport: "file", input: estimate, output, total: estimate + output, estimated: true }, true)
        calls.push(call)
        return Stream.fromIterable([{ type: "text-delta", text: call.text }, { type: "finish", reason: "stop" }] as any[])
      }
      inflight += reserve
      const steps: any[] = []
      return llm.stream(request).pipe(
        Stream.tap((event: any) => Effect.sync(() => {
          if (event.type === "text-delta") call.text += event.text
          if (event.type === "step-finish" && event.usage) steps.push(event.usage)
          if (event.type === "finish" && event.usage) call.usage = event.usage
        })),
        Stream.ensuring(Effect.sync(() => {
          inflight -= reserve
          const usage: any = call.usage ?? steps.at(-1)
          const tokens = usage?.inputTokens ?? (usage ? (usage.nonCachedInputTokens ?? 0) + (usage.cacheReadInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0) : undefined)
          const output = usage?.outputTokens
          // No reported usage (an interrupted or refused stream) is charged at the estimate plus the full reserve.
          const known = tokens !== undefined && output !== undefined
          charge({ label, transport: "api", input: tokens ?? null, cacheRead: usage?.cacheReadInputTokens ?? null, output: output ?? null,
            reasoning: usage?.reasoningTokens ?? null, total: known ? tokens + output : reserve, estimated: !known }, false)
          call.usage = usage
          calls.push(call)
        })),
      )
    })),
  })

  return { wrap, begin, spent, calls, exchange }
}

type Sent = { system: string[]; messages: unknown[]; toolChoice?: string; tools: string[]; responseSchema?: unknown }

/**
 * The request as the LLM layer sends it: `LLMRequestPrep.prepare` joins the system into one string (a maintenance
 * request carries only the producer role) and places it before the messages. Provider-encrypted reasoning parts
 * of replayed assistant turns are left out: they are opaque provider state, not text another model could read.
 */
export function materialize(request: LLM.StreamInput): Sent {
  const maintenance = request.purpose === "context-maintenance"
  if (!maintenance && !request.agent.prompt) throw new Error("the provider default system prompt is not reproduced")
  const system = [[
    ...(maintenance ? [request.agent.prompt ?? ""] : [request.agent.prompt!]),
    ...(maintenance ? [] : request.system),
    ...(!maintenance && request.user.system ? [request.user.system] : []),
  ].filter((part) => part).join("\n")]
  const messages = request.messages.map((message: any) => Array.isArray(message.content)
    ? { ...message, content: message.content.filter((part: any) => part.type !== "reasoning") } : message)
    .filter((message: any) => !Array.isArray(message.content) || message.content.length > 0)
  return {
    system, messages, tools: Object.keys(request.tools),
    toolChoice: maintenance ? "none" : request.toolChoice,
    ...(request.responseSchema ? { responseSchema: request.responseSchema } : {}),
  }
}

const line = (label: string) => `\n<<<<<<<<<< ${label} >>>>>>>>>>\n`

function part(item: any): string {
  if (item.type === "text") return item.text
  if (item.type === "tool-call") return `[tool call · ${item.toolName} · ${item.toolCallId}]\n${JSON.stringify(item.input)}`
  if (item.type === "tool-result") {
    const output = item.output
    const value = output?.type === "text" || output?.type === "error-text" ? output.value : JSON.stringify(output?.value ?? output)
    return `[tool result · ${item.toolName} · ${item.toolCallId}${output?.type?.startsWith("error") ? " · error" : ""}]\n${value}`
  }
  return `[${item.type}]\n${JSON.stringify(item)}`
}

export function render(sent: Sent, name: string) {
  return [
    `# Model request ${name}`,
    "Delimiter lines `<<<<<<<<<< … >>>>>>>>>>` separate the request's parts; they are not part of the request.",
    `Tools offered: ${sent.tools.length ? sent.tools.join(", ") : "none"}. Tool choice: ${sent.toolChoice ?? "auto"}.`,
    line("SYSTEM").trimEnd(),
    ...sent.system,
    ...sent.messages.flatMap((message: any, index) => [
      line(`MESSAGE ${index + 1} · role: ${message.role}`).trimEnd(),
      typeof message.content === "string" ? message.content : message.content.map(part).join("\n\n"),
    ]),
    ...(sent.responseSchema ? [line("RESPONSE SCHEMA (the provider constrains the reply to this JSON Schema)").trimEnd(),
      JSON.stringify(sent.responseSchema)] : []),
    line("END OF REQUEST").trimEnd(),
  ].join("\n") + "\n"
}

/** Split a numbered reply: answer k starts at a line beginning (column 0) with `k.` or `k)`, searched in order; the number may stand alone on its line. */
export function numbered(text: string, count: number) {
  const lines = text.split("\n")
  const starts: number[] = []
  let next = 1
  lines.forEach((value, index) => {
    if (next <= count && new RegExp(`^(\\*\\*)?${next}[.)](\\*\\*)?(\\s|$)`).test(value)) { starts.push(index); next++ }
  })
  return Array.from({ length: count }, (_, k) => k < starts.length
    ? lines.slice(starts[k], starts[k + 1] ?? lines.length).join("\n").replace(new RegExp(`^\\s*(\\*\\*)?${k + 1}[.)]\\s*(\\*\\*)?\\s*`), "").trim()
    : "")
}
