// Source: governance/wave-txn.py. Selective optimistic recovery, never reset/clean or global atomic rollback.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { chmod, open, rename, unlink } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { type GovernanceContext, type Capture, requireValue, validateCapture, isSourceRevision } from "./contracts.ts"
import { readBoundedBytes, scopedPath, readState, updateState } from "./state.ts"
import { git, gitBytes, gitToplevel } from "./process.ts"

const digest = (value: string) => createHash("sha256").update(value).digest("hex")
async function contentDigest(file: string) {
  const raw = await readBoundedBytes(file, true)
  return raw === undefined ? digest("absent") : createHash("sha256").update("present\0").update(raw).digest("hex")
}
interface RecoveryFile { path: string; blob: string; executable: boolean }
interface RecoveryState { schema: 1; projectID: string; root: string; wave: string; baseline: string; files: RecoveryFile[] }
interface RecoveryPlan { schema: 1; projectID: string; wave: string; root: string; baseline: string; head: string; dirt: string; files: (RecoveryFile & { currentDigest: string })[] }
async function repositorySnapshot(context: GovernanceContext, root: string, ownedTemporary?: string) {
  const head = (await git(context, root, ["rev-parse", "HEAD"])).trim()
  requireValue(isSourceRevision(head), "RECOVERY_HEAD_ACQUISITION_INVALID")
  const rawStatus = await git(context, root, ["status", "--porcelain=v1", "--no-renames", "-z", "--untracked-files=all"])
  const status = rawStatus.split("\0").filter((row) => !ownedTemporary || row !== `?? ${ownedTemporary}`).join("\0")
  const worktree = await git(context, root, ["diff", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--"])
  const index = await git(context, root, ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--"])
  requireValue((await git(context, root, ["rev-parse", "HEAD"])).trim() === head, "RECOVERY_HEAD_CHANGED_DURING_ACQUISITION")
  return { head, dirt: digest(JSON.stringify({ status, worktree, index })) }
}
function validateState(value: unknown, context: GovernanceContext, root: string, wave: string): RecoveryState {
  requireValue(value && typeof value === "object", "RECOVERY_STATE_MISSING")
  const state = value as RecoveryState
  requireValue(state.schema === 1 && state.projectID === context.projectID && state.root === root && state.wave === wave && isSourceRevision(state.baseline), "RECOVERY_STATE_INVALID")
  requireValue(Array.isArray(state.files) && state.files.length > 0 && state.files.length <= 128 && new Set(state.files.map((file) => file.path)).size === state.files.length, "RECOVERY_OWNERSHIP_EMPTY_OR_INVALID")
  state.files.forEach((file) => requireValue(typeof file.path === "string" && isSourceRevision(file.blob) && typeof file.executable === "boolean", "RECOVERY_FILE_INVALID"))
  return state
}
export async function recoveryBegin(context: GovernanceContext, root: string, wave: string, ownedPaths: readonly string[]) {
  requireValue(await gitToplevel(context, root) === root, "RECOVERY_REQUIRES_REPOSITORY_ROOT")
  requireValue(ownedPaths.length > 0 && ownedPaths.length <= 128 && new Set(ownedPaths).size === ownedPaths.length, "RECOVERY_OWNERSHIP_EMPTY_OR_DUPLICATE")
  const snapshot = await repositorySnapshot(context, root)
  const files = await Promise.all(ownedPaths.map(async (path) => {
    requireValue(!path.split("/").some((part) => part.toLowerCase() === ".git") && !path.startsWith("/"), "RECOVERY_GIT_METADATA_DENIED")
    const file = await scopedPath(root, path)
    await context.authorize({ effect: "read", paths: [file], commands: [] })
    const tree = await git(context, root, ["ls-tree", "-z", snapshot.head, "--", path])
    const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/.exec(tree)
    requireValue(match && match[3] === path, `RECOVERY_NOT_COMMITTED_REGULAR_FILE: ${path}`)
    const dirt = await git(context, root, ["status", "--porcelain=v1", "-z", "--", path])
    requireValue(!dirt, `RECOVERY_BASELINE_OWNED_FILE_DIRTY: ${path}`)
    return { path, blob: match[2], executable: match[1] === "100755" }
  }))
  const after = await repositorySnapshot(context, root)
  requireValue(snapshot.head === after.head && snapshot.dirt === after.dirt, "RECOVERY_BASELINE_CHANGED_DURING_ACQUISITION")
  const state: RecoveryState = { schema: 1, projectID: context.projectID, root, wave, baseline: snapshot.head, files }
  await updateState(context, "recovery", wave, (existing) => { requireValue(existing === undefined, "RECOVERY_ALREADY_BEGUN"); return state })
  return { ...state, globalAtomicTransaction: false, externalEffectsReversible: false }
}
export async function recoveryPrepare(context: GovernanceContext, root: string, wave: string) {
  const state = validateState(await readState(context, "recovery", wave), context, root, wave)
  const before = await repositorySnapshot(context, root)
  const files = await Promise.all(state.files.map(async (file) => {
    const target = await scopedPath(root, file.path)
    await context.authorize({ effect: "read", paths: [target], commands: [] })
    return { ...file, currentDigest: await contentDigest(target) }
  }))
  const after = await repositorySnapshot(context, root)
  requireValue(before.head === after.head && before.dirt === after.dirt, "RECOVERY_CHANGED_DURING_ACQUISITION")
  const plan: RecoveryPlan = { schema: 1, projectID: context.projectID, wave, root, baseline: state.baseline, head: before.head, dirt: before.dirt, files }
  const token = `restore-${digest(JSON.stringify(plan)).slice(0, 32)}`
  await updateState(context, "recovery-plan", token, () => plan)
  return { token, ...plan, kind: "proposal", requires: ["explicit-restore-intent", "native-edit-and-process-authority", "HEAD-and-dirt-recheck"], executed: false }
}
export async function recoveryRestore(context: GovernanceContext, root: string, token: string) {
  const raw = await readState(context, "recovery-plan", token)
  requireValue(raw && typeof raw === "object", "RECOVERY_PLAN_MISSING")
  const plan = raw as RecoveryPlan
  const state = validateState(await readState(context, "recovery", plan.wave), context, root, plan.wave)
  requireValue(plan.projectID === context.projectID && plan.root === root && plan.baseline === state.baseline && isSourceRevision(plan.head) && /^[a-f0-9]{64}$/.test(plan.dirt), "RECOVERY_PLAN_INVALID")
  requireValue(plan.files.length === state.files.length && plan.files.every((file, index) => file.path === state.files[index].path && file.blob === state.files[index].blob && file.executable === state.files[index].executable && /^[a-f0-9]{64}$/.test(file.currentDigest)), "RECOVERY_PLAN_OWNERSHIP_MISMATCH")
  const targets = await Promise.all(plan.files.map((file) => scopedPath(root, file.path)))
  await context.authorize({ effect: "write", paths: targets, commands: [] })
  // Reading committed blobs requires native process authority. No filters, checkout hooks or index writes.
  const blobs = await Promise.all(plan.files.map((file) => gitBytes(context, root, ["cat-file", "blob", file.blob])))
  const snapshot = await repositorySnapshot(context, root)
  requireValue(snapshot.head === plan.head && snapshot.dirt === plan.dirt, "RECOVERY_CONCURRENT_HEAD_OR_DIRT_CHANGED")
  await Promise.all(targets.map(async (target, index) => {
    await scopedPath(root, plan.files[index].path)
    requireValue(await contentDigest(target) === plan.files[index].currentDigest, `RECOVERY_OWNED_FILE_CHANGED: ${plan.files[index].path}`)
  }))
  const restored: string[] = []
  const expected = { head: snapshot.head, dirt: snapshot.dirt }
  return plan.files.reduce(async (previous, file, index) => {
    await previous
    requireValue((await git(context, root, ["rev-parse", "HEAD"])).trim() === plan.head, "RECOVERY_CONCURRENT_HEAD_CHANGED")
    await scopedPath(root, file.path)
    requireValue(await contentDigest(targets[index]) === file.currentDigest, `RECOVERY_OWNED_FILE_CHANGED: ${file.path}`)
    const temporary = join(dirname(targets[index]), `.maestro-restore-${randomUUID()}.tmp`)
    await context.authorize({ effect: "write", paths: [temporary, targets[index]], commands: [] })
    // Recheck after permission callbacks, which can await operator interaction.
    const recheck = await repositorySnapshot(context, root)
    requireValue(recheck.head === expected.head && recheck.dirt === expected.dirt, "RECOVERY_CONCURRENT_HEAD_OR_DIRT_CHANGED")
    requireValue(await contentDigest(targets[index]) === file.currentDigest, `RECOVERY_OWNED_FILE_CHANGED: ${file.path}`)
    const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, file.executable ? 0o755 : 0o644)
    await Promise.resolve().then(async () => {
      await output.writeFile(blobs[index]).then(() => output.sync()).finally(() => output.close())
      await chmod(temporary, file.executable ? 0o755 : 0o644)
      await scopedPath(root, file.path)
      const finalCheck = await repositorySnapshot(context, root, relative(root, temporary))
      requireValue(finalCheck.head === expected.head && finalCheck.dirt === expected.dirt, "RECOVERY_CONCURRENT_HEAD_OR_DIRT_CHANGED")
      requireValue(await contentDigest(targets[index]) === file.currentDigest, `RECOVERY_OWNED_FILE_CHANGED: ${file.path}`)
      await rename(temporary, targets[index])
    }).finally(() => unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error }))
    restored.push(file.path)
    const next = await repositorySnapshot(context, root)
    requireValue(next.head === plan.head, "RECOVERY_CONCURRENT_HEAD_CHANGED_AFTER_RESTORE")
    expected.dirt = next.dirt
  }, Promise.resolve()).then(() => ({ status: "RESTORED_OWNED_FILES", restored, baseline: plan.baseline, headUnchanged: true, indexRestored: false, globalAtomicTransaction: false, externalEffectsReversed: false, concurrency: "optimistic-rechecks; host must serialize edits for exclusive recovery" }))
}
export function recoveryReplay(projectID: string, requiredChecks: readonly string[], observations: Capture) {
  validateCapture(observations, projectID)
  requireValue(requiredChecks.length > 0 && requiredChecks.length <= 512 && new Set(requiredChecks).size === requiredChecks.length, "RECOVERY_REQUIRED_CHECKS_EMPTY_OR_INVALID")
  const retry = requiredChecks.filter((name) => observations.results.find((result) => result.name === name)?.status !== "pass")
  return { retryChecks: retry, preservedGreen: requiredChecks.filter((name) => !retry.includes(name)), evidence: "actual-host-check-records", advice: true, dispatched: false }
}
