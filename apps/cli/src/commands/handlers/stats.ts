import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import type { MessagesListOutput, Orchestra, SessionsListOutput } from "@orchestra/client"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"

type Client = ReturnType<typeof Orchestra.make>
type Session = SessionsListOutput["data"][number]
type Message = MessagesListOutput["data"][number]

type Usage = { messages: number; tokens: { input: number; output: number; cache: { read: number; write: number } }; cost: number }

export type Stats = {
  totalSessions: number
  totalMessages: number
  totalCost: number
  totalTokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  toolUsage: Record<string, number>
  modelUsage: Record<string, Usage>
  days: number
  costPerDay: number
  tokensPerSession: number
  medianTokensPerSession: number
}

const MS_IN_DAY = 24 * 60 * 60 * 1000

export default Runtime.handler(
  Commands.commands.stats,
  Effect.fn("cli.stats")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const project = Option.getOrUndefined(input.project)
    const projectID =
      project === ""
        ? (yield* Effect.promise(() => client.location.get({ location: { directory: process.cwd() } }))).project.id
        : project
    const stats = yield* Effect.promise(() => aggregate(client, { days: Option.getOrUndefined(input.days), projectID }))
    const modelLimit = Option.getOrUndefined(input["model-limit"]) ?? (input.models ? Infinity : undefined)
    process.stdout.write(render(stats, Option.getOrUndefined(input.tools), modelLimit).join(EOL) + EOL)
  }),
)

export async function aggregate(client: Client, options: { days?: number; projectID?: string }): Promise<Stats> {
  const cutoff = options.days === undefined ? 0 : options.days === 0 ? new Date().setHours(0, 0, 0, 0) : Date.now() - options.days * MS_IN_DAY
  const windowDays = options.days === undefined ? undefined : options.days === 0 ? 1 : options.days
  const sessions = (await allSessions(client)).filter(
    (session) => session.time.updated >= cutoff && (options.projectID === undefined || session.projectID === options.projectID),
  )
  const stats: Stats = {
    totalSessions: sessions.length,
    totalMessages: 0,
    totalCost: 0,
    totalTokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    toolUsage: {},
    modelUsage: {},
    days: windowDays ?? 0,
    costPerDay: 0,
    tokensPerSession: 0,
    medianTokensPerSession: 0,
  }
  if (sessions.length === 0) return stats

  // A bounded number of sessions at a time keeps a large history from flooding the server.
  const messages = (
    await Array.from({ length: Math.ceil(sessions.length / 20) }, (_, index) => sessions.slice(index * 20, index * 20 + 20)).reduce(
      async (done, batch) => [...(await done), ...(await Promise.all(batch.map((session) => allMessages(client, session.id))))],
      Promise.resolve([] as Message[][]),
    )
  ).flat()
  stats.totalMessages = messages.length
  messages.forEach((message) => {
    if (message.type !== "assistant") return
    const key = `${message.model.providerID}/${message.model.id}`
    const usage = (stats.modelUsage[key] ??= { messages: 0, tokens: { input: 0, output: 0, cache: { read: 0, write: 0 } }, cost: 0 })
    usage.messages++
    usage.cost += message.cost ?? 0
    usage.tokens.input += message.tokens?.input ?? 0
    usage.tokens.output += (message.tokens?.output ?? 0) + (message.tokens?.reasoning ?? 0)
    usage.tokens.cache.read += message.tokens?.cache.read ?? 0
    usage.tokens.cache.write += message.tokens?.cache.write ?? 0
    message.content.forEach((part) => {
      if (part.type === "tool") stats.toolUsage[part.name] = (stats.toolUsage[part.name] ?? 0) + 1
    })
  })

  const perSession = sessions.map((session) => session.tokens.input + session.tokens.output + session.tokens.reasoning + session.tokens.cache.read + session.tokens.cache.write)
  sessions.forEach((session) => {
    stats.totalCost += session.cost
    stats.totalTokens.input += session.tokens.input
    stats.totalTokens.output += session.tokens.output
    stats.totalTokens.reasoning += session.tokens.reasoning
    stats.totalTokens.cache.read += session.tokens.cache.read
    stats.totalTokens.cache.write += session.tokens.cache.write
  })
  const earliest = Math.min(...sessions.map((session) => (cutoff > 0 ? session.time.updated : session.time.created)))
  const latest = Math.max(...sessions.map((session) => session.time.updated))
  stats.days = windowDays ?? Math.max(1, Math.ceil((latest - earliest) / MS_IN_DAY))
  stats.costPerDay = stats.totalCost / stats.days
  stats.tokensPerSession = perSession.reduce((sum, tokens) => sum + tokens, 0) / sessions.length
  const sorted = perSession.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  stats.medianTokensPerSession = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return stats
}

