import pinned from "../../backend-toolkit/packs/actionlint"

// Native kinds and diagnostics at rhysd/actionlint 914e7df21a07ef503a81201c76d2b11c789d3fca.
// https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/docs/checks.md
// A diagnostic is a candidate, not a host-confirmed defect or permission verdict.
const descriptors = [
  { rule: "action", class: "contracts.third-party", lens: "contracts", triage: "Confirm the referenced action version and its actual input contract; a native action diagnostic alone does not establish a broken deployed caller." },
  { rule: "credentials", class: "security.secret", lens: "security", triage: "Confirm whether the cited container credential is a real secret and how it is delivered; a credential diagnostic alone is not proof of exposure." },
  { rule: "deprecated-commands", class: "security.ci", lens: "security", triage: "Confirm the deprecated workflow command, runner behavior and reachable trigger; a diagnostic alone does not prove an exploitable CI boundary." },
  { rule: "env-var", class: "logic.contract", lens: "correctness-logic", triage: "Confirm the named environment variable and the workflow context consuming it; a native diagnostic is not confirmation of a runtime failure." },
  { rule: "events", class: "logic.contract", lens: "correctness-logic", triage: "Confirm the event name and trigger configuration against the intended workflow; a diagnostic alone does not establish a missed production run." },
  { rule: "expression", class: "logic.invariant", lens: "correctness-logic", triage: "Confirm the expression, available context and reachable value; a native expression diagnostic is not proof of the project's failing behavior." },
  { rule: "glob", class: "logic.contract", lens: "correctness-logic", triage: "Confirm the workflow filter's literal pattern and intended matching paths; a glob diagnostic alone does not prove the selected change was missed." },
  { rule: "id", class: "logic.invariant", lens: "correctness-logic", triage: "Confirm the workflow identifier and the actual reference or collision; a native identifier diagnostic must be bound to the project's trigger." },
  { rule: "if-cond", class: "logic.invariant", lens: "correctness-logic", triage: "Confirm the condition and its workflow evaluation context; a native condition warning is not confirmation that the intended job is skipped." },
  { rule: "job-needs", class: "logic.invariant", lens: "correctness-logic", triage: "Confirm the dependency graph, referenced jobs and reachable trigger; the native graph diagnostic is a candidate, not a confirmed outage." },
  { rule: "matrix", class: "logic.contract", lens: "correctness-logic", triage: "Confirm the matrix values and the job that consumes them; the native matrix diagnostic alone does not prove a failing build dimension." },
  { rule: "permissions", class: "security.ci", lens: "security", triage: "Confirm the workflow permission setting and token use at the cited boundary; syntax validation alone does not establish least privilege or exploitability." },
  { rule: "runner-label", class: "logic.contract", lens: "correctness-logic", triage: "Confirm the runner label and available runner fleet; host-default labels do not prove that a project-specific self-hosted runner is absent." },
  { rule: "shell-name", class: "logic.contract", lens: "correctness-logic", triage: "Confirm the shell name and the runner platform that executes it; native validation is not proof that the project's script fails." },
  { rule: "workflow-call", class: "contracts.api", lens: "contracts", triage: "Confirm the reusable workflow's actual input and secret contract; a native call diagnostic alone is not a confirmed caller break." },
] as const

export const actionlint = {
  pack: {
    id: "actionlint",
    tool: "actionlint",
    version: pinned.version,
    pin: {
      source: "backend-toolkit/packs/actionlint",
      integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: "any",
    detection: { manifests: [], extensions: [], absent: [], paths: [".github/workflows/*.{yml,yaml}"] },
    lane: "no-build",
    tiers: ["standard", "deep"],
    output: { format: "json", parser: "actionlint" },
    cost: "low",
    network: { kind: "none" },
    scratchWrites: false,
    template: "actionlint-host-json",
    lenses: ["correctness-logic", "security", "contracts"],
    status: "probation",
  },
  rules: descriptors.map((entry) => ({
    ...entry,
    pack: "actionlint",
    severity: { "*": "P2" },
    status: "probation",
  } as const)),
  overlay: {
    id: "github-actions",
    paths: [".github/workflows/*.{yml,yaml}"],
    content: [],
    lenses: ["correctness-logic", "security", "contracts"],
    checks: ["actionlint"],
  },
} as const
