// @atlas/tools — test/error-attribution.test.ts   (WP-F2F5 — the door must not blame the caller for its
//                                                  own faults)
//
// `createHandler`'s catch labelled EVERY leg throw `malformed args — fail-closed: <message>` and stamped the
// TOOL's caller-facing guidance on it. Three shipped conditions were measured wearing that label; all three
// are transcribed here as the leg throws the composed runtime actually performs:
//
//   I1  a `TypeError` from inside the sameAs door — the product's OWN defect, reported as the caller's bad
//       input at exit 1. (Measured through the real CLI in `e2e-blackbox/test/s16-sameas` T3b, whose comment
//       records the exact rendered bytes.)
//   I2  `atlas query --by dependency|trigger needs the composition-root axes` — the deliberate refusal
//       `adapter-io/src/wire.ts` throws when no structural axes are wired.
//   I3  `untrusted-store: …` — the read-provenance refusal. `adapter-io/src/read-provenance.ts` records this
//       mislabel as a residual it could not fix from its own package and names this seam as the fix site.
//
// EVERY assertion here is on a DISCRIMINANT compared for EQUALITY, never a substring of prose: refusal texts
// in this repo quote each other BY NAME (ADR-0007; `adapter-io/test/door-regression-support.ts` `reasonOf`),
// so `toContain('untrusted-store')` is satisfied by any paragraph that merely mentions it. A NEGATIVE
// assertion against a string the handler REWRITES is worse still — vacuous by construction, which is how an
// earlier `not.toContain('TypeError')` passed under the very mutant it was written for.

// The fault VOCABULARY (`faultOf` / `INTERNAL_GUIDANCE` / `MalformedArgsError`) is imported from its own
// module rather than through the handler barrel ON PURPOSE: `src/fault.ts` is inert — pure classification
// with no call site of its own — so this file compiles and RUNS against the PRE-FIX `handler.ts`, and every
// assertion below fails for its stated behavioural reason instead of dying at an unresolved import. A RED
// that is really a missing export proves nothing about the defect.
import { describe, expect, it } from "vitest"
import { faultOf, INTERNAL_GUIDANCE, MalformedArgsError } from "../src/fault.js"
import { createHandler } from "../src/handler.js"
import type { NodeSource, ToolLeg } from "../src/handler.js"
import type { NodeKey } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { ToolData, Verdict } from "../src/types.js"

/** THE DISCRIMINANT — everything before the first `:`. The same rule `reasonOf` applies in adapter-io,
 *  restated locally because `tools` carries ZERO edges to the ring (ARCH-1, enforced by layer-guard). */
const reasonOf = (rejected: string | undefined): string => (rejected ?? "").split(":")[0]!

/** I1 — the exact engine fault the sameAs door raised when its `a`-side guard was absent. */
const CONTENT_HASH_CRASH = "Cannot read properties of undefined (reading 'contentHash')"

/** I2 — the exact refusal `adapter-io/src/wire.ts` throws with no axes wired (transcribed, not paraphrased). */
const NO_AXES = "atlas query --by dependency|trigger needs the composition-root axes"

/** I3 — the read-provenance refusal, shaped as `read-provenance.ts` ships it: a NAMED `Error` subclass whose
 *  message leads with the discriminant. Only the first sentence is transcribed; the discriminant is the
 *  contract and the paragraph after it is commentary. */
class UntrustedStoreErrorDouble extends Error {
  readonly reason = "untrusted-store"
  constructor() {
    super("untrusted-store: the durable Atlas store under `.atlas/` is TRACKED BY GIT, so it arrived by COMMIT")
    this.name = "UntrustedStoreError"
  }
}

const throwing =
  (e: unknown): ToolLeg =>
  () => {
    throw e
  }

/** A leg that records whether it ran — the door deciding class (a) means the leg is NEVER reached. */
function countingLeg(): { leg: ToolLeg; calls: () => number } {
  let calls = 0
  const leg: ToolLeg = () => {
    calls += 1
    return { emitted: true } as unknown as ToolData
  }
  return { leg, calls: () => calls }
}

const queryHandler = (e: unknown): Verdict<ToolData> =>
  createHandler({ "atlas-query": throwing(e) }).handle("atlas-query", { scope: "src" })

