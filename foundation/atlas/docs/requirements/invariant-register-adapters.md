# S0 — Invariant Register · Campaign-9 (the productization ring)

> state: **S0** (design-freeze candidate) · consumes: `reference/atlas-adapters.md` · produces: `INV-<MODULE>-<n>`
> for the adapter/entrypoint ring · next: S1 (EARS), gated on DEFINE ratification + `freeze/adapters-v0`.
>
> **Brownfield lift.** Every INV below is enumerated from a frozen `reference/atlas-adapters.md` clause, verbatim
> — no behaviour invented. Modules: `ADAPTER` (the adapter-io ring), `WIRE`, `CLI`, `MCP` (disjoint families).

### INV-ADAPTER-1

behavioural: true
anchor: reference/atlas-adapters.md#adapt-fs-1
text: "the filesystem walker MUST produce the exact FileTree for a real repo path — paths, nesting, and leaf content — in a deterministic order, honoring the repo's ignore rules; it MUST NOT fabricate or omit a tracked file"
clauses: [ "produce the exact FileTree (paths, nesting, leaf content) for a real repo path", "in a deterministic order", "honoring the repo's ignore rules (.gitignore)", "MUST NOT fabricate or omit a tracked file" ]
unwanted: [ "a tracked file is omitted or a non-existent file is fabricated", "two walks of the same tree yield different order/content" ]
method-tag:

### INV-ADAPTER-2

behavioural: true
anchor: reference/atlas-adapters.md#adapt-scip-1
text: "the SCIP reader MUST parse a .scip index into the frozen ScipOutput (definition/reference occurrences only); a reference with no in-index definition MUST remain unresolved; the reader MUST NEVER synthesize a symbol or edge the .scip does not contain"
clauses: [ "parse a .scip protobuf into the frozen ScipOutput (definition/reference occurrences only)", "a reference with no in-index definition remains unresolved (downstream to:null)", "NEVER synthesize a symbol or edge not present in the .scip" ]
unwanted: [ "the reader resolves a reference that has no in-index definition", "the reader emits a symbol/occurrence absent from the .scip" ]
method-tag:

### INV-ADAPTER-3

behavioural: true
anchor: reference/atlas-adapters.md#adapt-scip-2
text: "for a repo spanning languages, the ring MUST run the correct per-language SCIP indexer and merge their .scip outputs; a language with no configured indexer MUST contribute its files to the FileTree only, and MUST NOT cause a fabricated or dropped edge for any other language"
clauses: [ "run the correct per-language SCIP indexer (IndexerPlan by LangId) and merge the .scip outputs", "a language with no configured indexer contributes its files to the FileTree only (an honest structural hole)", "an un-indexed language MUST NOT cause a fabricated or dropped edge for any other language" ]
unwanted: [ "an un-indexed language causes a fabricated or dropped edge for another language" ]
method-tag:

### INV-ADAPTER-4

behavioural: true
anchor: reference/atlas-adapters.md#adapt-ast-1
text: "the web-tree-sitter layer, when enabled, MUST fold sub-file structural units (item/block) into the FileTree spatial rail deterministically (same bytes ⇒ same units); with it absent the index is file-level and still valid"
clauses: [ "fold sub-file structural units (item/block) into the FileTree spatial rail", "deterministically — same bytes ⇒ same units", "additive: with it absent the index is file-level and still valid" ]
unwanted: [ "the same file bytes produce different sub-file units across runs" ]
method-tag:

### INV-ADAPTER-5

behavioural: true
anchor: reference/atlas-adapters.md#adapt-index-1
text: "the index-backing adapter MUST satisfy MoveInIndex and QueryIndex by driving @atlas/index build/resolve/coverage over the walker + SCIP outputs; it introduces no ranking or resolution of its own"
clauses: [ "satisfy MoveInIndex + QueryIndex by driving @atlas/index build/resolve/coverage over the walker+SCIP outputs", "introduce no ranking or resolution of its own" ]
unwanted: [ "the adapter computes its own ranking/resolution instead of delegating to @atlas/index" ]
method-tag:

### INV-ADAPTER-6

