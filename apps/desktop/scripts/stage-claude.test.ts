import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { chmod, mkdir, mkdtemp, open, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { stageClaude, verifyClaudeAsset } from "./stage-claude"

const roots: { directory: string; settled?: Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      const started = performance.now()
      // A Bun timeout can leave the body running; wait for its handle/restore finalizers before deleting its root.
      await root.settled
      expect(existsSync(root.directory)).toBe(true)
      await rm(root.directory, { recursive: true, force: true })
      expect(existsSync(root.directory)).toBe(false)
      console.log(
        "claude-stage-cleanup",
        JSON.stringify({ elapsedMs: performance.now() - started, rootExists: existsSync(root.directory) }),
      )
    }),
  )
}, 5000)

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orchestra-claude-stage-"))
  roots.push({ directory: root })
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
  await writeFile(join(native, "README.md"), "fixture readme\n")
  await writeFile(join(native, "LICENSE.md"), "fixture license\n")
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
  expect(await readFile(join(input.directory, "README.md"), "utf8")).toBe("fixture readme\n")
  expect(await readFile(join(input.directory, "LICENSE.md"), "utf8")).toBe("fixture license\n")
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

// Windows CI 38513424131 spent 15.96s rewriting 249,522,848 bytes. Probe one byte and rename the owned copy instead.
// Keep the existing 15s native filesystem/hash budget and separate 5s cleanup deadline.
test("installed native SDK package stages without executing Claude or reading login", async () => {
  const started = performance.now()
  const phases: { phase: string; ms: number; elapsedMs: number }[] = []
  const phase = (name: string, details: Record<string, number | boolean> = {}) => {
    const elapsedMs = performance.now() - started
    const entry = { phase: name, ms: elapsedMs - (phases.at(-1)?.elapsedMs ?? 0), elapsedMs }
    phases.push(entry)
    console.log("claude-stage-phase", JSON.stringify({ ...entry, ...details }))
  }
  const directory = await mkdtemp(join(tmpdir(), "orchestra-claude-installed-"))
  const settled = Promise.withResolvers<void>()
  roots.push({ directory, settled: settled.promise })
  try {
    phase("create-root")
    const staged = await stageClaude({ directory: join(directory, "claude-code") })
    phase("stage-source-hash-copy-staging-and-installed-verification")
    expect(staged.target).toBe(`${process.platform}-${process.arch}`)
    expect(staged.sdkVersion).toBe("0.3.289")
    expect(staged.claudeCodeVersion).toBe("2.1.289")
    expect(staged.sha256).toMatch(/^[a-f0-9]{64}$/)
    const verify = () => verifyClaudeAsset(join(directory, "claude-code"), process.platform, process.arch)
    expect(await verify()).toEqual(staged)
    phase("verify-admitted-read-sha256")

    const payload = await stat(staged.path)
    expect(payload.isFile()).toBe(true)
    expect(payload.size).toBeGreaterThan(0)
    if (process.platform !== "win32") expect(payload.mode & 0o111).toBeGreaterThan(0)
    const original = Buffer.alloc(1)
    const handle = await open(staged.path, "r+")
    try {
      expect((await handle.read(original, 0, 1, payload.size - 1)).bytesRead).toBe(1)
    } finally {
      await handle.close()
    }
    phase("read-last-byte-and-close", {
      bytesRead: original.length,
      payloadBytes: payload.size,
      fileHandleClosed: true,
    })

    const writeByte = async (byte: Buffer) => {
      const handle = await open(staged.path, "r+")
      try {
        const written = await handle.write(byte, 0, 1, payload.size - 1)
        expect(written.bytesWritten).toBe(1)
        return written.bytesWritten
      } finally {
        await handle.close()
      }
    }
    try {
      phase("write-one-flipped-byte-and-close", {
        bytesWritten: await writeByte(Buffer.from([original[0] ^ 1])),
        fileHandleClosed: true,
      })
      await expect(verify()).rejects.toThrow("CLAUDE_ASSET_DIGEST_MISMATCH")
      phase("verify-tampered-read-sha256")
    } finally {
      phase("restore-one-original-byte-and-close", { bytesWritten: await writeByte(original), fileHandleClosed: true })
    }
    expect(await verify()).toEqual(staged)
    phase("verify-byte-restoration-read-sha256")

    const sibling = `${staged.path}.missing`
    await rename(staged.path, sibling)
    try {
      phase("rename-to-sibling", { bytesWritten: 0 })
      await expect(verify()).rejects.toThrow("CLAUDE_ASSET_MISSING")
      phase("verify-missing")
    } finally {
      await rename(sibling, staged.path)
      phase("rename-back", { bytesWritten: 0 })
    }
    expect(await verify()).toEqual(staged)
    phase("verify-rename-restoration-read-sha256")
    const restored = await stat(staged.path)
    expect(restored.size).toBe(payload.size)
    expect(restored.mode).toBe(payload.mode)
    console.log(
      "claude-stage-body",
      JSON.stringify({
        platform: process.platform,
        arch: process.arch,
        bytes: payload.size,
        elapsedMs: performance.now() - started,
      }),
    )
  } finally {
    settled.resolve()
  }
}, 15000)
