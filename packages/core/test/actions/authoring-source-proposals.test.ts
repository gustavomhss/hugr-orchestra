import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ActionsError } from "../../src/actions/error"
import { ActionsResponse } from "../../src/actions/transport/response"
import { AuthoringFixture } from "./authoring-fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const providers = ["github", "gitlab"] as const

providers.forEach((provider) => {
  const path = provider === "github" ? ".github/workflows/proposal.yaml" : ".gitlab/ci/proposal.yml"
  const file = provider === "github" ? `repositories/21/contents/${path}` : `projects/21/repository/files/${encodeURIComponent(path)}`
  const target = { path, ref: "dev", resourceID: AuthoringFixture.branch }

  it.live(`${provider}: new branch requires exact-path native absence after project, actor and head proof`, Effect.gen(function* () {
    for (const response of [false, true]) {
      const fixture = AuthoringFixture.make(provider, { path, readResponse: (request) => request.path === file
        ? response ? Effect.succeed({ status: 404, headers: {}, data: { message: "Not Found" } })
          : Effect.fail(ActionsResponse.failure(AuthoringFixture.binding(provider).provider, 1, Buffer.alloc(0), 404, {}, true))
        : undefined })
      const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.branch", target,
        { commit: AuthoringFixture.commit }), { provider, branch: AuthoringFixture.branch })
      expect(result).toEqual({ acknowledgement: { resourceID: AuthoringFixture.branch } })
      expect(fixture.requests.filter((request) => request.path === file)).toEqual([
        { method: "GET", path: file, query: { ref: AuthoringFixture.commit } },
      ])
      expect(fixture.requests.slice(0, 3).map((request) => request.path)).toEqual(provider === "github"
        ? ["repositories/21", "user", "repositories/21/git/ref/heads/dev"]
        : ["projects/21", "user", "projects/21/repository/branches/dev"])
      expect(fixture.requests.filter((request) => request.method !== "GET")).toEqual([provider === "github"
        ? { method: "POST", path: "repositories/21/git/refs", body: { ref: `refs/heads/${AuthoringFixture.branch}`, sha: AuthoringFixture.commit } }
        : { method: "POST", path: "projects/21/repository/branches", body: { branch: AuthoringFixture.branch, ref: AuthoringFixture.commit } }])
    }
  }))

  it.live(`${provider}: any existing target blocks new-file branch before first mutation`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider, { path })
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.branch", target,
      { commit: AuthoringFixture.commit }), { provider, branch: AuthoringFixture.branch }).pipe(Effect.flip)
    expect(result.kind).toBe("source_conflict")
    expect(result.disposition).toBe("definitely_unsent")
    expect(fixture.requests.at(-1)).toEqual({ method: "GET", path: file, query: { ref: AuthoringFixture.commit } })
    expect(fixture.state.writes).toBe(0)
  }))

  it.live(`${provider}: auth, partial not-found and generic errors never become file absence`, Effect.gen(function* () {
    for (const failure of [
      new ActionsError({ kind: "not_found", disposition: "unknown", message: "HTTP 404 private provider detail" }),
      new ActionsError({ kind: "not_found", disposition: "definitely_unsent", message: "private provider detail" }),
      new ActionsError({ kind: "transport_failed", disposition: "definitely_rejected", message: "HTTP 404 private provider detail" }),
      ...[401, 403, 429, 500].map((status) => ActionsResponse.failure(AuthoringFixture.binding(provider).provider, 1,
        Buffer.alloc(0), status, {}, true)),
    ]) {
      const fixture = AuthoringFixture.make(provider, { path, readResponse: (request) => request.path === file ? Effect.fail(failure) : undefined })
      const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.branch", target,
        { commit: AuthoringFixture.commit }), { provider, branch: AuthoringFixture.branch }).pipe(Effect.flip)
      expect(result.kind).toBe(failure.kind)
      expect(result.disposition).toBe("definitely_unsent")
      expect(fixture.state.writes).toBe(0)
      expect(JSON.stringify(result)).not.toContain("private provider detail")
    }
    for (const status of [201, 204, 302, 400, 401, 403, 409, 422, 429, 500]) {
      const fixture = AuthoringFixture.make(provider, { path, readResponse: (request) => request.path === file
        ? Effect.succeed({ status, headers: {}, data: null }) : undefined })
      const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.branch", target,
        { commit: AuthoringFixture.commit }), { provider, branch: AuthoringFixture.branch }).pipe(Effect.flip)
      expect(result.disposition).toBe("definitely_unsent")
      expect(fixture.state.writes).toBe(0)
    }
  }))

  it.live(`${provider}: project/ref 404 and mismatched actor cannot authorize absence`, Effect.gen(function* () {
    const project = provider === "github" ? "repositories/21" : "projects/21"
    const ref = provider === "github" ? "repositories/21/git/ref/heads/dev" : "projects/21/repository/branches/dev"
    for (const failedPath of [project, ref, "user"]) {
      const fixture = AuthoringFixture.make(provider, { path, readResponse: (request) => request.path === failedPath
        ? request.path === "user" ? Effect.succeed({ status: 200, headers: {}, data: { id: 7, login: "other", username: "other" } })
          : Effect.fail(ActionsResponse.failure(AuthoringFixture.binding(provider).provider, 1, Buffer.alloc(0), 404, {}, true))
        : undefined })
      const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.branch", target,
        { commit: AuthoringFixture.commit }), { provider, branch: AuthoringFixture.branch }).pipe(Effect.flip)
      expect(result.disposition).toBe("definitely_unsent")
      expect(fixture.requests.some((request) => request.path === file)).toBe(false)
      expect(fixture.state.writes).toBe(0)
    }
  }))

  it.live(`${provider}: create keeps provider-native race rejection after absence was proved`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider, { path, readResponse: (request) => request.path === file
      ? Effect.succeed({ status: 404, headers: {}, data: null }) : undefined,
      write: (request) => request.path === file
        ? Effect.fail(ActionsResponse.failure(AuthoringFixture.binding(provider).provider, 1, Buffer.alloc(0), provider === "github" ? 422 : 400, {}, true))
        : Effect.succeed({ status: 201, headers: {}, data: AuthoringFixture.makeJson(provider === "github"
          ? { ref: `refs/heads/${AuthoringFixture.branch}`, object: { type: "commit", sha: AuthoringFixture.commit } }
          : { name: AuthoringFixture.branch, commit: { id: AuthoringFixture.commit } }) }),
    })
    yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.branch", target,
      { commit: AuthoringFixture.commit }), { provider, branch: AuthoringFixture.branch })
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.write", {
      path, ref: AuthoringFixture.branch,
    }, { commit: AuthoringFixture.commit }), { provider, mode: "create", message: "ci: proposal", text: AuthoringFixture.draft }).pipe(Effect.flip)
    expect(result.disposition).toBe("definitely_rejected")
    expect(fixture.requests.filter((request) => request.path === file && request.method !== "GET")).toEqual([provider === "github"
      ? { method: "PUT", path: file, body: { branch: AuthoringFixture.branch, message: "ci: proposal", content: Buffer.from(AuthoringFixture.draft).toString("base64") } }
      : { method: "POST", path: file, body: { branch: AuthoringFixture.branch, commit_message: "ci: proposal", content: AuthoringFixture.draft } }])
    expect(fixture.state.writes).toBe(2)
  }))
})

