# The genesis output contract — what a run over a repository must have produced

> **Status:** design contract, written before Atlas mines itself. It answers one question — _what should the
> run have produced?_ — so that a benchmark measures a run against a bar instead of describing whatever came
> out. Every clause is either checkable by the probe below or is declared, in this document, as not checkable
> and why.
>
> **Instrument:** `harness/probes/genesis-output-probe.mjs`. Not a gate, not in `ci.yml` — Atlas's own
> `.atlas/` store is not committed, so on CI it would have nothing to run against and would print OK having
> checked nothing.
>
> **Vocabulary:** every type named here is an existing Atlas type. This document introduces no record, no
> file format and no identifier namespace of its own. The eight aggregate expectations are labelled `GOC-1`
> … `GOC-8`; that prefix is deliberately outside the `REQ`/`SCN`/`INV`/`PROP`/`WP` corpus, because these are
> the probe's own check names and not decomposition ids.

## 0. What a run produces, and where

`atlas mine` runs the genesis pipeline and writes **candidates only**, into the staging sidecar
([ADR-0008](../adr/ADR-0008-mining-writes-to-staging-not-to-knowledge.md)). `atlas promote` is the one route
out of staging into governed knowledge, and it is an ordinary use of the `atlas-emit` door. So the OUTPUT of
a genesis run is three artifacts and no others:

| artifact                                         | on disk                      | type of its contents                                                     |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------ |
| the CAS objects — **the facts themselves**       | `.atlas/cas/<h[0:2]>/<h>`    | `GroundedFact` (`packages/knowledge/src/types.ts`)                       |
| the staging sidecar — the **candidate rows**     | `.atlas/staging.<g>.json`    | `WireProjection` of `CurrentNode` (`packages/adapter-io/src/sidecar.ts`) |
| the knowledge projection — the **promoted rows** | `.atlas/projection.<g>.json` | the same `WireProjection` at a different file                            |

There is no fourth **facts** artifact on disk. There **is** a run ledger, but it rides on the run's
`GenesisReport` rather than in the store: `GenesisReport`
(`packages/genesis/src/types.ts`) carries `seeded`, `ratified`, `open`, `llmCalls`, `budgetSpent`, an
optional `cost`/`resumeToken`, and an optional **`coverage: RunCoverage`** — the durable per-site ledger
(`packages/genesis/src/types.ts:148-203`). `RunCoverage` holds `frontier`, `planned`, and one `SiteOutcome`
row per planned site; each row is `seeded`, `abstained`, `unrecorded`, `interrupted` or `unvisited`, and an
`abstained` row keeps its grounded GEN-12 `WhyNot` — so an abstention is now recorded, not dropped. It is
`ADDITIVE + ABSENT-TOLERANT`: a report from before the ledger simply has no `coverage`, which reads as
UNEVALUABLE, never as a run that covered nothing. §5 (GOC-8) is where that ledger — and what it still cannot
prove from the store alone — is spelled out.

---

## 1. Shape — one mined fact, field by field

A fact is a `GroundedFact = AdvisoryNode | PredicateNode`, a discriminated union on `kind`. A **mined** fact
is always the `AdvisoryNode` arm: the mine admission gate constructs an `AdvisoryProposal` and
`packages/cli/src/mine.ts` adds no predicate. This is the whole of one, as it lands in the CAS:

```json
{
  "kind": "advisory",
  "id": "802f2b…",
  "tier": "T2",
  "claimNorm": "greet() returns a greeting for the supplied name",
  "grounding": {
    "entries": [
      { "anchor": { "kind": "file", "qualifiedPath": "src/util.ts", "subtreeHash": "8b5bee…" }, "path": "src/util.ts" }
    ]
  },
  "freshness": "FRESH",
  "claims": [],
  "authoring": "ADVISORY",
  "scope": "atlas:mined",
  "predicateSlot": "definition"
}
```

