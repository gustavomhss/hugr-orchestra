# Method-tags — Block TLS (tools/delivery) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-tls.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE); write-door security-exploitability arm reviewed by billy (FORTRESS, FR-12).
>
> One tag per **behavioural** INV by the 3-conjunct rule. TLS is the **delivery layer** — read/subscribe
> projections over the kernel store + one governed write-door. **NONE is `formal`**: the whole block fails
> conjunct #2 (there is no combinatorial interleaving a competent engineer + tests would miss — the one formal
> cluster in the Atlas is `FSPEC-merge`, owned by Block KRN, and TLS only _consumes_ it). By the ratified S0
> hint (**standard**) the baseline is **reference-model**; the two invariants whose load-bearing property is
> **cross-transport determinism** (an input→two/three-transport equivalence, quantified over inputs) earn **PBT**
> by shape. All 17 TLS invariants are `behavioural` (register), so none carries `n/a`. (**TOOLS-16** — the
> `atlas-diff` read-only version projection — is `reference-model`: a read projection opening no write path
> (like doctor TOOLS-12), its CLI≡MCP determinism arm delegated to the TOOLS-3 PBT.)

---

### INV-TOOLS-1

method-tag: reference-model
fspec: —
up-property: "governed-write-door totality: the governance surface is the DERIVED + BUDGETED six (`atlas-init/query/emit/reconcile/link/memory-emit`, ADR-0006 Decision 2), every write flows through a governed door (`WRITE_PATHS = {atlas-emit, atlas-link, atlas-memory-emit}`, each KNOW-11 authz + ratifier + fail-closed-visible refusal), and a back-channel write is refused (0 ungoverned write path); per-node read projections carry 0 write authority (ADR-0003)"
down-model: "the reference tools layer exposes exactly three governed write entries (`atlas-emit` grounded-fact write, `atlas-link` sameAs write, `atlas-memory-emit` memory write) over an append-only store (`tools/ref/store.ts`); a unit test enumerates the 6-tool surface, asserts `WRITE_PATHS == {atlas-emit, atlas-link, atlas-memory-emit}`, and asserts every read-projection handle returns a Verdict with no store-mutating method"
anti-rot: `tools/ref/store.ts` (the governed-write-door reference store) is imported as the mock in the tools-surface unit tests; a code path that opens an ungoverned write door outside `{atlas-emit, atlas-link, atlas-memory-emit}` fails the `WRITE_PATHS` assertion. _(Security-exploitability of the door — a shell-armed seat red-teaming the permission model — is FR-12/billy, not this functional property; see Refuse-to-model.)_

### INV-TOOLS-2

method-tag: reference-model
fspec: —
up-property: "pure + total: every tool is a pure function of its args and is total — a malformed argument fails closed to a structured empty/rejected Verdict and never throws (0 exceptions)"
down-model: "the reference tool wrapper is total by construction — every entry returns `Verdict{ok,rejected?,guidance}`, never throws; the golden generator is PBT-fuzz over arbitrary + malformed args asserting no-throw and a structured verdict"
anti-rot: `tools/ref/tool.ts` (the total Verdict wrapper) is the mock; PBT fuzzes it and the code side-by-side, so a throwing code path fails the shared no-throw property. _(Tag stays `reference-model` — the total reference IS the oracle; the shape is robustness/totality, not ordering, so it earns no standalone `PBT` tag, per KERNEL-7.)_

### INV-TOOLS-3

method-tag: PBT
fspec: —
up-property: "cross-transport equivalence: for every input, a tool invoked over the CLI and over MCP against the one published schema returns a byte-identical result — the two transports never diverge in behaviour or contract (0 divergence)"
down-model: "the one handler is the oracle; both transport adapters (`cli`, `mcp`) call it against one schema; PBT quantifies over arbitrary valid + malformed inputs and asserts `cli(x) ≡ mcp(x)` for all `x`"
anti-rot: `tools/ref/handler.ts` (the single schema-checked handler behind both adapters) is the mock; a transport adapter that forks behaviour diverges from it and fails the equivalence property. _(Shape = determinism across transports → PBT, not reference-model: the load-bearing fact is a universally-quantified equivalence, the same shape as TOOLS-10.)_

