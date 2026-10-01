# Goldens — Block KRN (kernel) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-krn.md`; every INV method-tagged, `FSPEC-merge` exists for the core) ·
> **owner:** charlie (FORGE). This is the **KRN pilot** — it carries the one `formal` cluster in the Atlas.
>
> **Derivation (not hand-authored where a generator exists):**
>
> - **KERNEL-9 / 10 / 11** are `formal` and S2 did **NOT** escalate to TLC (the ladder stops at PBT step 1–2),
>   so their SCNs are **concrete witness instances of the semilattice/partial-order laws** in
>   [`fspec-merge.md`](../spec/fspec-merge.md) §escalation-ladder (commutative · associative · idempotent ·
>   convergence · no-drop · head-tiebreak · seq-invariant) — `gen: PBT`.
> - **KERNEL-1..8 / 12b / 12c** are `reference-model` → **conformance / differential** against the named
>   build-language mock (`kernel/ref/*.ts`, reused as the unit-test mock; anti-rot) — `gen: conformance`.
> - **KERNEL-12a** (self-install) has **no pure-function oracle** (method-tags-krn.md §INV-KERNEL-12): it is
>   the one genuine **residue** — a hand-written integration test delegated to PERSIST-11 — `gen: residue`.
>
> **Head-rule provenance note (load-bearing for teeth direction):** the authoritative model
> `fspec-merge.md` defines the forced single head as **`max-by-contentHash`** among the FRESH entries
> (§UP KERNEL-10 line 80; `head()` sort line 139 returns the largest). The illustrative "copy the _form_"
> examples in `S3.md` / `goldens/SKILL.md` show the _smaller_ hash — those are shape templates, not the
> content oracle. **This block follows the model: head = MAX-by-contentHash.** The 10b teeth break on the
> min-flip accordingly. (Raised as a surprise in the completion card — worth a cold-review reconcile.)

Concrete event universe reused by the formal cluster (fields per `fspec-merge` §DOWN `Event`):

| ref | seq          | nodeKey                | contentHash | fresh | supersedes | id = blake3hex(canonical({…e, seq:0})) |
| --- | ------------ | ---------------------- | ----------- | ----- | ---------- | -------------------------------------- |
| e1  | 1            | `claim:acme-arr-2024`  | `1c9f2a`    | true  | []         | `id-a7f0`                              |
| e2  | 2            | `claim:acme-arr-2024`  | `7e40bb`    | true  | []         | `id-c3d1`                              |
| e3  | 3            | `claim:acme-hq`        | `3d81ee`    | true  | []         | `id-f009`                              |
| eX  | 7 (writer A) | `claim:acme-headcount` | `aa1101`    | true  | []         | `id-9b21`                              |
| eY  | 7 (writer B) | `claim:acme-runway`    | `bb2202`    | true  | []         | `id-7c44`                              |

(`1c9f2a` < `7e40bb` lexicographically ⇒ MAX-by-contentHash of {e1,e2} is e2.)

---

## REQ-KERNEL-1 — content-addressed object identity

### REQ-KERNEL-1a — content-addressed object identity (happy)

### SCN-KERNEL-1a-1 — id is hash of the canonical preimage (happy)

source: REQ-KERNEL-1a
Given the object `{"b":2,"a":1}` presented with its keys in the order `b,a`, and the CI test-vector corpus row whose expected id for this fact is `blake3hex(canonical({"a":1,"b":2}))` = `id-9f2c`
When the kernel computes the object's id (canonicalForm sorts keys → `{"a":1,"b":2}`, then `Encoder.hash`)
Then the id is `id-9f2c` — byte-identical to the corpus vector, regardless of the presented key order
teeth: breaks-on "canonicalizer skips the key-sort — the b,a-ordered preimage hashes to `id-1abd` ≠ the corpus vector"
gen: conformance # differential vs `kernel/ref/canonical.ts` + the language-agnostic corpus

### SCN-KERNEL-1a-2 — nested-key + NFC canonicalization still hits the corpus vector (happy · held-out)

source: REQ-KERNEL-1a
held_out: true # reserved for the execution GATE — independent data (nested keys + NFC, not fixture-1's flat b,a)
Given the object `{"café":"x","a":{"n":2,"m":1}}` where the key `café` is presented in its **decomposed** unicode form (`cafe` + combining acute U+0301) and the nested object is presented in the order `n,m`, and the CI test-vector corpus row whose expected id for this fact is `blake3hex(canonical({"a":{"m":1,"n":2},"café-NFC":"x"}))` = `id-4b7e`
When the kernel computes the id (canonicalForm NFC-normalizes the key **and** sorts the nested `{"m":1,"n":2}`, then `Encoder.hash`)
Then the id is `id-4b7e` — byte-identical to the corpus vector, regardless of the decomposed input or the nested key order
teeth: breaks-on "the canonicalizer sorts only top-level keys and skips NFC — the decomposed-é / n,m-ordered preimage hashes to `id-6ef2` ≠ the corpus vector (a mutant fixture-1's flat top-level b,a sort passes)"
gen: conformance

### REQ-KERNEL-1b — reject hand-rolled ids (guard)

### SCN-KERNEL-1b-1 — caller-supplied id is rejected (guard)

source: REQ-KERNEL-1b
Given a caller that calls `put(object={"a":1}, id="acme-fact-001")` where `"acme-fact-001"` ≠ `Encoder.hash(canonicalForm({"a":1}))` = `id-3e77`
When the kernel ingests the object
Then it returns a structured rejection (mismatched-id) and stores nothing under `"acme-fact-001"`
teeth: breaks-on "kernel trusts the caller's id and stores the object keyed by `acme-fact-001` (a hand-rolled key enters the CAS)"
gen: conformance

### SCN-KERNEL-1b-2 — a well-formed-but-wrong id is still rejected (guard · held-out)

source: REQ-KERNEL-1b
held_out: true # reserved for the GATE — independent data: a plausible hex id, not fixture-1's obviously-non-hash string
Given a caller that calls `put(object={"kind":"node","label":"acme-hq"}, id="id-0000")` where `"id-0000"` is a **well-formed hash-shaped** string but `"id-0000"` ≠ `Encoder.hash(canonicalForm({"kind":"node","label":"acme-hq"}))` = `id-8d2f`
When the kernel ingests the object
Then it returns a structured rejection (mismatched-id) and stores nothing under `"id-0000"` — the id is checked against `hash(canonicalForm)`, not merely for well-formedness
teeth: breaks-on "the kernel only checks the supplied id is hash-shaped (well-formed hex), not that it equals `hash(canonicalForm)` — the plausible-but-wrong `id-0000` is trusted and the object is stored off-hash (a mutant fixture-1's non-hex `acme-fact-001` still trips)"
gen: conformance

