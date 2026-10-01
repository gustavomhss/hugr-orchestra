import { describe, expect, test } from "bun:test"
import { EventType, configFromEnv, enabled } from "./bootstrap"

describe("janitor bootstrap", () => {
  test("loads module graph and exposes event type", () => {
    expect(EventType).toBe("janitor.report")
  })

  test("disables via env kill-switch", () => {
    expect(enabled({})).toBe(true)
    expect(enabled({ OPENCODE_JANITOR: "0" })).toBe(false)
    expect(enabled({ OPENCODE_JANITOR: "1" })).toBe(true)
  })

  test("parses interval minutes with fallback", () => {
    expect(configFromEnv({}).intervalMinutes).toBe(15)
    expect(configFromEnv({ OPENCODE_JANITOR_INTERVAL_MIN: "30" }).intervalMinutes).toBe(30)
    expect(configFromEnv({ OPENCODE_JANITOR_INTERVAL_MIN: "junk" }).intervalMinutes).toBe(15)
  })
})
