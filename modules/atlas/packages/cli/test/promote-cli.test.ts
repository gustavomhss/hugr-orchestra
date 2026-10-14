// @atlas/cli — test/promote-cli.test.ts  (CLI-7 — the `atlas promote` curator door at the entrypoint)
//
// Two things are under test and nothing else: the argv→dispatch wiring (does `atlas promote` actually reach
// the composition root's promotion leg, or is the module a reference model nothing calls) and the
// `PromoteOut → CliVerdict` projection (does the operator read the SETTLED count and the per-row reasons).
// The promotion leg itself is a stub here; its gates are exercised for real in
// `adapter-io/test/governed-promote.test.ts` and end to end in `e2e-blackbox/test/s26-promote.blackbox.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PromoteOut } from "@atlas/adapter-io"
import type { Hash } from "@atlas/contracts"
import { main } from "../src/cli.js"
import { promoteVerdict } from "../src/promote.js"
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

const OUT = (o: Partial<PromoteOut>): PromoteOut => ({
  read: true,
  candidates: 0,
  promoted: 0,
  refused: 0,
  rows: [],
  ...o,
})

describe("CLI-7 — `atlas promote` is a real command that reaches a real leg", () => {
  it("parses with NO positional and routes to the `atlas-emit` write door (not a sixth tool)", () => {
    const p = parse(["promote"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("promote")
    expect(p.ok && p.positionals).toEqual([]) // arity 0 — the repo is cwd, so read and write cannot disagree
    expect(COMMANDS).toContain("promote")
    expect(COMMAND_LEG.promote).toBe("atlas-emit")
    expect(authorityOf("promote")).toBe("write") // it publishes durable governed knowledge, and says so
  })

  it("DISPATCH — the injected promotion leg is CALLED once, with the anchor rev", () => {
    // teeth: breaks-on "the promote branch is never wired into `main`" (the module compiles, is exported,
    // has a green suite, and no user can reach it — the reference-model shape this repo has shipped before).
    const seen: Hash[] = []
    const promote = (at: Hash): PromoteOut => {
      seen.push(at)
      return OUT({ candidates: 0 })
    }
    return main(["promote"], { promote }).then((code) => {
      expect(seen).toHaveLength(1)
      expect(code).toBe(0)
      expect(writes.join("")).toContain("promote: 0 of 0 staged candidate(s) promoted; 0 refused")
    })
  })

  it("FAILS CLOSED when the runtime is not composed — never a silent success over nothing", async () => {
    const code = await main(["promote"], {})
    expect(code).toBe(1) // a wiring error, not a governance refusal
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })
})

describe("CLI-7 — the rendered verdict reports what SETTLED, and exits on it", () => {
  it("all promoted ⇒ exit 0, the settled count, and one line per row", () => {
    const cv = promoteVerdict(
      OUT({
        candidates: 2,
        promoted: 2,
        refused: 0,
        rows: [
          { nodeKey: "nk-a", settled: true, id: "ha" },
          { nodeKey: "nk-b", settled: true, id: "hb" },
        ],
      }),
    )
    expect(cv.exitCode).toBe(0)
    expect(cv.stdout).toBe(
      "status: ok\n" +
        "next: 2 staged candidate(s) are now governed knowledge — `atlas node <addr>` reads each one back (a T2 fact is bounded OUT of the `atlas query` pack, TOOLS-6)\n" +
        "invariant: KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted\n" +
        "promote: 2 of 2 staged candidate(s) promoted; 0 refused\n" +
        "  promoted nk-a -> ha\n" +
        "  promoted nk-b -> hb\n",
    )
  })

  it("SETTLED, NOT ATTEMPTED — 5 found, 1 settled reports 1 and exits 2", () => {
    // teeth: breaks-on "report the attempted count". Rendering `candidates` (or `rows.length`) as the
    // promoted number reads `5 of 5` here — the exact shape of the measured 40-reported/5-durable defect.
    const cv = promoteVerdict(
      OUT({
        candidates: 5,
        promoted: 1,
        refused: 4,
        rows: [
          { nodeKey: "nk-a", settled: true, id: "ha" },
          { nodeKey: "nk-b", settled: false, rejected: "unratified: …" },
          { nodeKey: "nk-c", settled: false, rejected: "unauthorized: …" },
          { nodeKey: "nk-d", settled: false, rejected: "ungrounded: …" },
          { nodeKey: "nk-e", settled: false, rejected: "unauthorized for target: …" },
        ],
      }),
    )
    expect(cv.exitCode).toBe(2) // any `emitted:false` ⇒ a governed refusal ⇒ exit 2
    expect(cv.stdout).toContain("promote: 1 of 5 staged candidate(s) promoted; 4 refused")
    expect(cv.stdout).not.toContain("5 of 5")
    // Every refused row is NAMED with its reason — a batch verdict that names no row is unactionable.
    expect(cv.stdout).toContain("  refused nk-e: unauthorized for target: …")
    expect(cv.stdout.split("\n").filter((l) => l.startsWith("  refused "))).toHaveLength(4)
  })

  it('an UNREADABLE staging read is rejected as such — never rendered as "0 candidates"', () => {
    // teeth: breaks-on "a refused staging read renders like an empty one". The two are one character apart
    // in the data and opposite in meaning: one says the explorer produced nothing, the other says nothing
    // could be read and whatever was staged is still staged.
    const cv = promoteVerdict({ read: false, refusal: "unreadable", candidates: 0, promoted: 0, refused: 0, rows: [] })
    expect(cv.exitCode).toBe(2)
    expect(cv.stdout).toContain("the staging sidecar refused (unreadable)")
    expect(cv.stdout).toContain('This is NOT "0 candidates"')
    expect(cv.stdout).not.toContain("staging holds no candidates")
    expect(cv.stdout).toContain("status: rejected")
  })

  it("an honestly EMPTY staging exits 0 and says which emptiness it is", () => {
    const cv = promoteVerdict(OUT({ candidates: 0 }))
    expect(cv.exitCode).toBe(0)
    expect(cv.stdout).toContain("staging holds no candidates — nothing to promote")
    expect(cv.stdout).not.toContain("the staging sidecar refused")
  })

  it("the render is DETERMINISTIC — the same outcome renders byte-identically twice", () => {
    const o = OUT({
      candidates: 1,
      promoted: 0,
      refused: 1,
      rows: [{ nodeKey: "nk-a", settled: false, rejected: "unratified" }],
    })
    expect(promoteVerdict(o).stdout).toBe(promoteVerdict(o).stdout)
  })
})
