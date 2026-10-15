# #234 — the TRANSITION fact shape (ADR-0015 D4)

The fourth greenfield fact family, grounded in **ADR-0015 D4** (`docs/adr/ADR-0015-grounding-tokens-are-typed-by-fact-shape.md`, L107-110). A transition is an **IMMUTABLE ADVISORY HISTORICAL** record — _"unit returned A, now returns B"_ — spanning **TWO revisions**, anchored to the rev-pair `{unit@shaBefore, unit@shaAfter}`, **NEVER re-checked at HEAD** (a closed valid-time interval), **superseded, not falsified**. There is **NO mechanical HEAD oracle** for it.

## The design (the five sub-decisions)

- **D-T1: seal = `justified`.** Advisory-class, no `check`, no oracle; carries a `derivation`. **NEVER `proven`** — nothing at HEAD can prove OR refute a historical claim, so the honest seal is `justified` (a model read the two rev bodies and derived the change; the ground is contestable, not machine-re-runnable — `genesis-epistemic-contract.md` §JUSTIFIED).
- **D-T2: grounding = the rev-pair.** `grounding.entries = [unit@shaBefore, unit@shaAfter]`, both content-addressed (each entry's `anchor.subtreeHash` IS the unit's content hash at that rev). Freshness is **stamped at emit, never re-checked** — a transition about two PAST revs would AND-fold to DRIFTED against every future HEAD, which is meaningless. `reverify-store` **already skips it** (its seal gate admits only `proven`, and a transition is `justified`) — so **no transition branch is added there**, by design.
- **D-T3: supersession, not drift.** A later transition on the SAME `unitKey` lineage supersedes an earlier one. Two transitions on the same unit but DIFFERENT sha-pairs are **distinct nodes** (distinct `transitionKey`s), **both retained**. Which one is the lineage's current head is a **derive-on-read** verdict over the `shaBefore → shaAfter` chain (the head is the transition whose `shaAfter` is no other same-unit transition's `shaBefore`); predecessors read `SUPERSEDED`. No write-time mutation of the incumbent.
- **D-T4: rename = OUT OF SCOPE, an honest limit.** Identity is the exact unit-lineage (the SAME `unitKey` across revs). A move/rename that changes `unitKey` is **NOT** reconciled — the two ends are a different lineage and are never silently linked (a documented non-behavior, not a silent gap).
- **D-T5: proven-flip = DEFERRED.** Not in this WP.

## The template — the NEGATION family, mirrored file-for-file

The negation family is the other advisory-class, no-`check`, seal-carrying greenfield sibling. This WP mirrors it:

| concern                       | negation (#99b)                                       | transition (#234)                                                                                                                       |
| ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| node type                     | `negation-types.ts` `NegationNode`                    | `transition-types.ts` `TransitionNode` (re-exported byte-identically from `types.ts`)                                                   |
| `GroundedFact` / `NodeFamily` | `'negation'`                                          | `'transition'` (fifth variant)                                                                                                          |
| identity leg                  | `negation-key.ts` `negationKey(kind,target,scope)`    | `transition-key.ts` `transitionKey(unitKey,shaBefore,shaAfter)` — directed, refuses `shaBefore===shaAfter`; `DROP_TRANSITION_MALFORMED` |
| admission                     | `admit-negation.ts` `buildNegation` (door grounds it) | `admit-transition.ts` `buildTransition` (grounds DIRECTLY on the rev-pair, mints `seal:'justified'`+`derivation`, **NO oracle**)        |
| dispatch                      | `admit-harness.ts` `case 'negation'`                  | `admit-harness.ts` `case 'transition'` (inline)                                                                                         |
| proposal                      | `NegationProposal`                                    | `TransitionProposal` (`admit-proposals.ts`)                                                                                             |
| routing                       | check-less ⇒ UPDATE/supersede                         | check-less ⇒ UPDATE (re-admit same sha-pair = in-place, no dup); lineage supersession is derive-on-read                                 |
| read fold + CLI               | `read/negations.ts` + `atlas negations`               | `read/transitions.ts` `transitionsOf` + `atlas transitions`                                                                             |

## Reachability — a true shipped path

`atlas transition <unit> <revBefore> <revAfter>` (`cli/src/transition.ts` → `adapter-io/src/transition-source.ts` `createTransitionProducer`) reads the unit's REAL content at each rev through the arbitrary-rev index (`rev-index.ts` `createRevIndex`/`resolveAnchorAt`), builds a `TransitionProposal` over the two resolved rev anchors, admits a `justified` transition (`buildTransition`), and PERSISTS it **through the governed emit door** (`governed-emit-transition.ts`). `atlas transitions <unit>` reads it back. Reachable over **real 2-rev git input**, not a test injector (AT-8/AT-9).

### The governed door — why a dedicated branch (billy security review)

A transition MUST NOT persist directly (a second gate-less write into the governed projection is the #87/ADR-0008 class ADR-0008 closed as a structural invariant). It routes through the SAME kind-agnostic `createGovernedEmit` instance the relation derive leg uses; the door's `kind:'transition'` branch (`governed-emit-transition.ts`, mirroring the negation door) applies:

- **KNOW-11 authz** (`actorInScope`) — the actor must be in the unit's own scope (`unitScopeOf(unitKey)`, stamped on `node.scope` by the producer). An unauthorized actor is **REFUSED**, nothing lands.
- **ARCH-9 anchor** (`scopeOwnsAnchor`) — the declared scope must OWN the unit; authority cannot be borrowed from an unrelated dir.
- **NO HEAD truth gate** — the main door's gate 1 re-derives freshness of the grounding against HEAD (`driftDetect(grounding, axes)`); a transition grounds on PAST-rev content hashes, so it AND-folds to DRIFTED at any future HEAD by construction (D-T2) and the main gate would reject every legit transition. The transition door replaces it with a STRUCTURAL `isGrounded` check (the two rev entries carry non-empty subtreeHashes) — grounded by construction, minus the freshness that does not apply.
- **advisory-class ratify + upsert+put** — verbatim the main/negation door's atomic commit. `origin:'promoted'` keeps the `justified` seal on the durable row (an authored payload's seal is stripped as untrusted).

### Flagged limits (honest, not silent)

- **Derivation prose.** The `derivation` the `justified` seal names is **mechanically generated** ("the unit changed content across these revs"), not authored by a model that read both bodies. A full model-authored producer describing _what_ changed is deferred; the transition **fact** is fully admitted from real revs — only the richness of the justification prose is deferred.
- **D-T4 (rename)** and **D-T5 (proven-flip)** are the two design-level deferrals, documented as honest limits.

## Acceptance (AT-1..AT-9)

AT-1..AT-7 in `packages/genesis/test/transition-family.test.ts`; AT-8 + the reverify-skip in `packages/adapter-io/test/transition-producer.test.ts`; AT-9 blackbox e2e in `packages/e2e-blackbox/test/s234-transition.blackbox.test.ts`. All admit a `justified`-sealed transition, prove distinct/directed identity + the 2-entry rev-pair grounding, the derive-on-read lineage supersession, the never-`proven` seal, the no-HEAD-recheck invariant, the malformed/zero-interval refusal, and the rename-not-reconciled limit.
