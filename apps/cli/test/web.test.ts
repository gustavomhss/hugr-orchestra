import { describe, expect, test } from "bun:test"
import { accessLines } from "../src/commands/handlers/web"

describe("web", () => {
  test("a loopback server prints its single URL", () => {
    expect(accessLines("127.0.0.1", "4096")).toEqual(["  Web interface:    http://127.0.0.1:4096"])
  })

  test("a server on all interfaces prints the local URL, the network URLs and the mDNS name", () => {
    const lines = accessLines("0.0.0.0", "4096", "orchestra.local:4096")
    expect(lines[0]).toBe("  Local access:      http://localhost:4096")
    expect(lines.at(-1)).toBe("  mDNS:              orchestra.local:4096")
    expect(lines.filter((line) => line.includes("Network access")).every((line) => !line.includes("172."))).toBe(true)
  })
})
