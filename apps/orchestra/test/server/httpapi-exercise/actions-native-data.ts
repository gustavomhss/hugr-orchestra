import { Schema } from "effect"

export const workflowPath = ".github/workflows/ci.yml"
export const workflowText = "name: CI\non: workflow_dispatch\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps: [{run: echo build}]\n  test:\n    needs: build\n    runs-on: ubuntu-latest\n    steps: [{run: echo test}]\n"
export const runID = "9007199254740993123"
export const jobID = "9007199254740993456"
export const root = "repositories/1234"
export const logText = "fixture build\ncafé\n"
export const bindingInput = {
  remote: "origin",
  provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" },
  projectPath: "acme/widgets",
} as const

// Sanitized native REST shapes, following Core's assembly/command fixtures. No live-provider claim.
export const Reply = Schema.Struct({
  status: Schema.Number,
  data: Schema.optionalKey(Schema.Json),
  raw: Schema.optionalKey(Schema.String),
  payload: Schema.optionalKey(Schema.Json),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})
export const Replies = Schema.Record(Schema.String, Reply)
export const NativeCall = Schema.Struct({ method: Schema.String, endpoint: Schema.String, metadata: Schema.Boolean })

export function nativeReplies(commit: string, blob: string, state = "completed") {
  const repo = { id: 1234, full_name: "acme/widgets", default_branch: "main", private: false,
    permissions: { push: true, pull: true, admin: true }, archived: false }
  const workflow = { id: 42, name: null, path: workflowPath, state: "active" }
  const run = { id: runID, workflow_id: 42, repository: repo, name: null, head_branch: "main", head_sha: commit,
    event: state === "action_required" ? "pull_request" : "workflow_dispatch", status: state === "unknown" ? null : state,
    conclusion: state === "action_required" ? "action_required" : state === "completed" ? "success" : null,
    run_attempt: 4, head_repository: { id: 6789, fork: true }, created_at: "2026-10-12T00:00:00Z",
    html_url: `https://github.com/acme/widgets/actions/runs/${runID}` }
  const job = { id: jobID, run_id: runID, run_attempt: 4, head_sha: commit, name: "build", status: "completed",
    conclusion: "success", runner_id: 0, runner_name: null, steps: [{ number: 1, name: "Compile", status: null, conclusion: null }] }
  const content = { type: "file", path: workflowPath, sha: blob, size: Buffer.byteLength(workflowText),
    encoding: "base64", content: Buffer.from(workflowText).toString("base64") }
  const reply = (data: typeof Schema.Json.Type, status = 200) => ({ status, data,
    headers: { "x-github-api-version-selected": "2026-03-10", "x-oauth-scopes": "public_repo" } })
  const variable = { name: "BUILD_MODE", value: "debug", created_at: "2026-10-12T00:00:00Z", updated_at: "2026-10-12T00:00:00Z" }
  return {
    "GET repos/acme/widgets": reply(repo),
    "GET user": reply({ id: 7, login: "fixture-actor" }),
    [`GET ${root}`]: reply(repo),
    [`GET ${root}/actions/workflows/42`]: reply(workflow),
    ...Object.fromEntries([1, 7, 50].map((limit) => [`GET ${root}/actions/workflows?page=1&per_page=${limit}`,
      reply({ total_count: 1, workflows: [workflow] })])),
    [`GET ${root}/actions/runs?branch=main&head_sha=${commit}&page=1&per_page=9`]: reply({ total_count: 1, workflow_runs: [run] }),
    [`GET ${root}/actions/runs/${runID}`]: reply(run),
    [`GET ${root}/actions/runs/${runID}/attempts/4/jobs?page=1&per_page=50`]: reply({ total_count: 1, jobs: [job] }),
    [`GET ${root}/actions/runs/${runID}/attempts/4`]: reply(run),
    [`GET ${root}/actions/jobs/${jobID}`]: reply(job),
    [`GET ${root}/actions/jobs/${jobID}/logs`]: { status: 200, raw: logText },
    ...Object.fromEntries(["main", commit].map((ref) => [`GET ${root}/commits/${ref}`, reply({ sha: commit })])),
    [`GET ${root}/contents/${workflowPath}?ref=${commit}`]: reply(content),
    [`GET ${root}/git/ref/heads/main`]: reply({ ref: "refs/heads/main", object: { type: "commit", sha: commit } }),
    [`GET ${root}/actions/variables?page=1&per_page=2`]: reply({ total_count: 1, variables: [variable] }),
    [`GET ${root}/actions/secrets?page=1&per_page=2`]: reply({ total_count: 1,
      secrets: [{ name: "SECRET_NAME", created_at: variable.created_at, updated_at: variable.updated_at }] }),
    [`GET ${root}/actions/variables/NEW_MODE`]: reply({ message: "Not Found" }, 404),
    [`POST ${root}/actions/variables`]: { status: 201, raw: "", payload: { name: "NEW_MODE", value: "fixture-only" } },
    [`POST ${root}/actions/workflows/42/dispatches`]: { ...reply({ workflow_run_id: runID,
      run_url: `https://api.github.com/repos/acme/widgets/actions/runs/${runID}`,
      html_url: `https://github.com/acme/widgets/actions/runs/${runID}` }), payload: { ref: "main", inputs: {} } },
    [`PUT ${root}/actions/workflows/42/disable`]: { status: 204, raw: "" },
    [`POST ${root}/actions/runs/${runID}/rerun`]: { status: 201, raw: "", payload: {} },
    [`POST ${root}/actions/runs/${runID}/cancel`]: { status: 202, raw: "" },
    [`POST ${root}/actions/runs/${runID}/force-cancel`]: { status: 202, raw: "" },
    [`DELETE ${root}/actions/runs/${runID}`]: { status: 204, raw: "" },
    [`POST ${root}/actions/runs/${runID}/approve`]: { status: 201, raw: "" },
    [`POST ${root}/actions/jobs/${jobID}/rerun`]: { status: 201, raw: "", payload: {} },
    [`POST ${root}/git/refs`]: { ...reply({ ref: "refs/heads/httpapi-proposal", object: { type: "commit", sha: commit } }, 201),
      payload: { ref: "refs/heads/httpapi-proposal", sha: commit } },
  } satisfies typeof Replies.Type
}