| field             | type                                            | supplied or derived          | by whom                                                                                       |
| ----------------- | ----------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| `kind`            | `'advisory'`                                    | derived                      | the admission gate's `AdvisoryProposal`; `mine` authors no predicate                          |
| `id`              | `NodeKey` (`packages/contracts/src/hash.ts`)    | **derived**                  | `nodeKey(view)` — see §2. Minted from content, **never** read off the payload                 |
| `tier`            | `Tier`                                          | **supplied from a constant** | `MINED_TIER = 'T2'` in `packages/cli/src/mine.ts`, stamped, never forwarded from the proposal |
| `claimNorm`       | `string`                                        | **supplied by the model**    | the **only** thing a proposer contributes (GEN-12: the LLM proposes, admission is mechanical) |
| `grounding`       | `Grounding` (`packages/grounding/src/types.ts`) | derived                      | from the ranked `Candidate.site`, a `StructRef` — see §4                                      |
| `freshness`       | `KnowledgeFreshness`                            | derived                      | the admission gate, at admit time                                                             |
| `claims`          | `readonly ClaimEntry[]`                         | derived                      | empty on a mined advisory. **Not** the row's `claims` — see §2                                |
| `authoring`       | `'ADVISORY' \| 'SUPERSEDED'`                    | derived                      | `'ADVISORY'` on birth                                                                         |
| `scope`           | `string`                                        | **supplied from a constant** | `MINED_SCOPE = 'atlas:mined'`, same file, same discipline as `tier`                           |
| `predicateSlot`   | `PredicateSlot`                                 | supplied                     | from the **closed** 13-member vocabulary; it is folded into `id`                              |
| `check`, `status` | `Check`, `Status`                               | —                            | **absent**. Present only on the `PredicateNode` arm                                           |

Promotion adds a **row** — a `CurrentNode` (`packages/knowledge/src/write/upsert.ts`) — in the projection,
keyed by the fact's `nodeKey`:

| row field                                   | type                              | supplied or derived                                                                          |
| ------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `nodeKey`                                   | `string` (a `NodeKey` value)      | derived — the map key **is** this value (KNOW-4g)                                            |
| `family`                                    | `NodeFamily`                      | derived from `check` PRESENCE, cross-checked against `kind` (`familyOf`, `governed-emit.ts`) |
| `contentHash`                               | `string` (a `Hash` value)         | derived — `id(fact)`, the CAS address                                                        |
| `claims`                                    | `readonly string[]`               | derived — the `claimNorm` **set-union** set (KNOW-4c)                                        |
| `primaryAnchor`                             | `string`                          | derived — `primaryAnchorId(view)`, the deepest common unit                                   |
| `slot`, `scope`, `tier`                     | `PredicateSlot`, `string`, `Tier` | carried from the `WriteRequest`, stamped by the governed door                                |
| `derivedAt`                                 | `string`                          | derived — the git HEAD sha this row's stored freshness was produced at (N11, per-ROW)        |
| `supersededBy`, `sameAs`, `sameAsRetracted` | `string`, `string[]`, `string[]`  | absent on a freshly promoted mined advisory                                                  |

**The row and the bytes must corroborate.** The projection sidecar is unauthenticated mutable state; CAS
bytes are content-addressed. The emit door therefore requires `fact.id === row.nodeKey`,
`fact.scope === row.scope` and `fact.tier === row.tier` before it acts on either
([ADR-0007](../adr/ADR-0007-governance-class-is-a-property-of-the-node.md)). A run whose output disagrees
with itself on any of those three has produced a store the doors will refuse. **GOC-3** checks it.

---

## 2. Identity — `nodeKey` vs content address

A stored fact has **two** 64-lowercase-hex identifiers and they are not interchangeable. This is the single
most repeated mistake against this product, and until [`node`](../reference/commands/node.md) was written
nothing said so.

