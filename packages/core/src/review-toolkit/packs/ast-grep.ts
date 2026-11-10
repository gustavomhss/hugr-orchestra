export * as ReviewPackAstGrep from "./ast-grep"

import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import pinned from "../../backend-toolkit/packs/ast-grep"
import { BackendToolkit } from "../../backend-toolkit"
import type { Pack } from "../../backend-toolkit/manifest"
import { pattern, rules } from "./ast-grep-rules"

export { pattern, rules }

// Lucy's scan entry over the backend toolkit's pinned ast-grep 0.45.3 (MIT, ast-grep/ast-grep). Same artifact, so the
// same install directory. The fit is lucy's check, not the backend seat's generator grant. A review never installs it
// and never rewrites: the template has no `--update-all`, and the rules have no `fix`.
export const manifest = {
  ...pinned,
  fit: { role: "check", input: "The reviewed tree in lucy's scratch copy", skills: [] },
} as const satisfies Pack

export const templateId = "ast-grep-scan-json"
export const parserId = "ast-grep"

// Host files, written beside the report and outside the scanned tree. `--config` must name one of them: without it,
// 0.45.3 walks up from cwd for sgconfig.yml (crates/cli/src/config.rs) and would load the repository's rules.
export const configName = "sgconfig.yml"
export const rulesName = "lucy-rules.yml"

// `scan` prints JSON to stdout (crates/cli/src/print/json_print.rs); there is no report-path flag. Exit 0 is a finished
// scan. Exit 1 is DiagnosticError: JSON was already printed, then the process exited 1 because a rule severity was
// `error` (crates/cli/src/scan.rs error_count; crates/cli/src/utils/error_context.rs). Any other exit is a failed run.
// Severity `info` keeps a hit at exit 0; only Severity::Error increments that count.
export const sink = "stdout" as const
export const completedExits = [0, 1] as const

/** The installed executable, or why there is none. `status` only observes; it never installs. */
export const locate = Effect.fn("ReviewPackAstGrep.locate")(function* () {
  const states = yield* BackendToolkit.status(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `ast-grep unsupported: ${state.reason}` }
  return { absent: "ast-grep absent" }
})

/** Writes the host config and rules into `directory`. The directory is outside the scanned tree. */
export const prepare = Effect.fn("ReviewPackAstGrep.prepare")(function* (directory: string, dropped: readonly string[] = []) {
  yield* Effect.promise(async () => {
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, configName), "ruleDirs: []\n")
    await writeFile(path.join(directory, rulesName), hostRules(dropped))
  })
})

/**
 * Host-owned argument template. `root` is the scanned copy; `report` is not written by the binary — its directory holds
 * the host config and rules. `--rule` loads only that file. `--no-ignore` stops a repository ignore file from hiding
 * the tree. No rewrite flag is present.
 */
export const templates: Readonly<Record<string, (input: { executable: string; root: string; report: string }) => string[]>> = {
  [templateId]: (input) => {
    const directory = path.dirname(input.report)
    return [
      input.executable, "scan",
      "--config", path.join(directory, configName),
      "--rule", path.join(directory, rulesName),
      "--json=compact", "--color", "never", "--threads", "1",
      "--no-ignore", "hidden", "--no-ignore", "dot", "--no-ignore", "exclude",
      "--no-ignore", "global", "--no-ignore", "parent", "--no-ignore", "vcs",
      input.root,
    ]
  },
}

function hostRules(dropped: readonly string[] = []) {
  const skip = new Set(dropped)
  return rules.filter((rule) => !skip.has(rule.id)).map((rule) => [
    `id: ${rule.id}`,
    `language: ${rule.language}`,
    "severity: info",
    "message: direct eval",
    "rule:",
    `  pattern: '${pattern}'`,
  ].join("\n")).join("\n---\n") + "\n"
}
