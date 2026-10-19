// @atlas/cli — test/interview-surface-cli.test.ts  (R11: the `interview` / `answer` surface, published)
//
// The runners are exercised in interview-cli.test.ts; this file pins the PUBLICATION half: both names parse,
// both bind the read leg, and `answer` is reachable through `main` (its `--by` guard fires before any store read).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { main } from "../src/cli.js"
import { COMMAND_LEG } from "../src/map.js"
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

describe("R11 — `atlas interview` and `atlas answer` are published commands", () => {
  it("parses `interview` with and without `--json`, and refuses `answer` with one positional", () => {
    expect(parse(["interview"]).ok).toBe(true)
    expect(parse(["interview", "--json"]).ok).toBe(true)
    const missing = parse(["answer", "q1"])
    expect(missing.ok).toBe(false)
    expect(missing.ok ? "" : missing.error).toBe("command 'answer' requires 2 positional argument(s), got 1")
  })

  it("binds both to the `atlas-query` read leg", () => {
    expect(COMMAND_LEG.interview).toBe("atlas-query")
    expect(COMMAND_LEG.answer).toBe("atlas-query")
  })

  it("DISPATCH — `atlas answer q1 T1` without `--by` is a usage error", async () => {
    const code = await main(["answer", "q1", "T1"])
    expect(code).toBe(1)
    expect(writes.join("")).toContain("answer requires --by <actor>")
  })
})
