# Properties — Block TLS (tools/delivery) · S3-sibling ∀-laws (rendered, not invented)

> **state:** S3-sibling · **source (frozen):** [`method-tags-tls.md`](./method-tags-tls.md) `@sha256:e769215c` — the `up-property` law of each behavioural INV ·
> **owner:** charlie (FORGE); write-door arm reviewed by billy (FR-12) ·
> **purpose:** render every frozen TLS `up-property` into a runnable ∀-quantified property (the oracle-free, beyond-the-witness PBT leg). **Invents no law.**
>
> **No FSPEC.** TLS authors no `formal` cluster (the one formal model, `FSPEC-merge`, is KRN's; TLS only consumes it via `atlas-emit`/`atlas-reconcile`). So no law here is transcribed from `fspec-merge.md`; each `law` is the `∀ … . predicate` render of the frozen `up-property` prose, carried as a `ptr+digest` so an upstream edit renders the property STALE.
>
> `source` = ptr + `@sha256:` digest of the frozen `method-tags-tls.md` (whole-file, first 8 hex). `arbitrary` is a **spec** for the generator to author, not runtime. `witness` links the frozen property-flavored/conformance goldens that instance the law.

---

### PROP-TOOLS-1 — governed-write-door totality

inv: INV-TOOLS-1
source: ./method-tags-tls.md#INV-TOOLS-1 @sha256:e769215c
law: ∀ layer L. surface(L) ≡ {atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link} ∧ writePaths(L) ≡ {atlas-emit, atlas-link} (== 2, each governed: KNOW-11 authz + ratifier + fail-closed-visible refusal) ∧ (∀ p ∈ readProjections(L). writeAuthority(p) == 0) (ADR-0003)
arbitrary: arb over layer wirings — the 5 tools + an arbitrary set of per-node read projections (RETR-5/TOOLS-10 handles); a mutator that may register an extra tool or an ungoverned write path outside {atlas-emit, atlas-link}, or grow a `.write()` on a projection
covers_reqs: [ REQ-TOOLS-1a, REQ-TOOLS-1b, REQ-TOOLS-1c, REQ-TOOLS-1d ]
witness: [ SCN-TOOLS-1a-1, SCN-TOOLS-1b-1, SCN-TOOLS-1c-1, SCN-TOOLS-1d-1 ]
teeth: breaks-on "a sixth governance tool or a THIRD write door (an ungoverned write path outside {atlas-emit, atlas-link}) registered for ANY wiring — the lone 5-tool witness misses the writePaths ≡ {atlas-emit, atlas-link} invariant under an arbitrary projection set"

### PROP-TOOLS-2 — pure + total

inv: INV-TOOLS-2
source: ./method-tags-tls.md#INV-TOOLS-2 @sha256:e769215c
law: ∀ tool t, args a. t(a) ≡ t(a) (deterministic, 0 side effect) ∧ (malformed(a) ⇒ t(a) == Verdict{rejected, guidance} ∧ ¬throws(t,a)) — `exceptions == 0`
arbitrary: arb over {every tool} × {arbitrary valid args ∪ malformed args (wrong type, missing field, oversized, adversarial)}; double-invocation on byte-identical args
covers_reqs: [ REQ-TOOLS-2a, REQ-TOOLS-2b ]
witness: [ SCN-TOOLS-2a-1, SCN-TOOLS-2b-1 ]
teeth: breaks-on "SOME malformed arg in the fuzz space throws an uncaught TypeError instead of a structured rejected Verdict — the single 2b witness (`scope:42`) misses the throw hiding behind a different malformed shape"

### PROP-TOOLS-3 — CLI ≡ MCP cross-transport equivalence (PBT)

inv: INV-TOOLS-3
source: ./method-tags-tls.md#INV-TOOLS-3 @sha256:e769215c
law: ∀ x ∈ Input. cli(x) ≡ mcp(x) — byte-identical Verdict over the one schema-checked handler `tools/ref/handler.ts` (0 divergence, valid ∨ malformed x)
arbitrary: arb over inputs to the one handler — valid args under the published schema ∪ malformed args; both adapters (`cli`, `mcp`) run the same `x`
covers_reqs: [ REQ-TOOLS-3a, REQ-TOOLS-3b ]
witness: [ SCN-TOOLS-3a-1, SCN-TOOLS-3b-1 ]
teeth: breaks-on "a transport-specific envelope / default-coercion that diverges on an input NOT in the two witnesses — the ∀ kills any re-serialization or coerce-vs-reject fork the two example inputs cannot enumerate"

### PROP-TOOLS-4 — guidance totality

inv: INV-TOOLS-4
source: ./method-tags-tls.md#INV-TOOLS-4 @sha256:e769215c
law: ∀ result r ∈ toolResults. r.guidance.next ≠ ∅ ∧ r.guidance.invariant ≠ ∅ — `emptyGuidance == 0` on both the ok and the rejected path
arbitrary: arb over {every tool entry point} × {inputs driving both the ok and the rejected branch}; inspect `guidance` on the returned Verdict
covers_reqs: [ REQ-TOOLS-4 ]
witness: [ SCN-TOOLS-4-1 ]
teeth: breaks-on "some rejected path (not the one witnessed) ships `guidance:{}` — the ∀ over all entry points catches the empty-guidance leak the single ok/reject pair misses"

### PROP-TOOLS-5 — structural, no-promote move-in

inv: INV-TOOLS-5
source: ./method-tags-tls.md#INV-TOOLS-5 @sha256:e769215c
law: ∀ tree T. llmCalls(init(T)) == 0 ∧ max(tier over territories(init(T))) == T2 ∧ promotions(init(T)) == 0 ∧ (∀ terr. t0Keyword(terr) ⇒ t0Candidate(terr) ∧ tier(terr) == T2)
arbitrary: arb over trees — territory sets of varied shape/depth, some matching T0 keywords, some not; assert tier-cap, 0 LLM calls, flag-only heuristic
covers_reqs: [ REQ-TOOLS-5a, REQ-TOOLS-5b, REQ-TOOLS-5c, REQ-TOOLS-5d, REQ-TOOLS-5e ]
witness: [ SCN-TOOLS-5a-1, SCN-TOOLS-5b-1, SCN-TOOLS-5c-1, SCN-TOOLS-5d-1, SCN-TOOLS-5e-1 ]
teeth: breaks-on "some tree whose T0-keyword territory is auto-promoted past T2 — the ∀ over trees kills a promotion the single `auth/` witness tree cannot surface"

### PROP-TOOLS-6 — bounded read projection

inv: INV-TOOLS-6
source: ./method-tags-tls.md#INV-TOOLS-6 @sha256:e769215c
law: ∀ scope s. resolves(query(s), coveringTerritories(s)) ∧ (∀ n ∈ pack(query(s)). tier(n) ≥ T1) ∧ (stale(pack) ⇒ surfaced(stale)) — 0 below-T1 node, 0 stale-served-as-fresh
arbitrary: arb over scopes (file / dir / territory / cross-territory) against an index reference; packs mixing tiers T0..T2 and stale ∨ fresh nodes
covers_reqs: [ REQ-TOOLS-6a, REQ-TOOLS-6b, REQ-TOOLS-6c ]
witness: [ SCN-TOOLS-6a-1, SCN-TOOLS-6b-1, SCN-TOOLS-6c-1 ]
teeth: breaks-on "a scope whose pack leaks a below-T1 node or drops the `stale` flag — the ∀ over scopes catches a tier-leak the single `finance/` witness misses"
note: the `≤ ~2K` token budget is an advisory size bound (size test, not a correctness oracle) per method-tags Refuse-to-model — NOT rendered as a ∀-law
AMENDED 2026-08-03 (owner-ratified; ADR-0013 + the ADR-0002 amendment): the `law` above is unchanged as the GOVERNING-band law — read `pack(query(s))` as `Pack.invariants`, which still admits no below-T1 node and still surfaces `stale`. Two conjuncts join it and are NOT rendered as ∀-laws here for the same Refuse-to-model reason the token budget is not: (i) `∀ n ∈ advisory(query(s)). tier(n) = T2` and `|advisory| ≤ 2000 tokens` with `advisoryDropped` accounting for every row the cap cut, and (ii) `∀ n ∈ invariants ∪ advisory. freshness(n) ∈ {FRESH, DRIFTED, STALE}`, re-derived per read. Both are conformance-witnessed instead: SCN-TOOLS-6e-1..4, SCN-TOOLS-6f-1..3.
RE-FROZEN 2026-08-04 (`aa329ac9` → `ecf859a9`, all 19 pins in this file, WP-FIX-5.SPEC). The upstream edit that moved the digest was to the CLOSING SENTENCE of INV-TOOLS-6's amendment note only — it recorded `reference/atlas-tools.md#tools-6` as an OPEN divergence, and that divergence is now closed by the owner-ratified 2026-08-04 amendment. No `up-property`, `down-model` or `anti-rot` text moved, so the `law`, `arbitrary`, `teeth` and `witness` above are reconciled UNCHANGED — the re-freeze carries no property edit, and this line says so rather than leaving a silent digest bump.

### PROP-TOOLS-7 — fail-closed grounded write

inv: INV-TOOLS-7
source: ./method-tags-tls.md#INV-TOOLS-7 @sha256:e769215c
law: ∀ node n, source@sha. reDerives(n,@sha) ? (emit(n) upserts: supersede-on-changed ∧ duplicates == 0 ∧ templated(row)) : (emit(n) == {emitted:false} ∧ ΔstoreBytes == 0)
arbitrary: arb over (node, source@sha) pairs — grounded (claim present at sha) ∪ ungrounded (claim absent); unchanged-fact ∪ changed-fact against a pre-populated store
covers_reqs: [ REQ-TOOLS-7a, REQ-TOOLS-7b, REQ-TOOLS-7c, REQ-TOOLS-7d ]
witness: [ SCN-TOOLS-7a-1, SCN-TOOLS-7b-1, SCN-TOOLS-7c-1, SCN-TOOLS-7d-1 ]
teeth: breaks-on "some ungrounded node persists (`emitted:true`) or a changed fact blind-inserts a duplicate — the ∀ over grounding states kills a bypass the single N1/N1′ witnesses cannot enumerate"

### PROP-TOOLS-8 — drift classification + deterministic exit-gate

inv: INV-TOOLS-8
source: ./method-tags-tls.md#INV-TOOLS-8 @sha256:e769215c
law: ∀ drift set D. reconcile(D).items ≡ classify(D) (DriftItem[], never all-or-nothing) ∧ exitCode == (|semantic(D)| > 0 ? 2 : 0) ∧ reauthorCount == |semantic(D)|
arbitrary: arb over drift sets D — varied |mechanical|/|semantic| mixes incl. {}, mechanical-only, semantic-only, both; classifier is KNOW-5 (GRD's, consumed not modeled)
covers_reqs: [ REQ-TOOLS-8a, REQ-TOOLS-8b, REQ-TOOLS-8c, REQ-TOOLS-8d ]
witness: [ SCN-TOOLS-8a-1, SCN-TOOLS-8b-1, SCN-TOOLS-8c-1, SCN-TOOLS-8d-1 ]
teeth: breaks-on "a drift set with |semantic|>0 that exits 0 (silent green) or re-authors ≠ |semantic| — the ∀ over mixes catches an exit-gate/reauthor-bound bug the single `D={dm,ds}` witness cannot span"

### PROP-TOOLS-9 — absorb-driven wave-close write

inv: INV-TOOLS-9
source: ./method-tags-tls.md#INV-TOOLS-9 @sha256:e769215c
law: ∀ sealing wave w. sealed(w) ⇒ (absorbed(w) ∨ whyNotEmitted(w)) — else violations(w) == 1; the absorb write routes through `atlas-emit` (0 silent seals, 0 separate authoring ritual)
arbitrary: arb over sealing waves — {absorb present} ∪ {why-not emitted} ∪ {neither} ∪ {both}; assert the seal-probe records exactly the missing-both case
covers_reqs: [ REQ-TOOLS-9a, REQ-TOOLS-9b ]
witness: [ SCN-TOOLS-9a-1, SCN-TOOLS-9b-1 ]
teeth: breaks-on "a seal with neither absorb nor why-not that records 0 violations — the ∀ over wave shapes kills a silent seal the two example waves cannot cover"

### PROP-TOOLS-10 — tri-transport byte-identity + no-write-path (PBT)

inv: INV-TOOLS-10
source: ./method-tags-tls.md#INV-TOOLS-10 @sha256:e769215c
law: ∀ node address a. mcp(a) ≡ poke(a) ≡ cli(a) (byte-identical over `tools/ref/handler.ts`) ∧ (∀ t ∈ {mcp,poke,cli}. writeMethod(t) == ∅ ∧ writeAttempt(t) refused) ∧ unscoped(cli)
arbitrary: arb over content addresses (in-pack ∪ out-of-pack); each resolved over all three transports; a write attempted through each transport handle
covers_reqs: [ REQ-TOOLS-10a, REQ-TOOLS-10b, REQ-TOOLS-10c, REQ-TOOLS-10d ]
witness: [ SCN-TOOLS-10a-1, SCN-TOOLS-10b-1, SCN-TOOLS-10c-1, SCN-TOOLS-10d-1 ]
teeth: breaks-on "a transport that re-serializes / forks contract on an address NOT witnessed, or grows a `set()` on the handler — the ∀ over addresses kills a divergence or write-path the single `cas:9b21` witness misses"

### PROP-TOOLS-11 — push-owns-common-case, laddered pull, CLI-floor

inv: INV-TOOLS-11
source: ./method-tags-tls.md#INV-TOOLS-11 @sha256:e769215c
law: ∀ seat s, need. servedByPush(readOnly(s)) ∧ ¬forcedToCli(s) ∧ resolve(s,need) walks {SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI} returning firstAvailable ∧ result(resolvedTier) ≡ result(nativeTier)
arbitrary: arb over (seat grant-set, need, tier-availability vectors); Read-only seats ∪ granted seats; ladders with varied first-available tier
covers_reqs: [ REQ-TOOLS-11-a, REQ-TOOLS-11-b, REQ-TOOLS-11-c, REQ-TOOLS-11-d ]
witness: [ SCN-TOOLS-11-a-1, SCN-TOOLS-11-b-1, SCN-TOOLS-11-c-1, SCN-TOOLS-11-d-1 ]
teeth: breaks-on "an availability vector where resolve reorders CLI-first or a lower tier returns a different contract — the ∀ over vectors kills a native-last / second-handler bug the single `H_sdk` witness cannot span"
note: the byte-identity-across-tiers arm is delegated to PROP-TOOLS-10 (every tier = the one handler) per method-tags; PROP-TOOLS-11 renders the routing/push structure

### PROP-TOOLS-11a — honest ladder per harness

inv: INV-TOOLS-11a
source: ./method-tags-tls.md#INV-TOOLS-11a @sha256:e769215c
law: ∀ harness h. ¬canPropagateMcp(h) ⇒ (unavailable(pull1) ∧ unavailable(pull2) ∧ startedTier(resolve@h) ≠ native ∧ reported(startedTier)) ∧ (∀ advertised-native tier that fails. reported(fallThrough) ∧ ¬silent)
arbitrary: arb over harness capabilities `{canPropagateMcp: bool}` × tier-fail injections; assert down-rank of tiers 1–2 and an honest reported start / no silent fall-through
covers_reqs: [ REQ-TOOLS-11a-a, REQ-TOOLS-11a-b, REQ-TOOLS-11a-c, REQ-TOOLS-11a-d ]
witness: [ SCN-TOOLS-11a-a-1, SCN-TOOLS-11a-b-1, SCN-TOOLS-11a-c-1, SCN-TOOLS-11a-d-1 ]
teeth: breaks-on "an MCP-incapable harness that still advertises tier-1 native or silently falls through — the ∀ over harness caps kills a dishonest-report bug the single `H_agents` witness cannot cover"

### PROP-TOOLS-12 — read/advisory-only doctor

inv: INV-TOOLS-12
source: ./method-tags-tls.md#INV-TOOLS-12 @sha256:e769215c
law: ∀ doctor sub-command c. ΔstoreBytes(doctor(c)) == 0 (directStoreMutations == 0) ∧ writeMethod(doctorHandle) == ∅ ∧ proposedWrite(c) is a plan that mutates only through `atlas-emit` ∧ surface stays == 6 derived (doctor is not a governance tool; ADR-0006 Decision 2)
arbitrary: arb over doctor sub-commands {archive, why-broken, hot-set, reground, plan}; assert store byte-identical before/after and reground returns a RegroundPlan
covers_reqs: [ REQ-TOOLS-12a, REQ-TOOLS-12b, REQ-TOOLS-12c ]
witness: [ SCN-TOOLS-12a-1, SCN-TOOLS-12b-1, SCN-TOOLS-12c-1 ]
teeth: breaks-on "a doctor sub-command (not the three witnessed) that mutates the store directly or registers as a 6th governance tool — the ∀ over sub-commands kills a hidden write path"

### PROP-TOOLS-13 — mechanical auto-re-ground, no human, no block

inv: INV-TOOLS-13
source: ./method-tags-tls.md#INV-TOOLS-13 @sha256:e769215c
law: ∀ drift set D with --accept-reground. regroundedCount == |mechanical(D)| (one pass) ∧ untouched(semantic(D)) ∧ (|semantic(D)| > 0 ⇒ exit 2) ∧ (∀ reground write. passes(emit fail-closed check))
arbitrary: arb over drift sets D under `{acceptReground:true}` — varied mechanical/semantic mixes; assert exactly the mechanical subset re-grounds via emit, semantic left, counts reported
covers_reqs: [ REQ-TOOLS-13a, REQ-TOOLS-13b, REQ-TOOLS-13c, REQ-TOOLS-13d ]
witness: [ SCN-TOOLS-13a-1, SCN-TOOLS-13b-1, SCN-TOOLS-13c-1, SCN-TOOLS-13d-1 ]
teeth: breaks-on "a mix where --accept-reground touches a semantic item or a reground write skips the emit grounding bar — the ∀ over mixes kills a bypass the single `D={dm,ds}` witness cannot span"

### PROP-TOOLS-14 — push-driven pre-phase discovery

inv: INV-TOOLS-14
source: ./method-tags-tls.md#INV-TOOLS-14 @sha256:e769215c
law: ∀ phase boundary b, seat s. injectedFreshPack(b, s) via push ∧ grantsRequired == 0 ∧ reGroundedByPush(s) even when unavailable(pull) ∧ ¬loadBearing(pull) — 0 seats ungrounded at a boundary by pull-failure
arbitrary: arb over phase boundaries × seat grant-sets × harness pull-availability (incl. `H_agents` pull-unavailable); assert push re-grounds with pull never invoked
covers_reqs: [ REQ-TOOLS-14a, REQ-TOOLS-14b, REQ-TOOLS-14c ]
witness: [ SCN-TOOLS-14a-1, SCN-TOOLS-14b-1, SCN-TOOLS-14c-1 ]
teeth: breaks-on "a boundary where re-grounding depends on a mid-task pull on a pull-unavailable harness — the ∀ over boundaries × availability kills a load-bearing-pull regression"

### PROP-TOOLS-15 — structural single-write-door store

inv: INV-TOOLS-15
source: ./method-tags-tls.md#INV-TOOLS-15 @sha256:e769215c
law: ∀ direct write d bypassing emit. ¬lands(d) (append-only/permission) ∨ rejectedAtRead(d) (content-address integrity) — never served; ∧ ungroundedRowsServed == 0 ∧ (∀ new emit write. Δbytes(priorRows) == 0)
arbitrary: arb over rows injected directly (bypassing emit) ∪ grounded rows via emit; recompute content address at read; attempt in-place overwrite of a prior row
covers*reqs: [ REQ-TOOLS-15a, REQ-TOOLS-15b, REQ-TOOLS-15c ]
witness: [ SCN-TOOLS-15a-1, SCN-TOOLS-15b-1, SCN-TOOLS-15c-1 ]
teeth: breaks-on "a directly-injected row that is served, or a new write that mutates a prior row's bytes — the ∀ over injected rows kills an integrity-skip the single N1 witness cannot enumerate"
note: adversarial \_exploitability* of this door (a shell-armed seat red-teaming append-only/permission) = FR-12 / billy, NOT rendered here — this law is the functional refusal only

### PROP-TOOLS-16 — read-only version-diff projection

inv: INV-TOOLS-16
source: ./method-tags-tls.md#INV-TOOLS-16 @sha256:e769215c
law: ∀ shaA, shaB. atlasDiff(shaA,shaB) surfaces the PERSIST-14 delta Δ faithfully (added/edited/superseded/decayed, each w/ prov) ∧ writeMethod(diffHandle) == ∅ (0 write path) ∧ cli(shaA,shaB) ≡ mcp(shaA,shaB) ∧ writeSurface ≡ {atlas-emit, atlas-link} (== 2 governed doors, ADR-0003)
arbitrary: arb over (shaA, shaB) pairs — deltas spanning all four partitions ∪ empty delta; malformed sha (e.g. `shaB:42`); each rendered over cli ∪ mcp; a write attempted through the diff handle
covers_reqs: [ REQ-TOOLS-16a, REQ-TOOLS-16b, REQ-TOOLS-16c, REQ-TOOLS-16d, REQ-TOOLS-16e ]
witness: [ SCN-TOOLS-16a-1, SCN-TOOLS-16b-1, SCN-TOOLS-16c-1, SCN-TOOLS-16d-1, SCN-TOOLS-16e-1 ]
teeth: breaks-on "a delta whose `decayed` partition is dropped, a diff handle that grows a `.write()`, or a third-write-door registration (atlas-diff on the write surface) — the ∀ over sha pairs kills a faithfulness/write-door bug the single `Δ` witness cannot span"
note: the CLI≡MCP ∀-input equivalence arm is DELEGATED to PROP-TOOLS-3 over the one handler `tools/ref/handler.ts` (method-tags-tls §INV-TOOLS-16, exactly the TOOLS-11 delegation pattern); this PROP renders the read-only-projection / faithful-delta / write-surface≡{atlas-emit, atlas-link} (==2 governed doors) arms

---

## Completeness (set-level self-check)

- **behavioural INVs → PROP:** 17/17 — TOOLS-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11a, 12, 13, 14, 15, 16 each render to exactly one PROP block (0 uncovered, 0 invented-without-INV).
- **every `source` resolves** to a real `### INV-TOOLS-<n>` in the frozen `method-tags-tls.md` (`@sha256:e769215c`, whole-file digest).
- **PBT INVs:** TOOLS-3 (`∀x. cli(x) ≡ mcp(x)`) and TOOLS-10 (`∀a. mcp(a) ≡ poke(a) ≡ cli(a)`) render the two cross-transport-determinism laws; every property-flavored golden's cited law (SCN-3a/3b/10a–10d, `gen: PBT`) is present and not contradicted.
- **seed goldens linked as witness:** all 57 TLS SCN across the 17 INVs (the S3 conformance + PBT seed); each PROP generalizes its witnesses and contradicts none.
- **formal-cluster verbatim:** N/A — TLS authors no FSPEC; no law transcribed from `fspec-merge.md` (consumed transitively via emit/reconcile only).
- **[NEEDS RECONCILIATION]:** none — no TLS `up-property` left a render decision unfixed. (The one open Atlas reconciliation, KERNEL-10's `max` tie-break direction, is KRN's, not TLS.)
