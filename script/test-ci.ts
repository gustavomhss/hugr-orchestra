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
// Playwright requires package app, existing .spec.ts files and one of the two explicit app configs.
// --env KEY=VALUE passes an allow-listed variable to the tests. --runner node runs named node:test smoke scripts
// (*.node-smoke.mjs) with node instead of bun test.
//
// Usage: bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|macos|macos-intel|both|all] [--timeout ms]
//        [--env KEY=VALUE] [--runner bun|node]
//        bun run test:ci app <spec files...> --runner playwright --config <config> [--os ...]
// Performance config also requires --benchmark-renderer current|legacy.
// A Python package (requirements-dev.txt and no package.json) runs pytest: -t becomes pytest's -k expression and
// --timeout does not apply. A package with both, such as packages/relay while its Python oracle remains, runs pytest
// only when every named test file is a .py file, and bun test otherwise.

import { $ } from "bun"
import { existsSync, realpathSync, statSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { closestBase, parseResponse, rateLimitDelay, testPaths } from "./test-ci-upload"
import { controlVerdict, parseOptions, preloadsControl, reportLines, requireTestJobs, validateRequest } from "./test-ci-request"

const USAGE =
  "Usage: bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|macos|macos-intel|both|all] [--timeout ms] [--env KEY=VALUE] [--runner bun|node|playwright [--config <config> [--benchmark-renderer current|legacy]]]"
const repo = process.env.ORCHESTRA_CI_REPO ?? "gustavomhss/hugr-orchestra"
// Set when GitHub first rate-limits this run; waiting for the limit to lift must end by then.
let rateLimitDeadline = 0
const root = (await $`git rev-parse --show-toplevel`.text()).trim()
const request = parse(process.argv.slice(2))
const remote = await findRemote()
const tree = await snapshot()
const base = await chooseBase()
const changes = await changed()

console.log(
  `test-ci: ${request.package} ${request.args.join(" ")} on ${request.os} (${request.runner}${Object.entries(
    request.env,
  )
    .map(([key, value]) => `, ${key}=${value}`)
    .join("")})`,
)
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
await waitForRunners()
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
  if (argv.some((arg) => arg === "-h" || arg === "--help")) fail(USAGE, 0)
  const parsed = parseOptions(argv)
  const positional = parsed.positional
  const options = { ...parsed.options, runner: parsed.options.runner ?? "bun" }
  const env = parsed.env
  const name = positional[0]?.replace(/^packages\//, "").replace(/\/$/, "")
  if (!name) fail(USAGE, 2)
  if (!/^[\w-]+(?:\/[\w-]+)*$/.test(name)) fail(`Invalid package: ${name}`, 2)
  if (options.runner === "playwright")
    return {
      ...validateRequest(
        { package: name, runner: options.runner, config: options.config, benchmarkRenderer: options.benchmarkRenderer, env, args: positional.slice(1) },
        (file) => {
          const full = path.join(root, file)
          return (statSync(full, { throwIfNoEntry: false })?.isFile() ?? false) &&
            realpathSync(full).startsWith(realpathSync(root) + path.sep)
        },
      ),
      os: options.os,
    }
  // Test paths may be given from the repository root or from the package directory.
  const named = positional.slice(1).map((file) => file.replace(new RegExp(`^(\\./)?packages/${name}/`), ""))
  if (options.runner !== "node" && pytest(name, named))
    return {
      package: name,
      os: options.os,
      runner: "pytest",
      env,
      args: [...named, ...(options.pattern ? ["-k", options.pattern] : [])],
    }
  const files = testPaths(
    name,
    positional.slice(1),
    (file) => statSync(path.join(root, "packages", name, file), { throwIfNoEntry: false })?.isFile() ?? false,
  )
  if (options.runner === "node") {
    if (options.pattern !== undefined) fail(`-t is a bun test option; the node runner takes smoke scripts only`, 2)
    if (files.length === 0 || files.some((file) => !file.endsWith(".node-smoke.mjs")))
      fail(`--runner node runs named *.node-smoke.mjs scripts only, never bun:test files\n${USAGE}`, 2)
  }
  return {
    package: name,
    os: options.os,
    runner: options.runner,
    env,
    args:
      options.runner === "node"
        ? files
        : [...files, "--timeout", options.timeout, ...(options.pattern ? ["-t", options.pattern] : [])],
  }
}

// The runner travels in .ci-run.json; test-ci.yml falls back to the same file rule when a request carries none.
function pytest(name: string, files: string[]) {
  const dir = path.join(root, "packages", name)
  if (!existsSync(path.join(dir, "requirements-dev.txt"))) return false
  if (!existsSync(path.join(dir, "package.json"))) return true
  return files.length > 0 && files.every((file) => file.endsWith(".py"))
}

async function findRemote() {
  if (
    !(await Bun.file(path.join(root, "packages", request.package, "package.json")).exists()) &&
    !(await Bun.file(path.join(root, "packages", request.package, "requirements-dev.txt")).exists())
  )
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
  const body = JSON.stringify({
    package: request.package, runner: request.runner, args: request.args, env: request.env,
    ...("config" in request && request.config ? { config: request.config } : {}),
    ...("benchmarkRenderer" in request && request.benchmarkRenderer ? { benchmarkRenderer: request.benchmarkRenderer } : {}),
  })
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

// The account runs at most 20 hosted jobs at once, shared by every session, and GitHub cancels jobs it cannot place.
// A queued run means no runner is free, so this run waits its turn before pushing the branch that starts it, for at
// most 30 minutes.
async function waitForRunners() {
  const deadline = Date.now() + 30 * 60_000
  for (let announced = false; Date.now() < deadline; announced = true) {
    const queued: { total_count: number } = await api("GET", `repos/${repo}/actions/runs?status=queued&per_page=1`)
    if (queued.total_count === 0) return
    if (!announced)
      console.log(`test-ci: ${queued.total_count} workflow runs are waiting for runners; waiting for room`)
    await Bun.sleep(30_000)
  }
  console.log("test-ci: still no free runners after 30 minutes; starting anyway")
}

async function follow(id: number) {
  const seen = new Map<string, string>()
  return waitFor(
    "the workflow run to finish",
    60 * 60_000,
    async () => {
      const view = await $`gh run view ${id} --repo ${repo} --json status,conclusion,jobs`.quiet().json()
      if (!Array.isArray(view.jobs)) fail("test-ci: missing matrix jobs")
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
  jobs: { databaseId: number; name: string; conclusion: string; steps?: { name: string; conclusion: string }[] }[]
}

async function report(view: RunView) {
  const tests = requireTestJobs(request.os, view.jobs)
  const bunfig = Bun.file(path.join(root, "packages", request.package, "bunfig.toml"))
  const control = request.runner === "bun" && (await bunfig.exists()) && preloadsControl(Bun.TOML.parse(await bunfig.text()))
  let missing = false
  for (const job of tests) {
    const log = await waitFor(`${job.name}: nonempty job log`, 120_000, async () => {
      const result = await $`gh run view --repo ${repo} --job ${job.databaseId} --log`.quiet().nothrow()
      return result.exitCode === 0 && result.text().trim() ? result.text() : undefined
    })
    const lines = reportLines(job, log)
    // Keep setup diagnostics for failed jobs; only summaries for successful jobs.
    const shown = job.conclusion === "success" ? lines.slice(-12) : lines.slice(-400)
    console.log(`\n=== ${job.name}: ${job.conclusion} ===\n${shown.join("\n")}`)
    if (!control) continue
    // The control's verdict is required apart from the job's result: a job without exactly one verdict carrying its
    // nonce fails this report even when every test passed.
    try {
      console.log(`test-ci: ${job.name} ${controlVerdict(job, log)}`)
    } catch (error) {
      missing = true
      console.log(`test-ci: ${job.name} omni positive control: MISSING (${(error as Error).message})`)
    }
  }
  console.log(`\ntest-ci: ${view.conclusion}${missing ? " (omni positive control verdict missing)" : ""}`)
  return missing || view.conclusion !== "success" || tests.some((job) => job.conclusion !== "success")
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
