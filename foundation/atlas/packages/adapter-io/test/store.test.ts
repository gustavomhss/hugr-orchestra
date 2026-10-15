// @atlas/adapter-io — test/store.test.ts   (WP-9.2.3.STORE — EPIC-3, REQ-ADAPTER-6a/6b/6c + 12a/12b)
//
// Acceptance suite for the durable, tamper-safe disk StoreApi + cross-process StoreProjection rehydrate
// (ADAPT-STORE-1/3). Transcribes the frozen goldens (docs/requirements/goldens-adapters.md) VERBATIM:
//   • SCN-ADAPTER-6a-1  — put/get round-trips under the content hash                       (happy)
//   • SCN-ADAPTER-6b-1  — put in process A is get-retrievable in a fresh process B          (happy)
//   • SCN-ADAPTER-6c-1  — a tampered on-disk value reads as absent                          (guard)
//   • SCN-ADAPTER-12a-1 — a fresh process rehydrates the flushed fact byte-identically       (happy)
//   • SCN-ADAPTER-12b-1 — rehydrate reconstructs state only, minting nothing                (guard)
// The ADR-0008 STAGING sidecar cases live in the sibling `store-staging.test.ts` — split out in task #83
// because they exercise a DIFFERENT sidecar family through a DIFFERENT door (`commitStaging`).
//
// Harness (per fs.test.ts convention): a temp CAS dir per test + afterEach cleanup. `casPath` is the CAS
// ROOT — value files land at `<casPath>/<H[0:2]>/<H>` and the projection sidecar beside it (outside cas/).

import { describe, it, expect, afterEach, vi } from "vitest"
import {
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { asHash, id } from "@atlas/kernel"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { WriteRequest } from "@atlas/knowledge"
import { createDiskStore, rehydrateProjection } from "../src/store.js"

let tmp: string | undefined

/** A fresh temp workspace; returns the CAS root (`<tmp>/cas`) so the projection sidecar lands at `<tmp>/`. */
function freshCasDir(): string {
  tmp = mkdtempSync(join(tmpdir(), "atlas-store-"))
  return join(tmp, "cas")
}

/**
 * Corrupt EVERY file of one sidecar family — the fixed-name mirror AND every published generation.
 *
 * "The sidecar" used to be ONE file, so these cases wrote garbage over `projection.json` and were done. It
 * is now a SET: a commit publishes `projection.<g>.json` by `link(2)` (the compare-and-swap that makes a
 * concurrent write atomic — 8 racing `atlas emit`s used to lose 1–5 nodes each while reporting `status: ok`)
 * and republishes `projection.json` as a derived, INDEPENDENT copy for tools that know the fixed name.
 *
 * So corrupting ONE member is no longer "a corrupt sidecar": it is a corrupt member, and the reader is now
 * SUPPOSED to survive it by falling back to another generation. That fallback is half the fix for the
 * erasure where a torn read read as "no knowledge" and one emit replaced 402 nodes with 1; it has its own
 * cases in `sidecar.test.ts`, including the mirror-vs-generation inode isolation that keeps an in-place
 * write to the mirror from reaching the truth.
 *
 * What THESE cases pin is unchanged and still worth pinning: when NOTHING is readable the reader is TOTAL
 * (`undefined`, never a throw), because `composeRuntime` rehydrates at boot and a throw here crashes BOTH
 * bins. They therefore corrupt the whole family.
 */
function corruptSidecar(base: "projection" | "staging", bytes: string): void {
  const isGeneration = new RegExp("^" + base + "\\.\\d+\\.json" + "$")
  for (const name of readdirSync(tmp!)) {
    if (name === base + ".json" || isGeneration.test(name)) writeFileSync(join(tmp!, name), bytes, "utf8")
  }
}

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
  vi.restoreAllMocks()
})