behavioural: true
anchor: reference/atlas-adapters.md#adapt-store-1
text: "the disk store MUST implement StoreApi over persistent storage such that an object put in one process is get-retrievable byte-identical in a later process; on read it MUST verify id(value)===key and treat a mismatch as absent"
clauses: [ "implement StoreApi (put→Hash, get→CasObject|undefined) over persistent storage", "an object put in process A is get-retrievable byte-identical in a later process B", "on read verify id(value)===key and treat a mismatch as absent (tamper-safe)" ]
unwanted: [ "an object put in an earlier process is not retrievable later", "a tampered on-disk value reads as present" ]
method-tag:

### INV-ADAPTER-7

behavioural: true
anchor: reference/atlas-adapters.md#adapt-store-2
text: "to make one governed dedup/supersede write land durably, writeDecision MUST be bound as: compute nodeKey(candidate), probe the durable store for the contentHash (D0) and nodeKey (D1) hits, call the existing routeWrite, apply upsert, and flush the projection through the store; it invents no new routing"
clauses: [ "bind the parked writeDecision(candidate,cfg) front-door", "compute nodeKey(candidate), probe the store for the contentHash (D0) and nodeKey (D1) hits, call routeWrite, apply upsert, flush the projection through the store", "invent no new routing (compose existing pieces only)" ]
unwanted: [ "a governed dedup write of the same fact lands twice", "the binding introduces routing logic not already in routeWrite/upsert" ]
method-tag:

### INV-ADAPTER-8

behavioural: true
anchor: reference/atlas-adapters.md#adapt-git-1
text: "HistorySource MUST be backed by real git log/blame/coupling over a rev, deterministic for a fixed rev; it feeds ranking only and MUST NEVER mint a fact"
clauses: [ "back HistorySource with real git log/blame/coupling over a rev", "deterministic for a fixed rev", "feeds ranking only and NEVER mints a fact" ]
unwanted: [ "the history miner mints a fact", "the signals differ across runs for a fixed rev" ]
method-tag:

### INV-ADAPTER-9

behavioural: true
anchor: reference/atlas-adapters.md#adapt-git-2
text: "DriftSource MUST compute drifted anchors across a git merge-base so atlas-reconcile can classify mechanical vs semantic"
clauses: [ "compute drifted anchors across a git merge-base", "feed atlas-reconcile's mechanical-vs-semantic classification (TOOLS-8 exitCode law unchanged)" ]
unwanted: [ "drift is computed against something other than the merge-base" ]
method-tag:

### INV-ADAPTER-10

behavioural: true
anchor: reference/atlas-adapters.md#adapt-git-3
text: "Forge MUST write the provenance trailer + a refs/notes/orchestra note + the PR projection onto a real host; a history rewrite MUST keep trailer data and orphan note-carried data exactly as PERSIST-_ specifies — the adapter changes none of that semantics, only executes it"
clauses: [ "write the provenance trailer + refs/notes/orchestra note + PR projection onto a real host", "a history rewrite keeps trailer data and orphans note-carried data (PERSIST-_ semantics unchanged)", "the adapter executes, never alters, the specified semantics" ]
unwanted: [ "a history rewrite loses trailer data", "the adapter changes the note-orphan / trailer-survival semantics" ]
method-tag:

### INV-ADAPTER-11

behavioural: true
anchor: reference/atlas-adapters.md#adapt-llm-1
text: "SiteProposer.propose MUST be the only place a model is invoked; it MUST make one bounded call per site, honor the cost/timeout budget, and return a candidate proposal that is never auto-trusted; the core stays $0-LLM"
clauses: [ "SiteProposer.propose is the ONLY place a model is invoked in the whole system", "one bounded call per site, honoring the cost/timeout budget", "returns a candidate never auto-trusted (the admission bar + ratification still gate it)", "the core stays $0-LLM (GEN S0/S1 determinism unaffected)" ]
unwanted: [ "a model is invoked outside this port", "a proposal is auto-trusted without the admission-bar/ratification gate", "more than one model call is made for a single site" ]
method-tag:

### INV-ADAPTER-12

behavioural: true
anchor: reference/atlas-adapters.md#adapt-store-3
text: "on a fresh process the store adapter MUST reconstruct the StoreProjection current-node map from the durable store such that a fact written and flushed in an earlier run is present byte-identical in the rehydrated projection; it reconstructs state only, minting nothing"
clauses: [ "on a fresh process reconstruct the StoreProjection current-node map from the durable store", "a fact written+flushed in an earlier run is present byte-identical in the rehydrated projection", "read-back is a separate obligation from the write (ADAPT-STORE-2); reconstruct state only, mint nothing" ]
unwanted: [ "a fresh process cannot see a fact flushed in an earlier run", "rehydration mints or alters a fact rather than reconstructing it" ]
method-tag:

### INV-WIRE-1

behavioural: true
anchor: reference/atlas-adapters.md#wire-1
text: "a single shared wire module MUST assemble the five-leg WiredHandler (incl. the atlas-link leg, WP-SAMEAS/ADR-0003); both entrypoints MUST consume THIS module, so CLI and MCP are contract-identical by construction, not by copy"
clauses: [ "one shared wire module assembles the five-leg handler over the adapters", "both CLI and MCP consume that same module", "CLI and MCP are contract-identical by construction, not by copy" ]
unwanted: [ "the CLI and the MCP server assemble the handler separately (risking divergence)" ]
method-tag:

### INV-CLI-1

behavioural: true
anchor: reference/atlas-adapters.md#cli-1
text: "atlas <cmd> MUST map each command to exactly one wired tool leg (plus mine driving genesis); argument parsing MUST be total — a malformed invocation yields a structured error + guidance and a non-zero exit, never a crash"
clauses: [ "map each command to exactly one wired tool leg (plus `mine` → genesis driver)", "argument parsing is total", "a malformed invocation yields a structured error + guidance + non-zero exit, never a crash" ]
unwanted: [ "a malformed invocation crashes the process instead of a structured error" ]
method-tag:

### INV-CLI-2

behavioural: true
anchor: reference/atlas-adapters.md#cli-2
text: "reads (query/reconcile/doctor) MUST resolve over the CLI directly; every write MUST funnel through a governed write door (atlas-emit / atlas-link, ADR-0003); a read command MUST carry no write authority"
clauses: [ "reads (query/reconcile/doctor) resolve over the CLI directly", "every write funnels through a governed write door (atlas-emit / atlas-link, CLI-floor)", "a read command carries no write authority" ]
unwanted: [ "a read command carries write authority", "a write bypasses a governed door" ]
method-tag:

### INV-CLI-3

behavioural: true
anchor: reference/atlas-adapters.md#cli-3
text: "the CLI MUST render a tool Verdict to stdout deterministically and set the exit code from the verdict (0 ok, non-zero on rejected/error), carrying the tool's guidance"
clauses: [ "render a tool Verdict to stdout deterministically", "set the exit code from the verdict (0 ok, non-zero on rejected/error)", "carry the tool's guidance (TOOLS-4)" ]
unwanted: [ "the render is non-deterministic", "the exit code does not reflect the verdict" ]
method-tag:

### INV-MCP-1

behavioural: true
anchor: reference/atlas-adapters.md#mcp-1
text: "the MCP stdio server MUST publish exactly the members of the closed Tool union (GOVERNANCE_SURFACE ∪ READ_SURFACE) with their input schemas, MUST route every call through the shared WiredHandler so an MCP call and the equivalent CLI call return contract-identical verdicts, and MUST derive the advertised and invocable sets from that one union such that they are equal (AMENDED ADR-0006 — was 'exactly the five governed tools'; the count was the mechanism, the parity is the property)"
clauses: [ "publish exactly the members of the closed Tool union with their input schemas", "route every call through the shared WiredHandler (WIRE-1)", "an MCP call and the equivalent CLI call return contract-identical verdicts (TOOLS-3)", "advertised and invocable are both DERIVED from the one union and are equal (ARCH-5)" ]
unwanted: [ "a tool outside the closed union is exposed over MCP", "an MCP call diverges from the equivalent CLI call", "the advertised set and the invocable set are maintained independently and drift apart" ]
method-tag:

### INV-MCP-2

behavioural: true
anchor: reference/atlas-adapters.md#mcp-2
text: "a tool error MUST surface as a structured rejected Verdict carried in the MCP result; the server MUST NOT crash or drop the fail-closed verdict"
clauses: [ "a tool error surfaces as a structured rejected Verdict in the MCP result", "the server does not crash or drop the fail-closed verdict (TOOLS-2 across the transport)" ]
unwanted: [ "a tool error crashes the server", "the fail-closed verdict is dropped (empty/ok result on error)" ]
method-tag:

### INV-CLI-7