### INV-TOOLS-4

method-tag: reference-model
fspec: —
up-property: "guidance totality: every tool result carries non-empty `next + invariant` guidance — the caller is never left to guess the follow-up (100% of results)"
down-model: "the reference Verdict constructor attaches `Guidance{next,invariant}` on every path (ok and rejected); a unit test asserts guidance is non-empty on every reference entry point's output"
anti-rot: shares `tools/ref/tool.ts` — the Verdict wrapper that stamps guidance is the mock; a code result that ships an empty guidance field fails the non-empty assertion.

### INV-TOOLS-5

method-tag: reference-model
fspec: —
up-property: "structural, no-promote move-in: `atlas-init` is `$0`-LLM and returns {skeleton, blastRadius, T0-flags}; it never sets a tier above `T2` and never auto-promotes a `T0` (0 promotions); a heuristic may only flag a candidate"
down-model: "the reference `init(tree)` is a pure structural walk returning `InitOut` with every territory at `T2` and `t0Candidate` a boolean flag only; a test on any tree asserts `max(tier)==T2` and `0` promotions, and that a T0-keyword territory yields `t0Candidate:true ∧ tier=='T2'`"
anti-rot: `tools/ref/init.ts` (the `$0`-LLM structural mover) is the mock; a code init that promotes past T2 or calls an LLM diverges from it and fails the tier-cap assertion.

### INV-TOOLS-6

method-tag: reference-model
fspec: —
up-property: "bounded read projection: `atlas-query` resolves any scope through the index to its covering territory/-ies and returns a `≤ ~2K` pack of `tier≥T1` invariants; a `stale:true` pack means re-ground before trusting (0 stale pack served as truth)"
down-model: "the reference `query(scope)` resolves scope→territories via the index reference and returns a `Pack` filtered to `tier≥T1` and size-bounded; a test asserts the pack contains only `tier≥T1` nodes and that `stale` is surfaced, not silently trusted"
anti-rot: `tools/ref/query.ts` (the bounded pack projector) is the mock; a code query that leaks `T0`/below-`T1` nodes or serves a stale pack as fresh diverges from it. _(The `≤ ~2K` token count is an advisory size bound — verified by a size test, not a correctness oracle; see Refuse-to-model.)_
AMENDED 2026-08-03 (owner-ratified; ADR-0002 amendment + ADR-0013): the pack is TWO separately bounded, separately rendered bands, and every row carries its own freshness verdict. The `up-property` above is unchanged AS A STATEMENT ABOUT THE GOVERNING BAND — `tier≥T1`, `≤ ~2K`, `stale:true ⇒ re-ground`, all still exactly true of `Pack.invariants`, whose content and order this amendment does not move. Added beside it: `Pack.advisory` carries `T2` rows under their OWN `2000`-token cap with a `Pack.advisoryDropped` ledger (0 silent drops), both bands are stated as tier MEMBERSHIP so an off-lattice tier is in NEITHER, and `PackInvariant.freshness` carries the per-fact GROUND-1 verdict re-derived per read over the already-built axes (no git I/O). The pack-level `stale` watermark is UNCHANGED and is not computed from the per-fact verdict — they answer different questions (REQ-TOOLS-6d/-6e/-6f). The divergence this note recorded as OPEN — `reference/atlas-tools.md#tools-6`, ADR-0013's own declared surface — is now CLOSED (WP-FIX-5.SPEC): that invariant was AMENDED 2026-08-04, owner-ratified, to "a `≤ ~2K` **governing** pack of `tier≥T1` invariants, **beside a separately capped ADVISORY band of `T2` machine proposals no ratifier saw**", and the same claim was fanned out to the three other lines of that file that carried it, plus `spec/atlas.md` and `reference/atlas-knowledge.md`. The `up-property` above is still deliberately NOT rewritten: the 2026-08-03 amendment scoped it as a statement about the GOVERNING band, that scoping is ratified and remains true of `Pack.invariants`, and re-authoring a ratified law under cover of a clerical fix is not this WP's surface. What was false was this sentence, and only this sentence.

