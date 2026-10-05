import { afterAll, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HARD_LIMIT_LOC, runGodfileGate } from "../script/godfile"

const root = mkdtempSync(join(tmpdir(), "gitlab-fork-baseline-"))
const target = join(root, "target")
const source = join(root, "source")
const checkout = join(root, "checkout")
const identity = {
  ...process.env,
  GIT_AUTHOR_NAME: "baseline-test",
  GIT_AUTHOR_EMAIL: "baseline@example.invalid",
  GIT_COMMITTER_NAME: "baseline-test",
  GIT_COMMITTER_EMAIL: "baseline@example.invalid",
}
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: identity, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
const legacy = Array.from({ length: HARD_LIMIT_LOC + 1 }, (_, i) => `const line${i} = ${i}`).join("\n")
const requirement =
  '### REQ-FORK-1\nsource: INV-FORK-1\nThe tool shall return one band.\nnormative-clause: "one band"\n'
mkdirSync(join(target, "foundation/atlas/docs/requirements"), { recursive: true })
await Bun.write(join(target, "legacy.ts"), legacy)
await Bun.write(join(target, "foundation/atlas/docs/requirements/req-fork.md"), requirement)
git(target, "init", "--initial-branch=dev")
git(target, "add", "legacy.ts", "foundation/atlas/docs/requirements/req-fork.md")
git(target, "commit", "-m", "target baseline")
const baseline = git(target, "rev-parse", "HEAD")
git(root, "clone", "--branch", "dev", target, source)
await Bun.write(join(source, "legacy.ts"), `${legacy}\nconst growth = true`)
await Bun.write(
  join(source, "foundation/atlas/docs/requirements/req-fork.md"),
  requirement.replace('"one band"', '"two bands"'),
)
git(source, "add", "legacy.ts", "foundation/atlas/docs/requirements/req-fork.md")
git(source, "commit", "-m", "source growth and uncoamended clause")
git(root, "clone", "--branch", "dev", source, checkout)
const head = git(checkout, "rev-parse", "HEAD")

// Real HTTP metadata boundary and real git repositories; only the GitLab service is a local fixture.
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const iid = Number(new URL(request.url).pathname.split("/").at(-1))
    if (iid === 4) return new Response("denied", { status: 403 })
    if (iid === 5) return Response.json({})
    if (iid === 6) return new Response("not JSON")
    if (iid === 8 && request.headers.get("JOB-TOKEN") !== "fixture-token") return new Response("private", { status: 404 })
    return Response.json({
      iid,
      project_id: 100,
      target_project_id: iid === 2 ? 200 : 100,
      source_project_id: 200,
      target_branch: iid === 3 ? "absent" : iid === 7 ? "../invalid" : "dev",
      web_url: `${new URL(request.url).origin}/target/repo/-/merge_requests/${iid}`,
    })
  },
})
const env = {
  ...identity,
  CI_PIPELINE_SOURCE: "merge_request_event",
  CI_COMMIT_SHA: head,
  CI_DEFAULT_BRANCH: "dev",
  CI_MERGE_REQUEST_PROJECT_ID: "100",
  CI_MERGE_REQUEST_SOURCE_PROJECT_ID: "200",
  CI_MERGE_REQUEST_IID: "1",
  CI_MERGE_REQUEST_PROJECT_URL: `${server.url.origin}/target/repo`,
  CI_MERGE_REQUEST_TARGET_BRANCH_NAME: "dev",
  CI_SERVER_URL: server.url.origin,
  CI_API_V4_URL: `${server.url.origin}/api/v4`,
  CI_JOB_TOKEN: "",
  // Use git's real transport, redirecting only the verified fixture URL to the target repo.
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: `url.file://${target}.insteadOf`,
  GIT_CONFIG_VALUE_0: `${server.url.origin}/target/repo.git`,
}
afterAll(() => {
  server.stop(true)
  rmSync(root, { recursive: true, force: true })
})

async function run(command: string[], overrides: Record<string, string> = {}) {
  const child = Bun.spawn(command, { cwd: checkout, env: { ...env, ...overrides }, stdout: "pipe", stderr: "pipe" })
  const result = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { code: result[0], out: result[1], error: result[2] }
}

const base = (mode: string, overrides: Record<string, string> = {}) =>
  run(["node", join(import.meta.dir, "base.mjs"), mode], overrides)
const atlas = () =>
  run(
    [
      "bash", "-c", 'source "$1"; node "$2"', "fixture",
      join(import.meta.dir, "atlas-base.sh"),
      join(import.meta.dir, "../foundation/atlas/harness/gates/ears-coamend-guard.mjs"),
    ],
    { CI: "true", EARS_COAMEND_ROOT: join(checkout, "foundation/atlas") },
  )

