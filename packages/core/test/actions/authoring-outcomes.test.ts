import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Layer } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { AuthoringFixture } from "./authoring-fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

it.live("branch acknowledgement must prove the exact new ref and expected base commit", Effect.gen(function* () {
  for (const data of [null, { ref: "refs/heads/other", object: { type: "commit", sha: AuthoringFixture.commit } },
    { ref: `refs/heads/${AuthoringFixture.branch}`, object: { type: "commit", sha: AuthoringFixture.nextCommit } }]) {
    const fixture = AuthoringFixture.make("github", { write: () => Effect.succeed({ status: 201, headers: {}, data }) })
    fixture.state.exists = false
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("github", "source.branch", {
      ref: "dev", path: AuthoringFixture.path("github"), resourceID: AuthoringFixture.branch,
    }, { commit: AuthoringFixture.commit }), { provider: "github", branch: AuthoringFixture.branch }).pipe(Effect.flip)
    expect(result.kind).toBe("outcome_unknown")
    expect(result.disposition).toBe("unknown")
    expect(fixture.state.writes).toBe(1)
  }
}))

it.live("review never attributes a fork/other-project request to the captured same-project branch", Effect.gen(function* () {
  for (const provider of ["github", "gitlab"] as const) {
    const data = AuthoringFixture.makeJson(provider === "github" ? { id: 91, number: 9, html_url: "https://github.com/owner/project/pull/9", title: "Update CI", body: "",
      state: "open", head: { ref: AuthoringFixture.branch, sha: AuthoringFixture.commit, repo: { id: 22 } }, base: { ref: "dev", repo: { id: 21 } } }
      : { id: 91, iid: 9, project_id: 21, source_project_id: 22, target_project_id: 21, source_branch: AuthoringFixture.branch,
        target_branch: "dev", sha: AuthoringFixture.commit, title: "Update CI", description: "", state: "opened",
        web_url: "https://gitlab.com/owner/project/-/merge_requests/9" })
    const response: ActionsContract.Response = { status: 201, headers: {}, data }
    const fixture = AuthoringFixture.make(provider, { write: () => Effect.succeed(response) })
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.review", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path(provider), resourceID: "dev",
    }, { commit: AuthoringFixture.commit }), { provider, title: "Update CI", text: "" }).pipe(Effect.flip)
    expect(result.kind).toBe("outcome_unknown")
    expect(fixture.state.writes).toBe(1)
  }
}))

it.live("transport outcome classification preserves definitive rejection but strips reflected submitted text", Effect.gen(function* () {
  for (const disposition of ["definitely_rejected", "unknown"] as const) {
    const fixture = AuthoringFixture.make("github", { write: () => Effect.fail(new ActionsError({ kind: "transport_failed",
      message: "provider echoed secret-from-body", resourceID: "secret-from-body", disposition })) })
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("github", "source.write", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path("github"),
    }), { provider: "github", mode: "update", message: "secret-from-body", text: AuthoringFixture.draft }).pipe(Effect.flip)
    expect(result.disposition).toBe(disposition)
    expect(result.kind).toBe(disposition === "unknown" ? "outcome_unknown" : "transport_failed")
    expect(JSON.stringify(result)).not.toContain("secret-from-body")
    expect(fixture.state.writes).toBe(1)
  }
}))

it.live("authoring snapshots payload before native reads; caller mutation cannot change the sent draft", Effect.gen(function* () {
  const payload = { provider: "github", mode: "update", message: "ci: update", text: AuthoringFixture.draft }
  const fixture = AuthoringFixture.make("github", { read: (request) => {
    if (request.path === "repositories/21") payload.text = "changed during preflight"
    return undefined
  } })
  const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("github", "source.write", {
    ref: AuthoringFixture.branch, path: AuthoringFixture.path("github"),
  }), payload)
  expect(result.acknowledgement.resourceID).toBe(AuthoringFixture.nextCommit)
  expect(fixture.requests.find((request) => request.method === "PUT")?.body).toMatchObject({ content: Buffer.from(AuthoringFixture.draft).toString("base64") })
}))

