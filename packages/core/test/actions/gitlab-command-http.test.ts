import { expect } from "bun:test"
import { Effect, Exit, Fiber } from "effect"
import { AppProcess } from "../../src/process"
import { LayerNode } from "../../src/effect/layer-node"
import { testEffect } from "../lib/effect"
import { GitLabCommandFixture } from "./gitlab-command-fixture"
import { GitLabCommandHttpFixture } from "./gitlab-command-http-fixture"

const it = testEffect(LayerNode.compile(AppProcess.node))
const intent = GitLabCommandFixture.intent("pipeline.trigger", { workflowID: "gitlab:project:21:pipeline", ref: "main" })
const payload = { provider: "gitlab", ref: "main", token: "synthetic-trigger-secret", variables: { X: "synthetic-variable-secret" } }

it.live("GitLab command real HTTPS uses native actor preflight, JSON-only trigger secret and one POST", Effect.gen(function* () {
  const fixture = yield* GitLabCommandHttpFixture.make()
  expect(yield* fixture.service.perform(fixture.binding, intent, payload)).toEqual({ acknowledgement: { runID: "501" } })
  const writes = fixture.requests.filter((request) => request.method !== "GET")
  expect(writes).toHaveLength(1)
  expect(writes[0].path).toBe("/api/v4/projects/21/trigger/pipeline")
  expect(JSON.parse(writes[0].prefix.toString())).toEqual({ ref: "main", token: payload.token, variables: payload.variables })
  expect(fixture.requests.at(-2)?.path).toBe("/api/v4/user")
  expect(fixture.requests.at(-2)?.headers["private-token"]).toBe(writes[0].headers["private-token"])
  expect(fixture.observed.flat().join(" ")).not.toContain(payload.token)
  expect(fixture.observed.flat().join(" ")).not.toContain(payload.variables.X)
  expect(fixture.observed.every((argv) => argv[0] === "version" || argv[0] === "config")).toBe(true)
  expect(writes[0].path).not.toContain(payload.token)
  fixture.state.actor = "changed-user"
  const before = writes.length
  expect(yield* fixture.service.perform(fixture.binding, intent, payload).pipe(Effect.flip)).toMatchObject({ kind: "binding_stale", disposition: "definitely_unsent" })
  expect(fixture.requests.filter((request) => request.method !== "GET")).toHaveLength(before)
}), 120_000)

it.live("GitLab real TLS pure creation delegates external CI; supplied input and native constraints reject without POST", Effect.gen(function* () {
  const fixture = yield* GitLabCommandHttpFixture.make()
  fixture.content.project = { ...GitLabCommandFixture.project, ci_config_path: "https://ci.example.com/native.yml" }
  const dispatch = GitLabCommandFixture.intent("workflow.dispatch", { workflowID: "gitlab:project:21:pipeline", ref: "main" })
  expect(yield* fixture.service.perform(fixture.binding, dispatch, { provider: "gitlab", ref: "main" }))
    .toEqual({ acknowledgement: { runID: "501" } })
  expect(fixture.requests.filter((request) => request.method === "POST").map((request) => request.path)).toEqual(["/api/v4/projects/21/pipeline"])
  expect(fixture.requests.some((request) => request.path.includes("repository/files/"))).toBe(false)
  expect(yield* fixture.service.perform(fixture.binding, dispatch, { provider: "gitlab", ref: "main", inputs: {} }).pipe(Effect.flip))
    .toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
  expect(fixture.requests.filter((request) => request.method === "POST")).toHaveLength(1)
  fixture.content.project = GitLabCommandFixture.project
  fixture.content.text = "spec:\n  inputs:\n    environment:\n      type: string\n      regex: '^prod$'\n---\nbuild:\n  script: true\n"
  expect(yield* fixture.service.perform(fixture.binding, dispatch, { provider: "gitlab", ref: "main", inputs: { environment: "dev" } }).pipe(Effect.flip))
    .toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
  expect(fixture.requests.filter((request) => request.method === "POST")).toHaveLength(1)
}), 120_000)

it.live("GitLab real TLS late wrong-source readback remains unknown after exactly one POST", Effect.gen(function* () {
  const fixture = yield* GitLabCommandHttpFixture.make()
  fixture.content.lateWrongSource = true
  const retry = GitLabCommandFixture.intent("job.retry", { jobID: "8", runID: "287", ref: "main" }, { commit: GitLabCommandFixture.commit })
  expect(yield* fixture.service.perform(fixture.binding, retry, { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(fixture.requests.filter((request) => request.method === "POST").map((request) => request.path)).toEqual(["/api/v4/projects/21/jobs/8/retry"])
  expect(fixture.requests.at(-1)?.path).toBe("/api/v4/projects/21/jobs/9")
}), 120_000)

it.live("GitLab command real HTTPS preserves definitive denial and unknown socket outcome without retry or secret diagnostics", Effect.gen(function* () {
  const fixture = yield* GitLabCommandHttpFixture.make()
  fixture.state.status = 403
  const refusal = yield* fixture.service.perform(fixture.binding, intent, payload).pipe(Effect.flip)
  expect(refusal).toMatchObject({ kind: "permission_denied", disposition: "definitely_rejected" })
  expect(JSON.stringify(refusal)).not.toContain(payload.token)
  expect(fixture.requests.filter((request) => request.method === "POST")).toHaveLength(1)
  fixture.state.status = 201
  fixture.state.reset = true
  const unknown = yield* fixture.service.perform(fixture.binding, intent, payload).pipe(Effect.flip)
  expect(unknown).toMatchObject({ kind: "transport_failed", disposition: "unknown" })
  expect(JSON.stringify(unknown)).not.toContain(payload.token)
  expect(fixture.requests.filter((request) => request.method === "POST")).toHaveLength(2)
  fixture.state.reset = false
  fixture.state.hold = true
  const old = fixture.requests.length
  const fiber = yield* fixture.service.perform(fixture.binding, intent, payload).pipe(Effect.forkChild)
  yield* Effect.promise(async () => {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline && !fixture.requests.slice(old).some((request) => request.method === "POST" && request.size > 0)) await Bun.sleep(10)
  })
  expect(fixture.requests.slice(old).filter((request) => request.method === "POST")).toHaveLength(1)
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  expect(fixture.requests.filter((request) => request.method === "POST")).toHaveLength(3)
}), 120_000)
