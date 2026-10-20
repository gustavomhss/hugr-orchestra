import { constants } from "node:fs"
import { cp, lstat, open, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import { copyTreeSitter, requireTreeSitterBundle, treeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"

export type CliArtifactManifest = {
  schema: 1
  version: string
  artifacts: ReadonlyArray<{ target: string; file: string; sha256: string }>
}

export function nativeCliTarget(platform: string, arch: string): string {
  if (!["darwin", "win32", "linux"].includes(platform) || !["arm64", "x64"].includes(arch))
    throw new Error(`Unsupported CLI platform: ${platform}/${arch}`)
  return `${platform === "win32" ? "windows" : platform}-${arch}${arch === "x64" ? "-baseline" : ""}`
}

// The omni pair a CLI loads from beside its binary: the addon plus its supervisor, named .exe on Windows. The CLI
// build ships them in bin/ from OMNI_ARTIFACTS; producers stage them in omni-<target>/ and the installer copies them
// next to the installed binary.
export function omniCompanions(target: string) {
  return ["hugr_omni.node", target.startsWith("windows-") ? "hugr-omni-supervisor.exe" : "hugr-omni-supervisor"]
}

export class OmniPairMissingError extends Error {
  constructor(target: string, path: string) {
    super(
      `Omni pair missing for ${target}: ${path} must be a regular file. Build the CLI with OMNI_ARTIFACTS so it ships ${omniCompanions(target).join(" and ")} next to the binary.`,
    )
    this.name = "OmniPairMissingError"
  }
}

// Both files of the pair as regular files in one directory, or a named error.
export function requireOmniPair(directory: string, target: string) {
  return Promise.all(
    omniCompanions(target).map(async (name) => {
      const path = join(directory, name)
      if (!(await lstat(path).catch(() => undefined))?.isFile()) throw new OmniPairMissingError(target, path)
      return path
    }),
  )
}

// A CLI loads maestro-arsenal's tree-sitter from tree-sitter/ beside its binary. The bundle keeps each target's copy in
// tree-sitter-<target>/, staged from the CLI build's bin/tree-sitter.
export function cliTreeSitterTarget(target: string) {
  const [platform, arch] = target.split("-")
  return { os: platform === "windows" ? "win32" : platform!, arch: arch!, abi: target.endsWith("-musl") ? "musl" : undefined }
}

/** Copies a target's tree-sitter bundle from `from` to `to`, refusing by name one that lacks a file or a binding. */
export function copyCliTreeSitter(from: string, to: string, target: string) {
  const bundle = cliTreeSitterTarget(target)
  requireTreeSitterBundle(from, bundle)
  copyTreeSitter(treeSitterBundle(bundle).map((file) => ({ from: join(from, file), to: file })), to, bundle)
}

/** The ripgrep pin key for a CLI target; undefined where ripgrep publishes no build for it. */
export function cliRipgrepKey(target: string) {
  return RipgrepBundle.key(cliTreeSitterTarget(target))
}

/**
 * How to check a CLI target's code signature on this host, for a caller that spawns it: `codesign --verify --strict` for
 * macOS code, Authenticode status `Valid` for Windows code. Undefined where the target is never signed (Linux) or this
 * host cannot check it.
 */
export function signatureCheck(target: string, file: string, platform: string = process.platform) {
  if (target.startsWith("darwin-") && platform === "darwin")
    return { command: "codesign", args: ["--verify", "--strict", file], valid: (_stdout: string) => true }
  if (target.startsWith("windows-") && platform === "win32")
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-AuthenticodeSignature -LiteralPath '${file.replaceAll("'", "''")}').Status`,
      ],
      valid: (stdout: string) => stdout.trim() === "Valid",
    }
}

/**
 * Whether staging signs this target's executables, so an rg left unsigned means signing was skipped: macOS code is
 * always signed on a macOS host (ad hoc without an identity); Windows code only where scripts/sign-windows.ps1 can
 * sign (Actions with Azure Artifact Signing configured). An intentionally unsigned build is byte-checked against the pin.
 */
