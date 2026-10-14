import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AuthoringFixture } from "./authoring-fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const providers = ["github", "gitlab"] as const

providers.forEach((provider) => {
  it.live(`${provider}: branch creation is one write from the exact expected base OID`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider)
    const value = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.branch", {
      ref: "dev", path: AuthoringFixture.path(provider), resourceID: AuthoringFixture.branch,
    }), { provider, branch: AuthoringFixture.branch })
    expect(value).toEqual({ acknowledgement: { resourceID: AuthoringFixture.branch } })
    expect(fixture.requests.filter((request) => request.method !== "GET")).toEqual([provider === "github"
      ? { method: "POST", path: "repositories/21/git/refs", body: { ref: `refs/heads/${AuthoringFixture.branch}`, sha: AuthoringFixture.commit } }
      : { method: "POST", path: "projects/21/repository/branches", body: { branch: AuthoringFixture.branch, ref: AuthoringFixture.commit } }])
  }))

  it.live(`${provider}: update preserves BOM/CRLF/comments and carries native optimistic file precondition`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider)
    const value = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.write", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path(provider),
    }), { provider, mode: "update", message: "ci: update", text: AuthoringFixture.draft })
    expect(value).toEqual({ acknowledgement: { resourceID: AuthoringFixture.nextCommit } })
    const writes = fixture.requests.filter((request) => request.method !== "GET")
    expect(writes).toHaveLength(1)
    expect(writes[0]).toEqual(provider === "github" ? { method: "PUT", path: "repositories/21/contents/.github/workflows/ci.yml", body: {
      message: "ci: update", content: Buffer.from(AuthoringFixture.draft).toString("base64"), sha: AuthoringFixture.blob(AuthoringFixture.original), branch: AuthoringFixture.branch,
    } } : { method: "PUT", path: "projects/21/repository/files/.gitlab-ci.yml", body: {
      commit_message: "ci: update", content: AuthoringFixture.draft, last_commit_id: AuthoringFixture.commit, branch: AuthoringFixture.branch,
    } })
  }))

  it.live(`${provider}: create uses native create/absence semantics and exact UI-supplied text`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider)
    fixture.state.exists = false
    const value = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.write", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path(provider),
    }, { commit: AuthoringFixture.commit }), { provider, mode: "create", message: "ci: create", text: AuthoringFixture.draft,
      name: "UI name", template: "Blank configuration" })
    expect(value.acknowledgement.resourceID).toBe(AuthoringFixture.nextCommit)
    expect(fixture.requests.filter((request) => request.method !== "GET")).toEqual([provider === "github"
      ? { method: "PUT", path: "repositories/21/contents/.github/workflows/ci.yml", body: {
        message: "ci: create", content: Buffer.from(AuthoringFixture.draft).toString("base64"), branch: AuthoringFixture.branch,
      } }
      : { method: "POST", path: "projects/21/repository/files/.gitlab-ci.yml", body: {
        commit_message: "ci: create", content: AuthoringFixture.draft, branch: AuthoringFixture.branch,
      } }])
  }))

  it.live(`${provider}: review returns exact native request ID and owning-request URL, one write`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider)
    const value = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.review", {
      ref: AuthoringFixture.branch, resourceID: "dev", path: AuthoringFixture.path(provider),
    }), { provider, title: "Update CI", text: "Review text" })
    expect(value).toEqual({ acknowledgement: { resourceID: "9" }, output: { kind: "sourceReview", id: "9", url: provider === "github"
      ? "https://github.com/owner/project/pull/9" : "https://gitlab.com/owner/project/-/merge_requests/9" } })
    expect(fixture.requests.filter((request) => request.method !== "GET")).toEqual([provider === "github"
      ? { method: "POST", path: "repositories/21/pulls", body: { head: AuthoringFixture.branch, base: "dev", title: "Update CI", body: "Review text" } }
      : { method: "POST", path: "projects/21/merge_requests", body: { source_branch: AuthoringFixture.branch, target_branch: "dev", title: "Update CI", description: "Review text" } }])
  }))

  it.live(`${provider}: moved branch or changed file rejects before any write`, Effect.gen(function* () {
    for (const expected of [{ commit: AuthoringFixture.nextCommit, sourceVersion: AuthoringFixture.version(provider) },
      { commit: AuthoringFixture.commit, sourceVersion: AuthoringFixture.version(provider, "different") }]) {
      const fixture = AuthoringFixture.make(provider)
      const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.write", {
        ref: AuthoringFixture.branch, path: AuthoringFixture.path(provider),
      }, expected), { provider, mode: "update", message: "ci: update", text: AuthoringFixture.draft }).pipe(Effect.flip)
      expect(result.kind).toBe("source_conflict")
      expect(result.disposition).toBe("definitely_unsent")
      expect(fixture.state.writes).toBe(0)
    }
  }))

  it.live(`${provider}: post-write unreadable source stays unknown; no retry or review side write`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider, { postReadFails: true })
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.write", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path(provider),
    }), { provider, mode: "update", message: "ci: update", text: AuthoringFixture.draft }).pipe(Effect.flip)
    expect(result.kind).toBe("outcome_unknown")
    expect(result.disposition).toBe("unknown")
    expect(fixture.state.writes).toBe(1)
  }))

  it.live(`${provider}: unchanged source refuses false write acknowledgement`, Effect.gen(function* () {
    const fixture = AuthoringFixture.make(provider)
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.write", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path(provider),
    }), { provider, mode: "update", message: "ci: update", text: AuthoringFixture.original }).pipe(Effect.flip)
    expect(result.kind).toBe("invalid_input")
    expect(fixture.state.writes).toBe(0)
  }))

  it.live(`${provider}: strict execute fields and unsafe/historical refs never write`, Effect.gen(function* () {
    for (const ref of [AuthoringFixture.commit, "refs/heads/dev", "../dev", "fork:branch", "--branch", "\uD800"]) {
      const fixture = AuthoringFixture.make(provider)
      const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.write", {
        ref, path: AuthoringFixture.path(provider),
      }), { provider, mode: "update", message: "ci: update", text: AuthoringFixture.draft }).pipe(Effect.flip)
      expect(result.kind).toBe("invalid_input")
      expect(fixture.requests).toHaveLength(0)
    }
    const fixture = AuthoringFixture.make(provider)
    const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent(provider, "source.write", {
      ref: AuthoringFixture.branch, path: AuthoringFixture.path(provider), runID: "91",
    }), { provider, mode: "update", message: "ci: update", text: AuthoringFixture.draft, token: "must-not-leak" }).pipe(Effect.flip)
    expect(result.kind).toBe("invalid_input")
    expect(JSON.stringify(result)).not.toContain("must-not-leak")
    expect(fixture.requests).toHaveLength(0)
  }))
})

it.live("GitLab external configuration refuses local fallback", Effect.gen(function* () {
  const fixture = AuthoringFixture.make("gitlab", { read: (request) => request.path === "projects/21"
    ? AuthoringFixture.makeJson({ id: 21, name: "Project", path_with_namespace: "owner/project", ci_config_path: "ci.yml@other/project", default_branch: "dev" }) : undefined })
  const result = yield* fixture.service.perform(fixture.binding, AuthoringFixture.intent("gitlab", "source.write", {
    ref: AuthoringFixture.branch, path: ".gitlab-ci.yml",
  }), { provider: "gitlab", mode: "update", message: "ci: update", text: AuthoringFixture.draft }).pipe(Effect.flip)
  expect(result.kind).toBe("source_unresolved")
  expect(fixture.state.writes).toBe(0)
}))