### REQ-KERNEL-1c — encoder divergence fails build (guard)

### SCN-KERNEL-1c-1 — corpus divergence fails the build (guard)

source: REQ-KERNEL-1c
Given a code encoder that emits `id-DIVERGE` for corpus row #12 while the reference canonicalizer emits `id-9f2c` (a real divergence — e.g. the code omits NFC normalization)
When the conformance test-vector corpus runs in CI
Then the build **fails** (non-zero exit) and no object is stored — the two-CAS-objects-for-one-fact fork is blocked
teeth: breaks-on "divergence is logged as a warning and the build stays green — two CAS objects silently stored for one fact"
gen: conformance

### SCN-KERNEL-1c-2 — a float/escape divergence on a different row fails the build (guard · held-out)

source: REQ-KERNEL-1c
held_out: true # reserved for the GATE — independent data: row #27, an escape/float divergence, not row #12's NFC omission
Given a code encoder that emits `id-DRIFT` for corpus row #27 while the reference canonicalizer emits `id-3d81` — a real divergence in the **escape/number form** (the code emits the solidus as `/` and renders `1.0` as a float, where the canonical subset forbids floats and fixes one escape)
When the conformance test-vector corpus runs in CI
Then the build **fails** (non-zero exit) and no object is stored — the escape/float fork is blocked exactly as the NFC fork is
teeth: breaks-on "the escape/float divergence is downgraded to a warning and the build stays green — two CAS objects are stored for row #27 (a mutant that only hard-guards the NFC path of row #12 passes fixture-1)"
gen: conformance

---

## REQ-KERNEL-2 — the encoder seam

### REQ-KERNEL-2a — hash only via seam (happy)

### SCN-KERNEL-2a-1 — the hash function is reached only through the seam (happy)

source: REQ-KERNEL-2a
Given the kernel wired so every id computation calls `@orchestra/kernel` encoder seam `Encoder.hash(bytes)`, with the reference `kernel/ref/encoder.ts` parametrized by the seam fn
When the module graph is audited (no direct `blake3`/`sha256` import outside the seam) and every id path is exercised
Then every id in the run was produced through the seam — 0 direct-digest call sites
teeth: breaks-on "a node-builder imports `blake3` directly and hashes off-seam (an id is produced bypassing `@orchestra/kernel`)"
gen: conformance

### SCN-KERNEL-2a-2 — the Memory-entry id path also routes through the seam (happy · held-out)

source: REQ-KERNEL-2a
held_out: true # reserved for the GATE — independent data: a different call site (Memory path) + a different digest primitive (vendored sha256)
Given the kernel wired so every id computation calls the `@orchestra/kernel` `Encoder.hash(bytes)` seam, and the module graph audited for a **vendored `sha256` helper** (`crypto.createHash('sha256')`) anywhere off-seam, with the Memory-entry ingest path exercised end-to-end
When the graph audit runs and every Memory-entry id is produced
Then every Memory-entry id in the run was produced through the seam — 0 off-seam vendored-digest call sites on the Memory path
teeth: breaks-on "the Memory-entry id path calls a vendored `crypto.createHash('sha256')` helper off-seam — an id is produced bypassing `@orchestra/kernel` (a mutant that only routes the node-builder path through the seam passes fixture-1)"
gen: conformance

### REQ-KERNEL-2b — swap changes only digest bytes (happy)

### SCN-KERNEL-2b-1 — swapping the digest changes only the digest bytes (happy)

source: REQ-KERNEL-2b
Given the reference kernel run twice — once with the seam fn = BLAKE3, once with the seam fn = SHA-256 — over the identical contract-test suite
When every non-digest contract test (identity determinism, set-union, fold round-trip, export) runs under each encoder
Then every non-digest contract test passes under both; only the digest bytes (the id strings) differ
teeth: breaks-on "a contract other than the digest bytes depends on the encoder — swapping BLAKE3→SHA-256 breaks the fold-round-trip test"
gen: conformance

### SCN-KERNEL-2b-2 — a variable-length digest leaves the head tie-break unchanged (happy · held-out)

source: REQ-KERNEL-2b
held_out: true # reserved for the GATE — independent data: BLAKE3 vs a SHORTER test digest (not fixture-1's equal-length BLAKE3↔SHA-256), witnessing the head-tiebreak + merge-dedup contracts
Given the reference kernel run twice over the identical merge/export suite — once with the seam fn = BLAKE3 (32-byte digest), once with the seam fn = a **4-byte test digest** — over the `claim:acme-arr-2024` collision {e1,e2} and the export round-trip
When the head tie-break (`head` = max-by-contentHash among the fresh entries), the set-union dedup, and the export round-trip run under each encoder
Then every non-digest contract passes under both — the head selection, the dedup, and the round-trip are identical (only the digest byte strings differ), even though the two digests have **different lengths**
teeth: breaks-on "the head tie-break compares raw digest byte-length before value — swapping BLAKE3→the shorter 4-byte digest flips the max-by-contentHash head, so a non-digest contract secretly depends on the encoder (a mutant fixture-1's equal-length BLAKE3↔SHA-256 swap can't detect)"
gen: conformance

### REQ-KERNEL-2c — default encoder is BLAKE3 (happy)

### SCN-KERNEL-2c-1 — the unconfigured seam defaults to BLAKE3 (happy)

source: REQ-KERNEL-2c
Given a kernel constructed with no encoder override
When it hashes the byte string `"abc"`
Then the result equals `blake3hex(utf8("abc"))` = `id-b3ab` (not the SHA-256 digest)
teeth: breaks-on "the default seam resolves to SHA-256 — `hash('abc')` returns the sha256 digest"
gen: conformance

### SCN-KERNEL-2c-2 — the empty string defaults to the BLAKE3 empty digest (happy · held-out)

