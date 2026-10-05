import { execFileSync, spawnSync } from "node:child_process"

async function resolveBase(mode) {
  if (mode !== "godfile" && mode !== "atlas") throw new Error("Expected baseline mode: godfile or atlas")
  if (required("CI_PIPELINE_SOURCE") !== "merge_request_event") {
    if (mode === "atlas") return git(["rev-parse", "--verify", `${required("CI_COMMIT_SHA")}^{commit}`])
    return fetchBranch("origin", required("CI_DEFAULT_BRANCH"))
  }

  // CI_MERGE_REQUEST_PROJECT_* describes the MR's target, unlike CI_PROJECT_* in a fork pipeline.
  const project = id("CI_MERGE_REQUEST_PROJECT_ID")
  const iid = id("CI_MERGE_REQUEST_IID")
  const source = id("CI_MERGE_REQUEST_SOURCE_PROJECT_ID")
  const branch = required("CI_MERGE_REQUEST_TARGET_BRANCH_NAME")
  const server = new URL(required("CI_SERVER_URL"))
  const api = new URL(required("CI_API_V4_URL"))
  const target = new URL(required("CI_MERGE_REQUEST_PROJECT_URL"))
  if (
    ![server, api, target].every(
      (url) => ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
    ) ||
    api.href !== `${server.href.replace(/\/$/, "")}/api/v4` ||
    target.origin !== server.origin ||
    target.pathname === "/" ||
    target.pathname.endsWith("/")
  ) {
    throw new Error("Invalid native MR target/API URL")
  }

  const endpoint = `${api}/projects/${project}/merge_requests/${iid}`
  const options = { redirect: "error", signal: AbortSignal.timeout(30_000) }
  const publicResponse = await fetch(endpoint, options)
  const response =
    [401, 403, 404].includes(publicResponse.status) && process.env.CI_JOB_TOKEN
      ? await fetch(endpoint, { ...options, headers: { "JOB-TOKEN": process.env.CI_JOB_TOKEN } })
      : publicResponse
  if (!response.ok) throw new Error(`MR target metadata unavailable: HTTP ${response.status}`)
  const mr = await response.json()
  if (
    mr?.project_id !== project ||
    mr.target_project_id !== project ||
    mr.iid !== iid ||
    mr.source_project_id !== source ||
    mr.target_branch !== branch ||
    mr.web_url !== `${target}/-/merge_requests/${iid}`
  ) {
    throw new Error("MR target identity/ref disagrees with GitLab API")
  }

  return fetchBranch(`${target}.git`, branch, true)
}

function required(name) {
  if (!process.env[name]) throw new Error(`Missing ${name}`)
  return process.env[name]
}

function id(name) {
  const value = required(name)
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0 || String(Number(value)) !== value) {
    throw new Error(`Invalid ${name}`)
  }
  return Number(value)
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function fetchBranch(repository, branch, authenticate = false) {
  const ref = `refs/heads/${branch}`
  if (spawnSync("git", ["check-ref-format", ref]).status !== 0) throw new Error(`Invalid target branch: ${branch}`)
  // The helper reads the token from the environment; neither config nor command arguments store its value.
  const auth =
    authenticate && process.env.CI_JOB_TOKEN
      ? [
          "-c", "credential.helper=", "-c",
          'credential.helper=!f() { printf "%s\\n" username=gitlab-ci-token "password=$CI_JOB_TOKEN"; }; f',
        ]
      : []
  git([...auth, "fetch", "--no-tags", "--", repository, ref])
  return git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"])
}

console.log(await resolveBase(process.argv[2]))
