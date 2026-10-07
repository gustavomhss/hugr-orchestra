import { $ } from "bun"
import { join, resolve } from "node:path"
import { desktopCliTargets, stageCliArtifacts } from "./cli-staging"
import { nativeCliTarget } from "../src/main/cli-artifacts"

export type Channel = "dev" | "beta" | "prod"

export function resolveChannel(): Channel {
  const raw = Bun.env.ORCHESTRA_CHANNEL
  return raw === "beta" || raw === "prod" ? raw : "dev"
}

export async function buildCliToResources() {
  const desktop = resolve(import.meta.dir, "..")
  const cli = resolve(desktop, "../cli")
  const version =
    process.env.ORCHESTRA_VERSION ?? (await Bun.file(join(desktop, "../orchestra/package.json")).json()).version
  const targets = process.env.RUST_TARGET
    ? targetsForRust(process.env.RUST_TARGET)
    : desktopCliTargets(process.platform, process.arch)
  await targets.reduce(async (previous, target) => {
    await previous
    await $`bun script/build.ts --target ${target}`.cwd(cli).env({ ...process.env, ORCHESTRA_VERSION: version })
  }, Promise.resolve())
  return stageCliArtifacts({
    dist: join(cli, "dist"),
    directory: join(desktop, "resources/cli"),
    version,
    targets,
    sign: async (path, target) => {
      if (target.startsWith("windows-") && process.platform === "win32" && process.env.GITHUB_ACTIONS === "true")
        await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ${join(desktop, "../../script/sign-windows.ps1")} ${path}`
      if (target.startsWith("darwin-") && process.platform === "darwin") {
        const identity = process.env.CSC_NAME ?? "-"
        const options =
          identity === "-"
            ? []
            : ["--options", "runtime", "--timestamp", "--entitlements", join(desktop, "resources/entitlements.plist")]
        await $`codesign --force --sign ${identity} ${options} ${path}`
      }
      if (target === nativeCliTarget(process.platform, process.arch)) {
        const reported = (await $`${path} --version`.text()).trim()
        if (![version, `orchestra v${version}`].includes(reported))
          throw new Error(`Owned CLI compiled version mismatch: ${target}`)
      }
    },
  })
}

function targetsForRust(target: string) {
  const placement = {
    "aarch64-apple-darwin": ["darwin", "arm64"],
    "x86_64-apple-darwin": ["darwin", "x64"],
    "aarch64-pc-windows-msvc": ["win32", "arm64"],
    "x86_64-pc-windows-msvc": ["win32", "x64"],
    "aarch64-unknown-linux-gnu": ["linux", "arm64"],
    "x86_64-unknown-linux-gnu": ["linux", "x64"],
  }[target]
  if (!placement) throw new Error(`Unsupported desktop CLI build target: ${target}`)
  return desktopCliTargets(placement[0]!, placement[1]!)
}
