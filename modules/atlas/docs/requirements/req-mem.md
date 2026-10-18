# Requirements — Block MEM (memory) · S1 lift-and-tag

### REQ-MEM-1a — inject only own Memory

source: INV-MEM-1 @ reference/atlas-memory.md#mem-1
The memory subsystem shall inject into a member's turn-header only that member's own Memory.
normative-clause: "A member's turn-header MUST inject only its own Memory (the orchestrator likewise, like any seat)"

### REQ-MEM-1b — scoping, not access control

source: INV-MEM-1 @ reference/atlas-memory.md#mem-1
While Memory is stored git-native, the memory subsystem shall leave every seat's Memory bytes readable by anyone holding repo read.
normative-clause: "Memory is git-native (MEM-9/10), so anyone with repo read holds every seat's Memory bytes"

### REQ-MEM-2a — no Memory-as-Knowledge

source: INV-MEM-2 @ reference/atlas-memory.md#mem-2
If a write would store a Memory entry as shared Knowledge, then the memory subsystem shall reject it.
normative-clause: "A Memory entry MUST NOT be stored as shared Knowledge"

### REQ-MEM-2b — no Knowledge-as-Memory

source: INV-MEM-2 @ reference/atlas-memory.md#mem-2
If a write would store a Knowledge fact as Memory, then the memory subsystem shall reject it.
normative-clause: "a Knowledge fact MUST NOT be stored as Memory"

### REQ-MEM-3a — injected project memory capped

source: INV-MEM-3 @ reference/atlas-memory.md#mem-3
The memory subsystem shall keep a member's injected `project` memory at or below its token cap.
normative-clause: "The injected `project` memory MUST be `≤` its token cap"

### REQ-MEM-3b — over-cap write rejected

source: INV-MEM-3 @ reference/atlas-memory.md#mem-3
If a `project` memory write would exceed the token cap, then the memory subsystem shall reject the write rather than allow a silent overflow.
normative-clause: "exceeding it is a rejected write, never a silent overflow"

### REQ-MEM-4a — consultable never auto-injects

source: INV-MEM-4 @ reference/atlas-memory.md#mem-4
If a turn is running, then the memory subsystem shall not auto-inject `task` memory, `pr` memory, or the `logbook`.
normative-clause: "`task` / `pr` memory and the `logbook` MUST NOT auto-inject on a running turn"

### REQ-MEM-4b — consultable only via explicit recall

source: INV-MEM-4 @ reference/atlas-memory.md#mem-4
The memory subsystem shall return `task` memory, `pr` memory, and the `logbook` only in response to an explicit `memory-recall`.
normative-clause: "each is returned only by an explicit `memory-recall`"

### REQ-MEM-5a — untemplated write rejected

source: INV-MEM-5 @ reference/atlas-memory.md#mem-5
If a memory write does not fill its per-type template, then the memory subsystem shall reject it fail-closed.
normative-clause: "Every write fills its per-type template or is rejected fail-closed"

### REQ-MEM-5b — logbook prose bounded to sections

source: INV-MEM-5 @ reference/atlas-memory.md#mem-5
The memory subsystem shall confine `logbook` prose to within its fixed sections.
normative-clause: "the logbook is prose only _within_ its fixed sections"

### REQ-MEM-6a — Orientation goal from DEFINE

source: INV-MEM-6 @ reference/atlas-memory.md#mem-6
The memory subsystem shall assemble Orientation's `goal` from the ratified DEFINE artifact.
normative-clause: "Orientation (`goal/last/current/state`) MUST be assembled — `goal` from the ratified DEFINE artifact"

### REQ-MEM-6b — Orientation state as event-log fold

source: INV-MEM-6 @ reference/atlas-memory.md#mem-6
The memory subsystem shall assemble Orientation's `last/current/state` as a fold over the event log.
normative-clause: "`last/current/state` as a fold over the event log"

### REQ-MEM-6c — Orientation injected byte-identically

source: INV-MEM-6 @ reference/atlas-memory.md#mem-6
The memory subsystem shall inject Orientation byte-identically across all members.
normative-clause: "injected byte-identically across all members"

### REQ-MEM-6d — Orientation within token cap

source: INV-MEM-6 @ reference/atlas-memory.md#mem-6
The memory subsystem shall keep injected Orientation within `≤ ~250 tok`.
normative-clause: "`≤ ~250 tok`"

### REQ-MEM-6e — Orientation never a written entry

source: INV-MEM-6 @ reference/atlas-memory.md#mem-6
The memory subsystem shall not represent Orientation as a per-member written memory entry.
normative-clause: "It MUST NOT be a per-member _written_ memory entry, so it can never go stale"

### REQ-MEM-7a — hit counts only on cited rule-id

