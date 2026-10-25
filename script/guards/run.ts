#!/usr/bin/env bun
// Guard runner. Reads the rules and config from the merge-base with the target branch, never from the change under
// test, so a PR cannot relax its own guards. Only when the base has no rules yet (the PR that introduces the engine)
// does it read them from disk, and it says so. Applies them to the added lines and changed paths of the diff.
//
// Usage: bun run script/guards/run.ts [--base origin/dev] [--cwd <repo>] [--warn] [--json | --rules]
// --cwd is the checkout under test (default: the repo this script lives in), so CI can run the engine from the base
// branch against the change. --warn reports gate findings without failing; setup errors still fail.
// --json prints the report as one JSON document (see toJson) instead of text lines; the exit code is the same.
// --rules prints the rule list as JSON (see ruleView) and runs nothing. Both exist for the app's guardrail screen.
// Env: GUARDRAIL_BASE_REF (default origin/dev), GUARDRAIL_APPROVED (comma-separated changed-paths rule ids an
// approver has cleared, set by CI from a label).

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { readDiff, resolveBase, tryGit } from "./diff"
import { evaluate, type Config, type Finding } from "./engine"
import { expandSets, parseRule, selfCheck, type Rule } from "./rule"

const RULES_DIR = "script/guards/rules"
const CONFIG_FILE = "script/guards/config.toml"

export type Failure = "no-repository" | "base-not-found" | "no-rules" | "rules-invalid"

export type Report = {
  base: string | undefined
  bootstrap: boolean
  rules: number
  files: number
  findings: Finding[]
  errors: string[]
  // Why the run proved nothing; set exactly when `errors` is not empty.
  failure?: Failure
  // Rule ids an approver cleared for this run.
  approved: string[]
  // The change edits script/guards/**, so the rules shown are the base's and the edits apply after merge.
  touchesGuards: boolean
}

if (import.meta.main) {
  const warn = process.argv.includes("--warn")
  const cwd = path.resolve(flag("--cwd") ?? path.join(import.meta.dir, "..", ".."))
  const baseRef = flag("--base") ?? process.env.GUARDRAIL_BASE_REF ?? "origin/dev"
  if (process.argv.includes("--rules")) {
    const listed = listRules({ cwd, baseRef })
    console.log(JSON.stringify(listed))
    process.exit(listed.errors.length > 0 ? 1 : 0)
  }
  const report = runGuards({
    cwd,
    baseRef,
    approved: (process.env.GUARDRAIL_APPROVED ?? "").split(",").filter((id) => id.length > 0),
  })
  if (process.argv.includes("--json")) console.log(JSON.stringify(toJson(report)))
  else for (const line of format(report)) console.log(line)
  if (process.env.GITHUB_ACTIONS && !process.argv.includes("--json")) for (const finding of report.findings) console.log(annotation(finding, warn))
  process.exit(exitCode(report, warn))
}

export function exitCode(report: Report, warn: boolean) {
  if (report.errors.length > 0) return 1
  return !warn && report.findings.some((finding) => finding.severity === "gate") ? 1 : 0
}

// GitHub Actions workflow command: shows the finding on the PR's Files tab. A gate finding is an error unless --warn.
export function annotation(finding: Finding, warn: boolean) {
  const props = [`file=${finding.path}`, finding.line === undefined ? "" : `line=${finding.line}`, `title=guard ${finding.rule}`]
  const level = finding.severity === "gate" && !warn ? "error" : "warning"
  return `::${level} ${props.filter((prop) => prop.length > 0).join(",")}::${finding.message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`
}

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