|               | `nodeKey` (`NodeKey`)                                                                      | content address (`Hash`)                                                            |
| ------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| formula       | `hash(primaryAnchorId ‖ predicateSlot [‖ normalize(check)])`                               | `id(fact) = hash(canonicalForm(fact))`                                              |
| answers       | **WHICH node** — one per (anchor, slot)                                                    | **WHAT bytes** — the CAS dedup leg                                                  |
| stable across | a re-worded claim body                                                                     | nothing; new bytes, new address                                                     |
| stored as     | the projection map KEY, `CurrentNode.nodeKey`, **and the fact's own `id` field**           | `CurrentNode.contentHash`, and the CAS file NAME                                    |
| printed by    | `atlas query` (`inv` lines) · `atlas promote` (left of `->`) · `atlas node`'s `node:` line | `atlas emit` (`data.id`) · `atlas doctor archive` · `atlas promote` (right of `->`) |
| **taken by**  | `atlas link`, `atlas doctor why`, `atlas doctor reground`                                  | **`atlas node <addr>`**                                                             |

Three consequences a run's output must satisfy, all mechanical:

- Neither identifier folds in `scope` or `tier`. Raising a node's class must not re-address it.
- `contentHash` and `nodeKey` are both pure functions of the fact, so **equal bytes imply equal identity**:
  one content address under two distinct nodeKeys means one of the two legs was not minted from the fact it
  addresses. **GOC-2** checks it, along with `key === row.nodeKey` and `nodeKey ≠ contentHash`.
- The fact's stored `id` field carries the **nodeKey**, not a content hash — the `[FLAG]` on `AdvisoryNode.id`
  in `packages/knowledge/src/types.ts` records the tension and this is how it resolved on disk.

**A third collision, in a different dimension.** `AdvisoryNode.claims` is `readonly ClaimEntry[]` and is
`[]` on a mined fact; `CurrentNode.claims` is `readonly string[]` and holds the claim body. Two fields, one
name, different types, different contents. Read the one that belongs to the type you are holding.

---

## 3. Scope and tier — and what `atlas query` will do with them

A mined fact's governance pair is **`scope: 'atlas:mined'`, `tier: 'T2'`**, both stamped from constants in
`packages/cli/src/mine.ts` and never forwarded from the proposal, so an injected gate cannot mint a staged
row declaring `T0`.

- **`atlas:mined` is a namespace, not an owner.** Mining has no actor, so a mined node is owned by _nobody_
  until `.atlas/policy.json` grants that scope — granting it **appoints a curator**. Until then
  `actorInScope` denies, and every promotion is correctly refused `unauthorized`.
- **`T2` is the candidate class, and it is bounded out of the GOVERNING band only.** This bullet used to say
  `T2` was bounded out of the read pack entirely, citing the CLI's then-current
  `TOOLS-6: bounded read projection (tier>=T1)`. [ADR-0013](../adr/ADR-0013-the-pack-has-two-bands-governing-and-advisory.md)
  split the pack into **two separately bounded bands**, and the advisory band is exactly `T2` — so a promoted
  mined fact IS served by [`query`](../reference/commands/query.md), on an `advisory` row under its own verb
  and its own cap, and never on an `inv` row. Measured through the real promotion door, not inferred; the
  verbatim output is on [`promote`](../reference/commands/promote.md).
- **A mine → promote → query loop reaches the ADVISORY band and stops there.** Getting a mined fact into the
  **governing** band means a fact at `T1` or stricter, which no mined candidate is. That is a
  re-classification, it is an explicit signed act
  ([ADR-0009](../adr/ADR-0009-re-classification-is-an-explicit-signed-act.md)), and it has no door yet.

The contract clause is therefore two-part and both parts are checkable: **every row carries a usable
`(scope, tier)` pair** — an absent carrier is not a grant and not a crash, it is a row whose authority is
UNCONFIRMABLE, which both write doors fail closed on — and **every `atlas:mined` row is `T2`**. **GOC-5**
checks both, and reports the count bounded out of the pack rather than leaving it to be inferred: an empty
`atlas query` over a store full of promoted facts means the bound held, **not** that the run produced
nothing, and a probe that stays silent about that invites exactly the wrong reading.

---

## 4. Grounding — what must be carried for a fact to re-derive

A `Grounding` is `{ entries: GroundingEntry[] }`. Each `GroundingEntry` carries:

| field           | type                                             | role                                        |
| --------------- | ------------------------------------------------ | ------------------------------------------- |
| `anchor`        | `StructRef` (`packages/contracts/src/struct.ts`) | **the drift oracle**                        |
| `path`          | `string`                                         | repo-relative, for humans and navigation    |
| `displayLines?` | `string`                                         | an OPTIONAL nav hint — **never** the oracle |

and the `StructRef` itself is `{ kind: 'symbol'|'block'|'file'|'repo'|'project', qualifiedPath, subtreeHash }`.

**`anchor.subtreeHash` is the drift oracle, and nothing else is.** Not line numbers, not `displayLines`, not
the file byte-hash. `SubtreeHash` carries its own brand precisely so the drift leg and the content leg stay
orthogonal.

**The predicate a fact must satisfy to have grounding at all** is `isGrounded` (GROUND-2): **≥1 entry, and
every entry's `anchor.subtreeHash` non-empty.** An ungrounded grounding must never surface FRESH, so a
stored fact that fails this is a fact that can never re-derive and can never honestly drift. **GOC-4** is
that predicate, plus the shape of what surrounds it (`qualifiedPath` non-empty, `kind` in the `StructRef`
union, `path` present).

**What makes it DRIFTED later.** `driftDetect(grounding, src)` is FRESH iff **every anchor's `subtreeHash`
matches at `src`** _and_ the forward closure's **interface-level `rState`** is unchanged (GROUND-11) — so a
callee's signature change drifts its callers while a behaviour-preserving body refactor drifts none. There
is no normalizer in this product, so a **reformat of the cited unit drifts it** (`packages/contracts/src/struct.ts`
records the 2026-08-02 amendment). An unresolvable citation — unit gone, path absent — is dropped by
`ground` and reads DRIFTED, never a throw. For an **advisory** fact drift resolves to `STALE`
(non-blocking, served-with-flag), not `DRIFTED` (GROUND-13); a mined fact is advisory, so this is the arm it
takes. Freshness is a **structural** predicate and never a truth claim: FRESH ≠ true.

> **MEASURED, and it is the reason GOC-4 exists as its own leg.** The CAS re-hash-on-read guard **cannot see
> a tampered grounding.** KERNEL-8 excludes the mutable side-indexes `grounding`/`status`/`freshness` from the
> canonical preimage, so blanking an `anchor.subtreeHash` leaves `id(parsed)` unchanged and `atlas node
<addr>` returns the fact `status: ok`, exit 0. Tampering `tier` — which _is_ in the preimage — is caught
> and answers `no-such-node`, exit 1. Both runs executed against the built binary at `e993e14`. So a fact
> whose drift oracle has been destroyed reads back perfectly through the shipped door, and **nothing except
> an explicit grounding check will notice**.

---

## 5. The aggregate expectations for a whole run

This is the part that makes the document a contract rather than a description. For a repository whose
frontier ranks `N` sites, the following must be true **of the output set**, not of any one fact. Each is a
named check in `harness/probes/genesis-output-probe.mjs`.