source: INV-MEM-7 @ reference/atlas-memory.md#mem-7
The memory subsystem shall increment a rule's `hit` only when a seat or the cold-reviewer explicitly cites that rule-id as governing a decision in the event ledger.
normative-clause: "it increments **only** when a seat or the cold-reviewer **explicitly cites this rule-id as governing a decision** (\"rule applied\") in the event ledger"

### REQ-MEM-7b — injected set is top-12 by frecency

source: INV-MEM-7 @ reference/atlas-memory.md#mem-7
The memory subsystem shall constitute the injected `project` set as the top 12 entries ranked by `frecency`, a single time-decayed hit score.
normative-clause: "The injected `project` set MUST be a **fixed slot count — the top `12` entries ranked by `frecency`**, a **single time-decayed hit score**"

### REQ-MEM-7c — evict at near-zero frecency

source: INV-MEM-7 @ reference/atlas-memory.md#mem-7
When an entry's `frecency` decays to ~zero, the memory subsystem shall evict that entry to the archive.
normative-clause: "An entry is **evicted to the archive when its `frecency` decays to ~zero**"

### REQ-MEM-7d — no slot pinned by old-popular rule

source: INV-MEM-7 @ reference/atlas-memory.md#mem-7
The memory subsystem shall not let frecency ranking allow an old-popular rule to pin a slot.
normative-clause: "Frecency ranking MUST NOT let an old-popular rule pin a slot"

### REQ-MEM-7e — evicted entries retained & re-spawnable

source: INV-MEM-7 @ reference/atlas-memory.md#mem-7
The memory subsystem shall keep evicted entries retained, versioned, and re-spawnable.
normative-clause: "Evicted entries are **retained, versioned, re-spawnable**"

### REQ-MEM-7f — memory never deleted

source: INV-MEM-7 @ reference/atlas-memory.md#mem-7
The memory subsystem shall never delete a memory.
normative-clause: "No memory is ever deleted."

### REQ-MEM-8a — logbook is orchestrator-only

source: INV-MEM-8 @ reference/atlas-memory.md#mem-8
The memory subsystem shall restrict the `logbook` to the orchestrator.
normative-clause: "The logbook is orchestrator-only"

### REQ-MEM-8b — one append-only entry per PR

source: INV-MEM-8 @ reference/atlas-memory.md#mem-8
The memory subsystem shall record exactly one append-only `logbook` entry per PR.
normative-clause: "**one append-only entry per PR**"

### REQ-MEM-8c — logbook fills capped fixed sections

source: INV-MEM-8 @ reference/atlas-memory.md#mem-8
The memory subsystem shall require each `logbook` entry to fill the fixed sections within their per-section caps.
normative-clause: "filling the fixed sections within per-section caps"

### REQ-MEM-8d — logbook consultable, never injected

source: INV-MEM-8 @ reference/atlas-memory.md#mem-8
The memory subsystem shall keep the `logbook` consultable and never inject it.
normative-clause: "it is **consultable, never injected**"

### REQ-MEM-8e — supersede by link, not rewrite

source: INV-MEM-8 @ reference/atlas-memory.md#mem-8
If a later `logbook` entry supersedes a past decision, then the memory subsystem shall link to it rather than rewrite history.
normative-clause: "a later entry supersedes a past decision by link, never by rewriting history"

### REQ-MEM-9a — Memory exports to open JSON

source: INV-MEM-9 @ reference/atlas-memory.md#mem-9
The memory subsystem shall export Memory to open JSON with no lock-in.
normative-clause: "Memory travels with the repo, is inherited by a fork, exports to open JSON — no lock-in"

### REQ-MEM-9b — secrets scrubbed by named scanner

source: INV-MEM-9 @ reference/atlas-memory.md#mem-9
The memory subsystem shall scrub secrets and PII before write using a named scanner (gitleaks / trufflehog).
normative-clause: "Secrets/PII MUST be scrubbed before write by a **named scanner** (gitleaks / trufflehog)"

### REQ-MEM-9c — scanner hit blocks the write

source: INV-MEM-9 @ reference/atlas-memory.md#mem-9
If the named scanner detects a secret in a memory write, then the memory subsystem shall block the write as a fail-closed gate.
normative-clause: "run as a **fail-closed gate**: a hit **blocks** the write"

### REQ-MEM-10a — every memory type versioned & travels

source: INV-MEM-10 @ reference/atlas-memory.md#mem-10
The memory subsystem shall version every memory type of every member with the repo and carry it at each commit, PR, branch, and fork.
normative-clause: "Every memory type of every member (incl. the orchestrator) is versioned with the repo and travels at each commit/PR/branch/fork"

### REQ-MEM-10b — runs re-spawnable from the record

source: INV-MEM-10 @ reference/atlas-memory.md#mem-10
The memory subsystem shall make each ephemeral agent's run re-spawnable from the versioned record.
normative-clause: "each ephemeral agent's run is re-spawnable from the versioned record"

