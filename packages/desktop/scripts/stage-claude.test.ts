import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { stageClaude, verifyClaudeAsset } from "./stage-claude"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orchestra-claude-stage-"))
  roots.push(root)
  const sdk = join(root, "sdk")
  const platform = process.platform
  const arch = process.arch
  const name = `@anthropic-ai/claude-agent-sdk-${platform}-${arch}`
  const native = join(sdk, "node_modules", name)
  await mkdir(native, { recursive: true })
  await writeFile(
    join(sdk, "package.json"),
    JSON.stringify({
      name: "@anthropic-ai/claude-agent-sdk",
      version: "0.3.289",
      claudeCodeVersion: "2.1.289",
      optionalDependencies: { [name]: "0.3.289" },
    }),
  )
  await writeFile(
    join(native, "package.json"),
    JSON.stringify({
      name,
      version: "0.3.289",
      os: [platform],
      cpu: [arch],
    }),
  )
  const binary = join(native, platform === "win32" ? "claude.exe" : "claude")
  await writeFile(binary, nativeHeader(platform, arch), { mode: 0o755 })
  return { sdk, binary, directory: join(root, "resources/claude-code"), platform, arch }
}

function nativeHeader(platform: string, arch: string) {
  // Complete identity headers followed by opaque payload bytes; these fixtures are never executed.
  const bytes = Buffer.alloc(512)
  bytes.fill(0x61, 384)
  if (platform === "win32") {
    bytes.writeUInt16LE(0x5a4d, 0)
    bytes.writeUInt32LE(0x80, 0x3c)
    bytes.writeUInt32LE(0x4550, 0x80)
    bytes.writeUInt16LE(arch === "x64" ? 0x8664 : 0xaa64, 0x84)
    bytes.writeUInt16LE(240, 0x94)
    bytes.writeUInt16LE(0x22, 0x96)
    bytes.writeUInt16LE(0x20b, 0x98)
    return bytes
  }
  if (platform === "darwin") {
    bytes.writeUInt32LE(0xfeedfacf, 0)
    bytes.writeUInt32LE(arch === "x64" ? 0x01000007 : 0x0100000c, 4)
    bytes.writeUInt32LE(arch === "x64" ? 3 : 0, 8)
    bytes.writeUInt32LE(2, 12)
    return bytes
  }
  if (platform === "linux") {
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1])
    bytes.writeUInt16LE(2, 16)
    bytes.writeUInt16LE(arch === "x64" ? 62 : 183, 18)
    bytes.writeUInt32LE(1, 20)
    bytes.writeUInt16LE(64, 52)
    return bytes
  }
  throw new Error(`Unsupported fixture host: ${platform}-${arch}`)
}

test("stages native SDK bytes unchanged with a target/version/hash receipt", async () => {
  const input = await fixture()
  const staged = await stageClaude(input)
  const original = await readFile(input.binary)
  expect(await readFile(staged.path)).toEqual(original)
  expect(staged).toMatchObject({
    schema: 1,
    target: `${input.platform}-${input.arch}`,
    package: `@anthropic-ai/claude-agent-sdk-${input.platform}-${input.arch}`,
    sdkVersion: "0.3.289",
    claudeCodeVersion: "2.1.289",
    file: input.platform === "win32" ? "claude.exe" : "claude",
    sha256: createHash("sha256").update(original).digest("hex"),
  })
  expect(await verifyClaudeAsset(input.directory, input.platform, input.arch, input.sdk)).toEqual(staged)
})

test("missing or foreign source fails before replacing admitted bytes", async () => {
  const input = await fixture()
  const staged = await stageClaude(input)
  const admitted = await readFile(staged.path)
  await rm(input.binary)
  await expect(stageClaude(input)).rejects.toThrow("CLAUDE_ASSET_MISSING")
  expect(await readFile(staged.path)).toEqual(admitted)
  await writeFile(input.binary, nativeHeader(input.platform, input.arch === "x64" ? "arm64" : "x64"), { mode: 0o755 })
  await expect(stageClaude(input)).rejects.toThrow("CLAUDE_ASSET_BINARY_TARGET_MISMATCH")
  expect(await readFile(staged.path)).toEqual(admitted)
  await writeFile(input.binary, nativeHeader(input.platform === "win32" ? "darwin" : "win32", input.arch))
  await expect(stageClaude(input)).rejects.toThrow("CLAUDE_ASSET_BINARY_TARGET_MISMATCH")
  expect(await readFile(staged.path)).toEqual(admitted)
  await writeFile(input.binary, admitted)
  if (process.platform !== "win32") {
    await chmod(input.binary, 0o644)
    await expect(stageClaude(input)).rejects.toThrow("CLAUDE_ASSET_NOT_EXECUTABLE")
    expect(await readFile(staged.path)).toEqual(admitted)
    await chmod(input.binary, 0o755)
  }
  expect(await stageClaude(input)).toEqual(staged)
})