describe("WP-F2F5 — the three error CLASSES are distinguished at the one handler", () => {
  it("I1: an INTERNAL crash names ITSELF internal and does not borrow the caller-facing guidance", () => {
    const v = createHandler({ "atlas-link": throwing(new TypeError(CONTENT_HASH_CRASH)) }).handle("atlas-link", {
      a: "k:one",
      b: "k:two",
    })

    // The class, as a machine value — not a phrase inside the reason paragraph.
    expect(faultOf(v)).toBe("internal-fault")
    expect(reasonOf(v.rejected)).toBe("internal-fault")
    // …and the GUIDANCE is the internal one. The tool's own guidance tells the caller to fix their link
    // arguments, which is the wrong instruction for a defect of ours; borrowing it is the same blame-shift
    // as the label. Asserted by EQUALITY against the exported constant.
    expect(v.guidance.invariant).toBe(INTERNAL_GUIDANCE.invariant)
    expect(v.guidance.next).toBe(INTERNAL_GUIDANCE.next)
    // The engine's own text still reaches the operator — attribution is added, information is not removed.
    expect(v.rejected).toContain(CONTENT_HASH_CRASH)
    expect(v.ok).toBe(false)
  })

  it("I2: the `--by dependency` no-axes REFUSAL keeps its own reason, verbatim and unprefixed", () => {
    const v = queryHandler(new Error(NO_AXES))

    expect(faultOf(v)).toBe("refused")
    // VERBATIM: byte-equality with what the door threw. A prefix of any kind fails this.
    expect(v.rejected).toBe(NO_AXES)
    // A refusal is the caller's operation being declined, so the TOOL guidance is the right guidance here.
    expect(v.guidance.invariant).not.toBe(INTERNAL_GUIDANCE.invariant)
  })

  it("I3: the untrusted-store REFUSAL keeps the discriminant `reasonOf` compares for equality", () => {
    const v = queryHandler(new UntrustedStoreErrorDouble())

    expect(faultOf(v)).toBe("refused")
    expect(reasonOf(v.rejected)).toBe("untrusted-store")
  })

  it("the three instances are MUTUALLY distinguishable — one log line tells them apart", () => {
    const internal = queryHandler(new TypeError(CONTENT_HASH_CRASH))
    const noAxes = queryHandler(new Error(NO_AXES))
    const untrusted = queryHandler(new UntrustedStoreErrorDouble())
    const malformed = createHandler({ "atlas-query": throwing(new Error("unreachable")) }).handle("atlas-query", {
      scope: 42,
    })

    const names = [internal, noAxes, untrusted, malformed].map((v) => reasonOf(v.rejected))
    expect(new Set(names).size).toBe(4) // every one of the four carries its OWN name
    expect(names).toEqual(["internal-fault", NO_AXES, "untrusted-store", "malformed-args"])
  })
})

