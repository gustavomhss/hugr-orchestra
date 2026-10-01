// @atlas/adapter-io — src/sidecar.ts  (the DURABLE MUTABLE SIDECAR: format + atomic commit protocol)
//
// SPLIT OUT OF store.ts along a real seam, not to dodge the 400-line cap. `store.ts` owns the CAS: an
// IMMUTABLE, content-addressed, write-once-per-key object store where "atomic" is free (a key's bytes never
// change, so a concurrent writer writes the SAME bytes). This file owns the opposite object — the ONE
// MUTABLE cell in the whole product, read-modify-written by every governed write door. Nothing about the
// CAS's discipline transfers to it, and the two were sharing a module header that made them look alike.
//
// ── WHAT WAS WRONG (both legs reproduced, with numbers) ──────────────────────────────────────────────────
// The sidecar was persisted by a bare `writeFileSync(path, …)` — `O_WRONLY|O_CREAT|O_TRUNC` ON THE LIVE
// INODE. That is an in-place truncate-and-rewrite, and both write doors are read-modify-whole-file-write.
//
//   LEG 1 — LOST UPDATE. Two writers each read a complete projection, each compute a whole-Map replacement,
//   and the second write erases the first writer's node. MEASURED with real `atlas emit` subprocesses:
//   8 concurrent writers over a 1000-node store lost 1–5 nodes in 6/6 trials — and EVERY writer exited 0
//   with `status: ok` and a printed content-address. The overwrite replaces the whole Map without ever
//   reading `tier`, so a billy-ratified T0 node is losable: every governance gate is bypassed AFTER it passed.
//
//   LEG 2 — TOTAL ANNIHILATION, amplified by the totality guard. A reader that catches `writeFileSync`
//   mid-flight sees a PREFIX of the new bytes; `JSON.parse` throws; the read returns `undefined` ("none
//   persisted", by design, so a corrupt file cannot crash the bins at boot); `rehydrateProjection` maps that
//   to `emptyStore()`; the door upserts into EMPTY and persists. MEASURED deterministically with ONE emit
//   and no concurrency: 90,610 bytes / 402 nodes, truncated to 54,366 ⇒ after one `atlas emit` (exit 0,
//   `status: ok`) the store was 469 bytes / 1 node. The CAS bytes survive but are ORPHANED — the projection
//   is the only index. "The file looked corrupt" and "there is no knowledge" were the SAME VALUE.
//
// ── THE PROTOCOL (why link(2), and why not the three cheaper things) ─────────────────────────────────────
// Rejected, each for a reason, so nobody re-litigates them from the diff:
//   · temp+rename ALONE does not fix leg 1. It gives atomic PUBLICATION (which kills leg 2), but two
//     writers each read a complete old file and each publish a complete new one — last rename wins.
//   · an O_EXCL advisory lock fixes both and BRICKS. A writer killed between create and unlink leaves a
//     lock nobody can prove stale without a pid-liveness probe or a wall clock ⇒ a permanently unwritable
//     store. `governed-emit.ts` twice names that failure shape as unacceptable.
//   · a generation counter + read-check-write is NOT a compare-and-swap: the check and the write are two
//     syscalls, so it recreates the race it names.
//
// WHAT IS BUILT (the protocol itself lives in `sidecar-commit.ts`; this file owns the FORMAT and the READ
// side it reads back — split only because the two together exceed the repo's 400-line ceiling, along the
// one seam that already existed): generation-named commit by `link(2)`, whole-decision retry, fail-closed on exhaustion.
//   1. READ the highest-numbered readable `<base>.<g>.json` (one `readdirSync`).
//   2. RUN the caller's WHOLE governed decision over that snapshot — pure and total (see `CommitDecision`).
//   3. WRITE the bytes to a unique temp `<base>.<pid>.<n>.tmp`, `fsync`, close. The pid+counter in that
//      name is load-bearing: a shared temp name is the same torn write one inode over.
//   4. `linkSync(tmp, <base>.<g+1>.json)`. `link(2)` fails ATOMICALLY with EEXIST when the name exists, so
//      exactly ONE concurrent writer creates generation g+1 — a genuine CAS that cannot brick, because the
//      loser holds nothing to leak. On EEXIST: RE-READ and RE-RUN the decision from scratch.
//   5. Publish the compat mirror, prune generations below g, unlink the temp.
// Bounded at MAX_ATTEMPTS; on exhaustion the caller gets a VISIBLE refusal. A refusal ranks strictly above
// a silent loss.
//
// THE RETRY MUST RE-RUN THE GATES, NOT RE-APPLY THE UPSERT. That is why the seam is
// `commit(decide: projection => Decision)` with `decide` PURE, and not a `persist(next)` with an internal
// retry. The T0-downgrade gate, the relocation gate and the `unauthorized for target` gate all read the
// INCUMBENT off the snapshot; re-publishing a decision computed against a STALE snapshot re-opens exactly
// the confused-deputy hole `governed-emit.ts`'s incumbent block was written to close — an attacker who
// loses the race would otherwise have their pre-gate decision applied to a projection that acquired a T0
// incumbent in between.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { CurrentNode, StoreProjection } from "@atlas/knowledge"
import { abstainedFromWire } from "./sidecar-abstained.js"
import type { AbstainedWire } from "./sidecar-abstained.js"
import type { SidecarTrust } from "./store-provenance.js"
import { classifyIdentity } from "./identity-schema.js"
import type { IdentityVerdict } from "./identity-schema.js"

