// @atlas/adapter-io — src/git-drift.ts  (ADAPT-GIT-2: drift)
//
// The GROUND `DriftSource` (@atlas/tools) — the drifted-anchor set across a git merge-base, feeding
// `atlas-reconcile`'s mechanical-vs-semantic classification (TOOLS-8 exitCode law unchanged). This facet
// owns ONLY the merge-base(param)-vs-topic(HEAD) diff logic; anchor RESOLUTION is INJECTED (owned by
// GROUND — `resolveAnchorAt`), never an index built here (reconcile.ts:28-32).
//
// IT ALSO OWNS THE VALIDITY OF ITS OWN BASE, which it did not, and the gap turned the merge gate GREEN on a
// rev that does not exist. See {@link UnresolvableMergeBaseError}.

import type { DriftPair, DriftSource } from "@atlas/tools"
import type { Hash, StructRef } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import { gitErrText, runGit } from "./run-git.js"

/**
 * The merge base the caller named does not resolve to a commit in this repository.
 *
 * ── THE DEFECT THIS CLASS EXISTS TO CLOSE (measured through the built CLI, e2e story S27) ─────────────────
 * `driftAt` resolved the base ONE FACT AT A TIME, through the injected `resolveAnchorAt`, and an unresolvable
 * rev answers `undefined` there — which is also the legitimate answer for "this particular fact has no
 * baseline anchor at that rev". So a base that does not exist made EVERY fact take the per-fact skip, `pairs`
 * came back EMPTY, the KNOW-5 split found no semantic flip, and `atlas reconcile` printed `status: ok` and
 * exited 0. Measured in a repo carrying real, blocking, semantic drift against its actual base:
 * `atlas reconcile deadbeef`, `atlas reconcile not-a-sha-at-all` and `atlas reconcile ""` ALL exited 0. This
 * is a MERGE GATE — exit 0 is the answer a CI job merges on — so a typo'd sha, a deleted branch name or an
 * unexpanded shell variable silently turned the gate green.
 *
 * ── WHY A THROW, AND WHY THIS SHAPE ───────────────────────────────────────────────────────────────────────
 * `DriftSource.driftAt` is a frozen seam returning `readonly DriftPair[]`, and there is no value in that type
 * that means "I could not look" — the empty array already means "I looked and there is nothing", which is the
 * exact conflation above. So the refusal travels on the channel `@atlas/tools` already reserves for a leg
 * that declines: a deliberately constructed, NAMED `Error`. `fault.ts` `classifyThrown` files that as a
 * REFUSAL (not `internal-fault`, which is for engine faults, and not `malformed-args`, which is the door's
 * verdict against the published schema), so the operator gets `reason: unresolvable-merge-base: …` at exit 1
 * — visibly NEITHER the clean gate (0) nor the semantic block (2). The message carries its DISCRIMINANT
 * before the first `:` so `reasonOf`/`faultOf` can name this refusal without matching prose.
 *
 * The per-fact skip is UNTOUCHED and stays a skip: "this one fact has no baseline anchor at a base that does
 * exist" is a different fact about the world from "the base does not exist", it has a legitimate clean-gate
 * answer, and after this change the two are still distinguishable from outside the process — by exit code and
 * by this discriminant. Both directions are pinned by S27.
 */
export class UnresolvableMergeBaseError extends Error {
  constructor(
    readonly base: string,
    detail: string,
  ) {
    super(
      `unresolvable-merge-base: '${base}' does not resolve to a commit in this repository, so there is no ` +
        `baseline to diff HEAD against. NOTHING WAS CLASSIFIED and nothing was written — this is a refusal, ` +
        `not a clean merge gate: an unresolvable base would otherwise make every fact skip and report zero ` +
        `drift. Pass a merge-base sha or ref that exists here (\`git merge-base <base> HEAD\`). ${detail}`,
    )
    this.name = "UnresolvableMergeBaseError"
  }
}

/**
 * Resolve `rev` to the ONE commit sha it names, or REFUSE — run ONCE, before the fact loop.
 *
 * Returns the canonical sha rather than echoing the caller's string, so every anchor in one classification is
 * resolved at the same immutable object: a symbolic base (`main`, a branch) is pinned at the instant it is
 * verified instead of being re-resolved per fact against a ref another process may move underneath it.
 *
 * A LEADING `-` IS REFUSED WITHOUT ASKING GIT. `rev` reaches `execFileSync` as an argv element (no shell,
 * `run-git.ts`), so it cannot inject a command — but it CAN still be read by git as an OPTION rather than as
 * a revision. Git's own `--end-of-options` would settle it; it is deliberately not used, because a git old
 * enough to lack it (< 2.24) would reject the flag and turn every VALID base into this refusal. No sha and no
 * valid refname begins with `-`, so the check costs nothing real and depends on no git version.
 */
