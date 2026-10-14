// Sources: change-budget.py, ci-select.py, changelog-{check,bump}.py, loc-cap.sh, wave-metrics.py, release.sh, github-ruleset.sh.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { isAbsolute, relative } from "node:path"
import { type GovernanceContext, type Capture, requireValue, validateCapture, isSourceRevision, gitRevision } from "./contracts.ts"
import { readBounded, scopedPath } from "./state.ts"
import { git, requireGitRoot } from "./process.ts"

export async function changedFiles(context: GovernanceContext, root: string, base = "dev") {
  await requireGitRoot(context, root)
  requireValue(/^[A-Za-z0-9][A-Za-z0-9_./-]{0,127}$/.test(base) && !base.includes(".."), "GIT_BASE_INVALID")
  const baseSHA = (await git(context, root, ["rev-parse", "--verify", `${base}^{commit}`])).trim()
  requireValue(isSourceRevision(baseSHA), "GIT_BASE_ACQUISITION_INVALID")
  const mergeBase = (await git(context, root, ["merge-base", baseSHA, "HEAD"])).trim()
  const raw = await git(context, root, ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z", "--no-renames", mergeBase, "--"])
  const rows = raw.split("\0").filter(Boolean).map((line) => {
    const first = line.indexOf("\t")
    const second = line.indexOf("\t", first + 1)
    requireValue(first > 0 && second > first, "GIT_NUMSTAT_MALFORMED")
    const added = line.slice(0, first)
    const deleted = line.slice(first + 1, second)
    requireValue((/^\d+$/.test(added) && /^\d+$/.test(deleted)) || (added === "-" && deleted === "-"), "GIT_NUMSTAT_MALFORMED")
    return { path: line.slice(second + 1), added: added === "-" ? null : Number(added), deleted: deleted === "-" ? null : Number(deleted), untracked: false }
  })
  const untracked = (await git(context, root, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean)
  requireValue(rows.length + untracked.length <= 2048, "GIT_CHANGE_OVERFLOW")
  const additions = await Promise.all(untracked.map(async (path) => {
    const file = await scopedPath(root, path)
    await context.authorize({ effect: "read", paths: [file], commands: [] })
    const raw = (await readBounded(file))!
    const binary = raw.includes("\0")
    return { path, added: binary ? null : raw.length ? raw.split("\n").length - Number(raw.endsWith("\n")) : 0, deleted: binary ? null : 0, untracked: true }
  }))
  return { base, baseSHA, mergeBase, files: [...rows, ...additions].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) }
}

export async function changeBudget(context: GovernanceContext, root: string, options: { base?: string; soft?: number; hard?: number; reviewerCap?: number; excludedPaths?: string[] }) {
  const soft = options.soft ?? 200
  const hard = options.hard ?? 400
  const cap = options.reviewerCap ?? 400
  requireValue([soft, hard, cap].every((value) => Number.isSafeInteger(value) && value > 0) && soft <= hard, "CHANGE_BUDGET_INVALID")
  const diff = await changedFiles(context, root, options.base)
  const explicit = options.excludedPaths ?? []
  requireValue(explicit.every((path) => diff.files.some((file) => file.path === path)), "CHANGE_BUDGET_STALE_EXCLUSION")
  // Source's documented non-code categories, reported as actual excluded paths rather than hidden waiver.
  const sourceExcluded = diff.files.filter((file) => /(^|\/)(node_modules|dist|build|target|\.venv|vendor|__pycache__|_gen)\/|\.generated\.|\.min\.(js|css)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock)$|\.(md|mdx|txt|lock)$/.test(file.path)).map((file) => file.path)
  const excluded = [...new Set([...sourceExcluded, ...explicit])].sort()
  const code = diff.files.filter((file) => !excluded.includes(file.path))
  const unknown = code.filter((file) => file.added === null).map((file) => `BINARY_CHANGE_UNMEASURED: ${file.path}`)
  const total = code.reduce((total, file) => total + (file.added ?? 0) + (file.deleted ?? 0), 0)
  const partitions: { paths: string[]; lines: number; oversized: boolean }[] = []
  code.toSorted((a, b) => (b.added ?? 0) + (b.deleted ?? 0) - (a.added ?? 0) - (a.deleted ?? 0)).forEach((file) => {
    const lines = (file.added ?? 0) + (file.deleted ?? 0)
    const current = partitions.at(-1)
    if (current && current.lines + lines <= cap) { current.paths.push(file.path); current.lines += lines; return }
    partitions.push({ paths: [file.path], lines, oversized: lines > cap })
  })
  return { ...diff, codeLines: total, excludedPaths: excluded, exclusions: excluded.map((path) => ({ path, reason: explicit.includes(path) ? "operator-explicit" : "source-non-code-category" })), status: unknown.length ? "HOLD" : total > hard ? "FAIL" : total > soft ? "SOFT_LIMIT" : "PASS", failures: unknown, soft, hard, reviewerCap: cap, reviewerPartitions: partitions }
}

