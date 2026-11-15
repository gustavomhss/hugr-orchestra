## Decision: FIX-FIRST

**Judge:** `parallel-v3-fresh/S1/J1`  
**Batch/version:** `S1-L1-B-v2`, all six parts received  
**Aggregate package:** `d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e`  
**Dossier:** `42c2595c2e243b3612a13b7ed615c5bfbeb731706f760119c1f7fd6719541def`  
**Scope:** `orchestra.s1`, L1 only

The package supplies substantial direct evidence for the architecture, API adapters, client generation, and SDK composition. The preserved correction to `s1.api.session-contract` is supported by **S16, handler lines 264–273**: the inspected MCP error branch maps to `UnknownError` without a logging call.

One additional body statement needs correction. Two bounded evidence requests also remain, including the disposition of the large set of handwritten domain sources. This batch does not yet receive semantic PASS or authorize whole-layer release.

## Artifact coverage

| Artifact key | Review status |
| --- | --- |
| `s1.api.boundaries` | Stated boundary claims supported. |
| `s1.api.schema-contracts` | Selected foundational claims supported; broader domain disposition remains subject to B3. |
| `s1.api.session-contract` | Corrected MCP statement supported; B2 requires narrow contract evidence. |
| `s1.api.server-edge` | **FIX-FIRST: B1.** |
| `s1.api.stream-contract` | **REQUEST_EVIDENCE: B2.** |
| `s1.api.client-projection` | **REQUEST_EVIDENCE: B2.** |
| `s1.api.codegen` | Stated generation mechanisms and authority supported. |
| `s1.api.sdk-composition` | Stated composition and renewal branches supported; the surface-only tool module remains subject to B3. |
| `s1.api.surface-disposition` | Structural accounting supported; **REQUEST_EVIDENCE: B3** for semantic need disposition. |

## Mandatory criteria

| Criterion | Decision | Expected, observed, and required action |
| --- | --- | --- |
| **QS-1** | **FIX-FIRST** | **Expected:** Material statements faithfully reflect the cited code. **Observed:** Most decisive claims have direct support, and the MCP correction is accurate. `server-edge.md` describes a reason truncated to 1,024 characters, while C29 appends an additional suffix after truncation. Some other precise claims have cited but unsupplied decisive spans. **Required:** B1 and B2. |
| **QS-2** | **PASS for bounded records** | **Expected:** Useful L1 factual understanding with limits. **Observed:** The bodies explain concrete mechanisms and distinguish declarations, delegation, and execution. **Required:** No general expansion into later layers; B3 must establish whether the remaining domain coverage is sufficient for its actual L1 needs. |
| **QS-4** | **REQUEST_EVIDENCE** | **Expected:** Dependency, generated, persistence, and security boundaries must be supported at their claimed depth. **Observed:** C01–C12, C24–C32, C37–C47, and S20–S33 support substantial boundary facts. The cross-session message assertion needs evidence for the declared or implemented check. **Required:** B2; retain F04–F08 without treating them as fulfilled. |
| **QS-5** | **PASS** | **Expected:** Inspection and tests-as-source must remain separate from execution. **Observed:** The bodies and S34–S38 explicitly describe unexecuted assertions. No generation, build, server exercise, provider call, runtime binding, or CI success is claimed. **Required:** None. |
| **QS-6** | **PASS for support/generated grouping** | **Expected:** Economical reuse with justified grouping. **Observed:** Generation manifests, authority files, representative outputs, and test/support dispositions justify grouped treatment of those families. **Required:** B3 separately addresses handwritten domain sources; grouping them cannot establish their semantic sufficiency by itself. |
| **CC-1** | **REQUEST_EVIDENCE** | **Expected:** Full population/family/need disposition, including critical unknowns and blocked dependents. **Observed:** The 472-entry partition, 52 families, 68 groups, and F01–F09 account for membership and broad gaps. The 190 surface-indexed handwritten sources are still grouped primarily by package, without showing which domain knowledge is required for current L1 acceptance, already supplied elsewhere, or a mandatory unresolved gap. **Required:** B3. |
| **CC-3** | **REQUEST_EVIDENCE** | **Expected:** Supported purpose, behavior, and contracts at L1 depth. **Observed:** Substantial foundational, generation, authorization, and composition contracts are supported. Specific API/stream/client statements still need their decisive spans, and broader domain purposes/contracts are not established by an import/declaration index. **Required:** B2 and B3. |
| **CC-7** | **PASS** | **Expected:** Explicit documentation, generated, support, and historical dispositions. **Observed:** Historical baselines, manifests, generated products versus test fixtures, unread support files, and intended test assertions remain distinct. Evidence includes S01–S04 and S32–S38. **Required:** None. |
| **GO-I1** | **PASS** | **Expected:** Originals remain preserved. **Observed:** Original/candidate identities and the separate one-sentence correction are explicit; the principal’s mechanical verification preserves the prior payload and other bodies. **Required:** Preserve that approach for B1. |
| **GO-I2** | **PASS** | **Expected:** Source discrepancies remain visible. **Observed:** README versus binary `fs.read`, upload versus the inspected transfer group/handler, V2 naming versus guide intent, and the MCP correction are exposed rather than silently reconciled. **Required:** Preserve these distinctions. |
| **GO-I7** | **PASS** | **Expected:** Imported text cannot redefine review authority. **Observed:** Repository instructions and the supplied criteria excerpt have been treated as evidence. They have not displaced the principal’s frozen oracle. **Required:** None. |
| **GO-I8** | **PASS** | **Expected:** Counts, hashes, and structure are insufficient for semantic acceptance. **Observed:** The dossier expressly recognizes that limit. The outstanding B3 assessment is not discharged by the verified coverage bijection. **Required:** Resolve the semantic request, not merely repeat the mechanical verification. |

