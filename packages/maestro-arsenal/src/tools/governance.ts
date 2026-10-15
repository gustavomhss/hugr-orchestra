// Native TypeScript adaptations of TechLead governance @ a68e7af. See governance/capabilities.ts for traceability.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
import { type GovernanceContext, type Capture, requireValue, text } from "../governance/contracts.ts"
import { sourceRoot, readState } from "../governance/state.ts"
import { type Acceptance, acceptance } from "../governance/acceptance.ts"
import { type Price, type Usage, type Observations, telemetry, estimate } from "../governance/telemetry.ts"
import { changeBudget, changedFiles, selectCI, metrics, metricsReport, changelog, changelogProposal, releaseProposal, rulesetProposal, commitlint } from "../governance/repository.ts"
import { type ScopedPolicy, policyProposal } from "../governance/policy.ts"
import { recoveryBegin, recoveryPrepare, recoveryRestore, recoveryReplay } from "../governance/recovery.ts"
import { preflightArm, preflightCheck, preflightDisarm } from "../governance/preflight.ts"
import { type OperatorRequest, runRelease, runRuleset, writeChangelog } from "../governance/operators.ts"
import { governanceToolDescriptor, GOVERNANCE_DEFINITIONS, GOVERNANCE_OPERATIONS } from "../governance/descriptors.ts"
import type { ToolDef } from "../contract.ts"
export { governanceToolDescriptor, GOVERNANCE_OPERATIONS, operationSchema } from "../governance/descriptors.ts"
export interface GovernanceInput {
  operation: keyof typeof GOVERNANCE_DEFINITIONS
  sourceRoot?: string
  observations?: Observations
  prices?: readonly Price[]
  estimates?: Omit<Usage, "provenance">[]
  budgetUSD?: number
  baseline?: Capture
  final?: Capture
  acceptance?: Acceptance[]
  checks?: Capture
  base?: string
  soft?: number
  hard?: number
  reviewerCap?: number
  excludedPaths?: string[]
  groups?: { prefix: string; group: string }[]
  universal?: string[]
  paths?: string[]
  threshold?: number
  metricsBaseline?: { files: { path: string; loc: number }[] }
  metricsFinal?: { files: { path: string; loc: number }[] }
  packagePath?: string
  changelogPath?: string
  version?: string
  title?: string
  date?: string
  requiredChecks?: string[]
  branch?: string
  repository?: string
  requiredStatusChecks?: string[]
  policy?: ScopedPolicy
  wave?: string
  ownedPaths?: string[]
  token?: string
  operatorRequest?: OperatorRequest
  recipePath?: string
  recipeDigest?: string
  recipeArgs?: readonly string[]
  tag?: string
  expectedDigest?: string
}
const tool: ToolDef<GovernanceInput> = {
  ...governanceToolDescriptor,
  async handler(input: GovernanceInput, context?: GovernanceContext) {
    requireValue(context, "NATIVE_CONTEXT_REQUIRED")
    requireValue(GOVERNANCE_OPERATIONS.includes(input.operation), "GOVERNANCE_OPERATION_INVALID")
    // Pure observation adapters do not acquire source data. Overrides still cannot change host placement.
    if (input.sourceRoot !== undefined) requireValue(input.sourceRoot === context.directory, "SOURCE_ROOT_OVERRIDE_DENIED")
    if (["audit", "usage", "status"].includes(input.operation)) {
      requireValue(input.observations, "OBSERVATIONS_REQUIRED")
      const report = telemetry(context.projectID, input.observations, input.prices)
      if (input.operation === "audit") return text(report.audit)
      if (input.operation === "usage") return text(report.usage)
      return text(report)
    }
    if (input.operation === "cost-estimate") {
      requireValue(input.estimates && input.prices, "ESTIMATE_INPUT_REQUIRED")
      const report = estimate(input.estimates, input.prices, input.budgetUSD)
      return { ...text(report), ...(report.status !== "WITHIN_ESTIMATE" ? { isError: true } : {}) }
    }
    if (input.operation === "acceptance") {
      requireValue(input.baseline && input.final && input.acceptance, "ACCEPTANCE_INPUT_REQUIRED")
      return text({ ...acceptance(context.projectID, input.baseline, input.final, input.acceptance), authoritative: false })
    }
    if (input.operation === "metrics-report") {
      requireValue(input.metricsBaseline && input.metricsFinal, "METRICS_CAPTURES_REQUIRED")
      return text(metricsReport(input.metricsBaseline, input.metricsFinal))
    }
    if (input.operation === "changelog-propose") {
      requireValue(input.version && input.title && input.date, "CHANGELOG_PROPOSAL_INPUT_REQUIRED")
      return text(changelogProposal(input.version, input.title, input.date))
    }
    if (input.operation === "ruleset-propose") {
      requireValue(input.repository, "RULESET_REPOSITORY_REQUIRED")
      return text(rulesetProposal(input.repository, input.branch, input.requiredStatusChecks))
    }
    if (input.operation === "recovery-replay") {
      requireValue(input.requiredChecks && input.checks, "RECOVERY_REPLAY_INPUT_REQUIRED")
      return text(recoveryReplay(context.projectID, input.requiredChecks, input.checks))
    }
    if (input.operation === "release-run") {
      requireValue(input.operatorRequest && input.recipePath && input.recipeDigest && input.tag, "RELEASE_OPERATOR_INPUT_REQUIRED")
      return text(await runRelease(context, { operatorRequest: input.operatorRequest, recipePath: input.recipePath, recipeDigest: input.recipeDigest, tag: input.tag, recipeArgs: input.recipeArgs, branch: input.branch }))
    }
    if (input.operation === "ruleset-run") {
      requireValue(input.operatorRequest && input.repository, "RULESET_OPERATOR_INPUT_REQUIRED")
      return text(await runRuleset(context, { operatorRequest: input.operatorRequest, repository: input.repository, branch: input.branch, requiredStatusChecks: input.requiredStatusChecks }))
    }
    if (input.operation === "changelog-write") {
      requireValue(input.operatorRequest && input.changelogPath && input.expectedDigest && input.version && input.title && input.date, "CHANGELOG_OPERATOR_INPUT_REQUIRED")
      return text(await writeChangelog(context, { operatorRequest: input.operatorRequest, changelogPath: input.changelogPath, expectedDigest: input.expectedDigest, version: input.version, title: input.title, date: input.date }))
    }
    const root = await sourceRoot(context, input.sourceRoot)
    if (input.operation === "change-budget") return text(await changeBudget(context, root, input))
    if (input.operation === "ci-select") {
      requireValue(input.groups && input.universal, "CI_BINDINGS_REQUIRED")
      const changes = await changedFiles(context, root, input.base)
      return text({ ...selectCI(changes.files.map((file) => file.path), input.groups, input.universal), acquisition: changes })
    }
    if (input.operation === "metrics-snapshot" || input.operation === "loc-cap") {
      requireValue(input.paths, "METRICS_PATHS_REQUIRED")
      const report = await metrics(context, root, input.paths, input.threshold)
      return text(input.operation === "loc-cap" ? { ...report, status: report.overThreshold.length ? "FAIL" : "PASS", failures: report.overThreshold.map((file) => `LOC_CAP_EXCEEDED: ${file.path}`) } : report)
    }
    if (input.operation === "changelog-check") {
      requireValue(input.packagePath && input.changelogPath, "CHANGELOG_PATHS_REQUIRED")
      return text(await changelog(context, root, input.packagePath, input.changelogPath))
    }
    if (input.operation === "release-propose") {
      requireValue(input.packagePath && input.changelogPath && input.checks && input.requiredChecks, "RELEASE_INPUT_REQUIRED")
      return text(await releaseProposal(context, root, { packagePath: input.packagePath, changelogPath: input.changelogPath, checks: input.checks, requiredChecks: input.requiredChecks, branch: input.branch }))
    }
    if (input.operation === "commitlint") return text(await commitlint(context, root, input.base))
    if (input.operation === "policy-propose" || input.operation === "sandbox-propose") {
      requireValue(input.policy, "POLICY_INPUT_REQUIRED")
      return text(await policyProposal(context, root, input.policy))
    }
    if (input.operation === "recovery-restore") {
      requireValue(input.token, "RECOVERY_TOKEN_REQUIRED")
      return text(await recoveryRestore(context, root, input.token))
    }
    requireValue(input.wave, "GOVERNANCE_WAVE_REQUIRED")
    if (input.operation === "recovery-begin") {
      requireValue(input.ownedPaths, "RECOVERY_OWNED_PATHS_REQUIRED")
      return text(await recoveryBegin(context, root, input.wave, input.ownedPaths))
    }
    if (input.operation === "recovery-prepare") return text(await recoveryPrepare(context, root, input.wave))
    if (input.operation === "recovery-status") return text(await readState(context, "recovery", input.wave))
    if (input.operation === "preflight-arm") {
      requireValue(input.checks && input.requiredChecks, "PREFLIGHT_CHECKS_REQUIRED")
      return text(await preflightArm(context, root, input.wave, input.checks, input.requiredChecks))
    }
    if (input.operation === "preflight-check") return text(await preflightCheck(context, root, input.wave))
    if (input.operation === "preflight-disarm") return text(await preflightDisarm(context, input.wave))
    throw new Error("GOVERNANCE_OPERATION_UNIMPLEMENTED")
  },
}
export default tool
