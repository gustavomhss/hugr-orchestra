import pinned from "../../backend-toolkit/packs/staticcheck"

// First-pass staticcheck (design §7.4). Pinned 2026.2.2, MIT at that tag. The host names the binary.
// It does not add a flag. Linux x64 is the only qualified runtime. Standard and Deep route it; Quick does not.
export const staticcheck = {
  pack: {
    id: "staticcheck",
    tool: "staticcheck",
    version: pinned.version,
    pin: {
      source: "backend-toolkit/packs/staticcheck",
      integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: ["go"],
    detection: { manifests: [], extensions: [".go"], absent: [] },
    lane: "build",
    tiers: ["standard", "deep"],
    output: { format: "json", parser: "staticcheck" },
    cost: "medium",
    network: { kind: "none" },
    scratchWrites: true,
    template: "staticcheck",
    lenses: ["correctness-logic"],
    status: "probation",
  },
} as const