it.live("GitHub invalid workflow paths fail before reads for branch/write/review", Effect.gen(function* () {
  for (const path of ["ci.yml", ".github/workflows/nested/ci.yml", ".github/workflows/ci.json", ".github/workflows/.yaml", ".github/workflows/../ci.yml"]) {
    for (const kind of ["source.branch", "source.write", "source.review"] as const) {
      const fixture = AuthoringFixture.make("github")
      const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("github", kind,
        { path, ref: "dev", ...(kind === "source.branch" ? { resourceID: AuthoringFixture.branch } : {}) }, { commit: AuthoringFixture.commit }),
        kind === "source.branch" ? { provider: "github", branch: AuthoringFixture.branch }
          : kind === "source.write" ? { provider: "github", mode: "create", message: "ci: proposal", text: AuthoringFixture.draft }
          : { provider: "github", title: "Update CI", text: "Review text" }).pipe(Effect.flip)
      expect(result.disposition).toBe("definitely_unsent")
      expect(fixture.requests).toEqual([])
    }
  }
}))

it.live("GitLab local proposals keep exact path through branch/write/review despite different native config slot", Effect.gen(function* () {
  for (const path of [".gitlab/ci/proposal.yml", ".gitlab-ci.yml"]) {
    for (const configPath of [".gitlab/ci/native.yml", "native.yml@other/project", null]) {
      const fixture = AuthoringFixture.make("gitlab", { path, configPath })
      fixture.state.exists = false
      const branched = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("gitlab", "source.branch", {
        path, ref: "dev", resourceID: AuthoringFixture.branch,
      }, { commit: AuthoringFixture.commit }), { provider: "gitlab", branch: AuthoringFixture.branch })
      expect(branched.acknowledgement.resourceID).toBe(AuthoringFixture.branch)
      const written = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("gitlab", "source.write", {
        path, ref: AuthoringFixture.branch,
      }, { commit: AuthoringFixture.commit }), { provider: "gitlab", mode: "create", message: "ci: proposal", text: AuthoringFixture.draft })
      expect(written.acknowledgement.resourceID).toBe(AuthoringFixture.nextCommit)
      const reviewed = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("gitlab", "source.review", {
        path, ref: AuthoringFixture.branch, resourceID: "dev",
      }, { commit: AuthoringFixture.nextCommit, sourceVersion: AuthoringFixture.version("gitlab", AuthoringFixture.draft, AuthoringFixture.nextCommit) }),
      { provider: "gitlab", title: "Update CI", text: "Review text" })
      expect(reviewed.output).toEqual({ kind: "sourceReview", id: "9", url: "https://gitlab.com/owner/project/-/merge_requests/9" })
      expect(fixture.requests.filter((request) => request.path.includes("/repository/files/"))).toEqual([
        { method: "GET", path: `projects/21/repository/files/${encodeURIComponent(path)}`, query: { ref: AuthoringFixture.commit } },
        { method: "POST", path: `projects/21/repository/files/${encodeURIComponent(path)}`, body: {
          branch: AuthoringFixture.branch, commit_message: "ci: proposal", content: AuthoringFixture.draft,
        } },
        { method: "GET", path: `projects/21/repository/files/${encodeURIComponent(path)}`, query: { ref: AuthoringFixture.nextCommit } },
        { method: "GET", path: `projects/21/repository/files/${encodeURIComponent(path)}`, query: { ref: AuthoringFixture.nextCommit } },
      ])
      expect(fixture.requests.filter((request) => request.method !== "GET").map((request) => [request.method, request.path])).toEqual([
        ["POST", "projects/21/repository/branches"], ["POST", `projects/21/repository/files/${encodeURIComponent(path)}`], ["POST", "projects/21/merge_requests"],
      ])
      expect(fixture.state.text).toBe(AuthoringFixture.draft)
    }
  }
}))

