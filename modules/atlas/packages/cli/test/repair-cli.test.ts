import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { OwnExport } from "@atlas/adapter-io"
import { runRepair, repairPorts, type RepairPorts } from "../src/repair-cli.js"
import { runTool, type ToolRun } from "../src/repair-run.js"
import { OPS_COMMANDS } from "../src/ops-cli.js"

const HEAD = "0123456789abcdef0123456789abcdef01234567"
const BRANCH = "atlas-repair-0123456789ab"
const SNAP = { schemaVersion: 1, snapshot: `atlas-own-export:${HEAD}`, sourceRevision: HEAD, units: [] } as never
const OK: OwnExport = { ok: true, snapshot: SNAP, rebuilt: ["packages/a"], carried: [] }
const WORK = { units: [{ unit: "packages/a", stale: ["packages/a/src/x.ts"] }] }
const clean = (): ToolRun => ({ ok: true, output: "" })

let tmp = ""
let calls: { command: string; args: readonly string[] }[] = []

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-repair-test-"))
  calls = []
  writeFileSync(join(tmp, "w.json"), JSON.stringify(WORK))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const ports = (
  over: Partial<RepairPorts> = {},
  answer: (command: string, args: readonly string[]) => ToolRun = clean,
): RepairPorts => ({
  repoPath: tmp,
  exportUnits: () => OK,
  head: () => HEAD,
  tempDir: () => tmp,
  node: "node-bin",
  run: (command, args) => {
    calls.push({ command, args })
    return answer(command, args)
  },
  ...over,
})

const line = (c: { command: string; args: readonly string[] }) => [c.command, ...c.args].join(" ")

describe("repair-cli", () => {
  it("case 1: requires --worklist", () => {
    const r = runRepair(ports(), {})
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("repair requires --worklist <file>")
    expect(calls).toEqual([])
  })

  it("case 2: cannot read worklist", () => {
    const r = runRepair(ports(), { worklist: "missing.json" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("cannot read the worklist")
  })

  it("case 3: not a worklist", () => {
    writeFileSync(join(tmp, "w.json"), JSON.stringify({ units: [{ unit: 1 }] }))
    const r = runRepair(ports(), { worklist: "w.json" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("is not a worklist")
  })

  it("case 4: nothing to repair", () => {
    writeFileSync(join(tmp, "w.json"), JSON.stringify({ units: [] }))
    const r = runRepair(ports(), { worklist: "w.json" })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("nothing to repair")
    expect(calls).toEqual([])
  })

  it("case 5: not composed", () => {
    const r = runRepair(ports({ exportUnits: undefined }), { worklist: "w.json" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("atlas runtime is not composed yet")
  })

  it("case 6: dirty tree", () => {
    const answer = (command: string, args: readonly string[]): ToolRun =>
      command === "git" && args[0] === "status" ? { ok: true, output: " M packages/a/src/x.ts\n" } : clean()
    const r = runRepair(ports({}, answer), { worklist: "w.json" })
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("uncommitted changes")
    expect(calls.map(line)).toEqual(["git status --porcelain -- ."])
  })

  it("case 7: own-export refused", () => {
    const r = runRepair(
      ports({
        exportUnits: () => ({
          ok: false,
          reason: "Own snapshot export requires fresh reviewed packs; not FRESH: packages/a a:inv (STALE)",
        }),
      }),
      { worklist: "w.json" },
    )
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("own-export refused")
    expect(r.stdout).toContain("not FRESH: packages/a a:inv (STALE)")
    expect(calls.some((c) => c.command === "node-bin")).toBe(false)
  })

  it("case 8: materializer refused", () => {
    const answer = (command: string): ToolRun =>
      command === "node-bin" ? { ok: false, output: "materialize-own-snapshot: current source blob mismatch" } : clean()
    const r = runRepair(ports({}, answer as (command: string, args: readonly string[]) => ToolRun), { worklist: "w.json" })
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("the materializer refused, and nothing was changed")
    expect(r.stdout).toContain("current source blob mismatch")
    expect(calls.some((c) => c.command === "git" && c.args[0] === "checkout")).toBe(false)
  })

  it("case 9: happy path", () => {
    const answer = (command: string): ToolRun =>
      command === "gh" ? { ok: true, output: "https://github.test/pr/7\n" } : clean()
    const r = runRepair(ports({}, answer as (command: string, args: readonly string[]) => ToolRun), { worklist: "w.json" })
    expect(r.exitCode).toBe(0)
    expect(calls.slice(0, 6).map(line)).toEqual([
      "git status --porcelain -- .",
      `node-bin scripts/materialize-own-snapshot.mjs ${join(tmp, "reviewed-snapshot.json")}`,
      `git checkout -b ${BRANCH}`,
      "git add --all -- OWN-SNAPSHOT.json .orchestra/skills/own",
      "git commit -m chore(atlas): refresh Own snapshot for packages/a",
      `git push -u origin ${BRANCH}`,
    ])
    expect(calls[6]?.command).toBe("gh")
    expect(calls[6]?.args.slice(0, 6)).toEqual([
      "pr",
      "create",
      "--head",
      BRANCH,
      "--title",
      "chore(atlas): refresh Own snapshot (1 unit(s))",
    ])
    expect(calls[6]?.args[7]).toContain("- `packages/a`: packages/a/src/x.ts")
    expect(r.stdout).toContain(`branch: ${BRANCH}`)
    expect(r.stdout).toContain("repaired packages/a")
    expect(r.stdout).toContain("pr: https://github.test/pr/7")
    expect(readFileSync(join(tmp, "reviewed-snapshot.json"), "utf8")).toBe(`${JSON.stringify(SNAP, null, 2)}\n`)
  })

  it("case 10: git commit fails", () => {
    const answer = (command: string, args: readonly string[]): ToolRun =>
      command === "git" && args[0] === "commit" ? { ok: false, output: "nothing to commit" } : clean()
    const r = runRepair(ports({}, answer), { worklist: "w.json" })
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("git commit failed: nothing to commit")
    expect(r.stdout).toContain("the refreshed files are in the working tree")
    expect(calls.some((c) => c.command === "git" && c.args[0] === "push")).toBe(false)
    expect(calls.some((c) => c.command === "gh")).toBe(false)
  })

  it("case 11: gh fails", () => {
    const answer = (command: string): ToolRun =>
      command === "gh" ? { ok: false, output: "gh: not logged in" } : clean()
    const r = runRepair(ports({}, answer as (command: string, args: readonly string[]) => ToolRun), { worklist: "w.json" })
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("gh pr create failed")
    expect(r.stdout).toContain("open the PR by hand")
  })

  it("case 12: wiring", () => {
    expect(repairPorts({}).exportUnits).toBeUndefined()
    expect(repairPorts({}).node).toBe(process.execPath)
    expect(typeof OPS_COMMANDS.repair).toBe("function")
  })

  it("case 13: runTool", () => {
    const ok = runTool(process.execPath, ["-e", "process.stdout.write('hi')"], tmp)
    expect(ok).toEqual({ ok: true, output: "hi" })
    const bad = runTool(process.execPath, ["-e", "process.stderr.write('bad'); process.exit(3)"], tmp)
    expect(bad.ok).toBe(false)
    expect(bad.output).toContain("bad")
  })
})
