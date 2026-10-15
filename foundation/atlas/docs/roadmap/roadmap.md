# Orchestra Atlas — Roadmap (state C: vertical epics × dependency-ordered campaigns)

### EPIC-1-a — content-addressed identity & canonical encoding

goal-trace: "no two authorities ever disagree on a fact's id → identity is computed, never asserted, and a non-canonical preimage cannot exist → the BLAKE3 identity + canonical-encoding seam"
vertical: KERNEL (content-address identity · hashing seam · preimage excludes side-indexes) — demoable: emit an object, get a deterministic id; a float/non-NFC/hand-rolled-id preimage fails closed
reqs: [ REQ-KERNEL-1a, REQ-KERNEL-1b, REQ-KERNEL-1c, REQ-KERNEL-2a, REQ-KERNEL-2b, REQ-KERNEL-2c, REQ-KERNEL-8a, REQ-KERNEL-8b ]
campaign: CAMPAIGN-1
split: Path (the content-identity route) from EPIC-1

### EPIC-1-b — portable open-JSON export/import round-trip

goal-trace: "an atlas is never trapped in one store → any content-addressed object rehydrates into a fresh store byte-for-byte → the OKF export/import path"
vertical: KERNEL (self-contained open-JSON export) → PERSIST (portable source = store+trailers · no lock-in on top of git) — demoable: export an OKF bundle, replay 1:1 into an empty store, malformed bundle fails closed
reqs: [ REQ-KERNEL-6a, REQ-KERNEL-6b, REQ-PERSIST-1-a, REQ-PERSIST-1-b, REQ-PERSIST-9-a, REQ-PERSIST-9-b ]
campaign: CAMPAIGN-1
split: Path (the export/import route) from EPIC-1

### EPIC-2-a — append-only single content-keyed store

goal-trace: "history is never mutated behind an agent's back → every write is an append and entry points never throw → the single append-only store + total entry points"
vertical: KERNEL (single store · append-only log · pure/total entry points) — demoable: an in-place mutation/delete is rejected; malformed input yields a value, never an exception
reqs: [ REQ-KERNEL-3a, REQ-KERNEL-3b, REQ-KERNEL-4a, REQ-KERNEL-4b, REQ-KERNEL-7a, REQ-KERNEL-7b ]
campaign: CAMPAIGN-1
split: Path (the append/store route) from EPIC-2

### EPIC-2-b — fold-reconstruction & non-linear rewind

goal-trace: "state is always recoverable from the event set → AtlasState folds order-independently and survives rebase/rewind → the fold + forget-to-active-set path"
vertical: KERNEL (state rebuilt by fold · no mutable snapshot) → PERSIST (fold convergent · never delete, archive & re-spawnable · rebase byte-identical) — demoable: fold a shuffled event set to one state; rebase leaves AtlasState byte-identical; forgetting leaves only the active set
reqs: [ REQ-KERNEL-5a, REQ-KERNEL-5b, REQ-PERSIST-2-a, REQ-PERSIST-2-b, REQ-PERSIST-2-c, REQ-PERSIST-5-a, REQ-PERSIST-5-b, REQ-PERSIST-5-c, REQ-PERSIST-5-d, REQ-PERSIST-12-a, REQ-PERSIST-12-b ]
campaign: CAMPAIGN-1
split: Path (the fold/rewind route) from EPIC-2

### EPIC-3-a — single-event identity & idempotent append

goal-trace: "a re-delivered event never double-counts → content-identity makes append idempotent and seq is never an identity or merge key → the event-identity/append route"
vertical: KERNEL (event identity is content · idempotent append · seq-not-key) — demoable: append the same event twice, one entry; a colliding seq never collides identity
reqs: [ REQ-KERNEL-9a, REQ-KERNEL-9b, REQ-KERNEL-9c, REQ-KERNEL-9d, REQ-KERNEL-9e ]
campaign: CAMPAIGN-1
split: Path (the identity/append route) from EPIC-3

### EPIC-3-b — merge collision converges across branches

goal-trace: "two seats never lose a fact on merge → colliding writes OR-Set-union to one convergent head, driver-installed or safe-degrading → the collision/convergence route"
vertical: KERNEL (collision set-union · forced-head tie-break · convergent commutative fold · self-installing driver) → PERSIST (driver unions by content-hash & re-folds · direction-independent · bypassed driver loses no event) — demoable: two branches merge in either order to one head, 0 lost; an unconfigured clone still unions losslessly
reqs: [ REQ-KERNEL-10a, REQ-KERNEL-10b, REQ-KERNEL-10c, REQ-KERNEL-11, REQ-KERNEL-12a, REQ-KERNEL-12b, REQ-KERNEL-12c, REQ-PERSIST-11-a, REQ-PERSIST-11-b, REQ-PERSIST-11-c, REQ-PERSIST-11-d, REQ-PERSIST-11-e, REQ-PERSIST-11-f, REQ-PERSIST-11-g ]
campaign: CAMPAIGN-1
split: Path (the collision/convergence route) from EPIC-3

### EPIC-4-a — provenance metering committed per WP

goal-trace: "every unit of work is auditable for cost & origin → each WP writes a hashed provenance trailer + note → the metering/provenance-attach route"
vertical: PERSIST (provenance trailer + git note · hashed pointers · content in CAS · full per-agent metering) — demoable: commit a WP, read back model/tokens/gates/verdict from the trailer+note; a large body lives in CAS, not the git object
reqs: [ REQ-PERSIST-3-a, REQ-PERSIST-3-b, REQ-PERSIST-4-a, REQ-PERSIST-4-b, REQ-PERSIST-4-c, REQ-PERSIST-6 ]
campaign: CAMPAIGN-3
split: Path (the record-provenance route) from EPIC-4

### EPIC-4-b — host-forge adapter carries the atlas

goal-trace: "the atlas travels with every PR on any forge → the host adapter abstracts the forge and configures the notes refspec → the carry-to-forge route"
vertical: PERSIST (host adapter abstracts forge · configure notes push refspec · PR data is a projection · clone-required datum in a trailer that survives a rewrite) — demoable: push to GitHub/GitLab, notes ride the configured refspec; a history rewrite keeps trailer data, orphans note-carried data
reqs: [ REQ-PERSIST-8-a, REQ-PERSIST-8-b, REQ-PERSIST-8-c, REQ-PERSIST-13-a, REQ-PERSIST-13-b, REQ-PERSIST-13-c, REQ-PERSIST-13-d ]
campaign: CAMPAIGN-3
split: Path (the carry-to-forge route) from EPIC-4

### EPIC-5-a — transcript retained in full, cred-scrubbed

