import pinned from "../../backend-toolkit/packs/osv-scanner"

// No-build OSV-Scanner (design §7.3, §7.4). Pinned 2.7.1, Apache-2.0 at that tag.
// Standard and Deep route it when a named lockfile changes. Quick does not.
// The review reads an offline database. It does not download one.
const lockfile = (name: string) => [name, `**/${name}`]

export const osv = {
  pack: {
    id: "osv-scanner",
    tool: "osv-scanner",
    version: pinned.version,
    pin: {
      source: "backend-toolkit/packs/osv-scanner",
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
    output: { format: "json", parser: "osv-scanner" },
    cost: "medium",
    network: { kind: "offline-db", database: "osv" },
    scratchWrites: false,
    template: "osv-offline",
    lenses: ["security"],
    status: "probation",
  },
} as const
