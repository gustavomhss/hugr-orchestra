// @atlas/adapter-io — src/store.ts  (ADAPT-STORE-1/3: disk-backed CAS + projection rehydration)
//
// The raw store adapter: a disk-backed realization of the frozen `StoreApi` (@atlas/kernel) and the
// rehydration of a `StoreProjection` (@atlas/knowledge) from it. Implemented — WP-9.2.3.STORE (tests: store.test.ts).
//
// NOTE (scaffold widening, lead-decided at exec): the kernel `StoreApi` (put/get by content-hash) has no
// enumerate/list and cannot LOCATE a content-addressed projection, so it cannot alone discharge ADAPT-STORE-3
// (rehydrate the current-node map) or 12b (reconstruct WITHOUT re-running routing). STORE therefore OWNS a
// durable projection format + the `persistProjection`/`loadProjection` primitives (the format the later
// KNOWLEDGE flush CALLS and rehydrate READS back), and `rehydrateProjection` takes the widened `DiskStore`.
// The kernel `StoreApi` stays frozen — this widening is additive and lives only in this adapter package.
//
// STAGING (ADR-0008 / KNOW-8): the store owns a SECOND sidecar of the same shape at a DIFFERENT path — the
// CANDIDATE store the explorer (`atlas mine`) writes. KNOW-8 says the explorer may write only candidates and
// never self-commits; what was missing is that staging had nowhere to live, so the explorer wrote the only
// durable place there was — the knowledge projection. `commitStaging` gives it that place. The two sidecars
// share ONE implementation (`sidecar.ts`) so their totality AND their atomicity cannot drift apart; they
// differ ONLY in the file they name. A candidate is promoted into knowledge solely by passing a governed
// door, so nothing in this file reads staging back into the projection.
//
// THERE IS EXACTLY ONE STAGING DOOR, AND THAT IS DELIBERATE (task #83). `persistStaging`/`loadStaging` used
// to sit here as an unconditional persist + a bare read. `mine` migrated to `commitStaging` (see
// `cli/src/mine.ts`) because an unconditional persist is last-writer-wins BY DEFINITION — measured at
// 8 processes × 5 sites: 40 candidates reported committed, 5 durable — and the pair was then measured to
// have ZERO production callers, by probe (stderr + stack attribution) across the whole suite including the
// real CLI subprocesses: every hit came from a test. They are DELETED rather than deprecated: unlike a
// reference model, they had a live successor doing the same job better, so there was nothing left for a
// reader to learn from them and keeping them meant keeping a second, weaker way to write candidates.
//
// THE SIDECAR FORMAT MOVED TO `sidecar.ts`, ITS COMMIT PROTOCOL TO `sidecar-commit.ts`. Not a line-count
// dodge: this file owns an IMMUTABLE content-addressed store, where a key's bytes never change and so
// concurrency is free, while the sidecar is the one MUTABLE cell in the product and every governed door
// read-modify-writes it. It was persisted by a bare in-place `writeFileSync`, which cost 1–5 lost nodes per
// 8-writer race — every writer exiting 0 with `status: ok` — and turned any torn read into a total erasure
// reported as success. See the `sidecar.ts` header for both measured legs and for why the commit is a
// `link(2)` compare-and-swap over generation-named files.

import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import type { Hash } from "@atlas/contracts"
import { asHash, id } from "@atlas/kernel"
import type { CasObject, StoreApi } from "@atlas/kernel"
import { emptyStore } from "@atlas/knowledge"
import type { StoreProjection } from "@atlas/knowledge"
import { isContainedIn } from "./containment.js"
import { readSidecarSet } from "./sidecar.js"
import type { SidecarTrust } from "./store-provenance.js"
import { commitSidecar, persistSidecar } from "./sidecar-commit.js"
import type { CommitDecision, CommitResult, SidecarBase, SidecarCtx } from "./sidecar.js"

/** A filesystem path to the on-disk CAS root (D4: value files at `<casPath>/<h[0:2]>/<h>`). */
export type CasPath = string

/** The honest-empty content handle: a malformed put stores nothing and returns this non-resolving key
 *  (mirrors kernel/store.ts:26 — `asHash('')`, the sole EMPTY sentinel). */
const EMPTY: Hash = asHash("")

