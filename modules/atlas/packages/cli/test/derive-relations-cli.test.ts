// @atlas/cli — test/derive-relations-cli.test.ts  (#99 WP-R7 — the `atlas derive-relations` door at the entrypoint)
//
// Two things are under test and nothing else: the argv→dispatch wiring (does `atlas derive-relations` actually
// reach the composition root's `deriveRelations` leg, or is it a reference model nothing calls) and the
// `DeriveRelationsRun → CliVerdict` projection (does the operator read the SETTLED count and the per-row
// reasons). The projection + the durable write are exercised for real over a composed runtime in
// `adapter-io/test/relation-derive-reachability.test.ts` (AR-13); this file is the CLI seam.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DeriveRelationsRun } from "@atlas/adapter-io"
import { main } from "../src/cli.js"
import { deriveRelationsVerdict } from "../src/derive-relations.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"
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

const RUN = (o: Partial<DeriveRelationsRun>): DeriveRelationsRun => ({
  resolvedEdgeCount: 0,
  proven: 0,
  persisted: 0,
  refused: 0,
  rows: [],
  ...o,
})

describe("#99 R7 — `atlas derive-relations` is a real command that reaches a real leg", () => {
  it("parses with NO positional and routes to the `atlas-emit` write door (not a new tool)", () => {
    const p = parse(["derive-relations"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("derive-relations")
    expect(p.ok && p.positionals).toEqual([]) // arity 0 — the repo is cwd, so index and store cannot disagree
    expect(COMMANDS).toContain("derive-relations")
    expect(COMMAND_LEG["derive-relations"]).toBe("atlas-emit")
    expect(authorityOf("derive-relations")).toBe("write") // it persists durable governed knowledge, and says so
  })

  it("DISPATCH — the injected derive leg is CALLED once and its verdict rendered", () => {
    // teeth: breaks-on "the derive-relations branch is never wired into `main`" — the reference-model shape.
    let calls = 0
    const deriveRelations = (): DeriveRelationsRun => {
      calls += 1
      return RUN({
        resolvedEdgeCount: 1,
        proven: 1,
        persisted: 1,
        rows: [{ key: "k", endpointA: "src/app.ts", endpointB: "src/util.ts", persisted: true, id: "cas-1" }],
      })
    }
    return main(["derive-relations"], { deriveRelations }).then((code) => {
      expect(calls).toBe(1)
      expect(code).toBe(0)
      const out = writes.join("")
      expect(out).toContain("derive-relations: resolved 1 intra-repo edge(s), proved 1, persisted 1; 0 refused")
      expect(out).toContain("  persisted src/app.ts --depends-on--> src/util.ts (cas-1)")
    })
  })

  it("FAILS CLOSED when the runtime is not composed — never a silent projection over nothing", async () => {
    const code = await main(["derive-relations"], {})
    expect(code).toBe(1) // a wiring error, not a governance refusal
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })
})

describe("#99 R7 — the rendered verdict reports what SETTLED, and exits on it", () => {
  it("all persisted ⇒ exit 0, the settled count, and one line per row", () => {
    const cv = deriveRelationsVerdict(
      RUN({
        resolvedEdgeCount: 2,
        proven: 2,
        persisted: 2,
        rows: [
          { key: "k1", endpointA: "a.ts", endpointB: "b.ts", persisted: true, id: "h1" },
          { key: "k2", endpointA: "b.ts", endpointB: "c.ts", persisted: true, id: "h2" },
        ],
      }),
    )
    expect(cv.exitCode).toBe(0)
    expect(cv.stdout).toContain("derive-relations: resolved 2 intra-repo edge(s), proved 2, persisted 2; 0 refused")
    expect(cv.stdout).toContain("  persisted a.ts --depends-on--> b.ts (h1)")
    expect(cv.stdout).toContain("status: ok")
  })

  it("SETTLED, NOT PROVED — 3 proved, 1 persisted reports 1 and exits 2", () => {
    // teeth: breaks-on "report the proved count". Rendering `proven` as the persisted number reads `3` here.
    const cv = deriveRelationsVerdict(
      RUN({
        resolvedEdgeCount: 3,
        proven: 3,
        persisted: 1,
        refused: 2,
        rows: [
          { key: "k1", endpointA: "a.ts", endpointB: "b.ts", persisted: true, id: "h1" },
          {
            key: "k2",
            endpointA: "b.ts",
            endpointB: "c.ts",
            persisted: false,
            rejected: "unauthorized: actor not in fact scope (KNOW-11)",
          },
          { key: "k3", endpointA: "c.ts", endpointB: "d.ts", persisted: false, rejected: "ungrounded: …" },
        ],
      }),
    )
    expect(cv.exitCode).toBe(2) // any refused row ⇒ a governed refusal ⇒ exit 2
    expect(cv.stdout).toContain("derive-relations: resolved 3 intra-repo edge(s), proved 3, persisted 1; 2 refused")
    expect(cv.stdout).not.toContain("persisted 3")
    expect(cv.stdout).toContain("  refused b.ts --depends-on--> c.ts: unauthorized: actor not in fact scope (KNOW-11)")
    expect(cv.stdout.split("\n").filter((l) => l.startsWith("  refused "))).toHaveLength(2)
  })

  it("an OVER-BUDGET run is rejected fail-loud — never rendered as a partial complete set (AR-30)", () => {
    const cv = deriveRelationsVerdict(RUN({ overBudget: { resolvedEdgeCount: 99, maxRelations: 50 } }))
    expect(cv.exitCode).toBe(2)
    expect(cv.stdout).toContain("status: rejected")
    expect(cv.stdout).toContain("exceeding the 50 row ceiling")
    expect(cv.stdout).toContain("Nothing was derived or persisted")
  })

  it("an honestly EMPTY index exits 0 and says which emptiness it is", () => {
    const cv = deriveRelationsVerdict(RUN({ resolvedEdgeCount: 0 }))
    expect(cv.exitCode).toBe(0)
    expect(cv.stdout).toContain("the index holds no resolved cross-unit edges — nothing to derive")
  })

  it("the render is DETERMINISTIC — the same outcome renders byte-identically twice", () => {
    const o = RUN({
      resolvedEdgeCount: 1,
      proven: 1,
      persisted: 0,
      refused: 1,
      rows: [{ key: "k", endpointA: "a.ts", endpointB: "b.ts", persisted: false, rejected: "unauthorized" }],
    })
    expect(deriveRelationsVerdict(o).stdout).toBe(deriveRelationsVerdict(o).stdout)
  })
})
