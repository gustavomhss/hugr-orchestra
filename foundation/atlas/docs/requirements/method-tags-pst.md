# Method-tags — Block PST (persistence) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-pst.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE); formal-merge core architecture-reviewed by bobby.
>
> One tag per **behavioural** INV by the 3-conjunct rule. PST carries **no** standalone formal model of its own:
> its one `formal` INV — **PERSIST-11** — is the _persistence-side consumer_ of the KRN `FSPEC-merge` core, not a
> second model. The three byte-identity/convergence INVs at the git seam (PERSIST-2/5/12) are `PBT` — the same
> convergence property, not a new formal model. Everything else is `reference-model` per the ratified baseline —
> a feature, not a compromise. All 16 PST invariants are `behavioural` (register), so none carries `n/a`.
> (**PERSIST-14** — the `atlas-diff` version-delta — is `PBT` for the same reason: a read-only fold-comparison
> whose load-bearing shape is partition-totality + determinism/order-independence over the existing `fold`.)

---

### INV-PERSIST-1

method-tag: reference-model
fspec: —
up-property: "portable-source totality: the portable source is the tracked store + commit **trailers** (notes a mutable overlay, P-13); every datum is reconstructable from that source — a clone/fork rebuilds Atlas state, the PR surface is a projection, 0 datum has the PR attachment as its sole home"
down-model: "a reference persistence-source that routes every datum through {store, trailer, note-overlay}; `clone(source)` reconstructs state; a placement check asserts no datum's only home is the PR attachment"
anti-rot: `persist/ref/source.ts` (the reference source model) is the mock; a code path that writes a datum solely to the PR attachment fails the sole-home assertion in the shared unit test.

### INV-PERSIST-2

method-tag: PBT
fspec: —
up-property: "fold convergence at the persistence seam: replaying the append-only event **set** from empty rebuilds a byte-identical AtlasState, independent of arrival/commit order, with no dependence on a linear commit history or a mutable in-place snapshot (decoupled-after KERNEL-11)"
down-model: "reuse the FSPEC-merge `fold` reducer as oracle; PBT `serialize(fold(shuffle(S))) ≡ serialize(fold(S))` and `fold(replay(export(S))) ≡ fold(S)` — the KERNEL-11 convergence law applied to the git-native log, NOT a new model"
anti-rot: the FSPEC-merge reference `fold` (`spec/fspec-merge` §DOWN / `kernel/ref/fold.ts`) is the mock; a snapshot- or history-order-dependent persistence fold diverges under the shuffle/replay property and breaks the build. _(Tag is `PBT`, not `formal`: the shape is order-independence/determinism at the seam — the model already exists in `FSPEC-merge`; this INV only PBT-checks that the persistence fold conforms.)_

### INV-PERSIST-3

method-tag: reference-model
fspec: —
up-property: "provenance completeness + portability: every WP's provenance (WP / Model / Gates / Verdict / Transcript-SHA) is committed as a commit **trailer** block + a `refs/notes/orchestra` note and reads back after clone/fork/machine-move (0 missing field)"
down-model: "reference `attachToCommit` / `readCommit` round-trips a Dossier through {trailer, note}; a total-read check asserts `readCommit(sha)` yields every required field and returns `null` (never throws) on absence — mirrors Maestro `readDossierNote`"
anti-rot: `persist/ref/provenance.ts` (the trailer+note (de)serializer) is the mock; a dropped field or a throw-on-absence path fails the round-trip in the shared unit test.

### INV-PERSIST-4

method-tag: reference-model
fspec: —
up-property: "attachment = CAS pointers only: what is attached to a commit/PR is the hashed index of pointers, the content resolves from the CAS by hash, and 0 large bodies are inlined — no git object is the canonical container of a large content body"
down-model: "reference `attach()` stores only `{hash}` pointers and `get()` resolves via the CAS; a size-gate asserts no inlined payload exceeds the pointer threshold"
anti-rot: `persist/ref/attach.ts` is the mock; a code path that inlines a large body into a git object fails the pointer-only size assertion.

### INV-PERSIST-5

method-tag: PBT
fspec: —
up-property: "archive monotonicity + dedup-idempotence: supersede/decay/close **archives, never deletes** — the archive is grow-only, a merge-on-rerun never loses data (dedup is idempotent), every archived entry stays re-spawnable, 0 delete paths; 'forgetting' leaves the active/injected set only (consumes DP-9)"
down-model: "the archive as a grow-only set (the same OR-Set shape); reference `archive`/`forget` where a delete is a no-op that instead archives; PBT monotonicity (`A ⊑ A ∪ e`) + dedup-idempotence (`merge(A,A) ≡ A`, re-run loses nothing) + a re-spawn round-trip"
anti-rot: reuses the FSPEC-merge grow-only set-union reducer (`RefLog.merge`, `spec/fspec-merge` §DOWN) as the archive mock; a code path that shrinks the archive or dedups non-idempotently diverges under the monotonicity property and breaks the build. _(Tag is `PBT`, not `reference-model`: the load-bearing property is grow-only monotonicity/idempotence — an ordering/determinism law checked by PBT over the same core reducer, not a new model; the "0 delete paths" arm is a structural grep in S3.)_

