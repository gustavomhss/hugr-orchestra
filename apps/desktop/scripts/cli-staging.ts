import { createHash } from "node:crypto"
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path"
import { realpath } from "node:fs/promises"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"
import {
  cliRipgrepKey,
  copyCliRipgrep,
  copyCliTreeSitter,
  nativeCliTarget,
  omniCompanions,
  readCliManifest,
  requireOmniPair,
  verifyCliArtifact,
} from "../src/main/cli-artifacts"
import type { CliArtifactManifest } from "../src/main/cli-artifacts"

export function desktopCliTargets(platform: string, arch: string) {
  return [nativeCliTarget(platform, arch), ...(platform === "win32" ? ["linux-arm64", "linux-x64-baseline"] : [])]
}

export async function stageCliArtifacts(input: {
  dist: string
  prebuilt?: string
  directory: string
  version: string
  targets: readonly string[]
  /** Signs a staged executable: the CLI itself, or the rg it ships. */
  sign?: (path: string, target: string, kind: "cli" | "ripgrep") => Promise<void>
  /** Checks a signed rg's code signature (cli-artifacts.ts signatureCheck); without one a signed rg is refused. */
  signature?: (file: string, target: string) => Promise<boolean>
  /** "required" for a target whose rg `sign` must have signed (cli-artifacts.ts ripgrepSigning). */
  signing?: (target: string) => "required" | undefined
}) {
  if (
    !input.targets.length ||
    new Set(input.targets).size !== input.targets.length ||
    input.targets.some(
      (target) =>
        ![
          "darwin-arm64",
          "darwin-x64-baseline",
          "windows-arm64",
          "windows-x64-baseline",
          "linux-arm64",
          "linux-x64-baseline",
        ].includes(target),
    )
  )
    throw new Error("Unsupported or duplicate desktop CLI artifact target")
  // Bun's realpath and rename can disagree on symlink/.. traversal. Reject
  // parent segments rather than checking one path spelling and replacing another.
  if (input.prebuilt !== undefined && [input.prebuilt, input.directory].some((path) => path.split(/[\\/]/).includes("..")))
    throw new Error("Owned CLI prebuilt source/output overlap or ambiguous traversal")
  const prebuilt = input.prebuilt === undefined ? undefined : await readCliManifest(input.prebuilt)
  if (prebuilt && prebuilt.version !== input.version) throw new Error("Owned CLI prebuilt version mismatch")
  if (input.prebuilt !== undefined) {
    const producer = await realpath(input.prebuilt)
    const destination = await canonicalDirectory(input.directory)
    if ([relative(producer, destination), relative(destination, producer)].some(
      (path) => path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)),
    )) throw new Error("Owned CLI prebuilt source/output overlap")
  }
  await mkdir(dirname(input.directory), { recursive: true })
  const staging = await mkdtemp(join(dirname(input.directory), ".cli-stage-"))
  return Promise.allSettled(
    input.targets.map(async (target) => {
      const source = join(input.dist, `cli-${target}`)
      const incoming = prebuilt?.artifacts.find((entry) => entry.target === target)
      if (prebuilt && !incoming) throw new Error(`Owned CLI prebuilt artifact missing: ${target}`)
      const verified = input.prebuilt === undefined ? undefined : await verifyCliArtifact(input.prebuilt, target)
      const executable = target.startsWith("windows-") ? "orchestra.exe" : "orchestra"
      if (!prebuilt) {
        const metadata: unknown = JSON.parse(await readFile(join(source, "package.json"), "utf8"))
        if (!metadata || typeof metadata !== "object" || !("version" in metadata) || metadata.version !== input.version)
          throw new Error(`Owned CLI artifact version mismatch: ${target}`)
        if (
          !(await lstat(source)).isDirectory() ||
          !(await lstat(join(source, "bin"))).isDirectory() ||
          !(await lstat(join(source, "bin", executable))).isFile() ||
          (await realpath(join(source, "bin", executable))) !== join(await realpath(source), "bin", executable)
        )
          throw new Error(`Owned CLI output must be regular: ${target}`)
      }
      const file = `orchestra-${target}${target.startsWith("windows-") ? ".exe" : ""}`
      const path = join(staging, file)
      await copyFile(verified?.path ?? join(source, "bin", executable), path)
      // Check the copied bytes against the producer descriptor before signing;
      // verification of the source alone leaves a copy-time race.
      if (incoming && createHash("sha256").update(await readFile(path)).digest("hex") !== incoming.sha256)
        throw new Error(`Owned CLI prebuilt digest mismatch: ${target}`)
      if (!target.startsWith("windows-")) await chmod(path, 0o755)
      // Every CLI parses with the tree-sitter its build ships in bin/tree-sitter; a producer directory is itself a
      // staged bundle, so there it sits in tree-sitter-<target>/.
      copyCliTreeSitter(
        input.prebuilt === undefined ? join(source, "bin", "tree-sitter") : join(input.prebuilt, `tree-sitter-${target}`),
        join(staging, `tree-sitter-${target}`),
        target,
      )
      // Every CLI's preflight needs its omni pair (the addon and the supervisor) next to the binary, so the bundle
      // keeps each target's copy in omni-<target>/ and the installer copies it beside the installed CLI. A producer
      // directory is itself a staged bundle, so there it sits in omni-<target>/ rather than bin/.
      const pair = await requireOmniPair(
        input.prebuilt === undefined ? join(source, "bin") : join(input.prebuilt, `omni-${target}`),
        target,
      )
      await mkdir(join(staging, `omni-${target}`))
      await Promise.all(pair.map((file) => copyFile(file, join(staging, `omni-${target}`, basename(file)))))
      if (process.platform !== "win32")
        await chmod(join(staging, `omni-${target}`, omniCompanions(target)[1]), 0o755)
      // Every CLI ships the pinned rg it runs (its server never downloads one) in ripgrep-<target>/: the installed CLI
      // and WSL guests copy it beside the binary, the desktop server is pointed at it. It is signed like the CLI.
      if (RipgrepBundle.enabled() && cliRipgrepKey(target)) {
        const ripgrep = join(staging, `ripgrep-${target}`)
        await copyCliRipgrep(
          input.prebuilt === undefined ? join(source, "bin", "ripgrep") : join(input.prebuilt, `ripgrep-${target}`),
          ripgrep,
          target,
          { signature: input.signature && ((file) => input.signature!(file, target)) },
        )
        await input.sign?.(join(ripgrep, target.startsWith("windows-") ? "rg.exe" : "rg"), target, "ripgrep")
        await RipgrepBundle.verify(ripgrep, cliRipgrepKey(target)!, {
          signature: input.signature && ((file) => input.signature!(file, target)),
          signed: input.signing?.(target),
        })
      }
      await input.sign?.(path, target, "cli")
      return {
        target,
        file,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      }
    }),
  )
    .then(async (results) => {
      const failed = results.find((result) => result.status === "rejected")
      if (failed?.status === "rejected") throw failed.reason
      const artifacts = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      const manifest: CliArtifactManifest = { schema: 1, version: input.version, artifacts }
      await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
      await Promise.all(artifacts.map((entry) => verifyCliArtifact(staging, entry.target)))
      // Validate all new bytes before replacing the previous resource tree.
      const previous = `${staging}-previous`
      const moved = await renameDirectory(input.directory, previous).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false
          throw error
        },
      )
      await renameDirectory(staging, input.directory).catch(async (error) => {
        if (moved) await renameDirectory(previous, input.directory)
        throw error
      })
      if (moved) await rm(previous, { recursive: true, force: true })
      return readCliManifest(input.directory)
    })
    .finally(() => rm(staging, { recursive: true, force: true }))
}

// The sign hook runs the staged CLI, and on GitHub's Windows runners the hosted agent's provjobd.exe opens a freshly
// run image for a moment; while it does, Windows refuses to rename the directory holding it (EPERM). Measured there,
// such a hold blocked the rename for 50 ms to 2.2 s. Retry exactly that, for up to 10 s. Any other error, any other
// platform, or a longer hold still fails.
const RENAME_HOLD_MS = 10_000

async function renameDirectory(from: string, to: string) {
  const deadline = performance.now() + RENAME_HOLD_MS
  for (;;) {
    const error = await rename(from, to).then(
      () => undefined,
      (error: NodeJS.ErrnoException) => error,
    )
    if (!error) return
    if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code ?? "")) throw error
    if (performance.now() >= deadline) throw error
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

// Resolve existing ancestors too: a new destination may be nested under a
// symlinked parent, even though realpath cannot resolve the final directory yet.
async function canonicalDirectory(directory: string): Promise<string> {
  return realpath(directory).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT" || dirname(directory) === directory) throw error
    return join(await canonicalDirectory(dirname(directory)), basename(directory))
  })
}
