// @atlas/cli — src/repair-run.ts  (the process seam of `atlas repair`, R9 / D24)
//
// `atlas repair` is a maintainer command: it runs where the store exists, never in CI and never in a shipped
// Orchestra path. It starts three programs — `node` (scripts/materialize-own-snapshot.mjs, through
// `process.execPath`), `git` (status / checkout -b / add / commit / push) and `gh pr create` — and only through this
// function: `execFileSync`, no shell, stdout and stderr captured. Allow-listed in script/spawn-allowlist.json by lead
// decision (specs/atlas-ui/build/issues/b-o.md item 1).

import { execFileSync } from "node:child_process"

/** One program's outcome: `ok` is a zero exit; `output` is its stdout, or on failure its stdout, stderr and message. */
export interface ToolRun {
  readonly ok: boolean
  readonly output: string
}

export function runTool(command: string, args: readonly string[], cwd: string): ToolRun {
  try {
    return { ok: true, output: execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }
  } catch (error) {
    const e = error as { readonly stdout?: unknown; readonly stderr?: unknown; readonly message?: unknown }
    const parts = [e.stdout, e.stderr, e.message].filter(
      (part): part is string => typeof part === "string" && part.trim() !== "",
    )
    return { ok: false, output: parts.join("\n").trim() }
  }
}
