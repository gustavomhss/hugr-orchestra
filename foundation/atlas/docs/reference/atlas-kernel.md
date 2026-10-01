# atlas-kernel — Reference

> owner: charlie (FORGE) · grounding: claims checked against `spec/atlas.md` §3, §7, A-11 and the `@orchestra/kernel` encoder seam · status: draft

## Purpose

The kernel is the Atlas's storage substrate: a content-addressed store (CAS), the swappable
BLAKE3 encoder seam that keys it, and the append-only event log that all Atlas state folds from.
Everything above it — grounding, the structural index, Knowledge, Memory — is an object in the CAS
or a projection of the fold. The kernel decides _how bytes become identity_; it holds no policy.

## Data model

```
Hash          = string            // lower-hex BLAKE3 digest, the CAS key
Encoder       = { hash(bytes: Uint8Array): Hash }   // the swappable seam (default BLAKE3)
CasObject     = StructuralNode | KnowledgeFact | MemoryEntry   // any typed Atlas object
Cas           = Map<Hash, CasObject>                // hash → object; the whole store

Event         = { id, seq, kind, actor, nodeKey?, payload, at }  // id = Encoder.hash(canonical(event)); actor = who emitted (provenance)
EventLog      = Map<Hash, Event>                    // append-only, commutative SET keyed by event id
AtlasState    = fold(EventLog)                       // convergent fold; order-independent, not a blob
```

- Identity is the hash of an object's **canonical form** (canonical encoders, `spec` §3.2). Grounding,
  status, and freshness are **out of identity** — recomputed side-indexes, never in the key.
- The store is `hash → object`; export is the CAS dump (open JSON, A-8). Objects are stored in the
  Atlas's typed format, not a generic document blob.
- The event log and the knowledge it folds to are **distinct**: events accrete (append-only); facts
  evolve (edit/supersede, A-12). The log is the source; state is derived.
- An event's **identity is its content-hash**, not its position. `seq` is a **local ordering hint**
  (per-writer, per-branch) — never an object key and never a merge discriminator. The log is a
  content-keyed **set**: appending a byte-identical event is idempotent, and two logs combine by
  set-union on the id. This is what makes the fold survive concurrent writers and non-linear git
  history (branch/merge/rebase) — the fold is over a **set**, not a line-ordered file.

## Invariants

- **KERNEL-1 Content-addressed identity.** An object's id MUST be `Encoder.hash(canonicalForm(object))`
  and MUST NOT be hand-rolled, where `canonicalForm` is the **named, CI-gated canonical contract** of
  `spec` §3.2 (RFC 8785 / JCS subset: **no floats**, **Unicode NFC**, one fixed escape policy, sorted keys).
  "Two independent encoders agree byte-for-byte" is **not** an aspiration — it MUST be enforced by the
  language-agnostic **conformance test-vector corpus** (§3.2) that every encoder reproduces byte-for-byte in
  CI. A divergence MUST fail the build; it MUST NOT silently store two CAS objects for one fact or fork the
  fold. A float / Unicode-form / key-order split is a corpus failure, not a runtime surprise.
- **KERNEL-2 Encoder seam.** The hash function MUST be reached only through the `@orchestra/kernel`
  encoder seam. Correctness MUST NOT depend on the chosen function; swapping it MUST NOT change any
  contract other than the digest bytes. The default MUST be BLAKE3. The bytes handed to the seam MUST be
  the §3.2 canonical preimage (floats forbidden, NFC, fixed escape), so a digest-function swap cannot
  perturb identity beyond the digest bytes.
- **KERNEL-3 CAS is the one store.** Every Atlas object — structural node, Knowledge fact, Memory
  entry — MUST be keyed by its hash in the single CAS. There MUST NOT be a second, non-content-addressed
  store for any object kind.
- **KERNEL-4 Append-only log.** The event log MUST be append-only: an existing event MUST NOT be
  mutated or deleted in place. Correcting state is a _new_ event, never an edit of an old one.
- **KERNEL-5 State is a fold.** The Atlas state MUST be reconstructable by folding the event log from
  empty; no capability may depend on a mutable in-place snapshot (A-11). Replaying the log MUST rebuild
  a byte-identical Atlas.
- **KERNEL-6 Portable / no lock-in.** The CAS MUST export to open JSON that replays 1:1 into a fresh
  store (A-8) — no proprietary encoding, no external reference, no dependency on the host machine.
- **KERNEL-7 Total, never throws.** Every kernel entry point MUST be pure and total: a malformed input
  yields a structured rejection or an honest empty result, never an exception.
- **KERNEL-8 Identity excludes mutable side-indexes.** The canonical preimage MUST NOT include
  grounding, status, or freshness; those are recomputed and MUST NOT perturb an object's key.
- **KERNEL-9 Event identity is content, not position.** An event's id MUST be
  `Encoder.hash(canonicalForm(event))`; `seq` is a **local ordering hint**, never identity. The log MUST
  be an append-only **commutative set** keyed by that id: re-appending an event whose id exists is a no-op
  (idempotent), and two logs combine by **set-union on the id**. Positional `seq` MUST NOT be an object
  key or a merge discriminator — colliding `seq` across writers/branches MUST NOT collide identity.
