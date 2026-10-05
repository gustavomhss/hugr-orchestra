# atlas-architecture — Reference (the hierarchy, the exposure model, the authority model)

> owner: orchestrator · status: **partially ratified.** The tool-exposure amendment (§2) was
> **owner-ratified 2026-07-25**; the AUTHORITY model (§3) was **ratified 2026-08-30** by the orchestrator
> under delegated authority — see §3.4, which also records the ARCH-D3b ruling and the **2026-09-03 owner
> ruling** on the growth path (USE-OR-SEAL, no mandatory human gate). §1 still awaits the DEFINE seat.
>
> **Why this document exists.** Three independent cold reviews of CAMPAIGN-10 found the same disease by three
> different routes: the layer hierarchy **was written down and never enforced** (`ARCHITECTURE.md` §graph, plus
> a `// Layer N` header on every core barrel) so a campaign was cut with the dependency direction inverted and
> nobody consulted it; the tool-exposure rule lived in two places and contradicted itself; and "advertised" and
> "invocable" were independent sets nobody bound together. None of that is a detail — it is a **constitution
> that existed only as prose**.
>
> **Enforcement status — stated per clause, not claimed globally.** A second review round found that an earlier
> version of this header claimed _"every clause here is enforced by a gate"_ while five clauses had no gate at
> all. That was exactly the overclaim this document was written to end. The honest position:
>
> | clauses                                                        | enforcement                                                                                                                                                                                                                                                                                                                                                                                                        |
> | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | **ARCH-1..3, 5..7**                                            | **gated** — `harness/gates/layer-guard.mjs`, in CI, mutation-tested (§1.4)                                                                                                                                                                                                                                                                                                                                         |
> | **ARCH-4**                                                     | self-referential (it _is_ the requirement to gate)                                                                                                                                                                                                                                                                                                                                                                 |
> | **ARCH-8** (growth path)                                       | **prose** — no gate; triggered by ARCH-7 failing                                                                                                                                                                                                                                                                                                                                                                   |
> | **ARCH-10**                                                    | **IMPLEMENTED and mutation-tested** — the incumbent guard, `packages/adapter-io/src/governed-emit.ts` §2.25, ratified by `ADR-0007`. Its checker is a **test**, not `layer-guard.mjs`: `SCN-GE-I1`/`I2`/`I5` in `packages/adapter-io/test/governed-emit-incumbent.test.ts` (deleting the guard block turns all three red).                                                                                         |
> | **ARCH-9, ARCH-11, ARCH-12** (the rest of the AUTHORITY model) | **ratified as rules (§3.4), with ARCH-9's current implementation delivered in part.** The UPDATE leg is shipped (ARCH-10); on CREATE, the `tier` conjunct is closed by the one-way lattice join, `scope`↔`primaryAnchor` is closed by #251, and derived fast-path verdicts are wired by #313. `contested` remains false because no veto source exists. ARCH-11/12 remain specified rather than fully implemented. |
>
> **The bar.** Each of the three models below is grounded in named prior art and, where the state of the art
> gives a _measured_ threshold, the measurement is cited rather than a number being invented.

---

## 0. The three models, and the failure each one prevents

| §     | model                                          | prevents                                         | prior art                                                                                                                                              |
| ----- | ---------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | **Hierarchy** — who may depend on whom         | a package cycle; a seam frozen by the wrong side | Hexagonal / ports-and-adapters (Cockburn); Dependency Inversion (Martin); **architecture fitness functions** (Ford/Parsons/Kua; ArchUnit → ArchUnitTS) |
| **2** | **Exposure** — what may be published as a tool | tool-catalog overload; advertised ≠ invocable    | measured tool-selection degradation (see §2.2); MCP progressive disclosure                                                                             |
| **3** | **Authority** — what may decide a gate         | the confused deputy; ratification bypass         | object-capability model (Miller, _Robust Composition_; KeyKOS/EROS/Capsicum/CHERI); "capability gates are not authorization"                           |

---

## 1. HIERARCHY — the layer law

### 1.1 The rule

> <a id="arch-1"></a>**ARCH-1 Ports point inward; adapters point outward.** An **interface (port)** MUST be
> declared in the layer that _consumes_ it. Its **implementation (adapter)** MUST live in the layer that
> owns the outside resource. Dependencies MUST flow in exactly one direction — **outer depends on inner,
> never the reverse** — and the package dependency graph MUST be **acyclic**.

