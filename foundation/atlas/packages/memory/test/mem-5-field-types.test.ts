// @atlas/memory — test/mem-5-field-types.test.ts  (MEM-5 · the per-field TYPE check)
//
// The gate `validate` grew a third condition (types), and this file is the evidence for two SEPARATE
// claims that are easy to conflate:
//
//   1. CORRECTNESS — a value of the wrong type is rejected, per field, per kind.
//   2. REACHABILITY — the refusal this enables is one a real input can actually produce.
//
// (2) is the load-bearing one and it is why this file exists at all. Before the type check, `validate`
// decided PRESENCE and KEY-MEMBERSHIP, which are EXACTLY the two conditions `memoryKindOf` uses to select
// a template. So every entry `validate` could reject had already been rejected one gate earlier by
// derivation: the write door's `template-invalid` refusal was DECLARED, advertised to users in its own
// guidance, and unreachable by any input. A test suite that only asserted "wrong shape ⇒ rejected" passed
// throughout, because it never had to say WHICH gate did the rejecting.
//
// So the reachability tests below assert the DERIVATION SUCCEEDS and the VALIDATION FAILS on the same
// entry — the only shape of evidence that distinguishes a reachable gate from a masked one.

import { describe, it, expect } from "vitest"
import { validate, memoryKindOf, UndeterminedKindError } from "../src/template.js"
import type { MemoryEntry, MemoryKind } from "../src/types.js"

const as = (o: unknown): MemoryEntry => o as MemoryEntry

/** A complete, well-typed entry per kind — the baseline every mutation below starts from. */
const WELL_TYPED: Record<MemoryKind, MemoryEntry> = {
  project: as({ rule: "always X", scope: "src/**", frecency: 1 }),
  task: as({ taskId: "T-1", attempted: ["a"], failedWith: ["f"], stoppedAt: "s", lesson: "l" }),
  pr: as({ prId: "PR-1", decisions: ["d"], reviewOutcomes: ["r"], knowledgeDelta: [] }),
  logbook: as({
    prId: "PR-1",
    at: "1",
    territories: ["t"],
    shipped: "s",
    decisions: "d",
    tradeoffs: "tr",
    risks: "r",
    openThreads: "o",
    links: [],
  }),
}

const KINDS: readonly MemoryKind[] = ["project", "task", "pr", "logbook"]

describe("the control: every well-typed entry still validates", () => {
  // Without this, a `validate` that returned `{valid:false}` unconditionally would score perfectly on
  // every other test in this file.
  for (const kind of KINDS) {
    it(`${kind} — the complete, correctly-typed template is ACCEPTED`, () => {
      expect(validate(kind, WELL_TYPED[kind])).toEqual({ valid: true, reasons: [] })
    })
  }
})

describe("REACHABILITY — the type check is the first condition derivation does NOT decide", () => {
  // Each case: keys are exactly one template's, every required field present — so `memoryKindOf` names
  // that template — and one value is of the wrong type, so `validate` refuses. Derivation PASSES and
  // validation FAILS on the SAME entry. That is `template-invalid` having a non-empty domain.
  const cases: readonly { readonly kind: MemoryKind; readonly what: string; readonly entry: MemoryEntry }[] = [
    {
      kind: "project",
      what: "frecency as a numeric STRING (the coercing one)",
      entry: as({ rule: "r", scope: "s", frecency: "999" }),
    },
    {
      kind: "project",
      what: "frecency as a non-numeric string (the NaN one)",
      entry: as({ rule: "r", scope: "s", frecency: "high" }),
    },
    { kind: "project", what: "frecency as null", entry: as({ rule: "r", scope: "s", frecency: null }) },
    { kind: "project", what: "rule as a number", entry: as({ rule: 7, scope: "s", frecency: 1 }) },
    {
      kind: "task",
      what: "attempted as a bare string, not an array",
      entry: as({ ...(WELL_TYPED.task as object), attempted: "a" }),
    },
    {
      kind: "pr",
      what: "knowledgeDelta as an array of strings",
      entry: as({ ...(WELL_TYPED.pr as object), knowledgeDelta: ["not-a-fact"] }),
    },
    { kind: "logbook", what: "links carrying a number", entry: as({ ...(WELL_TYPED.logbook as object), links: [3] }) },
    {
      kind: "logbook",
      what: "decisions as an array (a prose section is one string)",
      entry: as({ ...(WELL_TYPED.logbook as object), decisions: ["d"] }),
    },
  ]

  for (const c of cases) {
    it(`${c.kind}: ${c.what} — derivation NAMES the kind, validation REFUSES it`, () => {
      expect(memoryKindOf(c.entry)).toBe(c.kind) // gate 1 passes — this is the half that used to fail first
      const v = validate(c.kind, c.entry)
      expect(v.valid).toBe(false)
      expect(v.reasons.some((r) => r.startsWith("wrong type:"))).toBe(true)
    })
  }

  it("the NEGATIVE control: an out-of-template key is still caught by DERIVATION, not by this gate", () => {
    // The pre-existing behaviour, pinned so the new check cannot be credited with reach it does not have.
    expect(() => memoryKindOf(as({ rule: "r", scope: "s", frecency: 1, extra: "x" }))).toThrow(UndeterminedKindError)
  })
})