- **KERNEL-10 Deterministic fold-merge on `nodeKey` collision.** When ≥2 events fold onto the same
  `nodeKey`, the fold MUST resolve them **order-independently by set-union** — **one rule for both families**,
  never a clock and never a positional proxy. A collision is the **same subject re-evidenced on two
  branches**: identity already includes `normalize(claimNorm)` (advisory) or `normalize(check)` (predicate),
  so the colliding events assert the _same_ claim / re-run the _same_ `check` → freshness is identical and
  there is **no real "last writer"**. The fold therefore **unions** them into **one** node: an OR-Set of
  `ClaimEntry`/lineage keyed by `contentHash` (grow-only — KNOW-4/KNOW-12), keeping **all**, dropping none;
  the pack surfaces the **FRESH** head. If a single current head is genuinely required, the tie-break MUST be
  **`contentHash` alone** (a pure content function) — never `seq`, never a clock, never an LLM. This removes
  the former predicate seq-LWW branch: `seq` is purely a local ordering hint (KERNEL-9) and MUST NOT enter
  collision resolution. No collision path may drop an event, consult an LLM, or read a clock.
- **KERNEL-11 Convergent (commutative) fold.** `fold` MUST be commutative and associative over the event
  set: any permutation, re-batching, or union of the **same set** of events MUST fold to a **byte-identical**
  `AtlasState`. Concurrency — two seats in one wave, or two merged branches — MUST NOT yield a state that
  depends on arrival order.
- **KERNEL-12 Safe-degrade log representation.** The registered `merge=orchestra-atlas` driver lives in
  `.git/config` and does **not** travel on clone (only `.gitattributes` does) — so an un-configured clone
  silently falls back to git's default **text** merge on the log path. Two guards MUST hold: (a) the driver
  MUST be **self-installing** — a repo setup hook / `git config` bootstrap re-registers it on clone, not a
  manual step; and (b) the log's on-disk form MUST **degrade safely** — a plain text merge MUST NOT corrupt
  the content-keyed event set. The log path MUST be an **append-only, one-event-per-line (JSONL)**
  representation whose lines are content-keyed, so even git's default line-merge **unions** the two branches'
  events (a re-fold then dedups by id) and can never splice one event's bytes into another. (The merge-driver
  invariant proper is PERSIST-11; this is the kernel-side floor that keeps the un-configured fallback lossless.)

## Surface / API

```
hash(bytes: Uint8Array): Hash               // the encoder seam; default BLAKE3
put(obj: CasObject): Hash                    // canonicalize → hash → store; idempotent on equal bytes
get(h: Hash): CasObject | undefined          // resolve by key; total (miss ⇒ undefined, no throw)
append(ev: Event): EventLog                  // set-insert by event id; idempotent on equal id
merge(a: EventLog, b: EventLog): EventLog    // set-union by event id; commutative, associative, idempotent
fold(log: EventLog): AtlasState              // convergent reconstruction of current state from the set
export(): string                             // open-JSON CAS dump (A-8)
import(json: string): Cas                    // replays 1:1 into a fresh store
```

- `put` MUST be idempotent: putting an object whose canonical bytes already exist returns the same
  `Hash` and stores nothing new.
- `hash` MUST be the only place a digest is computed; callers pass canonical bytes, never a raw object.
- `append` MUST be a set-insert keyed by the event id (idempotent); `merge` MUST be plain set-union, so
  `fold(merge(a,b)) == fold(merge(b,a))` for any two logs (the git-merge-driver seam, PERSIST-11).

## Acceptance

1. **KERNEL-1** — Two independent encoders `put` the same object ⇒ identical `Hash`; a hand-rolled id
   is rejected.
2. **KERNEL-2** — Swapping the encoder behind the seam changes only digest bytes; every non-digest
   contract test still passes; the default resolves to BLAKE3.
3. **KERNEL-3** — Grep the store layer: every object kind resolves through the one CAS; no second store.
4. **KERNEL-4** — Attempting to mutate/delete a logged event is rejected; the log length only grows.
5. **KERNEL-5** — `fold(export→import→log)` rebuilds a byte-identical Atlas (round-trips A-11).
6. **KERNEL-6** — `export → import` yields a byte-identical CAS (A-8).
7. **KERNEL-7** — Malformed input to every entry point returns a structured empty/rejection; none throws.
8. **KERNEL-8** — Recomputing grounding/status/freshness on a stored object does not change its `Hash`.
9. **KERNEL-9** — Appending a byte-identical event twice is a no-op; `merge` of two logs dedups by id;
   reassigning `seq` alone leaves the keyset (and the fold) unchanged.
10. **KERNEL-10** — Two seats emit on one `nodeKey` in one wave (advisory _or_ predicate) ⇒ the fold yields
    **one** node whose claim-set/lineage is the **union** of both events (an OR-Set keyed by `contentHash`);
    nothing is dropped, and the result is identical under either event order. Where a single head is forced,
    it is the `contentHash` tie-break — never a `seq`/clock proxy.
11. **KERNEL-11** — Folding a shuffled / re-batched / branch-unioned permutation of the same event set
    yields a byte-identical Atlas (convergence).
12. **KERNEL-12** — On a clone with **no** `merge=orchestra-atlas` driver configured, a branch merge that
    touched the log falls back to git's default text merge and still yields a **lossless union** of both
    branches' events (the JSONL lines union; the re-fold dedups by id) — no event is corrupted or lost; the
    setup bootstrap re-registers the driver.
