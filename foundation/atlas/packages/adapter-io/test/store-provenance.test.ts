// @atlas/adapter-io — test/store-provenance.test.ts  (the ROOT the governed doors hang from)
//
// Every gate in this package decides what a WRITE may do. None of them decides where the durable projection
// CAME FROM. `.atlas/projection.json` plus `.atlas/cas/**` are ordinary files in an ordinary working tree, so
// a repository can simply SHIP them: one landed commit publishes rows with any `nodeKey`, any `scope`, any
// `tier` and any `contentHash`, and no door is involved at all. Reproduced end to end below.
//
// WHY THE `.gitignore` LINE IS NOT THE CONTROL (and why this file exists anyway). `.gitignore` already denies
// `.atlas/*` — that landed in `482c68c`, and it is worth having: it stops the ACCIDENT, which is the common
// case. It is not a control against an adversary, because `git add -f` overrides it in one flag, and the
// `-f` leaves no trace in the tree that a reviewer reads differently from any other file. This suite drives
// exactly that path.
//
// WHY "CONTENT-VERIFICATION ON LOAD" IS NOT THE CONTROL EITHER, which is the more expensive lesson. The store
// ALREADY content-verifies: `store.get` re-hashes every CAS object and serves `undefined` unless `id(bytes)`
// equals the key it was fetched by. That check passes here — the fixture computes its hashes with the
// product's own `id()`, exactly as the door would. The row corroborates its own bytes too (same `scope`, same
// `tier`), so the emit door's ADR-0007 corroboration gate would also pass. Content-addressing authenticates
// INTEGRITY — "these bytes are the bytes this hash names" — and says nothing whatever about PROVENANCE —
// "a governed door decided these bytes may be here". The attacker who writes the file computes the hashes.
// So the property under test is PROVENANCE: a projection that arrived by COMMIT is not a projection that
// arrived through a door, and it must not be served as though it were.
//
// TRAVEL-BY-REPROOF (owner-authorized 2026-08-18) NARROWED one leg of this: a `.atlas/projection*.json` +
// `.atlas/cas/**` commit (staging NOT also tracked) is no longer a blanket refusal — it is served, FILTERED
// to facts whose own witness replays `re-proven` against the live oracle (`reverify-store.ts`). The fixture
// below never carries a witness at all (it is hand-forged, no door involved, exactly the point), so it stays
// the RIGHT adversarial case: an attacker's row is STILL never served, but now because it does not re-prove,
// not because the whole store was refused. `travel-by-reproof-compose.test.ts` carries the POSITIVE case
// (a witness that DOES re-prove) and the third population (`.atlas/staging` tracked), which stays a flat
// refusal, unchanged.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { PackInvariant } from "@atlas/contracts"
import { emptyStore, currentNodes } from "@atlas/knowledge"
import { composeRuntime } from "../src/compose.js"
import { createDiskStore, rehydrateProjection } from "../src/store.js"
import { gitSidecarTrust } from "../src/store-provenance.js"

/** The forged claim, verbatim, so an assertion can name the thing that must never be served. */
const FORGED_CLAIM = "ATTACKER CONTROLLED INVARIANT - no door ever saw this"

/** A poisoned repo: real git, real commit, hand-authored `.atlas/` landed past `.gitignore` with `-f`. */
interface Poisoned {
  readonly repoPath: string
  cleanup(): void
}

/** A grounded advisory fact anchored at `path`, at an ARBITRARY tier/scope — the shape a door would mint,
 *  assembled by hand because the whole point is that no door is involved. */
function fact(anchorPath: string, gen: string, claim: string): CasObject {
  return {
    kind: "advisory",
    id: "forged-" + gen,
    // `T0` is the STRICTEST class — human-ratified, and inside the TOOLS-6 pack bound. The tier lattice is
    // sound (a `T2`/`T3` row is bounded out at the mint); it is bypassed by declaring a tier that is not
    // bounded out, which costs the attacker one string.
    tier: "T0",
    scope: "scope-the-attacker-named",
    claimNorm: claim,
    freshness: "FRESH",
    grounding: {
      entries: [{ anchor: { kind: "symbol", qualifiedPath: anchorPath, subtreeHash: "sh-" + gen }, path: anchorPath }],
    },
  } as unknown as CasObject
}