The repo already applies this correctly in three places, and those are the pattern to copy, not to argue
with: `TruthGate`, `DoctorSource`, `T0Heuristic` and `NodeSource` are declared in **`@atlas/tools`** and
implemented in **`@atlas/adapter-io`**, injected at `assembleHandler`. `adapter-io` imports `TruthGate`
_from_ `tools`; `tools` imports nothing from `adapter-io`.

### 1.2 The layer order (normative)

```
contracts → kernel → { index · grounding } → knowledge → { persist · retrieval } → tools
                                                                                     ↑
                                                                            adapter-io
                                                                           ↗           ↖
                                                                        cli          mcp-server
```

> <a id="arch-2"></a>**ARCH-2 `tools` is the innermost port layer of the ring.** `@atlas/tools` MUST NOT
> depend on `@atlas/adapter-io`, `@atlas/cli`, or `@atlas/mcp-server`. Every capability the ring needs from
> the outside world MUST be expressed as a port declared in `tools` and satisfied by an adapter.

**Direct consequence — the CAMPAIGN-10 defect.** `GroundingComputer` and `GateChain` were carded as
adapter-io-owned seams consumed by tools-side legs. That is unbuildable: it inverts ARCH-2 and creates a
cycle. Both are **ports** — declared in `tools`, implemented in `adapter-io`. The card that got it right
(`EmitOut` widening, "tools is upstream of adapter-io") is the template.

### 1.3 The composition root

> <a id="arch-3"></a>**ARCH-3 One composition root, and it is named.** There MUST be exactly one site where
> tool legs are bound to their implementations (`packages/adapter-io/src/wire.ts`). Adding a tool to the
> `Tool` union without binding a leg at that site, or binding a leg for a token absent from the union, MUST
> fail the build. **Every work package that introduces a tool MUST name this site in its edit surface** — a
> door that is typed, rendered and tested but never bound is not a feature, it is a hole.

_(This clause exists because CAMPAIGN-10's 16 WP cards mention `wire.ts` exactly zero times, so all four new
doors would have been built and never made reachable — the same "the loop didn't close" failure the E2E
wave already paid for once.)_

### 1.4 Enforcement — a fitness function, not a review

> <a id="arch-4"></a>**ARCH-4 The hierarchy is machine-checked.** ARCH-1/2/3 MUST be enforced by a gate in
> CI that reads the real dependency graph and fails on any inward edge, any cycle, or any unbound tool. A
> layer rule that lives only in prose is not a rule; the industry name for the mechanical form is an
> **architecture fitness function** (Ford/Parsons/Kua; ArchUnit for the JVM, ArchUnitTS for TypeScript).

Implementation: `harness/gates/layer-guard.mjs`, wired into `ci.yml` beside `godfile-guard` and
`spec-conformance-guard`.

---

## 2. EXPOSURE — the tool-surface law

### 2.1 What replaces the count

The old rule — _"the MCP server publishes exactly the five governed tools"_ (INV-MCP-1) — is **superseded**
(owner-ratified 2026-07-25; recorded in `ADR-0006`). The count was never the property; it was the mechanism
available when there were five legs, exactly as INV-TOOLS-1's "exactly four" was (ADR-0003: _"the count was
the accidental part; the governance property is the essential part"_).

> <a id="arch-5"></a>**ARCH-5 One closed union; both surfaces are DERIVED from it.** There MUST be exactly
> one closed `Tool` union. The **advertised** set and the **invocable** set MUST both be derived from it, and
> MUST be provably equal: `advertised ≡ invocable ≡ Tool`. Neither may be assembled independently.
>
> <a id="arch-6"></a>**ARCH-6 Every tool declares its authority class.** `Tool` MUST partition into
> `GOVERNANCE_SURFACE` (governed doors, of which `WRITE_PATHS` is the write subset) and `READ_SURFACE`
> (zero write authority). The partition MUST be total and disjoint, and MUST be pinned in CI.

_(ARCH-5 closes a hole that exists today and predates this work: `callTool` dispatches on `legs[tool]` with
no membership check against the advertised list, so "advertised" and "invocable" have always been two
independently-maintained sets that merely happen to coincide.)_

