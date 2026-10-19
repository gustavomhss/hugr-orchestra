// @atlas/cli — test/ratify-surface-cli.test.ts  (B-R3-02 — the published `atlas propose` / `proposals` / `decide` surface)
//
// Three things, and nothing else: the argv→arity contract the parser publishes for the three ratification commands, the
// leg/authority classification the map publishes (`decide` binds the existing `atlas-emit` write door; `propose` and
// `proposals` write/read only the review log and bind a READ leg), and the entrypoint DISPATCH actually reaching the
// runners (a module that compiles, exports and has a green suite while no user can reach it is the reference-model shape
// this pins against). The `--by` check runs before any file is read, so no temp dir is needed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { main } from "../src/cli.js"
import { parse } from "../src/parse.js"
import { COMMAND_LEG, authorityOf } from "../src/map.js"

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

describe("B-R3-02 — `atlas propose` / `atlas proposals` / `atlas decide` are published commands", () => {
  it("parses the published arities", () => {
    const missing = parse(["propose", "nk-a", "T1"])
    expect(missing.ok).toBe(false)
    expect(!missing.ok && missing.error).toBe("command 'propose' requires 3 positional argument(s), got 2")

    expect(parse(["propose", "nk-a", "T1", "why"]).ok).toBe(true)
    expect(parse(["proposals"]).ok).toBe(true)
    expect(parse(["decide", "p", "ratify", "why"]).ok).toBe(true)
  })

  it("binds the right legs and authority", () => {
    expect(COMMAND_LEG.decide).toBe("atlas-emit")
    expect(authorityOf("decide")).toBe("write")
    expect(authorityOf("propose")).toBe("read")
    expect(authorityOf("proposals")).toBe("read")
  })

  it("DISPATCH — main reaches the runners and refuses without `--by` before reading anything", async () => {
    // teeth: breaks-on "the propose/decide branches are never wired into main" (the runners exist and are tested,
    // and no invocation can reach them).
    expect(await main(["propose", "nk-a", "T1", "why"])).toBe(1)
    expect(writes.join("")).toContain("propose requires --by <actor>")

    writes = []
    expect(await main(["decide", "p", "ratify", "why"])).toBe(1)
    expect(writes.join("")).toContain("decide requires --by <actor>")
  })
})
