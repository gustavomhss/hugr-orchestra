// GPL-3, invoke if installed (design §7.1, §7.4). Nothing is fetched or bundled.
// Standard and Deep route it; Quick does not. A missing binary is recorded and does not block.
export const golangci = {
  pack: {
    id: "golangci-lint",
    tool: "golangci-lint",
    version: "project",
    licence: "invoke",
    backend: "path",
    languages: ["go"],
    detection: { manifests: [], extensions: [".go"], absent: [] },
    lane: "build",
    tiers: ["standard", "deep"],
    output: { format: "sarif" },
    cost: "high",
    network: { kind: "none" },
    scratchWrites: true,
    template: "golangci-lint",
    lenses: ["correctness-logic"],
    status: "probation",
  },
} as const
