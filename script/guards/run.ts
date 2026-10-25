#!/usr/bin/env bun
// Guard runner. Reads the rules and config from the merge-base with the target branch, never from the change under
// test, so a PR cannot relax its own guards. Only when the base has no rules yet (the PR that introduces the engine)
// does it read them from disk, and it says so. Applies them to the added lines and changed paths of the diff.
//
// Usage: bun run script/guards/run.ts [--base origin/dev]
// Env: GUARDRAIL_BASE_REF (default origin/dev), GUARDRAIL_APPROVED (comma-separated changed-paths rule ids an
// approver has cleared, set by CI from a label).

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { readDiff, resolveBase, tryGit } from "./diff"
import { evaluate, type Config, type Finding } from "./engine"
import { parseRule, selfCheck, type Rule } from "./rule"

const RULES_DIR = "script/guards/rules"
const CONFIG_FILE = "script/guards/config.toml"

export type Report = {
  base: string | undefined
  bootstrap: boolean
  rules: number
  files: number
  findings: Finding[]
  errors: string[]
}

if (import.meta.main) {
  const baseFlag = process.argv.indexOf("--base")
  const report = runGuards({
    cwd: path.resolve(import.meta.dir, "..", ".."),
    baseRef: (baseFlag >= 0 ? process.argv[baseFlag + 1] : undefined) ?? process.env.GUARDRAIL_BASE_REF ?? "origin/dev",
    approved: (process.env.GUARDRAIL_APPROVED ?? "").split(",").filter((id) => id.length > 0),
  })
  for (const line of format(report)) console.log(line)
  process.exit(report.errors.length > 0 || report.findings.some((finding) => finding.severity === "gate") ? 1 : 0)
}

export function runGuards(input: { cwd: string; baseRef: string; approved: string[] }): Report {
  const base = resolveBase(input.cwd, input.baseRef)
  if (!base) {
    return fail(undefined, false, `cannot resolve a merge-base for ${input.baseRef}; fetch the target branch or pass --base`)
  }
  const fromBase = tryGit(input.cwd, ["ls-tree", "-r", "--name-only", base, "--", RULES_DIR])
  const bootstrap = !fromBase || fromBase.trim().length === 0
  const source = bootstrap ? diskSource(input.cwd) : baseSource(input.cwd, base)
  const loaded = loadRules(source)
  if (typeof loaded === "string") return fail(base, bootstrap, loaded)
  const config = loadConfig(source)
  if (typeof config === "string") return fail(base, bootstrap, config)
  const diff = readDiff(input.cwd, base)
  return {
    base,
    bootstrap,
    rules: loaded.length,
    files: diff.changes.length,
    findings: evaluate({ rules: loaded, config, diff, approved: input.approved }),
    errors: [],
  }
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
function loadRules(source: Source): Rule[] | string {
  const files = source.list().filter((file) => file.endsWith(".toml"))
  if (files.length === 0) return `no rule files found under ${RULES_DIR}; refusing to pass`
  const parsed = files.map((file) => parseRule(path.basename(file), source.read(file) ?? ""))
  const errors = parsed.flatMap((entry) => (typeof entry === "string" ? [entry] : selfCheck(entry)))
  if (errors.length > 0) return errors.join("\n")
  return parsed.filter((entry): entry is Rule => typeof entry !== "string")
}

function loadConfig(source: Source): Config | string {
  const text = source.read(CONFIG_FILE)
  if (text === undefined) return `${CONFIG_FILE} not found`
  const raw = Bun.TOML.parse(text) as { generated?: unknown; exclude?: unknown }
  if (!isStrings(raw.generated) || !isStrings(raw.exclude)) return `${CONFIG_FILE}: generated and exclude must be lists of globs`
  return { generated: raw.generated, exclude: raw.exclude }
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function fail(base: string | undefined, bootstrap: boolean, error: string): Report {
  return { base, bootstrap, rules: 0, files: 0, findings: [], errors: [error] }
}