### 2.2 The budget — measured, not invented

Replacing a magic number with no number would be a regression. The state of the art gives a **measured**
one:

- Tool-selection accuracy stays above ~90% up to roughly **30 candidate tools**, degrades sharply beyond
  **30–50**, and collapses past 100 — reported drops of **95% → 71%** when a single large server's full
  catalog is loaded.
- Schema cost is not free: one production MCP server's tool definitions alone consume **~42k tokens** before
  any task context, and stacked servers routinely hand **30–50% of the context budget** to tool schemas.

> <a id="arch-7"></a>**ARCH-7 The static surface is budgeted.** The statically-advertised tool count MUST
> stay at or below **30**. Crossing it is not forbidden by fiat — it is the trigger to move growth onto the
> dynamic projection (§2.3), and the gate MUST fail so the decision is taken deliberately rather than drifted
> into.

**Current advertised surface: 6 governance + 10 read = 16 `Tool` members, but the server advertises 18
tools** (the six governance doors + two relations/negations + the six authoring/read doors + the four
memory-read doors — `packages/mcp-server/src/server.ts`). **CAMPAIGN-10 shipped**: the ADR-0004 planners
are built (`anchors`/`slots`/`draft`/`check`), the ADR-0005 read doors are wired (`doctor`/`node`), and the
CAMPAIGN-11 memory ring added the four memory reads + `atlas-memory-emit`. The numbers sit inside the
surface budget.
_(An earlier revision stated the current surface as 12. It was 5, and the gate said so on the same day —
a document whose stated bar is that numbers are cited rather than invented had exactly one invented number.)_

### 2.3 Growth path — progressive disclosure, which this product already specified

The scaling answer in the literature is not a bigger catalog; it is **loading only what the task requires** —
treating tool selection as retrieval rather than reasoning.

Atlas already specified exactly this, and ratified it, for a different surface: `spec/atlas.md` §6.2 —
_"Only the current scope's nodes are exposed as tools at once; on leaving the scope they retract. Exposing
the whole graph as tools at once would flood the context with schemas and is forbidden — the tool surface is
**dynamic**, following where the navigator is."_

> <a id="arch-8"></a>**ARCH-8 Static core, dynamic tail.** The governance + read surface is the **static
> core**: small, bounded by ARCH-7, always present. Anything that scales with the repository — node-tools,
> per-scope projections — MUST use the dynamic scope-scoped projection, never the static catalog.

The product invented the right pattern and did not apply it to itself. §2.3 applies it.

---

## 3. AUTHORITY — the capability law

### 3.1 The failure this prevents (reproduced, not hypothesized)

**Reproduced against the built packages on `master` @ `5de122e`, before the ADR-0007 incumbent guard existed.**
This transcript is the _historical evidence_ that motivated ARCH-9 and ARCH-10; it is not a description of the
door as it stands. Its last line no longer reproduces — the emit door now refuses that write
`governance-downgrade` (ARCH-10; `SCN-GE-I1`). The first three lines still hold on both sides of the fix, which
is why ARCH-9 is still open.

```
nodeKey(T0) == nodeKey(T2)     → identity does NOT include tier
route(T0) = full-ratify        → the KNOW-8 ratify gate RUNS (billy token required)
route(T2) = auto-accept        → the ratify gate is SKIPPED
emit T0 → CREATE ; emit T2 → UPDATE ; node now points at the T2 bytes ; supersededBy: (none)
```

A `T0` fact admitted only with the billy token **could be displaced by a `T2` advisory carrying no token at
all**, at the same `(anchor, slot)`. And because `atlas-query` bounded `T2` out of reads entirely when this
was written, the T0 invariant then silently stopped appearing for its scope, with no refusal on any
transport. [ADR-0013](../adr/ADR-0013-the-pack-has-two-bands-governing-and-advisory.md) has since given the
pack an advisory band that DOES serve `T2` — which does not repair this, it only changes how the damage
reads: the displaced T0 invariant still leaves the **governing** band, and what remains at its `(anchor,
slot)` is an unratified proposal wearing the `advisory` verb.