source: REQ-KERNEL-2c
held_out: true # reserved for the GATE — independent data: a different input (the empty string), which trips a hard-coded blake3('abc') overfit
Given a kernel constructed with no encoder override
When it hashes the empty byte string `""`
Then the result equals `blake3hex(utf8(""))` = `id-af13` (the BLAKE3 empty-input digest), not the SHA-256 empty digest
teeth: breaks-on "the default seam resolves to SHA-256 — `hash('')` returns the sha256 empty digest, not the blake3 empty digest (a mutant that hard-codes only the blake3('abc') answer and otherwise defaults to sha256 passes fixture-1)"
gen: conformance

---

## REQ-KERNEL-3 — the single content-addressed store

### REQ-KERNEL-3a — single content-addressed store (happy)

### SCN-KERNEL-3a-1 — all three object kinds key by hash in one CAS (happy)

source: REQ-KERNEL-3a
Given one structural node `N`, one Knowledge fact `K`, one Memory entry `M`, each `put` into the CAS
When each is fetched by its own hash `Encoder.hash(canonicalForm(x))`
Then all three resolve from the single `Cas=Map<Hash,CasObject>` — `get(hash(N))=N`, `get(hash(K))=K`, `get(hash(M))=M`
teeth: breaks-on "Memory entries are keyed by an insertion counter, not their hash — `get(hash(M))` misses"
gen: conformance

### SCN-KERNEL-3a-2 — cross-kind identical content collapses to one hash slot (happy · held-out)

source: REQ-KERNEL-3a
held_out: true # reserved for the GATE — independent data: two DIFFERENT-kind objects with identical content (not fixture-1's three distinct-content objects)
Given a structural node `N'` and a Knowledge fact `K'` whose canonical preimages are **byte-identical** (same `canonicalForm(x)`), each `put` into the CAS
When each is fetched by `Encoder.hash(canonicalForm(x))`
Then both resolve from the single `Cas=Map<Hash,CasObject>` at the **one** shared key — `get(hash(N'))` and `get(hash(K'))` return the same content-addressed object; kind is not part of the key
teeth: breaks-on "the CAS namespaces the key by object-kind (a kind-prefixed key) — the node and the fact with identical content land in two slots instead of one, so identity is no longer content alone (a mutant fixture-1's three distinct-content objects never collide, so it can't detect the kind prefix)"
gen: conformance

### REQ-KERNEL-3b — no second store (guard)

### SCN-KERNEL-3b-1 — exactly one store exists across all kinds (guard)

source: REQ-KERNEL-3b
Given the reference store after ingesting a node, a Knowledge fact, and a Memory entry
When the store-count assertion runs (`store-count == 1`)
Then exactly one CAS map holds all three kinds — no second, non-content-addressed store
teeth: breaks-on "Memory entries are routed to a second non-CAS side-store — `store-count == 2`"
gen: conformance

### SCN-KERNEL-3b-2 — an over-threshold blob does not spawn a second store (guard · held-out)

source: REQ-KERNEL-3b
held_out: true # reserved for the GATE — independent data: a size-triggered store split (not fixture-1's kind-triggered Memory route)
Given the reference store after ingesting a normal Knowledge fact **and** a structural node whose payload exceeds any inline/blob threshold (a large object)
When the store-count assertion runs (`store-count == 1`)
Then exactly one CAS map holds both — the large payload is content-addressed in the same store, no size-based overflow side-store appears
teeth: breaks-on "over-threshold payloads spill to a second blob side-store — `store-count == 2` once a large object is ingested (a mutant that only splits on size passes fixture-1's small kind-routed entries)"
gen: conformance

---

## REQ-KERNEL-4 — the append-only event log

### REQ-KERNEL-4a — append-only event log (happy)

### SCN-KERNEL-4a-1 — log length is monotone non-decreasing (happy)

source: REQ-KERNEL-4a
Given an empty `EventLog` (insert-only `Map<Hash,Event>`)
When e1, then e2, then e3 are appended
Then `size` observes the strictly non-decreasing sequence 0→1→2→3; no prior event's bytes change
teeth: breaks-on "the log compacts/truncates in place — `size` drops from 3 to 2"
gen: conformance

### SCN-KERNEL-4a-2 — an idempotent re-append keeps `size` non-decreasing (happy · held-out)

source: REQ-KERNEL-4a
held*out: true # reserved for the GATE — independent data: eX/eY + a no-op re-append (not fixture-1's strictly-increasing e1/e2/e3)
Given an empty `EventLog` (insert-only `Map<Hash,Event>`)
When eX (`id-9b21`), then eY (`id-7c44`), then eX **again** are appended
Then `size` observes the non-decreasing sequence 0→1→2→2 — the duplicate `append(*, eX)`is a no-op that never lowers`size`, and no prior event's bytes change
teeth: breaks-on "a duplicate append triggers an in-place compaction/rebalance that evicts an entry — `size` drops from 2 to 1 when eX is re-appended (a mutant fixture-1's all-distinct e1/e2/e3 never re-appends, so it can't detect the eviction)"
gen: conformance

### REQ-KERNEL-4b — reject in-place mutation or deletion (guard)

### SCN-KERNEL-4b-1 — mutate/delete of an extant event is rejected (guard)

source: REQ-KERNEL-4b
Given a log containing e1 (id `id-a7f0`)
When a caller attempts `mutate(id-a7f0, newPayload)` and then `delete(id-a7f0)`
Then both are rejected (a correction must be a **new** event); e1's bytes and the log `size` are unchanged
teeth: breaks-on "in-place mutate is accepted — e1's stored payload is overwritten under the same id"
gen: conformance

### SCN-KERNEL-4b-2 — a bulk truncate/same-nodeKey overwrite of an extant event is rejected (guard · held-out)

source: REQ-KERNEL-4b
held_out: true # reserved for the GATE — independent data: e3 + a bulk/overwrite vector (not fixture-1's single-id mutate/delete of e1)
Given a log containing e3 (id `id-f009`)
When a caller attempts `truncate(log)` (a bulk delete) and then `replace(id-f009, e3')` where e3' shares e3's `nodeKey` but carries a different `contentHash`
Then both are rejected (a correction must be a **new** event); e3's bytes and the log `size` are unchanged
teeth: breaks-on "the bulk `truncate`/`compact` path (or a same-nodeKey `replace`) deletes e3 in place while single-id `mutate` is blocked — `size` drops and e3's bytes vanish (a mutant that only guards the single-id `mutate(id)` path passes fixture-1)"
gen: conformance

---

## REQ-KERNEL-5 — state rebuilt by fold