goal-trace: "the raw record is never lost and never leaks a secret → transcripts persist as scrubbed CAS large-objects → the transcript-durability route"
vertical: PERSIST (transcript retained in full as a content-addressed large object · only a pointer in git · redact-at-source · ≥2-engine server-side scanner) → MEM (memory exports to open JSON · scanner hit blocks the write) — demoable: a secret in a transcript is redacted at source and blocks the write; the record stays lossless behind a pointer
reqs: [ REQ-PERSIST-10-a, REQ-PERSIST-10-b, REQ-PERSIST-10-c, REQ-PERSIST-10-d, REQ-PERSIST-10a-a, REQ-PERSIST-10a-b, REQ-PERSIST-10a-c, REQ-PERSIST-10a-d, REQ-PERSIST-10a-e, REQ-MEM-9a, REQ-MEM-9b, REQ-MEM-9c ]
campaign: CAMPAIGN-3
split: Path (the transcript-durability route) from EPIC-5

### EPIC-5-b — re-spawn: idempotent redispatch & replay

goal-trace: "an ephemeral agent is reconstructable anywhere without claiming false determinism → a clean clone idempotently redispatches the seat and recalls its closing fold → the redispatch/replay route"
vertical: PERSIST (ephemeral agent re-invokable · no non-git state · never claim deterministic resume · faithful replay off a Checkpoint) → MEM (every memory type versioned & travels · recall pushed at re-spawn off the archived fold) — demoable: clone fresh, the seat redispatches with its own closing fold auto-recalled; replay is faithful, resume is not claimed
reqs: [ REQ-PERSIST-7-a, REQ-PERSIST-7-b, REQ-PERSIST-10b-a, REQ-PERSIST-10b-b, REQ-PERSIST-10b-c, REQ-PERSIST-10b-d, REQ-MEM-10a, REQ-MEM-10b, REQ-MEM-13a, REQ-MEM-13b, REQ-MEM-13c ]
campaign: CAMPAIGN-3
split: Path (the redispatch/replay route) from EPIC-5

### EPIC-6 — mechanical structural index build

goal-trace: "the whole atlas grounds to one deterministic substrate → a SCIP-derived index builds with no model and reproduces byte-identically → the single structural index"
vertical: INDEX (one index backs both jobs · mechanical SCIP build · no embeddings/ANN · deterministic queries · malformed→empty, never throws · graph reconstructable given the indexer) — demoable: build the index from source twice, identical results; unresolvable edges are declared, never guessed
reqs: [ REQ-INDEX-1a, REQ-INDEX-1b, REQ-INDEX-3a, REQ-INDEX-3b, REQ-INDEX-3c, REQ-INDEX-3d, REQ-INDEX-3e, REQ-INDEX-7a, REQ-INDEX-8a, REQ-INDEX-9a, REQ-INDEX-9b ]
campaign: CAMPAIGN-2

### EPIC-7-a — incremental rollup re-hash leaf→root

goal-trace: "an edit re-costs work proportional to what changed → the rollup is BLAKE3 of children and re-hashes only the touched path → the structural-fold facet"
vertical: INDEX (rollup is BLAKE3 of children · edit re-hashes leaf→root only · unaffected subtrees keep their hash · rId/rState · Delta names changed buckets · bounded eager dependency fold) — demoable: edit one leaf, only its ancestor buckets re-hash; unaffected subtrees keep their id
reqs: [ REQ-INDEX-2a, REQ-INDEX-2b, REQ-INDEX-2c, REQ-INDEX-12a, REQ-INDEX-12b, REQ-INDEX-12c, REQ-INDEX-12d, REQ-INDEX-12e, REQ-INDEX-12f ]
campaign: CAMPAIGN-2
split: Data (the structure-rehash facet) from EPIC-7

### EPIC-7-b — drift dirty-bit propagation & stale gate

goal-trace: "a stale fact is never silently served → an edit propagates a drift dirty-bit eagerly and resolves rState lazily under a hop cap → the drift-state facet"
vertical: INDEX (stale entry visible/excluded at query · dirty-bit eager on reverse closure · rState lazy on-read · eager cap maxHops=2 · deeper=state-suspect resolved on query) — demoable: edit a node, its reverse closure marks suspect within maxHops; a stale entry is flagged at query time
reqs: [ REQ-INDEX-5a, REQ-INDEX-5b, REQ-INDEX-5c, REQ-INDEX-12g, REQ-INDEX-12h, REQ-INDEX-12i, REQ-INDEX-12j, REQ-INDEX-12k ]
campaign: CAMPAIGN-2
split: Data (the drift-state facet) from EPIC-7

### EPIC-8-a — resolve a scope to covering nodes

goal-trace: "a seat locates its grounded scope without walking the graph → resolve returns the covering node across exactly three modes and axes → the resolve/modes path"
vertical: INDEX (resolve returns covering node · file query rolls up hierarchy · exactly three retrieval modes · ≥3 axes cross-indexed · object never duplicated) — demoable: query a path, get the enclosing node + rolled-up hierarchy; there is no fourth mode
reqs: [ REQ-INDEX-4a, REQ-INDEX-4b, REQ-INDEX-6a, REQ-INDEX-6b, REQ-INDEX-10a, REQ-INDEX-10b, REQ-INDEX-10c ]
campaign: CAMPAIGN-2
split: Path (the resolve/modes route) from EPIC-8

### EPIC-8-b — relate() the honest blast radius

goal-trace: "a seat queries what is related without walking or over-claiming → relate() partitions neighbors by relation-kind from index axes, honestly under-approximate → the relate/blast-radius path"
vertical: INDEX (record unresolvable edges · never omit/fabricate · closure reported under-approximate, unions coChanged) → RETR (relate purely from index axes · partitioned & deterministic · coChanged opt-in & labeled · dependents cut at maxHops, ranked, capped at K, honest truncation meta) — demoable: relate(unit) returns a labeled partitioned list; an under-approximate closure unions the coChanged band, marked correlational
reqs: [ REQ-INDEX-13a, REQ-INDEX-13b, REQ-INDEX-13c, REQ-INDEX-13d, REQ-INDEX-13e, REQ-INDEX-13f, REQ-RETR-10a, REQ-RETR-10b, REQ-RETR-10c, REQ-RETR-10d, REQ-RETR-10e, REQ-RETR-10f, REQ-RETR-11a, REQ-RETR-11b, REQ-RETR-11c, REQ-RETR-11d, REQ-RETR-11e ]
campaign: CAMPAIGN-2
split: Path (the relate/blast-radius route) from EPIC-8

### EPIC-9-a — territory & owner assignment