The mechanism has a name: **`tier` is an author-supplied argument that selects which gate runs.** In the
literature this is the confused deputy, and the current framing of it for agent systems is precise —
_capability gating_ answers which tools are exposed; _per-call authorization_ answers whether a concrete
call with specific argument values is allowed. Atlas has the first and, at this field, now has the second
**only where there is an incumbent to derive it from**: a write landing on an EXISTING node is gated by that
node's own stored class (ARCH-10 / ADR-0007). On a CREATE there is no incumbent, `route` still reads the
declared `tier` (`packages/knowledge/src/ratify/fastpath.ts:64`), and gate 0 checks only that the class is on
the lattice — not that the author may claim it. That half is ARCH-9, and it is unclosed.

### 3.2 The rules

> <a id="arch-9"></a>**ARCH-9 A gate-selecting field is derived, never chosen.** Any field whose value
> determines **which** governance gate runs MUST be **derived by the door from a value the author cannot
> choose**. The derivation MUST be _sound_ — a constant that pins the gate open does not satisfy this clause.
> In scope by name: `tier` and `kind` (which select the ratification route), `scope` (which selects the authz
> check), and the door-local `contested` / `lowRisk` context, **two conjuncts of the fast-path predicate that
> `governed-emit.ts` currently hardcodes to their permissive values**.
>
> _Two earlier formulations are rejected and recorded so they are not re-proposed._ **(i) "inside the identity
> envelope"** — ambiguous and already vacuously true: this codebase has two identities, and `contentHash`
> covers the whole fact including `tier`, so the clause would certify the reproduced bypass as compliant. Only
> `nodeKey` routes, and `nodeKey` is the one that omits `tier`. **(ii) a disjunction offering identity-inclusion
> _or_ door-derivation** — unsound for `scope`: putting `scope` in the identity changes nothing, because authz
> is `actor === scope` on an author-supplied string while the read projection scopes on the derived
> `primaryAnchor`, with nothing binding them. Only derivation closes it. The clause is therefore a single
> requirement, not a choice.
>
> <a id="arch-10"></a>**ARCH-10 An UPDATE may not lower the authority of what it replaces.** A write that
> replaces a current node MUST NOT reduce the ratification class of that node without passing the gate the
> existing node required. Displacement is a supersede, and a supersede of a ratified fact is itself a
> ratified act.
>
> <a id="arch-11"></a>**ARCH-11 Read-only means the write handle is not REACHABLE.** A leg with no write
> authority MUST NOT be able to _reach_ a mutator — not through its parameters and **not through its
> enclosing scope**. Legs MUST therefore be built by a per-leg factory in a module where the wide store
> handle is never in scope, receiving only a narrow read port. Write-freedom MUST be a property of what the
> leg can reach, not of a reviewer noticing and not of a runtime spy.
>
> _Stated precisely, because the obvious wording is satisfied by the exact defect it targets:_ "must not be
> **given** a handle" is already true today — `wire.ts` builds every leg as an arrow closure in the same
> lexical scope as `const store = createDiskStore(…)`, so the legs receive only `args` and can still call
> `store.put`. **Closure capture is the leak; parameter typing does not close it.** And in TypeScript the
> narrow port is **not unforgeable** — structural types are erased at runtime, so the attenuation must be a
> real wrapper object (`{ read: (k) => store.read(k) }`), never a cast. The ocap literature
> (Miller; KeyKOS/EROS/Capsicum/CHERI) is the _source of the discipline_, not a claim that this codebase
> achieves kernel-grade unforgeability: here the guarantee is compile-time narrowing plus a runtime wrapper.

The repo already has the correct idiom to copy: `packages/tools/src/guard.ts` declares `ReadProjection`
(`read()` and nothing that mutates), and `NodeSource` is resolve-only. Planner legs MUST be constructed over
a port of that shape. Until they are, the honest claim is "structurally **checked**" (a spy), not
"structurally **guaranteed**" (a type) — and ADR-0004 currently claims the latter.

### 3.3 Scope note — the threat model, stated rather than inferred

Atlas's `actor` is `ATLAS_ACTOR ?? gitUserEmail(repo) ?? ''` — caller-settable and unauthenticated — checked
against a policy file readable by anyone who can invoke the CLI. **KNOW-11 is an anti-accident guardrail,
not an adversarial control.** That is a legitimate posture for a local developer tool, and it means a
dry-run door (`check`) discloses nothing an attacker could not already read.