/** The two mutable sidecars (ADR-0008): governed knowledge, and the explorer's CANDIDATE store. They share
 *  ONE implementation so their totality AND their atomicity cannot drift apart; they differ ONLY here. */
export type SidecarBase = "projection" | "staging"

/**
 * The durable wire shape: the `current` Map as entry-array, the `cas` Set as array — the single source of
 * truth (no dir-walk). "Byte-identical" is asserted as `deepEqual` after the JSON round-trip; the only lossy
 * corner is explicit `undefined`-valued properties (dropped consistently).
 *
 * `gen` is ADDITIVE and back-compatible exactly as `builtAt` is: absent ⇒ 0, so a sidecar written before
 * this protocol existed round-trips and its successor is generation 1. It is NOT the compare-and-swap (that
 * is the FILENAME — a field inside the file could only ever be read-check-written, which is the non-CAS this
 * protocol rejects); it carries the counter across a state where every generation file has been pruned or
 * removed by hand, so the sequence stays monotone instead of restarting at 1 over live data.
 */
export interface WireProjection {
  readonly current: ReadonlyArray<readonly [string, CurrentNode]>
  readonly cas: readonly string[]
  /** ADR-0015 D3 / #99b — the durable honest-ABSTENTION ledger (`StoreProjection.abstained`), Map as an
   *  entry-array exactly like `current`, keyed by `negationKey`. The N2 door's round-trip obligation (the
   *  frozen seam header names it): without it an abstention does not survive restart and #202 stays open.
   *  ADDITIVE — absent ⇒ no abstentions, a pre-#99b sidecar round-trips unrewritten; never a fact, never CAS.
   *  The (de)serialization lives in `sidecar-abstained.ts` so the read + write halves cannot drift. */
  readonly abstained?: AbstainedWire
  /** N11 PROJECTION-level freshness watermark (HEAD sha at persist); absent ⇒ unknown (old sidecars).
   *  NO LONGER THE LOAD-BEARING SIGNAL — the watermark is per ROW (`CurrentNode.derivedAt`, which rides
   *  inside `current` and needs no line here). This field survives as the reader's back-compat FALLBACK for a
   *  row carrying no stamp of its own, which is every row of every store written before that. As the only
   *  signal it was laundered by any write at all — see `freshness-watermark.ts` for the measured repro. */
  readonly builtAt?: string
  readonly gen?: number // the generation these bytes were published as; absent ⇒ 0 (pre-protocol sidecars)
  /**
   * #112 — the IDENTITY SCHEMA these bytes' hashes and anchor keys were minted under (`identity-schema.ts`
   * `IDENTITY_SCHEMA`). Stamped by `publish`; ABSENT means the schema is UNKNOWN.
   *
   * IT IS THE ONE ADDITIVE FIELD HERE WHOSE ABSENCE IS NOT BENIGN, and the contrast with its neighbours is
   * the point. `builtAt` absent ⇒ "watermark unknown", which a reader treats conservatively; `gen` absent ⇒
   * 0, and a pre-protocol sidecar genuinely IS generation 0. Both are harmless because what they describe is
   * OUTSIDE the data. This one describes what every hash in the file MEANS: read an unstamped store as
   * though it were current and every anchor silently resolves against rules that did not produce it. So
   * absent is `unstamped` ⇒ refused on the write doors, never assumed-current (see `identity-schema.ts` for
   * why an untagged past cannot honestly be given a version number).
   */
  readonly identity?: string
}

