// @atlas/cli — test/mine-contention.test.ts  (CLI-4h — concurrent mine passes do not clobber each other)
//
// `buildControllerDeps` used to read staging with `loadStaging() ?? emptyStore()` ONCE at pass start and
// write it back with `persistStaging(projection)` after every site. `persistStaging` is atomic, so there was
// no torn read and no annihilation — but it is UNCONDITIONAL, and therefore LAST-WRITER-WINS BY DEFINITION
// (store.ts says exactly that of it). Two `atlas mine` passes running at once each rehydrate the same
// snapshot, each compute a whole-Map replacement of it, and the second publish erases the first pass's
// candidates. Every pass still exits 0 and still reports the candidates it "seeded".
//
// The fix is `commitStaging`: the WHOLE pass body becomes a pure `decide(staged) => {out, next}` that is
// RE-RUN from scratch against the new snapshot whenever the compare-and-swap is lost, and `settled: false`
// becomes a VISIBLE refusal rather than a silent no-op.
//
// THE ONLY HONEST SHAPE IS REAL PROCESSES. `commitStaging` is a compare-and-swap over the FILESYSTEM
// (`link(2)`); a single-threaded double serialises the read-modify-write and is green either way. This
// mirrors `packages/adapter-io/test/sidecar.test.ts`'s leg-1 case (8 processes × 5 commits) one layer up,
// over the real `atlas mine` driver instead of over the primitive.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore } from "@atlas/adapter-io"
import type { CommitRefusal } from "@atlas/adapter-io"
import { buildControllerDeps, driveMinePass, runMine, StagingCommitError } from "../src/mine.js"
import {
  FRONTIER,
  REPO,
  budget,
  depsOf,
  factFor,
  readStaging,
  refusingStagingFake,
  stagingFake,
} from "./mine-fixtures.js"
import { anchorsOf, minePass } from "./mine-contention-fixtures.js"

let dir: string | undefined
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-mine-contention-"))
})
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

const casPath = (): string => join(dir!, ".atlas", "cas")

/** The durable staged set as the product's OWN reader sees it, keyed by the anchor each row carries. */
function durableAnchors(): string[] {
  const staged = readStaging(createDiskStore(casPath()))
  return [...staged.current.values()].map((n) => n.primaryAnchor ?? `<no anchor: ${n.nodeKey}>`).sort()
}

describe("CLI-4h — concurrent mine passes: what a pass REPORTS seeded is what is durably staged", () => {
  it("8 concurrent PROCESSES × 5 sites ⇒ every reported candidate survives (no last-writer-wins)", async () => {
    const W = 8
    const K = 5
    // RED against `loadStaging() ?? emptyStore()` + `persistStaging`: each pass republishes a whole-Map
    // replacement derived from the snapshot it read at ITS pass start, so a pass that finishes second
    // deletes the rows of every pass that finished after it started. Measured on this box before the fix.
    //
    // THE ASSERTION IS SET EQUALITY BETWEEN WHAT THE PASSES PROMISED AND WHAT IS ON DISK, not a fixed count.
    // A count is satisfied by the right NUMBER of wrong rows; this catches any pass told it seeded a
    // candidate whose row is absent — which IS the lost update. And it is not load-dependent: a `contended`
    // refusal is a legitimate, VISIBLE outcome, so a refused pass is asserted to be honest (incomplete, and
    // its rows absent) rather than asserted never to happen.
    const reports = await Promise.all(Array.from({ length: W }, (_, i) => minePass(casPath(), i, K)))
    for (const [i, r] of reports.entries()) expect(r.crashed, `writer ${i} crashed: ${r.crashed}`).toBeUndefined()

    const promised = reports.flatMap((r) => r.seeded).sort()
    expect(durableAnchors()).toEqual(promised) // promised ≡ durable, exactly, in BOTH directions

    // LIVENESS FLOOR, stated as a floor: at this width the sidecar protocol measures 0% exhaustion, so a run
    // where most passes are refused means progress stopped even though every individual answer stayed honest.
    const completed = reports.filter((r) => r.complete).length
    expect(completed).toBeGreaterThanOrEqual(Math.ceil(W * 0.75))
    // and a pass that DID complete must have staged its whole frontier — nothing silently dropped.
    for (const [i, r] of reports.entries()) {
      if (r.complete) expect(durableAnchors()).toEqual(expect.arrayContaining(anchorsOf(i, K)))
    }
  }, 180_000)

  it("a pass that runs ALONE against a store another pass already filled preserves both sets", async () => {
    // The single-writer half of the same property, deterministic and fast: sequential passes are additive.
    // This is the case last-writer-wins already handled (the pass rehydrates), and it is here so that a fix
    // which achieved atomicity by REFUSING to build on prior state would be caught rather than celebrated.
    const K = 4
    const first = await minePass(casPath(), 0, K)
    const second = await minePass(casPath(), 1, K)
    expect(first.crashed).toBeUndefined()
    expect(second.crashed).toBeUndefined()
    expect(durableAnchors()).toEqual([...anchorsOf(0, K), ...anchorsOf(1, K)].sort())
  }, 120_000)
})

