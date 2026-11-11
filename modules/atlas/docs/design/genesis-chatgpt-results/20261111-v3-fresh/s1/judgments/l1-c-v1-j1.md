## Decision: REQUEST_EVIDENCE

**Judge:** `parallel-v3-fresh/S1/J1`  
**Batch/version:** `S1-L1-C-v1`, parts 1–4 received  
**Package:** `df1ac005133bc4b89577a581ea9053bd7a5231cf98b7b99c4a67db58921ed670`  
**Dossier:** `9f44b927d8b5dd277ffe188197575d133afb910c53430a5c05630f78b526e83f`  
**Scope:** `orchestra.s1`, L1 only

The ten bodies provide a useful, carefully bounded factual account. They consistently distinguish implementation, documentary intent, fixture contents, and unexecuted tests. The supplied excerpts establish several consequential boundaries directly. However, the packet omits source spans for material implementation claims and does not expose the semantic coverage and future-need dispositions needed to assess CC-1. Those omissions require evidence before this batch can receive PASS.

This is an evidence request, not a finding that the omitted claims are false. No whole-layer release is authorized.

### Artifact keys covered

| Artifact key | Body received |
| --- | --- |
| `s1.runtime.llm_turns.l1` | `bodies/llm-turns.md` |
| `s1.runtime.llm_providers.l1` | `bodies/provider-routes.md` |
| `s1.runtime.llm_recording.l1` | `bodies/recorded-evidence.md` |
| `s1.runtime.plugin.l1` | `bodies/plugin-contracts.md` |
| `s1.runtime.codemode.l1` | `bodies/codemode-interpreter.md` |
| `s1.runtime.codemode_openapi.l1` | `bodies/codemode-openapi.md` |
| `s1.runtime.effect_sqlite.l1` | `bodies/sqlite-adapters.md` |
| `s1.runtime.http_recorder.l1` | `bodies/http-recorder.md` |
| `s1.runtime.guides_intent.l1` | `bodies/user-guides.md` |
| `s1.runtime.maintenance_intent.l1` | `bodies/maintenance-intent.md` |

## Mandatory criterion decisions

