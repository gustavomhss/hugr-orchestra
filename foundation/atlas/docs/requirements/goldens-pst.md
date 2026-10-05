# Goldens — Block PST (persistence) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-pst.md`; every INV method-tagged; PST authors **no** new model — `FSPEC-merge` is consumed) ·
> **owner:** charlie (FORGE). PST carries the **persistence-side consumer** of the one `formal` cluster (PERSIST-11).
>
> **Derivation (not hand-authored where a generator exists):**
>
> - **PERSIST-11** is `formal` and consumes `FSPEC-merge` (S2 did **NOT** escalate to TLC). Its direction-independence /
>   union / seq-collision / nodeKey-resolution SCNs are **concrete git-merge witness instances** of the semilattice
>   laws in [`fspec-merge.md`](../spec/fspec-merge.md) §PERSIST-11 (`mergeAtlas(ours,theirs) ≡ mergeAtlas(theirs,ours)`
>   = the KERNEL-11 **commutativity** law at the git seam) — `gen: PBT`. The **self-install** arm (REQ-PERSIST-11-f,
>   delegated here from KERNEL-12a) has no pure-function oracle → `gen: residue` (integration test). The **safe-degrade**
>   arm (REQ-PERSIST-11-g) reuses KERNEL-12's JSONL line-union floor (`RefLog.merge`) → `gen: conformance`.
> - **PERSIST-2 / 5 / 12** are `PBT` — witnesses of the same convergence / grow-only-monotonicity laws over the same
>   `FSPEC-merge` reducer (`fold` / `RefLog.merge`), applied at the git-native log seam — `gen: PBT`. **NOT a new model.**
> - **PERSIST-1 / 3 / 4 / 6 / 7 / 8 / 9 / 10 / 10a / 10b / 13** are `reference-model` → **conformance / differential**
>   against the named build-language mock (`persist/ref/*.ts`, reused verbatim as the unit-test mock; anti-rot) — `gen: conformance`.
>
> **Head-rule provenance (load-bearing for teeth direction), inherited from the KRN pilot + `fspec-merge.md` §UP KERNEL-10:**
> the forced single head = **`max-by-contentHash`** among FRESH entries (§UP K10 line 80; `head()` line 146 sorts largest-first).
> **This block follows the model: head = MAX-by-contentHash**, and the PERSIST-11 direction-independence teeth break on
> the last-writer-wins / direction-dependent mutant accordingly.
>
> **Domain-delegation (not authored here):** **REQ-PERSIST-10a-c** (server-side pre-receive hook) and **REQ-PERSIST-10a-d**
> (≥2 detection engines) are the credential-**scanner** architecture = **billy / FR-12** security domain (method-tags-pst.md
> §refuse-to-model). Per dispatch, PST **notes** these and does **not** author a scanner-detection golden. The persistence-side
> scrub properties (10a-a / 10a-b / 10a-e) — no raw credential in the immutable object, redact-at-source, no over-abridge — **are**
> authored here against the `persist/ref/scrub.ts` oracle. See the PERSIST-10a delegation note.

Concrete event universe reused by the merge cluster (fields per `fspec-merge` §DOWN `Event`; `id = blake3hex(canonical({…e, seq:0}))`):

| ref | branch | seq (local) | nodeKey               | contentHash | fresh | supersedes | id        |
| --- | ------ | ----------- | --------------------- | ----------- | ----- | ---------- | --------- |
| e1  | ours   | 5           | `claim:acme-arr-2024` | `1c9f2a`    | true  | []         | `id-a7f0` |
| e2  | theirs | 5           | `claim:acme-arr-2024` | `7e40bb`    | true  | []         | `id-c3d1` |
| e3  | theirs | 6           | `claim:acme-hq`       | `3d81ee`    | true  | []         | `id-f009` |

(`1c9f2a` < `7e40bb` lexicographically ⇒ **MAX-by-contentHash of {e1,e2} is e2**. e1 is written on `ours`, e2 on `theirs`,
**both on the same nodeKey `claim:acme-arr-2024` and both at the colliding positional `seq=5`** — the reversible colliding pair.)

---

## REQ-PERSIST-1 — portable source = tracked store + trailers

### REQ-PERSIST-1-a — portable source is store plus trailers (happy)

### SCN-PERSIST-1a-1 — a bare clone rebuilds every datum from {store, trailer} (happy)

source: REQ-PERSIST-1-a
Given a datum `D` committed with its home = the tracked store + a commit trailer (the PR surface holds only its projection)
When `clone(source)` runs a bare clone (no host-side PR fetch) and rebuilds Atlas state from {store, trailer} alone
Then `D` is fully reconstructed — the PR attachment was a projection, never consulted for a datum's value
teeth: breaks-on "`D`'s value is reconstructable only from the PR attachment — the bare clone rebuilds Atlas without `D` (a datum's canonical home is the projection)"
gen: conformance # differential vs `persist/ref/source.ts` (the reference persistence-source model, reused as the mock)

### SCN-PERSIST-1a-2 — a bare clone rebuilds a Knowledge fact from {store, trailer} (happy · held-out)

source: REQ-PERSIST-1-a
held_out: true
Given a Knowledge fact `K = (claim:acme-hq → "NYC")` committed with its home = the tracked store + a commit trailer (the PR surface holds only its projection)
When `clone(source)` runs a bare clone (no host-side PR fetch) and rebuilds Atlas state from {store, trailer} alone
Then `K` is fully reconstructed — the PR attachment was a projection, never consulted for `K`'s value
teeth: breaks-on "`K`'s value is reconstructable only from the PR attachment — the bare clone rebuilds Atlas without `claim:acme-hq` (a fact's canonical home is the projection)"
gen: conformance # held-out; differential vs `persist/ref/source.ts` — independent datum (a Knowledge fact, not the generic datum `D`)

### REQ-PERSIST-1-b — PR attachment never sole home (guard)

### SCN-PERSIST-1b-1 — a PR-attachment-only datum fails the sole-home check (guard)

source: REQ-PERSIST-1-b
Given a code path that writes datum `D` **only** to the PR attachment (not to the store or a trailer)
When the sole-home placement assertion runs (`∀ datum: home ⊋ {PR-attachment}`)
Then the write is rejected — no datum may have the PR attachment as its only home
teeth: breaks-on "the placement check permits a PR-attachment-only home — `D` is written solely to the PR and a bare clone loses it"
gen: conformance # `persist/ref/source.ts` sole-home assertion

### SCN-PERSIST-1b-2 — a PR-attachment-only Memory entry fails the sole-home check (guard · held-out)

source: REQ-PERSIST-1-b
held_out: true
Given a code path that writes Memory entry `M` (a seat-scoped memory line) **only** to the PR attachment (not to the store or a trailer)
When the sole-home placement assertion runs (`∀ datum: home ⊋ {PR-attachment}`)
Then the write is rejected — no datum, `M` included, may have the PR attachment as its only home
teeth: breaks-on "the placement check permits a PR-attachment-only home for `M` — the Memory entry is written solely to the PR and a bare clone loses it"
gen: conformance # held-out; `persist/ref/source.ts` sole-home assertion — independent datum (a Memory entry, not `D`)

---

## REQ-PERSIST-2 — Atlas state = fold of the append-only set (PBT · reuses `FSPEC-merge` `fold`)

### REQ-PERSIST-2-a — state reconstructed by folding the set (happy)

### SCN-PERSIST-2a-1 — replay-from-empty rebuilds a byte-identical AtlasState (happy)

source: REQ-PERSIST-2-a
Given the append-only event **set** `S = {e1, e2, e3}` folded to serialized `AtlasState` `A0`
When `S` is exported, imported into a fresh empty store, and `fold` is replayed from empty — `fold(replay(export(S)))`
Then the rebuilt `AtlasState` serializes byte-identically to `A0`
teeth: breaks-on "the fold seeds from a cached mutable snapshot — replay-from-empty omits e3's node and diverges from `A0`"
gen: PBT # `fold(replay(export(S))) ≡ fold(S)` — oracle = the FSPEC-merge reference `fold` (`kernel/ref/fold.ts`)

### REQ-PERSIST-2-b — fold convergent and order-independent (happy)

### SCN-PERSIST-2b-1 — reversing the colliding e1/e2 pair folds byte-identically (happy)

source: REQ-PERSIST-2-b
Given the set `S = {e1, e2, e3}` where e1, e2 collide on nodeKey `claim:acme-arr-2024`
When `S` is folded in two arrival orders that **reverse the colliding pair** — `fold([e1,e2,e3])` and `fold([e2,e1,e3])` (e2 before e1)
Then both serialize (KERNEL-1 canonicalizer) to the **same bytes** — the `arr` node = union `{1c9f2a, 7e40bb}`, head = max-by-contentHash = e2 in both
teeth: breaks-on "the fold keys on arrival order (last-writer-wins) — the reversed `[e2,e1,e3]` order heads e1 while `[e1,e2,e3]` heads e2, so the folds diverge byte-wise"
gen: PBT # `serialize(fold(shuffle(S))) ≡ serialize(fold(S))` — the KERNEL-11 convergence law at the persistence seam

### REQ-PERSIST-2-c — no dependence on history or snapshot (guard)

### SCN-PERSIST-2c-1 — answer invariant under snapshot-drop and history-reorder (guard)

