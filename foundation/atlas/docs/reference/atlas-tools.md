# atlas-tools — Reference

> owner: charlie (FORGE) · grounding: claims checked against `spec/atlas.md` §6, §6.1, A-2, A-3, A-5, A-6, A-10, and the acceptance fences §8 · status: draft

## Purpose

The six tools are the Atlas's whole read/write surface (four since inception + `atlas-link`, and `atlas-memory-emit`,
the governed sameAs write door added by WP-SAMEAS and the governed memory write door added by WP-11.W8 — ADR-0003.) Each is **pure + total** (a malformed arg fails
closed to an honest empty verdict, never a throw) and each ships its own `next + invariant` guidance. Every
tool is callable **identically over the CLI and over MCP**, with a published input schema — one contract,
two transports.

## Data model

```
Tool        = 'atlas-init' | 'atlas-query' | 'atlas-emit' | 'atlas-reconcile' | 'atlas-link' | 'atlas-memory-emit'
Guidance    = { next: string, invariant: string }     // shipped with every result
Verdict     = { ok: boolean, data?, rejected?: string, guidance: Guidance }

InitOut      = { territories: Territory[], blastRadius, t0Candidates: string[] }
QueryOut     = Pack   // TWO BANDS (ADR-0013): governing ≤2K tier≥T1 + separately capped T2 advisory, stale-flagged (§6.1)
QueryEnvelope= { pack: Pack, subsumes: Subsumes[], sameAs: SameAs[] }  // Verdict.data for atlas-query (derived, read-only)
EmitOut      = { emitted: boolean, id?, nodeKey?, rejected?: string }
LinkOut      = { linked: boolean, a?, b?, rejected?: string }  // atlas-link (WP-SAMEAS); linked:false = fail-closed refusal
ReconcileOut = { drift: DriftItem[], mechanical: string[], semantic: string[],
                 regroundedCount, reauthorCount, exitCode }   // exit 2 ONLY on semantic drift (TOOLS-8)
DriftItem    = { fact: string, class: 'mechanical'|'semantic', anchorWas, anchorNow }  // reviewable set, not all-or-nothing
DoctorOut    = { archive?, whyBroken?, hotSet?: { size, budget, over: boolean }, plan?: RegroundPlan }  // read-only (TOOLS-12)
```

## Invariants

- **TOOLS-1 Governed write doors (amended WP-SAMEAS, ADR-0003; surface count superseded by ADR-0006
  Decision 2).** The **governance** surface is the DERIVED + BUDGETED `GOVERNANCE_SURFACE` — today six:
  `atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`, `atlas-memory-emit`
  (ADR-0006 Decision 2 replaced the fixed "exactly five" with a derived-and-budgeted property, ARCH-5/6/7).
  Writes MUST flow ONLY through a **governed write door** — one enforcing owner-scoped authorization
  (KNOW-11) AND a ratifier, and whose refusal is fail-closed-**visible** on both transports (never a silent
  ok — TOOLS-14/F2/F5). The closed write set (`WRITE_PATHS`) is three: `atlas-emit` (grounded-fact write),
  `atlas-link` (sameAs-equivalence write), `atlas-memory-emit` (memory write). No back-channel write may bypass
  a governed door; this MUST be enforced **structurally** by the store, not by tool convention alone
  (TOOLS-15) — a shell-armed seat cannot inject a row a governed door did not admit. The read/derive tools
  (`-init`/`-query`/`-reconcile`) and per-node read projections (RETR-5 / TOOLS-10, `diff`/`doctor`/`node`)
  carry NO write authority. _(This amends the former "single write door / exactly four" wording; the property
  preserved is "every write is governed + fail-closed-visible," not the count — see ADR-0003 and ADR-0006.)_
- **TOOLS-2 Pure + total.** Every tool MUST be pure and total: a malformed argument fails closed to a
  structured empty/rejected verdict; none throws (acceptance §8.12).
- **TOOLS-3 CLI + MCP parity.** Every tool MUST be callable identically over the CLI and over MCP, against
  one **published input schema**. The two transports MUST NOT diverge in behavior or contract (§6).
