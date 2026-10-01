# Work Package — HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for a spec-integrity fix found by measurement against the real corpus.
> Conforms to [`method/wp-template.md`](../../method/wp-template.md) where the template fits an
> already-executed hotfix; the five-part gate structure is
> [`DECOMPOSITION-PROTOCOL.md`](../../DECOMPOSITION-PROTOCOL.md) §170-174. The `exec` fields
> (`outputs`/`provenance`/`trace_ref`) are FILLED, not empty, because this WP is DONE, not S4-frozen for
> later dispatch. Pointers are relative to this file (`docs/requirements/work-packages/`).

---

### WP-FIX-5.SPEC — a REQ's `normative-clause` must still exist in the invariant it cites

epic: none (out-of-band, dispatched by the lead; the `INV-TOOLS-6` amendment below is OWNER-RATIFIED)
id: WP-FIX-5.SPEC
title: Amend `INV-TOOLS-6` to the two-band reality already ratified by ADR-0013, and add the gate that
makes a REQ→INV quote divergence impossible to leave open

intent: >
Every REQ in this repo carries a verbatim quote of the invariant clause it realizes:

      source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6
      normative-clause: "return a `≤ ~2K` **governing** pack of `tier≥T1` invariants"

**Nothing checked that the quote still appears in the cited invariant.** Verified on master `e4882a3`
by three independent means, not by grep alone: `normative-clause` occurs in `harness/gates/` exactly
once, inside a COMMENT at `spec-conformance-guard.mjs:143`; no gate parses a `source: INV-… @ …#anchor`
pointer (`id-integrity` resolves `#anchor`s but classes `#tools-6` as a free-form slug it COUNTS and
DECLARES UNCHECKED); and the corpus was mechanically re-derived here — 637 REQs across 11 documents,
50 of them quoting text their cited invariant does not contain. The _satisfies_ trace this repo is
built on was unverified at exactly the link where it rots.

It had already rotted. `INV-TOOLS-6` — a RATIFIED invariant — described a `≤ ~2K` pack of `tier≥T1`
invariants as a statement about the WHOLE pack, while ADR-0013 (owner-ratified 2026-08-03) had added a
second, separately capped ADVISORY `T2` band that is SHIPPED (`packages/tools/src/bands.ts`
`splitBands`/`ADVISORY_CAP`; `Pack.advisory` + `Pack.advisoryDropped` in
`packages/contracts/src/pack.ts`). Six requirements (`REQ-TOOLS-6a`…`6f`) cite that invariant. A prior WP
correctly refused to amend it — amending a ratified invariant is the owner's surface — and recorded the
divergence at `req-tls.md:89-98` rather than straddling it silently. The owner ratified the amendment on
2026-08-04; this WP applies it, byte-exact, on all FOUR lines of `atlas-tools.md` that carried the
retired claim, and lands the gate that would have caught it.

**The gate is the deliverable; the amendment is its first real case** — and the amendment proved the
teeth, not a planted mutation: applying it turned `REQ-TOOLS-6b` RED before its quote was re-lifted.

## THE RATIFIED TEXT — OWNER-RATIFIED 2026-08-04, reproduced verbatim

This block is the RATIFICATION ARTIFACT for the `INV-TOOLS-6` amendment. It is here because a cold review
could not verify the amendment's fidelity at all: the ratified wording reached this seat in a dispatch
message and existed in no committed file, so the two renderings in the repo could only confirm each other.
It is reproduced EXACTLY as ratified, so any reviewer can diff `docs/reference/atlas-tools.md:53-56`
against it. The only permitted deviations are the `> ` quote marker below and the `- `/2-space bullet
indent the file's own list format requires; every other byte is the owner's.

> **TOOLS-6 `atlas-query` returns a bounded pack.** It MUST accept any scope (file/folder/module/crate),
> resolve it through the index to the covering territory/-ies, and return a `≤ ~2K` **governing** pack of
> `tier≥T1` invariants, **beside a separately capped ADVISORY band of `T2` machine proposals no ratifier
> saw** (ADR-0013, owner-ratified 2026-08-03); `stale:true` MUST mean re-ground before trusting (§6.1).

