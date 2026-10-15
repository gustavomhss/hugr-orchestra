# #195 — Answer provenance: bind a fact to the exact bytes the model returned

> **Status:** contract frozen 2026-08-10. Owner ratified legs **(a)+(b)+(c)** the same day. Leg (b)
> widens a ratified surface (KNOW-11 / scrubber scope) and is called out for that reason below.
> **Search-before-freeze:** the current provenance carriers were re-measured against master `195c2d6`
> (not assumed from the 9-day-old finding); the corrections are recorded in §1.

## 0. The crux

Atlas content-addresses **everything it stores** (CAS, blake3, `id = hash(canonicalForm)`) — except the
one non-deterministic external input, the model's answer, which it treats as unaddressed text. A fact
that survives admission cannot be audited back to the exact bytes the model produced. The 2026-08-04
contamination incident (a broken shim delivered byte-spliced answers; the product admitted 200 facts and
reported `exit 0`) exposed the class: **a thing the system assumes and does not verify.**

## 1. Measured current state (corrects the original finding)

What an admitted mined fact records today (re-measured, `master 195c2d6`):

- **the claim** — the _trimmed_ answer persists as `claimNorm` inside the fact's CAS bytes
  (`llm.ts:116` `out.trim()` → `mine-gate.ts:76` `claimNorm: seed.claim` → `admit-harness.ts:334`
  `buildAdvisory` → `mine.ts:290` `id(f)` into CAS). **Correction:** the original finding said the
  answer "never lands in CAS" — false. The claim body does. What is genuinely absent is below.
- **the prompt-template digest** — in the _run report_ only (`mine-render.ts:118-120`), never on the fact.
- **anchor + subtreeHash** — inside the fact's `grounding` (CAS bytes), not a projection-row field.
- **derivedAt** — the freshness watermark; **not set on the mine path** (stamped only at publication).

What is genuinely absent, and is the whole of #195:

1. **No independent digest of the answer.** `claimNorm` is a _normalised_ projection of the answer; the
   raw envelope (pre-trim bytes, any chain-of-thought, any framing) is dropped
   (`admit-harness.ts:311` "chain-of-thought is structurally absent"). Nothing hashes the exact bytes.
2. **No admission sanity gate on the answer** beyond non-empty. `execFileSync(..., encoding:'utf8')`
   silently maps invalid bytes to U+FFFD; a spliced/concatenated multi-answer flows straight to
   `claimNorm` (`llm.ts:116-117`, `:122-138` even salvages a claim from a _partially delivered_ prompt).
3. **No content-addressed link** from the fact to the answer bytes.

## 2. The decided design — two legs (owner-ratified b+c, 2026-08-10; leg (a) STRUCK 2026-08-10 on review)

> **AMENDMENT (2026-08-10, post-ratification contract review):** leg **(a) `answerDigest` is STRUCK** as
> redundant and, as originally specified, false-by-construction. In a content-addressed store the `answerRef`
> (the CAS id) IS the digest of the stored content, so a separate digest field adds nothing. Worse, the
> invariant this contract stated — `answerDigest == hash(answerRef's content)` — cannot hold if `answerDigest`
> is `blake3(rawStoredBytes)`: the CAS id is `id(obj) = blake3(canonicalForm(obj))`, and `canonicalForm` of a
> string is `JSON.stringify(NFC(s))` (`packages/kernel/src/canonical.ts:52-54,104-115`), never the raw bytes.
> **Tamper-evidence at rest is provided by the CAS pattern itself:** a reader re-runs `id(fetchedBytes)` and
> compares to `answerRef` — `store.ts get()` already does exactly this on every read (a mutated stored answer
> re-hashes to a different id and is read as absent). Precedent: `promptDigest` (mine-proposer.ts) is a single
> digest field with no companion ref, for the same reason. The WP therefore ships **(c) + (b)** only.

The legs compose as a **pipeline at the answer boundary**, ordered so each later leg trusts the earlier:

```
raw stdout bytes  ──(c) SANITY GATE──►  scrub (KNOW-11)  ──(b) put→CAS──►  answerRef = id(scrubbed bytes)
                         │ fail                                                    │  (the CAS id IS the digest —
                         ▼                                                         ▼   its own tamper-evidence)
                  grounded abstention                                    fact carries { answerRef }
                  WhyNot('answer-malformed')
```

### (c) Admission sanity gate — `llm.ts`, at the answer boundary, BEFORE the answer becomes a claim

Three checks, all fail-closed to a **grounded abstention** (`WhyNot('answer-malformed', <reason>)`), never
a fabricated fact:

- **non-empty** — already present; keep.
- **valid UTF-8** — reject if the raw bytes are not valid UTF-8 (read the subprocess output as a Buffer
  and validate, rather than letting `encoding:'utf8'` mask corruption with U+FFFD).
- **single-response** — reject the splice/interleave class that the 2026-08-04 incident produced: more
  than one top-level response envelope (e.g. concatenated JSON objects / a repeated response delimiter /
  a byte-overlap signature). The exact predicate is specified in §4; it must **kill the incident's own
  fixture** (a mutation test using a spliced answer is a DoD item).

