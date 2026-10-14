// Pure acquisition descriptors. Registry imports this table without loading any acquisition engine.
// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type Descriptor, type JsonSchema } from "../contract.ts";
const strings: JsonSchema = { type: "array", maxItems: 1000, items: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z_$][A-Za-z0-9_$]*$" } };
export const acquisitionDescriptors: Record<string, Descriptor> = {
  "brief-usage-check": {
    name: "brief-usage-check", description: "Reject declared-but-unavailable Plan symbols or compiler-proven unused declarations; acquisition omissions and compiler errors are failures.", effects: ["read", "process"],
    inputSchema: { type: "object", additionalProperties: false, required: ["declared"], oneOf: [{ required: ["source"] }, { required: ["available"] }], properties: {
      declared: { ...strings, minItems: 1 }, source: { type: "string", minLength: 1, maxLength: 1000000 }, available: {
        type: "object", additionalProperties: false, required: ["exports", "helpers", "importNames"],
        properties: { exports: strings, helpers: strings, importNames: strings },
        anyOf: ["exports", "helpers", "importNames"].map((field) => ({ required: [field], properties: { [field]: { ...strings, minItems: 1 } } })),
      },
    } },
  },
  "decompose": {
    name: "decompose", description: "Propose partition, compiler-extract edges, assemble Plan, relocate helpers, verify against actual project baseline, repair imports. Return artifacts; explicit materialization requests native write authority and refuses overwrites.", effects: ["read", "process", "write"],
    inputSchema: { type: "object", additionalProperties: false, required: ["targetPath", "k"], properties: {
      targetPath: { type: "string", minLength: 1, maxLength: 1000 }, k: { type: "integer", minimum: 1, maximum: 100 },
      materialize: { type: "object", additionalProperties: false, required: ["directory"], properties: { directory: { type: "string", minLength: 1, maxLength: 1000 } } },
    } },
  },
  "move-in": {
    name: "move-in", description: "Scoped scan/filter/tree-sitter extraction/PageRank map or explicit reader fallback. Return bounded distill/reader briefs without model calls. Native-parser worker launch requests process authority when needed. Optional absorb/persist stores advisory results outside repository in project-scoped host data.", effects: ["read", "process", "write"],
    inputSchema: { type: "object", additionalProperties: false, properties: {
      root: { type: "string" }, budgetLoc: { type: "integer", minimum: 1, maximum: 1000000 }, maxAgents: { type: "integer", minimum: 1, maximum: 100 }, operation: { type: "string", enum: ["plan", "absorb", "persist"] },
      replies: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", additionalProperties: false, required: ["slice", "raw"], properties: { slice: { type: "integer", minimum: 0 }, raw: { type: "string", maxLength: 65536 } } } },
    } },
  },
  "repo-hygiene-check": {
    name: "repo-hygiene-check", description: "Acquire read-only Git/filesystem hygiene facts. Git failure and unconfigured checks remain unknown; clean is tri-state.", effects: ["read", "process"],
    inputSchema: { type: "object", additionalProperties: false, properties: { root: { type: "string" } } },
  },
  "repo-mapper": {
    name: "repo-mapper", description: "Bounded read-only path/size/LOC map with pagination and named coverage gaps; oversized candidates are page-local.", effects: ["read"],
    inputSchema: { type: "object", additionalProperties: false, properties: {
      root: { type: "string" }, maxDepth: { type: "integer", minimum: 0, maximum: 100 }, ignore: { type: "array", maxItems: 100, items: { type: "string", maxLength: 200 } },
      oversizedThreshold: { type: "integer", minimum: 0 }, maxEntries: { type: "integer", minimum: 1, maximum: 10000 }, maxFileBytes: { type: "integer", minimum: 1, maximum: 10000000 }, offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 500 },
    } },
  },
  "symbol-flow-check": {
    name: "symbol-flow-check", description: "Compile actual WP union and detect undeclared cross-WP symbol flows with structured diagnostics; output is advice, not execution evidence.", effects: ["read", "process"],
    inputSchema: { type: "object", additionalProperties: false, required: ["wps"], properties: { wps: { type: "array", minItems: 1, maxItems: 100, items: {
      type: "object", additionalProperties: false, required: ["id", "files"], properties: { id: { type: "string", pattern: "^[A-Za-z_$][A-Za-z0-9_$-]{0,79}$" }, files: { type: "array", minItems: 1, maxItems: 100, items: {
        type: "object", additionalProperties: false, required: ["path", "source"], properties: { path: { type: "string", minLength: 1, maxLength: 1000 }, source: { type: "string", maxLength: 1000000 } },
      } } },
    } } } },
  },
};
