import ruffPin from "../../backend-toolkit/packs/ruff"

// Tagged 0.17.3 rule docs captured in 0af06173cf. A warning is not a confirmed defect.
// https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_linter/src/rules/pyflakes/rules/undefined_name.rs#L6-L27
// https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_linter/src/checkers/ast/analyze/unresolved_references.rs#L10-L61
const F821 =
  "F821: confirm the project's Python, supplied builtins, dynamic names and executable-reference context. The py311 scanner default does not prove the deployed version. A warning alone confirms nothing."

// https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_linter/src/rules/pyflakes/rules/undefined_local.rs#L11-L70
const F823 =
  "F823: confirm the called function, its local-before-assignment trigger and shadowing of a parent binding. A warning alone confirms nothing."

export const ruff = {
  pack: {
    id: "ruff",
    tool: "ruff",
    version: ruffPin.version,
    pin: {
      source: "backend-toolkit/packs/ruff",
      integrity: Object.fromEntries(Object.entries(ruffPin.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: ["python"],
    detection: { manifests: [], extensions: [".py", ".pyi"], absent: [] },
    lane: "no-build",
    tiers: ["standard", "deep"],
    output: { format: "json", parser: "ruff" },
    cost: "low",
    network: { kind: "none" },
    scratchWrites: false,
    template: "ruff-curated-json",
    lenses: ["correctness-logic"],
    status: "probation",
  },
  rules: [
    {
      pack: "ruff",
      rule: "F821",
      class: "logic.invariant",
      lens: "correctness-logic",
      severity: { "*": "P2" },
      triage: F821,
      status: "probation",
    },
    {
      pack: "ruff",
      rule: "F823",
      class: "logic.invariant",
      lens: "correctness-logic",
      status: "probation",
      severity: { "*": "P2" },
      triage: F823,
    },
  ],
} as const