### INV-PERSIST-6

method-tag: reference-model
fspec: —
up-property: "metering completeness: every ephemeral agent's WP records a full Metering record — `model`, tokens (in/out/cache), tool-uses, wall-time, **retries/reworks**, gates, verdict, `transcriptSha` — in the event log + dossier (0 missing field)"
down-model: "reference `Metering` schema + `meter(wp)` constructor that populates every field; a total-schema check asserts no required field is `undefined`"
anti-rot: `persist/ref/metering.ts` (the `Metering` schema/constructor) is the mock; a dropped field fails the completeness assertion in the shared unit test.

### INV-PERSIST-7

method-tag: reference-model
fspec: —
up-property: "re-invoke portability: on a clean clone with **no non-git state**, an ephemeral agent re-spawns via idempotent redispatch (same brief → same seat) + faithful replay and reproduces its WP — NOT a deterministic resume (COUPLED-with PERSIST-10b)"
down-model: "reference `redispatch(record) → seat` (idempotent: same brief → same seat) + `replay(checkpoint)` re-feeding recorded I/O; an input-provenance check asserts 0 non-git state is read; the resume-negative is delegated to PERSIST-10b"
anti-rot: `persist/ref/reinvoke.ts` (redispatch+replay, shared with PERSIST-10b) is the mock; a redispatch that reads non-git state, or a non-idempotent one, fails the shared property.

### INV-PERSIST-8

method-tag: reference-model
fspec: —
up-property: "host abstraction / forge-agnosticism: the adapter abstracts the forge behind `attachToCommit`/`attachToPR` (+ reads), one impl per host; it configures the `refs/notes/*` push refspec; host-side PR data is a **projection** a bare `git clone` does not fetch (0 host data in a bare clone)"
down-model: "reference `HostAdapter` interface over a fake forge; assert `push` carries `refs/notes/orchestra`, `readPR` reconstructs the projection, and a bare clone yields 0 host data"
anti-rot: `persist/ref/host-adapter.ts` (the fake-forge adapter) is the mock; a code adapter that inlines host-only data or skips the notes refspec fails the reconstruction test. _(The concrete per-forge impl is an **S4-flagged host-adapter axis**; S2 tags the verification method for the abstract contract only — each concrete forge is conformance-tested, not modeled.)_

### INV-PERSIST-9

method-tag: reference-model
fspec: —
up-property: "portability: `export → import` yields a byte-identical store — open JSON that replays 1:1, no lock-in layered on top of git (A-8)"
down-model: "reference `export():JSON` / `import` replays 1:1; assert `deepEqual(store, import(export(store)))` and grep the dump for 0 lock-in encodings — mirrors KERNEL-6 portability"
anti-rot: shares the KERNEL-6 portable (de)serializer mock (`kernel/ref/portable.ts`); a lock-in encoding drift fails the round-trip equality.

### INV-PERSIST-10

method-tag: reference-model
fspec: —
up-property: "lossless large-object transcript: the body is retained **in full** (never truncated / lossily compressed), stored as a **content-addressed large object**, fetch-on-demand, with only its content-hash **pointer** in git; any future size mitigation stays lossless + reversible"
down-model: "reference large-object store where `put(body) → hash` and `fetchTranscript(ref)` returns the exact bytes; assert `fetch(put(body)) ≡ body` (0 truncation), git holds only `{sha, store}`; a lossy transform fails the byte-identity round-trip"
anti-rot: `persist/ref/transcript-store.ts` (content-addressed `put`/`fetch`) is the mock; a truncating or lossily-compressing code path fails the byte-identity round-trip.

### INV-PERSIST-10a

