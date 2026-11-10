import astGrep from "../../backend-toolkit/packs/ast-grep"

// Phase 3 catalog data (plan WP 3.1). Lucy reuses the backend pin and does not borrow the backend grant.
// Content patterns only suggest; route.ts binds lenses from paths. The lifetime signal uses identifier
// boundaries so a prefix such as `predisposed` is not a suggestion.

const EVAL_TRIAGE =
  "Pattern eval($$$ARGS). Direct eval is a candidate only with a quoted untrusted-input trigger; a structural hit alone neither proves exploitability nor confirms a probation finding."

const offer = (id: string, node: "lucy-review-prove-quote" | "lucy-review-prove-regress", quote: string, test: string, script: string) => ({
  id,
  node,
  options: {
    "*": [
      { option: "quote", proves: quote },
      { option: "probe:test", proves: test },
      { option: "probe:script", proves: script },
    ],
  },
})

const regress = (id: string, quote: string, test: string, script: string) => offer(id, "lucy-review-prove-regress", quote, test, script)
const quoted = (id: string, quote: string, test: string, script: string) => offer(id, "lucy-review-prove-quote", quote, test, script)

export const phase3 = {
  pack: {
    id: "ast-grep",
    tool: "ast-grep",
    version: astGrep.version,
    pin: {
      source: "backend-toolkit/packs/ast-grep",
      integrity: Object.fromEntries(Object.entries(astGrep.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: ["js-ts"],
    detection: { manifests: [], extensions: [], absent: [] },
    lane: "no-build",
    tiers: ["standard", "deep"],
    output: { format: "json", parser: "ast-grep" },
    cost: "low",
    network: { kind: "none" },
    scratchWrites: false,
    template: "ast-grep-scan-json",
    lenses: ["security"],
    status: "probation",
  },
  rules: [
    { pack: "ast-grep", rule: "lucy-js-eval", class: "security.boundary", lens: "security", severity: { "*": "P2" }, triage: EVAL_TRIAGE, status: "probation" },
    { pack: "ast-grep", rule: "lucy-ts-eval", class: "security.boundary", lens: "security", severity: { "*": "P2" }, triage: EVAL_TRIAGE, status: "probation" },
  ],
  overlays: [
    {
      id: "api-wire",
      paths: ["**/*.proto", "**/openapi.{yaml,yml,json}"],
      content: [{ id: "content-type", pattern: "\\bContent-Type\\b" }],
      lenses: ["contracts"],
      checks: [],
    },
    {
      id: "data-migration",
      paths: ["**/migrations/**"],
      content: [{ id: "alter-table", pattern: "\\bALTER\\s+TABLE\\b" }],
      lenses: ["contracts"],
      checks: ["squawk"],
    },
    {
      id: "performance",
      paths: ["**/benchmarks/**"],
      content: [
        { id: "for-await", pattern: "\\bfor\\s+await\\b" },
        { id: "lifetime", pattern: "\\b(?:dispose|cleanup|finalizer)\\b" },
      ],
      lenses: ["correctness-performance", "correctness-resources"],
      checks: [],
    },
    {
      id: "ci-infra",
      paths: [".github/workflows/**", "**/*.tf"],
      content: [{ id: "permissions", pattern: "\\bpermissions:" }],
      lenses: ["security", "change"],
      checks: [],
    },
    {
      id: "dependency",
      paths: ["**/{package.json,bun.lock,package-lock.json,pnpm-lock.yaml,yarn.lock}"],
      content: [{ id: "dependencies", pattern: "\\bdependencies:" }],
      lenses: ["contracts", "security"],
      checks: [],
    },
    {
      id: "ui",
      paths: ["packages/app-shell/src/**", "**/*.{tsx,jsx,css}"],
      content: [{ id: "aria-label", pattern: "\\baria-label\\b" }],
      lenses: ["experience"],
      checks: [],
    },
    {
      id: "personal-data",
      paths: ["**/privacy/**"],
      content: [
        { id: "email", pattern: "\\bemail\\b" },
        { id: "https-host", pattern: "\\bhttps://[A-Za-z0-9.-]+" },
      ],
      lenses: ["privacy"],
      checks: [],
    },
  ],
  lenses: [
    { id: "correctness-resources", node: "lucy-lens-correctness-resources", classes: ["resources.lifetime"] },
    { id: "correctness-performance", node: "lucy-lens-correctness-performance", classes: ["performance.cost"] },
    {
      id: "contracts",
      node: "lucy-lens-contracts",
      classes: ["contracts.api", "contracts.semver", "contracts.data", "contracts.third-party", "contracts.ipc"],
    },
    {
      id: "change",
      node: "lucy-lens-change",
      classes: ["change.structure", "change.history", "change.merge", "change.provenance", "change.health"],
    },
    {
      id: "experience",
      node: "lucy-lens-experience",
      classes: ["experience.interaction", "experience.a11y", "experience.visual", "experience.content"],
    },
    { id: "privacy", node: "lucy-audit-compliance-privacy", classes: ["privacy.processing"] },
  ],
  securityClasses: ["security.supply-chain", "security.ci", "security.infra"],
  classes: [
    regress(
      "resources.lifetime",
      "the acquired resource and the path that drops it without a release",
      "a test acquires the resource, drives the new path, and fails if the release does not run",
      "a script prints the acquire count beside the release count for the cited path",
    ),
    regress(
      "performance.cost",
      "the new work and the bound or batching the old path had",
      "a test drives the hot path and fails when the measured cost exceeds the claimed bound",
      "a script prints the measured cost beside the bound the change claims",
    ),
    quoted(
      "contracts.api",
      "the changed wire or public signature and the caller that still expects the old one",
      "a test calls the public entry with the previous contract and fails on head",
      "a script prints the old and new signatures for the cited entry",
    ),
    quoted(
      "contracts.semver",
      "the version or compatibility claim and the break it does not name",
      "a test consumes the previous public contract and fails on the unnamed break",
      "a script prints the declared version beside the breaking change",
    ),
    quoted(
      "contracts.data",
      "the schema or migration and the reader that still expects the old shape",
      "a test loads a base-revision row through the new path and fails on mismatch",
      "a script prints the old and new field shapes for the cited schema",
    ),
    quoted(
      "contracts.third-party",
      "the dependency change and the call site that assumes the old behaviour",
      "a test drives the call site against the new dependency and fails on the old assumption",
      "a script prints the resolved version beside the call the change assumes",
    ),
    quoted(
      "contracts.ipc",
      "the changed message or channel and the peer that still speaks the old one",
      "a test sends the previous message through the public entry and fails on head",
      "a script prints both message shapes for the cited channel",
    ),
    quoted(
      "security.supply-chain",
      "the new or changed dependency and the pin, source or integrity it lacks",
      "a test resolves the dependency and fails when the pin or integrity is absent",
      "a script prints the requested spec beside the resolved digest",
    ),
    quoted(
      "security.ci",
      "the workflow change and the permission, trigger or secret it widens",
      "a test parses the workflow and fails when the widened permission is present",
      "a script prints the old and new permission sets",
    ),
    quoted(
      "security.infra",
      "the infra change and the exposure, privilege or missing control it adds",
      "a test plans the change and fails when the new exposure is present",
      "a script prints the resource beside its access boundary",
    ),
    quoted(
      "change.structure",
      "the moved or split unit and the caller or build edge the move drops",
      "a test imports the previous path and fails on head",
      "a script prints the old and new module paths",
    ),
    quoted(
      "change.history",
      "the rewritten history and the commit or author the change drops",
      "a test reads the cited revision and fails when the expected commit is gone",
      "a script prints the old and new revision ranges",
    ),
    quoted(
      "change.merge",
      "the merge and the side whose change the result drops or double-applies",
      "a test replays both sides and fails when the merge result loses one",
      "a script prints both sides beside the merge result",
    ),
    quoted(
      "change.provenance",
      "the changed artifact and the missing builder, source or attestation",
      "a test reads the attestation and fails when the builder or source is absent",
      "a script prints the artifact digest beside its stated builder",
    ),
    quoted(
      "change.health",
      "the change and the check, owner or freshness signal it leaves red or unnamed",
      "a test reads the check result and fails when the named gate is red",
      "a script prints the gate name beside its last result",
    ),
    quoted(
      "experience.interaction",
      "the changed control and the input or state it no longer handles",
      "a test drives the control through the public entry and fails on the lost state",
      "a script prints the control beside the state the change drops",
    ),
    quoted(
      "experience.a11y",
      "the changed UI and the name, role or keyboard path it removes",
      "a test queries the accessible name and fails when it is missing",
      "a script prints the element beside its accessible name",
    ),
    quoted(
      "experience.visual",
      "the changed surface and the state or contrast the change breaks",
      "a test renders the cited state and fails when the contrast or layout breaks",
      "a script prints the measured contrast beside the required bound",
    ),
    quoted(
      "experience.content",
      "the changed copy and the action or state it misnames",
      "a test reads the rendered copy and fails when it names the wrong action",
      "a script prints the old and new copy for the cited control",
    ),
    quoted(
      "privacy.processing",
      "the new personal data, purpose or destination and the path that states no bound for it",
      "a test drives the processing path and fails when the new field or sink is unbound",
      "a script prints the field or host beside the purpose the change states",
    ),
  ],
  option: { id: "tool:ast-grep", rung: "tool", cost: "low" },
} as const