goal-trace: "every path has a deterministic owner & tier → assignment derives from the hashed manifest reconciled with graph+blame, zero-LLM → the territory-axis facet"
vertical: INDEX (assignment from hashed manifest · overlap resolves deterministically · byte-identical across rebuilds · unmatched flagged uncovered · T0-adjacent defaults to deny · owner from graph+blame, override wins, tier stays human-ratified) — demoable: declare a manifest, the territory axis builds identically each run; a T0-adjacent uncovered path defaults to deny until owned
reqs: [ REQ-INDEX-14a, REQ-INDEX-14b, REQ-INDEX-14c, REQ-INDEX-14d, REQ-INDEX-14e, REQ-INDEX-14f, REQ-INDEX-15a, REQ-INDEX-15b, REQ-INDEX-15c, REQ-INDEX-15d, REQ-INDEX-15e ]
campaign: CAMPAIGN-2
split: Rules (the territory-assignment facet) from EPIC-9

### EPIC-9-b — standing coverage gate on unresolved edges

goal-trace: "grounding debt is visible & enforced → the unresolved-edge ratio is published per territory and a T0 ceiling fails the build → the coverage-gate rule"
vertical: INDEX (publish unresolved-edge ratio per territory · enforce T0 ceiling as a standing gate · crossing it fails the gate) — demoable: push a build whose T0 unresolved-edge ratio > 15%, the standing gate fails
reqs: [ REQ-INDEX-16a, REQ-INDEX-16b, REQ-INDEX-16c ]
campaign: CAMPAIGN-2
split: Rules (the coverage-gate rule) from EPIC-9

### EPIC-10-a — subtreeHash freshness oracle

goal-trace: "a fact is trusted only while its code is unchanged → subtreeHash distinguishes an edit that TOUCHES the cited unit from one that does not → the local drift-oracle route"
vertical: INDEX (every object BLAKE3 CAS, grounded & drift-checked) → GROUND (subtreeHash is the oracle · displayLines/line-ranges never an anchor · ungrounded never FRESH · unresolvable citation reads DRIFTED, never throws · an edit that does not touch the cited unit never drifts · computed via the seam) → KNOW (drift oracle is subtreeHash · an import or blank-line-separated header above the unit stays FRESH · real change drifts) — demoable: add an import above the cited function, the fact stays FRESH; change behavior, it DRIFTS; a doc-as-object drifts exactly like a fact <!-- AMENDED 2026-08-02 (HONESTY-TAPROOT): the demo script said "reformat code, the fact stays FRESH" — that demo FAILS on the shipped product; a reformat of the cited unit reads DRIFTED. AMENDED 2026-08-09 (ADR-0014): "an edit above stays FRESH" holds only for an import or a blank-line-separated header; a CONTIGUOUS leading comment is the decl's bound doc-comment and DRIFTS. -->
reqs: [ REQ-GROUND-1a, REQ-GROUND-1b, REQ-GROUND-1c, REQ-GROUND-2a, REQ-GROUND-2b, REQ-GROUND-3a, REQ-GROUND-3b, REQ-GROUND-3c, REQ-GROUND-5a, REQ-GROUND-5b, REQ-GROUND-10a, REQ-GROUND-10b, REQ-KNOW-3a, REQ-KNOW-3b, REQ-KNOW-3c, REQ-INDEX-11a, REQ-INDEX-11b ]
campaign: CAMPAIGN-4
split: Path (the local drift-oracle route) from EPIC-10

### EPIC-10-b — transitive freshness across the closure

goal-trace: "a caller drifts when its callee's contract changes, not its body → freshness folds own hash + closure interface, never the callee body → the transitive-closure route"
vertical: GROUND (freshness folds own hash & closure interface · never fold callee full body · callee contract change drifts callers · pure-body refactor never drifts · freshness never asserts truth, phrased as structural unchange) — demoable: change a callee signature, its callers drift; refactor a callee body only, callers stay FRESH
reqs: [ REQ-GROUND-11a, REQ-GROUND-11b, REQ-GROUND-11c, REQ-GROUND-11d, REQ-GROUND-11e, REQ-GROUND-11f ]
campaign: CAMPAIGN-4
split: Path (the transitive-closure route) from EPIC-10

### EPIC-11-a — truth-gate: grounded & FRESH only

goal-trace: "no fact enters or ships on its own say-so → the write is fail-closed and a merge citing a BROKEN fact is blocked → the truth-gate rule"
vertical: GROUND (truth-gate on grounded & FRESH · fail-closed write at emit · no free-prose fact persists) → KNOW (truth never self-declared · ungrounded facts fail closed) → TOOLS (re-derive citation at source@sha · reject a node that does not re-derive) — demoable: emit an ungrounded fact and it is rejected; a merge citing a BROKEN fact is blocked
reqs: [ REQ-GROUND-4, REQ-GROUND-6, REQ-GROUND-9, REQ-KNOW-1, REQ-KNOW-2, REQ-TOOLS-7a, REQ-TOOLS-7b ]
campaign: CAMPAIGN-4
split: Rules (the truth-gate rule) from EPIC-11

### EPIC-11-b — admission: grounded AND not harmful; obviousness scored

goal-trace: "the atlas never becomes a landfill of true-but-obvious facts → obviousness is measured and ranked rather than vetoed, because a veto destroys the evidence needed to audit it → the stored obviousness score + the a-posteriori ranking decision (ADR-0012)"
vertical: GROUND (admit iff the truth door passes ∧ the fact is not harmful to store · the true-but-obvious is ADMITTED with a low score · either door failing blocks · untrusted source excluded from the gate · repo-wide rule grounds to a policy artifact, anchored to a section block, anchorless rejected) → KNOW (every claim carries provenance · untrusted marked advisory & excluded from the gate) — demoable: a true-but-obvious candidate is admitted carrying a low obviousness score and ranks below a non-obvious one; an untrusted-source claim is admitted only as advisory, outside the gate
reqs: [ REQ-GROUND-7a, REQ-GROUND-7b, REQ-GROUND-7c, REQ-GROUND-8, REQ-GROUND-12a, REQ-GROUND-12b, REQ-GROUND-12c, REQ-GROUND-12d, REQ-GROUND-12e, REQ-KNOW-14a, REQ-KNOW-14b, REQ-KNOW-14c ]
campaign: CAMPAIGN-4
split: Rules (the admission rule) from EPIC-11

### EPIC-12-a — classify drift: mechanical vs semantic

goal-trace: "drift is triaged, not blanket-blocked → the drifted subset splits into a mechanical arm and a semantic arm, advisory resolving to STALE → the drift-classification route"
vertical: GROUND (advisory drift resolves to STALE · never forced into an arm · never silently re-grounded · STALE never blocks a merge) → KNOW (split the drifted subset · mechanical auto-re-grounds · semantic blocks · re-author count == semantic count) → TOOLS (classify drift into a reviewable set · exit 2 only on semantic · mechanical-only exits 0 · re-author bounded to the semantic subset) — demoable: a reformat-only drift auto-re-grounds and exits 0; a semantic drift blocks and exits 2; an advisory drift serves STALE, non-blocking
reqs: [ REQ-GROUND-13a, REQ-GROUND-13b, REQ-GROUND-13c, REQ-GROUND-13d, REQ-GROUND-13e, REQ-KNOW-5a, REQ-KNOW-5b, REQ-KNOW-5c, REQ-KNOW-5d, REQ-TOOLS-8a, REQ-TOOLS-8b, REQ-TOOLS-8c, REQ-TOOLS-8d ]
campaign: CAMPAIGN-4
split: Path (the classify-drift route) from EPIC-12

