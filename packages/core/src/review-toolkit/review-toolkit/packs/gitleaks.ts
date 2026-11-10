export * as ReviewPackGitleaks from "./gitleaks"

import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import pinned from "../../backend-toolkit/packs/gitleaks"
import { BackendToolkit } from "../../backend-toolkit"
import type { Pack } from "../../backend-toolkit/manifest"

// Lucy's own entry over the backend toolkit's pinned gitleaks: the same artifact, so the same install directory, found
// where the host already installed it. A review never fetches it (design §7.1: never install, network off) and never
// goes through the backend seat's toolkit grant.
export const manifest = {
  ...pinned,
  fit: { role: "check", input: "The reviewed tree in lucy's scratch copy", skills: [] },
} as const satisfies Pack

/** The installed executable, or why there is none. `status` only observes; it never installs. */
export const locate = Effect.fn("ReviewPackGitleaks.locate")(function* () {
  const states = yield* BackendToolkit.status(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `gitleaks unsupported: ${state.reason}` }
  return { absent: "gitleaks absent" }
})

export const configName = "gitleaks.toml"

/**
 * Host config written outside the copy. `--config` is first so a target `.gitleaks.toml` is not the scan.
 * `useDefault` keeps the pinned rules; `disabledRules` is only the catalog's dropped native ids.
 */
export function hostConfig(disabled: readonly string[]) {
  const listed = disabled.map((id) => ` "${toml(id)}"`).join(",")
  return `[extend]\nuseDefault = true\ndisabledRules = [${listed}]\n`
}

export const prepare = Effect.fn("ReviewPackGitleaks.prepare")(function* (directory: string, disabled: readonly string[] = []) {
  yield* Effect.promise(async () => {
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, configName), hostConfig(disabled))
  })
})

/**
 * Host-owned argument templates by catalog template id. `root` is the scanned copy; `report` is a file outside it that
 * the jail may write. `--config` precedes the target path. `--exit-code 0` keeps a leak at exit 0, so any other exit
 * is a failed run, never findings. `--redact` keeps secrets out of the retained raw output.
 */
export const templates: Readonly<Record<string, (input: { executable: string; root: string; report: string }) => string[]>> = {
  "gitleaks-dir-sarif": (input) => [
    input.executable, "dir", "--config", path.join(path.dirname(input.report), configName), input.root,
    "--report-format", "sarif", "--report-path", input.report,
    "--redact", "--no-banner", "--no-color", "--log-level", "error", "--exit-code", "0",
  ],
}

function toml(id: string) {
  return id.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")
}
