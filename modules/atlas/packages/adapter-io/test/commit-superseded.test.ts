// @atlas/adapter-io — test/commit-superseded.test.ts  (a PUBLISHED generation that was built upon is NOT a loss)
//
// THE DEFECT, traced not reasoned. `publish` returned one bit — "did my generation become the head?" — and
// the commit loop read that bit as "are my bytes durable?". Those are different questions, and they part
// company in one specific interleaving: our `link(2)` wins the name, and before our `readdir` a rival
// publishes ABOVE us. Our bytes ARE durable (a writer can only target head+1, so the generation above ours
// read ours and built on it), but `publish` said "lost" and the loop re-ran the whole decision. The re-run
// then saw a snapshot CONTAINING this call's own rows and reported an `out` that disowned them.
//
// MEASURED on the real `atlas mine` driver, 8 processes × 5 sites, with the loop instrumented (round 2 of 3,
// no artificial load):
//
//     decide  attempt 1  top 22  → out [d9233b04…]  next 23
//     link-won   gen 23  (23 rows)                       ← THE BYTES ARE ON DISK
//     head-moved gen 23  headNow 24                      ← a rival published ON TOP of generation 23
//     decide  attempt 2  top 24  staged 24 → out []      ← the re-run cannot see that it wrote
//     decide  attempt 3  top 25  staged 25 → out []
//     settled attempt 3  gen 26  out []
//
//   ⇒ 40 rows durable, 39 reported seeded. `pkg/w5-s3.ts::w5-s3` was on disk and its own writer denied it.
//
// It is an HONESTY defect, not a data-loss one, and that is why it survived: the store is right and only the
// report is wrong. `next` was idempotent across the re-run — which is exactly what the comment this replaces
// asserted ("a wasted round, never a wrong answer"). `out` was not, and nothing required it to be.
//
// EVERY CASE HERE IS DETERMINISTIC, and the rival is a plain file. `decide` runs between the read and the
// link, so a rival generation written from inside it is on disk before the head verification looks — the
// same DISK STATE the traced race produces at the only moment the code inspects it. What a fixture must not
// fudge is WHICH state it builds, so the two shapes are built differently, exactly as reality distinguishes
// them: a rival that BUILT ON US carries our row; a rival chain that never saw us does not.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { emptyStore } from "@atlas/knowledge"
import type { CurrentNode, StoreProjection } from "@atlas/knowledge"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { genPath, readSidecarSet } from "../src/sidecar.js"
import type { CommitDecision, CommitResult, SidecarBase, SidecarCtx } from "../src/sidecar.js"
import { IDENTITY_SCHEMA } from "../src/identity-schema.js"
import { commitSidecar } from "../src/sidecar-commit.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { HOLDS_GATE, POLICY, advisory, AT } from "./harness/governed-fixtures.js"