- **TOOLS-4 Guidance shipped.** Every result MUST carry `next + invariant` guidance — what to do next and
  which invariant governs — so the caller is never left to guess the follow-up.
- **TOOLS-5 `atlas-init` auto-promotes nothing.** Move-in MUST be `$0`-LLM and structural; it MUST return
  the territory skeleton + blast radius + T0-candidate flags and MUST NOT set any tier above `T2` or promote
  a `T0` automatically (A-5, A-6). Heuristics MAY only _flag_ a T0 candidate.
- **TOOLS-6 `atlas-query` returns a bounded pack.** It MUST accept any scope (file/folder/module/crate),
  resolve it through the index to the covering territory/-ies, and return a `≤ ~2K` **governing** pack of
  `tier≥T1` invariants, **beside a separately capped ADVISORY band of `T2` machine proposals no ratifier
  saw** (ADR-0013, owner-ratified 2026-08-03); `stale:true` MUST mean re-ground before trusting (§6.1).
  **Freshness is a read-model WATERMARK
  (N11, ADR-0002):** `stale` is `true` when ANY under-scope fact's stored `freshness` is `DRIFTED` OR the
  projection's persist-time `builtAt` HEAD differs from live HEAD (the view is behind HEAD ⇒ unverified). The
  behind-HEAD check is a cheap `git rev-parse HEAD` (NO worktree); `atlas-query` is NOT a live drift oracle —
  the authoritative per-fact re-derivation stays `atlas reconcile` / `atlas doctor`. The query envelope
  (`Verdict.data`) additionally carries the derived, read-only `subsumes` (DP-2) and `sameAs` (WP-SAMEAS)
  relations, scoped to the pack — never a stored merge.
  <!-- AMENDED 2026-08-04 — OWNER RATIFIED, and CLERICAL. Was: "and return a `≤ ~2K` pack of `tier≥T1`
       invariants", a statement about the WHOLE pack. ADR-0013 (owner-ratified 2026-08-03) had already
       ratified the two-band behaviour and it is SHIPPED — `splitBands` / `ADVISORY_CAP`
       (`packages/tools/src/bands.ts`), `Pack.advisory` + `Pack.advisoryDropped`
       (`packages/contracts/src/pack.ts`). Only this text lagged, which left six requirements
       (REQ-TOOLS-6a…6f) citing a ratified invariant that contradicted them. NO behaviour change and no REQ
       change: REQ-TOOLS-6b's quote is re-lifted onto the amended sentence and nothing else moves.
       The retired claim ran through FOUR lines of this file — this bullet, the `QueryOut` data-model line,
       the `atlas-query` Surface/API line and acceptance item 5 — and all four are amended together:
       amending one carrier and leaving three is the exact shape that produced this divergence.
       The link is now MECHANICAL, not editorial — `harness/gates/req-clause-guard.mjs` (npm run
       req-clause-guard, named in ci.yml) resolves every REQ's `normative-clause` into the invariant it
       cites, so the next amendment that skips a quote fails CI. Amending THIS bullet is what proved its
       teeth: REQ-TOOLS-6b went red before its quote was re-lifted. -->
- **TOOLS-7 `atlas-emit` fails closed.** It MUST re-derive the citation at `source@sha`; a node whose
  grounding does not re-derive MUST be rejected (`emitted:false`, nothing persisted) (A-2). Writes MUST be
  templated (A-13) and upserts, not blind inserts (A-12).
- **TOOLS-8 `atlas-reconcile` blocks on SEMANTIC drift only.** At merge-time it MUST classify the `DRIFTED`
  subset by the `atlas-knowledge` KNOW-5 mechanical/semantic split (referenced, not redefined here) and
  present the result as a **reviewable `DriftItem[]` set**, never an all-or-nothing verdict. It MUST exit
  `2` **only** on `semantic` drift — never a silent green there (A-3); a run whose drift is entirely
  `mechanical` MUST exit `0`. It MUST re-author `== |semantic|`, never the whole store (A-4).
- **TOOLS-9 Absorb-driven write.** The `atlas-emit` write path at wave-close MUST be driven by
  `ResultCard.absorb`, not a separate authoring ritual; a sealing wave MUST feed the Atlas or emit a
  grounded why-not (A-10).