test("packaging rejects missing, changed, symlinked and wrong-CPU assets, then accepts restoration", async () => {
  const input = await fixture()
  const staged = await stageClaude(input)
  const original = await readFile(staged.path)
  const manifest = await readFile(join(input.directory, "manifest.json"), "utf8")
  const verify = () => verifyClaudeAsset(input.directory, input.platform, input.arch, input.sdk)
  await rm(staged.path)
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_MISSING")
  await symlink(input.binary, staged.path)
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_NOT_REGULAR")
  await rm(staged.path)
  const changed = Buffer.from(original)
  changed[changed.length - 1] ^= 1
  await writeFile(staged.path, changed, { mode: 0o755 })
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_DIGEST_MISMATCH")
  const foreign = nativeHeader(input.platform, input.arch === "x64" ? "arm64" : "x64")
  await writeFile(staged.path, foreign)
  // Re-hashing a foreign executable must not turn it into this target's asset.
  await writeFile(
    join(input.directory, "manifest.json"),
    JSON.stringify({
      ...JSON.parse(manifest),
      sha256: createHash("sha256").update(foreign).digest("hex"),
    }),
  )
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_BINARY_TARGET_MISMATCH")
  const foreignABI = nativeHeader(input.platform === "win32" ? "darwin" : "win32", input.arch)
  await writeFile(staged.path, foreignABI)
  await writeFile(
    join(input.directory, "manifest.json"),
    JSON.stringify({
      ...JSON.parse(manifest),
      sha256: createHash("sha256").update(foreignABI).digest("hex"),
    }),
  )
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_BINARY_TARGET_MISMATCH")
  await writeFile(staged.path, original)
  await writeFile(join(input.directory, "manifest.json"), manifest)
  expect(await verify()).toEqual(staged)
})

test("receipt cannot name another SDK version, target, executable path or an empty asset", async () => {
  const input = await fixture()
  const staged = await stageClaude(input)
  const manifest = await readFile(join(input.directory, "manifest.json"), "utf8")
  const verify = () => verifyClaudeAsset(input.directory, input.platform, input.arch, input.sdk)
  const foreignArch = input.arch === "x64" ? "arm64" : "x64"
  for (const mutation of [
    { sdkVersion: "0.3.288" },
    { claudeCodeVersion: "2.1.288" },
    { target: `${input.platform}-${foreignArch}` },
    { package: `@anthropic-ai/claude-agent-sdk-${input.platform}-${foreignArch}` },
    { file: "../../host-executable" },
  ]) {
    await writeFile(join(input.directory, "manifest.json"), JSON.stringify({ ...JSON.parse(manifest), ...mutation }))
    await expect(verify()).rejects.toThrow()
  }
  await writeFile(join(input.directory, "manifest.json"), "{}")
  await expect(verify()).rejects.toThrow()
  await writeFile(join(input.directory, "manifest.json"), manifest)
  await writeFile(staged.path, Buffer.alloc(0))
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_BINARY_TARGET_MISMATCH")
})

test("installed native SDK package stages without executing Claude or reading login", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestra-claude-installed-"))
  roots.push(directory)
  const staged = await stageClaude({ directory: join(directory, "claude-code") })
  expect(staged.target).toBe(`${process.platform}-${process.arch}`)
  expect(staged.sdkVersion).toBe("0.3.289")
  expect(staged.claudeCodeVersion).toBe("2.1.289")
  expect(await verifyClaudeAsset(join(directory, "claude-code"), process.platform, process.arch)).toEqual(staged)
  const original = await readFile(staged.path)
  const changed = Buffer.from(original)
  changed[changed.length - 1] ^= 1
  await writeFile(staged.path, changed)
  await expect(verifyClaudeAsset(join(directory, "claude-code"), process.platform, process.arch)).rejects.toThrow(
    "CLAUDE_ASSET_DIGEST_MISMATCH",
  )
  await rm(staged.path)
  await expect(verifyClaudeAsset(join(directory, "claude-code"), process.platform, process.arch)).rejects.toThrow(
    "CLAUDE_ASSET_MISSING",
  )
  await writeFile(staged.path, original, { mode: 0o755 })
  expect(await verifyClaudeAsset(join(directory, "claude-code"), process.platform, process.arch)).toEqual(staged)
})
