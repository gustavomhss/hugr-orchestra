import pinned from "../../backend-toolkit/packs/cargo-audit"

export const cargoAudit = {
  pack: {
    id: "cargo-audit", tool: "cargo-audit", version: pinned.version,
    pin: { source: "backend-toolkit/packs/cargo-audit", integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])) },
    licence: "pinned", backend: "pinned", languages: ["rust"],
    detection: { manifests: [], extensions: [], absent: [], paths: ["Cargo.lock", "**/Cargo.lock"] },
    lane: "no-build", tiers: ["standard", "deep"], output: { format: "json", parser: "cargo-audit-json" },
    cost: "medium", network: { kind: "offline-db", database: "rustsec" }, scratchWrites: false,
    template: "cargo-audit-lock-json", lenses: ["security"], status: "probation",
  },
  rules: [{
    pack: "cargo-audit", rule: "cargo-audit/advisory", class: "security.supply-chain", lens: "security",
    severity: { error: "P2", warning: "P3" }, status: "probation",
    triage: "Check the RustSec advisory against the locked package, the changed dependency and a reachable affected use. A native advisory candidate alone does not confirm exploitability or a defect.",
  }],
} as const
