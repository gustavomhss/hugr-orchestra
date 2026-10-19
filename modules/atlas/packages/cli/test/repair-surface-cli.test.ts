// @atlas/cli — test/repair-surface-cli.test.ts  (R9 / B-R9-01c: `atlas repair` on the published surface)
//
// The surface half of R9: the command is in `COMMANDS`/`COMMAND_LEG`/`ARITY`, its worklist rides the valued
// `--worklist` flag, and `main(["repair"])` fails closed as a usage error BEFORE any program starts. The
// runner's own behaviour is exercised in `repair-cli.test.ts` over injected ports.

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

describe("R9 — `atlas repair` is a published CLI command", () => {
  it("parses with NO positional and the worklist on the valued flag", () => {
    const parsed = parse(["repair", "--worklist", "w.json"])
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.command).toBe("repair")
    expect(parsed.positionals).toEqual([])
    expect(parsed.flags).toEqual({ worklist: "w.json" })
  })

  it("binds `atlas-query` and reads — it writes the Own files, never the store", () => {
    expect(COMMAND_LEG.repair).toBe("atlas-query")
    expect(authorityOf("repair")).toBe("read")
  })

  it("fails closed with the usage error before any program starts", async () => {
    const code = await main(["repair"])
    expect(code).toBe(1)
    expect(writes.join("")).toContain("repair requires --worklist <file>")
  })
})