| id        | expectation                                                                                                                                                                    | how it can fail                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GOC-1** | **STORE** — the projection is present, readable and `identity`-stamped, and the store arrived through a **door** rather than by a git commit                                   | an `unreadable` sidecar reported as "0 facts"; a missing schema stamp (writes are refused, `identity-schema.ts`); a `.atlas/` tracked by git, which reads as EMPTY and refuses every write |
| **GOC-2** | **ADDRESS** — one current node per `nodeKey` (KNOW-4g), no duplicate address, every `contentHash` retained in the `cas` set, `nodeKey ≠ contentHash`                           | a disk round-trip is the one producer that can key a row by something other than its own `nodeKey`; two nodeKeys on one content address                                                    |
| **GOC-3** | **SHAPE** — every row's bytes are a whole `GroundedFact` **and corroborate the row** on `id`, `scope`, `tier`                                                                  | a row whose bytes are absent; an advisory carrying a `check` (or a predicate without one); a forged row                                                                                    |
| **GOC-4** | **GROUND** — **no fact without grounding**: `isGrounded` holds for every stored fact                                                                                           | a blanked `subtreeHash`, an empty `entries`, an entry with no `path` or a non-`StructRef` `kind`                                                                                           |
| **GOC-5** | **CLASS** — every row carries a usable `(scope, tier)`, every `atlas:mined` row is `T2`, and the TOOLS-6 consequence is **reported**                                           | an absent carrier (authority UNCONFIRMABLE); an off-lattice class; a mined row raised above the candidate class                                                                            |
| **GOC-6** | **PROVENANCE** — every `atlas:mined` fact in governed knowledge still has its **staged origin**, at the same identity and the same address                                     | staging has no delete and a promoted row is never removed, so a mined row in knowledge with no staged twin means something reached knowledge without passing staging                       |
| **GOC-7** | **READBACK** — every fact **resolves through a shipped command**: `atlas node <contentHash>` exits 0 and prints back that row's `nodeKey`                                      | a pruned CAS object; a fact whose two identities have been swapped (the address taken and the identity printed are checked in one call)                                                    |
| **GOC-8** | **TOTALITY** — the run's own counters close over the store: sites visited == budget spent, the two candidate counts agree, and **no candidate is counted that is not durable** | the measured failure the staging commit door exists for — 8 processes × 5 sites reported 40 candidates committed with **5 durable**, every process exiting 0                               |

Read as one paragraph: **no site is silently dropped, abstention is accounted for, no fact exists without
grounding, no address is claimed twice, and every fact is readable back through a shipped command.**

### What is NOT checkable, and why — stated so it cannot be mistaken for coverage

1. **Totality against the frontier, from the STORE alone.** The on-disk store (CAS, staging, projection)
   carries **no per-site ledger**; the sites a run visited are recorded on the run's `GenesisReport.coverage`
   (`RunCoverage`, `packages/genesis/src/types.ts:148-203`), not in the store. Since #175 that coverage **is**
   a durable per-site record: one `SiteOutcome` per planned site, and an `abstained` row keeps its grounded
   GEN-12 `WhyNot` (`packages/cli/src/mine-render.ts:135-172` prints the block, one row per site). So a site
   that abstained and a site that was silently dropped **are** now distinguishable — but on the report, not in
   the store. That is why the probe takes `--report <file>` and why, without one, GOC-8 is reported
   **UNEVALUABLE** rather than passed: it is reconciling the frontier against a ledger the store does not hold.
2. **Per-site abstention accounting, in general.** Even with the report, the residual is attributable only on
   the one branch whose prose names it (`N site(s) visited and every one abstained`, `mine-render.ts`). On any
   other branch the probe says so rather than doing arithmetic it cannot justify — a site may yield more than
   one fact, so `sites − candidates` is not a residual.
3. **That the store agrees with `@atlas/kernel`.** The probe holds no `@atlas/*` import (the harness
   invariant), so it never re-derives a `nodeKey` or a `contentHash`. It can prove a store agrees with
   _itself_; the shipped `atlas node` re-hashes on read, which is what `--cli` reaches for — and §4 records
   exactly how far that guard extends.
4. **Whether a claim is TRUE.** Nothing here grades a claim. Truth is the truth gate's question, re-derived
   mechanically at the emit door; grounding is structural and FRESH is not a truth claim.
5. **`ratified` and `open`.** The run controller hard-codes `ratified: []` and `open: []`, so the S3
   interview legs of `GenesisReport` have nothing to check today.

---

## 6. Running the probe

```
node harness/probes/genesis-output-probe.mjs <repo> [--report <file>] [--cli <bin>]
```

| exit | meaning                                                 |
| ---- | ------------------------------------------------------- |
| `0`  | every expectation was **evaluated** and every one held  |
| `1`  | at least one expectation **FAILED**                     |
| `2`  | nothing failed, but at least one could not be evaluated |