it.live("GitHub workflow directory casing rejects branch/write/review before any native reads", Effect.gen(function* () {
  for (const path of [".GITHUB/workflows/ci.yml", ".github/WORKFLOWS/ci.yml", ".GITHUB/WORKFLOWS/ci.yml", ".GitHub/Workflows/ci.YAML"]) {
    for (const kind of ["source.branch", "source.write", "source.review"] as const) {
      const fixture = AuthoringFixture.make("github")
      const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("github", kind,
        { path, ref: "dev", ...(kind === "source.branch" ? { resourceID: AuthoringFixture.branch } : {}) }, { commit: AuthoringFixture.commit }),
        kind === "source.branch" ? { provider: "github", branch: AuthoringFixture.branch }
          : kind === "source.write" ? { provider: "github", mode: "create", message: "ci: proposal", text: AuthoringFixture.draft }
          : { provider: "github", title: "Update CI", text: "Review text" }).pipe(Effect.flip)
      expect(result.kind).toBe("source_unresolved")
      expect(result.disposition).toBe("definitely_unsent")
      expect(fixture.requests).toEqual([])
    }
  }
}))

it.live("GitHub workflow extensions remain case-insensitive under exact lowercase directory", Effect.gen(function* () {
  for (const path of [".github/workflows/CI.YML", ".github/workflows/CI.YaML"]) {
    const fixture = AuthoringFixture.make("github", { path })
    fixture.state.exists = false
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("github", "source.branch", {
      path, ref: "dev", resourceID: AuthoringFixture.branch,
    }, { commit: AuthoringFixture.commit }), { provider: "github", branch: AuthoringFixture.branch })
    expect(result.acknowledgement.resourceID).toBe(AuthoringFixture.branch)
    expect(fixture.requests.filter((request) => request.path.includes("/contents/"))).toEqual([
      { method: "GET", path: `repositories/21/contents/${path}`, query: { ref: AuthoringFixture.commit } },
    ])
    expect(fixture.requests.filter((request) => request.method !== "GET")).toEqual([
      { method: "POST", path: "repositories/21/git/refs", body: { ref: `refs/heads/${AuthoringFixture.branch}`, sha: AuthoringFixture.commit } },
    ])
  }
}))
