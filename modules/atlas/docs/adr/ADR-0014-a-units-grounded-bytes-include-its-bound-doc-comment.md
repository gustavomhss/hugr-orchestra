# ADR-0014 — a unit's grounded bytes include its bound leading doc-comment

- **Status:** Proposed (2026-08-09), **revised after cold review** (§"Cold-review corrections"). The _finding_
  (GAP-2) is measured on the shipped binary; the _unit-boundary redefinition_ and the _golden amendment_ it
  needs are **NOT yet ratified** — this ADR is written so the owner ratifies a measured scope, not a summary.
- **Spec author:** lead, grounded against master `ce91a08`. Cold-reviewed by an independent seat 2026-08-09;
  the FIX-FIRST findings are folded in and the corrected claims are marked below.
- **Resolves:** GAP-2 — a fact derived from a declaration's leading doc-comment is anchored to a symbol/block
  unit whose `subtreeHash` does NOT cover that comment, so a comment-only edit that invalidates the fact reads
  **FRESH**. Confirmed live end-to-end through the shipped `driftDetect` (`grounding/src/drift.ts:98-104`).
- **Scope of the blind spot (measured):** the **symbol/block frontier only** (`ATLAS_FRONTIER=symbol`, #182,
  OFF by default). The default file frontier is NOT affected — a file node's `subtreeHash` commits to the whole
  file's bytes, comments included. This ADR is a **precondition for turning on symbol-granular recall**, not a
  fix to a default-path defect.
- **Amends (ratified surfaces) — all four that encode "header above ⇒ FRESH", named after cold review:**
  (1) the unit-boundary definition feeding `INV-GROUND-1`/`INV-GROUND-5` (what "the cited unit's OWN bytes"
  spans); (2) the GROUND-5 GOLDEN header clause (`docs/design/functional-surface.md:93`, `product-framing.md:
115`, `docs/reference/atlas-grounding.md:164`); (3) the NORMATIVE clause `REQ-GROUND-5b`
  (`docs/requirements/req-grd.md:92-93`), whose parenthetical "import/**license header added above it** … MUST
  NOT drift" must gain the contiguity qualification; (4) the PROP-GROUND-5 ARBITRARY
  (`docs/requirements/properties-grd.md:75`), which lists "license header added above" in the NON-TOUCHING ⇒
  FRESH class — that instance moves to the TOUCHING class. **The PROP-GROUND-5 LAW is unchanged** (`FRESH ⟺
subtree(U) byte-identical`): this ADR changes what `subtree(U)` spans, so the law holds verbatim and only the
  arbitrary's _classification_ of a contiguous header is re-partitioned. Per the co-amendment rule (#198), all
  four move in the same commit as the code.
