# Goldens — Block RET (retrieval) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-ret.md`; every RETR INV method-tagged, no `formal` cluster in this block —
> retrieval **consumes** the KRN `FSPEC-merge` core, it does not host one) · **owner:** charlie (FORGE).
>
> **Derivation (not hand-authored where a generator exists):**
>
> - **RETR-2 / 6 / 10 / 12** are `PBT` → each SCN is a **concrete witness instance of an ordering / cap / dedup /
>   determinism law** the S2 up-property names (`retrieval/ref/{pack,rank,drop,relate,own}.ts`) — `gen: PBT`.
> - **RETR-1 / 3 / 4 / 5 / 7 / 8 / 9 / 11** are `reference-model` → **conformance / differential** against the
>   named build-language mock (`retrieval/ref/*.ts`, reused as the unit-test mock; anti-rot) — `gen: conformance`.
>   (RETR-4 = the debounce automaton, RETR-9 = the total surface, RETR-11 = the ranked bounder: the reference model
>   IS the oracle; PBT-fuzz is only its golden generator, kept `conformance` per the block baseline — mirrors KERNEL-7.)
> - **RETR-13** is `reference-model` → conformance for log/deterministic/rate-0/no-throw. Its **threshold**
>   (REQ-RETR-13b) has **no value in the reference clause** (`req-ret.md` §[NEEDS RECONCILIATION] → routed to
>   DEFINE), so **SCN-RETR-13b-1 is written parametric on the symbolic threshold `θ`** — `gen: residue` + a
>   DEFINE-dependency note. The constant is **not invented at S3**; the golden binds it once DEFINE supplies it.
>
> **Pinned cap measure (load-bearing for every `~`-cap).** Every `~`-cap here (pack `~2K`, ceiling `~5K`,
> Awareness `~400`, `own` `~1.5K`, poke `~150`, …) is a **ratified pinned-measure bound under `cl100k_base`
> (tiktoken), pinned by version + content-hash** (`atlas-retrieval.md` §Cap measure). Every golden asserts the
> cap as a **concrete `Pack.tokenEstimate` under that pinned tokenizer**, never a vague threshold — this is what
> keeps the byte-identity gates (INDEX-8 / RETR-1) falsifiable.

---

## Fixture A — a concrete territory + index (reused by RETR-1/2/5/7/9/10/11/12)

Territory `crate:billing` (scope `crates/billing/`). `tokenEstimate` is the pinned `cl100k_base` count.

| node | nodeKey                         | tier | ppr  | hits | tokenEstimate |
| ---- | ------------------------------- | ---- | ---- | ---- | ------------- |
| n1   | `inv:billing-no-neg`            | T0   | 0.80 | —    | 120           |
| n2   | `inv:billing-idempotent-charge` | T0   | 0.75 | —    | 140           |
| n3   | `inv:billing-retry`             | T1   | 0.90 | 40   | 300           |
| n4   | `inv:billing-refund`            | T1   | 0.70 | 40   | 300           |
| n6   | `inv:billing-audit`             | T1   | 0.50 | 10   | 300           |
| n5   | `inv:billing-currency`          | T1   | 0.50 | 10   | 300           |
| n7   | `inv:billing-legacy`            | T1   | 0.30 | 2    | 300           |
| n8   | `inv:billing-notes`             | T1   | 0.20 | 1    | 700           |

- **T1 rank `(hits-desc, ppr-desc, nodeKey-asc)`** ⇒ `n3 (40,0.90) ≺ n4 (40,0.70) ≺ n6 (10,0.50,"audit") ≺ n5
(10,0.50,"currency") ≺ n7 (2) ≺ n8 (1)`. (`audit` < `currency` breaks the n6/n5 tie by nodeKey-asc.)
- **Greedy fill under the pinned `~2K` cap:** T0 `n1+n2 = 260`; then T1 `n3→560, n4→860, n6→1160, n5→1460,
n7→1760`; `n8 (+700 → 2460 > 2000)` does **not** fit ⇒ truncation marker + `pull-reachable` tail = `{n8}`.
  Emitted pack `tokenEstimate = 1760 ≤ 2000`.

**Merged-pack fixture** (RETR-2d/2e): second territory `crate:payments` with hub `p_hub =
inv:payments-ledger` (T1, ppr 0.95, hits 10, 300 tok) and billing owner-leaf `n_leaf = inv:billing-currency`
(n5 above: T1, ppr 0.50, hits 10). Merged rank `(hits-desc, ppr-desc)` with equal hits ⇒ `p_hub (0.95) ≺
n_leaf (0.50)` **even though `n_leaf` is in the closer/owner territory** — proximity is retired for PPR.

## Fixture B — injection budget for one turn (reused by RETR-6/7/8)

Caps are the pinned `cl100k_base` sweet-spots (RETR-7); `tokenEstimate` is this turn's actual pinned count.

| kind                         | tokenEstimate | cap   | hitRate | pinned? |
| ---------------------------- | ------------- | ----- | ------- | ------- |
| `Awareness.constitution`     | 400           | ~400  | —       | **pin** |
| `protocols.safetyCritical`   | 500           | ~500  | —       | **pin** |
| `Orientation`                | 250           | ~250  | 0.80    | no      |
| `projectMem` (project-Rules) | 500           | ~500  | 0.60    | no      |
| `own`                        | 1500          | ~1.5K | 0.50    | no      |
| `pack`                       | 2000          | ~2K   | 0.70    | no      |
| `related`                    | 300           | ~300  | 0.30    | no      |
| `protocols.advisory`         | 500           | ~500  | 0.30    | no      |
| `poke`                       | 150           | ~150  | 0.10    | no      |

Sum = **6100 > ~5000 ceiling** (overflow 1100). Droppable (non-pin) by **hitRate-asc, least-used first**:
`poke(0.10) ≺ {related, advisory}(0.30) ≺ own(0.50) ≺ projectMem(0.60) ≺ pack(0.70) ≺ Orientation(0.80)`.
Drop `poke(150)→5950`, `advisory(500)→5450` _(the 0.30 tie broken by cold-start priority: advisory is
lower-priority than related, so advisory drops first)_, `related(300)→5150`, `own(1500)→3650 ≤ 5000`. Dropped =
`{poke, advisory, related, own}`; both pins retained.

## Fixture C — tool-call sequences (reused by RETR-4)

Scopes: `A = file:billing/charge` (`crates/billing/src/charge.rs`), `B = file:billing/refund`,
`C = file:billing/tax`. Debounce window `N = 2` consecutive tool calls; per-session `poked` set.

---

## REQ-RETR-1 — relevance from structural index only

### SCN-RETR-1-1 — two identical queries → byte-identical, zero embedding calls (happy)

source: REQ-RETR-1
Given the axes-only reference resolver over Fixture A, and query `q = resolve("crates/billing/src/charge.rs")` run twice
When each run resolves relevance purely by scope (path roll-up) + dependency (`depends-on`) + trigger (tag), and the retrieval module graph is audited for embedding / vector / RAG imports
Then both runs return the byte-identical territory set `{crate:billing}` and the import audit finds **0** embedding/vector/RAG call sites
teeth: breaks-on "an embedding-similarity path is added to relevance — the two identical queries return different rankings (nondeterministic) and the import audit finds a vector-store call site"
gen: conformance # differential vs `retrieval/ref/resolve.ts` (dependency-free seam) + import grep-assertion

---

## REQ-RETR-2 — the bounded pack (PBT: ordering + cap-wins laws)

### SCN-RETR-2a-1 — emitted pack stays within the pinned `~2K` cap (happy)

