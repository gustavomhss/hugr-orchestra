import { describe, expect, test } from "bun:test"
import { BoardSpend } from "@orchestra/core/board/spend"

const usd = (value: number) => ({ kind: "usd", usd: value }) as const
const session = (model: string, provider: string, cost: number, tokens = 1000) => ({ model, provider, cost, tokens })

describe("BoardSpend", () => {
  test("a card sums priced sessions by model and adds CI minutes", () => {
    const spend = BoardSpend.card({
      sessions: [session("a", "anthropic", 1.5), session("b", "openai", 0.5), session("a", "anthropic", 1)],
      ci: { kind: "ok", usd: 0.25 },
    })
    expect(spend.models).toEqual(usd(3))
    expect(spend.infra).toEqual(usd(0.25))
    expect(spend.usd).toBe(3.25)
    expect(spend.byModel).toEqual([
      { model: "a", usd: 2.5 },
      { model: "b", usd: 0.5 },
    ])
    expect(spend.partial).toBe(false)
  })

  test("a subscription engine is not metered, never zero", () => {
    const spend = BoardSpend.card({ sessions: [session("sonnet", "claude-code", 0)], ci: { kind: "none" } })
    expect(spend.models).toEqual({ kind: "not-metered", source: "subscription engine, no per-token price" })
    expect(spend.infra).toEqual({ kind: "not-metered", source: "no PR linked" })
    expect(spend.usd).toBe(0)
  })

  test("no session and an unfetched CI run say so", () => {
    const spend = BoardSpend.card({ sessions: [], ci: { kind: "pending" } })
    expect(spend.models).toEqual({ kind: "not-metered", source: "no session linked" })
    expect(spend.infra).toEqual({ kind: "not-metered", source: "GitHub Actions not fetched yet" })
    expect(spend.partial).toBe(true)
  })

  test("a priced session next to a subscription one is partial", () => {
    const spend = BoardSpend.card({
      sessions: [session("a", "anthropic", 2), session("b", "claude-code", 0)],
      ci: { kind: "none" },
    })
    expect(spend.models).toEqual(usd(2))
    expect(spend.partial).toBe(true)
  })

  test("a total is metered when any member is", () => {
    const priced = BoardSpend.card({ sessions: [session("a", "anthropic", 2)], ci: { kind: "ok", usd: 1 } })
    const none = BoardSpend.card({ sessions: [], ci: { kind: "none" } })
    const all = BoardSpend.total([priced, none])
    expect(all.models).toEqual(usd(2))
    expect(all.usd).toBe(3)
    expect(BoardSpend.total([none, none]).models.kind).toBe("not-metered")
  })

  test("a card at 3 times its epic peers' median is flagged", () => {
    const card = (value: number) => ({ epic: 1, spend: BoardSpend.card({ sessions: [session("a", "anthropic", value)], ci: { kind: "none" } }) })
    const found = BoardSpend.flags([card(1), card(2), card(3), card(9)])
    expect(found.map((item) => item.flagged)).toEqual([false, false, false, true])
    expect(found[3]?.median).toBe(2)
    expect(BoardSpend.flags([card(1), card(100)]).map((item) => item.flagged)).toEqual([false, false])
  })

  test("budget states switch at 80% and 100%", () => {
    const state = (spent: number) => BoardSpend.budget({ budgetUsd: 100, spentUsd: spent, forecastUsd: null }).state
    expect(state(79.99)).toBe("ok")
    expect(state(80)).toBe("warn")
    expect(state(99.99)).toBe("warn")
    expect(state(100)).toBe("paused")
    expect(BoardSpend.budget({ budgetUsd: null, spentUsd: 5, forecastUsd: null }).state).toBe("none")
    expect(BoardSpend.budget({ budgetUsd: 50, spentUsd: 5, forecastUsd: 45 }).forecastPercent).toBe(90)
  })

  test("the finish forecast adds the burn rate over the time left", () => {
    const now = 10 * 86_400_000
    const forecast = { kind: "dates", p50: now + 5 * 86_400_000, p85: now + 9 * 86_400_000 } as never
    expect(BoardSpend.finish({ spentUsd: 10, since: 0, now, forecast })).toBe(15)
    expect(BoardSpend.finish({ spentUsd: 10, since: 0, now, forecast: { kind: "done" } as never })).toBe(10)
    expect(BoardSpend.finish({ spentUsd: 10, since: 0, now, forecast: { kind: "waits" } as never })).toBeNull()
  })
})
