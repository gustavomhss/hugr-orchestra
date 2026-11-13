// First-pass Go vet (design §7.4). The host runs the project's own `go vet` on the changed
// packages. No pin: nothing is fetched. Standard and Deep route it; Quick does not. deep.built stays false.
export const govet = {
  pack: {
    id: "go-vet",
    tool: "go vet",
    version: "project",
    licence: "invoke",
    backend: "path",
    languages: ["go"],
    detection: {
      manifests: [],
      extensions: [".go"],
      absent: [],
    },
    lane: "build",
    tiers: ["standard", "deep"],
    output: { format: "json", parser: "go-vet" },
    cost: "medium",
    network: { kind: "none" },
    scratchWrites: true,
    template: "go-vet",
    lenses: ["correctness-logic"],
    status: "probation",
  },
} as const
