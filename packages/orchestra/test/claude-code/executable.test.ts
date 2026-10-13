import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { ClaudeCodeExecutable } from "@/claude-code/executable"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import {
  resolveClaudeCodeResource,
  stageClaudeCodeResource,
  verifyClaudeCodeResource,
} from "../../script/claude-code-resources"
import { tmpdir } from "../fixture/fixture"

const targets = [
  ["darwin", "x64", undefined, "darwin-x64"],
  ["darwin", "arm64", undefined, "darwin-arm64"],
  ["win32", "x64", undefined, "win32-x64"],
  ["win32", "arm64", undefined, "win32-arm64"],
  ["linux", "x64", "glibc", "linux-x64"],
  ["linux", "arm64", "glibc", "linux-arm64"],
  ["linux", "x64", "musl", "linux-x64-musl"],
  ["linux", "arm64", "musl", "linux-arm64-musl"],
] as const

test("source execution keeps documented SDK resolution", () => {
  expect(ClaudeCodeExecutable.resolve({ compiled: false, env: {} })).toBeUndefined()
})

test.each(targets)("stages and resolves the exact %s/%s/%s platform resource", async (os, arch, abi, target) => {
  await using tmp = await tmpdir()
  const file = os === "win32" ? "claude.exe" : "claude"
  const source = await installed(tmp.path, target, os, arch, file)
  const resource = resolveClaudeCodeResource({ root: tmp.path, os, arch, abi })
  const directory = path.join(tmp.path, "deployed", "claude-code")
  stageClaudeCodeResource(resource, directory)
  expect(resource.target).toBe(target)
  expect(await fs.readFile(path.join(directory, file))).toEqual(await fs.readFile(source))
  const manifest = await Bun.file(path.join(directory, "manifest.json")).json()
  expect(manifest.sha256).toBe(
    createHash("sha256")
      .update(await fs.readFile(source))
      .digest("hex"),
  )
  expect(ClaudeCodeExecutable.resolve({ resources: directory, platform: os, arch, libc: abi, env: {} })).toBe(
    await fs.realpath(path.join(directory, file)),
  )
  expect(await Bun.file(path.join(directory, "LICENSE.md")).text()).toBe("fixture notice")
  expect(verifyClaudeCodeResource(directory, { os, arch, abi })).toBe(await fs.realpath(path.join(directory, file)))
  await Bun.write(path.join(directory, file), "tampered resource")
  expect(() => verifyClaudeCodeResource(directory, { os, arch, abi })).toThrow("deployed bytes differ")
})

test("bundled Node and Bun resolve deployed siblings independently of cwd and checkout", async () => {
  await using tmp = await tmpdir()
  const source = await installed(tmp.path, "darwin-x64", "darwin", "x64", "claude")
  const directory = path.join(tmp.path, "deployed", "claude-code")
  stageClaudeCodeResource(resolveClaudeCodeResource({ root: tmp.path, os: "darwin", arch: "x64" }), directory)
  await fs.rm(path.join(tmp.path, "node_modules"), { recursive: true })
  const input = { compiled: true, platform: "darwin", arch: "x64", env: {} }
  expect(
    ClaudeCodeExecutable.resolve({ ...input, runtime: "bun", execPath: path.join(tmp.path, "deployed", "orchestra") }),
  ).toBe(await fs.realpath(path.join(directory, "claude")))
  expect(
    ClaudeCodeExecutable.resolve({
      ...input,
      runtime: "node",
      moduleURL: pathToFileURL(path.join(tmp.path, "deployed", "node.mjs")).href,
    }),
  ).toBe(await fs.realpath(path.join(directory, "claude")))
  expect(await fs.exists(source)).toBe(false)
})

