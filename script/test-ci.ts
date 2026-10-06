#!/usr/bin/env bun
// Runs tests on GitHub Actions instead of this machine.
//
// It snapshots the working tree (tracked changes plus untracked files that are not gitignored) on top of the closest
// commit GitHub already has, uploads only the changed files through the GitHub API to a temporary ci-run-* branch,
// waits for the test-ci workflow and prints the test output. Nothing is committed or pushed from the local checkout,
// so no git hook runs and the current branch is untouched.
//
// Named test files run exactly and in the given order. Any other argument, such as a directory, is a Bun substring
// filter that may match several files, which Bun runs in its own order.
//
// Usage: bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both] [--timeout ms]

import { $ } from "bun"
import os from "node:os"
import path from "node:path"
import { statSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { closestBase, parseResponse, rateLimitDelay, testPaths } from "./test-ci-upload"

const USAGE = "Usage: bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both] [--timeout ms]"
const repo = process.env.ORCHESTRA_CI_REPO ?? "gustavomhss/hugr-orchestra"
// Set when GitHub first rate-limits this run; waiting for the limit to lift must end by then.
let rateLimitDeadline = 0
const root = (await $`git rev-parse --show-toplevel`.text()).trim()
const request = parse(process.argv.slice(2))
const remote = await findRemote()
const tree = await snapshot()
const base = await chooseBase()
const changes = await changed()

console.log(`test-ci: ${request.package} ${request.args.join(" ")} on ${request.os}`)
console.log(`test-ci: uploading ${changes.length} changed files on top of ${base.slice(0, 10)}`)
await uploadBlobs()
const uploaded = await api("POST", `repos/${repo}/git/trees`, {
  base_tree: (await $`git rev-parse ${base}^{tree}`.cwd(root).text()).trim(),
  tree: changes.map((change) =>
    change.status === "D"
      ? { path: change.path, mode: "100644", type: "blob", sha: null }
      : { path: change.path, mode: change.mode, type: change.mode === "160000" ? "commit" : "blob", sha: change.sha },
  ),
})
// The uploaded tree must hash exactly like the local snapshot, or the run would test something else.
if (uploaded.sha !== tree) fail(`GitHub built tree ${uploaded.sha}, but the local snapshot is ${tree}`)
const commit = await api("POST", `repos/${repo}/git/commits`, {
  message: `test-ci: ${request.package} ${request.args.join(" ")}`,
  tree,
  parents: [base],
})
const branch = `ci-run-${request.os}-${Date.now().toString(36)}-${commit.sha.slice(0, 7)}`
await api("POST", `repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha })
const removeBranch = () => api("DELETE", `repos/${repo}/git/refs/heads/${branch}`).catch(() => undefined)
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void removeBranch().finally(() => process.exit(130)))

// Look the run up by its unique commit: `--workflow` only resolves workflows that exist on the default branch.
const run = await waitFor("the workflow run to start", 180_000, async () => {
  const runs: { databaseId: number; url: string; workflowName: string }[] =
    await $`gh run list --repo ${repo} --commit ${commit.sha} --json databaseId,url,workflowName`.quiet().json()
  return runs.find((entry) => entry.workflowName === "test-ci")
})
console.log(`test-ci: ${run.url}`)
const finished = await follow(run.databaseId)
await removeBranch()
const failed = await report(finished)
process.exit(failed ? 1 : 0)

function parse(argv: string[]) {
  const positional: string[] = []
  const options = { os: "linux", timeout: "120000", pattern: undefined as string | undefined }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!
    if (arg === "-t" || arg === "--test-name-pattern") options.pattern = argv[++index]
    else if (arg === "--os") options.os = argv[++index] ?? ""
    else if (arg === "--timeout") options.timeout = argv[++index] ?? ""
    else if (arg === "-h" || arg === "--help") fail(USAGE, 0)
    else positional.push(arg)
  }
  const name = positional[0]?.replace(/^packages\//, "").replace(/\/$/, "")
  if (!name) fail(USAGE, 2)
  if (!["linux", "windows", "both"].includes(options.os)) fail(`--os must be linux, windows or both\n${USAGE}`, 2)
  if (!/^\d+$/.test(options.timeout)) fail(`--timeout must be milliseconds\n${USAGE}`, 2)
  if (options.pattern === undefined && argv.some((arg) => arg === "-t" || arg === "--test-name-pattern"))
    fail(`-t needs a pattern\n${USAGE}`, 2)
  const files = testPaths(
    name,
    positional.slice(1),
    (file) => statSync(path.join(root, "packages", name, file), { throwIfNoEntry: false })?.isFile() ?? false,
  )
  return {
    package: name,
    os: options.os,
    args: [...files, "--timeout", options.timeout, ...(options.pattern ? ["-t", options.pattern] : [])],
  }
}

async function findRemote() {
  if (!(await Bun.file(path.join(root, "packages", request.package, "package.json")).exists()))
    fail(`packages/${request.package} is not a package in this checkout`, 2)
  const pattern = new RegExp(`github\\.com[:/]${repo.replace(".", "\\.")}(\\.git)?$`)
  const line = (await $`git remote -v`.cwd(root).text())
    .split("\n")
    .map((entry) => entry.split(/\s+/))
    .find((parts) => pattern.test(parts[1] ?? ""))
  if (!line) fail(`No git remote points at github.com/${repo}; set ORCHESTRA_CI_REPO or add the remote.`)
  return line[0]!
}

// GitHub already has the merge-bases with the pushed copy of this branch and with dev. After dev is merged into a pushed
// branch, everything dev brought in differs from the pushed copy, so upload on top of whichever differs least.
async function chooseBase() {
  const current = (await $`git branch --show-current`.cwd(root).text()).trim()
  const base = await closestBase(root, [current && `${remote}/${current}`, `${remote}/dev`].filter(Boolean), tree)
  return base ?? fail(`Cannot find a commit shared with ${remote}/dev; run git fetch ${remote} dev.`)
}

async function snapshot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "test-ci-"))
  const index = path.join(dir, "index")
  // A copy of the real index keeps its file stat cache, so `git add -A` only rehashes what changed.
  await Bun.write(
    index,
    Bun.file(path.resolve(root, (await $`git rev-parse --git-path index`.cwd(root).text()).trim())),
  )
  const env = { ...process.env, GIT_INDEX_FILE: index }
  await $`git add -A`.cwd(root).env(env).quiet()
  const body = JSON.stringify({ package: request.package, args: request.args })
  const blob = (await $`git hash-object -w --stdin < ${Buffer.from(body)}`.cwd(root).text()).trim()
  await $`git update-index --add --cacheinfo ${`100644,${blob},.ci-run.json`}`.cwd(root).env(env).quiet()
  const result = (await $`git write-tree`.cwd(root).env(env).text()).trim()
  await rm(dir, { recursive: true, force: true })
  // Push events run the workflow file from the pushed commit, so the snapshot must contain it.
  const workflow = await $`git cat-file -e ${`${result}:.github/workflows/test-ci.yml`}`.cwd(root).quiet().nothrow()
  if (workflow.exitCode !== 0) fail("This branch predates test-ci; rebase it on dev first.")
  return result
}

async function changed() {
  const entries = new Map(
    (await $`git ls-tree -r -z ${tree}`.cwd(root).text())
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const [meta, file] = line.split("\t") as [string, string]
        const [mode, , sha] = meta.split(" ") as [string, string, string]
        return [file, { mode, sha }] as const
      }),
  )
  const fields = (await $`git diff-tree -r -z --no-renames --name-status ${base} ${tree}`.cwd(root).text())
    .split("\0")
    .filter(Boolean)
  const result = Array.from({ length: fields.length / 2 }, (_, index) => {
    const status = fields[index * 2]!
    const file = fields[index * 2 + 1]!
    return { status, path: file, mode: entries.get(file)?.mode ?? "100644", sha: entries.get(file)?.sha ?? "" }
  })
  if (result.length > 400)
    fail(
      `${result.length} files differ from ${base.slice(0, 10)}, more than test:ci uploads (400). Push this branch first: the next run then uploads only what changed after the push.`,
    )
  return result
}

// Two at a time: GitHub's secondary rate limits punish bursts of requests that create content.
async function uploadBlobs() {
  const blobs = changes.filter((change) => change.status !== "D" && change.mode !== "160000")
  for (let start = 0; start < blobs.length; start += 2) {
    if (start > 0 && start % 20 === 0) console.log(`test-ci: uploaded ${start} of ${blobs.length} files`)
    await Promise.all(
      blobs.slice(start, start + 2).map(async (change) => {
        // Read synchronously: under heavy load an awaited Bun shell read stalled the upload partway, with no error.
        const read = Bun.spawnSync(["git", "cat-file", "blob", change.sha], { cwd: root })
        if (read.exitCode !== 0) fail(`git cat-file blob ${change.sha} failed: ${read.stderr.toString().trim()}`)
        const content = Buffer.from(read.stdout)
        const created = await api("POST", `repos/${repo}/git/blobs`, {
          content: content.toString("base64"),
          encoding: "base64",
        })
        if (created.sha !== change.sha) fail(`GitHub stored ${change.path} as ${created.sha}, expected ${change.sha}`)
      }),
    )
  }
}

async function follow(id: number) {
  const seen = new Map<string, string>()
  return waitFor(
    "the workflow run to finish",
    60 * 60_000,
    async () => {
      const view = await $`gh run view ${id} --repo ${repo} --json status,conclusion,jobs`.quiet().json()
      for (const job of view.jobs as { name: string; status: string; conclusion: string }[]) {
        const state = job.conclusion || job.status
        if (seen.get(job.name) !== state) console.log(`test-ci: ${job.name} ${state}`)
        seen.set(job.name, state)
      }
      return view.status === "completed" ? (view as RunView) : undefined
    },
    10_000,
  )
}

type RunView = {
  conclusion: string
  jobs: { databaseId: number; name: string; conclusion: string }[]
}

async function report(view: RunView) {
  const tests = view.jobs.filter((job) => job.name.startsWith("test "))
  for (const job of tests) {
    const log = await waitFor("the job log", 120_000, async () => {
      const result = await $`gh run view --repo ${repo} --job ${job.databaseId} --log`.quiet().nothrow()
      return result.exitCode === 0 && result.stdout.length > 0 ? result.text() : undefined
    })
    const step = log
      .split("\n")
      .filter((line) => line.split("\t")[1] === "Run tests")
      .map((line) =>
        line
          .split("\t")
          .slice(2)
          .join("\t")
          .replace(/^\uFEFF?\S+Z /, "")
          .replace(/\x1b\[[0-9;]*m/g, ""),
      )
    // Drop the echoed step script that GitHub prints before the command output.
    const lines = step.slice(step.findIndex((line) => line.startsWith("##[endgroup]")) + 1)
    // A passing run needs only its summary; a failing one needs the errors printed above each (fail) line.
    const shown = job.conclusion === "success" ? lines.slice(-12) : lines.slice(-400)
    console.log(`\n=== ${job.name}: ${job.conclusion} ===\n${shown.join("\n")}`)
  }
  console.log(`\ntest-ci: ${view.conclusion}`)
  return view.conclusion !== "success"
}

async function api(method: string, route: string, body?: unknown): Promise<any> {
  const input = body === undefined ? [] : ["--input", "-"]
  let timeouts = 0
  for (let attempt = 0; ; attempt++) {
    // --include prints the response headers, which carry GitHub's rate-limit hints. A gh call can stall without output
    // when this machine is overloaded, so each one gets a deadline; every request here is safe to repeat.
    const child = Bun.spawn(["gh", "api", "--include", "--method", method, route, ...input], {
      stdin: Buffer.from(JSON.stringify(body ?? {})),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 90_000,
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (child.signalCode) {
      if (++timeouts > 3)
        throw new Error(`gh api ${method} ${route} timed out ${timeouts} times; run test:ci again later.`)
      console.log(`test-ci: gh api ${method} ${route} got no answer in 90 s, retrying`)
      continue
    }
    const response = parseResponse(stdout)
    if (exitCode === 0) return response.body.length > 0 ? JSON.parse(response.body) : undefined
    // A timed-out request may still have created the branch; the name is unique to this run, so it is ours.
    if (timeouts > 0 && response.status === 422 && route.endsWith("/git/refs")) return undefined
    const error = `gh api ${method} ${route} failed: ${stderr.trim()}`
    const delay = rateLimitDelay(response, attempt)
    if (delay === undefined) throw new Error(error)
    rateLimitDeadline ||= Date.now() + 10 * 60_000
    if (Date.now() + delay > rateLimitDeadline)
      throw new Error(`${error}\ntest:ci waits at most 10 minutes for GitHub's rate limit to lift; run it again later.`)
    console.log(`test-ci: GitHub rate limit, retrying in ${Math.ceil(delay / 1000)} s`)
    await Bun.sleep(delay)
  }
}

async function waitFor<T>(what: string, limit: number, check: () => Promise<T | undefined>, every = 5_000): Promise<T> {
  const deadline = Date.now() + limit
  while (Date.now() < deadline) {
    const value = await check()
    if (value !== undefined) return value
    await Bun.sleep(every)
  }
  return fail(`Timed out waiting for ${what}.`)
}

function fail(message: string, code = 1): never {
  console.error(message)
  process.exit(code)
}