### EPIC-12-b — auto-re-ground mechanical drift in one pass

goal-trace: "mechanical drift heals without a human → a single pass re-grounds the mechanical subset and reports the count, never touching semantic drift → the auto-re-ground route"
vertical: TOOLS (auto-re-ground mechanical drift in one pass · report regroundedCount · never auto-touch semantic drift · re-ground write passes the fail-closed check) — demoable: run reground under --accept-reground, mechanical anchors heal with a reported count; semantic drift is left untouched
reqs: [ REQ-TOOLS-13a, REQ-TOOLS-13b, REQ-TOOLS-13c, REQ-TOOLS-13d ]
campaign: CAMPAIGN-4
split: Path (the auto-re-ground route) from EPIC-12

### EPIC-13-a — write-decision routes create/update/supersede

goal-trace: "a re-emitted fact upserts, never duplicates → the three-hash route mechanically picks create/update/supersede → the write-routing rules"
vertical: KNOW (every write an upsert · identical fact idempotent · advisory set-union · changed advisory edited in place · changed predicate supersedes · different check = new node · one current node per subject) → TOOLS (writes are templated · upserts not blind inserts) — demoable: re-emit an identical fact (idempotent); edit an advisory in place; change a predicate and it supersedes with lineage
reqs: [ REQ-KNOW-4a, REQ-KNOW-4b, REQ-KNOW-4c, REQ-KNOW-4d, REQ-KNOW-4e, REQ-KNOW-4f, REQ-KNOW-4g, REQ-TOOLS-7c, REQ-TOOLS-7d ]
campaign: CAMPAIGN-5
split: Rules (the write-routing rules) from EPIC-13

### EPIC-13-b — mechanical nodeKey & primary-anchor identity

goal-trace: "the write-decision never asks an LLM where a fact belongs → nodeKey and primaryAnchorId are pure functions of hashes and symbols → the anchor-identity data facet"
vertical: KNOW (write-decision is a pure function of three hashes · advisory/predicate nodeKey formulae · primaryAnchorId computed mechanically, no LLM-chosen anchor · move-aware re-anchoring · secondary citations feed drift only · a `claimNorm`-collision report (a signal, not a write-time merge) · slot from a closed vocabulary · no LLM in the write-decision) — demoable: the same fact yields the same nodeKey deterministically; a `claimNorm` collision is reported and the candidate mints its own node, with structural near-dup coverage derived on read as `subsumes` (docs/design/dedup-identity.md)
reqs: [ REQ-KNOW-15a, REQ-KNOW-15b, REQ-KNOW-15c, REQ-KNOW-15d, REQ-KNOW-15e, REQ-KNOW-15f, REQ-KNOW-15g, REQ-KNOW-15h, REQ-KNOW-15i, REQ-KNOW-15j ]
campaign: CAMPAIGN-5
split: Data (the anchor-identity facet) from EPIC-13

### EPIC-14 — fact lifecycle: lineage, template, scope

goal-trace: "no fact-history is lost and no free prose persists → facts are templated, scope-checked upserts whose prior versions live deduped in CAS → the fact-lifecycle capability"
vertical: KNOW (no free prose, template-violation rejected · every fact carries owner & scope · read universal, out-of-scope write rejected · no fact-history lost · prior versions in CAS deduped · advisory keeps no lineage pointer, predicate supersede adds only a pointer · working store stays lean) — demoable: an untemplated or out-of-scope write is rejected; a superseded fact shows git-native lineage while the working store stays lean
reqs: [ REQ-KNOW-10a, REQ-KNOW-10b, REQ-KNOW-11a, REQ-KNOW-11b, REQ-KNOW-11c, REQ-KNOW-12a, REQ-KNOW-12b, REQ-KNOW-12c, REQ-KNOW-12d, REQ-KNOW-12e ]
campaign: CAMPAIGN-5

### EPIC-15 — tier-routed ratification (T0 human-only)

