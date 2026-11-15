# L1: assigned API population and evidence depth

Key: `s1.api.surface-disposition`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This artifact establishes disposition and reproducible source identity, not semantic acceptance of every implementation in the population.

## Population ownership

`population.json` supplies 472 assigned Git blobs: four architecture briefs; 76 Client entries; 65 Protocol entries; 124 Schema entries; 13 SDK Next entries; 157 Server entries; and 33 HTTP API codegen entries. `coverage.json` gives every assigned path exactly one primary family, kind, depth, justification, source-read status, need, and artifact key. Secondary artifact references retain useful overlaps without duplicating ownership.

The frozen original capture contains 291 exact sources: 289 assigned paths and two explicit boundary authorities, root `AGENTS.md` and `packages/core/src/host.ts`. All 252 handwritten production TypeScript modules under assigned `src/` trees are captured. The frozen original reading register distinguishes 97 full source reads, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated sources without semantic reading. These totals include the two boundary authorities. Capturing bytes or extracting imports does not imply full implementation review.

`surface-index.json` preserves literal import/export/endpoint/handler lines and source identity for 253 production modules: the 252 assigned modules plus Core's host boundary. It is a navigation and inspection aid. The associated family mapping identifies domain surfaces such as Actions, Atlas, Board, capability management, Relay, RAG Studio, scheduling, MCP, integration, meeting, permissions/questions, project, skills, and VCS. That original index claimed only declared names/import seams outside the decisive session/transport/composition reads. B-v3 adds the required domain-level triage now: all exact G30/G39/G52/G57 members (94 Schema, 44 Protocol, 51 Server and SDK tool.ts) received full literal source reads. `revisions/b-l1-v3/review-domain-disposition.md` groups them into 24 coherent domains, maps every member to its local L1 purpose and decisive evidence, and identifies external claims that remain blocked. `semantic-disposition.json` preserves the historical records and appends reader, pin, blob, SHA-256 and complete read spans. This source production is unjudged; neither the old index nor the new read count grants semantic acceptance.

## Rational grouping

| Family | Treatment |
| --- | --- |
| Decisive Schema, Protocol, Server, Client, SDK and generator sources | Full reads feed the bounded factual bodies, with exact evidence excerpts. |
| Historical 190 surface-indexed handwritten modules | Original disposition preserved; B-v3 full literal reads support bounded purpose/contract/ownership triage by domain. External enforcement and runtime claims remain explicitly conditional; no semantic acceptance by count. |
| Generated Client output | Build script, generic generator, and both output ownership manifests identify regeneration authority; selected output is representative, remaining entries are inventory-only. |
| Tests and exercise harnesses | Ten test files read as intended assertions; the remainder grouped by package and test/fixture/harness role. None executed. |
| Generator test fixture output | Test material, not the public Client generation product; grouped with generator verification support. |
| Package manifests, README, guides, architecture briefs | Manifests and guides inspected; historical briefs remain intent evidence. Unread config/support files are explicitly inventory-only. |

## Provenance and verification boundary

All remote source reads used the GitHub connector at the immutable source revision. Base64 contents were decoded unchanged into `sources/<repo path>`. Every manifest entry records commit, observed Git blob SHA, SHA-256, byte length, and capture path. B-v3 reuses those unchanged captures and copies two explicitly authorized Core source files unchanged from the pinned producer A captures to establish the actual Session/message ownership check. It reads literal bytes and independently verifies their identities; it accepts no A synthesis or unjudged Core artifact as a predecessor. The Git blob identity was recomputed from the preserved bytes, then source/body/coverage transport checks were performed locally. These checks validate artifact mechanics, not the product.

No local product test, package install, code generation, network server, provider call, remote mutation, or runtime importer was run. No reserved answer/oracle was read. No L2 predecessor is invented and no judge or runtime receipt is asserted. The fragment remains in progress until the parent performs the required two-judge review and subsequent exact binding.

## Gaps that remain visible

1. The 183 assigned paths without captured source content are classified from their complete pinned inventory metadata, not semantic reading. Grouped test/generated/support claims are deliberately limited.
2. The historical 190 surface-only entries now have a separate full-read, bounded L1 domain disposition. The current local purpose/contract/ownership reading need is addressed for review; F02 remains for broader domain claims and the specific conditional implementation/runtime needs in `revisions/b-l1-v3/conditional-needs.json`. No current mandatory local reading is merely deferred to L2.
3. Generated `types.ts` is 462,732 bytes, beyond the protocol's current runtime observer limit. Its required input is retained; the later binding must explicitly handle or remain blocked on that boundary.
4. Generated freshness, runtime import boundaries, HTTP interoperability, lifecycle behavior, and observed test outcomes remain unverified in execution.
5. The pinned client README disagrees with actual generation of binary `fs.read`; the handwritten Actions upload path lacks a matching declaration in the inspected Actions transfer group/handler; and public V2 annotations remain despite normalization intent. These are source mismatches, not silently repaired conclusions.

The compact review projection states only the bounded domain claims necessary for B3; the extensive native helper notes remain preserved as support and are not all promoted to batch claims. The existing F03–F08 obligations, generated/test/fixture boundaries and source discrepancies remain visible.

This body is supported for the bounded population/provenance and local domain-disposition statements above. It is not a substitute for acceptance of every assigned file, a complete end-to-end architecture, or a successful Atlas runtime binding.
