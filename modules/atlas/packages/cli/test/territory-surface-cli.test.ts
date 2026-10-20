// @atlas/cli — test/territory-surface-cli.test.ts  (B-R4-01c — the `atlas territory` command's CLI surface)
//
// Three things only: the argv surface (parse routes `territory` with its name + globs and the two valued flags),
// the authority classification (an OPS command that writes a FILE and binds the READ leg, the `export` precedent),
// and that dispatch reaches the runner in `territory-cli.ts` — its usage refusal printed over the real entrypoint.

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

describe("R4 — `atlas territory` is a published CLI command", () => {
  it("parses the name + globs and the valued --owner/--tier/--project flags", () => {
    const parsed = parse(["territory", "api", "packages/api/**", "--owner", "backend", "--tier", "T1", "--project", "p1"])
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.command).toBe("territory")
    expect(parsed.positionals).toEqual(["api", "packages/api/**"])
    expect(parsed.flags).toEqual({ owner: "backend", tier: "T1", project: "p1" })
    const missing = parse(["territory"])
    expect(missing.ok).toBe(false)
    if (missing.ok) throw new Error("expected a parse error for a bare `territory`")
    expect(missing.error).toBe("command 'territory' requires 1 positional argument(s), got 0")
  })

  it("binds the READ leg `atlas-query` — it writes the catalog file, never the store", () => {
    expect(COMMAND_LEG.territory).toBe("atlas-query")
    expect(authorityOf("territory")).toBe("read")
  })

  it("DISPATCH — the runner is reached: a bare name refuses as a usage error", async () => {
    const code = await main(["territory", "api"])
    expect(code).toBe(1)
    expect(writes.join("")).toContain("territory requires <name> and at least one <glob>")
  })
})
