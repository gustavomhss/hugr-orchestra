# The Atlas — Product Design

> **Phase:** DEFINE (product design + working-backwards). **Status:** draft v0 for ratification.
> **Companion docs:** the normative [spec](../spec/atlas.md) · the chewed one-pager [`docs/atlas-concept.html`](../atlas-concept.html).
> This document is prose: the _what and the why_. The spec is the _precise contract_. The atlas is
> Orchestra's **layer 0** — the ground-truth substrate every other phase reads before it acts.

---

## 1. The one-liner

> The Atlas is a **grounded knowledge layer for a codebase**: a living graph of what is true about the
> system, where **every fact is pinned to `source@sha` and re-checks itself against the code**. Its
> defining property is that **it cannot lie**: a fact whose code moved out from under it stops being
> true, automatically. It is knowledge — _not_ memory (§2).

## 2. Knowledge and Memory — two parts of one Atlas

The Atlas is the **umbrella system**. Inside it live **two content kinds**: **Knowledge** and **Memory**.
They share one substrate — the same content-addressed hashed index, the same grounding, the same format,
the same export — but they are **distinct and must never be conflated**. The load-bearing rule is not
"separate systems"; it is "**one Atlas, two kinds, never mixed**."

|                  | **Knowledge (shared)**                                                               | **Memory (per member)**                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Scope            | **shared**, one substrate, project-level                                             | **scoped to each member** (charlie's, lucy's, jimmy's own)                                                                 |
| What it holds    | what is **true about the codebase** — grounded facts, invariants, the structural map | a member's **craft & experience on this repo** — "where the docs lie", "this territory generalizes badly from one example" |
| Grounding        | every entry pinned to `source@sha`, re-checks                                        | a lesson, not a citation; scoped to the seat, decays by non-use                                                            |
| Evolution        | **edit / supersede** existing facts as the world changes (§7)                        | accretes and decays privately, per seat                                                                                    |
| Who reads it     | everyone — DEFINE, DESIGN, the Conductor, every seat                                 | only its own seat (sharpens `jimmy-7` over `jimmy-1`)                                                                      |
| Failure if mixed | a shared graph clogged with one agent's private hunches → **inoperable garbage**     | a private lesson mistaken for project truth → **false shared belief**                                                      |

**Why the granularity of Memory matters.** Memory _belongs to_ a member. `jimmy`'s lesson that a library's
README lies is `jimmy`'s — it makes tomorrow's `jimmy` sharper without polluting the shared truth or
binding `charlie`. Collapse Memory into Knowledge and you get both failure modes at once: the shared graph
fills with un-grounded per-agent hunches, and private craft gets mistaken for ratified fact.

**Both are parts of the Atlas.** They share its substrate, index, grounding, format, and export — Memory is
not a separate system, it is the Atlas's per-member kind. This doc details the **Knowledge** kind; the
**Memory** kind (the three per-member types) has its own spec, [memory.md](../spec/memory.md). What must
never happen is _conflation_: a private hunch stored as shared truth, or shared truth demoted to one
member's private note.

## 3. The problem it exists to solve

Maestro v1 hallucinated for one structural reason: **there was no ground truth.** Every phase — define,
design, decompose, execute, verify — re-derived what the system _was_ from scratch, on the fly, and
invented the gaps. Product and architecture were implicit; nobody owned the truth; and so "99% of the
dream product was missing or sloppy."

A multi-agent engineering system pays for this twice:

- **In correctness** — an agent that guesses the shape of the codebase produces work that looks done but
  doesn't integrate. Ungrounded belief is the hallucination door.
- **In cost** — the state of the art is blunt about it: multi-agent systems burn ~15× the tokens of a
  chat, and _token usage alone explains ~80% of the performance variance_. A huge share of those tokens
  is agents **re-deriving context** that should have been read from a shared, durable substrate.

The Atlas closes both. It is the place a phase **reads instead of guessing** — and because reading is
cheaper and truer than re-deriving, it is simultaneously the anti-hallucination move and the cost move.

## 4. Working backwards — the experience we want

Imagine the lead opening a fresh session on a real, messy, brownfield repo.

- **Day one, zero cost.** `orchestra init` walks the real file tree and seeds a **structural skeleton** —
  territories (regions of the repo), each with its day-one blast radius (who depends on whom). No LLM is
  spent. The knowledge starts **empty and honest**: every territory ships the un-authored default. The
  system flags territories that _smell_ critical — `auth`, `crypto`, `money`, `token` — as **T0
  candidates**, but never promotes them; a human ratifies criticality, always.

- **Knowledge is born from the work, not from a cataloging ritual.** Nobody sits down to "document the
  repo." When a wave actually touches a territory, an explorer (jimmy) mines that territory — and _only_
  that territory's blast radius — and **proposes** grounded facts about it. At wave-close, the system
  **ratifies** the survivors. The map fills in exactly where the work went, and nowhere else.

- **Every fact carries its receipt.** No fact is ever "the system says so." A fact is
  `"billing endpoints validate Idempotency-Key" @ src/billing/*.ts:42-50 @ <sha>` — a claim welded to
  the exact bytes it came from. Ask the Atlas anything and it answers with the citation, or it says
  _"I don't know"_ honestly (advisory), never a confident guess.

- **The map updates itself as reality changes.** When the world moves, the Atlas mostly **edits or
  supersedes** an existing fact — it does _not_ pile a new one on top (§7). Someone changes how billing
  validates: the old fact **drifts**, flips **BROKEN**, _blocks the merge_, and is re-authored or retired
  in place. A wiki that only ever appends becomes a landfill; the Atlas evolves the fact it already has.

- **The right knowledge shows up on its own.** The moment anyone — agent, LLM, or human — touches a file,
  folder, module, or crate, the covering territory's knowledge **appears as available**, without being
  asked. It reaches them two ways: as a **tool** (`atlas-query <path>`, any scope) and as **proactive
  injection** (a hook resolves `path → territory → pack` and drops a ≤2K pack of that territory's
  load-bearing invariants into the brief). The worker doesn't re-learn the territory; it reads the pack.

- **It's yours, forever — and it's git.** The whole Atlas is a **living part of the repo's version
  control**: every fact, every member's memory, every ephemeral agent's provenance (model, tokens, tools,
  time, retries) travels with the repo at each commit/PR/branch/fork. Nothing dies — the hot set stays
  lean, the rest is archived. Any agent that ever worked is **re-spawnable** from the versioned record, on
  another machine or a fork. 100% exportable, no proprietary format, nothing trapped in a vendor's cloud.

That is the product: **a codebase that keeps a true, current account of itself, and hands it to whoever is
about to touch it.**

## 5. What the Atlas is — three framings, one artifact

The Atlas is the fusion of three ideas usually built separately — plus per-member **Memory** as its other
kind. Both **Knowledge and Memory are parts of the _one_ Atlas** (§2) — never a separate layer bolted on
the side. The three framings below are the _Knowledge_ kind; Memory is [spec'd separately](../spec/memory.md).

**As a knowledge base.** A **graph of nodes** tiered by criticality (T0/T1/T2), queryable by territory and
axis. Two node families, **both shipping day-one**: _advisory_ claims (the honest default) and _predicate_
facts (checkable statements carrying a mechanical `HOLDS / BROKEN / NA` verdict) — the store still operates
on advisory alone when no evaluator is wired. Everything is content-addressed — a
node's identity is a hash of its canonical form, so two independent implementations agree byte-for-byte,
and re-stating a known fact is idempotent rather than duplicative.

**As a self-maintained wiki (the Karpathy-wiki idea).** A **living wiki the agents grow from their own
work.** The explorer proposes; the wave-close ratifies; reviewers can reject. It gets sharper with use,
and — crucially — it is _edited_, not just appended: a page is corrected when the code it describes
changes, so the wiki tracks the system instead of fossilizing.

**As open knowledge (the OKF idea).** **Open, portable, and provenance-tracked by construction.** No
proprietary encoding, no external reference, no lock-in: everything needed to rebuild an identical store
lives in an exportable JSON dump. Every claim carries provenance (which WP, which commit, trusted or not).
Knowledge is a public good of the repo, not an asset of a tool.

_(In CoALA terms: the Atlas is **shared semantic** knowledge. The **episodic** and **procedural** memory
of an individual agent live in that agent's per-seat Memory — §2 — not here.)_

## 6. The idea that makes it trustworthy — grounding

Every knowledge system in history has the same failure mode: it **rots**. The docs drift from the code;
the wiki says one thing and the source says another; nobody trusts it, so nobody reads it, so it dies.

The Atlas defeats rot with one non-negotiable rule, transcribed verbatim from the Maestro design:

> **A fact never self-declares true.** Its only claim to truth is a citation that **still re-checks**
> against the code.

**What the citation anchors to matters — and it is _not_ line numbers.** Line-ranges are fragile: an
import added above, or an unrelated rename elsewhere, shifts them and would drift a fact whose code never
changed (a false `BROKEN` that destroys trust). So the anchor is a **structural unit** — a symbol, block,
or file — identified by the hash of its subtree; line numbers are kept only as a navigation hint. An edit
that doesn't TOUCH the cited unit doesn't drift the fact; a real change to it does. A reformat OF the cited
unit _does_ drift it — the hash is over raw bytes, with no normalization step, and that false alarm is an
accepted trade rather than a gap (see [spec §3.1](../spec/atlas.md)). _(This
uses BLAKE3, whose native Merkle-tree structure also gives the hierarchical index that powers discovery —
one tree, drift and lookup both. See [spec §3.1 / §3.5](../spec/atlas.md).)_

Three consequences fall out, and they are the product moat:

1. **Forgetting is grounded, not heuristic.** Generic memory systems decay by a guessed time-constant.
   The Atlas decays by _the code changing under the fact_ — a precise, earned signal. It even knows the
   exact commit that broke a given fact.
2. **The gate is fail-closed.** A candidate with no grounding, or with grounding that has drifted, is
   downgraded to an honest _unknown_ (`NA` / advisory) — **never** a false "true." Rumor doesn't enter.
3. **Trust is auditable.** The receipt travels with the fact, so a human, a reviewer agent, or a future
   session can re-run the check. Belief is never taken on faith.

This is why the Atlas can be a **foundation** — it is the one layer structurally incapable of confidently
lying.

## 7. Knowledge evolves by edit, not by append (the anti-garbage law)

This is as important as grounding, and it is where naïve "memory" systems die. **New information about the
system is usually not a new fact — it is a change to a fact that already exists.** If the Atlas only ever
_appends_, it becomes, in the owner's words, _a mountain of inoperable garbage_: ten stale claims about
the same function, no way to know which is current.

So a write is an **upsert with merge/supersede semantics**, never a blind insert:

- **Same fact, re-observed → idempotent.** Because identity is content-addressed, re-emitting an
  unchanged fact resolves to the same node. No duplicate is created.
- **Refined/changed fact → edit or supersede, by family (ratified).** A _changed_ **advisory** fact is
  **edited in place** — the Atlas is git-native, so the prior version is preserved by the repo's own history
  (rewind a PR ⇒ the Atlas rewinds); no in-store lineage pile. A _changed_ **predicate** fact (identity =
  its `check`) **mints a new node and supersedes** the old: the head advances, the old is retained as
  addressable lineage (old→new), and the pack surfaces only the head.
- **A subject's claims → set-union, not a pile.** Multiple grounded statements about the same subject
  merge by claim, they do not accumulate as rival nodes.
- **Contradiction → the grounded one wins.** When reality contradicts a stored fact, the fact drifts to
  `BROKEN` and is re-authored or retired; the stale belief does not linger beside the true one.
- **Decay = de-activation, not deletion.** A fact no one re-grounds and nothing consumes ages out **of the
  active/injected set** — it is _archived_, never erased ([spec §7 / A-16](../spec/atlas.md)). Like git: the
  HEAD is the current curated truth; nothing is lost. An ever-growing _hot_ set is a failing set; the
  archive grows freely and stays re-spawnable.

The test of this law is simple and brutal: **after a year of work, is the Atlas smaller-than-linear in
edits and still all-true?** If querying a territory returns one current fact per subject rather than a
history dump, the law holds. If it returns landfill, it doesn't.

## 8. Born from work — the three moments

The design principle, verbatim: _"The Atlas is born from work, not a cataloging ritual."_ It fills in at
three just-in-time moments, never by a repo-wide sweep:

- **Move-in (`init`).** A `$0`-LLM structural skeleton off the real paths: territories, day-one blast
  radius, honest `T2 / advisory` defaults, and `T0`-candidate _flags_ for a human to ratify.
- **Enrich-from-demand (feature-ship).** When work ships, only the territories the work actually
  touched — entry points ∪ blast-radius closure — are mined. Cold territories stay a skeleton.
- **Wave-close write.** The factory writes **grounded facts** derived from the _real source_ (mechanically,
  never asserted), each with provenance — and, per §7, **updates/supersedes** the facts already there for
  the territories that were worked, rather than appending duplicates.

Every fact is traceable to the WP that caused it. Coverage tracks the work.

## 9. Propose → ratify — the governance of a truthful wiki

A wiki anyone can write becomes noise; a wiki nobody can write becomes stale. The Atlas splits the two
acts, exactly as the Maestro design does:

- **The explorer PROPOSES.** jimmy (read-only, kit COMPASS) mines a territory and emits **candidates**
  into staging — never a commit — each born labeled `GROUNDED` (survived contest vs 2+ independent
  sources, carries `source@sha`), `ADVISORY` (one source / not yet contested), or `BROKEN` (refuted).
- **The wave-close RATIFIES.** The lead's reconcile re-checks each candidate at its `sha`; cold reviewers
  (lucy, bobby) can reject; a **T0** territory additionally requires the security seat (billy).

**Evidence is fractal (mined by many); judgment is singular (ratified by the lead).** Whoever mined a fact
has no authority to accept it. _(Note: what an explorer keeps for itself — "this repo's docs lie" — is its
own per-seat Memory, §2; what it proposes for the shared graph is a Knowledge candidate. Same act, two
destinations, never confused.)_

## 10. Tiers and honesty

Criticality is a first-class axis: `T0` (must-be-right: auth, crypto, money, secrets, data), `T1`
(load-bearing), `T2` (default). Two honesty rules bind it:

- **Knowledge starts empty and honest.** The skeleton carries zero invariants — every territory ships the
  un-authored `T2 / advisory` default, by construction.
- **T0 is only ever human-ratified.** Keyword heuristics may _flag_ a T0 candidate; nothing auto-promotes
  it. The most critical knowledge in the system always passes a human.

## 11. Why it's layer 0 — everything builds on it

The Atlas is the substrate, not a feature bolted onto orchestration:

- **DEFINE** grounds the spec in what already exists instead of imagining the system.
- **DESIGN** designs over the real dependency graph, not a mental model of it.
- **The Conductor** _cannot_ slice a wave into disjoint write-scopes without the real `depends-on` graph
  and blast radius — that structural map **is** the Atlas. This is the hard dependency that makes the
  atlas come first.
- **Seats** transcribe against real anchors and receive the territory's pack; **evaluators** check against
  real invariants.
- **Knowledge and Memory stay distinct here too:** the Conductor and seats read shared **Knowledge** from
  the Atlas; each seat also carries its own scoped **Memory** (§2) — the two are never merged.

## 12. What it is NOT (non-goals)

- **Not per-seat Memory.** It is shared Knowledge; a member's private craft/experience is a separate,
  scoped layer (§2).
- **Not conversational memory.** It does not remember user preferences or chat history.
- **Not an upfront catalog.** It never sweeps the whole repo "to be safe." Coverage is demand-driven.
- **Not append-only.** It edits/supersedes existing facts; it is not a log of every claim ever made (§7).
- **No embeddings, no RAG — ever.** Retrieval is a deterministic hashed structural index (by scope /
  dependency / trigger), not embedding similarity. For code, the dependency graph beats semantic search,
  costs nothing, never drifts, and is auditable. _(spec §3.6.)_
- **Not free prose, not self-ratifying.** A fact is a grounded, structured claim; the lead/reconcile
  decides; T0 needs a human.

## 13. The Orchestra deltas (what we improve vs the Maestro design)

The Maestro concept is right; three things get better in Orchestra (details in the [spec](../spec/atlas.md)):

1. **Event-sourced fold, not a rewritten blob.** The Atlas becomes a fold over the append-only event log —
   reconstructable and versioned — rather than a whole-file JSON snapshot rewritten on every persist.
   _(The log is append-only; the **knowledge** it folds to is edited/superseded, §7 — the two are not in
   tension: events accrete, facts evolve.)_
2. **The feed is closed by construction.** In v1 the producer loop was wired but never fed (0 facts ever).
   In Orchestra the feed is the keystone contract: a seat's `ResultCard.absorb` carries the candidate
   facts, and a sealing wave must have fed the Atlas or emitted a grounded why-not (probed).
3. **Edit-over-append made first-class (§7).** _(This replaces an earlier, wrong idea of "unifying the two
   memory models": Knowledge and Memory must **not** be unified — §2. The real improvement is that
   Knowledge writes are upserts, so the shared graph stays current instead of accreting into garbage.)_

## 14. Open product questions (to ratify)

_(Ratified & closed: **Formal depth** — both the advisory and predicate families ship day-one, the store
still operating on advisory alone when no evaluator is wired ([KNOW-9](../reference/atlas-knowledge.md), §5).
**Supersede vs edit-in-place** — a changed **advisory** fact is edited in place (git is the archive) and a
changed **predicate** mints-new-and-supersedes ([KNOW-4](../reference/atlas-knowledge.md), §7).)_

- **`GROUNDED` threshold by claim class** — how many corroborations, code vs web.
- **Skeleton → deep-mine trigger** — the exact signal that dispatches an explorer for a cold territory.
- **Memory caps** — the injected `project` cap (~500 tok, orchestrator ~800), Awareness (~400), and
  Orientation (~250) are draft, ledger-calibrated. _(Memory is the Atlas's per-member kind — a part of the one Atlas — fully
  specified in [spec/memory.md](../spec/memory.md) + [reference/atlas-memory.md](../reference/atlas-memory.md);
  not a separate layer, not open.)_
