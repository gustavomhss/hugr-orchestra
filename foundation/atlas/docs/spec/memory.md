<!-- ⚠ TRANSITIONAL NORMATIVE SOURCE — do NOT delete yet.
Completeness VERIFIED (2026-07-16): docs/reference/atlas-memory.md carries all of M-1..M-10 + Orientation
+ the four types. BUT reference/atlas-memory.md currently GROUNDS to this file as its source (no atlas
code yet). RETAINED as the source until the atlas code lands and reference re-grounds to source@sha —
then it retires. Add new content to reference/atlas-memory.md, not here. -->

# Memory — Specification

> **Phase:** DEFINE (normative spec). **Status:** draft v0 for ratification.
> **Part of:** the [Atlas](./atlas.md). This spec details the Atlas's **Memory** kind; the **Knowledge**
> kind is in [atlas.md](./atlas.md). Both are parts of one Atlas — see [atlas §1](./atlas.md#1-scope) and
> [product design §2](../design/atlas.md). Keywords **MUST / MUST NOT / SHOULD / MAY** are normative.

---

## 1. Scope & the boundary

**Memory is the Atlas's per-member kind.** It lives in the _same_ Atlas as Knowledge — same
content-addressed hashed index, same grounding primitive, same templated-write rule, same portable
export — it is **not** a separate system. What makes it Memory rather than Knowledge is its **scope**:
every seat — `charlie`, `lucy`, `jimmy`, … — **and the orchestrator itself** owns its own Memory, private
to that member, granular, and decaying. Knowledge is shared and grounded to the _codebase_; Memory is a
member's own craft/experience of _doing the work_.

**Distinct, never conflated (but not separate systems):** a Memory entry MUST NOT be stored as shared
Knowledge, and a Knowledge fact MUST NOT be stored as Memory — yet both are parts of the one Atlas.

_(CoALA mapping: Memory is a member's **episodic** and **procedural** memory; Knowledge is the Atlas's
**shared semantic** kind. Retrieval for both is the Atlas's hashed structural index — no embeddings, no
RAG; see [atlas §3.6](./atlas.md).)_

## 2. The three types (per member, including the orchestrator)

Each member holds **three** durable Memory types, split by **how they are accessed** — the load-bearing
axis. The **orchestrator** holds a **fourth**: the **logbook** (§4.3).

| Type                              | Scope                                 | Access                               | Lifetime                                                                      | Holds                                                                                                               |
| --------------------------------- | ------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **task**                          | one task/WP                           | **consultable** (paged in on demand) | active until the task closes; then **archived** (never deleted, re-spawnable) | what was tried, what failed, where I stopped (the fold), the retry-relevant lesson                                  |
| **pr**                            | one PR                                | **consultable** (paged in on demand) | active until the PR merges/closes; then **archived**                          | the PR's decisions, review outcomes, the knowledge-delta it produced                                                |
| **project**                       | the whole project, this member's role | **always INJECTED** (never queried)  | durable; travels with the repo; decays by non-use                             | the member's standing, objective rules for working here — "always/never"                                            |
| **logbook** _(orchestrator only)_ | the whole project, over time          | **consultable** (never injected)     | permanent, append-only chronological ledger                                   | the orchestrator's **prose decision journal** — one entry per PR: decisions & _why_, tradeoffs, risks, open threads |

## 3. The load-bearing law — injected vs. consultable

> **Injected Memory has a sacred token budget; consultable Memory may be rich.**

- **project** memory rides in **every** context this member runs. Overhead here is fatal — it is paid on
  every dispatch, forever. It MUST therefore be **objective, hard-capped, templated, and SOTA-written**
  (§5). It is _never_ queried; it is _always_ present.
- **task**, **pr**, and the **logbook** are **consultable** — paged in only when asked (`memory-recall`).
  They MAY be richer because their cost is paid only on access, not on every turn. The **logbook** is the
  richest of all (long prose) — which is _exactly_ why it is consultable-only and never injected.

Getting this backwards — a fat injected project memory, or a task memory (or the logbook!) that
auto-injects — is the single way this layer becomes overhead. The split above is the whole defense.

### 3.1 The injected header — three slabs (Awareness · Orientation · Rules)

What is injected into a member at turn start has **three parts** — the trio **Awareness** (who the project
is) · **Orientation** (where it is now) · **Rules** (how this member acts). The first two are **shared +
derived** (assembled each turn, never a written memory, so they can never rot); only the third is a written
per-member memory.

- **Awareness (shared, derived) — the project's standing self-model.** `mission` (the enduring thesis) +
  `constitution` (the non-negotiable laws) + `terrain` (the territory map + owners + which are `T0`) +
  `ontology` (the core vocabulary) + `taste` (what "good"/"rejected" looks like here). It is **not** a
  hand-written memory: every facet is a **rollup of the Atlas root** — grounded (`node@sha`) and
  drift-checked — so it is zero-maintenance and never stale. **Byte-identical for every member.** Carries
  only the **top tier** of each facet; the tail stays pull-reachable, not injected.
  - Cap: `≤ ~400 tokens`. A generic language/stack card MUST NOT stand in for it (see [MEM-11 / reference
    atlas-memory.md](../reference/atlas-memory.md)).
- **Orientation (shared, derived) — where the project is NOW.** `goal` + `last` milestone + `current`
  milestone + `state`. **Identical for every member.** It is **not** a per-member memory: `goal` is
  the ratified DEFINE artifact (walt); `last/current/state` are a **fold over the event log**
  (orchestrator), so they are always current and can never go stale. It is **assembled/derived** each
  turn, never written as a memory entry.
  - Shape: `{ goal, last, current, state }`, each `≤ 1 line`. Cap: `≤ ~250 tokens`.
- **Rules (per-member, written) — how THIS member acts here.** The member's own `ProjectMemoryEntry[]`
  (§4.1) — the always/never it learned, private to it. The **only** written project memory.

All three are injected together, under the injection ceiling; a rule is surfaced only when its `scope`
matches the current work. Awareness distinguishes from Orientation by **time-constant** — Awareness is the
enduring self-model (byte-stable ⇒ prompt-cache ≈ free), Orientation is the moving state.
_(Worked example: [`project-memory-example.html`](../project-memory-example.html) — approved 2026-07-16.)_

## 4. Every entry is templated (no free prose)

**Every Memory write MUST be against a fixed, per-type template** — declared fields + a hard cap + rules —
never free text (the "structured ABSORB against a fixed schema" rule, made universal). A write that omits a
required field or exceeds its cap is rejected fail-closed. Templates are versioned; a template change is a
spec revision.

The **logbook** (§4.3) is the one _narrative_ form — and even it is templated: a fixed section skeleton +
per-section caps + structured index fields + append-only. **Structured prose, never free-form.** The rest
(task/pr/project) are terse structured fields.

### 4.1 `project` memory template — the strictest (it is injected)

```
ProjectMemoryEntry = {
  rule:      string,   // ONE imperative line — "always X" / "never Y". No narrative.
  scope:     string,   // when it applies (a path glob / tool / phase) — so it can be role-relevant
  grounding?: Ref,     // OPTIONAL pointer (path@subtreeHash / PR / commit) — earns the rule its place
  hits:      number,   // times it prevented a mistake — drives decay + ordering
}
```

- **Cap: MUST be `≤ ~500 tokens` total** for a member's whole injected project memory (a small, ranked
  set — not a list that grows unbounded). SHOULD be `1–2 lines` per entry.