function resolveMergeBase(repoPath: string, rev: string): string {
  if (rev.startsWith("-")) {
    throw new UnresolvableMergeBaseError(rev, "A revision cannot begin with `-`; it was not passed to git.")
  }
  let out: string
  try {
    // `^{commit}` PEELS: a tag or a tree resolves to the commit it names, and anything that is not a commit
    // (a blob sha, a tree sha) fails here rather than being carried into the anchor resolver as a rev that
    // silently checks out nothing. `--verify` makes git exit non-zero — and `runGit` throw — on any miss.
    out = runGit(repoPath, ["rev-parse", "--verify", `${rev}^{commit}`]).trim()
  } catch (e) {
    throw new UnresolvableMergeBaseError(rev, gitErrText(e).split("\n")[0] ?? "")
  }
  if (out.length === 0) {
    throw new UnresolvableMergeBaseError(rev, "git resolved it to an empty string.")
  }
  return out
}

/**
 * Construct the GROUND `DriftSource` — the drifted set at a merge base (ADAPT-GIT-2).
 *
 * `driftAt(mergeBase)` first RESOLVES the base — once, up front — and REFUSES an unresolvable one
 * ({@link UnresolvableMergeBaseError}); it never reports an empty drift set for a base it could not read.
 * It then diffs the injected anchors between that base and HEAD (the topic tip the reconcile runs on) —
 * NEVER `main`, NEVER a fixed `HEAD~1..HEAD` window (those are the 9a/9b mutants). Anchor resolution is
 * handed in via `resolveAnchorAt` (GROUND-owned); this facet only presents what it is handed. Input order is
 * preserved; a fact whose anchor did not drift, or resolves undefined at either end OF A BASE THAT EXISTS,
 * contributes nothing (never all-or-nothing).
 *
 * N10 — PURE-RENAME widening. The path-keyed diff above only fires when the recorded qualifiedPath still
 * resolves at HEAD (`now` defined). A pure rename DELETES the old path at HEAD ⇒ `now` is undefined ⇒ NO
 * pair ⇒ the moved-but-alive fact is silently dropped before the classifier ever sees it. When a CONTENT
 * resolver (`resolveBySubtreeAt`, GROUND-owned) is wired, `driftAt` additionally surfaces such a fact: if
 * the path-keyed diff produced no in-place drift BUT the fact's RECORDED content re-located to a DIFFERENT
 * qualifiedPath at HEAD, emit a drift pair whose `anchorNow` is that new location (mirrors doctor surfacing
 * a moved anchor). Deterministic + TOTAL: no content resolver / content gone / content unmoved ⇒ no pair.
 *
 * ── #185: DETECTION NOW SPANS EVERY ENTRY, NOT JUST `entries[0]` ─────────────────────────────────────────
 * THE THIRD INSTANCE OF THE ENTRY-0 ASYMMETRY, AND THE WORST OF THE THREE. `doctor-source.ts`'s classifier
 * and the composition root's merge-gate predicate BOTH used to read `entries[0]` alone — those gave a WRONG
 * ANSWER (a rotted secondary misclassified `mechanical`). This one, here, used to give NO ANSWER: `driftAt`
 * is what DECIDES which facts reach the classifier at all, so a fact whose PRIMARY anchor was intact and
 * whose NON-PRIMARY citation had rotted away was never surfaced as a pair — not detected, not classified, not
 * reported, `exitCode 0`. Total invisibility, one layer above where the classifier fix could reach (measured
 * in `test/reconcile-entry-symmetry.test.ts`'s `MEASURED GAP` case, closed by `test/git-drift-entries.test.ts`).
 *
 * `doctor-source.ts`'s `isMechanicalAt`/`driftedEntries` do NOT fit this call site and are deliberately NOT
 * reused here: they decide mechanical-vs-semantic by asking, PER ENTRY, whether it re-derives at ONE target
 * rev (`revIndex.reDerives`, a conjunction over a single `Axes` snapshot) — a CLASSIFICATION question, already
 * fixed and unchanged by this card (frozen decision #4). `driftAt` asks a structurally different, DETECTION
 * question — whether an entry's anchor differs between TWO revs (`baseSha` vs `topicSha`), over the injected
 * `resolveAnchorAt`/`resolveBySubtreeAt` pair rather than a `RevIndex`/`reDerives` seam — and `DriftSource`'s
 * frozen deps carry no `RevIndex` for it to call through. So this is not a third copy of one predicate to
 * collapse; it is the SOLE existing per-entry-diff body (previously restricted to entry 0), widened in place
 * to loop over every entry via `entryDrift` below rather than duplicated.
 *
 * `DriftItem` stays FROZEN (atlas-tools:24, one anchor pair) — never widened. The pair reported for a fact is
 * now the FIRST DRIFTED entry (`entryDrift` in recorded order), not `entries[0]` — so a human is shown an
 * anchor that actually moved, never a primary that never moved. A single-entry grounding is BYTE-IDENTICAL to
 * before (the loop's first — and only — entry is entry 0), pinned by every pre-existing test in this suite.
 */

