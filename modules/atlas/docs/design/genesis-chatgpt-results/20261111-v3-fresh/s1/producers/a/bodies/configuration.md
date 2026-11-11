# Configuration precedence, trust and Location service lifetime

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Config is a Location service returning ordered documents and supplemental directories. It materializes required packaged skills before recoverable plugin boot. It reads `orchestra.json` then `orchestra.jsonc`, supports JSON comments/trailing commas, validates either current format or a migrated legacy format, and ignores excess properties through explicit decode options. Remote instruction URLs are rejected. General settings apply global documents, direct project files, then `.orchestra` files; nearer project configuration wins within discovered ordering. Experimental policies are loaded in the reverse document order so a global-user rule can override repository policy. [1]

Project configuration is snapshotted when the Location opens. `entries()` rereads global documents and reloads policies so user settings changes can reach the next agent/catalog reload without reopening; it does not rediscover/reload every project file. Treating all config as live would be incorrect. The schema includes agents, providers, permissions, tools/output, attachments, MCP, references, instructions, plugins, compaction/continuity, Relay, research and Maestro static context settings, but the presence of a field is not proof of every consumer's behavior. [1]

`ConfigTrust` distinguishes user-owned entries under the global configuration folder (or pathless documents) from repository entries. Only user-owned `trusted_projects` entries establish trust. `runnable` includes repository-declared commands only for a trusted directory; a project cannot trust itself. Approval canonicalizes an existing absolute directory and refuses a filesystem root. Revocation removes the folder's own entry; a trusted parent can continue to cover it. Trust is a command-admission boundary and does not replace tool permissions. [2]

`buildLocationServiceMap` compiles a Location graph with supplied replacements and extra nodes, binds the concrete Location, and hoists global dependencies. It substitutes native ToolRegistry nodes, applies `Layer.fresh`, and caches with a 60-minute idle time to live. Relay hook recovery starts only after the entire Location graph succeeds and is scoped to that Location. `withGlobalContext` delays lazy acquisition until the completed application's global exports are available. [3,4]

The default graph contains configuration, agent/catalog/provider support, plugins, filesystem and mutation, tools, permissions, questions, MCP/LSP/formatting, runner/model, context, snapshots, project-copy and product-facing adapters. Membership is useful dependency evidence; it is not proof that every integration is connected or has valid credentials. Session execution remains process-global and chooses the Location only when it drains a stored Session. [3]

## Normative intent and limits

The V2 config document is a field-review/decision record with pending/keep/remove/redesign labels, not a complete description of actual loading. The schema and loader are implementation authority for this pin. Old-format migration helpers are compatibility source and require source-specific examination before changing mappings; they must not be dismissed as unused generated files. [1,5]

No config reload, trust transition or Location eviction was run. This L1 proves the visible ordering/lifetime code and identifies its boundary; OS paths, policy consumers and legacy-upgrade cases remain targeted follow-up reads before corresponding mutations.

## Source anchors

- **1.** `packages/core/src/config.ts:52985a1dfc3575efca662dcb0667d81a1ab6f1de` — Info and Location loader, lines 35–110,147–268.
- **2.** `packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78` — isUser, isTrusted, runnable, approve and revoke, lines 8–81.
- **3.** `packages/core/src/location-services.ts:c754426dde31acad2dbbfd96459b32624cfdd2e4` — locationServices and buildLocationServiceMap, lines 58–171.
- **4.** `packages/core/src/location-service-map.ts:2f9f70c7edf21ab9e8d57eb6966aacab13c47c33` — withGlobalContext, lines 18–43.
- **5.** `docs/specs/v2/config.md:81353980473012b1b3d311f0a638e3d65ba8cbcd` — review labels and scope, lines 1–18,382–390.
