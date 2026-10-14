# ADR-0004 — the authoring surface is a set of PLANNERS, not new write doors

- **Status:** Accepted — owner-ratified 2026-08-24 (DEFINE seat, verbal "aprovo"); was Proposed 2026-07-25. Unblocks CAMPAIGN-10.1.
- **Spec author:** lead, grounded against `master` @ `3496d6f` + the 2026-07-25 `corelink-runners` dogfood.
- **Introduces:** `INV-AUTH-1..14` (reference/atlas-authoring.md), `CAMPAIGN-10`.
- **Does NOT amend:** INV-TOOLS-1 / ADR-0003. `GOVERNANCE_SURFACE` stays 5; `WRITE_PATHS` stays 2.

## Context

Atlas's write governance is complete and validated: two fail-closed doors, KNOW-11 authz, KNOW-8/18
ratification, and a truth gate that re-derives every grounding at emit time. That last property is the
product's thesis — and it is also what makes a fact **impossible to write by hand**.

To be accepted, a fact must carry a `grounding.entries[].anchor.subtreeHash` that re-derives against the
built index, and a `qualifiedPath` that names a real index unit (for a symbol, the folded
`file::<start>:<kind>:<name>` unit path). Neither value can be produced without running Atlas's own
indexer. A third field, `id`, must be `nodeKey(candidate)` — a hash the author also cannot compute, and
which the governed door then **discards and re-mints** anyway (WP-F3, the anti-spoof guard).

The consequence, measured in the dogfood: **zero facts have ever been authored through a product door.**
The only thing that has ever written a fact is `packages/e2e-blackbox/test/author.ts`, which imports
`@atlas/index`, `@atlas/adapter-io` and `@atlas/knowledge` and whose own header calls it _"the stand-in
for the authoring tool a real user would reach for."_ `atlas mine`, the automatic path, abstains by design
with no model wired.

The obvious framing — "the product needs write doors for authoring" — would re-open INV-TOOLS-1 for the
second time in a week. That framing is wrong.

## Decision

**Authoring is not writing.** Every door the authoring surface adds is a **planner**: it reads the repo and
the projection, computes a payload, returns it, and persists nothing. The write surface is untouched.

```
GOVERNANCE_SURFACE = 5   (unchanged)   WRITE_PATHS = { atlas-emit, atlas-link }   (unchanged)
READ / PLANNER doors     anchors · slots · draft · check     (new — zero write authority)
```

Two invariants make this structural rather than aspirational:

> **AMENDED 2026-08-30 — the word "structural" overclaims what ships.** The ratified text above is left
> intact; this note corrects it. `reference/atlas-architecture.md` (ARCH-11) states the honest reading:
> _"the honest claim is 'structurally **checked**' (a spy), not 'structurally **guaranteed**' (a type) —
> and ADR-0004 currently claims the latter."_ The planner legs are built as arrow closures in the same
> lexical scope as `const store = createDiskStore(…)` (`wire.ts`), so a leg CAN reach `store.put`;
> write-freedom is enforced today by a runtime spy in tests, not by a type that makes the mutator
> unreachable. AUTHOR-2 and AUTHOR-13 are true as PROPERTIES; what is not true is that the architecture
> makes violating them impossible. Closing this is ARCH-11, and its own acceptance criterion is
> _"enforced by the type, demonstrated by a compile failure, not by a spy"_ — not yet implemented.
>
> Corrected because this repository is PUBLIC: a reader relies on the word "structural" meaning the
> code cannot do otherwise, and today it can.

- **AUTHOR-2** — no planner writes, mutates, stages, caches, or queues any byte; no planner appears in
  `WRITE_PATHS` or `GOVERNANCE_SURFACE`.
- **AUTHOR-13** — retire/supersede is expressed as a _draft variant_ carrying the superseded authoring
  state, persisted through `atlas-emit` under its full gate set. There is no retire door and no delete door.

The precedent already exists in the ratified product: `atlas doctor reground` returns a
`RegroundPlan{ fact, action, emit: GroundedFact }` and is documented as _"a PROPOSAL only; persists
nothing. Run through atlas-emit to persist"_ (TOOLS-12, `cli/src/doctor.ts`). The authoring surface is that
pattern generalized from the drift case to the authoring case.

## The one coupling this decision accepts, deliberately

`anchors` and `draft` must compute a grounding. The emit truth-gate re-derives one. If those are two
implementations, **every draft is rejected and the product manufactures the exact drift it exists to
detect.** The axiomatic-design pass (`design/authoring.md` §3.3) records this as coupling **C1** and
resolves it by _sequencing, not decoupling_:

> **AUTHOR-1 — one grounding computer.** All planner derivations and the truth-gate re-derivation go
> through a single seam. No second derivation, no cached digest table, no per-caller re-implementation;
> and a caller must not have to perform its own set-up for its fold to match the runtime's.

That last clause is grounded in a live smell: `author.ts:24-31` carries a top-level `await initAst()`
purely so its AST fold matches the runtime's. The warm-up requirement belongs inside the seam, not in
every caller.

## Rejected alternatives

**(a) A third governed write door (`atlas-author` / `atlas-stage`).** Rejected. It would amend
INV-TOOLS-1 for a second time to solve a problem that needs no write at all, and it would put a
convenience door at the same governance weight as the truth gate. The count is not sacred (ADR-0003 said
so) — but growing it for something that persists nothing is unjustifiable.

