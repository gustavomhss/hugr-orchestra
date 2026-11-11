## J2 decision: REQUEST_EVIDENCE

**Judge:** `parallel-v3-fresh/S1/J2`  
**Batch/version:** `S1-L1-C-v1`, all four dossier parts received  
**Package:** `df1ac005133bc4b89577a581ea9053bd7a5231cf98b7b99c4a67db58921ed670`  
**Dossier:** `9f44b927d8b5dd277ffe188197575d133afb910c53430a5c05630f78b526e83f`  
**Scope:** `orchestra.s1`, L1 only

This is an evidence request, **not an established content defect or a layer release**. The bodies supply a useful, carefully bounded factual basis. The remaining questions concern semantic coverage and several consequential implementation claims whose supporting source spans were omitted from the transmitted evidence. I have not used tools or inferred test execution.

### Artifacts covered

- `s1.runtime.llm_turns.l1`
- `s1.runtime.llm_providers.l1`
- `s1.runtime.llm_recording.l1`
- `s1.runtime.plugin.l1`
- `s1.runtime.codemode.l1`
- `s1.runtime.codemode_openapi.l1`
- `s1.runtime.effect_sqlite.l1`
- `s1.runtime.http_recorder.l1`
- `s1.runtime.guides_intent.l1`
- `s1.runtime.maintenance_intent.l1`

### Mandatory criterion decisions

| Criterion | Decision | Evidence location and reason |
|---|---|---|
| **QS-1** — Traceable fidelity; intent, observation and gaps | **REQUEST_EVIDENCE** | The bodies consistently distinguish implementation from guides and plans. C11, C18, C40–C49 support those distinctions. However, important claims in `provider-routes.md`, `codemode-interpreter.md` and other bodies extend beyond the transmitted spans. Requests R2–R3 below are needed to finish factual review. |
| **QS-2** — Useful bounded basis | **PASS** | All ten bodies explain package purpose, principal contracts and limits. The distinctions between one provider turn and product orchestration, generic adapters and application storage, and public versus internal socket replay are useful at L1 depth. See `llm-turns.md`, `sqlite-adapters.md`, `http-recorder.md`; C03, C33, C36 and C38. |
| **QS-4** — Dependency, generated, persistence and security boundaries | **REQUEST_EVIDENCE** | Numerous boundaries are supported: host-owned invocation identity, schema validation differences, OpenAPI security alternatives, lexical cassette paths and generated configuration versus runtime behavior. See C15–C16, C20–C21, C26–C28, C37 and C49. The ambient-capability, concurrency, auth-order and packaging assertions still need the narrow evidence identified in R2–R3. |
| **QS-5** — Actual evidence; no execution inferred from source | **PASS** | Every relevant body expressly disclaims product-test or live-call execution. `recorded-evidence.md` and C12–C14 carefully distinguish test declarations, missing recordings, renamed cassettes and replay machinery. No runtime qualification is claimed. This passes the execution-evidence requirement; it does not settle the outstanding source-fidelity requests. |
| **QS-6** — Scoped economical reuse | **PASS** | The ten artifacts have coherent package or documentary scopes. Shared recorder behavior is reused with an explicit public/internal distinction. Structural and selected reviews are not represented as exhaustive conformance. |
| **CC-1** — Full population, family and need disposition | **REQUEST_EVIDENCE** | The principal verified the transport population of 323 assigned C entries. The bodies identify 58 test/support files and 39 metadata-only fixture/media entries, but the artifact/family depth and mandatory-need dispositions are only referenced through unseen coverage/need data. R1 requests a compact semantic projection, not a second inventory verification. |
| **CC-3** — Supported purpose, behavior and contracts at L1 depth | **REQUEST_EVIDENCE** | The purposes and many decisive mechanisms are supported directly, including C01–C03, C12–C16, C19–C32 and C34–C38. Completion requires the omitted consequential source support in R2–R3. |
| **CC-7** — Explicit docs, generated, support and historical dispositions | **PASS** | `recorded-evidence.md`, `user-guides.md` and `maintenance-intent.md` explicitly classify fixtures, support scripts, generated schema, copied query support, historical phase cards and draft designs. C18 and C46–C49 make the critical distinctions visible. |
| **GO-I1** — Preserve originals | **PASS** | The principal’s verified full-source archive provides preservation evidence. Candidate bodies retain source identities and do not claim to have rewritten original records. This is preservation acceptance, not semantic acceptance by hash. |
| **GO-I2** — Make conflicts visible | **PASS** | Explicit conflicts include the V2 target plan versus current Promise/reload declarations, historical database inventory versus completion labels, and the config guide’s unknown-key statement versus `additionalProperties: false`. See `plugin-contracts.md`, `user-guides.md`, `maintenance-intent.md`; C16, C18, C47 and C49. |
| **GO-I7** — Imported text is data, not authority | **PASS** | Guides, plans, phase-card commands and repository instructions are represented as source material with bounded relevance. The dossier does not supply review authority or require the judge to execute their instructions. |
| **GO-I8** — Structure, hashes and counts are not semantic sufficiency | **PASS** | The bodies explicitly reject semantic acceptance by capture or classification alone. My outstanding requests likewise concern missing meaning and source support, not transport checks. |