source: REQ-PERSIST-2-c
Given the Atlas answering a query three ways: (i) from its in-memory snapshot, (ii) with the snapshot discarded (pure `fold(EventLog)`), (iii) after the underlying commit history is reordered/re-parented (non-linear)
When the three answers are compared
Then all three are identical — reconstruction depends on neither a linear commit history nor a mutable in-place snapshot
teeth: breaks-on "a capability reads a stale mutable snapshot, or the fold keys on linear commit order — the answer changes once the snapshot is dropped or the history is reordered"
gen: PBT # order-independence + snapshot-independence over the same `fold` oracle

---

## REQ-PERSIST-3 — provenance committed to trailer + note

### REQ-PERSIST-3-a — provenance committed to a commit trailer (happy)

### SCN-PERSIST-3a-1 — the trailer block round-trips all five provenance fields (happy)

source: REQ-PERSIST-3-a
Given WP `WP-7` committed with a provenance trailer block `{WP: WP-7, Model: opus-4-8, Gates: [fmt,clippy,test], Verdict: APPROVE, Transcript-SHA: id-tr01}`
When `readCommit(sha)` parses the trailer block
Then all five fields read back exactly (0 missing field)
teeth: breaks-on "the `Transcript-SHA` field is dropped from the trailer serializer — `readCommit` yields four fields and provenance is un-replayable"
gen: conformance # differential vs `persist/ref/provenance.ts` (trailer+note (de)serializer, reused as the mock)

### SCN-PERSIST-3a-2 — a second WP's trailer block round-trips all five provenance fields (happy · held-out)

source: REQ-PERSIST-3-a
held_out: true
Given WP `WP-9` committed with a provenance trailer block `{WP: WP-9, Model: sonnet-4-5, Gates: [fmt,test,linux-validation], Verdict: REWORK, Transcript-SHA: id-tr47}`
When `readCommit(sha)` parses the trailer block
Then all five fields read back exactly (0 missing field)
teeth: breaks-on "the `Verdict` field is dropped from the trailer serializer — `readCommit` yields four fields for WP-9 and its REWORK verdict is un-replayable"
gen: conformance # held-out; differential vs `persist/ref/provenance.ts` — independent data (WP-9, different model/gates/verdict/sha) + a different dropped-field mutant

### REQ-PERSIST-3-b — provenance also recorded as a git note (happy)

### SCN-PERSIST-3b-1 — the note carries the same fields and reads back total (happy)

source: REQ-PERSIST-3-b
Given the same `WP-7` provenance also recorded as a `refs/notes/orchestra` note carrying `{WP, Model, Gates, Verdict, Transcript-SHA}`
When `readCommit(sha)` reads the note, and is also called on a commit that has **no** note
Then the note yields the same five fields, and the note-absent read returns `null` (never throws) — a total read
teeth: breaks-on "the note read throws on a commit with no note instead of returning `null` (total-read violated); or the note omits a field"
gen: conformance # `persist/ref/provenance.ts` total-read check, mirrors Maestro `readDossierNote`

### SCN-PERSIST-3b-2 — WP-9's note carries the same fields and reads back total (happy · held-out)

source: REQ-PERSIST-3-b
held_out: true
Given the same `WP-9` provenance also recorded as a `refs/notes/orchestra` note carrying `{WP, Model, Gates, Verdict, Transcript-SHA}`
When `readCommit(sha)` reads the note, and is also called on `WP-9`'s parent commit that has **no** note
Then the note yields the same five fields, and the note-absent read returns `null` (never throws) — a total read
teeth: breaks-on "the note read throws on `WP-9`'s parent commit (no note) instead of returning `null` (total-read violated); or the note omits `Gates`"
gen: conformance # held-out; `persist/ref/provenance.ts` total-read check — independent commit pair, different omitted field

---

## REQ-PERSIST-4 — attachment = CAS pointers, content in the CAS

### REQ-PERSIST-4-a — attachment is hashed pointers (happy)

### SCN-PERSIST-4a-1 — a large body attaches as a `{hash}` pointer only (happy)

source: REQ-PERSIST-4-a
Given a large content body `B` to attach to a commit/PR
When `attach(B)` runs
Then what is attached is the hashed index `{hash: blake3hex(B)}` — a pointer, **not** `B`'s bytes
teeth: breaks-on "`attach` inlines `B` into the commit/PR attachment — the attachment carries the body bytes, not a pointer"
gen: conformance # differential vs `persist/ref/attach.ts`

### SCN-PERSIST-4a-2 — a second large body attaches as a `{hash}` pointer only (happy · held-out)

source: REQ-PERSIST-4-a
held_out: true
Given a different large content body `B2` (a rendered-report blob) to attach to a commit/PR
When `attach(B2)` runs
Then what is attached is the hashed index `{hash: blake3hex(B2)}` — a pointer, **not** `B2`'s bytes
teeth: breaks-on "`attach` inlines `B2` into the commit/PR attachment — the attachment carries the body bytes, not a pointer"
gen: conformance # held-out; differential vs `persist/ref/attach.ts` — independent body `B2`

### REQ-PERSIST-4-b — content lives in the CAS (happy)

### SCN-PERSIST-4b-1 — the body resolves from the CAS by its hash (happy)

source: REQ-PERSIST-4-b
Given `B` attached as the pointer `{hash}` from SCN-PERSIST-4a-1
When `get(hash)` is called
Then `B` resolves from the single CAS by its content hash — the content lives in the CAS
teeth: breaks-on "the body is stored outside the CAS in a side-blob — `get(hash)` misses (content not content-addressed)"
gen: conformance # `persist/ref/attach.ts` `get()` resolves via the CAS

### SCN-PERSIST-4b-2 — the second body resolves from the CAS by its hash (happy · held-out)

source: REQ-PERSIST-4-b
held_out: true
Given `B2` attached as the pointer `{hash}` from SCN-PERSIST-4a-2
When `get(hash)` is called
Then `B2` resolves from the single CAS by its content hash — the content lives in the CAS
teeth: breaks-on "`B2` is stored outside the CAS in a side-blob — `get(hash)` misses (content not content-addressed)"
gen: conformance # held-out; `persist/ref/attach.ts` `get()` resolves via the CAS — independent body `B2`

### REQ-PERSIST-4-c — git object not canonical for large bodies (guard)

### SCN-PERSIST-4c-1 — a large body is never inlined as a git object (guard)

source: REQ-PERSIST-4-c
Given a content body `B` exceeding the pointer size threshold
When the size-gate inspects every git object written for the attach
Then no git object contains `B` inlined — the canonical container is the CAS, git holds only the pointer
teeth: breaks-on "`B` is inlined into a git blob as its canonical container — the size-gate passes an oversized git object (git object is the canonical home of a large body)"
gen: conformance # `persist/ref/attach.ts` pointer-only size assertion

### SCN-PERSIST-4c-2 — a second large body is never inlined as a git object (guard · held-out)

source: REQ-PERSIST-4-c
held_out: true
Given a different content body `B2` exceeding the pointer size threshold
When the size-gate inspects every git object written for the attach
Then no git object contains `B2` inlined — the canonical container is the CAS, git holds only the pointer
teeth: breaks-on "`B2` is inlined into a git blob as its canonical container — the size-gate passes an oversized git object"
gen: conformance # held-out; `persist/ref/attach.ts` pointer-only size assertion — independent body `B2`

---

## REQ-PERSIST-5 — nothing dies: archive is grow-only (PBT · reuses `RefLog.merge` grow-only union)

### REQ-PERSIST-5-a — never delete memory or knowledge (guard)

### SCN-PERSIST-5a-1 — a delete of an entry is a no-op that never shrinks the archive (guard)

source: REQ-PERSIST-5-a
Given an archive `A` containing memory/knowledge entry `k`
When `delete(k)` is attempted (and a structural grep audits the codebase for delete paths)
Then `A` is unchanged — `k` is retained, `A' ⊒ A` (monotone), and the grep finds **0** paths that remove an entry
teeth: breaks-on "`delete(k)` actually removes `k` — the archive shrinks (`A' ⊏ A`, monotonicity broken; memory/knowledge is lost)"
gen: PBT # monotonicity `A ⊑ A ∪ e` over the grow-only set reducer; the "0 delete paths" arm is the structural grep (method-tags-pst.md §INV-PERSIST-5)

### REQ-PERSIST-5-b — superseded entries archived and retained (happy)

### SCN-PERSIST-5b-1 — supersede archives, and a re-run dedups idempotently (happy)

source: REQ-PERSIST-5-b
Given entry `k` superseded by `k'`; both archived
When `archive(k)` is applied, then the merge is **re-run** on the same input — `merge(A, A)`
Then `k` (and `k'`) are retained in the archive, deduped, and the re-run loses nothing — `merge(A, A) ≡ A` (dedup idempotent)
teeth: breaks-on "supersede deletes `k` instead of archiving (data lost); or dedup is non-idempotent — the re-run duplicates `k` or drops a prior entry (merge-on-rerun loses data)"
gen: PBT # grow-only monotonicity + dedup-idempotence over `RefLog.merge` (`spec/fspec-merge` §DOWN)

### REQ-PERSIST-5-c — archived entries stay re-spawnable (happy)

### SCN-PERSIST-5c-1 — a superseded entry round-trips back into the active set (happy)

source: REQ-PERSIST-5-c
Given an archived (superseded) entry `k`
When `respawn(k)` round-trips it back into the active/injected set
Then `k` is reconstructed byte-identically — the archive kept it re-spawnable
teeth: breaks-on "the archive stores only a lossy digest of `k` — `respawn(k)` cannot reconstruct the original (round-trip fails; entry not re-spawnable)"
gen: PBT # re-spawn round-trip `respawn(archive(k)) ≡ k`

### REQ-PERSIST-5-d — forgetting leaves only the active set (happy)

