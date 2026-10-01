# Goldens — Block TLS (tools/delivery) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-tls.md`; every TLS INV method-tagged; **no FSPEC** — TLS consumes KRN's `FSPEC-merge`, authors none) ·
> **owner:** charlie (FORGE). TLS = the **delivery layer**: read/subscribe projections over the kernel store + one governed write-door (`atlas-emit`).
>
> **Derivation (generated from each INV's S2 method-tag — never hand-authored where a generator exists):**
>
> - **TOOLS-3 / TOOLS-10** are `PBT` (shape = cross-transport determinism, a universally-quantified equivalence).
>   Their SCNs are **concrete witness instances of the equivalence law** — `cli(x) ≡ mcp(x)` (TOOLS-3) and
>   `mcp(a) ≡ poke(a) ≡ cli(a)` (TOOLS-10, tri-transport byte-identity) against the **one handler**
>   (`tools/ref/handler.ts`). `gen: PBT`.
> - **TOOLS-1/2/4/5/6/7/8/9/11/11a/12/13/14/15** are `reference-model` → **conformance / differential** against
>   the named build-language mock (`tools/ref/*.ts`, reused as the unit-test mock; anti-rot). `gen: conformance`.
> - **residue: none.** Every TLS INV has a pure oracle (a reference tool or the shared handler); there is no
>   hand-written tail (unlike KRN-12a).
>
> **Two standing notes carried from S2 (load-bearing for teeth _direction_):**
>
> - **Read-only projection = a _positive_ property, never a `formal` one.** The tri-transport node handler
>   (TOOLS-10c), the per-node read projections (TOOLS-1d), and `atlas doctor` (TOOLS-12) open **no** write path.
>   The golden asserts a **write attempt via the projection is refused** and the handle exposes **no**
>   store-mutating method — a reference-model property of the same handler, not a formal model.
> - **Write-door _security-exploitability_ is billy / FR-12 (FORTRESS), NOT authored here.** TOOLS-1c / 15b / 15c
>   assert the **functional** refusal (a back-channel / direct / ungrounded write cannot land or is rejected at
>   read). The **adversarial exploit** — a shell-armed seat red-teaming the append-only/permission model — is
>   billy's security review; **no exploit golden is authored in this block** (flagged in the completion card).

---

## Concrete fixture universe (reused across the block)

| id       | kind                     | concrete value                                                                                                                                   |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ | -------- | --- |
| N1       | Knowledge node           | nodeKey `claim:acme-arr-2024`, content address `cas:9b21`, claim "ACME ARR 2024 = $4.2M", grounded at `source@sha = reference/finance.md@a1b2c3` |
| N1′      | ungrounded node          | same nodeKey, claim "ACME ARR 2024 = $9.9M" — **not** present at `reference/finance.md@a1b2c3`                                                   |
| N2       | stale pack node          | nodeKey `claim:acme-hq`, `stale:true`                                                                                                            |
| dm       | **mechanical** DriftItem | anchor moved `reference/finance.md#arr` `@a1b2c3 → @d4e5f6`; the claim still re-derives at `@d4e5f6`                                             |
| ds       | **semantic** DriftItem   | claim text changed `$4.2M → $5.0M`; does **not** re-derive at source                                                                             |
| D        | drift set                | `{dm, ds}` ⇒ `                                                                                                                                   | mechanical | =1`, ` | semantic | =1` |
| T        | move-in tree             | territories `{finance/, auth/, kernel/}`; `auth/` matches a T0 keyword (`security-invariant`)                                                    |
| H_sdk    | harness                  | SDK in-process, `canPropagateMcp:true`                                                                                                           |
| H_agents | harness                  | `.claude/agents`, `canPropagateMcp:false`                                                                                                        |
| S_ro     | seat                     | a governed seat with **only** the `Read` grant (no tool grant)                                                                                   |

Governance surface (TOOLS-1) = exactly `{atlas-init, atlas-query, atlas-emit, atlas-reconcile}`. Pull ladder
(TOOLS-11) = `SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI`.

### Held-out fixture universe (Wave H · `held_out: true` second leg — INDEPENDENT data, SAME behaviour)

Each `gen: conformance` SCN carries a second, independent fixture the builder never sees; overfit ⇒ the held-out
leg fails. These use **different concrete data hitting the same branch** — grounded siblings of the base universe,
no new behaviour, TOOLS-1 preserved (no fixture adds a governance tool beyond the five, nor a write door beyond the two governed doors `atlas-emit`/`atlas-link`, ADR-0003):

| id            | kind                     | concrete value                                                                                                                  |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------- | -------- | ---- |
| N3            | Knowledge node           | nodeKey `claim:acme-ceo`, claim "ACME CEO = Jane Roe", grounded at `reference/people.md@f7e8d9`                                 |
| N3′           | ungrounded node          | same nodeKey, claim "ACME CEO = John Doe" — **not** present at `reference/people.md@f7e8d9`                                     |
| dm₂           | **mechanical** DriftItem | anchor moved `reference/people.md#ceo` `@f7e8d9 → @g8h9i0`; still re-derives                                                    |
| dm₃           | **mechanical** DriftItem | anchor moved `reference/kernel.md#inv` `@c1d2e3 → @f4g5h6`; still re-derives                                                    |
| ds₂, ds₃      | **semantic** DriftItems  | claim text changed; do **not** re-derive at source                                                                              |
| D₂ / D₂′ / D₃ | drift sets               | `{dm₂,ds₂}` · `{dm₂,dm₃}` (`                                                                                                    | semantic | =0`) · `{dm,ds,ds₃}` (` | semantic | =2`) |
| T′            | move-in tree             | territories `{docs/, infra/, api/}`; **no** T0 keyword (empty flags)                                                            |
| S_ro2         | seat                     | grants `{Read, Grep}` — still **no** tool grant                                                                                 |
| H_agents2     | harness                  | second `.claude/agents`-style harness, `canPropagateMcp:false`                                                                  |
| Δ₂            | PERSIST-14 delta         | `diff(shaB,shaC) = { added:[acme-hq-2025], edited:[acme-ceo], superseded:[auth-mfa], decayed:[acme-office] }`, each with `prov` |

---

## REQ-TOOLS-1 — governed write-door governance surface

### REQ-TOOLS-1a — governance surface is the derived six tools (happy)

### SCN-TOOLS-1a-1 — the surface enumerates to the derived six (happy)

source: REQ-TOOLS-1a
Given the tools layer wired against `tools/ref/store.ts`, with its governance surface enumerated from the frozen `GOVERNANCE_SURFACE` constant
When the surface set is listed
Then it is exactly `{atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link, atlas-memory-emit}` — surface count `== 6` (ADR-0006 Decision 2: derived + budgeted, not a fixed count; WP-11.W8 added `atlas-memory-emit`)
teeth: breaks-on "a seventh governance tool `atlas-delete` is registered on the surface — surface count `== 7`"
gen: conformance # differential vs `tools/ref/store.ts` 6-tool surface

### SCN-TOOLS-1a-2 — the surface still counts six with all read projections wired (happy · held-out)

source: REQ-TOOLS-1a
held*out: true
Given the tools layer wired against `tools/ref/store.ts` with the read projections (node-tools, `atlas doctor`, `atlas-diff`) ALSO present alongside the governance surface
When the \_governance* surface set is enumerated (read projections excluded by construction)
Then it is still exactly `{atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link, atlas-memory-emit}` — surface count `== 6`; the co-present read projections do not swell the governance surface
teeth: breaks-on "a seventh governance tool `atlas-purge` is registered on the surface — surface count `== 7`"
gen: conformance # held-out · different setup (read projections co-present), same 6-tool surface behaviour vs `tools/ref/store.ts`

### REQ-TOOLS-1b — every write flows through a governed door (happy)

### SCN-TOOLS-1b-1 — the write surface is exactly the three governed doors (happy)

source: REQ-TOOLS-1b
Given the tools layer after wiring all six tools plus the read projections
When every store-mutating entry point is enumerated
Then the write set is exactly `{atlas-emit, atlas-link, atlas-memory-emit}` — `WRITE_PATHS == {atlas-emit, atlas-link, atlas-memory-emit}` (`writePaths == 3`), each a governed door (KNOW-11 authz + ratifier + fail-closed-visible refusal); no other entry mutates the store (ADR-0003, superseded count by ADR-0006 Decision 2)
teeth: breaks-on "`atlas-reconcile` grows its own direct store-mutate call — an ungoverned write path outside `{atlas-emit, atlas-link, atlas-memory-emit}` (`writePaths == 4`)"
gen: conformance # `tools/ref/store.ts` asserts `WRITE_PATHS == {atlas-emit, atlas-link, atlas-memory-emit}`

### SCN-TOOLS-1b-2 — still exactly the three governed doors after wave-close and auto-re-ground are wired (happy · held-out)

source: REQ-TOOLS-1b
held_out: true
Given the tools layer with the wave-close absorb path (TOOLS-9) and `--accept-reground` (TOOLS-13) both wired — each routing its write through `atlas-emit`
When every store-mutating entry point is enumerated across the fully-wired layer
Then the write set is still exactly `{atlas-emit, atlas-link, atlas-memory-emit}` — `writePaths == 3`; the absorb and re-ground paths reuse `atlas-emit`, they do not add a fourth entry
teeth: breaks-on "`atlas-init` grows its own direct store-mutate call to persist move-in — an ungoverned write path outside `{atlas-emit, atlas-link, atlas-memory-emit}` (`writePaths == 4`)"
gen: conformance # held-out · different consumers wired (TOOLS-9/13), same `writePaths==3` behaviour vs `tools/ref/store.ts`

### REQ-TOOLS-1c — reject back-channel writes (guard)

### SCN-TOOLS-1c-1 — a write bypassing atlas-emit cannot land (guard)

source: REQ-TOOLS-1c
Given a back-channel call `store.write(row_for_N1)` that bypasses `atlas-emit`
When the store processes it
Then it is refused — no row not produced by the `atlas-emit` grounded path enters the store (`ungroundedRows == 0`)
teeth: breaks-on "the back-channel write lands — a row not produced by `atlas-emit` is persisted and served"
gen: conformance # functional refusal only; adversarial _exploitability_ of this door = billy / FR-12, not authored here

### SCN-TOOLS-1c-2 — a back-channel write of a different ungrounded row cannot land (guard · held-out)

source: REQ-TOOLS-1c
held_out: true
Given a distinct back-channel call `store.write(row_for_N1′)` (the ungrounded "$9.9M" row) that bypasses `atlas-emit`
When the store processes it
Then it is refused — no row not produced by the `atlas-emit` grounded path enters the store (`ungroundedRows == 0`)
teeth: breaks-on "the back-channel `N1′` write lands — an ungrounded row is persisted and served without passing `atlas-emit`"
gen: conformance # held-out · different row (N1′) via the back-channel, same functional refusal; exploitability still billy / FR-12

### REQ-TOOLS-1d — read projections carry no write authority (happy)

### SCN-TOOLS-1d-1 — a write via a read projection is refused (happy)

source: REQ-TOOLS-1d
Given the per-node read projection `own_finance` (a RETR-5 / TOOLS-10 node-tool) resolving N1
When the projection handle is inspected and a write is attempted through it
Then the handle exposes **no** store-mutating method and the write attempt is refused — the projection opens no write door (positive property: a projection opens NO write door)
teeth: breaks-on "the read-projection handle grows a `.write()`/`.set()` method — a write via the projection lands, opening an ungoverned write path outside the governed doors"
gen: conformance # reference-model property of the read handle (no store-mutating method); NOT a formal model

### SCN-TOOLS-1d-2 — a different node projection also exposes no write method (happy · held-out)

source: REQ-TOOLS-1d
held_out: true
Given the per-node read projection `own_auth` (a RETR-5 / TOOLS-10 node-tool) resolving a node in the `auth/` territory
When the projection handle is inspected and a write is attempted through it
Then the handle exposes **no** store-mutating method and the write attempt is refused — this projection, like `own_finance`, opens no write door
teeth: breaks-on "the `own_auth` read-projection handle grows a `.put()` method — a write via the projection lands, opening an ungoverned write path outside the governed doors"
gen: conformance # held-out · different node projection (`own_auth`), same no-write-authority property of the read handle

---

## REQ-TOOLS-2 — tools pure and total

### REQ-TOOLS-2a — tools pure and total (happy)

### SCN-TOOLS-2a-1 — identical args → identical result, no side effect (happy)

source: REQ-TOOLS-2a
Given `atlas-query(scope="src/finance/arr.rs")` run twice on byte-identical args over the total reference wrapper `tools/ref/tool.ts`, side-by-side with the production tool
When each invocation returns
Then both runs return the byte-identical `Verdict` and mutate nothing (store byte-identical before/after) — pure ∧ total, and prod matches ref
teeth: breaks-on "the tool reads wall-clock / a mutable cache and returns a different result on the second identical call (impure)"
gen: conformance # differential vs the total `tools/ref/tool.ts` wrapper

### SCN-TOOLS-2a-2 — a second tool on different args is also pure and total (happy · held-out)

source: REQ-TOOLS-2a
held_out: true
Given `atlas-init(tree=T)` run twice on byte-identical args over the total reference wrapper `tools/ref/tool.ts`, side-by-side with the production tool
When each invocation returns
Then both runs return the byte-identical `InitOut` and mutate nothing (store byte-identical before/after) — pure ∧ total, and prod matches ref
teeth: breaks-on "`atlas-init` reads a mutable move-in cache and returns a different skeleton on the second identical call (impure)"
gen: conformance # held-out · different tool + args (`atlas-init(T)`), same purity/totality behaviour vs `tools/ref/tool.ts`

### REQ-TOOLS-2b — malformed argument fails closed (guard)

### SCN-TOOLS-2b-1 — a malformed arg yields a structured rejection, never a throw (guard)

source: REQ-TOOLS-2b
Given `atlas-query` and a malformed argument (`scope: 42`, a number where a path string is required)
When the tool is invoked on it
Then it returns a structured `Verdict{rejected:true, guidance}` — it does **not** throw (`exceptions == 0`)
teeth: breaks-on "the malformed arg propagates an uncaught `TypeError` instead of a structured rejected verdict"
gen: conformance # PBT-fuzz differential vs `tools/ref/tool.ts` no-throw property (tag stays reference-model per §K7)

### SCN-TOOLS-2b-2 — a differently-malformed arg on another tool also fails closed (guard · held-out)

source: REQ-TOOLS-2b
held_out: true
Given `atlas-emit` and a malformed argument (`node: "acme-arr"`, a bare string where a structured node object is required)
When the tool is invoked on it
Then it returns a structured `Verdict{rejected:true, guidance}` — it does **not** throw (`exceptions == 0`)
teeth: breaks-on "the malformed string arg propagates an uncaught `TypeError` from a property access instead of a structured rejected verdict"
gen: conformance # held-out · different tool + malformed shape (string-for-object), same no-throw fail-closed property vs `tools/ref/tool.ts`

---

## REQ-TOOLS-3 — CLI ≡ MCP on one schema (PBT · cross-transport determinism)

### REQ-TOOLS-3a — CLI and MCP parity on one schema (happy)

### SCN-TOOLS-3a-1 — one input, two transports, byte-identical result (happy)

source: REQ-TOOLS-3a
Given the input `x = {scope:"src/finance/arr.rs"}` valid under the one published schema, run through both the `cli` and `mcp` adapters over the one handler `tools/ref/handler.ts`
When `cli(x)` and `mcp(x)` are computed
Then `cli(x) ≡ mcp(x)` — byte-identical `Verdict`, the same schema-checked handler behind both transports
teeth: breaks-on "the MCP adapter wraps the result in a transport envelope `{mcp:{…}}` (re-serializes) — `mcp(x) ≠ cli(x)` byte-wise"
gen: PBT # witness of the equivalence law `∀x. cli(x) ≡ mcp(x)` (method-tags-tls §INV-TOOLS-3)

### REQ-TOOLS-3b — CLI and MCP must not diverge (guard)

### SCN-TOOLS-3b-1 — a malformed input rejects identically on both transports (guard)

source: REQ-TOOLS-3b
Given the malformed input `x = {scope: 42}` presented over both the `cli` and the `mcp` adapter
When `cli(x)` and `mcp(x)` are computed
Then both return the **same** structured rejection — the two transports do not diverge in behavior or contract on the identical input
teeth: breaks-on "the MCP adapter coerces `42→\"42\"` (applies a default) and accepts while the CLI rejects — divergent verdicts for the same input"
gen: PBT # witness of `∀x (incl. malformed). cli(x) ≡ mcp(x)` — divergence is the negated property

---

## REQ-TOOLS-4 — every result carries guidance

### REQ-TOOLS-4 — every result carries guidance (happy)

### SCN-TOOLS-4-1 — both the ok and the rejected path carry non-empty guidance (happy)

source: REQ-TOOLS-4
Given an `atlas-query` that resolves (ok) and an `atlas-emit` that rejects N1′ (rejected), both via the reference Verdict constructor `tools/ref/tool.ts`
When each result is inspected
Then every result carries non-empty `Guidance{next, invariant}` — the ok path and the rejected path both name the follow-up and the governing invariant (`emptyGuidance == 0`)
teeth: breaks-on "the rejected path ships `guidance:{}` — a caller hitting the reject is left to guess the follow-up"
gen: conformance # the reference wrapper stamps guidance on every path; a code result with empty guidance diverges

### SCN-TOOLS-4-2 — a different ok/reject pair also carries non-empty guidance (happy · held-out)

source: REQ-TOOLS-4
held_out: true
Given an `atlas-init(T)` that resolves (ok) and an `atlas-reconcile` over `D` that surfaces a semantic drift (the non-clean path), both via the reference Verdict constructor `tools/ref/tool.ts`
When each result is inspected
Then every result carries non-empty `Guidance{next, invariant}` — both the ok path and the drift-surfacing path name the follow-up and the governing invariant (`emptyGuidance == 0`)
teeth: breaks-on "the drift-surfacing path ships `guidance:{}` — a caller told there is semantic drift is left to guess the follow-up"
gen: conformance # held-out · different ok/non-clean pair (init + reconcile), same guidance-totality property vs `tools/ref/tool.ts`

---

## REQ-TOOLS-5 — structural, no-promote move-in

### REQ-TOOLS-5a — move-in is $0-LLM and structural (happy)

### SCN-TOOLS-5a-1 — atlas-init on a tree consults no LLM (happy)

source: REQ-TOOLS-5a
Given `atlas-init` run on tree `T` over the reference `tools/ref/init.ts` (a pure structural walk)
When move-in completes
Then it made `0` LLM calls and produced its output by structural walk alone — `$0`-LLM
teeth: breaks-on "`atlas-init` calls an LLM to classify a territory — move-in is no longer `$0`-LLM / structural"
gen: conformance # differential vs `tools/ref/init.ts` structural mover

### SCN-TOOLS-5a-2 — atlas-init on a different tree also consults no LLM (happy · held-out)

source: REQ-TOOLS-5a
held_out: true
Given `atlas-init` run on a different tree `T′` (territories `{docs/, infra/, api/}`, no T0-keyword hit) over the reference `tools/ref/init.ts` (a pure structural walk)
When move-in completes
Then it made `0` LLM calls and produced its output by structural walk alone — `$0`-LLM
teeth: breaks-on "`atlas-init` calls an LLM to summarise the `api/` territory — move-in is no longer `$0`-LLM / structural"
gen: conformance # held-out · different tree `T′`, same `$0`-LLM structural-walk behaviour vs `tools/ref/init.ts`

### REQ-TOOLS-5b — atlas-init returns skeleton, blast radius, flags (happy)

### SCN-TOOLS-5b-1 — move-in returns all three fields (happy)

source: REQ-TOOLS-5b
Given `atlas-init` run on tree `T`
When the `InitOut` is inspected
Then it carries the territory skeleton `[finance/, auth/, kernel/]` **and** a blast radius **and** the T0-candidate flags `[auth/]` — all three present
teeth: breaks-on "`InitOut` omits the `blastRadius` field — the caller cannot see move-in scope"
gen: conformance

### SCN-TOOLS-5b-2 — move-in on a T0-free tree still returns all three fields (happy · held-out)

source: REQ-TOOLS-5b
held_out: true
Given `atlas-init` run on tree `T′` (territories `{docs/, infra/, api/}`, no T0-keyword hit)
When the `InitOut` is inspected
Then it carries the territory skeleton `[docs/, infra/, api/]` **and** a blast radius **and** the T0-candidate flags `[]` (empty but present) — all three fields present
teeth: breaks-on "`InitOut` omits the `skeleton` field when no T0 candidate is found — the caller cannot see the territory layout"
gen: conformance # held-out · different tree `T′` (empty flags), all three fields still present vs `tools/ref/init.ts`

### REQ-TOOLS-5c — never set a tier above T2 (guard)

### SCN-TOOLS-5c-1 — every territory caps at T2 even a T0-keyword hit (guard)

source: REQ-TOOLS-5c
Given `atlas-init` on `T`, where `auth/` matches the T0 keyword `security-invariant`
When tiers are assigned
Then `max(tier over all territories) == T2` — `auth/` is set to `T2`, never to a tier above `T2` (`T1`/`T0`)
teeth: breaks-on "`atlas-init` sets `auth/` directly to `T0` — a tier above `T2` is assigned during move-in"
gen: conformance # `tools/ref/init.ts` asserts `max(tier)==T2`

### SCN-TOOLS-5c-2 — two T0-keyword hits still both cap at T2 (guard · held-out)

source: REQ-TOOLS-5c
held_out: true
Given `atlas-init` on a tree where **both** `auth/` (matches `security-invariant`) and `kernel/` (matches a second T0 keyword) hit
When tiers are assigned
Then `max(tier over all territories) == T2` — both matches are set to `T2`, never to a tier above `T2` (`T1`/`T0`)
teeth: breaks-on "`atlas-init` sets `kernel/` to `T1` on its keyword hit — a tier above `T2` is assigned during move-in"
gen: conformance # held-out · two T0-keyword hits, same `max(tier)==T2` cap vs `tools/ref/init.ts`

### REQ-TOOLS-5d — never auto-promote a T0 (guard)

### SCN-TOOLS-5d-1 — a T0 candidate is flagged, never promoted (guard)

source: REQ-TOOLS-5d
Given the `auth/` territory flagged `t0Candidate:true` during move-in on `T`
When move-in completes
Then `auth/` remains at `tier==T2` with `t0Candidate:true` — `promotions == 0`; the promotion decision is left to a human/governance step
teeth: breaks-on "`atlas-init` auto-promotes the `auth/` T0-candidate to `T0` — a promotion happens during move-in"
gen: conformance

### SCN-TOOLS-5d-2 — multiple T0 candidates are all flagged, none promoted (guard · held-out)

source: REQ-TOOLS-5d
held_out: true
Given both `auth/` and `kernel/` flagged `t0Candidate:true` during move-in
When move-in completes
Then each remains at `tier==T2` with `t0Candidate:true` — `promotions == 0`; every promotion decision is left to a human/governance step
teeth: breaks-on "`atlas-init` auto-promotes the `kernel/` T0-candidate to `T0` — a promotion happens during move-in"
gen: conformance # held-out · multiple candidates, same `promotions==0` behaviour vs `tools/ref/init.ts`

### REQ-TOOLS-5e — heuristics only flag T0 candidates (happy)

### SCN-TOOLS-5e-1 — the T0 heuristic writes a flag and nothing else (happy)

source: REQ-TOOLS-5e
Given the T0-keyword heuristic firing on `auth/`
When its effect on state is observed
Then it produced exactly `t0Candidate:true` with `tier=='T2'` unchanged — the heuristic _only_ flags, it sets no tier and writes no other state
teeth: breaks-on "the heuristic that detects a T0 candidate also writes `tier=T0` — it does more than flag"
gen: conformance

### SCN-TOOLS-5e-2 — the heuristic on a different territory also only writes a flag (happy · held-out)

source: REQ-TOOLS-5e
held*out: true
Given the T0-keyword heuristic firing on `kernel/`
When its effect on state is observed
Then it produced exactly `t0Candidate:true` with `tier=='T2'` unchanged — the heuristic \_only* flags, it sets no tier and writes no other state
teeth: breaks-on "the heuristic that detects the `kernel/` T0 candidate also rewrites the `blastRadius` — it does more than flag"
gen: conformance # held-out · different territory (`kernel/`), same flag-only effect vs `tools/ref/init.ts`

---

## REQ-TOOLS-6 — bounded read projection

### REQ-TOOLS-6a — query resolves scope to covering territories (happy)

<!-- REQ-TOOLS-6 family AMENDED 2026-08-03 (owner-ratified; ADR-0013 + the ADR-0002 amendment). The 6a/6b/6c
     goldens below are UNCHANGED and still correct: they witness the GOVERNING band, which this amendment does
     not move. The new SCN-TOOLS-6e-* / SCN-TOOLS-6f-* goldens at the end of this section witness the per-fact
     freshness verdict and the two-band split. -->

### SCN-TOOLS-6a-1 — a file scope resolves through the index to its territory (happy)

source: REQ-TOOLS-6a
Given `atlas-query(scope="src/finance/arr.rs")` over the reference `tools/ref/query.ts` with the index reference
When the scope is resolved
Then it resolves through the index to the covering territory `finance/` (and any co-covering territory) — not a global dump
teeth: breaks-on "`atlas-query` ignores the index and returns a global pack — the file scope is not resolved to its covering territory"
gen: conformance

### SCN-TOOLS-6a-2 — a different file scope resolves to its own covering territory (happy · held-out)

source: REQ-TOOLS-6a
held_out: true
Given `atlas-query(scope="src/auth/token.rs")` over the reference `tools/ref/query.ts` with the index reference
When the scope is resolved
Then it resolves through the index to the covering territory `auth/` (and any co-covering territory) — not a global dump
teeth: breaks-on "`atlas-query` returns the `finance/` pack for an `auth/` scope — the file scope is resolved to the wrong territory"
gen: conformance # held-out · different scope (`src/auth/token.rs`→`auth/`), same index-resolution behaviour vs `tools/ref/query.ts`

### REQ-TOOLS-6b — pack is bounded to tier≥T1 (happy)

### SCN-TOOLS-6b-1 — the pack contains only tier≥T1 nodes (happy)

source: REQ-TOOLS-6b
Given `atlas-query` returning a `Pack` for the `finance/` territory
When the pack contents are inspected
Then every node in the pack is `tier ≥ T1` (`0` nodes below T1) and the pack size is within the `≤ ~2K` advisory bound
teeth: breaks-on "the pack leaks a `T2`/below-`T1` node — the `tier ≥ T1` filter is violated"
gen: conformance # tier filter has a real oracle; the `~2K` count is an advisory size bound (size test, not correctness oracle)

### SCN-TOOLS-6b-2 — the auth/ pack also contains only tier≥T1 nodes (happy · held-out)

source: REQ-TOOLS-6b
held_out: true
Given `atlas-query` returning a `Pack` for the `auth/` territory
When the pack contents are inspected
Then every node in the pack is `tier ≥ T1` (`0` nodes below T1) and the pack size is within the `≤ ~2K` advisory bound
teeth: breaks-on "the `auth/` pack leaks a `T2` (below-`T1`) node — the `tier ≥ T1` filter is violated"
gen: conformance # held-out · different territory (`auth/`), same `tier ≥ T1` filter vs `tools/ref/query.ts`

### REQ-TOOLS-6c — stale pack must be re-grounded (guard)

### SCN-TOOLS-6c-1 — a stale pack is surfaced, not trusted (guard)

source: REQ-TOOLS-6c
Given `atlas-query` returning node N2 with `stale:true`
When the pack is delivered
Then `stale:true` is surfaced on the pack and the contract requires re-grounding before the pack is trusted — a stale pack is never served as fresh truth
teeth: breaks-on "the `stale:true` flag is dropped and the stale pack is served as fresh — trusted without re-grounding"
gen: conformance

### SCN-TOOLS-6c-2 — a different stale node is also surfaced, not trusted (guard · held-out)

source: REQ-TOOLS-6c
held_out: true
Given `atlas-query` returning node `claim:acme-ceo` with `stale:true` in the `finance/` pack
When the pack is delivered
Then `stale:true` is surfaced on the pack and the contract requires re-grounding before the pack is trusted — a stale pack is never served as fresh truth
teeth: breaks-on "the `stale:true` flag on `claim:acme-ceo` is dropped and the stale pack is served as fresh — trusted without re-grounding"
gen: conformance # held-out · different stale node (`claim:acme-ceo`), same stale-surfacing behaviour vs `tools/ref/query.ts`

### SCN-TOOLS-6e-1 — a changed unit drifts ONE row; the untouched row stays fresh (happy)

source: REQ-TOOLS-6e
Given two grounded facts under one scope, anchored at two different files, both stored `freshness: FRESH`
When the file under ONE of them changes and `atlas-query` resolves the scope
Then that row's `freshness` reads `DRIFTED` and the other row's reads `FRESH` — the verdict is per fact, not per pack
teeth: breaks-on "the row's verdict is read from the stored write-time `freshness` (which never moves) or is folded to one pack-wide value"
gen: conformance

### SCN-TOOLS-6e-2 — nothing moved ⇒ every row fresh (no false alarm) (guard)

source: REQ-TOOLS-6e
Given grounded facts under a scope and a tree that has not changed since they were authored
When `atlas-query` resolves the scope
Then EVERY row reads `freshness: FRESH`
teeth: breaks-on "the oracle flags everything, which passes the positive case and is not a signal"
gen: conformance

### SCN-TOOLS-6e-3 — the pack-level `stale` watermark is unchanged by the per-fact verdict (guard)

source: REQ-TOOLS-6e
Given a row whose per-fact verdict is `DRIFTED` while the N11 watermark has nothing it can prove
When `atlas-query` resolves the scope
Then the row reads `DRIFTED` and the pack still reports `stale:false` — the two signals answer different questions and neither is computed from the other
teeth: breaks-on "the per-fact verdict is folded into `stale`, silently replacing ADR-0002's watermark with a live recompute"
gen: conformance

### SCN-TOOLS-6e-4 — an underivable verdict fails closed to DRIFTED (guard)

source: REQ-TOOLS-6e
Given a pack producer with no freshness oracle wired, over facts whose stored `freshness` is `FRESH`
When `atlas-query` resolves the scope
Then every row reads `DRIFTED`, never the stored `FRESH`
teeth: breaks-on "the row falls back to the stored write-time freshness and reports a verification that never happened"
gen: conformance

### SCN-TOOLS-6f-1 — an off-lattice tier lands in NEITHER band (guard)

source: REQ-TOOLS-6f
Given a covering set carrying a row with `tier:'T3'` (reachable from a committed `.atlas/` projection no write door saw)
When `atlas-query` mints the pack
Then the row is in neither `invariants` nor `advisory`, and `advisoryDropped` does not count it — it was refused, not truncated
teeth: breaks-on "the advisory band is stated as `!atLeastT1` instead of `isTier(t) && t === 'T2'`, reopening the off-lattice hole facing the other way"
gen: conformance

### SCN-TOOLS-6f-2 — the advisory cap truncates deterministically and reports the drop (guard)

source: REQ-TOOLS-6f
Given more `T2` rows than the ratified 2000-token advisory cap admits
When `atlas-query` mints the pack
Then the advisory band is the cap-wins PREFIX of the caller's order, `advisoryDropped` equals the remainder, served + dropped equals offered, and two runs are byte-identical
teeth: breaks-on "the band is silently truncated with no ledger, or a best-fit fill lets a later smaller row displace an earlier one"
gen: conformance

### SCN-TOOLS-6f-3 — the governing band's budget is reserved (guard)

source: REQ-TOOLS-6f
Given a governing band far larger than the advisory cap, beside an over-cap advisory band
When `atlas-query` mints the pack
Then the governing band is served whole and the advisory band is bounded exactly as it would be alone
teeth: breaks-on "one shared budget lets an advisory proposal displace a ratified invariant"
gen: conformance

### SCN-TOOLS-6f-4 — the PUBLISHED description declares both bands, off the wire (guard)

source: REQ-TOOLS-6f
Given the BUILT `atlas-mcp` server driven over real MCP stdio in a subprocess
When a client calls `ListTools` and reads the `atlas-query` tool `description`
Then it names both returned bands (`invariants` governing `tier>=T1` ratified, `advisory` `T2` that NO ratifier saw, plus `advisoryDropped`) and no longer promises "the merged covering pack of tier>=T1 invariants"
teeth: breaks-on "the two-band amendment lands in the behaviour and the guidance string while the published tool description keeps promising one ratified band — the state shipped between #107 and #193, in which a calling agent is handed unratified rows under a word that says they are ratified (ADR-0013 clause 3)"
gen: conformance

---

## REQ-TOOLS-7 — fail-closed grounded write

### REQ-TOOLS-7a — re-derive citation at source@sha (happy)

### SCN-TOOLS-7a-1 — emit re-derives the claim at the pinned sha (happy)

source: REQ-TOOLS-7a
Given `atlas-emit(N1, source="reference/finance.md@a1b2c3")` where the claim "ACME ARR 2024 = $4.2M" **is** present at `@a1b2c3`, over `tools/ref/emit.ts`
When emit runs
Then it re-derives the citation at `source@sha`, the derivation matches, and the node is emitted
teeth: breaks-on "`atlas-emit` skips re-derivation and trusts the caller's citation — a claim not present at `@a1b2c3` is emitted"
gen: conformance # differential vs `tools/ref/emit.ts` fail-closed writer

### SCN-TOOLS-7a-2 — emit re-derives a different claim at its own pinned sha (happy · held-out)

source: REQ-TOOLS-7a
held_out: true
Given `atlas-emit(N3, source="reference/people.md@f7e8d9")` where N3 = node `claim:acme-ceo` "ACME CEO = Jane Roe" **is** present at `@f7e8d9`, over `tools/ref/emit.ts`
When emit runs
Then it re-derives the citation at `source@sha`, the derivation matches, and the node is emitted
teeth: breaks-on "`atlas-emit` skips re-derivation for `N3` and trusts the caller's citation — a claim not present at `@f7e8d9` is emitted"
gen: conformance # held-out · different node + source (`claim:acme-ceo` @ people.md), same re-derive-at-sha behaviour vs `tools/ref/emit.ts`

### REQ-TOOLS-7b — reject a node that does not re-derive (guard)

### SCN-TOOLS-7b-1 — a non-re-deriving node is rejected, nothing persisted (guard)

source: REQ-TOOLS-7b
Given `atlas-emit(N1′, source="reference/finance.md@a1b2c3")` where "$9.9M" is **not** present at `@a1b2c3`
When emit runs
Then it returns `{emitted:false}` and persists nothing (`store` byte-identical before/after)
teeth: breaks-on "the non-re-deriving node is persisted anyway (`emitted:true`) — an ungrounded fact lands"
gen: conformance

### SCN-TOOLS-7b-2 — a different non-re-deriving node is also rejected (guard · held-out)

source: REQ-TOOLS-7b
held_out: true
Given `atlas-emit(N3′, source="reference/people.md@f7e8d9")` where N3′ = `claim:acme-ceo` "ACME CEO = John Doe" is **not** present at `@f7e8d9`
When emit runs
Then it returns `{emitted:false}` and persists nothing (`store` byte-identical before/after)
teeth: breaks-on "the non-re-deriving `N3′` node is persisted anyway (`emitted:true`) — an ungrounded fact lands"
gen: conformance # held-out · different ungrounded node (`claim:acme-ceo` = wrong CEO), same fail-closed rejection vs `tools/ref/emit.ts`

### REQ-TOOLS-7c — writes are templated (happy)

### SCN-TOOLS-7c-1 — every write goes through the fixed template (happy)

source: REQ-TOOLS-7c
Given `atlas-emit(N1, …)` producing a write
When the emitted row is inspected
Then it was produced through the fixed write template (structured fields), not a free-form ad-hoc row
teeth: breaks-on "`atlas-emit` accepts a free-form ad-hoc row bypassing the template"
gen: conformance

### SCN-TOOLS-7c-2 — a different node's write also goes through the template (happy · held-out)

source: REQ-TOOLS-7c
held_out: true
Given `atlas-emit(N3, …)` producing a write
When the emitted row is inspected
Then it was produced through the fixed write template (structured fields), not a free-form ad-hoc row
teeth: breaks-on "`atlas-emit` accepts a free-form ad-hoc row for `N3` bypassing the template"
gen: conformance # held-out · different node (`N3`), same templated-write behaviour vs `tools/ref/emit.ts`

### REQ-TOOLS-7d — writes are upserts, not blind inserts (happy)

### SCN-TOOLS-7d-1 — a changed fact supersedes, it does not duplicate (happy)

source: REQ-TOOLS-7d
Given the store already holds N1 (`claim:acme-arr-2024` = "$4.2M"), then `atlas-emit` writes a changed fact "$4.5M" for the same nodeKey
When the write completes
Then the store holds exactly one live row for `claim:acme-arr-2024` (the change superseded the prior) — `duplicates == 0`
teeth: breaks-on "`atlas-emit` blind-inserts — the changed fact creates a second row, `2` rows for one nodeKey"
gen: conformance

### SCN-TOOLS-7d-2 — a changed fact on a different nodeKey also supersedes (happy · held-out)

source: REQ-TOOLS-7d
held_out: true
Given the store already holds N3 (`claim:acme-ceo` = "Jane Roe"), then `atlas-emit` writes a changed fact "Jane R. Roe" for the same nodeKey
When the write completes
Then the store holds exactly one live row for `claim:acme-ceo` (the change superseded the prior) — `duplicates == 0`
teeth: breaks-on "`atlas-emit` blind-inserts the changed `acme-ceo` fact — a second row is created, `2` rows for one nodeKey"
gen: conformance # held-out · different nodeKey (`claim:acme-ceo`), same upsert-supersede behaviour vs `tools/ref/emit.ts`

---

## REQ-TOOLS-8 — drift classification with a deterministic exit-gate

### REQ-TOOLS-8a — classify drift into reviewable set (happy)

### SCN-TOOLS-8a-1 — DRIFTED splits into a reviewable DriftItem set (happy)

source: REQ-TOOLS-8a
Given `atlas-reconcile` at merge-time over drift set `D = {dm, ds}`, using the KNOW-5 mechanical/semantic split (referenced, not redefined)
When reconcile classifies
Then it returns a reviewable `DriftItem[] = [dm:mechanical, ds:semantic]` — never a single all-or-nothing `DRIFTED` verdict
teeth: breaks-on "`atlas-reconcile` returns one all-or-nothing `DRIFTED` verdict — the mechanical/semantic split is collapsed"
gen: conformance # differential vs `tools/ref/reconcile.ts`; the KNOW-5 classifier itself is GRD's, consumed here

### SCN-TOOLS-8a-2 — a different drift set also splits into a reviewable DriftItem set (happy · held-out)

source: REQ-TOOLS-8a
held_out: true
Given `atlas-reconcile` at merge-time over a different drift set `D₂ = {dm₂, ds₂}` (dm₂ = anchor moved `reference/people.md#ceo @f7e8d9→@g8h9i0`, still re-derives; ds₂ = claim text changed, does **not** re-derive), using the KNOW-5 mechanical/semantic split (referenced, not redefined)
When reconcile classifies
Then it returns a reviewable `DriftItem[] = [dm₂:mechanical, ds₂:semantic]` — never a single all-or-nothing `DRIFTED` verdict
teeth: breaks-on "`atlas-reconcile` returns one all-or-nothing `DRIFTED` verdict for `D₂` — the mechanical/semantic split is collapsed"
gen: conformance # held-out · different drift set `D₂`, same reviewable-split behaviour vs `tools/ref/reconcile.ts`

### REQ-TOOLS-8b — exit 2 only on semantic drift (guard)

### SCN-TOOLS-8b-1 — a run with semantic drift exits 2, never silent-green (guard)

source: REQ-TOOLS-8b
Given `atlas-reconcile` over `D = {dm, ds}` with `|semantic| = 1`
When the run finishes
Then it exits `2` — it never reports a silent green when a semantic drift is present
teeth: breaks-on "a run with semantic drift exits `0` (silent green) — the semantic drift is masked"
gen: conformance

### SCN-TOOLS-8b-2 — a different semantic-carrying run also exits 2 (guard · held-out)

source: REQ-TOOLS-8b
held_out: true
Given `atlas-reconcile` over `D₂ = {dm₂, ds₂}` with `|semantic| = 1`
When the run finishes
Then it exits `2` — it never reports a silent green when a semantic drift is present
teeth: breaks-on "the run over `D₂` with semantic drift exits `0` (silent green) — the semantic drift is masked"
gen: conformance # held-out · different drift set `D₂`, same exit-2-on-semantic behaviour vs `tools/ref/reconcile.ts`

### REQ-TOOLS-8c — mechanical-only drift exits 0 (happy)

### SCN-TOOLS-8c-1 — a mechanical-only run exits 0 (happy)

source: REQ-TOOLS-8c
Given `atlas-reconcile` over `D′ = {dm}` with `|semantic| = 0` (drift entirely mechanical)
When the run finishes
Then it exits `0` — no block on drift that needs no review
teeth: breaks-on "a mechanical-only run exits `2` — a spurious merge block on drift that carries no semantic change"
gen: conformance

### SCN-TOOLS-8c-2 — a two-item mechanical-only run also exits 0 (happy · held-out)

source: REQ-TOOLS-8c
held_out: true
Given `atlas-reconcile` over `D₂′ = {dm₂, dm₃}` with `|semantic| = 0` (both mechanical anchor-moves that still re-derive; dm₃ = `reference/kernel.md#inv @c1d2e3→@f4g5h6`)
When the run finishes
Then it exits `0` — no block on drift that needs no review
teeth: breaks-on "the two-item mechanical-only run exits `2` — a spurious merge block on drift that carries no semantic change"
gen: conformance # held-out · different mechanical-only set `D₂′` (two items), same exit-0 behaviour vs `tools/ref/reconcile.ts`

### REQ-TOOLS-8d — re-author bounded to the semantic subset (happy)

### SCN-TOOLS-8d-1 — reconcile re-authors exactly the semantic count (happy)

source: REQ-TOOLS-8d
Given `atlas-reconcile` over `D = {dm, ds}` (`|semantic| = 1`)
When reconcile acts on the classified set
Then it re-authors exactly `1` item (`== |semantic|`, the item `ds`) — never the whole store
teeth: breaks-on "`atlas-reconcile` re-authors the whole store (all N rows) instead of just the `1` semantic item"
gen: conformance

### SCN-TOOLS-8d-2 — reconcile re-authors exactly two when the semantic count is two (happy · held-out)

source: REQ-TOOLS-8d
held_out: true
Given `atlas-reconcile` over `D₃ = {dm, ds, ds₃}` (`|semantic| = 2` — `ds` and `ds₃` both changed and do not re-derive)
When reconcile acts on the classified set
Then it re-authors exactly `2` items (`== |semantic|`, the items `{ds, ds₃}`) — never the whole store
teeth: breaks-on "`atlas-reconcile` re-authors all `3` drift items (including the mechanical `dm`) instead of just the `2` semantic ones"
gen: conformance # held-out · different set `D₃` with `|semantic|=2`, same `reauthorCount==|semantic|` behaviour vs `tools/ref/reconcile.ts`

---

## REQ-TOOLS-9 — absorb-driven wave-close write

### REQ-TOOLS-9a — wave-close write driven by absorb (happy)

### SCN-TOOLS-9a-1 — the wave-close write comes from ResultCard.absorb (happy)

source: REQ-TOOLS-9a
Given a wave closing with `ResultCard.absorb` carrying a grounded fact, over the reference wave-close (which routes `absorb` through `emit`, `tools/ref/emit.ts`)
When wave-close runs
Then the write is produced from `ResultCard.absorb` routed through `atlas-emit` — not from a separate authoring ritual
teeth: breaks-on "wave-close runs a separate authoring ritual and ignores `ResultCard.absorb` — the absorb payload is dropped"
gen: conformance

### SCN-TOOLS-9a-2 — a different absorb payload also drives the wave-close write (happy · held-out)

source: REQ-TOOLS-9a
held_out: true
Given a wave closing with `ResultCard.absorb` carrying a different grounded fact (`claim:acme-ceo` = "Jane Roe" @ `reference/people.md@f7e8d9`), over the reference wave-close (which routes `absorb` through `emit`, `tools/ref/emit.ts`)
When wave-close runs
Then the write is produced from `ResultCard.absorb` routed through `atlas-emit` — not from a separate authoring ritual
teeth: breaks-on "wave-close runs a separate authoring ritual and ignores this `ResultCard.absorb` — the `acme-ceo` absorb payload is dropped"
gen: conformance # held-out · different absorb payload (`claim:acme-ceo`), same absorb-driven-write behaviour vs `tools/ref/emit.ts`

### REQ-TOOLS-9b — sealing wave must feed or emit why-not (guard)

### SCN-TOOLS-9b-1 — a seal with neither absorb nor why-not records a violation (guard)

source: REQ-TOOLS-9b
Given a sealing wave with `absorb == ∅` **and** no grounded why-not emitted
When the seal-probe runs
Then it records exactly `1` violation — a seal that neither feeds the Atlas nor emits a grounded why-not is not silent
teeth: breaks-on "the seal-probe passes a wave with neither `absorb` nor why-not — a silent seal, `0` violations recorded"
gen: conformance # seal-probe reference is the mock; a seal outside the absorb path / skipping why-not fails it

### SCN-TOOLS-9b-2 — a different sealing wave with neither also records a violation (guard · held-out)

source: REQ-TOOLS-9b
held_out: true
Given a distinct sealing wave (a review wave) with `absorb == ∅` **and** no grounded why-not emitted
When the seal-probe runs
Then it records exactly `1` violation — a seal that neither feeds the Atlas nor emits a grounded why-not is not silent
teeth: breaks-on "the seal-probe passes this review wave with neither `absorb` nor why-not — a silent seal, `0` violations recorded"
gen: conformance # held-out · different wave kind (review wave), same seal-probe violation behaviour vs the seal-probe reference

---

## REQ-TOOLS-10 — tri-transport byte-identity (PBT · cross-transport determinism)

### REQ-TOOLS-10a — node addressable over three transports (happy)

### SCN-TOOLS-10a-1 — one node, three transports, byte-identical content (happy)

source: REQ-TOOLS-10a
Given node N1 at content address `a = cas:9b21`, resolved by content address over the MCP tool, the poke injection, and the CLI — all against the one handler `tools/ref/handler.ts`
When `mcp(a)`, `poke(a)`, and `cli(a)` are computed
Then `mcp(a) ≡ poke(a) ≡ cli(a)` — byte-identical node content across all three transports
teeth: breaks-on "the poke transport re-serializes the node (reorders JSON keys / strips a field) — `poke(a) ≠ mcp(a)` byte-wise"
gen: PBT # witness of the tri-equivalence law `∀a. mcp(a) ≡ poke(a) ≡ cli(a)` (method-tags-tls §INV-TOOLS-10)

### REQ-TOOLS-10b — transports must not diverge in contract (guard)

### SCN-TOOLS-10b-1 — the three transports return the same contract shape (guard)

source: REQ-TOOLS-10b
Given the same node `a = cas:9b21` resolved over the MCP tool, the poke, and the CLI
When each transport returns
Then all three return the identical `Verdict` contract `{content, next, invariant}` — no transport diverges in contract
teeth: breaks-on "the CLI transport returns a bare content string while MCP returns a `Verdict` — the contract diverges across transports"
gen: PBT # witness of `∀a. contract(mcp(a)) ≡ contract(poke(a)) ≡ contract(cli(a))`

### REQ-TOOLS-10c — transports add no write path (guard)

### SCN-TOOLS-10c-1 — a write through any transport is refused (guard)

source: REQ-TOOLS-10c
Given the node handler reached over each of the three transports (MCP / poke / CLI)
When a store-mutating call is attempted through each
Then all three are read/subscribe only — none exposes a store-mutating method, and every attempted write is refused (writes still funnel through `atlas-emit`); positive property — a projection opens NO write door
teeth: breaks-on "the MCP transport exposes a `set()`/`put()` method — a write lands via the node handler, bypassing `atlas-emit`"
gen: PBT # the no-write-path arm is a reference-model property of the same handler under the tri-equivalence; NOT a formal model

### REQ-TOOLS-10d — CLI is unscoped (happy)

### SCN-TOOLS-10d-1 — the CLI addresses a node outside the current phase pack (happy)

source: REQ-TOOLS-10d
Given a node `a = cas:9b21` that is **not** in the seat's current phase pack, addressed via the CLI by its content address
When `cli(a)` is computed
Then the node resolves — the CLI is unscoped, any node is addressable by content address at any time
teeth: breaks-on "the CLI scopes addressability to the current phase pack — a node outside the pack is not addressable by its content address"
gen: PBT # witness that CLI addressability is invariant under phase/scope

---

## REQ-TOOLS-11 — push-owns-common-case, laddered pull, CLI-floor

### REQ-TOOLS-11-a — never force a seat to the CLI (guard)

### SCN-TOOLS-11-a-1 — a Read-only seat is served by push, never forced to the CLI (guard)

source: REQ-TOOLS-11-a
Given seat `S_ro` (only the `Read` grant) that needs to reach the Atlas, over the reference `tools/ref/ladder.ts`
When `resolve(S_ro, need)` runs
Then the seat is served by push (poke / pack) — it is **never** forced to the CLI to reach the Atlas
teeth: breaks-on "`resolve` routes the Read-only seat to the CLI — the seat is forced to the CLI to reach the Atlas"
gen: conformance # differential vs `tools/ref/ladder.ts` direction-split resolver

### SCN-TOOLS-11-a-2 — a second grantless seat is also served by push, not the CLI (guard · held-out)

source: REQ-TOOLS-11-a
held_out: true
Given a seat `S_ro2` (grants `{Read, Grep}`, still **no** tool grant) that needs to reach the Atlas, over the reference `tools/ref/ladder.ts`
When `resolve(S_ro2, need)` runs
Then the seat is served by push (poke / pack) — it is **never** forced to the CLI to reach the Atlas
teeth: breaks-on "`resolve` routes `S_ro2` to the CLI — a grantless seat is forced to the CLI to reach the Atlas"
gen: conformance # held-out · different grantless seat (`S_ro2` = Read+Grep), same push-not-CLI behaviour vs `tools/ref/ladder.ts`

### REQ-TOOLS-11-b — push reaches a seat with no grant (happy)

### SCN-TOOLS-11-b-1 — push lands on a Read-only seat with zero tool grant (happy)

source: REQ-TOOLS-11-b
Given a poke / pack / `RelationSet` pushed to seat `S_ro` (grant set = `{Read}`)
When push is delivered
Then `S_ro` consumes it with **no** tool grant required (`grantsRequired == 0`) — push is the orchestrator's job
teeth: breaks-on "push requires a tool grant — a seat with only `Read` cannot receive the poke"
gen: conformance

### SCN-TOOLS-11-b-2 — a RelationSet push also lands with zero grant (happy · held-out)

source: REQ-TOOLS-11-b
held_out: true
Given a `RelationSet` pushed to seat `S_ro2` (grant set = `{Read, Grep}`, no tool grant)
When push is delivered
Then `S_ro2` consumes it with **no** tool grant required (`grantsRequired == 0`) — push is the orchestrator's job
teeth: breaks-on "the `RelationSet` push requires a tool grant — a seat with no tool grant cannot receive it"
gen: conformance # held-out · different push payload (RelationSet) + seat (`S_ro2`), same `grantsRequired==0` behaviour vs `tools/ref/ladder.ts`

### REQ-TOOLS-11-c — pull resolves down the native-first ladder (happy)

### SCN-TOOLS-11-c-1 — an ad-hoc pull walks the ladder native-first (happy)

source: REQ-TOOLS-11-c
Given a seat issuing an ad-hoc pull on harness `H_sdk`
When the ladder resolves
Then it walks the fixed order `SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI` and returns the first available tier (`SDK-MCP`) — native-first
teeth: breaks-on "the ladder is reordered to try the CLI first (native-last) — pull resolves to CLI while `SDK-MCP` was available"
gen: conformance

### SCN-TOOLS-11-c-2 — the ladder returns tier-2 when tier-1 is the unavailable one (happy · held-out)

source: REQ-TOOLS-11-c
held*out: true
Given a seat issuing an ad-hoc pull on a harness where tier-1 `SDK-MCP` is unavailable but tier-2 `registered-MCP+grant` is available
When the ladder resolves
Then it walks the fixed order `SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI` and returns the first \_available* tier (`registered-MCP+grant`) — native-first, order preserved
teeth: breaks-on "the ladder skips the available tier-2 and drops straight to the CLI — the fixed native-first order is not honoured"
gen: conformance # held-out · different tier-availability (tier-1 down), same fixed native-first walk vs `tools/ref/ladder.ts`

### REQ-TOOLS-11-d — every tier is one handler, one contract (happy)

### SCN-TOOLS-11-d-1 — a lower-tier result equals the native-tier result (happy)

source: REQ-TOOLS-11-d
Given the same node `cas:9b21` resolved once at the `poke-as-file` tier and once at the `SDK-MCP` tier, both backed by the one handler (TOOLS-10)
When each tier returns
Then the two results are byte-identical — tiers differ only in transport, never in contract or result
teeth: breaks-on "the `poke-as-file` tier is backed by a second handler that returns a different contract than the `SDK-MCP` tier"
gen: conformance # `tools/ref/ladder.ts` asserts resolved-tier result == native-tier result

### SCN-TOOLS-11-d-2 — a different node at the relay tier equals the native-tier result (happy · held-out)

source: REQ-TOOLS-11-d
held_out: true
Given the same node `claim:acme-ceo` resolved once at the `relay` tier and once at the `SDK-MCP` tier, both backed by the one handler (TOOLS-10)
When each tier returns
Then the two results are byte-identical — tiers differ only in transport, never in contract or result
teeth: breaks-on "the `relay` tier is backed by a second handler that returns a different contract than the `SDK-MCP` tier"
gen: conformance # held-out · different node + tier pair (relay vs SDK-MCP), same one-handler equality vs `tools/ref/ladder.ts`

---

## REQ-TOOLS-11a — honest ladder per harness

### REQ-TOOLS-11a-a — spawn seats via the SDK in-process path (happy)

### SCN-TOOLS-11a-a-1 — a governed seat is spawned in-process with a per-seat grant (happy)

source: REQ-TOOLS-11a-a
Given Orchestra spawning a governed seat on harness `H_sdk`
When the seat is created
Then it is spawned via the Agent SDK in-process path — `create_sdk_mcp_server` in-process **plus** a per-seat `allowed_tools` grant (the native tier-1 spawn contract)
teeth: breaks-on "a seat is spawned via a registered external MCP server instead of the in-process SDK path — the tier-1 native spawn contract is broken"
gen: conformance # differential vs `tools/ref/ladder.ts` spawn path

### SCN-TOOLS-11a-a-2 — a second governed seat is also spawned in-process (happy · held-out)

source: REQ-TOOLS-11a-a
held_out: true
Given Orchestra spawning a second governed seat (a distinct `allowed_tools` grant `{atlas-query}`) on harness `H_sdk`
When the seat is created
Then it is spawned via the Agent SDK in-process path — `create_sdk_mcp_server` in-process **plus** its per-seat `allowed_tools` grant (the native tier-1 spawn contract)
teeth: breaks-on "this second seat is spawned via a registered external MCP server instead of the in-process SDK path — the tier-1 native spawn contract is broken"
gen: conformance # held-out · different seat + grant set, same in-process SDK spawn contract vs `tools/ref/ladder.ts`

### REQ-TOOLS-11a-b — down-rank pull 1 and 2 when MCP unavailable (guard)

### SCN-TOOLS-11a-b-1 — an MCP-incapable harness down-ranks tiers 1 and 2 (guard)

source: REQ-TOOLS-11a-b
Given harness `H_agents` with `canPropagateMcp:false`
When the ladder is built for this harness
Then pull tier 1 (SDK-MCP) **and** tier 2 (registered-MCP+grant) are marked `unavailable`, and resolution goes straight to push / pull 3–4
teeth: breaks-on "on `H_agents` the ladder still advertises tier-1 SDK-MCP as available — pull 1 is attempted and silently fails"
gen: conformance

### SCN-TOOLS-11a-b-2 — a different MCP-incapable harness also down-ranks tiers 1 and 2 (guard · held-out)

source: REQ-TOOLS-11a-b
held_out: true
Given a different harness `H_agents2` (a second `.claude/agents`-style harness) with `canPropagateMcp:false`
When the ladder is built for this harness
Then pull tier 1 (SDK-MCP) **and** tier 2 (registered-MCP+grant) are marked `unavailable`, and resolution goes straight to push / pull 3–4
teeth: breaks-on "on `H_agents2` the ladder still advertises tier-2 registered-MCP as available — pull 2 is attempted and silently fails"
gen: conformance # held-out · different MCP-incapable harness (`H_agents2`), same down-rank behaviour vs `tools/ref/ladder.ts`

### REQ-TOOLS-11a-c — never silently fall through a native tier (guard)

### SCN-TOOLS-11a-c-1 — a failing advertised-native tier is reported, not skipped (guard)

source: REQ-TOOLS-11a-c
Given a tier the ladder advertises as native which then fails to resolve
When the ladder moves on
Then the fall-through is **reported** (surfaced), never silent — the ladder does not quietly advance past a tier it advertised as native
teeth: breaks-on "an advertised-native tier fails and the ladder silently falls through to the next tier with no report"
gen: conformance

### SCN-TOOLS-11a-c-2 — a failing tier-2 native is also reported, not skipped (guard · held-out)

source: REQ-TOOLS-11a-c
held_out: true
Given tier-2 `registered-MCP+grant`, advertised as native, which then fails to resolve (the grant is present but the server does not answer)
When the ladder moves on
Then the fall-through is **reported** (surfaced), never silent — the ladder does not quietly advance past a tier it advertised as native
teeth: breaks-on "the advertised-native tier-2 fails and the ladder silently falls through to `poke-as-file` with no report"
gen: conformance # held-out · different advertised-native tier (tier-2), same report-not-skip behaviour vs `tools/ref/ladder.ts`

### REQ-TOOLS-11a-d — report the tier actually started on (happy)

### SCN-TOOLS-11a-d-1 — the ladder reports its true starting tier (happy)

source: REQ-TOOLS-11a-d
Given the ladder resolving on harness `H_agents` (`canPropagateMcp:false`)
When resolution returns
Then it reports `startedTier == push` (the tier it actually started on for this harness) — not the native tier-1
teeth: breaks-on "the ladder reports `startedTier == SDK-MCP` on `H_agents` while it actually started on push — a dishonest report"
gen: conformance

### SCN-TOOLS-11a-d-2 — on an MCP-capable harness the ladder reports the native start (happy · held-out)

source: REQ-TOOLS-11a-d
held_out: true
Given the ladder resolving on harness `H_sdk` (`canPropagateMcp:true`)
When resolution returns
Then it reports `startedTier == SDK-MCP` (the tier it actually started on for this harness) — an honest report of the native start
teeth: breaks-on "the ladder reports `startedTier == push` on `H_sdk` while it actually started on SDK-MCP — a dishonest report"
gen: conformance # held-out · different harness (`H_sdk`), same honest-startedTier behaviour vs `tools/ref/ladder.ts`

---

## REQ-TOOLS-12 — read/advisory-only doctor

### REQ-TOOLS-12a — doctor is read/advisory only (happy)

### SCN-TOOLS-12a-1 — every doctor sub-command leaves the store byte-identical (happy)

source: REQ-TOOLS-12a
Given `atlas doctor` sub-commands (`archive`, `why-broken`, `hot-set`) run over the reference `tools/ref/doctor.ts`
When each runs
Then the store is byte-identical before and after every sub-command — doctor is read/advisory only (`directStoreMutations == 0`); positive property — a diagnostic view opens NO write door
teeth: breaks-on "a doctor sub-command mutates the store directly — the store bytes change after a read-only diagnostic"
gen: conformance # differential vs `tools/ref/doctor.ts` no-write-authority projection

### SCN-TOOLS-12a-2 — doctor over a drifted store also leaves it byte-identical (happy · held-out)

source: REQ-TOOLS-12a
held_out: true
Given `atlas doctor` sub-commands (`reground`, `why-broken`) run over the reference `tools/ref/doctor.ts` against a store holding the drift set `D = {dm, ds}`
When each runs
Then the store is byte-identical before and after every sub-command — doctor is read/advisory only (`directStoreMutations == 0`); positive property — a diagnostic view opens NO write door
teeth: breaks-on "the `reground` sub-command persists its plan directly — the store bytes change after a read-only diagnostic"
gen: conformance # held-out · different sub-commands + drifted store, same no-mutation property vs `tools/ref/doctor.ts`

### REQ-TOOLS-12b — doctor never persists (guard)

### SCN-TOOLS-12b-1 — a doctor-proposed write funnels through atlas-emit (guard)

source: REQ-TOOLS-12b
Given `atlas doctor reground` proposing a write for dm
When the proposal is produced
Then doctor persists nothing itself — it returns a `RegroundPlan` that only mutates the store when run through `atlas-emit`
teeth: breaks-on "doctor persists its proposed write directly instead of funneling the plan through `atlas-emit`"
gen: conformance

### SCN-TOOLS-12b-2 — a plan for a different item also funnels through atlas-emit (guard · held-out)

source: REQ-TOOLS-12b
held_out: true
Given `atlas doctor reground` proposing a write for `dm₂` (a different mechanical anchor-move, `@f7e8d9→@g8h9i0`)
When the proposal is produced
Then doctor persists nothing itself — it returns a `RegroundPlan` that only mutates the store when run through `atlas-emit`
teeth: breaks-on "doctor persists its proposed `dm₂` write directly instead of funneling the plan through `atlas-emit`"
gen: conformance # held-out · different proposed item (`dm₂`), same funnel-through-emit behaviour vs `tools/ref/doctor.ts`

### REQ-TOOLS-12c — doctor carries no write authority (happy)

### SCN-TOOLS-12c-1 — doctor is a diagnostic view, not a governance tool (happy)

source: REQ-TOOLS-12c
Given the governance surface with `atlas doctor` present
When the surface is enumerated and the doctor handle inspected
Then the surface stays exactly the derived six governance tools (`{atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link, atlas-memory-emit}`, ADR-0006 Decision 2) and the doctor handle exposes **no** store-mutating method — no write authority
teeth: breaks-on "doctor is registered as a seventh governance tool with a write method — surface count `== 7` and a write via doctor lands"
gen: conformance

### SCN-TOOLS-12c-2 — doctor after a hot-set command is still not a governance tool (happy · held-out)

source: REQ-TOOLS-12c
held_out: true
Given the governance surface with `atlas doctor` present, inspected after its `hot-set` sub-command has run
When the surface is enumerated and the doctor handle inspected
Then the surface stays exactly the derived six governance tools and the doctor handle exposes **no** store-mutating method — no write authority
teeth: breaks-on "doctor's `hot-set` path registers doctor as a seventh governance tool with a write method — surface count `== 7` and a write via doctor lands"
gen: conformance # held-out · different probe (post `hot-set`), same 6-surface + no-write-authority behaviour vs `tools/ref/doctor.ts`

---

## REQ-TOOLS-13 — mechanical auto-re-ground, no human, no block

### REQ-TOOLS-13a — auto-re-ground mechanical drift in one pass (happy)

### SCN-TOOLS-13a-1 — --accept-reground re-grounds the mechanical item in one pass (happy)

source: REQ-TOOLS-13a
Given `atlas-reconcile --accept-reground` over `D = {dm, ds}` (dm = anchor moved `@a1b2c3→@d4e5f6`, claim still re-derives), over `tools/ref/reconcile.ts` + `tools/ref/emit.ts`
When the run executes
Then it auto-re-grounds `dm` in **one pass** — the anchor is updated to `@d4e5f6` with no human and no merge block
teeth: breaks-on "auto-re-ground needs a second pass / a human confirmation — the mechanical drift is not resolved in one pass"
gen: conformance

### SCN-TOOLS-13a-2 — a different mechanical item also re-grounds in one pass (happy · held-out)

source: REQ-TOOLS-13a
held_out: true
Given `atlas-reconcile --accept-reground` over `D₂ = {dm₂, ds₂}` (dm₂ = anchor moved `@f7e8d9→@g8h9i0`, claim still re-derives), over `tools/ref/reconcile.ts` + `tools/ref/emit.ts`
When the run executes
Then it auto-re-grounds `dm₂` in **one pass** — the anchor is updated to `@g8h9i0` with no human and no merge block
teeth: breaks-on "auto-re-ground of `dm₂` needs a second pass / a human confirmation — the mechanical drift is not resolved in one pass"
gen: conformance # held-out · different mechanical item (`dm₂`), same one-pass re-ground behaviour vs `tools/ref/reconcile.ts`

### REQ-TOOLS-13b — report regroundedCount (happy)

### SCN-TOOLS-13b-1 — the run reports the count of items re-grounded (happy)

source: REQ-TOOLS-13b
Given the `--accept-reground` run over `D = {dm, ds}` (`|mechanical| = 1`)
When the run finishes
Then it reports `regroundedCount == 1` (`== |mechanical|`)
teeth: breaks-on "`regroundedCount` is reported as `0` while `1` mechanical item was re-grounded — the count under-reports"
gen: conformance

### SCN-TOOLS-13b-2 — the run reports a count of two when two mechanical items re-ground (happy · held-out)

source: REQ-TOOLS-13b
held_out: true
Given the `--accept-reground` run over `D₂′ = {dm₂, dm₃}` (`|mechanical| = 2`)
When the run finishes
Then it reports `regroundedCount == 2` (`== |mechanical|`)
teeth: breaks-on "`regroundedCount` is reported as `1` while `2` mechanical items were re-grounded — the count under-reports"
gen: conformance # held-out · different mechanical count (2), same `regroundedCount==|mechanical|` behaviour vs `tools/ref/reconcile.ts`

### REQ-TOOLS-13c — never auto-touch semantic drift (guard)

### SCN-TOOLS-13c-1 — the semantic item is left for review and still exits 2 (guard)

source: REQ-TOOLS-13c
Given the `--accept-reground` run over `D = {dm, ds}` (ds = semantic)
When the run executes
Then `ds` is left untouched — it still surfaces for review and the run still exits `2`; only the mechanical `dm` was auto-re-grounded
teeth: breaks-on "`--accept-reground` auto-re-grounds the semantic item `ds` too — a semantic drift is silently rewritten and the run exits `0`"
gen: conformance

### SCN-TOOLS-13c-2 — two semantic items are both left for review and still exit 2 (guard · held-out)

source: REQ-TOOLS-13c
held_out: true
Given the `--accept-reground` run over `D₃ = {dm, ds, ds₃}` (`ds`, `ds₃` semantic)
When the run executes
Then both `ds` and `ds₃` are left untouched — they still surface for review and the run still exits `2`; only the mechanical `dm` was auto-re-grounded
teeth: breaks-on "`--accept-reground` auto-re-grounds `ds₃` too — a semantic drift is silently rewritten and the run exits `0`"
gen: conformance # held-out · different set `D₃` (two semantic), same leave-semantic + exit-2 behaviour vs `tools/ref/reconcile.ts`

### REQ-TOOLS-13d — re-ground write passes the fail-closed check (happy)

### SCN-TOOLS-13d-1 — each auto-re-ground write clears the emit grounding bar (happy)

source: REQ-TOOLS-13d
Given the auto-re-ground write for `dm` (anchor now `@d4e5f6`)
When it is applied
Then it passes through `atlas-emit`'s fail-closed grounding check (TOOLS-7) — it re-derives at `@d4e5f6` before it lands
teeth: breaks-on "the auto-re-ground write bypasses `atlas-emit`'s fail-closed check — a re-ground anchor that does not re-derive is written"
gen: conformance # reuses `tools/ref/emit.ts` fail-closed mock (anti-rot)

### SCN-TOOLS-13d-2 — a different auto-re-ground write also clears the emit bar (happy · held-out)

source: REQ-TOOLS-13d
held_out: true
Given the auto-re-ground write for `dm₂` (anchor now `@g8h9i0`)
When it is applied
Then it passes through `atlas-emit`'s fail-closed grounding check (TOOLS-7) — it re-derives at `@g8h9i0` before it lands
teeth: breaks-on "the `dm₂` auto-re-ground write bypasses `atlas-emit`'s fail-closed check — a re-ground anchor that does not re-derive is written"
gen: conformance # held-out · different re-ground item (`dm₂`), same fail-closed-on-reground behaviour vs `tools/ref/emit.ts`

---

## REQ-TOOLS-14 — push-driven pre-phase discovery

### REQ-TOOLS-14a — auto-inject a fresh pack at phase transition (happy)

### SCN-TOOLS-14a-1 — a phase boundary injects a fresh pack into the seat (happy)

source: REQ-TOOLS-14a
Given a seat crossing a phase transition, over the reference phase-hook `tools/ref/push.ts`
When the boundary fires
Then the orchestrator auto-injects a fresh `atlas-query` / `own_<unit>` pack into the seat's context — the seat need not _decide_ to re-ground
teeth: breaks-on "no pack is injected at the phase boundary — the seat carries a stale pack across the transition"
gen: conformance # differential vs `tools/ref/push.ts` pack injector

### SCN-TOOLS-14a-2 — a different phase boundary also injects a fresh pack (happy · held-out)

source: REQ-TOOLS-14a
held*out: true
Given a seat crossing into the *seal* phase (a different boundary), over the reference phase-hook `tools/ref/push.ts`
When the boundary fires
Then the orchestrator auto-injects a fresh `atlas-query` / `own*<unit>`pack into the seat's context — the seat need not *decide* to re-ground
teeth: breaks-on "no pack is injected at the seal-phase boundary — the seat carries a stale pack into the seal"
gen: conformance   # held-out · different boundary (seal phase), same auto-inject behaviour vs`tools/ref/push.ts`

### REQ-TOOLS-14b — phase-pack push needs no grant (happy)

### SCN-TOOLS-14b-1 — the boundary pack reaches a Read-only seat with no grant (happy)

source: REQ-TOOLS-14b
Given the phase-boundary pack pushed to seat `S_ro` (grant set = `{Read}`)
When push is delivered
Then `S_ro` consumes the fresh pack with **no** tool grant (`grantsRequired == 0`)
teeth: breaks-on "the phase-pack push requires a tool grant — a Read-only seat gets no fresh pack at the boundary"
gen: conformance

### SCN-TOOLS-14b-2 — the boundary pack reaches a second grantless seat too (happy · held-out)

source: REQ-TOOLS-14b
held_out: true
Given the phase-boundary pack pushed to seat `S_ro2` (grant set = `{Read, Grep}`, no tool grant)
When push is delivered
Then `S_ro2` consumes the fresh pack with **no** tool grant (`grantsRequired == 0`)
teeth: breaks-on "the phase-pack push requires a tool grant — `S_ro2` gets no fresh pack at the boundary"
gen: conformance # held-out · different grantless seat (`S_ro2`), same `grantsRequired==0` behaviour vs `tools/ref/push.ts`

### REQ-TOOLS-14c — mid-task pull is not load-bearing (happy)

### SCN-TOOLS-14c-1 — a boundary re-grounds by push even where pull is unavailable (guard)

source: REQ-TOOLS-14c
Given a seat crossing a boundary on harness `H_agents` (native pull `unavailable`)
When the boundary fires
Then the seat is re-grounded purely by push and `pull` is never invoked — mid-task PULL is an optimization only, never load-bearing
teeth: breaks-on "re-grounding at the boundary depends on a mid-task pull — on a pull-unavailable harness the seat is left ungrounded"
gen: conformance # independent of TOOLS-11a: a pushed seat is correct even where native pull is unavailable

### SCN-TOOLS-14c-2 — a boundary on a different pull-less harness also re-grounds by push (guard · held-out)

source: REQ-TOOLS-14c
held_out: true
Given a seat crossing a boundary on harness `H_agents2` (native pull `unavailable`)
When the boundary fires
Then the seat is re-grounded purely by push and `pull` is never invoked — mid-task PULL is an optimization only, never load-bearing
teeth: breaks-on "re-grounding at the boundary depends on a mid-task pull — on `H_agents2` (pull-unavailable) the seat is left ungrounded"
gen: conformance # held-out · different pull-unavailable harness (`H_agents2`), same push-only re-ground behaviour vs `tools/ref/push.ts`

---

## REQ-TOOLS-15 — structural single-write-door store

### REQ-TOOLS-15a — store medium is append-only/permissioned (happy)

### SCN-TOOLS-15a-1 — no prior row's bytes change on a new write (happy)

source: REQ-TOOLS-15a
Given the reference store `tools/ref/store.ts` holding N1, then a new grounded row for another nodeKey is emitted
When the new write completes
Then no prior row's bytes changed — the medium is append-only / permissioned; an in-place overwrite is refused
teeth: breaks-on "the store allows an in-place overwrite of an existing row — a served fact is mutated under the same address"
gen: conformance

### SCN-TOOLS-15a-2 — a different prior row's bytes also survive a new write (happy · held-out)

source: REQ-TOOLS-15a
held_out: true
Given the reference store `tools/ref/store.ts` holding `N3` (`claim:acme-ceo`), then a new grounded row for `claim:acme-hq` is emitted
When the new write completes
Then no prior row's bytes changed — the medium is append-only / permissioned; an in-place overwrite is refused
teeth: breaks-on "the store overwrites the `N3` row in place while emitting `claim:acme-hq` — a served fact is mutated under the same address"
gen: conformance # held-out · different prior + new rows, same append-only behaviour vs `tools/ref/store.ts`

### REQ-TOOLS-15b — reads reject ungrounded rows (guard)

### SCN-TOOLS-15b-1 — a read rejects an un-emitted row via the integrity check (guard)

source: REQ-TOOLS-15b
Given a row injected directly into the store (not produced by `atlas-emit`'s grounded path)
When `read(id)` recomputes the content address for that row
Then the content-address integrity check rejects it — an ungrounded row is never returned (`ungroundedRowsServed == 0`)
teeth: breaks-on "`read` serves the directly-injected ungrounded row — the content-address integrity check is skipped"
gen: conformance # functional refusal; _penetration_ of the integrity check = billy / FR-12, not authored here

### SCN-TOOLS-15b-2 — a tampered injected row is also rejected at read (guard · held-out)

source: REQ-TOOLS-15b
held_out: true
Given a tampered row injected directly into the store (a copy of `N1` with its claim bytes mutated to "$5.5M", not produced by `atlas-emit`'s grounded path)
When `read(id)` recomputes the content address for that row
Then the recomputed address no longer matches and the content-address integrity check rejects it — the ungrounded row is never returned (`ungroundedRowsServed == 0`)
teeth: breaks-on "`read` serves the tampered row — the content-address integrity check is skipped"
gen: conformance # held-out · different injected row (tampered `N1`), same read-time integrity rejection; penetration still billy / FR-12

### REQ-TOOLS-15c — direct write never surfaces as a served fact (guard)

### SCN-TOOLS-15c-1 — a direct write is refused at write or rejected at read (guard)

source: REQ-TOOLS-15c
Given a direct write that skips the `atlas-emit` path
When it is attempted and then a read is issued for it
Then it either cannot land (append-only / permission) **or** is rejected at read (integrity check) — it never surfaces as a served fact
teeth: breaks-on "a direct write that skips `atlas-emit` is served as a fact — it neither fails at write nor is rejected at read"
gen: conformance # functional refusal only; adversarial exploit of this door = billy / FR-12, not authored here

### SCN-TOOLS-15c-2 — a different direct write also never surfaces as a served fact (guard · held-out)

source: REQ-TOOLS-15c
held_out: true
Given a direct write for `claim:acme-ceo` that skips the `atlas-emit` path
When it is attempted and then a read is issued for it
Then it either cannot land (append-only / permission) **or** is rejected at read (integrity check) — it never surfaces as a served fact
teeth: breaks-on "the direct `claim:acme-ceo` write that skips `atlas-emit` is served as a fact — it neither fails at write nor is rejected at read"
gen: conformance # held-out · different direct write (`claim:acme-ceo`), same never-served refusal; exploit still billy / FR-12

---

## REQ-TOOLS-16 — atlas-diff read-only version projection (reference-model · CLI≡MCP delegated to TOOLS-3)

> **A read-only projection of the PERSIST-14 delta, NOT a write tool.** `atlas-diff <shaA> <shaB>` surfaces
> the frozen PERSIST-14 delta (`persist/ref/diff.ts`) — it opens **no** write path (like node TOOLS-10 / doctor
> TOOLS-12). Its CLI≡MCP determinism arm is **delegated** to the TOOLS-3 cross-transport PBT over the one handler
> (`tools/ref/handler.ts`); this block conformance-tests the projection surface (faithful delta, no write path,
> write surface stays the two governed doors `{atlas-emit, atlas-link}`, ADR-0003).
>
> Diff fixture (the PERSIST-14 delta over two shas of the finance atlas):
> `Δ = diff(shaA, shaB) = { added:[claim:acme-ceo], edited:[claim:acme-arr-2024], superseded:[pred:auth-token-ttl], decayed:[claim:acme-hq-2019] }`,
> each entry carrying its `prov` (the WP/commit that produced it). Governance **write** surface (TOOLS-1, ADR-0003) =
> exactly the two governed doors `{atlas-emit, atlas-link}` — `atlas-diff` is a **read** projection, not on it.

### REQ-TOOLS-16a — atlas-diff surfaces the version delta read-only (happy)

### SCN-TOOLS-16a-1 — atlas-diff renders the four-class delta as a read-only projection (happy)

source: REQ-TOOLS-16a
Given `atlas-diff shaA shaB` over the reference diff projection `tools/ref/diff.ts` reading the PERSIST-14 delta `Δ`
When the command runs
Then it surfaces `Δ` — `added:[acme-ceo]`, `edited:[acme-arr-2024]`, `superseded:[auth-token-ttl]`, `decayed:[acme-hq-2019]`, each with its `prov` — as a read-only projection (nothing is written)
teeth: breaks-on "`atlas-diff` drops the `decayed` partition from what it renders — a steward auditing the two versions never sees `acme-hq-2019` fell out (the projection is not faithful to the PERSIST-14 delta)"
gen: conformance # differential vs `tools/ref/diff.ts` (faithful render of the PERSIST-14 delta)

### SCN-TOOLS-16a-2 — atlas-diff renders a different version pair's delta read-only (happy · held-out)

source: REQ-TOOLS-16a
held_out: true
Given `atlas-diff shaB shaC` over the reference diff projection `tools/ref/diff.ts` reading a different PERSIST-14 delta `Δ₂ = { added:[claim:acme-hq-2025], edited:[claim:acme-ceo], superseded:[pred:auth-mfa], decayed:[claim:acme-office] }`, each entry carrying its `prov`
When the command runs
Then it surfaces `Δ₂` — each partition with its `prov` — as a read-only projection (nothing is written)
teeth: breaks-on "`atlas-diff` drops the `superseded` partition from `Δ₂` — a steward never sees `pred:auth-mfa` was superseded (the projection is not faithful to the PERSIST-14 delta)"
gen: conformance # held-out · different version pair + delta `Δ₂`, same faithful-render behaviour vs `tools/ref/diff.ts`

### REQ-TOOLS-16b — atlas-diff CLI and MCP parity (happy)

### SCN-TOOLS-16b-1 — atlas-diff returns byte-identical results over CLI and MCP (happy)

source: REQ-TOOLS-16b
Given `atlas-diff shaA shaB` invoked over both the `cli` and `mcp` adapters against the one handler `tools/ref/handler.ts`
When `cli(shaA,shaB)` and `mcp(shaA,shaB)` are computed
Then `cli(shaA,shaB) ≡ mcp(shaA,shaB)` — byte-identical delta, one schema-checked handler behind both transports (the cross-transport equivalence is the TOOLS-3 law, reused here)
teeth: breaks-on "the MCP adapter wraps the delta in a transport envelope `{mcp:{…}}` — `mcp(shaA,shaB) ≠ cli(shaA,shaB)` byte-wise"
gen: conformance # projection parity; the ∀-input equivalence is delegated to the TOOLS-3 PBT over the shared handler

### SCN-TOOLS-16b-2 — a different sha pair also returns byte-identical over CLI and MCP (happy · held-out)

source: REQ-TOOLS-16b
held_out: true
Given `atlas-diff shaB shaC` invoked over both the `cli` and `mcp` adapters against the one handler `tools/ref/handler.ts`
When `cli(shaB,shaC)` and `mcp(shaB,shaC)` are computed
Then `cli(shaB,shaC) ≡ mcp(shaB,shaC)` — byte-identical delta, one schema-checked handler behind both transports
teeth: breaks-on "the MCP adapter wraps the `Δ₂` delta in a transport envelope `{mcp:{…}}` — `mcp(shaB,shaC) ≠ cli(shaB,shaC)` byte-wise"
gen: conformance # held-out · different sha pair (`shaB,shaC`), same CLI≡MCP projection parity vs the shared handler

### REQ-TOOLS-16c — atlas-diff CLI and MCP must not diverge (guard)

### SCN-TOOLS-16c-1 — a bad-sha input rejects identically on both transports (guard)

source: REQ-TOOLS-16c
Given a malformed input `shaB = 42` (a number where a sha string is required) presented over both the `cli` and `mcp` adapter
When `cli(shaA,42)` and `mcp(shaA,42)` are computed
Then both return the **same** structured rejection — the two transports do not diverge in behavior or contract on the identical input
teeth: breaks-on "the MCP adapter coerces `42→\"42\"` and resolves an empty diff while the CLI rejects — divergent verdicts for the same input"
gen: conformance # divergence is the negated parity property (shared handler; TOOLS-3 PBT covers ∀-input)

### SCN-TOOLS-16c-2 — a differently-malformed sha also rejects identically on both transports (guard · held-out)

source: REQ-TOOLS-16c
held_out: true
Given a malformed input `shaA = ["deadbeef"]` (an array where a sha string is required) presented over both the `cli` and `mcp` adapter
When `cli(["deadbeef"],shaB)` and `mcp(["deadbeef"],shaB)` are computed
Then both return the **same** structured rejection — the two transports do not diverge in behavior or contract on the identical input
teeth: breaks-on "the MCP adapter coerces the `[\"deadbeef\"]` array to a string and resolves an empty diff while the CLI rejects — divergent verdicts for the same input"
gen: conformance # held-out · different malformed payload (array-for-sha), same identical-rejection parity vs the shared handler

### REQ-TOOLS-16d — atlas-diff adds no write path (guard)

### SCN-TOOLS-16d-1 — a write attempted through the diff projection is refused (guard)

source: REQ-TOOLS-16d
Given the `atlas-diff` projection handle reached over each transport (MCP / poke / CLI)
When the handle is inspected and a store-mutating call is attempted through it
Then it exposes **no** store-mutating method and the write attempt is refused — atlas-diff is read/subscribe only, writes still funnel through `atlas-emit` (positive property: a read projection opens NO write door)
teeth: breaks-on "the `atlas-diff` handle grows a `.write()`/`.apply()` method that lands a fact from one version into the other — a write path opens via the diff projection, bypassing `atlas-emit`"
gen: conformance # reference-model property of the read handle (no store-mutating method); NOT a formal model

### SCN-TOOLS-16d-2 — an apply attempt on a different diff handle is also refused (guard · held-out)

source: REQ-TOOLS-16d
held_out: true
Given the `atlas-diff shaB shaC` projection handle reached over each transport (MCP / poke / CLI)
When the handle is inspected and a store-mutating `apply-into-version` call is attempted through it
Then it exposes **no** store-mutating method and the attempt is refused — atlas-diff is read/subscribe only, writes still funnel through `atlas-emit` (positive property: a read projection opens NO write door)
teeth: breaks-on "the `atlas-diff shaB shaC` handle grows an `.applyInto()` method that lands a fact from one version into the other — a write path opens via the diff projection, bypassing `atlas-emit`"
gen: conformance # held-out · different sha-pair handle + attempted call, same no-write-authority property vs `tools/ref/diff.ts`

### REQ-TOOLS-16e — atlas-diff is not a write tool (guard)

### SCN-TOOLS-16e-1 — atlas-diff does not grow the governance write surface (guard)

source: REQ-TOOLS-16e
Given the governance surface with `atlas-diff` available as a read projection
When the governance **write** surface is enumerated and the `atlas-diff` handle inspected
Then the write surface stays exactly the three governed doors `{atlas-emit, atlas-link, atlas-memory-emit}` — `WRITE_PATHS == {atlas-emit, atlas-link, atlas-memory-emit}` (`writePaths == 3`) — and `atlas-diff` carries no write authority (a read projection like node TOOLS-10 / doctor TOOLS-12, consistent with TOOLS-1/15, ADR-0003; count superseded by ADR-0006 Decision 2)
teeth: breaks-on "`atlas-diff` is registered on the governance write surface as a fourth write door — write-surface count `== 4` and a write via `atlas-diff` lands"
gen: conformance # write surface == {atlas-emit, atlas-link, atlas-memory-emit} (atlas-diff is a read projection, not a write door)

### SCN-TOOLS-16e-2 — the write surface stays the two governed doors with diff and doctor both present (guard · held-out)

source: REQ-TOOLS-16e
held_out: true
Given the governance surface with **both** `atlas-diff` and `atlas doctor` available as read projections
When the governance **write** surface is enumerated and the `atlas-diff` handle inspected
Then the write surface stays exactly the three governed doors `{atlas-emit, atlas-link, atlas-memory-emit}` — `writePaths == 3` — and `atlas-diff` carries no write authority (a read projection like node TOOLS-10 / doctor TOOLS-12)
teeth: breaks-on "`atlas-diff` is registered on the governance write surface as a fourth write door — write-surface count `== 4` and a write via `atlas-diff` lands"
gen: conformance # held-out · both read projections co-present, same write surface == {atlas-emit, atlas-link, atlas-memory-emit} behaviour vs `tools/ref/diff.ts`

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 57/57 REQ have ≥1 SCN (TOOLS-1a..1d, 2a/2b, 3a/3b, 4, 5a..5e, 6a..6c, 7a..7d, 8a..8d, 9a/9b, 10a..10d, 11-a..11-d, 11a-a..11a-d, 12a..12c, 13a..13d, 14a..14c, 15a..15c, **16a..16e**).
- **REQ-TOOLS-1e (`atlas-link` governed door, ADR-0003) — coverage is split by design, NOT unmodeled here:** its _surface-membership_ property (`atlas-link` ∈ the five-tool `GOVERNANCE_SURFACE` ∧ ∈ the two-door `WRITE_PATHS`) is carried by the amended **SCN-TOOLS-1a-1 / 1a-2 / 1b-1 / 1b-2** conformance SCNs above; its _door-ladder behaviour_ (distinct → both-known → KNOW-11 authz over every scope the merged class spans → the class-tier-graded KNOW-8 ratifier, each fail-closed-visible, and IDENTICAL in the assert and `--retract` modes) is the black-box `s16-sameas` (T1–T5) + `s25-sameas-retraction` (T1–T5) + white-box `wp-sameas` / `sameas-retraction` / `governed-link-retract` teeth, per ADR-0003 (incl. §Retraction / A-D3) — a _behavioural_ gate the reference-model `tools/ref/*.ts` layer does not model. This ledger's `57/57` is the TLS reference-model REQ set; 1e adds no reference-model conformance SCN (no fabricated golden), only the cross-referenced e2e/white-box teeth.
- **Guard coverage:** 22/22 unwanted/If-then/MUST-NOT REQ have a guard SCN — 1c, 2b, 3b, 5c, 5d, 6c, 7b, 8b, 9b, 10b, 10c, 11-a, 11a-b, 11a-c, 12b, 13c, 14c, 15b, 15c, **16c, 16d, 16e**.
- **Teeth (Gate 3):** 57/57 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous. The PBT tri/dual-transport witnesses are interesting (a real re-serializing transport, a real contract fork, a real coercion-vs-reject divergence — no antecedent-failure passes); the reference-model conformance witnesses each drive a genuine divergence against the named `tools/ref/*.ts` mock. The **TOOLS-16** witnesses drive a dropped-partition render (16a), a write-method grown on the diff handle (16d), and a third-write-door registration (16e) — genuine mutants, no vacuous pass.
- **gen histogram:** PBT 6 (3a, 3b, 10a, 10b, 10c, 10d) · conformance 51 (all others, incl. 16a–16e) · residue 0 (every TLS INV has a pure oracle — no hand-written tail).
- **Held-out second leg (Wave H re-freeze):** every `gen: conformance` SCN now carries an independent `held_out: true`
  fixture (`SCN-…-2`) — **51/51 conformance REQ covered**, the execution GATE's held-out leg is now AVAILABLE (FULL
  assurance). Each held-out fixture is genuinely INDEPENDENT (different node/scope/tree/seat/harness/drift-set/sha-pair
  per the _Held-out fixture universe_), hits the SAME behaviour/branch as its base fixture, and names its own
  `teeth: breaks-on` mutant — no renamed clones. The **6 PBT** SCNs (3a/3b/10a–10d) are **exempt** (cross-transport
  equivalence witnesses subsumed by `properties-tls.md`, not conformance). **residue** exempt (0 in TLS). Write-door
  _exploitability_ stays deferred to billy / FR-12 (1c/15b/15c author only the functional refusal — including their
  held-out legs). TOOLS-1 preserved: no held-out fixture surfaces a governance tool beyond the five or a write door beyond `atlas-emit`/`atlas-link`.
- **Positive read-only-projection goldens (write-attempt refused, NOT a formal model):** 1d, 10c, 12a, **16d, 16e** (atlas-diff opens no write door / is not a write tool).
- **Deferred to billy / FR-12 (functional refusal authored here; exploit NOT authored):** 1c, 15b, 15c.
- **ID-scheme note honored:** TOOLS-11 family SCNs use `SCN-TOOLS-11-<c>-<k>` (hyphenated) vs the TOOLS-11a family `SCN-TOOLS-11a-<c>-<k>` — no prefix collision.
