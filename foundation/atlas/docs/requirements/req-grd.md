# Requirements — Block GRD (grounding) · S1 lift-and-tag

### REQ-GROUND-1a — subtreeHash is the drift oracle

source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
The grounding gate shall use each grounding entry's `subtreeHash` as its drift oracle.
normative-clause: "A grounding entry's drift oracle MUST be its `subtreeHash`."

> Reviewed under the 2026-08-02 **AMENDED** wave (HONESTY-TAPROOT) and **UNAFFECTED** — the oracle IS the `subtreeHash` and always was. Only the witness edit in `SCN-GROUND-1a-1` changed (a whitespace reformat, which does not hold the hash constant, → an import added above, which does).

### REQ-GROUND-1b — displayLines excluded from drift

source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
If drift is being detected for a grounding entry, then the grounding gate shall not let `displayLines` participate.
normative-clause: "`displayLines` MUST NOT participate in drift detection."

### REQ-GROUND-1c — line-ranges are never an anchor

source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
If a grounding entry is anchored by line-ranges alone, then the grounding gate shall reject it as an invalid anchor.
normative-clause: "Line-ranges alone are NEVER a valid anchor."

### REQ-GROUND-1d — a grounding entry MAY carry a span, addressed into content-addressed bytes

source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
If a grounding entry records where inside the cited unit a claim was derived from, then the grounding gate shall record it as a `span` — the digest of the byte sequence plus a byte range into it — and shall never record a copy of the cited text.
normative-clause: "A grounding entry's `span` MUST address content-addressed bytes (`contentHash` + `[start, end)`); it MUST NOT store the cited text."

> **ADDED by the owner-approved SPAN amendment (2026-08-02)**, on the ADR-precedent that a ratified decision may add a REQ under an existing invariant (cf. REQ-MCP-1d/1e under ADR-0006). Rationale, because the distinction is the whole point: a stored quote is a second, unversioned copy of the source — it drifts silently the moment the file changes and nothing can ever check that those characters were really there. A span addressed into content-addressed bytes RE-DERIVES: re-read the cited bytes, verify they hash to `contentHash`, slice the range. If the content moved, the hash no longer matches and the read refuses, while the fact's freshness verdict is still decided by the existing drift machinery over `anchor.subtreeHash`.

### REQ-GROUND-1e — the span is additive and absent-tolerant

source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
If a grounding entry carries no `span`, then the grounding gate shall read it exactly as before and shall treat the location inside the unit as unknown.
normative-clause: "`span` is OPTIONAL. Absent MUST mean UNKNOWN — never a defaulted whole-unit citation — and an entry without one MUST still satisfy GROUND-2 on its `anchor.subtreeHash` alone."

