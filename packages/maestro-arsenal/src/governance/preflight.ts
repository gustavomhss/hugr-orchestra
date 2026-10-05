// Source: wave-preflight.py. No skip-green marker; stores bounded host evidence + actual scoped Git baseline.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { type GovernanceContext, type Capture, validateCapture, requireValue, gitRevision } from "./contracts.ts"
import { git, requireGitRoot } from "./process.ts"
import { readState, updateState } from "./state.ts"
export async function preflightArm(context: GovernanceContext, root: string, wave: string, checks: Capture, requiredChecks: string[]) {
  await requireGitRoot(context, root)
  validateCapture(checks, context.projectID)
  requireValue(requiredChecks.length > 0 && requiredChecks.length <= 512 && new Set(requiredChecks).size === requiredChecks.length, "PREFLIGHT_REQUIRED_CHECKS_EMPTY_OR_INVALID")
  const head = (await git(context, root, ["rev-parse", "HEAD"])).trim()
  const dirty = await git(context, root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  const failures = [
    ...(dirty ? ["PREFLIGHT_DIRTY_BASELINE"] : []),
    ...requiredChecks.flatMap((name) => {
      const check = checks.results.find((check) => check.name === name)
      if (!check) return [`PREFLIGHT_CHECK_MISSING: ${name}`]
      if (gitRevision(check.provenance) === undefined) return [`PREFLIGHT_CHECK_REVISION_UNAVAILABLE: ${name}`]
      if (gitRevision(check.provenance) !== head) return [`PREFLIGHT_CHECK_STALE: ${name}`]
      return check.status === "pass" ? [] : [`PREFLIGHT_CHECK_${check.status.toUpperCase()}: ${name}`]
    }),
  ]
  const record = { schema: 1, projectID: context.projectID, wave, root, head, requiredChecks, checks, armed: failures.length === 0, failures }
  // Failed re-arm revokes stale green state instead of leaving earlier marker active.
  await updateState(context, "preflight", wave, () => record)
  return { ...record, dispatchEnforcedBy: "native-host" }
}
export async function preflightCheck(context: GovernanceContext, root: string, wave: string) {
  const raw = await readState(context, "preflight", wave)
  requireValue(raw && typeof raw === "object", "PREFLIGHT_STATE_MISSING")
  const state = raw as { schema: number; projectID: string; root: string; wave: string; head: string; armed: boolean; checks: Capture; requiredChecks: string[] }
  requireValue(state.schema === 1 && state.projectID === context.projectID && state.root === root && state.wave === wave && typeof state.armed === "boolean", "PREFLIGHT_STATE_INVALID")
  validateCapture(state.checks, context.projectID)
  requireValue(Array.isArray(state.requiredChecks) && state.requiredChecks.length > 0 && state.requiredChecks.length <= 512 && new Set(state.requiredChecks).size === state.requiredChecks.length, "PREFLIGHT_REQUIRED_CHECKS_INVALID")
  const head = (await git(context, root, ["rev-parse", "HEAD"])).trim()
  const failures = [...(!state.armed ? ["PREFLIGHT_NOT_ARMED"] : []), ...(state.head !== head ? ["PREFLIGHT_HEAD_CHANGED"] : []),
    ...state.requiredChecks.flatMap((name) => {
      const check = state.checks.results.find((check) => check.name === name)
      if (!check) return [`PREFLIGHT_CHECK_MISSING: ${name}`]
      if (gitRevision(check.provenance) === undefined) return [`PREFLIGHT_CHECK_REVISION_UNAVAILABLE: ${name}`]
      if (gitRevision(check.provenance) !== state.head) return [`PREFLIGHT_CHECK_STALE: ${name}`]
      return check.status === "pass" ? [] : [`PREFLIGHT_CHECK_${check.status.toUpperCase()}: ${name}`]
    }),
  ]
  return { status: failures.length ? "FAIL" : "PASS", failures, baseline: state.head, dispatchEnforcedBy: "native-host" }
}
export async function preflightDisarm(context: GovernanceContext, wave: string) {
  await updateState(context, "preflight", wave, (current) => {
    requireValue(current && typeof current === "object", "PREFLIGHT_STATE_MISSING")
    return { ...current, armed: false }
  })
  return { wave, armed: false }
}
