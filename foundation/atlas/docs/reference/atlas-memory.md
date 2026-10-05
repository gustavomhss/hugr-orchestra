# atlas-memory — Reference

> owner: orchestrator · grounding: mirrors [spec/memory.md](../spec/memory.md); claims drift-checked against the Atlas store · status: draft

## Purpose

Memory is the Atlas's **per-member kind**: every seat (`charlie`, `lucy`, `jimmy`, …) **and the
orchestrator** owns its own, private, decaying Memory. It shares the _one_ Atlas with Knowledge — same
hashed structural index, same grounding primitive, same templated-write rule, same portable JSON export —
but is a **distinct kind**, never conflated with Knowledge and never a separate system. Knowledge is shared
and grounded to the _codebase_; Memory is a member's own craft of _doing the work_.

## Data model

### The four types

| Type                              | Scope                             | Access                                                                                              | Lifetime                                              | Holds                                                                                                      |
| --------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **task**                          | one task / WP                     | **consultable** (paged on `memory-recall`; own closing fold **auto-recalled at re-spawn** — MEM-13) | active until the task closes → then **archived**      | what was tried, what failed, where I stopped (the fold), the retry-relevant lesson                         |
| **pr**                            | one PR                            | **consultable** (paged on `memory-recall`; own closing fold **auto-recalled at re-spawn** — MEM-13) | active until the PR merges/closes → then **archived** | the PR's decisions, review outcomes, the knowledge-delta it produced                                       |
| **project**                       | whole project, this member's role | **always INJECTED**, never queried                                                                  | durable; travels with the repo; decays by non-use     | the member's standing always/never rules for working here                                                  |
| **logbook** _(orchestrator only)_ | whole project, over time          | **consultable**, never injected                                                                     | permanent, append-only chronological ledger           | the orchestrator's prose decision journal — one entry per PR: decisions & _why_, tradeoffs, risks, threads |

`task`, `pr`, `project` exist for **every** member. The **logbook** is **orchestrator-only** (v0). The
logbook is **Memory, never Knowledge**.

### The injected turn-header — three slabs (Awareness · Orientation · Rules)

The header has **three** parts. The first two are **shared + derived** (assembled each turn, never a written
memory, so they can never rot); only the third is a written per-member memory.

**1 · Awareness — the project's standing self-model (DERIVED from the Atlas root, not hand-written).**
This is _not_ a generic "language + quality-bar" card (that fits any repo, so it means nothing). It is the
load-bearing self-model a senior carries — the things a worker **violates if they don't know them** — and
every facet is a **rollup of the Atlas's own top-level nodes**, grounded (`node@sha`) and drift-checked, so
it is zero-maintenance and never stale:

```
Awareness = {                 // shared, byte-identical, cap ≤ ~400 tok — only the TOP tier of each facet; tail is pull-reachable
  mission,       // ≤2 lines — the enduring thesis (what this IS & is for). Source: the ratified DEFINE artifact (a DEFINE stub at genesis, GEN-9).
  constitution,  // the non-negotiable laws — highest-tier axioms/invariants rolled up (violate ⇒ FAILED even if tests are green). Source: the ratified T0 manifest.
  terrain,       // the territory map: the major territories + owner + which are T0. Source: territory-axis top rollup.
  ontology,      // the core vocabulary (seat / territory / pack / poke / tier / kit …). Source: definitional nodes (slot='definition'), curated by the DEFINE persona (walt).
  taste,         // what "good" / "rejected" looks like HERE. Source: CONVENTIONS.md@sha + the gate config, not a label.
}
// A facet whose source is ABSENT (fresh brownfield move-in: no DEFINE, ZERO invariants, un-ratified T0)
// renders as a labeled UN-SEEDED sentinel — never a fabricated/hallucinated line. Genesis GEN-9 seeds sources.
```

