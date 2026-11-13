// Build-lane typecheck (plan 5.1, D6). The host invokes the project's own tsc when the review enters the
// build lane. Standard and Deep route it; Quick does not. No pin: nothing is fetched. deep.built stays false.
export const tsc = {
  pack: {
    id: "tsc",
    tool: "tsc",
    version: "project",
    licence: "invoke",
    backend: "path",
    languages: ["js-ts"],
    detection: {
      manifests: ["tsconfig.json"],
      extensions: [".ts", ".tsx", ".mts", ".cts"],
      absent: [],
    },
    lane: "build",
    tiers: ["standard", "deep"],
    output: { format: "json", parser: "tsc" },
    cost: "high",
    network: { kind: "none" },
    scratchWrites: true,
    template: "tsc-noemit",
    lenses: ["correctness-logic"],
    status: "probation",
  },
} as const
