// @atlas/adapter-io — src/sidecar-commit.ts  (the ATOMIC COMMIT PROTOCOL over the durable sidecar)
//
// The write half of `sidecar.ts` — read it first: it carries the two MEASURED legs this protocol exists to
// close (an 8-writer race losing 1–5 nodes with every writer reporting `status: ok`; one emit onto a torn
// sidecar collapsing 402 nodes to 1), the three cheaper designs that were rejected with reasons, and the
// format. Split out of that file for the 400-line ceiling, along the seam that was already there: FORMAT +
// READ there, COMMIT here. Nothing else imports this module — the `DiskStore` methods are its only callers.
//
// The protocol, end to end:
//   1. READ the newest readable generation (`readSidecarSet`), remembering the highest NAME on disk.
//   2. RUN the caller's whole governed decision over that snapshot — pure, so it can be re-run.
//   3. WRITE the bytes to a pid-unique temp, `fsync`, close.
//   4. `link(2)` the temp to `<base>.<top+1>.json`. EEXIST ⇒ another writer got there first ⇒ go to 1.
//   5. VERIFY what winning that name actually MEANT (see `publish`): the head, a generation someone has
//      since built ON — both durable — or a RECYCLED name, which is a silent loss. All three were measured,
//      none theorised, and collapsing the middle one into the last is what made a pass disown its own rows.
//   6. Republish the compat mirror, prune, sync the directory — the HEAD publisher's housekeeping only.

import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { emptyStore } from "@atlas/knowledge"
import type { StoreProjection } from "@atlas/knowledge"
import { generations, genPath, mirrorPath, readSidecarSet } from "./sidecar.js"
import { abstainedToWire } from "./sidecar-abstained.js"
import type { CommitDecision, CommitResult, SidecarBase, SidecarCtx, WireProjection } from "./sidecar.js"
import { IDENTITY_SCHEMA, refuseForeignIdentityWrite } from "./identity-schema.js"
import { stampGeneration } from "./freshness-watermark.js"

/** How many times a contended writer re-reads and re-decides before refusing. Bounded so a pathological
 *  writer cannot spin forever; the size is MEASURED, not guessed. At 16 an 8-process TIGHT COMMIT LOOP
 *  (five back-to-back commits per process, no work in between — far harsher than the one-commit-per-process
 *  shape the CLI produces) exhausted the budget on 1.25% of commits: a correct, visible refusal, but poor
 *  liveness. At 64 the same stress shows none. The real `atlas emit` race (8 concurrent CLI processes over
 *  a 1000-node store, 18 trials) never retries more than a handful of times. */
const MAX_ATTEMPTS = 64

/** How many generations survive the prune: head + 3 predecessors. The window is kept wide enough that
 *  recycling is rare and narrow enough that the directory holds a bounded multiple of the projection's size.
 *
 *  IT IS NO LONGER ONLY A LIVENESS KNOB, and the correction matters more than the constant: this number is
 *  what MAKES a generation name reusable, so it is also the exact bound the head verification in `publish`
 *  uses to tell a recycled name from a successor (see {@link PublishOutcome}). Shrinking it still only costs
 *  retries; changing it moves that bound with it, which is why the boundary is pinned on both sides by a
 *  test rather than left to this comment. The previous sentence here — "correctness does NOT depend on
 *  this" — was true of the check as first written and is false of the one below. */
const RETAINED_GENERATIONS = 4

/** Process-unique temp discriminator. `pid` separates processes; the counter separates concurrent commits
 *  INSIDE one process (an in-process MCP session runs both doors). Sharing a temp name between two writers
 *  reintroduces the torn write this whole protocol exists to remove. */
let tmpCounter = 0

