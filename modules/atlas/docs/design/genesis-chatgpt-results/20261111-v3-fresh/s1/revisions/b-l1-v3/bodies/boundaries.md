# L1: package authority and runtime boundaries

Key: `s1.api.boundaries`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Scope: `orchestra.s1`. This is a source observation, not an accepted higher-layer architecture or a successful runtime receipt.

## Authorized intent and observed declarations

Root `AGENTS.md` declares the dependency direction Schema → Core and Protocol → Server. It prohibits Client runtime imports from Core or Server and permits SDK Next to compose Client, Core, and Server. The package manifests, imports in the captured entrypoints, and Client's protocol construction support that intended separation at the inspected boundary. A literal import index is preserved for the other production modules; this work did not execute a bundler or prove the complete transitive dependency graph.

| Owner | Observed declared role and dependencies | Limit of this observation |
| --- | --- | --- |
| `@orchestra/schema` | Shared schemas; dependency on `effect`; explicit public subpath exports | Schema does not grant runtime ownership of a domain service. |
| `@orchestra/protocol` | Imports Schema and Effect; declares HttpApi groups, errors, and transport middleware tags | No concrete Core service is needed to define the inspected API. |
| `@orchestra/server` | Depends on Core, Protocol, Schema, LLM, RAG Studio, Relay, Drizzle, and Effect; supplies handlers and runtime middleware | Server handler delegation is not proof of Core service internals. |
| `@orchestra/client` | Depends on Schema and Protocol; Effect is an optional peer; codegen is a development dependency | Promise and Effect projections differ in decoding and runtime requirements. |
| `@orchestra/sdk-next` | Depends on Client, Core, Protocol, Schema, Server, and Effect | Its embedded transport still executes application services and authorization. |
| `@orchestra/httpapi-codegen` | Generic generator depending on Effect and Prettier | Product naming and omission policy are supplied by the Client build. |

`packages/protocol/src/api.ts` exposes `makeDefaultApi` with caller-supplied location middleware identities. `packages/client/src/contract.ts` constructs `ClientApi` with Client-local middleware tags. `packages/server/src/api.ts` constructs the server API with the actual `LocationMiddleware` and `SessionLocationMiddleware`. These files provide a concrete seam: Protocol declares the schema contract; the server chooses Core-backed services; Client can reflect the same API shape without importing those services.

Root and Schema `AGENTS.md` are maintenance authorities. Schema's guide requires browser-safe shared DTOs, canonical schema identity rather than redeclaration, domain-owned runtime effects, readonly public data, and direct event subpath entrypoints. It prefers unversioned public names. The pin still contains annotations such as `SessionV2.Info` and `ModelV2.Info` and a `ModelV2.ID` brand. The guide is intent, while those identifiers are the observed source. This packet does not silently report that normalization as complete.

The four `docs/architecture/phase-plans/70-90-briefs/` cards in the assigned population are historical planning evidence. Their earlier baseline references and expected counts are not treated as current code facts or instructions. Current package manifests and source take precedence for the observations above.

## Host composition boundary

The additionally captured `packages/core/src/host.ts` is a narrow cross-boundary authority. `Host.merge` rejects duplicate contribution IDs and global/location node names, rejects replacement of reserved runtime nodes, and rejects shadowing built-in location services. Reserved names include SessionExecution, SessionV2, LocationServiceMap, ScheduledTask, and daemon. This supports the stated composition guard; it does not establish distributed execution, worker recovery, or the implementation of every service contributed by a host.

## Evidence and gaps

Exact authorities: `AGENTS.md`; `packages/schema/AGENTS.md`; all six package manifests; Protocol `src/api.ts`; Client `src/contract.ts`; Server `src/api.ts`; SDK `src/orchestra.ts`; Core `src/host.ts`. Review excerpts are indexed under this key in `review-evidence.md`; exact bytes and identities are in `source-manifest.json`.

No import-boundary test, typecheck, build, bundler, or runtime observation was executed. The captured import-boundary and client-contract identity tests state intended verification, not a passing result. Other producers own deeper Core runtime observations. L2–L4 synthesis must wait for the two-judge acceptance required by the campaign.
