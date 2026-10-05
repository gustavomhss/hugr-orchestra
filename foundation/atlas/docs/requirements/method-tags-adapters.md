# Method-tags — Block ADAPTERS (Campaign-9 productization ring) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../method/prompts/S2.md) ·
> **axiom:** S1 frozen (`requirements-adapters.md`; 55 REQs, every behavioural INV has ≥1 REQ, atom-gate
> APPROVE) · **owner:** charlie (FORGE); method-decision cold-reviewed by bobby (BLUEPRINT).
>
> One tag per **behavioural** INV by the 3-conjunct rule. **The ring carries ZERO `formal` tags** — the one
> `formal` cluster in the whole Atlas is the kernel merge (`FSPEC-merge`, KERNEL-9/10/11) in the core, already
> discharged. The adapters are the IO/network boundary: they are verified by **conformance against a recorded
> fixture** (`reference-model`); where the state space is finite, by enumeration (`exhaustive`); and for the one
> algebraic law the ring itself composes — durable dedup/supersede idempotence (ADAPTER-7) — by property
> (`PBT`). This is the ratified baseline for an adapter ring — not a compromise. All 19 INVs are `behavioural`,
> so none carries `n/a`.
>
> **Why no `formal` here (the 3-conjunct test, written not asserted):** a `formal` tag needs all three of
> {high-consequence+hard-recover ∧ combinatorial-state-tests-can't-cover ∧ cheap-to-keep-alive}. Every ring
> invariant fails the **second** conjunct: its state space is a finite fixture (a repo tree, a `.scip` file, a
> git sandbox, a verdict set), which a recorded conformance test covers exhaustively — there is no unbounded
> interleaving to model. The convergence/merge algebra that _does_ need a model lives one layer down and is
> already `formal` in the core. Modelling an adapter formally would burn budget on IO plumbing a fixture catches.

---

### INV-ADAPTER-1

method-tag: reference-model
fspec: —
up-property: "faithful walk: the walker's FileTree for a fixture repo equals the reference tree (paths·nesting·leaf content), honors .gitignore, is byte-identical across two walks, and contains exactly the tracked set — 0 phantom, 0 missing"
down-model: "a reference walker over a committed fixture repo (with a .gitignore) is the oracle; assert deepEqual(walk(repo), referenceTree) ∧ walk(repo)≡walk(repo) ∧ ignored paths absent ∧ tracked set fully present"
anti-rot: the fixture repo + its reference FileTree golden are the mock; a walker that reorders, drops, or invents a path diverges from the golden and breaks the build.

### INV-ADAPTER-2

method-tag: reference-model
fspec: —
up-property: "SCIP read fidelity: parsing a recorded .scip yields exactly its definition/reference occurrences; a reference with no in-index definition stays to:null; 0 symbols/edges appear that the .scip does not contain"
down-model: "a recorded .scip protobuf fixture is the oracle; assert the reader's ScipOutput == the fixture's occurrence set, a known-dangling reference resolves to:null, and every emitted symbol is present in the fixture"
anti-rot: the .scip fixture corpus is the mock; a reader that synthesizes a symbol/edge or resolves a dangling ref fails the corpus equality.

### INV-ADAPTER-3

method-tag: reference-model
fspec: —
up-property: "multi-language honesty: for a two-language fixture (one indexed, one with no configured indexer), the merged output carries the indexed language's edges, contributes the un-indexed language's files to the FileTree only, and drops/fabricates 0 edges for either language"
down-model: "a mixed-language fixture repo + its expected merged index is the oracle; FIRST enumerate the finite LangId → {configured indexer | honest-hole} dispatch table and assert it is total (every LangId routes to exactly one of the two, no unhandled language); THEN assert the un-indexed language yields FileTree entries with no edges, the indexed language's edges are intact, and no cross-language edge is fabricated or dropped"
anti-rot: the mixed-language fixture + expected-merge golden is the mock; a new LangId with no dispatch entry fails the totality assertion, and a cross-language edge fabrication/drop fails the merge-honesty golden.

### INV-ADAPTER-4

method-tag: reference-model
fspec: —
up-property: "deterministic additive units: with the web-tree-sitter layer enabled, the same file bytes fold to identical sub-file units every run; with it disabled, the file-level index is still valid — 0 non-determinism, 0 invalidation"
down-model: "a source fixture is folded twice with the AST layer on (assert identical units) and once with it off (assert a valid file-level tree); the reference fold is the oracle"
anti-rot: the source fixture + its expected unit set is the mock; a non-deterministic fold (same bytes ⇒ different units) fails the byte-identity assertion.

### INV-ADAPTER-5

method-tag: reference-model
fspec: —
up-property: "pure delegation: MoveInIndex/QueryIndex outputs equal @atlas/index build/resolve/coverage over the same walker+SCIP inputs; the adapter computes 0 ranking or resolution of its own"
down-model: "@atlas/index is the oracle; drive the adapter and @atlas/index over one fixture and assert equal outputs; a call-spy on @atlas/index asserts every resolution/ranking result originates there, not in the adapter"
anti-rot: the @atlas/index reference + the call-spy are the mock; an adapter that shortcuts a local ranking diverges from @atlas/index and trips the spy.

### INV-ADAPTER-6

method-tag: reference-model
fspec: —
up-property: "durable content-addressing: an object put+flushed in process A is get-retrievable byte-identical in a fresh process B; a value whose id(value)≠key reads as absent — 0 lost objects, 0 tampered reads served"
down-model: "the kernel StoreApi is the oracle; a disk-store conformance test does put→(new process)→get and asserts byte-identity, then corrupts an on-disk value and asserts get→undefined"
anti-rot: the in-memory StoreApi reference (kernel) is the mock reused in the disk-store unit tests; a disk store that serves a tampered value or loses an object diverges from it.

### INV-ADAPTER-7

method-tag: PBT
fspec: —
up-property: "idempotent governed write over the DURABLE store: ∀ fact, write∘write ≡ write (exactly one landing, the second a no-op once the probe sees the flushed prior); ∀ fact + superseder, across BOTH delivery orders, an identical single head with the supersedes-pointer recorded — 0 double-lands, order-independent; and the binding composes nodeKey→probe→routeWrite→upsert→flush, introducing 0 new routing"
down-model: "PBT over the durable store (the NEW obligation the adapter composes, NOT inherited from the core fold): quantify the idempotence law (two writes of any generated fact ⇒ one landing) and the supersede-ordering law (a fact + its superseder in either arrival order ⇒ identical single head + recorded pointer); PLUS a reference-model equality arm — the existing routeWrite/upsert is the oracle, assert the bound decision == routeWrite's on the same inputs (the binding adds no path)"
anti-rot: the routeWrite/upsert reference is the mock for the equality arm; the PBT generator (arbitrary facts × supersede pairs × delivery order) is the property oracle — a flush-ordering bug that lets the probe miss a durable prior write (a bug a single-fact golden silently passes) fails the idempotence property and breaks the build.

### INV-ADAPTER-8

method-tag: reference-model
fspec: —
up-property: "deterministic non-minting history: over a git-sandbox pinned at a fixed rev, HistorySource yields identical log/blame/coupling signals every run and mints 0 facts (feeds ranking only)"
down-model: "a pinned git-sandbox fixture is the oracle; assert the signals are byte-identical across two runs at the fixed rev, and a write-spy on the fact store asserts 0 facts minted during ranking"
anti-rot: the pinned git-sandbox + the write-spy are the mock; a history miner that mints a fact or varies across runs fails the spy/identity assertions.

### INV-ADAPTER-9

method-tag: reference-model
fspec: —
up-property: "drift over merge-base: for a git-sandbox where a cited file changed on one side, DriftSource's drifted-anchor set equals the merge-base diff, feeding the mechanical-vs-semantic classification (TOOLS-8 exitCode law unchanged)"
down-model: "a git-sandbox with a known merge-base + a known drift is the oracle; assert DriftSource's anchors == the merge-base-computed drift set (not a two-tip diff)"
anti-rot: the git-sandbox fixture + its expected drift set is the mock; drift computed against anything other than the merge-base diverges from the golden.

### INV-ADAPTER-10

method-tag: reference-model
fspec: —
up-property: "rewrite-honest forge: the forge writes trailer + refs/notes/orchestra note + PR projection onto a git-sandbox host; after a history rewrite the trailer data survives and note-carried data is orphaned exactly as PERSIST-_ specifies — the adapter changes 0 of that semantics"
down-model: "the PERSIST host-adapter semantics are the oracle; on a git-sandbox host, write the atlas, rewrite history, and assert trailer survival + note-orphaning match PERSIST-_'s expected outcome"
anti-rot: the PERSIST host-adapter reference is the mock; a forge that loses trailer data on rewrite or alters the orphan semantics diverges from it.

### INV-ADAPTER-11

method-tag: reference-model
fspec: —
up-property: "the single bounded non-authoritative model call: a model is invoked only via SiteProposer.propose, exactly once per site within the cost/timeout budget, returning a candidate that the admission bar + ratification still gate — 0 out-of-band model calls, 0 auto-trusted proposals, ≤1 call/site"
down-model: "a recorded/spy SiteProposer is the oracle (no live model in CI); a call-counter asserts exactly one propose() per site, a budget stub asserts the cost/timeout cap, and the admission path asserts the proposal enters as a candidate (never ratified without the gate)"
anti-rot: the spy proposer is the mock reused across genesis tests; a second model entry point, a >1-call/site path, or an auto-trust bypass fails the counter/admission assertions.

### INV-ADAPTER-12

method-tag: reference-model
fspec: —
up-property: "faithful rehydrate: a fresh process reconstructs the StoreProjection current-node map from disk such that a fact written+flushed in an earlier run is present byte-identical, and rehydration mints/alters 0 facts (reconstruct-only)"
down-model: "write+flush in run A, then a fresh reference store rehydrates in run B; assert the run-A fact is present byte-identical in the reconstructed current-node map, and a write-spy asserts 0 mint/alter during rehydration"
anti-rot: the StoreProjection reference (kernel) + the write-spy are the mock; a rehydrate that misses a flushed fact or mints during reconstruction diverges from it.

### INV-WIRE-1

method-tag: reference-model
fspec: —
up-property: "by-construction parity: a single wire module assembles the five-leg WiredHandler once; both entrypoints consume THAT module, so for every tool call the CLI verdict and the MCP verdict are byte-identical — 0 divergence, by construction not by copy"
down-model: "the shared WiredHandler is the oracle; a parity test drives a fixture set of tool calls through both the CLI adapter and the MCP adapter and asserts deepEqual(cliVerdict, mcpVerdict) for each"
anti-rot: the shared wire module is the mock both entrypoints import; a second, separately-assembled handler in either entrypoint diverges under the parity fixture set.

### INV-CLI-1

method-tag: exhaustive
fspec: —
up-property: "total command routing: each command maps to exactly one wired tool leg (plus mine→genesis) — existence + uniqueness over the finite command set; a malformed invocation yields a structured error + guidance + non-zero exit and never crashes (0 uncaught throws)"
down-model: "enumerate the finite command surface and assert a total, mutually-exclusive command→leg map; a PBT-fuzz arm over malformed argv asserts every input returns a structured error (never a throw), discharging the totality clause the finite enumeration cannot reach"
anti-rot: the command→leg table is the enumerated oracle; a new command with no leg, a command bound to two legs, or a crashing parse path fails the existence/uniqueness/no-throw assertions.

### INV-CLI-2

method-tag: exhaustive
fspec: —
up-property: "read/write authority partition: over the finite command set, every read (query/reconcile/doctor) resolves with 0 write authority and every write funnels through the single door atlas-emit — total and mutually exclusive"
down-model: "enumerate the command × authority matrix and assert each command is exactly one of {read with no write capability, write via atlas-emit}; assert no command both reads and carries write authority"
anti-rot: the command-authority matrix is the enumerated oracle; a read command granted write authority, or a write bypassing atlas-emit, fails the partition assertion.

### INV-CLI-3

method-tag: reference-model
fspec: —
up-property: "deterministic verdict render: the CLI renders a Verdict to stdout byte-identically across runs, sets the exit code from the verdict (0 ok / non-zero on rejected/error), and carries the tool's guidance — 0 render drift, exit code always reflects the verdict"
down-model: "a reference renderer over a fixture set of Verdicts is the oracle; assert render(v)≡render(v) (byte-identity), exitCode==f(v.status) for each, and guidance present in the output"
anti-rot: the reference renderer + the Verdict fixture set is the mock; a non-deterministic render or an exit code that ignores the verdict diverges from the golden.

### INV-CLI-4

method-tag: reference-model
fspec: —
up-property: "mine composes, admits nothing: atlas mine drives the already-frozen genesis run-controller as one governed pass over a fixture repo, and every write is candidate-only (never ratified); the driver adds 0 admission of its own"
down-model: "the frozen genesis run-controller is the oracle; run mine over a fixture repo with a recorded proposer and assert the produced write-set equals the run-controller's, and every write carries candidate (not ratified) status"
anti-rot: the frozen run-controller + recorded proposer is the mock; a mine driver that ratifies a fact or diverges from the run-controller's output fails the equality/candidate assertions.

### INV-CLI-7

method-tag: exhaustive
fspec: —
up-property: "promote curates through the existing door: every staged candidate atlas promote makes durable was published through the atlas-emit governed write door and faced FULL ratification (no candidate auto-accepts); GOVERNANCE_SURFACE and WRITE_PATHS are unchanged; the count reported equals the number of rows the projection actually gained; one unpromotable row is refused by name and the pass continues; a refused staging read is never reported as an empty staging"
down-model: "drive the real promotion door over a seeded staging sidecar and a real governed emit leg: assert the tokenless pass promotes 0 (route == full-ratify) while an authored leg over the SAME candidate auto-accepts; assert promoted == the count of rows the projection gained; assert a bytes-missing row and a degenerate-anchor row are each that row's named refusal with the batch continuing; assert a refused commitStaging yields read:false, never candidates:0; assert the CLI COMMAND_LEG binds promote to a member of the frozen WRITE_PATHS"
anti-rot: the frozen WRITE_PATHS constant + the real governed emit door are the oracles; a promotion routed by forging contested/lowRisk fails the ratify-context equality, a promotion that fast-paths fails the tokenless-refusal case, and a sixth tool fails the WRITE_PATHS-derived partition.

### INV-MCP-1

method-tag: exhaustive
fspec: —
up-property: "the published set is the closed Tool union (amended ADR-0006): the MCP server publishes exactly the members of GOVERNANCE_SURFACE ∪ READ_SURFACE with their input schemas and nothing outside that union; the advertised set and the invocable set are both DERIVED from the one union and are equal; every call routes through the shared WiredHandler so an MCP verdict equals the equivalent CLI verdict — existence + uniqueness over the closed union (the count was the mechanism available when there were five legs; the CLI≡MCP parity through the one handler is the property)"
down-model: "enumerate the published tool set and assert set-equality with the closed Tool union (GOVERNANCE_SURFACE ∪ READ_SURFACE — which enumerates to {atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link} today, ADR-0003, READ_SURFACE being empty until CAMPAIGN-10.3) with schemas; assert the advertised set equals the set of tokens the handler will dispatch; assert each call dispatches through the shared WiredHandler (WIRE-1 parity oracle); no tool outside the union registered or invocable"
anti-rot: the closed Tool union + the shared handler is the enumerated oracle; a published tool outside the union, an advertised-vs-invocable divergence, or a call bypassing the WiredHandler fails the set-equality/routing assertions.

### INV-MCP-2

method-tag: reference-model
fspec: —
up-property: "fail-closed transport: a tool error surfaces as a structured rejected Verdict carried in the MCP result; the server neither crashes nor drops the fail-closed verdict — 0 empty/ok results on error, 0 transport crashes"
down-model: "a fault-injecting reference transport is the oracle; drive a tool stub that throws and assert the MCP result carries a structured rejected Verdict (isError set, verdict present), the server stays up, and no empty/ok result is emitted"
anti-rot: the fault-injection harness + the reference transport is the mock; a transport that crashes on tool error or returns an empty/ok result drops the fail-closed verdict and fails the assertion.

---

## Refuse-to-model

- **the external toolchains themselves** (per-language SCIP indexers, web-tree-sitter WASM, git's own algorithms, the LLM): black-box adversaries. We conformance-test _our reader/adapter_ against a **recorded fixture** (a committed `.scip`, a git sandbox, a source tree), never the tool's internals. A verified adapter is not a verified indexer.
- **the live LLM**: never in CI. The only model entry (ADAPTER-11) is exercised by a **recorded/spy proposer** — deterministic, `$0`, no network. Live-model behaviour (quality, latency, non-determinism) has no correctness oracle and is out of scope.
- **the real network / forge host** (e.g. the GitHub API): black-box. The forge (ADAPTER-10) is tested against a **local git sandbox**, not the live host; host availability/rate-limits are operational, not modeled.
- **performance / real indexer + walk latency**: covered by load tests; there is no correctness oracle to model. Adapter speed is a footprint concern, not a truth concern.
- **the code itself**: conformance-tested (sampled) against the reference model — "success = we could not find a divergence." A verified design is not a verified impl; confidence is bought with fixture coverage + mutation-probes, not a proof claim.
- **filesystem crash/durability AND concurrency simultaneously**: durability (ADAPTER-6/12) and any concurrent access are checked _separately_, never folded into one model (the ShardStore rule).
- **no formal cluster in the ring**: stated above — the sole `formal` model (`FSPEC-merge`, the kernel convergence core) lives one layer down and is already discharged. Re-modelling an IO adapter formally is refused as budget mis-spend.

## FSPEC-merge

**None in this block.** The ring authors no formal model. The core cluster `FSPEC-merge`
([`../spec/fspec-merge.md`](../spec/fspec-merge.md), KERNEL-9/10/11 + PERSIST-11) is the single formal artifact in
the Atlas and is unchanged by Campaign-9. Every adapter that persists (ADAPTER-6/7/12) consumes that already-
formal core through the frozen `StoreApi`/`routeWrite` seams; it does not re-model it.

## Completion report

- tagged-register: `docs/requirements/method-tags-adapters.md`
- tag histogram: **formal 0** · **exhaustive 3** (CLI-1, CLI-2, MCP-1) · **PBT 1** (ADAPTER-7) ·
  **reference-model 15** (ADAPTER-1..6, 8..12, WIRE-1, CLI-3, CLI-4, MCP-2)
- FSPEC-merge: **—** (no ring formal cluster; the core FSPEC-merge is unchanged and consumed via frozen seams)
- refusal count: **7**
- every INV tagged: **yes** (19/19 behavioural; 0 `n/a`)
- 3-conjunct justification for `formal`: **written** (§header "Why no formal here") — the second conjunct
  (combinatorial-state-tests-can't-cover) fails for every ring INV; the finite fixture is fully covered by a
  conformance test.
- anti-rot: every `reference-model` tag names its mock/fixture (15/15); the `PBT` tag (ADAPTER-7) names its
  property generator + equality oracle; the 3 `exhaustive` tags name their enumerated oracle.
- → next_state **S3** (goldens).

## CAMPAIGN-11 — the MEMORY RING

### INV-MEMRING-1

method-tag: reference-model
fspec: —
up-property: "the log is an append-only content-keyed ledger: every line self-verifies by its own hash, so a line the door did not write is detectable rather than served"
down-model: "the shipped `createDurableMemory` over a real temp repo is the oracle; a fresh instance re-reads what a prior instance appended, and planted torn / tampered / unreadable inputs are counted rather than folded"
anti-rot: the reader's content-key check is the mock; removing it folds a hand-edited line in as a record

### INV-MEMRING-2

method-tag: reference-model
fspec: —
up-property: "an append-only log has no lost update to lose: the seek-to-end and the write are one atomic step, so no snapshot is read in between"
down-model: "eight REAL subprocesses each appending five records; the fold must hold forty. A read-modify-write mutation of the same door measures three durable of forty"
anti-rot: the O_APPEND write is the mock; replacing it with a read-modify-write drops the count from 40 to 3

### INV-MEMRING-3

method-tag: reference-model
fspec: —
up-property: "whole-line JSONL makes a git text merge safe by construction: lines union or duplicate and can never be spliced, and a duplicate is deduped by content id (KERNEL-12b)"
down-model: "two divergent branch logs are line-merged exactly as git would and folded; every record survives and the shared one appears once"
anti-rot: the JSONL one-record-per-line form is the mock; a multi-line record makes the same merge splice

### INV-MEMRING-4

method-tag: exhaustive
fspec: —
up-property: "the refusal vocabulary is a CLOSED union, so the door's whole failure surface is finite and can be enumerated rather than sampled"
down-model: "each gate is driven to its refusal in turn over a real composed door; the verdict's named refusal is asserted against the closed union"
anti-rot: the ordered composition is the mock; reordering derivation after validation judges a payload by a template it chose

### INV-MEMRING-5

method-tag: reference-model
fspec: —
up-property: "ARCH-9 one layer down: `kind` selects `REQUIRED[kind]`, and `REQUIRED[kind]` IS the gate, so a caller choosing it is the confused deputy"
down-model: "the four canonical shapes each derive their own kind; a tie is an ERROR rather than a first-match win, and the mutual exclusion the derivation rests on is asserted directly"
anti-rot: the multi-match refusal is the mock; a first-match-wins fold files an ambiguous entry silently

### INV-MEMRING-6

method-tag: reference-model
fspec: —
up-property: "`actor` resolves to the empty string when neither source is present, so an empty owner is a REACHABLE value and an unowned record is a scoping key that matches by accident"
down-model: "the shipped `put` over a real composed root; an empty owner is refused, and the CLI/MCP surfaces are enumerated for an owner flag"
anti-rot: the empty-owner refusal is the mock; removing it mints a record every empty-actor caller is injected

### INV-MEMRING-7

method-tag: reference-model
fspec: —
up-property: "a fail-closed default only protects against exits that were NOT enumerated; enumerating a code assigns it a meaning, so the invocation itself must be measured against the live binary in BOTH directions"
down-model: "the real binary is the oracle: a clean record must scan clean and a private-key record must be flagged, measured rather than read off the tool's docs"
anti-rot: the argv is the mock; the shipped `detect --source -` exits 1 on clean input and turns the clean-scan leg red

### INV-MEMRING-8

method-tag: reference-model
fspec: —
up-property: "MEM-1 scoping is a predicate over a SHARED store, not access control — it bounds what a turn is served, and says so"
down-model: "a two-seat durable store is the oracle; each seat's header is asserted to hold only its own, and the consultable kinds are asserted absent structurally AND by content"
anti-rot: the `injectFor` owner filter is the mock; removing it leaks the other seat into the header

### INV-MEMRING-9

method-tag: reference-model
fspec: —
up-property: "a 'wave' is a property of the LEDGER, so a rule nobody re-affirms ages identically whether the process sleeps a second or a decade"
down-model: "a real durable log is the oracle; a huge system-clock jump with no new entries must not move the set, and appending entries must"
anti-rot: the decay term is the mock; returning the stored value unchanged turns the frecency legs red

### INV-MEMRING-10

method-tag: reference-model
fspec: —
up-property: "an absent source has exactly one honest rendering, and it is labeled — the alternative is a slab that reads true and is not"
down-model: "the real repo root is the oracle: a seeded facet carries its grounding, and every absent one carries the sentinel"
anti-rot: the sentinel is the mock; substituting a generic card makes an absent facet indistinguishable from a seeded one

### INV-MEMRING-11

method-tag: reference-model
fspec: —
up-property: "one wired handler behind both transports makes parity structural rather than copied — the property ARCH-5 already asserts for the knowledge doors, now asserted for a WRITE door for the first time"
down-model: "the shared handler is the oracle; the same call is driven through both surfaces and the verdicts compared"
anti-rot: the shared handler is the mock; a second, separately-composed door diverges under the same call

### INV-MEMRING-12

method-tag: exhaustive
fspec: —
up-property: "the surface is finite and enumerable, so correspondence is checked exhaustively rather than sampled"
down-model: "`COMMANDS` is the oracle; the reference tree and the README region are compared against it in both directions"
anti-rot: the guard's README leg is the mock; removing it lets the table drift, which is exactly how it reached ten rows against twenty-three commands
