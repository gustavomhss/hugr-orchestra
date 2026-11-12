import gitleaks from "../../backend-toolkit/packs/gitleaks"
import type { ReviewCatalog } from "./index"
import { actionlint } from "./actionlint"
import { oxlint } from "./oxlint"
import { languagesRest } from "./languages-rest"
import { releaseChecks } from "./release-checks"
import { phase5Options, releaseProfile } from "./phase5"
import { phase3 } from "./phase3"
import { phase4 } from "./phase4"
import { engagementProfiles } from "./phase6"
import { ruff } from "./ruff"
import { golangci } from "./golangci"
import { osv } from "./osv"
import { syft } from "./syft"
import { jscpd } from "./jscpd"
import { hadolint, shellcheck } from "./invoke"
import { gosec } from "./gosec"
import { govet } from "./govet"
import { staticcheck } from "./staticcheck"
import { tsc } from "./tsc"
import { typeAware } from "./type-aware"
import { zizmor } from "./zizmor"

// Phase 1 entries (plan WP 1.2). Budgets, rungs, caps and thresholds are design §8.3, §8.4 and §8.6's starting values
// (D14): tuning one is a catalog change, which changes the digest receipts record. Until the precision ledger has
// data, every pack and rule is `probation`; only the repository's own declared gates are `active` (§8.5).

const always = { manifests: [], extensions: [], absent: [] }

const quote = (proves: string) => ({ option: "quote", proves })
const test = { option: "probe:test", proves: "a reproduction test drives the trigger through the public entry point and fails on head" }
const script = { option: "probe:script", proves: "a short script prints the observed value beside the expected one" }
const typecheck = { option: "probe:typecheck", proves: "a type error at the cited line shows the caller or implementation no longer matches" }
const regress = { option: "probe:regress", proves: "the test stays green with the hunk reverted, or base and head differ on the input" }
const race = { option: "probe:race", proves: "a race-instrumented run of the test that drives the concurrent path" }

const ran = (id: string, proves: string) => ({ id, node: "lucy-review-prove-regress", options: { "*": [quote(proves), test, script] } })
const raced = (id: string, proves: string): ReviewCatalog.Catalog["classes"][number] => ({
  id,
  node: id === "concurrency.atomicity" ? "lucy-review-prove-interleave" : "lucy-review-prove-race",
  options: id === "concurrency.atomicity"
    ? { "*": [quote(proves), test, script], go: [quote(proves), test, race], "js-ts": [quote(proves), test, { option: "probe:interleave", proves: "the same gated schedule fails on base and passes on head" }] }
    : { "*": [quote(proves), test, script], go: [quote(proves), test, race] },
})
const quoted = (id: string, proves: string): ReviewCatalog.Catalog["classes"][number] => ({
  id,
  node: id === "logic.invariant" ? "lucy-review-prove-property" : "lucy-review-prove-quote",
  options: id === "logic.invariant"
    ? { "*": [quote(proves), test, script], "js-ts": [quote(proves), { option: "probe:property", proves: "the stated law fails on a retained shrunk input" }, test] }
    : { "*": [quote(proves), test, script] },
})
const plain = (id: string, proves: string) => ({ id, node: "lucy-review-prove-quote", options: { "*": [quote(proves)] } })

const DOCS = ["**/*.md", "**/*.mdx", "**/*.rst", "**/*.adoc", "docs/**", "**/docs/**"]
const STANDARD_LENSES = ["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security"]
const ALL_LENSES = [...STANDARD_LENSES, "correctness-concurrency"]

