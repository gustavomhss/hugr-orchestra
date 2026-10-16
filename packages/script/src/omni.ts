// The omni build step that both compiled CLIs share (packages/orchestra and packages/cli): which omni build each
// target ships, where its addon and supervisor come from, and the copy next to the binary.
import fs from "fs"
import path from "path"
import { inspectElf, nativeMachines, NATIVE_MACHINES, requireElfLibc } from "./tree-sitter-prebuilds"
import { WorkspacePaths } from "./workspace-paths.ts"

// D-L8/D-L9: the omni build each target ships, as hugr-omni's platform id. A target with `enabled: false` compiles
// with OMNI_ENABLED=false (the legacy spawner) and ships no omni files. Every declared CLI target has a native build.
export const omniTargets: Record<string, { id: string; enabled: boolean }> = {
  "linux-arm64": { id: "linux-arm64-gnu", enabled: true },
  "linux-x64": { id: "linux-x64-gnu", enabled: true },
  "linux-x64-baseline": { id: "linux-x64-gnu", enabled: true },
  "linux-arm64-musl": { id: "linux-arm64-musl", enabled: true },
  "linux-x64-musl": { id: "linux-x64-musl", enabled: true },
  "linux-x64-baseline-musl": { id: "linux-x64-musl", enabled: true },
  "darwin-arm64": { id: "darwin-arm64", enabled: true },
  "darwin-x64": { id: "darwin-x64", enabled: true },
  "darwin-x64-baseline": { id: "darwin-x64", enabled: true },
  "windows-arm64": { id: "win32-arm64-msvc", enabled: true },
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
  if (input.os !== (omni.id.startsWith("win32-") ? "win32" : omni.id.split("-")[0]))
    throw new Error(`OMNI_TARGET_OS_MISMATCH: ${input.target}`)
  const omniFiles = omni.enabled ? omniSources(input.os, omni.id, input.single) : undefined
  if (omniFiles) requireOmniFiles(omniFiles, { os: input.os, arch: omni.id.split("-")[1]!,
    abi: omni.id.endsWith("-musl") ? "musl" : undefined })
  return { omni, omniFiles }
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
// packages/omni/target/{release,debug}, admitted for the requested CPU/libc. The files ship next to the binary, never embedded: Bun would
// extract an embedded addon to $TMPDIR, where a planted supervisor wins (probe P1).
function omniSources(os: string, id: string, single: boolean): OmniFiles {
  const supervisor = `hugr-omni-supervisor${os === "win32" ? ".exe" : ""}`
  const artifacts = process.env.OMNI_ARTIFACTS
  if (artifacts) {
    const files = {
      addon: path.join(artifacts, id, "hugr_omni.node"),
      supervisor: path.join(artifacts, id, supervisor),
    }
    return files
  }
  if (!single) throw new Error(`OMNI_ARTIFACTS is required: no omni artifacts for ${id} (OMNI_ENABLED target).`)
  const addon =
    ({ darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" } as Record<string, string>)[os] ??
    "libhugr_omni_node.so"
  const native = WorkspacePaths.make(import.meta.dirname).domain("omni")
  const found = ["release", "debug"]
    .map((profile) => path.join(native, "target", profile))
    .map((target) => ({ addon: path.join(target, addon), supervisor: path.join(target, supervisor) }))
    .find((files) => fs.existsSync(files.addon) || fs.existsSync(files.supervisor))
  if (!found) throw new Error(`OMNI_LOCAL_COMPANIONS_MISSING: ${id}: packages/omni/target/{release,debug}`)
  return found
}

// Admission runs before a producer replaces output. A named local profile is
// not evidence of target CPU/libc, and an incomplete release cannot borrow debug.
export function requireOmniFiles(files: OmniFiles, target: { os: string; arch: string; abi?: string }) {
  const machine = NATIVE_MACHINES[`${target.os}-${target.arch}`]
  if (machine === undefined || (target.abi !== undefined && (target.os !== "linux" || target.abi !== "musl")))
    throw new Error(`OMNI_TARGET_UNSUPPORTED: ${target.os}-${target.arch}-${target.abi ?? "default"}`)
  for (const kind of ["addon", "supervisor"] as const) {
    const file = files[kind]
    if (typeof file !== "string" || !file) throw new Error(`OMNI_COMPANION_MISSING_OR_NOT_REGULAR: ${kind}`)
    const stat = fs.lstatSync(file, { throwIfNoEntry: false })
    if (!stat?.isFile() || stat.isSymbolicLink() || !stat.size)
      throw new Error(`OMNI_COMPANION_MISSING_OR_NOT_REGULAR: ${kind}: ${file}`)
    if (!nativeMachines(file).includes(machine)) throw new Error(`OMNI_COMPANION_CPU_MISMATCH: ${kind}: ${file}`)
    const bytes = fs.readFileSync(file)
    if (target.os === "linux") {
      const elf = inspectElf(file)
      if (elf.machine !== machine) throw new Error(`OMNI_COMPANION_CPU_MISMATCH: ${kind}: ${file}`)
      const libc = target.abi === "musl" ? "musl" : "glibc"
      if (kind === "addon") requireElfLibc(file, libc)
      if (kind === "supervisor" && (elf.interpreter !== undefined || elf.needed.length)) {
        requireElfLibc(file, libc)
        const loader = libc === "musl" ? `/lib/ld-musl-${target.arch === "x64" ? "x86_64" : "aarch64"}.so.1` :
          target.arch === "x64" ? "/lib64/ld-linux-x86-64.so.2" : "/lib/ld-linux-aarch64.so.1"
        if (elf.interpreter !== loader) throw new Error(`OMNI_SUPERVISOR_INTERPRETER_MISMATCH: ${file}`)
      }
    }
    if (target.os === "darwin" && bytes.readUInt32LE(0) !== 0xfeedfacf &&
        ![0xcafebabe, 0xcafebabf].includes(bytes.readUInt32BE(0)))
      throw new Error(`OMNI_COMPANION_FORMAT_MISMATCH: ${kind}: ${file}`)
    if (target.os === "win32") {
      if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) throw new Error(`OMNI_COMPANION_FORMAT_MISMATCH: ${kind}: ${file}`)
      const header = bytes.readUInt32LE(0x3c)
      if (header < 64 || header + 26 > bytes.length || bytes.readUInt32LE(header) !== 0x4550 || bytes.readUInt16LE(header + 24) !== 0x20b)
        throw new Error(`OMNI_COMPANION_FORMAT_MISMATCH: ${kind}: ${file}`)
    }
    // A Windows host keeps no POSIX mode bits for a cross-target supervisor; copyOmni sets 0o755 when it ships it.
    if (kind === "supervisor" && target.os !== "win32" && process.platform !== "win32" && !(stat.mode & 0o111))
      throw new Error(`OMNI_SUPERVISOR_NOT_EXECUTABLE: ${file}`)
  }
  return files
}