// ── the `settled: false` leg ───────────────────────────────────────────────────────────────────────────
//
// `commitStaging` can decline to settle: `contended` (the sidecar advanced under this pass more times than
// the protocol retries) or `unreadable` (a staging file exists but no generation parses). BOTH mean NOTHING
// WAS WRITTEN. Adopting the seam and then mapping that to a quiet return would have re-created, one layer
// up, the exact silent loss the protocol was built to remove — so the refusal is asserted at all three
// places it has to be visible: the port throws, the pass carries the cause, the CLI prints it and exits 1.
//
// NOT RED-ABLE AT 55d826a, and said plainly rather than dressed up: at that commit `mine` never called
// `commitStaging`, so there was no refusal to swallow. The teeth are the DISCRIMINANT instead — asserted on
// `StagingCommitError.refusal` and on the verdict's exit code, never on a substring of the prose.
describe("CLI-4h — a staging commit that does not settle is a VISIBLE refusal, never a quiet no-op", () => {
  const refusals: CommitRefusal[] = ["contended", "unreadable"]

  for (const refusal of refusals) {
    it(`the upsert port THROWS \`${refusal}\` rather than reporting a successful pass`, () => {
      const seen: CommitRefusal[] = []
      const ports = buildControllerDeps(REPO, depsOf({ store: refusingStagingFake(refusal) }), (r) => void seen.push(r))
      let caught: unknown
      try {
        ports.upsert([factFor({ site: FRONTIER[0]! } as never, "a mined claim")])
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(StagingCommitError)
      expect((caught as StagingCommitError).refusal).toBe(refusal) // DISCRIMINANT, not a message substring
      expect(seen).toEqual([refusal]) //                             and the cause reached the pass, not just the stack
    })

    it(`\`atlas mine\` exits non-zero and NAMES \`${refusal}\` on stdout`, async () => {
      const deps = depsOf({ store: refusingStagingFake(refusal), budget: budget(FRONTIER.length) })
      const pass = driveMinePass(REPO, deps)
      expect(pass.refusal).toBe(refusal)
      expect(pass.report.resumeToken).toBeDefined() // the controller saw an interruption (GEN-8c), not a finish
      expect(pass.report.seeded).toEqual([]) //        and nothing is claimed as seeded

      const v = await runMine(REPO, deps)
      expect(v.exitCode).toBe(1) // a refused write is NEVER a success exit
      expect(v.stdout).toContain(`staging: REFUSED (${refusal})`)
    })
  }

  // The property the ESTABLISHED rewrite could plausibly have broken, and which had NO standing test. The old
  // code snapshotted the staged key set ONCE at pass start precisely so a pass could still make a SECOND claim
  // about a symbol it had just written (testing against the running projection made that second claim vanish).
  // `commitStaging` re-reads the snapshot on every attempt, so the pass's own rows ARE in it — the exclusion
  // moved to `grounded`/`minted`. Pinned here so the regression cannot come back through the new door.
  it("a pass can still make a SECOND claim about a symbol it just staged (set-union, not a silent drop)", () => {
    const fx = stagingFake()
    const ports = buildControllerDeps(REPO, depsOf({ store: fx.store }))
    const site = { site: FRONTIER[0]! } as never
    ports.upsert([factFor(site, "the first claim")])
    ports.upsert([factFor(site, "the second claim about the same symbol")])

    const last = fx.staged[fx.staged.length - 1]!
    expect(last.current.size).toBe(1) // one node — both claims land at the same minted nodeKey
    const node = [...last.current.values()][0]!
    expect(node.claims).toEqual(["the first claim", "the second claim about the same symbol"])
  })

  it("a refused pass hands off to born-from-work NOT AT ALL (an unfinished run is not a finished one)", () => {
    let handoffs = 0
    const deps = depsOf({
      store: refusingStagingFake("contended"),
      budget: budget(FRONTIER.length),
      handoffTo: () => void (handoffs += 1),
    })
    driveMinePass(REPO, deps)
    expect(handoffs).toBe(0)
  })

  it("REAL DISK: a corrupt staging sidecar refuses `unreadable` and destroys nothing", () => {
    // The fake above proves the DRIVER maps `settled:false` correctly; it says nothing about whether that
    // outcome is reachable in production. This runs the real `createDiskStore`, so the refusal comes from the
    // protocol itself. It is also leg 2 of the sidecar story one layer up: before `guardUnreadable`, a
    // corrupt file read as `emptyStore()` and the next pass republished staging with only its own rows.
    const store = createDiskStore(casPath())
    driveMinePass(REPO, depsOf({ store, budget: budget(FRONTIER.length) }))
    const dotAtlas = join(dir!, ".atlas")
    const staging = readdirSync(dotAtlas).filter((n) => n.startsWith("staging"))
    expect(staging.length).toBeGreaterThan(0) // premise: a real staging sidecar exists to corrupt
    for (const n of staging) writeFileSync(join(dotAtlas, n), '{ "current": [ truncated', "utf8")

    const pass = driveMinePass(REPO, depsOf({ store: createDiskStore(casPath()), budget: budget(FRONTIER.length) }))
    expect(pass.refusal).toBe("unreadable")
    expect(pass.report.resumeToken).toBeDefined()
    // and not one byte was rewritten — a refusal that "repaired" the file would be a silent erasure.
    expect(
      readdirSync(dotAtlas)
        .filter((n) => n.startsWith("staging"))
        .sort(),
    ).toEqual(staging.sort())
    for (const n of staging) expect(readFileSync(join(dotAtlas, n), "utf8")).toBe('{ "current": [ truncated')
  })
})