export function runGuards(input: { cwd: string; baseRef: string; approved: string[] }): Report {
  const loaded = loadGuards(input.cwd, input.baseRef, input.approved)
  if ("error" in loaded) return loaded.error
  const diff = readDiff(input.cwd, loaded.base)
  return {
    base: loaded.base,
    bootstrap: loaded.bootstrap,
    rules: loaded.rules.length,
    files: diff.changes.length,
    findings: evaluate({ rules: loaded.rules, config: loaded.config, diff, approved: input.approved }),
    errors: [],
    approved: input.approved,
    touchesGuards: diff.changes.some((change) => change.path.startsWith("script/guards/") || change.from?.startsWith("script/guards/")),
  }
}

// Rules and config from the base, or from disk while the base has none (bootstrap). An error is a finished Report.
function loadGuards(cwd: string, baseRef: string, approved: string[]) {
  const stop = (base: string | undefined, bootstrap: boolean, failure: Failure, error: string) => ({
    error: { base, bootstrap, rules: 0, files: 0, findings: [], errors: [error], failure, approved, touchesGuards: false } satisfies Report,
  })
  if (tryGit(cwd, ["rev-parse", "--git-dir"]) === undefined) return stop(undefined, false, "no-repository", `${cwd} is not a git repository`)
  const base = resolveBase(cwd, baseRef)
  if (!base) return stop(undefined, false, "base-not-found", `cannot resolve a merge-base for ${baseRef}; fetch the target branch or pass --base`)
  const fromBase = tryGit(cwd, ["ls-tree", "-r", "--name-only", base, "--", RULES_DIR])
  const bootstrap = !fromBase || fromBase.trim().length === 0
  const source = bootstrap ? diskSource(cwd) : baseSource(cwd, base)
  // Checked before the config so an empty checkout reports the real problem.
  if (source.list().every((file) => !file.endsWith(".toml"))) return stop(base, bootstrap, "no-rules", `no rule files found under ${RULES_DIR}; refusing to pass`)
  const config = loadConfig(source)
  if (typeof config === "string") return stop(base, bootstrap, "rules-invalid", config)
  const rules = loadRules(source, config)
  if (typeof rules === "string") return stop(base, bootstrap, "rules-invalid", rules)
  return { base, bootstrap, config, rules }
}

// The report as the app reads it: absent values are null, errors carry their kind, findings are sorted gate first,
// then by path and line.
export function toJson(report: Report) {
  const order = (finding: Finding) => (finding.severity === "gate" ? 0 : 1)
  return {
    base: report.base ?? null,
    bootstrap: report.bootstrap,
    rules: report.rules,
    files: report.files,
    findings: report.findings
      .toSorted((a, b) => order(a) - order(b) || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0))
      .map((finding) => ({
        rule: finding.rule,
        severity: finding.severity,
        path: finding.path,
        line: finding.line ?? null,
        message: finding.message,
        excerpt: finding.excerpt ?? null,
        match: finding.match ?? null,
      })),
    errors: report.errors.map((message) => ({ kind: report.failure ?? "other", message })),
    approved: report.approved,
    touchesGuards: report.touchesGuards,
  }
}

// The rules a run on this checkout would apply, for a rule browser. A line rule is cleared by an ignore comment, a
// path rule by an approval label; a line-balance rule has neither, so only a fix clears it.
export function ruleView(rule: Rule) {
  return {
    id: rule.id,
    group: rule.group,
    severity: rule.severity,
    kind: rule.on,
    message: rule.message,
    summary: rule.summary ?? null,
    positive: rule.positive,
    negative: rule.negative,
    paths: rule.paths,
    clearedBy: rule.on === "added-lines" ? "ignore" : rule.on === "changed-paths" ? "approval" : "fix",
  }
}

export function listRules(input: { cwd: string; baseRef: string }) {
  const loaded = loadGuards(input.cwd, input.baseRef, [])
  if ("error" in loaded) return { rules: [], errors: toJson(loaded.error).errors }
  return { rules: loaded.rules.map(ruleView), errors: [] }
}