describe("WP-F2F5 — class (a) is decided by the DOOR, against the published schema", () => {
  it("a declared argument of the wrong type is refused BEFORE the leg runs", () => {
    const { leg, calls } = countingLeg()
    const v = createHandler({ "atlas-query": leg }).handle("atlas-query", { scope: 42 })

    expect(faultOf(v)).toBe("malformed-args")
    expect(reasonOf(v.rejected)).toBe("malformed-args")
    // The leg NEVER RAN. That is what makes this class (a) rather than an inference from a crash: the door
    // knew from its own schema, so there is no throw to guess about.
    expect(calls()).toBe(0)
    // It NAMES the argument and the type it wanted — a reason the caller can act on.
    expect(v.rejected).toContain("'scope'")
    expect(v.rejected).toContain("string")
  })

  it("a non-object argument envelope (the MCP shape) is class (a), not a crash inside a leg", () => {
    const { leg, calls } = countingLeg()
    const h = createHandler({ "atlas-query": leg })
    for (const args of [undefined, "src", 42, ["src"]]) {
      const v = h.handle("atlas-query", args)
      expect(faultOf(v), `args=${JSON.stringify(args) ?? "undefined"}`).toBe("malformed-args")
    }
    expect(calls()).toBe(0)
  })

  it("a leg MAY declare class (a) itself, and the discriminant appears exactly once", () => {
    const v = queryHandler(new MalformedArgsError("scope must name a path inside the repo"))
    expect(faultOf(v)).toBe("malformed-args")
    expect(reasonOf(v.rejected)).toBe("malformed-args")
    expect(v.rejected).toBe("malformed-args: scope must name a path inside the repo")
  })

  it("a MISSING required argument is the caller's, even when the crash it causes looks internal", () => {
    // With no marshaller in front of it (every MCP call), `atlas-query` with no `scope` reaches the leg, the
    // leg does `scope.startsWith(…)`, and the ENGINE raises a TypeError. Filing that as a defect of ours
    // would be the mirror image of the bug this seat removed — so the published `required` set is consulted
    // before the internal label is applied.
    const v = queryHandler(new TypeError("Cannot read properties of undefined (reading 'startsWith')"))
    const missing = createHandler({
      "atlas-query": () => {
        throw new TypeError("Cannot read properties of undefined (reading 'startsWith')")
      },
    }).handle("atlas-query", {})
    expect(faultOf(v)).toBe("internal-fault") // scope WAS supplied ⇒ the crash is genuinely ours
    expect(faultOf(missing)).toBe("malformed-args") // scope was NOT supplied ⇒ it is the caller's
    expect(missing.rejected).toContain("'scope'")
  })

  it("CONTROL: a leg that TOLERATES the omission still returns its own governed verdict", () => {
    // The reason `required` is not enforced up front: `handle('atlas-emit', {})` over a leg that answers
    // `emitted:false` is a shipped exit-2 golden (cli SCN-CLI-3b). The fallback above is on the THROW path
    // only, so this path is byte-unchanged.
    const v = createHandler({ "atlas-emit": () => ({ emitted: false, rejected: "ungrounded" }) as ToolData }).handle(
      "atlas-emit",
      {},
    )
    expect(v.ok).toBe(false)
    expect(v.rejected).toBe("ungrounded")
    expect((v.data as { emitted?: unknown }).emitted).toBe(false) // the record the CLI classifies exit-2 on
  })

  it("a VALID call still reaches its leg — the door narrows, it does not refuse everything", () => {
    const { leg, calls } = countingLeg()
    const v = createHandler({ "atlas-query": leg }).handle("atlas-query", { scope: "src", by: "dependency" })
    // `by` is read by the composed query leg and is NOT declared in the published schema; refusing it would
    // brick `--by dependency` outright, so undeclared properties pass through untouched.
    expect(faultOf(v)).toBeUndefined()
    expect(calls()).toBe(1)
  })
})

describe("WP-F2F5 — resolveNode is TOTAL, and its two fail-closed outcomes carry names", () => {
  const ADDR = "cas:abcd" as unknown as NodeKey

  it("a THROWING node source no longer escapes: the refusal is caught and travels verbatim", () => {
    const nodes: NodeSource = {
      resolve: () => {
        throw new UntrustedStoreErrorDouble()
      },
    }
    let threw = false
    let v: Verdict | undefined
    try {
      v = createHandler({}, nodes).resolveNode(ADDR, "cli")
    } catch {
      threw = true
    }
    // It was DOCUMENTED total and was not; `adapter-io/src/wire.ts` works around that by collapsing its
    // refusal to `undefined`, which is why an untrusted store reads as an ordinary miss over `atlas node`.
    expect(threw).toBe(false)
    expect(v?.ok).toBe(false)
    expect(reasonOf(v?.rejected)).toBe("untrusted-store")
  })

  it("an INTERNAL fault inside a node source names itself internal, with the internal guidance", () => {
    const nodes: NodeSource = {
      resolve: () => {
        throw new TypeError(CONTENT_HASH_CRASH)
      },
    }
    const v = createHandler({}, nodes).resolveNode(ADDR, "cli")
    expect(faultOf(v)).toBe("internal-fault")
    expect(v.guidance.invariant).toBe(INTERNAL_GUIDANCE.invariant)
  })

  it("a genuine MISS carries a STABLE discriminant — it used to embed the address, so no two shared one", () => {
    const nodes: NodeSource = { resolve: () => undefined as GroundedFact | undefined }
    const h = createHandler({}, nodes)
    const a = h.resolveNode("cas:aaaa" as unknown as NodeKey, "cli")
    const b = h.resolveNode("cas:bbbb" as unknown as NodeKey, "mcp")
    expect(reasonOf(a.rejected)).toBe("no-such-node")
    expect(reasonOf(a.rejected)).toBe(reasonOf(b.rejected)) // one name for one condition, address-independent
    // A miss and a refusal are now different NAMES, which is the distinction an embedder could not make.
    expect(reasonOf(a.rejected)).not.toBe("untrusted-store")
  })

  it("an unwired projection source is its own name too", () => {
    const v = createHandler({}).resolveNode(ADDR, "poke")
    expect(reasonOf(v.rejected)).toBe("no-node-source")
  })
})