/** The two mutable sidecar FAMILIES — NOT content-addressed; they live beside the CAS root (D4), one
 *  directory up. `staging` is the explorer's CANDIDATE store (ADR-0008): same shape as the projection,
 *  DELIBERATELY a different file, because keeping the two in one place is exactly what let an ungoverned
 *  mine pass destroy, then mutate, governed knowledge. Named here and NOWHERE else, so the mutant
 *  `STAGING_BASE → 'projection'` stays the one-line, test-killable change it was. */
const PROJECTION_BASE: SidecarBase = "projection"
const STAGING_BASE: SidecarBase = "staging"

/** The upper bound on a single CAS object read (N13 DoS guard): a CAS object is a small JSON fact/skeleton
 *  (KB-scale). A value whose on-disk size exceeds this is rejected as a miss BEFORE it is read — belt for a
 *  planted oversized regular file. Generous (64 MiB) so it never trips a legitimate object, far below OOM. */
const MAX_CAS_BYTES = 64 * 1024 * 1024

/** N14 (billy PoC — symlink TOCTOU): the open flags that make the check-and-read share ONE inode.
 *  `O_NOFOLLOW` → a symlink AT the final path component fails to open (ELOOP) atomically — the pre-N14
 *  statSync→realpathSync→readFileSync chain re-resolved the symlink THREE times, so a sub-ms swap between
 *  the checks re-opened the OOM; opening the final component with `O_NOFOLLOW` refuses it in one syscall.
 *  `O_NONBLOCK` → opening a FIFO returns immediately instead of blocking on a writer. Both exist on
 *  macOS+Linux (the CI targets); default to 0 defensively so the module still loads if ever absent. */
const O_READ_NO_SYMLINK = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0)

/** The sharded, content-addressed value path for `H`: `<casPath>/<H[0:2]>/<H>` (D4). */
function valuePath(casPath: CasPath, h: Hash): string {
  return join(casPath, h.slice(0, 2), h)
}

/** The sidecar DIRECTORY: `dirname(casPath)` — OUTSIDE the `cas/` root (D4). Both sidecar families live
 *  here; `sidecar.ts` derives every concrete filename from (dir, base), so a path is never spelled twice.
 *  Point `STAGING_BASE` at `'projection'` and mining reaches governed knowledge again — the mutant the
 *  suites kill (ADR-0008). */
function sidecarDir(casPath: CasPath): string {
  return dirname(casPath)
}

/** The commit CONTEXT for one sidecar family: where it lives, which family it is, the N11 watermark seam,
 *  and the CAS write door the commit must run BEFORE it publishes (see `CommitDecision.put`). */
function ctxFor(
  casPath: CasPath,
  base: SidecarBase,
  headSha: (() => string | undefined) | undefined,
  put: (o: unknown) => unknown,
  trusted: SidecarTrust | undefined,
): SidecarCtx {
  return { dir: sidecarDir(casPath), base, headSha, put, trusted }
}

/**
 * The widened disk store: the frozen kernel `StoreApi` (durable put/get, ADAPT-STORE-1) PLUS the durable
 * sidecar primitives STORE owns (ADAPT-STORE-3). `persistProjection` is the primitive the later KNOWLEDGE
 * flush calls; `loadProjection` is the read side `rehydrateProjection` composes over. `commitStaging` is the
 * SAME atomic door over the candidate sidecar (ADR-0008) — same shape, different file, so the explorer has a
 * durable place of its own and no longer has to borrow the knowledge projection. Kernel `StoreApi` is
 * unchanged (this only ADDS methods in the adapter layer).
 */