### SCN-PERSIST-5d-1 — forget removes from the active set only, archive untouched (happy)

source: REQ-PERSIST-5-d
Given entry `k` present in both the active/injected set and the archive
When `forget(k)` is applied
Then `k` is removed from the active/injected set **only** — it remains retained in the (grow-only) archive
teeth: breaks-on "`forget(k)` also removes `k` from the archive — forgetting deletes the datum (the archive shrinks; 'nothing dies' violated)"
gen: PBT # forget affects the active projection; archive monotonicity `A ⊑ A` preserved

---

## REQ-PERSIST-6 — full per-agent metering recorded

### REQ-PERSIST-6 — full per-agent metering recorded (happy)

### SCN-PERSIST-6-1 — a recorded WP carries a complete Metering record (happy)

source: REQ-PERSIST-6
Given an ephemeral agent's WP `WP-7` recorded, with `meter(WP-7)` building the Metering record and writing it to the event log + dossier
When the record is read back
Then every required field is present and non-`undefined` — `model`, tokens `{input, output, cache}`, tool-uses, wall-time, **retries/reworks**, gates, verdict, `transcriptSha`
teeth: breaks-on "the `retries/reworks` field is omitted from the Metering constructor — a rework goes unmetered (the field reads back `undefined`)"
gen: conformance # differential vs `persist/ref/metering.ts` total-schema check

### SCN-PERSIST-6-2 — a second recorded WP carries a complete Metering record (happy · held-out)

source: REQ-PERSIST-6
held_out: true
Given a second ephemeral agent's WP `WP-9` recorded, with `meter(WP-9)` building the Metering record and writing it to the event log + dossier
When the record is read back
Then every required field is present and non-`undefined` — `model`, tokens `{input, output, cache}`, tool-uses, wall-time, retries/reworks, gates, verdict, `transcriptSha`
teeth: breaks-on "the `tokens.cache` field is omitted from the Metering constructor — WP-9's cache reads go unmetered (the field reads back `undefined`)"
gen: conformance # held-out; differential vs `persist/ref/metering.ts` total-schema check — independent WP, different omitted field

---

## REQ-PERSIST-7 — re-invokable anywhere with no non-git state

### REQ-PERSIST-7-a — ephemeral agent re-invokable anywhere (happy)

### SCN-PERSIST-7a-1 — a WP re-spawns identically on another clone (happy)

source: REQ-PERSIST-7-a
Given a WP recorded on machine-1
When the repo is bare-cloned to machine-2 and the agent is re-invoked — `redispatch(record) → seat` then `replay(checkpoint)`
Then the **same brief maps to the same seat** and the WP is reproduced by faithful replay (idempotent redispatch + replay, not a fresh judgment)
teeth: breaks-on "`redispatch` is non-idempotent — the same brief maps to a different seat on machine-2 (re-invocation diverges across clones)"
gen: conformance # differential vs `persist/ref/reinvoke.ts` (redispatch+replay, shared with PERSIST-10b)

### SCN-PERSIST-7a-2 — a second WP re-spawns identically on a third clone (happy · held-out)

source: REQ-PERSIST-7-a
held_out: true
Given a different WP `WP-9` recorded on machine-1
When the repo is bare-cloned to machine-3 and the agent is re-invoked — `redispatch(record) → seat` then `replay(checkpoint)`
Then the **same brief maps to the same seat** and the WP is reproduced by faithful replay (idempotent redispatch + replay, not a fresh judgment)
teeth: breaks-on "`redispatch` is non-idempotent — the same brief maps to a different seat on machine-3 (re-invocation diverges across clones)"
gen: conformance # held-out; differential vs `persist/ref/reinvoke.ts` — independent WP + clone target

### REQ-PERSIST-7-b — no non-git state required (guard)

### SCN-PERSIST-7b-1 — re-invocation reads zero non-git state (guard)

source: REQ-PERSIST-7-b
Given a clean bare clone with all non-git state unavailable (local caches, a host DB, environment scratch)
When the input-provenance check runs over `redispatch` + `replay`
Then 0 non-git state is read — re-invocation succeeds from the git-tracked source alone
teeth: breaks-on "`redispatch` reads a local non-git cache — re-invocation fails on a clean clone where that state is absent (non-git state was required)"
gen: conformance # `persist/ref/reinvoke.ts` input-provenance assertion

### SCN-PERSIST-7b-2 — re-invocation reads zero non-git state with a host env absent (guard · held-out)

source: REQ-PERSIST-7-b
held_out: true
Given a clean bare clone with a different class of non-git state unavailable (a host environment variable + a remote key-value cache)
When the input-provenance check runs over `redispatch` + `replay`
Then 0 non-git state is read — re-invocation succeeds from the git-tracked source alone
teeth: breaks-on "`redispatch` reads a host environment variable — re-invocation fails on a clean clone where that env is absent (non-git state was required)"
gen: conformance # held-out; `persist/ref/reinvoke.ts` input-provenance assertion — independent absent-state class

---

## REQ-PERSIST-8 — host adapter abstracts the forge

### REQ-PERSIST-8-a — host adapter abstracts the forge (happy)

### SCN-PERSIST-8a-1 — the forge is reached only through the adapter (happy)

source: REQ-PERSIST-8-a
Given a fake forge behind a `HostAdapter` exposing `attachToCommit` / `attachToPR` (+ reads), one implementation for the host
When those operations are exercised and the module graph is audited for direct forge-API call sites outside the adapter
Then every forge interaction went through the adapter — `readPR` reconstructs the projection; 0 direct forge calls
teeth: breaks-on "a caller reaches the forge API directly, bypassing the adapter — host coupling leaks outside the single adapter impl (no forge-agnosticism)"
gen: conformance # differential vs `persist/ref/host-adapter.ts` (fake-forge adapter)

### SCN-PERSIST-8a-2 — a second host's forge is reached only through its adapter (happy · held-out)

source: REQ-PERSIST-8-a
held_out: true
Given a second fake forge (a different host shape) behind a `HostAdapter` exposing `attachToCommit` / `attachToPR` (+ reads), one implementation for that host
When those operations are exercised and the module graph is audited for direct forge-API call sites outside the adapter
Then every forge interaction went through the adapter — `readPR` reconstructs the projection; 0 direct forge calls
teeth: breaks-on "a caller reaches the second host's forge API (its review-thread endpoint) directly, bypassing the adapter — host coupling leaks outside the single adapter impl"
gen: conformance # held-out; differential vs `persist/ref/host-adapter.ts` — independent host (the S4 host-adapter axis: one impl per host, each conformance-tested)

### REQ-PERSIST-8-b — configure notes push refspec (happy)

### SCN-PERSIST-8b-1 — the adapter's push carries `refs/notes/*` (happy)

source: REQ-PERSIST-8-b
Given the adapter's configured push refspec
When `push` runs
Then it carries `refs/notes/*` (i.e. `refs/notes/orchestra`) — notes leave the local repo
teeth: breaks-on "the adapter omits the `refs/notes/*` refspec — provenance notes never leave the local repo (a clone sees no notes)"
gen: conformance # `persist/ref/host-adapter.ts` push-refspec assertion

### SCN-PERSIST-8b-2 — the second host adapter's push carries `refs/notes/*` (happy · held-out)

source: REQ-PERSIST-8-b
held_out: true
Given the second host adapter's configured push refspec
When `push` runs
Then it carries `refs/notes/*` (i.e. `refs/notes/orchestra`) — notes leave the local repo
teeth: breaks-on "the second host's adapter omits the `refs/notes/*` refspec — provenance notes never leave the local repo (a clone of that host sees no notes)"
gen: conformance # held-out; `persist/ref/host-adapter.ts` push-refspec assertion — independent host adapter

### REQ-PERSIST-8-c — host PR data is a projection (guard)

### SCN-PERSIST-8c-1 — a bare clone fetches zero host-side PR data (guard)

source: REQ-PERSIST-8-c
Given host-side PR data (comments, review threads, the PR attachment surface)
When a bare `git clone` is taken
Then it yields **0** host-side PR data — the PR surface is a projection reconstructable from the git source
teeth: breaks-on "the adapter stores PR-only data that a bare clone cannot reconstruct — the clone is missing a datum (host data treated as canonical)"
gen: conformance # `persist/ref/host-adapter.ts` bare-clone reconstruction test

### SCN-PERSIST-8c-2 — a bare clone of the second host fetches zero host-side PR data (guard · held-out)

source: REQ-PERSIST-8-c
held_out: true
Given the second host's host-side PR data (comments, review threads, the PR attachment surface)
When a bare `git clone` is taken
Then it yields **0** host-side PR data — the PR surface is a projection reconstructable from the git source
teeth: breaks-on "the second host's adapter stores PR-only data that a bare clone cannot reconstruct — the clone is missing a datum (host data treated as canonical)"
gen: conformance # held-out; `persist/ref/host-adapter.ts` bare-clone reconstruction test — independent host adapter

---

## REQ-PERSIST-9 — portable open-JSON export, no lock-in

### REQ-PERSIST-9-a — portable open-JSON export (happy)

### SCN-PERSIST-9a-1 — export→import replays 1:1 (happy)

source: REQ-PERSIST-9-a
Given a store holding `{N, K, M}` (a node, a Knowledge fact, a Memory entry)
When `import(export(store))` is computed
Then `deepEqual(store, import(export(store)))` holds — the open-JSON dump replays 1:1 into a fresh store
teeth: breaks-on "export omits the version map — `import(export(store))` loses `M` and ≠ `store`"
gen: conformance # shares the KERNEL-6 portable (de)serializer mock `kernel/ref/portable.ts`