/** The outcome of ONE `decide` pass. `next` ABSENT ⇒ the decision writes NOTHING (a governed refusal): no
 *  temp, no link, no byte touched — the door's fail-closed contract, unchanged. `put` names the CAS objects
 *  that MUST be durable BEFORE the projection referencing them is published (the driftFacts/doctor read-back
 *  invariant: the sidecar can never point at a contentHash whose bytes are absent). */
export interface CommitDecision<T> {
  readonly out: T
  readonly next?: StoreProjection
  readonly put?: readonly unknown[]
}

/** Why a commit did not settle. All three are VISIBLE refusals the door reports — never a silent no-op.
 *  `contended`  — MAX_ATTEMPTS generations were published under this writer; the store is alive, this
 *                 write is not. Retry is the caller's to make.
 *  `unreadable` — a sidecar EXISTS but no generation of it parses. Reads still degrade to empty (a corrupt
 *                 file must never crash a bin at boot); a WRITE must not, because writing onto `emptyStore`
 *                 is precisely the leg-2 amplifier that turned a torn read into a 402-node erasure.
 *  `untrusted`  — the sidecar is TRACKED BY GIT, so it arrived by COMMIT rather than through a door
 *                 (`store-provenance.ts`). Distinct from `unreadable` on purpose: unreadable is a storage
 *                 fault that may heal, this is a governance fault that will not, and reporting one as the
 *                 other would send an operator to fsck instead of to `git rm --cached`. */
export type CommitRefusal = "contended" | "unreadable" | "untrusted"

/** A decision that SETTLED (it may still be a governed refusal — see `CommitDecision.next`), or one that
 *  could not be durably resolved at all. */
export type CommitResult<T> =
  | { readonly settled: true; readonly out: T }
  | { readonly settled: false; readonly refusal: CommitRefusal }

/** What a commit needs from its owner: where the sidecar lives, which one it is, the N11 watermark seam,
 *  and the CAS write door (invoked before publication — see `CommitDecision.put`). */
export interface SidecarCtx {
  readonly dir: string
  readonly base: SidecarBase
  readonly headSha?: (() => string | undefined) | undefined
  readonly put: (obj: unknown) => unknown
  /** The provenance seam (`store-provenance.ts`), injected by the composition root exactly as `headSha` is.
   *  ABSENT ⇒ never consulted ⇒ the pre-existing behaviour (tests, non-git trees). */
  readonly trusted?: SidecarTrust | undefined
}

/** The compat mirror: the fixed, pre-protocol name. NEVER the compare-and-swap target — it is republished
 *  by `rename` from the winning temp inode purely so tools and tests that know `.atlas/projection.json`
 *  keep finding a COMPLETE file there. Under concurrency it may lag the true head by one generation, which
 *  is why every read below prefers a generation file and only falls back here. */
export const mirrorPath = (dir: string, base: SidecarBase): string => join(dir, `${base}.json`)
export const genPath = (dir: string, base: SidecarBase, g: number): string => join(dir, `${base}.${g}.json`)

