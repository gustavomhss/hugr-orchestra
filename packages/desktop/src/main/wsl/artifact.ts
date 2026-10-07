import { join } from "node:path"
import { readCliManifest, verifyCliArtifact } from "../cli-artifacts"
import { nativeT } from "../native-translations"
import { runWslInDistro, type RunWslOptions } from "./runtime"

export class WslArtifactError extends Error {
  constructor(readonly reason: "architecture" | "abi" | "bytes" | "version" | "path" | "command") {
    super(nativeT("desktop.wsl.error.serverCannotRun"))
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

// Validate the staged executable before the only write to the installed path.
export const installGuestScript = `${guestEnvironment}
source=$1; digest=$2; version=$3
for directory in "$HOME/.orchestra" "$HOME/.orchestra/bin"; do
  [[ ! -L "$directory" ]] || exit 85
done
mkdir -p -- "$HOME/.orchestra/bin"
destination="$HOME/.orchestra/bin/orchestra"
[[ ! -L "$destination" && ( ! -e "$destination" || -f "$destination" ) ]] || exit 85
temporary=$(mktemp "$HOME/.orchestra/bin/.orchestra.XXXXXXXX")
trap 'rm -f -- "$temporary"' EXIT
trap 'exit 130' INT TERM
cp -- "$source" "$temporary"
actual=$(sha256sum -- "$temporary")
[[ "\${actual%% *}" == "$digest" ]] || exit 84
chmod 0755 -- "$temporary"
actual=$("$temporary" --version) || exit 83
[[ "$actual" == "$version" ]] || exit 82
mv -fT -- "$temporary" "$destination"
`

export async function installWslArtifact(
  distro: string,
  expectedVersion: string,
  opts: RunWslOptions & {
    directory?: string
    run?: typeof runWslInDistro
    readManifest?: typeof readCliManifest
    verifyArtifact?: typeof verifyCliArtifact
  } = {},
) {
  const run = opts.run ?? runWslInDistro
  const command = async (args: string[]) => {
    opts.signal?.throwIfAborted()
    const result = await run(args, distro, { signal: opts.signal, timeoutMs: Math.min(opts.timeoutMs ?? 20_000, 20_000) })
    if (result.code !== 0) {
      throw new WslArtifactError(result.code === 82 ? "version" : result.code === 83 ? "abi" : result.code === 84 ? "bytes" : result.code === 85 ? "path" : "command")
    }
    return result.stdout.trim()
  }
  const probe = (await command(["bash", "-c", `${guestEnvironment}\nuname -m\ngetconf GNU_LIBC_VERSION || exit 83`])).split(/\r?\n/)
  const target = linuxGuestTarget(probe[0] ?? "", probe[1] ?? "")
  const directory = opts.directory ?? await cliArtifactDirectory()
  const manifest = await (opts.readManifest ?? readCliManifest)(directory)
  const artifact = await (opts.verifyArtifact ?? verifyCliArtifact)(directory, target)
  if (manifest.version !== expectedVersion || artifact.version !== manifest.version) throw new WslArtifactError("version")
  const entry = manifest.artifacts.find((item) => item.target === target)
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new WslArtifactError("bytes")
  const source = await command(["wslpath", "-u", "--", artifact.path])
  if (!source.startsWith("/") || /[\r\n\0]/.test(source)) throw new WslArtifactError("path")
  await command(["timeout", "18s", "bash", "-c", installGuestScript, "orchestra-install", source, entry.sha256, manifest.version])
}

async function cliArtifactDirectory() {
  const { app } = await import("electron")
  return app.isPackaged ? join(process.resourcesPath, "cli") : join(app.getAppPath(), "resources", "cli")
}
