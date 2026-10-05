# Properties — Block PST (persistence) · S3-sibling ∀-laws (for FULL-assurance PBT)

> **state:** S3-sibling · **protocol:** [`properties-template`](../method/properties-template.md) ·
> **source (frozen):** [`method-tags-pst.md`](./method-tags-pst.md) — the S2 `up-property` of each behavioural INV ·
> **formal cluster (verbatim):** [`fspec-merge.md`](../spec/fspec-merge.md) §PERSIST-11 / §UP / §escalation-ladder ·
> **owner:** charlie (FORGE).
>
> **Purpose:** render each frozen PST `up-property` into a runnable ∀-quantified property — the oracle-free
> beyond-the-witness check. **Invents no law:** every `law` is a faithful render of the frozen `up-property`
> (carried as `ptr+digest` so an upstream edit renders the property STALE); the formal-cluster law is transcribed
> **verbatim** from `fspec-merge.md`, not re-derived. All 16 PST invariants are behavioural → 16 PROP blocks.
>
> **Head-rule (inherited from `fspec-merge.md` §UP KERNEL-10):** the forced single head = **`max-by-contentHash`**
> among FRESH, non-superseded entries — the direction-independence teeth break on the last-writer-wins mutant accordingly.
>
> **Delegation (flagged, not forced into a ∀-form):** the credential-**scanner** acceptance — **REQ-PERSIST-10a-c**
> (server-side pre-receive hook) + **REQ-PERSIST-10a-d** (≥2 detection engines) — is **billy / FR-12** security domain
> (method-tags-pst.md §refuse-to-model): no pure-function oracle → **no PROP forced** for that arm (the persistence-side
> **scrub oracle** 10a-a/b/e _is_ rendered in PROP-PERSIST-10a). The **self-install** arm (REQ-PERSIST-11-f) has no pure
> oracle either → its verification stays an **integration test** (`gen: residue`), noted in PROP-PERSIST-11, not forced.

---

### PROP-PERSIST-1 — portable-source totality

inv: INV-PERSIST-1
source: ./method-tags-pst.md#INV-PERSIST-1 # ptr+digest
law: ∀ D ∈ Datum. reconstructable(D, clone({store, trailer, note-overlay})) ∧ home(D) ⊋ {PR-attachment} — every datum rebuilds from the tracked store + commit trailers alone; 0 datum has the PR attachment as its sole home
arbitrary: arbitrary Atlas datum-placement sets (each datum routed to some subset of {store, trailer, note, PR-attachment}); a `clone(source)` that consults only {store, trailer}
covers_reqs: [ REQ-PERSIST-1 ] # ptr+digest → 1-a, 1-b
witness: [ SCN-PERSIST-1a-1, SCN-PERSIST-1b-1 ]
teeth: breaks-on "any datum whose only home is the PR attachment — the property quantifies over ALL data, so a single PR-only datum the one golden misses fails the bare-clone reconstruction"

### PROP-PERSIST-2 — fold convergence at the persistence seam

inv: INV-PERSIST-2
source: ./method-tags-pst.md#INV-PERSIST-2 # ptr+digest
law: ∀ S ∈ EventSet, ∀ π (permutation / re-batch). serialize(fold(π(S))) ≡ serialize(fold(S)) ∧ fold(replay(export(S))) ≡ fold(S) — the KERNEL-11 convergence law (`fold(shuffle(S)) ≡ fold(S)`) applied at the git-native log, no snapshot/linear-history dependence
arbitrary: arbitrary `Event` sets `S` (fields per `fspec-merge` §DOWN); a shuffle/re-batch permutation generator; an export→import-into-empty round-trip
covers_reqs: [ REQ-PERSIST-2 ] # ptr+digest → 2-a, 2-b, 2-c
witness: [ SCN-PERSIST-2a-1, SCN-PERSIST-2b-1, SCN-PERSIST-2c-1 ]
teeth: breaks-on "a fold that seeds from a cached mutable snapshot or keys on linear commit order — the answer changes once the snapshot is dropped or the arrival order is shuffled (the reversed colliding pair heads e1 vs e2)"

