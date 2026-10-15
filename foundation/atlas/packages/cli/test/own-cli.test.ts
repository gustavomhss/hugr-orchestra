// @atlas/cli — test/own-cli.test.ts  (CLI-8 — the `atlas own <scope>` briefing door at the entrypoint)
//
// Two things are under test and nothing else: the argv→dispatch wiring (does `atlas own` actually reach the
// composition root's `own` leg, or is the module a reference model nothing calls — the exact shape
// `@atlas/retrieval` was in before this WP) and the `OwnDispatch → CliVerdict` projection (does a reader get
// the facts, the budget, and the pull-reachable tail). The composer and its feed are exercised for real in
// `e2e-blackbox/test/s28-own-briefing.blackbox.test.ts`, against the built binary.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OwnDispatch } from "@atlas/adapter-io"
import { main } from "../src/cli.js"
import { ownVerdict } from "../src/own.js"
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

/** A composed briefing, defaulted to the honest-empty one; each case overrides only what it is about. */
const DISPATCH = (over: Partial<OwnDispatch["pack"]> = {}, tool = "own_src"): OwnDispatch => ({
  tool,
  pack: {
    unit: "",
    invariants: [],
    shape: { contents: [], owner: "", tier: "T2" },
    edges: { dependents: [], dependencies: [] },
    gotchas: [],
    memory: null,
    drill: { finer: [], refresh: { pull: "poke:own_src" }, complement: { pull: "relate:src" } },
    grounding: { source: "tree" },
    tokenEstimate: 0,
    manifest: { pointers: [], truncated: false },
    pullReachable: [],
    advisory: [],
    advisoryDropped: 0,
    ...over,
  },
})