export function format(report: Report) {
  const head = report.bootstrap
    ? ["BOOTSTRAP: the base has no guard rules yet, so rules and config were read from this change. Once merged they are read from the base."]
    : []
  const body = report.findings.map((finding) => {
    const where = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`
    return `${finding.severity === "gate" ? "GATE" : "WARN"} ${where} [${finding.rule}] ${finding.message}`
  })
  const errors = report.errors.map((error) => `ERROR ${error}`)
  const gates = report.findings.filter((finding) => finding.severity === "gate").length
  return [
    ...head,
    ...body,
    ...errors,
    `guards: ${report.rules} rules, ${report.files} changed paths, ${gates} gate and ${report.findings.length - gates} warn findings, ${report.errors.length} errors.`,
  ]
}

type Source = { list: () => string[]; read: (file: string) => string | undefined }

// Every rule file and the config come out of the base in one `git cat-file --batch` call, not one spawn per file.
function baseSource(cwd: string, base: string): Source {
  const rules = (tryGit(cwd, ["ls-tree", "-r", "--name-only", base, "--", RULES_DIR]) ?? "")
    .split("\n")
    .filter((file) => file.length > 0)
  const blobs = readBlobs(cwd, base, [...rules, CONFIG_FILE])
  return { list: () => rules, read: (file) => blobs.get(file) }
}

// `git cat-file --batch` answers each `<rev>:<path>` with `<sha> blob <size>\n<content>\n`, or `<rev>:<path> missing\n`.
function readBlobs(cwd: string, base: string, files: string[]) {
  const result = Bun.spawnSync(["git", "-C", cwd, "cat-file", "--batch"], {
    stdin: Buffer.from(files.map((file) => `${base}:${file}`).join("\n") + "\n"),
  })
  const output = result.stdout
  const blobs = new Map<string, string>()
  let offset = 0
  for (const file of files) {
    const end = output.indexOf(10, offset)
    if (end < 0) break
    const header = output.subarray(offset, end).toString()
    offset = end + 1
    if (header.endsWith(" missing")) continue
    const size = Number(header.split(" ").at(-1))
    blobs.set(file, output.subarray(offset, offset + size).toString())
    offset += size + 1
  }
  return blobs
}

function diskSource(cwd: string): Source {
  return {
    list: () =>
      existsSync(path.join(cwd, RULES_DIR)) ? readdirSync(path.join(cwd, RULES_DIR)).map((name) => `${RULES_DIR}/${name}`) : [],
    read: (file) => readFileSync(path.join(cwd, file), "utf8"),
  }
}

// A gate that loaded nothing proves nothing, so zero rules is an error.
function loadRules(source: Source, config: Config): Rule[] | string {
  const files = source.list().filter((file) => file.endsWith(".toml"))
  if (files.length === 0) return `no rule files found under ${RULES_DIR}; refusing to pass`
  const parsed = files.map((file) => parseRule(path.basename(file), source.read(file) ?? ""))
  const expanded = parsed.map((entry) => (typeof entry === "string" ? entry : expandSets(entry, config.sets)))
  const errors = expanded.flatMap((entry) => (typeof entry === "string" ? [entry] : selfCheck(entry)))
  if (errors.length > 0) return errors.join("\n")
  return expanded.filter((entry): entry is Rule => typeof entry !== "string")
}

function loadConfig(source: Source): Config | string {
  const text = source.read(CONFIG_FILE)
  if (text === undefined) return `${CONFIG_FILE} not found`
  const raw = Bun.TOML.parse(text) as { generated?: unknown; exclude?: unknown; sets?: Record<string, unknown> }
  if (!isStrings(raw.generated) || !isStrings(raw.exclude)) return `${CONFIG_FILE}: generated and exclude must be lists of globs`
  const sets = Object.entries(raw.sets ?? {})
  if (!sets.every((entry): entry is [string, string[]] => isStrings(entry[1]))) return `${CONFIG_FILE}: every [sets] entry must be a list of globs`
  return { generated: raw.generated, exclude: raw.exclude, sets: Object.fromEntries(sets) }
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}