**2 · Orientation — where the project is NOW (shared + derived).** `{ goal, last, current, state }`, each
`≤ 1 line`, cap `≤ ~250 tok`, **byte-identical for every member**. `goal` is the current milestone (not the
enduring mission — that is Awareness); `last/current/state` are a **fold over the event log**. Assembled each
turn, so always current.

**3 · Rules — how THIS member acts here (per-member, written).** The member's own `ProjectMemoryEntry[]` —
the always/never it learned. The **only** written project memory; capped, decaying, surfaces when its
`scope` matches the current work.

Awareness distinguishes from Orientation by **time-constant**: Awareness is the enduring self-model
(mission/constitution/terrain/ontology/taste — changes rarely, byte-stable). "Byte-stable" means it _can't
rot_ — it does **not** mean it is free to assemble: re-rolling five facets and drift-checking each `node@sha`
per seat per turn is real work; only the output bytes ride prompt-cache. So Awareness is **memoized** — each
facet keyed on **its own source's hash** (a facet re-rolls only when _its_ source moves, not when anything
does), and assembled **once per root-state, shared across seats** (MEM-12). Orientation is the moving state,
folded **incrementally** over new event-log entries, never replayed whole each turn. All three inject
together under the ceiling.

### Templates (every write fills one — no free prose)

**`project` — strictest, because it is injected:**

```
ProjectMemoryEntry = {
  rule:       string,   // ONE imperative line — "always X" / "never Y". No narrative.
  scope:      string,   // when it applies (path glob / tool / phase) — makes it role-relevant
  grounding?: Ref,      // OPTIONAL pointer (path@subtreeHash / PR / commit) — earns the rule its place
  frecency:   number,   // the ranking key: a TIME-DECAYED score of CITED hits (MEM-7). A `hit` is a
                        // logged event — the seat or cold-reviewer cited THIS rule-id as governing a
                        // decision ("rule applied") in the event ledger. Decayed on read/write; one
                        // stored number; near-zero = eviction. NOT a self-assessed "prevented a mistake".
}
```

Cap: **`≤ ~500 tok` total** for a member's whole injected project memory (orchestrator `≤ ~800`); SHOULD be
`1–2 lines`/entry. Writing bar: imperative, specific, deduped, testable-in-spirit.

**`task` / `pr` — richer, consultable:**

```
TaskMemoryEntry = { taskId, attempted[], failedWith[], stoppedAt, lesson, ref? }
PrMemoryEntry   = { prId, decisions[], reviewOutcomes[], knowledgeDelta[], ref? }
```

Bounded per-entry char cap, but may carry more context (paid on access, not every turn). A `lesson` /
`knowledgeDelta` that generalizes is a **promotion** candidate into `project` memory — deliberate, capped,
never automatic.

**`logbook` — structured prose (the one narrative form, still templated):**

```
LogbookEntry = {
  prId, at, territories[],           // structured index fields — keep it navigable
  shipped:     prose,   // what this PR did
  decisions:   prose,   // the key decisions AND WHY   ← the core
  tradeoffs:   prose,   // roads not taken, what was given up
  risks:       prose,   // what to watch, known debt
  openThreads: prose,   // follow-ups left behind
  links:       Ref[],   // PR, ratified facts, ADRs, superseded prior entries
}
```

Fixed sections only; prose _within_ a section, never a free-form dump. Per-section soft cap + hard
per-entry cap. Append-only: a later entry **supersedes by link**, never by rewriting.

## Invariants