### SCN-PERSIST-9a-2 — export→import replays 1:1 for a store with an archived entry (happy · held-out)

source: REQ-PERSIST-9-a
held_out: true
Given a store holding `{N2, K2, a superseded pair (k, k'), an archived entry}` (a different content shape than `{N, K, M}`)
When `import(export(store))` is computed
Then `deepEqual(store, import(export(store)))` holds — the open-JSON dump replays 1:1 into a fresh store
teeth: breaks-on "export omits the archive set — `import(export(store))` loses the archived entry and ≠ `store`"
gen: conformance # held-out; shares the KERNEL-6 portable (de)serializer mock `kernel/ref/portable.ts` — independent store contents, different omitted map

### REQ-PERSIST-9-b — no lock-in on top of git (guard)

### SCN-PERSIST-9b-1 — the export dump carries zero lock-in encodings (guard)

source: REQ-PERSIST-9-b
Given the open-JSON export dump
When it is scanned for proprietary / host-only / lock-in encodings
Then the scan finds **0** — nothing is layered on top of git that a plain git store cannot replay
teeth: breaks-on "export embeds a proprietary lock-in encoding — the dump no longer replays into a plain git store (lock-in layered on git)"
gen: conformance # `kernel/ref/portable.ts` lock-in grep

### SCN-PERSIST-9b-2 — a second export dump carries zero lock-in encodings (guard · held-out)

source: REQ-PERSIST-9-b
held_out: true
Given the open-JSON export dump of the archive-bearing store above
When it is scanned for proprietary / host-only / lock-in encodings
Then the scan finds **0** — nothing is layered on top of git that a plain git store cannot replay
teeth: breaks-on "export embeds a host-only ref encoding — the dump no longer replays into a plain git store (lock-in layered on git)"
gen: conformance # held-out; `kernel/ref/portable.ts` lock-in grep — independent dump, different lock-in mutant

---

## REQ-PERSIST-10 — lossless large-object transcript

### REQ-PERSIST-10-a — transcript retained in full (happy)

### SCN-PERSIST-10a-1 — the transcript round-trips byte-for-byte (happy)

source: REQ-PERSIST-10-a
Given a transcript body `T` (the raw, unadulterated total context of the agent)
When `put(T) → hash` then `fetchTranscript(hash)`
Then `fetch(put(T)) ≡ T` byte-identical — never truncated, never lossily compressed
teeth: breaks-on "`put` truncates `T` to an N-KB cap — `fetch` returns a prefix ≠ `T` (the record is abridged)"
gen: conformance # differential vs `persist/ref/transcript-store.ts` (content-addressed `put`/`fetch`)

### SCN-PERSIST-10a-2 — a second transcript round-trips byte-for-byte (happy · held-out)

source: REQ-PERSIST-10-a
held_out: true
Given a different transcript body `T2` (the raw, unadulterated total context of another agent)
When `put(T2) → hash` then `fetchTranscript(hash)`
Then `fetch(put(T2)) ≡ T2` byte-identical — never truncated, never lossily compressed
teeth: breaks-on "`put` lossily gzip-compresses `T2` and drops a trailing byte on re-inflate — `fetch` returns bytes ≠ `T2` (the record is corrupted)"
gen: conformance # held-out; differential vs `persist/ref/transcript-store.ts` — independent body `T2`, different loss mutant (compression vs truncation)

### REQ-PERSIST-10-b — transcript is a content-addressed large object (happy)

### SCN-PERSIST-10-b-1 — the body is a fetch-on-demand large object (happy)

source: REQ-PERSIST-10-b
Given `T` stored via the large-object store
When git is inspected and the body is fetched on demand
Then git holds only `{sha, store}` and the full, lossless body resolves from the content-addressed large-object store on demand
teeth: breaks-on "the transcript body is inlined into a git object — there is no fetch-on-demand pointer (git carries the full body, not a CAS large object)"
gen: conformance # `persist/ref/transcript-store.ts` placement assertion

### SCN-PERSIST-10-b-2 — a second body is a fetch-on-demand large object (happy · held-out)

source: REQ-PERSIST-10-b
held_out: true
Given `T2` stored via the large-object store
When git is inspected and the body is fetched on demand
Then git holds only `{sha, store}` and the full, lossless `T2` resolves from the content-addressed large-object store on demand
teeth: breaks-on "`T2`'s body is inlined into a git object — there is no fetch-on-demand pointer (git carries the full body, not a CAS large object)"
gen: conformance # held-out; `persist/ref/transcript-store.ts` placement assertion — independent body `T2`

### REQ-PERSIST-10-c — only a pointer in git (happy)

### SCN-PERSIST-10-c-1 — git carries only the content-hash pointer (happy)

source: REQ-PERSIST-10-c
Given a transcript stored as a large object
When the git object is read
Then git carries **only** the transcript's content-hash pointer — not the body
teeth: breaks-on "git stores the raw body alongside the pointer — the pointer indirection is dropped (the body lives in git)"
gen: conformance # `persist/ref/transcript-store.ts` git-holds-only-pointer assertion

### SCN-PERSIST-10-c-2 — git carries only the second transcript's content-hash pointer (happy · held-out)

source: REQ-PERSIST-10-c
held_out: true
Given `T2` stored as a large object
When the git object is read
Then git carries **only** `T2`'s content-hash pointer — not the body
teeth: breaks-on "git stores `T2`'s raw body alongside the pointer — the pointer indirection is dropped (the body lives in git)"
gen: conformance # held-out; `persist/ref/transcript-store.ts` git-holds-only-pointer assertion — independent body `T2`

### REQ-PERSIST-10-d — future size mitigation stays lossless (guard)

### SCN-PERSIST-10-d-1 — any size mitigation is lossless and reversible (guard)

source: REQ-PERSIST-10-d
Given a future size-mitigation transform applied to transcript `T`
When `mitigate(T)` then `reverse(mitigate(T))` is computed
Then `reverse(mitigate(T)) ≡ T` byte-identical — the mitigation is lossless and reversible
teeth: breaks-on "the mitigation lossily compresses `T` — `reverse(mitigate(T)) ≠ T` (bytes are lost; mitigation is lossy)"
gen: conformance # `persist/ref/transcript-store.ts` reversibility round-trip

### SCN-PERSIST-10-d-2 — a second size mitigation is lossless and reversible (guard · held-out)

source: REQ-PERSIST-10-d
held_out: true
Given a different future size-mitigation transform applied to transcript `T2`
When `mitigate(T2)` then `reverse(mitigate(T2))` is computed
Then `reverse(mitigate(T2)) ≡ T2` byte-identical — the mitigation is lossless and reversible
teeth: breaks-on "the mitigation strips trailing whitespace from `T2` — `reverse(mitigate(T2)) ≠ T2` (bytes are lost; mitigation is lossy)"
gen: conformance # held-out; `persist/ref/transcript-store.ts` reversibility round-trip — independent body + mitigation, different loss mutant

---

## REQ-PERSIST-10a — no raw credential in the immutable object

> **Delegation note (billy / FR-12):** the credential **scanner** requirements — **REQ-PERSIST-10a-c** (server-side pre-receive
> hook) and **REQ-PERSIST-10a-d** (≥2 detection engines) — are the security-scanner **architecture / exploitability** domain,
> owned by **billy (FR-12)** (method-tags-pst.md §refuse-to-model: "the exploitability / adversarial-bypass proof is billy's").
> Per the S3 dispatch, PST does **not** author a scanner-detection golden for 10a-c / 10a-d. The three SCNs below cover the
> **persistence-side scrub oracle** only — the verification method S2 tagged (`persist/ref/scrub.ts`): no raw credential reaches
> the immutable object, redact-at-source is primary, and the scrub does not over-abridge. These three have teeth; the scanner
> pair is covered by domain delegation, not by omission.

### REQ-PERSIST-10a-a — no raw credential enters the object (guard)

### SCN-PERSIST-10a-a-1 — a seeded credential never reaches the content-addressed object (guard)

source: REQ-PERSIST-10a-a
Given a transcript buffer seeded with the raw credential `ghp_A1B2C3D4E5F6`
When `scrub(buffer)` runs before store — `store(scrub(seeded))`
Then the stored immutable object contains **0** occurrences of `ghp_A1B2C3D4E5F6`
teeth: breaks-on "`scrub` misses the credential's shape — `ghp_A1B2C3D4E5F6` reaches the content-addressed (immutable, git-propagated) object"
gen: conformance # differential vs `persist/ref/scrub.ts` (the redact-at-source oracle, reused in transcript-buffer unit tests)

### SCN-PERSIST-10a-a-2 — a second seeded credential never reaches the content-addressed object (guard · held-out)

source: REQ-PERSIST-10a-a
held_out: true
Given a transcript buffer seeded with a different raw credential `ghp_9Q8W7E6R5T4Y` inside an `Authorization: token <secret>` header line
When `scrub(buffer)` runs before store — `store(scrub(seeded))`
Then the stored immutable object contains **0** occurrences of `ghp_9Q8W7E6R5T4Y`
teeth: breaks-on "`scrub` misses this credential instance — `ghp_9Q8W7E6R5T4Y` reaches the content-addressed (immutable, git-propagated) object"
gen: conformance # held-out; differential vs `persist/ref/scrub.ts` — independent secret value + buffer context (defeats hard-coding the fixture-1 literal; same known-shape family, no new behaviour)

### REQ-PERSIST-10a-b — redact-at-source is the primary control (guard)