### REQ-KERNEL-5a — state rebuilt by fold (happy)

### SCN-KERNEL-5a-1 — replay from empty rebuilds a byte-identical Atlas (happy)

source: REQ-KERNEL-5a
Given an Atlas folded from the log {e1,e2,e3} with serialized `AtlasState` `A0`
When the log is exported, imported into a fresh empty store, and `fold` is replayed from empty
Then the rebuilt `AtlasState` serializes byte-identically to `A0`
teeth: breaks-on "fold seeds from a cached mutable snapshot — replay-from-empty omits e3's node and diverges from `A0`"
gen: conformance # oracle = the reference `fold` (`kernel/ref/fold.ts`, shared with FSPEC-merge)

### SCN-KERNEL-5a-2 — replay of a set with a collision node rebuilds byte-identically (happy · held-out)

source: REQ-KERNEL-5a
held_out: true # reserved for the GATE — independent data: {e1,e2,eX,eY} incl. a union node (not fixture-1's collision-free {e1,e2,e3})
Given an Atlas folded from the log {e1, e2, eX, eY} with serialized `AtlasState` `B0` — where `claim:acme-arr-2024` is the union node `{e1,e2}` and `eX`, `eY` are two disjoint nodeKeys
When the log is exported, imported into a fresh empty store, and `fold` is replayed from empty
Then the rebuilt `AtlasState` serializes byte-identically to `B0`, union node included
teeth: breaks-on "fold seeds the union node `claim:acme-arr-2024` from a cached snapshot — replay-from-empty rebuilds only the last-writer entry (drops one of e1/e2) and diverges from `B0` (a mutant fixture-1's collision-free set has no union node to mis-seed)"
gen: conformance

### REQ-KERNEL-5b — no mutable snapshot dependency (happy)

### SCN-KERNEL-5b-1 — no capability reads a mutable in-place snapshot (happy)

source: REQ-KERNEL-5b
Given the Atlas serving a query with its in-memory snapshot discarded (forcing a pure replay `fold(EventLog)`)
When the query is answered before and after discarding the snapshot
Then both answers are identical — every capability derives from the fold, none from a mutable snapshot
teeth: breaks-on "a capability reads a stale mutable snapshot — the answer changes once the snapshot is dropped and rebuilt"
gen: conformance

### SCN-KERNEL-5b-2 — the forced-head query is snapshot-free (happy · held-out)

source: REQ-KERNEL-5b
held_out: true # reserved for the GATE — independent data: the head-of-nodeKey capability on a collision node (not fixture-1's generic query)
Given the Atlas serving `head(claim:acme-arr-2024)` over the collision node `{e1,e2}`, with its in-memory snapshot discarded (forcing a pure replay `fold(EventLog)`)
When the head is answered before and after discarding the snapshot
Then both answers are the identical head **e2** (`7e40bb`) — the forced head derives from the fold, not from a mutable head-cache
teeth: breaks-on "the forced head is served from a mutable head-cache — after the snapshot is dropped and rebuilt, `head(claim:acme-arr-2024)` changes (a mutant that caches only the head passes fixture-1's generic non-head query)"
gen: conformance

---

## REQ-KERNEL-6 — portable open-JSON export

### REQ-KERNEL-6a — portable open-JSON export (happy)

### SCN-KERNEL-6a-1 — export→import round-trips 1:1 (happy)

source: REQ-KERNEL-6a
Given a CAS holding {N, K, M}
When `import(export(cas))` is computed
Then `deepEqual(cas, import(export(cas)))` holds — the open-JSON dump replays 1:1 into a fresh store
teeth: breaks-on "export omits the version map — `import(export(cas))` loses M and ≠ `cas`"
gen: conformance # oracle = `kernel/ref/portable.ts`

### SCN-KERNEL-6a-2 — a CAS carrying an event log + a union node round-trips 1:1 (happy · held-out)

source: REQ-KERNEL-6a
held_out: true # reserved for the GATE — independent data: a log + a union node (not fixture-1's flat {N,K,M})
Given a CAS holding the event log {e1, e2, e3} and the folded union node `claim:acme-arr-2024` = `{e1,e2}`
When `import(export(cas))` is computed
Then `deepEqual(cas, import(export(cas)))` holds — the open-JSON dump replays the log and the union node 1:1 into a fresh store, so a re-fold reproduces the union node
teeth: breaks-on "export serializes only the CAS object map and omits the `EventLog` — `import(export(cas))` loses the log so the union node can't be re-folded and ≠ `cas` (a mutant fixture-1's flat {N,K,M} with no log or union node doesn't exercise the log/re-fold path)"
gen: conformance

### REQ-KERNEL-6b — export self-contained (happy)

### SCN-KERNEL-6b-1 — export carries no host/external/proprietary reference (happy)

source: REQ-KERNEL-6b
Given the open-JSON export dump of the CAS
When the dump is scanned for host paths, external references, and proprietary encodings
Then the scan finds 0 of each — the dump is self-contained and host-independent
teeth: breaks-on "export embeds an absolute host path `/Users/…/atlas.db` — the dump no longer replays on another machine"
gen: conformance

### SCN-KERNEL-6b-2 — no env-relative reference or proprietary binary encoding leaks (happy · held-out)

source: REQ-KERNEL-6b
held_out: true # reserved for the GATE — independent data: an env-var/binary leak vector (not fixture-1's absolute host path)
Given the open-JSON export dump of the CAS
When the dump is scanned for **environment-relative references** (`$ATLAS_HOME`, `file://`, `~/`) and **proprietary binary encodings** (a base64 native-blob field in place of open JSON)
When the scan runs
Then it finds 0 of each — the dump carries no host-env dependency and no proprietary encoding, only open JSON
teeth: breaks-on "export embeds a `$ATLAS_HOME`-relative reference (or a base64 native binary blob) — the dump depends on the host env / a proprietary encoding even though no absolute path appears (a mutant fixture-1's absolute-path scan can't see the env-var or binary leak)"
gen: conformance

---

## REQ-KERNEL-7 — entry points pure and total

### REQ-KERNEL-7a — entry points pure and total (happy)

### SCN-KERNEL-7a-1 — every entry point is total under fuzz (happy)

