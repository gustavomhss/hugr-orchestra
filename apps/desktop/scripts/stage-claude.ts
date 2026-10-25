import { createHash } from "node:crypto"
import { copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { Schema } from "effect"
import { NATIVE_MACHINES, nativeMachines } from "@orchestra/script/tree-sitter-prebuilds"
import { WorkspacePaths } from "@orchestra/script/workspace-paths"

// The V2 Claude Code engine owns the pinned SDK the desktop stages.
const engine = WorkspacePaths.make(import.meta.dirname).module("engine-claude-code")

const receipt = Schema.fromJsonString(
  Schema.Struct({
    schema: Schema.Literal(1),
    target: Schema.NonEmptyString,
    package: Schema.NonEmptyString,
    sdkVersion: Schema.NonEmptyString,
    claudeCodeVersion: Schema.NonEmptyString,
    file: Schema.Literals(["claude", "claude.exe"]),
    sha256: Schema.String,
  }),
)

export async function stageClaude(
  input: {
    directory?: string
    platform?: string
    arch?: string
    sdk?: string
  } = {},
) {
  const platform = input.platform ?? process.platform
  const arch = input.arch ?? process.arch
  const expected = await claudeSource(platform, arch, input.sdk)
  const native = createRequire(join(expected.sdk, "package.json")).resolve(`${expected.package}/package.json`)
  const metadata = JSON.parse(await readFile(native, "utf8"))
  if (
    metadata.name !== expected.package ||
    metadata.version !== expected.sdkVersion ||
    metadata.os?.length !== 1 ||
    metadata.os[0] !== platform ||
    metadata.cpu?.length !== 1 ||
    metadata.cpu[0] !== arch
  )
    throw new Error(`CLAUDE_ASSET_PACKAGE_MISMATCH: ${expected.package}`)
  const binary = join(dirname(native), expected.file)
  await requireBinary(binary, platform, arch)
  const sha256 = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex")
  const directory = resolve(input.directory ?? join(import.meta.dirname, "../resources/claude-code"))
  await mkdir(dirname(directory), { recursive: true })
  const staging = await mkdtemp(join(dirname(directory), ".claude-stage-"))
  try {
    // Copy signed upstream bytes unchanged; signing this executable would invalidate its receipt.
    await copyFile(binary, join(staging, expected.file))
    // Ship the native package's required notices beside its unmodified binary.
    await Promise.all(["README.md", "LICENSE.md"].map((file) => copyFile(join(dirname(native), file), join(staging, file))))
    await writeFile(
      join(staging, "manifest.json"),
      JSON.stringify(
        {
          schema: 1,
          target: expected.target,
          package: expected.package,
          sdkVersion: expected.sdkVersion,
          claudeCodeVersion: expected.claudeCodeVersion,
          file: expected.file,
          sha256,
        },
        null,
        2,
      ) + "\n",
    )
    await verifyClaudeAsset(staging, platform, arch, input.sdk)
    const previous = `${staging}-previous`
    const moved = await rename(directory, previous).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false
        throw error
      },
    )
    await rename(staging, directory).catch(async (error) => {
      if (moved) await rename(previous, directory)
      throw error
    })
    if (moved) await rm(previous, { recursive: true, force: true })
    return verifyClaudeAsset(directory, platform, arch, input.sdk)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function verifyClaudeAsset(directory: string, platform: string, arch: string, sdk?: string) {
  const expected = await claudeSource(platform, arch, sdk)
  const manifest = Schema.decodeUnknownSync(receipt)(await readFile(join(directory, "manifest.json"), "utf8"))
  if (manifest.target !== expected.target || manifest.package !== expected.package || manifest.file !== expected.file)
    throw new Error(`CLAUDE_ASSET_TARGET_MISMATCH: ${expected.target}`)
  if (manifest.sdkVersion !== expected.sdkVersion || manifest.claudeCodeVersion !== expected.claudeCodeVersion)
    throw new Error(`CLAUDE_ASSET_VERSION_MISMATCH: ${expected.sdkVersion}/${expected.claudeCodeVersion}`)
  const binary = join(directory, manifest.file)
  await requireBinary(binary, platform, arch)
  if (
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    createHash("sha256")
      .update(await readFile(binary))
      .digest("hex") !== manifest.sha256
  )
    throw new Error(`CLAUDE_ASSET_DIGEST_MISMATCH: ${binary}`)
  return { ...manifest, path: binary }
}

async function claudeSource(platform: string, arch: string, sdk?: string) {
  const target = `${platform}-${arch}`
  if (NATIVE_MACHINES[target] === undefined) throw new Error(`CLAUDE_ASSET_TARGET_UNSUPPORTED: ${target}`)
  const directory = sdk ?? dirname(createRequire(join(engine, "package.json")).resolve("@anthropic-ai/claude-agent-sdk"))
  const source = JSON.parse(await readFile(join(engine, "package.json"), "utf8"))
  const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"))
  const name = `@anthropic-ai/claude-agent-sdk-${target}`
  if (
    metadata.name !== "@anthropic-ai/claude-agent-sdk" ||
    metadata.version !== source.dependencies["@anthropic-ai/claude-agent-sdk"] ||
    metadata.optionalDependencies?.[name] !== metadata.version ||
    typeof metadata.claudeCodeVersion !== "string" ||
    !metadata.claudeCodeVersion.trim()
  )
    throw new Error(`CLAUDE_ASSET_SDK_MISMATCH: ${name}`)
  return {
    sdk: directory,
    target,
    package: name,
    sdkVersion: String(metadata.version),
    claudeCodeVersion: String(metadata.claudeCodeVersion),
    file: platform === "win32" ? "claude.exe" : "claude",
  }
}

async function requireBinary(binary: string, platform: string, arch: string) {
  const stat = await lstat(binary).catch((cause: unknown) => {
    throw new Error(`CLAUDE_ASSET_MISSING: ${binary}`, { cause })
  })
  if (!stat.isFile()) throw new Error(`CLAUDE_ASSET_NOT_REGULAR: ${binary}`)
  if (platform !== "win32" && !(stat.mode & 0o111)) throw new Error(`CLAUDE_ASSET_NOT_EXECUTABLE: ${binary}`)
  if (!nativeMachines(binary).includes(NATIVE_MACHINES[`${platform}-${arch}`]))
    throw new Error(`CLAUDE_ASSET_BINARY_TARGET_MISMATCH: ${platform}-${arch}: ${binary}`)
}

if (import.meta.main) console.log(JSON.stringify(await stageClaude()))
