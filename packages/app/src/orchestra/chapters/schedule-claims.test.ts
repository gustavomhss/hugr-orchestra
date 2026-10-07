import { describe, expect, test } from "bun:test"
import { CLAIM_TTL, createClaims } from "./schedule-claims"

// One storage shared by several claim sets stands in for tabs of one origin.
const storage = () => {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

describe("schedule claims", () => {
  test("a slot is served by one tab only, and never again once done", async () => {
    const shared = storage()
    const first = createClaims(shared, undefined)
    const second = createClaims(shared, undefined)
    expect(await first.take("task", 100, 1_000, false)).toBe(true)
    expect(await second.take("task", 100, 1_001, false)).toBe(false)
    expect(await second.take("task", 100, 1_001, true)).toBe(false)
    first.settle("task", 100, "done")
    expect(await second.take("task", 100, 1_000 + CLAIM_TTL * 10, true)).toBe(false)
    expect(await second.take("task", 200, 2_000, false)).toBe(true)
    expect(await first.take("task", 100, 2_001, true)).toBe(false)
  })

  test("a running claim from a tab that died expires after the TTL", async () => {
    const claims = createClaims(storage(), undefined)
    expect(await claims.take("task", 100, 1_000, false)).toBe(true)
    expect(await claims.take("task", 100, 1_000 + CLAIM_TTL - 1, false)).toBe(false)
    expect(await claims.take("task", 100, 1_000 + CLAIM_TTL, false)).toBe(true)
  })

  test("a failed slot is not retried by the scheduler but Run now may retry it", async () => {
    const claims = createClaims(storage(), undefined)
    expect(await claims.take("task", 100, 1_000, false)).toBe(true)
    claims.settle("task", 100, "failed")
    expect(await claims.take("task", 100, 1_000 + CLAIM_TTL * 2, false)).toBe(false)
    expect(await claims.take("task", 100, 1_001, true)).toBe(true)
  })

  test("releasing a claim lets the slot be served again; settling a stale slot is a no-op", async () => {
    const shared = storage()
    const claims = createClaims(shared, undefined)
    expect(await claims.take("task", 100, 1_000, true)).toBe(true)
    claims.settle("task", 100, undefined)
    expect(shared.items.size).toBe(0)
    expect(await claims.take("task", 100, 1_001, false)).toBe(true)
    claims.settle("task", 50, "failed")
    expect(claims.read("task")).toMatchObject({ slot: 100, state: "running" })
    claims.forget("task")
    expect(claims.read("task")).toBeUndefined()
  })

  test("malformed stored claims are ignored", async () => {
    const shared = storage()
    shared.setItem("opencode.orchestra.schedule.claim.task", "{not json")
    const claims = createClaims(shared, undefined)
    expect(claims.read("task")).toBeUndefined()
    expect(await claims.take("task", 100, 1_000, false)).toBe(true)
  })

  test("the scheduler skips while another tab holds the lock; Run now waits for it", async () => {
    const requests: { name: string; ifAvailable?: boolean }[] = []
    const held = {
      request: async <T>(name: string, options: { ifAvailable?: boolean }, run: (lock: unknown) => T) => {
        requests.push({ name, ifAvailable: options.ifAvailable })
        return run(options.ifAvailable ? null : {})
      },
    }
    const claims = createClaims(storage(), held)
    expect(await claims.take("task", 100, 1_000, false)).toBe(false)
    expect(await claims.take("task", 100, 1_000, true)).toBe(true)
    expect(requests).toEqual([
      { name: "opencode.orchestra.schedule.claim.task", ifAvailable: true },
      { name: "opencode.orchestra.schedule.claim.task", ifAvailable: undefined },
    ])
  })
})