This closes the **coarse class** (empty, corrupt, spliced, truncated-to-empty) at the door.

### (a) Answer digest on the fact — **STRUCK (see amendment above)**

~~The fact carries `answerDigest = blake3(...)`.~~ Removed. The CAS id `answerRef` is already the digest of
the stored content, so it is its own tamper-evidence: **re-hash the fetched bytes and compare to `answerRef`**
— no separate digest field. `store.ts get()` performs this re-hash on every read.

### (b) Answer → CAS — real traceability (THE RATIFIED LEG)

The answer bytes go to CAS via the store's `put()` and the fact carries `answerRef = <cas id> = id(scrubbed
bytes)`. This is the leg that makes a fact auditable back to what produced it, and `answerRef` doubles as the
tamper-evidence at rest (re-hash-on-read).

- **Privacy / KNOW-11 (why this needed ratification):** the answer may contain a secret. It is scrubbed
  **before** `put()`, using the **same `@atlas/persist` `scrub`** the content-addressed transcript boundary
  already uses (`persist/src/transcript-store.ts` `put()` scrubs by construction; fitness function #121).
  This adds a **new call site** to the scrubber's surface; the scrubber-coverage fitness function is
  extended to cover it (`packages/cli/test/mine-answer-scrub-fitness.test.ts` — a DoD item, not an assumption).
- **Why the generic `store.ts put()` and not `@atlas/persist`'s scrub-enforced `TranscriptStore`:** that
  store enforces scrub-at-the-door _structurally_ (stronger), but it is **in-memory-only with zero production
  callers today** — it has no disk-persistence wiring. Routing the mine path through it is therefore
  **DEFERRED, not silently bypassed**: until that wiring exists, the answer goes through the mine driver's
  ordinary CAS `store.put()`, with scrub-before-put enforced at the call site (`mine-answer.ts`) **and** by
  the #121-style fitness function over that module. Flagged here so the shortcut is a recorded decision.
- **Storage cost:** accepted by the owner as the price of real provenance.

## 3. Interaction with #209 (the ledger must witness the transcript)

Once answers are stored, the run report can carry a **count over the stored `answerRef`s of admitted facts**
— so #209 **makes the issued-vs-stored CARDINALITY visible** (`modelCalls` issued vs `answerRef`s stored)
in the artifact, not only in a probe, and gives **per-answer traceability** (each admitted fact points at the
exact stored bytes). This is _not_ a claim that "issued ≠ stored is fully verifiable": a stale-but-valid ref
substitution (a real `answerRef` for a _different_ real stored answer) is not caught by the stored side
alone — that would need the report to bind `answerRef` to the site/rank it was issued for. **#209 consumes
#195(b).** Sequencing: #195(b) lands the stored answers, then #209 makes the report count/trace them.

## 4. Shapes (frozen; leg (a) struck)

- `WhyNot` reason gains `'answer-malformed'` with a sub-reason `'not-utf8' | 'multi-response'` (an empty /
  whitespace-only answer stays the **untagged** plain GEN-12 model-abstain — it is a decline, not a corruption).
- The fact / `CurrentNode` shape gains **`readonly answerRef?: string` (CAS id) only** — no `answerDigest`.
  **Optional** for additive tolerance (facts authored by non-mine paths, e.g. human `atlas emit`, carry none).
- The single-response predicate: **specified at build time from the incident fixture**, not guessed here;
  its only frozen requirement is that it REJECTS the 2026-08-04 splice fixture and ADMITS a normal single
  answer (both are DoD tests).

## 5. Godfile / blast radius

- `upsert.ts` carries the `answerRef` row field (the split that made room for it was `router.ts`→`upsert.ts`
  / `projection-types.ts`, already landed). **Correction found in build:** the row _type_ had the field but
  the CREATE branch never _carried_ it — a freshly mined node dropped `answerRef` (mirror of the "reference
  model vs shipped path" trap). `answerProvenanceOf(req)` now stamps it in CREATE/UPDATE, exactly as
  `governanceOf`/`relationOf` do.
- `llm.ts` is at **165/400** — the sanity gate + capture + scrub-and-put land here with room.
- `mine.ts` is at **399/400** — any new wiring forces a split.
- The sole production reader of a fact's provenance is the read/pack surface; new optional fields are
  additive (no exhaustive switch ranges over them). tsc + full suite + gates are the reachability proof.

## 6. Ratification (GAP-2 rite)

- **(a)+(b)+(c) owner-ratified 2026-08-10**; **leg (a) STRUCK 2026-08-10 on contract review** (see §2
  amendment) — the WP ships **(b)+(c)** only.
- Leg **(b)** touches **KNOW-11 / the scrubber surface** — the scrubber-coverage fitness function (#121)
  must be extended to the new `put()` call site as a **mandatory DoD item**, and **billy** cold-reviews the
  door (a secret reaching CAS unscrubbed is the exact failure this leg must not introduce).
- **lucy** cold-reviews each WP; one-fix-round. Gates (layer/godfile≤400/spec-conformance/id-integrity/
  reference-model) on every WP.
