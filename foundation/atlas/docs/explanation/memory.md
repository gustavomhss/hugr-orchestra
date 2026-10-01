# Memory

## The idea

Every member of the orchestra — each seat _and_ the orchestrator — carries its own Memory: what it tried,
what failed, the standing rules it learned for working _here_. Memory is not a separate system bolted onto
the Atlas; it is a **kind** of the same Atlas that stores Knowledge, on the same hashed index, the same
grounding primitive, the same portable export. Knowledge is the shared, codebase-grounded truth; Memory is
one member's private craft of _doing the work_. The whole design turns on a single distinction — **how a
memory is accessed** — and everything else follows from getting that right.

## Why it's this way

**Why per-member.** Craft doesn't generalize cleanly. `charlie`'s retry lesson about a flaky migration is
not a fact about the codebase, and it is not `lucy`'s experience. Storing it as shared Knowledge would
pollute the codebase truth with one seat's episodic noise; storing it in a common pool would leak one
member's context into every other. So each member owns its Memory, private to it — and the orchestrator is
just another member with its own ([MEM-1](../reference/atlas-memory.md#invariants)). Keeping Memory and
Knowledge as **distinct kinds of one Atlas** ([MEM-2](../reference/atlas-memory.md#invariants)) is what lets
them share machinery without contaminating each other.

**The injected-vs-consultable law.** This is the load-bearing decision. Some memory is _injected_ — it
rides in every context the member runs, paid on every dispatch, forever. Some is _consultable_ — paged in
only when the member asks (`memory-recall`), paid only on access. Injected memory therefore has a **sacred,
tiny token budget**; consultable memory may be rich. Get it backwards — a fat injected `project` memory, or
a `task` memory (or the whole logbook!) that auto-injects — and this layer stops being an asset and becomes
per-turn overhead that taxes every agent, forever. That is why `project` memory is hard-capped, templated,
and objective ([MEM-3](../reference/atlas-memory.md#invariants),
[MEM-5](../reference/atlas-memory.md#invariants)), while `task`/`pr`/`logbook` are consultable-only
([MEM-4](../reference/atlas-memory.md#invariants)). The logbook is the richest form of all — long prose —
which is _precisely_ why it is never injected.

**Why Orientation is derived, not written.** A member also needs to know the target and where the work
stands: `goal`, `last` milestone, `current` milestone, `state`. The naive move is to write that as a memory
and update it. Hand-written status _rots_ — someone forgets to update it and the whole orchestra is now
oriented off a lie. So Orientation is **not a memory entry at all**. It is **assembled every turn**: `goal`
from the ratified DEFINE artifact, and `last/current/state` as a **fold over the event log**. Because it is
derived, it is always current by construction, and because it is derived from _shared_ sources it is
**byte-identical across every member** ([MEM-6](../reference/atlas-memory.md#invariants)). The injected
turn-header is thus two things glued together: Orientation (shared, derived) + this member's project rules
(private, written).

**Why the logbook is prose but structured.** The orchestrator's decisions carry a _why_ that terse fields
can't hold — the tradeoff weighed, the road not taken. That reasoning is worth keeping in prose. But an
unstructured diary becomes an unnavigable mess. So the logbook threads the needle: **structured prose** —
fixed sections (`shipped / decisions / tradeoffs / risks / openThreads`), structured index fields
(`prId / at / territories`), per-section caps, one entry per PR, and **append-only**. History of reasoning
is never rewritten; a later entry supersedes a past decision _by link_, not by erasing it
([MEM-8](../reference/atlas-memory.md#invariants)). This is the deliberate complement to Knowledge:
Knowledge is current-truth and gets edited; the logbook is history-of-reasoning and only grows. **The
logbook is Memory, never Knowledge** — it is the orchestrator's episodic ledger, not a fact about the code.

**Why nothing dies.** Decay is de-activation, not deletion. A `project` rule that stops earning its
`hits` leaves the _injected_ set — but is archived, versioned, re-spawnable, never erased
([MEM-7](../reference/atlas-memory.md#invariants)). All memory is git-native, travels with the repo, and
exports to open JSON ([MEM-9](../reference/atlas-memory.md#invariants),
[MEM-10](../reference/atlas-memory.md#invariants)). The hot set stays lean; the archive grows freely.

## Trade-offs

- **A cap costs recall.** A `≤ ~500 tok` injection budget means real rules get archived when they stop
  paying rent. We accept that: an injected memory that isn't earning its tokens is _worse_ than absent,
  because it taxes every turn. The archive keeps it re-spawnable, so nothing is truly lost.
- **Promotion is manual.** A `task`/`pr` lesson only becomes a standing `project` rule by a deliberate,
  capped promotion — not automatically. This is friction on purpose: automatic promotion is how injected
  memory silently bloats.
- **Derived Orientation costs compute.** Folding the event log every turn is more work than reading a
  stored string — but it is the only way the status can't go stale, which is the failure that matters.
- **The logbook can grow long.** By being consultable-only and append-only, it never taxes a turn; the cost
  is deferred entirely to the moment someone recalls it.

## Where it fits

- The types, the templates, the caps, and the falsifiable invariants: [reference/atlas-memory.md](../reference/atlas-memory.md).
- Adding a good injected rule, step by step: [how-to/write-a-project-rule.md](../how-to/write-a-project-rule.md).
- The Knowledge kind, and the shared index/grounding/export both kinds use: [spec/atlas.md](../spec/atlas.md).
- The normative source this rehomes: [spec/memory.md](../spec/memory.md).
