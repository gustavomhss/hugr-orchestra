import pinned from "../../backend-toolkit/packs/oxlint"

// The host classification is a candidate, not a confirmed defect.
// https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/crates/oxc_linter/src/rules/eslint/no_debugger.rs#L17-L52
// https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/crates/oxc_linter/src/rules/typescript/no_explicit_any.rs#L30-L79
export const oxlint = {
  pack: {
    id: "oxlint",
    tool: "oxlint",
    version: pinned.version,
    pin: {
      source: "backend-toolkit/packs/oxlint",
      integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: ["js-ts"],
    detection: { manifests: [], extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"], absent: [] },
    lane: "no-build",
    tiers: ["standard", "deep"],
    output: { format: "sarif" },
    cost: "low",
    network: { kind: "none" },
    scratchWrites: false,
    template: "oxlint-host-sarif",
    lenses: ["correctness-logic"],
    status: "probation",
  },
  rules: [
    {
      pack: "oxlint",
      rule: "eslint(no-debugger)",
      class: "logic.invariant",
      lens: "correctness-logic",
      severity: { "*": "P2" },
      status: "probation",
      triage: "no-debugger: confirm the debugger statement is reachable in the reviewed runtime and causes observable harm; the native diagnostic is a candidate, not a confirmed interruption.",
    },
    {
      pack: "oxlint",
      rule: "typescript(no-explicit-any)",
      class: "logic.contract",
      lens: "correctness-logic",
      severity: { "*": "P3" },
      status: "probation",
      triage: "no-explicit-any: trace the unchecked value to a concrete caller or validation boundary; a broad static type alone is not a runtime defect or proof that validation is missing.",
    },
  ],
} as const