let tmp: string | undefined
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-superseded-"))
})
afterEach(() => {
  if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

const casDir = (): string => join(tmp!, "cas")
const row = (key: string): [string, CurrentNode] => [
  key,
  { nodeKey: key, family: "advisory", contentHash: "a".repeat(64), claims: [`claim ${key}`] } as unknown as CurrentNode,
]
const withRow = (p: StoreProjection, key: string): StoreProjection => ({
  current: new Map([...p.current, row(key)]),
  cas: new Set(p.cas),
})
/** The durable node set as the product's OWN reader sees it (highest readable generation, then the mirror). */
const durable = (): string[] =>
  [...(readSidecarSet(tmp!, "projection").projection ?? emptyStore()).current.keys()].sort()

/** A RIVAL WRITER, as a file. Publishing IS writing `<base>.<gen>.json` — no other writer state is durable,
 *  so a rival a test builds by hand is indistinguishable from one that ran. That is the only way to reach
 *  this branch on demand: no in-process double can interpose between the `link(2)` and the `readdir`.
 *
 *  `identity` ADDED with the #112 identity stamp, and it is what KEEPS the sentence above true. A rival is by
 *  definition another instance of THIS build, so it stamps the schema it minted its hashes under; a rival
 *  without the stamp is one no Atlas could be, and the store now (correctly) refuses to publish over it. The
 *  fixture is more faithful for the addition, and no expectation below changed. */
function rivalPublishes(base: SidecarBase, gen: number, p: StoreProjection): void {
  const wire = { current: [...p.current.entries()], cas: [...p.cas], gen, identity: IDENTITY_SCHEMA }
  writeFileSync(genPath(tmp!, base, gen), JSON.stringify(wire), "utf8")
}

describe("COMMIT PROTOCOL — a generation that was published and then BUILT UPON is durable, and says so", () => {
  it("the attempt that PUBLISHED is the one reported — it is not re-run into disowning its own rows", () => {
    // THE REGRESSION, in the smallest decision that can show it: one whose `out` depends on whether the row
    // was already there. Not a contrived shape — it IS `mine`'s pass body, which skips a key it finds
    // already staged (a mined candidate never re-authors an established one, ADR-0008) and therefore mints
    // nothing when re-run over its own durable write.
    //
    // RED at 57d6129, deterministically, every run (verbatim):
    //   AssertionError: expected { settled: true, …(1) } to deeply equal { settled: true, out: 'wrote' }
    //   - Expected  + Received
    //     Object {
    //   -   "out": "wrote",
    //   +   "out": "skipped — already established",
    //       "settled": true,
    //     }
    // with `durable()` containing 'victim' the whole time: the row on disk, disowned by the call that wrote it.
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "base") })) // generation 1
    let attempts = 0
    const r = store.commitProjection<string>((p) => {
      attempts += 1
      if (p.current.has("victim")) return { out: "skipped — already established", next: p }
      const next = withRow(p, "victim")
      // The rival reads OUR generation 2 and publishes generation 3 on top of it, so its content carries our
      // row. That is the only way a generation number above ours can legitimately come to exist.
      if (attempts === 1) rivalPublishes("projection", 3, withRow(next, "rival"))
      return { out: "wrote", next }
    })
    expect(r).toEqual({ settled: true, out: "wrote" })
    expect(attempts).toBe(1) //                            and the decision was not re-run AT ALL
    expect(durable()).toEqual(["base", "rival", "victim"]) // promised ≡ durable, in both directions
  })

  it("a RECYCLED name is still a loss — the whole decision re-runs, and the RE-RUN is what is reported", () => {
    // The other side of the same branch, and the case the head verification was added for: our target name
    // was already dead when we linked it, so our bytes sit below a head that never saw them. The rival chain
    // here therefore does NOT carry our row — that is what makes it a recycled name and not a successor.
    //
    // FAITHFUL TO THE ARITHMETIC THAT FREES A NAME: the prune reclaims `g` only from a winner at
    // `g + RETAINED_GENERATIONS`, so the LOWEST head at which our target name 2 can be free is 6. Publishing
    // 3,4,5,6 is the cheapest disk state that can honestly be called recycled — below that, name 2 would
    // still be on disk and our `link` would have hit EEXIST instead.
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "base") })) // generation 1
    let attempts = 0
    const r = store.commitProjection<string>((p) => {
      attempts += 1
      if (p.current.has("victim")) return { out: "skipped — already established", next: p }
      const next = withRow(p, "victim")
      if (attempts === 1) {
        let chain = p
        for (const g of [3, 4, 5, 6]) rivalPublishes("projection", g, (chain = withRow(chain, `rival-${g}`)))
      }
      return { out: "wrote", next }
    })
    // The re-run IS the honest answer here: nothing attempt 1 wrote is readable, so attempt 2 re-mints and
    // reports what attempt 2 wrote. Reported ≡ durable, again in both directions.
    expect(attempts).toBe(2)
    expect(r).toEqual({ settled: true, out: "wrote" })
    expect(durable()).toContain("victim")
    expect(durable()).toContain("rival-6") // and nothing the rival wrote was rolled back
  })

  it("the line is drawn EXACTLY at the retained window — head 5 is a successor, head 6 cannot be proven one", () => {
    // The two cases above differ in what they MEAN; this one pins the line the code draws between them, so
    // the bound cannot drift away from the prune that justifies it. Target name is 2, so the bound is
    // 2 + RETAINED_GENERATIONS = 6.
    //
    // READ THE SECOND HALF FOR WHAT IT IS. Both halves build a chain that CARRIES our row, so at head 6 the
    // fixture is a state reality cannot produce (if the chain built on us, name 2 was never free to recycle).
    // It is here to force the branch where a directory listing can no longer tell a successor from a
    // recycled name, and to record what the code does there: it takes the direction that can only
    // UNDER-report, never over-report. That is the residual of this fix and it is not hidden — reaching it
    // for real needs RETAINED_GENERATIONS publications between our `link` and the `readdir` on the next line.
    // MUTANT: widen the bound to `<=` and the second half fails; remove it (never superseded) and the first.
    for (const [top, expected] of [
      [5, "wrote"], //     head 5 = the last head at which name 2 provably could NOT have been recycled
      [6, "skipped"], //   head 6 = the first head at which it could have been
    ] as const) {
      if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true })
      tmp = mkdtempSync(join(tmpdir(), "atlas-superseded-"))
      const store = createDiskStore(casDir())
      store.commitProjection((p) => ({ out: 0, next: withRow(p, "base") })) // generation 1
      let attempts = 0
      const r = store.commitProjection<string>((p) => {
        attempts += 1
        if (p.current.has("victim")) return { out: "skipped", next: p }
        const next = withRow(p, "victim")
        if (attempts === 1) {
          let chain = next
          for (let g = 3; g <= top; g++) rivalPublishes("projection", g, (chain = withRow(chain, `rival-${g}`)))
        }
        return { out: "wrote", next }
      })
      expect(r.settled && r.out).toBe(expected)
      expect(durable()).toContain("victim") // durable in BOTH halves — only the report differs
    }
  })

  it("the SUPERSEDED publisher does not push the compat mirror BACKWARDS", () => {
    // A settled publish is not a WINNING one: our bytes are no longer the head, so the winner's housekeeping
    // is not ours to do. Republishing `projection.json` from them would move the compatibility artifact to a
    // state OLDER than the head generation — a fallback that hands a reader a rolled-back store.
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "base") }))
    let attempts = 0
    store.commitProjection<string>((p) => {
      attempts += 1
      const next = withRow(p, "victim")
      if (attempts === 1) rivalPublishes("projection", 3, withRow(next, "rival"))
      return { out: "wrote", next }
    })
    // The mirror is only consulted when NO generation parses, so it is asserted through that same door.
    for (const g of [1, 2, 3]) rmSync(genPath(tmp!, "projection", g), { force: true })
    expect(durable()).toEqual(["base"]) // the last MIRROR a head publisher wrote, never the superseded one
  })

  it("a decision that writes NOTHING still settles, and no generation appears", () => {
    // The governed-refusal path is upstream of every outcome above (`next === undefined` returns before any
    // publication), so widening `publish` must not have reached it.
    const ctx: SidecarCtx = { dir: tmp!, base: "projection", headSha: undefined, put: () => undefined }
    const r = commitSidecar<string>(ctx, () => ({ out: "refused" }))
    expect(r).toEqual({ settled: true, out: "refused" })
    expect(readSidecarSet(tmp!, "projection").projection).toBeUndefined()
  })
})