/** One published generation NAME matched on disk, carrying BOTH the parsed number (for ordering/pruning) and
 *  the exact filename the regex matched (for opening). Kept together on purpose: `genPath(dir, base, g)` is
 *  the WRITER's canonical (unpadded) namer, and `Number(m[1])` does not invert it — `"007"` parses to `7` but
 *  `genPath(…, 7)` renders `"7"`, a DIFFERENT string. A reader that lists names, keeps only the number, and
 *  re-derives a path from that number can therefore try to open a file it never saw (ENOENT on a byte-intact
 *  generation). {@link listGenerations} exists so `readSidecarSet` below opens the name it actually matched,
 *  never a name it recomputed — one derivation, so listing and opening cannot disagree. */
interface GenEntry {
  readonly g: number
  readonly name: string
}

/** The one implementation behind both {@link generations} and the read path: every `<base>.<digits>.json`
 *  name on disk, descending by the parsed number — including ones that fail to parse as JSON later (a corrupt
 *  generation still OCCUPIES its name, so the next commit must aim ABOVE it or link forever onto EEXIST).
 *  Total: an absent directory is "no generations", never a throw.
 *
 *  THE SORT IS A TOTAL ORDER ON THE ENTRY, NOT JUST ON `g` — `b.g - a.g` alone is only a total order on the
 *  NUMBER, and two distinct filenames can carry the same number (`"7.json"` and `"007.json"` both parse to
 *  `7`). Without a tiebreak, which of the two sorts first is decided by `readdirSync`'s return order —
 *  filesystem- and inode-dependent, not a property of the store — so `readSidecarSet` below (which returns
 *  the FIRST entry that parses) could serve either one nondeterministically. The lexicographic tiebreak on
 *  `name`, same shape as `git-history.ts`'s `byPath`, makes the answer a pure function of the bytes on disk
 *  again; it is NOT a claim that one name is more authoritative than the other. */