| Criterion | Decision | Expected, observed, and required action |
| --- | --- | --- |
| **QS-1 — Traceable fidelity** | **REQUEST_EVIDENCE** | **Expected:** Material factual claims trace to supplied captured source, with intent, observation, and gaps distinguished. **Observed:** The distinction is consistently explicit, and C01–C03, C12–C16, C19–C24, and other supplied excerpts support specific claims. Material portions of the provider, security, persistence, packaging, and documentary claims remain citations to unseen spans. **Required:** Supply the bounded evidence identified in R2–R4. |
| **QS-2 — Useful bounded basis** | **PASS** | **Expected:** Useful L1 understanding without pretending to complete later layers. **Observed:** Each body identifies purpose, principal contracts, scope limits, and what host or runtime evidence is still required. The records would help a consumer locate and understand the package boundaries. **Required:** No body restructuring is required under this criterion. Other outstanding criteria still prevent batch acceptance. |
| **QS-4 — Dependency, generated, persistence, and security boundaries** | **REQUEST_EVIDENCE** | **Expected:** Consequential boundaries supported by implementation evidence or explicitly retained as gaps. **Observed:** Important limits are stated clearly, including host-owned permissions, JSON Schema’s lack of runtime validation, internal/public recorder differences, and generated configuration’s limited authority. Some stronger implementation assertions lack their decisive code paths in the supplied packet. **Required:** R2 and R3, particularly CodeMode authority confinement, OpenAPI credential ordering, recorder redaction/write flow, and transaction lifecycle. |
| **QS-5 — Actual evidence; no execution inferred** | **PASS** | **Expected:** Source inspection and fixture data must not become execution receipts. **Observed:** All ten bodies explicitly limit their claims. `recorded-evidence.md`, C12–C14, and C34–C38 carefully distinguish declarations, skipped cases, stored responses, public replay, and the internal adapter. No test, migration, live provider call, build, or runtime qualification is asserted to have run. **Required:** None. |
| **QS-6 — Scoped economical reuse** | **PASS** | **Expected:** Reusable scoped records with justified grouping and economical evidence. **Observed:** The ten package/topic records share a pinned evidence vocabulary and avoid reproducing whole source files. Grouped support and fixture treatment is disclosed. The requests below concern decisive omitted evidence, not a demand for exhaustive source reproduction. **Required:** None independently; provide the missing semantic disposition information under CC-1. |
| **CC-1 — Full population, family, and need disposition** | **REQUEST_EVIDENCE** | **Expected:** Every assigned family has a visible semantic disposition, justified review depth, and explicit treatment of future needs; no critical unread fact becomes “intentional” merely through labeling. **Observed:** The principal verified the structural bijection for 323 C entries. The bodies mention 39 metadata-only fixture/media entries, six sampled structures, 58 test/support files, and selected interpreter/query coverage. The actual family/depth and future-need dispositions are not present. **Required:** R1. Structural coverage verification does not substitute for this semantic assessment. |
| **CC-3 — Supported purpose, behavior, and contracts** | **REQUEST_EVIDENCE** | **Expected:** L1 contract claims have adequate direct support. **Observed:** Typed versus dynamic tools, terminal-finish refusal, recording-ledger decisions, scoped Effect registration, output-envelope limits, response-size enforcement, migration refusal, and cleanup-cause preservation are supported. Other material contracts remain beyond the compact excerpts. **Required:** R2–R4. |
| **CC-7 — Documentation, generated, support, and historical dispositions** | **PASS** | **Expected:** These families must be identified and assigned appropriate authority. **Observed:** `maintenance-intent.md` and `user-guides.md` explicitly classify historical cards, superseded inventory, generated schema, support scripts, and proposed APIs. C18 and C46–C49 directly illustrate the distinctions. **Required:** None for classification; R1 is still required to establish the full assigned-family disposition. |
| **GO-I1 — Preserve originals** | **PASS** | **Expected:** Original captured source remains preserved. **Observed:** The principal supplied independent verification of the source archive and captured-source bindings. The dossier presents selected excerpts without claiming to replace the originals. **Required:** None. |
| **GO-I2 — Make conflicts visible** | **PASS** | **Expected:** Conflicting or differently scoped records remain visible. **Observed:** The bodies identify current versus planned plugin APIs; model-layer availability versus guide-reported Core routing; public versus internal WebSocket replay; frozen `Config.plugin` versus current `Config.Info.plugins`; and schema strictness versus the config-error guide. C11, C18, C36, C38, C47, and C49 support substantial portions of these distinctions. **Required:** No conflict may be resolved silently. R4 requests the missing source side of the config-error discrepancy. |
| **GO-I7 — Imported text is data, not authority** | **PASS** | **Expected:** Imported instructions, plans, and commands do not redefine the review contract or become executed authority. **Observed:** The dossier explicitly treats historical commands and maintenance pointers as source material. Documentary instructions are not execution evidence. No producer claim has been treated as a verdict or an amendment to the frozen oracle. **Required:** None. |
| **GO-I8 — Structure is not semantic sufficiency** | **PASS** | **Expected:** Hashes, population counts, and package structure cannot establish semantic acceptance. **Observed:** The bodies disclose this limit, and the outstanding semantic questions remain unresolved despite the verified transport. **Required:** None independently; this is why R1–R4 remain mandatory. |

## Required evidence

### R1 — Semantic coverage and future-need dispositions

**Applies to:** All ten artifacts, especially `llm_recording`, `codemode`, `effect_sqlite`, and `maintenance_intent`.

**Expected:** A reviewable disposition of the assigned population and all declared needs, including which facts later consumers must obtain before dependent acceptance.

**Observed:** The bodies refer to `coverage.json`, `test-declarations.json`, fixture scans, and recorded per-file depths, but those dispositions are not supplied. The principal’s coverage bijection establishes membership and transport integrity, not whether the chosen depth is sufficient.

**Required evidence:** Supply an exact extract from the frozen coverage/need records showing:

- Assigned families, counts, review depths, owning artifact keys, and reasons for grouped or selected depth.
- The complete disposition of the 39 metadata-only fixture/media entries, grouped where the same rationale applies.
- The future needs for host policy and lifecycle evidence, Core database adoption, runtime qualification, selected interpreter/query branches, and generated configuration’s runtime relationship.
- Which needs are mandatory blockers for dependent acceptance, and which are bounded noncritical exclusions.