export interface DiskStore extends StoreApi {
  /**
   * THE governed write door onto the projection: read → decide → publish, ATOMIC against every other
   * writer. `decide` receives the freshly-read projection and returns the whole decision; on a lost race it
   * is RE-RUN from scratch against the new snapshot, so it MUST be pure (no writes, no clock, no random) and
   * it MUST contain the gates, not just the state change.
   *
   * The gates are inside `decide` for a security reason, not an aesthetic one: the target-derived gates
   * (`governed-emit-incumbent.ts`) resolve authority from the incumbent ROW on this snapshot — its `scope`
   * and `tier`, with the ADR-0007 fallback to the authenticated bytes for a carrier-less row. Re-publishing
   * a decision computed against a STALE snapshot would apply a write that cleared its gates against a
   * projection that no longer exists: the confused deputy those gates were written to close, re-entered
   * through the back door of a retry, and reachable by ordinary contention rather than by an attack.
   *
   * `settled:false` is a VISIBLE refusal (contended, or an unreadable sidecar), never a silent no-op.
   */
  commitProjection<T>(decide: (projection: StoreProjection) => CommitDecision<T>): CommitResult<T>
  /** The SAME primitive over the candidate sidecar (ADR-0008) — one implementation, different file, so the
   *  two cannot drift in atomicity any more than they can in totality. THE ONLY staging door: `mine` adopted
   *  it (`cli/src/mine.ts`), and the weaker `persistStaging`/`loadStaging` pair it replaced has been deleted
   *  (see the file header). A caller that wants only to READ the staged head passes a decision that returns
   *  no `next` — `commitStaging((p) => ({ out: p }))` — which reads the snapshot and writes nothing. */
  commitStaging<T>(decide: (projection: StoreProjection) => CommitDecision<T>): CommitResult<T>
  /** Persist the whole `StoreProjection` durably (the mutable sidecar, NOT content-addressed).
   *  UNCONDITIONAL, therefore last-writer-wins BY DEFINITION — it carries no decision to re-run. It is
   *  atomic (no reader ever sees a prefix) but it is NOT the concurrency-safe door: a read-modify-write MUST
   *  go through `commitProjection`. THROWS rather than silently doing nothing on exhaustion. */
  persistProjection(projection: StoreProjection): void
  /** Read the durable `StoreProjection` back; `undefined` when none has been persisted yet. */
  loadProjection(): StoreProjection | undefined
}

/**
 * Construct a disk-backed content-addressed store conforming to the frozen `StoreApi` (ADAPT-STORE-1).
 *
 * `headSha` (N11, OPTIONAL) is the injected freshness-watermark seam — a pure `() => currentHEAD | undefined`
 * supplied by the composition root (which owns git; the store stays git-ignorant). When present, every
 * publication STAMPS EACH ROW IT ACTUALLY PRODUCED with the HEAD that row's stored per-fact freshness
 * reflects, so a later query can cheaply detect a behind-HEAD (⇒ unverified ⇒ honestly `stale`) read.
 *
 * PER ROW, and the sentence that stood here said "STAMPS the projection", which was true of one row and
 * applied to all of them. A publication rewrites the WHOLE projection and carries almost every row forward
 * untouched, so a single projection-level stamp meant ANY write re-dated every fact in the store: one
 * unrelated `atlas emit` turned an honest `stale: true` back into `stale: false` while `atlas doctor why`
 * still printed the drift. The code now matches the sentence rather than the sentence being softened —
 * `freshness-watermark.ts` owns the rule (a row is re-stamped iff its `contentHash` changed) and the measured
 * repro. `StoreProjection.builtAt` is still written, as the back-compat fallback for an unstamped row.
 *
 * Absent (tests / non-git) ⇒ no stamp ⇒ the reader treats the watermark as "unknown" (never a false flag).
 * Injected here (not at each write door) so EVERY persist site — governed emit onto the projection, the mine
 * driver onto staging — stamps uniformly with zero change to their code.
 *
 * `trusted` (OPTIONAL) is the PROVENANCE seam (`store-provenance.ts`), injected the same way and for the
 * same reason: this module must stay git-ignorant, and only the composition root knows about git. It answers
 * "did this durable store arrive through a door, or by a COMMIT". A committed store reads as EMPTY (it
 * serves nothing) and REFUSES every write (it is not overwritten, so the evidence survives and the
 * attacker's rows are never laundered into door output). ABSENT ⇒ never consulted ⇒ behaviour unchanged,
 * which is why every pre-existing suite and every non-git tree is unaffected.
 */
