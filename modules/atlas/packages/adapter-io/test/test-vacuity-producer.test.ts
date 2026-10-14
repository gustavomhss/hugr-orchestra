// @atlas/adapter-io — test/test-vacuity-producer.test.ts  (#95 · ADR-0015 D5 — the reachable test-vacuity PRODUCER)
//
// The producer parses REAL test-file bytes via the SAME tree-sitter machinery `ast.ts` uses, runs
// `scanTestVacuity`, seals every proven fact through genesis's authority (`trySoundTestVacuity`), and routes it
// THROUGH the governed door — NOT a direct `commitProjection` (the #87/#234 gate-less-write fix): KNOW-11 authz
// + ARCH-9 anchor + the HEAD truth gate all apply. Pins: one vacuous test ⇒ exactly one proven node landed; a
// unit with none ⇒ zero; an unparseable unit ⇒ zero (fail-closed); an UNAUTHORIZED actor ⇒ refused, nothing lands.

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect, afterEach, beforeAll } from "vitest"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { currentNodes } from "@atlas/knowledge"
import { initAst } from "../src/index.js"
import { createDiskStore, rehydrateProjection } from "../src/store.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import type { AtlasPolicy } from "../src/policy.js"
import { createTestVacuityProducer, type TestUnit, type TestVacuityEmit } from "../src/test-vacuity-source.js"

beforeAll(async () => {
  await initAst()
}) // warm the grammar so parseTsDoc folds the SAME AST units production folds

const ACTOR = "seat:owner"
const OTHER = "seat:intruder" // NOT a member of scope 'src'
const POLICY: AtlasPolicy = { t0Heuristic: { keywords: [] }, authz: { scopes: { src: [ACTOR] } } }
const STUB_GATE = { gateHolds: () => "HOLDS" as const } // the HEAD truth gate is exercised in the door test; here it holds

const anchor = (tag: string): StructRef => ({
  kind: "file",
  qualifiedPath: `src/${tag}.test.ts`,
  subtreeHash: asSubtreeHash(`st-${tag}`),
})
const unit = (tag: string, content: string): TestUnit => ({
  unitKey: `src/${tag}.test.ts`,
  path: `src/${tag}.test.ts`,
  anchor: anchor(tag),
  content,
})

// one PROVEN assertion-only-in-catch test — every assertion sits inside `catch`, no assertion-count guard.
const VACUOUS = `import { test, expect } from 'vitest';
test('swallows the rejection', () => {
  try {
    doThing();
  } catch (e) {
    expect(e).toBeInstanceOf(Error);
  }
});
`
// a normal test — the assertion is on the success path ⇒ scanTestVacuity ABSTAINS (no fact).
const FINE = `import { test, expect } from 'vitest';
test('asserts directly', () => {
  expect(1).toBe(1);
});
`
// a file the grammar cannot parse ⇒ parseTsDoc returns undefined ⇒ fail-closed, no fact.
const BROKEN = `import { test } from 'vitest';
test('broken' => {{{ this is not valid typescript
`

function producerFor(dir: string, units: readonly TestUnit[], actor: string) {
  const store = createDiskStore(join(dir, ".atlas"))
  const emit = createGovernedEmit({
    store,
    gate: STUB_GATE,
    policy: POLICY,
    actor,
    origin: "promoted",
    ratifyToken: "seat:ratifier",
  }).emit as TestVacuityEmit
  const produce = createTestVacuityProducer(() => units, emit, asHash(""))
  const rows = () => currentNodes(rehydrateProjection(store)).filter((n) => n.family === "test-vacuity")
  return { produce, rows }
}

let dir: string | undefined
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

describe("createTestVacuityProducer — real parse → seal → governed-door persist", () => {
  it("one vacuous test ⇒ exactly ONE proven node landed THROUGH the door", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-prod-"))
    const { produce, rows } = producerFor(dir, [unit("foo", VACUOUS)], ACTOR)
    const runs = produce()
    expect(runs).toHaveLength(1)
    expect(runs[0]!.admitted).toBe(true)
    expect(runs[0]!.persisted).toBe(true)
    expect(runs[0]!.testName).toBe("swallows the rejection")
    expect(runs[0]!.id).toBeTruthy()
    const landed = rows()
    expect(landed).toHaveLength(1)
    expect(landed[0]!.seal).toBe("proven")
    expect(landed[0]!.testName).toBe("swallows the rejection")
    expect(landed[0]!.shape).toBe("assertion-only-in-catch")
  })

  it("a unit with no vacuous test ⇒ ZERO runs, nothing lands (scanTestVacuity abstains)", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-prod-"))
    const { produce, rows } = producerFor(dir, [unit("fine", FINE)], ACTOR)
    expect(produce()).toHaveLength(0)
    expect(rows()).toHaveLength(0)
  })

  it("an UNPARSEABLE unit ⇒ FAIL-CLOSED: one admitted:false run, nothing lands (never a fabricated fact)", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-prod-"))
    const { produce, rows } = producerFor(dir, [unit("broken", BROKEN)], ACTOR)
    const runs = produce()
    expect(runs).toHaveLength(1)
    expect(runs[0]!.admitted).toBe(false)
    expect(runs[0]!.reason).toMatch(/could not be parsed/)
    expect(rows()).toHaveLength(0)
  })

  it("SECURITY TEETH — an UNAUTHORIZED actor is REFUSED by the governed door; the row does NOT land", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-prod-"))
    const { produce, rows } = producerFor(dir, [unit("foo", VACUOUS)], OTHER) // NOT in scope 'src'
    const runs = produce()
    expect(runs[0]!.admitted).toBe(true) // the fact is well-formed + sealed
    expect(runs[0]!.persisted).toBe(false) // but the governed door refused (KNOW-11 authz)
    expect(runs[0]!.reason).toMatch(/authoriz|scope/i)
    expect(rows()).toHaveLength(0) // a gate-less persist would have landed it
  })
})
