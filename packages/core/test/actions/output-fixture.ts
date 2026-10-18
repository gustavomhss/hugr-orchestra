export * as OutputFixture from "./output-fixture"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsOutput } from "../../src/actions/output"

export const github = Actions.Binding.make({ id: Actions.BindingID.make("ab_outputgh"), revision: 1, remote: "origin",
  directory: "/fixture", projectID: "9347", projectPath: "acme/renamed", account: "fixture-user",
  provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } })
export const gitlab = Actions.Binding.make({ ...github, id: Actions.BindingID.make("ab_outputgl"), projectID: "21", projectPath: "group/project",
  provider: { kind: "gitlab", hostname: "gitlab.example.com", apiOrigin: "https://gitlab.example.com" } })
// Native shapes from GitHub REST Actions artifacts/jobs and GitLab Jobs API examples.
// Deterministic identities and synthetic secrets; not live-provider qualification.
export const artifact = { id: 11, name: "result", size_in_bytes: 17, expired: false,
  workflow_run: { id: 30433642, repository_id: 9347, head_repository_id: 9347 },
  digest: `sha256:${"a".repeat(64)}`, expires_at: "2099-01-01T00:00:00Z",
  archive_download_url: "https://signed.invalid/?secret=synthetic-url-secret", token: "synthetic-token" }
export const job = { id: 8, name: "build", status: "success", pipeline: { id: 287, project_id: 21 },
  artifacts_file: { filename: "artifacts.zip", size: 17 },
  artifacts: [{ file_type: "archive", size: 17, filename: "artifacts.zip", file_format: "zip" }],
  artifacts_expire_at: "2099-01-01T00:00:00Z", erased_at: null,
  web_url: "https://signed.invalid/?secret=synthetic-url-secret", token: "synthetic-token" }
export const bytes = new Uint8Array([0, 10, 10, 255, 128, 13, 10, 65, 0, 0, 1, 2, 3, 4, 5, 6, 7])

export function response(data: ActionsContract.Json, headers: Record<string, string> = {}, status = 200): ActionsContract.Response {
  return { data, headers, status }
}

export function key(request: ActionsContract.Request) {
  const query = Object.entries(request.query ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("&")
  return `${request.path}${query ? `?${query}` : ""}`
}

export function run(binding: Actions.Binding, id: string): Actions.Run {
  return { id, bindingID: binding.id, workflowID: "native-workflow", repositoryID: binding.projectID, name: "CI", ref: "main",
    commit: "a".repeat(40), event: "push", status: "completed", ...(binding.provider.kind === "github" ? { attempt: 3 } : {}) }
}

export function reader(binding: Actions.Binding): ActionsContract.ReadAdapter {
  const unused = new ActionsError({ kind: "transport_failed", message: "Output fixture received an unrelated reader call" })
  return { capabilities: () => Effect.fail(unused), workflows: () => Effect.fail(unused), source: () => Effect.fail(unused),
    runs: () => Effect.fail(unused), jobs: () => Effect.fail(unused), run: (_binding, id) => Effect.succeed(run(binding, id)) }
}

export function make(binding = github, routes: Readonly<Record<string, ActionsContract.Response | ActionsError>> = {},
  body: Stream.Stream<Uint8Array, ActionsError> = Stream.make(bytes.subarray(0, 4), bytes.subarray(4))) {
  const requests: ActionsContract.Request[] = []
  const transfers: ActionsContract.Request[] = []
  const unused = new ActionsError({ kind: "transport_failed", message: "Output fixture received an unrelated transport call" })
  const transport: ActionsContract.Transport = {
    resolve: () => Effect.fail(unused), upload: () => Effect.fail(unused),
    request: (_binding, input) => Effect.suspend(() => {
      requests.push(input)
      if (input.method !== "GET" || input.body !== undefined) return Effect.fail(unused)
      if (input.path === `${binding.provider.kind === "github" ? "repositories" : "projects"}/${binding.projectID}`)
        return Effect.succeed(response({ id: Number(binding.projectID) }))
      const value = routes[key(input)]
      if (!value) return Effect.fail(new ActionsError({ kind: "transport_failed", message: `Unrecorded output endpoint: ${key(input)}` }))
      return value instanceof ActionsError ? Effect.fail(value) : Effect.succeed(value)
    }),
    bytes: (_binding, input) => Stream.unwrap(Effect.sync(() => { transfers.push(input); return body })),
    open: (_binding, input) => Effect.sync(() => {
      transfers.push(input)
      return { status: 200, headers: {}, body, close: Effect.void }
    }),
  }
  const adapter = reader(binding)
  return { service: ActionsOutput.make({ transport, reader: adapter }), transport, reader: adapter, requests, transfers }
}