test("explicit documented install wins; host turns and promptless probes share the centralized option", async () => {
  await using tmp = await tmpdir()
  const executable = path.join(tmp.path, "user-claude")
  await Bun.write(executable, "fixture executable")
  await fs.chmod(executable, 0o755)
  const options = {
    systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
    env: {
      ORCHESTRA_CLAUDE_CODE_EXECUTABLE: executable,
      ORCHESTRA_CLAUDE_CODE_RESOURCES: path.join(tmp.path, "missing"),
    },
  }
  expect(ClaudeCodeSDK.processLifetime(options).options.pathToClaudeCodeExecutable).toBe(await fs.realpath(executable))
  expect(
    ClaudeCodeSDK.processLifetime({ ...options, pathToClaudeCodeExecutable: executable }).options
      .pathToClaudeCodeExecutable,
  ).toBe(await fs.realpath(executable))
  // Calling processLifetime starts nothing; neither query() nor accountInfo() is invoked by this fixture.
})

test.each(["sdkVersion", "claudeCodeVersion", "target", "file", "sha256", "schema"])(
  "rejects mismatched manifest %s",
  async (field) => {
    await using tmp = await tmpdir()
    await installed(tmp.path, "darwin-x64", "darwin", "x64", "claude")
    const directory = path.join(tmp.path, "deployed")
    stageClaudeCodeResource(resolveClaudeCodeResource({ root: tmp.path, os: "darwin", arch: "x64" }), directory)
    const manifest = await Bun.file(path.join(directory, "manifest.json")).json()
    await Bun.write(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, [field]: "wrong" }))
    expect(() =>
      ClaudeCodeExecutable.resolve({ resources: directory, platform: "darwin", arch: "x64", env: {} }),
    ).toThrow("Invalid Claude Code resources")
  },
)

test("missing bundled resource, unsupported CPU/libc and relative installs fail named", async () => {
  await using tmp = await tmpdir()
  expect(() =>
    ClaudeCodeExecutable.resolve({ compiled: true, resources: tmp.path, platform: "darwin", arch: "x64", env: {} }),
  ).toThrow(ClaudeCodeExecutable.UnavailableError)
  expect(() => ClaudeCodeExecutable.target("linux", "x64")).toThrow("Unsupported Claude Code executable target")
  expect(() => ClaudeCodeExecutable.target("linux", "riscv64", "glibc")).toThrow(
    "Unsupported Claude Code executable target",
  )
  expect(() => ClaudeCodeExecutable.resolve({ executable: "claude", env: {} })).toThrow("must be absolute")
  expect(() => ClaudeCodeExecutable.resolve({ executable: tmp.path, env: {} })).toThrow("Cannot acquire")
  await installed(tmp.path, "darwin-x64", "darwin", "x64", "claude", "0.3.288")
  expect(() => resolveClaudeCodeResource({ root: tmp.path, os: "darwin", arch: "x64" })).toThrow("Invalid pinned")
  expect(() => resolveClaudeCodeResource({ root: tmp.path, os: "win32", arch: "arm64" })).toThrow("metadata mismatch")
})

async function installed(
  root: string,
  target: string,
  os: string,
  arch: string,
  file: string,
  version = ClaudeCodeExecutable.SDK_VERSION,
) {
  const name = `@anthropic-ai/claude-agent-sdk-${target}`
  const sdk = path.join(root, "node_modules", "@anthropic-ai", "claude-agent-sdk")
  const native = path.join(root, "node_modules", "@anthropic-ai", `claude-agent-sdk-${target}`)
  await Bun.write(path.join(root, "package.json"), "{}")
  await Bun.write(
    path.join(sdk, "package.json"),
    JSON.stringify({
      name: "@anthropic-ai/claude-agent-sdk",
      main: "sdk.mjs",
      version: ClaudeCodeExecutable.SDK_VERSION,
      claudeCodeVersion: ClaudeCodeExecutable.CODE_VERSION,
      optionalDependencies: { [name]: ClaudeCodeExecutable.SDK_VERSION },
    }),
  )
  await Bun.write(path.join(sdk, "sdk.mjs"), "export {}")
  await Bun.write(path.join(native, "package.json"), JSON.stringify({ name, version, os: [os], cpu: [arch] }))
  await Bun.write(path.join(native, file), `fixture native bytes ${target}`)
  await Bun.write(path.join(native, "README.md"), "fixture readme")
  await Bun.write(path.join(native, "LICENSE.md"), "fixture notice")
  await fs.chmod(path.join(native, file), 0o755)
  return path.join(native, file)
}