### SCN-PERSIST-10a-b-1 — the buffer never admits the raw credential (guard)

source: REQ-PERSIST-10a-b
Given the framework about to write the raw credential `ghp_A1B2C3D4E5F6` into the transcript buffer
When the redact-at-source control runs at write time
Then the buffer never admits the raw credential — it is redacted **before** entering, not after persistence
teeth: breaks-on "redaction runs only after the buffer is persisted — the raw credential entered the buffer first (redact-at-source bypassed; the primary control is a post-hoc scan)"
gen: conformance # `persist/ref/scrub.ts` at-source (pre-buffer) assertion

### SCN-PERSIST-10a-b-2 — the buffer never admits the second raw credential (guard · held-out)

source: REQ-PERSIST-10a-b
held_out: true
Given the framework about to write the raw credential `ghp_9Q8W7E6R5T4Y` into the transcript buffer
When the redact-at-source control runs at write time
Then the buffer never admits the raw credential — it is redacted **before** entering, not after persistence
teeth: breaks-on "redaction runs only after the buffer is persisted — `ghp_9Q8W7E6R5T4Y` entered the buffer first (redact-at-source bypassed; the primary control is a post-hoc scan)"
gen: conformance # held-out; `persist/ref/scrub.ts` at-source (pre-buffer) assertion — independent secret value

### REQ-PERSIST-10a-e — scrub does not abridge the record (guard)

### SCN-PERSIST-10a-e-1 — non-secret bytes adjacent to a secret are preserved (guard)

source: REQ-PERSIST-10a-e
Given a buffer with the secret `ghp_A1B2C3D4E5F6` surrounded by non-secret bytes `"... token=<secret> in call log line 42 ..."`
When `scrub` redacts the secret
Then every non-secret byte is preserved — only the secret is redacted (0 over-redaction)
teeth: breaks-on "`scrub` over-redacts — a non-secret byte adjacent to the secret (`line 42`) is dropped (the record is abridged beyond the secret)"
gen: conformance # `persist/ref/scrub.ts` preserve-non-secret assertion

### SCN-PERSIST-10a-e-2 — non-secret bytes adjacent to a second secret are preserved (guard · held-out)

source: REQ-PERSIST-10a-e
held_out: true
Given a buffer with the secret `ghp_9Q8W7E6R5T4Y` surrounded by non-secret bytes `"... Authorization: Bearer <secret> issued at 09:14 UTC ..."`
When `scrub` redacts the secret
Then every non-secret byte is preserved — only the secret is redacted (0 over-redaction)
teeth: breaks-on "`scrub` over-redacts — a non-secret byte adjacent to the secret (`09:14 UTC`) is dropped (the record is abridged beyond the secret)"
gen: conformance # held-out; `persist/ref/scrub.ts` preserve-non-secret assertion — independent secret value + surrounding context

---

## REQ-PERSIST-10b — replay ≠ resume

### REQ-PERSIST-10b-a — never claim deterministic resume (guard)

### SCN-PERSIST-10b-a-1 — no deterministic-resume API exists on the surface (guard)

source: REQ-PERSIST-10b-a
Given the re-invoke API surface
When a structural check scans for an API named/typed as a deterministic resume-from-where-it-stopped
Then it finds **0** — the non-deliverable "resume from exactly where it stopped" is neither offered nor claimed
teeth: breaks-on "a `resume(agent)` API claims to continue from exactly where the agent stopped — the non-deliverable deterministic-resume claim is present on the surface"
gen: conformance # `persist/ref/reinvoke.ts` structural no-resume assertion

### SCN-PERSIST-10b-a-2 — no differently-named deterministic-resume API exists on the surface (guard · held-out)

source: REQ-PERSIST-10b-a
held_out: true
Given the re-invoke API surface
When a structural check scans for a differently-named/typed deterministic resume (`continueFrom` / `resumeAt`, a resume-from-checkpoint-step)
Then it finds **0** — the non-deliverable "resume from exactly where it stopped" is neither offered nor claimed under any alias
teeth: breaks-on "a `continueFrom(agent, step)` API claims to continue from an exact recorded step — the non-deliverable deterministic-resume claim is present under an alias"
gen: conformance # held-out; `persist/ref/reinvoke.ts` structural no-resume assertion — independent surface probe (aliased resume)

### REQ-PERSIST-10b-b — idempotent redispatch of the seat (happy)

### SCN-PERSIST-10b-b-1 — the same brief maps to the same seat twice (happy)

source: REQ-PERSIST-10b-b
Given a seat brief `B`
When `redispatch(B)` is run twice
Then both invocations map to the **same** seat (idempotent redispatch, A-18)
teeth: breaks-on "`redispatch(B)` yields a different seat on the second call — the same brief maps to two seats (non-idempotent)"
gen: conformance # differential vs `persist/ref/reinvoke.ts` (shared with PERSIST-7)

### SCN-PERSIST-10b-b-2 — a second brief maps to the same seat twice (happy · held-out)

source: REQ-PERSIST-10b-b
held_out: true
Given a different seat brief `B2`
When `redispatch(B2)` is run twice
Then both invocations map to the **same** seat (idempotent redispatch, A-18)
teeth: breaks-on "`redispatch(B2)` yields a different seat on the second call — the same brief maps to two seats (non-idempotent)"
gen: conformance # held-out; differential vs `persist/ref/reinvoke.ts` — independent brief `B2`

### REQ-PERSIST-10b-c — faithful replay of the transcript (happy)

### SCN-PERSIST-10b-c-1 — replay re-feeds the recorded I/O, not the live model (happy)

source: REQ-PERSIST-10b-c
Given a recorded `Checkpoint{seatBrief, llmOutputs[], toolIO[]}`
When `replay(checkpoint)` runs
Then it re-feeds the recorded LLM outputs + tool I/O faithfully — the replay reproduces the record
teeth: breaks-on "`replay` re-invokes the live LLM instead of re-feeding the recorded outputs — the replay diverges from the recorded transcript (not faithful)"
gen: conformance # `persist/ref/reinvoke.ts` replay-fidelity assertion

### SCN-PERSIST-10b-c-2 — replay of a second checkpoint re-feeds recorded I/O, not the live model (happy · held-out)

