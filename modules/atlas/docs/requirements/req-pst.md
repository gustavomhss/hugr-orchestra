# Requirements — Block PST (persistence) · S1 lift-and-tag

### REQ-PERSIST-1-a — portable source is store plus trailers

source: INV-PERSIST-1 @ reference/atlas-persist.md#persist-1
The persistence layer shall make the portable source the tracked store plus commit trailers.
normative-clause: "The portable source MUST be the tracked store + commit **trailers**"

### REQ-PERSIST-1-b — PR attachment never sole home

source: INV-PERSIST-1 @ reference/atlas-persist.md#persist-1
If a datum's only home would be the PR attachment, then the persistence layer shall not allow it.
normative-clause: "The PR attachment is a projection reconstructable from that source — never the sole home of any datum"

### REQ-PERSIST-2-a — state reconstructed by folding the set

source: INV-PERSIST-2 @ reference/atlas-persist.md#persist-2
When the append-only event set is folded from empty, the persistence layer shall reconstruct the Atlas state.
normative-clause: "Atlas state MUST be reconstructable by folding the append-only event **set** from empty (A-11)"

### REQ-PERSIST-2-b — fold convergent and order-independent

source: INV-PERSIST-2 @ reference/atlas-persist.md#persist-2
The persistence layer shall make the fold convergent and order-independent.
normative-clause: "the fold MUST be convergent (order-independent — KERNEL-11)"

### REQ-PERSIST-2-c — no dependence on history or snapshot

source: INV-PERSIST-2 @ reference/atlas-persist.md#persist-2
The persistence layer shall not make Atlas-state reconstruction depend on a linear commit history or a mutable in-place snapshot.
normative-clause: "it does not depend on a linear commit history or a mutable in-place snapshot"

### REQ-PERSIST-3-a — provenance committed to a commit trailer

source: INV-PERSIST-3 @ reference/atlas-persist.md#persist-3
When a WP is committed, the persistence layer shall commit its provenance as a commit trailer block carrying WP, Model, Gates, Verdict, and Transcript-SHA.
normative-clause: "committed as a commit **trailer** block"

### REQ-PERSIST-3-b — provenance also recorded as a git note

source: INV-PERSIST-3 @ reference/atlas-persist.md#persist-3
When a WP is committed, the persistence layer shall also record its provenance as a git note under refs/notes/orchestra carrying the same fields.
normative-clause: "a **git note** under `refs/notes/orchestra`, carrying `WP / Model / Gates / Verdict / Transcript-SHA`"

### REQ-PERSIST-4-a — attachment is hashed pointers

source: INV-PERSIST-4 @ reference/atlas-persist.md#persist-4
The persistence layer shall make what is attached to a commit or PR the hashed index of pointers.
normative-clause: "What is attached to a commit/PR MUST be the hashed index (pointers)"

### REQ-PERSIST-4-b — content lives in the CAS

source: INV-PERSIST-4 @ reference/atlas-persist.md#persist-4
The persistence layer shall keep the content in the CAS.
normative-clause: "the content MUST live in the CAS"

### REQ-PERSIST-4-c — git object not canonical for large bodies

source: INV-PERSIST-4 @ reference/atlas-persist.md#persist-4
If large content bodies are stored, then the persistence layer shall not make a git object their canonical container.
normative-clause: "A git object MUST NOT be the canonical container of large content bodies"

### REQ-PERSIST-5-a — never delete memory or knowledge

source: INV-PERSIST-5 @ reference/atlas-persist.md#persist-5
If a delete of a memory or knowledge entry is attempted, then the persistence layer shall not delete it.
normative-clause: "No memory or knowledge is ever deleted"

### REQ-PERSIST-5-b — superseded entries archived and retained

source: INV-PERSIST-5 @ reference/atlas-persist.md#persist-5
When a memory or knowledge entry is superseded, decayed, or closed, the persistence layer shall retain it in the archive, deduped.
normative-clause: "Superseded / decayed / closed entries MUST be archived (deduped, merge-on-rerun-never-loses-data), retained"