it.live("GitLab source version requires exact blob_id and last_commit_id JSON", Effect.gen(function* () {
  for (const sourceVersion of [AuthoringFixture.blob(AuthoringFixture.original), "{}", JSON.stringify({ blob_id: AuthoringFixture.blob(AuthoringFixture.original),
    last_commit_id: AuthoringFixture.commit, token: "must-not-leak" })]) {
    const fixture = AuthoringFixture.make("gitlab")
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("gitlab", "source.write", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path("gitlab"),
    }, { commit: AuthoringFixture.commit, sourceVersion }), { provider: "gitlab", mode: "update", message: "ci: update", text: AuthoringFixture.draft }).pipe(Effect.flip)
    expect(result.kind).toBe("invalid_input")
    expect(fixture.requests).toHaveLength(0)
    expect(JSON.stringify(result)).not.toContain("must-not-leak")
  }
}))

it.live("malformed Unicode and source above 1 MiB fail before native reads", Effect.gen(function* () {
  for (const text of ["#\uD800", "é".repeat(1024 * 1024)]) {
    const fixture = AuthoringFixture.make("github")
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("github", "source.write", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path("github"),
    }), { provider: "github", mode: "update", message: "ci: update", text }).pipe(Effect.flip)
    expect(result.kind).toBe("invalid_input")
    expect(fixture.requests).toHaveLength(0)
  }
}))

it.live("explicit GitLab validation uses optional native CI lint without evaluating regex or upgrading include topology", Effect.gen(function* () {
  const fixture = AuthoringFixture.make("gitlab", { write: () => Effect.succeed({ status: 200, headers: {}, data: {
    valid: true, errors: [], warnings: [],
  } }) })
  const source = Actions.Source.make({ bindingID: fixture.binding.id, path: ".gitlab-ci.yml", ref: "dev", commit: AuthoringFixture.commit,
    version: AuthoringFixture.version("gitlab"), editable: false,
    text: "spec:\n  inputs:\n    value: {regex: '(a+)+$'}\n---\ninclude: {local: other.yml}\nbuild: {script: echo native}\n" })
  const graph = yield* fixture.service.validate(fixture.binding, source)
  expect(graph.state).toBe("partial")
  expect(graph.source.text).toBe(source.text)
  expect(graph.diagnostics).toContain("source_partial:include_unresolved:external GitLab configuration not fetched")
  expect(fixture.requests).toEqual([{ method: "POST", path: "projects/21/ci/lint", body: { content: source.text, include_jobs: false, dry_run: false } }])
}))

it.live("optional lint failure is named partial; provider rejection is unresolved with no reflected body", Effect.gen(function* () {
  for (const valid of [undefined, false]) {
    const fixture = AuthoringFixture.make("gitlab", { write: () => valid === undefined
      ? Effect.fail(new ActionsError({ kind: "permission_denied", message: "private-provider-diagnostic" }))
      : Effect.succeed({ status: 200, headers: {}, data: { valid, errors: ["private-provider-diagnostic"], warnings: [] } }) })
    const graph = yield* fixture.service.validate(fixture.binding, Actions.Source.make({ bindingID: fixture.binding.id, path: ".gitlab-ci.yml", ref: "dev",
      version: AuthoringFixture.version("gitlab"), editable: false, text: "build: {script: echo native}\n" }))
    expect(graph.state).toBe(valid === undefined ? "partial" : "unresolved")
    expect(graph.diagnostics).toContain(valid === undefined ? "source_partial:gitlab_lint_unavailable:provider validation was not established"
      : "source_unresolved:gitlab_lint_invalid:provider rejected this source")
    expect(JSON.stringify(graph)).not.toContain("private-provider-diagnostic")
  }
}))
