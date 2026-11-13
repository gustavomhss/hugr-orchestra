import pinned from "../../backend-toolkit/packs/gosec"

// First-pass gosec (design §7.4). Pinned 2.30.0, Apache-2.0 at that tag. The host adds only `-fmt sarif`
// and `-out`. It never passes `-ai-api`. Linux x64 is the only qualified runtime.
export const gosec = {
  pack: {
    id: "gosec",
    tool: "gosec",
    version: pinned.version,
    pin: {
      source: "backend-toolkit/packs/gosec",
      integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: ["go"],
    detection: { manifests: [], extensions: [".go"], absent: [] },
    lane: "build",
    tiers: ["standard", "deep"],
    output: { format: "sarif" },
    cost: "medium",
    network: { kind: "none" },
    scratchWrites: true,
    template: "gosec-sarif",
    lenses: ["security"],
    status: "probation",
  },
} as const