> **STATED LIMITATION, NOT A SETTLED POSITION (2026-08-30).** The destination is now named: Atlas is to
> become an open-source product AND a hosted service. Under that destination the paragraph above is a
> LIMITATION with an expiry, not a resting place — and ARCH-12's revisit condition has FIRED.
> Specifically, the `check`-discloses-nothing argument holds _because the attacker can already read the
> disk_; a remote caller cannot, so that justification does not survive the transport and every read
> door must be re-judged, not just `check`.
>
> This paragraph stays, deliberately. It is a precise, self-authored map of the two things that become
> live vulnerabilities the day the transport goes remote, and this repository is public — so publishing
> it is an **accepted trade**, made in favour of honesty over obscurity, not an oversight. The ordering
> it implies is now enforced mechanically rather than by prose: `harness/gates/service-gate-guard.mjs`
> turns CI red on any non-stdio transport until four named blockers — identity, isolation,
> policy-integrity and resource-limits — are declared closed in a ledger. **Stated precisely, because the
> loose reading is an overclaim:** the gate enforces _those four_, by name, and it checks that the ledger
> mentions them, not that they are true. Hardening that is not on that list — disclosure redaction, abuse
> control, renderer escaping, supply chain — is unprotected by it. The gate buys ordering, not coverage.

> <a id="arch-12"></a>**ARCH-12 The posture is written down.** This threat model MUST be stated in the
> reference, not inferred from the code. If the transport ever becomes remote or multi-tenant, both the
> env-var actor and the readable policy become live vulnerabilities and this clause MUST be revisited before
> that transport ships.

### 3.4 Ratification, and the ARCH-D3b ruling (2026-08-30)

**Status: §3 is RATIFIED.** ARCH-9, ARCH-10, ARCH-11 and ARCH-12 stand as written and are normative from
this date. The owner delegated this ratification to the orchestrator; it is recorded here rather than in a
new ADR, because §3 already carries the adversary, the reach, the promises and the rejected alternatives,
and a second tracker for the same clause is a failure this repository has already made twice.

Ratifying the rules does not implement them. The enforcement table in the header is the authority on what is
shipped, and it says ARCH-9 (CREATE leg), ARCH-11 and ARCH-12 are prose.

**The ARCH-D3b question — on a CREATE there is no incumbent, so where does the governing class come from?**
The question was posed as though `tier` were the open field. Read against the code, it is not:

- `route` joins the declared class with any door-derived one as `strictestTier(derived, declared)`
  (`packages/knowledge/src/ratify/fastpath.ts:143`), and the fast path requires `T2 ∧ advisory`. So on a
  CREATE a self-declared **`T0` buys a STRICTER gate**, not a cheaper one — it routes to full ratification
  and commits only with the KNOW-8 token, which the author does not hold. A self-declared **`T2` buys
  auto-accept but mints only an advisory node**; it purchases no authority, because the class it declared is
  the class it got.
- Therefore the `tier` conjunct of ARCH-9 is **CLOSED on CREATE by the direction of the join**, not by an
  absent derivation. Deriving a floor would be a no-op: the join already refuses to be widened.

**What is actually open on CREATE**, and this is the ruling that re-scopes the work:

1. **The two fast-path verdicts — CLOSED by #313.** The old `DOOR_RATIFY_CTX` constant was exactly what
   ARCH-9's text forbade by name. `deriveFastPathVerdicts` now supplies `lowRisk` and `contested` to the
   route. `contested` is false on every current path because no veto/contention source exists; this is an
   honest extension point, not a hardcoded gate-opening constant.
