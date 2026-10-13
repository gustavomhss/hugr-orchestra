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
  const native = join(sdk, "node_modules/@anthropic-ai/claude-agent-sdk-darwin-x64")
  await mkdir(native, { recursive: true })
  await writeFile(
    join(sdk, "package.json"),
    JSON.stringify({
      name: "@anthropic-ai/claude-agent-sdk",
      version: "0.3.289",
      claudeCodeVersion: "2.1.289",
      optionalDependencies: { "@anthropic-ai/claude-agent-sdk-darwin-x64": "0.3.289" },
    }),
  )
  await writeFile(
    join(native, "package.json"),
    JSON.stringify({
      name: "@anthropic-ai/claude-agent-sdk-darwin-x64",
      version: "0.3.289",
      os: ["darwin"],
      cpu: ["x64"],
    }),
  )
  // A Mach-O executable header followed by opaque signed-payload bytes; never executed by these tests.
  const bytes = Buffer.alloc(96, 0x61)
  bytes.writeUInt32LE(0xfeedfacf, 0)
  bytes.writeUInt32LE(0x01000007, 4)
  bytes.writeUInt32LE(2, 12)
  const binary = join(native, "claude")
  await writeFile(binary, bytes)
  await chmod(binary, 0o755)
  return { sdk, binary, directory: join(root, "resources/claude-code"), platform: "darwin", arch: "x64" }
}

test("stages native SDK bytes unchanged with a target/version/hash receipt", async () => {
  const input = await fixture()
  const staged = await stageClaude(input)
  const original = await readFile(input.binary)
  expect(await readFile(staged.path)).toEqual(original)
  expect(staged).toMatchObject({
    schema: 1,
    target: "darwin-x64",
    package: "@anthropic-ai/claude-agent-sdk-darwin-x64",
    sdkVersion: "0.3.289",
    claudeCodeVersion: "2.1.289",
    file: "claude",
    sha256: createHash("sha256").update(original).digest("hex"),
  })
  expect(await verifyClaudeAsset(input.directory, "darwin", "x64", input.sdk)).toEqual(staged)
})

test("missing or foreign source fails before replacing admitted bytes", async () => {
  const input = await fixture()
  const staged = await stageClaude(input)
  const admitted = await readFile(staged.path)
  await rm(input.binary)
  await expect(stageClaude(input)).rejects.toThrow("CLAUDE_ASSET_MISSING")
  expect(await readFile(staged.path)).toEqual(admitted)
  const wrong = Buffer.from(admitted)
  wrong.writeUInt32LE(0x0100000c, 4)
  await writeFile(input.binary, wrong)
  await chmod(input.binary, 0o755)
  await expect(stageClaude(input)).rejects.toThrow("CLAUDE_ASSET_BINARY_TARGET_MISMATCH")
  expect(await readFile(staged.path)).toEqual(admitted)
})

test("packaging rejects missing, changed, symlinked and wrong-CPU assets, then accepts restoration", async () => {
  const input = await fixture()
  const staged = await stageClaude(input)
  const original = await readFile(staged.path)
  const manifest = await readFile(join(input.directory, "manifest.json"), "utf8")
  const verify = () => verifyClaudeAsset(input.directory, "darwin", "x64", input.sdk)
  await rm(staged.path)
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_MISSING")
  await symlink(input.binary, staged.path)
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_NOT_REGULAR")
  await rm(staged.path)
  const changed = Buffer.from(original)
  changed[80] ^= 1
  await writeFile(staged.path, changed, { mode: 0o755 })
  await expect(verify()).rejects.toThrow("CLAUDE_ASSET_DIGEST_MISMATCH")
  changed.writeUInt32LE(0x0100000c, 4)
  await writeFile(staged.path, changed)
  // Re-hashing a foreign executable must not turn it into this target's asset.
  await writeFile(
    join(input.directory, "manifest.json"),
    JSON.stringify({
      ...JSON.parse(manifest),
      sha256: createHash("sha256").update(changed).digest("hex"),
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
  const verify = () => verifyClaudeAsset(input.directory, "darwin", "x64", input.sdk)
  for (const mutation of [
    { sdkVersion: "0.3.288" },
    { claudeCodeVersion: "2.1.288" },
    { target: "darwin-arm64" },
    { package: "@anthropic-ai/claude-agent-sdk-darwin-arm64" },
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