/** The genuine routing-input for fact `F` — built through the REAL knowledge `upsert`, never hand-forged. */
function reqF(): WriteRequest {
  return {
    nodeKey: "claim:fix-cov",
    contentHash: id({ claim: "fix-cov", v: 1 }), // opaque CAS id for content `c1`
    family: "advisory",
    claimNorm: "coverage on the fix path",
  }
}

describe("createDiskStore — ADAPT-STORE-1 durable, tamper-safe disk CAS", () => {
  it("SCN-ADAPTER-6a-1 — put/get round-trips under the content hash (happy)", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    const O = { kind: "fact", body: "coverage fix", n: 42 }
    const H = s.put(O)
    expect(s.get(H)).toEqual(O)
    // teeth: a `put` storing `O` under a random-uuid filename would miss the sharded content-addressed path.
    expect(existsSync(join(dir, H.slice(0, 2), H))).toBe(true)
  })

  it("SCN-ADAPTER-6b-1 — an object put in process A is get-retrievable in a fresh process B (happy)", () => {
    const dir = freshCasDir()
    const O = { kind: "fact", body: "durable across processes" }
    const sA = createDiskStore(dir)
    const H = sA.put(O)
    // fresh instance over the same dir = a new process with NO shared memory.
    const sB = createDiskStore(dir)
    // teeth: a memory-only Map never flushes → sB.get(H) is undefined (the load-bearing durability tooth).
    expect(sB.get(H)).toEqual(O)
  })

  it("SCN-ADAPTER-6c-1 — a tampered on-disk value reads as absent (guard)", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    const O = { kind: "fact", body: "genuine" }
    const H = s.put(O)
    // overwrite the on-disk bytes with a different object whose id !== H.
    const other = { kind: "fact", body: "tampered" }
    expect(id(other)).not.toBe(H)
    writeFileSync(join(dir, H.slice(0, 2), H), JSON.stringify(other), "utf8")
    // teeth: returning the file's bytes without re-hashing (`id(value) === key`) serves the tampered value.
    expect(s.get(H)).toBeUndefined()
  })

  it("put of a malformed CasObject is total — empty handle, writes nothing, never throws (KERNEL-7b)", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    // a value the sealed `id` seam rejects (BigInt is non-canonicalizable) → honest-empty, no write, no throw.
    const bad = { kind: "fact", n: 10n } as unknown
    let H = "sentinel" as ReturnType<typeof s.put>
    // teeth: dropping the malformed-put try/catch (returning `id(obj)` directly) throws here.
    expect(() => {
      H = s.put(bad as never)
    }).not.toThrow()
    expect(H).toBe("") // the non-resolving empty handle (asHash(''))
    // and it persisted nothing — the CAS root was never even created by the rejected put.
    expect(existsSync(dir)).toBe(false)
  })

  it("get over corrupt (non-JSON) on-disk bytes is total — undefined, never throws", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    const H = s.put({ kind: "fact", body: "genuine" })
    // corrupt the bytes to NON-JSON — distinct from 6c's valid-JSON-different-object (rehash-mismatch) path;
    // this exercises the disk-adapter-specific JSON.parse-failure branch the in-mem kernel store never has.
    writeFileSync(join(dir, H.slice(0, 2), H), "{ this is not json ", "utf8")
    let out: unknown = "sentinel"
    // teeth: dropping the get JSON.parse try/catch throws on the corrupt read instead of returning undefined.
    expect(() => {
      out = s.get(H)
    }).not.toThrow()
    expect(out).toBeUndefined()
  })

  it("N13 — a symlink planted in CAS pointing OUTSIDE the root reads as absent (escape guard; red→green)", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    // C is a genuine CasObject; its JSON is written to a file OUTSIDE the CAS root. A symlink is planted at the
    // content-addressed path `<cas>/<xx>/<H>` (H = id(C), so the filename passes the 64-hex charset gate AND the
    // bytes re-hash to H). PRE-N13 the read-before-verify FOLLOWS the symlink, reads the out-of-cas file, and —
    // id matches — SERVES it: a successful escape (get(H) === C). The realpath sandbox now rejects it.
    const C = { kind: "advisory", tier: "T1", freshness: "FRESH", body: "ESCAPED-OUT-OF-CAS" }
    const H = id(C) as string
    const outside = join(tmp!, "outside.json")
    writeFileSync(outside, JSON.stringify(C), "utf8")
    const shardDir = join(dir, H.slice(0, 2))
    mkdirSync(shardDir, { recursive: true })
    symlinkSync(outside, join(shardDir, H))
    // teeth: pre-N13 this returned `C` (the escape succeeded); the realpath-resolved cas-root sandbox is a miss.
    expect(s.get(asHash(H))).toBeUndefined()
  })

  it("N13 — a symlink in CAS to a NON-REGULAR target is a total miss (portable smoke of the isFile() branch)", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    // HONEST teeth note: this DIRECTORY case is NOT a red→green for the DoS — a directory read throws EISDIR
    // pre-N13 too, so it is a total miss on BOTH sides. It is a portable, CI-safe smoke check that a non-regular
    // target is rejected fast by `statSync` → `isFile()` false BEFORE any read handle opens. The genuine OOM
    // closure — a symlink → /dev/zero (unbounded read) or → a FIFO (blocking read) — is un-CI-able (it would
    // hang/OOM the PRE-fix code) and is verified out-of-band by an adversarial harness, not by this suite.
    // The real red→green tooth for N13 is the ESCAPE case above (pre-fix SERVED the out-of-cas object).
    const H = "a".repeat(64)
    const targetDir = join(tmp!, "a-directory")
    mkdirSync(targetDir, { recursive: true })
    const shardDir = join(dir, H.slice(0, 2))
    mkdirSync(shardDir, { recursive: true })
    symlinkSync(targetDir, join(shardDir, H))
    const t0 = Date.now()
    expect(s.get(asHash(H))).toBeUndefined()
    expect(Date.now() - t0).toBeLessThan(2000) // fast — non-regular target rejected without an unbounded read
  })

  it("N14 — a symlink at the CAS final component to an IN-CAS object that re-hashes to the addr is a MISS (fd O_NOFOLLOW; red→green)", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    // The residual TOCTOU that N13 did NOT close: N13 only rejected symlinks whose target escapes cas. A
    // symlink whose target is a REGULAR file INSIDE cas whose bytes re-hash to the addr passed EVERY N13 gate
    // (statSync→isFile true, realpathSync→inside cas, readFileSync→bytes re-hash to H) and was SERVED — the
    // exact primitive a race-attacker uses to slip a swapped inode past the path-based checks. N14 opens the
    // final component with O_NOFOLLOW, so the symlink ITSELF fails to open (ELOOP) ⇒ MISS, regardless of where
    // it points. Genuine red→green vs the pre-fix statSync/realpath code: pre-N14 this returned `C`.
    const C = { kind: "advisory", tier: "T1", freshness: "FRESH", body: "IN-CAS-SYMLINK-TARGET" }
    const H = id(C) as string
    // the symlink TARGET: a regular file that lives INSIDE the cas root (so N13's realpath sandbox passes).
    const inCasTarget = join(dir, "target.json")
    mkdirSync(dir, { recursive: true })
    writeFileSync(inCasTarget, JSON.stringify(C), "utf8")
    // plant the symlink AT the content-addressed final component `<cas>/<xx>/<H>` (filename passes charset).
    const shardDir = join(dir, H.slice(0, 2))
    mkdirSync(shardDir, { recursive: true })
    symlinkSync(inCasTarget, join(shardDir, H))
    // teeth: pre-N14 the path-based statSync/realpath/readFileSync chain SERVED `C` (all three gates passed);
    // the fd O_NOFOLLOW open refuses the final-component symlink itself ⇒ a plain miss.
    expect(s.get(asHash(H))).toBeUndefined()
  })

  it("N14(4) — an INTERMEDIATE component symlinked OUT of the CAS root is still a miss (the sandbox, now by inode)", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    // O_NOFOLLOW covers only the FINAL component, so the shard dir `<cas>/<xx>` is the remaining lever: point
    // it at a directory OUTSIDE the root holding a regular file named `<H>` whose bytes re-hash to `H`. Every
    // fd-based check passes (regular file, right size, right hash) — only the containment check refuses it.
    const C = { kind: "advisory", tier: "T1", freshness: "FRESH", body: "INTERMEDIATE-ESCAPE" }
    const H = id(C) as string
    const outsideShard = join(tmp!, "outside-shard")
    mkdirSync(outsideShard, { recursive: true })
    writeFileSync(join(outsideShard, H), JSON.stringify(C), "utf8")
    mkdirSync(dir, { recursive: true })
    symlinkSync(outsideShard, join(dir, H.slice(0, 2)))
    // teeth: deleting the intermediate-component check serves `C` from outside the CAS root.
    expect(s.get(asHash(H))).toBeUndefined()
  })

  it("N14(4) — an in-CAS object reached through a CASE-VARIANT spelling of the root is a HIT (the string check false-missed it)", () => {
    // HONEST SCOPE: this is HYGIENE, not a bypass. `valuePath(casPath, h)` is a literal extension of
    // `casPath`, so the two realpaths had no independent source and no attacker-reachable divergence; the one
    // divergence a probe of the built module found is THIS one, and it fails CLOSED (a real object read as
    // absent) and needs write access inside the CAS root to set up at all. It is fixed because one question
    // should have one answer — `isContainedIn`, the same predicate the two real doors ask — and that answer
    // has no false miss to explain: containment is decided on (dev, ino), and `realpathSync` PRESERVES the
    // spelling it was asked for, so two spellings of one directory are two strings but one inode.
    const dir = freshCasDir() // `<tmp>/cas`
    const s = createDiskStore(dir)
    const C = { kind: "advisory", tier: "T1", freshness: "FRESH", body: "IN-CAS-VIA-CASE-VARIANT" }
    const H = s.put(C) as string
    const upperRoot = join(tmp!, "CAS") // the SAME directory on a case-insensitive volume, spelled otherwise
    if (!existsSync(join(upperRoot, H.slice(0, 2), H))) return // case-SENSITIVE volume → the case has no subject
    // Move the real shard aside and point `<cas>/<xx>` at it through the case-variant spelling of the root.
    // Nothing leaves the CAS root: the bytes are the same inode, reached by a different name.
    const shard = join(dir, H.slice(0, 2))
    const moved = join(dir, "realshard")
    renameSync(shard, moved)
    symlinkSync(join(upperRoot, "realshard"), shard)
    // teeth: the previous `real !== realCas && !real.startsWith(realCas + sep)` string comparison read
    // `<tmp>/CAS/realshard/<H>` as an escape from `<tmp>/cas` and returned undefined for a value that is
    // inside the root. The inode climb answers the question that was actually asked.
    expect(s.get(asHash(H))).toEqual(C)
  })

  it("N14 — a FIFO AT the CAS final component is a FAST fd-based miss (O_NONBLOCK non-block + fstat-on-fd non-regular)", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    // A FIFO planted directly at `<cas>/<xx>/<H>` (NOT a symlink — a named pipe at the final component). This
    // is the un-CI-able OOM/hang vector made CI-safe: without O_NONBLOCK, openSync(read) of a FIFO BLOCKS
    // until a writer appears (the test would hang forever); with O_NONBLOCK the open returns immediately, then
    // fstatSync on the OPEN fd sees isFIFO() (isFile() false) and rejects — proving the reject is decided by
    // fstat-on-fd on the pinned inode, not a path stat. Skip only if `mkfifo` is unavailable.
    const H = "b".repeat(64)
    const shardDir = join(dir, H.slice(0, 2))
    mkdirSync(shardDir, { recursive: true })
    const fifoPath = join(shardDir, H)
    try {
      execFileSync("mkfifo", [fifoPath])
    } catch {
      return // no mkfifo on this host (both CI targets have it) — skip rather than false-fail
    }
    const t0 = Date.now()
    expect(s.get(asHash(H))).toBeUndefined() // if O_NONBLOCK were missing this line would never return
    expect(Date.now() - t0).toBeLessThan(2000) // fast — the FIFO open did not block, fstat rejected it
  })
})

