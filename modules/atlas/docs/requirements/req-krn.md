# Requirements — Block KRN (kernel) · S1 lift-and-tag

### REQ-KERNEL-1a — content-addressed object identity

source: INV-KERNEL-1 @ reference/atlas-kernel.md#kernel-1
The kernel shall compute every object's id as Encoder.hash(canonicalForm(object)).
normative-clause: "An object's id MUST be `Encoder.hash(canonicalForm(object))`"

### REQ-KERNEL-1b — reject hand-rolled ids

source: INV-KERNEL-1 @ reference/atlas-kernel.md#kernel-1
If a caller supplies a hand-rolled id for an object, then the kernel shall reject it.
normative-clause: "MUST NOT be hand-rolled"

### REQ-KERNEL-1c — encoder divergence fails build

source: INV-KERNEL-1 @ reference/atlas-kernel.md#kernel-1
If the conformance test-vector corpus reveals an encoder divergence, then the kernel shall fail the build.
normative-clause: "A divergence MUST fail the build; it MUST NOT silently store two CAS objects for one fact or fork the fold"

### REQ-KERNEL-2a — hash only via seam

source: INV-KERNEL-2 @ reference/atlas-kernel.md#kernel-2
The kernel shall reach the hash function only through the @orchestra/kernel encoder seam.
normative-clause: "The hash function MUST be reached only through the `@orchestra/kernel` encoder seam"

### REQ-KERNEL-2b — swap changes only digest bytes

source: INV-KERNEL-2 @ reference/atlas-kernel.md#kernel-2
When the encoder function is swapped behind the seam, the kernel shall change no contract other than the digest bytes.
normative-clause: "Correctness MUST NOT depend on the chosen function; swapping it MUST NOT change any contract other than the digest bytes"

### REQ-KERNEL-2c — default encoder is BLAKE3

source: INV-KERNEL-2 @ reference/atlas-kernel.md#kernel-2
The kernel shall default the encoder seam to BLAKE3.
normative-clause: "The default MUST be BLAKE3"

### REQ-KERNEL-3a — single content-addressed store

source: INV-KERNEL-3 @ reference/atlas-kernel.md#kernel-3
The kernel shall key every Atlas object by its hash in the single CAS.
normative-clause: "Every Atlas object — structural node, Knowledge fact, Memory entry — MUST be keyed by its hash in the single CAS"

### REQ-KERNEL-3b — no second store

source: INV-KERNEL-3 @ reference/atlas-kernel.md#kernel-3
The kernel shall not maintain a second, non-content-addressed store for any object kind.
normative-clause: "There MUST NOT be a second, non-content-addressed store for any object kind"

### REQ-KERNEL-4a — append-only event log

source: INV-KERNEL-4 @ reference/atlas-kernel.md#kernel-4
The kernel shall keep the event log append-only.
normative-clause: "The event log MUST be append-only"

### REQ-KERNEL-4b — reject in-place mutation or deletion

source: INV-KERNEL-4 @ reference/atlas-kernel.md#kernel-4
If an attempt is made to mutate or delete an existing event in place, then the kernel shall reject it.
normative-clause: "an existing event MUST NOT be mutated or deleted in place"

### REQ-KERNEL-5a — state rebuilt by fold

source: INV-KERNEL-5 @ reference/atlas-kernel.md#kernel-5
When the event log is replayed from empty, the kernel shall rebuild a byte-identical Atlas.
normative-clause: "Replaying the log MUST rebuild a byte-identical Atlas"

### REQ-KERNEL-5b — no mutable snapshot dependency

source: INV-KERNEL-5 @ reference/atlas-kernel.md#kernel-5
The kernel shall not let any capability depend on a mutable in-place snapshot.
normative-clause: "no capability may depend on a mutable in-place snapshot"

### REQ-KERNEL-6a — portable open-JSON export

source: INV-KERNEL-6 @ reference/atlas-kernel.md#kernel-6
The kernel shall export the CAS to open JSON that replays 1:1 into a fresh store.
normative-clause: "The CAS MUST export to open JSON that replays 1:1 into a fresh store (A-8)"

### REQ-KERNEL-6b — export self-contained

source: INV-KERNEL-6 @ reference/atlas-kernel.md#kernel-6
The kernel shall produce an export with no proprietary encoding, no external reference, and no dependency on the host machine.
normative-clause: "no proprietary encoding, no external reference, no dependency on the host machine"

### REQ-KERNEL-7a — entry points pure and total

source: INV-KERNEL-7 @ reference/atlas-kernel.md#kernel-7
The kernel shall make every entry point pure and total.
normative-clause: "Every kernel entry point MUST be pure and total"

### REQ-KERNEL-7b — malformed input never throws