async function allSessions(client: Client) {
  const sessions: Session[] = []
  let cursor: string | undefined
  do {
    const page = await client.sessions.list({ limit: 200, order: "desc", includeArchived: true, cursor })
    sessions.push(...page.data)
    cursor = page.cursor.next ?? undefined
  } while (cursor)
  return sessions
}

async function allMessages(client: Client, sessionID: string) {
  const messages: Message[] = []
  let cursor: string | undefined
  do {
    const page = await client.messages.list({ sessionID, limit: 200, order: "asc", cursor }).catch(() => undefined)
    if (!page) break
    messages.push(...page.data)
    cursor = page.cursor.next ?? undefined
  } while (cursor)
  return messages
}

const WIDTH = 56
const TOP = "┌────────────────────────────────────────────────────────┐"
const SEPARATOR = "├────────────────────────────────────────────────────────┤"
const BOTTOM = "└────────────────────────────────────────────────────────┘"

function row(label: string, value: string) {
  return `│${label}${" ".repeat(Math.max(0, WIDTH - 1 - label.length - value.length))}${value} │`
}

function title(text: string) {
  const left = Math.floor((WIDTH - text.length) / 2)
  return `│${" ".repeat(left)}${text}${" ".repeat(WIDTH - text.length - left)}│`
}

export function render(stats: Stats, toolLimit?: number, modelLimit?: number) {
  const number = (value: number) => (Number.isNaN(value) ? 0 : value)
  const lines = [
    TOP,
    title("OVERVIEW"),
    SEPARATOR,
    row("Sessions", stats.totalSessions.toLocaleString()),
    row("Messages", stats.totalMessages.toLocaleString()),
    row("Days", stats.days.toString()),
    BOTTOM,
    "",
    TOP,
    title("COST & TOKENS"),
    SEPARATOR,
    row("Total Cost", `$${number(stats.totalCost).toFixed(2)}`),
    row("Avg Cost/Day", `$${number(stats.costPerDay).toFixed(2)}`),
    row("Avg Tokens/Session", formatNumber(Math.round(number(stats.tokensPerSession)))),
    row("Median Tokens/Session", formatNumber(Math.round(number(stats.medianTokensPerSession)))),
    row("Input", formatNumber(stats.totalTokens.input)),
    row("Output", formatNumber(stats.totalTokens.output)),
    row("Cache Read", formatNumber(stats.totalTokens.cache.read)),
    row("Cache Write", formatNumber(stats.totalTokens.cache.write)),
    BOTTOM,
    "",
  ]

  if (modelLimit !== undefined && Object.keys(stats.modelUsage).length > 0) {
    const models = Object.entries(stats.modelUsage)
      .sort(([, a], [, b]) => b.messages - a.messages)
      .slice(0, modelLimit)
    lines.push(
      TOP,
      title("MODEL USAGE"),
      SEPARATOR,
      ...models.flatMap(([model, usage], index) => [
        `│ ${model.padEnd(54)} │`,
        row("  Messages", usage.messages.toLocaleString()),
        row("  Input Tokens", formatNumber(usage.tokens.input)),
        row("  Output Tokens", formatNumber(usage.tokens.output)),
        row("  Cache Read", formatNumber(usage.tokens.cache.read)),
        row("  Cache Write", formatNumber(usage.tokens.cache.write)),
        row("  Cost", `$${usage.cost.toFixed(4)}`),
        index === models.length - 1 ? BOTTOM : SEPARATOR,
      ]),
    )
  }
  lines.push("")

  const tools = Object.entries(stats.toolUsage).sort(([, a], [, b]) => b - a)
  if (tools.length > 0) {
    const shown = toolLimit ? tools.slice(0, toolLimit) : tools
    const max = Math.max(...shown.map(([, count]) => count))
    const total = tools.reduce((sum, [, count]) => sum + count, 0)
    lines.push(
      TOP,
      title("TOOL USAGE"),
      SEPARATOR,
      ...shown.map(([tool, count]) => {
        const name = (tool.length > 18 ? tool.slice(0, 16) + ".." : tool).padEnd(18)
        const bar = "█".repeat(Math.max(1, Math.floor((count / max) * 20)))
        const content = ` ${name} ${bar.padEnd(20)} ${count.toString().padStart(3)} (${((count / total) * 100).toFixed(1).padStart(4)}%)`
        return `│${content}${" ".repeat(Math.max(0, WIDTH - content.length - 1))} │`
      }),
      BOTTOM,
      "",
    )
  }
  return lines
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M"
  if (value >= 1000) return (value / 1000).toFixed(1) + "K"
  return value.toString()
}