> **ADDED 2026-08-02 with REQ-GROUND-1d.** The same additive/absent-tolerant discipline as `builtAt`/`sameAs` (task #75) and the per-row `derivedAt` watermark: old data still reads, and an absent field is a stated unknown rather than a fabricated default. A `span` is ADDITIVE to an entry's anchor, never a replacement for it — an entry carrying a valid span and an empty `subtreeHash` is still not real grounding (REQ-GROUND-2a).

### REQ-GROUND-1f — the span never participates in drift, and its stored form is not integrity-protected

source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
If drift is being detected for a grounding entry, then the grounding gate shall not let `span` participate.
normative-clause: "`span` MUST NOT participate in drift detection — the oracle stays `anchor.subtreeHash`, exactly as for `displayLines` (REQ-GROUND-1b)."

> **ADDED 2026-08-02 with REQ-GROUND-1d — and the LIMIT is recorded here rather than implied away.** A `span` lives inside `grounding`, which KERNEL-8 EXCLUDES from the canonical preimage at every level (`packages/kernel/src/canonical.ts` `SIDE_INDEX`). MEASURED end-to-end on the built binary (2026-08-03, `atlas emit` → `atlas node <addr>` on a real fixture repo): a fact emitted with a span persisted to `.atlas/cas/19/1994bea4…`; rewriting that span in place — offsets `7,12` → `0,3` and `contentHash` `aaa…` → `bbb…` — left `atlas node <addr>` answering `status: ok`, exit 0, byte-identical output, while the control tamper of `claimNorm` (inside the preimage) answered `no-such-node`, exit 1. So: **a stored span can be tampered without any shipped surface noticing.** What `readSpan` witnesses is the CONTENT — bytes that are not the addressed bytes yield no citation — not the integrity of the offsets as stored. Anything stronger requires folding `span` into the addressed preimage, which is a KERNEL-8 amendment and is NOT claimed here.

### REQ-GROUND-1g — the span's offsets are UTF-8 bytes, and it is absent for a whole-file anchor

source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
If a producer mints a span, then the grounding gate shall require its offsets to index UTF-8 bytes of the sequence `contentHash` commits to, and shall require the span to be absent when the cited unit is the whole file.
normative-clause: "`span.start`/`span.end` MUST be UTF-8 BYTE offsets into the sequence `contentHash` digests. A producer holding offsets in any other unit MUST convert before minting. A `file`-kind anchor MUST NOT carry a span — never `0..len`, never `0..0`, never a sentinel; absence is the stated unknown (REQ-GROUND-1e)."

> **ADDED 2026-08-03 (task #159).** Two obligations that were implied by the type and by nothing else, both MEASURED against the built modules rather than reasoned about.
>
> **The unit.** `web-tree-sitter` 0.23.x reports `node.startIndex`/`endIndex` in **UTF-16 code units**. `packages/adapter-io/src/ast.ts` `src.slice(node.startIndex, node.endIndex)` is therefore correct — `String.prototype.slice` counts the same units — and is NOT the defect. The divergence is between tree-sitter and this REQ. On a fixture whose anchored unit follows a `café ☕`/`🚀` prefix the unit begins at UTF-16 offset **64** and byte offset **71**; minting from the UTF-16 value returns `unch";\nexport function …`, off by 7 at both ends, and is NOT refused — `mintSpan`'s `splitsCodePoint` guard rejects only a boundary landing mid-code-point, and 64 is a valid boundary. No production producer supplies interior offsets today (the sole mint is `0..length`, whose endpoints are unit-agnostic), so this REQ is a **standing obligation on the symbol-granular producer #182 will add**, written before the first interior offset is minted rather than after.
>
> **What the digest commits to.** The shipped chain is `readFileSync(fd,'utf8')` → JS string → `TextEncoder().encode(…)`: the digest is over the UTF-8 re-encoding of the decoded text, not over the file's stored bytes. Measured: for well-formed UTF-8 — including astral characters and NFD-decomposed text — the round-trip is lossless and the two agree byte-for-byte; for malformed UTF-8 (a lone `0xFF` → U+FFFD, 2 bytes longer) they do not, and `readSpan` against the raw file bytes returns `undefined`. Fail-closed and correct in direction; recorded so a reader knows it must present the same decode-then-encode bytes. `TextEncoder` does not Unicode-normalize, so the KERNEL-1 NFC rule does not reach this digest.
>
> **The `file` case.** The unit IS the file, so a `0..len` span adds nothing the anchor does not carry and invites a reader to treat "the whole file" as a located citation. Absence is not a gap here — it is the correct answer, on the REQ-GROUND-1e discipline.

### REQ-GROUND-2a — definition of a real grounding

source: INV-GROUND-2 @ reference/atlas-grounding.md#ground-2
The grounding gate shall treat a `Grounding` as real if and only if it has at least one entry and every entry carries a non-empty `subtreeHash`.
normative-clause: "A `Grounding` is real iff it has ≥1 entry and every entry carries a non-empty `subtreeHash`."

### REQ-GROUND-2b — ungrounded is never FRESH

source: INV-GROUND-2 @ reference/atlas-grounding.md#ground-2
If a grounding is ungrounded, then the grounding gate shall never report it as FRESH.
normative-clause: "An ungrounded grounding MUST NOT ever be FRESH."

### REQ-GROUND-3a — unresolvable citation fails the WHOLE fact

source: INV-GROUND-3 @ reference/atlas-grounding.md#ground-3
If a citation is unresolvable, then the grounding gate shall ground the whole fact to nothing in `ground()`.
normative-clause: "An unresolvable citation (unit gone, path absent) MUST fail closed — the WHOLE fact grounds to nothing in `ground()`"

> **AMENDED 2026-08-02 (HONESTY-TAPROOT), fanning out the amendment already made in `goldens-grd.md`.**
> Previously: "the grounding gate shall drop it" / "dropped by `ground()`". That per-ENTRY wording is
> fail-OPEN per FACT and was executed — a fact citing two units, one deleted, re-grounded to a one-entry
> receipt that `isGrounded` accepted and `driftDetect` read `FRESH`. `goldens-grd.md` REQ-GROUND-3a was
> amended at `f2a8659`; THIS document was not, so the two contradicted each other while every gate exited 0.
> Now claimed: one unresolvable citation ⇒ no receipt at all. The original teeth are unchanged.

### REQ-GROUND-3b — unresolvable citation reads DRIFTED

source: INV-GROUND-3 @ reference/atlas-grounding.md#ground-3
If a citation is unresolvable, then the grounding gate shall treat it as `DRIFTED` in `driftDetect()`.
normative-clause: "treated as `DRIFTED` by `driftDetect()`"

### REQ-GROUND-3c — resolution never throws

source: INV-GROUND-3 @ reference/atlas-grounding.md#ground-3
If a citation is unresolvable, then the grounding gate shall not throw.
normative-clause: "It MUST NOT throw."

### REQ-GROUND-4 — truth-gate on grounded and FRESH

source: INV-GROUND-4 @ reference/atlas-grounding.md#ground-4
The grounding gate shall enforce the truth-gate through `gateHolds`, gating on the grounded and FRESH inputs supplied by GROUND-2, GROUND-3, and GROUND-5.
normative-clause: "enforced in atlas-grounding by `gateHolds` (GROUND-2/3/5 supply the grounded ∧ FRESH inputs it gates on)"

### REQ-GROUND-5a — real change drifts the fact

source: INV-GROUND-5 @ reference/atlas-grounding.md#ground-5
When a real change is made to the cited unit, the grounding gate shall drift the fact.
normative-clause: "a real change to the cited unit MUST drift it."

### REQ-GROUND-5b — an edit that does not touch the cited unit never drifts

source: INV-GROUND-5 @ reference/atlas-grounding.md#ground-5
If an edit that does not touch the cited unit (an import, or a blank-line-separated license/file header added above it, an unrelated rename elsewhere) is made, then the grounding gate shall not drift the fact. A reformat OF the cited unit, or an edit to a comment CONTIGUOUS (no blank line) with the cited declaration, DOES drift it — a contiguous leading comment is the declaration's bound doc-comment (ADR-0014).
normative-clause: "An edit that does not touch the cited unit (import, or a blank-line-separated license/file header added above it, unrelated rename elsewhere) MUST NOT drift a fact; a reformat OF the cited unit, or an edit to a comment CONTIGUOUS with the cited declaration (its bound doc-comment), DOES drift it, and MUST — classification is by contiguity, not file position (ADR-0014)"

> **AMENDED 2026-08-02 (HONESTY-TAPROOT), fanning out the amendment already made in `goldens-grd.md`.**
> Previously: "a semantically-irrelevant edit (reformat, import added above, unrelated rename) MUST NOT
> drift a fact". Two of those three legs are delivered — MEASURED through the real
> `foldAstUnits → build → driftDetect` chain: import/license-header-above ⇒ `FRESH`, unrelated-rename-
> elsewhere ⇒ `FRESH`. The import-above leg only became true at `f2a8659`, when the symbol's BYTE START
> INDEX left the anchor key. The **reformat** leg is NOT delivered and deliberately will not be: the oracle
> hashes the unit's raw source slice (NFC-normalized only), so `return 42;` → `return  42;` moves the hash
> and the verdict is `DRIFTED` (measured). Delivering it needs a normalizer, and any cheap normalization
> over raw text also erases whitespace that is SEMANTIC in TS/TSX — string, template and regex literals,
> JSX text, ASI. The trade is asymmetric: a false alarm costs one re-ground, a false negative lets the truth
> gate serve HOLDS on a stale fact. `goldens-grd.md` REQ-GROUND-5b was amended at `f2a8659`; THIS document
> was not, so the two contradicted each other while every gate exited 0.
>
> **AMENDED 2026-08-09 (ADR-0014, owner-ratified).** The "license header added above ⇒ FRESH" leg is now
> qualified by CONTIGUITY, co-amended in the same landing as the code (rule #198): a header **separated by ≥1
> blank line** from the first declaration stays FRESH (the conventional case, unchanged); a comment
> **contiguous** with a declaration IS its bound doc-comment and a change to it DRIFTS the unit. The EARS
> sentence and the normative-clause above moved together with the `adapter-io` slice change. The import-above
> leg does NOT regress (an import is not a `comment` node, so no doc-comment run binds).

### REQ-GROUND-6 — fail-closed write at emit

source: INV-GROUND-6 @ reference/atlas-grounding.md#ground-6
If a fact is ungrounded, then the grounding gate shall not let it enter at `emit`.
normative-clause: "ungrounded facts do not enter"

### REQ-GROUND-7a — admit iff true and not harmful to store

source: INV-GROUND-7 @ reference/atlas-grounding.md#ground-7
amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).
The grounding gate shall admit a fact if and only if it passes the truth door and is not harmful to store.
normative-clause: "A fact is admitted iff it passes **both**: (1) **truth** — its grounding re-checks FRESH (GROUND-4); and (2) **not harmful to store** — it is not a secret / PII, the one class where storing IS the harm (ADR-0012)."

### REQ-GROUND-7b — admit the true-but-obvious, with a low score

source: INV-GROUND-7 @ reference/atlas-grounding.md#ground-7
amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).
If a fact is true but obvious, then the grounding gate shall admit it carrying a low obviousness score, and shall not reject it.
normative-clause: "A true-but-obvious fact is **admitted with a low score**; the usefulness judgment `actionable ∧ non-obvious` is **computed and stored as a score**, never a veto, and the ranking decision is taken a-posteriori at retrieval (ADR-0012)."

### REQ-GROUND-7c — failing either door blocks admission

source: INV-GROUND-7 @ reference/atlas-grounding.md#ground-7
If a fact fails either the truth door or the harm door, then the grounding gate shall block its admission.
normative-clause: "Failing either door — truth, or harmful-to-store — blocks admission. Obviousness is not a door and blocks nothing."

### REQ-GROUND-8 — untrusted source excluded from gate

source: INV-GROUND-8 @ reference/atlas-grounding.md#ground-8
If a claim's source is `untrusted`, then the grounding gate shall exclude it from `gateHolds`.
normative-clause: "an `untrusted`-source claim is excluded from `gateHolds`."

### REQ-GROUND-9 — no free-prose fact persists

source: INV-GROUND-9 @ reference/atlas-grounding.md#ground-9
If a fact is free-prose, then the grounding gate shall not persist it at `emit`.
normative-clause: "no free-prose fact persists"

### REQ-GROUND-10a — subtreeHash computed via the seam

source: INV-GROUND-10 @ reference/atlas-grounding.md#ground-10
The grounding gate shall compute `subtreeHash` through the `@orchestra/kernel` encoder seam.
normative-clause: "`subtreeHash` MUST be computed through the `@orchestra/kernel` encoder seam"

### REQ-GROUND-10b — no locally-inlined hash call

source: INV-GROUND-10 @ reference/atlas-grounding.md#ground-10
If a hash is needed for `subtreeHash`, then the grounding gate shall not use a locally-inlined hash call.
normative-clause: "not a locally-inlined hash call"

### REQ-GROUND-11a — freshness folds own hash and closure interface

source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
The grounding gate shall fold into a fact's freshness both its own grounding-set's `subtreeHash` and its forward-closure's interface/signature-level `rState`.
normative-clause: "A fact's freshness MUST fold **both** (a) its own grounding-set's `subtreeHash` **and** (b) its forward-closure's **interface/signature-level `rState`** (the type/contract-relevant structure) on the dependency axis (INDEX-12)"

### REQ-GROUND-11b — never fold callee full body

source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
If the freshness fold traverses a callee, then the grounding gate shall not fold the callee's full-body `subtreeHash`.
normative-clause: "**NOT** the callee's full-body `subtreeHash`"

### REQ-GROUND-11c — callee contract change drifts callers

source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
When a callee's signature or contract changes, the grounding gate shall drift its callers.
normative-clause: "a callee whose **signature/contract** changed MUST DRIFT its callers"

### REQ-GROUND-11d — pure-body refactor never drifts callers

source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
If a callee undergoes a pure-body refactor with an unchanged signature, then the grounding gate shall not drift its callers.
normative-clause: "while a pure-body refactor of that callee MUST NOT."

### REQ-GROUND-11e — freshness never asserts truth

source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
If freshness is phrased, then the grounding gate shall not phrase it as "the claim is true."
normative-clause: "never as \"the claim is true.\""

### REQ-GROUND-11f — freshness phrased as structural unchange

source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
When freshness is phrased, the grounding gate shall phrase it as the cited unit and its dependencies' interfaces being structurally unchanged.
normative-clause: "Freshness MUST be phrased as \"the cited unit **and its dependencies' interfaces** are structurally unchanged,\""

### REQ-GROUND-12a — repo-wide rule grounds to policy artifact

source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
The grounding gate shall make a genuinely repo-wide rule groundable to the `repo`/`project` level, anchored to a policy artifact.
normative-clause: "A genuinely repo-wide rule with no single symbol anchor (\"all handlers must be idempotent\") MUST be groundable to the spatial `repo`/`project` level, anchored to a **policy artifact**."

### REQ-GROUND-12b — anchor to the section block hash

source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
When grounding a rule to a parseable policy artifact, the grounding gate shall anchor it to the relevant heading/section block's `subtreeHash`.
normative-clause: "the anchor MUST be the **relevant heading/section block's `subtreeHash`**"

### REQ-GROUND-12c — never anchor to whole-file byte-hash

source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
If a policy artifact is parseable, then the grounding gate shall not anchor the rule to the whole-file byte-hash.
normative-clause: "NOT the whole-file byte-hash"

### REQ-GROUND-12d — byte-hash reserved for non-parseable files

source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
While a policy file is genuinely non-parseable, the grounding gate shall reserve the whole-file byte-hash for it.
normative-clause: "The whole-file byte-hash is reserved for genuinely **non-parseable** policy files."

### REQ-GROUND-12e — anchorless rule rejected

source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
If a rule has no artifact anchor, then the grounding gate shall reject it as anchorless.
normative-clause: "A rule with **no** artifact anchor stays anchorless and MUST be rejected"

### REQ-GROUND-13a — predicate drift takes the KNOW-5 split

source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
When a predicate fact drifts, the grounding gate shall route it through the KNOW-5 mechanical/semantic split.
normative-clause: "A **predicate** fact (carrying a re-runnable `check`) that drifts takes the KNOW-5 mechanical/semantic split."

### REQ-GROUND-13b — advisory drift resolves to STALE

source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
When an advisory fact's grounding drifts, the grounding gate shall resolve it to `STALE`.
normative-clause: "An advisory fact whose grounding drifts MUST resolve to `STALE`"

### REQ-GROUND-13c — advisory never forced into an arm

source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
If an advisory fact's grounding drifts, then the grounding gate shall not force it into either arm of the KNOW-5 split.
normative-clause: "it MUST NOT be forced into either arm"

### REQ-GROUND-13d — advisory never silently re-grounded

source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
If an advisory fact's grounding drifts, then the grounding gate shall never silently re-ground it.
normative-clause: "**never** silently re-grounded"

### REQ-GROUND-13e — STALE advisory never blocks a merge

source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
If an advisory fact is STALE, then the grounding gate shall not block a merge.
normative-clause: "it MUST NOT block a merge."

## [NEEDS RECONCILIATION]

- INV-GROUND-4: the HOLDS→NA downgrade threshold ("serves NA when not grounded∧FRESH") is normative in spec A-1, not in the GROUND-4 Invariants clause (a `→ see spec A-1` pointer); route the A-1 lift so GROUND-4 gets a verifiable downgrade REQ.
- INV-GROUND-9: the missing-field / over-cap reject guard is normative in spec A-13 (ref Acceptance), not in the GROUND-9 clause (which states only "no free-prose fact persists"); route the A-13 lift so the reject path gets its own `If-then` guard REQ.