goal-trace: "truth is graduated by tier and T0 never auto-admits → ratification routes by tier with billy on the security gate and no auto-promotion → the ratification capability"
vertical: KNOW (init carries zero invariants · territories ship T2/advisory default · no T0 auto-promotion, heuristics only flag · explorer writes only candidates · ratification is the ratifier's · T0 requires billy · confidence fast-path for low-risk advisory, risky routes to full ratification) — demoable: a T0 candidate stays un-admitted without a human + billy; a low-risk advisory takes the fast-path
reqs: [ REQ-KNOW-6a, REQ-KNOW-6b, REQ-KNOW-7a, REQ-KNOW-7b, REQ-KNOW-8a, REQ-KNOW-8b, REQ-KNOW-8c, REQ-KNOW-18a, REQ-KNOW-18b ]
campaign: CAMPAIGN-5

### EPIC-16 — predicate check-engine (HOLDS/BROKEN/NA)

goal-trace: "a checkable claim is verified, not asserted → a predicate is a deterministic index-query with no code execution → the check-engine capability"
vertical: KNOW (both fact families day-one · advisory standalone without an evaluator · check is a deterministic index-query · no code execution/sandbox · runtime check stays advisory · evaluator is pure · verdict feeds reconcile) — demoable: a predicate evaluates to HOLDS/BROKEN/NA deterministically with no sandbox; its verdict feeds the drift reconcile
reqs: [ REQ-KNOW-9a, REQ-KNOW-9b, REQ-KNOW-16a, REQ-KNOW-16b, REQ-KNOW-16c, REQ-KNOW-16d, REQ-KNOW-16e ]
campaign: CAMPAIGN-5

### EPIC-17 — production only at the governed moments

goal-trace: "knowledge is produced at fed-or-why-not moments, never freelanced → writes fire only at the three moments and a sealing wave must feed or emit a why-not → the production-moments capability"
vertical: KNOW (production only at the three moments · sealing wave fed-or-why-not) → TOOLS (wave-close write driven by absorb · sealing wave must feed or emit why-not) — demoable: seal a wave with no absorb and no why-not, the probe records a fed-or-why-not violation
reqs: [ REQ-KNOW-13a, REQ-KNOW-13b, REQ-TOOLS-9a, REQ-TOOLS-9b ]
campaign: CAMPAIGN-5

### EPIC-18 — calibration ledger (hits, decay, MISS-oracle)

goal-trace: "the atlas earns its keep from real, auditable use → served facts accrue logged hits that drive thresholds, decay, and a MISS-oracle → the calibration-ledger capability"
vertical: KNOW (served fact accrues a hit · door-2 threshold calibrates on hits · unconsulted decays out · decayed re-enters on a hit) → RETR (caps tuned by observed hits · hitRate drives drop order · off-atlas rate logged per territory, threshold raises a calibration prompt, deterministic, no-history→rate zero, never throws) → GEN (gate not on self-assessment · seed loose-but-thin · accrue logged hits · unconsulted decays out · threshold calibrates on hits) — demoable: cite a served fact and its frecency increments; an off-atlas read-rate crossing threshold raises a MISS-oracle prompt
reqs: [ REQ-KNOW-17a, REQ-KNOW-17b, REQ-KNOW-17c, REQ-KNOW-17d, REQ-RETR-8a, REQ-RETR-8b, REQ-RETR-13a, REQ-RETR-13b, REQ-RETR-13c, REQ-RETR-13d, REQ-RETR-13e, REQ-GEN-16a, REQ-GEN-16b, REQ-GEN-16c, REQ-GEN-16d, REQ-GEN-16e ]
campaign: CAMPAIGN-6

### EPIC-19 — bounded pack assembly (tier floor, PPR, cap)

goal-trace: "a seat receives a budget-bounded, grounded pack it never assembles → the pack fills T0-first then rank, capping over silent drop → the pack-assembly capability"
vertical: RETR (relevance from the structural index only · pack token cap · fill T0 in full then T1 by rank · cap wins never silent-drop · merged-pack budget & fill order · no free prose · stale pack re-grounded before use · malformed scope→empty, never throws) → TOOLS (query resolves scope to covering territories · pack bounded to tier≥T1 · stale pack re-grounded) — demoable: query a scope, get a ~1.5K pack that never drops T0; a stale pack is re-grounded before serving
reqs: [ REQ-RETR-1, REQ-RETR-2a, REQ-RETR-2b, REQ-RETR-2c, REQ-RETR-2d, REQ-RETR-2e, REQ-RETR-2f, REQ-RETR-7a, REQ-RETR-7b, REQ-RETR-7c, REQ-RETR-7d, REQ-RETR-9a, REQ-RETR-9b, REQ-TOOLS-6a, REQ-TOOLS-6b, REQ-TOOLS-6c ]
campaign: CAMPAIGN-6

### EPIC-20 — OwnPack: curated, zero-assembly delivery

goal-trace: "a seat gets its own curated pack pushed, never chooses scope → the OwnPack is composed mechanically from index reads and pushed at dispatch → the own-pack capability"
vertical: RETR (scope-unit projects an own tool · OwnPack pre-composed zero-assembly, mechanically from index reads, no LLM, no free prose, capped · drill-down affordances · seat receives its own by default · grounding source by unit level · epic not a grounded unit → own*epic composed from goal + feature packs · dedup against co-injected pack) — demoable: a seat receives own*<unit> at dispatch with drill-down; an epic's own is composed from goal + feature OwnPacks
reqs: [ REQ-RETR-12a, REQ-RETR-12b, REQ-RETR-12c, REQ-RETR-12d, REQ-RETR-12e, REQ-RETR-12f, REQ-RETR-12g, REQ-RETR-12h, REQ-RETR-12i, REQ-RETR-12j, REQ-RETR-12l, REQ-RETR-12k ]
campaign: CAMPAIGN-6

### EPIC-21 — poke: debounced scope-change navigation

goal-trace: "the atlas follows a seat's real navigation without thrashing → a settled single-file scope-change fires one poke and exposes the scope's node-tools → the navigation capability"
vertical: RETR (poke source is the tool-call hook · single-file call is navigation, multi-file Grep/Glob & Bash-path suppressed · scope-entry fires an unasked poke only after debounce settles · transient crossings never poke · at most once per scope per session · expose only current-scope nodes as tools, retract on leave, never project the whole graph) — demoable: open a file, a poke injects its pack after debounce; a transient crossing does not poke; leaving retracts the node-tools
reqs: [ REQ-RETR-4a, REQ-RETR-4b, REQ-RETR-4c, REQ-RETR-4d, REQ-RETR-4e, REQ-RETR-4f, REQ-RETR-4g, REQ-RETR-4h, REQ-RETR-4i, REQ-RETR-5a, REQ-RETR-5b, REQ-RETR-5c ]
campaign: CAMPAIGN-6

### EPIC-22 — injection ceiling & drop-by-hit-rate

goal-trace: "a turn never overflows and the pins never drop → injection is capped and overflow drops least-used kinds first, sparing T0/safetyCritical → the injection-budget capability"
vertical: RETR (injection ceiling per turn · drop by hit-rate on overflow · two pins never drop · cold-start default drop order · ledger-driven reorder once data exists · per-kind drop-counter ledgered · stale pack not trusted / re-grounded / stale==a backing drifted) → TOOLS (auto-inject a fresh pack at phase transition, push needs no grant, mid-task pull not load-bearing) — demoable: overflow drops droppable kinds by hit-rate while constitution(T0)+safetyCritical stay; a phase transition auto-injects a fresh pack
reqs: [ REQ-RETR-6a, REQ-RETR-6b, REQ-RETR-6c, REQ-RETR-6d, REQ-RETR-6e, REQ-RETR-6f, REQ-RETR-3a, REQ-RETR-3b, REQ-RETR-3c, REQ-TOOLS-14a, REQ-TOOLS-14b, REQ-TOOLS-14c ]
campaign: CAMPAIGN-6

### EPIC-23 — Knowledge≠Memory boundary & injection-scoping

goal-trace: "a seat's private experience never masquerades as grounded truth → Memory injects only own, is scoped not access-controlled, and never crosses into Knowledge → the boundary capability"
vertical: MEM (inject only own Memory · scoping not access control · no Memory-as-Knowledge · no Knowledge-as-Memory · consultable never auto-injects · consultable only via explicit recall) — demoable: a seat consults its own Memory but it is not injected into another seat's turn-header; Memory contradicting Knowledge yields to Knowledge
reqs: [ REQ-MEM-1a, REQ-MEM-1b, REQ-MEM-2a, REQ-MEM-2b, REQ-MEM-4a, REQ-MEM-4b ]
campaign: CAMPAIGN-6

### EPIC-24-a — Awareness slab (derived, memoized)

goal-trace: "every seat orients from one grounded, identical Awareness slab → Awareness is assembled from the Atlas root, grounded, capped, and byte-identical → the Awareness data slab"
vertical: MEM (Awareness assembled from Atlas root · each facet grounded & drift-checked · top tier only within cap · ontology from curated definition nodes · absent source renders UN-SEEDED · never hand-written · byte-identical across members · tail pull-reachable · no generic-card substitute · facet cached on its own source hash · assembled once per root-state) — demoable: two seats get a byte-identical Awareness slab; a moved facet source re-rolls only that facet; a missing source renders UN-SEEDED, never fabricated
reqs: [ REQ-MEM-11a, REQ-MEM-11b, REQ-MEM-11c, REQ-MEM-11d, REQ-MEM-11e, REQ-MEM-11f, REQ-MEM-11g, REQ-MEM-11h, REQ-MEM-11i, REQ-MEM-12a, REQ-MEM-12b ]
campaign: CAMPAIGN-6
split: Data (the Awareness slab) from EPIC-24

### EPIC-24-b — Orientation slab (incremental fold)

goal-trace: "a seat always sees current goal & state without a manual write → Orientation folds incrementally from DEFINE + the event log, byte-identical, capped → the Orientation data slab"
vertical: MEM (Orientation goal from DEFINE · state as event-log fold · injected byte-identically · within token cap · never a written entry · Orientation is an incremental fold) — demoable: a milestone appends to the event log and every member's injected Orientation reflects new state, byte-identical, with no manual write
reqs: [ REQ-MEM-6a, REQ-MEM-6b, REQ-MEM-6c, REQ-MEM-6d, REQ-MEM-6e, REQ-MEM-12c ]
campaign: CAMPAIGN-6
split: Data (the Orientation slab) from EPIC-24

### EPIC-25-a — project Rules-slab by frecency

goal-trace: "the injected rules are the currently-earning ones, not old-popular pins → the Rules-slab is top-12 by frecency, evicting at near-zero, never deleting → the Rules-slab rules"
vertical: MEM (injected project memory capped · over-cap write rejected · hit counts only on a cited rule-id · injected set top-12 by frecency · evict at near-zero frecency · no slot pinned by an old-popular rule · evicted entries retained & re-spawnable · memory never deleted) — demoable: a rule whose frecency decays to ~0 is evicted from the injected set into the archive, never deleted
reqs: [ REQ-MEM-3a, REQ-MEM-3b, REQ-MEM-7a, REQ-MEM-7b, REQ-MEM-7c, REQ-MEM-7d, REQ-MEM-7e, REQ-MEM-7f ]
campaign: CAMPAIGN-6
split: Rules (the frecency/eviction rules) from EPIC-25

### EPIC-25-b — logbook: templated, capped, consultable

goal-trace: "the wave's narrative is a bounded, orchestrator-only record → the logbook is one append-only, capped-section entry per PR, consultable never injected → the logbook rules"
vertical: MEM (untemplated write rejected · logbook prose bounded to sections · orchestrator-only · one append-only entry per PR · fills capped fixed sections · consultable never injected · supersede by link not rewrite) — demoable: the orchestrator appends one capped logbook entry per PR, consultable by prId/date/territory, never injected; a correction supersedes by link
reqs: [ REQ-MEM-5a, REQ-MEM-5b, REQ-MEM-8a, REQ-MEM-8b, REQ-MEM-8c, REQ-MEM-8d, REQ-MEM-8e ]
campaign: CAMPAIGN-6
split: Rules (the logbook/templated-write rules) from EPIC-25

### EPIC-26-a — governed write-doors & store integrity

goal-trace: "every write flows through a governed door and back-channel writes cannot surface → the governance surface is five tools with every write through a governed door (WRITE_PATHS = {atlas-emit, atlas-link}, ADR-0003) over a permissioned store → the governed write-door interface"
vertical: TOOLS (governance surface is exactly five tools · every write flows through a governed door (atlas-emit / atlas-link) · reject back-channel writes · read projections carry no write authority · tools pure and total, malformed fails closed · store medium append-only/permissioned · reads reject ungrounded rows · direct write never surfaces as a served fact) — demoable: a direct store write bypassing a governed door is rejected and never surfaces; a read projection cannot write
reqs: [ REQ-TOOLS-1a, REQ-TOOLS-1b, REQ-TOOLS-1c, REQ-TOOLS-1d, REQ-TOOLS-1e, REQ-TOOLS-2a, REQ-TOOLS-2b, REQ-TOOLS-15a, REQ-TOOLS-15b, REQ-TOOLS-15c ]
campaign: CAMPAIGN-7
split: Interface (the write-door facet) from EPIC-26

### EPIC-26-b — CLI/MCP parity, guidance & read-only doctor

goal-trace: "the same contract holds across surfaces and diagnosis never writes → CLI and MCP share one schema, every result carries guidance, and doctor is advisory-only → the parity/ops interface"
vertical: TOOLS (CLI and MCP parity on one schema, must not diverge · every result carries guidance · doctor is read/advisory only, never persists, carries no write authority) — demoable: run a command via CLI and MCP and get contract-identical results; atlas doctor diagnoses read-only, any write funnels through emit
reqs: [ REQ-TOOLS-3a, REQ-TOOLS-3b, REQ-TOOLS-4, REQ-TOOLS-12a, REQ-TOOLS-12b, REQ-TOOLS-12c ]
campaign: CAMPAIGN-7
split: Interface (the parity/ops facet) from EPIC-26

### EPIC-26-c — tri-transport addressability & spawn ladder

goal-trace: "a node is callable three ways with one contract and honest degradation → tri-transport addressability plus a native-first spawn ladder that reports its tier → the transport interface"
vertical: TOOLS (node addressable over three transports · transports must not diverge in contract · add no write path · CLI unscoped · never force a seat to the CLI · push reaches a seat with no grant · pull resolves down the native-first ladder · one handler/contract per tier · SDK in-process spawn · down-rank pulls when MCP unavailable · never silently fall through · report the tier actually started on) — demoable: call a node via MCP, poke, and CLI with identical contract; with MCP unavailable the spawn ladder down-ranks and reports the tier it started on
reqs: [ REQ-TOOLS-10a, REQ-TOOLS-10b, REQ-TOOLS-10c, REQ-TOOLS-10d, REQ-TOOLS-11-a, REQ-TOOLS-11-b, REQ-TOOLS-11-c, REQ-TOOLS-11-d, REQ-TOOLS-11a-a, REQ-TOOLS-11a-b, REQ-TOOLS-11a-c, REQ-TOOLS-11a-d ]
campaign: CAMPAIGN-7
split: Interface (the transport facet) from EPIC-26

### EPIC-27 — move-in: deterministic $0-LLM skeleton

goal-trace: "an atlas seeds itself the day it is installed, at zero LLM cost → atlas-init returns a structural skeleton + blast radius + flags via deterministic PPR ranking → the move-in capability"
vertical: TOOLS (move-in $0-LLM & structural · atlas-init returns skeleton/blast/flags · never set a tier above T2 · never auto-promote a T0 · heuristics only flag) → GEN (deterministic $0-LLM S0/S1, re-run reproduces skeleton & ranking · cost tracks frontier not size, un-churned raises no spend · every stage binds a structural mechanism, no embeddings/ANN · deterministic PPR, no model/randomness, reproduces across machines · degenerate history falls back to structural centrality) — demoable: run atlas-init on a fresh repo, get a reproducible skeleton + blast radius at $0 LLM; a repo with no git history degrades to structural centrality
reqs: [ REQ-TOOLS-5a, REQ-TOOLS-5b, REQ-TOOLS-5c, REQ-TOOLS-5d, REQ-TOOLS-5e, REQ-GEN-1a, REQ-GEN-1b, REQ-GEN-1c, REQ-GEN-3a, REQ-GEN-3b, REQ-GEN-10a, REQ-GEN-10b, REQ-GEN-11a, REQ-GEN-11b, REQ-GEN-11c, REQ-GEN-15a, REQ-GEN-15b, REQ-GEN-15c ]
campaign: CAMPAIGN-8

### EPIC-28-a — budgeted, grounded LLM proposal

goal-trace: "the LLM spends only where it earns, on grounded candidates → spend is highest-first under a hard ceiling and every seed passes the grounded truth door and carries an obviousness score → the budgeted-proposal route"
vertical: GEN (no LLM on un-ranked sites · spend highest-first · one bounded call per site · hard budget ceiling · marginal-value halt · no repo-wide sweep · grounded by subtreeHash · pass the truth door · carry an obviousness score · reject the ungrounded, never the obvious · no self-declared truth · signals only as ranking heuristics, a signal is not a fact until grounded, churn alone mints no fact) — demoable: run genesis under a budget, LLM fires only on ranked sites highest-first and halts at marginal value; a churn signal alone mints no fact
reqs: [ REQ-GEN-2a, REQ-GEN-2b, REQ-GEN-2c, REQ-GEN-2d, REQ-GEN-2e, REQ-GEN-2f, REQ-GEN-4a, REQ-GEN-4b, REQ-GEN-4c, REQ-GEN-4d, REQ-GEN-6a, REQ-GEN-6b, REQ-GEN-6c ]
campaign: CAMPAIGN-8
split: Rules (the budgeted-proposal route) from EPIC-28

### EPIC-28-b — mechanical admission with teeth

goal-trace: "the LLM proposes but never admits → admission is mechanical, predicates admitted only on a HOLDS check, and vacuous checks are dropped by teeth → the admission-teeth route"
vertical: GEN (LLM only proposes in S2 · admission is mechanical · predicate admitted only if check HOLDS · failing check refined then dropped · advisory passes two doors · chain-of-thought never persisted · abstention valid, no pressure to emit · labelled likely-invariant not proof · teeth drop vacuous check · sound oracle first) — demoable: a proposed predicate is admitted only when its check HOLDS-current AND flips-BROKEN-on-a-mutant; a tautological check is dropped; abstention is a valid outcome
reqs: [ REQ-GEN-12a, REQ-GEN-12b, REQ-GEN-12c, REQ-GEN-12d, REQ-GEN-12e, REQ-GEN-12f, REQ-GEN-12g, REQ-GEN-12h, REQ-GEN-12i, REQ-GEN-12j, REQ-GEN-12k ]
campaign: CAMPAIGN-8
split: Rules (the admission-teeth route) from EPIC-28

### EPIC-28-c — tiered escalation defaults (cheap-by-default)

goal-trace: "extra verification machinery stays off until value & uncertainty justify it → base tier runs one sample, advisory, CEGIS K≤1, refuter for T0 only → the escalation-defaults route"
vertical: GEN (extra mechanisms off at base tier · escalate only on value & uncertainty · default one sample · default advisory unless checkable · default CEGIS K≤1 · refuter only for T0 · Semgrep before CodeQL · query DB built once · no whole-repo pass · scopable to a subtree · report cost per stage) — demoable: base-tier genesis runs a single sample and stays scopable to a subtree; only a T0 target escalates to the refuter, with per-stage cost reported
reqs: [ REQ-GEN-13a, REQ-GEN-13b, REQ-GEN-13c, REQ-GEN-13d, REQ-GEN-13e, REQ-GEN-13f, REQ-GEN-13g, REQ-GEN-13h, REQ-GEN-13i, REQ-GEN-13j, REQ-GEN-13k ]
campaign: CAMPAIGN-8
split: Rules (the escalation-defaults route) from EPIC-28

### EPIC-29 — candidate-only writes, batched ratification, Awareness sources

goal-trace: "genesis proposes, never promotes, and seeds the Awareness facets → it writes only candidates for batched human ratification and creates (never fabricates) Awareness sources → the seed-and-hand-off capability"
vertical: GEN (write only candidates · batched human ratification · never auto-promote · never one question at a time · create Awareness sources · source-less facet is UN-SEEDED · never fabricate a facet · mission stub stays unratified) — demoable: genesis produces a batch of candidates for one ratification pass and seeds Awareness sources; a source-less facet renders UN-SEEDED and the mission stub stays unratified
reqs: [ REQ-GEN-5a, REQ-GEN-5b, REQ-GEN-5c, REQ-GEN-5d, REQ-GEN-9a, REQ-GEN-9b, REQ-GEN-9c, REQ-GEN-9d ]
campaign: CAMPAIGN-8

### EPIC-30 — genesis resume, robustness & born-from-work hand-off

goal-trace: "a killed genesis run resumes honestly and hands the cold tail to born-from-work → it resumes from the last site, degrades to a partial skeleton, and re-runs idempotently → the resume/hand-off capability"
vertical: GEN (hand off to born-from-work · idempotent re-run upsert · incremental re-run · resume from last site · malformed yields partial skeleton · never throw) — demoable: interrupt a genesis run and resume from the last completed site; a malformed rev yields an honest partial skeleton + resumeToken, never a throw; re-run upserts incrementally
reqs: [ REQ-GEN-7a, REQ-GEN-7b, REQ-GEN-7c, REQ-GEN-8a, REQ-GEN-8b, REQ-GEN-8c ]
campaign: CAMPAIGN-8

### EPIC-31 — the three governed deepening loops

goal-trace: "deepening a scope never changes the default cost or adds a subsystem → REVIEW/ENRICH/EXPAND are opt-in, budget-gated, fixpoint-stopping and reuse existing machinery → the governed-loops capability"
vertical: GEN (loops opt-in or default-shallow · budget-gated · carry a fixpoint stop · no unbounded loop · loops-off equals single pass · reuse existing machinery · no new subsystem · no duplicate lazy enrichment) — demoable: run a deepening loop; it stops at budget or fixpoint, and with loops off behaves exactly as a single pass with no new subsystem
reqs: [ REQ-GEN-14a, REQ-GEN-14b, REQ-GEN-14c, REQ-GEN-14d, REQ-GEN-14e, REQ-GEN-14f, REQ-GEN-14g, REQ-GEN-14h ]
campaign: CAMPAIGN-8

### EPIC-32 — atlas-diff (version-delta projection)

goal-trace: "a steward can see exactly what changed between two atlas versions → the delta is a deterministic read-only fold-comparison partitioned by lifecycle, each fact carrying its provenance → the version-delta projection"
vertical: PERSIST (version-delta = deterministic read-only fold-diff · partitions facts into added/edited/superseded/decayed each with provenance · 0 mutation · byte-identical across runs · well-defined regardless of fold/event order) → TOOLS (atlas-diff surfaces the delta as a read-only projection · CLI=MCP · adds no write path · governance write surface stays the two governed doors {atlas-emit, atlas-link}) — demoable: `atlas-diff shaA shaB` lists added/edited/superseded/decayed facts with provenance, read-only, identical over CLI and MCP
reqs: [ REQ-PERSIST-14-a, REQ-PERSIST-14-b, REQ-PERSIST-14-c, REQ-PERSIST-14-d, REQ-PERSIST-14-e, REQ-PERSIST-14-f, REQ-TOOLS-16a, REQ-TOOLS-16b, REQ-TOOLS-16c, REQ-TOOLS-16d, REQ-TOOLS-16e ]
campaign: CAMPAIGN-7

### CAMPAIGN-1 — the CAS + merge + persistence floor

epics: [ EPIC-1-a, EPIC-1-b, EPIC-2-a, EPIC-2-b, EPIC-3-a, EPIC-3-b ]
prerequisites: [ ]
horizon: Now

### CAMPAIGN-2 — the structural index substrate

epics: [ EPIC-6, EPIC-7-a, EPIC-7-b, EPIC-8-a, EPIC-8-b, EPIC-9-a, EPIC-9-b ]
prerequisites: [ ]
horizon: Now

### CAMPAIGN-3 — provenance, transcript & re-spawn durability

epics: [ EPIC-4-a, EPIC-4-b, EPIC-5-a, EPIC-5-b ]
prerequisites: [ CAMPAIGN-1 ]
horizon: Next

### CAMPAIGN-4 — grounding & the truth-gate

epics: [ EPIC-10-a, EPIC-10-b, EPIC-11-a, EPIC-11-b, EPIC-12-a, EPIC-12-b ]
prerequisites: [ CAMPAIGN-1, CAMPAIGN-2 ]
horizon: Next

### CAMPAIGN-5 — knowledge write-decision & lifecycle

epics: [ EPIC-13-a, EPIC-13-b, EPIC-14, EPIC-15, EPIC-16, EPIC-17 ]
prerequisites: [ CAMPAIGN-4 ]
horizon: Next

### CAMPAIGN-6 — retrieval, memory & turn-header injection

epics: [ EPIC-18, EPIC-19, EPIC-20, EPIC-21, EPIC-22, EPIC-23, EPIC-24-a, EPIC-24-b, EPIC-25-a, EPIC-25-b ]
prerequisites: [ CAMPAIGN-2, CAMPAIGN-5 ]
horizon: Later

### CAMPAIGN-7 — the governed tool surface & tri-transport

epics: [ EPIC-26-a, EPIC-26-b, EPIC-26-c, EPIC-32 ]
prerequisites: [ CAMPAIGN-3, CAMPAIGN-5, CAMPAIGN-6 ]
horizon: Later

### CAMPAIGN-8 — genesis seeding (the one-time seeder)

epics: [ EPIC-27, EPIC-28-a, EPIC-28-b, EPIC-28-c, EPIC-29, EPIC-30, EPIC-31 ]
prerequisites: [ CAMPAIGN-2, CAMPAIGN-4, CAMPAIGN-5 ]
horizon: Later

## Coverage

partition: 50 leaf epics over the 480 frozen REQs — 480 distinct placements, 480 sum-of-placements ⇒ orphans = 0, doubles = 0, invented = 0 (mechanically verified). Per-module tallies (each fully assigned): KERNEL 30, PERSIST 54, INDEX 57, GROUND 35, KNOW 61, RETR 64, MEM 46, TOOLS 58, GEN 75 = 480. (EPIC-32 adds the 11 `atlas-diff` REQs: PERSIST 48→54 [+REQ-PERSIST-14-a..f], TOOLS 52→57 [+REQ-TOOLS-16a..e]. WP-SAMEAS adds the governed second write door: REQ-TOOLS-1e placed in EPIC-26-a, TOOLS 57→58, ADR-0003.)
split-lineage (SPIDR pattern · lossless union == parent): EPIC-1 = 1-a ∪ 1-b (Path, 14); EPIC-2 = 2-a ∪ 2-b (Path, 17); EPIC-3 = 3-a ∪ 3-b (Path, 19); EPIC-4 = 4-a ∪ 4-b (Path, 13); EPIC-5 = 5-a ∪ 5-b (Path, 23); EPIC-7 = 7-a ∪ 7-b (Data, 17); EPIC-8 = 8-a ∪ 8-b (Path, 24); EPIC-9 = 9-a ∪ 9-b (Rules, 14); EPIC-10 = 10-a ∪ 10-b (Path, 23); EPIC-11 = 11-a ∪ 11-b (Rules, 19); EPIC-12 = 12-a ∪ 12-b (Path, 17); EPIC-13 = 13-a ∪ 13-b (Data/Rules, 19); EPIC-24 = 24-a ∪ 24-b (Data, 17); EPIC-25 = 25-a ∪ 25-b (Rules, 15); EPIC-26 = 26-a ∪ 26-b ∪ 26-c (Interface, 28); EPIC-28 = 28-a ∪ 28-b ∪ 28-c (Rules, 35). Every child is itself vertical and the union re-forms the parent with no leak (parent umbrellas are not re-listed as blocks; their req-sets appear only through the leaf children, so the emitted set is a strict partition). EPIC-32 is a right-sized two-module vertical (PERSIST→TOOLS, 11 REQs), un-split — one WP per module (WP-7.32.PERSIST / WP-7.32.TOOLS), like EPIC-14/15/16/17.
campaign DAG (edges child→prereq, acyclic): CAMPAIGN-3→1; CAMPAIGN-4→1, 4→2; CAMPAIGN-5→4; CAMPAIGN-6→2, 6→5; CAMPAIGN-7→3, 7→5, 7→6; CAMPAIGN-8→2, 8→4, 8→5. Roots = CAMPAIGN-1, CAMPAIGN-2. Topological order = {1,2} → {3,4} → {5} → {6,8} → {7}; no cycle (the new C7→3 edge points back into the already-earlier {3,4} layer — C7 stays in the last layer, still acyclic since C3 has no path to C7).
horizon histogram: Now = 2 (CAMPAIGN-1, CAMPAIGN-2) · Next = 3 (CAMPAIGN-3, CAMPAIGN-4, CAMPAIGN-5) · Later = 3 (CAMPAIGN-6, CAMPAIGN-7, CAMPAIGN-8) — assigned by dependency-readiness depth, not dates.
[NEEDS RECONCILIATION]: none — every REQ joined a vertical capability; no REQ forced a horizontal/module-only epic.