### REQ-PERSIST-5-c — archived entries stay re-spawnable

source: INV-PERSIST-5 @ reference/atlas-persist.md#persist-5
When a memory or knowledge entry is superseded, decayed, or closed, the persistence layer shall keep it re-spawnable.
normative-clause: "retained, and re-spawnable"

### REQ-PERSIST-5-d — forgetting leaves only the active set

source: INV-PERSIST-5 @ reference/atlas-persist.md#persist-5
When a memory or knowledge entry is forgotten, the persistence layer shall remove it from the active/injected set only.
normative-clause: "\"Forgetting\" means leaving the active/injected set only (A-16)"

### REQ-PERSIST-6 — full per-agent metering recorded

source: INV-PERSIST-6 @ reference/atlas-persist.md#persist-6
When an ephemeral agent's WP is recorded, the persistence layer shall record model, tokens, tool-uses, wall-time, retries/reworks, gates, verdict, and transcriptSha in the event log and dossier.
normative-clause: "Every ephemeral agent's WP MUST record `model`, tokens (input/output/cache), tool-uses, wall-time, **retries/reworks**, gates, verdict, and `transcriptSha` in the event log + dossier (A-17)"

### REQ-PERSIST-7-a — ephemeral agent re-invokable anywhere

source: INV-PERSIST-7 @ reference/atlas-persist.md#persist-7
The persistence layer shall make every ephemeral agent re-invokable on another machine, user, clone, or fork.
normative-clause: "any ephemeral agent MUST be re-invokable — **idempotent redispatch** (same brief → same seat) **+ faithful replay** of the recorded transcript — on another machine / user / clone / fork"

### REQ-PERSIST-7-b — no non-git state required

source: INV-PERSIST-7 @ reference/atlas-persist.md#persist-7
The persistence layer shall require no non-git state for that re-invocation.
normative-clause: "with no non-git state required"

### REQ-PERSIST-8-a — host adapter abstracts the forge

source: INV-PERSIST-8 @ reference/atlas-persist.md#persist-8
The host adapter shall abstract the forge behind attachToCommit and attachToPR with reads, one implementation per host.
normative-clause: "A host adapter MUST abstract the forge behind `attachToCommit` / `attachToPR` (+ reads), one implementation per host"

### REQ-PERSIST-8-b — configure notes push refspec

source: INV-PERSIST-8 @ reference/atlas-persist.md#persist-8
The host adapter shall configure the push refspec for refs/notes/_.
normative-clause: "It MUST configure the push refspec for `refs/notes/_`"

### REQ-PERSIST-8-c — host PR data is a projection

source: INV-PERSIST-8 @ reference/atlas-persist.md#persist-8
If a bare git clone is taken, then the host adapter shall treat host-side PR data as a projection not fetched by that clone.
normative-clause: "MUST treat host-side PR data as a projection (a bare `git clone` does not fetch it)"

### REQ-PERSIST-9-a — portable open-JSON export

source: INV-PERSIST-9 @ reference/atlas-persist.md#persist-9
The persistence layer shall export the full store to open JSON that replays 1:1 into a fresh store.
normative-clause: "The full store MUST still export to open JSON that replays 1:1 into a fresh store (A-8)"

### REQ-PERSIST-9-b — no lock-in on top of git

source: INV-PERSIST-9 @ reference/atlas-persist.md#persist-9
The persistence layer shall layer no lock-in on top of git.
normative-clause: "no lock-in layered on top of git"

### REQ-PERSIST-10-a — transcript retained in full

source: INV-PERSIST-10 @ reference/atlas-persist.md#persist-10
The persistence layer shall retain the transcript body in full, never truncated or lossily compressed.
normative-clause: "The transcript body MUST be retained **in full — the raw, unadulterated total context of the agent — never truncated or lossily compressed**"

### REQ-PERSIST-10-b — transcript is a content-addressed large object

