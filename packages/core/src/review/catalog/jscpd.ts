import pinned from "../../backend-toolkit/packs/jscpd"

// No-build duplication scan. A clone is a review candidate, never proof of a defect.
// Standard and Deep route it when a source extension changes. Quick does not.
const extensions = [
  ".c", ".cc", ".cpp", ".cts", ".cjs", ".go", ".h", ".hpp", ".java", ".js", ".jsx",
  ".kt", ".kts", ".mjs", ".mts", ".php", ".py", ".pyi", ".rb", ".rs", ".sql", ".ts", ".tsx",
]

export const jscpd = {
  pack: {
    id: "jscpd",
    tool: "jscpd",
    version: pinned.version,
    pin: {
      source: "backend-toolkit/packs/jscpd",
      integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: "any",
    detection: { manifests: [], extensions, absent: [] },
    lane: "no-build",
    tiers: ["standard", "deep"],
    output: { format: "sarif" },
    cost: "low",
    network: { kind: "none" },
    scratchWrites: false,
    template: "jscpd-dir-sarif",
    lenses: ["change"],
    status: "probation",
  },
  rules: [
    {
      pack: "jscpd",
      rule: "jscpd/duplicate-code",
      class: "change.duplication",
      lens: "change",
      severity: { "*": "P3" },
      status: "probation",
      triage: "Confirm harmful divergence between the copies or a written anti-duplication constraint. A duplicate candidate alone never proves a defect and never changes security or correctness findings.",
    },
  ],
} as const