2. **`scope` — CLOSED by the shipped authz chain.** The write door's authz gate already binds the
   declared `scope` to the derived `primaryAnchor`: `evalAuthzGate` (governed-emit-gates.ts) runs
   `actorInScope` THEN `scopeOwnsAnchor` (policy.ts, backed by `authz.anchors`) and refuses
   `REJECTED_UNAUTHORIZED_ANCHOR` when the declared scope does not own the fact's real anchor — a fact
   anchored in `src/payments` declared under `scope:'public'` is refused, the exact exfiltration §policy.ts
   warns about. Shipped with WP-10.A3 (#251); pinned by `arch9-door-derivation.test.ts` and the
   governed-emit authz tests. _[The ADR-0010 "open item 3" predates this; the code closed it.]_

**Residual, stated rather than hidden.** A cheap CREATE can still _occupy_ a `(anchor, slot)` with an
advisory fact. That is slot squatting, not an authority bypass: raising the occupant to `T0` is an UPDATE,
routes to full ratification on the declared class, and still demands the token. Under the current local
posture (§3.3) this is an anti-accident concern; it must be re-judged if the transport goes remote, which
is ARCH-12's revisit condition.

**Consequence for the plan.** The ARCH-9-on-CREATE work item is smaller and more concrete than it was
written to be: wire two verdicts that already exist (one of the two — the `scope`↔`primaryAnchor` binding —
is already SHIPPED in the authz gate, #251); the derived verdict wiring shipped in #313, and the in-process
USE-OR-SEAL serving path shipped in #319/#321. Durable promotion/completion semantics are not claimed here.

**Owner ruling 2026-09-03 — the growth path and the ratifier question (resolves ARCH-D3b).** The owner
decided, in product terms: _"who approves is the ORCHESTRATOR, approving only with evidence, clear
protocol; both [use-and-success and human seal] coexist; neither is mandatory; human-in-the-loop kills the
purpose, this serves LLMs not humans."_ Three commitments follow (full text in ADR-0010 §"Owner ruling"):

1. **T2-by-construction on CREATE** — a new node is born advisory; the one-way join already makes a
   self-declared higher class cost more than it buys, and this makes T2 the written rule, not a
   consequence.
2. **Growth is USE-OR-SEAL, neither mandatory.** A node leaves the advisory class by ONE of two earned
   evidences, either sufficient, neither required: **USE** (served in a decision whose completion was
   recorded — the `hits` ledger is the foundation) or **SEAL** (a human ratify token recording a deliberate
   endorsement). A node earning neither stays advisory and decays (KNOW-17). No human gate is required on
   the growth path. The current implementation records in-process served hits and raises the returned class
   on the next pack; durable promotion and a completion signal remain unimplemented.
3. **The ratify token is ONE evidence, not a gate; verification stays advisory.** §3.3's anti-accident
   posture stands; the `service-gate-guard` tripwire (ARCH-12) re-opens verification the moment a
   remote/multi-tenant transport is attempted.

**What the ruling does to the residual.** Slot squatting is no longer a terminal state: an advisory fact
that _occupies_ a `(anchor, slot)` can now GROW by use or seal, so "raise the occupant" is no longer the
only exit — it becomes one of the two earned paths. The residual's re-judge condition (ARCH-12, transport
remote) is unchanged.

---

## 4. Acceptance (falsifiable checks — S3 lifts goldens from these)

> **Enforcement column, not a uniform claim.** ✅ = shipped and mutation-tested — in `layer-guard.mjs` for
> checks 1–7, and in the test suite for check 9; ⬜ = specified, no checker yet. A second review round found
> four of these presented as uniformly falsifiable when they were not — #4 was false as written (the gate read
> manifests only, so a planted _import_ passed), #8 was satisfiable with no code change, #9 conflicted with
> ARCH-10's own wording, and #10 was satisfied by the code it targets. #4 is now true (checks 1–7 below are
> gated by `layer-guard.mjs`); **#9 is now shipped and mutation-tested too, by a test rather than by the gate**
> (ADR-0007); #8 and #10 remain ⬜ and belong to the still-unimplemented remainder of the AUTHORITY model.

1. The package dependency graph is acyclic, and no inner layer imports an outer one. _(ARCH-1, ARCH-2)_
2. `@atlas/tools` has zero import edges to `adapter-io` / `cli` / `mcp-server`. _(ARCH-2)_
3. Every member of the `Tool` union has a bound leg at the composition root, and every bound leg's token is a
   member of the union — checked in both directions. _(ARCH-3)_
4. The gate fails on a planted inward import, a planted cycle, and a planted unbound tool. _(ARCH-4)_
5. `advertised ≡ invocable ≡ Tool`, asserted by set-equality, not by inspection. _(ARCH-5)_
6. `GOVERNANCE_SURFACE ⊎ READ_SURFACE == Tool`, total and disjoint; `WRITE_PATHS ⊆ GOVERNANCE_SURFACE`.
   _(ARCH-6)_
