// @atlas/cli — test/hold-surface-cli.test.ts  (B-R2-02b — the published `atlas hold` / `atlas release` surface)
//
// Three things, and nothing else: the argv→arity contract the parser publishes for the two review commands, the
// leg/authority classification the map publishes (a READ leg — the `export` precedent: a review record, no
// knowledge write), and the entrypoint DISPATCH actually reaching the runners (a module that compiles, exports and
// has a green suite while no user can reach it is the reference-model shape this pins against). The runners' own
// behaviour is pinned by B-R2-02a's suite; the `--by` check runs before any file is read, so no temp dir is needed.

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

describe("B-R2-02b — `atlas hold` / `atlas release` are published commands", () => {
  it("parses with exactly one required positional", () => {
    const hold = parse(["hold", "nk-a"])
    expect(hold.ok).toBe(true)
    expect(hold.ok && hold.command).toBe("hold")

    const missing = parse(["hold"])
    expect(missing.ok).toBe(false)
    expect(!missing.ok && missing.error).toBe("command 'hold' requires 1 positional argument(s), got 0")

    expect(parse(["release", "nk-a"]).ok).toBe(true)
  })

  it("binds a READ authority oracle — the review log is not a knowledge write", () => {
    expect(COMMAND_LEG.hold).toBe("atlas-query")
    expect(COMMAND_LEG.release).toBe("atlas-query")
    expect(authorityOf("hold")).toBe("read")
  })

  it("DISPATCH — main reaches the runner and refuses without `--by` before reading anything", async () => {
    // teeth: breaks-on "the hold/release branches are never wired into main" (the runner exists and is tested,
    // and no invocation can reach it).
    expect(await main(["hold", "nk-a"])).toBe(1)
    expect(writes.join("")).toContain("hold requires --by <actor>")

    writes = []
    expect(await main(["release", "nk-a"])).toBe(1)
    expect(writes.join("")).toContain("release requires --by <actor>")
  })
})