- **Does NOT force a `FOLD_DOMAIN` re-key** (corrected — see §Migration and §Cold-review corrections #2).
- **Does NOT touch:** the span carrier (`grounding/src/span.ts`, additive, drift-invariant), or GROUND-2
  (every entry still carries `anchor.subtreeHash`).

## Context — the finding, quoted rather than paraphrased

`packages/adapter-io/src/ast.ts:206` (item) and `:190` (block) slice a unit's bytes as the syntax node's own
span:

```ts
content: src.slice(decl.node.startIndex, decl.node.endIndex),   // itemNode (:206)
content: src.slice(node.startIndex, node.endIndex),             // blockNode (:190)
```

Tree-sitter's declaration/method node does not include the leading comment (a comment is a _preceding
sibling_), so both slices exclude it. `packages/index/src/rollup.ts:83-88` folds a node's hash over its own
content plus its named child hashes; the drift oracle (`drift.ts:98-104`) compares the anchor's recorded
`subtreeHash` against the node's current one. So a fact whose evidence lives in a declaration's (or a method's)
leading doc-comment, anchored to that unit, is watched by bytes that **exclude the comment the fact came
from**. A comment-only edit that makes the fact false leaves the unit hash byte-identical → `FRESH` → the
truth gate serves a stale HOLD.

**Reachability is symbol/block-arm only, and it includes BLOCKS (corrected).** Because `foldNodeHash` commits
to a node's OWN content, the file node's hash covers the whole file (comments included). Only the item AND the
`block` nodes exclude their leading comment. A `block` (method/arrow) is a first-class anchorable unit
(`ast.ts:186-192,239`, path `file::item::block`, resolvable by `drift.ts:60-66`), so a fact anchored to a
method, derived from that method's own leading JSDoc, is the SAME blind spot. The earlier draft's claim "the
gap is strictly the top-level declaration" was wrong; the fix must cover blocks too.

## Decision

**A unit's grounded bytes are extended upward to include its BOUND leading doc-comment — for BOTH item and
block units.** "Bound" is the standard doc-comment association rule, stated mechanically:

> A **bound leading doc-comment** of a unit U is the maximal run of `comment` nodes immediately preceding U's
> OUTERMOST syntax node (for an item: its `export`/`export default` wrapper and any decorators, not the
> unwrapped inner declaration; for a block: the method/function node), such that every comment and the next
> comment/unit-node are on **consecutive lines with no blank line between them**. The unit's slice becomes
> `[boundCommentStart, U.endIndex)`; when there is no such run the slice is unchanged.

The unit's `subtreeHash` is computed over the extended slice by the existing fold — **no `FOLD_DOMAIN` bump**.
The extra bytes change the hash of exactly the units that gain a comment, and that change propagates through
the Merkle parents on its own (§Migration).

### The three sub-rules the cold review forced explicit (WP-1 must implement all three)

1. **Outermost-node anchoring for the scan.** `unwrapExport` (`ast.ts:113-118`) discards the wrapper and keeps
   the inner decl, and `itemNode` slices from the inner node. To attach a comment that sits above `export`
   (or above a decorator), the leading-comment scan MUST start from the ORIGINAL top-level node
   (`root.namedChildren` element before unwrap), not the unwrapped decl. This code path does not exist yet and
   is WP-1's core. Covers `export default`, and `/** doc */ @Decorator() export class` (Angular/Nest), which a
   naive "prev sibling of the inner decl" would drop.
2. **Following-declaration binding.** `fn a(){}` \n `// c` \n `export fn b(){}` — with no blank line, `// c`
   binds to `b` (the following unit), matching every doc tool. Deterministic; golden G-GAP2-7 pins it so the
   mis-attribution (it could be `a`'s trailing note) is a KNOWN, tested choice, not an accident.
3. **Blank-line boundary.** A comment separated from the unit by ≥1 blank line is NOT bound (golden G-GAP2-4).

## The GROUND-5 golden — AMENDED, because it does not survive as worded (corrected)

The ratified golden (`docs/design/functional-surface.md:93`, `product-framing.md:115`, `atlas-grounding.md:
164`) says:

> "an import or **license header added ABOVE it** … stays FRESH"

The cold review produced a counterexample that breaks this under any doc-association rule:

```ts
import x from "./x"
/** @license Copyright 2026 */
export function foo() {}
```

The `@license` run is contiguous with `foo` and preceded by an import, so it IS `foo`'s bound doc-comment and
editing it drifts `foo` — contradicting "license header above stays FRESH." There is **no positional rule that
both attaches a real doc-comment and refuses a contiguous header**: contiguity is exactly what doc tools use to
associate documentation. A first draft tried to carve out "the file's leading comment stays FRESH", but the
cold review's round 2 showed that carve-out is self-contradictory (the mechanical rule has no file-position
leg) AND that it would re-open GAP-2 for a genuine first-in-file doc-comment. So the resolution is a SINGLE,
position-free rule and an honest AMEND of the golden:

> **GROUND-5 (amended header clause):** the FRESH-on-add classification is decided by **contiguity, not file
> position**. A comment separated from the declaration by ≥1 blank line (the conventional file-top or
> above-the-decl header), or an import/rename that is not a comment, stays **FRESH**. A comment **contiguous**
> with a declaration (no blank line), _including a comment at the very start of a file directly above the first
> declaration_, is that declaration's documentation and a change to it **DRIFTS** the unit. There is no
> file-leading exception — a header meant to stay FRESH is, by universal convention, blank-line-separated from
> the first declaration, and that is exactly the case that stays FRESH.

The import-above and unrelated-rename-elsewhere legs of GROUND-5 are UNCHANGED and still FRESH (an import is
not a `comment` node, so no run binds and the slice is unchanged; a blank line breaks contiguity). Only the
**contiguous**-header sub-case flips — including a contiguous file-top header on the first declaration — because
it is genuinely indistinguishable from documentation, and a single uniform rule is the only consistent one.

## Migration — slice-only, NOT a domain re-key (corrected)

Changing the slice changes `material.content` for a commented unit, which changes its blake3 on its own
(`rollup.ts:88`). Propagation is automatic: a file node folds its child hashes, so a file containing a
bound-commented unit re-keys; a directory re-keys iff a descendant file did. **Subtrees with no bound comment
anywhere stay byte-identical — they do NOT drift.** A `FOLD_DOMAIN` v2→v3 bump would instead re-key EVERY node
including comment-free files and all directories — strictly larger and less faithful to "unchanged own bytes ⇒
FRESH" — and buys nothing, because version detection is **absent** (grep: only the bare const
`FOLD_DOMAIN='atlas.index.node.v2'` at `rollup.ts:36`; no parse/route logic anywhere). So:

- No bump. Facts anchored to a unit/file/dir whose subtree gains a bound comment read **DRIFTED once**, then
  re-ground via the shipped `--accept-reground` (WP-N1). A bulk re-ground over affected anchors is the
  migration step; comment-free anchors need nothing.
- Blast radius is "anchors over a subtree containing ≥1 bound-commented declaration" — most files in practice,
  but bounded and honest, and it excludes comment-free files and pure-structure directory anchors that a bump
  would have needlessly moved.

## Goldens this decision requires (authored in WP-1; listed so completeness is auditable)

- **G-GAP2-1 (the fix, item):** fact on an item; edit ONLY its bound leading doc-comment to make it false ⇒
  **DRIFTED** (today FRESH).
- **G-GAP2-1b (the fix, block):** same for a method/arrow block's own leading JSDoc ⇒ **DRIFTED**.
- **G-GAP2-2 (header, blank-line-separated):** a file-top or above-the-decl header **separated by a blank
  line** ⇒ the unit stays **FRESH** on a header edit. (There is no file-position carve-out; the FRESH-ness
  comes from the blank line breaking contiguity, not from being at file top.)
- **G-GAP2-2b (header, contiguous at file top):** a comment at the very start of a file, contiguous (no blank
  line) with the first declaration, IS bound and a change to it ⇒ **DRIFTED** — the consistency witness that
  there is no file-leading exception (guards the round-2 contradiction).
- **G-GAP2-3 (import above):** add an import above a unit (blank-line-separated) ⇒ **FRESH** (SCN-GROUND-5b,
  must not regress).
- **G-GAP2-4 (blank-line boundary):** a comment separated from the unit by a blank line ⇒ not bound; edit ⇒
  **FRESH**.
- **G-GAP2-5 (reformat still drifts):** a reformat inside the extended unit (incl. inside the bound comment) ⇒
  **DRIFTED** (REQ-GROUND-5b unchanged).