source: REQ-PERSIST-10b-c
held_out: true
Given a different recorded `Checkpoint{seatBrief, llmOutputs[], toolIO[]}` (another seat's recording)
When `replay(checkpoint)` runs
Then it re-feeds the recorded LLM outputs + tool I/O faithfully — the replay reproduces the record
teeth: breaks-on "`replay` re-invokes the live LLM for this checkpoint instead of re-feeding the recorded outputs — the replay diverges from the recorded transcript (not faithful)"
gen: conformance # held-out; `persist/ref/reinvoke.ts` replay-fidelity assertion — independent checkpoint

### REQ-PERSIST-10b-d — re-invoke substrate is a Checkpoint (happy)

### SCN-PERSIST-10b-d-1 — the substrate is a Checkpoint distinct from the raw transcript (happy)

source: REQ-PERSIST-10b-d
Given the re-invoke substrate
When its type is inspected
Then it is a structured `Checkpoint{seatBrief, llmOutputs[], toolIO[]}` — **distinct** from the full raw transcript large object
teeth: breaks-on "re-invoke reads the full raw transcript as its substrate — the `Checkpoint` is not distinct (replay is coupled to the raw transcript object)"
gen: conformance # `persist/ref/reinvoke.ts` structural Checkpoint-distinctness assertion

### SCN-PERSIST-10b-d-2 — a second seat's substrate is a Checkpoint distinct from the raw transcript (happy · held-out)

source: REQ-PERSIST-10b-d
held_out: true
Given a second seat's re-invoke substrate
When its type is inspected
Then it is a structured `Checkpoint{seatBrief, llmOutputs[], toolIO[]}` — **distinct** from the full raw transcript large object
teeth: breaks-on "re-invoke reads the full raw transcript as its substrate for this seat — the `Checkpoint` is not distinct (replay coupled to the raw transcript object)"
gen: conformance # held-out; `persist/ref/reinvoke.ts` structural Checkpoint-distinctness assertion — independent seat

---

## REQ-PERSIST-11 — branch-merge = event-set union + re-fold (FSPEC-merge · formal → PBT / residue / conformance)

> **Consumer of `FSPEC-merge` §PERSIST-11 — NOT a second model.** `mergeAtlas = fold(RefLog.merge(ours, theirs))`.
> Direction-independence (11-e) is the KERNEL-11 **commutativity** law applied at the git seam. The witness below **reverses
> the colliding ours/theirs pair** (e1↔e2, same nodeKey, colliding `seq=5`) so a last-writer-wins / direction-dependent mutant
> genuinely diverges — mirroring the KRN pilot's SCN-KERNEL-11-1 teeth-fix.

### REQ-PERSIST-11-a — merge never line-merges the log (guard)

### SCN-PERSIST-11a-1 — the log path is not text/line-merged (guard)

source: REQ-PERSIST-11-a
Given branches `ours` and `theirs` that both modify the atlas-log path, with `.gitattributes: <atlas-log> merge=orchestra-atlas` registered
When git merges the two branches
Then the log is handled by the registered driver (set-union + re-fold), **not** line-merged as text — no line-splice occurs
teeth: breaks-on "the log path has no merge driver and git line-merges it as text — a line from `ours` and a line from `theirs` splice into one corrupt event"
gen: conformance # driver-registration + no-line-splice assertion (reuses the KERNEL-12 JSONL floor)

### SCN-PERSIST-11a-2 — a second branch pair's log path is not text/line-merged (guard · held-out)

source: REQ-PERSIST-11-a
held_out: true
Given branches `feat` and `main` that both modify the atlas-log path, with `.gitattributes: <atlas-log> merge=orchestra-atlas` registered
When git merges the two branches
Then the log is handled by the registered driver (set-union + re-fold), **not** line-merged as text — no line-splice occurs
teeth: breaks-on "the log path has no merge driver and git line-merges it as text — a line from `feat` and a line from `main` splice into one corrupt event"
gen: conformance # held-out; driver-registration + no-line-splice assertion (KERNEL-12 JSONL floor) — independent branch pair

### REQ-PERSIST-11-b — driver unions by content-hash and re-folds (happy)

### SCN-PERSIST-11b-1 — the driver unions the two event sets by content-hash (happy)

source: REQ-PERSIST-11-b
Given `ours` log `{e1, e2}` and `theirs` log `{e2, e3}` (e2 shared by content-hash id `id-c3d1`)
When the `merge=orchestra-atlas` driver runs — `RefLog.merge(ours, theirs)` then `fold`
Then the union is exactly `{e1, e2, e3}` (`size = 3`), e2 deduped by content-hash, then re-folded — nothing dropped or duplicated
teeth: breaks-on "the driver concatenates the two logs — e2 appears twice (`size = 4`); or it keeps only one branch's log and drops e1"
gen: PBT # witness of `merge = set-union on the id` at the git seam (`RefLog.merge`; = KERNEL-9c consumed)

### REQ-PERSIST-11-c — colliding seq is never a conflict (guard)

### SCN-PERSIST-11c-1 — a cross-branch `seq=5` collision is not a conflict (guard)

source: REQ-PERSIST-11-c
Given `ours` writes e1 (`seq=5`) and `theirs` writes e2 (`seq=5`) — a genuine cross-branch positional-`seq` collision (distinct content ids `id-a7f0` ≠ `id-c3d1`)
When the driver merges the two logs
Then the shared `seq=5` does **not** surface as a git conflict — both events are retained (`size = 2`), `seq` being outside the algebra
teeth: breaks-on "the driver treats colliding `seq` as a conflict — the merge halts with a `<<<<<<<` conflict (or collapses the two `seq=5` events to one slot, losing an event)"
gen: PBT # witness of seq-collision-≠-identity at the git seam (= KERNEL-9e consumed)

### REQ-PERSIST-11-d — shared nodeKey resolves by fold-merge (happy)

### SCN-PERSIST-11d-1 — a nodeKey written on both branches resolves by mergeNode, never by hand (happy)

source: REQ-PERSIST-11-d
Given nodeKey `claim:acme-arr-2024` written on both branches — `ours` e1 (`1c9f2a`), `theirs` e2 (`7e40bb`)
When the driver merges
Then the nodeKey resolves by the deterministic KERNEL-10 `mergeNode`: `entries = {1c9f2a, 7e40bb}`, head = max-by-contentHash = e2 — **never by a hand edit**
teeth: breaks-on "the driver surfaces the shared nodeKey as a manual `<<<<<<<` conflict instead of fold-merging — resolution requires a hand edit (violating deterministic fold-merge)"
gen: PBT # witness of `mergeNode` at the git seam (= KERNEL-10a consumed)

### REQ-PERSIST-11-e — merge is direction-independent (happy) ⭐ the reversible colliding-pair witness

### SCN-PERSIST-11e-1 — mergeAtlas(ours,theirs) ≡ mergeAtlas(theirs,ours) byte-identical (happy)

source: REQ-PERSIST-11-e
Given `ours` writes e1 (`1c9f2a`) and `theirs` writes e2 (`7e40bb`) on the **same** nodeKey `claim:acme-arr-2024`, at the **colliding `seq=5`** — the reversible colliding pair
When both merge directions are computed — `mergeAtlas(ours, theirs)` **and** `mergeAtlas(theirs, ours)` (the colliding pair reversed)
Then both serialize (KERNEL-1 canonicalizer, sorted keys) to the **same bytes** — `entries = {1c9f2a, 7e40bb}`, head = max-by-contentHash = **e2** in **both** directions (0 lost events)
teeth: breaks-on "the merge is last-writer-wins by branch order — `mergeAtlas(ours,theirs)` heads **e2** (theirs applied last) while `mergeAtlas(theirs,ours)` heads **e1** (ours applied last), so the two directions diverge byte-wise (a direction-dependent / seq-as-conflict merge)"
gen: PBT # witness of the commutativity law `mergeAtlas(a,b) ≡ mergeAtlas(b,a)` — the KERNEL-11 property at the git seam (fspec §PERSIST-11)

### REQ-PERSIST-11-f — merge driver self-installing (happy)

### SCN-PERSIST-11f-1 — a fresh clone re-registers the driver with no manual step (happy)

source: REQ-PERSIST-11-f
Given a fresh `git clone` of an Atlas repo (the merge driver lives in `.git/config`, which does not clone)
When the setup hook runs on init/clone
Then `git config merge.orchestra-atlas.driver` is registered **and** `.gitattributes` carries `<atlas-log> merge=orchestra-atlas` — with no manual step
teeth: breaks-on "the driver requires a manual `git config` invocation — a fresh clone leaves `merge.orchestra-atlas` unregistered and silently falls back to text merge"
gen: residue # no pure-function oracle — hand-written integration test, delegated here from KERNEL-12a (method-tags-pst.md §FSPEC-merge)

### REQ-PERSIST-11-g — bypassed driver loses no event (guard)

### SCN-PERSIST-11g-1 — a plain 3-way text merge degrades to a lossless id-union (guard)

source: REQ-PERSIST-11-g
Given branch `ours` JSONL log `[line(e1), line(e2)]` and branch `theirs` `[line(e2), line(e3)]` (one content-keyed event per line), merged by git's **default 3-way text** merge on an un-configured clone (driver bypassed)
When the merged file is re-folded — `fold(lineMerge(ours, theirs))`
Then no event is lost or corrupted — `lineMerge = dedup-by-id(lines(ours) ∪ lines(theirs))`, worst case a harmless duplicate line the fold dedups by id, and `re-fold(lineMerge) ≡ fold(RefLog.merge)`
teeth: breaks-on "the log is stored as a single nested JSON array line — the 3-way text merge splices e1 and e3 into one corrupt line and `fold` fails to parse (an event is lost/corrupted)"
gen: conformance # `lineMerge` reuses the `FSPEC-merge` `RefLog.merge` reducer as its mock (anti-rot floor; = KERNEL-12b consumed)

### SCN-PERSIST-11g-2 — a second bypassed 3-way text merge degrades to a lossless id-union (guard · held-out)

source: REQ-PERSIST-11-g
held_out: true
Given branch `ours` JSONL log `[line(e1), line(e3)]` and branch `theirs` `[line(e1), line(e2)]` (one content-keyed event per line, e1 shared), merged by git's **default 3-way text** merge on an un-configured clone (driver bypassed)
When the merged file is re-folded — `fold(lineMerge(ours, theirs))`
Then no event is lost or corrupted — `lineMerge = dedup-by-id(lines(ours) ∪ lines(theirs)) = {e1,e2,e3}`, the `claim:acme-arr-2024` node = union `{1c9f2a, 7e40bb}` with head = **max-by-contentHash = e2**, and `re-fold(lineMerge) ≡ fold(RefLog.merge)`
teeth: breaks-on "the log is stored as a single nested JSON array line — the 3-way text merge splices e2 and e3 into one corrupt line and `fold` fails to parse (an event is lost/corrupted)"
gen: conformance # held-out; `lineMerge` reuses `FSPEC-merge` `RefLog.merge` (= KERNEL-12b) — independent line sets, max-by-contentHash head-rule (head = e2) preserved

---

## REQ-PERSIST-12 — reorder invariance on non-linear history (PBT · reuses `FSPEC-merge` `fold`)

### REQ-PERSIST-12-a — rebase leaves AtlasState byte-identical (happy)

### SCN-PERSIST-12a-1 — a rebase reordering the colliding pair leaves AtlasState byte-identical (happy)

source: REQ-PERSIST-12-a
Given the event set `S = {e1, e2, e3}` folded to `AtlasState` `A` (e1, e2 collide on `claim:acme-arr-2024`)
When a rebase / cherry-pick reorders and re-parents the commits carrying `S`, **reversing the colliding e1/e2 pair**
Then `serialize(fold(reorder(S))) ≡ serialize(fold(S)) = A` byte-identical — the fold is over the set, not the commit sequence
teeth: breaks-on "the fold keys on commit order / parentage — the rebased (reversed) order heads e1 for the `arr` node while the original heads e2, so `AtlasState` diverges"
gen: PBT # `serialize(fold(reorder(S))) ≡ serialize(fold(S))` over arbitrary permutations / re-parentings (= KERNEL-9/11 at the rebase seam)

### REQ-PERSIST-12-b — rewind holds on non-linear history (happy)

### SCN-PERSIST-12b-1 — rewinding a PR rewinds Atlas on branch/merge/rebase history (happy)

source: REQ-PERSIST-12-b
Given a PR whose events `P = {e2}` sit on **non-linear** history (a branch merged, then rebased), with the full set folded to `A`
When the PR is rewound — its event subset `P` removed — and the remainder is re-folded `fold(S \ P)`
Then Atlas rewinds correspondingly to `fold({e1, e3})` — "rewind a PR ⇒ Atlas rewinds" holds on non-linear history, not only a linear log
teeth: breaks-on "rewind only works on a linear log — on branch/merge/rebase history the PR's events aren't identified/removed and Atlas fails to rewind (stale e2 remains)"
gen: PBT # rewind = set-difference then re-fold, order/parentage-independent (= KERNEL-9 decoupled at the git seam)

---

## REQ-PERSIST-13 — trailer-canonical clone-presence; notes are a mutable overlay

### REQ-PERSIST-13-a — clone-required datum lives in a trailer (happy)

### SCN-PERSIST-13a-1 — a clone-required datum reads from the trailer after a bare clone (happy)

source: REQ-PERSIST-13-a
Given a datum `D` that MUST be present in any clone
When `D` is placed and a bare clone (no note refspec) reads it
Then `D` reads from the **commit trailer** (it travels inside the commit object) — present in the clone
teeth: breaks-on "`D` is stored only in a git note — a bare clone with no note refspec has no `D` (a clone-required datum is missing)"
gen: conformance # differential vs `persist/ref/placement.ts` (trailer-vs-note placement oracle)

### SCN-PERSIST-13a-2 — a second clone-required datum reads from the trailer after a bare clone (happy · held-out)

source: REQ-PERSIST-13-a
held_out: true
Given a different datum `D2` (a WP verdict that MUST be present in any clone)
When `D2` is placed and a bare clone (no note refspec) reads it
Then `D2` reads from the **commit trailer** (it travels inside the commit object) — present in the clone
teeth: breaks-on "`D2` is stored only in a git note — a bare clone with no note refspec has no `D2` (a clone-required datum is missing)"
gen: conformance # held-out; differential vs `persist/ref/placement.ts` — independent datum `D2`

### REQ-PERSIST-13-b — trailer survives a history rewrite (happy)

### SCN-PERSIST-13b-1 — the trailer travels onto the rewritten SHA (happy)

source: REQ-PERSIST-13-b
Given datum `D` in a commit trailer on commit `SHA1`
When a history rewrite (rebase) produces a new commit `SHA2`
Then `D`'s trailer travels inside the commit object onto `SHA2` — `D` survives the rewrite
teeth: breaks-on "the rewrite drops the trailer — `D` is lost on the new `SHA2` (trailer did not survive the rewrite)"
gen: conformance # `persist/ref/placement.ts` rewrite-carry assertion

### SCN-PERSIST-13b-2 — the trailer travels onto a squash-rewritten SHA (happy · held-out)

source: REQ-PERSIST-13-b
held_out: true
Given datum `D2` in a commit trailer on commit `SHA3`
When a history rewrite (**squash**) produces a new commit `SHA4`
Then `D2`'s trailer travels inside the commit object onto `SHA4` — `D2` survives the rewrite
teeth: breaks-on "the squash drops the trailer — `D2` is lost on the new `SHA4` (trailer did not survive the rewrite)"
gen: conformance # held-out; `persist/ref/placement.ts` rewrite-carry assertion — independent datum + rewrite op (squash, not rebase)

### REQ-PERSIST-13-c — notes present only once refspec configured (guard)

### SCN-PERSIST-13c-1 — note-carried data is absent until the refspec is configured (guard)

source: REQ-PERSIST-13-c
Given note-carried data and an adapter that has **not** configured the fetch/push refspec (PERSIST-8)
When a clone reads
Then the note-carried data is absent — notes are a perimeter-conditional mutable overlay, so a **clone-required** datum must not depend on one
teeth: breaks-on "the placement model marks note-carried data as clone-present without a configured refspec — a clone-required datum placed in a note passes the check, then is missing in a bare clone"
gen: conformance # `persist/ref/placement.ts` refspec-conditional presence assertion

### SCN-PERSIST-13c-2 — a second note-carried datum is absent until the refspec is configured (guard · held-out)

source: REQ-PERSIST-13-c
held_out: true
Given a different note-carried datum and an adapter that has **not** configured the fetch/push refspec (PERSIST-8)
When a clone reads
Then the note-carried datum is absent — notes are a perimeter-conditional mutable overlay, so a **clone-required** datum must not depend on one
teeth: breaks-on "the placement model marks this note-carried datum as clone-present without a configured refspec — a clone-required datum placed in a note passes the check, then is missing in a bare clone"
gen: conformance # held-out; `persist/ref/placement.ts` refspec-conditional presence assertion — independent datum

### REQ-PERSIST-13-d — a rewrite orphans note-carried data (guard)

### SCN-PERSIST-13d-1 — a rewrite orphans the note (it keys on the old SHA) (guard)

source: REQ-PERSIST-13-d
Given note-carried data keyed on commit `SHA1`
When a rebase / squash / cherry-pick rewrites `SHA1 → SHA2`
Then the note is **orphaned** — it keys on `SHA1` and is not carried onto `SHA2` (which is exactly why clone-required data lives in a trailer, not a note)
teeth: breaks-on "the placement model carries the note onto `SHA2` (falsely modelling notes as rewrite-durable) — masking that a note-only datum is actually orphaned by the rewrite"
gen: conformance # `persist/ref/placement.ts` note-orphan assertion

### SCN-PERSIST-13d-2 — a cherry-pick rewrite orphans the note (it keys on the old SHA) (guard · held-out)

source: REQ-PERSIST-13-d
held_out: true
Given note-carried data keyed on commit `SHA3`
When a **cherry-pick** rewrites `SHA3 → SHA4`
Then the note is **orphaned** — it keys on `SHA3` and is not carried onto `SHA4` (which is exactly why clone-required data lives in a trailer, not a note)
teeth: breaks-on "the placement model carries the note onto `SHA4` (falsely modelling notes as cherry-pick-durable) — masking that a note-only datum is actually orphaned by the rewrite"
gen: conformance # held-out; `persist/ref/placement.ts` note-orphan assertion — independent SHA pair + rewrite op (cherry-pick)

---

## REQ-PERSIST-14 — version-delta = read-only fold-diff (PBT · reuses `FSPEC-merge` `fold`)

> **Consumer of the `FSPEC-merge` `fold`, NOT a second model.** `diff(shaA,shaB) = partition(fold(shaA), fold(shaB))`.
> The delta is a **read-only fold-comparison** over the two folded AtlasStates (grounds on KERNEL-5/PERSIST-2 fold +
> PERSIST-5 archive/supersede/decay lifecycle) — it materializes nothing (ADR-P14: not a stored diff). The order-
> independence witness reuses the PERSIST-2/12 convergence law: shuffling either side's fold order cannot move the delta.
>
> Concrete two-version fixture (facts folded at each sha; `prov` = the WP/commit that produced the change):
>
> | fact (nodeKey)        | at shaA              | at shaB                      | delta class      | prov        |
> | --------------------- | -------------------- | ---------------------------- | ---------------- | ----------- |
> | `claim:acme-arr-2024` | "$4.2M" (grounded)   | "$4.5M" (re-grounded)        | **edited**       | `WP-a2@sha` |
> | `claim:acme-ceo`      | — (absent)           | "Jane Roe" (grounded)        | **added**        | `WP-a4@sha` |
> | `claim:acme-vp`       | — (absent)           | "Bob Lee" (grounded)         | **added**        | `WP-a5@sha` |
> | `pred:auth-token-ttl` | v1 (advisory)        | superseded by v2             | **superseded**   | `WP-a7@sha` |
> | `claim:acme-hq-2019`  | present (frecency≈0) | archived (out of active set) | **decayed**      | `WP-a9@sha` |
> | `claim:acme-hq`       | "NYC"                | "NYC" (unchanged)            | _(no partition)_ | —           |
>
> ⇒ `diff(shaA,shaB) = { added:[acme-ceo, acme-vp], edited:[acme-arr-2024], superseded:[auth-token-ttl], decayed:[acme-hq-2019] }`,
> `acme-hq` in no partition (unchanged). Each entry carries its `prov`.

### REQ-PERSIST-14-a — version-delta partitioned by lifecycle (happy)

### SCN-PERSIST-14a-1 — diff partitions the changed facts into the four lifecycle classes (happy)

source: REQ-PERSIST-14-a
Given the two folded versions `A = fold(shaA)`, `B = fold(shaB)` of the fixture above
When `diff(shaA,shaB)` is computed
Then the delta partitions the changed facts into exactly `added:[acme-ceo, acme-vp]`, `edited:[acme-arr-2024]`, `superseded:[auth-token-ttl]`, `decayed:[acme-hq-2019]` — a total, disjoint partition; the unchanged `acme-hq` is in **0** partitions
teeth: breaks-on "the diff collapses `superseded` into `edited` (or omits the `decayed` class) — `auth-token-ttl` is misfiled as an edit and `acme-hq-2019` is dropped, so the partition is neither total nor disjoint"
gen: PBT # partition-totality/disjointness over the set-diff of the two `fold` outputs (oracle = FSPEC-merge `fold`, `kernel/ref/fold.ts`)

### REQ-PERSIST-14-b — delta is a fold-comparison, not a stored diff (happy)

### SCN-PERSIST-14b-1 — the delta is recomputed from the two folds, never read from a materialized diff (happy)

source: REQ-PERSIST-14-b
Given no stored/materialized diff object exists anywhere in the store, only the event log at `shaA` and `shaB`
When `diff(shaA,shaB)` is computed purely as `partition(fold(shaA), fold(shaB))`
Then the delta is produced by comparing the two folded AtlasStates on the fly — there is no second, stored source of truth to drift from the fold (ADR-P14)
teeth: breaks-on "the diff reads a persisted `delta` blob instead of re-folding — a stale materialized diff (that the log has since moved past) is served, diverging from `partition(fold(shaA),fold(shaB))`"
gen: PBT # `diff(shaA,shaB) ≡ partition(fold(shaA),fold(shaB))` — the read-only fold-diff, no stored diff

### REQ-PERSIST-14-c — every delta entry carries its provenance (guard)

### SCN-PERSIST-14c-1 — a provenance-less entry never surfaces in the delta (guard)

source: REQ-PERSIST-14-c
Given the fixture where every changed fact has a recoverable `prov` (the WP/commit that produced it)
When `diff(shaA,shaB)` builds each partition entry
Then every entry carries its `prov` (`entriesMissingProvenance == 0`) — a fact with no recoverable provenance is not surfaced as a bare, provenance-less entry
teeth: breaks-on "the diff emits `edited:[acme-arr-2024]` with an empty `prov` — a provenance-less entry surfaces (the auditor cannot trace the change to its WP/commit)"
gen: conformance # differential vs `persist/ref/diff.ts` (each partition entry carries `prov`)

### SCN-PERSIST-14c-2 — a second delta entry (an `added` fact) carries its provenance (guard · held-out)

source: REQ-PERSIST-14-c
held_out: true
Given the fixture where the added fact `claim:acme-ceo` has a recoverable `prov = WP-a4@sha` (the WP/commit that produced it)
When `diff(shaA,shaB)` builds the `added` partition entry
Then the entry carries its `prov` (`entriesMissingProvenance == 0`) — a fact with no recoverable provenance is not surfaced as a bare, provenance-less entry
teeth: breaks-on "the diff emits `added:[acme-ceo]` with an empty `prov` — a provenance-less added entry surfaces (the auditor cannot trace the change to its WP/commit)"
gen: conformance # held-out; differential vs `persist/ref/diff.ts` — independent partition entry (an `added` fact, not the fixture-1 `edited` fact)

### REQ-PERSIST-14-d — diff is a pure read, zero mutation (guard)

### SCN-PERSIST-14d-1 — computing the diff mutates no Atlas state (guard)

source: REQ-PERSIST-14-d
Given the store at `{shaA, shaB}` serialized to bytes `Σ` before the diff
When `diff(shaA,shaB)` is invoked and `Σ'` is re-serialized after
Then `Σ' ≡ Σ` byte-identical — the diff is a PURE READ, it writes/archives/decays nothing (`mutations == 0`)
teeth: breaks-on "the diff writes a `lastDiffedAt` marker (or archives the decayed fact as a side-effect) — the store bytes change after a read-only projection (`Σ' ≠ Σ`)"
gen: conformance # `persist/ref/diff.ts` store-unchanged assertion (structural no-mutation)

### SCN-PERSIST-14d-2 — computing a second diff over an independent store mutates nothing (guard · held-out)

source: REQ-PERSIST-14-d
held_out: true
Given an independent two-version store holding only `{claim:acme-vp (added at shaB), claim:acme-hq (unchanged)}` serialized to bytes `Σ` before the diff
When `diff(shaA,shaB)` is invoked and `Σ'` is re-serialized after
Then `Σ' ≡ Σ` byte-identical — the diff is a PURE READ, it writes/archives/decays nothing (`mutations == 0`)
teeth: breaks-on "the diff writes a `lastDiffedAt` marker into the store as a side-effect — the store bytes change after a read-only projection (`Σ' ≠ Σ`)"
gen: conformance # held-out; `persist/ref/diff.ts` store-unchanged assertion — independent (smaller) two-version store

### REQ-PERSIST-14-e — diff is byte-identical across runs (guard)

### SCN-PERSIST-14e-1 — the same two shas diff to the same bytes twice (guard)

source: REQ-PERSIST-14-e
Given the same two shas `(shaA, shaB)`
When `diff(shaA,shaB)` is serialized on two independent runs
Then the two deltas are byte-identical (`serialize(diff₁) ≡ serialize(diff₂)`) — within each partition the entries are emitted in canonical `nodeKey` order (`acme-ceo` before `acme-vp`), so determinism holds across runs
teeth: breaks-on "the diff orders the 2-element `added:[acme-ceo, acme-vp]` partition by wall-clock discovery time instead of `nodeKey` — the two runs emit the two `added` entries in different orders and diverge byte-wise"
gen: PBT # `serialize(diff(shaA,shaB))` invariant across runs (determinism)

### REQ-PERSIST-14-f — diff is well-defined regardless of fold/event order (guard)

### SCN-PERSIST-14f-1 — shuffling either side's fold order leaves the delta byte-identical (guard)

source: REQ-PERSIST-14-f
Given the event sets `S1` (at shaA) and `S2` (at shaB), each foldable in any arrival order (KERNEL-11 / PERSIST-2/12)
When the delta is computed as `partition(fold(shuffle(S1)), fold(shuffle(S2)))` and compared to `partition(fold(S1), fold(S2))`
Then the two deltas serialize byte-identically — the diff is well-defined regardless of fold/event order (a rebase across the range leaves the diff stable)
teeth: breaks-on "the diff keys on the arrival/commit order of the events (e.g. positional `seq`) — shuffling `S2`'s order flips `acme-arr-2024` between `edited` and `unchanged`, so the reordered delta diverges"
gen: PBT # `partition(fold(shuffle(S1)),fold(shuffle(S2))) ≡ partition(fold(S1),fold(S2))` — the KERNEL-11 convergence law at the diff seam

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 52/54 REQ have ≥1 SCN. The **2** un-authored (**REQ-PERSIST-10a-c** server-side pre-receive hook, **REQ-PERSIST-10a-d** ≥2 detection engines) are **domain-delegated to billy / FR-12** (credential-scanner architecture; method-tags-pst.md §refuse-to-model + dispatch directive) — covered by delegation, not omitted. Every non-delegated behavioural REQ is covered. (**+6** from PERSIST-14: 14-a..14-f all covered.)
- **Guard coverage:** 21/21 unwanted / If-then / While REQ have a guard SCN — 1-b, 2-c, 4-c, 5-a, 7-b, 8-c, 9-b, 10-d, 10a-a, 10a-b, 10a-e, 10b-a, 11-a, 11-c, 11-g, 13-c, 13-d, **14-c, 14-d, 14-e, 14-f**.
- **Teeth (Gate 3):** 52/52 authored SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous. The formal-cluster (PERSIST-11) witnesses are **interesting**: a real cross-branch `seq=5` collision (11-c), a real both-branches nodeKey collision (11-d), and the **reversible colliding ours/theirs pair** for direction-independence (11-e) — no antecedent-failure passes. The **PERSIST-14** witnesses are equally interesting: a real four-class partition (14-a), a real stored-diff-vs-refold divergence (14-b), and the **order-shuffle** for fold-independence (14-f) — the shuffled delta genuinely diverges on an order-keyed mutant.
- **PERSIST-11-e witness reverses the colliding pair:** yes — e1 (`1c9f2a`, ours) ↔ e2 (`7e40bb`, theirs) on the same nodeKey at colliding `seq=5`; a last-writer-wins mutant heads e2 in `(ours,theirs)` but e1 in `(theirs,ours)`, so the two directions diverge byte-wise → the golden flips to BROKEN. Teeth are real (mirrors the KRN SCN-KERNEL-11-1 teeth-fix).
- **gen histogram:** PBT **17** (2-a/2-b/2-c · 5-a/5-b/5-c/5-d · 11-b/11-c/11-d/11-e · 12-a/12-b · 14-a/14-b/14-e/14-f) · conformance **34** (1-a/1-b/3-a/3-b/4-a/4-b/4-c/6/7-a/7-b/8-a/8-b/8-c/9-a/9-b/10-a/10-b/10-c/10-d/10a-a/10a-b/10a-e/10b-a/10b-b/10b-c/10b-d/11-a/11-g/13-a/13-b/13-c/13-d/14-c/14-d) · residue **1** (11-f).
- **Toothless dropped:** 0.
- **Held-out second fixtures (Wave H · S3 re-freeze):** each of the **34** `gen: conformance` SCNs now carries an independent `held_out: true` second fixture (`-2`), so the execution GATE's held-out leg is **AVAILABLE (FULL assurance)** — the builder never sees the `-2` data; an overfit to the `-1` fixture flips the held-out golden to BROKEN. Every `-2` uses genuinely different concrete data (a different datum / WP-9 / transcript `T2` / body `B2` / second-host adapter / credential value `ghp_9Q…` / SHA-pair / rewrite op / partition entry / store) hitting the **same** behaviour/branch, with its own `teeth: breaks-on` (often a different mutant than fixture-1: e.g. 3a-2 drops `Verdict` not `Transcript-SHA`, 6-2 drops `tokens.cache`, 10a-2 loses via compression not truncation). Merge fixtures **11-a / 11-g** preserve the **max-by-contentHash** head-rule (11g-2 heads e2 among the reversible colliding pair). **Held-out coverage: 34/34** conformance SCNs.
- **Held-out SKIP (by design, exempt + noted):** the **17** `gen: PBT` SCNs (2-a/b/c · 5-a/b/c/d · 11-b/c/d/e · 12-a/b · 14-a/b/e/f) take **no** `-2` — a PBT's shuffle/permutation universe (`properties-pst.md`) already draws fresh independent data every run, subsuming a held-out leg; **1** `gen: residue` (11-f self-install) is exempt — no pure-function oracle (hand-written integration test); **REQ-PERSIST-10a-c / 10a-d** author no golden here — domain-delegated to **billy / FR-12** (credential-scanner architecture). No conformance SCN is left without a held-out leg.
