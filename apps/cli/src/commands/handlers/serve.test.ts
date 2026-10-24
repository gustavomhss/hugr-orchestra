import { describe, expect, test } from "bun:test"

describe("cli serve K1", () => {
test("hosts function includes Maestro, Continuity, and Claude Code contributions", async () => {
    const { hosts } = await import("./serve")
    const continuity = await import("../../../../../modules/continuity/src/v2")
    const contributions = hosts(continuity.ContinuityHost.contribution)
    const ids = contributions.map((c) => c.id)
    expect(ids).toContain("maestro")
    expect(ids).toContain("continuity")
    expect(ids).toContain("engine-claude-code")
  }, { timeout: 10000 })

  test("continuity contribution has location nodes", async () => {
    const { ContinuityHost } = await import("../../../../../modules/continuity/src/v2")
    expect(ContinuityHost.contribution).toBeDefined()
    expect(ContinuityHost.contribution.locationNodes).toBeDefined()
    expect(ContinuityHost.contribution.locationNodes.length).toBeGreaterThan(0)
  })
})