/**
 * What one publication attempt DID — three outcomes, not two, and the third is why this type exists.
 *
 *   `published`  — the generation was linked and IS the head. The winner's housekeeping (mirror, dir sync,
 *                  prune) belongs to this outcome alone.
 *   `superseded` — the generation was linked, and by the time we looked another writer had published ABOVE
 *                  it. Our bytes are still DURABLE: a writer can only target `head+1`, so the generation
 *                  above ours READ ours (`readSidecarSet` takes the highest readable name, and our file is
 *                  complete and fsynced before the link) and BUILT ON IT. The decision landed; it has since
 *                  been built upon, which is ordinary serialization, not a loss. We do no housekeeping —
 *                  our bytes are no longer the head, so republishing the mirror from them would push the
 *                  compat artifact BACKWARDS.
 *   `lost`       — nothing of ours is durable: either the name was taken (EEXIST), or we cannot PROVE the
 *                  name we won was not a recycled one (see below). Retry from a fresh snapshot.
 *
 * COLLAPSING `superseded` INTO `lost` IS A MEASURED HONESTY DEFECT, and it is the one this type removes.
 * The retry re-runs `decide` over a snapshot that now CONTAINS this call's own durable rows, and a decision
 * that is idempotent in `next` need not be idempotent in `out`: `mine`'s pass body deliberately SKIPS a key
 * it finds already staged (a mined candidate never re-authors an established one), so the re-run mints
 * nothing and reports an EMPTY seeded set over rows it had in fact just written. Traced, 8 processes × 5
 * sites: writer `w5` linked generation 23 (23 rows), saw `headNow: 24`, retried, and settled at generation
 * 26 with `out: []` — while `pkg/w5-s3.ts::w5-s3` was durably staged. Four of five candidates reported, five
 * on disk. The comment this replaces called the retry "a wasted round, never a wrong answer"; that was true
 * of `next` and false of `out`.
 */
type PublishOutcome = "published" | "superseded" | "lost"

/** Serialize + publish ONE generation — see {@link PublishOutcome} for the three answers. Every failure that
 *  is NOT contention (ENOSPC, EACCES, EROFS) PROPAGATES: a broken disk is not a lost race, and reporting it
 *  as "retry" would spin `MAX_ATTEMPTS` times and then lie about why the write did not land.
 *
 *  `prev` is the snapshot this generation is published OVER — the one this attempt read. It is here for ONE
 *  reason: the N11 freshness watermark is a property of each ROW, not of the file, and only a comparison
 *  against the previous generation can tell a row this generation actually produced from the overwhelming
 *  majority that were carried forward untouched. See `freshness-watermark.ts` for the measured defect. */