export function selectCI(files: readonly string[], groups: readonly { prefix: string; group: string }[], universal: readonly string[]) {
  requireValue(groups.length > 0 && groups.length <= 128 && universal.length > 0 && universal.length <= 128, "CI_RULES_OR_UNIVERSAL_EMPTY")
  requireValue(groups.every((rule) => rule.prefix.length > 0 && rule.group.length > 0 && !isAbsolute(rule.prefix) && !rule.prefix.split("/").includes("..")), "CI_RULE_INVALID")
  if (!files.length) return { selection: "FULL", groups: [], universal, reasons: ["NO_CHANGED_FILES: full verification"] }
  const selected = new Set<string>()
  const full: string[] = []
  files.forEach((file) => {
    if (/(^|\/)(package\.json|[^/]*lock[^/]*|tsconfig[^/]*\.json|Cargo\.toml)$/.test(file) || file.startsWith(".github/") || file.startsWith(".githooks/") || file.startsWith("script/")) { full.push(`HARNESS_OR_DEPENDENCY: ${file}`); return }
    const matches = groups.filter((rule) => file === rule.prefix || file.startsWith(rule.prefix.endsWith("/") ? rule.prefix : `${rule.prefix}/`))
    if (matches.length) { matches.forEach((rule) => selected.add(rule.group)); return }
    if (/\.(md|mdx|txt|html|svg|png|jpg|jpeg|gif)$/.test(file) || file.startsWith("docs/")) return
    full.push(`UNMATCHED_PATH: ${file}`)
  })
  return { selection: full.length ? "FULL" : selected.size ? "SCOPED" : "UNIVERSAL_ONLY", groups: [...selected].sort(), universal, reasons: full, authoritativeReleaseRequires: "FULL" }
}

export async function metrics(context: GovernanceContext, root: string, paths: readonly string[], threshold = 400) {
  requireValue(paths.length > 0 && paths.length <= 2048 && new Set(paths).size === paths.length, "METRICS_PATHS_EMPTY_OR_INVALID")
  requireValue(Number.isSafeInteger(threshold) && threshold > 0, "LOC_THRESHOLD_INVALID")
  const files = await Promise.all(paths.map(async (path) => {
    const file = await scopedPath(root, path)
    await context.authorize({ effect: "read", paths: [file], commands: [] })
    const raw = (await readBounded(file))!
    requireValue(!raw.includes("\0"), `METRICS_BINARY_FILE: ${path}`)
    return { path, loc: raw.length ? raw.split("\n").length - Number(raw.endsWith("\n")) : 0 }
  }))
  return { scope: "explicit-paths", completeForRequestedPaths: true, files, totalLoc: files.reduce((total, file) => total + file.loc, 0), biggest: files.toSorted((a, b) => b.loc - a.loc)[0], overThreshold: files.filter((file) => file.loc > threshold), threshold }
}

export function metricsReport(baseline: { files: readonly { path: string; loc: number }[] }, final: { files: readonly { path: string; loc: number }[] }) {
  requireValue(baseline.files.length > 0 && final.files.length > 0, "METRICS_CAPTURE_EMPTY")
  ;[baseline, final].forEach((capture) => requireValue(capture.files.length <= 2048 && new Set(capture.files.map((file) => file.path)).size === capture.files.length && capture.files.every((file) => Number.isSafeInteger(file.loc) && file.loc >= 0), "METRICS_CAPTURE_INVALID"))
  const before = baseline.files.reduce((sum, file) => sum + file.loc, 0)
  const after = final.files.reduce((sum, file) => sum + file.loc, 0)
  return { baselineLOC: before, finalLOC: after, deltaLOC: after - before, reductionPercent: before ? (before - after) / before * 100 : null, scope: "supplied-metric-captures", correctnessClaim: false }
}

export async function changelog(context: GovernanceContext, root: string, packagePath: string, changelogPath: string) {
  const paths = await Promise.all([packagePath, changelogPath].map((path) => scopedPath(root, path)))
  await context.authorize({ effect: "read", paths, commands: [] })
  const pkg = JSON.parse((await readBounded(paths[0]))!) as { version?: unknown }
  requireValue(typeof pkg.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version), "PACKAGE_VERSION_MISSING_OR_INVALID")
  const raw = (await readBounded(paths[1]))!
  const sections = raw.split(/^## \[/m)
  requireValue(sections.length > 1, "CHANGELOG_SECTION_MISSING")
  const top = /^([^\]]+)\][^\n]*\n([\s\S]*)$/.exec(sections[1])
  requireValue(top, "CHANGELOG_SECTION_INVALID")
  const failures = [
    ...(top[1] !== pkg.version ? ["CHANGELOG_VERSION_MISMATCH"] : []),
    ...(!top[2].trim() || top[2].includes("_TODO: curate") ? ["CHANGELOG_UNCURATED"] : []),
  ]
  return { status: failures.length ? "FAIL" : "PASS", failures, packageVersion: pkg.version, changelogVersion: top[1] }
}
export function changelogProposal(version: string, title: string, date: string) {
  requireValue(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) && /^\d{4}-\d{2}-\d{2}$/.test(date) && title.length > 0 && !title.includes("\n"), "CHANGELOG_PROPOSAL_INVALID")
  return { kind: "proposal", entry: `## [${version}] — ${date} — ${title}\n- _TODO: curate this release entry by hand._\n\n`, curated: false, written: false }
}

