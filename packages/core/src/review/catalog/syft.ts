import pinned from "../../backend-toolkit/packs/syft"

// No-build Syft. Pinned 1.57.1, Apache-2.0 at that tag.
// Standard and Deep route it when a named lockfile changes. Quick does not.
// The review scans the scratch copy only. It does not enrich, attest, or read a registry.
const lockfile = (name: string) => [name, `**/${name}`]

export const syft = {
  pack: {
    id: "syft",
    tool: "syft",
    version: pinned.version,
    pin: {
      source: "backend-toolkit/packs/syft",
      integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: "any",
    detection: {
      manifests: [],
      extensions: [],
      absent: [],
      paths: [
        ...lockfile("bun.lock"),
        ...lockfile("package-lock.json"),
        ...lockfile("pnpm-lock.yaml"),
        ...lockfile("yarn.lock"),
        ...lockfile("Cargo.lock"),
        ...lockfile("uv.lock"),
        ...lockfile("poetry.lock"),
        ...lockfile("pylock.toml"),
        ...lockfile("go.sum"),
      ],
    },
    lane: "no-build",
    tiers: ["standard", "deep"],
    output: { format: "json", parser: "syft-json" },
    cost: "low",
    network: { kind: "none" },
    scratchWrites: false,
    template: "syft-dir-json",
    lenses: ["security"],
    status: "probation",
  },
} as const