function publish(
  ctx: SidecarCtx,
  projection: StoreProjection,
  gen: number,
  prev: StoreProjection | undefined,
): PublishOutcome {
  const builtAt = ctx.headSha?.()
  const wire: WireProjection = {
    // N11 — PER-ROW. Each row is stamped with the HEAD its OWN stored freshness reflects; a carried-forward
    // row keeps its own, older stamp. `builtAt` below stays for back-compat and is no longer load-bearing.
    current: stampGeneration(projection.current, prev?.current, builtAt),
    cas: [...projection.cas],
    // #99b — the ABSTENTION ledger (sidecar-abstained.ts), an entry-array like `current`, present ONLY when
    // non-empty so a store with none round-trips byte-identically. Not a fact: no freshness stamp, never CAS.
    ...abstainedToWire(projection.abstained),
    gen,
    // #112 — THE IDENTITY STAMP, written UNCONDITIONALLY and from the constant, never from what was read
    // back. Copying the incoming store's stamp forward would make the field self-perpetuating: a store would
    // keep asserting a schema long after this build stopped computing it. Every generation this build
    // publishes was minted by this build's rules, so it says so, once, here — the single place a sidecar's
    // bytes are ever produced.
    identity: IDENTITY_SCHEMA,
    // The PROJECTION-level watermark. KEPT — it is the back-compat fallback the reader applies to a row that
    // carries no stamp of its own, which is every row in every store written before the per-row stamp existed.
    // It is no longer what `stale` is decided on: as the ONLY signal it was laundered by any write at all.
    ...(builtAt !== undefined ? { builtAt } : {}),
  }
  mkdirSync(ctx.dir, { recursive: true })
  const tmp = join(ctx.dir, `${ctx.base}.${process.pid}.${tmpCounter++}.tmp`)
  // fsync the BYTES before any name points at them. Without it the atomicity is only crash-consistent
  // against process death, not power loss: `link` could publish a name whose data blocks are still in the
  // page cache. THE PRICE IS MEASURED AND IT IS NOT SMALL — on this box (APFS, Intel) fsync(file) is
  // ~23 ms and fsync(dir) ~21 ms, against ~0.3 ms for the whole pre-fix in-place write. A governed emit
  // therefore costs ~+40 ms of durability it did not previously buy. That is a deliberate purchase, and it
  // is stated here rather than buried: it is a few percent of an `atlas emit` CLI invocation, and it is the
  // difference between "the last write survives a power cut" and "the store is whatever the page cache had".
  const bytes = JSON.stringify(wire)
  const fd = openSync(tmp, "w")
  try {
    writeFileSync(fd, bytes, "utf8")
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  let committed = false
  try {
    // A PRE-LINK HEAD CHECK WAS TRIED HERE AND REMOVED, because it buys nothing and the reason is worth
    // keeping: it would shrink the window in which our target name can be RECYCLED (from our whole ~45 ms
    // serialize+fsync down to one syscall gap) — but a recycled name is the case the verification below
    // already answers CORRECTLY. The case it answers wrongly is the opposite one, and that window is the
    // link→readdir gap either way. Narrowing the branch that is already right is not a fix.
    try {
      linkSync(tmp, genPath(ctx.dir, ctx.base, gen)) // THE compare-and-swap — EEXIST ⇒ someone else won
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e // ENOSPC/EACCES is not contention
      return "lost"
    }
    // ── HEAD VERIFICATION — the half of the CAS that a name-based CAS does NOT give you for free ────────
    // MEASURED DEFECT, found by an 8-process tight-loop stress and NOT by the CLI race: winning the name
    // `gen` proves only that the name was FREE, and the prune below RECYCLES names. A writer preempted for
    // two publications targets `top+1` after `top+1` has already been published AND pruned, links it
    // successfully, and publishes STALE content under a name that is now far below the head. Nobody ever
    // reads it (every reader takes the MAXIMUM generation), so the row is simply gone — and the writer
    // returned `settled:true`. That is the original silent lost update, reintroduced by the garbage
    // collector. Measured before this check: 2 of 6 stress rounds reported 40 commits with 39 durable.
    //
    // The check is one `readdir`. But "the head moved" has TWO causes, and the first version of this file
    // treated them as one — which cost the honesty defect {@link PublishOutcome} records:
    //
    //   RECYCLED (a real loss): our name was already dead when we linked it, so our bytes sit far below the
    //   head where no reader ever looks. Retry — nothing of ours is durable.
    //   SUPERSEDED (not a loss): our name was FREE-because-never-used, so linking it made us the head, and
    //   the generation above us therefore READ us and built on us. Our decision is durable.
    //
    // THEY ARE SEPARATED BY ARITHMETIC, not by a guess. `RETAINED_GENERATIONS` is what makes a name reusable
    // at all: the prune below unlinks `g` only from a winner `W ≥ g + RETAINED_GENERATIONS`, so a name that
    // was ever recycled had a head at or above `gen + RETAINED_GENERATIONS` at the moment it was freed. The
    // head is MONOTONE — the prune only ever removes names strictly below the winner's own — so that head
    // can never have come back down. Contrapositive, and it is exact: `headNow < gen + RETAINED_GENERATIONS`
    // ⇒ the name was never recycled ⇒ it was free because it was never used ⇒ our link made us the head.
    //
    // At or above that bound we cannot tell the two apart from a directory listing, so we take the only
    // direction that cannot report a write that did not happen: `lost`, and re-run the whole decision. To
    // land there while actually being durable, `RETAINED_GENERATIONS` generations must be published in the
    // gap between our `link` and this `readdir` — two adjacent syscalls — against a publication cost of two
    // fsyncs (~23 ms + ~21 ms on this box) each. That is the residual, it is stated rather than hidden, and
    // it is the safe direction: it can under-report, never over-report.
    //
    // The stale file is deliberately NOT unlinked: it sits below the head, so no reader resolves it, and
    // the next publisher's prune reclaims it. Removing it here would delete the g-1 fallback out from under
    // a reader in the (real) case where the rival that fired this check had legitimately built on us.
    const headNow = generations(ctx.dir, ctx.base)[0]
    if (headNow !== undefined && headNow > gen) {
      const superseded = headNow < gen + RETAINED_GENERATIONS
      return superseded ? "superseded" : "lost"
    }
    committed = true
    // THE MIRROR IS AN INDEPENDENT COPY, published by its own temp+rename — never a rename of the temp we
    // just linked. MEASURED BUG in the first version of this file: `link` + `rename(tmp, mirror)` leaves the
    // mirror and the head generation as two NAMES FOR ONE INODE, so anything that writes
    // `.atlas/projection.json` in place (a script, a restore, a test) silently truncated the head generation
    // too — the compatibility artifact became a back door onto the truth it was supposed to shield. A
    // separate inode costs one more small write (~0.3 ms, no fsync: the mirror is derived) and makes the
    // generation files unreachable by name from outside. Atomic all the same: readers see the old mirror or
    // the new one, never a prefix. Best-effort — losing the mirror must never fail a committed write.
    const mtmp = join(ctx.dir, `${ctx.base}.${process.pid}.${tmpCounter++}.mirror.tmp`)
    try {
      writeFileSync(mtmp, bytes, "utf8")
      renameSync(mtmp, mirrorPath(ctx.dir, ctx.base))
    } catch {
      try {
        unlinkSync(mtmp)
      } catch {
        /* best-effort */
      }
    }
    return "published"
  } finally {
    // The temp is ALWAYS ours to remove now that the mirror gets its own inode: on a win the generation
    // name holds the data, on a loss nothing does.
    try {
      unlinkSync(tmp)
    } catch {
      /* best-effort */
    }
    // The directory sync and the prune are the WINNER's housekeeping and run only when this call actually
    // published (`committed`). A loser has nothing to make durable and nothing to tidy — and paying a ~21 ms
    // fsync on every lost race is what turns contention into a stampede: each retry would slow the loser
    // down enough to lose again.
    if (committed) {
      // Durability of the NAME (not just the bytes) needs the directory synced. Best-effort: some platforms
      // refuse to open a directory for fsync, and a failure here costs durability on power loss, never
      // correctness — so it may not fail a committed write.
      try {
        const dfd = openSync(ctx.dir, "r")
        try {
          fsyncSync(dfd)
        } finally {
          closeSync(dfd)
        }
      } catch {
        /* best-effort dir sync */
      }
      // LAZY PRUNE — keep the head and RETAINED_GENERATIONS-1 predecessors; drop the rest. Another writer
      // may have pruned the same name already, so every unlink is best-effort.
      for (const g of generations(ctx.dir, ctx.base)) {
        if (g > gen - RETAINED_GENERATIONS) continue
        try {
          unlinkSync(genPath(ctx.dir, ctx.base, g))
        } catch {
          /* already gone / raced */
        }
      }
    }
  }
}

/** The honest-empty handle `store.ts` `put` answers for an object the CAS cannot address (`asHash('')`).
 *  Matched by EQUALITY on that one sentinel and nothing wider: an injected `put` seam is free to answer
 *  anything else it likes (a test double answers `undefined`), and narrowing further would turn this guard
 *  into a shape check on a seam whose shape is the caller's business. */
const CAS_EMPTY = ""

/** A `decision.put` object the CAS refused to address. A NAMED `Error`, not the engine `TypeError` this
 *  used to surface as: `@atlas/tools` `fault.ts` files an engine fault as `internal-fault` ("a defect in
 *  Atlas, not in your arguments"), and an object the caller supplied is not that. The message carries a
 *  DISCRIMINANT before its first `:` so `reasonOf`/`faultOf` can name this refusal without matching prose. */
export class UnaddressableCasObjectError extends Error {
  constructor(readonly base: SidecarBase) {
    super(
      `unaddressable-cas-object: refusing to publish the ${base} sidecar — a decision named a CAS object the ` +
        `store could not address (its canonical form or its JSON serialization does not exist), so publishing ` +
        `would durably reference bytes that were never written. Nothing was written and nothing was served.`,
    )
    this.name = "UnaddressableCasObjectError"
  }
}

/**
 * THE write door of the mutable sidecar: read → decide → publish, retried WHOLE on a lost CAS.
 *
 * `decide` MUST be pure (no writes, no clock, no random) because it is re-run from scratch on every
 * contended attempt — and it must be the WHOLE governed decision, gates included, since re-publishing a
 * decision made against a stale snapshot is the confused-deputy bypass the header describes.
 */
export function commitSidecar<T>(ctx: SidecarCtx, decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> {
  return commitLoop(ctx, decide, true)
}

/** The shared loop. `guardUnreadable` is what separates a DECISION from an unconditional publish: a decision
 *  read the snapshot, so a phantom-empty snapshot poisons it (leg 2) and the write must refuse; an
 *  unconditional persist never looked at the snapshot, so refusing would brick a caller (`mine` re-stages a
 *  whole pass) over a file its own decision does not depend on. */
function commitLoop<T>(
  ctx: SidecarCtx,
  decide: (p: StoreProjection) => CommitDecision<T>,
  guardUnreadable: boolean,
): CommitResult<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const read = readSidecarSet(ctx.dir, ctx.base, ctx.trusted)
    // PROVENANCE — UNCONDITIONAL, unlike `unreadable`. The `guardUnreadable` distinction exists because an
    // unconditional persist never looked at the snapshot, so refusing over a torn read would brick a caller
    // whose decision does not depend on it. That reasoning does not transfer here: writing over a COMMITTED
    // store would LAUNDER it — the attacker's rows become a file this process produced, indistinguishable
    // from door output afterwards, with the tracked-file evidence overwritten. Both write shapes refuse, and
    // `persistSidecar` turns this into a thrown, readable error rather than a silent no-op.
    if (read.untrusted) return { settled: false, refusal: "untrusted" }
    // #112 — THE IDENTITY SCHEMA, and it is UNCONDITIONAL for exactly the reason `untrusted` is: LAUNDERING.
    // Publishing over a store whose hashes were minted by different rules stamps the successor generation
    // with the CURRENT schema, so a store that provably cannot be addressed by this build starts asserting
    // that it can — permanently, in one write, with an exit code of 0, and with the only evidence overwritten.
    //
    // Stated precisely because the dramatic version is wrong: this is NOT an erasure. `decide` reads the
    // snapshot (the read serves it — `sidecar.ts` `SidecarRead.identity` explains why it is flagged rather
    // than emptied), so the rows are carried forward intact. What is destroyed is the KNOWLEDGE that they are
    // stale, which is worse in the way that matters: a silent wrong answer instead of a loud missing one.
    // Refusing leaves the old bytes exactly where they are, which is what makes "re-derive it" advice about
    // data that still exists.
    //
    // A THROW rather than a fourth `CommitRefusal` member — see `IdentitySchemaError` for the semantic
    // reason and for the measured one. Both write shapes take it: `persistSidecar`'s exhaustion guard below
    // does not run, because this never reaches a return.
    refuseForeignIdentityWrite(read)
    if (guardUnreadable && read.unreadable) return { settled: false, refusal: "unreadable" }
    const snapshot = read.projection ?? emptyStore()
    const decision = decide(snapshot)
    if (decision.next === undefined) return { settled: true, out: decision.out } // governed refusal: no write
    // CAS bytes FIRST, then the projection that references them. Idempotent by content address, so a retry
    // re-putting the same object writes nothing new; a failing `put` (disk-full/permission) throws BEFORE
    // any sidecar byte, so the sidecar can never reference a hash whose bytes are absent.
    //
    // THE ANSWER USED TO BE DISCARDED, AND THAT MADE THE SENTENCE ABOVE FALSE. It rests on "a failing `put`
    // THROWS", which is true of a disk-full `put` and false of an UNADDRESSABLE one: `store.ts` `put` is
    // deliberately total over malformed input — it answers the EMPTY sentinel and writes nothing. So an
    // object the CAS cannot address was silently skipped, `publish` ran anyway, and the generation went
    // durable holding a `contentHash` whose bytes were never written: a row that is present, served, and
    // unresolvable. Exactly the read-back invariant `governed-emit.ts` stage 4 and the doctor legs depend on.
    //
    // THIS GUARD IS LOAD-BEARING, NOT BELT-AND-BRACES, and the sentence that used to stand here said the
    // opposite: "No product caller reaches it today — both governed doors compute `id(node)` themselves
    // before handing the same object over, so an unaddressable object never gets this far." MEASURED FALSE
    // (task #136), through the real `createGovernedEmit` over a real `createDiskStore`: KERNEL-8 excludes
    // `grounding`/`status`/`freshness` from the canonical preimage at every level, so a `BigInt` parked in
    // `grounding` — a field on EVERY `GroundedFact` — canonicalizes FINE, clears `id(node)`, clears every
    // gate, and arrives HERE. The door suite in this package had in fact been exercising that path all along
    // (`store-fail-closed-door.test.ts` §C); only this comment had not caught up.
    //
    // The throw stays. It is the STORE's fail-closed floor for any caller that reaches this seam without
    // having asked whether its bytes are addressable. `governed-emit.ts` gate 0.5 now CATCHES it and re-files
    // it as that door's own recorded refusal, so the operator gets an exit-2 verdict rather than an exception
    // — but a caller that skips the door still gets stopped here rather than publishing a dangling row.
    for (const obj of decision.put ?? []) {
      if (ctx.put(obj) === CAS_EMPTY) throw new UnaddressableCasObjectError(ctx.base)
    }
    // NO-OP FAST PATH — a decision that returns the VERY snapshot it read, unmodified (reference-identical),
    // has minted nothing: the current head ALREADY holds these exact bytes. `mine`'s abstaining pass is the
    // measured source — its `decideStaging` returns `staged` untouched when a site mints no fact (the majority
    // of sites on a real repo), and on a full run of 677 sites × 3 arms that used to re-serialize the whole
    // (growing) staging Map and pay two fsyncs (~44 ms) per site to publish a generation BYTE-IDENTICAL to the
    // head — O(N²) I/O as the Map grows. Settle WITHOUT a physical publish and the redundant fsyncs are gone.
    //
    // SOUND under concurrency, and the reference check is what makes it safe rather than a content guess: this
    // fires ONLY when `decide` handed back the exact object it was given, so nothing this attempt produced is
    // absent from the head we read. If a rival published ABOVE us in the meantime, `read.top` is stale — but we
    // are not asserting durability for any row we did not carry forward, so there is nothing of ours to lose
    // (contrast `publish`'s head-verification, which exists precisely because a MINTING attempt DOES have new
    // bytes that must land). It also cannot skip a real write: `decideStaging` (and every governed decision)
    // rebinds `projection` to a FRESH object via `knowledgeUpsert` the instant it mints, so a minting pass has
    // `next !== snapshot` and publishes exactly as before — the SCN-CLI-4d republish-on-abstain contract lives
    // one layer up in the DECISION (`next` is still `projection`, never dropped); this only elides the
    // physical, redundant re-publication of an unchanged head. `persistSidecar`'s unconditional path passes its
    // OWN projection object (never the one just read), so `next !== snapshot` there and it is unaffected.
    //
    // WHY THE `put` LOOP RUNS FIRST — a CALLER INVARIANT, stated because the loop does not enforce it: `next` is
    // reference-equal to `snapshot` ONLY when the decision minted nothing, and `knowledgeUpsert` couples minting
    // with the CAS `put` (every product decision pushes its bytes in the SAME step it rebinds `projection`, so
    // `put` is empty exactly when `next === snapshot`). A HAND-WRITTEN decision returning `{ next: <the snapshot>,
    // put: [obj] }` would write `obj` to CAS and then skip publication, orphaning a (harmless) unreferenced blob
    // — no such caller exists, and putting the loop before the skip keeps even that hypothetical fail-safe: the
    // bytes land, only the redundant projection re-publish is elided.
    //
    // FIRST-COMMIT is NOT skipped, and the guard compares against `read.projection` (the DURABLE head) rather
    // than `snapshot` (which falls back to a fresh `emptyStore()`) precisely to preserve it: on a fresh store
    // `read.projection` is `undefined`, so a no-op decision that returns the `emptyStore()` fallback is
    // `!== read.projection` and DOES publish the initial generation. This matters — callers (and tests) create
    // the first sidecar with exactly the `(p) => ({ next: p })` idiom, and a store with no generation at all is
    // a different state from one holding an empty generation for the "is there a durable head to compare
    // against?" question the unreadable/corrupt-fallback paths ask. The churn win is unaffected: only the
    // very first abstaining site of a fresh run still publishes (an empty generation); every later site reads a
    // defined head and skips.
    if (decision.next === read.projection) return { settled: true, out: decision.out }
    // `superseded` SETTLES. The decision's bytes are durable (see {@link PublishOutcome}), so the ONLY
    // honest answers are this call's own `out` — the one belonging to the attempt that actually published —
    // or a re-run that cannot see it wrote. Re-running is what produced a truthful `next` and a false `out`.
    // `read.projection` is handed on as the PREVIOUS generation so the per-row watermark can tell a row this
    // decision produced from one it merely carried forward. It is the same snapshot `decide` just ran over,
    // so on a retry the comparison is re-made against the NEW snapshot — never a stale baseline.
    if (publish(ctx, decision.next, read.top + 1, read.projection) !== "lost") {
      return { settled: true, out: decision.out }
    }
  }
  return { settled: false, refusal: "contended" }
}

