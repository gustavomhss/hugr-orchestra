# B-v3 body corrections

Only server-edge, schema-contracts and surface-disposition change relative to B-v2. The Session body is copied exactly from the preserved MCP correction. Six bodies are byte-for-byte unchanged. All prior files remain at their original paths.

## s1.api.schema-contracts

Base 4868 bytes / `1a8dce30625d8d8641a48f8594736b1da4bbb6bd23c13562bd332fd5990cd8cb`; new 5188 bytes / `c6ebd6124d89092e859aaa6a6a07c2a6fca5e2cdc82a62254b701b2de60266b2`.

```diff
--- producers/b/bodies/schema-contracts.md
+++ revisions/b-l1-v3/bodies/schema-contracts.md
@@ -28,6 +28,6 @@
 
 ## Evidence and limits
 
-Full reads: `schema.ts`, `session-id.ts`, `session.ts`, `prompt.ts`, `prompt-input.ts`, `session-input.ts`, `session-delivery.ts`, `session-message.ts`, `event.ts`, `session-event.ts`, `session-status-event.ts`, `event-manifest.ts`, `durable-event-manifest.ts`, `location.ts`, and `model.ts`. Exact representative excerpts appear in `review-evidence.md`. The remaining Schema production modules are captured and literally indexed, with their internal semantics left unclaimed in `coverage.json`.
+Full reads: `schema.ts`, `session-id.ts`, `session.ts`, `prompt.ts`, `prompt-input.ts`, `session-input.ts`, `session-delivery.ts`, `session-message.ts`, `event.ts`, `session-event.ts`, `session-status-event.ts`, `event-manifest.ts`, `durable-event-manifest.ts`, `location.ts`, and `model.ts`. Exact representative excerpts appear in `review-evidence.md`. The frozen `coverage.json` recorded the remaining 94 Schema production modules as captured and literally indexed. B-v3 preserves that historical record and adds full literal reads with bounded domain purpose, contract and ownership triage in `revisions/b-l1-v3/review-domain-disposition.md`. That supplement distinguishes DTO declarations, executable helpers and attributed service intent; it does not establish unobserved service execution or a semantic PASS.
 
 The compatibility, contract-hygiene, and event-manifest tests were read as source only. This packet does not assert that every current schema meets every guide rule, that all historical rows decode, or that schema generation/tests passed. Legacy persistence migration and domain-service behavior require the relevant Core sources and later accepted work.
```

## s1.api.server-edge

Base 5106 bytes / `f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de`; new 5596 bytes / `711c744e089e59a11ee0b56ba4ec495277993dc7a58e351c8e2af4dc557ce404`.

```diff
--- producers/b/bodies/server-edge.md
+++ revisions/b-l1-v3/bodies/server-edge.md
@@ -8,7 +8,7 @@
 
 Protocol's `makeDefaultApi` assembles groups and accepts middleware keys supplied by its caller. Server installs real location services. General authorization and schema-error middleware are applied at API composition; the source comments and placement explicitly put authentication before caller-selected location. Capability groups add capability authorization before location work. The API does not apply identical location selection to every group: global/project/config/trust/board and session-scoped routes have deliberately different composition.
 
-The schema-error adapter logs a reason truncated to 1,024 characters and returns an `InvalidRequestError` with kind. It does not expose an unbounded raw parser diagnostic. A defect outside the typed error mapping is not proven to receive this treatment.
+The schema-error adapter defines `REASON_LIMIT = 1024`. For an oversized reason it retains `reason.slice(0, REASON_LIMIT)` and appends `... (N more chars)`, where N is `reason.length - REASON_LIMIT`; the limit therefore applies to the prefix as measured by JavaScript string length/slice. It logs and returns that prefix plus the omitted-character count in an `InvalidRequestError` with kind, so the complete summary may exceed 1,024 characters. A defect outside the typed error mapping is not proven to receive this treatment.
 
 ## Authentication paths
 
@@ -30,4 +30,4 @@
 
 Full reads cover Protocol `api.ts`, `errors.ts`, the three middleware tag modules, relevant PTY/capability declarations, Server `auth.ts`, `principal.ts`, `location.ts`, `routes.ts`, the four middleware implementations, and PTY/capability/model/provider handlers. Exact excerpts are in `review-evidence.md` and the source manifest binds the entire bytes.
 
-No authentication request, origin check, provider operation, file read, socket upgrade, or runtime test was performed. The PTY handler explicitly uses an unbounded outgoing queue and retains a shutdown-tracking TODO; slow-reader memory growth is a real source-level limit, not a measured failure in this run. Other domain handlers are indexed rather than silently granted full semantic acceptance.
+No authentication request, origin check, provider operation, file read, socket upgrade, or runtime test was performed. The PTY handler explicitly uses an unbounded outgoing queue and retains a shutdown-tracking TODO; slow-reader memory growth is a real source-level limit, not a measured failure in this run. The original reading register recorded the other domain handlers as indexed only. B-v3 separately supplies full literal reads and a bounded domain purpose/contract/ownership disposition in `revisions/b-l1-v3/review-domain-disposition.md`; those source observations remain subject to independent judgment.
```