- **TOOLS-10 Every node is tri-transport, one contract.** Beyond the six governed tools, **every Atlas
  node** MUST be addressable by its **content address** over three transports against one handler: an
  **MCP tool** (model-callable), a **proactive injection** (the poke), and a **CLI command**
  (human/script-callable, composable in a shell like `curl`). The three MUST NOT diverge in contract; the
  content address is the stable handle and cannot lie (content-addressed). MCP/injection exposure is
  **location-scoped** (RETR-5) purely to protect the model's context; the **CLI is unscoped** — any node is
  addressable by address at any time. This adds **no** write path: all three transports are read/subscribe;
  writes still funnel through `atlas-emit` (TOOLS-1).
- **TOOLS-12 `atlas doctor` is read-only + advisory.** The diagnostic surface (`atlas doctor`) MUST be
  **read/advisory only** — archive inspection, drift-explain / `why-broken <fact>`, hot-set size report
  against a budget, and a **guided re-ground / retire** flow. It MUST NOT persist: any write it proposes
  MUST funnel through `atlas-emit` (the guided flow emits a plan a human/agent then runs, never a direct
  store mutation). It is **not** a governance tool at all (the governance surface is the derived six —
  `atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`, `atlas-memory-emit`; ADR-0006
  Decision 2) — it is a diagnostic view of the same store,
  carrying no write authority, like the per-node read projections (TOOLS-10).
- **TOOLS-13 Mechanical drift auto-re-grounds, no human, no block.** `atlas-reconcile --accept-reground`
  MUST, in **one pass**, auto-re-ground every `mechanical` `DriftItem` (anchor moved but the claim still
  re-derives at the new `@sha`) — updating the anchor with no human and no merge block — and report
  `regroundedCount`. It MUST NOT auto-touch `semantic` drift: those still surface for review and still
  exit `2` (TOOLS-8). Each re-ground write MUST still pass the `atlas-emit` fail-closed check (TOOLS-7) —
  the flag changes _who triggers_ the write (mechanical, automatic), never the grounding bar.
- **TOOLS-11 Subagent reach — push owns the common case, pull is laddered, CLI is the floor.** A seat MUST
  NOT be forced to the CLI to reach the Atlas. Delivery MUST split by **direction**: **push** (the poke /
  pack / `RelationSet`) is the **orchestrator's** job and MUST reach a seat with **no tool grant required** —
  delivered by brief-injection or as a **materialized file the seat reads with its native `Read`**. Only
  **pull** (an ad-hoc mid-task query) MAY require the seat to reach the store, and it MUST resolve down a
  fixed **native-first** ladder (see _Subagent transport_): in-process SDK MCP → registered MCP + grant →
  poke-as-file → orchestrator relay → CLI. Every tier is backed by the **one** handler (TOOLS-10) — tiers
  differ only in transport, never in contract or result.
- **TOOLS-11a Native pull is pinned to the SDK in-process spawn path; the ladder is honest per harness.**
  Orchestra MUST spawn its governed seats via the **Agent SDK in-process path** (`create_sdk_mcp_server`
  in-process + a per-seat `allowed_tools` grant) — this and only this is where native MCP reach (pull 1–2)
  is a wiring job Orchestra controls end-to-end (shared live state, zero-IPC). On any other harness — notably
  the Claude Code `.claude/agents` markdown / Agent-tool path — **MCP-tool propagation to a spawned subagent
  is a reproduced open defect**: native reach silently collapses to push / relay / CLI. Therefore a harness
  that cannot propagate MCP MUST down-rank pull 1 **and** pull 2 to **`unavailable`** and resolve straight to
  push / pull 3–4; it MUST NOT silently fall through a tier it advertises as native. The ladder MUST report
  the tier it actually started on for the running harness — honesty about where native reach begins, not a
  fixed assumption that it always does.
