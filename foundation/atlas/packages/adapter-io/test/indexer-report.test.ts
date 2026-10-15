// @atlas/adapter-io — test/indexer-report.test.ts  (the `atlas doctor index` diagnosis + the RUNNABLE plan)
//
// `planIndexers` was rigorously tested and served NOTHING: its only importers were its own test and the
// barrel. `reportIndexPlan` is the production caller, and these goldens pin the two properties that make it
// worth having:
//   • THE PLANNED COMMAND WRITES WHERE THE READER READS. The `--output` argument and `readScip`'s path are
//     asserted against ONE resolved location on disk, by actually writing a dump there and reading it back.
//     A plan that names a real binary and a wrong path is worse than no plan: the indexer succeeds, the
//     operator believes the repository is indexed, and `axes.edges` stays empty.
//   • THE HOLE IS NAMED. A language with no configured indexer is reported as a hole with its file count,
//     not omitted — "Atlas has no indexer for Ruby" and "Atlas found nothing" must not be the same output.
// Plus: the report is derived from the GIT-TRACKED set, and it NEVER runs an indexer (no child process is
// reachable from this module — the plan is data).

import { afterEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { reportIndexPlan } from "../src/indexer-report.js"
import type { PlannedLang } from "../src/indexer-report.js"
import { HONEST_HOLE, SCIP_INDEX_REL, planIndexers, readScip } from "../src/scip.js"
import { makeFixScip } from "./harness/fix-scip.js"

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

/** A throwaway git repo with the given tracked files (the walk reads `git ls-files`, so they must be added). */
function repoWith(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-idxplan-"))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const git = (args: string[]): void => void execFileSync("git", args, { cwd: dir })
  git(["init", "-q"])
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true })
    writeFileSync(join(dir, rel), body)
  }
  git(["add", "-A"])
  return dir
}

const langsOf = (r: readonly PlannedLang[]): string[] => r.map((p) => p.plan.lang)

describe("reportIndexPlan — the production caller of planIndexers (REQ-INDEX-3a)", () => {
  it("derives the languages from the real tracked tree and routes each through the REAL dispatch", () => {
    const repo = repoWith({
      "src/a.ts": "export const a = 1;\n",
      "src/b.tsx": "export const b = 2;\n",
      "svc/c.py": "c = 3\n",
      "lib/d.rb": "d = 4\n",
      "README.md": "# not a language Atlas indexes\n", //   no extension row ⇒ not a hole, not a language
    })
    const r = reportIndexPlan(repo)

    // configured: py + ts (ascending LangId), with the file counts actually walked (b.tsx folds into ts).
    expect(langsOf(r.configured)).toEqual(["py", "ts"])
    expect(r.configured.find((p) => p.plan.lang === "ts")?.files).toBe(2)
    expect(r.configured.find((p) => p.plan.lang === "py")?.files).toBe(1)

    // the plan is the dispatch's own output — same tools, never a second copy of the table.
    expect(r.configured.map((p) => p.plan.tool)).toEqual(planIndexers(["py", "ts"]).map((p) => p.tool))

    // the HOLE is named, with its count — not silently dropped, and not routed to another lang's indexer.
    expect(langsOf(r.holes)).toEqual(["rb"])
    expect(r.holes[0]?.files).toBe(1)
    expect(r.holes[0]?.plan.tool).toBe(HONEST_HOLE)
    expect(r.holes[0]?.plan.args).toEqual([]) // a hole names no binary ⇒ there is nothing to run
    expect(r.holes[0]?.plan.version).toBeUndefined() //          and nothing to pin

    // markdown is neither: a file in no known language is not a diagnosis about a missing indexer.
    expect([...langsOf(r.configured), ...langsOf(r.holes)]).not.toContain("md")
  })

  it("every configured plan is RUNNABLE and PINNED — a tool name alone does not satisfy REQ-INDEX-3a", () => {
    for (const plan of planIndexers(["ts", "py"])) {
      expect(plan.args.length).toBeGreaterThan(0) // teeth: `args: []` (the shipped state) fails HERE
      expect(plan.version).toMatch(/^\d+\.\d+\.\d+$/) // an installed binary is pinned to a release
      expect(plan.args).toContain("--output")
      expect(plan.args).toContain(SCIP_INDEX_REL)
    }
  })

  it("TEETH — the planned --output is the path the READER opens (asserted on disk, not by inspection)", () => {
    const repo = repoWith({ "src/a.ts": "export const a = 1;\n" })
    const plan = reportIndexPlan(repo).configured[0]!.plan

    // Take the path OUT of the planned command line (the argument after `--output`) — exactly what an
    // operator pasting the line would produce — and write a real dump there, relative to the repo root.
    const planned = plan.args[plan.args.indexOf("--output") + 1]!
    const written = join(repo, planned)
    mkdirSync(join(written, ".."), { recursive: true })
    const fx = makeFixScip()
    cleanups.push(fx.cleanup)
    copyFileSync(fx.scipPath, written)

    // The reader resolves its own path independently (`SCIP_INDEX_REL`, the constant compose/wire/skeleton
    // all join). If the plan wrote anywhere else, this read is an ENOENT throw.
    expect(readScip(join(repo, SCIP_INDEX_REL)).documents.length).toBeGreaterThan(0)
    // …and the diagnosis now REPORTS it as present, which is what closes the loop for the user.
    expect(reportIndexPlan(repo).scip).toEqual({ kind: "present", documents: 2 })
  })

  it("reports the dump state TOTALLY: absent · unreadable · present (a diagnostic never throws)", () => {
    const repo = repoWith({ "src/a.ts": "export const a = 1;\n" })
    expect(reportIndexPlan(repo).scip).toEqual({ kind: "absent" })

    mkdirSync(join(repo, ".atlas"), { recursive: true })
    writeFileSync(join(repo, SCIP_INDEX_REL), "garbage — not a protobuf\n")
    const corrupt = reportIndexPlan(repo).scip
    expect(corrupt.kind).toBe("unreadable") // NOT folded into `absent`: the user must tell these apart
    if (corrupt.kind === "unreadable") expect(corrupt.reason.length).toBeGreaterThan(0)
  })

  it("a repository in no language Atlas indexes reports NOTHING to run — not a fabricated plan", () => {
    const r = reportIndexPlan(repoWith({ "notes.md": "# hi\n", "data.json": "{}\n" }))
    expect(r.configured).toEqual([])
    expect(r.holes).toEqual([])
  })
})
