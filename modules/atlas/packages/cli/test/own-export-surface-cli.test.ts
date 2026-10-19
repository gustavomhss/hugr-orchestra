// @atlas/cli — test/own-export-surface-cli.test.ts  (B-R7-01c — the published `atlas own-export` surface)
//
// The surface half of R7: the command is parsable with a valued `--out` and its unit positionals, binds the READ
// `atlas-query` leg, and its runner's `--out` usage check fires before any runtime is needed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { main } from "../src/cli.js"
import { COMMAND_LEG, authorityOf } from "../src/map.js"
import { parse } from "../src/parse.js"

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

describe("B-R7-01c — `atlas own-export` is a published command", () => {
  it("parses the unit positionals and the valued `--out`", () => {
    const result = parse(["own-export", "packages/cli", "packages/kernel", "--out", "r.json"])
    if (!result.ok) throw new Error(result.error)
    expect(result.positionals).toEqual(["packages/cli", "packages/kernel"])
    expect(result.flags).toEqual({ out: "r.json" })

    const bare = parse(["own-export"])
    if (bare.ok) throw new Error("expected parse to fail")
    expect(bare.error).toBe("command 'own-export' requires 1 positional argument(s), got 0")
  })

  it("binds the read `atlas-query` leg", () => {
    expect(COMMAND_LEG["own-export"]).toBe("atlas-query")
    expect(authorityOf("own-export")).toBe("read")
  })

  it("a missing `--out` is a usage error before any runtime is needed", async () => {
    const code = await main(["own-export", "packages/cli"])
    expect(code).toBe(1)
    expect(writes.join("")).toContain("own-export requires --out <file>")
  })
})
