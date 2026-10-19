import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
import { ClaudeCodeExecutable } from "@orchestra/engine-claude-code/executable"

/** Read only official package metadata and the documented native file; never inspect executable internals. */
export function resolveClaudeCodeResource(input: { root: string; os: string; arch: string; abi?: string }) {
  const target = ClaudeCodeExecutable.target(
    input.os,
    input.arch,
    input.os === "linux" ? (input.abi ?? "glibc") : undefined,
  )
  const require = createRequire(path.join(input.root, "package.json"))
  const sdk = (() => {
    try {
      return path.dirname(require.resolve("@anthropic-ai/claude-agent-sdk"))
    } catch (cause) {
      throw new ClaudeCodeExecutable.UnavailableError(
        `Missing pinned Claude Code SDK: ${ClaudeCodeExecutable.SDK_VERSION}`,
        { cause },
      )
    }
  })()
  const metadata = readMetadata(path.join(sdk, "package.json"))
  const name = `@anthropic-ai/claude-agent-sdk-${target}`
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("version" in metadata) ||
    metadata.version !== ClaudeCodeExecutable.SDK_VERSION ||
    !("claudeCodeVersion" in metadata) ||
    metadata.claudeCodeVersion !== ClaudeCodeExecutable.CODE_VERSION ||
    !("optionalDependencies" in metadata) ||
    !metadata.optionalDependencies ||
    typeof metadata.optionalDependencies !== "object" ||
    !(name in metadata.optionalDependencies) ||
    Reflect.get(metadata.optionalDependencies, name) !== ClaudeCodeExecutable.SDK_VERSION
  )
    throw new ClaudeCodeExecutable.UnavailableError(`Claude Code SDK metadata mismatch: ${name}`)
  const file = input.os === "win32" ? "claude.exe" : "claude"
  const source = (() => {
    try {
      return fs.realpathSync(createRequire(path.join(sdk, "package.json")).resolve(`${name}/${file}`))
    } catch (cause) {
      throw new ClaudeCodeExecutable.UnavailableError(
        `Missing pinned Claude Code resource: ${name}@${metadata.version}/${file}`,
        { cause },
      )
    }
  })()
  const native = readMetadata(path.join(path.dirname(source), "package.json"))
  if (
    !native ||
    typeof native !== "object" ||
    !("name" in native) ||
    native.name !== name ||
    !("version" in native) ||
    native.version !== metadata.version ||
    !("os" in native) ||
    !Array.isArray(native.os) ||
    !native.os.includes(input.os) ||
    !("cpu" in native) ||
    !Array.isArray(native.cpu) ||
    !native.cpu.includes(input.arch) ||
    !fs.statSync(source).isFile()
  )
    throw new ClaudeCodeExecutable.UnavailableError(`Invalid pinned Claude Code resource: ${name}@${metadata.version}`)
  return { source, file, target, sdkVersion: metadata.version, claudeCodeVersion: metadata.claudeCodeVersion }
}

function readMetadata(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (cause) {
    throw new ClaudeCodeExecutable.UnavailableError(`Cannot read pinned Claude Code package metadata: ${file}`, {
      cause,
    })
  }
}

/** Production Bun and Node builders share the same sidecar layout and copied-byte manifest. */
export function stageClaudeCodeResource(resource: ReturnType<typeof resolveClaudeCodeResource>, directory: string) {
  const source = fs.readFileSync(resource.source)
  const sha256 = createHash("sha256").update(source).digest("hex")
  fs.mkdirSync(directory, { recursive: true })
  fs.copyFileSync(resource.source, path.join(directory, resource.file))
  fs.chmodSync(path.join(directory, resource.file), 0o755)
  if (
    createHash("sha256")
      .update(fs.readFileSync(path.join(directory, resource.file)))
      .digest("hex") !== sha256
  )
    throw new ClaudeCodeExecutable.UnavailableError(`Claude Code staged bytes differ: ${resource.target}`)
    // Ship the native package's required notices beside its unmodified binary.
  ;["README.md", "LICENSE.md"].forEach((file) =>
    fs.copyFileSync(path.join(path.dirname(resource.source), file), path.join(directory, file)),
  )
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify(
      {
        schema: 1,
        sdkVersion: resource.sdkVersion,
        claudeCodeVersion: resource.claudeCodeVersion,
        target: resource.target,
        file: resource.file,
        sha256,
      },
      null,
      2,
    ) + "\n",
  )
}

/** Packaging checks staged bytes again, including after signing, against the producer's copied-byte descriptor. */
export function verifyClaudeCodeResource(directory: string, input: { os: string; arch: string; abi?: string }) {
  const executable = ClaudeCodeExecutable.resolve({
    resources: path.resolve(directory),
    platform: input.os,
    arch: input.arch,
    libc: input.os === "linux" ? (input.abi ?? "glibc") : undefined,
    env: {},
  })
  if (!executable) throw new ClaudeCodeExecutable.UnavailableError(`Missing Claude Code resource: ${directory}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")) as { sha256: string }
  if (createHash("sha256").update(fs.readFileSync(executable)).digest("hex") !== manifest.sha256)
    throw new ClaudeCodeExecutable.UnavailableError(`Claude Code packaged bytes differ: ${directory}`)
  return executable
}