function listGenerations(dir: string, base: SidecarBase): GenEntry[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const re = new RegExp(`^${base}\\.(\\d{1,15})\\.json$`)
  const out: GenEntry[] = []
  for (const name of names) {
    const m = re.exec(name)
    if (m !== null) out.push({ g: Number(m[1]), name })
  }
  return out.sort((a, b) => b.g - a.g || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** Every published generation NUMBER present on disk, descending — including ones that fail to parse (a
 *  corrupt generation still OCCUPIES its name, so the next commit must aim ABOVE it or link forever onto
 *  EEXIST). Total: an absent directory is "no generations", never a throw.
 *
 *  NUMBERS ONLY, on purpose: `sidecar-commit.ts`'s callers (aiming the next `link`, pruning old ones) only
 *  ever need the ORDER, and every name this protocol itself publishes is canonical (`genPath`, unpadded) — so
 *  re-deriving `genPath(dir, base, g)` from one of these numbers is safe THERE, because the writer is
 *  re-deriving its OWN naming convention. It is not safe for a READER facing a generation file this protocol
 *  did not name (a hand copy, a restore, a padded rename) — see {@link listGenerations}, which the read path
 *  uses instead so it never re-derives a second path from a number this function already discarded. */
export function generations(dir: string, base: SidecarBase): number[] {
  return listGenerations(dir, base).map((e) => e.g)
}

// THE GOVERNANCE CARRIER (ADR-0007: `CurrentNode.scope` / `.tier`) NEEDS NO LINE HERE, and that is worth
// stating rather than leaving as an absence a later reader has to re-derive. `current` serializes the WHOLE
// `CurrentNode`, so the two fields round-trip by construction — the same way `sameAs` did, with no edit to
// this format — and an OLD sidecar that carries neither round-trips UNREWRITTEN: JSON simply has no key,
// which reads back as `undefined`, which is the ABSENT the doors treat as "authority unconfirmable". The
// same is true of `gen`, added below: absent ⇒ 0, and a pre-protocol sidecar is generation 0 by definition.
// AND OF `CurrentNode.derivedAt` (N11 per-row freshness watermark), added later on the same terms and named
// here so the absence of a line is a recorded decision rather than an omission: it rides inside the row, so
// an old sidecar round-trips UNREWRITTEN and reads back `undefined`, which the reader resolves to the
// projection-level `builtAt` fallback. Nothing in the format changed to carry it.
//
// NOR IS THERE A READ-SIDE VALIDATOR FOR THEM, DELIBERATELY. `isKeyedEntry` below rejects the WHOLE file on
// a bad row, which is right for the representation invariant (a row whose key is not its own `nodeKey` is a
// shape no producer can make). Governance is different on both counts: ABSENT is legitimate and must not
// reject anything, and MALFORMED must not be a way to make a whole store unloadable — that would hand anyone
// who can write one byte of this file a total-denial primitive, where today the worst case is one node that
// fails closed. So the guard lives at the CONSUMPTION point instead, where both doors apply `isScope` and
// the total tier lattice to the row before trusting it (see `governed-emit-incumbent.ts`). The rule: this
// file decides whether the sidecar is STRUCTURALLY a projection; the doors decide whether a given row can
// authorize a given actor.

/**
 * Is `e` a well-formed `[nodeKey, CurrentNode]` entry — one whose MAP KEY IS the row's OWN `nodeKey`?
 *
 * THE representation invariant of `StoreProjection.current` ("nodeKey → the ONE current node", KNOW-4g). Every
 * in-process producer holds it by construction: `upsert` only ever `current.set(req.nodeKey, {nodeKey:
 * req.nodeKey, …})`, and `linkSameAs` re-sets rows at the key it fetched them by. NOTHING re-established it
 * across the disk round-trip, and `new Map(wire.current)` accepts any entry array whatsoever — so a row
 * written at key `M` declaring `nodeKey: B` rehydrated into a typed `StoreProjection` that no producer could
 * have made, and every consumer downstream reads one of the two identities without knowing the other exists.
 * Measured consequence: `sameAsClassOf` SEEDS on the map key but EXPANDED on `nodeKey`, so `classOf(M)`
 * collapsed to the singleton `[M]` and `governed-link.ts` resolved ZERO class members — pricing its authz
 * and its ratify gates over nothing. Class SHRINKAGE is the bypass direction. This is IN the threat model:
 * `@atlas/knowledge` `ratify/tier.ts` names this very file as untrusted input ("a CAS blob out of a COMMITTED
 * `.atlas/` directory … none of those is trusted and none was validated"). `isTier` exists because of that
 * sentence; the same reasoning covers every other field the projection carries, `nodeKey` included.
 */
function isKeyedEntry(e: unknown): e is readonly [string, CurrentNode] {
  if (!Array.isArray(e) || e.length !== 2) return false
  const [key, row] = e as readonly unknown[]
  if (typeof key !== "string" || row === null || typeof row !== "object") return false
  // `nodeKey === key` also settles its TYPE (`key` is a string) — no separate typeof needed, and no coercion:
  // `===` is byte-exact, so no case-folding, no trimming, no Unicode normalization can smuggle a mismatch.
  return (row as { readonly nodeKey?: unknown }).nodeKey === key
}

/**
 * Read ONE sidecar file back.
 *
 * TOTAL (mirrors `get` in store.ts): a missing OR corrupt/unparseable/shape-invalid file reads as "none
 * persisted" (`undefined`) — NEVER a throw. A throw here would crash `rehydrateProjection` (and thus BOTH
 * bins) at boot, since composeRuntime rehydrates at startup.
 *
 * ALL-OR-NOTHING, deliberately: one invariant-violating row rejects the WHOLE file, exactly as one corrupt
 * byte already does. Dropping only the offending ROW would be the strictly worse design — it hands an
 * attacker who can write this file a SELECTIVE "make this node non-current" primitive, and `governed-link.ts`
 * deliberately SKIPS a class member that is not a current node (a retired key is nobody's authority), so a
 * targeted drop is exactly the under-pricing this guard exists to stop. Rejecting the file no longer means
 * "the store is empty", which is the change that disarms leg 2: the
 * caller below tries the PREVIOUS generation, and a write refuses outright rather than starting from empty.
 */
function readOne(path: string): { projection: StoreProjection; gen: number; identity: unknown } | undefined {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return undefined // ENOENT / none persisted yet
  }
  let wire: WireProjection
  try {
    wire = JSON.parse(raw) as WireProjection
  } catch {
    return undefined // corrupt / truncated bytes
  }
  // shape guard: the entry-array and value-array must be arrays before Map/Set construction, else a
  // valid-JSON-but-wrong-shape sidecar (e.g. `{}`, `[]`, `{current:5}`) throws in `new Map(...)`.
  if (!wire || !Array.isArray(wire.current) || !Array.isArray(wire.cas)) return undefined
  // INTEGRITY guard (a TOOTH, not defence-in-depth): every entry must be a `[key, row]` pair whose key IS
  // `row.nodeKey`. `new Map(wire.current)` accepts ANY entry array, so without this the disk round-trip is
  // the one producer in the system that can mint a `StoreProjection` violating its own representation
  // invariant. See `isKeyedEntry` for the measured bypass.
  if (!wire.current.every(isKeyedEntry)) return undefined
  try {
    // N11: carry the watermark back only when a STRING was persisted (a non-string wire value ⇒ omit ⇒
    // "unknown", the conservative reader default). Same discipline for `gen`: a non-finite/negative value
    // is untrusted input from a file anyone with write access can forge, so it reads as 0.
    const builtAt = typeof wire.builtAt === "string" ? { builtAt: wire.builtAt } : {}
    const gen = typeof wire.gen === "number" && Number.isSafeInteger(wire.gen) && wire.gen >= 0 ? wire.gen : 0
    // #99b — the ABSTENTION ledger, rehydrated only from a well-shaped entry-array (sidecar-abstained.ts).
    const abstained = abstainedFromWire(wire.abstained)
    // #112: the raw stamp is carried out UNJUDGED and UNCOERCED. Classification is `classifyIdentity`'s job
    // (it is total over `unknown`), and keeping the raw value means a `foreign` refusal can quote the tag it
    // actually found rather than "something else" — the one concrete thing such a store can say about itself.
    return {
      projection: { current: new Map(wire.current), cas: new Set(wire.cas), ...builtAt, ...abstained },
      gen,
      identity: wire.identity,
    }
  } catch {
    return undefined // malformed entries (e.g. a non-[k,v] element)
  }
}

/** What a read of the sidecar SET resolved to.
 *  `projection` — the newest READABLE state, or `undefined` when nothing readable exists.
 *  `top`        — the highest generation NAME on disk (readable or not) ∪ the mirror's own `gen`. The next
 *                 commit targets `top + 1`; aiming at a corrupt generation's name would EEXIST forever.
 *  `unreadable` — a sidecar file exists but nothing parsed. Reads ignore this (degrade to empty); writes
 *                 must not (leg 2). */
export interface SidecarRead {
  readonly projection: StoreProjection | undefined
  readonly top: number
  readonly unreadable: boolean
  /** The durable store is COMMITTED (`store-provenance.ts`). `projection` is forced to `undefined`, so a
   *  read serves nothing; a WRITE must refuse rather than persist over it (see `commitLoop`). */
  readonly untrusted: boolean
  /**
   * #112 — which IDENTITY SCHEMA minted the hashes and anchor keys in the state above
   * (`identity-schema.ts`). `current` for a store this build wrote AND for a store that does not exist yet
   * (nothing to judge; a fresh install must not be refused).
   *
   * UNLIKE `untrusted`, THIS DOES NOT BLANK `projection`, and the asymmetry is deliberate. A committed store
   * is somebody else's content, so serving it is the harm. A foreign-schema store is the user's OWN
   * knowledge, and the drift oracle already refuses it fact-by-fact (an unresolvable anchor is DRIFTED,
   * which `buildGate` collapses to `NA`) — so emptying it would add no safety and would replace "everything
   * drifted, with no explanation" with "there is nothing here, with no explanation". The teeth go where a
   * wrong answer is DESTRUCTIVE instead: `commitLoop` refuses every write, because publishing over this
   * store would stamp the successor generation with the CURRENT schema — so a store whose anchors were
   * minted under other rules would permanently assert, in one write, that they were minted under these ones.
   * (Not an ERASURE: the rows ARE carried forward, since `decide` reads them. It is a LAUNDERING, which is
   * the same shape `store-provenance.ts` refuses for a committed store and for the same reason.)
   */
  readonly identity: IdentityVerdict
  /** The raw stamp string found on disk when {@link SidecarRead.identity} is `foreign`; `undefined`
   *  otherwise (including `unstamped`, where the whole point is that there is nothing to report). */
  readonly identityFound?: string | undefined
}

/**
 * Read the current sidecar state: newest readable generation first, THEN the previous one, and only then
 * the pre-protocol mirror.
 *
 * The g-1 fallback is the free half of the leg-2 fix. Publication is now atomic, so a generation file is
 * never torn — but if one is corrupted from OUTSIDE (a bad restore, a stray write, media rot), "unreadable"
 * used to collapse straight to `emptyStore()`. It now costs one extra parse to fall back to the state before
 * it, which is exactly one governed write behind rather than a total loss.
 */
export function readSidecarSet(dir: string, base: SidecarBase, trusted?: SidecarTrust): SidecarRead {
  const gens = listGenerations(dir, base)
  const top = gens.length > 0 ? gens[0]!.g : undefined
  // PROVENANCE FIRST — before a single byte of the store is parsed. A committed store must not be able to
  // influence anything, including which error the caller sees, so this returns BEFORE `readOne`. `top` is
  // still reported honestly (it is a directory listing, not store content) so no caller has to special-case
  // it; nothing may write here anyway.
  if (trusted !== undefined && !trusted()) {
    // PROVENANCE STRICTLY PRECEDES SCHEMA, and `identity: 'current'` here is a statement about WHICH GATE
    // SPOKE, not a claim about the bytes: a committed store's stamp is attacker-chosen, so it must not be
    // able to influence which refusal a caller sees. The provenance answer is the only one on offer.
    return { projection: undefined, top: top ?? 0, unreadable: false, untrusted: true, identity: "current" }
  }
  for (const entry of gens) {
    // OPEN THE NAME JUST MATCHED, not a name re-derived from its number: `join(dir, entry.name)`, never
    // `genPath(dir, base, entry.g)`. A non-canonical on-disk name (e.g. zero-padded `"007"`, parsed to the
    // same `7`) round-trips through `Number()` but not back through `genPath` — re-deriving would ENOENT on a
    // generation file whose every byte is intact. One derivation (the regex match above), so listing and
    // opening can never disagree.
    const hit = readOne(join(dir, entry.name))
    if (hit !== undefined)
      return {
        ...withIdentity(hit.identity),
        projection: hit.projection,
        top: top!,
        unreadable: false,
        untrusted: false,
      }
  }
  const legacy = readOne(mirrorPath(dir, base))
  if (legacy !== undefined) {
    // No readable generation: the mirror's own counter keeps the sequence monotone over a store whose
    // generation files were pruned or hand-deleted, so a successor never reuses a name that once held
    // different bytes.
    return {
      ...withIdentity(legacy.identity),
      projection: legacy.projection,
      top: Math.max(top ?? 0, legacy.gen),
      unreadable: false,
      untrusted: false,
    }
  }
  const anyFile = top !== undefined || existsSync(mirrorPath(dir, base))
  // NOTHING PERSISTED ⇒ `current`. There are no stored hashes, so there is no schema to be wrong about, and
  // any other answer would refuse every write in every fresh repo — bricking the product on install.
  return { projection: undefined, top: top ?? 0, unreadable: anyFile, untrusted: false, identity: "current" }
}

/** The identity fields for one raw stamp. `identityFound` is reported ONLY for `foreign`: `unstamped` has
 *  nothing to report by definition, and `exactOptionalPropertyTypes` makes the difference between "absent"
 *  and "present but undefined" load-bearing, so the key is spread in rather than set to `undefined`. */
function withIdentity(stamp: unknown): { identity: IdentityVerdict; identityFound?: string } {
  const identity = classifyIdentity(stamp)
  return identity === "foreign" ? { identity, identityFound: String(stamp) } : { identity }
}
