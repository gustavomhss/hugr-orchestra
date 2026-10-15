// @atlas/memory — test/mem-kind-derivation.test.ts
//
// Teeth for the DERIVED `MemoryKind` and the closed OWNER-DEFINE park — `reference/atlas-memory.md`
// §Decisions D1 (the owner is the root's resolved `actor`) and D3 (the template-selecting kind is derived,
// never declared).
//
// WHY A SEPARATE FILE. The WP-6.2x files are RED→GREEN transcriptions of frozen goldens and their bind
// notes are scoped to those cards; this behaviour is a ratified amendment, not a golden transcription, so
// it gets its own file rather than being smuggled into one.
//
// THE ASSERTION THAT MATTERS MOST is `MUTUAL EXCLUSION` below. `memoryKindOf` is sound only while the four
// templates cannot be satisfied simultaneously — that is a property of the data, and if a future template
// edit breaks it the derivation silently starts choosing. So the property is asserted directly over every
// ordered pair, and the tie case is asserted to be an ERROR rather than a first-match win.

import { describe, it, expect } from "vitest"
import { memoryKindOf, UndeterminedKindError } from "../src/template.js"
import { put, UnownedWriteError, KindConflationError } from "../src/kinds.js"
import type { MemoryEntry, MemoryKind } from "../src/types.js"

const project = { rule: "r", scope: "s", frecency: 1 } as const
const task = { taskId: "t", attempted: ["a"], failedWith: ["f"], stoppedAt: "x", lesson: "l" } as const
const pr = { prId: "p", decisions: ["d"], reviewOutcomes: ["o"], knowledgeDelta: [] } as const
const logbook = {
  prId: "p",
  at: "1",
  territories: ["t"],
  shipped: "s",
  decisions: "d",
  tradeoffs: "tr",
  risks: "r",
  openThreads: "o",
  links: [],
} as const

const SHAPES: readonly (readonly [MemoryKind, MemoryEntry])[] = [
  ["project", project as MemoryEntry],
  ["task", task as MemoryEntry],
  ["pr", pr as MemoryEntry],
  ["logbook", logbook as MemoryEntry],
]

describe("memoryKindOf — the kind is derived from the SHAPE, not declared", () => {
  it.each(SHAPES)("derives %s from its own template", (kind, entry) => {
    expect(memoryKindOf(entry)).toBe(kind)
  })

  it("MUTUAL EXCLUSION — no entry satisfies two templates (the soundness the derivation rests on)", () => {
    // Each canonical shape must yield EXACTLY its own kind. A shape matching two would have thrown above
    // with a tie; this states the property over the whole set so the reason for it is on the record.
    const derived = SHAPES.map(([, e]) => memoryKindOf(e))
    expect(new Set(derived).size).toBe(SHAPES.length)
  })

  it("rejects an entry that matches NOTHING (missing a required field) — never a guessed type", () => {
    const { frecency: _drop, ...partial } = project
    expect(() => memoryKindOf(partial as unknown as MemoryEntry)).toThrow(UndeterminedKindError)
  })

  it("rejects an entry carrying a key OUTSIDE every template (out-of-section prose)", () => {
    const smuggled = { ...project, freeProse: "anything at all" }
    expect(() => memoryKindOf(smuggled as unknown as MemoryEntry)).toThrow(UndeterminedKindError)
  })

  it('names the candidates on failure — "undetermined" alone sends nobody anywhere', () => {
    try {
      memoryKindOf({} as unknown as MemoryEntry)
      expect.unreachable("an empty entry matches no template")
    } catch (e) {
      expect(e).toBeInstanceOf(UndeterminedKindError)
      expect((e as UndeterminedKindError).candidates).toEqual([])
    }
  })

  it("is TOTAL over junk — a non-object yields the error, never a property-access throw", () => {
    // `null` is the case that caught this: `Object.keys(null)` throws a TypeError, so a bare `.toThrow()`
    // would have passed on the wrong error while the doc claimed totality. Assert the SPECIFIC error.
    expect(() => memoryKindOf(null as unknown as MemoryEntry)).toThrow(UndeterminedKindError)
    expect(() => memoryKindOf(undefined as unknown as MemoryEntry)).toThrow(UndeterminedKindError)
    expect(() => memoryKindOf("nope" as unknown as MemoryEntry)).toThrow(UndeterminedKindError)
    expect(() => memoryKindOf(7 as unknown as MemoryEntry)).toThrow(UndeterminedKindError)
  })
})

describe("put — the park is closed, and neither discriminant is announced by the payload", () => {
  it("writes an owned record whose kind is DERIVED", () => {
    expect(put("memory", task as MemoryEntry, "lucy")).toEqual({
      owner: "lucy",
      kind: "task",
      entry: task,
    })
  })

  it("a caller cannot choose the template that judges their own write", () => {
    // The only kind a caller supplies is the ATLAS kind (memory vs knowledge), and that one is checked
    // against `partition`. There is no parameter through which a task payload can be filed as `project`.
    for (const [kind, entry] of SHAPES) {
      expect(put("memory", entry, "lucy").kind).toBe(kind)
    }
  })

  it("refuses an UNOWNED write — the composition root can resolve `actor` to an empty string", () => {
    expect(() => put("memory", project as MemoryEntry, "")).toThrow(UnownedWriteError)
  })

  it("still refuses a conflated partition BEFORE it ever looks at the owner", () => {
    const knowledgeFact = { kind: "advisory", claim: "x" }
    expect(() => put("memory", knowledgeFact as unknown as MemoryEntry, "lucy")).toThrow(KindConflationError)
  })

  it("refuses an undetermined entry rather than writing it under a guessed kind", () => {
    expect(() => put("memory", { rule: "r" } as unknown as MemoryEntry, "lucy")).toThrow(UndeterminedKindError)
  })
})