source: INV-PERSIST-10 @ reference/atlas-persist.md#persist-10
The persistence layer shall store the transcript as a content-addressed large object fetched on demand.
normative-clause: "It MUST be stored as a **content-addressed large object** — full, lossless, versioned, **fetch-on-demand**"

### REQ-PERSIST-10-c — only a pointer in git

source: INV-PERSIST-10 @ reference/atlas-persist.md#persist-10
The persistence layer shall keep only a pointer, the transcript's content hash, in git.
normative-clause: "with only a **pointer (its content hash)** in git"

### REQ-PERSIST-10-d — future size mitigation stays lossless

source: INV-PERSIST-10 @ reference/atlas-persist.md#persist-10
If a future size mitigation is applied to the transcript, then the persistence layer shall keep it lossless and reversible.
normative-clause: "Any future size mitigation MUST stay **lossless and reversible**, never lossy"

### REQ-PERSIST-10a-a — no raw credential enters the object

source: INV-PERSIST-10a @ reference/atlas-persist.md#persist-10a
If a raw credential would enter the content-addressed transcript object, then the persistence layer shall not let it.
normative-clause: "no raw credential may enter it"

### REQ-PERSIST-10a-b — redact-at-source is the primary control

source: INV-PERSIST-10a @ reference/atlas-persist.md#persist-10a
If a raw credential of a DECLARED credential family would reach the transcript buffer, then the framework shall redact it at source before it enters.
normative-clause: "The **primary control MUST be redact-at-source**: the framework MUST NOT let a raw credential enter the transcript buffer in the first place"
scope: DECLARED FAMILIES ONLY — GitHub tokens (`gh[pousr]_`), Slack tokens (`xox[baprs]-`), GitHub fine-grained
PATs (`github_pat_`) and AWS access key ids (`AKIA`). A credential of any other shape (JWT, PEM private key, the AWS
SECRET access key, …) is **not** redacted and enters the buffer unchanged; that residue is covered by the scanner
backstop (REQ-PERSIST-10a-c/d), not by this control. See reference/atlas-persist.md#persist-10a.

### REQ-PERSIST-10a-c — scanner runs server-side

source: INV-PERSIST-10a @ reference/atlas-persist.md#persist-10a
The credential scanner shall run server-side as a pre-receive hook.
normative-clause: "it MUST also run **server-side as a pre-receive hook**"

### REQ-PERSIST-10a-d — scanner uses two or more engines

source: INV-PERSIST-10a @ reference/atlas-persist.md#persist-10a
The credential scanner shall use at least two detection engines.
normative-clause: "MUST use **≥2 detection engines**"

### REQ-PERSIST-10a-e — scrub does not abridge the record

source: INV-PERSIST-10a @ reference/atlas-persist.md#persist-10a
If the scrub redacts a secret, then the persistence layer shall not otherwise abridge the record.
normative-clause: "The scrub redacts secrets but MUST NOT otherwise abridge the record"
scope: bytes OUTSIDE a matched shape are preserved exactly. Bytes a declared shape's own body class reaches ARE
absorbed into the redaction, bounded by the first non-body byte: trailing token characters after a GitHub token
(`ghp_XXXXXXfoo`, pre-existing), hyphen-joined text after a Slack token (`xoxb-…-not-part-of-token`, declared with
the Slack family) and underscore-joined text after a fine-grained PAT (`github_pat_<22>_<59>_prod`, declared with
that family — a MULTI-SEGMENT token must admit its separator or its trailing segment ships in the clear). All are
stated at reference/atlas-persist.md#persist-10a rather than claimed away.

### REQ-PERSIST-10b-a — never claim deterministic resume

source: INV-PERSIST-10b @ reference/atlas-persist.md#persist-10b
If a seat re-invocation is offered, then the persistence layer shall not claim a deterministic resume from where the agent stopped.
normative-clause: "\"resume the agent from exactly where it stopped\" is **NOT deliverable** and MUST NOT be claimed"

### REQ-PERSIST-10b-b — idempotent redispatch of the seat

