// @atlas/adapter-io — test/sidecar.test.ts  (the DURABLE SIDECAR: atomicity under real concurrency)
//
// Every case here was RED against the pre-fix `writeFileSync(path, JSON.stringify(wire))` — verified by
// reverting `sidecar.ts` to the in-place write and watching them fail, one by one, with the numbers quoted
// in each case. They are the standing proof that the two measured legs cannot come back:
//
//   LEG 1 (lost update)  — 8 real `atlas emit` subprocesses over a 1000-node store lost 1–5 nodes in 6/6
//                          trials, every writer exiting 0 with `status: ok`. Pinned here by REAL child
//                          processes (`node -e`), because the defect does not exist in one process: a
//                          single-threaded fake serialises the read-modify-write and is always green.
//   LEG 2 (annihilation) — one emit onto a torn 402-node sidecar left 1 node, reported `status: ok`.
//                          Pinned by the corruption cases at the bottom.
//
// The concurrency cases spawn N processes that each commit K rows into ONE store. That is the only honest
// shape: `commitSidecar` is a compare-and-swap over the FILESYSTEM, and a mock cannot fail a `link(2)`.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { emptyStore } from "@atlas/knowledge"
import type { CurrentNode, StoreProjection } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import { readSidecarSet } from "../src/sidecar.js"
import { commitSidecar } from "../src/sidecar-commit.js"
import { IDENTITY_SCHEMA, IdentitySchemaError } from "../src/identity-schema.js"