export function ripgrepSigning(target: string, env: Record<string, string | undefined> = process.env, platform: string = process.platform) {
  if (target.startsWith("darwin-") && platform === "darwin") return "required" as const
  if (
    target.startsWith("windows-") &&
    platform === "win32" &&
    env.GITHUB_ACTIONS === "true" &&
    ["AZURE_TRUSTED_SIGNING_ENDPOINT", "AZURE_TRUSTED_SIGNING_ACCOUNT_NAME", "AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE"].every((name) => env[name])
  )
    return "required" as const
}

/**
 * Copies a ripgrep directory staged by RipgrepBundle (rg, its license texts and manifest) from `from` to `to`, checking
 * both against the pins for `target`; a signed rg must pass `signature`. Returns the copy's check.
 */
export async function copyCliRipgrep(
  from: string,
  to: string,
  target: string,
  options: Parameters<typeof RipgrepBundle.verify>[2] = {},
) {
  const key = cliRipgrepKey(target)
  if (!key) throw new Error(`ripgrep publishes no build for ${target}`)
  await RipgrepBundle.verify(from, key, options)
  await cp(from, to, { recursive: true, errorOnExist: true, force: false })
  return RipgrepBundle.verify(to, key, options)
}

export async function readCliManifest(directory: string): Promise<CliArtifactManifest> {
  const value: unknown = JSON.parse((await readCliFile(directory, "manifest.json")).toString("utf8"))
  if (!value || typeof value !== "object") throw new Error("Invalid CLI manifest")
  const manifest = value as Partial<CliArtifactManifest>
  if (
    manifest.schema !== 1 ||
    typeof manifest.version !== "string" ||
    !manifest.version.trim() ||
    manifest.version !== manifest.version.trim() ||
    /[\x00-\x1f]/.test(manifest.version) ||
    !Array.isArray(manifest.artifacts) ||
    !manifest.artifacts.length
  )
    throw new Error("Invalid CLI manifest schema/version/artifacts")
  const targets = new Set<string>()
  const files = new Set<string>()
  await Promise.all(
    manifest.artifacts.map(async (artifact: unknown) => {
      if (!artifact || typeof artifact !== "object") throw new Error("Invalid CLI artifact")
      const entry = artifact as Partial<CliArtifactManifest["artifacts"][number]>
      if (
        typeof entry.target !== "string" ||
        !/^(?:darwin|windows)-(?:arm64|x64(?:-baseline)?)$|^linux-(?:arm64|x64(?:-baseline)?)(?:-musl)?$/.test(
          entry.target,
        ) ||
        typeof entry.file !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.file) ||
        entry.file === "manifest.json" ||
        typeof entry.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      )
        throw new Error("Invalid CLI artifact target/file/digest")
      if (targets.has(entry.target) || files.has(entry.file.toLowerCase()))
        throw new Error("Duplicate CLI artifact target/file")
      targets.add(entry.target)
      files.add(entry.file.toLowerCase())
      await requireCliFile(directory, entry.file)
    }),
  )
  return manifest as CliArtifactManifest
}

export async function verifyCliArtifact(directory: string, target: string): Promise<{ path: string; version: string }> {
  const manifest = await readCliManifest(directory)
  const artifact = manifest.artifacts.find((entry) => entry.target === target)
  if (!artifact) throw new Error(`CLI artifact missing for target: ${target}`)
  if (
    createHash("sha256")
      .update(await readCliFile(directory, artifact.file))
      .digest("hex") !== artifact.sha256
  )
    throw new Error(`CLI artifact digest mismatch: ${target}`)
  return { path: resolve(directory, artifact.file), version: manifest.version }
}

async function requireCliFile(directory: string, file: string) {
  if (!(await lstat(directory)).isDirectory()) throw new Error("CLI artifact root must be a real directory")
  const root = await realpath(directory)
  const path = join(root, file)
  const stat = await lstat(path)
  if (!stat.isFile() || (await realpath(path)) !== path) throw new Error("CLI artifact must be a confined regular file")
  return { path, stat }
}

async function readCliFile(directory: string, file: string) {
  const input = await requireCliFile(directory, file)
  const handle = await open(input.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  return handle
    .stat()
    .then(async (stat) => {
      if (!stat.isFile() || stat.dev !== input.stat.dev || stat.ino !== input.stat.ino)
        throw new Error("CLI artifact must be a confined regular file")
      return handle.readFile()
    })
    .finally(() => handle.close())
}
