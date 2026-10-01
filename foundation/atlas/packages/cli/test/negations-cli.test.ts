// @atlas/cli — test/negations-cli.test.ts  (#99b — the `atlas negations <scope> [--abstained]` read door)
//
// Two things under test: the argv→dispatch wiring (does `atlas negations` reach the composition root's
// `negations` leg, or is it a reference model nothing calls), and the bytes a reader gets back — including
// that a fired ABSTENTION is VISIBLE (the #202 close). The leg is seeded directly (the N2 door that emits
// negations/abstentions is a parallel WP; the read fold is pure over projection rows, so the read surface is
// exercised without it).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NegationLeg } from "@atlas/adapter-io"
import { main } from "../src/cli.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"
import { parse } from "../src/parse.js"

const X = "src/payments/charge.ts::charge"
const Y = "src/orders/place.ts::place"

/** A seeded read leg: ONE grounded negative under `src/payments` AND ONE fired abstention under `src/orders`. */
const seededLeg: NegationLeg = () => ({
  negations: [{ nodeKey: "neg:1", relationKind: "calls", target: X, scope: "src/payments", freshness: "FRESH" }],
  abstentions: [
    {
      kind: "abstained",
      id: asNodeKey("abs:1"),
      relationKind: "calls",
      target: Y,
      scope: "src/orders",
      reason: "scope-open",
      witness: { underApproxSources: ["src/x.ts::dyn"] },
    },
  ],
})

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

describe("#99b — `atlas negations` is a real command that reaches a real leg", () => {
  it("parses with ONE required positional + an optional --abstained flag, and routes to the READ oracle", () => {
    const p = parse(["negations", "src/payments", "--abstained"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("negations")
    expect(p.ok && p.positionals).toEqual(["src/payments"])
    expect(p.ok && p.flags.abstained).toBe("true")
    expect(COMMANDS).toContain("negations")
    expect(COMMAND_LEG.negations).toBe("atlas-query")
    expect(authorityOf("negations")).toBe("read") // DERIVED from WRITE_PATHS — `negations` writes nothing
  })

  it("DEFAULT — renders the grounded negatives AND the abstentions; a fired abstention is VISIBLE (#202)", async () => {
    const code = await main(["negations", "src"], { negations: seededLeg })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("status: ok")
    expect(out).toContain("negations: src — 1 negation(s), 1 abstention(s)")
    expect(out).toContain(`negation calls ${X} in src/payments [FRESH] (neg:1)`) // N4: per-row §3 freshness verdict
    // THE #202 CLOSE: the abstention that fired is on the screen, with its reason — not silently dropped.
    expect(out).toContain(`abstained calls ${Y} in src/orders — scope-open`)
  })

  it("--abstained FOCUSES the render on the abstentions only, still visible", async () => {
    const code = await main(["negations", "src", "--abstained"], { negations: seededLeg })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("negations: src — 1 abstention(s)")
    expect(out).toContain(`abstained calls ${Y} in src/orders — scope-open`)
    expect(out).not.toContain("negation calls") // the grounded-negative lines are suppressed under the focus
  })

  it("an EMPTY result is a measured fact — exit 0, both counts zero, never a miss", async () => {
    const empty: NegationLeg = () => ({ negations: [], abstentions: [] })
    const code = await main(["negations", "lib"], { negations: empty })
    expect(code).toBe(0)
    expect(writes.join("")).toContain("negations: lib — 0 negation(s), 0 abstention(s)")
  })

  it("FAILS CLOSED when the runtime is not composed — never a silent empty result over nothing", async () => {
    const code = await main(["negations", "src"], {})
    expect(code).toBe(1) // a wiring error, not a governance refusal
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
    expect(writes.join("")).not.toContain("negations: ")
  })

  it("a missing scope fails at the parser arity floor, before any leg is reached", async () => {
    let called = 0
    const leg: NegationLeg = () => {
      called++
      return { negations: [], abstentions: [] }
    }
    const code = await main(["negations"], { negations: leg })
    expect(code).toBe(1)
    expect(called).toBe(0)
    expect(writes.join("")).toContain("command 'negations' requires 1 positional argument(s), got 0")
  })
})
