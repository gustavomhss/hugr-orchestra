import { afterEach } from "bun:test"
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { type GovernanceContext, type Capture, type CheckResult, type Provenance } from "../src/governance/contracts.ts"
import governance, { type GovernanceInput } from "../src/tools/governance.ts"
import { validateArgs } from "../src/validate.ts"
const fixtures: string[] = []
afterEach(async () => { await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })
export async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "governance-test-")))
  fixtures.push(directory)
  const root = join(directory, "repo")
  const state = join(directory, "state")
  await Promise.all([mkdir(root), mkdir(state)])
  const permissions: Parameters<GovernanceContext["authorize"]>[0][] = []
  const context: GovernanceContext = { directory: root, stateDirectory: state, projectID: "project", async authorize(request) { permissions.push(request) } }
  const runGit = async (...args: string[]) => {
    const child = Bun.spawn(["git", "-c", "user.name=Governance Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    })
    const output = await new Response(child.stdout).text()
    const error = await new Response(child.stderr).text()
    if (await child.exited) throw new Error(`fixture git ${args[0]} failed: ${error}`)
    return output.trim()
  }
  const init = async (objectFormat: "sha1" | "sha256" = "sha1") => {
    await runGit("init", "-b", "dev", `--object-format=${objectFormat}`)
    await Bun.write(join(root, "owned.ts"), "export const value = 1\n")
    await Bun.write(join(root, "other.ts"), "export const other = 1\n")
    await Bun.write(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }))
    await Bun.write(join(root, "CHANGELOG.md"), "# Changelog\n\n## [1.0.0] — 2026-09-30\n- Preserved source behavior.\n")
    await runGit("add", "owned.ts", "other.ts", "package.json", "CHANGELOG.md")
    await runGit("commit", "-m", "feat: fixture baseline")
    return runGit("rev-parse", "HEAD")
  }
  return { root, state, directory, context, permissions, runGit, init }
}
export const revision = "1".repeat(40)
export function provenance(eventID = "event", sha = revision): Provenance {
  return { source: "host-check", projectID: "project", sessionID: "session", eventID, revision: sha }
}
export function check(name: string, status: CheckResult["status"] = "pass", sha = revision): CheckResult {
  return { name, status, ...(status === "pass" || status === "fail" ? { exitCode: status === "pass" ? 0 : 1 } : {}), provenance: provenance(`event-${name.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`, sha) }
}
export function capture(...results: CheckResult[]): Capture { return { complete: true, results } }
export function result<T>(value: { content: { text: string }[] }): T { return JSON.parse(value.content[0].text) as T }
export async function operation<T>(input: GovernanceInput, context: GovernanceContext): Promise<T> {
  const validation = validateArgs(governance.inputSchema, input)
  if (!validation.ok) throw new Error(validation.errors.join("; "))
  return result<T>(await governance.handler(input, context))
}
