export * as BoardSpend from "./spend"

import type { Board } from "@orchestra/schema/board"

// What a card, epic, seat and project cost (docs/specs/projects-board/CONTRACT.md). Pure arithmetic over rows the board
// service reads: a figure comes from a real meter or says it has none. A missing meter is never counted as zero.

const DAY = 86_400_000
/** Providers whose engine runs on a subscription: they report no per-token price. */
const SUBSCRIPTION = ["claude-code"]

export const WARN = 0.8
export const PAUSE = 1
export const QUESTION = 0.9
export const FLAG = 3
/** Peers an epic needs before its median means anything. */
const PEERS = 2

export type Session = {
  readonly model: string | null
  readonly provider: string | null
  readonly cost: number
  readonly tokens: number
}

/** `none`: no PR, nothing to attribute. `pending`: a PR whose runs have not been fetched yet. */
export type Ci = { readonly kind: "none" } | { readonly kind: "pending" } | { readonly kind: "ok"; readonly usd: number }

/** One card's spend. Subagent sessions of the card's session are included by the caller. */
export function card(input: { readonly sessions: readonly Session[]; readonly ci: Ci }): Board.Spend {
  const metered = input.sessions.filter((item) => item.cost > 0 && !subscription(item))
  const unmetered = input.sessions.filter((item) => item.tokens > 0 && !metered.includes(item))
  const byModel = Object.entries(
    metered.reduce<Record<string, number>>((all, item) => ({ ...all, [item.model ?? "unknown"]: (all[item.model ?? "unknown"] ?? 0) + item.cost }), {}),
  )
    .map(([model, usd]) => ({ model, usd }))
    .toSorted((a, b) => b.usd - a.usd || a.model.localeCompare(b.model))
  const models: Board.Meter =
    input.sessions.length === 0
      ? { kind: "not-metered", source: "no session linked" }
      : metered.length > 0 || unmetered.length === 0
        ? { kind: "usd", usd: sum(metered.map((item) => item.cost)) }
        : { kind: "not-metered", source: unmetered.some(subscription) ? "subscription engine, no per-token price" : "no price reported" }
  const infra: Board.Meter =
    input.ci.kind === "ok"
      ? { kind: "usd", usd: input.ci.usd }
      : { kind: "not-metered", source: input.ci.kind === "pending" ? "GitHub Actions not fetched yet" : "no PR linked" }
  return {
    models,
    infra,
    byModel,
    usd: usd(models) + usd(infra),
    partial: (metered.length > 0 && unmetered.length > 0) || input.ci.kind === "pending",
  }
}

/** Adds spends together: a part is metered when any member of it is. */
export function total(items: readonly Board.Spend[]): Board.Spend {
  const part = (pick: (item: Board.Spend) => Board.Meter): Board.Meter => {
    const meters = items.map(pick)
    const first = meters.find((meter) => meter.kind === "not-metered")
    return meters.some((meter) => meter.kind === "usd") || !first ? { kind: "usd", usd: sum(meters.map(usd)) } : first
  }
  const models = part((item) => item.models)
  const infra = part((item) => item.infra)
  const merged = items
    .flatMap((item) => item.byModel)
    .reduce<Record<string, number>>((all, item) => ({ ...all, [item.model]: (all[item.model] ?? 0) + item.usd }), {})
  return {
    models,
    infra,
    byModel: Object.entries(merged)
      .map(([model, value]) => ({ model, usd: value }))
      .toSorted((a, b) => b.usd - a.usd || a.model.localeCompare(b.model)),
    usd: usd(models) + usd(infra),
    partial:
      items.some((item) => item.partial) ||
      items.some((item) => item.models.kind === "not-metered") && items.some((item) => item.models.kind === "usd" && item.models.usd > 0),
  }
}

/** Flags a card at 3 times the median of its epic peers; cards outside an epic are never flagged. */
export function flags(cards: readonly { readonly epic: number | null; readonly spend: Board.Spend }[]) {
  return cards.map((item) => {
    if (item.epic === null || item.spend.models.kind !== "usd" || item.spend.usd <= 0) return { flagged: false, median: null }
    const peers = cards
      .filter((other) => other !== item && other.epic === item.epic && other.spend.models.kind === "usd" && other.spend.usd > 0)
      .map((other) => other.spend.usd)
    if (peers.length < PEERS) return { flagged: false, median: null }
    const middle = median(peers)
    return { flagged: item.spend.usd >= FLAG * middle, median: middle }
  })
}

export function budget(input: {
  readonly budgetUsd: number | null
  readonly spentUsd: number
  readonly forecastUsd: number | null
}): Board.Budget {
  if (input.budgetUsd === null)
    return { budgetUsd: null, spentUsd: input.spentUsd, percent: null, state: "none", forecastUsd: input.forecastUsd, forecastPercent: null }
  const share = (value: number) => (input.budgetUsd! > 0 ? (value / input.budgetUsd!) * 100 : 100)
  return {
    budgetUsd: input.budgetUsd,
    spentUsd: input.spentUsd,
    percent: share(input.spentUsd),
    state: input.spentUsd >= input.budgetUsd * PAUSE ? "paused" : input.spentUsd >= input.budgetUsd * WARN ? "warn" : "ok",
    forecastUsd: input.forecastUsd,
    forecastPercent: input.forecastUsd === null ? null : share(input.forecastUsd),
  }
}

/** Spend at the forecast finish: what is spent plus the burn rate over the time left to the forecast P50. */
export function finish(input: {
  readonly spentUsd: number
  /** When the project started spending. */
  readonly since: number
  readonly now: number
  readonly forecast: Board.Forecast
}) {
  if (input.forecast.kind === "done") return input.spentUsd
  if (input.forecast.kind !== "dates") return null
  const burn = input.spentUsd / Math.max(1, (input.now - input.since) / DAY)
  return input.spentUsd + burn * Math.max(0, (input.forecast.p50 - input.now) / DAY)
}

function subscription(item: Session) {
  return item.provider !== null && SUBSCRIPTION.includes(item.provider)
}

function usd(meter: Board.Meter) {
  return meter.kind === "usd" ? meter.usd : 0
}

function sum(values: readonly number[]) {
  return values.reduce((all, value) => all + value, 0)
}

function median(values: readonly number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}