VERIFIED: `diff` of the shipped bullet against this block, after stripping the `> ` marker and the bullet's
`- `/2-space indent, is EMPTY: 417 bytes on each side, 0 substitutions, 0 re-wrapping.

## axioms (inherited premises — given, not re-litigated)

- **A1 — OWNER RATIFICATION, 2026-08-04**, applied byte-exact against the block quoted above; clerical in
  substance, the behaviour having been ratified by ADR-0013. No behaviour change, no REQ change beyond
  A2's quote.
- **A2.** `REQ-TOOLS-6b`'s quote is re-lifted onto the amended sentence. Checked every other
  `REQ-TOOLS-6*`: `6a`/`6c` still hold verbatim and were NOT touched; `6d`/`6e`/`6f` diverged BEFORE this
  amendment and still do — they are ledgered with a reason, not rewritten (see the framing-error section).
- **A3.** The divergence note at `req-tls.md` is CLOSED, and its stale sub-claim corrected: the GUIDANCE
  string was already fixed (`packages/tools/src/handler.ts:77`), verified on this branch.
- **A4.** The check lives in a NEW gate, `harness/gates/req-clause-guard.mjs` — the decision and its
  measured reason are in `outputs`.

## rules (the procedure — followed, not chosen)

1. Corpus re-derived and printed by the gate itself, per document and in total (`C2` below).
2. The check: for every REQ, the `normative-clause` quote must occur in the invariant text at its cited
   `source:` anchor; divergence ⇒ exit 1 naming the REQ, the invariant, the resolved anchor, the first
   point of difference, and the ledger key.
3. Teeth proven on the REAL defect first (`I1`), by ORDERING and `cp` backup/restore — never a git restore.
4. And on a synthetic divergence at a different REQ in a different document (`I3`), removed and proven
   removed by tree-wide grep + `git status`.
5. Every deviation from raw-byte comparison is stated and measured in the gate's own header: whitespace
   collapse, `\"` unescaping, `…` elision, HTML-comment stripping. Nothing else — no case folding, no
   markdown stripping, no punctuation folding.

## invariants (per-item, mechanically checkable — GATE)

- **I1.** `req-clause-guard` exits **1** on the live `REQ-TOOLS-6b` divergence — evidenced.
- **I2.** Exits **0** after the amendment + quote re-lift, with no other REQ regressing (586 clean matches
  before and after; the ledger fired all 50 both times).
- **I3.** Exits **1** on a synthetic divergence planted at `REQ-AUTH-2a`
  (`requirements-authoring.md`, a different module AND a different file family), **0** once removed.
- **I4.** Every row the gate cannot evaluate is NAMED on every run, pass or fail. One exists
  (`REQ-ADAPTER-1e`, which declares itself NOT a lift); it is printed on the PASSING run, and the
  behaviour is pinned by a test case.
- **I5.** The amended `INV-TOOLS-6` is byte-identical to A1's block (`diff` clean after stripping the
  card's `> ` quote marker and the file's `- `/2-space bullet indent).
- **I6.** No file under `packages/**` modified — `git status --porcelain | grep -c packages/` = 0.
- **I7.** Every file in `packages/**` and `harness/**` ≤400 LOC — `godfile-guard` exit 0. This invariant
  is what FORCED A4's decision: the check inside `spec-conformance-guard.mjs` measured 433 lines.

## completeness criteria (set-level closure — GATE)

- **C1.** All 8 gates run BY NAME, each exit code read directly (`node gate.mjs >/dev/null 2>&1; echo $?`),
  never through a pipe.
- **C2.** The full REQ corpus — the REQ-OWNER family `req-<m>.md` **and** `requirements-<m>.md`, 637 REQs
  across 11 documents. Per-document counts print on every run.
- **C3.** Two independent falsification demonstrations (I1 real, I3 synthetic) plus a 9-case test twin,
  `harness/gates/req-clause-guard.test.mjs`, each case a mutation of a fixture the gate passes.
