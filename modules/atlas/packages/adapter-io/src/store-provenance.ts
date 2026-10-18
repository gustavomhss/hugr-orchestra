// @atlas/adapter-io — src/store-provenance.ts  (WHERE the durable store came from, not what it contains)
//
// Every other guard in this package decides what a WRITE may do. This one decides whether the thing the
// doors are reading is a durable store AT ALL, or a document somebody committed.
//
// ── THE HOLE ─────────────────────────────────────────────────────────────────────────────────────────────
// `.atlas/projection.json` and `.atlas/cas/**` are ordinary files in an ordinary working tree. A repository
// can SHIP them. One landed commit publishes rows carrying any `nodeKey`, any `scope`, any `tier` and any
// `contentHash`, plus the CAS blobs they point at — and NO DOOR IS INVOLVED, so there is nothing for the
// truth gate, the authz gate, the incumbent gate, the ratify gate or the tier lattice to refuse. Reproduced
// end to end in `test/store-provenance.test.ts`: with `authz.scopes = {}` (the fail-closed default, under
// which every write door denies every write), a committed projection is served as a ratified `T0` pack
// invariant. `pack-shape.ts` already names this entry point in its own header; this module closes it.
//
// ── WHY `.gitignore` IS NOT THE CONTROL ──────────────────────────────────────────────────────────────────
// `.gitignore` denies `.atlas/*` (landed in `482c68c`) and that line is worth keeping: it stops the ACCIDENT,
// which is the common case and the one that costs a real team real time. It is not a control against an
// adversary. `git add -f` overrides it in one flag, and the result is a file in a commit that reads exactly
// like every other file in that commit. This repo has already been bitten twice by the same shape — a check
// the caller must remember is not a control — and a `.gitignore` line is that pattern with the committer as
// the caller.
//
// ── WHY "CONTENT-VERIFICATION ON LOAD" IS NOT THE CONTROL EITHER ─────────────────────────────────────────
// This is the part worth being precise about, because it is the natural fix and it does not work.
//
// The store ALREADY content-verifies, thoroughly: `store.get` re-hashes every CAS object and serves
// `undefined` unless `id(bytes)` equals the key it was fetched by (store.ts, the tamper-safe read), and the
// emit door's ADR-0007 corroboration gate additionally requires a row's `scope` to AGREE with its own stored
// bytes. Both of those pass for a committed store, and they pass BY CONSTRUCTION: the attacker who writes
// the file also computes the hashes, with the product's own `id()`, exactly as a door would. The regression
// fixture does precisely that in ~5 lines.
//
// Content-addressing authenticates INTEGRITY — "these bytes are the bytes this hash names". The question
// here is PROVENANCE — "did a governed door decide these bytes may be here". No amount of hashing answers it,
// because hashing is not keyed: there is no secret an attacker lacks. The only content-verification that
// WOULD answer it is an authenticated one (a MAC or signature over the projection under a key the committer
// does not hold), and this product has no key material, no key distribution, and nowhere to put a key that a
// committer could not also read. Building a fake one — a "signature" everyone can compute — would be strictly
// worse than this module: it would LOOK like authentication in every review that followed.
//
// ── WHAT IS ACTUALLY BUILT ───────────────────────────────────────────────────────────────────────────────
// A provenance tripwire, and it is deliberately the cheap, total, unforgeable question: IS THE DURABLE STORE
// TRACKED BY GIT? A door writes it to the working tree and never stages it. A commit is the ONLY way it
// becomes tracked. So `git ls-files` separates the two populations exactly, with no heuristics — and, unlike
// `.gitignore`, it is not weakened by `-f`: `-f` is what puts the file in the index, which is the very thing
// being detected. The attacker's one flag is what trips the wire.
//
// FAIL-CLOSED ON DETECTION, and routed through machinery that already exists: a tripped wire makes the read
// resolve to "nothing readable", so reads serve NOTHING (never the forged rows) and writes take the existing
// `settled:false` refusal path rather than upserting into an empty store and persisting — which is the leg-2
// amplifier `sidecar.ts` documents, and would here also LAUNDER the attacker's file into a door-produced one
// and destroy the evidence.
//
// THE SEAM IS INJECTED, NOT IMPORTED. `store.ts` is deliberately git-ignorant ("the store stays git-ignorant"
// — its own header); `compose.ts` owns git and already injects the N11 `headSha` watermark the same way. So
// this is a second seam of the same shape, absent in tests and non-git trees, which is also why every
// existing suite is unaffected: no seam ⇒ no check ⇒ the pre-existing behaviour, unchanged.
//
// ── TRAVEL-BY-REPROOF (owner-authorized 2026-08-18) — WHY THE BLANKET REFUSAL NARROWED ───────────────────
// The tripwire above answers ONE question: "did this arrive by commit". That was, until now, the WHOLE
// provenance story, because there was nothing else to ask — a committed row carried no way to re-derive
// itself, so "committed" and "untrustworthy" were the same fact. #195 (SEAL-CARRIES-ITS-WITNESS) changed
// that for exactly one shape: a `seal:'proven'` fact now carries `witness` — its OWN derivation — and
// `reverify-store.ts` replays it through the sound oracle. A `proven` fact that RE-PROVES against the LIVE
// index is true regardless of who committed it or when; provenance stopped mattering for that one shape,
// because the oracle is checking the CLAIM, not the committer.
//
// So the question this module answers is now THREE-WAY, not two, and `StoreProvenance` names the three
// populations: `trusted` (nothing durable tracked — every existing repo, unchanged), `tracked-staging`
// (ADR-0008 unratified candidate material — nothing there ever passed a door or carries a replayable
// witness, so the blanket refusal is EXACTLY as load-bearing as it always was), and `tracked-provable`
// (`projection`/`cas` tracked, staging is not — the population that used to be refused wholesale and is now
// served FILTERED to the facts that replay `re-proven`, per `reverify-store.ts`). Trust moved from the
// commit to the oracle for that one population; it did not move anywhere for the other two.
//
// `gitStoreProvenance` is the canonical three-way answer, ONE `git ls-files` call, memoized identically to
// the boolean predicate below. `gitSidecarTrust` (unchanged export, unchanged callers — `store.ts`'s
// write-gate, `mine.ts`) is now DERIVED from it: `trusted() === (provenance() === 'trusted')`, so every
// existing write-gating / case-1 / case-3 read-gating consumer sees BYTE-IDENTICAL behaviour to before this
// change — only a caller that asks the richer question can tell `tracked-staging` apart from
// `tracked-provable`, and today only `compose.ts` does.

