# The backend specialist skill matrix — cold source review

**Verdict: one material transfer correction.** Remaining inspected claims acceptable at source-design level.

## Baseline and scope

- Review metadata worktree and supplied `backend-plugin` worktree independently returned HEAD `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`.
- Reviewed current `specs/backend-specialist/skill-matrix.md` and `skill-catalog.md`, especially GitHub adaptation lines 123–138; consulted supporting reports and selectively reopened upstream sources. `specs/backend-specialist/` is untracked: HEAD identifies repository baseline, not reviewed document bytes.
- Source/design review only. Matrix examples remain proposed, unexecuted fixtures. Runtime readiness and ecosystem-wide compatibility remain outside verdict.

## Material finding

### P2 — Qualify Fastify v5 full-JSON-Schema requirement

**Location:** `specs/backend-specialist/skill-matrix.md:19`.

“v5 requires full JSON Schema” applies default-compiler restriction to every Fastify v5 component. Existing custom validator/serializer compilers can accept other schema formats. Following this row for an already-selected Zod compiler could replace valid schemas, lose transforms/refinements, or create an unnecessary migration/blocker during ordinary implementation/refactoring.

**Primary evidence:** pinned [Fastify 5.6.1 migration guide](https://github.com/fastify/fastify/blob/v5.6.1/docs/Guides/Migration-Guide-V5.md#full-json-schema-is-now-required-for-querystring-params-and-body-and-response-schemas) expressly qualifies requirement: “If the default JSON Schema validator is used”; then permits overriding validator with formats such as Zod. Same-version [`compileSchemasForValidation` / `compileSchemasForSerialization`](https://github.com/fastify/fastify/blob/v5.6.1/lib/validation.js) delegate schemas to selected compilers; [`normalizeSchema`](https://github.com/fastify/fastify/blob/v5.6.1/lib/schemas.js) preserves custom-prototype schemas. This supplies concrete counterexample to universal wording without executing fixtures.

**Minimal fix:** replace clause with: “With default JSON Schema compilers, v5 requires full schemas instead of v4 shorthand; custom compilers retain their own schema contracts.” Keep R51’s Ajv-specific normalization/coercion recipe scoped to that selected compiler.

## Checked corrections and boundaries

- **SQLx provenance reconciled correctly:** `research/31-typed-sql.md:29` and `research/50-rust-variants.md:21`. Reopened [GitHub tag resolution](https://api.github.com/repos/transact-rs/sqlx/commits/v0.9.0): `75bc0487eb661da811bb7a3c5d158f1bd463fef4`; [published Cargo metadata](https://docs.rs/crate/sqlx/0.9.0/source/.cargo_vcs_info.json): `003b698e99e024f3621b8043a2426fde5b741171`. Different provenance scopes; neither replacement citation nor behavioral-regression claim warranted.
- **Matt reuse bounded:** catalog line 129 matches reopened pinned [TDD](https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/tdd/SKILL.md) and [implementation](https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/implement/SKILL.md) bodies: independent oracles transfer; repeat seam approval, review and commit workflow are explicitly removed.
- Other reopened controls corroborated FastAPI dependency lifetime, native pgx cancellation, Hono parsed-output handling, Rails enqueue-version split, Ecto transaction tuples, Anthropic evaluator failure handling, ECC exit-zero helper limitation, Prisma config and Supabase driver distinctions.
- Matrix lines 55/116 and catalog lines 69–71/149–151 preserve proposed-versus-measured evidence, codegen/type-versus-behavior distinctions and the backend specialist’s local SQL/helper/fixture judgment. Architecture, diagnosis and independent acceptance stay upstream.

## Focused recheck — 2026-10-04

**Disposition: P2 RESOLVED at source-design level.** This addendum supersedes P2’s open status and original correction-required verdict.

Reopened current `specs/backend-specialist/skill-matrix.md:19`. Row now states: “Default JSON Schema compilers require full schemas in v5; custom compilers retain their own schema contracts”. Wrong-transfer column restricts v4 shorthand warning to v5 default compilers and explicitly rejects transferring Ajv coercion/string-length assumptions into a Zod compiler recipe.

Both changes address reported overgeneralization and match already-inspected Fastify v5.6.1 migration guide and compiler delegation source cited above. Existing custom schemas remain valid under their selected compiler contracts; default-compiler migration constraint stays explicit. No further correction required for P2. Source-level acceptance remains limited to original inspected scope; this recheck establishes neither runtime readiness nor broader compatibility.