- **C4.** Every count that justifies a decision prints its items: the 50 ledgered rows with one reason
  each, the 1 unevaluable row, the 91 multi-carrier anchors with their carrier line numbers, and — under
  `REQ_CLAUSE_LIST=1` — the per-REQ verdict for all 636 evaluated rows.

## quality standard (per-unit bar — COLD-REVIEW)

The refusal is actionable without a debugger: REQ id + file:line, invariant id, resolved anchor path and
block line, the first differing characters, and the exact ledger key to write. The amendment is rendered
in the house's existing `<!-- AMENDED <date> … Was: "…" -->` form (as `atlas-grounding.md` GROUND-3/5 use).
No comment in the gate claims a property the code does not enforce — the one that did (a refusal telling
you to ledger a row without printing its key) was caught by the twin and the CODE was fixed.

anchor:

- `harness/gates/req-clause-guard.mjs` — the gate (268 LOC)
- `docs/reference/atlas-tools.md:53-56` — the amended `TOOLS-6` bullet
- `docs/requirements/req-tls.md:84-110` — `REQ-TOOLS-6b`'s clause and the now-CLOSED divergence note

interface_contract:

- source: ../method-tags-tls.md#TOOLS-6

source_reqs:

- source: ../req-tls.md#REQ-TOOLS-6b # the clause that moved
- source: ../req-tls.md#REQ-TOOLS-6f # the ratified two-band requirement the invariant must now reflect

exclusions:

- `packages/**` — NO source edits. Live seats own `packages/genesis/src/**`, `packages/adapter-io/src/**`
  and `packages/tools/src/**`. Read-only, and NOTHING is asked of them: two single-band strings that were
  live at this branch's fork point `e4882a3` (the MCP tool description in `tools/src/handler.ts` and the
  `tools/src/types.ts` doc-comment) were both fixed on master by `ed22ae7` (PR #117, #193) while this
  branch was in flight. Verified against `origin/master`, not assumed: the description is two-band and
  pinned off-the-wire by e2e-blackbox S26.4, and the retired sentence survives only as a quoted "it said"
  record in the comment above it.
- `harness/gates/adr-citation-guard.mjs`, `harness/lib/**` — owned by `fix/surface-truth`. Not edited and
  not depended on: this gate imports nothing from `harness/lib/`.
- `docs/reference/commands/**`, `docs/how-to/**` — owned by `fix/doc-transcripts`.
- `docs/adr/ADR-0013-*.md` — quotes the OLD strings as its own "before" evidence. Unchanged.
- Any behavioural change anywhere.

action: re-derive the REQ corpus; build the check; run it before the amendment and capture what fails;
apply A1's amendment byte-exact across all four carriers + A2's quote re-lift + A3's note correction;
re-run to green; plant and remove a synthetic divergence elsewhere; wire the gate into `package.json` +
`ci.yml` (required by `gate-directory.test.mjs`, which fails any gate CI does not name); write this card.

action_surface: `[ read(**), edit(docs/reference/atlas-tools.md), edit(docs/requirements/req-tls.md),
  edit(harness/gates/req-clause-guard.mjs, new file), edit(harness/gates/req-clause-guard.test.mjs, new
  file), edit(harness/req-clause-ledger.json, new file), edit(package.json, one script line),
  edit(.github/workflows/ci.yml, one step line),
  edit(docs/requirements/work-packages/wp-inv-trace-guard.md, new file),
  run(tsc -b), run(vitest run), run(node harness/gates/*.mjs) ]`
WIDENED by the cold review's fix round (B-F4), to finish a fan-out that had stopped at one file:
`[ edit(docs/spec/atlas.md, one table row), edit(docs/reference/atlas-knowledge.md, one table row),
  edit(docs/requirements/method-tags-tls.md, one sentence of an amendment note),
  edit(docs/requirements/properties-tls.md, the 19 digest pins + the re-freeze record) ]`

guardrails: writes confined to the paths above; `packages/**` untouched; no `git checkout`/`restore`/
`stash`/`reset` in the worktree — the two falsification demos used `cp` backup + `cp` restore verified by
`diff -q`, and the one restoration of `spec-conformance-guard.mjs` used an explicit
`git show HEAD:<path> > <path>` write, verified by an empty `git diff` for that file; the synthetic
divergence was removed and proven gone by tree-wide grep AND `git status`; no credential-shaped string in
any fixture; commit only — no push, no PR, no merge.

acceptance:
Proof of teeth, both directions, on the SHIPPED artifact:
(1) REAL — with `INV-TOOLS-6` amended and `REQ-TOOLS-6b` still carrying master's quote, `req-clause-guard`
exits **1** naming `req-tls.md:84 REQ-TOOLS-6b`, "Diverges after 17 char(s): matched
"return a `≤ ~2K` " then wanted "pack of `tier≥T1` invariants"". Re-lift the quote ⇒ exit **0**.
(2) SYNTHETIC — `REQ-AUTH-2a` in `requirements-authoring.md` perturbed by one word ⇒ exit **1** naming it;
restored byte-identically (`diff -q`) ⇒ exit **0**; tree-wide grep for the perturbation: no matches.
(3) A 9-case test twin, including the case that a house-form AMENDMENT TOMBSTONE cannot re-satisfy a
stale quote — the hole that made the first version of this gate report OK on the very edit it exists
to catch.

deps: [ ] parallel_group: [P] (disjoint from all three live seats by the exclusions above)
MERGE ORDER, lead-owned: `fix/surface-truth` → `fix/doc-transcripts` → this branch. Do not rebase.

exit_predicate: acceptance evidenced ∧ `npx tsc -b` exit 0 ∧ `npx vitest run` reconciled literally against
the `origin/master` baseline (318 files / 2532 passed + 1 todo → 319 files / 2542 passed + 1 todo; delta
= +1 file, +10 tests: 9 from `req-clause-guard.test.mjs` and 1 from `gate-directory.test.mjs`, whose
`it.each(gateFiles)` grows by one because a gate was added; 0 pre-existing tests changed) ∧ all 8 gates
in `harness/gates/` exit 0, each read directly ∧ I1-I7 and C1-C4 each individually evidenced.

context_refs:

- source: ../req-tls.md
- source: ../../reference/atlas-tools.md
- source: ../../method/wp-template.md
- source: ./wp-fix-scip-local-edges.md

owner: SPEC territory · builder_id: `charlie`

outputs:

- `harness/gates/req-clause-guard.mjs` — the gate, 268 LOC. **A4 DECISION: a new file, not a fifth check
  inside `spec-conformance-guard.mjs`, and the reason is a MEASUREMENT rather than a preference.** The
  check was first built inside that guard and measured 433 lines — over the repo's own 400-LOC ceiling,
  which the card required either way (I7). Externalising only the 50-row ledger would have left the
  file at ~380, one edit from the cap and with the table hidden from `godfile-guard`'s `.mjs` scope. The
  check is also its own taproot: check (4) there enforces that an amendment was VISITED in every
  restatement, this one enforces what the restatement SAYS. The cost is real and was paid in full: a new
  file in `harness/gates/` MUST be named by an npm script and by `ci.yml` or `gate-directory.test.mjs`
  fails it, so `package.json` and `.github/workflows/ci.yml` each gained one line.
- `harness/gates/req-clause-guard.test.mjs` — 9-case twin over a fixture corpus (`REQ_CLAUSE_ROOT` /
  `REQ_CLAUSE_LEDGER` overrides), covering pass, the real amend-without-fan-out shape, `…` elision AND
  its order enforcement, `\"` escaping, the amendment-tombstone hole, emphasis/case NOT being folded,
  the multi-carrier report, unevaluable-row naming on a PASSING run, and the ledger ratchet both ways
- `harness/req-clause-ledger.json` — 50 pre-existing divergences, one authored reason each, shrink-only
- `docs/reference/atlas-tools.md` — `INV-TOOLS-6` amended byte-exact (A1) + house-form amendment note;
  and the SAME retired claim amended on its three other carriers in that file: the `QueryOut` data-model
  line (21), the `atlas-query` Surface/API line (154) and acceptance item 5 (232)
- `docs/requirements/req-tls.md` — `REQ-TOOLS-6b`'s quote re-lifted, its EARS sentence amended to match
  (it said "a `≤ ~2K` pack of `tier≥T1` invariants" one line above the two-band clause — a REQ
  contradicting itself, and invisible to the gate, which reads `normative-clause:` only); the divergence
  note marked CLOSED and its stale sub-claims corrected
- `docs/spec/atlas.md`, `docs/reference/atlas-knowledge.md` — the SAME retired claim, in the
  `atlas-query` row of each file's tool table, amended in the same register (cold review B-F4)
- `docs/requirements/method-tags-tls.md` — the closing sentence of INV-TOOLS-6's amendment note recorded
  `reference/atlas-tools.md#tools-6` as an OPEN divergence, which this WP closes; corrected. The
  `up-property` is deliberately NOT rewritten — the 2026-08-03 amendment scoped it as a statement about
  the GOVERNING band, that scoping is ratified and true, and re-authoring a ratified law under cover of a
  clerical fix is not this WP's surface
- `docs/requirements/properties-tls.md` — the 19 `@sha256` pins re-frozen `aa329ac9` → `ecf859a9`, with a
  record of WHY. The digest tripwire (`spec-conformance-guard` check (3)) fired on the method-tags edit
  exactly as designed; PROP-TOOLS-6's `law`/`arbitrary`/`teeth`/`witness` are reconciled UNCHANGED,
  because no `up-property`/`down-model`/`anti-rot` text moved
- `package.json`, `.github/workflows/ci.yml` — one line each, wiring the gate (see A4)
- `docs/requirements/work-packages/wp-inv-trace-guard.md` — this card

provenance:

- branch `fix/inv-trace-guard`, forked from master `e4882a3`
- worktree-local commit; this card does not self-report a sha it did not mint

trace_ref: manual — lead brief (WP-CARD, with a mid-flight delta widening A1 from one carrier to four) →
this card + the files under `outputs`; no automated S0-S4 trace exists for an out-of-band hotfix

rationale:

- source: ../req-tls.md#REQ-TOOLS-6f

---

## What the lead's framing got wrong

**1. Rule 3 was unsatisfiable as written, and the reason is the finding.** The card required the gate to
FAIL on `REQ-TOOLS-6b` _before_ the amendment. It does not, and cannot: on master `e4882a3` that clause
quotes the UNAMENDED invariant exactly. The live `INV-TOOLS-6` divergence was SEMANTIC — the REQ corpus
said two bands, the invariant said one — and a quote-existence check is blind to it by construction. What
the gate catches is the opposite direction: an invariant amended without its quotes fanned out. Before the
amendment the gate fails on 50 REQs, and inside the TOOLS-6 family on **`6d`, `6e`, `6f`** — `6f` being the
ratified two-band requirement whose text the invariant never carried, i.e. the live ADR-0013 rot, found
mechanically. The real teeth were then proven at `REQ-TOOLS-6b` in the correct order: amend first, watch it
go red, re-lift the quote. Same defect, same REQ, opposite ordering.

**2. "No gate checks `normative-clause`" is right, but grep was the wrong instrument and would have missed
the near-miss.** Verified three ways instead: the literal string occurs once in `harness/`, in a comment;
no gate parses a `source: INV-… @ …#anchor` pointer; and `id-integrity.mjs` — the gate that DOES resolve
anchors — classes `#tools-6` as a free-form slug, and prints "DECLARED UNCOVERED: 977 free-form slug/label
anchor citations (224 distinct) are COUNTED, NOT CHECKED" on every green run. That last one is the
near-miss: a gate reads these pointers, says out loud that it does not resolve them, and is green.

**3. "Every REQ carries the field" — true, and it was worth measuring.** 637/637 carry both `source:` and
`normative-clause:`. But the corpus is 637 REQs across **11** files, not the 9 `req-*.md`: the REQ-owner
family also includes `requirements-adapters.md` and `requirements-authoring.md`, 142 REQs, 22% of the
corpus, which C2's "every module's `req-*.md`" would have silently excluded. And one REQ is unevaluable —
`REQ-ADAPTER-1e`, whose `source:` is "SECURITY AMENDMENT 2026-08-02 … NOT a lift from INV-ADAPTER-1" and
whose clause is "— none". Correctly authored, and it must be NAMED, not skipped.

**4. "A verbatim string comparison is the right check" — no, not on this corpus, and each correction is
measured.** Byte-exact containment holds for only **281 of 636** evaluable rows. Whitespace collapse
(reference docs hard-wrap at ~110 columns) takes it to 570. The corpus escapes inner quotes as `\"` and
elides with `…` — 16 further rows, and honouring both is not leniency: fragments must still match verbatim,
in order. That leaves 50 genuine divergences, ledgered shrink-only, one reason each.

**5. The sharpest one — and it is the lead's ordering that surfaced it. The house's own amendment form
switches the gate off.** An amendment is recorded as `<!-- AMENDED …: was "<retired sentence>" -->` INSIDE
the amended block. The first run of this gate after applying A1 reported **OK**, because `REQ-TOOLS-6b`'s
stale quote resolved into the tombstone the amendment itself had just added. A guard that a correctly
written amendment note disables is worse than no guard. HTML comments are now stripped from the invariant
side; the tombstone case is pinned by a test.

**6. The delta's suspicion about anchor resolution was right, and bigger than four lines.** **91 of the 173
distinct cited anchors have MORE THAN ONE carrier** in their target file — the `## Invariants` bullet and
the numbered `## Acceptance` restatement of the same id. "First match" is therefore a verdict decided by
document ORDER. On this corpus it changes exactly one row (`REQ-TOOLS-9b`, whose quote misses the TOOLS-9
bullet at line 70 and hits the acceptance restatement 156 lines later). The gate judges the FIRST carrier,
REPORTS a later hit instead of accepting it, and prints all 91 anchors with their carrier lines every run.

**7. A2 as written would have rewritten three quotes it should not have.** "Change only those whose quote
actually diverges" is ambiguous between "diverges because of this amendment" (only `6b`) and "diverges at
all" (`6b`, `6d`, `6e`, `6f`). The latter would have had this WP silently re-author three ADR-0013-derived
clauses under cover of a clerical amendment. Only `6b` was touched; `6d`/`6e`/`6f` are ledgered with their
reasons.

**8. What I got wrong, found by the cold review — and the worst one is this WP's own defect class.** The
amendment I committed into a ratified invariant file promised enforcement by "`spec-conformance-guard`
check (5)", a check that does not exist: it is residue from the A4 design I abandoned at 433 LOC, and the
gate that really does this is `req-clause-guard`, which was named nowhere outside this card. **A false
"fails CI" promise, written into a ratified tombstone, by the branch whose entire purpose is closing that
class.** A pointer nobody resolves — for the fourth time this week, this time mine. Both sites now name the
real gate. Three more, same round: the note asserted two live product residues that master had already
fixed under me in `ed22ae7` (verified against `origin/master`, not assumed); `REQ-TOOLS-6b`'s EARS sentence
still said "a `≤ ~2K` pack of `tier≥T1` invariants" one line above its own two-band clause; and the fan-out
stopped at one file while the same claim stood in `spec/atlas.md`, `reference/atlas-knowledge.md` and — the
sharpest — this card's own declared `interface_contract`, `method-tags-tls.md#TOOLS-6`, whose note still
recorded the divergence as OPEN. I had verified the fan-out WITHIN `atlas-tools.md` and never swept the
tree; the sweep that found the rest took one grep.

**9. What the lead got right, confirmed by measurement.** The amendment IS clerical — the two-band
behaviour is shipped and ratified, and `git diff --stat` shows zero `packages/**` bytes. A1's block applied
byte-exact with no re-wrapping. The delta's four carriers are all real (lines 21, 54, 140, 218-219 on
master; the last three now amended too) — and the delta's own instruction to verify them paid off: line
140's "related band" is the derived `subsumes`/`sameAs` band of `QueryEnvelope`, NOT ADR-0013's advisory
band, so it was amended for its `≤2K` whole-pack claim only and its "related band" wording left alone.