### INV-TOOLS-7

method-tag: reference-model
fspec: —
up-property: "fail-closed grounded write: `atlas-emit` re-derives the citation at `source@sha`; a node whose grounding does not re-derive is rejected (`emitted:false`, 0 persisted); writes are templated and upserts (a changed fact supersedes, 0 duplicates)"
down-model: "the reference `emit(node,@sha)` re-derives grounding against the source reference; on failure returns `{emitted:false}` and mutates nothing; on success upserts (idempotent-on-unchanged, supersede-on-changed); a test drives an unresolvable citation ⇒ nothing persisted, and a changed fact ⇒ 1 superseding row, 0 dup"
anti-rot: `tools/ref/emit.ts` (the fail-closed grounded writer) is the mock reused by the emit unit tests and by every write-door consumer (TOOLS-9/13/15); a blind-insert or grounding-bypass code path diverges from it and breaks the build.

### INV-TOOLS-8

method-tag: reference-model
fspec: —
up-property: "drift classification with a deterministic exit-gate: `atlas-reconcile` classifies `DRIFTED` into a reviewable `DriftItem[]` (never all-or-nothing), exits `2` **only** when `|semantic|>0` (0 silent green there), exits `0` when drift is entirely mechanical, and re-authors `== |semantic|` (never the whole store)"
down-model: "the reference `reconcile(base)` maps each drift item through the KNOW-5 split (referenced, not redefined) then applies the exit-gate `exitCode = |semantic|>0 ? 2 : 0` and `reauthorCount==|semantic|`; a test drives a semantic-drift set ⇒ exit2 + reauthor==|semantic|, a mechanical-only set ⇒ exit0"
anti-rot: `tools/ref/reconcile.ts` (the classify + exit-gate reference) is the mock; a code path that greens on semantic drift or re-authors the whole store diverges from it. _(The KNOW-5 mechanical/semantic classifier itself is owned by Block GRD and consumed here, not modeled — see Refuse-to-model.)_

### INV-TOOLS-9

method-tag: reference-model
fspec: —
up-property: "absorb-driven write: the wave-close write is driven by `ResultCard.absorb` (not a separate authoring ritual); a sealing wave with no `absorb` and no grounded why-not records a probe violation (0 silent seals)"
down-model: "the reference wave-close reads `ResultCard.absorb` and routes it through `emit`; a probe asserts `sealed ⇒ (absorbed ∨ why-not-emitted)`, else it records a violation; a test drives a seal with neither ⇒ 1 recorded violation"
anti-rot: `tools/ref/emit.ts` is reused (the absorb path IS an emit); the seal-probe reference is the mock in the wave-close test — a seal that writes outside the absorb path or skips the why-not fails the probe.

### INV-TOOLS-10

method-tag: PBT
fspec: —
up-property: "tri-transport byte-identity: every Atlas node is addressable by its content address over three transports (MCP tool / poke injection / CLI) against one handler, byte-identical across all three (0 contract divergence); the CLI is unscoped; and all three are read/subscribe only — they add 0 write path"
down-model: "the one node handler is the oracle; three transport adapters resolve a node by content address; PBT quantifies over arbitrary node addresses and asserts `mcp(a) ≡ poke(a) ≡ cli(a)` for all `a`, and that none of the three exposes a store-mutating method (write still funnels through `atlas-emit`)"
anti-rot: `tools/ref/handler.ts` (the single content-addressed node handler, shared with TOOLS-3/11) is the mock; a transport that forks the contract diverges under the tri-equivalence property, and a transport that grows a write path fails the no-write assertion. _(Shape = determinism across transports → PBT; the read-only-projection / no-write-path arm is verified here as a reference-model property of the same handler — see Refuse-to-model.)_