describe("the finite-number bound on frecency is deliberate, not incidental", () => {
  // `frecency` is a RANKING key: `adapter-io/src/memory-read.ts` computes `stored * DECAY ** age`. NaN and
  // ±Infinity are `typeof 'number'`, survive a naive typeof check, and then propagate through that
  // multiplication silently — NaN compares false against the eviction floor and vanishes without a word.
  for (const bad of [NaN, Infinity, -Infinity]) {
    it(`frecency = ${String(bad)} is REFUSED even though typeof is 'number'`, () => {
      const v = validate("project", as({ rule: "r", scope: "s", frecency: bad }))
      expect(v.valid).toBe(false)
      expect(v.reasons).toContain("wrong type: frecency must be finite-number")
    })
  }
})

describe("Ref is checked structurally, both legs of the union", () => {
  const ref = { kind: "file", qualifiedPath: "src/a.ts", subtreeHash: "abc" }

  it("accepts a bare pointer string", () => {
    expect(validate("project", as({ rule: "r", scope: "s", frecency: 1, grounding: "PR-9" })).valid).toBe(true)
  })
  it("accepts a StructRef-shaped object", () => {
    expect(validate("project", as({ rule: "r", scope: "s", frecency: 1, grounding: ref })).valid).toBe(true)
  })
  it("REFUSES an object missing subtreeHash", () => {
    const v = validate(
      "project",
      as({ rule: "r", scope: "s", frecency: 1, grounding: { kind: "file", qualifiedPath: "a" } }),
    )
    expect(v.valid).toBe(false)
  })
  it("REFUSES a StructRef kind outside the frozen set", () => {
    const v = validate("project", as({ rule: "r", scope: "s", frecency: 1, grounding: { ...ref, kind: "module" } }))
    expect(v.valid).toBe(false)
  })
  it("REFUSES a number", () => {
    expect(validate("project", as({ rule: "r", scope: "s", frecency: 1, grounding: 3 })).valid).toBe(false)
  })
})

describe("totality — the gate is documented as pure + total, so hostile input is asserted, not assumed", () => {
  for (const hostile of [null, undefined, 3, "a string", []]) {
    it(`validate('project', ${JSON.stringify(hostile) ?? "undefined"}) returns a verdict rather than throwing`, () => {
      expect(() => validate("project", hostile as unknown as MemoryEntry)).not.toThrow()
      expect(validate("project", hostile as unknown as MemoryEntry).valid).toBe(false)
    })
  }
})

describe("one defect is named once", () => {
  it("a missing required field is reported as missing, NOT also as a type failure", () => {
    const v = validate("project", as({ rule: "r", scope: "s" }))
    expect(v.reasons).toEqual(["missing field: frecency"])
  })
  it("an out-of-template key is reported as out-of-section, NOT also as a type failure", () => {
    const v = validate("project", as({ rule: "r", scope: "s", frecency: 1, junk: 3 }))
    expect(v.reasons).toEqual(["out-of-section prose: junk"])
  })
})