### REQ-MEM-11a — Awareness assembled from Atlas root

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
The memory subsystem shall assemble the injected Awareness (mission / constitution / terrain / ontology / taste) from the Atlas root.
normative-clause: "The injected **Awareness** (mission / constitution / terrain / ontology / taste) MUST be **assembled from the Atlas root**"

### REQ-MEM-11b — each facet grounded & drift-checked

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
The memory subsystem shall ground each Awareness facet with `node@sha` and drift-check it.
normative-clause: "each facet **grounded (`node@sha`) + drift-checked**"

### REQ-MEM-11c — top tier only within cap

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
The memory subsystem shall carry only the top tier of each Awareness facet within its `≤ ~400 tok` cap.
normative-clause: "carrying only the **top tier** under its `≤ ~400 tok` cap"

### REQ-MEM-11d — ontology from curated definition nodes

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
The memory subsystem shall source the `ontology` facet from `slot='definition'` facts curated by the DEFINE persona (walt).
normative-clause: "`ontology` is curated by the **DEFINE persona (walt)** as `slot='definition'` facts (the producer of ontology nodes)"

### REQ-MEM-11e — absent source renders UN-SEEDED

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
If an Awareness facet's source is absent, then the memory subsystem shall render it as a labeled `UN-SEEDED` sentinel rather than a fabricated self-model line.
normative-clause: "A facet whose source is **absent** (fresh brownfield move-in, pre-genesis-seed GEN-9) MUST render as a labeled **`UN-SEEDED`** sentinel — never a fabricated/hallucinated self-model line"

### REQ-MEM-11f — Awareness never hand-written

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
The memory subsystem shall not represent Awareness as a hand-written memory entry.
normative-clause: "It MUST NOT be a hand-written memory entry (so it cannot rot)"

### REQ-MEM-11g — Awareness byte-identical across members

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
The memory subsystem shall inject Awareness byte-identically across members.
normative-clause: "MUST be byte-identical across members"

### REQ-MEM-11h — Awareness tail pull-reachable

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
The memory subsystem shall keep the Awareness tail pull-reachable and not injected.
normative-clause: "its tail MUST stay **pull-reachable**, not injected"

### REQ-MEM-11i — no generic card substitute

source: INV-MEM-11 @ reference/atlas-memory.md#mem-11
The memory subsystem shall not let a generic language/stack card stand in for Awareness.
normative-clause: "A generic language/stack card MUST NOT stand in for it."

### REQ-MEM-12a — facet cached on its own source hash

source: INV-MEM-12 @ reference/atlas-memory.md#mem-12
The memory subsystem shall cache each Awareness facet keyed on its own source's subtree hash.
normative-clause: "Each facet MUST be **cached keyed on ITS source's subtree hash**"

### REQ-MEM-12b — Awareness assembled once per root-state

source: INV-MEM-12 @ reference/atlas-memory.md#mem-12
The memory subsystem shall assemble Awareness once per root-state and shared across all seats, never re-rolling it per seat.
normative-clause: "Awareness MUST be assembled **once per root-state and shared across all seats** in a wave (it is byte-identical by MEM-11), never re-rolled per seat"

### REQ-MEM-12c — Orientation is an incremental fold

source: INV-MEM-12 @ reference/atlas-memory.md#mem-12
The memory subsystem shall compute Orientation as an incremental fold over event-log entries appended since the last header, never a full replay each turn.
normative-clause: "**Orientation** MUST be an **incremental fold** over event-log entries appended since the last header, never a full replay each turn"

### REQ-MEM-13a — recall pushed at re-spawn

source: INV-MEM-13 @ reference/atlas-memory.md#mem-13
When a seat is re-spawned onto the unit it is resuming, the memory subsystem shall push that seat's own prior `task` / `pr` closing fold at spawn.
normative-clause: "A re-spawned seat MUST **auto-recall its own prior `task` / `pr` fold** (`attempted` / `failedWith` / `stoppedAt` / `lesson`) for the unit it is resuming **at spawn** — a **push**, not a discretionary `memory-recall`"

### REQ-MEM-13b — recall scoped to own resumed fold

source: INV-MEM-13 @ reference/atlas-memory.md#mem-13
The memory subsystem shall scope the re-spawn push to the seat's own fold for the resumed task or PR.
normative-clause: "It is scoped to the seat's **own** fold for the **resumed** task/PR (not general consultable auto-injection — MEM-4 still bars that on a running turn)"

### REQ-MEM-13c — recall deterministic off archived fold

source: INV-MEM-13 @ reference/atlas-memory.md#mem-13
The memory subsystem shall drive the re-spawn recall deterministically off the unit's archived fold.
normative-clause: "Deterministic and ledger-driven off the unit's archived fold."