export async function releaseProposal(context: GovernanceContext, root: string, options: { packagePath: string; changelogPath: string; checks: Capture; requiredChecks: string[]; branch?: string }) {
  await requireGitRoot(context, root)
  const branch = options.branch ?? "dev"
  requireValue(/^[A-Za-z0-9][A-Za-z0-9_/-]{0,127}$/.test(branch) && !branch.includes(".."), "RELEASE_BRANCH_INVALID")
  validateCapture(options.checks, context.projectID)
  requireValue(options.requiredChecks.length > 0 && new Set(options.requiredChecks).size === options.requiredChecks.length, "RELEASE_REQUIRED_CHECKS_EMPTY_OR_DUPLICATE")
  const entry = await changelog(context, root, options.packagePath, options.changelogPath)
  const head = (await git(context, root, ["rev-parse", "HEAD"])).trim()
  const current = (await git(context, root, ["branch", "--show-current"])).trim()
  const dirt = await git(context, root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  const tags = (await git(context, root, ["tag", "--list", `v${entry.packageVersion}`])).trim()
  const failures = [...entry.failures, ...(dirt ? ["RELEASE_DIRTY_TREE"] : []), ...(current !== branch ? ["RELEASE_BRANCH_MISMATCH"] : []), ...(tags ? ["RELEASE_TAG_EXISTS"] : []),
    ...options.requiredChecks.flatMap((name) => {
      const result = options.checks.results.find((result) => result.name === name)
      if (!result) return [`RELEASE_CHECK_MISSING: ${name}`]
      if (gitRevision(result.provenance) === undefined) return [`RELEASE_CHECK_REVISION_UNAVAILABLE: ${name}`]
      if (gitRevision(result.provenance) !== head) return [`RELEASE_CHECK_STALE: ${name}`]
      return result.status === "pass" ? [] : [`RELEASE_CHECK_${result.status.toUpperCase()}: ${name}`]
    }),
  ]
  return { kind: "proposal", status: failures.length ? "FAIL" : "LOCAL_READY", failures, head, branch, tag: `v${entry.packageVersion}`,
    proposedCommands: [["git", "tag", "-a", `v${entry.packageVersion}`, head, "-m", `v${entry.packageVersion}`]],
    externalHolds: ["REMOTE_TAG_EXISTENCE_NOT_ACQUIRED", "PUBLISH_REQUIRES_EXPLICIT_NATIVE_INTENT"], executed: false,
  }
}

export function rulesetProposal(repository: string, branch = "dev", requiredStatusChecks: readonly string[] = []) {
  requireValue(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) && !repository.includes(".."), "RULESET_REPOSITORY_INVALID")
  requireValue(/^[A-Za-z0-9][A-Za-z0-9_/-]{0,127}$/.test(branch) && !branch.includes(".."), "RULESET_BRANCH_INVALID")
  requireValue(requiredStatusChecks.length <= 128 && requiredStatusChecks.every((name) => name.length > 0), "RULESET_CHECKS_INVALID")
  return { kind: "proposal", repository, endpoint: `repos/${repository}/rulesets`, method: "POST", executed: false,
    body: { name: `maestro-${branch}`, target: "branch", enforcement: "active", conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
      rules: [
        { type: "deletion" }, { type: "non_fast_forward" }, { type: "required_linear_history" },
        { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: true, required_review_thread_resolution: true, allowed_merge_methods: ["squash"] } },
        ...(requiredStatusChecks.length ? [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: requiredStatusChecks.map((context) => ({ context })) } }] : []),
      ],
    }, bindingRequired: ["operator-requested-intent", "native-process-and-network-authorization", "actual-API-response"],
  }
}

export async function commitlint(context: GovernanceContext, root: string, base = "dev") {
  const changes = await changedFiles(context, root, base)
  const messages = (await git(context, root, ["log", "--format=%H%x00%B%x00", `${changes.mergeBase}..HEAD`])).split("\0")
  const failures: string[] = []
  const commits: { sha: string; subject: string }[] = []
  for (let index = 0; index + 1 < messages.length; index += 2) {
    const sha = messages[index].trim()
    const subject = messages[index + 1].split("\n")[0]
    requireValue(isSourceRevision(sha), "COMMIT_ACQUISITION_MALFORMED")
    commits.push({ sha, subject })
    if (!/^(feat|fix|docs|chore|refactor|test)(\([^)\n]+\))?!?: \S.+$/.test(subject)) failures.push(`COMMIT_MESSAGE_INVALID: ${sha}`)
  }
  return { status: commits.length ? failures.length ? "FAIL" : "PASS" : "HOLD", failures: commits.length ? failures : ["COMMIT_RANGE_EMPTY"], commits }
}