### PROP-PERSIST-3 — provenance completeness + portability

inv: INV-PERSIST-3
source: ./method-tags-pst.md#INV-PERSIST-3 # ptr+digest
law: ∀ Dossier d. readCommit(attachToCommit(d)) ⊇ requiredFields(d) (0 missing of {WP, Model, Gates, Verdict, Transcript-SHA}, over {trailer, note}) ∧ ∀ sha with no attachment. readCommit(sha) = null (never throws)
arbitrary: arbitrary `Dossier` records over the 5 required fields; commits with and without an attached trailer/note
covers_reqs: [ REQ-PERSIST-3 ] # ptr+digest → 3-a, 3-b
witness: [ SCN-PERSIST-3a-1, SCN-PERSIST-3b-1 ]
teeth: breaks-on "a dropped field (any of the 5, over arbitrary dossiers not just WP-7) or a throw-on-absence path — total-read violated"

### PROP-PERSIST-4 — attachment = CAS pointers only

inv: INV-PERSIST-4
source: ./method-tags-pst.md#INV-PERSIST-4 # ptr+digest
law: ∀ body B. attach(B) = {hash: blake3hex(B)} (pointer only) ∧ get(blake3hex(B)) ≡ B (resolves from the CAS) ∧ ∀ git-object o written for attach(B). ¬inlined(B, o) — no git object is the canonical container of a large body
arbitrary: arbitrary content bodies `B` spanning below and above the pointer size threshold
covers_reqs: [ REQ-PERSIST-4 ] # ptr+digest → 4-a, 4-b, 4-c
witness: [ SCN-PERSIST-4a-1, SCN-PERSIST-4b-1, SCN-PERSIST-4c-1 ]
teeth: breaks-on "an attach that inlines a large body into a git object — the size-gate passes an oversized git object for some body size the single witness never exercised"

### PROP-PERSIST-5 — archive monotonicity + dedup-idempotence

inv: INV-PERSIST-5
source: ./method-tags-pst.md#INV-PERSIST-5 # ptr+digest
law: ∀ archive A, entry e. A ⊑ archive(A, e) (grow-only) ∧ merge(A, A) ≡ A (dedup idempotent, re-run loses nothing) ∧ respawn(archive(k)) ≡ k (re-spawnable) ∧ forget(k) removes k from the active set only, A unchanged — the "0 delete paths" arm is a **structural grep** (per the method-tag), not a ∀-form
arbitrary: arbitrary grow-only archives + entry streams (the OR-Set shape); a re-run/merge generator; supersede + forget sequences
covers_reqs: [ REQ-PERSIST-5 ] # ptr+digest → 5-a, 5-b, 5-c, 5-d
witness: [ SCN-PERSIST-5a-1, SCN-PERSIST-5b-1, SCN-PERSIST-5c-1, SCN-PERSIST-5d-1 ]
teeth: breaks-on "a path that shrinks the archive (`A' ⊏ A`), dedups non-idempotently (re-run duplicates/drops), or a `forget` that also removes from the archive — over arbitrary archives, not the single fixture"

### PROP-PERSIST-6 — metering completeness

inv: INV-PERSIST-6
source: ./method-tags-pst.md#INV-PERSIST-6 # ptr+digest
law: ∀ WP w. let m = meter(w). ∀ f ∈ requiredFields(Metering). m[f] ≠ undefined — requiredFields = {model, tokens{input, output, cache}, tool-uses, wall-time, retries/reworks, gates, verdict, transcriptSha} (0 missing field)
arbitrary: arbitrary WP executions (varying model, token counts, retries/reworks, gate sets, verdicts)
covers_reqs: [ REQ-PERSIST-6 ] # ptr+digest → 6
witness: [ SCN-PERSIST-6-1 ]
teeth: breaks-on "any required field (e.g. retries/reworks) omitted from the Metering constructor — it reads back `undefined` for some WP the single witness does not shape"