/** One entry's drift verdict between `baseSha` and `topicSha` — the DECOMPOSED per-entry unit `driftAt` loops
 *  over every grounding entry with, instead of `entries[0]` alone. `undefined` ⇒ nothing to say about THIS
 *  entry: no baseline anchor at `baseSha` (the honest per-fact skip, {@link UnresolvableMergeBaseError}'s doc),
 *  or the entry is intact at `topicSha` (same path, unchanged content, or a genuine — not phantom — rename).
 *  Total: never throws, mirrors the pre-widening inline body exactly for one entry. */
function entryDrift(
  deps: {
    resolveAnchorAt: (rev: string, qualifiedPath: string) => StructRef | undefined
    resolveBySubtreeAt?: (rev: string, subtreeHash: string) => StructRef | undefined
  },
  baseSha: string,
  topicSha: string,
  entry: GroundedFact["grounding"]["entries"][number],
): { readonly anchorWas: StructRef; readonly anchorNow: StructRef } | undefined {
  const qp = entry.anchor.qualifiedPath
  // THIS `undefined` MEANS ONE THING ONLY (the base is known to exist, validated once by the caller): this
  // entry's anchor did not exist at that base, there is no baseline to diff — nothing to say about it.
  const was = deps.resolveAnchorAt(baseSha, qp)
  if (was === undefined) return undefined
  const now = deps.resolveAnchorAt(topicSha, qp)
  if (now !== undefined && was.subtreeHash !== now.subtreeHash) {
    // In-place drift: the SAME qualifiedPath now carries different content at HEAD.
    return { anchorWas: was, anchorNow: now }
  }
  // The recorded qualifiedPath STILL resolves at HEAD (and did not drift in place) ⇒ this entry is intact at
  // its own path ⇒ NEVER a rename. Return BEFORE the content lookup — otherwise a byte-identical DUPLICATE of
  // the content at some other path would let `resolveBySubtreeAt` (first-preorder / refused-ambiguity) hand
  // back a different path and fabricate a PHANTOM move, diverging from doctor (whose `reDerives` reads FRESH
  // here). The pure-rename widening below fires ONLY when the recorded path is truly GONE at HEAD.
  if (now !== undefined) return undefined
  // PURE-RENAME widening (N10): the recorded qualifiedPath is GONE at HEAD. If this entry's RECORDED content
  // re-located to a DIFFERENT qualifiedPath at HEAD, the citation MOVED but survives ⇒ report it, anchored at
  // that new location (mirrors doctor surfacing a moved anchor). The `!== qp` guard is a belt-and-braces
  // totality check (the content cannot resolve at the now-absent qp, but never assume).
  const relocated = deps.resolveBySubtreeAt?.(topicSha, String(entry.anchor.subtreeHash))
  if (relocated !== undefined && relocated.qualifiedPath !== qp) {
    return { anchorWas: was, anchorNow: relocated }
  }
  return undefined
}

export function createDriftSource(deps: {
  repoPath: string
  resolveAnchorAt: (rev: string, qualifiedPath: string) => StructRef | undefined
  resolveBySubtreeAt?: (rev: string, subtreeHash: string) => StructRef | undefined
  facts: readonly GroundedFact[]
}): DriftSource {
  return {
    driftAt(mergeBase: Hash): readonly DriftPair[] {
      // THE BASE IS VALIDATED ONCE, HERE, BEFORE ANY FACT IS LOOKED AT. Doing it per fact is what let an
      // unresolvable rev wear the per-fact "no baseline anchor" skip and report a clean merge gate — see
      // {@link UnresolvableMergeBaseError} for the measurement. A refusal, never an empty drift set.
      const baseSha = resolveMergeBase(deps.repoPath, String(mergeBase))
      // HEAD is the topic tip — the branch reconcile runs on. The two revs diffed are `mergeBase`
      // (the param) vs HEAD (topic); this adapter owns that choice.
      const topicSha = runGit(deps.repoPath, ["rev-parse", "HEAD"]).trim()

      const pairs: DriftPair[] = []
      for (const f of deps.facts) {
        // SPAN EVERY ENTRY (#185): a fact is surfaced when ANY entry has drifted, not just `entries[0]`. The
        // pair reported is the FIRST drifted entry in recorded order — `DriftItem` stays frozen at one pair —
        // so the anchor a human is shown actually moved, rather than a primary that never did. `break` after
        // the first hit: ONE pair per fact, never all-or-nothing across its own citations either.
        for (const entry of f.grounding.entries) {
          const d = entryDrift(deps, baseSha, topicSha, entry)
          if (d !== undefined) {
            pairs.push({
              drifted: { fact: f, newSha: topicSha as Hash },
              anchorWas: d.anchorWas,
              anchorNow: d.anchorNow,
            })
            break
          }
        }
      }
      return pairs
    },
  }
}