source: REQ-KERNEL-7a
Given the total reference kernel and the production kernel run side-by-side over a PBT-fuzz stream of arbitrary + malformed inputs (10k cases, corner-biased)
When each entry point is invoked on each fuzzed input
Then every call returns a `Result` / honest empty — **0 exceptions thrown** — and prod matches ref
teeth: breaks-on "an entry point throws a `TypeError` on a deeply-nested but valid input (a non-total path)"
gen: conformance # PBT-fuzz **differential** vs the total reference kernel (tag stays reference-model per method-tags-krn.md §K7)

### SCN-KERNEL-7a-2 — a held-out fuzz seed + a pinned deep-nesting corner stays total (happy · held-out)

source: REQ-KERNEL-7a
held_out: true # reserved for the GATE — a DIFFERENT fuzz seed (fresh 10k stream) + a pinned deterministic corner the random stream may miss. NOTE: 7a is a PBT-fuzz differential, so most held-out coverage is already subsumed by re-seeding the ∀-generator; the pinned corner below is the concrete added value.
Given the total reference kernel and the production kernel run side-by-side over (a) a **held-out** corner-biased PBT-fuzz stream at a fresh seed reserved for the GATE, and (b) a pinned `merge(a,b)` where `b` is a **valid but maximally-nested** AtlasState (a ~10k-deep nodeKey/supersedes chain)
When each entry point is invoked on the fuzz stream and `merge` is invoked on the deep-nested input
Then every call returns a `Result` / honest empty — **0 exceptions thrown** — and prod matches ref, including on the deep-nested `merge`
teeth: breaks-on "`merge`'s recursive fold overflows the stack on the deep-but-valid nested input — a `RangeError: Maximum call stack` escapes instead of a `Result` (a corner the fixture-1 random stream may not deterministically reach)"
gen: conformance # held-out = fresh fuzz seed (subsumed by the ∀-generator) + a pinned stack-depth corner (the added deterministic witness)

### REQ-KERNEL-7b — malformed input never throws (guard)

### SCN-KERNEL-7b-1 — malformed input yields a rejection, never an exception (guard)

source: REQ-KERNEL-7b
Given the entry point `ingest` and a malformed input (a non-NFC string with a wrong-typed `seq: "two"`)
When `ingest` is called on it
Then it returns a structured rejection (malformed-input) — it does **not** throw
teeth: breaks-on "the malformed input propagates an uncaught exception instead of a structured rejection"
gen: conformance

### SCN-KERNEL-7b-2 — a cyclic/NaN-bearing input to `merge` yields a rejection, never an exception (guard · held-out)

source: REQ-KERNEL-7b
held_out: true # reserved for the GATE — independent data: the `merge` entry point + a cyclic/NaN malformation (not fixture-1's `ingest` + wrong-typed seq)
Given the entry point `merge(a, b)` and a malformed branch `b` that is **self-referential (a cycle)** and carries a `NaN` float in place of a `contentHash`
When `merge` is called on it
Then it returns a structured rejection (malformed-input) — it does **not** throw
teeth: breaks-on "`merge` throws a `RangeError`/`TypeError` on the cyclic/`NaN`-bearing branch instead of returning a malformed-input rejection (a mutant that only guards `ingest` against a wrong-typed `seq` passes fixture-1)"
gen: conformance

---

## REQ-KERNEL-8 — the canonical preimage excludes side-indexes

### REQ-KERNEL-8a — preimage excludes side-indexes (happy)

### SCN-KERNEL-8a-1 — grounding/status/freshness are outside the preimage (happy)

source: REQ-KERNEL-8a
Given an object with `grounding`, `status`, and `freshness` fields populated
When `canonicalForm(object)` is computed
Then the preimage omits all three — `canonicalForm` contains no `grounding`/`status`/`freshness` bytes
teeth: breaks-on "`canonicalForm` includes `freshness` — the object re-keys the moment freshness is recomputed"
gen: conformance # shares the K1 canonicalizer mock `kernel/ref/canonical.ts`

### SCN-KERNEL-8a-2 — a nested grounding array is also outside the preimage (happy · held-out)

source: REQ-KERNEL-8a
held_out: true # reserved for the GATE — independent data: a different object, biting the grounding leak specifically (fixture-1's teeth name freshness)
Given an object with a **nested `grounding` provenance array**, an enum `status`, a timestamp `freshness`, and a legitimate nested content field `{"m":1,"n":2}`
When `canonicalForm(object)` is computed
Then the preimage omits `grounding`, `status`, and `freshness` while keeping the nested content field — `canonicalForm` contains no `grounding`/`status`/`freshness` bytes
teeth: breaks-on "`canonicalForm` includes the nested `grounding` provenance array — adding a grounding source re-keys the object (a leak on a different side-index than fixture-1's freshness teeth)"
gen: conformance

### REQ-KERNEL-8b — recompute never re-keys (guard)

### SCN-KERNEL-8b-1 — perturbing the side-indexes leaves the Hash invariant (guard)

source: REQ-KERNEL-8b
Given an object whose id is `id-5c8a`
When `grounding`, `status`, and `freshness` are each recomputed to new values and the id is recomputed
Then the id is still `id-5c8a` — recomputing the side-indexes perturbs no key
teeth: breaks-on "`status` leaks into the preimage — recomputing status changes the id to `id-5c8b` (a re-key)"
gen: conformance

### SCN-KERNEL-8b-2 — recomputing freshness + grounding leaves the Hash invariant (guard · held-out)

source: REQ-KERNEL-8b
held_out: true # reserved for the GATE — independent data: a different object/id, biting freshness+grounding (fixture-1 bites status)
Given an object whose id is `id-2f19`
When `freshness` is recomputed (marked stale, then fresh) and `grounding` is recomputed (a source appended), and the id is recomputed
Then the id is still `id-2f19` — recomputing freshness and grounding perturbs no key
teeth: breaks-on "`freshness` leaks into the preimage — recomputing freshness (stale→fresh) changes the id to `id-2f1a` (a re-key on a different side-index than fixture-1's status teeth)"
gen: conformance

---

## REQ-KERNEL-9 — idempotent content-keyed set-union log (FSPEC-merge · formal → PBT)

### REQ-KERNEL-9a — event identity is content (happy)

### SCN-KERNEL-9a-1 — event id = hash(canonicalForm), seq excluded (happy)

