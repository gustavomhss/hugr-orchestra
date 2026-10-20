import { $ } from "bun"
import { dirname, join } from "node:path"
import { desktopCliTargets, stageCliArtifacts } from "./cli-staging"
import { nativeCliTarget, omniCompanions, ripgrepSigning, signatureCheck } from "../src/main/cli-artifacts"
import { ResourcePaths } from "./resource-paths"

export type Channel = "dev" | "beta" | "prod"
export const RUST_TARGET = Bun.env.RUST_TARGET

export function resolveChannel(): Channel {
  const raw = Bun.env.ORCHESTRA_CHANNEL
  return raw === "beta" || raw === "prod" ? raw : "dev"
}

export async function buildCliToResources(input: { targets?: readonly string[]; prebuilt?: string } = {}) {
  const paths = ResourcePaths.make(import.meta.dir)
  const cli = paths.cli
  const version =
    process.env.ORCHESTRA_VERSION ?? (await Bun.file(join(paths.orchestra, "package.json")).json()).version
  const targets = input.targets ?? desktopCliTargets(...placement())
  const prebuilt = input.prebuilt ?? process.env.ORCHESTRA_CLI_PREBUILT_DIR
  if (prebuilt === undefined) {
    await targets.reduce(async (previous, target) => {
      await previous
      // Workspace setup owns dependency provisioning; reinstalling here can replace the runner's hoisted layout.
      await $`bun script/build.ts --target ${target} --skip-install`
        .cwd(cli)
        .env({ ...process.env, ORCHESTRA_VERSION: version })
    }, Promise.resolve())
  }
  return stageCliArtifacts({
    dist: join(cli, "dist"),
    prebuilt,
    directory: paths.cliResources,
    version,
    targets,
    // The CLI and the rg it ships are signed alike; rg needs none of the CLI's JIT entitlements, only the hardened
    // runtime that notarization requires.
    sign: async (path, target, kind) => {
      if (target.startsWith("windows-") && process.platform === "win32" && process.env.GITHUB_ACTIONS === "true")
        await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ${paths.signWindows} ${path}`
      if (target.startsWith("darwin-") && process.platform === "darwin") {
        const identity = process.env.CSC_NAME ?? "-"
        const entitlements = kind === "cli" ? ["--entitlements", join(paths.desktop, "resources/entitlements.plist")] : []
        const options = identity === "-" ? [] : ["--options", "runtime", "--timestamp", ...entitlements]
        await $`codesign --force --sign ${identity} ${options} ${path}`
        // hugr_omni.node and its supervisor need no JIT, so the staged pair is signed like the rg and the app's own
        // Resources/omni pair (the empty entitlements.omni.plist); a signed build's deep verification then passes.
        if (kind === "cli")
          for (const name of omniCompanions(target))
            await $`codesign --force --sign ${identity} ${identity === "-" ? [] : ["--options", "runtime", "--timestamp"]} ${join(dirname(path), `omni-${target}`, name)}`
      }
      if (kind === "cli" && target === nativeCliTarget(process.platform, process.arch)) {
        const reported = (await $`${path} --version`.text()).trim()
        if (reported !== version)
          throw new Error(`Owned CLI compiled version mismatch: ${target}`)
      }
    },
    signature: async (file, target) => {
      const check = signatureCheck(target, file)
      if (!check) return false
      const result = await $`${check.command} ${check.args}`.nothrow().quiet()
      return result.exitCode === 0 && check.valid(result.stdout.toString())
    },
    signing: (target) => ripgrepSigning(target),
  })
}

// The desktop's own platform and architecture: RUST_TARGET's when set, else this host's.
function placement(): [string, string] {
  if (!RUST_TARGET) return [process.platform, process.arch]
  const placement = {
    "aarch64-apple-darwin": ["darwin", "arm64"],
    "x86_64-apple-darwin": ["darwin", "x64"],
    "aarch64-pc-windows-msvc": ["win32", "arm64"],
    "x86_64-pc-windows-msvc": ["win32", "x64"],
    "aarch64-unknown-linux-gnu": ["linux", "arm64"],
    "x86_64-unknown-linux-gnu": ["linux", "x64"],
  }[RUST_TARGET]
  if (!placement) throw new Error(`Unsupported desktop CLI build target: ${RUST_TARGET}`)
  return [placement[0]!, placement[1]!]
}