Emitted in clean ascending order. (Renumbered from the source spec's scrambled `M-8/M-9/M-10` tail.)

| #                                                    | Invariant                                                                           | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MEM-1 Injection-scoped**                           | Injection scoping, NOT access control.                                              | A member's turn-header MUST inject only its own Memory (the orchestrator likewise, like any seat). This is **read-time injection-scoping over a shared store, not confidentiality**: Memory is git-native (MEM-9/10), so anyone with repo read holds every seat's Memory bytes. Real per-seat confidentiality needs opt-in **per-seat encryption** (a future option, at a re-spawn/portability cost). This invariant MUST NOT be read as isolation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **MEM-2 Distinct kinds**                             | Memory ≠ Knowledge (same Atlas).                                                    | A Memory entry MUST NOT be stored as shared Knowledge, and a Knowledge fact MUST NOT be stored as Memory — though both live in the one Atlas, on the same index/format.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **MEM-3 Injected-is-capped**                         | Project memory can't bloat.                                                         | The injected `project` memory MUST be `≤` its token cap; exceeding it is a rejected write, never a silent overflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **MEM-4 Consultable-not-injected**                   | Task/PR/logbook never ride free.                                                    | `task` / `pr` memory and the `logbook` MUST NOT auto-inject on a running turn; each is returned only by an explicit `memory-recall`. The **one** exception is the re-spawn push of MEM-13 (a seat's _own_ closing fold for the unit it is resuming) — a scoped one-time spawn event, not per-turn injection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **MEM-5 Templated**                                  | No free prose.                                                                      | Every write fills its per-type template or is rejected fail-closed (spec A-13, applied to every Memory type); the logbook is prose only _within_ its fixed sections.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **MEM-6 Orientation is derived & shared**            | Never a stale hand-written status.                                                  | Orientation (`goal/last/current/state`) MUST be assembled — `goal` from the ratified DEFINE artifact, `last/current/state` as a fold over the event log — injected byte-identically across all members, `≤ ~250 tok`. It MUST NOT be a per-member _written_ memory entry, so it can never go stale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **MEM-7 Decay = de-activation, NOT deletion**        | Lean hot set, nothing lost — a fixed slot count ranked by frecency, not a soft cap. | A **`hit` is a logged, cited event**, not a self-assessed counter: it increments **only** when a seat or the cold-reviewer **explicitly cites this rule-id as governing a decision** ("rule applied") in the event ledger — giving `hits` a real denominator and an auditable promotion bar. The injected `project` set MUST be a **fixed slot count — the top `12` entries ranked by `frecency`**, a **single time-decayed hit score** (decayed on read/write from those logged cited hits), orchestrator MAY hold more within its `~800` cap. An entry is **evicted to the archive when its `frecency` decays to ~zero** — the near-zero score IS the eviction signal; this **replaces** the raw-`hits` count + the bolted-on `max(20 waves, 30 days)` window (one stored number, no separate window machinery). Frecency ranking MUST NOT let an old-popular rule pin a slot (the LFU-ossification failure a cumulative count causes). Deterministic, ledger-driven — a soft token cap alone can't rank for eviction. Evicted entries are **retained, versioned, re-spawnable**; the _archive_ grows freely, the _injected_ set never does. No memory is ever deleted. |
| **MEM-8 Logbook discipline**                         | The diary stays a ledger.                                                           | The logbook is orchestrator-only, **one append-only entry per PR**, filling the fixed sections within per-section caps; it is **consultable, never injected**; a later entry supersedes a past decision by link, never by rewriting history.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **MEM-9 Portable + scrubbed**                        | The member's, and the repo's; nothing secret in-tree.                               | Memory travels with the repo, is inherited by a fork, exports to open JSON — no lock-in. Secrets/PII MUST be scrubbed before write by a **named scanner** (gitleaks / trufflehog) run as a **fail-closed gate**: a hit **blocks** the write, mirroring PERSIST-10 — in-tree memory is committed to git and equally irreversible, so a leaked secret cannot be un-committed after the fact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **MEM-10 Versioned & nothing dies**                  | All members' memory is git-native.                                                  | Every memory type of every member (incl. the orchestrator) is versioned with the repo and travels at each commit/PR/branch/fork; each ephemeral agent's run is re-spawnable from the versioned record. Governed by the Atlas [A-16/A-17/A-18](../spec/atlas.md#4-invariants-the-guarantees--each-is-falsifiable).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **MEM-11 Awareness is a derived rollup, not a blob** | Real project self-model, zero maintenance.                                          | The injected **Awareness** (mission / constitution / terrain / ontology / taste) MUST be **assembled from the Atlas root** — mission from the ratified DEFINE artifact, constitution from the highest-tier invariant set, terrain from the territory-axis top rollup, ontology from curated definitional nodes, taste from CONVENTIONS + the gate config — each facet **grounded (`node@sha`) + drift-checked**, carrying only the **top tier** under its `≤ ~400 tok` cap. Producers are named: `ontology` is curated by the **DEFINE persona (walt)** as `slot='definition'` facts (the producer of ontology nodes); `taste` is grounded to `CONVENTIONS.md@sha` + the gate config. A facet whose source is **absent** (fresh brownfield move-in, pre-genesis-seed GEN-9) MUST render as a labeled **`UN-SEEDED`** sentinel — never a fabricated/hallucinated self-model line. It MUST NOT be a hand-written memory entry (so it cannot rot), MUST be byte-identical across members, and its tail MUST stay **pull-reachable**, not injected. A generic language/stack card MUST NOT stand in for it.                                                                   |
| **MEM-12 Assembly is memoized, not free**            | Can't-rot ≠ cheap-to-assemble; key it fine + assemble once.                         | "Byte-stable" makes Awareness un-rottable, not free to assemble. Each facet MUST be **cached keyed on ITS source's subtree hash** (constitution set / territory-axis top / `CONVENTIONS.md@sha`) — **not** the root `rId‖rState` (which moves whenever _anything_ moves ⇒ ~always-miss on a busy repo); a facet re-rolls only when its own source moves. Awareness MUST be assembled **once per root-state and shared across all seats** in a wave (it is byte-identical by MEM-11), never re-rolled per seat. **Orientation** MUST be an **incremental fold** over event-log entries appended since the last header, never a full replay each turn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **MEM-13 Recall fires at re-spawn**                  | The fold is a push at spawn, not a discretionary pull.                              | A re-spawned seat MUST **auto-recall its own prior `task` / `pr` fold** (`attempted` / `failedWith` / `stoppedAt` / `lesson`) for the unit it is resuming **at spawn** — a **push**, not a discretionary `memory-recall`. A closing fold that is never recalled at the next spawn is dead weight; this makes the fold load-bearing. It is scoped to the seat's **own** fold for the **resumed** task/PR (not general consultable auto-injection — MEM-4 still bars that on a running turn). Deterministic and ledger-driven off the unit's archived fold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Acceptance

1. **Injection budget.** A member's injected `project` memory is always `≤` cap; a would-exceed write is rejected. _(MEM-3)_
2. **No auto-inject of consultable.** `task` / `pr` memory and the logbook never appear in a member's context without an explicit recall. _(MEM-4)_
3. **Template enforcement.** A write missing a required field or over cap is rejected; no free-prose entry persists. _(MEM-5)_
4. **Injection scoping (not access control).** Member A's turn-header injects only A's Memory (the orchestrator likewise) — yet a repo reader can still read B's Memory bytes straight from the tree. MEM-1 scopes injection, it does not gate access; true per-seat confidentiality requires opt-in per-seat encryption. _(MEM-1)_
5. **No conflation.** A seat-craft lesson never lands as shared Knowledge; a Knowledge fact never lands as Memory. _(MEM-2)_
6. **Orientation is live & shared.** After a milestone event, every member's injected Orientation reflects the new `last/current` with no manual write, and two members' Orientation is byte-identical. _(MEM-6)_
7. **Decay = frecency.** The injected `project` set holds the **top-12 by `frecency`** (a single
   time-decayed hit score, no separate window); a `hit` counts only when a seat / cold-reviewer **cited the
   rule-id** in the ledger; an entry whose `frecency` decays to ~zero is evicted into the archive; an
   old-popular rule cannot pin a slot; ranking is deterministic. _(MEM-7)_
8. **Logbook is a ledger.** Exactly one logbook entry per PR, in the fixed sections, within caps; consultable (by PR/date/territory), never injected; no past entry rewritten. _(MEM-8)_
9. **Round-trip + fail-closed scrub.** Export → import yields identical Memory; a write carrying a secret is **blocked** fail-closed by the named scanner (gitleaks/trufflehog), not merely redacted after landing. _(MEM-9, MEM-10)_
10. **Awareness is derived & grounded.** Every Awareness facet traces to an Atlas `node@sha` (no hand-written
    line); editing a source node (e.g. a constitution invariant) changes the assembled Awareness with no
    manual write; it is byte-identical across two members and stays `≤ ~400 tok`; a drifted source flags the
    facet rather than serving stale. _(MEM-11)_
11. **Un-seeded degrades honestly.** On a fresh brownfield move-in (no DEFINE, ZERO invariants, un-ratified
    T0), an un-sourced Awareness facet renders as a labeled `UN-SEEDED` sentinel — never a fabricated line;
    once genesis seeds the source (DEFINE stub / T0 manifest / `CONVENTIONS.md@sha`, GEN-9) the facet fills
    from it, and `ontology` traces to a `slot='definition'` node curated by walt. _(MEM-11, GEN-9)_
12. **Memoized assembly.** On a turn where the root axis `rId‖rState` is unchanged, re-assembling Awareness
    does **no** facet re-roll or per-`node@sha` drift-check (cache hit); it recomputes only after the root
    rollup moves. Orientation on a new turn folds only the newly-appended events, not the whole log. _(MEM-12)_
13. **Recall fires at re-spawn.** A seat re-spawned onto a task/PR it previously touched receives its **own**
    closing fold (`attempted/failedWith/stoppedAt/lesson`) at spawn with no manual `memory-recall`; a fold
    that no re-spawn ever recalls is a spec failure, not acceptable dead weight. _(MEM-13)_

---

## Decisions (ratified / DEFINE-pending)

The two questions that blocked the memory ring were surfaced by a cold review of the CAMPAIGN-11 plan and
**ratified by the owner on 2026-08-30**. They are recorded here, in the module's own contract, rather than
in a new ADR — this reference already carries the data model, the invariants and the acceptance checks, and
a second home for the same clause is a failure this repository has already made twice.

- **D1 — the write owner is the composition root's resolved `actor` (RATIFIED 2026-08-30).**
  `kinds.ts::put` threw on **both** branches: on a conflated partition, and — deliberately — on the matched
  one, because a `MemoryRecord` requires an `owner` and `put` had no argument to get one from. Refusing to
  fabricate it was correct; the park was declared in the code and honoured by `packages/e2e/test/s07-memory-scoping.e2e.test.ts`.
  The owner is now `ATLAS_ACTOR ?? gitUserEmail(repo) ?? ''`, the SAME identity the knowledge write door
  already uses. This package does not resolve it and does not interpret it — it receives it, which is why
  `owner` is a parameter and not an import.
  - _Rejected: a new `MemberId` brand._ `types.ts` carries a note that a brand should be sourced "if one is
    ratified". Minting one here would put a seat concept inside the foundation, and the foundation is
    consumed one-way by the thing that actually has seats. When Orchestra exists it supplies real seat ids
    into this same field and nothing in this package changes.
  - _Consequence, stated rather than discovered later:_ `actor` resolves to the empty string when neither
    source is present, so an empty owner is a REACHABLE value. An unowned record would be injected to every
    caller whose actor also resolves empty — that is a scoping key matching by accident — so an empty owner
    is refused fail-closed (`UnownedWriteError`).

- **D2 — Awareness seeding stays with genesis; the ring wires it (RATIFIED 2026-08-30).**
  `genesis/src/seed.ts::seedAwareness` already sources `constitution` from the ratified `T0` manifest and
  `taste` from `CONVENTIONS.md@sha`. `mission` needs a _ratified_ DEFINE artifact, and `terrain` / `ontology`
  have no genesis source, so all three render the labeled `UN-SEEDED` sentinel — the specified behaviour for
  an absent source, never a fabricated line. The ring therefore wires the seeder that exists and does not
  invent a seeding convention before the persona that curates one does.
  - _Rejected: deriving the five facets from conventional Atlas scopes._ It would make five scope names
    load-bearing and duplicate a seeder that already ships.
  - **AMENDED 2026-08-30, same day, because the premise was wrong.** D2 said the ring would _wire the
    seeder that exists_. Building W7a proved that is not available: `seedAwareness` assembles the
    `Awareness` facets DIRECTLY with its own local helpers and never calls `atlasRoot` / `rollup`, so it
    bypasses the memoized, grounded, drift-checked rollup that MEM-11 and MEM-12 require of an INJECTED
    slab; and its `SeedDeps.locateConventions` seam is wired nowhere in the tree. It is a genesis-time
    bootstrap that produces a slab once, not a ring-time assembler that can produce one per turn.
    So the ring reads the SAME SOURCES — the ratified `T0` manifest, `CONVENTIONS.md@sha` — through the
    rollup machinery, and does not call the seeder. The decision's INTENT stands unchanged (do not invent a
    seeding convention; take what already exists); its mechanism was wrong and is corrected here rather
    than left as a contract the code quietly disagrees with.
  - `CONVENTIONS.md` now exists at the repository root, so `taste` seeds from real content instead of
    rendering `UN-SEEDED` for want of a file. That was the second half of D2 and it was a missing file, not
    a missing design.
  - **MEASURED on this repository, 2026-08-30**, by running the assembled slab rather than reasoning about
    it: `taste` = **seeded** (`taste: CONVENTIONS.md@sha`); `mission`, `terrain`, `ontology` and
    **`constitution`** = labeled `UN-SEEDED`. Constitution reads UN-SEEDED here not because the source is
    wrong but because this working tree carries **no persisted `.atlas/projection.json`**, so there are no
    ratified `T0` rows to roll up. That is the specified degradation working, and it is recorded because
    "constitution comes from the ratified T0 manifest" is true of the MECHANISM and was not yet true of
    this checkout — a distinction the earlier wording blurred.

- **D3 — the `MemoryKind` is DERIVED from the entry's shape, never declared (RATIFIED 2026-08-30, by the
  orchestrator under the same delegation).** `validate(kind, entry)` takes the type as a parameter, so
  before this the caller chose which template judged their own write: a logbook payload could be filed as
  `project` and be checked against three keys instead of nine. That is the confused deputy
  `reference/atlas-architecture.md` forbids by name at the governance doors — **ARCH-9, "a gate-selecting
  field is derived, never chosen"** — one layer down and in the same shape, since `kind` selects
  `REQUIRED[kind]` and `REQUIRED[kind]` _is_ the gate. `partition()` already derived the
  Memory-vs-Knowledge axis; `memoryKindOf()` closes the other one, so `put` now derives **both** and the
  payload announces neither.
  - _The soundness is checked, not assumed._ The derivation holds only while the four templates are
    mutually exclusive under "required keys present ∧ no key outside the template". That is a property of
    the data, so a tie is an **error**, never a first-match win: if a future template makes two types
    simultaneously satisfiable the write fails loudly instead of being filed under whichever is listed
    first.
  - _Scope, stated honestly:_ this changes `put`. `validate(kind, entry)` keeps its parameter, because it
    is also the vehicle by which a caller asks "would this be a valid `logbook`?" — a legitimate question.
    The door is what must not let the payload pick its own judge, and the door now does not.
