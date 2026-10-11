import { createHash } from "node:crypto"
import { lstat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { requireTreeSitterBundle, treeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { cliTreeSitterTarget, readCliManifest, verifyCliArtifact } from "../cli-artifacts"
import { nativeT } from "../native-translations"
import { runWslInDistro, type RunWslOptions } from "./runtime"

export class WslArtifactError extends Error {
  constructor(readonly reason: "architecture" | "abi" | "bytes" | "version" | "path" | "command" | "unavailable") {
    super(nativeT(reason === "unavailable" ? "desktop.wsl.error.installUnavailable" : "desktop.wsl.error.serverCannotRun"))
    this.name = "WslArtifactError"
  }
}

export const guestEnvironment = [
  "set -euo pipefail",
  "export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  "export WSLENV=",
  'export XDG_STATE_HOME="$HOME/.local/state"',
].join("\n")

export function linuxGuestTarget(architecture: string, abi: string) {
  if (!/^glibc \d+\.\d+$/.test(abi)) throw new WslArtifactError("abi")
  if (architecture === "x86_64") return "linux-x64-baseline"
  if (architecture === "aarch64") return "linux-arm64"
  throw new WslArtifactError("architecture")
}

const validateGuestScript = `actual=$(sha256sum -- "$binary")
[[ "\${actual%% *}" == "$digest" ]] || exit 84
actual=$("$binary" --version) || exit 83
[[ "$actual" == "orchestra v"* && "\${actual#orchestra v}" == "$version" ]] || exit 82`

export const admitGuestScript = `${guestEnvironment}
binary=$1; digest=$2; version=$3
[[ "$binary" == "$HOME/.orchestra/bin/orchestra" && -f "$binary" && -x "$binary" ]] || exit 85
for directory in "$HOME/.orchestra" "$HOME/.orchestra/bin" "$binary"; do
  [[ ! -L "$directory" ]] || exit 85
done
${validateGuestScript}
printf '%s\\n' "$actual"
`

// Linux CLIs are omni builds: their preflight needs this addon and supervisor next to the binary.
export const omniCompanions = ["hugr_omni.node", "hugr-omni-supervisor"] as const

// Verify bytes before the first execution, and version before the only replacement. The staged binary runs next to
// its staged companions, so validation exercises the same omni pair that is installed. Its tree-sitter directory is
// checked as one digest over "<sha256>  <path>" lines of its regular files, sorted by path, so a symlink never matches.
export const installGuestScript = `${guestEnvironment}
source=$1; digest=$2; version=$3; addon=$4; addon_digest=$5; supervisor=$6; supervisor_digest=$7
tree_sitter=$8; tree_sitter_digest=$9
for directory in "$HOME/.orchestra" "$HOME/.orchestra/bin"; do
  [[ ! -L "$directory" ]] || exit 85
done
mkdir -p -- "$HOME/.orchestra/bin"
for file in orchestra ${omniCompanions.join(" ")}; do
  target="$HOME/.orchestra/bin/$file"
  [[ ! -L "$target" && ( ! -e "$target" || -f "$target" ) ]] || exit 85
done
target="$HOME/.orchestra/bin/tree-sitter"
[[ ! -L "$target" && ( ! -e "$target" || -d "$target" ) ]] || exit 85
staging=$(mktemp -d "$HOME/.orchestra/bin/.orchestra.XXXXXXXX")
trap 'rm -rf -- "$staging"' EXIT
trap 'exit 130' INT TERM
cp -- "$addon" "$staging/${omniCompanions[0]}"
cp -- "$supervisor" "$staging/${omniCompanions[1]}"
chmod 0755 -- "$staging/${omniCompanions[1]}"
actual=$(sha256sum -- "$staging/${omniCompanions[0]}")
[[ "\${actual%% *}" == "$addon_digest" ]] || exit 84
actual=$(sha256sum -- "$staging/${omniCompanions[1]}")
[[ "\${actual%% *}" == "$supervisor_digest" ]] || exit 84
cp -R -- "$tree_sitter" "$staging/tree-sitter"
actual=$(cd -- "$staging/tree-sitter" && find . -type f -printf '%P\\n' | LC_ALL=C sort | while IFS= read -r file; do
  sum=$(sha256sum -- "$file"); printf '%s  %s\\n' "\${sum%% *}" "$file"
done | sha256sum)
[[ "\${actual%% *}" == "$tree_sitter_digest" ]] || exit 84
cp -- "$source" "$staging/orchestra"
chmod 0755 -- "$staging/orchestra"
binary="$staging/orchestra"
${validateGuestScript}
rm -rf -- "$HOME/.orchestra/bin/tree-sitter"
mv -T -- "$staging/tree-sitter" "$HOME/.orchestra/bin/tree-sitter"
for file in ${omniCompanions.join(" ")} orchestra; do
  mv -fT -- "$staging/$file" "$HOME/.orchestra/bin/$file"
done
`

export async function installWslArtifact(
  distro: string,
  expectedVersion: string | undefined,
  opts: RunWslOptions & {
    directory?: string
    run?: typeof runWslInDistro
    readManifest?: typeof readCliManifest
    verifyArtifact?: typeof verifyCliArtifact
    installedPath?: string
  } = {},
) {
  const run = opts.run ?? runWslInDistro
  const command = async (args: string[]) => {
    opts.signal?.throwIfAborted()
    const result = await run(args, distro, { signal: opts.signal, timeoutMs: Math.min(opts.timeoutMs ?? 20_000, 20_000) })
    if (result.code !== 0) {
      throw new WslArtifactError(
        result.code === 82 ? "version" : result.code === 83 ? "abi" :
        result.code === 84 ? "bytes" : result.code === 85 ? "path" : "command",
      )
    }
    return result.stdout.trim()
  }
  const probe = (await command(["bash", "-c", `${guestEnvironment}\nuname -m\ngetconf GNU_LIBC_VERSION || exit 83`])).split(/\r?\n/)
  const target = linuxGuestTarget(probe[0] ?? "", probe[1] ?? "")
  const directory = opts.directory ?? (await cliArtifactDirectory())
  const manifest = await (opts.readManifest ?? readCliManifest)(directory)
  const artifact = await (opts.verifyArtifact ?? verifyCliArtifact)(directory, target)
  if ((expectedVersion !== undefined && manifest.version !== expectedVersion) || artifact.version !== manifest.version) {
    throw new WslArtifactError("version")
  }
  const entry = manifest.artifacts.find((item) => item.target === target)
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new WslArtifactError("bytes")
  if (opts.installedPath !== undefined) {
    return command([
      "timeout", "--kill-after=1s", "18s", "bash", "-c", admitGuestScript,
      "orchestra-admit", opts.installedPath, entry.sha256, manifest.version,
    ])
  }
  const companions = await Promise.all(omniCompanions.map((name) => companion(join(directory, `omni-${target}`, name))))
  const treeSitter = await treeSitterCompanion(join(directory, `tree-sitter-${target}`), target)
  const guestPath = async (path: string) => {
    const converted = await command(["wslpath", "-u", "--", path])
    if (!converted.startsWith("/") || /[\r\n\0]/.test(converted)) throw new WslArtifactError("path")
    return converted
  }
  const source = await guestPath(artifact.path)
  const addon = await guestPath(companions[0].path)
  const supervisor = await guestPath(companions[1].path)
  const treeSitterPath = await guestPath(treeSitter.path)
  await command([
    "timeout", "--kill-after=1s", "18s", "bash", "-c", installGuestScript, "orchestra-install", source, entry.sha256, manifest.version,
    addon, companions[0].sha256, supervisor, companions[1].sha256, treeSitterPath, treeSitter.sha256,
  ])
}

// The bundle ships each Linux CLI's tree-sitter under tree-sitter-<target>/; without it maestro-arsenal in the guest
// cannot parse, so the install refuses by name. The digest is the one installGuestScript computes in the guest.
async function treeSitterCompanion(path: string, target: string) {
  const bundle = cliTreeSitterTarget(target)
  await Promise.resolve()
    .then(() => requireTreeSitterBundle(path, bundle))
    .catch(() => {
      throw new WslArtifactError("unavailable")
    })
  const lines = await Promise.all(
    treeSitterBundle(bundle)
      .toSorted()
      .map(async (file) => `${createHash("sha256").update(await readFile(join(path, file))).digest("hex")}  ${file}\n`),
  )
  return { path, sha256: createHash("sha256").update(lines.join("")).digest("hex") }
}

// The bundle ships omni companions per Linux target under omni-<target>/. Without them the CLI cannot start in the
// guest, so the install refuses by name instead of placing a binary that fails its preflight.
async function companion(path: string) {
  const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return undefined
    throw error
  })
  if (!stat?.isFile()) throw new WslArtifactError("unavailable")
  return { path, sha256: createHash("sha256").update(await readFile(path)).digest("hex") }
}

export function verifyWslGuestArtifact(
  distro: string, installedPath: string, opts: Parameters<typeof installWslArtifact>[2] = {},
) {
  return installWslArtifact(distro, undefined, { ...opts, installedPath })
}

async function cliArtifactDirectory() {
  const { app } = await import("electron")
  return app.isPackaged ? join(process.resourcesPath, "cli") : join(app.getAppPath(), "resources", "cli")
}