### PROP-PERSIST-7 — re-invoke portability

inv: INV-PERSIST-7
source: ./method-tags-pst.md#INV-PERSIST-7 # ptr+digest
law: ∀ record r. redispatch(r) is idempotent (same brief → same seat: redispatch(brief(r)) ≡ redispatch(brief(r))) ∧ inputsRead(redispatch(r) ∘ replay(checkpoint(r))) ∩ nonGitState = ∅ (0 non-git state read) ∧ replay reproduces WP(r) — the resume-negative is delegated to PROP-PERSIST-10b (COUPLED)
arbitrary: arbitrary recorded WPs + seat briefs; a clean bare clone with all non-git state (caches, host DB, env scratch) unavailable
covers_reqs: [ REQ-PERSIST-7 ] # ptr+digest → 7-a, 7-b
witness: [ SCN-PERSIST-7a-1, SCN-PERSIST-7b-1 ]
teeth: breaks-on "a non-idempotent redispatch (same brief → two seats) or one that reads a local non-git cache — re-invocation diverges/fails on a clean clone for some brief"

### PROP-PERSIST-8 — host abstraction / forge-agnosticism

inv: INV-PERSIST-8
source: ./method-tags-pst.md#INV-PERSIST-8 # ptr+digest
law: ∀ forge interaction i. routedThrough(HostAdapter, i) ∧ push carries `refs/notes/orchestra` ∧ readPR reconstructs the projection ∧ hostData(bareClone) = ∅ — verified against the **abstract** contract only (each concrete per-forge impl is an S4-flagged host-adapter axis, conformance-tested, not modeled)
arbitrary: arbitrary forge operations over a fake `HostAdapter`; a bare clone taken with no host fetch
covers_reqs: [ REQ-PERSIST-8 ] # ptr+digest → 8-a, 8-b, 8-c
witness: [ SCN-PERSIST-8a-1, SCN-PERSIST-8b-1, SCN-PERSIST-8c-1 ]
teeth: breaks-on "a caller reaching the forge API directly (bypassing the adapter), an omitted `refs/notes/*` refspec, or host-only data a bare clone cannot reconstruct"

### PROP-PERSIST-9 — portability: export→import byte-identical

inv: INV-PERSIST-9
source: ./method-tags-pst.md#INV-PERSIST-9 # ptr+digest
law: ∀ store s. deepEqual(s, import(export(s))) (open-JSON replays 1:1) ∧ lockInEncodings(export(s)) = ∅ (0 lock-in layered on git — mirrors KERNEL-6)
arbitrary: arbitrary stores holding {node, Knowledge fact, Memory entry} mixes across the version map
covers_reqs: [ REQ-PERSIST-9 ] # ptr+digest → 9-a, 9-b
witness: [ SCN-PERSIST-9a-1, SCN-PERSIST-9b-1 ]
teeth: breaks-on "an export that omits the version map (import loses an entry) or embeds a proprietary lock-in encoding — the dump no longer replays into a plain git store for some store shape"

### PROP-PERSIST-10 — lossless large-object transcript

inv: INV-PERSIST-10
source: ./method-tags-pst.md#INV-PERSIST-10 # ptr+digest
law: ∀ body T. fetchTranscript(put(T)) ≡ T byte-identical (0 truncation, 0 lossy compression) ∧ git holds only {sha, store} (fetch-on-demand pointer) ∧ ∀ future mitigate. reverse(mitigate(T)) ≡ T (lossless + reversible)
arbitrary: arbitrary transcript bodies `T` (including bodies exceeding any candidate size cap); candidate size-mitigation transforms
covers_reqs: [ REQ-PERSIST-10 ] # ptr+digest → 10-a, 10-b, 10-c, 10-d
witness: [ SCN-PERSIST-10a-1, SCN-PERSIST-10-b-1, SCN-PERSIST-10-c-1, SCN-PERSIST-10-d-1 ]
teeth: breaks-on "a `put` that truncates to an N-KB cap, inlines the body into git, or a mitigation that lossily compresses — `fetch`/`reverse` returns bytes ≠ `T` for some body larger than the witness"