## s1.api.surface-disposition

Base 5168 bytes / `611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda`; new 6726 bytes / `595e0d404064429a953b276141f5601a1bbecceb30242a9914132ebdd26ed5c0`.

```diff
--- producers/b/bodies/surface-disposition.md
+++ revisions/b-l1-v3/bodies/surface-disposition.md
@@ -6,16 +6,16 @@
 
 `population.json` supplies 472 assigned Git blobs: four architecture briefs; 76 Client entries; 65 Protocol entries; 124 Schema entries; 13 SDK Next entries; 157 Server entries; and 33 HTTP API codegen entries. `coverage.json` gives every assigned path exactly one primary family, kind, depth, justification, source-read status, need, and artifact key. Secondary artifact references retain useful overlaps without duplicating ownership.
 
-The capture contains 291 exact sources: 289 assigned paths and two explicit boundary authorities, root `AGENTS.md` and `packages/core/src/host.ts`. All 252 handwritten production TypeScript modules under assigned `src/` trees are captured. The reading register distinguishes 97 full source reads, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated sources without semantic reading. These totals include the two boundary authorities. Capturing bytes or extracting imports does not imply full implementation review.
+The frozen original capture contains 291 exact sources: 289 assigned paths and two explicit boundary authorities, root `AGENTS.md` and `packages/core/src/host.ts`. All 252 handwritten production TypeScript modules under assigned `src/` trees are captured. The frozen original reading register distinguishes 97 full source reads, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated sources without semantic reading. These totals include the two boundary authorities. Capturing bytes or extracting imports does not imply full implementation review.
 
-`surface-index.json` preserves literal import/export/endpoint/handler lines and source identity for 253 production modules: the 252 assigned modules plus Core's host boundary. It is a navigation and inspection aid. The associated family mapping identifies domain surfaces such as Actions, Atlas, Board, capability management, Relay, RAG Studio, scheduling, MCP, integration, meeting, permissions/questions, project, skills, and VCS. For modules outside the decisive session/transport/composition reads, this packet claims their declared names/import seams only. Their domain rules, database effects, and failure semantics remain unproved.
+`surface-index.json` preserves literal import/export/endpoint/handler lines and source identity for 253 production modules: the 252 assigned modules plus Core's host boundary. It is a navigation and inspection aid. The associated family mapping identifies domain surfaces such as Actions, Atlas, Board, capability management, Relay, RAG Studio, scheduling, MCP, integration, meeting, permissions/questions, project, skills, and VCS. That original index claimed only declared names/import seams outside the decisive session/transport/composition reads. B-v3 adds the required domain-level triage now: all exact G30/G39/G52/G57 members (94 Schema, 44 Protocol, 51 Server and SDK tool.ts) received full literal source reads. `revisions/b-l1-v3/review-domain-disposition.md` groups them into 24 coherent domains, maps every member to its local L1 purpose and decisive evidence, and identifies external claims that remain blocked. `semantic-disposition.json` preserves the historical records and appends reader, pin, blob, SHA-256 and complete read spans. This source production is unjudged; neither the old index nor the new read count grants semantic acceptance.
 
 ## Rational grouping
 
 | Family | Treatment |
 | --- | --- |
 | Decisive Schema, Protocol, Server, Client, SDK and generator sources | Full reads feed the bounded factual bodies, with exact evidence excerpts. |
-| Other handwritten production modules | Exact byte capture and literal surface index; implementation semantics not accepted by inventory. |
+| Historical 190 surface-indexed handwritten modules | Original disposition preserved; B-v3 full literal reads support bounded purpose/contract/ownership triage by domain. External enforcement and runtime claims remain explicitly conditional; no semantic acceptance by count. |
 | Generated Client output | Build script, generic generator, and both output ownership manifests identify regeneration authority; selected output is representative, remaining entries are inventory-only. |
 | Tests and exercise harnesses | Ten test files read as intended assertions; the remainder grouped by package and test/fixture/harness role. None executed. |
 | Generator test fixture output | Test material, not the public Client generation product; grouped with generator verification support. |
@@ -23,16 +23,18 @@
 
 ## Provenance and verification boundary
 
-All remote source reads used the GitHub connector at the immutable source revision. Base64 contents were decoded unchanged into `sources/<repo path>`. Every manifest entry records commit, observed Git blob SHA, SHA-256, byte length, and capture path. The Git blob identity was recomputed from the preserved bytes, then source/body/coverage transport checks were performed locally. These checks validate artifact mechanics, not the product.
+All remote source reads used the GitHub connector at the immutable source revision. Base64 contents were decoded unchanged into `sources/<repo path>`. Every manifest entry records commit, observed Git blob SHA, SHA-256, byte length, and capture path. B-v3 reuses those unchanged captures and copies two explicitly authorized Core source files unchanged from the pinned producer A captures to establish the actual Session/message ownership check. It reads literal bytes and independently verifies their identities; it accepts no A synthesis or unjudged Core artifact as a predecessor. The Git blob identity was recomputed from the preserved bytes, then source/body/coverage transport checks were performed locally. These checks validate artifact mechanics, not the product.
 
 No local product test, package install, code generation, network server, provider call, remote mutation, or runtime importer was run. No reserved answer/oracle was read. No L2 predecessor is invented and no judge or runtime receipt is asserted. The fragment remains in progress until the parent performs the required two-judge review and subsequent exact binding.
 
 ## Gaps that remain visible
 
 1. The 183 assigned paths without captured source content are classified from their complete pinned inventory metadata, not semantic reading. Grouped test/generated/support claims are deliberately limited.
-2. Most domain production modules received surface indexing only. Their presence is accounted for, while deeper ownership questions require targeted reads or the relevant domain artifact.
+2. The historical 190 surface-only entries now have a separate full-read, bounded L1 domain disposition. The current local purpose/contract/ownership reading need is addressed for review; F02 remains for broader domain claims and the specific conditional implementation/runtime needs in `revisions/b-l1-v3/conditional-needs.json`. No current mandatory local reading is merely deferred to L2.
 3. Generated `types.ts` is 462,732 bytes, beyond the protocol's current runtime observer limit. Its required input is retained; the later binding must explicitly handle or remain blocked on that boundary.
 4. Generated freshness, runtime import boundaries, HTTP interoperability, lifecycle behavior, and observed test outcomes remain unverified in execution.
 5. The pinned client README disagrees with actual generation of binary `fs.read`; the handwritten Actions upload path lacks a matching declaration in the inspected Actions transfer group/handler; and public V2 annotations remain despite normalization intent. These are source mismatches, not silently repaired conclusions.
 
-This body is supported for the bounded population/provenance statements above. It is not a substitute for acceptance of every assigned file, a complete end-to-end architecture, or a successful Atlas runtime binding.
+The compact review projection states only the bounded domain claims necessary for B3; the extensive native helper notes remain preserved as support and are not all promoted to batch claims. The existing F03–F08 obligations, generated/test/fixture boundaries and source discrepancies remain visible.
+
+This body is supported for the bounded population/provenance and local domain-disposition statements above. It is not a substitute for acceptance of every assigned file, a complete end-to-end architecture, or a successful Atlas runtime binding.
```