describe("rehydrateProjection — ADAPT-STORE-3 cross-process rehydrate, minting nothing", () => {
  it("SCN-ADAPTER-12a-1 — a fresh process rehydrates the flushed fact byte-identically (happy)", () => {
    const dir = freshCasDir()
    // ARRANGE: build a genuine StoreProjection by running the REAL knowledge `upsert` from emptyStore().
    const { store: projection } = upsert(emptyStore(), reqF())
    const expected = projection.current.get("claim:fix-cov")
    expect(expected).toBeDefined() // head('claim:fix-cov') == F
    const s = createDiskStore(dir)
    s.persistProjection(projection)

    // ACT: a fresh process reconstructs the current-node map from the durable sidecar.
    const s2 = createDiskStore(dir)
    const p = rehydrateProjection(s2)

    // teeth: rehydrating from an in-memory snapshot s2 never had would leave F missing.
    expect(p.current.get("claim:fix-cov")).toEqual(expected)
  })

  it("ADJACENCY-A — the added primaryAnchor + slot round-trip through the durable projection sidecar", () => {
    const dir = freshCasDir()
    // a genuine projection carrying the ADDITIVE adjacency fields (via the REAL knowledge upsert).
    const req: WriteRequest = {
      nodeKey: "claim:fix-cov",
      contentHash: id({ claim: "fix-cov", v: 1 }),
      family: "advisory",
      claimNorm: "coverage on the fix path",
      primaryAnchor: "pkg::mod::fix",
      slot: "invariant",
    }
    const { store: projection } = upsert(emptyStore(), req)
    const s = createDiskStore(dir)
    s.persistProjection(projection)

    // a fresh process reconstructs the current-node map from the durable sidecar.
    const rehydrated = rehydrateProjection(createDiskStore(dir)).current.get("claim:fix-cov")!
    // teeth: a WireProjection that dropped the whole-node stringify (or filtered fields) loses these.
    expect(rehydrated.primaryAnchor).toBe("pkg::mod::fix")
    expect(rehydrated.slot).toBe("invariant")
  })

  it("AC-3 — SEAL-CARRY: a mined `seal:proven` fact lands in the DURABLE store and rehydrates with the seal", () => {
    const dir = freshCasDir()
    // A genuine projection built through the REAL knowledge `upsert`, carrying the ADDITIVE seal (+ slot),
    // then persisted+rehydrated through the REAL createDiskStore — NOT a fakeStore (the pre-existing union
    // test used a fakeStore and MISSED this gap).
    const req: WriteRequest = {
      nodeKey: "claim:fix-cov",
      contentHash: id({ claim: "fix-cov", v: 1 }),
      family: "advisory",
      claimNorm: "coverage on the fix path",
      slot: "invariant",
      seal: "proven",
    }
    const { store: projection } = upsert(emptyStore(), req)
    const s = createDiskStore(dir)
    s.persistProjection(projection)

    // a FRESH process reconstructs the current-node map from the durable sidecar.
    const rehydrated = rehydrateProjection(createDiskStore(dir)).current.get("claim:fix-cov")!
    // teeth: without the CREATE `seal` projection carrier, the durable row never carries it ⇒ undefined.
    expect(rehydrated.seal).toBe("proven")
    expect(rehydrated.slot).toBe("invariant") // control: the sibling `slot` carrier still round-trips
  })

  it("AC-4 — SEAL-CARRY back-compat: an advisory-prose fact (no seal) rehydrates with NO seal (absent)", () => {
    const dir = freshCasDir()
    // a projection minted with NO seal (every stored fact today) — via the REAL upsert.
    const { store: projection } = upsert(emptyStore(), reqF())
    const s = createDiskStore(dir)
    s.persistProjection(projection)
    const node = rehydrateProjection(createDiskStore(dir)).current.get("claim:fix-cov")!
    // the absent optional stays absent — no explicit undefined injected by the round-trip.
    expect(node.seal).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(node, "seal")).toBe(false)
  })

  it("ADJACENCY-A — an OLD sidecar without the fields rehydrates with them ABSENT (forward/back compat)", () => {
    const dir = freshCasDir()
    // a projection minted with NO adjacency fields (the pre-ADJACENCY-A shape).
    const { store: projection } = upsert(emptyStore(), reqF())
    const s = createDiskStore(dir)
    s.persistProjection(projection)
    const node = rehydrateProjection(createDiskStore(dir)).current.get("claim:fix-cov")!
    // the absent optionals stay absent — no explicit undefined injected by the round-trip.
    expect(node.primaryAnchor).toBeUndefined()
    expect(node.slot).toBeUndefined()
  })

  it("loadProjection over corrupt (non-JSON) sidecar bytes is total — emptyStore rehydrate, never throws", () => {
    const dir = freshCasDir()
    const s = createDiskStore(dir)
    // persist a genuine projection, then corrupt the sidecar to NON-JSON (truncated write on disk).
    s.persistProjection(upsert(emptyStore(), reqF()).store)
    corruptSidecar("projection", '{ "current": [ truncated')
    let out: unknown = "sentinel"
    // MUTANT: the unwrapped `JSON.parse(raw) as WireProjection` in loadProjection (store.ts) — a corrupt
    // sidecar throws there, and since composeRuntime rehydrates at boot, that throw crashes BOTH bins.
    expect(() => {
      out = createDiskStore(dir).loadProjection()
    }).not.toThrow()
    expect(out).toBeUndefined()
    // and rehydrate degrades to the empty projection — no boot crash, no minting.
    const p = rehydrateProjection(createDiskStore(dir))
    expect([...p.current.keys()]).toEqual([])
    expect([...p.cas]).toEqual([])
  })

  it("loadProjection over valid-JSON-but-wrong-shape sidecar is total — emptyStore, never throws", () => {
    const dir = freshCasDir()
    createDiskStore(dir).persistProjection(upsert(emptyStore(), reqF()).store)
    // valid JSON whose `current` is NOT the [k,v] entry-array — `new Map(5)` / `new Map({})` would throw.
    corruptSidecar("projection", JSON.stringify({ current: 5, cas: {} }))
    let p: ReturnType<typeof rehydrateProjection> | undefined
    // MUTANT: dropping the Array.isArray shape guard (and its try/catch) — the wrong-shape wire reaches
    // `new Map(wire.current)` and throws, again crashing rehydrate at boot.
    expect(() => {
      p = rehydrateProjection(createDiskStore(dir))
    }).not.toThrow()
    expect([...p!.current.keys()]).toEqual([])
    expect([...p!.cas]).toEqual([])
  })

  it("SCN-ADAPTER-12b-1 — rehydrate reconstructs state only, minting nothing (guard)", () => {
    const dir = freshCasDir()
    const { store: projection } = upsert(emptyStore(), reqF())
    const s = createDiskStore(dir)
    s.persistProjection(projection)

    const s2 = createDiskStore(dir)
    const putSpy = vi.spyOn(s2, "put")
    rehydrateProjection(s2)
    // teeth: re-running routing (routeWrite/upsert) or `put` during rehydrate mints a fresh fact/pointer.
    expect(putSpy).toHaveBeenCalledTimes(0)

    // static guard: store.ts must not IMPORT the routing seam at all (reconstruct-only by construction).
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "store.ts"), "utf8")
    const imports = src
      .split("\n")
      .filter((l) => l.trimStart().startsWith("import"))
      .join("\n")
    expect(imports).not.toMatch(/routeWrite/)
    expect(imports).not.toMatch(/\bupsert\b/)
  })
})
