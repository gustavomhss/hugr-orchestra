# Method-tags — Block KRN (kernel) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-krn.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE); formal-merge core architecture-reviewed by bobby.
>
> One tag per **behavioural** INV by the 3-conjunct rule. The KRN block carries the **one** `formal` cluster in
> the whole Atlas — the `FSPEC-merge` core (KERNEL-9/10/11, + PERSIST-11 as the persistence-side consumer).
> Everything else is `reference-model` per the ratified baseline — a feature, not a compromise. All 12 KRN
> invariants are `behavioural` (register), so none carries `n/a`.

---

### INV-KERNEL-1

method-tag: reference-model
fspec: —
up-property: "identity determinism: a byte-identical canonical preimage yields an identical Hash; a canonical-form violation (float / non-NFC / key-order) fails the CI corpus and never forks the fold (0 divergences)"
down-model: "canonicalForm(obj)=RFC8785/JCS subset (sorted keys, NFC, floats-forbidden, one fixed escape) ⇒ id=blake3hex(utf8(canonicalForm)); the reference canonicalizer is the mock, differential-tested against the language-agnostic test-vector corpus in CI"
anti-rot: `kernel/ref/canonical.ts` (the reference canonicalizer) is imported as the mock in the encoder unit tests; the build breaks if a code encoder drifts from it or from the corpus.

### INV-KERNEL-2

method-tag: reference-model
fspec: —
up-property: "encoder substitution: swapping the digest function behind the `@orchestra/kernel` seam changes only the digest bytes — no other contract observably changes; default resolves to BLAKE3"
down-model: "Encoder={hash(bytes:Uint8Array):Hash}; the reference kernel is parametrized by the seam fn; a unit test swaps blake3↔sha256 and asserts every non-digest contract test still passes"
anti-rot: `kernel/ref/encoder.ts` (the seam-parametrized reference) is the mock; contract tests run against it with a stub digest so drift in the seam contract breaks the build.

### INV-KERNEL-3

method-tag: reference-model
fspec: —
up-property: "single-store totality: every CasObject kind (structural node / Knowledge fact / Memory entry) resolves through exactly one CAS map; no second, non-content-addressed store exists (0)"
down-model: "Cas=Map<Hash,CasObject>; the reference store exposes exactly one map and routes put/get for all kinds through it; the mock asserts store-count==1"
anti-rot: `kernel/ref/store.ts` is the mock; any code path that introduces a second store fails the store-count assertion in the shared unit test.

### INV-KERNEL-4

method-tag: reference-model
fspec: —
up-property: "append-only monotonicity: log length is non-decreasing; an existing event is never mutated or deleted in place (a correction is a new event)"
down-model: "EventLog as an insert-only Map<Hash,Event>; the reference `append` rejects mutate/delete of an extant id; the mock exposes a monotone `size`"
anti-rot: `kernel/ref/log.ts` (insert-only) is the mock reused by the log unit tests; a mutate/delete path fails against it.

### INV-KERNEL-5

method-tag: reference-model
fspec: —
up-property: "fold round-trip: `fold(export→import→log)` rebuilds a byte-identical AtlasState; no capability depends on a mutable in-place snapshot (A-11)"
down-model: "AtlasState=fold(EventLog), a pure reduction over the set; a round-trip test does export→import→fold and asserts byte-identity with the original"
anti-rot: the reference `fold` (`kernel/ref/fold.ts`, shared with the FSPEC-merge reducer) is the mock; snapshot-dependent code diverges from it and breaks the round-trip test.

### INV-KERNEL-6

method-tag: reference-model
fspec: —
up-property: "portability: `export → import` yields a byte-identical CAS with no proprietary encoding, no external reference, and no host dependency (A-8)"
down-model: "export():string open-JSON CAS dump; import replays 1:1; a unit test asserts deepEqual(cas, import(export(cas))) and greps the dump for 0 host/external refs"
anti-rot: `kernel/ref/portable.ts` ((de)serializer) is the mock; a lock-in encoding drift fails the round-trip equality.

### INV-KERNEL-7

method-tag: reference-model
fspec: —
up-property: "totality: every kernel entry point returns a structured rejection or an honest empty result on malformed input and never throws (0 exceptions)"
down-model: "the reference kernel is total by construction — entry points return Result / undefined, never throw; the golden generator is PBT-fuzz over arbitrary + malformed inputs asserting no-throw"
anti-rot: the total reference kernel (`kernel/ref/*.ts`) is the mock; PBT fuzzes it and the code side-by-side, so a throwing code path fails the shared no-throw property. _(Note: its golden generator is PBT-fuzz; the tag stays `reference-model` because the total reference IS the oracle — the shape is robustness/totality, not ordering, so it does not earn a standalone `PBT` tag.)_

### INV-KERNEL-8

method-tag: reference-model
fspec: —
up-property: "identity stability: recomputing grounding / status / freshness leaves the object's Hash unchanged — the mutable side-indexes are excluded from the canonical preimage (0 perturbation)"
down-model: "canonicalForm omits {grounding,status,freshness}; the reference computes the preimage then perturbs each side-index and asserts the Hash is invariant"
anti-rot: shares the K1 canonicalizer mock (`kernel/ref/canonical.ts`); a preimage that leaks a side-index re-keys the object and fails the invariance test.

### INV-KERNEL-9