behavioural: true
anchor: reference/atlas-adapters.md#cli-7
text: "atlas promote MUST carry STAGED candidates into governed knowledge through the EXISTING atlas-emit door (no new governed tool, no second write medium — GOVERNANCE_SURFACE and WRITE_PATHS unchanged); every staged candidate MUST face FULL ratification under a context the DOOR derived, never one the payload chose and never a store-state verdict asserted falsely; a refusal MUST be per-row; the count reported MUST be what SETTLED durably; a staging read that refuses MUST NOT degrade to 0 candidates"
clauses: [ "promote publishes only through the existing atlas-emit governed write door (ADR-0008)", "every promoted candidate takes full ratification, under a door-DERIVED context (ARCH-9)", "the derivation is expressed as a true field, never by forging contested/lowRisk", "one unpromotable candidate is that row's refusal, never the batch's", "the reported count is SETTLED, never attempted", "a refused staging read is reported as a refusal, never as 0 candidates" ]
unwanted: [ "a sixth governed tool or a third write door is minted for promotion", "a staged candidate auto-accepts and reaches the store with no ratifier consulted", "the promotion route is obtained by declaring the candidate contested or not-low-risk", "one bad staged row ends the pass", "the pass reports rows it attempted rather than rows that settled", "an unreadable staging sidecar is rendered as an empty one" ]
method-tag:

### INV-CLI-4

behavioural: true
anchor: reference/atlas-adapters.md#cli-4
text: "atlas mine MUST drive the already-frozen genesis run-controller as a single governed pass over a real repo, minting candidate-only writes (never ratified); the mine driver composes the frozen parts and invents no admission of its own"
clauses: [ "drive the already-frozen genesis run-controller as one governed pass over a real repo", "mint candidate-only writes, never ratified (ratification stays human/T0)", "compose the frozen parts; invent no admission of its own" ]
unwanted: [ "the mine driver mints a ratified (non-candidate) fact", "the mine driver adds admission/routing logic beyond composing the frozen run-controller" ]
method-tag:

> _(INV-CLI-4 is **ring-scoped composition only**: the internal `scan→rank→extract→admit→align→seed` stages and
> their laws are GEN's own frozen invariants, not restated here. This INV lifts only the CLI-4 obligation — the
> `mine` driver wires the frozen run-controller and invents no admission. It closes the S0 Gate-1 capture-hole below.)_

---

## [NEEDS RECONCILIATION] (→ DEFINE seat = owner)

**None block the S0 freeze.** Re-examined against the S0 rule (a gap blocks only when it leaves an _invariant_
unspecified): the items below are **deferred implementation-DEFINEs** — the invariant is fully specified and
freezable now; only its _backing choice_ is owner's, and is due at the phase that builds it. Recorded here so
the phase can't start without the ruling:

- **D4 — disk-CAS on-disk layout** (backs INV-ADAPTER-6, due Phase-1): proposed default `.atlas/cas/` sharded
  `<h[0:2]>/<h>`. The invariant (durable · cross-process · tamper-safe) freezes without pinning the path.
- **D5 — the LLM** (backs INV-ADAPTER-11, due Phase-2): model + the `SiteProposer` prompt contract. The
  invariant (one bounded, non-authoritative call) freezes without pinning the model.
- **D6 — the forge host** (backs INV-ADAPTER-10, due Phase-3): proposed default GitHub-via-`gh` first + a
  generic git-notes fallback. The invariant (trailer+note+PR, rewrite-honest) freezes without pinning the host.

**One genuine reconciliation (design⇄code contradiction), non-blocking, must be closed when ADAPT-SCIP lands:**

- **DRIFT — stale MECHANISMS registry:** `genesis/rank.ts:82` `MECHANISMS.scan` still lists `'stack-graphs'`,
  which D1 dropped. Reconcile to `['tree-sitter', 'SCIP']` in the ADAPT-SCIP WP. This is a stale **code constant**
  (not a comment): non-freeze-blocking _today_ because nothing consumes it to select an indexer — but if the
  ADAPT-SCIP WP wires it to indexer dispatch, dropping `'stack-graphs'` becomes a **behaviour** fix, not cosmetics.

## Gate-1 capture (unclaimed design elements)

- **CLOSED** — two former capture-holes now claimed: (1) the `atlas mine` composition by **INV-CLI-4**, lifted
  from the frozen `genesis` run-controller; (2) the **session-projection rehydrate / read-back from disk** by
  **INV-ADAPTER-12** (ADAPT-STORE-3), the write's separate obligation — surfaced by the S0 cold-review. No
  unclaimed design element remains: every adapter, entrypoint, input (repo-path · scope · node · mergeBase),
  output (FileTree · ScipOutput · Verdict), seam (the frozen ports), store direction (write **and** read-back),
  and failure mode (malformed-args · tamper · un-indexed-lang · rewrite) is claimed by an INV above.
  **Capture-complete.**

