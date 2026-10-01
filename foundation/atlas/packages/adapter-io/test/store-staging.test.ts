// @atlas/adapter-io — test/store-staging.test.ts  (ADR-0008 — the STAGING sidecar, via its ONE door)
//
// SPLIT OUT OF `store.test.ts` in task #83, along a real seam rather than to dodge the 400-LOC ceiling:
// `store.test.ts` is the acceptance suite for the durable CAS + projection rehydrate (ADAPT-STORE-1/3), and
// these cases are about a DIFFERENT sidecar family (the explorer's candidate store) reached through a
// DIFFERENT door (`commitStaging`). They shared a file only because staging was originally a two-line
// addition to the store interface. The local fixtures below (`freshCasDir` / `corruptSidecar`) are copied
// rather than exported from the sibling: a test fixture shared across suites is a coupling that makes one
// suite's edit silently move another's goldens, and both copies are three lines.
//
// Behaviour-preserving w.r.t. the split itself — every case is byte-identical to the version lifted out.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { StoreProjection, WriteRequest } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import type { CommitResult } from "../src/sidecar.js"

let tmp: string | undefined

/** A fresh temp workspace; returns the CAS root (`<tmp>/cas`) so the sidecars land at `<tmp>/`. */
function freshCasDir(): string {
  tmp = mkdtempSync(join(tmpdir(), "atlas-store-staging-"))
  return join(tmp, "cas")
}

/** Corrupt EVERY file of one sidecar family — the fixed-name mirror AND every published generation. A
 *  commit publishes `<base>.<g>.json` and republishes `<base>.json` as a derived copy, so corrupting one
 *  member is not "a corrupt sidecar": the reader is SUPPOSED to survive that by falling back. */
function corruptSidecar(base: "projection" | "staging", bytes: string): void {
  const isGeneration = new RegExp("^" + base + "\\.\\d+\\.json" + "$")
  for (const name of readdirSync(tmp!)) {
    if (name === base + ".json" || isGeneration.test(name)) writeFileSync(join(tmp!, name), bytes, "utf8")
  }
}

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

/** The genuine routing-input for fact `F` — BYTE-IDENTICAL to `store.test.ts`'s, so the split moved no
 *  golden. `contentHash` is a real `id(...)`, never a hand-forged string. */
function reqF(): WriteRequest {
  return {
    nodeKey: "claim:fix-cov",
    contentHash: id({ claim: "fix-cov", v: 1 }), // opaque CAS id for content `c1`
    family: "advisory",
    claimNorm: "coverage on the fix path",
  }
}

// ── ADR-0008 — the STAGING sidecar: same shape, DIFFERENT file ─────────────────────────────────────────
//
// `atlas mine` is the explorer: no truth gate, no KNOW-11 authz, no KNOW-8 ratification. KNOW-8 lets it
// write only CANDIDATES — but staging had nowhere to live, so it wrote the only durable place there was,
// the knowledge projection, and three defects followed (destroy → mutate-a-ratified-T0 → unwritable rows).
// `commitStaging` gives candidates their own file. These cases pin the two properties that make that real:
// the candidate store ROUND-TRIPS, and it NEVER touches `projection.json`.
//
// REWRITTEN IN TASK #83, and the assertions MOVED — recorded here rather than left to a reader to spot.
// These cases used to drive `persistStaging`/`loadStaging`, which a probe measured to have ZERO production
// callers and which are now deleted. They drive `commitStaging` instead — the door `mine` actually uses —
// so the totality legs now assert what the COMMIT protocol does with unreadable bytes, which is NOT what
// the bare read did: `loadStaging` degraded to `undefined` ("nothing staged"), while `commitStaging`
// returns a VISIBLE `unreadable` refusal. That is the leg-2 fix (`sidecar.ts`) and it is strictly stronger —
// starting a pass from `emptyStore()` over a torn file is precisely how a 402-node store became a 1-node
// store. Both shapes still share the one property these cases exist for: NEITHER EVER THROWS.

/** Read the staged head through the one staging door — a decision with no `next` reads and writes nothing. */
function readStaging(store: DiskStore): StoreProjection | undefined {
  const r = store.commitStaging<StoreProjection>((p) => ({ out: p }))
  return r.settled ? r.out : undefined
}
/** Stage a projection through the one staging door. */
function stage(store: DiskStore, next: StoreProjection): void {
  store.commitStaging(() => ({ out: 0, next }))
}

