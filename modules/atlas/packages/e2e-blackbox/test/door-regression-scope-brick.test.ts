// @atlas/e2e-blackbox — test/door-regression-scope-brick.test.ts  (DOOR-LEVEL, defect 2, REAL CLI)
//
// The adapter-level twin of this case (`packages/adapter-io/test/door-regression-scope-wellformed.test.ts`)
// drives `createGovernedEmit` in-process. This one drives the REAL `atlas emit` binary as a subprocess over
// a REAL temp git repo, because the premise of the defect is a claim about the WIRE: `scope` is typed
// `string | undefined`, and the only reason a non-string can ever reach the door is that `atlas emit` is
// `JSON.parse` plus a cast. An in-process test has to ASSERT that premise by construction; this one
// EXERCISES it — the array scope goes onto disk as JSON and comes back through the product's own parser.
//
// The property under test is the BRICK, not the refusal: whatever verdict the malformed write earns, the
// legitimate, correctly-scoped, authorized write to the SAME `(anchor, slot)` must still be accepted
// afterwards. `nodeKey` is deterministic over public code structure, so an attacker can pre-compute the key
// of a symbol nobody has claimed yet; if one malformed write can make that key permanently unwritable, the
// door hands out a denial-of-service against any anchor, and unlike a refused write it cannot be undone.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import type { GroundedFact } from "@atlas/knowledge"
import { draftFact } from "./support.js"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"

const SRC = "export const settle = 1;\n"

let repo: FixtureRepo
let priorActor: string | undefined
let priorRatify: string | undefined

function setup(): void {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER
  repo = makeFixtureRepo({ files: { "src/a.ts": SRC }, policy: scopedPolicy("src") })
}

function teardown(): void {
  repo.cleanup()
  process.env.ATLAS_ACTOR = priorActor
  process.env.ATLAS_RATIFY_TOKEN = priorRatify
}

beforeAll(setup, 60000)
afterAll(teardown)

describe("DOOR REGRESSION (real CLI) — a malformed scope must not brick an anchor", () => {
  it("DOOR-SCOPE-CLI-1 — after a JSON array scope, the same anchor is still writable", () => {
    const legit = draftFact(repo, "src/a.ts", "invariant", "the real claim").fact
    // The SAME fact with the one field the wire can carry and the type system cannot police.
    const squat = { ...legit, scope: ["src"] } as unknown as GroundedFact

    // PREMISE — both payloads name the same node: identity is `hash(anchor ‖ slot)`, which carries no scope.
    expect(squat.id).toBe(legit.id)

    // Drive the squat through the real binary and RECORD its verdict without judging it.
    const squatted = emitFact(repo, squat)
    expect([0, 1, 2]).toContain(squatted.exitCode)

    // TEETH — the legitimate write still lands, and NOT because the door forgot the relocation rule: the
    // reason string is checked so a pass cannot come from the write being refused for something else.
    const out = emitFact(repo, legit)
    expect(out.stdout + out.stderr).not.toMatch(/governance-relocation/)
    expect(out.exitCode).toBe(0)
  }, 60000)
})