- **G-GAP2-6 (hash constant pinned):** the new `subtreeHash` of a fixture unit pinned to a literal (#104).
- **G-GAP2-7 (following-decl binding):** a comment between two declarations binds to the following one —
  pinned as the deliberate, deterministic choice.
- **G-GAP2-8 (export default / decorator):** a doc-comment above `export default` and above a decorated class
  is attached (guards sub-rule 1).

## What this ADR does NOT close

- **GAP-1 (variable-granularity anchoring)** — a fact spanning a SET of units, or file-level, still has no
  minimal-set anchor. Sibling decision (WP-2).
- **The UTF-16→UTF-8 offset hazard for interior spans** (`grounding/src/types.ts`, #159) — the slice uses
  `String.slice` (UTF-16, consistent with tree-sitter) so the slice is correct; any future span minted into the
  extended unit inherits the byte-offset conversion duty. Named so it is not rediscovered.
- **Whether symbol-arm recall is turned ON by default** — this ADR makes it SAFE; the default flip is WP-3 on
  measured recall/precision.

## What the owner still has to ratify

1. **The unit-boundary redefinition** — "a unit's grounded bytes include its bound leading doc-comment (item
   and block)." Changes the ratified preimage of `subtreeHash`.
2. **The GROUND-5 header-clause amendment, across all four surfaces** (golden + `REQ-GROUND-5b` normative
   clause + `PROP-GROUND-5` arbitrary partition; the PROP law is unchanged) — the classification is by
   **contiguity, not file position**: a contiguous comment (including at file top) is documentation and drifts
   its unit; a blank-line-separated or import-separated header stays FRESH.

The scary third item from the first draft — a repo-wide `FOLD_DOMAIN` re-key — is **withdrawn**; it was not
forced (§Migration). **Lead recommendation: ratify 1 + 2.** They are the true, minimal ratified surfaces this
change touches.

## Cold-review corrections (2026-08-09) — recorded because they were the lead's own errors

An independent seat returned FIX-FIRST; each finding is folded in above, logged here per the ADR-0012
precedent (correct in the open, do not quietly overwrite):

1. **GROUND-5 did not survive as worded.** The contiguous-`@license`-below-imports counterexample breaks the
   old "clause (2) excludes the header" defense. Resolved by AMENDING the golden (§ above) rather than claiming
   survival — the honest move.
2. **The `FOLD_DOMAIN` v3 re-key was not forced.** Slice change alone re-keys only affected units + their
   Merkle ancestors; a bump needlessly moves comment-free files and directories. Withdrawn; migration is
   slice-only. This also removed a false owner-ratification ask.
3. **The fix was incomplete at block granularity.** Method/arrow leading JSDoc is the same blind spot; the
   decision now covers blocks (G-GAP2-1b).
4. **Determinism holes** (export default wrapper, decorators, between-decl binding) are now explicit sub-rules
   1–3 with goldens G-GAP2-7/8, not left to the implementer.
5. **Miscitation.** The first draft cited `compose.ts:70` (wrong package); the real comparison is
   `drift.ts:100-102`. Version detection is confirmed ABSENT, which is why slice-only (no bump) is the correct
   migration, not merely the cheaper one.

**Round 2 (2026-08-09) — two residual holes in the round-1 header amendment, both now closed:**

6. **The "file-leading comment stays FRESH" carve-out was self-contradictory** and re-opened GAP-2 for a
   genuine first-in-file doc-comment (the mechanical rule has no file-position leg). Fixed by DELETING the
   carve-out: the rule is now purely contiguity-based, with no file-leading exception (G-GAP2-2b is the
   consistency witness). A real header stays FRESH because it is blank-line-separated, not because it is at
   file top. Fixes 2-5 and the block-tiling/double-commit non-issue were confirmed correct by the round-2
   review.
7. **The amend list was incomplete.** Only the golden was named; the normative `REQ-GROUND-5b`
   (`req-grd.md:92-93`) and the `PROP-GROUND-5` arbitrary (`properties-grd.md:75`) also encode "header above ⇒
   FRESH" and are now in the Amends list, with the note that the PROP LAW is unchanged and only the arbitrary's
   partition of a _contiguous_ header moves. The import-above witness `SCN-GROUND-5b` does NOT regress (an
   import is not a `comment` node, so no run binds — confirmed).