7. `|Tool| ≤ 30`, and the gate fails at 31 with a message naming ARCH-8 as the remedy. _(ARCH-7)_
8. No field that selects a governance gate is both author-supplied and outside the identity envelope.
   _(ARCH-9)_
9. Emitting a `T2` advisory at the `(anchor, slot)` of a ratified `T0` fact is **refused**, not silently
   applied as an UPDATE. _(ARCH-10 — the §3.1 reproduction, now a GREEN test: `SCN-GE-I1`,
   `packages/adapter-io/test/governed-emit-incumbent.test.ts`; mutation-verified, deleting the incumbent-guard
   block in `governed-emit.ts` turns it red. ADR-0007.)_
10. A planner leg cannot be constructed over a store handle that exposes a mutator — enforced by the type,
    demonstrated by a compile failure, not by a spy. _(ARCH-11)_

---

## 5. Decisions

| #                         | decision                                                                                                                                                                                          | status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ARCH-D1**               | Ports declared inward, adapters outward; `tools` never depends on `adapter-io`                                                                                                                    | **proposed** — ADR-0006 §hierarchy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **ARCH-D2**               | INV-MCP-1's "exactly five tools" is superseded by the derived-surface property + a measured budget                                                                                                | **OWNER-RATIFIED 2026-07-25** — ADR-0006                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **ARCH-D3a** (UPDATE leg) | On a write that lands on an EXISTING node, `tier` and `scope` stop being author-supplied gate selectors: the required class and the authorized scope are read off the incumbent's own stored fact | **CLOSED 2026-07-25 — ADR-0007.** `governed-emit.ts` §2.25 refuses `governance-downgrade` / `unauthorized for target` (which, per the F1 amendment to ADR-0007, is ALSO the refusal for an incumbent whose stored fact is unreadable — a distinct reason there was a CAS-health oracle) / `governance-relocation`; pinned by `SCN-GE-I1`/`I2`/`I5`/`I15`                                                                                                                                                                                                                                                                                                   |
| **ARCH-D3b** (CREATE leg) | The same for a write that mints a node, where there is no incumbent to derive from                                                                                                                | **OWNER-DECIDED 2026-08-30 §3.4 + 2026-09-03 §3.4 ruling; current implementation delivered in part.** The `tier` conjunct is closed by the one-way join at `packages/knowledge/src/ratify/fastpath.ts:143` and by the 2026-09-03 T2-by-construction ruling. The `scope`↔`primaryAnchor` half is **CLOSED — shipped** (`evalAuthzGate` runs `scopeOwnsAnchor`, WP-10.A3 #251). Derived fast-path verdicts are **CLOSED — shipped by #313**; the old `DOOR_RATIFY_CTX` constant is gone. The in-process USE-OR-SEAL serving path is **CLOSED — #319/#321**; `contested` has no current veto source, and durable promotion/completion semantics remain open. |
| **ARCH-D4**               | Planner legs take an unforgeable read-only port (ocap), replacing the write-spy as the guarantee                                                                                                  | **proposed** — supersedes ADR-0004's "property of the type" claim, which is currently overstated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Sources

- [MCP Tool Overload: Why More Tools Make Your Agent Worse](https://dev.to/thedailyagent/mcp-tool-overload-why-more-tools-make-your-agent-worse-5a49)
- [AI Tool Overload: Why More Tools Mean Worse Performance](https://www.jenova.ai/en/resources/mcp-tool-scalability-problem)
- [From reasoning to retrieval: solving the MCP tool overload problem](https://redis.io/blog/from-reasoning-to-retrieval-solving-the-mcp-tool-overload-problem/)
- [Capability Gates Are Not Authorization: Confused-Deputy Failures in LLM Agent Frameworks](https://arxiv.org/html/2606.28679)
- [Capability Minimization as a Safety Primitive: Risk-Aware Causal Gating for Least-Privilege LLM Agents](https://arxiv.org/pdf/2606.13884)
- [Least privilege for AI agents: identity, access, and tool binding (Microsoft Security)](https://www.microsoft.com/en-us/security/blog/2026/07/16/least-privilege-for-ai-agents-identity-access-and-tool-binding/)
- [ArchUnitTS — architecture fitness functions for TypeScript](https://github.com/LukasNiessen/ArchUnitTS)