## Mandatory findings

### B1 — Correct the schema-diagnostic length statement

**Artifact:** `s1.api.server-edge`  
**Location:** “Error declarations and composition,” second paragraph; evidence **C29**, `packages/server/src/middleware/schema-error.ts`, lines 10–19.

**Expected:** Describe the actual bounded diagnostic construction.

**Observed:** The body says the adapter “logs a reason truncated to 1,024 characters.” The supplied implementation returns the retained prefix **plus** `... (N more chars)` when truncation occurs, and logs/returns that resulting string. Thus the final reason is longer than the retained-prefix limit.

**Required correction:** State that the adapter retains the first 1,024 characters **and appends an omitted-character marker**, without implying a 1,024-character cap on the final reason. Supply the nearby `REASON_LIMIT` definition to bind the numerical limit. Preserve the original body and provide the corrected body identity/diff.

This finding concerns source fidelity, not a demand for a runtime test.

### B2 — Supply narrow decisive spans for remaining contract claims

**Expected:** The packet must support the specific claimed contract or adapter behavior without inferring unseen Core behavior or production setup from tests.

**Observed:** The cited files are captured, but the supplied selections omit these decisive portions:

| Artifact | Claim needing the missing evidence | Required evidence |
| --- | --- | --- |
| `s1.api.session-contract` | Active sessions are process-local foreground drains; history limit is 1–100. | The `SessionActive` definition and active-route description, plus the `SessionHistoryLimit` definition. C21 currently stops before the active description and references the history-limit schema without displaying it. |
| `s1.api.session-contract` | A cross-session message returns `MessageNotFoundError`. | The declared contract or accepted implementation span establishing cross-session rejection. S16 currently shows only that an absent result from `session.message(ctx.params)` maps to this error. If the check remains an external Core gap, narrow the body to the observed adapter behavior. |
| `s1.api.stream-contract` | The production frame cache is shared across subscribers, with capacity 4,096. | The production allocation/use of `eventFrames()` around the event handler and the `subscriberCapacity` definition. C33 establishes the cache mechanism; S36’s test assertions do not establish its production allocation scope. |
| `s1.api.client-projection` and `s1.api.stream-contract` | Binary-body failures lack the JSON reader’s catch; the SSE reader cancels and releases its reader. | The omitted generated runtime branches, including the binary-success branch and complete SSE `finally` block. A short contiguous extract around the existing C34 selections is sufficient. |

No execution or full-file reproduction is requested.

### B3 — Make the handwritten-domain need disposition reviewable

**Artifacts:** Primarily `s1.api.surface-disposition`; also the broader limits of `schema-contracts` and `sdk-composition`.  
**Locations:** Coverage groups **G30, G39, G52, G57**; justification **R03**; future obligation **F02**.

**Expected:** Critical missing knowledge must remain a mandatory gap with identifiable blocked dependents. Consumers must receive the necessary ownership understanding rather than be left to rediscover it from an index.

**Observed:** The packet explicitly and honestly identifies:

- 94 Schema domain sources;
- 44 Protocol domain sources;
- 51 Server domain sources;
- SDK `src/tool.ts`;

as surface-indexed only. Their actual domain membership, purpose/contract needs, and relationship to the required L1 knowledge are not present in the supplied projection. F02 blocks later claims about unreviewed internals, but does not establish which missing facts are critical to the current required basis or already covered by another supplied artifact.

**Required evidence:** Provide a compact **domain-level** disposition for those four groups. For each meaningful domain or justified group, identify:

1. Its member paths or an exact membership reference already independently bound by the principal.
2. Its L1 purpose and contract/ownership need.
3. The existing artifact/evidence that supplies that understanding, **or** the specific mandatory knowledge gap and dependent claim/layer that remains blocked.
4. Why the chosen depth is adequate for that need, including any justified exclusions.

Grouping is permitted. This does **not** require reading every generated file, executing tests, or performing L4 maintenance. It requires semantic need triage for handwritten production domains; the aggregate label “surface-only” and the existence of nine bodies cannot supply that triage.

**Optional suggestions:** None. These findings are limited to factual precision and missing evidence under the original L1 bar.