method-tag: formal
fspec: FSPEC-merge
up-property: "idempotent content-keyed set-union: `append` is a set-insert keyed by the event id (re-append of a byte-identical event is a no-op); `merge` is set-union on the id; positional `seq` is never an identity or merge key — colliding `seq` across writers/branches never collides identity"
down-model: "an OR-Set log = a set of event ids + a Map<Hash,Event> version map; append=set-insert, merge=set-union; PBT idempotence (append∘append≡append) + seq-invariance (reassigning `seq` alone leaves the keyset and the fold unchanged)"
anti-rot: the reference OR-Set log (`spec/fspec-merge` §DOWN, `kernel/ref/log.ts`) is the mock reused in the merge unit tests; a seq-keyed or non-idempotent code path breaks against it.

### INV-KERNEL-10

method-tag: formal
fspec: FSPEC-merge
up-property: "deterministic, order-independent set-union with a `contentHash`-alone tie-break: ≥2 events on one `nodeKey` union into one OR-Set node keyed by `contentHash` (0 dropped), identical under either event order; where a single head is forced it is `contentHash` alone — never `seq`, a clock, or an LLM"
down-model: "an OR-Set of ClaimEntry = a set of contentHashes + a version/lineage map; mergeNode = grow-only union (KNOW-4/12); head = max-by-contentHash among the FRESH entries; PBT the union laws + tie-break determinism; escalate to TLC only if supersede+remove proves subtle"
anti-rot: the reference OR-Set node reducer (`spec/fspec-merge` §DOWN) is the mock in the fold-merge unit tests; a drop / clock / LLM tie-break path diverges from it and breaks the build.

### INV-KERNEL-11

method-tag: formal
fspec: FSPEC-merge
up-property: "convergent fold (strong eventual consistency): `fold` is commutative and associative over the event set — any permutation, re-batching, or branch-union of the same set folds to a byte-identical AtlasState (0 order-dependence)"
down-model: "fold = reduce over the set via the per-nodeKey least-upper-bound (join-semilattice, Shapiro'11); PBT commut/assoc/idemp of `merge` + `fold(shuffle(S))≡fold(S)`; TLA+/TLC only for the supersede+remove interleaving, Apalache for an unbounded inductive invariant"
anti-rot: the reference `fold` (`kernel/ref/fold.ts`) is the mock; an order-dependent code fold diverges from it under the shuffle property and breaks the build.

### INV-KERNEL-12

method-tag: reference-model
fspec: —
up-property: "safe-degrade: a plain git default text/line merge of the JSONL log yields a lossless union of both branches' events (a re-fold dedups by id) — 0 corrupted / lost, worst case harmless duplicate lines; the merge driver is self-installing on clone"
down-model: "log = append-only JSONL, one content-keyed event per line; reference lineMerge(a,b)=dedup-by-id(lines(a) ∪ lines(b)); a unit test asserts no event's bytes are ever spliced into another and that re-fold(lineMerge)≡fold(setUnion). The **self-install** arm (REQ-KERNEL-12a) is NOT covered by this reference model — it has no pure-function oracle; its verification is delegated to PERSIST-11 (the merge-driver invariant proper) as an **integration test**: a fresh clone runs the setup hook, then asserts `merge=orchestra-atlas` + the `.gitattributes` entry are registered."
anti-rot: the reference line-merge reuses the **FSPEC-merge** set-union reducer as its mock (`spec/fspec-merge` §DOWN), pinning the safe-degrade floor to the same core; a binary/blob log form fails the no-splice test. _(Tag stays `reference-model`: this is the structural safe-degrade floor, not the convergence core — it consumes the core, it is not the formal model. The proper merge-driver invariant is PERSIST-11, which also owns the self-install integration test above.)_

---

## Refuse-to-model

- **performance / OR-Set growth + compaction**: the grow-only OR-Set's footprint is bounded by decay (DP-9), covered by load tests; there is no correctness oracle to model.
- **the code itself**: conformance-tested (sampled) against the reference model — "success = we could not find a bug"; a verified design is not a verified impl. Confidence is bought with scale + coverage, not a proof claim.
- **concurrent + crashing executions simultaneously**: git-merge concurrency and process-crash / durability are checked _separately_, never in one model (ShardStore rule).
- **BLAKE3 / digest cryptographic collision-resistance**: the hash is a trusted primitive, assumed — not modeled. Identity byte-agreement (KERNEL-1/2) is a conformance corpus, not a formal model.
- **git's own 3-way text-merge algorithm internals**: treated as a black-box adversary; we model only that a JSONL line-union degrades safely (KERNEL-12), not git's merge code.
- **real-time / wall-clock**: no clock enters the fold by construction (KERNEL-10 forbids it), so there is nothing to model.

## FSPEC-merge

Location: [`../spec/fspec-merge.md`](../spec/fspec-merge.md). Covers the core cluster **KERNEL-9 / 10 / 11** and
its persistence-side consumer **PERSIST-11**; KERNEL-12's safe-degrade floor reuses the same set-union reducer
as its anti-rot mock.

## Completion report

- tagged-register: `docs/requirements/method-tags-krn.md`
- tag histogram: **formal 3** (KERNEL-9/10/11) · **exhaustive 0** · **PBT 0** · **reference-model 9** (KERNEL-1..8, 12)
- FSPEC-merge: `docs/spec/fspec-merge.md`
- refusal count: **6**
- every KERNEL-1..12 tagged: **yes** (12/12; all behavioural, 0 `n/a`)
- 3-conjunct justification for the `formal` cluster: written in `fspec-merge.md` §Why-formal (all three hold)
- → next_state **S3** (goldens).
