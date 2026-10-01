# Requirements — Block TLS (tools/delivery) · S1 lift-and-tag

### REQ-TOOLS-1a — governance surface is the derived six tools

source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1 (amended WP-SAMEAS, ADR-0003; counts superseded by ADR-0006 Decision 2)
The tools layer shall expose the DERIVED + BUDGETED `GOVERNANCE_SURFACE` — today six: `atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`, `atlas-memory-emit` — as its governance surface.
normative-clause: "The **governance** surface is the DERIVED + BUDGETED `GOVERNANCE_SURFACE` — today six:
`atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`, `atlas-memory-emit`
(ADR-0006 Decision 2 replaced the fixed \"exactly five\" with a derived-and-budgeted property, ARCH-5/6/7)"

### REQ-TOOLS-1b — every write flows through a governed door

source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1 (amended WP-SAMEAS, ADR-0003; counts superseded by ADR-0006 Decision 2)
The tools layer shall route every write through a governed door — `atlas-emit` (grounded-fact write), `atlas-link` (sameAs write) or `atlas-memory-emit` (memory write) — each enforcing owner-scoped authorization (KNOW-11) plus a ratifier and a fail-closed-visible refusal; no back-channel write may bypass a governed door.
normative-clause: "The closed write set (`WRITE_PATHS`) is three: `atlas-emit` (grounded-fact write),
`atlas-link` (sameAs-equivalence write), `atlas-memory-emit` (memory write)"

### REQ-TOOLS-1c — reject back-channel writes

source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1
If a back-channel write attempts to bypass `atlas-emit`, then the tools layer shall not let it write.
normative-clause: "no back-channel write may bypass it"

### REQ-TOOLS-1d — read projections carry no write authority

source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1
The tools layer shall expose per-node read projections as read-only views that carry no write authority.
normative-clause: "Per-node read projections (the node-tools of RETR-5 / TOOLS-10) are **not** a governance write tool — they are read-only views of the same store and carry no write authority."

### REQ-TOOLS-1e — atlas-link is a governed sameAs write door (assert AND retract)

source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1 (WP-SAMEAS, ADR-0003; retraction: A-D3 / task #83)
The `atlas-link` tool shall assert a `sameAs` equivalence between two existing nodeKeys ONLY after a fail-closed gate ladder in order — distinct nodes, both nodes present, KNOW-11 authorization of the actor over EVERY scope the merged equivalence class spans, and a ratifier that satisfies the KNOW-8 law for the JOIN of that class's tiers (`billy` when any member is `T0`) — persisting nothing on any gate failure and surfacing the refusal fail-closed-visibly (`linked:false`, exit 2 / MCP `isError`).
The same tool shall RETRACT a previously asserted equivalence when invoked with `retract` (CLI `--retract`, MCP `retract:true`), through the IDENTICAL gate ladder, adding no tool to `GOVERNANCE_SURFACE` and no door to `WRITE_PATHS`. A retraction shall be recorded as an APPEND (`sameAsRetracted` on both endpoints) that removes nothing, and shall cause the read fold to stop merging across the withdrawn edge so the class splits. Retracting an unasserted pair, retracting an already-retracted pair, and re-asserting a retracted pair shall each be refused with a distinct named discriminant (`not-linked` / `already-retracted` / `retracted-pair`), evaluated only AFTER the governance gates so the pair's state is not disclosed to an unauthorized or unratified caller.
normative-clause: "`atlas-link` is a governed write door in BOTH modes — authz over every scope the merged class spans + the class-tier-graded KNOW-8 ratifier + a fail-closed-visible refusal, identical for an assertion and for a retraction, so an unratified actor can never undo a ratified merge. The asserted equivalence is NON-destructive (a derived read-side edge, never a fact merge), and its retraction is non-destructive of EVIDENCE (an append, never a delete)."

### REQ-TOOLS-2a — tools pure and total

source: INV-TOOLS-2 @ reference/atlas-tools.md#tools-2
Each Atlas tool shall be pure and total.
normative-clause: "Every tool MUST be pure and total"

### REQ-TOOLS-2b — malformed argument fails closed

source: INV-TOOLS-2 @ reference/atlas-tools.md#tools-2
If a malformed argument reaches an Atlas tool, then the tool shall fail closed to a structured empty/rejected verdict rather than throw.
normative-clause: "a malformed argument fails closed to a structured empty/rejected verdict; none throws"

### REQ-TOOLS-3a — CLI and MCP parity on one schema

source: INV-TOOLS-3 @ reference/atlas-tools.md#tools-3
Each Atlas tool shall be callable identically over the CLI and over MCP against one published input schema.
normative-clause: "Every tool MUST be callable identically over the CLI and over MCP, against one **published input schema**"

### REQ-TOOLS-3b — CLI and MCP must not diverge

source: INV-TOOLS-3 @ reference/atlas-tools.md#tools-3
If an Atlas tool is invoked over both the CLI and MCP, then the tool shall not diverge in behavior or contract between the two transports.
normative-clause: "The two transports MUST NOT diverge in behavior or contract"

### REQ-TOOLS-4 — every result carries guidance

source: INV-TOOLS-4 @ reference/atlas-tools.md#tools-4
When an Atlas tool returns a result, the tool shall include `next + invariant` guidance.
normative-clause: "Every result MUST carry `next + invariant` guidance — what to do next and which invariant governs"

### REQ-TOOLS-5a — move-in is $0-LLM and structural

source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
The `atlas-init` tool shall perform move-in as a `$0`-LLM, structural operation.
normative-clause: "Move-in MUST be `$0`-LLM and structural"

### REQ-TOOLS-5b — atlas-init returns skeleton, blast radius, flags

source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
When `atlas-init` runs on a tree, the tool shall return the territory skeleton, the blast radius, and the T0-candidate flags.
normative-clause: "it MUST return the territory skeleton + blast radius + T0-candidate flags"

### REQ-TOOLS-5c — never set a tier above T2

source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
If `atlas-init` would set a tier above `T2`, then the tool shall not set it.
normative-clause: "MUST NOT set any tier above `T2`"

### REQ-TOOLS-5d — never auto-promote a T0

source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
If a `T0` would be promoted during move-in, then `atlas-init` shall not promote it automatically.
normative-clause: "promote a `T0` automatically"

### REQ-TOOLS-5e — heuristics only flag T0 candidates

source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
Where a heuristic detects a `T0` candidate, `atlas-init` shall only flag it.
normative-clause: "Heuristics MAY only _flag_ a T0 candidate."

### REQ-TOOLS-6a — query resolves scope to covering territories

source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6
When `atlas-query` receives a scope of file, folder, module, or crate, the tool shall resolve it through the index to the covering territory/-ies.
normative-clause: "It MUST accept any scope (file/folder/module/crate), resolve it through the index to the covering territory/-ies"

### REQ-TOOLS-6b — pack is bounded to tier≥T1

source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6
The `atlas-query` tool shall return a `≤ ~2K` **governing** pack of `tier≥T1` invariants, beside the
separately capped ADVISORY band of `T2` rows that REQ-TOOLS-6f governs.
normative-clause: "return a `≤ ~2K` **governing** pack of `tier≥T1` invariants"

<!-- SCOPE OF THIS CLAUSE AFTER ADR-0013 (owner-ratified 2026-08-03), stated here because the sentence above
     is now about ONE of two bands rather than about the whole pack. `invariants` — the GOVERNING band — is
     bounded exactly as written, and REQ-TOOLS-6f adds the separately capped ADVISORY band beside it. The
     governing band's content, order and budget are unchanged: `splitBands` (@atlas/tools src/bands.ts) caps
     only the advisory side, so for a covering set with no `T2` row this door returns byte-identically what
     it returned before (pinned by SCN-TOOLS-6f-3 and by the `wp-per-fact-freshness.test.ts` band tests).

     CLOSED 2026-08-04 — the divergence recorded below is resolved, and the record is kept rather than
     deleted so the next reader sees what was open and how it shut.
       · `INV-TOOLS-6` (`reference/atlas-tools.md#tools-6`) was AMENDED, owner-ratified 2026-08-04, to
         "a `≤ ~2K` **governing** pack of `tier≥T1` invariants, **beside a separately capped ADVISORY band
         of `T2` machine proposals no ratifier saw**". This clause's quote is re-lifted onto it. The
         amendment is clerical: ADR-0013 had already ratified the behaviour, only the text lagged. It ran
         through FOUR lines of that file (the invariant bullet, the `QueryOut` data-model line, the
         Surface/API line and acceptance item 5); all four were amended together.
       · The note previously also said the GUIDANCE STRING still read the single-band form. That sub-claim
         was ALREADY STALE when written and is corrected here: `packages/tools/src/handler.ts:77` reads
         "TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2),
         every row carrying its own freshness" — fixed by #107, verified on this branch.
       · The PRODUCT residues this note once listed are CLOSED too, by `ed22ae7` (PR #117, #193) — a
         sibling wave, not this WP. The MCP tool DESCRIPTION now reads "a covering pack in TWO bands:
         `invariants` is GOVERNING (tier>=T1, ratified) and `advisory` is ADVISORY (T2 machine proposals NO
         ratifier saw, separately capped …)", pinned off-the-wire by e2e-blackbox S26.4 asserting the WHOLE
         string; the retired sentence survives one line above it only as a quoted "it said" record. The
         `tools/src/types.ts` doc-comment is two-band as well. Nothing under `packages/**` is single-band
         and nothing here asks for a product change.
       · The link is now MECHANICAL: `harness/gates/req-clause-guard.mjs` (npm run req-clause-guard, named
         in ci.yml) resolves every REQ's `normative-clause` into the invariant it cites. This exact
         divergence is what proved its teeth — amending the invariant turned this clause RED before the
         quote was re-lifted. -->

### REQ-TOOLS-6c — stale pack must be re-grounded

source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6
If a returned pack carries `stale:true`, then `atlas-query` shall require re-grounding before the pack is trusted.
normative-clause: "`stale:true` MUST mean re-ground before trusting"

### REQ-TOOLS-6d — stale is an honest freshness watermark (N11)

source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6 (N11, ADR-0002; prohibition clause AMENDED by ADR-0013, owner-ratified 2026-08-03)
The `atlas-query` pack shall set `stale:true` when ANY under-scope fact's stored freshness is `DRIFTED` OR the projection's persist-time `builtAt` HEAD differs from live HEAD (the view is behind HEAD), computed via a cheap `git rev-parse HEAD` with no worktree; `atlas-query` shall NOT put GIT I/O — a worktree checkout or a per-fact `HEAD`-vs-`builtAt` tree diff — on the read path (the live git-rev oracle stays `atlas-reconcile`/`atlas-doctor`).
normative-clause: "query freshness is a read-model watermark — never a silent `fresh` when the view is provably behind HEAD; conservative on the unknown (no false alarm); NO git I/O per query"

<!-- AMENDMENT, owner-ratified 2026-08-03 (ADR-0002 amended, ADR-0013 unblocked). The struck clause read
     "`atlas-query` shall NOT re-derive per-fact drift on the read path". It was ratified against a COST:
     ADR-0002's rejected alternative is stated as "puts a git-worktree checkout — the exact #73 contention
     surface — on EVERY query", and its Consequences name the deferred scope-scoped answer as "a per-query
     HEAD-vs-`builtAt` TREE DIFF on the read path, against the point of the cheap watermark".
     Both descriptions are of a GIT mechanism. The mechanism now used is `driftDetect` (GROUND-1,
     packages/grounding/src/drift.ts) over the built-index `Axes` the composition root ALREADY builds once
     per process — the SAME oracle the write door's truth-gate runs (`compose.ts` `buildGate(axes)`). It
     makes NO git call, opens NO worktree and reads NO `builtAt`. MEASURED on the real 199-fact graph mined
     from Atlas at `8ada771b`, read at `origin/master` `44026ae`: 78-89 ms cold / ~11 ms warm-median for all
     199 facts, no git I/O, on axes the composition root already builds.
     The amendment therefore narrows the prohibition to what was actually priced (git I/O) and leaves every
     other clause — above all the `stale` watermark's own normative clause — intact and in force. -->

### REQ-TOOLS-6e — every pack row carries its own freshness verdict

source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6 (ADR-0013 clause 5, owner-ratified 2026-08-03)
Every `PackInvariant` the `atlas-query` pack serves, in either band, shall carry its OWN `freshness` verdict in the canonical `Freshness` vocabulary, re-derived per read through the GROUND-1 oracle over the built-index axes; where that oracle is unavailable or raises, the row shall read `DRIFTED` (fail-closed) and shall never fall back to the stored write-time `freshness`.
normative-clause: "a row served without its own freshness verdict is a defect, not a default; a verdict that cannot be derived is DRIFTED, never FRESH"

### REQ-TOOLS-6f — the pack is two separately bounded bands

source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6 (ADR-0013 clauses 1-4, owner-ratified 2026-08-03)
The `atlas-query` pack shall carry a GOVERNING band of `tier≥T1` invariants and a separate ADVISORY band of `T2` rows under its own `2000`-token cap; both bands shall be stated as tier MEMBERSHIP, so a row whose tier is off the lattice lands in NEITHER; the advisory band shall be rendered under its own line verb, never interleaved with the governing band; and where the advisory cap truncates, the pack shall report the dropped count.
normative-clause: "two separately bounded, separately rendered bands; an unrecognized tier is in neither; 0 silent drops — a truncated advisory band reports what it dropped"

<!-- THE SCOPE OF THIS CLAUSE, AMENDED 2026-08-03 (the amendment is `REQ-RETR-12m` in `req-ret.md`; this
     note is the fan-out of it into the door this clause names). The sentence above says "The `atlas-query`
     pack shall…" and it still does — this clause is about ONE read door and is unchanged. What was WRONG
     was reading that scoping as a decision that the OTHER read door keeps the single-band rule.
     `packages/adapter-io/src/own-source.ts` applied `atLeastT1` to both fact sections of `atlas own`, citing
     "a `T2` … that `atlas query` is correctly declining to show" — a justification this very requirement had
     just deleted. MEASURED on the real 199-fact mined store, where every fact is `T2`: `atlas own` served
     0/199 while `atlas query` served them, from the same store through the same binary.
     `REQ-RETR-12m` extends the two-band model to `atlas own`, with the SAME membership predicates (the one
     `@atlas/tools` src/bands.ts pair) and a SUB-cap inside `OWN_CAP` rather than a second `2000` — the own
     briefing's total budget does not grow. The `2000` above is the query pack's advisory cap and is
     unchanged. `wp-per-fact-freshness.md`'s exclusion "`atlas own` is NOT widened" is superseded there. -->

### REQ-TOOLS-7a — re-derive citation at source@sha

source: INV-TOOLS-7 @ reference/atlas-tools.md#tools-7
The `atlas-emit` tool shall re-derive the citation at `source@sha`.
normative-clause: "It MUST re-derive the citation at `source@sha`"

### REQ-TOOLS-7b — reject a node that does not re-derive

source: INV-TOOLS-7 @ reference/atlas-tools.md#tools-7
If a node's grounding does not re-derive, then `atlas-emit` shall reject it with `emitted:false` and persist nothing.
normative-clause: "a node whose grounding does not re-derive MUST be rejected (`emitted:false`, nothing persisted)"

### REQ-TOOLS-7c — writes are templated

source: INV-TOOLS-7 @ reference/atlas-tools.md#tools-7
The `atlas-emit` tool shall make every write templated.
normative-clause: "Writes MUST be templated"

### REQ-TOOLS-7d — writes are upserts, not blind inserts

source: INV-TOOLS-7 @ reference/atlas-tools.md#tools-7
The `atlas-emit` tool shall perform every write as an upsert rather than a blind insert.
normative-clause: "upserts, not blind inserts"

### REQ-TOOLS-8a — classify drift into reviewable set

source: INV-TOOLS-8 @ reference/atlas-tools.md#tools-8
When reconciling at merge-time, `atlas-reconcile` shall classify the `DRIFTED` subset by the KNOW-5 mechanical/semantic split into a reviewable `DriftItem[]` set rather than an all-or-nothing verdict.
normative-clause: "classify the `DRIFTED` subset by the `atlas-knowledge` KNOW-5 mechanical/semantic split (referenced, not redefined here) and present the result as a **reviewable `DriftItem[]` set**, never an all-or-nothing verdict"

### REQ-TOOLS-8b — exit 2 only on semantic drift

source: INV-TOOLS-8 @ reference/atlas-tools.md#tools-8
If a run's drift is `semantic`, then `atlas-reconcile` shall exit `2` and never report a silent green there.
normative-clause: "It MUST exit `2` **only** on `semantic` drift — never a silent green there"

### REQ-TOOLS-8c — mechanical-only drift exits 0

source: INV-TOOLS-8 @ reference/atlas-tools.md#tools-8
When a run's drift is entirely `mechanical`, `atlas-reconcile` shall exit `0`.
normative-clause: "a run whose drift is entirely `mechanical` MUST exit `0`"

### REQ-TOOLS-8d — re-author bounded to the semantic subset

source: INV-TOOLS-8 @ reference/atlas-tools.md#tools-8
The `atlas-reconcile` tool shall re-author exactly `== |semantic|` items and never the whole store.
normative-clause: "It MUST re-author `== |semantic|`, never the whole store"

### REQ-TOOLS-9a — wave-close write driven by absorb

source: INV-TOOLS-9 @ reference/atlas-tools.md#tools-9
The `atlas-emit` write path at wave-close shall be driven by `ResultCard.absorb` rather than a separate authoring ritual.
normative-clause: "The `atlas-emit` write path at wave-close MUST be driven by `ResultCard.absorb`, not a separate authoring ritual"

### REQ-TOOLS-9b — sealing wave must feed or emit why-not

source: INV-TOOLS-9 @ reference/atlas-tools.md#tools-9
If a sealing wave neither feeds the Atlas nor emits a grounded why-not, then the probe shall record a violation.
normative-clause: "A sealing wave with no `absorb` and no why-not ⇒ the probe records a violation"

### REQ-TOOLS-10a — node addressable over three transports

source: INV-TOOLS-10 @ reference/atlas-tools.md#tools-10
The node handler shall make every Atlas node addressable by its content address over the MCP tool, the poke injection, and the CLI against one handler.
normative-clause: "**every Atlas node** MUST be addressable by its **content address** over three transports against one handler"

### REQ-TOOLS-10b — transports must not diverge in contract

source: INV-TOOLS-10 @ reference/atlas-tools.md#tools-10
If the same node is resolved over the MCP tool, the poke, and the CLI, then the node handler shall not diverge in contract across the three.
normative-clause: "The three MUST NOT diverge in contract"

### REQ-TOOLS-10c — transports add no write path

source: INV-TOOLS-10 @ reference/atlas-tools.md#tools-10
If a node is reached over any of the three transports, then the node handler shall keep the transport read/subscribe only and add no write path.
normative-clause: "This adds **no** write path: all three transports are read/subscribe; writes still funnel through `atlas-emit`"

### REQ-TOOLS-10d — CLI is unscoped

source: INV-TOOLS-10 @ reference/atlas-tools.md#tools-10
The CLI shall keep any node addressable by its content address at any time.
normative-clause: "the **CLI is unscoped** — any node is addressable by address at any time"

### REQ-TOOLS-11-a — never force a seat to the CLI

source: INV-TOOLS-11 @ reference/atlas-tools.md#tools-11
If a seat needs to reach the Atlas, then the orchestrator shall not force it to the CLI.
normative-clause: "A seat MUST NOT be forced to the CLI to reach the Atlas"

### REQ-TOOLS-11-b — push reaches a seat with no grant

source: INV-TOOLS-11 @ reference/atlas-tools.md#tools-11
The orchestrator shall deliver push (the poke / pack / `RelationSet`) to a seat with no tool grant required.
normative-clause: "**push** (the poke / pack / `RelationSet`) is the **orchestrator's** job and MUST reach a seat with **no tool grant required**"

### REQ-TOOLS-11-c — pull resolves down the native-first ladder

source: INV-TOOLS-11 @ reference/atlas-tools.md#tools-11
When a seat issues an ad-hoc pull, the tools layer shall resolve it down the fixed native-first ladder in-process SDK MCP → registered MCP + grant → poke-as-file → orchestrator relay → CLI.
normative-clause: "it MUST resolve down a fixed **native-first** ladder (see _Subagent transport_): in-process SDK MCP → registered MCP + grant → poke-as-file → orchestrator relay → CLI"

### REQ-TOOLS-11-d — every tier is one handler, one contract

source: INV-TOOLS-11 @ reference/atlas-tools.md#tools-11
The tools layer shall back every ladder tier by the one handler so tiers differ only in transport, never in contract or result.
normative-clause: "Every tier is backed by the **one** handler (TOOLS-10) — tiers differ only in transport, never in contract or result"

### REQ-TOOLS-11a-a — spawn seats via the SDK in-process path

source: INV-TOOLS-11a @ reference/atlas-tools.md#tools-11a
Orchestra shall spawn its governed seats via the Agent SDK in-process path (`create_sdk_mcp_server` in-process plus a per-seat `allowed_tools` grant).
normative-clause: "Orchestra MUST spawn its governed seats via the **Agent SDK in-process path** (`create_sdk_mcp_server` in-process + a per-seat `allowed_tools` grant)"

### REQ-TOOLS-11a-b — down-rank pull 1 and 2 when MCP unavailable

source: INV-TOOLS-11a @ reference/atlas-tools.md#tools-11a
If the running harness cannot propagate MCP, then the ladder shall down-rank pull 1 and pull 2 to `unavailable` and resolve straight to push / pull 3–4.
normative-clause: "a harness that cannot propagate MCP MUST down-rank pull 1 **and** pull 2 to **`unavailable`** and resolve straight to push / pull 3–4"

### REQ-TOOLS-11a-c — never silently fall through a native tier

source: INV-TOOLS-11a @ reference/atlas-tools.md#tools-11a
If a tier is advertised as native, then the ladder shall not silently fall through it.
normative-clause: "it MUST NOT silently fall through a tier it advertises as native"

### REQ-TOOLS-11a-d — report the tier actually started on

source: INV-TOOLS-11a @ reference/atlas-tools.md#tools-11a
The ladder shall report the tier it actually started on for the running harness.
normative-clause: "The ladder MUST report the tier it actually started on for the running harness"

### REQ-TOOLS-12a — doctor is read/advisory only

source: INV-TOOLS-12 @ reference/atlas-tools.md#tools-12
The `atlas doctor` surface shall be read/advisory only.
normative-clause: "The diagnostic surface (`atlas doctor`) MUST be **read/advisory only**"

### REQ-TOOLS-12b — doctor never persists

source: INV-TOOLS-12 @ reference/atlas-tools.md#tools-12
If `atlas doctor` proposes a write, then it shall funnel that write through `atlas-emit` instead of persisting it.
normative-clause: "It MUST NOT persist: any write it proposes MUST funnel through `atlas-emit`"

### REQ-TOOLS-12c — doctor carries no write authority

source: INV-TOOLS-12 @ reference/atlas-tools.md#tools-12 (count superseded by ADR-0006 Decision 2)
The `atlas doctor` surface shall remain a no-write-authority diagnostic view rather than a governance tool; it is not one of the derived six `GOVERNANCE_SURFACE` members (ADR-0006 Decision 2).
normative-clause: "It is **not** a governance tool at all (the governance surface is the derived six —
`atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`, `atlas-memory-emit`; ADR-0006
Decision 2) — it is a diagnostic view of the same store, carrying no write authority"

### REQ-TOOLS-13a — auto-re-ground mechanical drift in one pass

source: INV-TOOLS-13 @ reference/atlas-tools.md#tools-13
When run with `--accept-reground`, `atlas-reconcile` shall auto-re-ground every `mechanical` `DriftItem` in one pass with no human and no merge block.
normative-clause: "`atlas-reconcile --accept-reground` MUST, in **one pass**, auto-re-ground every `mechanical` `DriftItem` (anchor moved but the claim still re-derives at the new `@sha`) — updating the anchor with no human and no merge block"

### REQ-TOOLS-13b — report regroundedCount

source: INV-TOOLS-13 @ reference/atlas-tools.md#tools-13
The `atlas-reconcile` tool shall report `regroundedCount`.
normative-clause: "report `regroundedCount`"

### REQ-TOOLS-13c — never auto-touch semantic drift

source: INV-TOOLS-13 @ reference/atlas-tools.md#tools-13
If drift is `semantic`, then `atlas-reconcile --accept-reground` shall not auto-touch it, leaving it to surface for review and exit `2`.
normative-clause: "It MUST NOT auto-touch `semantic` drift: those still surface for review and still exit `2`"

### REQ-TOOLS-13d — re-ground write passes the fail-closed check

source: INV-TOOLS-13 @ reference/atlas-tools.md#tools-13
The `atlas-reconcile` tool shall make each re-ground write pass the `atlas-emit` fail-closed check.
normative-clause: "Each re-ground write MUST still pass the `atlas-emit` fail-closed check (TOOLS-7)"

### REQ-TOOLS-14a — auto-inject a fresh pack at phase transition

source: INV-TOOLS-14 @ reference/atlas-tools.md#tools-14
When a phase transition occurs, the orchestrator shall auto-inject a fresh `atlas-query`/`own_<unit>` pack into the seat's context.
normative-clause: "At **every phase transition** the orchestrator MUST **auto-inject a fresh `atlas-query`/`own_<unit>` pack** into the seat's context"

### REQ-TOOLS-14b — phase-pack push needs no grant

source: INV-TOOLS-14 @ reference/atlas-tools.md#tools-14
The orchestrator shall deliver the phase-boundary pack push with no tool grant.
normative-clause: "it MUST hold with **no tool grant**"

### REQ-TOOLS-14c — mid-task pull is not load-bearing

source: INV-TOOLS-14 @ reference/atlas-tools.md#tools-14
The orchestrator shall keep mid-task PULL an optimization only, never load-bearing.
normative-clause: "Mid-task PULL MUST NOT be load-bearing"

### REQ-TOOLS-15a — store medium is append-only/permissioned

source: INV-TOOLS-15 @ reference/atlas-tools.md#tools-15
The store medium shall be append-only / permissioned.
normative-clause: "the store medium MUST be **append-only / permissioned**"

### REQ-TOOLS-15b — reads reject ungrounded rows

source: INV-TOOLS-15 @ reference/atlas-tools.md#tools-15
If a read encounters an un-emitted (ungrounded) row, then the store shall enforce a content-address integrity check that rejects it.
normative-clause: "**reads MUST enforce a content-address integrity check that rejects any un-emitted (ungrounded) row**"

### REQ-TOOLS-15c — direct write never surfaces as a served fact

source: INV-TOOLS-15 @ reference/atlas-tools.md#tools-15
If a direct write skips the emit path, then the store shall either refuse it at write or reject it at read so it never surfaces as a served fact.
normative-clause: "a direct write that skips the emit path either cannot land (append-only/permission) or is rejected at read (integrity check), never surfacing as a served fact"

### REQ-TOOLS-16a — atlas-diff surfaces the version delta read-only

source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
When `atlas-diff <shaA> <shaB>` is invoked, the tools layer shall surface the PERSIST-14 delta as a read-only projection.
normative-clause: "`atlas-diff <shaA> <shaB>` surfaces the PERSIST-14 delta as a read-only projection"

### REQ-TOOLS-16b — atlas-diff CLI and MCP parity

source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
The `atlas-diff` tool shall be callable identically over the CLI and over MCP against one published schema.
normative-clause: "CLI≡MCP … one published schema"

### REQ-TOOLS-16c — atlas-diff CLI and MCP must not diverge

source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
If `atlas-diff` is invoked over both the CLI and MCP, then the tools layer shall not diverge in behavior or contract between the two.
normative-clause: "CLI≡MCP (0 divergence)"

### REQ-TOOLS-16d — atlas-diff adds no write path

source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
If `atlas-diff` is reached over any transport, then the tools layer shall keep it read/subscribe only and add no write path.
normative-clause: "0 write path"

### REQ-TOOLS-16e — atlas-diff is not a write tool

source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16 (write surface amended WP-SAMEAS, ADR-0003; superseded by ADR-0006 Decision 2)
If `atlas-diff` would grow the write surface, then the tools layer shall not admit it as a write tool, keeping the governed write surface at exactly the three governed doors (`atlas-emit`, `atlas-link`, `atlas-memory-emit`).
normative-clause: "the governed **write** surface is the three governed doors `atlas-emit` + `atlas-link` + `atlas-memory-emit`"