source: INV-PERSIST-10b @ reference/atlas-persist.md#persist-10b
When a seat is re-invoked, the persistence layer shall perform an idempotent redispatch of the seat, mapping the same brief to the same seat.
normative-clause: "**(a) idempotent redispatch of the seat** (same brief → same seat, A-18)"

### REQ-PERSIST-10b-c — faithful replay of the transcript

source: INV-PERSIST-10b @ reference/atlas-persist.md#persist-10b
When a seat is re-invoked, the persistence layer shall perform a faithful replay of the recorded transcript.
normative-clause: "(b) faithful replay of the recorded transcript"

### REQ-PERSIST-10b-d — re-invoke substrate is a Checkpoint

source: INV-PERSIST-10b @ reference/atlas-persist.md#persist-10b
The persistence layer shall make the re-invoke substrate a structured Checkpoint distinct from the full raw transcript.
normative-clause: "The re-invoke substrate is a **structured `Checkpoint`** (recorded LLM outputs + tool I/O + seat brief), **distinct** from the full raw transcript"

### REQ-PERSIST-11-a — merge never line-merges the log

source: INV-PERSIST-11 @ reference/atlas-persist.md#persist-11
If two branches are merged, then the persistence layer shall not line-merge the log.
normative-clause: "Merging two branches MUST NOT line-merge the log"

### REQ-PERSIST-11-b — driver unions by content-hash and re-folds

source: INV-PERSIST-11 @ reference/atlas-persist.md#persist-11
When git merges the atlas-log path, the merge driver shall union the two event sets by content-hash and re-fold.
normative-clause: "A registered git **merge driver** (`.gitattributes: <atlas-log> merge=orchestra-atlas`) MUST **union the two event sets by content-hash and re-fold** (KERNEL-9/11)"

### REQ-PERSIST-11-c — colliding seq is never a conflict

source: INV-PERSIST-11 @ reference/atlas-persist.md#persist-11
If positional seq collides across the merged branches, then the persistence layer shall not surface it as a conflict.
normative-clause: "Colliding positional `seq` MUST NOT surface as a conflict"

### REQ-PERSIST-11-d — shared nodeKey resolves by fold-merge

source: INV-PERSIST-11 @ reference/atlas-persist.md#persist-11
When a nodeKey is written on both branches, the persistence layer shall resolve it by the deterministic fold-merge.
normative-clause: "a `nodeKey` written on both branches MUST resolve by the deterministic fold-merge (KERNEL-10), never by hand"

### REQ-PERSIST-11-e — merge is direction-independent

source: INV-PERSIST-11 @ reference/atlas-persist.md#persist-11
When two branches are merged, the persistence layer shall produce a byte-identical merged Atlas regardless of merge direction.
normative-clause: "The merged Atlas MUST be byte-identical regardless of merge direction (ours/theirs)"

### REQ-PERSIST-11-f — merge driver self-installing

source: INV-PERSIST-11 @ reference/atlas-persist.md#persist-11
When a repository is initialized or cloned, the setup hook shall register merge=orchestra-atlas and the .gitattributes entry.
normative-clause: "it MUST be **self-installing** — a setup hook (on init/clone) MUST register `merge=orchestra-atlas` + the `.gitattributes` entry"

### REQ-PERSIST-11-g — bypassed driver loses no event

source: INV-PERSIST-11 @ reference/atlas-persist.md#persist-11
If a plain default 3-way text merge is applied to the log path while the driver is bypassed, then the persistence layer shall lose or corrupt no event.
normative-clause: "its on-disk form MUST be an **append-only union** that a plain default 3-way text merge cannot corrupt, so an un-configured clone whose merge silently bypasses the driver can never lose or corrupt an event"

### REQ-PERSIST-12-a — rebase leaves AtlasState byte-identical

source: INV-PERSIST-12 @ reference/atlas-persist.md#persist-12
When a rebase or cherry-pick reorders or re-parents commits, the persistence layer shall leave AtlasState byte-identical.
normative-clause: "a rebase or cherry-pick that reorders or re-parents commits MUST leave `AtlasState` byte-identical"