describe("CLI-8 — `atlas own` is a real command that reaches a real leg", () => {
  it("parses with ONE positional and routes to the `atlas-query` READ oracle (not a sixth tool)", () => {
    const p = parse(["own", "src"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("own")
    expect(p.ok && p.positionals).toEqual(["src"])
    expect(COMMANDS).toContain("own")
    expect(COMMAND_LEG.own).toBe("atlas-query")
    // The whole authority claim, DERIVED from `WRITE_PATHS` rather than asserted: `own` writes nothing.
    expect(authorityOf("own")).toBe("read")
  })

  it("DISPATCH — the injected `own` leg is CALLED once, with the scope the user typed", async () => {
    // teeth: breaks-on "the own branch is never wired into `main`". That is not hypothetical here — it is
    // the state `@atlas/retrieval` shipped in: `createOwn` had a green 15-case suite and ZERO production
    // callers, and every cross-package import of the package was `import type`.
    const seen: string[] = []
    const own = (scope: string): OwnDispatch => {
      seen.push(scope)
      return DISPATCH()
    }
    const code = await main(["own", "packages/cli/src"], { own })
    expect(seen).toEqual(["packages/cli/src"]) // the scope reaches the leg VERBATIM — no rewrite, no cwd
    expect(code).toBe(0)
    expect(writes.join("")).toContain("own: own_src")
  })

  it("FAILS CLOSED when the runtime is not composed — never a silent empty briefing over nothing", async () => {
    // This matters more on THIS door than on a write door: an empty briefing is also a legitimate answer, so
    // an uncomposed runtime that rendered one would be indistinguishable from a scope with nothing filed.
    const code = await main(["own", "src"], {})
    expect(code).toBe(1) // a wiring error, not a governance refusal
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
    expect(writes.join("")).not.toContain("own: ")
  })

  it("a missing scope fails at the parser arity floor, before any leg is reached", async () => {
    let called = 0
    const code = await main(["own"], {
      own: () => {
        called++
        return DISPATCH()
      },
    })
    expect(code).toBe(1)
    expect(called).toBe(0)
    expect(writes.join("")).toContain("command 'own' requires 1 positional argument(s), got 0")
  })
})

describe("CLI-8 — the rendered briefing carries the facts, the budget and the tail", () => {
  it("renders invariants in the SAME row vocabulary a query pack uses, and gotchas separately", () => {
    const v = ownVerdict(
      DISPATCH({
        unit: "the greeting service",
        invariants: [{ nodeId: "n1" as never, tier: "T1", claim: "greet returns non-empty", freshness: "FRESH" }],
        gotchas: [
          {
            kind: "advisory",
            id: "g1" as never,
            tier: "T0",
            claimNorm: "greet does not escape",
            grounding: { entries: [] },
            freshness: "FRESH",
            claims: [],
            authoring: "ADVISORY",
          },
        ],
        shape: { contents: ["src/greet.ts" as never], owner: "lead@atlas.local", tier: "T1" },
        tokenEstimate: 42,
      }),
    )
    expect(v.exitCode).toBe(0)
    expect(v.stdout).toContain("  inv T1 n1: greet returns non-empty") // byte-identical to render.ts's row
    expect(v.stdout).toContain("  gotcha T0 g1: greet does not escape") // its OWN section, not an `inv`
    expect(v.stdout).toContain("  role: the greeting service")
    expect(v.stdout).toContain("  owner: lead@atlas.local")
    expect(v.stdout).toContain("  contains src/greet.ts")
    expect(v.stdout).toContain("tokenEstimate 42")
    expect(v.stdout).toContain("status: ok")
  })

  it("a PREDICATE gotcha renders an EMPTY claim, never a stringified record", () => {
    // `GroundedFact.claims` is a kernel `ClaimEntry[]`, not a string list; a predicate carries a `check` and
    // no claim body. Joining either would print `[object Object]` on a user's screen.
    const v = ownVerdict(
      DISPATCH({
        gotchas: [
          {
            kind: "predicate",
            id: "p1" as never,
            tier: "T1",
            check: { kind: "assert", text: "x" } as never,
            grounding: { entries: [] },
            status: "HOLDS",
            freshness: "FRESH",
            claims: [],
            authoring: "PREDICATED",
          },
        ],
      }),
    )
    expect(v.stdout).toContain("  gotcha T1 p1: \n")
    expect(v.stdout).not.toContain("[object Object]")
  })

  it("0 SILENT DROPS — a capped-out fact is NAMED, and the guidance points at a door that takes a nodeKey", () => {
    const v = ownVerdict(
      DISPATCH({
        invariants: [{ nodeId: "n1" as never, tier: "T1", claim: "fits", freshness: "FRESH" }],
        pullReachable: ["n2" as never, "n3" as never],
      }),
    )
    expect(v.stdout).toContain("  pull-reachable n2")
    expect(v.stdout).toContain("  pull-reachable n3")
    expect(v.stdout).toContain("2 more are pull-reachable")
    // The rows carry nodeKeys. `atlas node` takes a CONTENT ADDRESS and would miss on every one of them, so
    // the guidance must not name it — pointing a caller at the wrong door is how guidance lies.
    expect(v.stdout).toContain("atlas doctor why <nodeKey>")
    expect(v.stdout).not.toContain("atlas node <addr>")
  })

  it("the TWO emptinesses are distinguished — an unknown path vs. a real unit with nothing filed", () => {
    const unknown = ownVerdict(DISPATCH()) // no contents ⇒ the path is not an index unit at all
    expect(unknown.exitCode).toBe(0) //       TOTAL (RETR-9): an empty briefing, never an error
    expect(unknown.stdout).toContain("names no unit in the code index")

    const quiet = ownVerdict(DISPATCH({ shape: { contents: ["lib/x.ts" as never], owner: "", tier: "T2" } }))
    expect(quiet.exitCode).toBe(0)
    expect(quiet.stdout).toContain("NO fact is filed under it yet")
    expect(quiet.stdout).not.toContain("names no unit in the code index")
  })

  it("the D1 manifest rows are CONTENT-FREE — a name, a kind and how to pull it, never a claim", () => {
    const v = ownVerdict(
      DISPATCH({
        manifest: {
          pointers: [{ kind: "pack", name: "own_greet.ts", digest: "abc", pull: "atlas own src/greet.ts", hits: 0 }],
          truncated: false,
        },
      }),
    )
    expect(v.stdout).toContain("  available own_greet.ts (pack) -> atlas own src/greet.ts")
  })

  it("PURE — the same briefing renders byte-identically (no clock, no nonce, CLI-3c)", () => {
    const d = DISPATCH({
      invariants: [{ nodeId: "n1" as never, tier: "T1", claim: "c", freshness: "FRESH" }],
      tokenEstimate: 1,
    })
    expect(ownVerdict(d).stdout).toBe(ownVerdict(d).stdout)
  })
})