import { runGit } from "./run-git.js"

/** "May the durable sidecar be trusted?" — `false` iff it demonstrably arrived by COMMIT rather than through
 *  a door. Absent (tests, non-git trees) ⇒ never consulted ⇒ the pre-existing behaviour. */
export type SidecarTrust = () => boolean

/** Is `p` (a repo-relative, forward-slash git path) part of the DURABLE STORE — the sidecar families and the
 *  CAS? Deliberately NOT "anything under `.atlas/`": `policy.json` is admin-owned source and MUST stay in
 *  git (that is the whole point of the policy lock), so a broad rule would fire on every healthy repo and be
 *  turned off within a day. Matches the two sidecar FAMILIES by their generation-naming (`sidecar.ts`
 *  `genPath`/`mirrorPath`) and the whole CAS subtree. */
export function isDurableStorePath(p: string): boolean {
  if (p.startsWith(".atlas/cas/")) return true
  const m = /^\.atlas\/(projection|staging)(\.\d{1,15})?\.json$/.exec(p)
  return m !== null
}

/** Is `p` the ADR-0008 candidate sidecar family — unratified LLM-proposed material that never passed a
 *  door and carries no replayable witness. Narrower than {@link isDurableStorePath}: matches `staging`
 *  ONLY, never `cas/` or `projection`, so the two families can be told apart without a second file walk. */
function isStagingPath(p: string): boolean {
  return /^\.atlas\/staging(\.\d{1,15})?\.json$/.test(p)
}

/** Is `p` the RE-PROVABLE half of the durable store — `projection` rows or the CAS blobs they cite. Every
 *  fact this covers CAN carry a `witness` (`reverify-store.ts`); staging cannot, which is why it is excluded
 *  here and matched only by {@link isStagingPath}. */