- **TOOLS-14 Pre-phase discovery hook — re-grounding is pushed, never a seat decision.** Mid-task PULL MUST
  NOT be load-bearing. At **every phase transition** the orchestrator MUST **auto-inject a fresh
  `atlas-query`/`own_<unit>` pack** into the seat's context (a push at the phase boundary) — the seat never
  has to _decide_ to re-ground when its context has drifted, and the relay (pull 4) stops being a hot path.
  This is a **push** obligation (TOOLS-11's push tier), so it MUST hold with **no tool grant** and is
  **unaffected by TOOLS-11a**: a seat that received its phase pack by push is correct even on a harness where
  native MCP (pull 1–2) is `unavailable`, because it never needed the grant. Ad-hoc mid-task pull remains
  available but MUST be an optimization, never the mechanism that keeps a seat grounded.
- **TOOLS-15 The single-write-door is structural — a store-level write-guard, not a documented rule.**
  TOOLS-10 leaves the CLI unscoped and shell-reachable, so a seat with `Bash` + filesystem write could
  otherwise mutate the store directly and bypass `atlas-emit`'s fail-closed grounding check (TOOLS-7). To
  close that hole the store medium MUST be **append-only / permissioned**, and **reads MUST enforce a
  content-address integrity check that rejects any un-emitted (ungrounded) row** — an entry not written
  through `atlas-emit`'s grounded, content-addressed path fails the check and is not served. Thus
  `atlas-emit`'s grounding is enforced by the **storage layer**, not by tool convention: a direct write that
  skips the emit path either cannot land (append-only/permission) or is rejected at read (integrity check),
  never surfacing as a served fact.
- **TOOLS-16 `atlas-diff` read-only version projection.** `atlas-diff <shaA> <shaB>` MUST surface the
  PERSIST-14 version-delta ({added, edited, superseded, decayed}, each with provenance) as a **read-only
  projection** — CLI≡MCP (0 divergence, one published schema) and **0 write path** (read/subscribe only;
  writes still funnel through `atlas-emit`). It is a read projection like the per-node `node` handler
  (TOOLS-10) and `atlas doctor` (TOOLS-12), **NOT** a write tool: the governed **write** surface is the three
  governed doors `atlas-emit` + `atlas-link` + `atlas-memory-emit` (TOOLS-1/15, ADR-0003; ADR-0006
  Decision 2 superseded the count) and `atlas-diff` carries no write authority.

## Surface / API

```
atlas-init      <path>                 → InitOut       // $0-LLM structural move-in (A-5, A-6)
atlas-query     <scope>                → QueryOut      // scope → covering pack (governing ≤2K + separately capped T2 advisory band, ADR-0013) + related band, stale-flagged (§6.1)
atlas-emit      <node> --at <sha>      → EmitOut       // fail-closed grounded write (A-2, A-12, A-13)
atlas-reconcile <mergeBase>            → ReconcileOut  // classify drift; exit 2 ONLY on semantic (A-3, A-4, TOOLS-8)
atlas-reconcile <mergeBase> --accept-reground → ReconcileOut  // auto-re-ground mechanical in one pass, no block (TOOLS-13)
atlas-link      <nodeKeyA> <nodeKeyB>  → LinkOut       // governed sameAs write door: authz(both scopes)+ratifier, fail-closed (WP-SAMEAS, ADR-0003)

# per-node read projections (TOOLS-10) — read-only, same handler over MCP tool | poke | CLI:
atlas node      <nodeAddr>             → the node     // get by content address; unscoped over CLI, like `curl`
atlas relate    <scope>                → RelationSet  // deterministic related-node set (see atlas-retrieval RETR-10)
own_<unit>      (crate|module|service|feature) → OwnPack  // CURATED zero-assembly briefing for a scope-unit (RETR-12); drill-down included

# diagnostic surface (TOOLS-12) — READ/ADVISORY only; any resulting write funnels through atlas-emit:
atlas doctor    archive [<scope>]      → DoctorOut    // browse the monotone archive / supersede lineage
atlas doctor    why-broken <fact>      → DoctorOut    // drift-explain: which anchor drifted, mechanical vs semantic
atlas doctor    hot-set --budget <n>   → DoctorOut    // hot-set size vs budget, flags over-budget (advisory)
atlas doctor    reground <fact>        → DoctorOut    // guided re-ground/retire PLAN — emits via atlas-emit, never direct
```

- **`atlas-init`** — structural, `$0`-LLM; ships every territory at the `T2/advisory` default, flags T0
  candidates without promoting them.
- **`atlas-query`** — the discovery entry point; the same call backs the proactive poke/hook (see
  `atlas-retrieval`). A `stale` pack is a signal to re-ground, not a served truth.
- **`atlas-emit`** — the grounded-fact write door. Re-derives the citation; upserts (idempotent on unchanged,
  supersedes on changed); rejects ungrounded or non-templated facts fail-closed.
- **`atlas-link`** — the sameAs-equivalence write door (WP-SAMEAS): asserts two existing nodeKeys name the
  SAME fact (H1), **or retracts a previous assertion** (`--retract` / `retract:true` — a MODE of this door,
  not a sixth tool; A-D3 / task #83). Fail-closed gates, IDENTICAL in both modes: distinct nodes → both exist
  → KNOW-11 authz over every scope the merged CLASS spans → the class-tier-graded KNOW-8 ratifier (`billy`
  when any class member is `T0`). NON-destructive — the equivalence is a derived read-side edge (union-find,
  surfaced in the query envelope), never a fact merge; and a retraction is non-destructive of EVIDENCE (an
  APPEND to `sameAsRetracted`, never a delete) while still splitting the class on the next read
  (ADR-0003, incl. §Retraction).
- **`atlas-reconcile`** — merge gate. Classifies drift (KNOW-5) into a reviewable set; **semantic** drift
  exits 2 (blocking), **mechanical** drift does not. `--accept-reground` auto-re-grounds the mechanical
  subset in one pass — no human, no block — leaving only genuine semantic drift for review.
- **`atlas doctor`** — the human-facing inspect/repair/GC surface for a store where nothing dies and the
  archive grows monotone. Read-only: browse the archive, explain _why-broken_, report the hot-set against
  a budget, and drive a **guided** re-ground/retire whose write still funnels through `atlas-emit`.

## Subagent transport (push vs pull)

The hard part is never "how does a seat call a tool" — it is **most knowledge does not need a seat call at
all.** Split by direction (TOOLS-11): the orchestrator **pushes**; only ad-hoc **pull** needs the seat to
reach the store, down a native-first ladder where the **CLI is the floor, not the fallback**.

| Tier       | Mechanism                                                                   | Seat needs                                                | Engineering status                                                                 |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **push**   | poke / pack / `RelationSet` in the brief, or a materialized `.atlas/*` file | nothing (or `Read`)                                       | trivially available                                                                |
| **pull 1** | in-process SDK MCP server (zero-IPC, shared live state)                     | Orchestra spawns the seat via the **SDK in-process path** | native ONLY on the SDK path; `unavailable` elsewhere (TOOLS-11a)                   |
| **pull 2** | registered MCP server + Atlas tools in the seat's grant                     | SDK spawn + per-seat `allowed_tools` grant                | native ONLY on the SDK path; `unavailable` on `.claude/agents` (reproduced defect) |
| **pull 3** | poke-as-file / brief-injection                                              | `Read` only                                               | trivially true                                                                     |
| **pull 4** | orchestrator **relay** (orchestrator proxies the native call)               | emit a structured request                                 | **proven** (the relay pattern)                                                     |
| **pull 5** | CLI (`atlas node <addr>`)                                                   | shell                                                     | the floor                                                                          |

- **Own-the-spawn is the unlock — but only on the SDK path:** pull 1–2 are a wiring job Orchestra controls
  end-to-end **only** when it spawns via the Agent SDK in-process path (it registers the Atlas server **and**
  authors the seat's grant, both in-process). On the Claude Code `.claude/agents` / Agent-tool path, MCP does
  **not** propagate to the subagent (reproduced defect), so pull 1–2 are `unavailable` and the ladder starts
  at push / pull 3–4. Orchestra MUST NOT advertise native reach on a harness that cannot deliver it.
- Every tier resolves the **same** node by content address and returns the **same** result (TOOLS-10); a
  seat MUST NOT observe a different contract because it landed on a lower tier.

## Guidance

- Read before you write: `atlas-query` a scope to learn its invariants before `atlas-emit`.
- Treat `stale:true` and `emitted:false` as actionable — the `guidance.next` field names the fix.
- Never route a write around a **governed door** (`atlas-emit` / `atlas-link`); the fail-closed
  authorization + grounding checks are the only thing keeping ungrounded/unauthorized writes out of the store.

## Acceptance

1. **TOOLS-1/3** — Each tool resolves identically over CLI and MCP against one published schema; the write
   surface is exactly the three governed doors (`atlas-emit` + `atlas-link` + `atlas-memory-emit`),
   each authz+ratifier+fail-closed; no back-channel write path exists.
2. **TOOLS-2** — Malformed input to every tool returns a structured empty/rejection; none throws (§8.12).
3. **TOOLS-4** — Every result carries non-empty `next + invariant` guidance.
4. **TOOLS-5** — `atlas-init` on any tree ⇒ zero invariants, all territories `T2/advisory`; a T0-keyword
   territory yields `t0Candidate:true` **and** `tier=='T2'` (§8.5, §8.6).
5. **TOOLS-6** — `atlas-query` on a file, folder, module, and crate each returns the merged covering pack:
   its **governing** band `≤ ~2K` tokens, with the `T2` **advisory** band separately capped beside it
   (ADR-0013, owner-ratified 2026-08-03) (§8.9, §8.15).
6. **TOOLS-7** — `atlas-emit` of a node with no resolvable citation ⇒ `emitted:false`, nothing persisted
   (§8.2); a changed fact supersedes rather than duplicates (§8.13).
7. **TOOLS-8 / TOOLS-13** — A merge that drifts a fact **semantically** ⇒ `semantic` non-empty,
   `exitCode==2`, `reauthorCount==|semantic|`; a merge whose drift is entirely **mechanical** ⇒
   `exitCode==0` and, under `--accept-reground`, `regroundedCount==|mechanical|` with the anchors updated
   in one pass, no human — while any semantic item still blocks (§8.3, §8.4).
8. **TOOLS-9** — A sealing wave with no `absorb` and no why-not ⇒ the probe records a violation (§8.10).
9. **TOOLS-10** — The same node resolves byte-identically over its MCP tool, its poke injection, and
   `atlas node <addr>` on the CLI; the CLI reaches a node **outside** the current scope (unscoped) while the
   MCP tool surface stays scope-local (RETR-5); none of the three exposes a write path — a write attempt
   through them is rejected and only a governed door (`atlas-emit` / `atlas-link`) persists.
10. **TOOLS-11** — A `Read`-only seat (no MCP grant, no shell) still receives its pack (push) and can still
    resolve a mid-task query (via poke-as-file or orchestrator relay) — it is never forced to the CLI; a seat
    landing on a lower ladder tier gets a result byte-identical to the native-MCP tier.
11. **TOOLS-11a** — A seat spawned on the SDK in-process path resolves pull 1–2 natively; the **same** seat
    spawned on the `.claude/agents` / Agent-tool path reports pull 1–2 as `unavailable` and resolves via
    push / pull 3–4 (never a silent fall-through), returning a byte-identical result.
12. **TOOLS-14** — Crossing a phase boundary auto-injects a fresh `atlas-query`/`own_<unit>` pack into the
    seat without any seat-side pull or tool grant; a `Read`-only seat on an MCP-`unavailable` harness is
    still correctly re-grounded at the boundary purely by push.
13. **TOOLS-15** — A row written directly to the store (bypassing `atlas-emit`, e.g. a shell + filesystem
    write) either cannot land (append-only/permission) or fails the content-address integrity check on read
    and is not served; only rows emitted through `atlas-emit`'s grounded path resolve.
14. **TOOLS-12** — `atlas doctor why-broken <fact>` explains the drifted anchor and its class;
    `hot-set --budget n` flags over-budget; `reground <fact>` returns a plan and **persists nothing** — the
    store changes only when that plan is run through a governed door (`atlas-emit`); a write attempted
    directly via `doctor` is rejected. TOOLS-1's governance surface is the derived six (ADR-0006
    Decision 2); its write surface is the three governed doors `atlas-emit` + `atlas-link` +
    `atlas-memory-emit`.