// ── #108: the PROJECTION family, measured on the same rig ───────────────────────────────────────────────
//
// `mine` is not the only rider of this protocol — the governed emit door commits through `commitProjection`,
// so a fix at the protocol level has to answer whether the same phantom was reachable THERE. This is that
// answer as a measurement rather than as a reading of the door.
describe("#108 — the governed EMIT door across the same superseded publish", () => {
  it("reports emitted:true with the SAME content address, and the node is durable", () => {
    const real = createDiskStore(casDir())
    let attempts = 0
    const store: DiskStore = {
      ...real,
      commitProjection<T>(decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> {
        return real.commitProjection<T>((p) => {
          attempts += 1
          const decision = decide(p)
          // A rival publishes on top of the generation this attempt is about to link — the same shape that
          // made `mine` disown a staged row. The door's first commit targets generation 1, so the rival is 2.
          if (attempts === 1 && decision.next !== undefined)
            rivalPublishes("projection", 2, withRow(decision.next, "rival"))
          return decision
        })
      },
    }
    const { emit } = createGovernedEmit({ store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const node = advisory("core")
    const out = emit(node, AT)

    expect(out.emitted).toBe(true)
    expect(out.id).toBe(id(node as CasObject) as unknown as string)
    expect(durable()).toContain("rival") //                  the rival's generation was built upon, not clobbered
    expect(real.get(id(node as CasObject))).toBeDefined() // and the CAS bytes the row names are there
    // WHY THIS DOOR WAS NEVER PHANTOM-PRONE — as the measurement shows it, not as a reading of the source.
    // Its `out` is a function of the FINAL STATE (`emitted` + the content address), never of the DELTA this
    // attempt happened to apply, so a re-run over a snapshot already containing its own row re-derives the
    // identical verdict: `incumbentRefusal` compares the row against its own bytes (same scope ⇒ no
    // relocation, same tier ⇒ no downgrade), `route`/`ratify` read the candidate and not the projection, and
    // `upsert` is idempotent. `mine`'s pass body is the opposite BY CONSTRUCTION: it has an explicit
    // `continue` for a key already present, so its `out` is a delta and a re-run shrinks it to nothing.
    // Final-state `out` vs delta `out` is the whole of why staging was phantom-prone and this family was
    // not — and it is also why the fix belongs in the protocol rather than in `mine`: nothing stops the next
    // decision written against this seam from being a delta too.
    expect(attempts).toBe(1) // the door published once and was told so once
  })
})