### INV-TOOLS-11

method-tag: reference-model
fspec: —
up-property: "push-owns-common-case, laddered pull, CLI-floor: a seat is never forced to the CLI (0 forced); push (poke/pack/RelationSet) reaches a `Read`-only seat with no tool grant; an ad-hoc pull resolves down the fixed native-first ladder (SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI); every tier is the one handler, so tiers differ only in transport, never in result"
down-model: "the reference `resolve(seat, need)` splits by direction: push materializes a file/brief a `Read`-only seat consumes with no grant; pull walks the ordered ladder returning the first available tier; a test asserts a `Read`-only seat is served by push and that the resolved tier's result equals the native-tier result"
anti-rot: `tools/ref/ladder.ts` (the direction-split + native-first resolver) is the mock; a code path that forces a seat to the CLI or requires a grant for push diverges from it. _(The byte-identity-across-tiers arm is **delegated** to TOOLS-10's PBT — every tier is backed by the one handler — so TOOLS-11 does not re-tag the determinism; it models the routing/push structure. Tag stays `reference-model`.)_

### INV-TOOLS-11a

method-tag: reference-model
fspec: —
up-property: "honest ladder per harness: native pull (tiers 1–2) is pinned to the SDK in-process spawn path; a harness that cannot propagate MCP down-ranks pull 1 **and** pull 2 to `unavailable` and resolves straight to push / pull 3–4; it never silently falls through a tier it advertises as native (0 silent fall-through); the ladder reports the tier it actually started on"
down-model: "the reference ladder takes a harness capability `{canPropagateMcp:bool}`; when false it marks tiers 1–2 `unavailable` and starts at push/pull-3, and always returns `startedTier`; a test drives `canPropagateMcp:false` ⇒ tiers 1–2 `unavailable` ∧ a reported non-native start, and asserts no advertised-native tier is silently skipped"
anti-rot: shares `tools/ref/ladder.ts` — the harness-aware resolver is the mock; a code ladder that advertises native reach on a `.claude/agents` harness diverges from it and fails the down-rank assertion. _(The reproduced MCP-propagation defect is an observed environmental fact, not modeled — see Refuse-to-model.)_

### INV-TOOLS-12

method-tag: reference-model
fspec: —
up-property: "read/advisory-only doctor: `atlas doctor` is read/advisory only — it persists nothing (0 direct store mutations); any write it proposes is a plan that funnels through `atlas-emit`; it carries no write authority and is not a governance tool (the governance surface is the derived six, ADR-0006 Decision 2)"
down-model: "the reference `doctor(cmd)` returns `DoctorOut` (archive/why-broken/hot-set/plan) with no store-mutating method; a test asserts every doctor sub-command leaves the store byte-identical, and that `reground` returns a `RegroundPlan` that only mutates when run through `emit`"
anti-rot: `tools/ref/doctor.ts` (the no-write-authority projection) is the mock; a doctor code path that mutates the store directly diverges from it and fails the store-unchanged assertion. _(This is the explicit refusal made positive: a read-only projection opens NO write path — verified here as a reference-model property, NOT a formal one.)_

### INV-TOOLS-13

method-tag: reference-model
fspec: —
up-property: "mechanical auto-re-ground, no human, no block: `atlas-reconcile --accept-reground` re-grounds every `mechanical` DriftItem in one pass (anchor moved, claim still re-derives), reports `regroundedCount==|mechanical|`, never auto-touches `semantic` drift (those still surface + exit `2`), and each re-ground write still passes the `atlas-emit` fail-closed check"
down-model: "the reference `reconcile(base, {acceptReground:true})` re-grounds exactly the mechanical subset via `emit` in one pass, leaves the semantic subset untouched, and reports counts; a test asserts `regroundedCount==|mechanical|` ∧ semantic items still exit2 ∧ every re-ground call passed `emit`'s grounding bar"
anti-rot: reuses `tools/ref/reconcile.ts` + `tools/ref/emit.ts` — the auto-re-ground path is an `emit` under the flag, so it inherits the fail-closed mock; a code path that touches semantic drift or bypasses the grounding bar diverges and breaks the build.

### INV-TOOLS-14

method-tag: reference-model
fspec: —
up-property: "push-driven pre-phase discovery: at every phase transition the orchestrator auto-injects a fresh `atlas-query`/`own_<unit>` pack into the seat's context, with no tool grant, so a seat never has to _decide_ to re-ground; mid-task pull is an optimization only, never load-bearing (0 seats ungrounded at a boundary by pull-failure)"
down-model: "the reference phase-hook fires on every boundary and materializes a fresh pack the seat consumes by `Read` (push tier, no grant); a test crosses a boundary on an MCP-`unavailable` harness and asserts the seat is re-grounded purely by push, with pull never invoked"
anti-rot: `tools/ref/push.ts` (the phase-boundary pack injector) is the mock; a code path that leaves re-grounding to a seat-side pull diverges from it and fails the boundary-push assertion. _(Independent of TOOLS-11a: a pushed seat is correct even where native pull is `unavailable`.)_

### INV-TOOLS-15

method-tag: reference-model
fspec: —
up-property: "structural single-write-door: the store medium is append-only / permissioned, and reads enforce a content-address integrity check that rejects any un-emitted (ungrounded) row — a direct write that skips `atlas-emit` either cannot land (append-only/permission) or is rejected at read (integrity), never surfacing as a served fact (0 ungrounded rows served)"
down-model: "the reference store (`tools/ref/store.ts`) is append-only + content-addressed; `read(id)` recomputes the content address and rejects a row whose bytes were not produced by `emit`'s grounded path; a test writes a row directly (bypassing emit) and asserts it is refused at write or rejected at read, and never served"
anti-rot: `tools/ref/store.ts` (append-only + read-time integrity check, shared with TOOLS-1) is the mock reused by the store integrity tests; a code store that serves a directly-injected row diverges from it and breaks the build. *(The *exploitability* of this door — an adversary probing the append-only/permission model — is FR-12/billy's security review, not a reference-model property; see Refuse-to-model.)*

### INV-TOOLS-16

method-tag: reference-model
fspec: —
up-property: "read-only version-diff projection: `atlas-diff <shaA> <shaB>` surfaces the PERSIST-14 delta (added/edited/superseded/decayed, each with provenance) as a **read-only projection** — 0 write path (read/subscribe only; writes funnel through a governed door `atlas-emit`/`atlas-link`), **CLI≡MCP** parity against one schema (0 divergence), and the governance **write** surface stays the two governed doors `{atlas-emit, atlas-link}` (atlas-diff is a read projection like node TOOLS-10 / doctor TOOLS-12, **NOT** a write tool, consistent with TOOLS-1/15, ADR-0003)"
down-model: "the reference `atlasDiff(shaA,shaB)` reads the PERSIST-14 delta (from `persist/ref/diff.ts`) and renders it; a unit test asserts the diff handle carries **no** store-mutating method (0 write path), that the governance write surface stays `{atlas-emit, atlas-link}`, and that the delta is surfaced faithfully; the CLI≡MCP determinism arm is **delegated** to the TOOLS-3 cross-transport PBT over the one handler `tools/ref/handler.ts` (every surface is the one handler)"
anti-rot: `tools/ref/diff.ts` (the read-only diff projection over `persist/ref/diff.ts`, reused as the mock) is the mock; a code path that grows a write method on the diff surface, registers it as a third write door, or forks CLI/MCP behaviour diverges from it and breaks the build. _(Tag is `reference-model` — a read-only projection opening **NO** write path is a reference-model property, **not** a `formal` one (no combinatorial interleaving); the cross-transport determinism arm reuses TOOLS-3's PBT, exactly the TOOLS-11 delegation pattern.)_

---

## Refuse-to-model

- **read-only projections opening a write path** _(made positive, not skipped)_: that the tri-transport node
  handler (TOOLS-10), the `atlas doctor` surface (TOOLS-12), and the per-node read projections (TOOLS-1) open
  **no** write path is verified as a **reference-model** property — the reference handler exposes no
  store-mutating method and every write funnels through `emit`. It is NOT a `formal` property: there is no
  combinatorial interleaving to check, so a formal model would be pure overhead.
- **security-exploitability of the single-write-door** (TOOLS-1 / TOOLS-15): the reference model verifies the
  _functional_ property — a direct/back-channel write cannot land or is rejected at read. Adversarial
  **exploitability** (a shell-armed seat red-teaming the append-only/permission model, penetration of the
  content-address integrity check) is **FR-12 / billy (FORTRESS)**'s security-review domain, not a
  reference-model or formal property here.
- **the KNOW-5 mechanical/semantic drift classifier** (TOOLS-8 / TOOLS-13): referenced from Block GRD, not
  redefined or modeled in TLS. TLS models only the deterministic exit-gate and action mapping _given_ a
  classification; the classifier's correctness is GRD's.
- **the `FSPEC-merge` convergence core**: TLS _consumes_ it (via `atlas-emit`/`atlas-reconcile` over the fold)
  but does not re-model it. The one `formal` cluster in the Atlas is owned by Block KRN; nothing in TLS earns
  `formal` (all TLS invariants fail conjunct #2 — no combinatorial state a competent engineer + tests miss).
- **the `≤ ~2K` pack token budget** (TOOLS-6): an advisory size bound, verified by a size/load test — there is
  no correctness oracle for a "~" number.
- **performance / pack-assembly + reconcile latency**: covered by load tests; no correctness oracle.
- **the transport wire itself** — MCP protocol internals, CLI arg-parsing, and the **reproduced
  MCP-propagation defect** on the `.claude/agents` path (TOOLS-11a): treated as a black-box environmental
  adversary. We model that the **one handler** returns identical results and that the ladder reports honestly;
  we do not model the SDK/Claude-Code transport stacks. The propagation defect is an _observed fact_, not a
  modeled behaviour.
- **the content-address / hash primitive** (TOOLS-15): the read-time integrity check trusts the kernel's
  content address (KERNEL-1); the digest's collision-resistance is an assumed trusted primitive, not modeled.
- **the code itself**: conformance-tested (sampled) against the reference tools — "success = we could not find
  a bug"; a verified design is not a verified impl. Confidence is bought with scale + coverage, not a proof.
- **concurrent + crashing store writes simultaneously**: append-only durability under crash and concurrent
  git-merge writes are checked _separately_, never in one model (ShardStore rule).

## FSPEC

**None.** No TLS cluster earns a machine-checked formal model (the formal cluster = `FSPEC-merge`, owned by
Block KRN). TLS consumes the core through `atlas-emit`/`atlas-reconcile`; its anti-rot floor reuses the KRN
reducer only transitively (via the fold it reads), not as a TLS-authored model.

## Completion report

- tagged-register: `docs/requirements/method-tags-tls.md`
- tag histogram: **formal 0** · **exhaustive 0** · **PBT 2** (TOOLS-3, TOOLS-10) · **reference-model 15**
  (TOOLS-1/2/4/5/6/7/8/9/11/11a/12/13/14/15/16)
- FSPEC: **none** (formal cluster = KRN `FSPEC-merge`; TLS consumes, does not author)
- refusal count: **9**
- every TOOLS-1..16 + 11a tagged: **yes** (17/17; all behavioural, 0 `n/a`)
- shape-no-fit flag: **none** (every INV matched a tool-per-shape row: cross-transport determinism → PBT;
  read-only projection / write-door integrity / totality → reference-model)
- → next_state **S3** (goldens).