source: REQ-KERNEL-9a
Given e1 and a second event e1' identical to e1 in every field **except** `seq` (e1.seq=1, e1'.seq=99)
When each id is computed as `RefLog.id(e)=blake3hex(canonical({…e, seq:0}))`
Then `id(e1) = id(e1') = id-a7f0` — identity is the content hash, invariant under seq
teeth: breaks-on "id is assigned from a monotonic counter (or the preimage includes `seq`) — e1 and e1' get distinct ids and re-append stops being idempotent"
gen: PBT # witness of the identity/seq-invariant law (fspec §laws seq-invariant; `RefLog.id`)
held_out: n/a # Wave H: no 2nd fixture — held-out is subsumed by the ∀-property generator (properties-krn.md), which already quantifies over all inputs

### REQ-KERNEL-9b — idempotent append (happy)

### SCN-KERNEL-9b-1 — re-appending an existing event is a no-op (happy)

source: REQ-KERNEL-9b
Given a log `L = append(∅, e1)` with `size = 1`
When e1 is appended a second time — `append(append(L,e1), e1)`
Then `size` is still 1 and the log equals `append(L,e1)` (idempotence: `append∘append ≡ append`)
teeth: breaks-on "append inserts unconditionally (no id-membership check) — the second append duplicates e1 and `size` becomes 2"
gen: PBT # witness of the idempotence law `append(append(L,e),e) ≡ append(L,e)`
held_out: n/a # Wave H: subsumed by the ∀-property generator

### REQ-KERNEL-9c — logs merge by set-union (happy)

### SCN-KERNEL-9c-1 — two logs combine by set-union on the id (happy)

source: REQ-KERNEL-9c
Given `A = {e1, e2}` and `B = {e2, e3}` (e2 shared by id `id-c3d1`)
When `RefLog.merge(A, B)` is computed
Then the result is exactly `{e1, e2, e3}` (`size = 3`) — e2 deduped by id, nothing dropped or duplicated
teeth: breaks-on "merge concatenates the version maps — e2 appears twice (`size = 4`); or merge keeps the max-seq log and drops e1"
gen: PBT # witness of `merge = set-union on the id` (fspec `RefLog.merge`)
held_out: n/a # Wave H: subsumed by the ∀-property generator

### REQ-KERNEL-9d — seq is never an identity or merge key (guard)

### SCN-KERNEL-9d-1 — reseq leaves the keyset and the fold unchanged (guard)

source: REQ-KERNEL-9d
Given the log `L = {e1(seq1), e2(seq2), e3(seq3)}` with keyset `{id-a7f0, id-c3d1, id-f009}` and fold `F`
When every event's `seq` is relabelled — `reseq(L, e ↦ 100−e.seq)` — and ids + fold are recomputed
Then `keyset(reseq(L)) = keyset(L)` and `fold(reseq(L)) = F` — `seq` is neither an object key nor a merge discriminator
teeth: breaks-on "`seq` is folded into the identity/merge key — after reseq the keyset changes to fresh ids and the fold diverges"
gen: PBT # witness of the seq-invariant law `keyset(reseq)≡keyset ∧ fold(reseq)≡fold` (`RefLog.reseq`)
held_out: n/a # Wave H: subsumed by the ∀-property generator

### REQ-KERNEL-9e — colliding seq never collides identity (guard)

### SCN-KERNEL-9e-1 — two writers, same seq, distinct identity (guard)

source: REQ-KERNEL-9e
Given writer A emits eX (`seq=7`, contentHash `aa1101`) and writer B independently emits eY (`seq=7`, contentHash `bb2202`) — a real cross-writer `seq` collision
When both are appended to one log
Then `id(eX)=id-9b21 ≠ id(eY)=id-7c44` and both are retained (`size = 2`) — the shared `seq=7` collides no identity
teeth: breaks-on "`seq` is used as the object key — the two `seq=7` events collide to one slot and the log collapses to `size = 1` (an event is lost)"
gen: PBT # interesting witness: a genuine 2-writer seq collision (not an empty log)
held_out: n/a # Wave H: subsumed by the ∀-property generator

---

## REQ-KERNEL-10 — deterministic order-independent nodeKey union (FSPEC-merge · formal → PBT)

### REQ-KERNEL-10a — collision resolves by set-union (happy)

### SCN-KERNEL-10a-1 — two events on one nodeKey union into one node (happy)

source: REQ-KERNEL-10a
Given e1 (`contentHash 1c9f2a`) and e2 (`contentHash 7e40bb`) both folding onto nodeKey `claim:acme-arr-2024`
When the node is merged in order [e1,e2] and, separately, in order [e2,e1]
Then both yield the **same** node whose `entries` = `{1c9f2a, 7e40bb}` (`|entries| = 2`) — order-independent set-union, 0 dropped
teeth: breaks-on "`mergeNode` overwrites on collision (last-writer-wins) — the node keeps only one entry and the two orders disagree"
gen: PBT # witness of commutative + no-drop `mergeNode` (fspec §laws commutative, no-drop)
held_out: n/a # Wave H: subsumed by the ∀-property generator

### REQ-KERNEL-10b — forced head tie-break by contentHash (guard)

### SCN-KERNEL-10b-1 — unordered fresh heads → max-contentHash wins (guard)

source: REQ-KERNEL-10b
Given nodeKey `claim:acme-arr-2024` with two FRESH heads e1 (`1c9f2a`) and e2 (`7e40bb`), neither superseding the other (unordered in the supersedes DAG)
When a single current head is forced — `head(node)`
Then the head is **e2** (`7e40bb`), the **max-by-contentHash** among the fresh entries — `contentHash` alone, never `seq`/clock/LLM
teeth: breaks-on "the tie-break is mutated to **min-by-contentHash** (or to lowest `seq`) — head flips to e1 (`1c9f2a`)"
gen: PBT # witness of the head-tiebreak law (fspec §UP K10 line 80 + `head()` line 139: MAX-by-contentHash)
held_out: n/a # Wave H: subsumed by the ∀-property generator

### REQ-KERNEL-10c — collision path lossless and deterministic (guard)

### SCN-KERNEL-10c-1 — no collision path drops an event, reads a clock, or calls an LLM (guard)

source: REQ-KERNEL-10c
Given the nodeKey `claim:acme-arr-2024` collision {e1, e2}, folded twice under **different wall-clock times and different seq assignments**
When each fold resolves the collision and picks the head
Then both entries are retained every time (`|entries| = 2`, `≥ max(|x|,|y|)`) and the head is identically e2 in both runs — the result is invariant under clock and seq, and no LLM is consulted
teeth: breaks-on "the tie-break reads the wall-clock (picks the later-arriving event) — the head flips between the two runs (nondeterministic); or the collision path drops the lower-contentHash entry"
gen: PBT # witness of no-drop + head-invariance-under-reclock (fspec §UP K10: never seq/clock/LLM)
held_out: n/a # Wave H: subsumed by the ∀-property generator

