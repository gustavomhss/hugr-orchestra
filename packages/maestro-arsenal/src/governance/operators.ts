// Explicit native-authorized operator adaptations of release.sh, github-ruleset.sh and changelog-bump.py.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
// Request data describes intent; only ArsenalContext.authorize can grant authority. No retries or cloud calls in plan paths.
import type { ArsenalContext } from "../contract.ts"
import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { open, rename, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { id, isSourceRevision, requireValue } from "./contracts.ts"
import { readBounded, readBoundedBytes, scopedPath, sourceRoot } from "./state.ts"
import { git, gitBytes, processOutput, requireGitRoot } from "./process.ts"
import { changelogProposal, rulesetProposal } from "./repository.ts"
export interface OperatorRequest {
  readonly requestID: string
  readonly action: "run-release-recipe" | "apply-ruleset" | "write-changelog"
  readonly expectedHead: string
}
const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
async function requireOperator(context: ArsenalContext, root: string, request: OperatorRequest, action: OperatorRequest["action"]) {
  requireValue(request && typeof request === "object", "OPERATOR_REQUEST_MISSING")
  id(request.requestID)
  requireValue(request.action === action && isSourceRevision(request.expectedHead), "OPERATOR_REQUEST_INVALID")
  await requireGitRoot(context, root)
  requireValue((await git(context, root, ["rev-parse", "HEAD"])).trim() === request.expectedHead, "OPERATOR_HEAD_CHANGED")
}
export async function runRelease(context: ArsenalContext, options: {
  readonly operatorRequest: OperatorRequest; readonly recipePath: string; readonly recipeDigest: string
  readonly tag: string; readonly recipeArgs?: readonly string[]; readonly branch?: string
}) {
  const root = await sourceRoot(context)
  await requireOperator(context, root, options.operatorRequest, "run-release-recipe")
  const recipe = await scopedPath(root, options.recipePath)
  requireValue(!options.recipePath.startsWith("/") && !options.recipePath.split("/").includes(".git"), "RELEASE_RECIPE_PATH_INVALID")
  requireValue(/^[a-f0-9]{64}$/.test(options.recipeDigest), "RELEASE_RECIPE_DIGEST_INVALID")
  requireValue(/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(options.tag), "RELEASE_TAG_INVALID")
  const branch = options.branch ?? "dev"
  requireValue((await git(context, root, ["branch", "--show-current"])).trim() === branch, "RELEASE_BRANCH_MISMATCH")
  requireValue(!(await git(context, root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])), "RELEASE_DIRTY_TREE")
  requireValue(!(await git(context, root, ["tag", "--list", options.tag])).trim(), "RELEASE_TAG_EXISTS")
  await context.authorize({ effect: "read", paths: [recipe], commands: [] })
  const tree = await git(context, root, ["ls-tree", "-z", options.operatorRequest.expectedHead, "--", options.recipePath])
  const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/.exec(tree)
  requireValue(match && match[3] === options.recipePath, "RELEASE_RECIPE_NOT_COMMITTED")
  const bytes = (await readBoundedBytes(recipe))!
  requireValue(digest(bytes) === options.recipeDigest, "RELEASE_RECIPE_CHANGED")
  requireValue(bytes.equals(await gitBytes(context, root, ["cat-file", "blob", match[2]])), "RELEASE_RECIPE_DIFFERS_FROM_COMMITTED_POLICY")
  const argv = ["bash", "--", recipe, ...(options.recipeArgs ?? [])]
  requireValue(argv.length <= 516 && argv.every((arg) => typeof arg === "string" && arg.length <= 4096 && !arg.includes("\0")), "RELEASE_RECIPE_ARGUMENTS_INVALID")
  // Recipes can tag/publish; request the real write/process authorities before invoking them.
  await context.authorize({ effect: "write", paths: [root], commands: [] })
  await processOutput(context, root, argv, undefined, async () => {
    await requireOperator(context, root, options.operatorRequest, "run-release-recipe")
    await scopedPath(root, options.recipePath)
    requireValue(digest((await readBoundedBytes(recipe))!) === options.recipeDigest, "RELEASE_RECIPE_CHANGED_AFTER_AUTHORIZATION")
    requireValue(!(await git(context, root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])), "RELEASE_DIRTY_TREE")
    requireValue(!(await git(context, root, ["tag", "--list", options.tag])).trim(), "RELEASE_TAG_EXISTS")
  })
  const tagObject = (await git(context, root, ["rev-parse", "--verify", `refs/tags/${options.tag}`])).trim()
  const target = (await git(context, root, ["rev-parse", "--verify", `refs/tags/${options.tag}^{commit}`])).trim()
  requireValue(target === options.operatorRequest.expectedHead && (await git(context, root, ["cat-file", "-t", tagObject])).trim() === "tag", "RELEASE_RECIPE_TAG_POSTCONDITION_FAILED")
  return { status: "EXECUTED", executed: true, requestID: options.operatorRequest.requestID, recipePath: options.recipePath,
    recipeDigest: options.recipeDigest, tag: options.tag, tagObject, target, localTagVerified: true,
    externalPublication: "unknown; repository recipe receipts remain authoritative", rollbackClaim: false }
}
export function verifyRulesetReceipt(raw: unknown, body: ReturnType<typeof rulesetProposal>["body"]) {
  requireValue(raw && typeof raw === "object", "RULESET_API_RECEIPT_INVALID")
  const receipt = raw as Record<string, unknown>
  requireValue(Number.isSafeInteger(receipt.id) && Number(receipt.id) > 0, "RULESET_API_RECEIPT_INVALID")
  const contains = (expected: unknown, actual: unknown): boolean => {
    if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((value, index) => contains(value, actual[index]))
    if (expected && typeof expected === "object") return Boolean(actual && typeof actual === "object" && Object.entries(expected).every(([key, value]) => contains(value, (actual as Record<string, unknown>)[key])))
    return expected === actual
  }
  requireValue(contains({ name: body.name, target: body.target, enforcement: body.enforcement, conditions: body.conditions }, receipt), "RULESET_API_SCOPE_MISMATCH")
  requireValue(Array.isArray(receipt.rules) && receipt.rules.length > 0, "RULESET_API_RULES_MISSING")
  body.rules.forEach((expected) => requireValue((receipt.rules as unknown[]).some((actual) => contains(expected, actual)), `RULESET_API_RULE_MISSING: ${expected.type}`))
  return receipt
}
export async function runRuleset(context: ArsenalContext, options: {
  readonly operatorRequest: OperatorRequest; readonly repository: string; readonly branch?: string; readonly requiredStatusChecks?: readonly string[]
}) {
  const root = await sourceRoot(context)
  await requireOperator(context, root, options.operatorRequest, "apply-ruleset")
  const proposal = rulesetProposal(options.repository, options.branch, options.requiredStatusChecks)
  const response = await processOutput(context, root, ["gh", "api", "--method", "POST", proposal.endpoint, "-H", "Accept: application/vnd.github+json", "--input", "-"], JSON.stringify(proposal.body),
    () => requireOperator(context, root, options.operatorRequest, "apply-ruleset"))
  const decode = () => {
    try { return JSON.parse(response) as unknown }
    catch { throw new Error("RULESET_API_JSON_INVALID") }
  }
  const receipt = verifyRulesetReceipt(decode(), proposal.body)
  return { status: "EXECUTED", executed: true, requestID: options.operatorRequest.requestID, repository: options.repository, rulesetID: receipt.id,
    response: receipt, externalMutation: true, rollbackClaim: false }
}
export async function writeChangelog(context: ArsenalContext, options: {
  readonly operatorRequest: OperatorRequest; readonly changelogPath: string; readonly expectedDigest: string
  readonly version: string; readonly title: string; readonly date: string
}) {
  const root = await sourceRoot(context)
  await requireOperator(context, root, options.operatorRequest, "write-changelog")
  const file = await scopedPath(root, options.changelogPath)
  await context.authorize({ effect: "read", paths: [file], commands: [] })
  const current = (await readBounded(file))!
  requireValue(digest(current) === options.expectedDigest, "CHANGELOG_CHANGED")
  const proposal = changelogProposal(options.version, options.title, options.date)
  const sections = current.split("\n")
  requireValue(!sections.some((line) => line.startsWith(`## [${options.version}]`)), "CHANGELOG_VERSION_ALREADY_EXISTS")
  const position = sections.findIndex((line) => line.startsWith("## ["))
  const next = position === -1 ? `${current}${current.endsWith("\n") ? "" : "\n"}${proposal.entry}` : [...sections.slice(0, position), proposal.entry.trimEnd(), "", ...sections.slice(position)].join("\n")
  const temporary = join(dirname(file), `.maestro-changelog-${randomUUID()}.tmp`)
  await context.authorize({ effect: "write", paths: [file, temporary], commands: [] })
  await requireOperator(context, root, options.operatorRequest, "write-changelog")
  await scopedPath(root, options.changelogPath)
  requireValue(digest((await readBounded(file))!) === options.expectedDigest, "CHANGELOG_CHANGED_AFTER_AUTHORIZATION")
  const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644)
  await Promise.resolve().then(async () => {
    await output.writeFile(next).then(() => output.sync()).finally(() => output.close())
    await scopedPath(root, options.changelogPath)
    requireValue(digest((await readBounded(file))!) === options.expectedDigest, "CHANGELOG_CONCURRENT_EDIT")
    await rename(temporary, file)
  }).finally(() => unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error }))
  requireValue((await readBounded(file)) === next, "CHANGELOG_WRITE_POSTCONDITION_FAILED")
  return { status: "WRITTEN", written: true, requestID: options.operatorRequest.requestID, version: options.version, digest: digest(next), curated: false }
}