function poisonedRepo(opts: { commitAtlas?: boolean } = {}): Poisoned {
  const commitAtlas = opts.commitAtlas ?? true
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-provenance-"))
  const git = (...args: string[]): string => execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" })
  git("init", "-q")
  // Obviously-synthetic identity: `.invalid` is the RFC 2606 reserved TLD, so this can never name a real
  // mailbox, and it is not a credential of any kind — the actor is a plain string the product never verifies.
  git("config", "user.email", "attacker@example.invalid")
  git("config", "user.name", "synthetic-fixture")
  git("config", "commit.gpgsign", "false")

  mkdirSync(join(repoPath, "src"), { recursive: true })
  writeFileSync(join(repoPath, "src/util.ts"), "export const util = 1;\n")
  writeFileSync(join(repoPath, "src/app.ts"), 'import { util } from "./util.js";\nexport const app = util;\n')

  const atlas = join(repoPath, ".atlas")
  mkdirSync(atlas, { recursive: true })
  // authz.scopes = {} — the fail-closed default. EVERY write door denies EVERY write in this repo. The
  // attack therefore cannot be confused with a write that was merely mis-authorized: no write happens.
  writeFileSync(
    join(atlas, "policy.json"),
    JSON.stringify({ nearDup: { claimNormThreshold: 1 }, t0Heuristic: { keywords: [] }, authz: { scopes: {} } }),
  )

  // The two CAS blobs, written at their OWN content addresses using the product's `id()`. These pass the
  // re-hash-on-read check by construction; that is the point being made.
  const forged = fact("src/app.ts", "forged", FORGED_CLAIM)
  const anchor = fact("src/util.ts", "anchor", "anchor claim")
  const put = (obj: CasObject): string => {
    const h = String(id(obj))
    mkdirSync(join(atlas, "cas", h.slice(0, 2)), { recursive: true })
    writeFileSync(join(atlas, "cas", h.slice(0, 2), h), JSON.stringify(obj))
    return h
  }
  const forgedHash = put(forged)
  const anchorHash = put(anchor)

  const row = (key: string, contentHash: string, claim: string, anchorPath: string): unknown => [
    key,
    {
      nodeKey: key, // satisfies the `isKeyedEntry` representation invariant — that guard is about SHAPE
      family: "advisory",
      contentHash,
      claims: [claim],
      primaryAnchor: anchorPath,
      slot: "invariant",
      scope: "scope-the-attacker-named",
      tier: "T0",
    },
  ]
  writeFileSync(
    join(atlas, "projection.json"),
    JSON.stringify({
      current: [
        row("k:forged", forgedHash, FORGED_CLAIM, "src/app.ts"),
        row("k:anchor", anchorHash, "anchor claim", "src/util.ts"),
      ],
      cas: [forgedHash, anchorHash],
    }),
  )

  git("add", "src")
  if (commitAtlas) git("add", "-f", ".atlas") // THE one flag `.gitignore` costs an attacker
  git("commit", "-q", "-m", "ship knowledge")
  return { repoPath, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

const invariantsOf = (v: { data?: unknown }): PackInvariant[] =>
  (v.data as { pack?: { invariants?: PackInvariant[] } } | undefined)?.pack?.invariants ?? []

let live: Poisoned | undefined
afterEach(() => {
  live?.cleanup()
  live = undefined
})

describe("the durable projection is DERIVED state — a COMMITTED one is not knowledge", () => {
  it("the fixture really is committed, and really does pass every INTEGRITY check the store applies", () => {
    live = poisonedRepo()
    const tracked = execFileSync("git", ["-C", live.repoPath, "ls-files", ".atlas"], { encoding: "utf8" })
      .trim()
      .split("\n")
    // `.gitignore` denied these paths and `-f` landed them anyway: the premise of the whole suite.
    expect(tracked).toContain(".atlas/projection.json")
    expect(tracked.some((p) => p.startsWith(".atlas/cas/"))).toBe(true)
  })

  it("a committed projection is SERVED, NARROWED — the forged, witness-less row never comes back, but the store is not blanket-refused", () => {
    live = poisonedRepo()
    const verdict = composeRuntime(live.repoPath).handler.handle("atlas-query", {
      scope: "src/app.ts",
      by: "scope",
    })
    // AMENDED 2026-08-02 with the legible-read-refusal work (`ok:false` + a NAMED reason, never a silent
    // empty pack): this repo commits ONLY `projection`+`cas`, never `staging`, so under TRAVEL-BY-REPROOF
    // (2026-08-18) it is `tracked-provable`, not `tracked-staging` — the query SUCCEEDS (`ok:true`), served
    // through the re-proof filter rather than refused outright. The forged row carries no `seal`/`witness`
    // at all (hand-authored, no door involved), so it is OUT OF SCOPE for the re-proven bucket and is
    // dropped — the property this suite exists to prove (a forged fact is never served) still holds, on a
    // NARROWER mechanism: trust moved from "was this store committed" to "does this fact re-prove".
    expect(verdict.ok).toBe(true)
    expect(invariantsOf(verdict).map((i) => i.claim)).not.toContain(FORGED_CLAIM)
  })

  // THE POSITIVE CONTROL, and it is not optional. "Nothing is served" is trivially achievable by breaking
  // the read path, and a provenance check that simply emptied every store would pass the test above. This
  // asserts the OTHER side of the discrimination: byte-for-byte the SAME hand-written store, in the SAME
  // repo shape, differing ONLY in whether `git add -f` ran, must still be served. The check must separate
  // the two populations, not collapse them.
  //
  // (A methodological note that cost a measurement: the first version of this control used a repo with NO
  // COMMIT AT ALL, and the pack came back empty for a reason unrelated to provenance — no HEAD. It would
  // have "passed" both before and after the fix while proving nothing. The control below always commits;
  // only the `-f` on `.atlas` varies.)
  it("CONTROL: the identical store, NOT committed, is still served — the check discriminates", () => {
    live = poisonedRepo({ commitAtlas: false })
    const verdict = composeRuntime(live.repoPath).handler.handle("atlas-query", {
      scope: "src/app.ts",
      by: "scope",
    })
    expect(verdict.ok).toBe(true)
    expect(invariantsOf(verdict).map((i) => i.claim)).toContain(FORGED_CLAIM)
  })

  it("the choke point: a committed projection does not LOAD, so no read mode can serve it", () => {
    live = poisonedRepo()
    const casPath = join(live.repoPath, ".atlas", "cas")
    // The seam the composition root injects, over the real repo.
    const guarded = createDiskStore(casPath, undefined, gitSidecarTrust(live.repoPath))
    expect(rehydrateProjection(guarded)).toEqual(emptyStore())
    // …and it really is the PROVENANCE seam doing it: the same store WITHOUT the seam still loads the rows,
    // so this is not an unreadable file, a bad path, or a shape rejection.
    expect(currentNodes(rehydrateProjection(createDiskStore(casPath))).length).toBe(2)
  })

  it("a write over a committed store REFUSES rather than laundering it into door output", () => {
    live = poisonedRepo()
    const guarded = createDiskStore(join(live.repoPath, ".atlas", "cas"), undefined, gitSidecarTrust(live.repoPath))
    // Overwriting would replace the attacker's file with one this process wrote — the rows would become
    // indistinguishable from door output and the tracked-file evidence would be gone. So: a visible refusal.
    const result = guarded.commitProjection(() => ({ out: "wrote", next: emptyStore() }))
    expect(result).toEqual({ settled: false, refusal: "untrusted" })
    // DISCRIMINANT, not a substring: `untrusted` must not be reported as `unreadable` (a storage fault that
    // sends an operator to fsck) nor as `contended` (a transient the caller is invited to retry).
    expect(result.settled === false && result.refusal).toBe("untrusted")
  })

  it("the unconditional persist refuses too, and says what to do about it", () => {
    live = poisonedRepo()
    const guarded = createDiskStore(join(live.repoPath, ".atlas", "cas"), undefined, gitSidecarTrust(live.repoPath))
    expect(() => guarded.persistProjection(emptyStore())).toThrow(/TRACKED BY GIT/)
  })
})