function isProvableStorePath(p: string): boolean {
  return p.startsWith(".atlas/cas/") || /^\.atlas\/projection(\.\d{1,15})?\.json$/.test(p)
}

/**
 * The three-way provenance verdict for a repo's durable store (TRAVEL-BY-REPROOF). Closed vocabulary:
 *   - `trusted`           — nothing durable is tracked by git. Every existing repo. UNCHANGED behaviour.
 *   - `tracked-staging`    — `.atlas/staging*.json` is tracked (whatever else is or isn't). FLAT REFUSAL,
 *                            unchanged: nothing there passed a door, nothing carries a replayable witness.
 *   - `tracked-provable`   — `.atlas/projection*.json` and/or `.atlas/cas/**` are tracked, and staging is
 *                            NOT. Narrowed: served, filtered to facts that replay `re-proven`.
 * Staging tracked takes PRIORITY over provable tracked — a repo that committed everything gets the flat
 * refusal, never the filtered serve, because staging's presence alone is disqualifying regardless of what
 * else rode along with it.
 */
export type StoreProvenance = "trusted" | "tracked-staging" | "tracked-provable"

function classify(tracked: readonly string[]): StoreProvenance {
  if (tracked.some(isStagingPath)) return "tracked-staging"
  if (tracked.some(isProvableStorePath)) return "tracked-provable"
  return "trusted"
}

/**
 * The git-backed THREE-WAY provenance seam for a repo (TRAVEL-BY-REPROOF) — the canonical answer
 * {@link gitSidecarTrust} below is a boolean projection of. Returns a MEMOIZED predicate: ONE `git ls-files`
 * call for the life of the runtime, exactly like the boolean form (the two must never each pay their own
 * call — see this module's header for why a caller that needs both derives the boolean from THIS function
 * rather than constructing a second seam).
 *
 * TOTAL, same limits as {@link gitSidecarTrust}: `runGit` failure (no git / not a repo / any exec failure)
 * reads as "no evidence of a commit" ⇒ `trusted`.
 */
export function gitStoreProvenance(repoPath: string): () => StoreProvenance {
  let cached: StoreProvenance | undefined
  return () => {
    if (cached !== undefined) return cached
    let out: string
    try {
      out = runGit(repoPath, ["ls-files", "-z", "--", ".atlas"])
    } catch {
      cached = "trusted"
      return cached
    }
    const tracked = out.split("\0").filter((p) => p.length > 0)
    cached = classify(tracked)
    return cached
  }
}

/**
 * The git-backed provenance seam for a repo. Returns a MEMOIZED predicate: the question is asked at most
 * once per composed runtime (the answer cannot change under a running process without a commit, and a
 * `git ls-files` per query would be paid on every read).
 *
 * TOTAL. `runGit` throws for a non-repo, an absent git, or any exec failure; all of those mean "git cannot
 * tell us", and the honest answer to "did this arrive by commit" is then "no evidence that it did" ⇒ trusted.
 * That is a real, stated limit rather than a hidden one: a store shipped in a TARBALL (no git anywhere) is
 * not detected by this check, and nothing here claims otherwise.
 *
 * `-z` is not a detail: git quotes and escapes unusual pathnames in its default output, and a NUL-delimited
 * listing split in-process is the only form that survives a filename containing a newline or a quote.
 *
 * DERIVED FROM {@link gitStoreProvenance} (TRAVEL-BY-REPROOF): `true` iff the three-way verdict is
 * `'trusted'` — BYTE-IDENTICAL to the pre-existing "is anything durable tracked" question, because
 * `tracked-staging` and `tracked-provable` both used to collapse to `false` here and still do. Every
 * existing caller (`store.ts`'s write-gate, `mine.ts`) is therefore unaffected by this change; own memoized
 * closure, own single `git ls-files` call, exactly as before — a caller that wants the RICHER answer calls
 * {@link gitStoreProvenance} directly instead of reconstructing it from this boolean.
 */
export function gitSidecarTrust(repoPath: string): SidecarTrust {
  const provenance = gitStoreProvenance(repoPath)
  return () => provenance() === "trusted"
}
