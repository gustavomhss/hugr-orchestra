# Properties — Block KRN (kernel) · S3-sibling render (∀-laws for the GATE PBT leg)

> **state:** S3-sibling · **protocol:** [`properties-template`](../method/properties-template.md) ·
> **source:** [`method-tags-krn.md`](method-tags-krn.md) (frozen S2 — the `up-property` law of each behavioural INV) ·
> **owner:** charlie (FORGE); formal cluster architecture-reviewed by bobby.
>
> **Purpose:** render each frozen KRN `up-property` into a runnable **∀-quantified property** — the oracle-free,
> beyond-the-witness check that raises a WP from FLOOR toward FULL assurance for the execution GATE's PBT leg.
> **Invents no law:** every `law` is a faithful render of a frozen `up-property`, carried as a `ptr+digest` so an
> upstream edit renders the property STALE. The `differential` leg stays UNAVAILABLE (the `ref/*.ts` mocks were
> scaffold-frozen as pure-type interfaces, zero runtime) and is **subsumed** by this PBT leg — asserted directly
> on the implementation over generated inputs. Formal-cluster laws (KERNEL-9/10/11) are transcribed **verbatim**
> from [`../spec/fspec-merge.md`](../spec/fspec-merge.md) §escalation-ladder, not re-derived.
>
> **Coverage:** all 12 KRN INVs are `behavioural` → 12 PROPs (12/12). Every `gen: PBT` golden's cited law is
> subsumed by PROP-KERNEL-9/10/11; the `gen: conformance` goldens instance PROP-KERNEL-1..8/12.

---

### PROP-KERNEL-1 — identity determinism

