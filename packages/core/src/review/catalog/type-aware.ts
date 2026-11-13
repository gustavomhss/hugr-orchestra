import pinned from "../../backend-toolkit/packs/tsgolint"

// Build-lane typed lint (plan 5.1). The host runs pinned oxlint 1.91.0 with --type-aware and the pinned
// tsgolint 7.0.2005. It does not install a project tool and it does not search PATH. Linux x64 is the
// only qualified runtime. Standard and Deep route it; Quick does not. deep.built stays false.
export const typeAware = {
  pack: {
    id: "oxlint-type-aware",
    tool: "oxlint",
    version: "1.91.0",
    pin: {
      source: "backend-toolkit/packs/tsgolint",
      integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: ["js-ts"],
    detection: {
      manifests: ["tsconfig.json"],
      extensions: [".ts", ".tsx", ".mts", ".cts"],
      absent: [],
    },
    lane: "build",
    tiers: ["standard", "deep"],
    output: { format: "sarif" },
    cost: "high",
    network: { kind: "none" },
    scratchWrites: true,
    template: "oxlint-type-aware",
    lenses: ["correctness-logic"],
    status: "probation",
  },
  rules: [
    {
      pack: "oxlint-type-aware",
      rule: "typescript(no-floating-promises)",
      class: "logic.invariant",
      lens: "correctness-logic",
      severity: { "*": "P2" },
      status: "probation",
      triage: "no-floating-promises: confirm the promise can reject or stay pending without a handler on the reviewed path; the native diagnostic is a candidate, not a confirmed hang.",
    },
  ],
} as const
