// @atlas/cli — src/repair-cli.ts  (R9 / D24: `atlas repair --worklist <file>`)
//
// The repair PR for Own units a merge left stale. CI has no store, so it only uploads the worklist
// `own-snapshot-guard --worklist` writes (.github/workflows/atlas-worklist.yml). A maintainer with the store runs this
// at the Atlas root: own-export for exactly the worklist's units (adapter-io `buildOwnExport`), the materializer over
// that reviewed file, a commit of the two materialized paths on `atlas-repair-<HEAD sha, 12 chars>`, a push, and
// `gh pr create`. The PR merges only once the same `own-snapshot-guard` passes on it.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { buildOwnExport, headSha } from "@atlas/adapter-io"
import type { OwnExport } from "@atlas/adapter-io"
import type { CliDeps } from "./cli.js"
import type { CliVerdict } from "./render.js"
import { flagValue, NOT_COMPOSED, opsOutcome, opsRefusal, opsUsage } from "./ops-common.js"
import { runTool } from "./repair-run.js"
import type { ToolRun } from "./repair-run.js"

export const REPAIR_INVARIANT =
  "REPAIR (D24): a repair PR refreshes exactly the worklist's Own units from the live store, through own-export and the materializer, and merges only once own-snapshot-guard passes on it"

/** The two paths the materializer writes; the repair commit stages exactly these. */
const REPAIR_PATHS = ["OWN-SNAPSHOT.json", ".orchestra/skills/own"] as const

/** One worklist row, as `own-snapshot-guard --worklist` writes it. */
export interface WorklistUnit {
  readonly unit: string
  readonly stale: readonly string[]
}

/** What the runner reads and runs through — injected so a test starts no program. */
export interface RepairPorts {
  readonly repoPath: string
  /** Absent when the runtime is not composed (no `own` leg). */
  readonly exportUnits: ((units: readonly string[]) => OwnExport) | undefined
  readonly head: () => string | undefined
  readonly tempDir: () => string
  /** The node binary the materializer runs under. */
  readonly node: string
  /** Run one program with `repoPath` as its working directory. */
  readonly run: (command: string, args: readonly string[]) => ToolRun
}

/** The production ports: the repository at cwd, the composed `own` leg, real programs through `repair-run.ts`. */
export function repairPorts(deps: CliDeps): RepairPorts {
  const repoPath = process.cwd()
  const own = deps.own
  return {
    repoPath,
    exportUnits: own === undefined ? undefined : (units) => buildOwnExport(repoPath, own, units),
    head: () => headSha(repoPath),
    tempDir: () => mkdtempSync(join(tmpdir(), "atlas-repair-")),
    node: process.execPath,
    run: (command, args) => runTool(command, args, repoPath),
  }
}

export function runRepair(ports: RepairPorts, flags: Readonly<Record<string, string>>): CliVerdict {
  const file = flagValue(flags, "worklist")
  if (file === undefined) return opsUsage("repair requires --worklist <file>: the file `own-snapshot-guard --worklist` wrote")
  const worklist = readWorklist(resolve(ports.repoPath, file))
  if (typeof worklist === "string") return opsUsage(`repair: ${worklist}`)
  if (worklist.length === 0) return opsOutcome(REPAIR_INVARIANT, "the worklist names no stale unit — nothing to repair", [])
  if (ports.exportUnits === undefined) return opsUsage(NOT_COMPOSED)
  const status = ports.run("git", ["status", "--porcelain", "--", "."])
  if (!status.ok || status.output.trim() !== "") {
    return opsRefusal(
      "repair: the working tree has uncommitted changes (or git status failed); commit or stash them first — the repair branch must hold only the Own refresh",
    )
  }
  const head = ports.head()
  if (head === undefined) return opsRefusal("repair: the repository has no readable HEAD commit")
  const units = worklist.map((entry) => entry.unit)
  const exported = ports.exportUnits(units)
  if (!exported.ok) return opsRefusal(`repair: own-export refused: ${exported.reason}`)
  const reviewed = join(ports.tempDir(), "reviewed-snapshot.json")
  writeFileSync(reviewed, `${JSON.stringify(exported.snapshot, null, 2)}\n`)
  const materialized = ports.run(ports.node, [join("scripts", "materialize-own-snapshot.mjs"), reviewed])
  if (!materialized.ok) {
    return opsRefusal(`repair: the materializer refused, and nothing was changed: ${materialized.output}`)
  }
  const branch = `atlas-repair-${head.slice(0, 12)}`
  const steps: readonly (readonly string[])[] = [
    ["checkout", "-b", branch],
    ["add", "--all", "--", ...REPAIR_PATHS],
    ["commit", "-m", `chore(atlas): refresh Own snapshot for ${units.join(", ")}`],
    ["push", "-u", "origin", branch],
  ]
  // Stops at the first failing git step; the ones after it never run.
  const failed = steps.reduce<string | undefined>((prior, args) => {
    if (prior !== undefined) return prior
    const git = ports.run("git", args)
    return git.ok ? undefined : `git ${args[0]} failed: ${git.output}`
  }, undefined)
  if (failed !== undefined) return opsRefusal(`repair: ${failed}; the refreshed files are in the working tree`)
  const pr = ports.run("gh", [
    "pr",
    "create",
    "--head",
    branch,
    "--title",
    `chore(atlas): refresh Own snapshot (${units.length} unit(s))`,
    "--body",
    prBody(worklist),
  ])
  if (!pr.ok) return opsRefusal(`repair: branch ${branch} is pushed, and gh pr create failed: ${pr.output}; open the PR by hand`)
  return opsOutcome(REPAIR_INVARIANT, "the repair PR is open; it merges once own-snapshot-guard passes on it", [
    `branch: ${branch}`,
    ...units.map((unit) => `repaired ${unit}`),
    `pr: ${pr.output.trim()}`,
  ])
}

/** The worklist rows, or why the file is not a worklist. */
function readWorklist(path: string): readonly WorklistUnit[] | string {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"))
    const units = typeof value === "object" && value !== null && "units" in value ? value.units : undefined
    if (!Array.isArray(units) || !units.every(isWorklistUnit)) {
      return `${path} is not a worklist {units: [{unit, stale: [path]}]}`
    }
    return units
  } catch (error) {
    return `cannot read the worklist ${path}: ${error instanceof Error ? error.message : String(error)}`
  }
}

function isWorklistUnit(value: unknown): value is WorklistUnit {
  if (typeof value !== "object" || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.unit === "string" &&
    row.unit !== "" &&
    Array.isArray(row.stale) &&
    row.stale.every((path) => typeof path === "string")
  )
}

function prBody(worklist: readonly WorklistUnit[]): string {
  return [
    "Refreshes the Own snapshot for the units whose anchored source changed (R9, specs/atlas-ui/build/DECISIONS.md D24):",
    "",
    ...worklist.map((entry) => `- \`${entry.unit}\`: ${entry.stale.join(", ")}`),
    "",
    "Built by `atlas repair --worklist` from the live store (own-export, then scripts/materialize-own-snapshot.mjs). own-snapshot-guard must pass on this PR before it merges.",
  ].join("\n")
}