---

## REQ-KERNEL-11 — convergent commutative fold (FSPEC-merge · formal → PBT)

### REQ-KERNEL-11 — convergent commutative fold (happy)

### SCN-KERNEL-11-1 — permutation, re-batching, and branch-union all fold byte-identically (happy)

source: REQ-KERNEL-11
Given the event set `S = {e1, e2, e3}` (two nodeKeys: `claim:acme-arr-2024`←{e1,e2}, `claim:acme-hq`←{e3})
When `S` is folded three ways, each **reversing the order of the colliding `e1`/`e2` pair** — (i) `fold([e1,e2,e3])`, (ii) `fold([e2,e1,e3])` (e2 before e1), (iii) `fold(RefLog.merge({e2,e3},{e1}))` (re-batched branch-union of the **same** set, delivering e1 last)
Then all three `AtlasState`s serialize (KERNEL-1 canonicalizer, sorted keys) to the **same bytes** — the `acme-arr-2024` node is the union `{e1,e2}` with head = `max-by-contentHash(e1,e2)` in every ordering — `fold(π(S)) = fold(S)` for every set-preserving `π`
teeth: breaks-on "`mergeNode` overwrites instead of unions (last-writer-wins) — under the reversed order (ii)/(iii) the `arr` node resolves to `e1` while (i) resolves to `e2`, so the folds diverge byte-wise"
gen: PBT # witness of the convergence + associativity laws `fold(shuffle(S)) ≡ fold(S)` (fspec §laws convergence)
held_out: n/a # Wave H: subsumed by the ∀-property generator

---

## REQ-KERNEL-12 — the git log seam (self-install · safe-degrade · JSONL)

### REQ-KERNEL-12a — merge driver self-installing (happy)

### SCN-KERNEL-12a-1 — a fresh clone re-registers the merge driver with no manual step (happy)

source: REQ-KERNEL-12a
Given a fresh `git clone` of an Atlas repo (the merge driver lives in `.git/config`, which does not clone)
When the repo setup hook / `git config` bootstrap runs
Then `git config merge.orchestra-atlas.driver` is registered **and** `.gitattributes` carries `<atlas-log> merge=orchestra-atlas` — with no manual step
teeth: breaks-on "the driver requires a manual `git config` invocation — a fresh clone leaves `merge.orchestra-atlas` unregistered and falls back to text merge unannounced"
gen: residue # no pure-function oracle — hand-written integration test, delegated to PERSIST-11 (method-tags-krn.md §K12)
held_out: n/a # Wave H: exempt — DEFINE-parametric residue, delegated to PERSIST-11; can't pin a 2nd concrete fixture (no pure-function oracle) until the self-install integration binds

### REQ-KERNEL-12b — text merge never corrupts set (guard)

### SCN-KERNEL-12b-1 — a plain git line-merge degrades to a lossless id-union (guard)

source: REQ-KERNEL-12b
Given branch `ours` JSONL log `[line(e1), line(e2)]` and branch `theirs` `[line(e2), line(e3)]` (each line one content-keyed event), merged by git's **default text/line** merge with the driver bypassed
When the merged file is re-folded — `fold(lineMerge(ours,theirs))`
Then no event's bytes are spliced into another; `lineMerge` = `dedup-by-id(lines(ours) ∪ lines(theirs))`, and `re-fold(lineMerge) ≡ fold(RefLog.merge)` (worst case a harmless duplicate line the fold dedups by id)
teeth: breaks-on "the log is stored as a single blob/array line — the 3-way text merge splices e1 and e3 into one corrupt line and `fold` fails to parse (an event is lost/corrupted)"
gen: conformance # `lineMerge` reuses the FSPEC-merge `RefLog.merge` reducer as its mock (anti-rot floor)

### SCN-KERNEL-12b-2 — a disjoint add/add conflict hunk still degrades to a lossless union (guard · held-out)

source: REQ-KERNEL-12b
held_out: true # reserved for the GATE — independent data: branches with NO shared line (a real add/add conflict hunk), not fixture-1's e2-overlap
Given branch `ours` JSONL log `[line(e1), line(eX)]` and branch `theirs` `[line(eY), line(e3)]` — **no shared line**, so git's default text merge produces a genuine add/add conflict hunk — merged with the driver bypassed
When the merged file is re-folded — `fold(lineMerge(ours,theirs))`
Then no event's bytes are spliced into another; `lineMerge` = `dedup-by-id(lines(ours) ∪ lines(theirs))` = `{e1,eX,eY,e3}`, and `re-fold(lineMerge) ≡ fold(RefLog.merge)` — the disjoint conflict region unions losslessly
teeth: breaks-on "the add/add conflict hunk is resolved ours-wins — theirs' `eY` and `e3` lines are dropped, so `re-fold(lineMerge)` loses two events ≠ `fold(RefLog.merge)` (a mutant fixture-1's shared-`e2` overlap makes the union trivial and hides the ours-wins drop)"
gen: conformance

### REQ-KERNEL-12c — log is content-keyed JSONL (happy)

### SCN-KERNEL-12c-1 — the log path is append-only, one content-keyed event per line (happy)

source: REQ-KERNEL-12c
Given the on-disk log of {e1, e2, e3}
When the file is inspected
Then it is exactly three lines — one JSON event per line, append-only — and each line `L` satisfies `RefLog.id(parse(L)) == parse(L).id` (the line is content-keyed)
teeth: breaks-on "the log is serialized as a single nested JSON array (not one-event-per-line JSONL) — a git line-merge can no longer union it cleanly and corrupts the set"
gen: conformance

### SCN-KERNEL-12c-2 — a counter-keyed line fails the content-keyed predicate (happy · held-out)