method-tag: reference-model
fspec: —
up-property: "no-secret-in-object: no raw credential reaches the immutable content-addressed object — **redact-at-source is primary** (the transcript buffer never admits a raw credential), the **≥2-engine** scanner (client + server-side pre-receive) backstops, and the scrub redacts secrets **without otherwise abridging** the record"
down-model: "a **scrub oracle**: reference `scrub(buffer)` drops known credential shapes before store; assert `store(scrub(seeded))` contains 0 seeded secrets **and** that every non-secret byte is preserved (no over-redaction). This tags the _verification method_ only"
anti-rot: `persist/ref/scrub.ts` (the redact-at-source oracle) is the mock reused in the transcript-buffer unit tests; a code path that lets a seeded secret reach the object, or that abridges non-secret bytes, fails against it. _(Security-domain note: this is **billy / FR-12** territory — the exploitability / adversarial-bypass proof is billy's; S2 tags the verification method for the scrub oracle, it does not re-argue the security design.)_

### INV-PERSIST-10b

method-tag: reference-model
fspec: —
up-property: "replay ≠ resume: re-invoking a seat performs **idempotent redispatch** (same brief → same seat) + **faithful replay** of the recorded `Checkpoint`; no path claims deterministic resume; the `Checkpoint` (LLM outputs + tool I/O + seat brief) is **distinct** from the full raw transcript (COUPLED-with PERSIST-7)"
down-model: "reference `Checkpoint{seatBrief, llmOutputs[], toolIO[]}`; `redispatch` is idempotent, `replay` re-feeds the recorded I/O; a structural check asserts no API named/typed as a deterministic `resume` exists"
anti-rot: shares `persist/ref/reinvoke.ts` with PERSIST-7; a deterministic-resume claim or a non-idempotent redispatch fails the shared property.

### INV-PERSIST-11

method-tag: formal
fspec: FSPEC-merge
up-property: "merge-direction independence at the git seam: `mergeAtlas(ours,theirs) ≡ mergeAtlas(theirs,ours)` **byte-identical** — the registered git merge driver unions the two event sets by content-hash and re-folds; colliding `seq` never surfaces as a conflict; a shared `nodeKey` resolves by the KERNEL-10 fold-merge, never by hand; 0 lost events. This IS the **commutativity** law already PBT'd for KERNEL-11, applied at the git seam — **no new proof obligation** (see `spec/fspec-merge.md` §PERSIST-11)"
down-model: "the FSPEC-merge reducer itself — `mergeAtlas = fold(RefLog.merge(ours, theirs))` (`spec/fspec-merge.md` §DOWN / §PERSIST-11): set-union then re-fold; PBT `mergeAtlas(a,b) ≡ mergeAtlas(b,a)` **reuses** the KERNEL-11 convergence property (NO second model). The **self-install** arm (REQ-PERSIST-11-f, delegated here from KERNEL-12a) has no pure-function oracle → its oracle is an **integration test**: a fresh clone runs the setup hook, then asserts `merge=orchestra-atlas` + the `.gitattributes` entry are registered. The **safe-degrade** arm (REQ-PERSIST-11-g) reuses KERNEL-12's JSONL line-union floor, which `RefLog.merge` dedups by id (worst case = harmless duplicate lines)"
anti-rot: the **FSPEC-merge reference reducer** (`RefLog.merge` + `fold`, `spec/fspec-merge` §DOWN) **IS the mock** — no new model; the merge-driver code is differentially tested against it for direction-independence, and the self-install integration test is the oracle for the non-pure arm. _(Tag is `formal` **only** because it consumes the existing `FSPEC-merge` core — it is the persistence-side consumer, not a second machine-checked model.)_

### INV-PERSIST-12

method-tag: PBT
fspec: —
up-property: "reorder invariance: a rebase or cherry-pick that reorders or re-parents commits leaves `AtlasState` **byte-identical** — the fold is over the set, not the commit sequence; 'rewind a PR ⇒ Atlas rewinds' holds on **non-linear** history (branch/merge/rebase), not only a linear log (decoupled-after KERNEL-9)"
down-model: "reuse the FSPEC-merge `fold` oracle; PBT `serialize(fold(reorder(S))) ≡ serialize(fold(S))` over arbitrary commit permutations / re-parentings — the KERNEL-9/11 order-independence law applied at the git seam, NOT a new model"
anti-rot: the FSPEC-merge reference `fold` (`kernel/ref/fold.ts`) is the mock; a code fold that keys on commit order/parentage diverges under the reorder property and breaks the build. _(Tag is `PBT`, not `formal`: the property already lives in `FSPEC-merge`; this INV PBT-checks conformance at the rebase/cherry-pick seam.)_

### INV-PERSIST-13

method-tag: reference-model
fspec: —
up-property: "trailer-canonical clone-presence: a datum required in any clone lives in a **commit trailer** (travels in the commit object, survives a history rewrite onto the new SHA); notes are the **mutable overlay** — perimeter-conditional (present only once the refspec is configured) and **orphaned** by rebase/squash/cherry-pick (corrects P-1/P-8 for note-carried data)"
down-model: "reference {trailer, note} placement model; assert clone-required data reads from the **trailer** after a bare clone with no note refspec; a rewrite carries the trailer onto the new SHA and orphans the note; a clone-required datum stored **only** in a note fails the placement check"
anti-rot: `persist/ref/placement.ts` (the trailer-vs-note placement oracle) is the mock; a clone-required datum written only to a note fails the placement assertion in the shared unit test.

### INV-PERSIST-14

method-tag: PBT
fspec: —
up-property: "version-delta determinism + partition-totality + provenance-completeness: `diff(shaA,shaB)` partitions the facts into exactly {added, edited, superseded, decayed} (a total, disjoint partition), every entry carries its provenance, the diff is a **PURE READ (0 mutation)**, **byte-identical across runs**, and **well-defined regardless of fold/event order** — it is a read-only fold-comparison over two folded AtlasStates (grounds on KERNEL-5/PERSIST-2 fold + PERSIST-5 supersede/decay lifecycle), NOT a stored/materialized diff (decoupled-after PERSIST-2/5)"
down-model: "reuse the FSPEC-merge `fold` reducer to produce the two AtlasStates `A = fold(shaA)`, `B = fold(shaB)`, then a reference `diff(A,B)` that set-partitions the fact-sets by the PERSIST-5 lifecycle into {added, edited, superseded, decayed} with provenance; PBT `diff(fold(shuffle(S1)),fold(shuffle(S2))) ≡ diff(fold(S1),fold(S2))` (order-independence) ∧ `diff(A,A) == ∅` ∧ `diff` mutates nothing ∧ every entry has provenance — reuses the KERNEL-11 convergence law, NOT a new model"
anti-rot: `persist/ref/diff.ts` (the read-only fold-diff over the FSPEC-merge `fold` mock) is the mock; a diff that keys on fold/event order, mutates state, materializes a stored diff, or drops an entry's provenance diverges under the property and breaks the build. _(Tag is `PBT`, not `formal`: the shape is determinism/order-independence over the existing fold — the model already lives in `FSPEC-merge`; this INV PBT-checks that the read-only projection conforms, reusing `fold` as oracle exactly like PERSIST-2/5/12.)_

---

## Refuse-to-model

- **performance / transcript large-object size + archive (OR-Set) growth & compaction**: footprint is bounded by decay (DP-9) and covered by load tests; there is no correctness oracle to model.
- **the code itself**: conformance-tested (sampled) against the reference models — "success = we could not find a bug"; a verified design is not a verified impl. Confidence is bought with scale + coverage, not a proof claim.
- **credential-scrub exploitability / adversarial bypass (PERSIST-10a)**: S2 tags only the _verification method_ (a scrub reference oracle); the exploitability, entropy/verification-engine design, and bypass proof are **billy's FR-12 security domain** — not modeled here.
- **git's own 3-way text-merge internals + git-notes fetch/push machinery**: black-box adversary; we model only that the JSONL line-union degrades safely (PERSIST-11-g) and that trailers/notes place correctly (PERSIST-13), never git's merge/notes code.
- **the host forge API / per-forge adapter impl (PERSIST-8)**: an **S4-flagged host-adapter axis** — the abstract contract is reference-modeled; each concrete forge impl is conformance-tested against it, not modeled.
- **concurrent + crashing executions simultaneously**: git-merge concurrency and process-crash / durability are checked **separately**, never in one model (ShardStore rule).
- **LLM nondeterminism / deterministic resume (PERSIST-10b)**: deliberately NOT modeled because it is deliberately NOT deliverable — replay ≠ resume; there is nothing to verify beyond the redispatch+replay contract.

## FSPEC-merge

Location: [`../spec/fspec-merge.md`](../spec/fspec-merge.md). PST authors **no** new model. **PERSIST-11** is the
persistence-side **consumer** of that core (§PERSIST-11): merge-direction independence is the KERNEL-11
commutativity law applied at the git seam, its anti-rot mock is the FSPEC-merge reducer (`RefLog.merge` + `fold`),
and the **KERNEL-12a self-install integration test** is delegated here as PERSIST-11's integration-test oracle
(fresh clone runs the setup hook → asserts `merge=orchestra-atlas` + the `.gitattributes` entry are registered).
PERSIST-2/5/12 PBT the same convergence/monotonicity properties over the same reducer — reuse, not a re-model.

## Completion report

- tagged-register: `docs/requirements/method-tags-pst.md`
- tag histogram: **formal 1** (PERSIST-11, consumer of `FSPEC-merge`) · **exhaustive 0** · **PBT 4** (PERSIST-2/5/12/14) · **reference-model 11** (PERSIST-1, 3, 4, 6, 7, 8, 9, 10, 10a, 10b, 13)
- FSPEC authored by PST: **none** (PERSIST-11 consumes the existing `docs/spec/fspec-merge.md` core — no second model; PERSIST-14 reuses the `fold` oracle, no new model)
- refusal count: **7**
- every PERSIST-1..14 + 10a/10b tagged: **yes** (16/16; all behavioural, 0 `n/a`)
- KERNEL-12a self-install integration test: **recorded** as PERSIST-11's integration-test oracle (REQ-PERSIST-11-f)
- → next_state **S3** (goldens).
