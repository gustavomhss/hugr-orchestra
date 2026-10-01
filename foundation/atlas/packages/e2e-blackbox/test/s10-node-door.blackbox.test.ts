// @atlas/e2e-blackbox — test/s10-node-door.blackbox.test.ts  (S10 — the read-only `atlas node <addr>` door)
//
// NARRATIVE: a lead grounds + emits ONE fact; the emit door prints its CONTENT ADDRESS. `atlas node <addr>`
// then resolves that node READ-ONLY through the ONE wired handler's `resolveNode` over the composition-root
// `NodeSource` (N6 / TOOLS-10) — proving the oracle that was total-but-doorless is now reachable, and that a
// MISS is total + structured (never a crash). Pure black-box: every execution + assertion goes through the
// real `atlas` bin as a subprocess.
//
// SOTA invariants pinned:
//   - A HIT resolves the emitted fact by its content address (exit 0, the fact rendered).
//   - A MISS (a content address with no grounded node) is TOTAL + STRUCTURED (exit 1, a reason, no stack).
//   - The door is READ-ONLY: it opens no write path (writes still funnel through `atlas-emit`).

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"
import { draftFact } from "./support.js"

const CLAIM = "node door fact — resolvable by content address"

/** Extract the CAS content address the emit door printed (`  id: <hash>`). */
function emittedAddress(stdout: string): string {
  const m = stdout.match(/^\s*id:\s*(\S+)\s*$/m)
  if (m === null) throw new Error(`S10: no emitted content address in:\n${stdout}`)
  return m[1]!
}

let repo: FixtureRepo
let fact: GroundedFact
let addr: string
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER
  repo = makeFixtureRepo({
    files: { "src/thing.ts": "export const thing = 1;\n" },
    policy: scopedPolicy("src"),
  })
  fact = draftFact(repo, "src/thing.ts", "invariant", CLAIM).fact
  const e = emitFact(repo, fact)
  if (e.exitCode !== 0) throw new Error(`S10 setup: grounded emit failed:\n${e.stdout}`)
  addr = emittedAddress(e.stdout) // the content address the durable write door persisted the fact under
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S10 — atlas node <addr>: the read-only per-node door + totality on a miss", () => {
  it("resolves the grounded fact for an emitted fact content address (exit 0, data rendered)", () => {
    const hit = runAtlas(repo.repoPath, ["node", addr])
    expect(hit.exitCode).toBe(0)
    expect(hit.stdout).toContain("status: ok")
    expect(hit.stdout).toContain("data:") //         the resolved GroundedFact is rendered (not dropped)
    expect(hit.stdout).toContain(CLAIM) //           the actual fact content came back
    expect(hit.stdout).toContain(`node: ${fact.id}`) // the node identity is the emitted fact's nodeKey
    expect(hit.stderr).toBe("")
  })

  it("a miss (`atlas node deadbeef`) is TOTAL + structured — exit 1, a reason, no crash trace", () => {
    const miss = runAtlas(repo.repoPath, ["node", "deadbeef"])
    expect(miss.exitCode).toBe(1) //                 structured error, not a governance-rejection (2), not ok
    expect(miss.stdout).toContain("status: error")
    expect(miss.stdout).toContain("no grounded node at content address 'deadbeef'")
    expect(miss.stdout).not.toContain("data:") //    a miss renders no fact block
    expect(miss.stderr).toBe("") //                  no thrown stack leaked to stderr (never a crash)
  })

  it("a bare `atlas node` (no address) fails CLOSED at the parser arity floor (structured, exit 1)", () => {
    const bare = runAtlas(repo.repoPath, ["node"])
    expect(bare.exitCode).toBe(1)
    expect(bare.stdout).toContain("status: error")
    expect(bare.stdout).toMatch(/requires 1 positional argument/)
    expect(bare.stderr).toBe("")
  })

  it("a PATH-TRAVERSAL addr is a FAST structured miss — no filesystem read, no hang/OOM (billy PoC)", () => {
    // The raw <addr> reaches store.get → valuePath(join) → readFileSync. Without the charset/sandbox guard a
    // `../`-traversal to an UNBOUNDED file (/dev/zero) would readFileSync BEFORE the re-hash check → hang+OOM
    // (billy measured 4.67GB RSS). A CAS address is EXACTLY 64 lowercase hex, so a traversal addr is rejected
    // BEFORE any read → the SAME structured "no grounded node" miss. Each run must complete near-instantly.
    for (const evil of [
      "../../../../dev/zero",
      "../../../../../../etc/passwd",
      "AB".repeat(32) /* uppercase ≠ CAS */,
    ]) {
      const t0 = Date.now()
      const miss = runAtlas(repo.repoPath, ["node", evil])
      const elapsedMs = Date.now() - t0
      expect(miss.exitCode).toBe(1) //                   fail-closed structured miss (never a read)
      expect(miss.stdout).toContain("status: error")
      expect(miss.stdout).toContain("no grounded node at content address")
      expect(miss.stderr).toBe("") //                    no crash / no OOM stack
      expect(elapsedMs).toBeLessThan(30_000) // FAST — a subprocess spin-up, not an unbounded read (20s of headroom for a loaded host; the teeth are the 1s→subprocess scale, not a strict <10s)
    }
  })
})