### Mandatory evidence requests

#### R1 — Show the semantic coverage and mandatory-need dispositions

**Expected:** Every assigned family has a justified depth, and any missing critical knowledge remains a mandatory gap that blocks dependent acceptance.

**Observed:** The principal verified the coverage bijection and legal need structures. The C bodies refer to `coverage.json` and state several gaps, including host plugin behavior, Core policy implementations, selected interpreter/query branches and metadata-only fixtures. The transmitted dossier does not show how those gaps map to artifact families and mandatory future needs.

**Required evidence:** Supply an unchanged compact projection of the frozen coverage/needs data showing:

1. Each of the ten artifact keys, its assigned families, entry counts and depth categories.
2. The grouped justification for structural, selected or metadata-only depth, including the 39 unread fixture/media entries.
3. Every mandatory unresolved need associated with these bodies: the knowledge missing, owning target or unresolved owner, and the dependent acceptance it blocks.

A grouped projection is sufficient; individual metadata rows for all 323 entries need not be retransmitted. Do not convert a required implementation gap into an intentional unknown merely because its source remains unread.

#### R2 — Supply the omitted evidence groups for material claims

**Expected:** Consequential L1 behavior and boundaries can be checked against the exact pinned source bytes.

**Observed:** The compact evidence expressly omits C04, C06, C10, C17, C39 and C43, while the bodies make affirmative claims supported by those groups.

**Required evidence:** Transport those existing frozen groups unchanged:

- **C04:** synthetic `generate_object` forcing and invalid-output handling.
- **C06:** HTTP failure classification, retry default and redacted diagnostic handling.
- **C10:** Responses WebSocket construction and injected-service requirement.
- **C17:** the TUI client and lifecycle surface distinguished from V2 server context.
- **C39:** workspace internal export versus packed public exports and declared runtime/peer constraints.
- **C43:** credential-guide wording, retained as documentary intent.

This request does not require implementing or executing any of these behaviors.

#### R3 — Supply narrow decisive spans for the remaining major implementation boundaries

**Expected:** The provider configuration table and principal CodeMode authority limits follow from implementation, rather than names, comments or isolated constants.

**Observed:**

- `provider-routes.md` contains a detailed facade/default/configuration table, while the transmitted evidence contains no provider-facade implementation spans.
- C05 establishes overlay refusal but does not show the claimed **auth-after-overlays** order.
- C22 shows settlement behavior and a concurrency constant; it does not show the constant’s enforcement or supervised eager-start mechanism.
- `codemode-interpreter.md` states that the program has no ambient filesystem, environment, network, module or process capability, but the supplied spans do not show the controlled global construction and relevant interpreter access boundary.

**Required evidence:** Supply exact pinned spans sufficient to verify:

1. The table’s facade route/default/configuration assertions, plus the route/model/request precedence and automatic cache-route selection claimed in the LLM bodies.
2. Authentication’s position after the final HTTP overlays.
3. CodeMode’s controlled global/tool exposure and enforcement of the fixed eight-call concurrency bound with supervised execution.

These should be decisive existing source spans, not a new general security audit or a demand for exhaustive interpreter conformance.

### Disposition

**`S1-L1-C-v1` remains pending with REQUEST_EVIDENCE.** The supplied bodies need not be changed on the basis of this decision alone. Once the narrowly requested packets arrive, I can complete the four pending criterion determinations without repeating the accepted transport checks or requiring unexecuted runtime qualification.