**(b) Two grounding computers (a fast planner-side hash + the real gate-side one).** Rejected. It trades
correctness for latency in the one place Atlas cannot afford it: a divergence would appear to the user as
"my true fact was rejected," which is indistinguishable from the failure mode Atlas advertises catching.
Accepted cost: planners pay a full index build.

**(c) Ship `author.ts` as a library and tell users to import it.** Rejected. It makes every author a
TypeScript programmer inside the Atlas monorepo, it exposes internal seams as public API, and it leaves
the MCP transport with no story at all.

**(d) Wait for `atlas mine` (wire a model) instead.** Rejected as a _substitute_, kept as a complement.
Mining is model-gated and abstains by design; a governed knowledge product whose only possible author is
an unwired model holds zero human ground truth. Human authoring is the floor mining stands on, not an
alternative to it.

**(e) Relax the truth gate for hand-authored facts.** Rejected outright. The gate is the product.

## Consequences

- `GOVERNANCE_SURFACE`, `WRITE_PATHS`, ADR-0003 and the spec-conformance guard's CODE-SURFACE PIN are all
  **unchanged**. The gate keeps passing without modification.
- A new module family `AUTH` enters the ID scheme (`INV-AUTH-n` → `REQ-AUTH-n[-c]` → `SCN-AUTH-n[c]-k`),
  plus extensions to the existing `CLI` and `MCP` families.
- `WP-AUTH-0` (the shared grounding computer) is a hard prerequisite of every other authoring WP — this is
  the sequencing that makes coupling C1 triangular. Nothing else may start first.
- Five defects found alongside the gap are fixed in the same campaign: the emit receipt carries the
  identity the read doors consume (AUTHOR-14); the CLI renders every result field (ENTRY-CLI-6); the CLI
  gains a help surface (ENTRY-CLI-5); malformed payloads get a structured reason instead of a raw
  `TypeError` (AUTHOR-12); the required-but-discarded `id` field stops being demanded of authors (AUTHOR-6).
- **Acceptance of the whole campaign** is AUTHOR-8 plus one black-box story: a user authors and emits a
  fact using **only** product doors, on **both** transports. Delivered by two new black-box stories that
  import NOTHING from `@atlas/*`: `s-mcp-authoring` (drives anchors→slots→draft→emit over stdio MCP alone,
  reads the fact back) and `s-mcp-4-draft-parity` (PROP-MCP-4: byte-identical `draft` verdict CLI≡MCP,
  including the partially-populated divergence-teeth arm SCN-MCP-4c-1).
- **[AMENDED 2026-08-25, owner-decided] The acceptance is the product-door authoring PROOF above, not the
  physical deletion of `author.ts`.** The original clause "after which `author.ts` is deleted" rested on an
  incomplete view of that file. WP-10.A5.E2E measured it: `author.ts` conflates **two** roles.
  (a) The **authoring stand-in** — the happy-path fact fabricator the campaign exists to replace. This role
  is **retired**: the two stories above prove a human/agent authors and emits through product doors on both
  transports, importing no product library. (b) An **adversarial fixture factory** — `ungroundedFact`,
  `subtreeHashOf`-forged stale hashes, `groundedMultiSymbolFact`, `groundedRelationFact`, `negationPayload`:
  facts the product **must refuse**, which by design **no product door can produce** (you cannot author "a
  fact the gate rejects" through the gate that rejects it; hand-hardcoding the hashes would be brittle and
  vacuous, the exact smell the grounding tests warn against). Role (b) is a **legitimate, permanent test
  fixture**, not campaign debt, and it is **kept**. Re-pointing the ~28 remaining happy-path consumers off
  `author.ts` onto a shared `draft→emit` helper — so its authoring-stand-in role is fully gone and the file
  narrows to role (b) alone (ideally renamed to its adversarial-fixture identity) — is tracked **hygiene
  follow-up**, not an acceptance blocker. The campaign's product thesis is closed on the proof, not the `rm`.
- Two findings were **deferred, not solved**, and were recorded as open DEFINE items (A-D3, A-D4).
  **A-D3 is now DECIDED and BUILT** (task #83): `sameAs` retraction ships as a MODE of the existing
  `atlas-link` door, so it needed no third write door and no amendment — see ADR-0003 §Retraction.
  **A-D4 is now CLOSED and BUILT** (WP-PROMOTE), after a measurement that first sharpened it: `stage()` is a
  pure in-memory wrapper whose only production callers are the two governed doors (`governed-emit.ts`,
  `governed-link.ts`), so it is not the explorer's write path at all; the explorer's real durable path is
  `commitStaging` (driven by `atlas mine`), and `persistStaging`/`loadStaging` had ZERO production callers.
  What was missing was not the staging medium but a governed PROMOTION path out of it. `atlas promote` is
  that path, and — exactly as A-D3 needed no third write door — it needed no sixth tool: it publishes through
  the existing `atlas-emit` door, which ADR-0008 had already pre-decided was the right shape for a curator
  door. `GOVERNANCE_SURFACE` stays 5; `WRITE_PATHS` stays `{atlas-emit, atlas-link}`.