- **Writing bar (SOTA):** imperative, specific, deduped, testable-in-spirit. A vague "be careful with auth"
  is rejected; "never log the `Authorization` header (see `src/http/log.ts`)" is accepted.
- **Decay:** an entry whose `hits` don't grow ages out of the _injected_ set — **archived, not deleted**
  (M-6). An injected memory that doesn't earn its tokens is dropped from the hot set, measured by the
  ledger, not kept out of politeness — but stays in the versioned archive, re-spawnable.

### 4.2 `task` / `pr` memory templates — richer, consultable

```
TaskMemoryEntry = { taskId, attempted[], failedWith[], stoppedAt, lesson, ref? }
PrMemoryEntry   = { prId, decisions[], reviewOutcomes[], knowledgeDelta[], ref? }
```

- Cap: generous but bounded (per-entry char cap); MAY carry more context since they are paged on demand.
- `lesson` / `knowledgeDelta` that generalize to a standing rule are candidates for **promotion** into
  this member's `project` memory (§4.1) — promotion is a deliberate, capped act, not automatic.

### 4.3 `logbook` — the orchestrator's decision journal (structured prose)

The orchestrator's diary: longer prose for the _why_ that terse fields can't hold, written as a **ritual,
one entry per PR**. Consultable (never injected), append-only, chronological. Its discipline is what keeps
it a ledger and not a mess:

