import { expect, test } from "bun:test"
import { YAML } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

test("Script CI history step restores actual missing shallow objects before mirror fixtures", async () => {
  const workflow = YAML.parse(await Bun.file(new URL("../../../.github/workflows/test-ci.yml", import.meta.url)).text()) as {
    jobs: { test: { steps: { name?: string; if?: string; run?: string }[] } }
  }
  const matches = workflow.jobs.test.steps.filter((step) => step.name === "Fetch source history for Script fixtures")
  expect(matches).toHaveLength(1)
  const step = matches[0]
  if (!step?.run?.trim()) throw new Error("SCRIPT_HISTORY_STEP_MISSING")
  expect(step.if).toBe("steps.request.outputs.package == 'script' && steps.request.outputs.runner == 'bun'")
  const directory = await mkdtemp(path.join(tmpdir(), "script-history-"))
  try {
    const source = path.join(directory, "source")
    const checkout = path.join(directory, "checkout")
    const git = (cwd: string, ...args: string[]) => {
      const result = Bun.spawnSync(["git", ...args], { cwd })
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      return result.stdout.toString().trim()
    }
    git(directory, "init", "-q", source)
    await Bun.write(path.join(source, "input.txt"), "first\n")
    git(source, "add", "--", "input.txt")
    git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "first")
    const first = git(source, "rev-parse", "HEAD")
    await Bun.write(path.join(source, "input.txt"), "second\n")
    git(source, "add", "--", "input.txt")
    git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "second")
    git(directory, "clone", "--depth=1", pathToFileURL(source).href, checkout)
    expect(git(checkout, "rev-parse", "--is-shallow-repository")).toBe("true")
    expect(Bun.spawnSync(["git", "cat-file", "-e", `${first}^{commit}`], { cwd: checkout }).exitCode).not.toBe(0)
    const bash = process.platform === "win32" ? path.join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe") : "bash"
    const fetched = Bun.spawnSync([bash, "--noprofile", "--norc", "-e", "-c", step.run], { cwd: checkout })
    expect(fetched.exitCode, fetched.stderr.toString()).toBe(0)
    expect(git(checkout, "rev-parse", "--is-shallow-repository")).toBe("false")
    expect(git(checkout, "show", `${first}:input.txt`)).toBe("first")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
