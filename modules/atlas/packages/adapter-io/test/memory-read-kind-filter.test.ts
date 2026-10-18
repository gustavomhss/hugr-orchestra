// @atlas/adapter-io — test/memory-read-kind-filter.test.ts
//
// Is `ownProjectPositions`'s `kind === 'project'` narrowing LOAD-BEARING, or is it decoration that some
// other accident already covers?
//
// This exists because PR #293's M-axis mutated that filter out of the shipped `dist` and the benchmark
// stayed GREEN — the mutant SURVIVED. The M-axis measures the CLI, and the only CLI door onto the ranked
// slab is `atlas memory-header`, which renders `injected` alone. A `task` record leaking into the ranking
// path collapses under the dedup map's `undefined` rule key and carries no `frecency`, so
// `stored * DECAY ** age` is `NaN`, `NaN >= NEAR_ZERO_FRECENCY` is false, and the leaked entry lands in
// `evicted` — a bucket that CLI surface never prints. Invisible there; not invisible here.
//
// So this file is deliberately at the DOOR level rather than the binary level, and says why: the reach of
// an oracle is a property of the surface you run it through, and `projectSlab()` is the surface on which
// this particular invariant is decidable at all.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDurableMemory } from "../src/memory-store.js"
import { createMemoryEmit } from "../src/memory-emit.js"
import { createMemoryRead } from "../src/memory-read.js"
import type { MemoryEntry, NamedScanner } from "@atlas/memory"

let repo: string
const clean: NamedScanner = { name: "gitleaks", scan: () => false }
const as = (o: unknown): MemoryEntry => o as MemoryEntry

const emit = (actor: string, entry: MemoryEntry) =>
  createMemoryEmit({ store: createDurableMemory(repo), actor, scanner: clean }).emit(entry)
const read = (actor: string) => createMemoryRead({ store: createDurableMemory(repo), actor })

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-kindfilter-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("the ranked slab admits ONLY project entries", () => {
  it("the CONTROL: with a project entry alone, the slab is non-degenerate", () => {
    // Without this, a `projectSlab()` that returned two empty buckets would satisfy every assertion below.
    expect(emit("lucy", as({ rule: "r1", scope: "s", frecency: 1 })).ok).toBe(true)
    const slab = read("lucy").projectSlab()
    expect(slab.injected.map((e) => e.rule)).toEqual(["r1"])
    expect(slab.evicted).toHaveLength(0)
  })

  it("a CONSULTABLE record owned by the SAME seat never enters either bucket", () => {
    expect(emit("lucy", as({ rule: "r1", scope: "s", frecency: 1 })).ok).toBe(true)
    expect(
      emit("lucy", as({ taskId: "T-1", attempted: ["a"], failedWith: ["f"], stoppedAt: "s", lesson: "l" })).ok,
    ).toBe(true)
    expect(emit("lucy", as({ prId: "PR-1", decisions: ["d"], reviewOutcomes: ["r"], knowledgeDelta: [] })).ok).toBe(
      true,
    )

    const slab = read("lucy").projectSlab()
    // MEM-4: the two consultable records are on disk and owned by this seat, and neither is ranked.
    expect(slab.injected).toHaveLength(1)
    expect(slab.evicted).toHaveLength(0)
  })

  it("EVERY entry in EITHER bucket is a well-formed project entry — the assertion the mutant fails", () => {
    // The one that kills `filter(kind === 'project')` → `filter(true)`: a leaked task/pr record has no
    // `rule` and no `frecency`, so it is structurally distinguishable HERE even though it is invisible on
    // the CLI. Checked across both buckets, because the leak lands in `evicted`, not `injected`.
    expect(emit("lucy", as({ rule: "r1", scope: "s", frecency: 1 })).ok).toBe(true)
    expect(
      emit("lucy", as({ taskId: "T-1", attempted: ["a"], failedWith: ["f"], stoppedAt: "s", lesson: "l" })).ok,
    ).toBe(true)
    expect(emit("lucy", as({ prId: "PR-1", decisions: ["d"], reviewOutcomes: ["r"], knowledgeDelta: [] })).ok).toBe(
      true,
    )

    const slab = read("lucy").projectSlab()
    for (const e of [...slab.injected, ...slab.evicted]) {
      expect(typeof e.rule).toBe("string")
      expect(typeof e.frecency).toBe("number")
    }
    expect([...slab.injected, ...slab.evicted]).toHaveLength(1)
  })

  it("a consultable record is still RECALLABLE — the filter scopes ranking, it does not hide data", () => {
    // The complement, so "the filter works" cannot be satisfied by a door that simply lost the record.
    expect(
      emit("lucy", as({ taskId: "T-1", attempted: ["a"], failedWith: ["f"], stoppedAt: "s", lesson: "l" })).ok,
    ).toBe(true)
    expect(read("lucy").recall({ taskId: "T-1" })).toHaveLength(1)
  })
})