source: REQ-RETR-2a
Given the billing territory of Fixture A greedily filled T0-then-T1-by-rank
When the packer emits the pack and computes `Pack.tokenEstimate` under `cl100k_base`
Then `tokenEstimate = 1760 ≤ 2000` — the pinned cap holds (n8's 700 would blow it, so n8 is excluded)
teeth: breaks-on "the cap is weakened to admit n8 — the pack's pinned tokenEstimate is 2460 > 2000"
gen: PBT # witness of the cap-bound law: pinned count never exceeds `~2K`

### SCN-RETR-2b-1 — T0 in full, then T1 by the total rank (happy)

source: REQ-RETR-2b
Given the billing territory of Fixture A
When the packer fills the pack
Then it carries **both** T0 invariants `{n1, n2}` in full, then T1 in the order `n3 ≺ n4 ≺ n6 ≺ n5 ≺ n7` — the total order `(hits-desc, ppr-desc, nodeKey-asc)`, with `n6` before `n5` on the `nodeKey-asc` tiebreak
teeth: breaks-on "the within-tier tiebreak is mutated to `nodeKey-desc` (or `ppr-asc`) — `n5` (currency) is emitted before `n6` (audit)"
gen: PBT # witness of the fill-order law: T0-full then a total, antisymmetric T1 rank

### SCN-RETR-2c-1 — cap reached → truncation marker + tail, never a silent drop (guard)

source: REQ-RETR-2c
Given the billing pack filled to `1760` with `n8` unable to fit under the `~2K` cap
When the packer finalizes the pack at the cap
Then it emits a **truncation marker** and a `pull-reachable` tail listing `{n8}` — the cap wins over completeness and **0** invariants are silently dropped
teeth: breaks-on "n8 is dropped with no truncation marker and no tail — a silent drop (the pack claims completeness it does not have)"
gen: PBT # witness of the cap-wins law: any omission ⇒ a marker is present

### SCN-RETR-2d-1 — merged pack over K territories → `~2K` total, not per-territory (happy)

source: REQ-RETR-2d
Given a merged pack over `K = 2` covering territories `{crate:billing, crate:payments}`
When the packer budgets the merged pack under `cl100k_base`
Then the **combined** `tokenEstimate ≤ 2000` total — one shared `~2K` budget across both territories, not `2000` each
teeth: breaks-on "each territory is budgeted `~2K` independently — the merged pack's pinned tokenEstimate reaches 4000 (2× the ceiling contribution)"
gen: PBT # witness of the merged-cap law: `≤ ~2K` total, not per-territory

### SCN-RETR-2e-1 — merged fill T0-first then PPR, hub outranks the closer leaf (happy)

source: REQ-RETR-2e
Given the merged-pack fixture: payments hub `p_hub` (ppr 0.95) and billing owner-leaf `n_leaf` (ppr 0.50), equal hits
When the merged pack is filled T0-first, then by `(hits-desc, ppr-desc)`
Then `p_hub` is ranked **before** `n_leaf` — the high-centrality hub outranks the merely-closer/owner-territory leaf (owner-territory proximity is retired for PPR)
teeth: breaks-on "owner-territory proximity is restored as the tiebreak — the closer `n_leaf` is ranked before the higher-PPR `p_hub`"
gen: PBT # witness of the merged fill-order law: PPR replaces proximity

### SCN-RETR-2f-1 — a pack carries no free prose, only 1-line PackInvariants (guard)

source: REQ-RETR-2f
Given the billing pack of Fixture A
When each pack element is inspected against the `PackInvariant = {nodeId, tier, claim}` shape
Then every element is a single structured 1-line `PackInvariant` — **0** free-prose blobs
teeth: breaks-on "a rendered prose paragraph is inlined into the pack as an unstructured `claim` — a free-prose blob enters the pack"
gen: PBT # witness of the no-free-prose law (0 prose)

---

## REQ-RETR-3 — stale ⇒ re-ground (reference-model)

### SCN-RETR-3a-1 — a `stale:true` pack is not trusted as-is (guard)

source: REQ-RETR-3a
Given a billing pack whose `stale` is `true` (a backing grounding drifted per the index drift-oracle)
When a seat requests the pack for use
Then the retrieval layer refuses to serve it as-is — the stale pack is **not** trusted
teeth: breaks-on "the stale flag is ignored on the read path — the `stale:true` pack is served and trusted as-is"
gen: conformance # differential vs `retrieval/ref/stale.ts` (the drift-then-refuse conformance test)

### SCN-RETR-3b-1 — a `stale:true` pack is re-grounded before use (guard)

source: REQ-RETR-3b
Given the same `stale:true` billing pack
When the retrieval layer prepares it for a seat
Then it is routed through re-grounding **before** use, and only the re-grounded (`stale:false`) pack is served
teeth: breaks-on "the re-ground step is skipped — the stale pack is used directly without re-grounding"
gen: conformance

### SCN-RETR-3c-1 — `stale` equals exactly \"a backing drifted\", never a guess (happy)

source: REQ-RETR-3c
Given a billing pack backed by groundings `{g1, g2}`, with `g2` drifted in the index drift-oracle and `g1` clean
When `stale` is computed
Then `stale = drifted(g1) OR drifted(g2) = false OR true = true` — the exact OR over backings, never a heuristic
teeth: breaks-on "`stale` is a heuristic guess (e.g., an age/TTL timer) — it reads `false` while `g2` is genuinely drifted, or `true` while all backings are clean"
gen: conformance # reuses the index drift-oracle as the mock (seam #1 consumer)

---

## REQ-RETR-4 — debounced once-per-scope poke (reference-model: the debounce automaton)

### SCN-RETR-4a-1 — the poke's event source is the tool-call hook (happy)

source: REQ-RETR-4a
Given the harness tool-call hook (the push tier of TOOLS-11) observing `Read(crates/billing/src/charge.rs)`
When the poke pipeline runs
Then scope `A = file:billing/charge` is **inferred from the tool-call path** (not from an explicit query) and drives the poke
teeth: breaks-on "the poke is sourced from an explicit `atlas-query` call instead of the tool-call hook — navigation that never issues a query never pokes"
gen: conformance # differential vs `retrieval/ref/poke.ts`

### SCN-RETR-4b-1 — a single-file Read/Edit/Write is a navigation signal (happy)

source: REQ-RETR-4b
Given the tool call `Read(crates/billing/src/charge.rs)` on one file path
When the classifier runs
Then it is classified `navigate(file:billing/charge)` — scope = that file's node
teeth: breaks-on "a single-file `Read` is not treated as navigation — the classifier returns `suppress` and no scope is ever resolved"
gen: conformance

### SCN-RETR-4c-1 — a multi-file Grep/Glob is suppressed (guard)

source: REQ-RETR-4c
Given `Grep(pattern="charge", files=30 matches across billing+payments)`
When the classifier runs
Then it returns `suppress` — a multi-file span has **no single scope**, so **no poke** fires
teeth: breaks-on "the multi-file Grep infers a scope (e.g., the first match's file) and fires a poke"
gen: conformance

### SCN-RETR-4d-1 — a Bash path-shaped arg is not navigation (guard)

source: REQ-RETR-4d
Given the tool call `Bash("cargo test -p billing")` carrying the path-shaped arg `-p billing`
When the classifier runs
Then it returns `suppress` — a command's path-shaped argument is not a location, so **no** scope is inferred
teeth: breaks-on "the classifier parses `-p billing` as a location and infers scope `crate:billing` from a Bash command"
gen: conformance

### SCN-RETR-4e-1 — only a resolved single-file navigation drives a scope-change (happy)

source: REQ-RETR-4e
Given a stream `[Grep(30 files), Bash("cargo build"), Read(crates/billing/src/refund.rs)]`
When the scope-change engine consumes the stream
Then only the `Read` (single-file navigation) moves the current scope to `B = file:billing/refund`; the Grep and Bash move nothing
teeth: breaks-on "a non-navigation call (the Grep) drives a scope-change — the current scope moves on a multi-file span"
gen: conformance

### SCN-RETR-4f-1 — crossing into a new scope fires an unasked poke (happy)

source: REQ-RETR-4f
Given the current scope settled at `B = file:billing/refund` (not previously poked this session)
When the navigator crosses into `B`
Then a poke fires **unasked**, injecting a compact notice (`≤ ~150` tok) + `B`'s pack
teeth: breaks-on "crossing into a new settled scope fires no poke — the pack is only delivered on an explicit request"
gen: conformance

### SCN-RETR-4g-1 — a poke fires only after the scope settles across N=2 calls (happy)

source: REQ-RETR-4g
Given the sequence `[Read(A), Read(B), Read(B)]` — `B` becomes current at call 2 and stays current at call 3
When the debounce automaton (settle window `N = 2` consecutive tool calls) processes the stream
Then `B`'s poke fires only at call 3, once `B` has settled as the current scope across 2 consecutive calls
teeth: breaks-on "the settle window is mutated to `N = 1` — `B`'s poke fires at call 2 on the first crossing (poke-storm on rapid hopping)"
gen: conformance # the debounce is over a COUNT of calls, not wall-clock — nothing real-time

### SCN-RETR-4h-1 — a transient in-and-out crossing does not poke (guard)

source: REQ-RETR-4h
Given the sequence `[Read(A), Read(B), Read(A)]` — `B` appears at call 2 then is gone at call 3 (never settles)
When the debounce automaton processes the stream
Then `B` fires **no** poke — the crossing was transient (present for < `N = 2` consecutive calls)
teeth: breaks-on "the transient single-call crossing into `B` fires a poke at call 2 — hysteresis is absent"
gen: conformance

### SCN-RETR-4i-1 — an already-poked scope does not re-poke (guard)

source: REQ-RETR-4i
Given a session where `B`'s poke has already fired (so `B ∈ poked`), then the stream `[Read(C), Read(B), Read(B)]` re-enters `B`, and the seat then reasons over the already-injected pack (emitting no new path event)
When the automaton reprocesses `B` and the reasoning turn passes
Then **no** second poke fires — a poke is at most once per scope per session, and reasoning over an injected pack emits no path event to re-trigger
teeth: breaks-on "re-entering an already-poked scope re-pokes — `B` is injected a second time in one session"
gen: conformance

---

## REQ-RETR-5 — location-scoped tool projection (reference-model)

### SCN-RETR-5a-1 — only the current scope's covering nodes are exposed (happy)

source: REQ-RETR-5a
Given the navigator at scope `A = file:billing/charge`, covered by nodes `{n1, n2, n3}` (billing crate roll-up)
When `projectTools(A)` runs
Then the live MCP tool set is exactly `coveringNodes(A) = {n1, n2, n3}` — no node outside `A`'s covering set is exposed
teeth: breaks-on "a node covering a _different_ scope (e.g., `n4`, refund-only) is exposed while at `A` — off-scope nodes leak into the tool surface"
gen: conformance # differential vs `retrieval/ref/project.ts`

### SCN-RETR-5b-1 — leaving a scope retracts its node-tools (happy)

source: REQ-RETR-5b
Given the tool set `{n1, n2, n3}` live for scope `A`, then the navigator moves to scope `B = file:billing/refund`
When the scope-change is processed
Then `A`'s node-tools retract and the live set becomes `coveringNodes(B)` — the tool surface follows the navigator, never accumulating
teeth: breaks-on "on leaving `A` its tools are not retracted — the live set accumulates `coveringNodes(A) ∪ coveringNodes(B)`"
gen: conformance

### SCN-RETR-5c-1 — the whole graph is never projected at once (guard)

source: REQ-RETR-5c
Given the full Fixture A graph of 8 nodes and a navigator at scope `A` covered by 3
When the tool surface is inspected at any step of an enter/exit sequence
Then the live tool set is always the ≤3-node covering set, **never** the whole 8-node graph
teeth: breaks-on "the projector exposes all 8 nodes simultaneously — the whole graph is projected as tools at once"
gen: conformance

---

## REQ-RETR-6 — injection ceiling + ledger-calibrated drop order (PBT: drop-order laws)

### SCN-RETR-6a-1 — the auto-injected sum respects the pinned `~5K` ceiling (happy)

source: REQ-RETR-6a
Given Fixture B (this turn's injections sum to `6100` under `cl100k_base`)
When the drop-policy runs and the turn is finalized
Then the post-drop sum is `3650 ≤ 5000` — the hard `~5K` ceiling holds under the pinned measure
teeth: breaks-on "the ceiling is weakened to `~6.2K` — the `6100` sum is admitted with no drop and the ceiling is breached"
gen: PBT # witness of the ceiling-holds law under `cl100k_base`

### SCN-RETR-6b-1 — overflow drops droppable kinds by hitRate, least-used first (guard)

source: REQ-RETR-6b
Given Fixture B overflowing by `1100`, with droppable hitRates `poke 0.10 ≺ advisory 0.30 ≺ related 0.30 ≺ own 0.50 ≺ …`
When the drop-policy resolves the overflow
Then it drops **least-used first** — `poke`, then `advisory`, `related`, `own` — until `sum ≤ 5000`; a higher-hitRate kind (`pack 0.70`, `Orientation 0.80`) is retained over a lower one
teeth: breaks-on "the drop order is hardcoded (e.g., drop `pack` first / drop in declaration order) — a high-hitRate kind is dropped while `poke (0.10)` survives"
gen: PBT # witness of the observed-hitRate drop-order law (RETR-8 ledger)

### SCN-RETR-6b-2 — the drop is deterministic under a hitRate tie (guard)

source: REQ-RETR-6b
Given Fixture B′ where `related` and `advisory` **tie** at hitRate `0.30`, and an overflow that must drop **exactly one** of the tied pair (the other survives — the tie-break decides which), run **twice** on the identical input
When the drop-policy runs, under a **pinned secondary tie-key `κ`** (symbolic — the concrete key awaits DEFINE)
Then both runs drop the identical kind and **exactly one** of `{related, advisory}` survives — a deterministic total order over kinds for any fixed `κ`
teeth: breaks-on "the tie is broken by insertion / hashmap-iteration order (no fixed `κ`) — the two runs drop a **different** member of the tied pair, so which kind survives is nondeterministic"
gen: residue # DEFINE-parametric: RETR-6/8 guarantee a deterministic total order but do NOT name the hitRate-tie secondary key κ → [NEEDS RECONCILIATION]. Asserts determinism now; binds κ when DEFINE ratifies.

### SCN-RETR-6c-1 — the two pins never drop, even under heavy overflow (guard)

source: REQ-RETR-6c
Given Fixture B forced to a large overflow, with `Awareness.constitution` and `protocols.safetyCritical` in the injection set
When the drop-policy drops kinds until `sum ≤ 5000`
Then **neither pin is ever dropped** — both are retained regardless of ceiling pressure; only non-pin kinds are droppable
teeth: breaks-on "a pin (`Awareness.constitution` or `protocols.safetyCritical`) is added to the droppable set — under heavy overflow the constitution is dropped"
gen: PBT # witness of the pin-never-dropped law

### SCN-RETR-6d-1 — cold-start uses the documented default drop order (happy)

source: REQ-RETR-6d
Given a ledger with **no** hitRate data yet (cold start) and Fixture B's injection set overflowing
When the drop-policy runs
Then it drops from the **bottom** of the documented cold-start order — `Awareness tail`, `poke`, `protocols.advisory`, `related`, `pack`, `own`, `project-Rules`, `Orientation` — highest-priority (the two pins) never reached
teeth: breaks-on "the cold-start default order is permuted — `own` is dropped before `poke` / `Awareness tail`, violating the documented highest-priority-first order"
gen: PBT # witness of the cold-start default-order law (until the ledger has data)

### SCN-RETR-6e-1 — once the ledger has data, kinds reorder by observed hitRate (happy)

source: REQ-RETR-6e
Given a ledger with data where `Orientation`'s observed hitRate has fallen to `0.05` (below `poke`'s `0.10`)
When the drop-policy runs on an overflow
Then every non-pin kind reorders by observed hitRate and `Orientation` (now least-used) drops **before** `poke` — overriding the cold-start default position
teeth: breaks-on "the policy ignores the ledger and stays on the static cold-start order — `poke` drops before `Orientation` despite `Orientation`'s lower observed hitRate"
gen: PBT # witness of the ledger-driven reorder law

### SCN-RETR-6f-1 — a per-kind drop-counter is ledgered (happy)

source: REQ-RETR-6f
Given `own` dropped on 3 of the last 10 turns
When the drop-counter ledger is read
Then it records `own: dropped 3/10 = 30% (> 20%)` — a per-kind drop-counter exists and flags `own` as mis-capped/mis-prioritized
teeth: breaks-on "no per-kind drop-counter is ledgered — `own` being dropped on 30% of turns leaves no signal (a mis-cap stays invisible)"
gen: PBT # witness of the ledgered-drop-counter law

---

## REQ-RETR-7 — per-type caps under the pinned measure (reference-model)

### SCN-RETR-7a-1 — each injection kind stays within its sweet-spot cap (happy)

source: REQ-RETR-7a
Given the cap-table `{Awareness ~400, Orientation ~250, projectMem ~500 (orch ~800), own ~1.5K, pack ~2K, related ~300, protocols ~500 shared, poke ~150}` and Fixture B's per-kind `tokenEstimate`s
When each kind's cap **value** is read from the shared cap-table under `cl100k_base` and its pinned `tokenEstimate` checked against it
Then each kind's cap **== its ratified pinned value** — `own`'s cap **== 1500** (not `~1.6K`), `pack` **== 2000**, `poke` **== 150**, `related` **== 300** — and each tokenEstimate is ≤ that cap
teeth: breaks-on "the `own` cap drifts to `~1.6K` — `own`'s cap no longer **== 1500**, so the pinned-value assertion flips (a drift the `1500 ≤ cap` inequality alone would silently tolerate)"
gen: conformance # differential vs `retrieval/ref/caps.ts` (the shared cap-table mock)

### SCN-RETR-7b-1 — no single kind consumes the whole ceiling (guard)

source: REQ-RETR-7b
Given the cap-table and the `~5K` ceiling
When each cap is compared to the ceiling
Then the largest cap (`pack ~2K`) is strictly less than the `~5K` ceiling — no single kind's cap equals or exceeds the whole ceiling
teeth: breaks-on "the `pack` cap is raised to `~5K` (== the ceiling) — a single kind can consume the entire injection budget"
gen: conformance

### SCN-RETR-7c-1 — Awareness and Orientation are derived, never written (guard)

source: REQ-RETR-7c
Given the injection kinds `Awareness`, `Orientation`, and `projectMem`
When the write path is audited
Then `Awareness` + `Orientation` are **derived** (0 write sites); only `projectMem` is a written per-member entry
teeth: breaks-on "a code path writes `Awareness` to a member file — Awareness becomes a written entry instead of derived"
gen: conformance

### SCN-RETR-7d-1 — caps enforced under the pinned cap measure (happy)

source: REQ-RETR-7d
Given the same input pack measured for cap enforcement
When enforcement computes the count
Then it uses the pinned `cl100k_base` `Pack.tokenEstimate` — a deterministic, byte-identical count for equal input; the RETR-6 ceiling is enforced under the same measure
teeth: breaks-on "enforcement is computed under an unpinned/different tokenizer (e.g., `gpt2`) — the same pack yields a different count across runs and the byte-identity gate (INDEX-8/RETR-1) breaks"
gen: conformance

---

## REQ-RETR-8 — ledger-calibrated, not guessed (reference-model)

### SCN-RETR-8a-1 — caps are a function of the ledger's observed hits (happy)

source: REQ-RETR-8a
Given the reference cap-table reading the ledger, then the ledgered `hits` for `own` are mutated upward
When the caps are recomputed
Then `own`'s cap **changes** in response — proving the cap is a function of observed `hits`, never a static constant divorced from usage
teeth: breaks-on "the cap is a hardcoded constant — mutating the ledgered `hits` leaves the cap unchanged (caps set by guesswork, not observed use)"
gen: conformance # differential vs `retrieval/ref/ledger.ts` feeding the cap-table

### SCN-RETR-8b-1 — per-kind hitRate drives the RETR-6 drop order (happy)

source: REQ-RETR-8b
Given the drop-policy reading per-kind `hitRate`, then `related`'s `hitRate` is mutated below `poke`'s
When the drop order is recomputed
Then `related` now drops before `poke` — the drop order is driven by observed `hitRate`, least-used first
teeth: breaks-on "the drop order ignores `hitRate` and uses a static rank — mutating `related`'s hitRate leaves the drop order unchanged"
gen: conformance

---

## REQ-RETR-9 — empty & total (reference-model: the total surface)

### SCN-RETR-9a-1 — a malformed scope yields empty pack / empty tools / no poke (guard)

source: REQ-RETR-9a
Given a malformed scope input `scope = "\0///not-a-path"` (no covering territory)
When `pack` / `projectTools` / `poke` are each invoked on it
Then `pack.invariants = []`, `projectTools = []`, and `poke = null` — empty structures, never a nearest-match fallback
teeth: breaks-on "a malformed scope returns a nearest-match non-empty pack (a partial guess) instead of an empty pack"
gen: conformance # PBT-fuzz differential vs the total reference surface `retrieval/ref/*.ts`

### SCN-RETR-9b-1 — a malformed scope never throws (guard)

source: REQ-RETR-9b
Given a PBT-fuzz stream of arbitrary + malformed scopes (10k cases: null, empty, non-UTF8, oversized) run side-by-side against the total reference surface
When each retrieval entry point is invoked on each fuzzed scope
Then **0 exceptions** are thrown — every call returns an empty/`null` result, and prod matches ref
teeth: breaks-on "a null/non-UTF8 scope propagates an uncaught exception (a `TypeError`) instead of returning an empty result"
gen: conformance # PBT-fuzz differential; tag stays reference-model per method-tags-ret.md §RETR-9

---

## REQ-RETR-10 — deterministic partitioned closure (PBT: determinism + partition-disjointness + exactness)

### SCN-RETR-10a-1 — relate = the exact set from the three index axes (happy)

source: REQ-RETR-10a
Given `relate(unit = crates/billing/src/charge.rs)` over Fixture A
When the closure is computed purely from the index's three axes (spatial roll-up + `depends-on` fwd & rev closure + territory)
Then the returned node set is **exactly** `{enclosing: module+crate roll-up} ∪ {dependents: rev-closure} ∪ {dependencies: fwd-closure} ∪ {governing: territory rule}` — no node missing, none extra
teeth: breaks-on "the spatial roll-up axis is dropped — the enclosing `crate:billing` node is missing from the closure (the set is no longer exact)"
gen: PBT # witness of the closure-exactness law against the reference closure

### SCN-RETR-10b-1 — the set is partitioned by relation kind (happy)

source: REQ-RETR-10b
Given the `relate` result for the charge unit
When the result is read
Then it is partitioned into the labeled bands `enclosing / dependents / dependencies / governing` (optional `coChanged`) — each node in exactly one structural band
teeth: breaks-on "`dependents` and `dependencies` are merged into one flat `related` band — the reverse and forward closures are no longer distinguishable"
gen: PBT # witness of the partition law

### SCN-RETR-10c-1 — relate is byte-identical for equal input (happy)

source: REQ-RETR-10c
Given `relate(charge)` invoked twice on the **same** index state but with the underlying adjacency/closure built in a **different insertion order** each time (same multiset of edges)
When both results are serialized
Then both emit the **identical pinned intra-band order** (dependents band `n3≺n4≺n6≺n5≺n7` by the deterministic comparator) — byte-identical despite the permuted construction
teeth: breaks-on "the closure emits in insertion/iteration order (a stable-but-construction-derived order) — the two permuted builds yield different intra-band orderings (bytes differ), a bug a self-compare of one identical build would miss"
gen: PBT # law witness: permuted construction of the same set → byte-identical (determinism, pilot-grade)

### SCN-RETR-10d-1 — relate consults no LLM (guard)

source: REQ-RETR-10d
Given the `relate` implementation and its import/call graph
When the path is audited while computing the charge closure
Then **0** LLM calls occur — the model supplies only the touched unit; the closure is the index's job
teeth: breaks-on "an LLM is consulted to expand the closure — a model call appears in the `relate` path (nondeterministic, non-index-derived edges)"
gen: PBT # witness of the 0-LLM law

### SCN-RETR-10e-1 — coChanged is opt-in (happy)

source: REQ-RETR-10e
Given `relate(charge)` called **without** an explicit `coChanged` request
When the result is read
Then the `coChanged` band is **absent** — the git-history-derived (correlational) band appears only when explicitly requested
teeth: breaks-on "`coChanged` is always included by default — correlational git-history edges leak into every relate result unrequested"
gen: PBT # witness of the opt-in law

### SCN-RETR-10f-1 — coChanged is labeled and never mixed into the structural bands (guard)

source: REQ-RETR-10f
Given `relate(charge, coChanged=true)` explicitly requesting the correlational band
When the result is read
Then `coChanged` is its own **labeled** band, disjoint from `dependents`/`dependencies` — `coChanged ∩ structuralBands = ∅`
teeth: breaks-on "a `coChanged` (correlational) fact is merged into the `dependents` structural band — a git-history correlation is presented as a structural dependency"
gen: PBT # witness of the partition-disjointness law (structural bands never overlap coChanged)

---

## REQ-RETR-11 — bounded blast radius (reference-model: the ranked bounder)

Fixture: unit `u` with `N = 20` reverse-closure dependents. Rank exemplars: `d_hub` (T1, ppr 0.90, distance 2) and `d_leaf` (T1, ppr 0.20, distance 1); one node `d_far` at distance 3.

### SCN-RETR-11a-1 — dependents are cut at maxHops = 2 (happy)

source: REQ-RETR-11a
Given the reverse closure of `u` including `d_far` at hop-distance 3
When the bounder cuts the closure at `maxHops = 2`
Then `d_far` (distance 3) is **excluded** — only nodes within 2 hops of `u` survive the cut
teeth: breaks-on "the hop cut is mutated to `maxHops = 3` — `d_far` (distance 3) leaks into the dependents band"
gen: conformance # differential vs `retrieval/ref/bound.ts` (closure→rank→cap→meta)

### SCN-RETR-11b-1 — dependents ranked by the deterministic total order (happy)

source: REQ-RETR-11b
Given `d_hub` (ppr 0.90, distance 2) and `d_leaf` (ppr 0.20, distance 1), both T1
When the bounder orders `dependents` by `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)`
Then `d_hub` ranks **before** `d_leaf` — the high-PPR hub 2 hops out outranks the low-PPR leaf 1 hop in (distance is demoted to a tiebreak)
teeth: breaks-on "distance is promoted to the primary key — the closer `d_leaf` (1 hop) outranks the higher-PPR `d_hub` (2 hops)"
gen: conformance

### SCN-RETR-11c-1 — dependents capped at K = 8 (happy)

source: REQ-RETR-11c
Given the ranked reverse closure of `u` with `N = 20` dependents
When the bounder caps the set
Then it returns exactly `K = 8` one-line `RelatedFact`s — the top-8 by rank
teeth: breaks-on "the cap is raised to `K = 12` — 12 dependents are returned, blowing the hard count"
gen: conformance

### SCN-RETR-11d-1 — closure > K → truncate after ranking, honest meta (guard)

source: REQ-RETR-11d
Given the `N = 20` closure exceeding `K = 8`
When the bounder truncates
Then it truncates **after** ranking (the returned 8 are the top-8 by rank, a rank-prefix) and carries `dependents_meta = {truncated: true, total: 20, returned: 8}` — the honest pre-truncation count
teeth: breaks-on "truncation happens **before** ranking (the first 8 by insertion order are kept) — or `total` is reported as `8` (== returned), hiding the 12 dropped dependents"
gen: conformance

### SCN-RETR-11e-1 — forward dependencies use the same rank and K = 8 (happy)

source: REQ-RETR-11e
Given a unit with 15 forward `dependencies`
When the bounder returns the `dependencies` band
Then it is ranked by the same `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)` order and capped at the same `K = 8`, with honest meta
teeth: breaks-on "forward `dependencies` are returned unbounded — all 15 are emitted with no `K = 8` cap (only `dependents` is bounded)"
gen: conformance

---

## REQ-RETR-12 — the curated `own` pack (PBT: determinism + dedup + cap laws)

Fixture: `own_billing` composed from `crate:billing` index reads; a co-injected billing `pack` shares `n3`.

### SCN-RETR-12a-1 — every scope-unit projects an `own_<id>` tool (happy)

source: REQ-RETR-12a
Given the scope-units `{crate:billing, module:billing/charge, service:checkout, feature:refunds}`
When each is projected
Then each yields an `own_<id>` tool (`own_billing`, `own_charge`, `own_checkout`, `own_refunds`) returning a curated `OwnPack`
teeth: breaks-on "a scope-unit (e.g., `service:checkout`) projects no `own_` tool — an owner has no curated briefing handle"
gen: PBT # witness over the unit alphabet: every scope-unit → an own\_<id>

### SCN-RETR-12b-1 — the OwnPack is pre-composed, zero-assembly (happy)

source: REQ-RETR-12b
Given a seat calling `own_billing`
When the tool returns
Then it returns a **complete pre-composed** `OwnPack` — the agent chooses no scope and assembles no pack
teeth: breaks-on "`own_billing` returns a scope-picker / a list of parts the agent must assemble — the agent is forced to choose a scope and build the pack"
gen: PBT # witness of the zero-assembly law

### SCN-RETR-12c-1 — the OwnPack is composed mechanically, byte-identical for equal input (happy)

source: REQ-RETR-12c
Given `own_billing` composed from the same index reads but with the bounded `relate()` closure built in a **different insertion order** each time (same multiset of reads)
When both results are serialized
Then both emit the **identical pinned composition order** — byte-identical despite the permuted construction
teeth: breaks-on "the bounded `relate()` emits in construction/insertion order — the two permuted builds differ byte-wise (a stable-but-wrong order a self-compare of one build would miss)"
gen: PBT # law witness: permuted construction of the same set → byte-identical composition

### SCN-RETR-12d-1 — the OwnPack uses no LLM (guard)

source: REQ-RETR-12d
Given the `own` composer and its call graph while building `own_billing`
When the path is audited
Then **0** LLM calls occur — the OwnPack is composed by index reads alone
teeth: breaks-on "an LLM summarizes / curates the OwnPack — a model call enters the composition (nondeterministic, non-mechanical)"
gen: PBT # witness of the 0-LLM law

### SCN-RETR-12e-1 — the OwnPack carries no free prose (guard)

source: REQ-RETR-12e
Given the composed `own_billing` OwnPack
When each field is inspected against the structured `OwnPack` shape
Then it carries **0** free-prose blobs — only structured `PackInvariant`s / pointers
teeth: breaks-on "a prose paragraph is inlined into the OwnPack's `gotchas` field — a free-prose blob enters the briefing"
gen: PBT # witness of the no-free-prose law

### SCN-RETR-12f-1 — the OwnPack is capped at the pinned `~1.5K` under the ceiling (happy)

source: REQ-RETR-12f
Given `own_billing` composed and measured under `cl100k_base`
When its `tokenEstimate` is checked
Then `tokenEstimate ≤ 1500` — the pinned `~1.5K` briefing budget holds, under the `~5K` ceiling
teeth: breaks-on "the `own` cap is blown to `~2K` — the OwnPack's pinned tokenEstimate reaches 2000, exceeding the ratified `~1.5K`"
gen: PBT # witness of the cap-bound law under `cl100k_base`

### SCN-RETR-12g-1 — the OwnPack carries drill-down affordances, detail pull-reachable (happy)

source: REQ-RETR-12g
Given `own_billing`
When its `drill` field is read
Then it carries `{finer: [module units], refresh, complement}` — finer detail/granularity is **pull-reachable** via these affordances, never inlined into the pack
teeth: breaks-on "the finer per-module detail is inlined directly into the OwnPack instead of exposed as a `drill.finer` pull-reachable pointer (the briefing bloats past its cap)"
gen: PBT # witness of the pull-reachable-drill law

### SCN-RETR-12h-1 — a seat receives its `own` by default (happy)

source: REQ-RETR-12h
Given a seat dispatched to own `crate:billing`
When the seat is provisioned
Then it **receives** `own_billing` by default (pushed at dispatch or exposed as a tool) — no explicit request required
teeth: breaks-on "`own_billing` is withheld until the seat explicitly requests it — a seat starts with no curated briefing"
gen: PBT # witness of the own-by-default law

### SCN-RETR-12i-1 — grounding source matches the unit level (happy)

source: REQ-RETR-12i
Given `own_billing` (a `crate` unit) and `own_checkout` (a `service` unit)
When each is grounded
Then the `crate` unit is grounded by the **tree** and the `service` unit by a **declared, drift-checked manifest**
teeth: breaks-on "the `service:checkout` unit is grounded by the tree (no manifest) — a manifest drift on the service boundary goes undetected"
gen: PBT # witness of the level→grounding-source law

### SCN-RETR-12j-1 — an epic is not a grounded `own` unit (guard)

source: REQ-RETR-12j
Given a unit of level `epic`
When `own_<epic>` is resolved
Then it is **not** treated as a grounded node — no tree path / manifest is required to ground it (an epic is a project-memory goal, not a structural node)
teeth: breaks-on "the `epic` is treated as a grounded `own` unit — resolution demands a tree path and fails/errors when none exists"
gen: PBT # witness of the epic-not-grounded law

### SCN-RETR-12l-1 — `own_<epic>` composes from its goal + the features' OwnPacks (happy)

source: REQ-RETR-12l
Given an `epic` whose Orientation goal spans `feature:refunds` and `feature:disputes`
When `own_<epic>` is composed
Then it is assembled from the epic's **project-memory goal** + the two features' `OwnPack`s — not from a single grounded node's invariants
teeth: breaks-on "`own_<epic>` is composed from one node's `tier≥T1` invariants (as if grounded) — the goal + feature-OwnPack composition is bypassed"
gen: PBT # witness of the epic-composition law

### SCN-RETR-12k-1 — `own` + a co-injected pack dedup by nodeId, own wins (guard)

source: REQ-RETR-12k
Given a seat receiving `own_billing` and a co-injected billing `pack` in the same turn, both covering `n3 = inv:billing-retry`
When the injection is assembled
Then `n3` appears in `own` only; the co-injected pack shows a `pull-reachable` pointer in its place — dedup by `nodeId`, `own` wins, the fact is paid for **once**
teeth: breaks-on "the dedup is dropped — `n3` appears in **both** `own` and the co-injected pack (the fact is double-counted, paid for twice against the ceiling)"
gen: PBT # witness of the dedup law: `own ∩ pack = ∅` after dedup, own wins

<!-- REQ-RETR-12 family AMENDED 2026-08-03 (REQ-RETR-12m — the two bands on this door). The 12a–12l scenarios
     above are UNCHANGED and still pass byte-for-byte: they are all stated over `tier≥T1` fixtures, which is
     exactly the GOVERNING band this amendment does not move. The four scenarios below are ADDED beside them
     for the ADVISORY band. Fixture: the real disk store + real built `Axes` of
     `packages/adapter-io/test/own-two-bands.test.ts`, four rows at one anchor — `T0`, `T1`, `T2`, and an
     off-lattice `T3` a committed `.atlas/` can carry with no write door. -->

### SCN-RETR-12m-1 — a `T2` under the scope is SERVED, on the advisory band, with its own freshness (happy) [AMENDED 2026-08-03]

source: REQ-RETR-12m
Given a scope carrying `T0`, `T1` and `T2` facts in one durable store
When `own_<scope>` is composed
Then the `T2` rows are served in the ADVISORY band, each carrying its own re-derived `Freshness` verdict, and the `T0`/`T1` rows are served in the GOVERNING band exactly as before — the band a row lands in is decided by tier MEMBERSHIP, never by `!atLeastT1`
teeth: breaks-on "the advisory band is bounded out by `atLeastT1` (the shipped defect: `own` served 0 of the 199 facts in Atlas's own store while `query` served them); or a governing row is duplicated into the advisory band"
gen: conformance # differential vs the shipped `createOwnLeg` over a real store

### SCN-RETR-12m-2 — an OFF-LATTICE tier is in NEITHER band, and is not counted as a truncation (guard) [AMENDED 2026-08-03]

source: REQ-RETR-12m
Given a projection carrying a row whose `tier` is `T3` — off the lattice, minted by no write door
When `own_<scope>` is composed
Then that row appears in neither band, and `advisoryDropped` does not count it — a refusal is a governance decision, not a budget event
teeth: breaks-on "the advisory predicate is written `!atLeastT1` instead of `isTier(t) && t === 'T2'`, so an off-lattice row is served as a proposal; or a refused row is folded into the truncation ledger"
gen: conformance # differential vs the shipped `createOwnLeg` over a poisoned store

### SCN-RETR-12m-3 — the advisory sub-cap bites INSIDE `OWN_CAP`, and every refused row is named (guard) [AMENDED 2026-08-03]

source: REQ-RETR-12m
Given more `T2` rows under the scope than the advisory sub-cap admits
When `own_<scope>` is composed
Then the served advisory rows cost `≤ OWN_ADVISORY_CAP`, the whole briefing still costs `≤ OWN_CAP`, `advisoryDropped` reports exactly how many rows the cap cut, and every cut row is named by nodeKey in the pull-reachable tail
teeth: breaks-on "the advisory band is capped by `OWN_CAP` alone so a briefing becomes mostly unratified; the total budget is raised to fit the band; or a cut row is silently absent instead of pull-reachable"
gen: conformance # differential vs the shipped composer under a 12-row advisory fixture

### SCN-RETR-12m-4 — the GOVERNING band keeps priority — ratified content is never displaced (guard) [AMENDED 2026-08-03]

source: REQ-RETR-12m
Given a scope whose `tier≥T1` facts alone fill the whole `OWN_CAP` budget
When `own_<scope>` is composed
Then the governing rows are served in full, zero advisory rows are served, and the advisory rows are reported as dropped and pull-reachable — a briefing never regresses because proposals arrived
teeth: breaks-on "the advisory band is filled before the governing band, or shares the budget pro-rata, so a ratified row is pushed into the tail by a machine proposal"
gen: conformance # differential vs the shipped composer under a budget-filling governing fixture

---

## REQ-RETR-13 — MISS-oracle, off-atlas coverage per territory (reference-model; 13b DEFINE-gated)

### SCN-RETR-13a-1 — the off-atlas rate is logged per territory (happy)

source: REQ-RETR-13a
Given territory `crate:billing` served on 10 turns, of which 3 required a `Read`/`Grep` **outside** the surfaced scope-set to finish
When the coverage ledger computes the off-atlas rate
Then it logs `crate:billing → offAtlasRate = offAtlasReads/served = 3/10 = 0.30`
teeth: breaks-on "out-of-scope reads are not counted — the off-atlas rate stays `0` despite the 3 misses (the silent under-coverage stays invisible)"
gen: conformance # differential vs `retrieval/ref/offatlas.ts`

### SCN-RETR-13b-1 — crossing the (symbolic) threshold raises a calibration prompt (guard) [DEFINE-parametric]

source: REQ-RETR-13b
Given territory `crate:billing` with `offAtlasRate = 0.30` and the **symbolic** off-atlas threshold `θ` (an OPEN DEFINE dependency — no value in the reference clause; `req-ret.md` §[NEEDS RECONCILIATION])
When the threshold-crossing predicate `offAtlasRate > θ` is evaluated
Then for any `θ < 0.30` the territory **raises a calibration prompt to author the missing tag/edge**, and for any `θ ≥ 0.30` it raises **none** — the golden asserts the predicate parametrically; the concrete `θ` binds when DEFINE supplies it
teeth: breaks-on "the calibration-prompt trigger is dropped — `offAtlasRate` crossing `θ` (for any `θ < 0.30`) raises no prompt (the under-covered territory never signals for a missing tag/edge)"
gen: residue # DEFINE-dependency: threshold `θ` is silent in the reference; SCN is parametric on `θ`, bound once DEFINE ratifies the value

### SCN-RETR-13c-1 — the off-atlas ledger is deterministic (happy)

source: REQ-RETR-13c
Given the same served-turn read multiset for `crate:billing` **accumulated in two different orders** (the reads replayed in a permuted sequence)
When the per-territory off-atlas ledger is computed each time
Then both serialize **byte-identically** — the rate is order-independent (a commutative, pinned reduction)
teeth: breaks-on "the ledger accumulates in float/iteration order (order-dependent) — the two permuted accumulations produce different rate bytes, a bug identical-replay would miss"
gen: conformance

### SCN-RETR-13d-1 — a territory with no served history yields rate 0 (guard)

source: REQ-RETR-13d
Given territory `crate:payments` with `served = 0` (no served history)
When its off-atlas rate is computed
Then it yields `offAtlasRate = 0` — not `NaN`, not undefined
teeth: breaks-on "the no-history case computes `0/0 = NaN` — a territory never served reports a garbage rate instead of `0`"
gen: conformance

### SCN-RETR-13e-1 — a territory with no served history never throws (guard)

source: REQ-RETR-13e
Given the same `served = 0` territory `crate:payments`
When `offAtlas()` is invoked on it
Then it returns rate `0` and **does not throw** — the no-history path is total
teeth: breaks-on "the no-history path throws a divide-by-zero exception instead of returning rate `0`"
gen: conformance

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 64/64 REQ have ≥1 SCN (RETR-1..13, all clauses `a`–`l`; RETR-12 alone is `a`–`l` = 12 clauses).
- **SCN count:** 65.
- **Guard coverage:** 26/26 guard/If-then/unwanted REQ have a guard SCN — 2c, 2f, 3a, 3b, 4c, 4d, 4h, 4i, 5c,
  6b (×2: hitRate-order + determinism-tie), 6c, 7b, 7c, 9a, 9b, 10d, 10f, 11d, 12d, 12e, 12j, 12k, 13b, 13d, 13e.
- **Teeth (Gate 3):** 65/65 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous; the
  PBT law-witnesses are interesting (a real cap overflow for 2a/2c, a genuine 2-territory merge for 2d/2e, a
  real 1100-token injection overflow with a hitRate tie for 6a/6b, a real 20-node reverse closure for 11, a
  genuine `own`↔`pack` `nodeId` collision for 12k — no antecedent-failure passes).
- **gen histogram:** PBT 30 (RETR-2 ×6, RETR-6 ×6, RETR-10 ×6, RETR-12 ×12) · conformance 33 (RETR-1 ×1,
  RETR-3 ×3, RETR-4 ×9, RETR-5 ×3, RETR-7 ×4, RETR-8 ×2, RETR-9 ×2, RETR-11 ×5, RETR-13 ×4) · residue 2 (13b, 6b-2).
- **DEFINE-parametric SCN:** 2 (SCN-RETR-13b-1 on the symbolic off-atlas threshold `θ`; SCN-RETR-6b-2 on the symbolic hitRate-tie secondary key `κ`).
- **toothless dropped:** 0.

## [NEEDS RECONCILIATION]

- INV-RETR-6: RETR-6/8 guarantee a **deterministic total order** over kinds but do NOT name the **secondary tie-key** when two kinds tie on `hitRate`. SCN-RETR-6b-2 is authored parametric on a symbolic `κ`; the concrete key (cold-start priority · `nodeKey/kind-name-asc` · other) is a design decision, not derivable — route to DEFINE. (RETR-6d scopes cold-start "only until the ledger has data", so it cannot silently double as the ledger-regime tie-key.)

---

# Wave H — held-out second fixtures + scenarios (execution GATE held-out leg) · S3 re-freeze

> **state:** S3 re-freeze (Wave H) · **owner:** charlie (FORGE). For **every conformance / reference-model**
> behavioural REQ (RETR-1 / 3 / 4 / 5 / 7 / 8 / 9 / 11 / 13-non-residue), this wave adds a **held-out `-2`
> scenario** over a **genuinely INDEPENDENT** fixture — a NEW territory + index / injection budget / tool-call
> sequence with **different nodes / tiers / ppr / hits / tokenEstimates** — that exercises the **SAME
> behaviour/branch** as the visible `-1` scenario. The execution GATE **holds back** this `-2` leg from the
> builder: an implementation that overfits the `-1` fixture (hard-codes its answer) **FAILS** the held-out leg,
> because the `-2` fixture is a different data instance of the same frozen behaviour, never a renamed clone.
> Same **pinned `cl100k_base`** cap-measure discipline as the base wave (every `~`-cap asserted as a concrete
> `tokenEstimate` under the pinned tokenizer, never a vague threshold). Existing fixtures/scenarios are
> preserved **byte-for-byte**; this section is purely **APPEND** (no S3-base line edited, so the base-wave
> coverage ledger above stands as the base record; the Wave-H delta is ledgered at the foot of this section).
>
> **Held-out is a DATA instance of frozen behaviour, not new behaviour.** No new INV / clause / cap / rank /
> constant is introduced here; each `-2` fixture re-realizes an S2 `up-property` / `down-model` already tagged
> in `method-tags-ret.md` over independent data. No decision was reached for at S3.
>
> **Naming.** Held-out twins carry a prime: **Fixture A′** (twin of A), **Fixture C′** (twin of C). The
> held-out injection budget is **Fixture B″** (double-prime) — **not** `B′`, because SCN-RETR-6b-2 already
> burns "Fixture B′" for its residue `κ`-tie variant; B″ keeps that pre-existing text byte-identical.
>
> **Skipped (not held-out-covered, by design):**
>
> - `gen: PBT` — **RETR-2 / 6 / 10 / 12** (30 SCN): their held-out assurance is the **PBT law-witness** in
>   [`properties-ret.md`](properties-ret.md) (a property quantifies over an unbounded fixture space — a
>   second fixture is subsumed, not additive), not a hand-authored `-2` fixture.
> - `gen: residue` — **SCN-RETR-6b-2** (`κ`) and **SCN-RETR-13b-1** (`θ`): **DEFINE-parametric**, exempt +
>   flagged (the golden binds the constant once DEFINE ratifies it; a held-out fixture cannot be authored
>   over an unbound symbol without inventing the constant at S3).
> - **delegated acceptance** — none in this block.

## Held-out fixtures

### Fixture A′ — a held-out territory + index (twin of Fixture A; reused by RETR-1′/5′/9′)

Territory `crate:inventory` (scope `crates/inventory/`). `tokenEstimate` is the pinned `cl100k_base` count.

| node | nodeKey                          | tier | ppr  | hits | tokenEstimate |
| ---- | -------------------------------- | ---- | ---- | ---- | ------------- |
| m1   | `inv:inventory-no-oversell`      | T0   | 0.85 | —    | 150           |
| m2   | `inv:inventory-atomic-decrement` | T0   | 0.70 | —    | 140           |
| m3   | `inv:inventory-reserve`          | T1   | 0.88 | 55   | 300           |
| m4   | `inv:inventory-restock`          | T1   | 0.60 | 55   | 300           |
| m5   | `inv:inventory-audit`            | T1   | 0.55 | 12   | 300           |
| m6   | `inv:inventory-backorder`        | T1   | 0.55 | 12   | 300           |
| m7   | `inv:inventory-legacy`           | T1   | 0.40 | 3    | 300           |
| m8   | `inv:inventory-report`           | T1   | 0.25 | 1    | 900           |

- **T1 rank `(hits-desc, ppr-desc, nodeKey-asc)`** ⇒ `m3 (55,0.88) ≺ m4 (55,0.60) ≺ m5 (12,0.55,"audit") ≺
m6 (12,0.55,"backorder") ≺ m7 (3) ≺ m8 (1)`. (`audit` < `backorder` breaks the m5/m6 tie by nodeKey-asc —
  a **different** letter pair than Fixture A's `audit`/`currency`.)
- **Greedy fill under the pinned `~2K` cap:** T0 `m1+m2 = 290`; then T1 `m3→590, m4→890, m5→1190, m6→1490,
m7→1790`; `m8 (+900 → 2690 > 2000)` does **not** fit ⇒ truncation marker + `pull-reachable` tail = `{m8}`.
  Emitted pack `tokenEstimate = 1790 ≤ 2000`.
- **Covering sets** (for RETR-5′): scope `P = file:inventory/reserve` (`crates/inventory/src/reserve.rs`) is
  covered by `{m1, m2, m3}` (crate roll-up + the reserve node); scope `Q = file:inventory/restock` is covered
  by `{m1, m2, m4}`. Off-scope-for-`P` exemplar = `m4` (restock-only).

### Fixture B″ — a held-out injection budget for one turn (twin of Fixture B; reused by RETR-7′/8′)

Caps are the **same ratified pinned `cl100k_base` values** (frozen by RETR-7 — the caps are constants, not
fixture data); only this turn's `tokenEstimate`s and observed `hitRate`s are the independent data.

| kind                         | tokenEstimate | cap   | hitRate | pinned? |
| ---------------------------- | ------------- | ----- | ------- | ------- |
| `Awareness.constitution`     | 380           | ~400  | —       | **pin** |
| `protocols.safetyCritical`   | 460           | ~500  | —       | **pin** |
| `Orientation`                | 240           | ~250  | 0.75    | no      |
| `projectMem` (project-Rules) | 480           | ~500  | 0.55    | no      |
| `own`                        | 1450          | ~1.5K | 0.45    | no      |
| `pack`                       | 1900          | ~2K   | 0.65    | no      |
| `related`                    | 280           | ~300  | 0.25    | no      |
| `protocols.advisory`         | 470           | ~500  | 0.35    | no      |
| `poke`                       | 140           | ~150  | 0.15    | no      |

Every `tokenEstimate ≤ its cap`. Sum = **5800 > ~5000 ceiling** (overflow 800). Droppable (non-pin) by
`hitRate`-asc: `poke(0.15) ≺ related(0.25) ≺ advisory(0.35) ≺ own(0.45) ≺ projectMem(0.55) ≺ pack(0.65) ≺
Orientation(0.75)` — a **different** hitRate assignment than Fixture B (here `Orientation` is the _most_-used,
not `poke` the least by the same margin), so a fixture-1-tuned drop order diverges.

### Fixture C′ — held-out tool-call sequences (twin of Fixture C; reused by RETR-4′)

Scopes: `P = file:inventory/reserve` (`crates/inventory/src/reserve.rs`), `Q = file:inventory/restock`
(`crates/inventory/src/restock.rs`), `R = file:inventory/audit` (`crates/inventory/src/audit.rs`). Debounce
window `N = 2` consecutive tool calls; per-session `poked` set.

## Held-out scenarios

### SCN-RETR-1-2 — held-out: two identical inventory queries → byte-identical, zero embedding calls (happy)

source: REQ-RETR-1
Given the axes-only reference resolver over **held-out Fixture A′** (`crate:inventory`), and query `q′ = resolve("crates/inventory/src/reserve.rs")` run twice
When each run resolves relevance purely by scope (path roll-up) + dependency (`depends-on`) + trigger (tag), and the retrieval module graph is audited for embedding / vector / RAG imports
Then both runs return the byte-identical territory set `{crate:inventory}` and the import audit finds **0** embedding/vector/RAG call sites
teeth: breaks-on "an embedding-similarity path is added to relevance — the two identical inventory queries return different rankings (nondeterministic) and the import audit finds a vector-store call site"
gen: conformance # differential vs `retrieval/ref/resolve.ts` over held-out Fixture A′ + import grep-assertion

### SCN-RETR-3a-2 — held-out: a `stale:true` inventory pack is not trusted as-is (guard)

source: REQ-RETR-3a
Given a **held-out** `crate:inventory` pack backed by groundings `{h1, h2, h3}` with `h3` drifted (per the index drift-oracle), so its `stale` is `true`
When a seat requests the pack for use
Then the retrieval layer refuses to serve it as-is — the stale inventory pack is **not** trusted
teeth: breaks-on "the stale flag is ignored on the read path — the `stale:true` inventory pack is served and trusted as-is"
gen: conformance # differential vs `retrieval/ref/stale.ts` over held-out {h1,h2,h3} backings (h3 drifted)

### SCN-RETR-3b-2 — held-out: a `stale:true` inventory pack is re-grounded before use (guard)

source: REQ-RETR-3b
Given the same held-out `stale:true` inventory pack (backings `{h1, h2, h3}`, `h3` drifted)
When the retrieval layer prepares it for a seat
Then it is routed through re-grounding **before** use, and only the re-grounded (`stale:false`) pack is served
teeth: breaks-on "the re-ground step is skipped — the stale inventory pack is used directly without re-grounding"
gen: conformance

### SCN-RETR-3c-2 — held-out: `stale` equals exactly the OR over three backings, never a guess (happy)

source: REQ-RETR-3c
Given a held-out inventory pack backed by groundings `{h1, h2, h3}`, with `h3` drifted in the index drift-oracle and `h1`, `h2` clean
When `stale` is computed
Then `stale = drifted(h1) OR drifted(h2) OR drifted(h3) = false OR false OR true = true` — the exact OR over **three** backings, never a heuristic
teeth: breaks-on "`stale` is a heuristic guess (e.g., an age/TTL timer) — it reads `false` while `h3` is genuinely drifted, or `true` while all three backings are clean"
gen: conformance # reuses the index drift-oracle as the mock; held-out 3-backing OR (vs the 2-backing base)

### SCN-RETR-4a-2 — held-out: the poke's event source is the tool-call hook (happy)

source: REQ-RETR-4a
Given the harness tool-call hook (the push tier of TOOLS-11) observing `Read(crates/inventory/src/reserve.rs)` over Fixture C′
When the poke pipeline runs
Then scope `P = file:inventory/reserve` is **inferred from the tool-call path** (not from an explicit query) and drives the poke
teeth: breaks-on "the poke is sourced from an explicit `atlas-query` call instead of the tool-call hook — inventory navigation that never issues a query never pokes"
gen: conformance # differential vs `retrieval/ref/poke.ts` over Fixture C′

### SCN-RETR-4b-2 — held-out: a single-file Edit is a navigation signal (happy)

source: REQ-RETR-4b
Given the tool call `Edit(crates/inventory/src/restock.rs)` on one file path
When the classifier runs
Then it is classified `navigate(file:inventory/restock)` — scope = that file's node (`Q`)
teeth: breaks-on "a single-file `Edit` is not treated as navigation — the classifier returns `suppress` and no scope is ever resolved"
gen: conformance

### SCN-RETR-4c-2 — held-out: a multi-file Glob is suppressed (guard)

source: REQ-RETR-4c
Given `Glob(pattern="**/*.rs", 40 matches across inventory+shipping)`
When the classifier runs
Then it returns `suppress` — a multi-file span has **no single scope**, so **no poke** fires
teeth: breaks-on "the multi-file Glob infers a scope (e.g., the first match's file) and fires a poke"
gen: conformance

### SCN-RETR-4d-2 — held-out: a Bash path-shaped arg is not navigation (guard)

source: REQ-RETR-4d
Given the tool call `Bash("cargo build -p inventory")` carrying the path-shaped arg `-p inventory`
When the classifier runs
Then it returns `suppress` — a command's path-shaped argument is not a location, so **no** scope is inferred
teeth: breaks-on "the classifier parses `-p inventory` as a location and infers scope `crate:inventory` from a Bash command"
gen: conformance

### SCN-RETR-4e-2 — held-out: only a resolved single-file navigation drives a scope-change (happy)

source: REQ-RETR-4e
Given a stream `[Glob(40 files), Bash("cargo test"), Read(crates/inventory/src/restock.rs)]`
When the scope-change engine consumes the stream
Then only the `Read` (single-file navigation) moves the current scope to `Q = file:inventory/restock`; the Glob and Bash move nothing
teeth: breaks-on "a non-navigation call (the Glob) drives a scope-change — the current scope moves on a multi-file span"
gen: conformance

### SCN-RETR-4f-2 — held-out: crossing into a new scope fires an unasked poke (happy)

source: REQ-RETR-4f
Given the current scope settled at `Q = file:inventory/restock` (not previously poked this session)
When the navigator crosses into `Q`
Then a poke fires **unasked**, injecting a compact notice (`≤ ~150` tok) + `Q`'s pack
teeth: breaks-on "crossing into a new settled scope fires no poke — the pack is only delivered on an explicit request"
gen: conformance

### SCN-RETR-4g-2 — held-out: a poke fires only after the scope settles across N=2 calls (happy)

source: REQ-RETR-4g
Given the sequence `[Read(P), Read(Q), Read(Q)]` — `Q` becomes current at call 2 and stays current at call 3
When the debounce automaton (settle window `N = 2` consecutive tool calls) processes the stream
Then `Q`'s poke fires only at call 3, once `Q` has settled as the current scope across 2 consecutive calls
teeth: breaks-on "the settle window is mutated to `N = 1` — `Q`'s poke fires at call 2 on the first crossing (poke-storm on rapid hopping)"
gen: conformance # the debounce is over a COUNT of calls, not wall-clock — nothing real-time

### SCN-RETR-4h-2 — held-out: a transient in-and-out crossing does not poke (guard)

source: REQ-RETR-4h
Given the sequence `[Read(P), Read(Q), Read(P)]` — `Q` appears at call 2 then is gone at call 3 (never settles)
When the debounce automaton processes the stream
Then `Q` fires **no** poke — the crossing was transient (present for < `N = 2` consecutive calls)
teeth: breaks-on "the transient single-call crossing into `Q` fires a poke at call 2 — hysteresis is absent"
gen: conformance

### SCN-RETR-4i-2 — held-out: an already-poked scope does not re-poke (guard)

source: REQ-RETR-4i
Given a session where `Q`'s poke has already fired (so `Q ∈ poked`), then the stream `[Read(R), Read(Q), Read(Q)]` re-enters `Q`, and the seat then reasons over the already-injected pack (emitting no new path event)
When the automaton reprocesses `Q` and the reasoning turn passes
Then **no** second poke fires — a poke is at most once per scope per session, and reasoning over an injected pack emits no path event to re-trigger
teeth: breaks-on "re-entering an already-poked scope re-pokes — `Q` is injected a second time in one session"
gen: conformance

### SCN-RETR-5a-2 — held-out: only the current scope's covering nodes are exposed (happy)

source: REQ-RETR-5a
Given the navigator at scope `P = file:inventory/reserve`, covered by nodes `{m1, m2, m3}` (inventory crate roll-up) over Fixture A′
When `projectTools(P)` runs
Then the live MCP tool set is exactly `coveringNodes(P) = {m1, m2, m3}` — no node outside `P`'s covering set is exposed
teeth: breaks-on "a node covering a _different_ scope (e.g., `m4`, restock-only) is exposed while at `P` — off-scope nodes leak into the tool surface"
gen: conformance # differential vs `retrieval/ref/project.ts` over Fixture A′

### SCN-RETR-5b-2 — held-out: leaving a scope retracts its node-tools (happy)

source: REQ-RETR-5b
Given the tool set `{m1, m2, m3}` live for scope `P`, then the navigator moves to scope `Q = file:inventory/restock`
When the scope-change is processed
Then `P`'s node-tools retract and the live set becomes `coveringNodes(Q) = {m1, m2, m4}` — the tool surface follows the navigator, never accumulating
teeth: breaks-on "on leaving `P` its tools are not retracted — the live set accumulates `coveringNodes(P) ∪ coveringNodes(Q) = {m1,m2,m3,m4}`"
gen: conformance

### SCN-RETR-5c-2 — held-out: the whole graph is never projected at once (guard)

source: REQ-RETR-5c
Given the full Fixture A′ graph of 8 nodes and a navigator at scope `P` covered by 3
When the tool surface is inspected at any step of an enter/exit sequence
Then the live tool set is always the ≤3-node covering set, **never** the whole 8-node graph
teeth: breaks-on "the projector exposes all 8 inventory nodes simultaneously — the whole graph is projected as tools at once"
gen: conformance

### SCN-RETR-7a-2 — held-out: each injection kind stays within its sweet-spot cap (happy)

source: REQ-RETR-7a
Given the cap-table `{Awareness ~400, Orientation ~250, projectMem ~500, own ~1.5K, pack ~2K, related ~300, protocols ~500 shared, poke ~150}` and **held-out Fixture B″**'s per-kind `tokenEstimate`s
When each kind's cap **value** is read from the shared cap-table under `cl100k_base` and its pinned `tokenEstimate` checked against it
Then each kind's cap **== its ratified pinned value** — `own`'s cap **== 1500** (Fixture B″'s `own = 1450 ≤ 1500`), `pack` **== 2000** (`1900 ≤ 2000`), `poke` **== 150** (`140 ≤ 150`), `related` **== 300** (`280 ≤ 300`) — and each tokenEstimate is ≤ that cap
teeth: breaks-on "the `own` cap drifts to `~1.6K` — `own`'s cap no longer **== 1500**, so the pinned-value assertion flips (a drift the `1450 ≤ cap` inequality alone would silently tolerate)"
gen: conformance # differential vs `retrieval/ref/caps.ts` over held-out Fixture B″

### SCN-RETR-7b-2 — held-out: no single kind consumes the whole ceiling (orchestrator profile) (guard)

source: REQ-RETR-7b
Given the **orchestrator** cap-table profile (`projectMem ~800`, not `~500`) and the `~5K` ceiling
When each cap is compared to the ceiling
Then the largest cap (`pack ~2K == 2000`) is strictly less than the `~5K == 5000` ceiling — and even the orchestrator-raised `projectMem (~800)` is far under; no single kind's cap equals or exceeds the whole ceiling
teeth: breaks-on "the `pack` cap is raised to `~5K` (== the ceiling) — a single kind can consume the entire injection budget"
gen: conformance # held-out over the documented orchestrator cap-table variant (RETR-7a: projectMem orch ~800)

### SCN-RETR-7c-2 — held-out: Awareness and Orientation are derived, never written (guard)

source: REQ-RETR-7c
Given the injection kinds `Awareness`, `Orientation`, and the orchestrator's `projectMem` (`~800`) per-member entry
When the write path is audited
Then `Awareness` + `Orientation` are **derived** (0 write sites); only `projectMem` (the orchestrator's per-member entry) is written
teeth: breaks-on "a code path writes `Orientation` to a member file — Orientation becomes a written entry instead of derived"
gen: conformance

### SCN-RETR-7d-2 — held-out: caps enforced under the pinned cap measure (happy)

source: REQ-RETR-7d
Given the **held-out** Fixture A′ emitted pack (its `tokenEstimate` measured for cap enforcement)
When enforcement computes the count
Then it uses the pinned `cl100k_base` `Pack.tokenEstimate = 1790` — a deterministic, byte-identical count for equal input; the RETR-6 ceiling is enforced under the same measure
teeth: breaks-on "enforcement is computed under an unpinned/different tokenizer (e.g., `p50k_base`) — the same inventory pack yields a different count across runs and the byte-identity gate (INDEX-8/RETR-1) breaks"
gen: conformance

### SCN-RETR-8a-2 — held-out: caps are a function of the ledger's observed hits (happy)

source: REQ-RETR-8a
Given the reference cap-table reading the ledger over Fixture B″, then the ledgered `hits` for `pack` are mutated upward
When the caps are recomputed
Then `pack`'s cap **changes** in response — proving the cap is a function of observed `hits`, never a static constant divorced from usage
teeth: breaks-on "the cap is a hardcoded constant — mutating the ledgered `hits` for `pack` leaves its cap unchanged (caps set by guesswork, not observed use)"
gen: conformance # differential vs `retrieval/ref/ledger.ts` feeding the cap-table; held-out mutates `pack` (vs base `own`)

### SCN-RETR-8b-2 — held-out: per-kind hitRate drives the RETR-6 drop order (happy)

source: REQ-RETR-8b
Given the drop-policy reading Fixture B″'s per-kind `hitRate`, then `Orientation`'s `hitRate` is mutated to `0.05` (below `poke`'s `0.15`)
When the drop order is recomputed
Then `Orientation` now drops before `poke` — the drop order is driven by observed `hitRate`, least-used first
teeth: breaks-on "the drop order ignores `hitRate` and uses a static rank — mutating `Orientation`'s hitRate leaves the drop order unchanged (`poke` still drops before `Orientation`)"
gen: conformance

### SCN-RETR-9a-2 — held-out: a malformed scope yields empty pack / empty tools / no poke (guard)

source: REQ-RETR-9a
Given a **held-out** malformed scope input `scope = "::inventory//..//"` (no covering territory) against the Fixture A′ surface
When `pack` / `projectTools` / `poke` are each invoked on it
Then `pack.invariants = []`, `projectTools = []`, and `poke = null` — empty structures, never a nearest-match fallback
teeth: breaks-on "a malformed scope returns a nearest-match non-empty inventory pack (a partial guess) instead of an empty pack"
gen: conformance # PBT-fuzz differential vs the total reference surface `retrieval/ref/*.ts`

### SCN-RETR-9b-2 — held-out: a malformed scope never throws (guard)

source: REQ-RETR-9b
Given a **held-out** PBT-fuzz stream of arbitrary + malformed scopes (8k cases: control-char paths, deeply-nested `../` chains, symlink-loop paths, integer-overflow-length strings) run side-by-side against the total reference surface
When each retrieval entry point is invoked on each fuzzed scope
Then **0 exceptions** are thrown — every call returns an empty/`null` result, and prod matches ref
teeth: breaks-on "a control-char / symlink-loop scope propagates an uncaught exception (a `RangeError`) instead of returning an empty result"
gen: conformance # PBT-fuzz differential over a held-out fuzz generator distinct from the base 10k-case stream

### Held-out blast-radius fixture (for RETR-11′)

Unit `w` with `M = 15` reverse-closure dependents. Rank exemplars: `e_hub` (T1, ppr 0.85, distance 2) and
`e_leaf` (T1, ppr 0.30, distance 1); one node `e_far` at distance 3. Forward `dependencies` = 11. Bounds
`maxHops = 2`, `K = 8` (frozen).

### SCN-RETR-11a-2 — held-out: dependents are cut at maxHops = 2 (happy)

source: REQ-RETR-11a
Given the reverse closure of `w` including `e_far` at hop-distance 3
When the bounder cuts the closure at `maxHops = 2`
Then `e_far` (distance 3) is **excluded** — only nodes within 2 hops of `w` survive the cut
teeth: breaks-on "the hop cut is mutated to `maxHops = 3` — `e_far` (distance 3) leaks into the dependents band"
gen: conformance # differential vs `retrieval/ref/bound.ts` over held-out unit `w`

### SCN-RETR-11b-2 — held-out: dependents ranked by the deterministic total order (happy)

source: REQ-RETR-11b
Given `e_hub` (ppr 0.85, distance 2) and `e_leaf` (ppr 0.30, distance 1), both T1
When the bounder orders `dependents` by `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)`
Then `e_hub` ranks **before** `e_leaf` — the high-PPR hub 2 hops out outranks the low-PPR leaf 1 hop in (distance is demoted to a tiebreak)
teeth: breaks-on "distance is promoted to the primary key — the closer `e_leaf` (1 hop) outranks the higher-PPR `e_hub` (2 hops)"
gen: conformance

### SCN-RETR-11c-2 — held-out: dependents capped at K = 8 (happy)

source: REQ-RETR-11c
Given the ranked reverse closure of `w` with `M = 15` dependents
When the bounder caps the set
Then it returns exactly `K = 8` one-line `RelatedFact`s — the top-8 by rank
teeth: breaks-on "the cap is raised to `K = 12` — 12 dependents are returned, blowing the hard count"
gen: conformance

### SCN-RETR-11d-2 — held-out: closure > K → truncate after ranking, honest meta (guard)

source: REQ-RETR-11d
Given the `M = 15` closure exceeding `K = 8`
When the bounder truncates
Then it truncates **after** ranking (the returned 8 are the top-8 by rank, a rank-prefix) and carries `dependents_meta = {truncated: true, total: 15, returned: 8}` — the honest pre-truncation count
teeth: breaks-on "truncation happens **before** ranking (the first 8 by insertion order are kept) — or `total` is reported as `8` (== returned), hiding the 7 dropped dependents"
gen: conformance

### SCN-RETR-11e-2 — held-out: forward dependencies use the same rank and K = 8 (happy)

source: REQ-RETR-11e
Given unit `w` with 11 forward `dependencies`
When the bounder returns the `dependencies` band
Then it is ranked by the same `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)` order and capped at the same `K = 8`, with honest meta (`{truncated: true, total: 11, returned: 8}`)
teeth: breaks-on "forward `dependencies` are returned unbounded — all 11 are emitted with no `K = 8` cap (only `dependents` is bounded)"
gen: conformance

### Held-out off-atlas fixture (for RETR-13′)

Territory `crate:shipping` served on **8** turns, of which **2** required a `Read`/`Grep` outside the surfaced
scope-set ⇒ `offAtlasRate = 2/8 = 0.25`. A no-history territory `crate:warehouse` has `served = 0`.

### SCN-RETR-13a-2 — held-out: the off-atlas rate is logged per territory (happy)

source: REQ-RETR-13a
Given territory `crate:shipping` served on 8 turns, of which 2 required a `Read`/`Grep` **outside** the surfaced scope-set to finish
When the coverage ledger computes the off-atlas rate
Then it logs `crate:shipping → offAtlasRate = offAtlasReads/served = 2/8 = 0.25`
teeth: breaks-on "out-of-scope reads are not counted — the off-atlas rate stays `0` despite the 2 misses (the silent under-coverage stays invisible)"
gen: conformance # differential vs `retrieval/ref/offatlas.ts` over held-out `crate:shipping`

### SCN-RETR-13c-2 — held-out: the off-atlas ledger is deterministic (happy)

source: REQ-RETR-13c
Given the same `crate:shipping` served-turn read multiset **accumulated in two different orders** (the reads replayed in a permuted sequence)
When the per-territory off-atlas ledger is computed each time
Then both serialize **byte-identically** (`offAtlasRate = 0.25` both times) — the rate is order-independent (a commutative, pinned reduction)
teeth: breaks-on "the ledger accumulates in float/iteration order (order-dependent) — the two permuted accumulations produce different rate bytes, a bug identical-replay would miss"
gen: conformance

### SCN-RETR-13d-2 — held-out: a territory with no served history yields rate 0 (guard)

source: REQ-RETR-13d
Given territory `crate:warehouse` with `served = 0` (no served history)
When its off-atlas rate is computed
Then it yields `offAtlasRate = 0` — not `NaN`, not undefined
teeth: breaks-on "the no-history case computes `0/0 = NaN` — a territory never served reports a garbage rate instead of `0`"
gen: conformance

### SCN-RETR-13e-2 — held-out: a territory with no served history never throws (guard)

source: REQ-RETR-13e
Given the same `served = 0` territory `crate:warehouse`
When `offAtlas()` is invoked on it
Then it returns rate `0` and **does not throw** — the no-history path is total
teeth: breaks-on "the no-history path throws a divide-by-zero exception instead of returning rate `0`"
gen: conformance

## Wave-H coverage delta (held-out leg)

- **Conformance / reference-model REQ SCNs (base wave):** 33 (RETR-1 ×1, RETR-3 ×3, RETR-4 ×9, RETR-5 ×3,
  RETR-7 ×4, RETR-8 ×2, RETR-9 ×2, RETR-11 ×5, RETR-13 ×4).
- **Held-out `-2` scenarios added:** **33** — one per conformance SCN, **all** conformance/reference-model
  REQs covered (RETR-1/3/4/5/7/8/9/11/13-non-residue), each with its **own** `teeth: breaks-on`, `gen:
conformance`, over a genuinely independent fixture.
- **Held-out fixtures added:** `Fixture A′` (`crate:inventory` — 8 nodes, different tiers/ppr/hits/tok),
  `Fixture B″` (held-out injection budget — different tokenEstimates/hitRates over the frozen caps),
  `Fixture C′` (inventory tool-call scopes `P/Q/R`), the RETR-11′ blast-radius fixture (`w`, `M=15`/`11`),
  the RETR-3′ stale-pack fixture (`{h1,h2,h3}`, `h3` drifted), the RETR-13′ off-atlas fixture
  (`crate:shipping` 2/8=0.25 · `crate:warehouse` served 0).
- **Skipped (noted inline above):** `gen: PBT` 30 (RETR-2/6/10/12 → held-out assurance = the PBT
  law-witnesses in `properties-ret.md`) · `gen: residue` 2 (SCN-RETR-6b-2 `κ`, SCN-RETR-13b-1 `θ` —
  DEFINE-parametric, exempt+flagged) · delegated acceptance 0.
- **Independence spot-check (5):** SCN-RETR-1-2 (inventory vs billing territory) · SCN-RETR-4g-2 (scopes
  `P/Q` vs `A/B`) · SCN-RETR-7a-2 (Fixture B″ tokenEstimates vs B) · SCN-RETR-11b-2 (unit `w`, ppr
  0.85/0.30 vs `u`, 0.90/0.20) · SCN-RETR-13a-2 (`crate:shipping` 2/8 vs `crate:billing` 3/10) — each `-2`
  exercises the SAME branch over a **different** fixture instance; a fixture-1-hardcoded impl fails the leg.
- **teeth:** 33/33 `-2` SCN name the exact mutant they flip to BROKEN on, over the held-out data; none
  vacuous; cap assertions keep the pinned `cl100k_base` `tokenEstimate` discipline.
- **[NEEDS RECONCILIATION]:** none new. The two open DEFINE dependencies (`θ` off-atlas threshold, `κ`
  hitRate-tie secondary key) are unchanged and remain held-out-**exempt** by the residue rule.