```
LogbookEntry = {
  // ── index fields (structured — this is what keeps it navigable) ──
  prId, at, territories[],
  // ── the narrative, one prose block per FIXED section ──
  shipped:     prose,   // what this PR did
  decisions:   prose,   // the key decisions AND WHY  ← the core
  tradeoffs:   prose,   // roads not taken, what was given up
  risks:       prose,   // what to watch, known debt
  openThreads: prose,   // follow-ups left behind
  links:       Ref[],   // the PR, ratified facts, ADRs, superseded prior entries
}
```

Rules (so it doesn't become a mess):

- **One entry per PR**, dated and PR-linked — a chronological ledger.
- **Fixed sections only** (above); prose _within_ a section, never a free-form dump. **Per-section soft cap
  `~150` tok + a hard per-entry cap `~1K` tok.**
- **Append-only.** History is not rewritten: a later entry may **supersede** a past decision _by link_, not
  by erasing it. _(Contrast: Knowledge is current-truth, edited; the logbook is history-of-reasoning,
  append-only — complementary.)_
- **Consultable** by `prId` / date range / territory / topic — never injected (it is long by design).
- **Orchestrator-only** in v0 (a seat MAY gain a lighter logbook later if it earns its cost).

## 5. Invariants (falsifiable)

> **Cross-ref (renumbering).** These spec `M-*` numbers map to the reference's clean `MEM-*`
> ([atlas-memory.md](../reference/atlas-memory.md), whose ascending numbering fixed this file's scrambled
> `M-8/M-9/M-10` tail): `M-1..M-5 → MEM-1..MEM-5`, `M-6 → MEM-7`, `M-7 → MEM-9`, `M-8 → MEM-8`,
> `M-9 → MEM-10`, `M-10 → MEM-6`, `M-11 → MEM-11`. Cite either; they are the same invariant.

| #                                                  | Invariant                                  | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M-1 Member-scoped**                              | Memory is private to its member.           | A member MUST NOT read another member's Memory; the orchestrator has its own, like any seat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **M-2 Distinct kinds**                             | Memory ≠ Knowledge (but same Atlas).       | A Memory entry MUST NOT be stored as shared Knowledge, and a Knowledge fact MUST NOT be stored as Memory — though both live in the one Atlas, on the same index/format.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **M-3 Injected-is-capped**                         | Project memory can't bloat.                | The injected `project` memory MUST be `≤` its token cap; exceeding it is a rejected write, never a silent overflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **M-4 Consultable-not-injected**                   | Task/PR memory never rides free.           | `task`/`pr` memory MUST NOT auto-inject; it is returned only by an explicit `memory-recall`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **M-5 Templated**                                  | No free prose.                             | Every write fills its per-type template or is rejected fail-closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **M-6 Decay = de-activation, NOT deletion**        | Lean hot set, nothing lost.                | The injected `project` set is the **top-12 ranked by `frecency`** — a single time-decayed score of **cited hits** (a `hit` = a logged event where a seat / cold-reviewer cited the rule-id as governing a decision), decayed on read/write, replacing raw `hits` + any separate window. A `project` entry whose `frecency` decays to ~zero **leaves the injected set and is archived** — retained, versioned, re-spawnable; an old-popular rule cannot pin a slot. An ever-growing _injected_ set is a failing set; the _archive_ grows freely. No memory is ever deleted. _(canonical: [MEM-7](../reference/atlas-memory.md))_ |
| **M-7 Portable**                                   | It's the member's, and the repo's.         | Memory travels with the repo, is inherited by a fork, exports to open JSON — no lock-in. Secrets/PII MUST be scrubbed before write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **M-10 Orientation is derived & shared**           | Never a stale hand-written status.         | The Orientation (`goal/last/current/state`, §3.1) MUST be assembled — `goal` from the ratified DEFINE artifact, `last/current/state` as a fold over the event log — injected identically across all members, `≤ ~250 tok`. It MUST NOT be a per-member _written_ memory entry, so it can never go stale.                                                                                                                                                                                                                                                                                                                        |
| **M-9 Versioned & nothing dies**                   | All members' memory is git-native.         | Every memory type of every member (incl. the orchestrator) is versioned with the repo and travels at each commit/PR/branch/fork; each ephemeral agent's run is re-spawnable from the versioned record. Governed by the Atlas [A-16/A-17/A-18](./atlas.md).                                                                                                                                                                                                                                                                                                                                                                      |
| **M-8 Logbook discipline**                         | The diary stays a ledger, not a mess.      | The logbook is orchestrator-only, **one append-only entry per PR**, filling the fixed sections (§4.3) within per-section caps; it is **consultable, never injected**; a later entry supersedes a past decision by link, never by rewriting history.                                                                                                                                                                                                                                                                                                                                                                             |
| **M-11 Awareness is a derived rollup, not a blob** | Real project self-model, zero maintenance. | The injected **Awareness** (mission / constitution / terrain / ontology / taste, §3.1) MUST be **assembled from the Atlas root** — each facet **grounded (`node@sha`) + drift-checked**, carrying only the **top tier** under its `≤ ~400 tok` cap. It MUST NOT be a hand-written memory entry (so it cannot rot), MUST be byte-identical across members, and its tail MUST stay **pull-reachable**, not injected. A generic language/stack card MUST NOT stand in for it.                                                                                                                                                      |

## 6. Acceptance criteria

1. **Injection budget.** A member's injected `project` memory is always `≤` cap; a write that would exceed
   it is rejected. _(M-3)_
2. **No auto-inject of consultable.** `task`/`pr` memory never appears in a member's context without an
   explicit recall. _(M-4)_
3. **Template enforcement.** A write missing a required field or over cap is rejected; no free-prose entry
   persists. _(M-5)_
4. **Scope isolation.** Member A cannot read member B's Memory; the orchestrator has its own. _(M-1)_
5. **No conflation.** A seat-craft lesson never lands as a shared Knowledge fact; a Knowledge fact never
   lands as Memory — though both live in the one Atlas. _(M-2)_
6. **Decay.** A never-hit `project` entry ages out over its window. _(M-6)_
7. **Round-trip.** Export → import yields identical Memory; no secret survives the scrub. _(M-7)_
8. **Logbook is a ledger.** The orchestrator writes exactly one logbook entry per PR, in the fixed
   sections, within caps; it is consultable (by PR/date/territory) and never injected; a past entry is
   never rewritten. _(M-8)_
9. **Orientation is live & shared.** After a milestone event, every member's injected Orientation reflects
   the new `last/current` with no manual write, and two members' Orientation is byte-identical. _(M-10)_
10. **Awareness is derived & grounded.** Every Awareness facet traces to an Atlas `node@sha` (no
    hand-written line); editing a source node changes the assembled Awareness with no manual write; it is
    byte-identical across two members and stays `≤ ~400 tok`; a drifted source flags the facet rather than
    serving stale. _(M-11)_

## 7. Open questions (to ratify)

- **Project-memory cap** — `~500 tokens` is a starting number; calibrate per role (the orchestrator's may
  differ from a generator's).
- **Promotion rule** — the exact bar for a `task`/`pr` lesson to earn a slot in injected `project` memory.
- **Decay window** — hits-based, time-based, or both; measured by the ledger.
- **Task/PR retention** _(decided)_ — consultable for **`90 days` or `50 PRs`** after close (whichever comes
  first), then **archive-only** (archived, never deleted — re-spawnable).
