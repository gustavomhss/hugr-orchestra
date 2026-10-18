# Properties — Block AUTHORING (CAMPAIGN-10) · S3-sibling ∀-laws (rendered, not invented)

> **state:** S3-sibling · **source (frozen):** [`method-tags-authoring.md`](./method-tags-authoring.md) `@sha256:538d8e23` — the `up-property` law of each behavioural INV ·
> **owner:** lead; the governance arm (PROP-AUTH-2, PROP-MCP-3) requires a billy review before freeze ·
> **purpose:** render every frozen `up-property` into a runnable `∀`-quantified property — the oracle-free, beyond-the-witness leg. **Invents no law.**
>
> **No FSPEC.** This surface authors no `formal` cluster (the one formal model, `FSPEC-merge`, is KRN's and is untouched here). So no law below is transcribed from `fspec-merge.md`; each `law` is the `∀ … . predicate` render of the frozen `up-property` prose, carried as a `ptr+digest` so an upstream edit renders the property **STALE**.
>
> `source` = ptr + `@sha256:` digest of the frozen `method-tags-authoring.md` (whole-file, first 8 hex). `arbitrary` is a **spec** for the generator to author, not runtime. `witness` links the goldens that instance the law.
>
> **Scope note.** The five `PBT`-tagged INVs (AUTH-1, AUTH-8, AUTH-11, AUTH-12, MCP-4) are the ones whose coverage genuinely requires a quantifier — they are the **agreement laws**. The `exhaustive` and `reference-model` INVs are covered by enumeration and conformance in [`goldens-authoring.md`](./goldens-authoring.md) and carry no property here; two are nonetheless rendered as laws (PROP-AUTH-2, PROP-MCP-3) because their _set-level_ statement is what the CI surface pin must assert, and a `∀` is the honest form of it.

---

### PROP-AUTH-1 — single-seam agreement

inv: INV-AUTH-1
source: ./method-tags-authoring.md#INV-AUTH-1 @sha256:538d8e23
law: ∀ rev R, anchor a reachable at R. plannerHash(a, R) ≡ gateHash(a, R) ∧ (∀ caller c performing zero set-up. plannerHash_c(a, R) ≡ plannerHash(a, R)) — over every language, and every anchor kind ∈ {file, dir, symbol}
arbitrary: arb over the built unit set of a multi-language fixture × {warm process, cold process}; a mutator that may substitute a second fold, a memoized digest table, or a caller-side warm-up requirement
covers_reqs: [ REQ-AUTH-1a, REQ-AUTH-1b, REQ-AUTH-1c, REQ-AUTH-1d, REQ-AUTH-1e ]
witness: [ SCN-AUTH-1a-1, SCN-AUTH-1c-1, SCN-AUTH-1d-1, SCN-AUTH-1e-1 ]
teeth: breaks-on "a planner whose fold is file-level-only from a cold call site — every FILE anchor agrees with the gate and only a `::` symbol anchor from an unwarmed process diverges, which no single hand-written witness reaches"

### PROP-AUTH-2 — planner write-freedom (set-level)

inv: INV-AUTH-2
source: ./method-tags-authoring.md#INV-AUTH-2 @sha256:538d8e23
law: ∀ door d ∈ AUTHORING_SURFACE, ∀ args x ∈ {valid ∪ malformed ∪ empty}. bytesWritten(d, x) == 0 (CAS ∧ projection ∧ cache) ∧ d ∉ WRITE_PATHS ∧ d ∉ GOVERNANCE_SURFACE (ADR-0004)
arbitrary: arb over the authoring door set × an arbitrary argument space; a mutator that may add a disk memo, a staging file, or a registration of a planner in either governed constant
covers_reqs: [ REQ-AUTH-2a, REQ-AUTH-2b, REQ-AUTH-2c, REQ-AUTH-2d, REQ-AUTH-2e ]
witness: [ SCN-AUTH-2a-1, SCN-AUTH-2b-1, SCN-AUTH-2c-1, SCN-AUTH-2d-1, SCN-AUTH-2e-1 ]
teeth: breaks-on "a planner that writes an index memo to `.atlas/cache` — the CAS and the projection are both untouched, so a store-only assertion passes and only the cache arm of the ∀ catches it"

### PROP-AUTH-8 — draft→emit round-trip acceptance

inv: INV-AUTH-8
source: ./method-tags-authoring.md#INV-AUTH-8 @sha256:538d8e23
law: ∀ rev R, anchor a reachable at R, slot s ∈ PredicateSlot, claim c ≠ ∅. emit(draft(a, s, c, R), R) on an unchanged repo == ACCEPTED — `rejections == 0`
arbitrary: arb over the fixture's REAL unit set (file · dir · symbol · grammar-less file) × the full 13-member slot union × arb claim strings (unicode, very long, punctuation-heavy, near-empty); repo held byte-identical between draft and emit
covers_reqs: [ REQ-AUTH-8a, REQ-AUTH-8b ]
witness: [ SCN-AUTH-8a-1, SCN-AUTH-8b-1 ]
teeth: breaks-on "a drafter correct for file anchors and wrong for the folded `::` symbol unit path — the natural hand-written witness is a file anchor, so only the ∀ over the real unit set reaches the symbol case. **This is the acceptance property of CAMPAIGN-10: if it does not hold, the surface has not delivered its outcome.**"

### PROP-AUTH-11 — dry-run fidelity (check ≡ door)

inv: INV-AUTH-11
source: ./method-tags-authoring.md#INV-AUTH-11 @sha256:538d8e23
law: ∀ fact f, rev r, actor α, token τ. check(f,r,α,τ).wouldEmit ≡ emit(f,r,α,τ).emitted ∧ firstRefusingGate_check(f,r,α,τ) ≡ firstRefusingGate_door(f,r,α,τ)
arbitrary: arb over (fact × rev × actor × token) biased to STRADDLE each gate boundary — including inputs that fail TWO or more gates simultaneously (the only shape that can reveal an order divergence); emit runs against a scratch store that is discarded
covers_reqs: [ REQ-AUTH-11a, REQ-AUTH-11b, REQ-AUTH-11c ]
witness: [ SCN-AUTH-11a-1, SCN-AUTH-11b-1, SCN-AUTH-11c-1 ]
teeth: breaks-on "a `check` that evaluates authz before truth — EVERY single-failure input still agrees; only a multi-gate-failure input reveals the order divergence, and only the ∀ generates one"

### PROP-AUTH-12 — refusal legibility

inv: INV-AUTH-12
source: ./method-tags-authoring.md#INV-AUTH-12 @sha256:538d8e23
law: ∀ input i ∈ malformed ∪ adversarial. refusal(i).gate ∈ GateName ∧ refusal(i).remedy ≠ ∅ ∧ ¬runtimeErrorShaped(refusal(i).reason) where `runtimeErrorShaped` matches a type-error, a stack frame, an undefined-property read, or a bare `undefined`
arbitrary: arb over the payload space — wrong types at every position, missing fields, `null`/`undefined` at every position, oversized values, deeply nested values, prototype-polluting keys, and the EXACT payload observed in the 2026-07-25 dogfood
covers_reqs: [ REQ-AUTH-12a, REQ-AUTH-12b, REQ-AUTH-12c, REQ-AUTH-12d ]
witness: [ SCN-AUTH-12a-1, SCN-AUTH-12b-1, SCN-AUTH-12c-1, SCN-AUTH-12d-1 ]
teeth: breaks-on "a validator that structures the shapes it anticipates and lets an unanticipated one fall through to a catch-all — precisely the observed `Cannot read properties of undefined (reading 'length')`; only the fuzz reaches the unanticipated shape"

### PROP-MCP-3 — advertised-surface totality (set-level)

inv: INV-MCP-3
source: ./method-tags-authoring.md#INV-MCP-3 @sha256:538d8e23
law: ∀ layer L. advertised(L) ≡ GOVERNANCE_SURFACE ∪ READ_SURFACE ∧ READ_SURFACE ∩ GOVERNANCE_SURFACE ≡ ∅ ∧ READ_SURFACE ∩ WRITE_PATHS ≡ ∅ ∧ |GOVERNANCE_SURFACE| == 6 ∧ |WRITE_PATHS| == 3 ∧ (∀ t ∈ READ_SURFACE. bytesWritten(t) == 0) (ADR-0005; ADR-0006 Decision 2 superseded the fixed count)
arbitrary: arb over layer wirings — the 6 governance tools + an arbitrary read-surface membership; a mutator that may register a planner in a governed constant, delegate a read leg to a write leg, or omit a member from the advertisement
covers_reqs: [ REQ-MCP-3a, REQ-MCP-3b, REQ-MCP-3c, REQ-MCP-3d, REQ-MCP-3e, REQ-MCP-3f, REQ-MCP-3g ]
witness: [ SCN-MCP-3a-1, SCN-MCP-3b-1, SCN-MCP-3c-1, SCN-MCP-3d-1, SCN-MCP-3e-1, SCN-MCP-3f-1, SCN-MCP-3g-1 ]
teeth: breaks-on "a read door added to `READ_SURFACE` that internally delegates to the emit leg for convenience — the union, both disjointness predicates, and both cardinalities ALL still hold; only the `bytesWritten == 0` conjunct catches the routing"

### PROP-MCP-4 — cross-transport equivalence, extended to the authoring doors

inv: INV-MCP-4
source: ./method-tags-authoring.md#INV-MCP-4 @sha256:538d8e23
law: ∀ door d ∈ AUTHORING_SURFACE, ∀ input x. serialize(cli(d,x)) ≡ serialize(mcp(d,x)) — byte-identical, valid ∨ malformed x, 0 divergence in coercion, defaulting, error shape, or field set
arbitrary: arb over inputs per door — valid under the published schema ∪ malformed — INCLUDING partially-populated results (an empty optional array, an absent optional string), which is the only shape a re-serialization divergence shows up in
covers_reqs: [ REQ-MCP-4a, REQ-MCP-4b, REQ-MCP-4c ]
witness: [ SCN-MCP-4a-1, SCN-MCP-4b-1, SCN-MCP-4c-1 ]
teeth: breaks-on "an MCP-side JSON round-trip that drops an `undefined`-valued optional field the CLI renders as absent-but-present — the two transports look identical for every FULLY-populated input and diverge only on a partially-populated one"

---

## Coverage (properties → REQs)

| property     | INV              |      REQs covered |
| ------------ | ---------------- | ----------------: |
| PROP-AUTH-1  | INV-AUTH-1       |                 5 |
| PROP-AUTH-2  | INV-AUTH-2       |                 5 |
| PROP-AUTH-8  | INV-AUTH-8       |                 2 |
| PROP-AUTH-11 | INV-AUTH-11      |                 3 |
| PROP-AUTH-12 | INV-AUTH-12      |                 4 |
| PROP-MCP-3   | INV-MCP-3        |                 7 |
| PROP-MCP-4   | INV-MCP-4        |                 3 |
| **total**    | **7 of 18 INVs** | **29 of 73 REQs** |

**Honest scope statement.** These seven properties cover the 29 REQs whose coverage a witness cannot
close. The other 44 REQs are covered by **enumeration over a finite closed set** (the door set, the
13-slot union, the route table, the occupancy states, the write-path set, the command map, the leg set) or
by **conformance against a named oracle** — both of which are exhaustive by construction for their space,
so a `∀` would add ceremony, not coverage. This split is the S2 method-tag decision, not a shortcut:
see [`method-tags-authoring.md`](./method-tags-authoring.md) §tag distribution.