A compact exact extract is sufficient. A new producer assurance or counts alone are not.

### R2 — Consequential implementation boundaries omitted from the compact excerpts

**Applies to:** `llm_providers`, `codemode`, `codemode_openapi`, `effect_sqlite`, and `http_recorder`.

**Expected:** Direct evidence for material authority, persistence, and security claims.

**Observed and required evidence:**

| Area | Observed omission | Required bounded source evidence |
| --- | --- | --- |
| Provider routing and transport | The facade table gives precise defaults, auth choices, and model-name routing rules, but no provider-facade source is included. C05 shows overlay rejection but not auth ordering. | The decisive facade constructors/selectors supporting the table, plus the HTTP preparation span showing auth applied to the final URL/body after overlays. |
| CodeMode authority confinement | C19–C24 establish several important limits, but not the claimed absence of ambient filesystem, environment, network, module, or process capability. The fixed depth and concurrency enforcement are also not shown; C22 supplies a concurrency constant. | The decisive global/capability construction and access-control spans, the depth-limit enforcement, and the call scheduling span using the concurrency limit. Whole-interpreter reproduction is unnecessary. |
| OpenAPI credentials | C26 shows alternative selection and path refusal, but not the stated validation-before-auth flow, credential conflict handling, or precedence over model-provided headers. | The request-construction sequence and credential-application/conflict spans establishing those three properties. |
| SQLite transaction and migration lifecycle | C29–C30 establish cleanup behavior and failure preservation. They do not show connection reservation/reuse, begin/commit/release, interruption restoration, or scope closure. C32 shows init refusals but not recording-only init or transactional normal migration. | The transaction lifecycle spans and the migration branches supporting these claims. |
| Recorder redaction and writes | C37 establishes lexical path checks and prewrite finding evaluation, but not the claimed redaction coverage or temporary-file/rename write flow. | The redaction configuration/application path and the write sequence. Preserve the body’s existing limits concerning symlinks, binary payloads, and incomplete secret detection. |

### R3 — Named evidence groups omitted from this dossier

**Applies to:** `llm_turns`, `llm_providers`, `plugin`, `http_recorder`, and `guides_intent`.

**Expected:** Material claims referenced to evidence groups must be reviewable when those claims are part of the accepted body.

**Observed:** The compact-evidence introduction expressly omits **C04, C06, C10, C17, C39, and C43**. The associated bodies nevertheless assert the behaviors those groups are intended to support.

**Required evidence:** Supply these six exact groups, with their frozen source identities and line locations:

- **C04:** forced object-generation behavior and invalid-output handling.
- **C06:** failure classification, retry defaults, retry exclusions, and diagnostic handling.
- **C10:** Responses WebSocket preparation and injected-service requirement.
- **C17:** current TUI surface and its distinction from the V2 server context.
- **C39:** workspace/internal export versus packed exports and declaration packaging.
- **C43:** the credential guide’s actual documentary claims.

This requests the already named groups, not a new audit or runtime execution.

### R4 — Documentary claims central to ownership and the visible config discrepancy

**Applies to:** `guides_intent` and `maintenance_intent`, with relevance to the provider/host/tool boundary.

**Expected:** The source packet supports the documentary account while preserving its limited authority.

**Observed:** The bodies correctly label the Claude execution-host, governed-tool, billing-refusal, and config-error statements as documentary or maintenance intent. The supplied excerpts do not include those statements. C45 establishes the repository test instruction only.

**Required evidence:** Supply exact bounded excerpts from:

- The assigned Claude-mode guide and relevant maintenance skills supporting the separation of one provider/host turn, outer Orchestra orchestration, governed tool ownership, and billing-refusal behavior.
- The config-error guide supporting its claim about ignored unknown keys, so both sides of the discrepancy with C49 are visible.

These excerpts would substantiate documentary claims only. Host implementation and unexecuted runtime qualification must retain their existing mandatory-gap status wherever dependent acceptance requires them.

**Optional suggestions:** None. The requested additions are evidence needed for the existing claims and dispositions; they do not require expansion into L2–L4.