source: INV-KERNEL-7 @ reference/atlas-kernel.md#kernel-7
If a malformed input reaches a kernel entry point, then the kernel shall return a structured rejection or an honest empty result instead of throwing an exception.
normative-clause: "a malformed input yields a structured rejection or an honest empty result, never an exception"

### REQ-KERNEL-8a — preimage excludes side-indexes

source: INV-KERNEL-8 @ reference/atlas-kernel.md#kernel-8
The kernel shall exclude grounding, status, and freshness from the canonical preimage.
normative-clause: "The canonical preimage MUST NOT include grounding, status, or freshness"

### REQ-KERNEL-8b — recompute never re-keys

source: INV-KERNEL-8 @ reference/atlas-kernel.md#kernel-8
If grounding, status, or freshness is recomputed, then the kernel shall not perturb the object's key.
normative-clause: "those are recomputed and MUST NOT perturb an object's key"

### REQ-KERNEL-9a — event identity is content

source: INV-KERNEL-9 @ reference/atlas-kernel.md#kernel-9
The kernel shall compute every event's id as Encoder.hash(canonicalForm(event)).
normative-clause: "An event's id MUST be `Encoder.hash(canonicalForm(event))`"

### REQ-KERNEL-9b — idempotent append

source: INV-KERNEL-9 @ reference/atlas-kernel.md#kernel-9
When an event whose id already exists is appended, the kernel shall treat the append as a no-op.
normative-clause: "re-appending an event whose id exists is a no-op (idempotent)"

### REQ-KERNEL-9c — logs merge by set-union

source: INV-KERNEL-9 @ reference/atlas-kernel.md#kernel-9
When two logs are combined, the kernel shall union them by set-union on the id.
normative-clause: "two logs combine by **set-union on the id**"

### REQ-KERNEL-9d — seq is never an identity or merge key

source: INV-KERNEL-9 @ reference/atlas-kernel.md#kernel-9
The kernel shall not treat positional `seq` as an object key or a merge discriminator.
normative-clause: "Positional `seq` MUST NOT be an object key or a merge discriminator"

### REQ-KERNEL-9e — colliding seq never collides identity

source: INV-KERNEL-9 @ reference/atlas-kernel.md#kernel-9
If `seq` collides across writers or branches, then the kernel shall not let it collide identity.
normative-clause: "colliding `seq` across writers/branches MUST NOT collide identity"

### REQ-KERNEL-10a — collision resolves by set-union

source: INV-KERNEL-10 @ reference/atlas-kernel.md#kernel-10
When two or more events fold onto the same nodeKey, the kernel shall resolve them order-independently by set-union into one node.
normative-clause: "When ≥2 events fold onto the same `nodeKey`, the fold MUST resolve them **order-independently by set-union**"

### REQ-KERNEL-10b — forced head tie-break by contentHash

source: INV-KERNEL-10 @ reference/atlas-kernel.md#kernel-10
If a single current head is required, then the kernel shall break the tie by contentHash alone.
normative-clause: "If a single current head is genuinely required, the tie-break MUST be **`contentHash` alone**"

### REQ-KERNEL-10c — collision path lossless and deterministic

source: INV-KERNEL-10 @ reference/atlas-kernel.md#kernel-10
If a nodeKey collision is resolved, then the kernel shall not drop an event, consult an LLM, or read a clock.
normative-clause: "No collision path may drop an event, consult an LLM, or read a clock"

### REQ-KERNEL-11 — convergent commutative fold

source: INV-KERNEL-11 @ reference/atlas-kernel.md#kernel-11
The kernel shall fold any permutation, re-batching, or union of the same event set to a byte-identical AtlasState.
normative-clause: "`fold` MUST be commutative and associative over the event set: any permutation, re-batching, or union of the **same set** of events MUST fold to a **byte-identical** `AtlasState`"

### REQ-KERNEL-12a — merge driver self-installing

source: INV-KERNEL-12 @ reference/atlas-kernel.md#kernel-12
When a repository is cloned, the kernel bootstrap shall re-register the merge driver without a manual step.
normative-clause: "the driver MUST be **self-installing** — a repo setup hook / `git config` bootstrap re-registers it on clone, not a manual step"

### REQ-KERNEL-12b — text merge never corrupts set

source: INV-KERNEL-12 @ reference/atlas-kernel.md#kernel-12
If the log is merged by git's default text merge, then the kernel's on-disk log form shall not corrupt the content-keyed event set.
normative-clause: "the log's on-disk form MUST **degrade safely** — a plain text merge MUST NOT corrupt the content-keyed event set"

### REQ-KERNEL-12c — log is content-keyed JSONL

source: INV-KERNEL-12 @ reference/atlas-kernel.md#kernel-12
The kernel shall represent the log path as an append-only, one-event-per-line JSONL form whose lines are content-keyed.
normative-clause: "The log path MUST be an **append-only, one-event-per-line (JSONL)** representation whose lines are content-keyed"
