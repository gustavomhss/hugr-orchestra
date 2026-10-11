// The omni build step that both compiled CLIs share (packages/orchestra and packages/cli): which omni build each
// target ships, where its addon and supervisor come from, and the copy next to the binary.
import fs from "fs"
import path from "path"

// D-L8/D-L9: the omni build each target ships, as hugr-omni's platform id. A target with `enabled: false` compiles
// with OMNI_ENABLED=false (the legacy spawner) and ships no omni files. Flip a row once WP8a publishes its omni build.
export const omniTargets: Record<string, { id: string; enabled: boolean }> = {
  "linux-arm64": { id: "linux-arm64-gnu", enabled: true },
  "linux-x64": { id: "linux-x64-gnu", enabled: true },
  "linux-x64-baseline": { id: "linux-x64-gnu", enabled: true },
  "linux-arm64-musl": { id: "linux-arm64-musl", enabled: false },
  "linux-x64-musl": { id: "linux-x64-musl", enabled: false },
  "linux-x64-baseline-musl": { id: "linux-x64-musl", enabled: false },
  "darwin-arm64": { id: "darwin-arm64", enabled: true },
  "darwin-x64": { id: "darwin-x64", enabled: true },
  "darwin-x64-baseline": { id: "darwin-x64", enabled: true },
  "windows-arm64": { id: "win32-arm64-msvc", enabled: false },
  "windows-x64": { id: "win32-x64-msvc", enabled: true },
  "windows-x64-baseline": { id: "win32-x64-msvc", enabled: true },
}

export type OmniFiles = { addon: string; supervisor: string }

/**
 * The omni row for one build (`target` is its name without the package prefix, e.g. `darwin-arm64`) and, when it is
 * enabled, the files it ships. Resolve every build before building any, so a missing artifact fails at once.
 */
export function resolveOmni(input: { name: string; target: string; os: string; single: boolean }) {
  const omni = omniTargets[input.target]
  if (!omni) throw new Error(`${input.name} has no row in omniTargets`)
  return { omni, omniFiles: omni.enabled ? omniSources(input.os, omni.id, input.single) : undefined }
}

/** Ships the addon as hugr_omni.node and the supervisor (executable) in `bin`, next to the binary. */
export function copyOmni(files: OmniFiles | undefined, bin: string) {
  if (!files) return
  fs.copyFileSync(files.addon, `${bin}/hugr_omni.node`)
  const supervisor = `${bin}/${path.basename(files.supervisor)}`
  fs.copyFileSync(files.supervisor, supervisor)
  fs.chmodSync(supervisor, 0o755)
}

// Where the addon and the supervisor for an omni id come from: OMNI_ARTIFACTS=<dir>/<id>/{hugr_omni.node,
// hugr-omni-supervisor[.exe]}, required by every build but --single. A --single build without it takes this checkout's
// packages/omni/target/{release,debug}, with a warning. The files ship next to the binary, never embedded: Bun would
// extract an embedded addon to $TMPDIR, where a planted supervisor wins (probe P1).
function omniSources(os: string, id: string, single: boolean): OmniFiles | undefined {
  const supervisor = `hugr-omni-supervisor${os === "win32" ? ".exe" : ""}`
  const artifacts = process.env.OMNI_ARTIFACTS
  if (artifacts) {
    const files = {
      addon: path.join(artifacts, id, "hugr_omni.node"),
      supervisor: path.join(artifacts, id, supervisor),
    }
    const missing = Object.values(files).filter((file) => !fs.existsSync(file))
    if (missing.length > 0) throw new Error(`omni artifact missing for ${id}: ${missing.join(", ")}`)
    return files
  }
  if (!single) throw new Error(`OMNI_ARTIFACTS is required: no omni artifacts for ${id} (OMNI_ENABLED target).`)
  const addon =
    ({ darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" } as Record<string, string>)[os] ??
    "libhugr_omni_node.so"
  const found = ["release", "debug"]
    .map((profile) => path.resolve(import.meta.dirname, "../../omni/target", profile))
    .map((target) => ({ addon: path.join(target, addon), supervisor: path.join(target, supervisor) }))
    .find((files) => fs.existsSync(files.addon) && fs.existsSync(files.supervisor))
  if (!found) {
    console.warn(`WARNING: no OMNI_ARTIFACTS and no packages/omni/target build; this binary fails with omni on.`)
    return
  }
  console.warn(`WARNING: no OMNI_ARTIFACTS; shipping this checkout's omni build from ${path.dirname(found.addon)}.`)
  return found
}