`2` is a real outcome, not a rounding of `0`. An unevaluated expectation is not a passing one: without
`--report` there is no site ledger (GOC-8), and without `--cli` no shipped command was actually run, so
"bytes are on disk" would be reported as "a read door answered" — two different claims.

**A per-fact expectation over zero rows is UNEVALUABLE, not PASS.** GOC-2/-3/-4/-5/-7 examine rows; run
against a store with none, they degrade rather than report a green line. This was found by pointing the
probe at a bare directory during development, where four of them printed PASS having examined nothing —
the same disease the probe's own header names, in the probe itself.

**The probe has no `.test.mjs` twin, and that is a declared gap.** It cannot easily have one: a fixture
store committed under `harness/` would be TRACKED BY GIT, which GOC-1 refuses by design, and building one at
runtime needs `@atlas/*` — which the harness invariant forbids. So its teeth are evidenced by the recorded
mutation matrix in §7 rather than by the suite, and re-arming them is a manual act.

The probe lives in `harness/probes/` and **not** in `harness/gates/`, deliberately. Everything under
`gates/` is wired into `ci.yml`; Atlas's own `.atlas/` store is not committed, so a gate here would have
nothing to run against and would exit 0 having checked nothing. That shape already exists in that directory
and is easy to mistake for coverage: `drift-patterns.mjs` and `reachability.mjs` run to exit 0 with no
output, because they are library modules whose checks live in their `.test.mjs` twins. `package.json`
exposes no script for the probe, and `ci.yml` is untouched.

## 7. Evidence — the probe was measured against damage, not asserted

A checker that only ever prints OK is worth nothing. Each expectation was armed by damaging a **fresh copy**
of a real store, one damage at a time. The store itself is real: a temp git repo with a SCIP index and a
ranked frontier, three candidates placed through the product's own staging door
(`packages/e2e-blackbox/test/stage.ts`) and carried into knowledge by the real `atlas promote` binary.
Every damage was KILLED (exit `1`):

| damage applied to the good store                        | GOC ids that fired         |
| ------------------------------------------------------- | -------------------------- |
| strip the `identity` schema stamp from the projection   | GOC-1                      |
| re-key one row so the map key is not its own `nodeKey`  | GOC-2, GOC-3, GOC-6, GOC-7 |
| make the stored bytes contradict the row (`tier`)       | GOC-3, GOC-7               |
| blank one `anchor.subtreeHash`                          | **GOC-4 alone**            |
| raise a mined row above the candidate class (`T2`→`T1`) | GOC-3, GOC-5               |
| drop one staged row                                     | GOC-6                      |
| prune one fact from the CAS                             | GOC-3, GOC-4, GOC-7        |
| a report claiming 40 candidates over a 2-row staging    | GOC-8                      |

**Read row 4 next to row 3.** Tampering `tier` also trips GOC-7, because `tier` is in the canonical preimage
so the CAS re-hash-on-read refuses the object. Blanking a `subtreeHash` trips **nothing but GOC-4** — the
grounding is excluded from that preimage, so the shipped read door answers `status: ok`. That asymmetry is
the measurement recorded in §4, and it is why GROUND is its own leg rather than something the read-back
implies.

## Related

- [`mine`](../reference/commands/mine.md) — writes the candidates. It stages **zero** today: `makeAdmitGate`
  has no production caller, so a real repository reports `0 of 0` at promotion. That is the honest state.
- [`promote`](../reference/commands/promote.md) — the governed route out of staging; every refusal named.
- [`node`](../reference/commands/node.md) — the read-back, and the page that first wrote down §2.
- [`query`](../reference/commands/query.md) — the bounded read that will **not** show a `T2` fact.
- [ADR-0007](../adr/ADR-0007-governance-class-is-a-property-of-the-node.md) ·
  [ADR-0008](../adr/ADR-0008-mining-writes-to-staging-not-to-knowledge.md) ·
  [ADR-0010](../adr/ADR-0010-authority-is-derived-from-the-resource-not-the-request.md)
- [atlas-genesis](../reference/atlas-genesis.md) · [atlas-grounding](../reference/atlas-grounding.md)
