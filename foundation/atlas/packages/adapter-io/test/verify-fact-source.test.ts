// @atlas/adapter-io — test/verify-fact-source.test.ts  (the sound-genesis PROVEN-family production feed)
//
// `createVerifyFactLeg` builds the ONE symbol-reverse view + pathOfHash + isLocal the three oracles
// (@atlas/genesis) take, and `verifyFactVerdict` is the shared validate-and-shape body both transports drive.
// This file pins BOTH: the leg dispatches each `kind` to the right oracle over a hand-built `ScipOutput`, and
// the verdict body validates the invocation (unknown kind / empty target / missing scope / missing --min) and
// defaults `worldScope` to `scope`. The oracle decision logic itself is pinned in @atlas/genesis; here we pin
// the WIRING is faithful — that a proven claim reaches `proven`, a refuted negation reaches `refuted`, and a
// malformed argument is an `ok:false` verdict, never a throw.

import { describe, it, expect } from "vitest"
import type { ScipOutput } from "@atlas/index"
import { createVerifyFactLeg, verifyFactVerdict } from "../src/verify-fact-source.js"

// Global (non-`local`) SCIP symbols. GREET is defined in def.ts and referenced in a.ts + b.ts (⇒ 2 callers).
// NEVER is defined but referenced nowhere. UNKNOWN is referenced (in c.ts) but never defined ⇒ an unresolved
// hole, so c.ts is a hole source. `local 0` contributes nothing on either side.
const GREET = "scip-ts npm fixture 1.0.0 `greet`()."
const NEVER = "scip-ts npm fixture 1.0.0 `never`()."
const UNKNOWN = "scip-ts npm fixture 1.0.0 `ffiTarget`()."

const scip: ScipOutput = {
  documents: [
    {
      relativePath: "src/def.ts",
      occurrences: [
        { symbol: GREET, role: "definition" },
        { symbol: NEVER, role: "definition" },
      ],
    },
    { relativePath: "src/a.ts", occurrences: [{ symbol: GREET, role: "reference" }] },
    { relativePath: "src/b.ts", occurrences: [{ symbol: GREET, role: "reference" }] },
    {
      relativePath: "src/c.ts",
      occurrences: [
        { symbol: UNKNOWN, role: "reference" },
        { symbol: "local 0", role: "reference" },
      ],
    },
  ],
}

const leg = createVerifyFactLeg(scip)

describe("verify-fact-source — the PROVEN family feed + shared verdict", () => {
  describe("dependency", () => {
    it("a witnessed caller under scope ⇒ proven", () => {
      const v = verifyFactVerdict(leg, "dependency", GREET, { scope: "src" })
      expect(v.ok).toBe(true)
      expect(v.data?.verdict).toBe("proven")
      expect(v.data?.oracle).toBe("symbol-reverse")
      expect(v.guidance.next).toContain("PROVEN")
    })

    it("a defined-but-uncalled target ⇒ abstain (never refuted — a cross-package absence is not sound)", () => {
      const v = verifyFactVerdict(leg, "dependency", NEVER, { scope: "src/def.ts" })
      expect(v.ok).toBe(true)
      expect(v.data?.verdict).toBe("abstain")
    })

    it("an unresolvable target ⇒ abstain (#220 phantom)", () => {
      const v = verifyFactVerdict(leg, "dependency", UNKNOWN, { scope: "src" })
      expect(v.data?.verdict).toBe("abstain")
      expect(v.data?.reason).toBe("target-unresolvable")
    })

    it("a local target ⇒ abstain(target-not-global)", () => {
      const v = verifyFactVerdict(leg, "dependency", "local 0", { scope: "src" })
      expect(v.data?.verdict).toBe("abstain")
      expect(v.data?.reason).toBe("target-not-global")
    })

    it("worldScope defaults to scope when --world is omitted (still proves)", () => {
      const withWorld = verifyFactVerdict(leg, "dependency", GREET, { scope: "src", world: "src" })
      const noWorld = verifyFactVerdict(leg, "dependency", GREET, { scope: "src" })
      expect(noWorld.data?.verdict).toBe("proven")
      expect(noWorld.data).toEqual(withWorld.data)
    })
  })

  describe("count", () => {
    it("≥N with N ≤ witnessed ⇒ proven (sound lower bound)", () => {
      const v = verifyFactVerdict(leg, "count", GREET, { scope: "src", min: "2" })
      expect(v.data?.verdict).toBe("proven")
    })

    it("≥N with N > witnessed ⇒ abstain", () => {
      const v = verifyFactVerdict(leg, "count", GREET, { scope: "src", min: "3" })
      expect(v.data?.verdict).toBe("abstain")
    })

    it("a non-positive N is malformed at the oracle ⇒ abstain (not a crash)", () => {
      const v = verifyFactVerdict(leg, "count", GREET, { scope: "src", min: "0" })
      expect(v.ok).toBe(true)
      expect(v.data?.verdict).toBe("abstain")
    })

    it("a missing --min is rejected at the arg layer (ok:false)", () => {
      const v = verifyFactVerdict(leg, "count", GREET, { scope: "src" })
      expect(v.ok).toBe(false)
      expect(v.rejected).toContain("--min")
    })
  })

  describe("negation (the closed-world dual, #220)", () => {
    it("a witnessed caller under scope ⇒ refuted (only negation can refute)", () => {
      const v = verifyFactVerdict(leg, "negation", GREET, { scope: "src" })
      expect(v.data?.verdict).toBe("refuted")
      expect(v.guidance.next).toContain("REFUTED")
    })

    it("an open scope (a hole under it) ⇒ abstain(scope-open), never a false proven", () => {
      // NEVER has no caller anywhere, but src carries an unresolved hole (c.ts → UNKNOWN), so the world is open.
      const v = verifyFactVerdict(leg, "negation", NEVER, { scope: "src" })
      expect(v.data?.verdict).toBe("abstain")
      expect(v.data?.reason).toBe("scope-open")
    })

    it("a CLOSED scope with no caller and no hole ⇒ proven", () => {
      // src/def.ts defines NEVER, references nothing unresolved, and no doc references NEVER ⇒ closed & empty.
      const v = verifyFactVerdict(leg, "negation", NEVER, { scope: "src/def.ts" })
      expect(v.data?.verdict).toBe("proven")
    })
  })

  describe("malformed invocation ⇒ structured ok:false, never a throw", () => {
    it("an unknown kind is rejected", () => {
      const v = verifyFactVerdict(leg, "transition", GREET, { scope: "src" })
      expect(v.ok).toBe(false)
      expect(v.rejected).toContain("unknown kind")
    })

    it("an empty target is rejected", () => {
      const v = verifyFactVerdict(leg, "dependency", "", { scope: "src" })
      expect(v.ok).toBe(false)
      expect(v.rejected).toContain("missing target")
    })

    it("a missing scope is rejected", () => {
      const v = verifyFactVerdict(leg, "dependency", GREET, {})
      expect(v.ok).toBe(false)
      expect(v.rejected).toContain("--scope")
    })
  })
})