/** The UNCONDITIONAL publish behind `persistProjection` — the pre-existing seam, which has
 *  no decision to re-run and therefore stays last-writer-wins by DEFINITION. What it gains is atomicity: the
 *  bytes are published by `link`+`rename` from a synced temp, so no reader ever observes a prefix and leg 2
 *  cannot fire through it. Exhaustion THROWS: this signature returns void, and a silent no-op persist would
 *  be a new instance of the exact defect this file removes. */
export function persistSidecar(ctx: SidecarCtx, projection: StoreProjection): void {
  const result = commitLoop(ctx, () => ({ out: undefined, next: projection }), false)
  if (!result.settled) {
    if (result.refusal === "untrusted") {
      // Named separately because the operator action is completely different from the other two, and a
      // generic "could not persist" would send them to look at the disk.
      throw new Error(
        `atlas: refusing to write the ${ctx.base} sidecar — \`.atlas/\` is TRACKED BY GIT in this repo, so the ` +
          `durable store arrived by COMMIT rather than through a governed door. A committed store carries rows ` +
          `no gate ever saw. Nothing was written and nothing was served. Remove it from version control ` +
          `(\`git rm -r --cached .atlas\`, keeping \`.atlas/policy.json\`) and re-derive the store locally.`,
      )
    }
    throw new Error(
      `atlas: could not persist the ${ctx.base} sidecar (${result.refusal}) after ${MAX_ATTEMPTS} attempts — ` +
        `nothing was written. This is reported rather than swallowed: a persist that silently does nothing ` +
        `is the lost update this protocol exists to make impossible.`,
    )
  }
}
