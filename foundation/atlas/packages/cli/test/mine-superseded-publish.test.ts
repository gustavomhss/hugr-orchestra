// @atlas/cli — test/mine-superseded-publish.test.ts  (CLI-4h — a pass never disowns a candidate it staged)
//
// `mine-contention.test.ts` holds the property — what a pass REPORTS seeded IS what is durably staged — with
// eight real processes. That is the right shape for the property and the WRONG shape for a regression gate:
// the interleaving that broke it appeared in roughly one run in three and needed no artificial load at all.
// This file forces that interleaving instead, so the gate fails 100% of the time on the old code.
//
// THE INTERLEAVING, traced off the real 8×5 race with the commit loop instrumented (writer w5, one pass):
//
//     decide  attempt 1  top 22  → out [d9233b04…]  next 23
//     link-won   gen 23  (23 rows)                       ← the rows for site 3 ARE on disk
//     head-moved gen 23  headNow 24                      ← a rival published generation 24 ON TOP of ours
//     decide  attempt 2  top 24  staged 24 → out []      ← the re-run finds its own row already staged…
//     decide  attempt 3  top 25  staged 25 → out []      ← …and `decide` SKIPS an established key (ADR-0008)
//     settled attempt 3  gen 26  out []
//
// `upsert` folds `out` into the grounded set, and the grounded set IS `GenesisReport.seeded`, so site 3 never
// entered the report. That run ended 40 rows durable / 39 promised. The lead's observation was 40 / 37 — the
// same shape, three sites deep instead of one.
//
// THE DEFECT IS NOT IN `mine`, AND THAT IS THE POINT of testing it here as well as at the protocol. `decide`
// is exactly as written: a candidate that finds its key already staged must not re-author it. What was wrong
// is that the protocol told a pass it had lost a race it had actually won, so the re-run met its OWN durable
// rows and could not tell them from a stranger's. The pass body needs no change; it needs to be told the
// truth. Both halves are asserted below — the report AND the disk — because either alone is satisfied by the
// wrong fix (dropping the skip would make the report right by re-authoring an established row).

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createDiskStore, IDENTITY_SCHEMA } from "@atlas/adapter-io"
import type { CommitDecision, CommitResult, DiskStore } from "@atlas/adapter-io"
import type { StoreProjection } from "@atlas/knowledge"
import type { Fact } from "@atlas/genesis"
import { buildControllerDeps } from "../src/mine.js"
import { A, B, REPO, depsOf, factFor, readStaging } from "./mine-fixtures.js"

let dir: string | undefined
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-mine-superseded-"))
})
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

const casPath = (): string => join(dir!, ".atlas", "cas")

/** The durable staged set as the product's OWN reader sees it, keyed by the anchor each row carries — the
 *  same projection `mine-contention.test.ts` compares against, so the two suites cannot drift. */
function durableAnchors(): string[] {
  const staged = readStaging(createDiskStore(casPath()))
  return [...staged.current.values()].map((n) => n.primaryAnchor ?? `<no anchor: ${n.nodeKey}>`).sort()
}

/**
 * A REAL `createDiskStore` whose staging commit has a rival publishing ON TOP of the generation the first
 * attempt is about to link.
 *
 * The rival is a plain file, because publishing IS writing `<base>.<gen>.json` and nothing else about a
 * writer is durable. It is written from inside `decide`, which runs between the protocol's read and its
 * `link(2)` — no in-process double can interpose any later, and the disk state at the head verification (our
 * generation linked, a higher one carrying our rows) is the same state the traced race produces at the only
 * moment the code inspects it. Its CONTENT is the honest half: a generation above ours can only exist
 * because its writer read ours, so it carries our rows.
 */
function storeWithRivalOnFirstCommit(): DiskStore {
  const real = createDiskStore(casPath())
  const sidecarDir = dirname(casPath())
  let commits = 0
  return {
    ...real,
    commitStaging<T>(decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> {
      return real.commitStaging<T>((staged) => {
        const decision = decide(staged)
        commits += 1
        if (commits === 1 && decision.next !== undefined) {
          // Our first commit targets generation 1 over an empty sidecar, so the rival is generation 2.
          // `identity` (#112) is what keeps this a FAITHFUL rival: a rival is by definition another instance
          // of THIS build, so it stamps the identity schema it minted its hashes under. Without the stamp it
          // is a store no Atlas could have written, and the commit protocol correctly refuses to publish over
          // it — the pass would then fail for a reason that has nothing to do with the law under test.
          const wire = {
            current: [...decision.next.current.entries()],
            cas: [...decision.next.cas],
            gen: 2,
            identity: IDENTITY_SCHEMA,
          }
          mkdirSync(sidecarDir, { recursive: true }) // the protocol creates it in `publish`, one step later
          writeFileSync(join(sidecarDir, "staging.2.json"), JSON.stringify(wire), "utf8")
        }
        return decision
      })
    },
  }
}

describe("CLI-4h — a mine pass reports the candidates it staged even when a rival built on its generation", () => {
  it("the pass that PUBLISHED reports its candidate — the row is durable AND promised", () => {
    // RED at 57d6129, deterministically, every run (verbatim):
    //   AssertionError: expected [] to deeply equal [ 'pkg/st-a10.ts::st-a10' ]
    //   - Expected  + Received
    //   - Array [
    //   -   "pkg/st-a10.ts::st-a10",
    //   - ]
    //   + Array []
    // — with `durableAnchors()` returning `[ 'pkg/st-a10.ts::st-a10' ]` in the SAME run. That gap is the
    // whole defect: one row on disk, zero rows claimed, and the pass exiting 0.
    const ports = buildControllerDeps(REPO, depsOf({ store: storeWithRivalOnFirstCommit() }))
    const grounded = ports.upsert([factFor({ site: A } as never, "a mined claim about st-a10")])

    const promised = grounded.map(anchorOf).sort()
    expect(promised).toEqual(["pkg/st-a10.ts::st-a10"]) // the pass claims the candidate it wrote…
    expect(durableAnchors()).toEqual(promised) //          …and promised ≡ durable, in both directions
  })

  it("a SECOND site through the same pass is still additive — the rival generation was built on, not clobbered", () => {
    // The fix must not settle by throwing away the snapshot it raced against: the rival's generation is the
    // one the retry-free path builds on, so both rows have to be there afterwards. (A "fix" that made the
    // pass republish its own attempt-1 projection unconditionally would pass the case above and fail here.)
    const ports = buildControllerDeps(REPO, depsOf({ store: storeWithRivalOnFirstCommit() }))
    ports.upsert([factFor({ site: A } as never, "a mined claim about st-a10")])
    const grounded = ports.upsert([factFor({ site: B } as never, "a mined claim about st-b22")])

    const promised = grounded.map(anchorOf).sort()
    expect(promised).toEqual(["pkg/st-a10.ts::st-a10", "pkg/st-b22.ts::st-b22"])
    expect(durableAnchors()).toEqual(promised)
  })
})

/** The anchor a grounded fact carries — the same value `primaryAnchorId` reduces to, so the report and the
 *  durable row are compared on ONE identity rather than on two that happen to agree. */
function anchorOf(f: Fact): string {
  return (f as unknown as { grounding: { entries: { anchor: { qualifiedPath: string } }[] } }).grounding.entries[0]!
    .anchor.qualifiedPath
}
