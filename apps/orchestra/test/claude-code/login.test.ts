import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { ClaudeCodeLogin } from "@/claude-code/login"
import { tmpdir } from "../fixture/fixture"

// A stand-in for Claude Code 2.1.289 `auth login`: the same stdout lines, the URL inside the OSC 8 hyperlink the CLI
// prints, then one `code#state` line read from stdin for the manual flow. Unlike the real CLI, which keeps reading after
// an invalid code, the stand-in exits 1 so a failed sign-in is observable.
const URL = "https://claude.com/cai/oauth/authorize?code=true&client_id=c&state=s"
const CLI = `#!/bin/sh
[ "$1 $2 $3" = "auth login --claudeai" ] || { echo "unexpected arguments: $*" >&2; exit 2; }
[ "$FAIL_EARLY" = "1" ] && { echo "Login failed: managed settings forbid this login" >&2; exit 1; }
printf 'Opening browser to sign in\\n'
printf "If the browser didn't open, visit: \\033]8;;${URL}\\007${URL}\\033]8;;\\007\\n"
printf 'Paste code here if prompted > '
read line
[ "$line" = "good#state" ] && { printf 'Login successful.\\n'; exit 0; }
echo "Invalid code. Please make sure the full code was copied." >&2
exit 1
`

async function cli(dir: string) {
  const file = path.join(dir, "claude")
  await Bun.write(file, CLI)
  await fs.chmod(file, 0o755)
  return file
}

test.skipIf(process.platform === "win32")(
  "sign-in relays the printed URL and the pasted code, then reports success",
  async () => {
    await using dir = await tmpdir()
    const login = ClaudeCodeLogin.start({ executable: await cli(dir.path), env: { ...process.env } })
    expect(await login.url).toBe(URL)
    expect(login.code("  good#state \n")).toBe(true)
    expect(await login.exited).toBe(true)
  },
)

test.skipIf(process.platform === "win32")("a failed sign-in reports no success", async () => {
  await using dir = await tmpdir()
  const login = ClaudeCodeLogin.start({ executable: await cli(dir.path), env: { ...process.env } })
  await login.url
  login.code("bad")
  expect(await login.exited).toBe(false)
})

test.skipIf(process.platform === "win32")(
  "a CLI that stops before printing a URL rejects with its own reason",
  async () => {
    await using dir = await tmpdir()
    const login = ClaudeCodeLogin.start({ executable: await cli(dir.path), env: { ...process.env, FAIL_EARLY: "1" } })
    await expect(login.url).rejects.toThrow("Login failed: managed settings forbid this login")
    expect(await login.exited).toBe(false)
  },
)

test.skipIf(process.platform === "win32")("stopping a sign-in ends the CLI", async () => {
  await using dir = await tmpdir()
  const login = ClaudeCodeLogin.start({ executable: await cli(dir.path), env: { ...process.env } })
  await login.url
  await login.stop()
  expect(await login.exited).toBe(false)
})
