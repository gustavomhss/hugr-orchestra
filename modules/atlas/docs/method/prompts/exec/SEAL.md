---
id: EXEC-seal
state: SEAL
version: 1.0.0
protocol_ref: ../../../EXECUTION-PROTOCOL.md#the-states # @sha pinned at method-freeze
artifact_template: ../wp-template.md#exec # the exec fields SEAL fills (outputs/provenance/trace_ref)
skills: [reconciler]
inputs: [gate_record, bind_record, wp_card, baseline_sha]
next_state: "merged (wave-plan order per roadmap/wave-plan.md) — then the next WP's BIND"
---

## Role & Placement

You **seal** the WP: the GATE-passed diff becomes a provenance-bearing commit on a green main. Two jobs: the
**anti-gaming hard-block** (prove the diff touched no test / harness / golden / `ref/` path — the canonical
hacks) and the **provenance fill** (the WP-card's present-but-empty `exec` fields become an in-toto/SLSA
attestation, content-hash bound, appended to the hash-chained event-log). Stakes: SEAL is the last gate
before code is trusted by every downstream WP; a seal that skips the diff-scope check lets a harness-tampering
green through, and a seal that fabricates provenance breaks the audit chain frankie replays at wave-close.

## Inputs

<inputs>
  gate_record:  {{GATE_RECORD}}    <!-- GATE verdict PASS: 0-survivor mutation + APPROVE + every AVAILABLE leg green (held-out/differential/PBT pass|UNAVAILABLE per assurance mode) -->
  bind_record:  {{BIND_RECORD}}    <!-- threaded by the orchestrator context-store: carries assurance mode + the `merge_after` conflict-map constraint -->
  wp_card:      {{WP_CARD}}         <!-- the card whose exec fields you fill -->
  baseline_sha: {{BASELINE_SHA}}    <!-- the parent the diff applies onto (wave-plan order) -->
</inputs>

## Pre-conditions

- **Load** `../../../EXECUTION-PROTOCOL.md` + the `reconciler` skill. GATE must be **PASS**. Else **ABORT** —
  never seal a FALSE-GREEN or FIXES-NEEDED.
- The diff applies cleanly onto `baseline_sha` (the WP's DAG predecessor is sealed). Else STOP — merge order.

## Failure modes to guard (what a model gets wrong _here_)

- **Sealing an acceptance-touching diff** — the hard-block. If the diff modifies any golden, PBT property,
  harness, or `ref/*.ts` oracle, **REJECT** (this is the harness-tampering hack, regardless of green).
- **Fabricated / partial provenance** — every `exec` field is derived from the real gate run (the gate_run
  hash, the mutation survivor count = 0, the held-out pass). Never fill `outputs` before the diff is applied,
  never invent an attestation.
- **Breaking main** — the post-apply build/typecheck/godfile-guard must be green on the merge result, not just
  in isolation. A red main is a stop-the-line event.
- **Out-of-order merge** — merging ahead of a DAG predecessor. Respect `roadmap/wave-plan.md` order.

## Procedure

1. **Diff-scope hard-block**: assert the diff touches only `packages/<pkg>/src/**` (+ non-acceptance tests).
   Any test/harness/golden/`ref/` path in the diff → **REJECT(gaming)**.
2. **Fill `exec`** from the gate run: `outputs` = the sealed files content-addressed; `provenance` =
   { attestation: in-toto/SLSA, gate_run: <hash>, **assurance: FLOOR|PBT|FULL**, mutation: survivors 0,
   held_out/differential/pbt: pass|UNAVAILABLE }; `trace_ref` = the appended event-log entry hash. The
   assurance mode is recorded, never hidden — a FLOOR seal is honestly a FLOOR seal.
3. **Merge** in **wave-plan order**: onto `baseline_sha`, and — if the bind-record carried a `merge_after`
   predecessor (a shared-`src` sequential constraint from the conflict-map) — only after that WP is sealed.
   Re-run build + typecheck + godfile-guard on the result; main must be green. Append the event-log entry.

## Output Contract

Fill the card's `exec` block (driftless — content-addressed, no prose copy) and emit a seal-record:

```
SEAL — <WP-id> @ <merge-sha>
diff_scope:  src-only ✓  (no test/harness/golden/ref touch)
exec:
  outputs:    [ src/<facet>.ts@<contentHash>, … ]
  provenance: { attestation: <in-toto/SLSA>, gate_run: <hash>, assurance: FLOOR|PBT|FULL,
                mutation: survivors 0, held_out|differential|pbt: pass|UNAVAILABLE }
  trace_ref:  <event-log entry hash>
merge:       after <merge_after WP-id | baseline> (wave-plan conflict-map order)
main:        green (build · typecheck · godfile-guard ≤400)
verdict:     SEALED | REJECT(gaming: <acceptance path touched>) | STOP(merge-order | red-main)
```

## Self-Check (mechanical gate)

- [ ] diff touches **only** `src/**` (+ non-acceptance tests) — 0 test/harness/golden/`ref/` paths? (else REJECT)
- [ ] every `exec` field derived from the real gate run (no fabricated attestation, `outputs` post-apply)?
- [ ] merge is in **wave-plan order** — the bind-record `merge_after` predecessor (shared-`src` conflict-map constraint) is sealed, not just the DAG-campaign predecessor?
- [ ] main green after merge (build · typecheck · godfile-guard)?
- [ ] event-log entry appended and hash-chain valid?

## Abstain / Failure

An acceptance-artifact touch → **REJECT(gaming)** and return to the lead (not a fixable seal). A red main
after merge → STOP-the-line; unwind and report. Never fabricate a missing provenance field to "complete" the seal.

## Completion Report

Emit: WP-id · merge-sha · exec filled · main green · event-log appended → the WP is DONE; the next WP's
**BIND** opens. At wave-close, **frankie** replays the sealed event-log to prove sealed=green is real.