## Completion report

- register: `docs/requirements/invariant-register-adapters.md`
- counts: **19 behavioural · 0 exempt** (every clause constrains observable behaviour; none is a pure definition).
- open freeze-blockers: **0** — the D4/D5/D6 impl-DEFINEs are phase-deferred (invariants freeze without them);
  the MECHANISMS drift is a non-blocking code-fix scheduled into the ADAPT-SCIP WP.
- Gate-1 capture: **complete** (INV-CLI-4 + INV-ADAPTER-12 closed both holes).
- cold-review (independent, lucy): **APPROVE-WITH-FIXES** → all three fixes applied at root: added INV-ADAPTER-12
  (freeze-blocker: rehydrate obligation) + new constitution clause ADAPT-STORE-3; re-anchored & narrowed INV-CLI-4
  to a ring-scoped composition clause (new CLI-4); relabelled the MECHANISMS drift as a stale code constant.
- **STATUS: S0 freeze-READY, pending owner (DEFINE seat) sign-off.** On sign-off → tag `freeze/adapters-v0`;
  S1 (EARS) may begin.

## CAMPAIGN-11 — the MEMORY RING (brownfield lift, 2026-08-30)

> Family **MEMRING**, disjoint from the package's own `MEM-1..13` — those are `@atlas/memory`'s
> invariants; these are the RING's. Every row lifts one clause of `reference/atlas-adapters.md`
> §Memory adapters verbatim.

### INV-MEMRING-1

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-1
text: "the memory ring MUST: append-only and content-keyed, one record per line; a record appended in one process is readable byte-identical in a later process; NEVER rewrite, truncate or reorder an existing line; a line whose id is not its own content hash is refused on read AND counted. It MUST NOT permit: a torn or hand-edited line is folded in as a record; an unreadable log is reported as an empty store."
clauses: [ "append-only and content-keyed, one record per line", "a record appended in one process is readable byte-identical in a later process", "NEVER rewrite, truncate or reorder an existing line", "a line whose id is not its own content hash is refused on read AND counted" ]
unwanted: [ "a torn or hand-edited line is folded in as a record", "an unreadable log is reported as an empty store" ]
method-tag: reference-model

### INV-MEMRING-2

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-2
text: "the memory ring MUST: two processes appending concurrently both land; the fold contains every record either writer wrote. It MUST NOT permit: a concurrent append silently overwrites another writer's record."
clauses: [ "two processes appending concurrently both land", "the fold contains every record either writer wrote" ]
unwanted: [ "a concurrent append silently overwrites another writer's record" ]
method-tag: reference-model

### INV-MEMRING-3

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-3
text: "the memory ring MUST: admitted to git (the log travels); survives a plain text merge with 0 records lost and 0 spliced; a duplicated line dedups by content id on the fold. It MUST NOT permit: a branch merge loses a record; a merge splices two records into one."
clauses: [ "admitted to git (the log travels)", "survives a plain text merge with 0 records lost and 0 spliced", "a duplicated line dedups by content id on the fold" ]
unwanted: [ "a branch merge loses a record", "a merge splices two records into one" ]
method-tag: reference-model

### INV-MEMRING-4

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-4
text: "the memory ring MUST: the gates run in the stated ORDER; each refusal is a structured verdict NAMING the gate; the door authors no policy of its own. It MUST NOT permit: a record reaches disk having skipped a gate; a refusal escapes as a thrown exception a caller can swallow."
clauses: [ "the gates run in the stated ORDER", "each refusal is a structured verdict NAMING the gate", "the door authors no policy of its own" ]
unwanted: [ "a record reaches disk having skipped a gate", "a refusal escapes as a thrown exception a caller can swallow" ]
method-tag: exhaustive

### INV-MEMRING-5

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-5
text: "the memory ring MUST: the template is selected from the entry's SHAPE; no caller-supplied argument selects it; no-match and multi-match are BOTH refused, never guessed. It MUST NOT permit: a caller files a payload under a template that judges it more leniently; an ambiguous shape is filed under the first matching template."
clauses: [ "the template is selected from the entry's SHAPE", "no caller-supplied argument selects it", "no-match and multi-match are BOTH refused, never guessed" ]
unwanted: [ "a caller files a payload under a template that judges it more leniently", "an ambiguous shape is filed under the first matching template" ]
method-tag: reference-model