export function createDiskStore(
  casPath: CasPath,
  headSha?: () => string | undefined,
  trusted?: SidecarTrust,
): DiskStore {
  // Self-referential so the sidecar commit can call THIS store's `put` (the CAS-before-projection ordering
  // invariant). The methods only run after the literal is bound, so the reference is never in the TDZ.
  const store: DiskStore = {
    put(obj: CasObject): Hash {
      // TWO serializations, and BOTH must be able to refuse. `id` runs the canonical preimage
      // (`canonical.ts`); `JSON.stringify` produces the stored bytes. They do NOT accept the same inputs,
      // and the gap between them is where this door used to break its own contract.
      //
      // MEASURED DEFECT (the `JSON.stringify` call used to sit BELOW this try, unguarded): KERNEL-8 excludes
      // the mutable side-indexes `grounding` / `status` / `freshness` from the preimage at EVERY level, so a
      // canonical-form violation parked in one of them never reaches the canonicalizer. `id` SUCCEEDS, this
      // catch never fires, and control fell through to a bare `JSON.stringify` that throws a raw engine
      // `TypeError` on a bigint or a cycle — out of a method whose own comment promised "never throw".
      // `grounding` is on EVERY `GroundedFact` and `governed-emit.ts` puts the WHOLE fact here, so the throw
      // came straight back out of `atlas-emit`; `@atlas/tools` `fault.ts` then files a `TypeError` as
      // `internal-fault` ("a defect in Atlas, not in your arguments") for bytes that were entirely the
      // caller's. Reachable from an in-process embedder, which gate 0 of `governed-emit.ts` names as in the
      // threat model in as many words. Both serializations are inside the try now, so the door has ONE
      // answer for "these bytes cannot be stored": the honest empty handle.
      let h: Hash
      let bytes: string
      try {
        // canonicalize → hash via the sealed seam; the caller never supplies the key (KERNEL-1/2a).
        h = id(obj)
        // the STORED bytes, produced BEFORE any directory is made — so a value that cannot serialize
        // leaves not one filesystem trace, exactly as a value that cannot canonicalize does.
        bytes = JSON.stringify(obj)
        // `JSON.stringify` is NOT total either, and its OTHER failure mode is silent: it ANSWERS
        // `undefined` — no throw — for a bare `undefined`, a top-level function or a top-level symbol.
        // Meanwhile `canonicalForm` maps `undefined` to `null`, so `id` happily returns an address for it.
        // Storing that answer writes a value that cannot be parsed back to the object it addresses, i.e. a
        // durable row that reads as absent — the bricked row a refusal is strictly better than. Same sentinel.
        if (typeof bytes !== "string") return EMPTY
      } catch {
        // malformed input (float / bigint / symbol / cyclic / an NFC key collision) → honest empty, write
        // nothing, never throw. This is the contract `index/cas.ts` already codes against (`if (h)`).
        return EMPTY
      }
      const path = valuePath(casPath, h)
      // content-keyed dedup: equal content already on disk ⇒ store nothing new (idempotent).
      if (!existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, bytes, "utf8")
      }
      return h
    },

    get(h: Hash): CasObject | undefined {
      // total: any miss/malformed/tampered read ⇒ `undefined`, never a throw (KERNEL-7a).
      // SECURITY (billy PoC — path-traversal / read-amplification DoS): `h` may be attacker-controlled (the
      // `atlas node <addr>` read door reaches here over MCP/poke). A CAS key is EXACTLY 64 lowercase hex, so
      // reject anything else BEFORE `readFileSync` — the tamper re-hash guard below runs AFTER the read, too
      // late to stop an unbounded read (a `../`-traversal to /dev/zero would hang + OOM). Belt-and-suspenders:
      // also require the resolved value path to stay INSIDE the CAS root (no escape), treating either failure
      // as a plain miss (`undefined`), never a filesystem touch.
      if (!/^[0-9a-f]{64}$/.test(h)) return undefined
      const path = valuePath(casPath, h)
      // N14 (billy PoC — the residual symlink TOCTOU): N13 guarded with THREE separate path-based syscalls
      // (statSync → realpathSync → readFileSync), each re-resolving the symlink independently, so a concurrent
      // attacker who wins a sub-ms race could point `<cas>/<xx>/<H>` at a small in-CAS regular file during the
      // stat/realpath checks and swap it to `/dev/zero`/a FIFO before the read — re-opening the OOM. The fix is
      // an ATOMIC fd-based read: check and read share ONE inode, pinned by a single open descriptor.
      //   (1) Open the final component with O_RDONLY|O_NOFOLLOW|O_NONBLOCK. O_NOFOLLOW ⇒ a symlink AT the final
      //       component fails to open (ELOOP) ⇒ MISS — this alone kills the symlink-based OOM AND the integrity
      //       escape at the final component (in-cas OR out-of-cas target), atomically, in one syscall.
      //       O_NONBLOCK ⇒ opening a FIFO returns immediately instead of blocking on a writer.
      //   (2) fstatSync on the OPEN fd (not the path): a CAS object is ALWAYS a small REGULAR file, so a device/
      //       FIFO/dir/socket (isFile() false) or an oversized file is a MISS — decided on the pinned inode.
      //   (3) Read the bytes FROM THAT SAME fd, so a post-open symlink swap cannot redirect the read.
      //   (4) The realpathSync sandbox is KEPT for INTERMEDIATE components — O_NOFOLLOW only covers the FINAL
      //       component, so a symlinked intermediate dir `<xx>` still needs the cas-root containment check.
      // Total on every branch (→ undefined, never a throw/hang); the fd is ALWAYS closed (finally).
      let fd: number | undefined
      try {
        fd = openSync(path, O_READ_NO_SYMLINK) // final-component symlink ⇒ ELOOP ⇒ throw ⇒ miss
        const st = fstatSync(fd) // on the pinned inode, not a re-resolved path
        if (!st.isFile() || st.size > MAX_CAS_BYTES) return undefined // non-regular / oversized ⇒ never read
        // intermediate-component sandbox: the final component is provably NOT a symlink (O_NOFOLLOW opened it),
        // so any symlink resolved on the way to it is an intermediate dir — the bytes must still live inside cas.
        // Asked of `isContainedIn`, the ONE containment predicate (containment.ts), rather than the string
        // comparison `real !== realCas && !real.startsWith(realCas + sep)` this used to be. NOT a live bypass
        // here and not described as one: `path` is `valuePath(casPath, h)`, a literal extension of `casPath`, so
        // there is no second source and no spelling that can diverge — probing the built module found exactly one
        // divergence and it was a FALSE MISS (a case-variant CAS root read as an escape, i.e. fail-closed, and
        // reachable only with write access inside the CAS root already). It changes for one reason: one question
        // deserves one answer, and the inode predicate has no false miss to explain.
        if (!isContainedIn(casPath, path)) return undefined // intermediate escapes ⇒ miss
        const raw = readFileSync(fd, "utf8") // FROM THE fd — the inode is pinned, no re-resolve
        let parsed: CasObject
        try {
          parsed = JSON.parse(raw) as CasObject
        } catch {
          return undefined // corrupt bytes
        }
        let rehash: Hash
        try {
          rehash = id(parsed)
        } catch {
          return undefined
        }
        // tamper-safe: the mandatory re-hash-on-read — bytes whose `id !== key` read as absent (adapt-store-1).
        if (rehash !== h) return undefined
        return parsed
      } catch {
        return undefined // ELOOP (final-component symlink) / ENOENT / any fs error ⇒ plain miss
      } finally {
        if (fd !== undefined) {
          try {
            closeSync(fd)
          } catch {
            /* best-effort close; the miss/hit decision above is already made */
          }
        }
      }
    },

    commitProjection<T>(decide: (projection: StoreProjection) => CommitDecision<T>): CommitResult<T> {
      // The CAS door handed to the commit is THIS store's own `put`, so the bytes a decision depends on are
      // durable before the generation that references them is linked into existence.
      return commitSidecar(
        ctxFor(casPath, PROJECTION_BASE, headSha, (o) => store.put(o as CasObject), trusted),
        decide,
      )
    },

    commitStaging<T>(decide: (projection: StoreProjection) => CommitDecision<T>): CommitResult<T> {
      return commitSidecar(
        ctxFor(casPath, STAGING_BASE, headSha, (o) => store.put(o as CasObject), trusted),
        decide,
      )
    },

    persistProjection(projection: StoreProjection): void {
      persistSidecar(
        ctxFor(casPath, PROJECTION_BASE, headSha, (o) => store.put(o as CasObject), trusted),
        projection,
      )
    },

    loadProjection(): StoreProjection | undefined {
      return readSidecarSet(sidecarDir(casPath), PROJECTION_BASE, trusted).projection
    },
  }
  return store
}

/** Rehydrate the territory `StoreProjection` from a disk-backed store, minting nothing (ADAPT-STORE-3). */
export function rehydrateProjection(store: DiskStore): StoreProjection {
  // pure read-back: reconstruct the projection from the durable sidecar, minting nothing — NEITHER
  // routeWrite/upsert NOR put. Missing sidecar ⇒ the empty projection (adapt-store-3, 12b).
  return store.loadProjection() ?? emptyStore()
}