describe("commitStaging — the ADR-0008 candidate sidecar", () => {
  it("round-trips a projection through the staging sidecar in a fresh process", () => {
    const dir = freshCasDir()
    const { store: candidates } = upsert(emptyStore(), reqF())
    stage(createDiskStore(dir), candidates)
    // a fresh instance over the same dir = a new process with NO shared memory.
    const back = readStaging(createDiskStore(dir))
    expect(back?.current.get("claim:fix-cov")).toEqual(candidates.current.get("claim:fix-cov"))
    expect([...back!.cas]).toEqual([...candidates.cas])
  })

  it("MUTANT (STAGING_BASE → PROJECTION_BASE): staging writes its OWN file and leaves projection.json alone", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    // a governed projection is already on disk — exactly the state a mine pass runs against.
    s.persistProjection(upsert(emptyStore(), reqF()).store)
    const governedBytes = readFileSync(join(tmp!, "projection.json"), "utf8")
    // stage a DIFFERENT node: if staging resolved to the projection path, this write would replace the file.
    stage(s, upsert(emptyStore(), { ...reqF(), nodeKey: "claim:a-candidate" }).store)

    // teeth: point `STAGING_BASE` at `'projection'` and the next two lines both go RED.
    expect(readFileSync(join(tmp!, "projection.json"), "utf8")).toBe(governedBytes) // byte-identical, untouched
    expect(existsSync(join(tmp!, "staging.json"))).toBe(true) //                      its own file exists
    // and the two stores read back DISJOINT sets — a candidate is not visible as a fact, nor a fact as one.
    expect([...s.loadProjection()!.current.keys()]).toEqual(["claim:fix-cov"])
    expect([...readStaging(s)!.current.keys()]).toEqual(["claim:a-candidate"])
  })

  it("the staging read over corrupt sidecar bytes is total — a VISIBLE refusal, never a throw", () => {
    const dir = freshCasDir()
    stage(createDiskStore(dir), upsert(emptyStore(), reqF()).store)
    corruptSidecar("staging", '{ "current": [ truncated')
    let out: CommitResult<StoreProjection> | undefined
    // MUTANT: unwrap the `JSON.parse` try/catch in `readOne` (sidecar.ts). `mine` reads staging at the head
    // of every commit attempt, so a throw here aborts the pass on a half-written file.
    expect(() => {
      out = createDiskStore(dir).commitStaging<StoreProjection>((p) => ({ out: p }))
    }).not.toThrow()
    // …and it does not quietly answer "nothing staged" either: an unreadable sidecar is REPORTED, which is
    // what stops a pass from rebuilding staging from empty and erasing every candidate already there.
    expect(out!.settled).toBe(false)
    expect(out!.settled === false && out!.refusal).toBe("unreadable")
  })

  it("the staging read is total on a MISSING and on a wrong-shape sidecar (same discipline as loadProjection)", () => {
    const dir = freshCasDir()
    // nothing staged yet — the commit protocol has no "nothing persisted" state; it decides over the EMPTY
    // projection and settles. Not a throw, and not a refusal: a fresh repo must be writable.
    expect(readStaging(createDiskStore(dir))!.current.size).toBe(0)
    stage(createDiskStore(dir), upsert(emptyStore(), reqF()).store)
    // valid JSON whose `current` is NOT the [k,v] entry-array — `new Map(5)` would throw without the guard.
    corruptSidecar("staging", JSON.stringify({ current: 5, cas: {} }))
    let out: CommitResult<StoreProjection> | undefined
    // MUTANT (measured, both halves needed): drop the `Array.isArray` guard AND the try/catch around the
    // Map/Set construction in `readOne` ⇒ `TypeError: number 5 is not iterable`. Dropping the guard
    // ALONE leaves this green — the catch covers it — so the guard is defence-in-depth, not the tooth.
    expect(() => {
      out = createDiskStore(dir).commitStaging<StoreProjection>((p) => ({ out: p }))
    }).not.toThrow()
    expect(out!.settled === false && out!.refusal).toBe("unreadable")
  })
})
