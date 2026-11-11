# L1: assigned API population and evidence depth

Key: `s1.api.surface-disposition`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This artifact establishes disposition and reproducible source identity, not semantic acceptance of every implementation in the population.

## Population ownership

`population.json` supplies 472 assigned Git blobs: four architecture briefs; 76 Client entries; 65 Protocol entries; 124 Schema entries; 13 SDK Next entries; 157 Server entries; and 33 HTTP API codegen entries. `coverage.json` gives every assigned path exactly one primary family, kind, depth, justification, source-read status, need, and artifact key. Secondary artifact references retain useful overlaps without duplicating ownership.

The capture contains 291 exact sources: 289 assigned paths and two explicit boundary authorities, root `AGENTS.md` and `packages/core/src/host.ts`. All 252 handwritten production TypeScript modules under assigned `src/` trees are captured. The reading register distinguishes 97 full source reads, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated sources without semantic reading. These totals include the two boundary authorities. Capturing bytes or extracting imports does not imply full implementation review.

`surface-index.json` preserves literal import/export/endpoint/handler lines and source identity for 253 production modules: the 252 assigned modules plus Core's host boundary. It is a navigation and inspection aid. The associated family mapping identifies domain surfaces such as Actions, Atlas, Board, capability management, Relay, RAG Studio, scheduling, MCP, integration, meeting, permissions/questions, project, skills, and VCS. For modules outside the decisive session/transport/composition reads, this packet claims their declared names/import seams only. Their domain rules, database effects, and failure semantics remain unproved.

## Rational grouping

| Family | Treatment |
| --- | --- |
| Decisive Schema, Protocol, Server, Client, SDK and generator sources | Full reads feed the bounded factual bodies, with exact evidence excerpts. |
| Other handwritten production modules | Exact byte capture and literal surface index; implementation semantics not accepted by inventory. |
| Generated Client output | Build script, generic generator, and both output ownership manifests identify regeneration authority; selected output is representative, remaining entries are inventory-only. |
| Tests and exercise harnesses | Ten test files read as intended assertions; the remainder grouped by package and test/fixture/harness role. None executed. |
| Generator test fixture output | Test material, not the public Client generation product; grouped with generator verification support. |
| Package manifests, README, guides, architecture briefs | Manifests and guides inspected; historical briefs remain intent evidence. Unread config/support files are explicitly inventory-only. |

## Provenance and verification boundary

All remote source reads used the GitHub connector at the immutable source revision. Base64 contents were decoded unchanged into `sources/<repo path>`. Every manifest entry records commit, observed Git blob SHA, SHA-256, byte length, and capture path. The Git blob identity was recomputed from the preserved bytes, then source/body/coverage transport checks were performed locally. These checks validate artifact mechanics, not the product.

No local product test, package install, code generation, network server, provider call, remote mutation, or runtime importer was run. No reserved answer/oracle was read. No L2 predecessor is invented and no judge or runtime receipt is asserted. The fragment remains in progress until the parent performs the required two-judge review and subsequent exact binding.

## Gaps that remain visible

1. The 183 assigned paths without captured source content are classified from their complete pinned inventory metadata, not semantic reading. Grouped test/generated/support claims are deliberately limited.
2. Most domain production modules received surface indexing only. Their presence is accounted for, while deeper ownership questions require targeted reads or the relevant domain artifact.
3. Generated `types.ts` is 462,732 bytes, beyond the protocol's current runtime observer limit. Its required input is retained; the later binding must explicitly handle or remain blocked on that boundary.
4. Generated freshness, runtime import boundaries, HTTP interoperability, lifecycle behavior, and observed test outcomes remain unverified in execution.
5. The pinned client README disagrees with actual generation of binary `fs.read`; the handwritten Actions upload path lacks a matching declaration in the inspected Actions transfer group/handler; and public V2 annotations remain despite normalization intent. These are source mismatches, not silently repaired conclusions.

This body is supported for the bounded population/provenance statements above. It is not a substitute for acceptance of every assigned file, a complete end-to-end architecture, or a successful Atlas runtime binding.
