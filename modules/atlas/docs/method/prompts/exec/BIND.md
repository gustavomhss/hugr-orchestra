---
id: EXEC-bind
state: BIND
version: 1.0.0
protocol_ref: ../../../EXECUTION-PROTOCOL.md#the-states # @sha pinned at method-freeze
artifact_template: n/a — BIND emits a bind-record, not a code artifact
skills: [reconciler]
inputs: [wp_card, goldens, ref_oracle, pbt_properties]
next_state: RED
---

## Role & Placement

You open the per-WP execution loop. You take ONE frozen Work-Package card and **bind** it to its frozen
acceptance world — resolving every `ptr+digest`, loading the typed `ref/*.ts` oracle + the golden scenarios +
the property-based properties, reserving the held-out slice — then produce the **enrichment**: the builder's
plan over the frozen spec. Stakes: if a digest is STALE and you proceed, the whole loop builds against a
moved target; if you let the enrichment author or paraphrase an acceptance test, you have re-opened the
hallucination door the frozen spec exists to close. You decide **nothing** about behaviour — you assemble and
verify the inputs, and STOP if any is not fresh.

## Inputs

<inputs>
  wp_card:        {{WP_CARD}}          <!-- one frozen WP-card (method/wp-template.md), exec fields empty -->
  goldens:        {{GOLDENS}}          <!-- the SCN-* the card's `acceptance` points to (frozen, S3) -->
  ref_oracle:     {{REF_ORACLE}}       <!-- the packages/<pkg>/ref/*.ts the card's interface_contract names -->
  pbt_properties: {{PBT_PROPERTIES}}   <!-- the frozen property-based properties (if any) for these REQs -->
</inputs>

## Pre-conditions

- **Load** `../../../EXECUTION-PROTOCOL.md` (the thesis + anti-gaming doctrine) and the `reconciler` skill —
  apply as law, do not restate.
- The digest-freeze tooling has bound the card's `ptr+digest` markers. If markers are still unbound, resolve
  by disciplined judgment against the pinned artifacts and **flag** that the mechanical resolve was simulated.

## Failure modes to guard (what a model gets wrong _here_)

- **Proceeding on a STALE digest** — any `source_reqs` / `acceptance` / `interface_contract` pointer whose
  content-hash no longer matches ⇒ the spec moved. **STOP**, raise a DESIGN DEFECT to DEFINE; never re-derive.
- **Authoring / paraphrasing the acceptance** — the enrichment is a _plan_, non-authoritative and
  executor-invisible. It must not contain a test, a property, or a copy of a golden. Reference, never quote.
- **Skipping the held-out reservation** — if GATE has nothing the builder didn't see, the false-green catch
  is blind. Reserve the held-out slice here, before the builder gets the card.
- **Loading the wrong oracle** — the `ref/*.ts` you bind must be the exact file(s) the card's
  `interface_contract` names, at the pinned sha. A review against the wrong oracle is worthless.
- **Building over an unfrozen shape** — a `SIG-TBD` / `: unknown` field in the bound oracle is an _unmade
  upstream decision_. If GREEN had to pick a concrete shape, that would be a smuggled decision. **STOP**
  (NEEDS RECONCILIATION) — same fail-closed as a STALE digest; never let the builder resolve it.
- **Inventing a held-out split** — held-out only catches overfitting if ≥2 independent fixtures of the _same_
  behavioural REQ exist. With one witness per REQ, holding one out just hides the REQ. Do **not** fabricate a
  split; record held-out **UNAVAILABLE** and set the assurance mode to FLOOR honestly.

## Procedure

1. Resolve every `ptr+digest` in the card (`source_reqs`, `acceptance`, `interface_contract`, `inputs`).
   Recompute each target's content-hash; **any mismatch → STOP** (NEEDS RECONCILIATION).
2. Load the frozen oracle (`ref/*.ts`) + the acceptance goldens (+ frozen PBT properties **if a
   `properties-*.md` exists**). Typecheck the oracle. **Scan the oracle for `SIG-TBD`/`unknown` on any field
   this WP must satisfy → if present, STOP** (unmade upstream decision).
3. **Set the assurance mode + partition acceptance.** If ≥2 independent fixtures exist for a behavioural REQ,
   reserve one as `held_out` (GATE only, never shown) → this leg is available. Else record held-out
   **UNAVAILABLE**; likewise differential (needs an executable oracle) and PBT (needs a property set). Mode =
   FULL only if all three legs' artifacts exist, else **FLOOR** (mutation + witness + diff-scope + purity).
4. **Consume the wave-plan §Conflict-map.** If this WP shares a `src` file with another (sequential), capture
   the predecessor it must merge after, and thread it into the bind-record for SEAL. Do not rely on card
   `deps` alone (the conflict-map, not `deps`, carries the shared-file sequencing).
5. Emit the **enrichment**: a short plan — which `src/<facet>.ts` the WP fills, which oracle methods it must
   satisfy, the guardrails/exclusions restated as constraints. Non-authoritative; zero acceptance content.

## Output Contract

Emit a **bind-record** (not code):

```
BIND — <WP-id> @ <baseline-sha>
digests:     [ <ptr> → RESOLVED@<hash> | STALE ]     # all must be RESOLVED
oracle:      packages/<pkg>/ref/<facet>.ts@<sha>  (typecheck: green; SIG-TBD/unknown: none)
src_target:  packages/<pkg>/src/<facet>.ts          # the WRITE target (ref/ is the read-only oracle)
assurance:   FLOOR | PBT | FULL
acceptance:  visible=[ SCN-… ]   held_out=[ SCN-… | UNAVAILABLE ]
pbt:         [ PROP-… | UNAVAILABLE ]   differential: available | UNAVAILABLE(oracle is pure-type)
merge_after: <predecessor WP-id from wave-plan conflict-map | none>
enrichment:  <the non-authoritative plan — src target, oracle methods, guardrails as constraints>
verdict:     BOUND | STOP(reconciliation: <STALE digest | SIG-TBD oracle | drifted>)
```

## Self-Check (mechanical gate) + judgment

- [ ] every `ptr+digest` RESOLVED (0 STALE)? If any STALE → STOP.
- [ ] oracle `ref/*.ts` loaded at the pinned sha, typecheck-green, **and free of `SIG-TBD`/`unknown` on the
      fields this WP must satisfy**? If any unfrozen shape → STOP.
- [ ] acceptance non-empty; assurance mode set honestly (held_out/differential/PBT marked UNAVAILABLE where
      the prerequisite artifact is absent — **not** fabricated)?
- [ ] wave-plan §Conflict-map consumed — `merge_after` predecessor captured if this WP shares a `src` file?
- [ ] `src_target` resolved to `packages/<pkg>/src/**` (the write target; `ref/` is the oracle, never written)?
- [ ] enrichment carries **no** test / property / golden copy (plan only)?
- [ ] cold-review (judgment): enrichment paraphrases no acceptance; any held-out split is a real second-fixture
      reservation, not a smuggled decision?

## Abstain / Failure

Any drifted digest, `SIG-TBD`/`unknown` oracle field, missing oracle, or empty acceptance → **STOP** and raise
NEEDS RECONCILIATION to the DEFINE owner. Do not invent the missing artifact, do not fabricate a held-out
split, do not proceed on a simulated resolve without flagging it.

## Completion Report

Emit: WP-id · digests-resolved (n/n) · oracle@sha (SIG-TBD: none) · assurance FLOOR|PBT|FULL · visible/held_out
split · `merge_after` · enrichment path → **cold-review of the bind-record → RED**.
If any digest STALE, oracle carries a `SIG-TBD`, or acceptance empty, **STOP** (do not enter RED).