let tmp: string | undefined
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-sidecar-"))
})
afterEach(() => {
  if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

const casDir = (): string => join(tmp!, "cas")
// Typed as `[string, CurrentNode]` rather than as the structural literal it happens to be: `new Map([...p.current,
// row(key)])` below infers its overload from the array's element type, so a narrower row type makes the array a
// UNION and the Map construction stops type-checking the moment `CurrentNode` grows a field (task #83's
// `sameAsRetracted` is what surfaced it). Naming the real type makes the fixture independent of that.
const row = (key: string): [string, CurrentNode] => [
  key,
  { nodeKey: key, family: "advisory", contentHash: "a".repeat(64), claims: [`claim ${key}`] },
]
const withRow = (p: StoreProjection, key: string): StoreProjection => ({
  current: new Map([...p.current, row(key)]),
  cas: new Set(p.cas),
})
/** The durable node set as the product's own reader sees it. */
const durable = (): string[] =>
  [...(readSidecarSet(tmp!, "projection").projection ?? emptyStore()).current.keys()].sort()

/** The SUT compiled to dist — child processes cannot import the .ts source. */
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "src", "store.js")

/** What one child process reports back: the keys it was TOLD were committed, and the keys it was REFUSED. */
interface WriterReport {
  readonly committed: string[]
  readonly refused: string[]
}

/** One child process that commits `k` rows tagged `w<i>` into the store at `casDir()`. Real OS-level
 *  concurrency; every child runs the SAME read-modify-write the governed doors run, and REPORTS what the
 *  protocol told it — which is the only thing the assertions below are allowed to trust. */
function writer(i: number, k: number): Promise<WriterReport> {
  const src = `
    import { createDiskStore } from ${JSON.stringify(DIST)};
    const store = createDiskStore(${JSON.stringify(casDir())});
    const committed = [], refused = [];
    for (let j = 0; j < ${k}; j++) {
      const key = 'w${i}-' + j;
      const r = store.commitProjection((p) => ({
        out: true,
        next: { current: new Map([...p.current, [key, { nodeKey: key, family: 'advisory', contentHash: 'a'.repeat(64), claims: [key] }]]), cas: new Set(p.cas) },
      }));
      (r.settled ? committed : refused).push(key);
    }
    console.log(JSON.stringify({ committed, refused }));
  `
  return new Promise((resolve) => {
    let out = ""
    const child = spawn(process.execPath, ["--input-type=module", "-e", src], { stdio: ["ignore", "pipe", "inherit"] })
    child.stdout.on("data", (d) => {
      out += String(d)
    })
    child.on("close", () => resolve(JSON.parse(out.trim() || '{"committed":[],"refused":[]}') as WriterReport))
  })
}

describe("SIDECAR — the generation-CAS commit protocol", () => {
  it("LEG 1 (REGRESSION): 8 concurrent PROCESSES × 5 commits ⇒ what was REPORTED committed IS durable", async () => {
    const W = 8
    const K = 5
    // MEASURED RED against the in-place `writeFileSync` this replaced: 8 real `atlas emit` subprocesses over
    // a 1000-node store lost 1–5 nodes in 6/6 trials, and against `rename`-instead-of-`link` this same case
    // lands 15 of 40 rows — while EVERY child still reports success. That is the defect: silent.
    //
    // THE ASSERTION IS SET EQUALITY BETWEEN WHAT THE PROTOCOL PROMISED AND WHAT IS ON DISK, not a fixed
    // count, and the difference matters twice over. It is STRONGER: a fixed count is satisfied by a store
    // holding the right NUMBER of wrong rows, while this catches any writer told `settled:true` whose row is
    // absent — which is exactly the recycled-generation defect the head verification closes, and exactly the
    // original lost update. And it is not LOAD-DEPENDENT: `contended` is a legitimate, VISIBLE outcome under
    // enough pressure, so asserting "nobody was ever refused" would make a liveness accident look like a
    // correctness failure. Refusals are asserted to be honest instead — reported, and absent from disk.
    const reports = await Promise.all(Array.from({ length: W }, (_, i) => writer(i, K)))
    const committed = reports.flatMap((r) => r.committed).sort()
    const refused = reports.flatMap((r) => r.refused).sort()
    expect(committed.length + refused.length).toBe(W * K) // every attempt returned a verdict, none vanished
    expect(durable()).toEqual(committed) //                  promised ≡ durable, exactly, in both directions
    for (const key of refused) expect(durable()).not.toContain(key) // a refusal really did write nothing
    // LIVENESS FLOOR, stated as a floor because it is one: at this width the measured exhaustion rate is 0%
    // over 800 commits, so a run where most writers are refused means the protocol has stopped making
    // progress even though every individual answer is still honest.
    expect(committed.length).toBeGreaterThanOrEqual(W * K * 0.9)
  }, 120_000)

  it("a published generation is IMMUTABLE — the file a reader already opened is never rewritten", () => {
    // THE property that kills leg 2 at the source: publication happens by `link(2)` onto a NEW name, never by
    // truncating the live inode, so no reader can observe a prefix of the next state. MUTANT: restore the
    // in-place `writeFileSync` and the identity below fails (same path, new bytes, new mtime, same inode).
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "first") }))
    const gen1 = join(tmp!, "projection.1.json")
    const before = { bytes: readFileSync(gen1, "utf8"), ino: statSync(gen1).ino }
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "second") }))
    expect(readFileSync(gen1, "utf8")).toBe(before.bytes) // byte-identical
    expect(statSync(gen1).ino).toBe(before.ino) //           and the same inode — nothing was rewritten
    expect(durable()).toEqual(["first", "second"])
  })

  it("a governed REFUSAL (no `next`) writes nothing at all — no temp, no generation, no mirror", () => {
    const store = createDiskStore(casDir())
    const r = store.commitProjection(() => ({ out: "refused" }))
    expect(r).toEqual({ settled: true, out: "refused" })
    expect(existsSync(tmp!) ? readdirSync(tmp!) : []).not.toContain("projection.1.json")
    expect(existsSync(join(tmp!, "projection.json"))).toBe(false)
  })

  it("a NO-OP decision (returns the snapshot it read, unchanged) settles WITHOUT publishing a redundant generation", () => {
    // PERF (mine abstain fsync-churn): `decideStaging` returns the rehydrated snapshot UNTOUCHED on an
    // abstaining site — the majority on a real repo. Republishing it costs a whole serialize + two fsyncs to
    // write bytes byte-identical to the head. The commit still SETTLES (the republish-on-abstain contract
    // lives one layer up, in the decision's `next: projection`); only the physical, redundant publish is
    // elided. Here the fake decision returns the exact object it was handed (`(p) => ({ next: p })`), which is
    // the reference-identity signal the fast path keys on.
    const gens = (): string[] =>
      (existsSync(tmp!) ? readdirSync(tmp!) : []).filter((f) => /^projection\.\d+\.json$/.test(f)).sort()
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "first") })) // a real mint ⇒ generation 1
    expect(gens()).toEqual(["projection.1.json"])
    expect(durable()).toEqual(["first"])

    const r = store.commitProjection((p) => ({ out: "noop", next: p })) // NO-OP: snapshot returned unchanged
    expect(r).toEqual({ settled: true, out: "noop" }) // it SETTLES (the abstain succeeds)…
    expect(gens()).toEqual(["projection.1.json"]) //     …but NO generation 2 was published (the fast path)
    expect(durable()).toEqual(["first"]) //              the earlier candidate is untouched and still durable

    // TEETH — the skip is scoped to a TRUE no-op, never a blanket "stop publishing": the very next MINT still
    // lands its generation. MUTANT (fast path → `return` unconditionally): this assertion goes RED (gen 2 absent,
    // 'second' not durable). MUTANT (fast path removed): the NO-OP assertions above go RED (gen 2 reappears).
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "second") }))
    expect(gens()).toEqual(["projection.1.json", "projection.2.json"])
    expect(durable()).toEqual(["first", "second"])
  })

  it("a NO-OP on a FRESH store STILL publishes the first generation (skip needs a durable head to compare)", () => {
    // The fast path compares `next` to `read.projection` (the DURABLE head), NOT to `snapshot` (which falls
    // back to a fresh `emptyStore()` when nothing is on disk). So a no-op on an EMPTY store — the very idiom
    // `(p) => ({ next: p })` callers use to MINT the first sidecar — does NOT skip: there is no head to be
    // byte-identical to, and a store with no generation at all is a different state from one holding an empty
    // one (the unreadable/corrupt-fallback paths ask exactly this). MUTANT (compare to `snapshot` instead):
    // no generation is created here, and `door-regression-commit-retry.ts`'s corrupt-sidecar cases go RED.
    const gens = (): string[] =>
      (existsSync(tmp!) ? readdirSync(tmp!) : []).filter((f) => /^projection\.\d+\.json$/.test(f)).sort()
    const store = createDiskStore(casDir())
    const r = store.commitProjection((p) => ({ out: "first-noop", next: p })) // no-op, but on an EMPTY store
    expect(r).toEqual({ settled: true, out: "first-noop" })
    expect(gens()).toEqual(["projection.1.json"]) // the initial (empty) generation IS published
  })

  it("CAS bytes are durable BEFORE the generation that references them (order is enforced by the protocol)", () => {
    // The invariant governed-emit relies on: a sidecar can never point at a contentHash whose bytes are gone.
    // A throwing `put` must therefore abort BEFORE any generation is published.
    const store = createDiskStore(casDir())
    const boom = {
      put: () => {
        throw new Error("disk full")
      },
    }
    expect(() =>
      commitSidecar({ dir: tmp!, base: "projection", headSha: undefined, put: boom.put }, (p) => ({
        out: 0,
        next: withRow(p, "x"),
        put: [{ any: "object" }],
      })),
    ).toThrow(/disk full/)
    expect(existsSync(join(tmp!, "projection.1.json"))).toBe(false)
    expect(store.loadProjection()).toBeUndefined()
  })

  it("generations are PRUNED to a bounded window (churn stays bounded; the fallback still has a target)", () => {
    const store = createDiskStore(casDir())
    for (let i = 0; i < 8; i++) store.commitProjection((p) => ({ out: 0, next: withRow(p, `k${i}`) }))
    const gens = readdirSync(tmp!)
      .filter((n) => /^projection\.\d+\.json$/.test(n))
      .sort()
    // RETAINED_GENERATIONS = 4 ⇒ the head and three predecessors. The window is a LIVENESS knob, not a
    // correctness one (see the recycled-name case below): shrinking it only costs retries.
    expect(gens).toEqual(["projection.5.json", "projection.6.json", "projection.7.json", "projection.8.json"])
    expect(durable()).toEqual(["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7"])
  })

  it("A RECYCLED generation name does NOT count as a win — the stale writer retries instead of vanishing", () => {
    // MEASURED DEFECT, found by stress and not by review: `link(2)` proves only that a NAME was free, and
    // the prune frees names. A writer preempted long enough targets a name that has already been published
    // AND reclaimed, links it, and publishes stale content far below the head — where no reader will ever
    // look, because every reader takes the maximum generation. Before the head verification in `publish`,
    // an 8-process stress reported 40 commits with 39 durable, twice in six rounds: the ORIGINAL silent
    // lost update, reintroduced by the garbage collector.
    //
    // Deterministic here: the victim's own `decide` publishes enough rival generations to push the prune
    // past the victim's target name, so the victim's `link` lands on a recycled name every time.
    const store = createDiskStore(casDir())
    const rival = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "base") }))
    let bursts = 0
    const r = store.commitProjection((p) => {
      if (bursts === 0) {
        bursts++
        for (let i = 0; i < 9; i++) rival.persistProjection(withRow(rival.loadProjection()!, `rival-${i}`))
      }
      return { out: "mine", next: withRow(p, "victim") }
    })
    // MUTANT: delete the `headNow > gen` check in `publish` and this test reports settled:true with
    // 'victim' ABSENT from the durable store — success reported over a lost write.
    expect(r).toEqual({ settled: true, out: "mine" })
    expect(durable()).toContain("victim") // it actually landed, on top of the rival's chain
    expect(durable()).toContain("rival-8") // and nothing the rival wrote was rolled back
  })

  // ── LEG 2: corruption no longer means "empty" ─────────────────────────────────────────────────────────
  it("LEG 2a (REGRESSION): a corrupt HEAD generation falls back to its predecessor — not to emptyStore", () => {
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "alpha") }))
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "beta") }))
    // exactly what a torn write used to leave behind: a PREFIX of the head generation's bytes.
    const head = join(tmp!, "projection.2.json")
    writeFileSync(head, readFileSync(head, "utf8").slice(0, 40), "utf8")
    // MUTANT: delete the `for (const g of gens)` fallback in `readSidecarSet` (read only the highest) and
    // this drops to `[]` — the pre-fix behaviour, where "corrupt" and "no knowledge" were the same value.
    expect(durable()).toEqual(["alpha"])
    // and the next write RESUMES from the predecessor and republishes ABOVE the corrupt name (never onto it).
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "gamma") }))
    expect(durable()).toEqual(["alpha", "gamma"])
    expect(readFileSync(head, "utf8").length).toBe(40) // the corrupt file is left exactly as found
  })

  it("LEG 2b (REGRESSION): when NOTHING parses, a commit REFUSES `unreadable` and writes not one byte", () => {
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "precious") }))
    const before = readdirSync(tmp!).map((n) => [n, readFileSync(join(tmp!, n), "utf8")] as const)
    for (const [n] of before) writeFileSync(join(tmp!, n), '{ "current": [ truncated', "utf8")
    // MUTANT: drop the `guardUnreadable` branch in `commitLoop` and this returns `settled:true` after
    // upserting into `emptyStore()` — the measured 402-nodes-to-1 erasure, reported as success.
    const r = store.commitProjection((p) => ({ out: "landed", next: withRow(p, "newcomer") }))
    expect(r).toEqual({ settled: false, refusal: "unreadable" })
    expect(readdirSync(tmp!).sort()).toEqual(before.map(([n]) => n).sort()) // no new generation appeared
    for (const [n] of before) expect(readFileSync(join(tmp!, n), "utf8")).toBe('{ "current": [ truncated')
  })

  it("READS stay total where WRITES fail closed — a fully corrupt store still boots to the empty projection", () => {
    // The asymmetry is deliberate and is the whole leg-2 lesson: `rehydrateProjection` runs at boot, so a
    // corrupt file may never throw or crash the bins; a WRITE may never treat that same value as "empty".
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "x") }))
    for (const n of readdirSync(tmp!)) writeFileSync(join(tmp!, n), "\x00\x01 not json", "utf8")
    expect(() => store.loadProjection()).not.toThrow()
    expect(store.loadProjection()).toBeUndefined()
  })

  it("exhaustion is a VISIBLE refusal — a decision that always loses the CAS returns `contended`", () => {
    // A writer that is beaten on every attempt (the interference publishes a fresh generation from inside
    // `decide`, i.e. between this writer's read and its link) must be TOLD, not silently dropped.
    const store = createDiskStore(casDir())
    const rival = createDiskStore(casDir())
    let n = 0
    const r = store.commitProjection((p) => {
      rival.persistProjection(withRow(p, `rival-${n++}`)) // steals the next generation name every time
      return { out: "mine", next: withRow(p, "mine") }
    })
    expect(r).toEqual({ settled: false, refusal: "contended" })
    expect(n).toBe(64) // MAX_ATTEMPTS — bounded, then a refusal; never an unbounded spin, never a silent loss
    expect(durable()).not.toContain("mine")
  })

  // ── back-compat ──────────────────────────────────────────────────────────────────────────────────────
  //
  // ⚠ SEMANTIC COLLISION WITH #112, RECORDED RATHER THAN GLOSSED — flagged for adjudication.
  // This case was written as "the upgrade path: a store written by the previous release has only
  // `projection.json` and no `gen`", and it asserted that such a store keeps working. #112 decides the
  // OPPOSITE for one part of that store: a sidecar written by a previous release carries no IDENTITY STAMP,
  // its hashes were minted under rules this build no longer computes, and it is therefore refused with a
  // legible reason rather than silently carried forward (see `identity-schema.ts`). The two claims cannot
  // both stand for a genuinely pre-#112 file.
  //
  // They are separated here rather than merged, because they are two independent axes and this case only
  // ever meant to test ONE of them:
  //   · THIS case keeps the `gen` law, with the identity axis held CONSTANT at the current stamp — absent
  //     `gen` still reads as generation 0 and its successor is generation 1, which is what it was written to
  //     prove and what its `teeth` bite on.
  //   · The case BELOW covers the other axis: a file with neither, i.e. a real previous-release store.
  // No assertion in this case changed; the fixture gained one key and the title stopped over-claiming.
  it("a sidecar with NO `gen` (the fixed filename) is read as generation 0 and carried forward, losing no rows", () => {
    writeFileSync(
      join(tmp!, "projection.json"),
      JSON.stringify({ current: [row("legacy")], cas: ["a".repeat(64)], identity: IDENTITY_SCHEMA }),
      "utf8",
    )
    const store = createDiskStore(casDir())
    expect([...store.loadProjection()!.current.keys()]).toEqual(["legacy"]) // absent `gen` ⇒ 0, still readable
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "modern") }))
    expect(existsSync(join(tmp!, "projection.1.json"))).toBe(true) // successor of generation 0
    expect(durable()).toEqual(["legacy", "modern"])
  })

  it("a sidecar with neither `gen` NOR an identity stamp — a real previous-release store — is REFUSED (#112)", () => {
    // The other half of the case above, and the one whose answer #112 reversed. The rows are still READ (the
    // drift oracle already refuses each fact individually, so emptying would only replace one silence with a
    // worse one), but nothing may be PUBLISHED over them: a write would carry them into a generation stamped
    // as current-schema and destroy the only evidence that they are not.
    writeFileSync(
      join(tmp!, "projection.json"),
      JSON.stringify({ current: [row("legacy")], cas: ["a".repeat(64)] }),
      "utf8",
    )
    const store = createDiskStore(casDir())
    expect([...store.loadProjection()!.current.keys()]).toEqual(["legacy"])
    expect(readSidecarSet(tmp!, "projection").identity).toBe("unstamped")
    expect(() => store.commitProjection((p) => ({ out: 0, next: withRow(p, "modern") }))).toThrow(IdentitySchemaError)
    // NOTHING was written: no successor generation, and the user's bytes are still there to re-derive from.
    expect(existsSync(join(tmp!, "projection.1.json"))).toBe(false)
    expect(durable()).toEqual(["legacy"])
  })

  it("the mirror `projection.json` keeps being published, and is byte-identical to the head generation", () => {
    // Compatibility, not truth: tools and suites that know the fixed name (doctor byte/mtime pins, the mine
    // no-touch pin) must keep finding a COMPLETE file there. It is published by `rename` from the same inode
    // the generation was linked from, so it can never be a prefix.
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "a") }))
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "b") }))
    expect(readFileSync(join(tmp!, "projection.json"), "utf8")).toBe(
      readFileSync(join(tmp!, "projection.2.json"), "utf8"),
    )
  })

  it("the mirror is an INDEPENDENT INODE — corrupting `projection.json` cannot reach the head generation", () => {
    // MEASURED BUG in the first version of this protocol, and a nasty one: the mirror was published by
    // `rename`-ing the very temp that had just been `link`ed to the generation, so the two names shared ONE
    // inode. Anything writing `.atlas/projection.json` in place — a restore script, a fixture, a human —
    // truncated the head generation through the back door of the compatibility artifact. The whole point of
    // publishing by `link` is that a published generation is immutable; a second name onto the same inode
    // hands that immutability away.
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "truth") }))
    const head = join(tmp!, "projection.1.json")
    const mirror = join(tmp!, "projection.json")
    expect(statSync(head).ino).not.toBe(statSync(mirror).ino) // two files, not two names
    writeFileSync(mirror, '{ "current": [ truncated', "utf8")
    // MUTANT: publish the mirror with `renameSync(tmp, mirrorPath(...))` again and BOTH of these flip —
    // the head generation is truncated too, and the store reads as empty.
    expect(durable()).toEqual(["truth"])
    // and the next commit republishes a healthy mirror from the new bytes.
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "more") }))
    expect(JSON.parse(readFileSync(mirror, "utf8")).current.length).toBe(2)
  })

  it("ADR-0008 still holds under the new protocol: staging commits touch NO projection file", () => {
    const store = createDiskStore(casDir())
    store.commitProjection((p) => ({ out: 0, next: withRow(p, "governed") }))
    const before = readdirSync(tmp!)
      .filter((n) => n.startsWith("projection"))
      .map((n) => [n, readFileSync(join(tmp!, n), "utf8")] as const)
    store.commitStaging((p) => ({ out: 0, next: withRow(p, "candidate") }))
    // teeth: point `STAGING_BASE` at `'projection'` and both halves go RED.
    for (const [n, bytes] of before) expect(readFileSync(join(tmp!, n), "utf8")).toBe(bytes)
    // Read back through the one staging door (task #83 deleted `loadStaging`): a decision returning no
    // `next` reads the snapshot and writes nothing.
    const staged = store.commitStaging<readonly string[]>((p) => ({ out: [...p.current.keys()] }))
    expect(staged.settled ? staged.out : ["<refused>"]).toEqual(["candidate"])
    expect(durable()).toEqual(["governed"])
  })
})