source: REQ-KERNEL-12c
held_out: true # reserved for the GATE — independent data: {eX,eY,e3} + the content-keyed predicate check (fixture-1 checks the one-per-line JSONL shape)
Given the on-disk log of {eX, eY, e3}
When the file is inspected
Then it is exactly three lines — one JSON event per line, append-only — and each line `L` satisfies `RefLog.id(parse(L)) == parse(L).id`, so the stored id is the content hash, not an appended position
teeth: breaks-on "lines are written one-per-line JSONL but keyed by an appended counter/`seq` — `RefLog.id(parse(L)) ≠ parse(L).id` for eX/eY, so a git line-merge can't dedup by id (a mutant that keeps the JSONL shape but counter-keys the line passes fixture-1's shape-only check)"
gen: conformance

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 30/30 REQ have ≥1 SCN.
- **Guard coverage:** 11/11 unwanted/If-then REQ have a guard SCN — 1b, 1c, 3b, 4b, 7b, 8b, 9d, 9e, 10b, 10c, 12b.
- **Teeth (Gate 3):** 30/30 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous; the formal-cluster witnesses are interesting (a real 2-writer `seq` collision for 9e, a real 2-event `nodeKey` collision for 10a/10b/10c, a genuine shuffle+branch-union for 11 — no antecedent-failure passes).
- **gen histogram:** PBT 9 (9a/9b/9c/9d/9e/10a/10b/10c/11) · conformance 20 (1a/1b/1c/2a/2b/2c/3a/3b/4a/4b/5a/5b/6a/6b/7a/7b/8a/8b/12b/12c) · residue 1 (12a).

### Wave H — held-out 2nd-fixture re-freeze (S3 re-freeze · enables the execution GATE's held-out leg → FULL assurance)

- **Mechanism:** each conformance SCN gains a `held_out: true` 2nd fixture (`SCN-KERNEL-<req>-2`) the builder never sees. It exercises the **same frozen behaviour** with **genuinely independent concrete data** and its own teeth — so an overfit that hard-codes fixture-1's answer fails the held-out leg. Every 2nd fixture is a new DATA INSTANCE of already-frozen behaviour (no new/changed behaviour was decided).
- **Held-out fixtures added: 20/20 conformance REQ** — 1a (nested-key + NFC vs flat b,a) · 1b (well-formed-but-wrong hex id vs non-hash string) · 1c (escape/float divergence on row #27 vs NFC on row #12) · 2a (Memory path + vendored sha256 vs node-builder + blake3) · 2b (variable-length digest → head-tiebreak vs equal-length swap → fold-round-trip) · 2c (empty string vs "abc") · 3a (cross-kind identical-content collision vs three distinct objects) · 3b (size-triggered blob split vs kind-triggered Memory route) · 4a (idempotent re-append of eX/eY vs strictly-increasing e1/e2/e3) · 4b (bulk truncate / same-nodeKey replace of e3 vs single-id mutate of e1) · 5a (collision-node set {e1,e2,eX,eY} vs collision-free {e1,e2,e3}) · 5b (forced-head query on a union node vs generic query) · 6a (log + union node vs flat {N,K,M}) · 6b (env-var/binary leak vs absolute host path) · 7a (held-out fuzz seed + pinned deep-nesting `merge` corner) · 7b (`merge` cyclic/NaN vs `ingest` wrong-typed seq) · 8a (grounding leak vs freshness leak) · 8b (freshness+grounding recompute vs status) · 12b (disjoint add/add conflict hunk vs shared-`e2` overlap) · 12c (counter-keyed line vs JSONL-shape).
- **Skipped (exempt, noted inline as `held_out: n/a`):** **PBT 9** (9a/9b/9c/9d/9e/10a/10b/10c/11) — held-out subsumed by the ∀-property generator; **residue 1** (12a) — DEFINE-parametric, no pure-function oracle, delegated to PERSIST-11.
- **Independence:** 7a's held-out is partly subsumed by re-seeding its PBT-fuzz ∀-generator; the pinned stack-depth `merge` corner is the added deterministic witness (noted inline). All 19 others pin fully independent concrete data + teeth that bite a mutant fixture-1 can miss.
- **No [NEEDS RECONCILIATION]:** every 2nd fixture stayed grounded in the frozen REQ + `fspec-merge` law; none required deciding new behaviour.

---

## Appendix — PINNED IDENTITY GOLDENS (#104) · the digest floor

> **Deliberately NOT an `SCN-`.** It mints no id, consumes no REQ and enters no ledger above: the id graph
> (`harness/gates/id-integrity.mjs`, ID-3 ORPHAN) requires every SCN to be consumed by a WP card, and this is
> a REGRESSION PIN rather than a scenario derived from a method tag. The coverage counts above are unchanged.

**Why it exists.** Before this appendix, `git grep -P "[0-9a-f]{40,}"` over the repo's test directories
returned essentially nothing: **no golden anywhere pinned a hash constant.** Every KRN golden asserts a
PROPERTY — determinism, order-independence, NFC equivalence, floats-forbidden, side-index exclusion — and
every one of those is preserved by _any injective change_ to the preimage or the digest. The suite was
therefore structurally blind to a re-key, which is how two whole-store re-keyings (`0b65b42`, `f2a8659`)
shipped with 1346 tests green.

**Carrier:** `packages/kernel/test/identity-goldens.test.ts`. **Generated by running the production
functions** over the inputs written out in that file — never hand-computed.

| digest                               | input                             | pinned value                                                                                       |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `canonicalForm` (preimage bytes)     | the fixture object in the carrier | `{"claim":"the door is the only writer","kind":"advisory","n":42,"nested":{"a":"café","b":[1,2]}}` |
| `id`                                 | same                              | `2777c1642a90102199b2986bed6b9ff6a6aa36b39572b1ab3fee369a53fbe9d5`                                 |
| `id` (NFD presentation, KERNEL-1a)   | same, `é` decomposed              | same value — the NFC rule, pinned absolutely                                                       |
| `id` (KERNEL-8 side-indexes present) | same + grounding/status/freshness | same value — the exclusion, pinned absolutely                                                      |

**A RED here is a MIGRATION EVENT, not a test to update.** `id` is the floor under every other identity in
Atlas, so moving it moves every hash in every on-disk store at once. The response is: (1) decide whether the
re-key is worth a full re-derive for every user; (2) if it is, **bump `IDENTITY_SCHEMA`** in
`packages/adapter-io/src/identity-schema.ts` in the same commit, so an existing store is DETECTED and refused
with a legible reason instead of silently mis-read (#112); (3) only then update the pin. A change to KERNEL-1
is additionally a **spec amendment** (REQ-KERNEL-1a + a held-out gate), so step 1 is not a local decision.