test("source origin/dev equals HEAD: native target wins, both real gates reject, no-op passes", async () => {
  expect(git(checkout, "rev-parse", "origin/dev")).toBe(head)
  expect(head).not.toBe(baseline)
  for (const mode of ["godfile", "atlas"]) {
    const result = await base(mode)
    expect(result.code).toBe(0)
    expect(result.out.trim()).toBe(baseline)
  }
  // The old wrong-repository baseline masks both planted defects, proving this fixture has teeth.
  expect(runGodfileGate({ cwd: checkout, baseRef: "origin/dev" }).errors).toEqual([])
  const wrong = git(checkout, "commit-tree", git(checkout, "rev-parse", "origin/dev:foundation/atlas"), "-m", "wrong base")
  const masked = await run(["node", join(import.meta.dir, "../foundation/atlas/harness/gates/ears-coamend-guard.mjs")], {
    CI: "true",
    EARS_COAMEND_ROOT: join(checkout, "foundation/atlas"),
    EARS_COAMEND_BASE: wrong,
  })
  expect(masked.code).toBe(0)
  const selected = (await base("godfile")).out.trim()
  expect(runGodfileGate({ cwd: checkout, baseRef: selected }).errors.join("\n")).toContain("legacy.ts")
  const rejected = await atlas()
  expect(rejected.code).not.toBe(0)
  expect(rejected.error).toContain("REQ-FORK-1")

  await Bun.write(join(checkout, "legacy.ts"), legacy)
  await Bun.write(join(checkout, "foundation/atlas/docs/requirements/req-fork.md"), requirement)
  git(checkout, "add", "legacy.ts", "foundation/atlas/docs/requirements/req-fork.md")
  git(checkout, "commit", "-m", "restore target content for no-op control")
  expect(runGodfileGate({ cwd: checkout, baseRef: selected }).errors).toEqual([])
  expect((await atlas()).code).toBe(0)
}, 30_000)

test("a source project URL cannot impersonate the target project ID", async () => {
  const result = await base("godfile", { CI_MERGE_REQUEST_PROJECT_URL: `${server.url.origin}/source/repo` })
  expect(result.code).not.toBe(0)
  expect(result.error).toContain("MR target identity/ref disagrees")
  const mismatch = await base("atlas", { CI_MERGE_REQUEST_IID: "2" })
  expect(mismatch.code).not.toBe(0)
  expect(mismatch.error).toContain("MR target identity/ref disagrees")
})

test("missing native fields and invalid IDs fail rather than falling back to origin", async () => {
  for (const name of [
    "CI_MERGE_REQUEST_PROJECT_ID", "CI_MERGE_REQUEST_PROJECT_URL", "CI_MERGE_REQUEST_IID",
    "CI_MERGE_REQUEST_SOURCE_PROJECT_ID", "CI_MERGE_REQUEST_TARGET_BRANCH_NAME", "CI_SERVER_URL", "CI_API_V4_URL",
  ]) {
    const result = await base("godfile", { [name]: "" })
    expect(result.code).not.toBe(0)
    expect(result.error).toContain(`Missing ${name}`)
  }
  const invalid = await base("atlas", { CI_MERGE_REQUEST_PROJECT_ID: "../200" })
  expect(invalid.code).not.toBe(0)
  expect(invalid.error).toContain("Invalid CI_MERGE_REQUEST_PROJECT_ID")
  const foreign = await base("atlas", { CI_MERGE_REQUEST_PROJECT_URL: "https://wrong.example/target/repo" })
  expect(foreign.code).not.toBe(0)
  expect(foreign.error).toContain("Invalid native MR target/API URL")
})

test("denied/empty/malformed API data and missing/invalid branch fail closed", async () => {
  for (const iid of ["4", "5", "6"]) expect((await base("atlas", { CI_MERGE_REQUEST_IID: iid })).code).not.toBe(0)
  const missing = await base("godfile", { CI_MERGE_REQUEST_IID: "3", CI_MERGE_REQUEST_TARGET_BRANCH_NAME: "absent" })
  expect(missing.code).not.toBe(0)
  expect(missing.error).toContain("refs/heads/absent")
  const invalid = await base("atlas", { CI_MERGE_REQUEST_IID: "7", CI_MERGE_REQUEST_TARGET_BRANCH_NAME: "../invalid" })
  expect(invalid.code).not.toBe(0)
  expect(invalid.error).toContain("Invalid target branch")
})

test("push/default semantics remain origin's default for Godfile and pipeline SHA for Atlas", async () => {
  for (const mode of ["godfile", "atlas"]) {
    const result = await base(mode, { CI_PIPELINE_SOURCE: "push", CI_MERGE_REQUEST_PROJECT_ID: "" })
    expect(result.code).toBe(0)
    expect(result.out.trim()).toBe(head)
  }
  expect((await base("atlas", { CI_PIPELINE_SOURCE: "push", CI_COMMIT_SHA: "missing-commit" })).code).not.toBe(0)
})

test("private metadata can use existing job token access, but denial still blocks", async () => {
  const accepted = await base("atlas", { CI_MERGE_REQUEST_IID: "8", CI_JOB_TOKEN: "fixture-token" })
  expect(accepted.code).toBe(0)
  expect(accepted.out.trim()).toBe(baseline)
  const denied = await base("atlas", { CI_MERGE_REQUEST_IID: "8", CI_JOB_TOKEN: "wrong-token" })
  expect(denied.code).not.toBe(0)
  expect(denied.error).toContain("MR target metadata unavailable: HTTP 404")
})