### PROP-PERSIST-10a — no raw credential in the immutable object (scrub oracle)

inv: INV-PERSIST-10a
source: ./method-tags-pst.md#INV-PERSIST-10a # ptr+digest
law: ∀ buffer b (seeded with shapes of the DECLARED credential families). occurrences(secret, store(scrub(b))) = 0 (no raw credential of a declared family reaches the immutable object) ∧ bytesOutsideAnyMatch(b) ⊆ scrub(b) (no over-abridgement beyond a matched shape's own body class) ∧ redact-at-source: the buffer never admits the raw credential (redaction precedes persistence) ∧ ∀ chunkings c of b. fold(admitToBuffer, c) = scrub(b) (CHUNK INDEPENDENCE — the streaming write gate agrees with the whole-buffer scrub at every prefix). **SCOPED, not universal:** the ∀ ranges over the DECLARED families only (GitHub `gh[pousr]_`, Slack `xox[baprs]-`, GitHub fine-grained PAT `github_pat_`, AWS access key id `AKIA`); a credential of an undeclared shape (JWT, PEM, the AWS SECRET key) is not redacted at all and is covered by the scanner backstop. **DELEGATED (no ∀-form forced):** the ≥2-engine scanner + server-side pre-receive acceptance (REQ-PERSIST-10a-c/d) = billy / FR-12; not rendered here
arbitrary: arbitrary buffers with credential shapes of the declared families — including ADJACENT runs mixing families, and every chunking of the stream — embedded among arbitrary non-secret bytes (the scrub oracle `persist/ref/scrub.ts` domain)
covers*reqs: [ REQ-PERSIST-10a ] # ptr+digest → 10a-a, 10a-b, 10a-e (10a-c/10a-d delegated to billy/FR-12)
witness: [ SCN-PERSIST-10a-a-1, SCN-PERSIST-10a-b-1, SCN-PERSIST-10a-e-1 ]
teeth: breaks-on "a scrub that misses a credential shape (secret reaches the git-propagated object) OR over-redacts a non-secret byte adjacent to the secret — across arbitrary secret placements, not the single seeded token; and specifically a body lookahead that blocks only its OWN family prefix, which merges two ADJACENT credentials of DIFFERENT families into one match and ships the second body in the clear (`ghp*<body>xoxb-<body>`→`[REDACTED]-<body>`), whole-buffer or only across a chunk seam; and a seam whose provisional carry cannot lie INSIDE a redaction it has already emitted, which ships the fine-grained PAT that follows a GitHub token only when the stream is chunked (`ghp*AAAAAAgithub_pat*<22>`→`[REDACTED]_pat_<22>`byte-at-a-time,`[REDACTED][REDACTED]` whole-buffer); and a BOUNDED family that keeps absorbing past its own length across a seam (`AKIA…EXAMPLEX`→`[REDACTED]X`whole-buffer,`[REDACTED]` chunked)"

### PROP-PERSIST-10b — replay ≠ resume

inv: INV-PERSIST-10b
source: ./method-tags-pst.md#INV-PERSIST-10b # ptr+digest
law: ∀ brief B. redispatch(B) ≡ redispatch(B) (idempotent, same brief → same seat) ∧ ∀ Checkpoint c. replay(c) re-feeds the recorded c.llmOutputs ++ c.toolIO faithfully (no live-LLM call). **Structural arms (not ∀-forms, per the method-tag):** ∄ API named/typed as deterministic `resume`; Checkpoint{seatBrief, llmOutputs[], toolIO[]} is distinct from the raw transcript large object
arbitrary: arbitrary seat briefs; arbitrary recorded `Checkpoint`s (varying llmOutputs / toolIO)
covers_reqs: [ REQ-PERSIST-10b ] # ptr+digest → 10b-a, 10b-b, 10b-c, 10b-d
witness: [ SCN-PERSIST-10b-a-1, SCN-PERSIST-10b-b-1, SCN-PERSIST-10b-c-1, SCN-PERSIST-10b-d-1 ]
teeth: breaks-on "a non-idempotent redispatch (brief → two seats) or a `replay` that re-invokes the live LLM instead of re-feeding the recorded outputs — the replay diverges from the record for some checkpoint"

### PROP-PERSIST-11 — merge-direction independence at the git seam (formal · verbatim from `fspec-merge.md`)

inv: INV-PERSIST-11
source: ./method-tags-pst.md#INV-PERSIST-11 # ptr+digest (consumer of fspec-merge §PERSIST-11 — NO second model)
law: ∀ ours, theirs ∈ RefLog. mergeAtlas(ours, theirs) ≡ mergeAtlas(theirs, ours) byte-identical, where mergeAtlas = fold(RefLog.merge(ours, theirs)) — transcribed verbatim from `fspec-merge.md` §PERSIST-11; this IS the KERNEL-11 **commutativity** law (`mergeNode(x,y) ≡ mergeNode(y,x)`, escalation-ladder step 1) applied at the git seam: set-union by content-hash + re-fold, colliding `seq` outside the algebra, shared nodeKey by `mergeNode` (head = max-by-contentHash), 0 lost events. **Non-pure arms (not ∀, decided):** self-install (11-f) → integration test (`gen: residue`); safe-degrade (11-g) → the KERNEL-12 JSONL line-union floor that `RefLog.merge` dedups by id
arbitrary: arbitrary `RefLog` pairs (ours/theirs) with shared + colliding events — incl. the reversible colliding pair (same nodeKey, colliding `seq`); branch/merge/rebase interleavings
covers_reqs: [ REQ-PERSIST-11 ] # ptr+digest → 11-a…11-g
witness: [ SCN-PERSIST-11b-1, SCN-PERSIST-11c-1, SCN-PERSIST-11d-1, SCN-PERSIST-11e-1, SCN-PERSIST-11f-1, SCN-PERSIST-11g-1 ]
teeth: breaks-on "a last-writer-wins / direction-dependent merge — `mergeAtlas(ours,theirs)` heads e2 while `mergeAtlas(theirs,ours)` heads e1 (the reversible colliding pair diverges byte-wise), or colliding `seq` surfaces as a conflict / drops an event"

### PROP-PERSIST-12 — reorder invariance on non-linear history

inv: INV-PERSIST-12
source: ./method-tags-pst.md#INV-PERSIST-12 # ptr+digest
law: ∀ S ∈ EventSet, ∀ ρ (reorder / re-parenting over branch/merge/rebase). serialize(fold(ρ(S))) ≡ serialize(fold(S)) — the KERNEL-9/11 order-independence law (`fold(shuffle(S)) ≡ fold(S)`) at the rebase/cherry-pick seam; and rewind = set-difference then re-fold: fold(S \ P), order/parentage-independent
arbitrary: arbitrary `Event` sets `S`; arbitrary commit permutations / re-parentings (non-linear history); PR event subsets `P` to rewind
covers_reqs: [ REQ-PERSIST-12 ] # ptr+digest → 12-a, 12-b
witness: [ SCN-PERSIST-12a-1, SCN-PERSIST-12b-1 ]
teeth: breaks-on "a fold that keys on commit order / parentage — the rebased (reversed colliding pair) order heads e1 while the original heads e2, so AtlasState diverges; or a rewind that only works on a linear log"

### PROP-PERSIST-13 — trailer-canonical clone-presence; notes are a mutable overlay

inv: INV-PERSIST-13
source: ./method-tags-pst.md#INV-PERSIST-13 # ptr+digest
law: ∀ datum D. cloneRequired(D) ⇒ home(D) = trailer (travels in the commit object; reads from a bare clone with no note refspec) ∧ rewrite(SHA1 → SHA2) carries trailer(D) onto SHA2 ∧ a note keyed on SHA1 is orphaned by the rewrite ∧ note-carried data is absent until the refspec is configured — never note-only for a clone-required datum
arbitrary: arbitrary datum placements over {trailer, note}; a bare clone with no note refspec; history rewrites (rebase / squash / cherry-pick) SHA1 → SHA2
covers_reqs: [ REQ-PERSIST-13 ] # ptr+digest → 13-a, 13-b, 13-c, 13-d
witness: [ SCN-PERSIST-13a-1, SCN-PERSIST-13b-1, SCN-PERSIST-13c-1, SCN-PERSIST-13d-1 ]
teeth: breaks-on "a clone-required datum written only to a note (missing after a bare clone), a rewrite that drops the trailer, or a placement model that falsely carries the note onto the new SHA"

### PROP-PERSIST-14 — version-delta = deterministic, total, provenance-complete, pure-read fold-diff

inv: INV-PERSIST-14
source: ./method-tags-pst.md#INV-PERSIST-14 # ptr+digest (reuses fspec-merge `fold`, NOT a second model)
law: ∀ S1, S2 ∈ EventSet, ∀ permutations. let A = fold(S1), B = fold(S2). diff(A, B) partitions the changed facts into a **total, disjoint** {added, edited, superseded, decayed} ∧ diff(A, A) = ∅ ∧ every entry carries its `prov` (entriesMissingProvenance = 0) ∧ diff mutates nothing (Σ' ≡ Σ) ∧ serialize(diff) invariant across runs (canonical nodeKey order) ∧ partition(fold(shuffle(S1)), fold(shuffle(S2))) ≡ partition(fold(S1), fold(S2)) — order-independence transcribed from the method-tag down-model; the KERNEL-11 convergence law at the diff seam
arbitrary: arbitrary event-set pairs `(S1, S2)` foldable in any arrival order (KERNEL-11 / PERSIST-2/12); shuffle generators for either side; facts spanning all four lifecycle classes + unchanged
covers_reqs: [ REQ-PERSIST-14 ] # ptr+digest → 14-a, 14-b, 14-c, 14-d, 14-e, 14-f
witness: [ SCN-PERSIST-14a-1, SCN-PERSIST-14b-1, SCN-PERSIST-14c-1, SCN-PERSIST-14d-1, SCN-PERSIST-14e-1, SCN-PERSIST-14f-1 ]
teeth: breaks-on "a diff that keys on arrival/commit order (shuffling S2 flips a fact between edited/unchanged), collapses `superseded` into `edited` / drops `decayed`, reads a stale materialized diff blob, emits a provenance-less entry, or mutates the store (writes a `lastDiffedAt` marker)"

---

## Self-check (per file, before freeze)

- [x] one `properties-pst.md`, one PROP block per behavioural INV, each conforming to the template card.
- [x] **16/16** behavioural INVs → ≥1 PROP (PERSIST-1..14 + 10a + 10b); mechanical count against `method-tags-pst.md` (histogram: 16 behavioural, 0 `n/a`).
- [x] every PROP's `source` a `ptr+digest` to a real `### INV-PERSIST-<n>` (no invented law; no prose copy of code; digest tooling-filled at freeze, none fabricated here).
- [x] every `law` in the `∀ … . predicate` runnable idiom; the formal-cluster law (PERSIST-11) transcribed **verbatim** from `fspec-merge.md` §PERSIST-11.
- [x] every property-flavored golden's law present (17 `gen: PBT` SCNs subsumed as witnesses); no PROP contradicts its `witness` (head = max-by-contentHash throughout).
- [x] `teeth` states a mutant the property kills beyond the single witness (quantifies over ALL inputs, not the one fixture).
- [x] non-pure arms flagged, not forced: cred-**scanner** (10a-c/d → billy/FR-12), self-install (11-f → `gen: residue`), the "0 delete paths" grep (5), the no-resume-API + Checkpoint-distinctness structural checks (10b).