export const current = {
  version: "catalog-v1",
  packs: [
    {
      id: "gitleaks",
      tool: "gitleaks",
      // Lucy's own entry over the backend toolkit's pinned artifact; the toolkit's grant is not reused.
      version: gitleaks.version,
      pin: {
        source: "backend-toolkit/packs/gitleaks",
        integrity: Object.fromEntries(Object.entries(gitleaks.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
      },
      licence: "pinned",
      backend: "pinned",
      languages: "any",
      detection: always,
      lane: "no-build",
      tiers: ["quick", "standard", "deep"],
      output: { format: "sarif" },
      cost: "low",
      network: { kind: "none" },
      scratchWrites: false,
      template: "gitleaks-dir-sarif",
      lenses: ["security"],
      status: "probation",
    },
    {
      // The gates the base revision declares, as `RelayCommands.detect` reads them from the root manifests.
      id: "repo",
      tool: "RelayCommands.detect",
      version: "base-revision",
      licence: "invoke",
      backend: "repo",
      languages: "any",
      detection: { manifests: ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "Makefile"], extensions: [], absent: [] },
      lane: "repo",
      tiers: ["standard", "deep"],
      output: { format: "json", parser: "repo-gate" },
      cost: "high",
      network: { kind: "none" },
      scratchWrites: true,
      template: "repo-command",
      lenses: ["correctness-logic", "tests"],
      status: "active",
    },
    phase3.pack,
    phase4.pack,
    ruff.pack,
    actionlint.pack,
    oxlint.pack,
    zizmor.pack,
    tsc.pack,
    govet.pack,
    staticcheck.pack,
    gosec.pack,
    golangci.pack,
    shellcheck.pack,
    hadolint.pack,
    osv.pack,
    syft.pack,
    typeAware.pack,
    jscpd.pack,
  ],
  rules: [
    {
      pack: "gitleaks",
      rule: "*",
      class: "security.secret",
      lens: "security",
      severity: { "*": "P1" },
      triage: "A live-format credential on an added line; a placeholder, example or obviously fake value is noise.",
      status: "probation",
      cwe: "CWE-798",
    },
    ...phase3.rules,
    ...phase4.rules,
    ...ruff.rules,
    ...actionlint.rules,
    ...oxlint.rules,
    ...typeAware.rules,
    ...zizmor.rules,
    ...jscpd.rules,
  ],
  overlays: [
    {
      id: "docs",
      paths: DOCS,
      content: [],
      lenses: ["correctness-logic"],
      checks: [],
    },
    {
      id: "concurrency",
      paths: [],
      content: [
        { id: "lock", pattern: "\\b(?:Mutex|RWMutex|RLock|Semaphore|Lock|synchronized|flock)\\b|\\.lock\\(" },
        { id: "spawn", pattern: "\\b(?:spawn|fork|forkDaemon|Worker|Thread|ChildProcess)\\b|Effect\\.fork" },
        { id: "promise-all", pattern: "\\bPromise\\.(?:all|allSettled|race|any)\\b" },
        { id: "goroutine", pattern: "(?:^|[\\s{;])go\\s+(?:func\\b|[A-Za-z_][\\w.]*\\()" },
        { id: "deferred", pattern: "\\bDeferred\\b" },
      ],
      lenses: ["correctness-concurrency"],
      checks: [],
    },
    ...phase3.overlays,
    actionlint.overlay,
  ],
  lenses: [
    releaseChecks.lens,
    {
      id: "correctness-logic",
      node: "lucy-lens-correctness-logic",
      // No phase 1 lens owns plans or docs; their classes read like contracts, so the logic lens raises them.
      classes: ["logic.invariant", "logic.contract", "logic.error-path", "plan.coverage", "plan.requirement", "docs.contradiction"],
    },
    { id: "correctness-edges", node: "lucy-lens-correctness-edges", classes: ["edges.category", "edges.falsehood"] },
    {
      id: "correctness-concurrency",
      node: "lucy-lens-correctness-concurrency",
      classes: [
        "concurrency.atomicity",
        "concurrency.order",
        "concurrency.toctou",
        "concurrency.double-execution",
        "concurrency.use-after-dispose",
        "concurrency.reentrancy",
        "concurrency.stale-read",
        "concurrency.aba",
      ],
    },
    {
      id: "correctness-reliability",
      node: "lucy-lens-correctness-reliability",
      classes: ["reliability.error-handling", "reliability.retry", "reliability.timeout", "reliability.rollback"],
    },
    { id: "tests", node: "lucy-lens-tests", classes: ["tests.missing", "tests.weak-oracle"] },
    { id: "security", node: "lucy-lens-security", classes: ["security.boundary", "security.secret", ...phase3.securityClasses] },
    ...phase3.lenses,
  ],
  classes: [
    raced("concurrency.atomicity", "the read, the scheduling point and the dependent write on one path"),
    raced("concurrency.order", "the action and the missing happens-before between it and its prerequisite"),
    raced("concurrency.toctou", "the check, the window and the use of the same resource"),
    raced("concurrency.double-execution", "two paths that start the same work with nothing that deduplicates them"),
    raced("concurrency.use-after-dispose", "the release and the work that continues on the released resource"),
    raced("concurrency.reentrancy", "the callback that re-enters the unit while its update is half done"),
    raced("concurrency.stale-read", "the captured value, the scheduling point and its later use as current"),
    raced("concurrency.aba", "the comparison that passes while the state behind the value moved"),
    quoted("logic.invariant", "the exit or update that leaves the stated invariant broken"),
    {
      id: "logic.contract",
      node: "lucy-review-prove-quote",
      options: {
        "*": [quote("the changed contract and the caller or intent that still expects the old one"), test, script],
        "js-ts": [quote("the changed contract and the caller or intent that still expects the old one"), typecheck, test],
        python: [quote("the changed contract and the caller or intent that still expects the old one"), typecheck, test],
        go: [quote("the changed contract and the caller or intent that still expects the old one"), typecheck, test],
        php: [quote("the changed contract and the caller or intent that still expects the old one"), typecheck, test],
      },
    },
    quoted("logic.error-path", "the failure and the path that loses, misreports or half-applies it"),
    quoted("edges.category", "the input category and the branch that mishandles it"),
    quoted("edges.falsehood", "the assumption and a real input that breaks it"),
    ran("reliability.error-handling", "the failure that is swallowed, misclassified or skips its cleanup"),
    ran("reliability.retry", "the retry and the missing bound or the effect it repeats"),
    ran("reliability.timeout", "the external call and the missing deadline or assumed outcome"),
    ran("reliability.rollback", "the partial progress and the missing undo or resume"),
    {
      id: "tests.missing",
      node: "lucy-review-prove-regress",
      options: { "*": [quote("the behaviour the change states and the absence of a test that asserts it"), regress, test] },
    },
    {
      id: "tests.weak-oracle",
      node: "lucy-review-prove-mutants",
      options: {
        "*": [quote("the assertion that cannot fail for the hunk it claims to cover"), regress],
        rust: [quote("the assertion that cannot fail for the hunk it claims to cover"), regress, { option: "probe:mutants", proves: "a viable changed-line mutant survives the tests" }],
      },
    },
    {
      id: "security.boundary",
      node: "lucy-review-prove-quote",
      options: {
        "*": [
          quote("the untrusted input reaching its landing with no validation or encoding on the path"),
          { option: "tool:ast-grep", proves: "the pinned ast-grep rule flags eval($$$ARGS) in the cited region" },
          test,
        ],
      },
    },
    {
      id: "security.secret",
      node: "lucy-review-prove-quote",
      options: {
        "*": [quote("the live-format credential and where the change commits, logs or sends it"), { option: "tool:gitleaks", proves: "the pinned scanner flags the region" }],
      },
    },
    plain("plan.coverage", "the criterion and the step that should deliver it, or that no step names it"),
    plain("plan.requirement", "the requirement and the attribute it fails, or the base-revision code that contradicts it"),
    plain("docs.contradiction", "the changed statement and the code at head that contradicts it"),
    ...phase3.classes,
  ],
  options: [
    { id: "quote", rung: "quote", cost: "low" },
    { id: "tool:gitleaks", rung: "tool", cost: "low" },
    { id: "tool:repo", rung: "tool", cost: "high" },
    phase3.option,
    { id: "probe:regress", rung: "probe", cost: "high" },
    { id: "probe:test", rung: "probe", cost: "medium" },
    { id: "probe:typecheck", rung: "probe", cost: "medium" },
    { id: "probe:script", rung: "probe", cost: "medium" },
    { id: "probe:race", rung: "probe", cost: "high" },
    ...phase5Options,
    ...releaseChecks.options,
  ],
  languages: [
    {
      id: "js-ts",
      detection: {
        manifests: ["package.json", "bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.json", "deno.json"],
        extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
        absent: [],
      },
      node: "team-stack-js-ts",
    },
    {
      id: "python",
      detection: {
        manifests: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "poetry.lock", "uv.lock"],
        extensions: [".py", ".pyi"],
        absent: [],
      },
      node: "team-stack-python",
    },
    { id: "go", detection: { manifests: ["go.mod", "go.sum"], extensions: [".go"], absent: [] }, node: "team-stack-go" },
    {
      id: "ruby",
      detection: { manifests: ["Gemfile", "Gemfile.lock", ".ruby-version"], extensions: [".rb", ".rake", ".gemspec"], absent: [] },
      node: "team-stack-ruby",
    },
    { id: "php", detection: { manifests: ["composer.json", "composer.lock"], extensions: [".php"], absent: [] }, node: "team-stack-php" },
    phase4.language,
    ...languagesRest,
  ],
  route: {
    version: "route-v1",
    tier: "standard",
    profiles: [
      {
        id: "plan",
        node: "lucy-review-plan",
        stage: "plan",
        tier: "standard",
        // Overlays are change types; a plan has none (§5.1).
        overlays: false,
        lenses: {
          quick: ["correctness-logic"],
          standard: ["correctness-logic", "correctness-edges", "correctness-reliability", "tests"],
          deep: ["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security"],
        },
        // Variant generations search other hunks of a change; a plan has none.
        variants: 0,
      },
      {
        id: "code",
        node: "lucy-review-code",
        stage: "code",
        tier: "risk",
        overlays: true,
        lenses: { quick: ["correctness-logic", "tests"], standard: STANDARD_LENSES, deep: ALL_LENSES },
        variants: 1,
      },
      {
        // Reuses the first round's route; this table routes only the new delta.
        id: "rereview",
        node: "lucy-review-rereview",
        stage: "first-round",
        tier: "first-round",
        overlays: true,
        lenses: { quick: ["correctness-logic", "tests"], standard: STANDARD_LENSES, deep: ALL_LENSES },
        variants: 1,
      },
      {
        // Metadata only. A governed request still defaults to the stage profile; wiring pr is separate.
        id: "pr",
        node: "lucy-review-pr",
        stage: "code",
        tier: "risk",
        overlays: true,
        lenses: { quick: ["correctness-logic", "tests"], standard: STANDARD_LENSES, deep: ALL_LENSES },
        variants: 1,
      },
      releaseProfile,
      ...engagementProfiles,
    ],
    tiers: [
      {
        id: "quick",
        built: true,
        runs: "quick",
        report: ["P0", "P1"],
        budget: {
          lenses: { min: 1, max: 2 },
          lensChildren: false,
          samples: 1,
          loadsPerSession: 2,
          itemsPerLens: 5,
          candidatesPerLens: 5,
          verifiers: 0,
          candidatesPerVerifier: 0,
          toolCallsPerSession: 15,
        },
        rungs: { quote: ["P0", "P1", "P2", "P3"], tool: [], probe: [], changedTests: false },
        probeAttempts: 0,
      },
      {
        id: "standard",
        built: true,
        runs: "standard",
        report: ["P0", "P1", "P2", "P3"],
        budget: {
          lenses: { min: 3, max: 6 },
          lensChildren: true,
          samples: 1,
          loadsPerSession: 3,
          itemsPerLens: 15,
          candidatesPerLens: 8,
          verifiers: 4,
          candidatesPerVerifier: 4,
          toolCallsPerSession: 30,
        },
        rungs: { quote: ["P0", "P1", "P2", "P3"], tool: ["P0", "P1", "P2"], probe: ["P0", "P1"], changedTests: true },
        probeAttempts: 2,
      },
      {
        // Qualified Deep adapters, independent samples and release checks run under their own budget.
        id: "deep",
        built: true,
        runs: "deep",
        report: ["P0", "P1", "P2", "P3"],
        budget: {
          lenses: { min: 3, max: 8 },
          lensChildren: true,
          samples: 2,
          loadsPerSession: 4,
          itemsPerLens: 30,
          candidatesPerLens: 12,
          verifiers: 10,
          candidatesPerVerifier: 4,
          toolCallsPerSession: 50,
        },
        rungs: { quote: ["P0", "P1", "P2", "P3"], tool: ["P0", "P1", "P2", "P3"], probe: ["P0", "P1", "P2"], changedTests: true },
        probeAttempts: 3,
      },
    ],
    // §5.3, in order: any Deep trigger first, then the Quick ones; otherwise `tier`.
    triggers: [
      {
        id: "trust-boundary",
        tier: "deep",
        signal: { kind: "path", globs: ["**/auth/**", "**/*auth*", "**/*secret*", "**/*credential*", "**/.env*", "**/permission/**", "**/permissions/**"] },
      },
      { id: "concurrency", tier: "deep", signal: { kind: "overlay", overlay: "concurrency" } },
      {
        id: "durable-state",
        tier: "deep",
        signal: { kind: "path", globs: ["**/store/**", "**/storage/**", "**/database/**", "**/db/**", "**/persistence/**"] },
      },
      { id: "data-migration", tier: "deep", signal: { kind: "path", globs: ["**/migrations/**", "**/migration/**", "**/*.sql"] } },
      {
        id: "public-api",
        tier: "deep",
        signal: {
          kind: "path",
          globs: ["**/*.proto", "**/openapi*.json", "**/openapi*.yaml", "**/openapi*.yml", "**/*.graphql", "**/sdk/**"],
        },
      },
      { id: "changed-lines", tier: "deep", signal: { kind: "changed-lines", over: 400 } },
      { id: "churn", tier: "deep", signal: { kind: "churn", days: 90, commits: 20, authors: 4 } },
      {
        id: "docs-only",
        tier: "quick",
        signal: { kind: "only", globs: DOCS, additionsOnly: false },
      },
      {
        id: "test-only-additions",
        tier: "quick",
        signal: {
          kind: "only",
          globs: ["**/test/**", "**/tests/**", "**/__tests__/**", "**/spec/**", "**/*.test.*", "**/*.spec.*", "**/*_test.go", "**/test_*.py", "**/*_test.py"],
          additionsOnly: true,
        },
      },
      { id: "small", tier: "quick", signal: { kind: "small", atMost: 50 } },
    ],
    ledger: {
      activate: { read: 20, confirmed: 0.5 },
      demote: { window: 20, confirmedBelow: 0.2 },
      drop: { window: 20, highCostWindow: 10 },
    },
  },
} as const satisfies ReviewCatalog.Catalog