### INV-MEMRING-6

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-6
text: "the memory ring MUST: owner = the composition root's resolved actor; no transport flag sets it; an empty owner is refused fail-closed. It MUST NOT permit: a caller sets the owner of a record they write; an unowned record is written and then injected to every empty-actor caller."
clauses: [ "owner = the composition root's resolved actor", "no transport flag sets it", "an empty owner is refused fail-closed" ]
unwanted: [ "a caller sets the owner of a record they write", "an unowned record is written and then injected to every empty-actor caller" ]
method-tag: reference-model

### INV-MEMRING-7

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-7
text: "the memory ring MUST: binds a NAMED binary actually present on PATH; no scanner available means the write is REFUSED; never redacted-and-continued. It MUST NOT permit: a write lands with no scanner having run; a clean record is refused because the invocation is wrong; a secret-carrying record is admitted because the invocation always exits clean."
clauses: [ "binds a NAMED binary actually present on PATH", "no scanner available means the write is REFUSED", "never redacted-and-continued" ]
unwanted: [ "a write lands with no scanner having run", "a clean record is refused because the invocation is wrong", "a secret-carrying record is admitted because the invocation always exits clean" ]
method-tag: reference-model

### INV-MEMRING-8

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-8
text: "the memory ring MUST: only the calling actor's own records — zero cross-seat; task, pr and logbook NEVER ride the header; they return ONLY via an explicit recall. It MUST NOT permit: another seat's record appears in a header; a consultable kind auto-injects on a running turn; an unqualified read returns a general dump."
clauses: [ "only the calling actor's own records — zero cross-seat", "task, pr and logbook NEVER ride the header", "they return ONLY via an explicit recall" ]
unwanted: [ "another seat's record appears in a header", "a consultable kind auto-injects on a running turn", "an unqualified read returns a general dump" ]
method-tag: reference-model

### INV-MEMRING-9

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-9
text: "the memory ring MUST: the injected set is the top-N by effective frecency, descending; a decayed entry is evicted even when slots are free; an evicted entry remains re-spawnable — nothing dies; decay advances with the LOG's own head, never wall-clock. It MUST NOT permit: a system-clock jump changes the injected set with no new log entries; an evicted rule is unrecoverable; a low-frecency entry is injected because slots happened to be free."
clauses: [ "the injected set is the top-N by effective frecency, descending", "a decayed entry is evicted even when slots are free", "an evicted entry remains re-spawnable — nothing dies", "decay advances with the LOG's own head, never wall-clock" ]
unwanted: [ "a system-clock jump changes the injected set with no new log entries", "an evicted rule is unrecoverable", "a low-frecency entry is injected because slots happened to be free" ]
method-tag: reference-model

### INV-MEMRING-10

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-10
text: "the memory ring MUST: assembled from real sources; an absent source renders the labeled UN-SEEDED sentinel; never filled with invented text. It MUST NOT permit: an absent facet is rendered as plausible prose; a slab is served without its grounding."
clauses: [ "assembled from real sources", "an absent source renders the labeled UN-SEEDED sentinel", "never filled with invented text" ]
unwanted: [ "an absent facet is rendered as plausible prose", "a slab is served without its grounding" ]
method-tag: reference-model

### INV-MEMRING-11

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-11
text: "the memory ring MUST: an identical call yields a byte-identical Verdict on both transports; a refusal carries the same named reason on both. It MUST NOT permit: the two transports disagree on an admission; a refusal reads differently over MCP than on the CLI."
clauses: [ "an identical call yields a byte-identical Verdict on both transports", "a refusal carries the same named reason on both" ]
unwanted: [ "the two transports disagree on an admission", "a refusal reads differently over MCP than on the CLI" ]
method-tag: reference-model

### INV-MEMRING-12

behavioural: true
anchor: reference/atlas-adapters.md#adapt-mem-12
text: "the memory ring MUST: every shipped memory command has a reference page; every shipped memory command has a README table row; neither names a command that does not ship. It MUST NOT permit: a shipped command is absent from the README table; the README table advertises a command that does not run."
clauses: [ "every shipped memory command has a reference page", "every shipped memory command has a README table row", "neither names a command that does not ship" ]
unwanted: [ "a shipped command is absent from the README table", "the README table advertises a command that does not run" ]
method-tag: exhaustive