### REQ-PERSIST-12-b — rewind holds on non-linear history

source: INV-PERSIST-12 @ reference/atlas-persist.md#persist-12
When a PR is rewound on non-linear history, the persistence layer shall rewind Atlas correspondingly.
normative-clause: "\"Rewind a PR ⇒ Atlas rewinds\" MUST therefore hold on **non-linear** history (branch/merge/rebase), not only a linear log"

### REQ-PERSIST-13-a — clone-required datum lives in a trailer

source: INV-PERSIST-13 @ reference/atlas-persist.md#persist-13
The persistence layer shall store in a commit trailer any datum that must be present in any clone.
normative-clause: "any datum that MUST be present in any clone MUST live in a **commit trailer**"

### REQ-PERSIST-13-b — trailer survives a history rewrite

source: INV-PERSIST-13 @ reference/atlas-persist.md#persist-13
When a history rewrite occurs, the persistence layer shall carry trailer data onto the new commit SHA.
normative-clause: "it travels inside the commit object itself and survives history rewrites onto the new SHA"

### REQ-PERSIST-13-c — notes present only once refspec configured

source: INV-PERSIST-13 @ reference/atlas-persist.md#persist-13
While the adapter has not configured the fetch/push refspec, the persistence layer shall keep note-carried data absent.
normative-clause: "present only once the adapter configures the fetch/push refspec (PERSIST-8)"

### REQ-PERSIST-13-d — a rewrite orphans note-carried data

source: INV-PERSIST-13 @ reference/atlas-persist.md#persist-13
If a rebase, squash, or cherry-pick rewrites a commit, then the persistence layer shall not carry its note-carried data across the rewrite.
normative-clause: "rebase/squash/cherry-pick **orphan** them (a note keys on the commit SHA)"

### REQ-PERSIST-14-a — version-delta partitioned by lifecycle

source: INV-PERSIST-14 @ reference/atlas-persist.md#persist-14
When `atlas-diff` compares the atlas across two versions `shaA` and `shaB`, the persistence layer shall partition the facts into added, edited, superseded, and decayed.
normative-clause: "`diff(shaA,shaB)` partitions facts into {added, edited, superseded, decayed}"

### REQ-PERSIST-14-b — delta is a fold-comparison, not a stored diff

source: INV-PERSIST-14 @ reference/atlas-persist.md#persist-14
When `diff(shaA,shaB)` runs, the persistence layer shall compute the delta by comparing the two folded AtlasStates.
normative-clause: "computed by comparing the two folded AtlasStates ... a read-only fold-diff computed over the event log, not a stored/materialized diff"

### REQ-PERSIST-14-c — every delta entry carries its provenance

source: INV-PERSIST-14 @ reference/atlas-persist.md#persist-14
If a delta entry lacks its provenance, then the persistence layer shall not include it in the delta.
normative-clause: "each entry carrying its provenance"

### REQ-PERSIST-14-d — diff is a pure read, zero mutation

source: INV-PERSIST-14 @ reference/atlas-persist.md#persist-14
If `diff(shaA,shaB)` is invoked, then the persistence layer shall not mutate any Atlas state.
normative-clause: "PURE READ (0 mutation)"

### REQ-PERSIST-14-e — diff is byte-identical across runs

source: INV-PERSIST-14 @ reference/atlas-persist.md#persist-14
If `diff(shaA,shaB)` is computed more than once on the same two shas, then the persistence layer shall not produce a differing delta.
normative-clause: "byte-identical across runs"

### REQ-PERSIST-14-f — diff is well-defined regardless of fold/event order

source: INV-PERSIST-14 @ reference/atlas-persist.md#persist-14
If the two AtlasStates were folded in different event or fold orders, then the persistence layer shall not produce a differing delta.
normative-clause: "well-defined regardless of fold/event order (PERSIST-2/12)"
