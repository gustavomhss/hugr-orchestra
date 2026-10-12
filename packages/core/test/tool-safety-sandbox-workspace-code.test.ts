import { afterAll, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"

// A directory standing in for the workspace, and one standing in for the host outside it.
const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "workspace-code-")))
const workspace = path.join(root, "workspace")
const host = path.join(root, "host")
mkdirSync(workspace)
mkdirSync(host)
afterAll(() => rmSync(root, { recursive: true, force: true }))

const script = (file: string, body = "echo ok\n") => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `#!/bin/sh\n${body}`)
  chmodSync(file, 0o755)
  return file
}
const runs = (command: string, args: string[] = []) => ToolSafetySandbox.runsWorkspaceCode(workspace, command, args, workspace)
const posix = process.platform === "win32" ? test.skip : test

describe("runsWorkspaceCode", () => {
  posix("a program inside the workspace, or reached through a symlink into it, runs workspace code", async () => {
    const bin = script(path.join(workspace, "node_modules", ".bin", "tool"))
    symlinkSync(bin, path.join(host, "alias"))
    expect(await runs(bin)).toBe(true)
    expect(await runs("node_modules/.bin/tool")).toBe(true)
    expect(await runs(path.join(host, "alias"))).toBe(true)
  })

  posix("a static program outside the workspace does not", async () => {
    expect(await runs(script(path.join(host, "bin", "gofmt")), ["-w", "a.go"])).toBe(false)
    expect(await runs(script(path.join(host, "bin", "gofmt-script"), "echo gofmt exec is fine\n"))).toBe(false)
    expect(await runs("/bin/sh", ["-c", "true"])).toBe(false)
  })

  test.each([
    ["npx", ["prettier"]],
    ["bunx", ["prettier"]],
    ["pnpm", ["exec", "prettier"]],
    ["pnpm", ["dlx", "prettier"]],
    ["npm", ["exec", "prettier"]],
    ["yarn", ["prettier"]],
    ["bundle", ["exec", "rubocop"]],
    ["python3", ["-m", "black"]],
    ["python3.12", ["-m", "black"]],
    ["uv", ["run", "ruff"]],
    ["uvx", ["ruff"]],
    ["poetry", ["run", "ruff"]],
    ["pipenv", ["run", "ruff"]],
    ["mise", ["exec", "--", "gofmt"]],
    ["asdf", ["exec", "gofmt"]],
    ["go", ["run", "./tool"]],
    ["cargo", ["run"]],
    ["/usr/local/bin/npx.cmd", ["prettier"]],
  ])("the runner %s %j runs workspace code", async (command, args) => {
    expect(await runs(command, args)).toBe(true)
  })

  posix("a program that is also a runner stays unconfined for its plain subcommands", async () => {
    expect(await runs(script(path.join(host, "bin", "python3")), ["script.py"])).toBe(false)
    expect(await runs(script(path.join(host, "bin", "go")), ["version"])).toBe(false)
    expect(await runs(script(path.join(host, "bin", "pnpm")), ["--version"])).toBe(false)
  })

  posix("a program in a version-manager shim directory runs workspace code", async () => {
    for (const shim of [".asdf/shims", ".local/share/mise/shims", ".rbenv/shims", ".pyenv/shims", ".nodenv/shims", ".goenv/shims", ".proto/shims", ".volta/bin", "opt/custom-manager/shims"])
      expect(await runs(script(path.join(host, shim, "gofmt")))).toBe(true)
  })

  posix("a shim outside any known directory is found by what it execs or what it links to", async () => {
    expect(await runs(script(path.join(host, "elsewhere", "gofmt"), 'exec "/opt/asdf/bin/asdf" exec gofmt "$@"\n'))).toBe(true)
    expect(await runs(script(path.join(host, "elsewhere", "ruby"), 'exec "/usr/local/opt/rbenv/libexec/rbenv" exec ruby "$@"\n'))).toBe(true)
    const manager = script(path.join(host, "managers", "mise"))
    symlinkSync(manager, path.join(host, "elsewhere", "node"))
    expect(await runs(path.join(host, "elsewhere", "node"))).toBe(true)
  })
})