inv: INV-KERNEL-1
source: method-tags-krn.md#INV-KERNEL-1 # ptr+digest — the frozen up-property law
law: ∀ x. id(x) ≡ blake3hex(utf8(canonicalForm(x))) ∧ ∀ x,y. canonicalForm(x) ≡ canonicalForm(y) ⟹ id(x) ≡ id(y),
where canonicalForm = RFC8785/JCS subset (sorted keys, NFC, floats-forbidden, one fixed escape);
a canonical-form violation (float / non-NFC / key-order) is rejected — 0 fold divergences.
arbitrary: objects generated as random key-permutations / NFC-equivalent unicode encodings of one canonical
preimage (must collide on id); plus malformed variants (embedded float, non-NFC) that must be rejected.
covers_reqs: [ req-krn.md#REQ-KERNEL-1a, req-krn.md#REQ-KERNEL-1b, req-krn.md#REQ-KERNEL-1c ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-1a-1, goldens-krn.md#SCN-KERNEL-1b-1, goldens-krn.md#SCN-KERNEL-1c-1 ]
teeth: breaks-on "a canonicalizer that skips the key-sort — arbitrary key-permutations of one preimage hash to distinct ids (the lone b,a witness cannot cover all permutations)"

### PROP-KERNEL-2 — encoder substitution

inv: INV-KERNEL-2
source: method-tags-krn.md#INV-KERNEL-2 # ptr+digest
law: ∀ non-digest contract test t, ∀ digest fn d ∈ {blake3, sha256, stub}. result(t | encoder=d) ≡ result(t | encoder=blake3)
(only the digest bytes / id strings may differ); ∧ hash(bytes | unconfigured seam) ≡ blake3hex(bytes).
arbitrary: pairs (contract test drawn from {identity-determinism, set-union, fold-round-trip, export}, digest fn
drawn from {blake3, sha256, stub}) exercised through the `@orchestra/kernel` encoder seam.
covers_reqs: [ req-krn.md#REQ-KERNEL-2a, req-krn.md#REQ-KERNEL-2b, req-krn.md#REQ-KERNEL-2c ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-2a-1, goldens-krn.md#SCN-KERNEL-2b-1, goldens-krn.md#SCN-KERNEL-2c-1 ]
teeth: breaks-on "a non-digest contract (e.g. fold-round-trip) that depends on the encoder — the swap blake3→sha256 breaks it, which a single blake3-only witness never exercises"

### PROP-KERNEL-3 — single-store totality

inv: INV-KERNEL-3
source: method-tags-krn.md#INV-KERNEL-3 # ptr+digest
law: ∀ x ∈ {structural node, Knowledge fact, Memory entry}. get(hash(x)) ≡ x ∧ storeCount(cas) ≡ 1
(every kind resolves through exactly one `Cas = Map<Hash,CasObject>`; no second, non-content-addressed store).
arbitrary: random-length mixed sequences of the three CasObject kinds, each `put` then fetched by its own hash.
covers_reqs: [ req-krn.md#REQ-KERNEL-3a, req-krn.md#REQ-KERNEL-3b ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-3a-1, goldens-krn.md#SCN-KERNEL-3b-1 ]
teeth: breaks-on "a kind (e.g. Memory) routed to a second, non-CAS side-store keyed by an insertion counter — store-count becomes 2 and get(hash(x)) misses; the fixed 1-of-each witness cannot cover arbitrary kind-mixes"

### PROP-KERNEL-4 — append-only monotonicity

inv: INV-KERNEL-4
source: method-tags-krn.md#INV-KERNEL-4 # ptr+digest
law: ∀ log L, ∀ append op. size(L') ≥ size(L) ∧ ∀ id ∈ L, mutate(id,·) ∨ delete(id) ⟹ rejected ∧ bytes(event id) unchanged
(log length non-decreasing; an extant event is never mutated or deleted in place — a correction is a new event).
arbitrary: random sequences of {append, attempted-mutate(extant id), attempted-delete(extant id)} operations.
covers_reqs: [ req-krn.md#REQ-KERNEL-4a, req-krn.md#REQ-KERNEL-4b ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-4a-1, goldens-krn.md#SCN-KERNEL-4b-1 ]
teeth: breaks-on "a log that compacts/truncates in place (size drops) or accepts an in-place mutate (an event's bytes overwritten under its id) — only caught over arbitrary op-sequences, not the fixed 3-append witness"

### PROP-KERNEL-5 — fold round-trip

inv: INV-KERNEL-5
source: method-tags-krn.md#INV-KERNEL-5 # ptr+digest
law: ∀ log L. serialize(fold(import(export(L)))) ≡ serialize(fold(L)) ∧ ∀ query q. answer(q | in-mem snapshot) ≡ answer(q | pure replay fold(EventLog))
(AtlasState = pure reduction over the set; no capability depends on a mutable in-place snapshot, A-11).
arbitrary: random event logs (RefLog); queries answered before and after discarding the in-memory snapshot.
covers_reqs: [ req-krn.md#REQ-KERNEL-5a, req-krn.md#REQ-KERNEL-5b ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-5a-1, goldens-krn.md#SCN-KERNEL-5b-1 ]
teeth: breaks-on "a fold that seeds from a cached mutable snapshot — replay-from-empty omits a late event and diverges from the original AtlasState; only surfaced over arbitrary logs + snapshot-drop"

### PROP-KERNEL-6 — portability

inv: INV-KERNEL-6
source: method-tags-krn.md#INV-KERNEL-6 # ptr+digest
law: ∀ cas C. deepEqual(C, import(export(C))) ∧ export(C) contains 0 of {host path, external reference, proprietary encoding}
(open-JSON dump replays 1:1 into a fresh store; self-contained, host-independent, A-8).
arbitrary: random CAS contents (mixes of node / Knowledge fact / Memory entry), round-tripped through export→import.
covers_reqs: [ req-krn.md#REQ-KERNEL-6a, req-krn.md#REQ-KERNEL-6b ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-6a-1, goldens-krn.md#SCN-KERNEL-6b-1 ]
teeth: breaks-on "an export that omits the version map (loses entries so import ≠ cas) or embeds an absolute host path — the dump no longer replays on another machine; caught only over arbitrary CAS contents"

### PROP-KERNEL-7 — totality (no-throw)

inv: INV-KERNEL-7
source: method-tags-krn.md#INV-KERNEL-7 # ptr+digest
law: ∀ entry point f, ∀ input i ∈ arbitrary ∪ malformed. f(i) returns a `Result` | honest-empty (undefined) ∧ f(i) never throws (0 exceptions).
arbitrary: corner-biased PBT-fuzz stream of arbitrary + malformed inputs (deeply-nested, wrong-typed, non-NFC),
invoked against every entry point (the 10k-case fuzz behind SCN-KERNEL-7a-1).
covers_reqs: [ req-krn.md#REQ-KERNEL-7a, req-krn.md#REQ-KERNEL-7b ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-7a-1, goldens-krn.md#SCN-KERNEL-7b-1 ]
teeth: breaks-on "a non-total path that throws a TypeError on a deeply-nested-but-valid input — reachable only by a fuzzer over the arbitrary input space, never by a single hand-picked malformed witness"

### PROP-KERNEL-8 — identity stability

inv: INV-KERNEL-8
source: method-tags-krn.md#INV-KERNEL-8 # ptr+digest
law: ∀ obj x, ∀ perturbation p of {grounding, status, freshness}. id(perturb(x,p)) ≡ id(x) ∧ canonicalForm(x) contains no {grounding, status, freshness} bytes
(the mutable side-indexes are excluded from the canonical preimage — 0 perturbation of the Hash).
arbitrary: objects with randomly populated side-index values, then randomly re-perturbed grounding/status/freshness.
covers_reqs: [ req-krn.md#REQ-KERNEL-8a, req-krn.md#REQ-KERNEL-8b ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-8a-1, goldens-krn.md#SCN-KERNEL-8b-1 ]
teeth: breaks-on "a preimage that leaks a side-index (e.g. status) — recomputing it re-keys the object; only exposed when arbitrary side-index perturbations are applied, not one fixed recompute"

### PROP-KERNEL-9 — idempotent content-keyed set-union (FSPEC-merge · verbatim)

inv: INV-KERNEL-9
source: method-tags-krn.md#INV-KERNEL-9 # ptr+digest
law: # transcribed verbatim from fspec-merge.md §UP KERNEL-9 + §escalation-ladder (idempotent / seq-invariant)
idempotent : append(append(L,e),e) ≡ append(L,e) ; merge(a,a) ≡ a
identity : id(e) = hash(canonical(e)) (seq EXCLUDED from the preimage)
set-union : merge = set-union on the id
seq-invariant: ∀ seq'. keyset(reseq(L,seq')) ≡ keyset(L) ∧ fold(reseq(L,seq')) ≡ fold(L)
arbitrary: random event sets (RefLog) with duplicate re-appends; reseq relabelings (e ↦ any seq'); log pairs for
merge; and genuine cross-writer same-`seq` / distinct-content events.
covers_reqs: [ req-krn.md#REQ-KERNEL-9a, req-krn.md#REQ-KERNEL-9b, req-krn.md#REQ-KERNEL-9c, req-krn.md#REQ-KERNEL-9d, req-krn.md#REQ-KERNEL-9e ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-9a-1, goldens-krn.md#SCN-KERNEL-9b-1, goldens-krn.md#SCN-KERNEL-9c-1, goldens-krn.md#SCN-KERNEL-9d-1, goldens-krn.md#SCN-KERNEL-9e-1 ]
teeth: breaks-on "a seq-keyed identity (colliding `seq` collapses two distinct events to one slot) or a non-idempotent append (unconditional insert duplicates an event) — refuted only over arbitrary sets + reseqs, not the fixed witnesses"

### PROP-KERNEL-10 — deterministic order-independent union + contentHash-alone tie-break (FSPEC-merge · verbatim)

inv: INV-KERNEL-10
source: method-tags-krn.md#INV-KERNEL-10 # ptr+digest
law: # transcribed verbatim from fspec-merge.md §UP KERNEL-10 + §escalation-ladder (commutative / no-drop / head-tiebreak)
commutative : mergeNode(x,y) ≡ mergeNode(y,x)
grow-only : x ⊑ mergeNode(x,y) ∧ |entries(mergeNode(x,y))| ≥ max(|x|,|y|) (0 dropped)
head-tiebreak: head(n) = max-by-contentHash among the FRESH ∧ ¬superseded entries — `contentHash` ALONE
(never seq / clock / LLM); reseq/reclock leaves head unchanged
arbitrary: random Node pairs on one nodeKey (varied contentHash values, fresh / superseded flags), plus reseq and
reclock perturbations applied before forcing head(node).
covers_reqs: [ req-krn.md#REQ-KERNEL-10a, req-krn.md#REQ-KERNEL-10b, req-krn.md#REQ-KERNEL-10c ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-10a-1, goldens-krn.md#SCN-KERNEL-10b-1, goldens-krn.md#SCN-KERNEL-10c-1 ]
teeth: breaks-on "last-writer-wins overwrite in mergeNode (drops an entry), a min-flipped tie-break (head flips to the smaller contentHash), or a clock/seq-reading head (nondeterministic across reclock/reseq runs)"
note: [NEEDS RECONCILIATION: min-vs-max head direction] — the frozen KERNEL-10 up-property fixes the tie-break to
`contentHash` alone but is silent on min vs max. This render follows the FSPEC's pinned `max` (fspec-merge.md
§UP KERNEL-10, `head()` sort). The FSPEC already flags this as an open item routed to DEFINE (the KERNEL-10
reference clause should absorb the `max` direction upstream). Surfaced, not invented here.

### PROP-KERNEL-11 — convergent commutative fold (strong eventual consistency) (FSPEC-merge · verbatim)

inv: INV-KERNEL-11
source: method-tags-krn.md#INV-KERNEL-11 # ptr+digest
law: # transcribed verbatim from fspec-merge.md §UP KERNEL-11 + §escalation-ladder (convergence / associative / commutative)
convergence : fold(π(S)) ≡ fold(S) for every set-preserving permutation / re-batch / branch-union π
(equivalently fold(shuffle(S)) ≡ fold(S))
associative : merge(merge(a,b),c) ≡ merge(a,merge(b,c))
commutative : merge(a,b) ≡ merge(b,a)
byte-identity: serialize(fold(·)) under the KERNEL-1 canonicalizer (sorted keys) is equal across all orderings
arbitrary: random event sets S with colliding nodeKeys; random permutations, re-batchings, and branch-union
partitions of the SAME set S, each serialized and compared byte-for-byte.
covers_reqs: [ req-krn.md#REQ-KERNEL-11 ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-11-1 ]
teeth: breaks-on "mergeNode overwriting instead of unioning (last-writer-wins) — a reversed / re-batched delivery of the same set resolves a colliding node to a different head, so the AtlasStates diverge byte-wise; only the ∀-permutation quantifier catches it beyond the 3-way witness"

### PROP-KERNEL-12 — safe-degrade line-merge

inv: INV-KERNEL-12
source: method-tags-krn.md#INV-KERNEL-12 # ptr+digest
law: ∀ branch JSONL logs a,b. lineMerge(a,b) = dedup-by-id(lines(a) ∪ lines(b)) ∧ no event's bytes are spliced into another
∧ fold(lineMerge(a,b)) ≡ fold(RefLog.merge(a,b)) (worst case a harmless duplicate line the fold dedups by id);
∧ ∀ line L in the log. RefLog.id(parse(L)) ≡ parse(L).id (append-only, one content-keyed event per line).
arbitrary: random branch JSONL log pairs (ours / theirs) with shared + disjoint events, merged by a plain line-union.
covers_reqs: [ req-krn.md#REQ-KERNEL-12b, req-krn.md#REQ-KERNEL-12c ] # ptr+digest
witness: [ goldens-krn.md#SCN-KERNEL-12b-1, goldens-krn.md#SCN-KERNEL-12c-1 ]
teeth: breaks-on "a single-blob / nested-array log form — a 3-way text merge splices two events into one corrupt line and fold fails to parse (an event is lost); caught only over arbitrary branch-log pairs"
note: the self-install arm (REQ-KERNEL-12a) has NO pure-function oracle (method-tags-krn.md §INV-KERNEL-12) — it is
out of ∀-property scope by construction and is verified as the PERSIST-11 integration test (fresh clone re-registers
`merge=orchestra-atlas` + the `.gitattributes` entry). Documented boundary, not an invented property.

---

## Self-check

- [x] one PROP block per rendered law, each conforming to the template card.
- [x] every behavioural INV → ≥1 PROP: **12/12** (INV-KERNEL-1..12; all behavioural, none `n/a`).
- [x] every PROP `source` resolves to a real `### INV-KERNEL-<n>` anchor in `method-tags-krn.md`.
- [x] formal-cluster laws (KERNEL-9/10/11) transcribed **verbatim** from `fspec-merge.md` §UP + §escalation-ladder.
- [x] every `gen: PBT` golden's law present: 9a/9b/9c/9d/9e ⊂ PROP-9 · 10a/10b/10c ⊂ PROP-10 · 11-1 ⊂ PROP-11 (seed subsumed).
- [x] no PROP contradicts its `witness` (head-rule = MAX-by-contentHash, consistent with goldens' head-rule provenance note).
- [x] `teeth` names a mutant each property kills beyond its single witness.
- [ ] open flag carried, not resolved here: PROP-KERNEL-10 `[NEEDS RECONCILIATION: min-vs-max head direction]` (echoes the FSPEC's own DEFINE-routed open item).
