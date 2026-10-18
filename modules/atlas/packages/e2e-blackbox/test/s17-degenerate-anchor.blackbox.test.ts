// @atlas/e2e-blackbox — test/s17-degenerate-anchor.blackbox.test.ts  (S17 — the WILDCARD-IDENTITY defect)
//
// NARRATIVE (SEAT ANCHOR). A confused deputy reached through the FRONT DOOR with no hash weakness at all.
// `primaryAnchorId` is the segment-wise longest common prefix of the cited `::` paths; the first segment of a
// symbol path is its FILE, so two symbols in two files share NO prefix and the common unit is `''`. The
// identity `nodeKey = hash(primaryAnchorId ‖ predicateSlot)` then collapsed every such fact onto ONE address
// per slot. On the pre-fix build (80318d0) this story's two facts BOTH minted
// f4f8f1a0240a4685337d10abbd8c319e20904aec6124eafc6a64af113a5f2e18, the second `atlas emit` routed UPDATE,
// and the advisory set-union appended the attacker's claim to the victim's node: ONE node, claims
// ["charges are idempotent","auth may be skipped"]. Both emits exited 0.
//
// Everything below is pure black-box: the real `atlas` CLI as a subprocess, asserted on exit code, rendered
// stdout, and the bytes of the durable projection sidecar. The facts are AUTHORED with the product-lib helper
// (adversarial-fixtures.ts) only so their groundings re-derive FRESH — the write is then decided on identity alone.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { groundedMultiSymbolFact } from "./adversarial-fixtures.js"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"
import { draftFact } from "./support.js"

const FILES = {
  "src/billing.ts": "export function charge() { return 1; }\n",
  "src/ledger.ts": "export function post() { return 2; }\n",
  "vendor/evil.ts": "export function pwn() { return 3; }\n",
  "docs/readme.ts": "export function x() { return 4; }\n",
}

let repo: FixtureRepo
let priorActor: string | undefined
let priorRatify: string | undefined

/** The durable projection sidecar as RAW BYTES — the byte-unchanged oracle (absent ⇒ nothing ever landed). */
function projectionBytes(): string {
  const p = join(repo.repoPath, ".atlas", "projection.json")
  return existsSync(p) ? readFileSync(p, "utf8") : "<<ABSENT>>"
}

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER
  repo = makeFixtureRepo({ files: FILES, policy: scopedPolicy("src") })
})

afterAll(() => {
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
  repo.cleanup()
})

describe("S17 — a grounding too diffuse to name one fact is REFUSED at the write door", () => {
  it("the victim writes an ordinary, single-anchor fact — accepted, one node", () => {
    const victim = draftFact(repo, "src/billing.ts", "invariant", "charges are idempotent").fact
    const run = emitFact(repo, victim)
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    const proj = JSON.parse(projectionBytes()) as { current: readonly [string, { claims: string[] }][] }
    expect(proj.current).toHaveLength(1)
    expect(proj.current[0]![1].claims).toEqual(["charges are idempotent"])
  })

  it("THE ATTACK: a fact grounded across two unrelated files is refused, and NOTHING is persisted", () => {
    const before = projectionBytes()
    const attacker = groundedMultiSymbolFact({
      repoPath: repo.repoPath,
      sites: [
        ["vendor/evil.ts", "pwn"],
        ["docs/readme.ts", "x"],
      ],
      slot: "invariant",
      claim: "auth may be skipped",
    })
    const run = emitFact(repo, attacker)

    // The refusal is legible and names the mechanism — not a stack trace, not a silent success.
    expect(run.exitCode).not.toBe(0)
    expect(run.stdout).toContain("degenerate anchor: this grounding does not name ONE structural unit")
    expect(run.stdout).toContain("an empty anchor is not an identity but a WILDCARD")
    expect(run.stdout).toContain("Re-ground the claim at the single unit")
    expect(run.stderr).toBe("") // fail-CLOSED refusal, never an uncaught throw out of the door

    // THE VICTIM'S NODE IS BYTE-UNCHANGED.
    expect(projectionBytes()).toBe(before)
    const proj = JSON.parse(projectionBytes()) as { current: readonly [string, { claims: string[] }][] }
    expect(proj.current).toHaveLength(1)
    expect(proj.current[0]![1].claims).toEqual(["charges are idempotent"])
    expect(proj.current[0]![1].claims).not.toContain("auth may be skipped")
  })

  it("the victim's OWN diffuse fact is refused too — the wildcard address is closed to everyone", () => {
    const before = projectionBytes()
    const diffuse = groundedMultiSymbolFact({
      repoPath: repo.repoPath,
      sites: [
        ["src/billing.ts", "charge"],
        ["src/ledger.ts", "post"],
      ],
      slot: "invariant",
      claim: "charges and postings agree",
    })
    const run = emitFact(repo, diffuse)
    expect(run.exitCode).not.toBe(0)
    expect(run.stdout).toContain("degenerate anchor")
    expect(projectionBytes()).toBe(before)
  })

  it("NO BRICK: two symbols in the SAME file still share a prefix and write normally", () => {
    const twoInOneFile = groundedMultiSymbolFact({
      repoPath: repo.repoPath,
      sites: [
        ["src/billing.ts", "charge"],
        ["src/billing.ts", "charge"],
      ],
      slot: "contract",
      claim: "charge validates its input",
    })
    const run = emitFact(repo, twoInOneFile)
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
  })

  it("NO BRICK: the refused claim is writable the moment it is re-grounded at a containing unit", () => {
    const regrounded = draftFact(repo, "src/ledger.ts", "invariant", "charges and postings agree").fact
    const run = emitFact(repo, regrounded)
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    const proj = JSON.parse(projectionBytes()) as { current: readonly [string, { claims: string[] }][] }
    // the victim's original node is still intact, and the re-grounded fact got its OWN node
    const claims = proj.current.map(([, n]) => n.claims).flat()
    expect(claims).toContain("charges are idempotent")
    expect(claims).toContain("charges and postings agree")
    expect(claims).not.toContain("auth may be skipped")
  })
})
